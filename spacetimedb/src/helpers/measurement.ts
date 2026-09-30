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
export interface GateThresholds {
  dispatchP95Ms: number;
  ratio: number;
  noiseFloorMs: number;
  goMinInFlight: number;
  minReliabilityCalls: number;
  minDispatchSamples: number;
  minPingSamples: number;
  minTickSamples: number;
}

export const GATE_DEFAULTS: Readonly<GateThresholds> = {
  dispatchP95Ms: 250,
  ratio: 2,
  noiseFloorMs: 0,
  goMinInFlight: 6,
  minReliabilityCalls: 30,
  minDispatchSamples: 50,
  minPingSamples: 200,
  minTickSamples: 30,
};

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
  /**
   * Informational: min(level, observed server-side concurrency cap) that the tick
   * window was filtered against. The gate math does not read it.
   */
  effectiveInFlight?: number;
}

export interface GateInput {
  reliability: {
    /** Calls that count toward the minimum-reliability-calls requirement (paid ladder rung 3 only). */
    calls: number;
    /** Every non-drill paid call that had to succeed; shown in the check when present (defaults to calls). */
    totalCalls?: number;
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
  thresholds?: Partial<GateThresholds>;
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
  thresholds: GateThresholds;
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
 * Merge overrides over the defaults. An explicit undefined keeps the default; any
 * other non-finite value (NaN, Infinity, a non-number) throws, because a comparison
 * against it is always false and would silently disable a completeness or hard check.
 */
function resolveThresholds(overrides: Partial<GateThresholds> | undefined): GateThresholds {
  const t: GateThresholds = { ...GATE_DEFAULTS };
  for (const key of Object.keys(GATE_DEFAULTS) as (keyof GateThresholds)[]) {
    const v: unknown = overrides?.[key];
    if (v === undefined) continue;
    if (typeof v !== 'number' || !Number.isFinite(v)) {
      throw new RangeError(`evaluateGate: threshold ${key} must be a finite number, got ${String(v)}`);
    }
    t[key] = v;
  }
  return t;
}

/**
 * Evaluate the executor gate. A verdict is only issued on a complete data set:
 * thin data returns 'incomplete' (never 'go'). Order: completeness, hard
 * failures (reliability, dispatch, region schema), then the concurrency
 * step-down (highest tested level passes -> go; otherwise cap at the highest
 * passing level, minimum 2; nothing passing with a level of <= 2 tested -> no_go).
 */
export function evaluateGate(input: GateInput): GateResult {
  const t = resolveThresholds(input.thresholds);
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
    measured: `${reliability.failures}/${reliability.totalCalls ?? reliability.calls} failed`,
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

// ---------------------------------------------------------------------------
// Failure classification
// ---------------------------------------------------------------------------

/**
 * Classify one call outcome. Returns null for a success.
 * - platform: fetch threw, result row missing, or no response at all
 * - upstream: HTTP 429 or any 5xx (including 529 overloaded)
 * - auth: 401 / 403
 * - request: other 4xx (400, 404, 413, ...)
 * - content: HTTP 200 but the body failed the content checks
 * - spend_cap: blocked locally before any request was made
 */
export function classifyFailure(o: {
  threw: boolean;
  status: number | null;
  rowMissing?: boolean;
  contentOk?: boolean;
  capBlocked?: boolean;
}): FailureClass | null {
  if (o.capBlocked) return 'spend_cap';
  if (o.rowMissing) return 'platform';
  if (o.threw) return 'platform';
  const s = o.status;
  if (s === null) return 'platform';
  if (s === 200) return o.contentOk === false ? 'content' : null;
  if (s === 429 || s >= 500) return 'upstream';
  if (s === 401 || s === 403) return 'auth';
  if (s >= 400) return 'request';
  return 'platform';
}

// ---------------------------------------------------------------------------
// Spend-cap cost math (micro-USD)
// ---------------------------------------------------------------------------

/** Sonnet 5.5 list prices: $ per MTok equals micro-USD per token. */
export const CLAUDE_PRICE_MICRO_USD_PER_TOKEN = {
  input: 2,
  output: 10,
  cacheWrite: 2.5,
  cacheRead: 0.2,
} as const;

export interface Usage {
  input: number;
  output: number;
  cacheWrite: number;
  cacheRead: number;
}

/** Cost of a completed call from its four usage counts, rounded up. */
export function estimateCostMicroUsd(u: Usage): number {
  const p = CLAUDE_PRICE_MICRO_USD_PER_TOKEN;
  return Math.ceil(
    u.input * p.input + u.output * p.output + u.cacheWrite * p.cacheWrite + u.cacheRead * p.cacheRead,
  );
}

/**
 * Conservative up-front reservation: 3 request characters per input token,
 * charged at the cache-write price, plus the full max_tokens at the output price.
 */
export function reserveCostMicroUsd(maxTokens: number, requestChars: number): number {
  const p = CLAUDE_PRICE_MICRO_USD_PER_TOKEN;
  const inputTokens = Math.ceil(requestChars / 3);
  return Math.ceil(inputTokens * p.cacheWrite + maxTokens * p.output);
}

/**
 * Replace a reservation with the real cost. A thrown fetch keeps the
 * reservation (billing unknown, never under-count); otherwise actual usage
 * when present; otherwise 0 (an error response without usage is not billed).
 */
export function settleCostMicroUsd(o: {
  threw: boolean;
  status: number | null;
  usage: Usage | null;
  reservedMicroUsd: number;
}): number {
  if (o.threw) return o.reservedMicroUsd;
  if (o.usage) return estimateCostMicroUsd(o.usage);
  return 0;
}

// ---------------------------------------------------------------------------
// Secret guards
// ---------------------------------------------------------------------------

// Built from fragments at runtime so this source never holds a key-shaped literal.
const KEY_PREFIX = ['sk', '-ant-'].join('');
const KEY_TAIL = ['[A-Za-z0-9', '_', '-]{20,}'].join('');
const MIN_NEEDLE_LENGTH = 8;

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function usableNeedles(needles: readonly string[] | undefined): string[] {
  return (needles ?? []).filter((n) => n.length >= MIN_NEEDLE_LENGTH);
}

/**
 * Replace every key-shaped string and every supplied needle (8+ chars) with
 * [REDACTED]. Safe to call repeatedly; holds no regex state between calls.
 */
export function redactSecrets(text: string, needles?: readonly string[]): string {
  let out = text.replace(new RegExp(escapeRegExp(KEY_PREFIX) + KEY_TAIL, 'g'), '[REDACTED]');
  for (const n of usableNeedles(needles)) {
    out = out.replace(new RegExp(escapeRegExp(n), 'g'), '[REDACTED]');
  }
  return out;
}

/**
 * Count secret occurrences. patternHits counts key-shaped strings, or every
 * bare key prefix when strictPrefix is true. needleHits counts occurrences of
 * each needle of 8+ characters.
 */
export function findSecretLeaks(
  text: string,
  opts: { needles?: readonly string[]; strictPrefix?: boolean } = {},
): { patternHits: number; needleHits: number; total: number } {
  const pattern = opts.strictPrefix
    ? new RegExp(escapeRegExp(KEY_PREFIX), 'g')
    : new RegExp(escapeRegExp(KEY_PREFIX) + KEY_TAIL, 'g');
  const patternHits = (text.match(pattern) ?? []).length;
  let needleHits = 0;
  for (const n of usableNeedles(opts.needles)) {
    needleHits += (text.match(new RegExp(escapeRegExp(n), 'g')) ?? []).length;
  }
  return { patternHits, needleHits, total: patternHits + needleHits };
}
