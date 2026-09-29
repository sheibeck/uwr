// ============================================================================
// MEASUREMENT — Percentile math and go/no-go gate for the Phase 39 decision
// ============================================================================
//
// Pure helpers behind the executor decision (scheduled procedure vs backend
// service). Everything here is deterministic and side-effect free: no imports,
// no database or context access, and only erasable TypeScript syntax (no enum,
// namespace or constructor parameter properties) so plain Node scripts can
// import this file directly through built-in type stripping.

// ---------------------------------------------------------------------------
// Gate thresholds (locked in the phase context; all comparisons are strict)
// ---------------------------------------------------------------------------
export const GATE_DEFAULTS = {
  dispatchP95Ms: 250,
  ratio: 2,
  noiseFloorMs: 0,
  goMinInFlight: 6,
  minReliabilityCalls: 30,
  minDispatchSamples: 50,
  minPingSamples: 200,
  minTickSamples: 30,
} as const;

export type Verdict = 'go' | 'go_with_cap' | 'no_go' | 'incomplete';
export type FailureClass = 'platform' | 'upstream' | 'auth' | 'request' | 'content' | 'spend_cap';

export interface Summary {
  n: number;
  min: number;
  p50: number;
  p95: number;
  p99: number;
  max: number;
  mean: number;
}

export interface LevelStats {
  inFlight: number;
  pingP95Ms: number | null;
  tickLateP95Ms: number | null;
  pingSamples: number;
  tickSamples: number;
}

export interface GateInput {
  reliability: {
    calls: number;
    failures: number;
    platformFailures: number;
    upstreamFailures: number;
    capBlocked?: number;
  };
  dispatch: { p95Ms: number | null; samples: number };
  regionSchema: { compiles: boolean; stagedWorkaroundDocumented: boolean };
  baseline: {
    pingP95Ms: number | null;
    tickLateP95Ms: number | null;
    pingSamples: number;
    tickSamples: number;
  };
  loads: LevelStats[];
  thresholds?: Partial<typeof GATE_DEFAULTS>;
}

export interface GateCheck {
  name: string;
  pass: boolean;
  measured: number | string | null;
  threshold: number | string;
}

export interface GateResult {
  verdict: Verdict;
  cap: number | null;
  checks: GateCheck[];
  flags: string[];
  thresholds: typeof GATE_DEFAULTS;
}

// ---------------------------------------------------------------------------
// Percentile / summary (nearest-rank)
// ---------------------------------------------------------------------------

/**
 * Nearest-rank percentile. Rank = ceil(p/100 * n), 1-based; p=0 returns the
 * minimum. Throws RangeError on an empty array, a non-finite sample, or p
 * outside 0..100. Never mutates the input.
 */
export function percentile(samples: readonly number[], p: number): number {
  if (samples.length === 0) throw new RangeError('percentile: empty sample set');
  if (!Number.isFinite(p) || p < 0 || p > 100) {
    throw new RangeError(`percentile: p must be within 0..100, got ${p}`);
  }
  for (const s of samples) {
    if (!Number.isFinite(s)) throw new RangeError('percentile: samples must be finite numbers');
  }
  const sorted = [...samples].sort((a, b) => a - b);
  // (p * n) / 100 keeps exact arithmetic for the integer cases (95 * 50 / 100 = 47.5)
  const rank = Math.ceil((p * sorted.length) / 100);
  return sorted[Math.max(0, rank - 1)];
}

/** Descriptive statistics for a sample set, or null when it is empty. */
export function summarize(samples: readonly number[]): Summary | null {
  if (samples.length === 0) return null;
  let sum = 0;
  for (const s of samples) sum += s;
  return {
    n: samples.length,
    min: percentile(samples, 0),
    p50: percentile(samples, 50),
    p95: percentile(samples, 95),
    p99: percentile(samples, 99),
    max: percentile(samples, 100),
    mean: sum / samples.length,
  };
}

// ---------------------------------------------------------------------------
// Ratio check (load vs baseline)
// ---------------------------------------------------------------------------

/**
 * Strict load-vs-baseline check. limit = max(ratio * base, base + noiseFloorMs);
 * passes only when load is strictly below the limit (or both are exactly 0).
 * Null inputs fail with a null limit.
 */
export function ratioCheck(
  baseP95: number | null,
  loadP95: number | null,
  ratio: number,
  noiseFloorMs: number,
): { pass: boolean; limit: number | null } {
  if (baseP95 === null || loadP95 === null) return { pass: false, limit: null };
  const limit = Math.max(ratio * baseP95, baseP95 + noiseFloorMs);
  const pass = loadP95 < limit || (limit === 0 && loadP95 === 0);
  return { pass, limit };
}

// ---------------------------------------------------------------------------
// Gate evaluation
// ---------------------------------------------------------------------------

/**
 * Evaluate the executor gate. A verdict is only issued on a complete data set:
 * thin data returns 'incomplete' (never 'go'). Order: completeness, hard
 * failures (reliability, dispatch, region schema), then the concurrency
 * step-down (highest tested level passes -> go; otherwise cap at the highest
 * passing level, minimum 2; nothing passing with a level of <= 2 tested -> no_go).
 */
