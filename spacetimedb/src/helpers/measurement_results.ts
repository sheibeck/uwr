// ============================================================================
// MEASUREMENT RESULTS — Results-file model for the Phase 39 executor decision
// ============================================================================
//
// The measurement harness writes one JSON results file. This module defines its
// shape, checks it for completeness, and recomputes the gate input from the raw
// samples so the recorded verdict can always be reproduced (never trusted).
// Pure functions only; the gate math itself lives in ./measurement.

import { percentile, type FailureClass, type GateInput, type GateResult } from './measurement';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
export type SampleClass = 'reliability' | 'drill' | 'exploratory';

export interface CallSample {
  rung: string;
  seq: number;
  attempt: number;
  class: SampleClass;
  ok: boolean;
  failureClass: FailureClass | null;
  status: number | null;
  threw: boolean;
  errorMessage: string | null;
  anthropicErrorType: string | null;
  stopReason: string | null;
  route: string | null;
  effort: 'low' | 'medium' | null;
  cold: boolean;
  /** server: first withTx timestamp minus scheduledAt (null for direct calls) */
  dispatchLateUs: number | null;
  /** server: ctx.timestamp minus scheduledAt (cross-check) */
  ctxLateUs: number | null;
  /** server: second withTx timestamp minus first */
  callUs: number | null;
  /** harness: enqueue call to result-row insert callback */
  clientE2eMs: number | null;
  inFlightAtStart: number | null;
  usage: { input: number; output: number; cacheWrite: number; cacheRead: number } | null;
  estCostMicroUsd: number;
  headerNames: string[] | null;
  requestIdVisible: boolean | null;
  retryAfterVisible: boolean | null;
}

export interface LatencyWindow {
  label: string;
  serverPid: number | null;
  pingMs: { ms: number; inFlight: number }[];
  tick: { lateMs: number; inFlight: number }[];
}

export interface ResultsDoc {
  schemaVersion: 1;
  environment?: {
    spacetime: string;
    sdk: string;
    node: string;
    os: string;
    model: string;
    buildTags: string[];
    serverPid: number | null;
    cliSenderMatchesGate: boolean | null;
    startedAt: string;
  };
  hop?: { mode: 'stub' | 'missing_fields_400'; samplesMs: number[]; warmups: number; notes: string };
  canary?: { hits: number; locationsScanned: number; fetchReachedAnthropic: boolean; statusSeen: number | null };
  ladder?: { publicUrl: CallSample[]; models: CallSample[]; reliability: CallSample[]; diagnostics?: string[] };
  drills?: { timeout: CallSample[]; badKey: CallSample[] };
  dispatch?: { samples: CallSample[]; burst: CallSample[] };
  sender?: { scheduled: Record<string, unknown>; direct: Record<string, unknown> };
  pushLegs?: { echoMs: number[]; noopProcedureE2eMs: number[] };
  structured?: {
    regionCompile: {
      compiles: boolean;
      errorMessage: string | null;
      probes: CallSample[];
      staged: { attempted: boolean; compiles: boolean; errorMessages: string[] };
    };
    cells: CallSample[];
    thinkingOff: CallSample[];
    thinkingOffComposable: boolean | null;
  };
  headers?: { requestIdVisible: boolean; retryAfterVisible: boolean | 'not_observed'; headerNamesSeen: string[] };
  cache?: { pair: CallSample[]; cacheReadObserved: boolean };
  extras?: {
    directCall4954?: { samples: CallSample[]; [k: string]: unknown };
    publishSurvival?: { samples: CallSample[]; [k: string]: unknown };
  };
  load?: {
    baseline?: LatencyWindow;
    baselineEarly?: LatencyWindow;
    levels: { inFlight: number; calls: CallSample[]; window: LatencyWindow; extended: boolean }[];
    baseline2?: LatencyWindow;
    memory: { label: string; pid: number; workingSetMb: number; threads: number; at: string }[];
  };
  serverLogs?: { label: string; lines: string[] }[];
  verdict?: {
    strict: GateResult;
    floorAdjusted: GateResult;
    noiseFloorMs: number;
    computedAt: string;
    confirmation?: { outcome: string; reason: string; at: string };
  };
}

// ---------------------------------------------------------------------------
// Sample collection
// ---------------------------------------------------------------------------

const arr = <T>(v: T[] | undefined | null): T[] => (Array.isArray(v) ? v : []);

/** Every paid or measured call in the document, so spend accounting sees all of them. */
export function collectCallSamples(doc: ResultsDoc): CallSample[] {
  const out: CallSample[] = [];
  out.push(...arr(doc.ladder?.publicUrl), ...arr(doc.ladder?.models), ...arr(doc.ladder?.reliability));
  out.push(...arr(doc.drills?.timeout), ...arr(doc.drills?.badKey));
  out.push(...arr(doc.dispatch?.samples), ...arr(doc.dispatch?.burst));
  out.push(...arr(doc.structured?.cells), ...arr(doc.structured?.thinkingOff));
  out.push(...arr(doc.structured?.regionCompile?.probes));
  out.push(...arr(doc.cache?.pair));
  if (doc.extras) {
    for (const v of Object.values(doc.extras)) {
      if (v && typeof v === 'object') out.push(...arr((v as { samples?: CallSample[] }).samples));
    }
  }
  for (const level of arr(doc.load?.levels)) out.push(...arr(level.calls));
  return out;
}

// ---------------------------------------------------------------------------
// Gate input from raw samples
// ---------------------------------------------------------------------------

/** Minimum in-flight count a latency sample needs to count toward a load level. */
export function minInFlightForLevel(level: number): number {
  return Math.max(2, Math.ceil(level * 0.75));
}

function p95OrNull(xs: number[]): number | null {
  return xs.length === 0 ? null : percentile(xs, 95);
}

function windowStats(
  w: LatencyWindow | undefined,
  keep: (inFlight: number) => boolean,
): { pingP95Ms: number | null; tickLateP95Ms: number | null; pingSamples: number; tickSamples: number } {
  const ping = arr(w?.pingMs).filter((s) => keep(s.inFlight)).map((s) => s.ms);
  const tick = arr(w?.tick).filter((s) => keep(s.inFlight)).map((s) => s.lateMs);
  return {
    pingP95Ms: p95OrNull(ping),
    tickLateP95Ms: p95OrNull(tick),
    pingSamples: ping.length,
    tickSamples: tick.length,
  };
}

/**
 * Recompute the gate input from raw samples.
 * - reliability counts class 'reliability' samples only; spend_cap-blocked ones
 *   are tallied as capBlocked and left out of calls. Drills and exploratory
 *   samples never count. Every attempt counts (re-runs are never dropped).
 * - dispatch p95 is in ms from dispatchLateUs of dispatch.samples.
 * - baseline uses load.baseline samples with inFlight 0.
 * - each load level uses only samples with inFlight >= minInFlightForLevel(level).
 */
export function gateInputFromResults(doc: ResultsDoc, thresholds?: GateInput['thresholds']): GateInput {
  const reliabilitySamples = collectCallSamples(doc).filter((s) => s.class === 'reliability');
  const capBlocked = reliabilitySamples.filter((s) => s.failureClass === 'spend_cap').length;
  const counted = reliabilitySamples.filter((s) => s.failureClass !== 'spend_cap');
  const failed = counted.filter((s) => !s.ok);

  const dispatchMs = arr(doc.dispatch?.samples)
    .map((s) => s.dispatchLateUs)
    .filter((v): v is number => typeof v === 'number')
    .map((us) => us / 1000);

  const baseline = windowStats(doc.load?.baseline, (n) => n === 0);

  const loads = arr(doc.load?.levels).map((l) => {
    const min = minInFlightForLevel(l.inFlight);
    return { inFlight: l.inFlight, ...windowStats(l.window, (n) => n >= min) };
  });

  const input: GateInput = {
    reliability: {
      calls: counted.length,
      failures: failed.length,
      platformFailures: failed.filter((s) => s.failureClass === 'platform').length,
      upstreamFailures: failed.filter((s) => s.failureClass === 'upstream').length,
      capBlocked,
    },
    dispatch: { p95Ms: p95OrNull(dispatchMs), samples: dispatchMs.length },
    regionSchema: {
      compiles: doc.structured?.regionCompile?.compiles === true,
      stagedWorkaroundDocumented: doc.structured?.regionCompile?.staged?.compiles === true,
    },
    baseline,
    loads,
  };
  if (thresholds) input.thresholds = thresholds;
  return input;
}