export function evaluateGate(input: GateInput): GateResult {
  const t = { ...GATE_DEFAULTS, ...(input.thresholds ?? {}) } as typeof GATE_DEFAULTS;
  const checks: GateCheck[] = [];
  const flags: string[] = [];

  const { reliability, dispatch, regionSchema, baseline } = input;
  const loads = [...input.loads].sort((a, b) => b.inFlight - a.inFlight);

  // --- completeness ---------------------------------------------------------
  const missing: string[] = [];
  if (reliability.calls < t.minReliabilityCalls) {
    missing.push(`reliability ${reliability.calls}/${t.minReliabilityCalls}`);
  }
  if (dispatch.samples < t.minDispatchSamples) {
    missing.push(`dispatch ${dispatch.samples}/${t.minDispatchSamples}`);
  }
  if (baseline.pingSamples < t.minPingSamples) {
    missing.push(`baseline ping ${baseline.pingSamples}/${t.minPingSamples}`);
  }
  if (baseline.tickSamples < t.minTickSamples) {
    missing.push(`baseline tick ${baseline.tickSamples}/${t.minTickSamples}`);
  }
  for (const l of loads) {
    if (l.pingSamples < t.minPingSamples) {
      missing.push(`ping@${l.inFlight} ${l.pingSamples}/${t.minPingSamples}`);
    }
    if (l.tickSamples < t.minTickSamples) {
      missing.push(`tick@${l.inFlight} ${l.tickSamples}/${t.minTickSamples}`);
    }
  }
  if (!loads.some((l) => l.inFlight >= t.goMinInFlight)) {
    missing.push(`no level >= ${t.goMinInFlight} in flight`);
  }
  checks.push({
    name: 'samples',
    pass: missing.length === 0,
    measured: missing.length === 0 ? 'complete' : missing.join('; '),
    threshold: 'all minimum sample counts',
  });

  // --- hard checks ----------------------------------------------------------
  const reliabilityPass = reliability.failures === 0;
  checks.push({
    name: 'reliability',
    pass: reliabilityPass,
    measured: `${reliability.failures}/${reliability.calls} failed`,
    threshold: '0 failures',
  });

  const dispatchPass = dispatch.p95Ms !== null && dispatch.p95Ms < t.dispatchP95Ms;
  checks.push({
    name: 'dispatch_p95',
    pass: dispatchPass,
    measured: dispatch.p95Ms,
    threshold: t.dispatchP95Ms,
  });

  const regionPass = regionSchema.compiles || regionSchema.stagedWorkaroundDocumented;
  checks.push({
    name: 'region_schema',
    pass: regionPass,
    measured: regionSchema.compiles
      ? 'compiles'
      : regionSchema.stagedWorkaroundDocumented
        ? 'staged_workaround'
        : 'fails',
    threshold: 'compiles or staged workaround',
  });

  // --- per-level ratio checks ----------------------------------------------
  const levelPass = new Map<number, boolean>();
  for (const l of loads) {
    const ping = ratioCheck(baseline.pingP95Ms, l.pingP95Ms, t.ratio, t.noiseFloorMs);
    const tick = ratioCheck(baseline.tickLateP95Ms, l.tickLateP95Ms, t.ratio, t.noiseFloorMs);
    checks.push({
      name: `ping_p95@${l.inFlight}`,
      pass: ping.pass,
      measured: l.pingP95Ms,
      threshold: ping.limit ?? 'n/a',
    });
    checks.push({
      name: `tick_p95@${l.inFlight}`,
      pass: tick.pass,
      measured: l.tickLateP95Ms,
      threshold: tick.limit ?? 'n/a',
    });
    levelPass.set(l.inFlight, ping.pass && tick.pass);
  }

  // --- flags ----------------------------------------------------------------
  if (
    reliability.failures > 0 &&
    reliability.platformFailures === 0 &&
    reliability.upstreamFailures > 0
  ) {
    flags.push('upstream_only_failures');
  }
  if (reliability.platformFailures > 0) flags.push('platform_failures');
  if ((reliability.capBlocked ?? 0) > 0) flags.push('spend_cap_blocked');
  if (t.noiseFloorMs > 0) flags.push('noise_floor_applied');

  const result = (verdict: Verdict, cap: number | null): GateResult => ({
    verdict,
    cap,
    checks,
    flags,
    thresholds: t,
  });

  // --- verdict --------------------------------------------------------------
  if (missing.length > 0) return result('incomplete', null);
  if (!reliabilityPass || !dispatchPass || !regionPass) return result('no_go', null);

  const highest = loads[0];
  if (levelPass.get(highest.inFlight)) return result('go', null);

  const passing = loads.filter((l) => levelPass.get(l.inFlight));
  if (passing.length > 0) {
    return result('go_with_cap', Math.max(2, passing[0].inFlight));
  }
  if (loads.some((l) => l.inFlight <= 2)) return result('no_go', null);
  return result('incomplete', null);
}