// ---------------------------------------------------------------------------
// Noise drift (baseline vs the control baseline taken after the load levels)
// ---------------------------------------------------------------------------

/** max |p95(baseline2) - p95(baseline)| over ping and tick, or null when not measurable. */
export function measuredNoiseDriftMs(doc: ResultsDoc): number | null {
  const a = doc.load?.baseline;
  const b = doc.load?.baseline2;
  if (!a || !b) return null;
  const all = () => true;
  const sa = windowStats(a, all);
  const sb = windowStats(b, all);
  const diffs: number[] = [];
  if (sa.pingP95Ms !== null && sb.pingP95Ms !== null) diffs.push(Math.abs(sb.pingP95Ms - sa.pingP95Ms));
  if (sa.tickLateP95Ms !== null && sb.tickLateP95Ms !== null) {
    diffs.push(Math.abs(sb.tickLateP95Ms - sa.tickLateP95Ms));
  }
  return diffs.length === 0 ? null : Math.max(...diffs);
}

/** Noise floor for the side-by-side floor-adjusted verdict: max(25 ms, measured drift). */
export function floorAdjustedNoiseFloorMs(doc: ResultsDoc): number {
  return Math.max(25, measuredNoiseDriftMs(doc) ?? 0);
}

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

const SAMPLE_CLASSES = ['reliability', 'drill', 'exploratory'];
const isObj = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);

/** Cells per (route, effort) required for a structured route in a final file. */
const MIN_RUNS_PER_CELL = 5;

/**
 * Check a results document. Returns a list of problems ([] when valid).
 * - final: false only type-checks the fields that are present (a section may be
 *   missing, or hold only some of its fields) and still requires canary.hits 0.
 * - final: true additionally requires every section with its minimum sample counts.
 */
export function validateResults(doc: unknown, opts: { final: boolean }): string[] {
  const problems: string[] = [];
  const final = opts.final;
  if (!isObj(doc)) return ['results must be an object'];
  if (doc.schemaVersion !== 1) problems.push('schemaVersion must be 1');

  const section = (name: string, v: unknown): Record<string, unknown> | null => {
    if (v === undefined) {
      if (final) problems.push(`${name} missing`);
      return null;
    }
    if (!isObj(v)) {
      problems.push(`${name} must be an object`);
      return null;
    }
    return v;
  };

  const samples = (name: string, v: unknown, min: number) => {
    if (v === undefined) {
      if (final) problems.push(`${name} missing`);
      return;
    }
    if (!Array.isArray(v)) {
      problems.push(`${name} must be an array`);
      return;
    }
    v.forEach((s, i) => {
      if (!isObj(s) || typeof s.ok !== 'boolean' || !SAMPLE_CLASSES.includes(String(s.class))) {
        problems.push(`${name}[${i}] is not a valid call sample`);
      }
    });
    if (final && v.length < min) problems.push(`${name} has ${v.length} samples, needs ${min}`);
  };

  const numbers = (name: string, v: unknown, min: number) => {
    if (v === undefined) {
      if (final) problems.push(`${name} missing`);
      return;
    }
    if (!Array.isArray(v) || v.some((x) => typeof x !== 'number')) {
      problems.push(`${name} must be an array of numbers`);
      return;
    }
    if (final && v.length < min) problems.push(`${name} has ${v.length} samples, needs ${min}`);
  };

  section('environment', doc.environment);

  const hop = section('hop', doc.hop);
  if (hop) numbers('hop.samplesMs', hop.samplesMs, 20);

  const canary = section('canary', doc.canary);
  if (canary) {
    if (canary.hits !== 0) problems.push(`canary.hits must be 0, got ${String(canary.hits)}`);
  }

  const ladder = section('ladder', doc.ladder);
  if (ladder) {
    samples('ladder.publicUrl', ladder.publicUrl, 10);
    samples('ladder.models', ladder.models, 10);
    samples('ladder.reliability', ladder.reliability, 30);
  }

  const drills = section('drills', doc.drills);
  if (drills) {
    samples('drills.timeout', drills.timeout, 2);
    samples('drills.badKey', drills.badKey, 2);
  }

  const dispatch = section('dispatch', doc.dispatch);
  if (dispatch) {
    samples('dispatch.samples', dispatch.samples, 50);
    if (dispatch.burst !== undefined) samples('dispatch.burst', dispatch.burst, 0);
  }

  const sender = section('sender', doc.sender);
  if (sender) {
    section('sender.scheduled', sender.scheduled);
    section('sender.direct', sender.direct);
  }

  const pushLegs = section('pushLegs', doc.pushLegs);
  if (pushLegs) {
    numbers('pushLegs.echoMs', pushLegs.echoMs, 0);
    numbers('pushLegs.noopProcedureE2eMs', pushLegs.noopProcedureE2eMs, 0);
  }

  const structured = section('structured', doc.structured);
  if (structured) {
    const rc = section('structured.regionCompile', structured.regionCompile);
    if (rc && typeof rc.compiles !== 'boolean') problems.push('structured.regionCompile.compiles must be a boolean');
    samples('structured.cells', structured.cells, 0);
    samples('structured.thinkingOff', structured.thinkingOff, 3);
    if (final && Array.isArray(structured.cells)) {
      // Each family (skill, region) needs at least one route, and every route in
      // the family needs 5 runs at each effort. Region routes include staged pairs.
      const cells = structured.cells as CallSample[];
      for (const family of ['skill', 'region']) {
        const routes = [...new Set(cells.filter((c) => c.route?.startsWith(family)).map((c) => c.route as string))];
        if (routes.length === 0) problems.push(`structured.cells has no ${family} route`);
        for (const route of routes) {
          for (const effort of ['low', 'medium']) {
            const n = cells.filter((c) => c.route === route && c.effort === effort).length;
            if (n < MIN_RUNS_PER_CELL) {
              problems.push(`structured.cells ${route}/${effort} has ${n} runs, needs ${MIN_RUNS_PER_CELL}`);
            }
          }
        }
      }
    }
  }

  section('headers', doc.headers);

  const cache = section('cache', doc.cache);
  if (cache) samples('cache.pair', cache.pair, 2);

  const extras = section('extras', doc.extras);
  if (extras) {
    section('extras.directCall4954', extras.directCall4954);
    section('extras.publishSurvival', extras.publishSurvival);
  }

  const load = section('load', doc.load);
  if (load) {
    section('load.baseline', load.baseline);
    section('load.baseline2', load.baseline2);
    if (load.levels === undefined) {
      if (final) problems.push('load.levels missing');
    } else if (!Array.isArray(load.levels)) {
      problems.push('load.levels must be an array');
    } else if (final && !load.levels.some((l) => isObj(l) && l.inFlight === 8)) {
      problems.push('load.levels needs a level with inFlight 8');
    }
  }

  if (doc.serverLogs === undefined) {
    if (final) problems.push('serverLogs missing');
  } else if (!Array.isArray(doc.serverLogs) || (final && doc.serverLogs.length === 0)) {
    problems.push('serverLogs must be a non-empty array');
  }

  const verdict = section('verdict', doc.verdict);
  if (verdict) {
    if (!isObj(verdict.strict)) problems.push('verdict.strict missing');
    if (!isObj(verdict.floorAdjusted)) problems.push('verdict.floorAdjusted missing');
  }

  return problems;
}
