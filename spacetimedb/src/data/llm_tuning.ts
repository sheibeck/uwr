// ============================================================================
// Measured route tuning (pure module)
// ============================================================================
//
// Every route's effort, max_tokens and timeout in LLM_ROUTES is read from
// LLM_TUNING below. A tuned value is written only when it traces to a recorded
// measurement in spacetimedb/src/data/llm_measurements.json; a route with no
// measurement, or too few samples, keeps its baseline and says so
// ('insufficient_data'). llm_tuning.test.ts proves the trace: for a record with
// status 'applied' every LLM_TUNING entry equals deriveRouteTuning over the
// recorded data; for any other status every entry equals the no-data derivation.
//
// Record lifecycle (the `status` field of llm_measurements.json):
//   not_run   -> committed by Plan 43-10, no call made
//   measured  -> Plan 43-12, after the user-approved Run A (sweep) and Run B (confirmation)
//   applied   -> Plan 43-14, after LLM_TUNING is rewritten from the record
//   declined / deferred -> Plan 43-12 when the user does not approve the paid run
//
// Derivation rules (all pure, all deterministic):
//   - effort: the cell (low, medium) with more passing samples; equal counts pick
//     low and flag a tie. A passing sample is ok, stop reason end_turn, valid
//     structure and no tone-lint failure.
//   - p99: nearest rank over numerically sorted successful output-token samples.
//     Both cells are pooled only when each has at least LLM_TUNING_MIN_SAMPLES
//     successful samples and their means differ by at most 15 percent of the
//     larger mean; otherwise the chosen cell alone is used.
//   - max_tokens: p99 x 1.25, rounded up to a multiple of 256, floor 256. A route
//     that never auto-retries (LLM_NO_AUTO_RETRY_ROUTES) also gets at least
//     LLM_NO_RETRY_HEADROOM_TOKENS above its p99 (deriveRouteTuning only; the
//     record's own maxTokens field stays the route-agnostic sample figure).
//   - fewer than LLM_TUNING_MIN_SAMPLES successful samples in the chosen cell, a
//     Run A sample in either cell that stopped at max_tokens (its true size is
//     unknown, and it is the tail the p99 must cover), or a recorded Run B call
//     that stopped at max_tokens, keeps the baseline.
//   - timeouts stay at baseline; the record keeps a suggested timeout for
//     information only.
//
// Imports are type-only from llm_routes (llm_routes reads LLM_TUNING, so a value
// import would be circular), the dependency-free percentile helper, and the
// no-retry route list from llm_limits (which imports llm_routes as a type only).
// ============================================================================

import type { LlmRoute, LlmEffort } from './llm_routes';
import { percentile } from '../helpers/measurement';
import { LLM_NO_AUTO_RETRY_ROUTES } from './llm_limits';

// -- Constants ---------------------------------------------------------------

/** Where the tuned values come from. */
export const LLM_TUNING_SOURCE = 'spacetimedb/src/data/llm_measurements.json';

/** Fewer successful samples than this in the chosen cell means "insufficient data". */
export const LLM_TUNING_MIN_SAMPLES = 5;

/** Both effort cells are pooled for p99 when their mean output sizes differ by at most this share of the larger mean. */
export const LLM_POOL_MEAN_TOLERANCE = 0.15;

/**
 * The least headroom, in output tokens above the measured p99, that a route which never auto-retries
 * gets (review WR-A04). On those routes a reply cut off at max_tokens is billed, never retried, and fails
 * its stage; with 5 to 10 samples the nearest-rank p99 is just the sample maximum, so x1.25 alone left as
 * little as 88 tokens (combat_narration) to 206 (world_gen_start). 512 tokens is about one more location
 * and enemy block of the region fill schema, which the static sweep fixtures may not reach.
 */
export const LLM_NO_RETRY_HEADROOM_TOKENS = 512;

/** Dispatch allowance added to each class-reveal API latency (enqueue to apply, beyond the API call), in ms. */
export const LLM_DISPATCH_ALLOWANCE_MS = 300;

/** Parallel archetype generation is built only when the class-reveal p50 is over this, in ms (LAT-06). */
export const LLM_CLASS_REVEAL_THRESHOLD_MS = 10_000;

/** The nine routes the sweep measures, in the fixed order the record lists them (smoke_test is not swept). */
export const LLM_SWEEP_ROUTES = Object.freeze([
  'creation_race',
  'creation_class_reveal',
  'creation_class',
  'world_gen_start',
  'world_gen',
  'skill_gen',
  'renown_perk_gen',
  'npc_conversation',
  'combat_narration',
] as const satisfies readonly LlmRoute[]);

/** The efforts the sweep compares, in the fixed order the record lists them. */
export const LLM_SWEEP_EFFORTS = Object.freeze(['low', 'medium'] as const satisfies readonly LlmEffort[]);
export type SweepEffort = (typeof LLM_SWEEP_EFFORTS)[number];

// -- Types -------------------------------------------------------------------

export type TuningStatus = 'tuned' | 'insufficient_data' | 'not_swept';

export interface RouteBaseline {
  effort: LlmEffort;
  maxTokens: number;
  timeoutMs: number;
}

export interface TunedRoute {
  effort: LlmEffort;
  maxTokens: number;
  timeoutMs: number;
  status: TuningStatus;
  source: string;
  p99OutputTokens: number | null;
  samples: number;
  tie: boolean;
}

/** One sweep call. Counts, sizes, timings and rule ids only: no prompt, reply or key field exists. */
export interface SweepSample {
  ok: boolean;
  stopReason: string | null;
  latencyMs: number;
  inputTokens: number;
  outputTokens: number;
  cacheWriteTokens: number;
  cacheReadTokens: number;
  schemaOk: boolean;
  toneFailures: string[];
}

export interface SweepCell {
  samples: SweepSample[];
}

/** One Run B confirmation call (or one call of a caching pair). */
export interface RunBCall {
  ok: boolean;
  stopReason: string | null;
  latencyMs: number;
  inputTokens: number;
  outputTokens: number;
  cacheWriteTokens: number;
  cacheReadTokens: number;
}

export interface SweepRouteRecord {
  efforts: { low: SweepCell; medium: SweepCell };
  chosenEffort: SweepEffort | null;
  tie: boolean;
  p99OutputTokens: number | null;
  maxTokens: number | null;
  suggestedTimeoutMs: number | null;
  insufficientData: boolean;
  runB: RunBCall[];
}

export interface RecordFields {
  chosenEffort: SweepEffort | null;
  tie: boolean;
  p99OutputTokens: number | null;
  maxTokens: number | null;
  suggestedTimeoutMs: number | null;
  insufficientData: boolean;
}

export type Lat06Verdict = 'not_measured' | 'leave_out' | 'build';

// -- Baselines ---------------------------------------------------------------

const baseline = (maxTokens: number, timeoutMs: number): RouteBaseline =>
  Object.freeze({ effort: 'low' as LlmEffort, maxTokens, timeoutMs });

/** The Phase 40 and 43-04 values, kept for a route whose measurement is missing or too thin. */
export const LLM_ROUTE_BASELINES: Readonly<Record<LlmRoute, RouteBaseline>> = Object.freeze({
  creation_race: baseline(4096, 90_000),
  creation_class_reveal: baseline(2048, 60_000),
  creation_class: baseline(4096, 90_000),
  world_gen_start: baseline(4096, 90_000),
  world_gen: baseline(8192, 150_000),
  skill_gen: baseline(4096, 60_000),
  npc_conversation: baseline(1024, 30_000),
  combat_narration: baseline(1024, 20_000),
  renown_perk_gen: baseline(2048, 60_000),
  region_economy: baseline(4096, 90_000),
  smoke_test: baseline(256, 30_000),
});

// -- Pure rules --------------------------------------------------------------

/** p99 x 1.25, rounded up to a multiple of 256, floor 256. Throws on an empty set. Never reorders the input. */
export function tunedMaxTokens(outputTokens: readonly number[]): number {
  const p99 = percentile(outputTokens, 99); // nearest rank over a numerically sorted copy
  return Math.max(256, Math.ceil((p99 * 1.25) / 256) * 256);
}

/**
 * max_tokens for a route that never auto-retries: the tuned x1.25 figure, but never less than
 * p99 + LLM_NO_RETRY_HEADROOM_TOKENS rounded up to a multiple of 256. Throws on an empty set.
 */
export function noRetryMaxTokens(outputTokens: readonly number[]): number {
  const p99 = percentile(outputTokens, 99);
  return Math.max(tunedMaxTokens(outputTokens), Math.ceil((p99 + LLM_NO_RETRY_HEADROOM_TOKENS) / 256) * 256);
}

/** A sample passes when it was ok, ended on end_turn, had valid structure and no tone-lint failure. */
export function samplePasses(s: SweepSample): boolean {
  return s.ok === true && s.stopReason === 'end_turn' && s.schemaOk === true && s.toneFailures.length === 0;
}

const passCount = (cell: SweepCell): number => cell.samples.filter(samplePasses).length;

/** The cell with more passing samples; equal counts pick low and flag the tie. */
export function chooseEffort(efforts: { low: SweepCell; medium: SweepCell }): {
  effort: SweepEffort;
  tie: boolean;
  passes: { low: number; medium: number };
} {
  const passes = { low: passCount(efforts.low), medium: passCount(efforts.medium) };
  if (passes.medium > passes.low) return { effort: 'medium', tie: false, passes };
  if (passes.low > passes.medium) return { effort: 'low', tie: false, passes };
  return { effort: 'low', tie: true, passes };
}

const successfulOutputs = (cell: SweepCell): number[] => cell.samples.filter((s) => s.ok === true).map((s) => s.outputTokens);

const mean = (xs: readonly number[]): number => xs.reduce((a, b) => a + b, 0) / xs.length;

/**
 * The output-token samples the p99 is taken over: both cells pooled (low then
 * medium) when each has at least LLM_TUNING_MIN_SAMPLES successful samples and
 * the means are within LLM_POOL_MEAN_TOLERANCE of the larger mean; else the
 * chosen cell only.
 */
export function p99Samples(efforts: { low: SweepCell; medium: SweepCell }, chosen: SweepEffort): number[] {
  const low = successfulOutputs(efforts.low);
  const medium = successfulOutputs(efforts.medium);
  if (low.length >= LLM_TUNING_MIN_SAMPLES && medium.length >= LLM_TUNING_MIN_SAMPLES) {
    const a = mean(low);
    const b = mean(medium);
    // 1e-9 absorbs floating-point error at exactly the tolerance
    if (Math.abs(a - b) <= LLM_POOL_MEAN_TOLERANCE * Math.max(a, b) + 1e-9) return [...low, ...medium];
  }
  return chosen === 'low' ? low : medium;
}

/** max(30 s, 4 x nearest-rank p99 latency) rounded up to 5 s, capped at 180 s. Information only. */
export function suggestedTimeoutMs(latenciesMs: readonly number[]): number {
  const p99 = percentile(latenciesMs, 99);
  const rounded = Math.ceil((4 * p99) / 5000) * 5000;
  return Math.min(180_000, Math.max(30_000, rounded));
}

const hasSamples = (r: SweepRouteRecord): boolean => r.efforts.low.samples.length + r.efforts.medium.samples.length > 0;

/** True when any sample in either Run A cell stopped at max_tokens (review WR-A03). */
const truncatedInRunA = (efforts: { low: SweepCell; medium: SweepCell }): boolean =>
  [efforts.low, efforts.medium].some((c) => c.samples.some((s) => s.stopReason === 'max_tokens'));

/**
 * Every derived field of a route's record, from its raw samples and Run B calls only.
 * No samples, too few in the chosen cell, a Run A sample in either cell that stopped at max_tokens, or a
 * Run B call that stopped at max_tokens is insufficient data. A truncated Run A sample is not ok, so it
 * would otherwise drop out of the p99 while being exactly the long output the p99 has to cover.
 */
export function deriveRecordFields(rec: SweepRouteRecord): RecordFields {
  if (!hasSamples(rec)) {
    return { chosenEffort: null, tie: false, p99OutputTokens: null, maxTokens: null, suggestedTimeoutMs: null, insufficientData: true };
  }
  const { effort, tie } = chooseEffort(rec.efforts);
  const chosenOutputs = successfulOutputs(rec.efforts[effort]);
  const truncatedInRunB = (rec.runB ?? []).some((c) => c.stopReason === 'max_tokens');
  if (chosenOutputs.length < LLM_TUNING_MIN_SAMPLES || truncatedInRunB || truncatedInRunA(rec.efforts)) {
    return { chosenEffort: effort, tie, p99OutputTokens: null, maxTokens: null, suggestedTimeoutMs: null, insufficientData: true };
  }
  const pooled = p99Samples(rec.efforts, effort);
  const latencies = rec.efforts[effort].samples.filter((s) => s.ok === true).map((s) => s.latencyMs);
  return {
    chosenEffort: effort,
    tie,
    p99OutputTokens: percentile(pooled, 99),
    maxTokens: tunedMaxTokens(pooled),
    suggestedTimeoutMs: suggestedTimeoutMs(latencies),
    insufficientData: false,
  };
}

/**
 * The tuning for one route. smoke_test is never swept; a missing or thin record
 * keeps the baseline; otherwise the chosen effort and the derived max_tokens,
 * with the baseline timeout. A route in LLM_NO_AUTO_RETRY_ROUTES gets the
 * no-retry headroom floor on top (noRetryMaxTokens); the floor alone never lifts
 * max_tokens above the route's baseline, and never lowers the x1.25 figure.
 */
export function deriveRouteTuning(route: LlmRoute, rec: SweepRouteRecord | undefined, base: RouteBaseline): TunedRoute {
  const keep = (status: TuningStatus): TunedRoute => ({
    effort: base.effort,
    maxTokens: base.maxTokens,
    timeoutMs: base.timeoutMs,
    status,
    source: LLM_TUNING_SOURCE,
    p99OutputTokens: null,
    samples: 0,
    tie: false,
  });
  if (route === 'smoke_test') return keep('not_swept');
  if (rec === undefined) return keep('insufficient_data');
  const f = deriveRecordFields(rec);
  if (f.insufficientData || f.chosenEffort === null || f.maxTokens === null) return keep('insufficient_data');
  const noRetry = (LLM_NO_AUTO_RETRY_ROUTES as readonly string[]).includes(route);
  const maxTokens = noRetry
    ? Math.max(f.maxTokens, Math.min(base.maxTokens, noRetryMaxTokens(p99Samples(rec.efforts, f.chosenEffort))))
    : f.maxTokens;
  return {
    effort: f.chosenEffort,
    maxTokens,
    timeoutMs: base.timeoutMs,
    status: 'tuned',
    source: LLM_TUNING_SOURCE,
    p99OutputTokens: f.p99OutputTokens,
    samples: p99Samples(rec.efforts, f.chosenEffort).length,
    tie: f.tie,
  };
}

/**
 * LAT-06: build parallel archetype generation only when the class-reveal p50 is
 * over LLM_CLASS_REVEAL_THRESHOLD_MS. Each recorded API latency gets the dispatch
 * allowance first. A pure function of the recorded latencies.
 */
export function lat06Decision(latenciesMs: readonly number[]): {
  p50Ms: number | null;
  p95Ms: number | null;
  verdict: Lat06Verdict;
} {
  if (latenciesMs.length === 0) return { p50Ms: null, p95Ms: null, verdict: 'not_measured' };
  const adjusted = latenciesMs.map((ms) => ms + LLM_DISPATCH_ALLOWANCE_MS);
  const p50Ms = percentile(adjusted, 50);
  const p95Ms = percentile(adjusted, 95);
  return { p50Ms, p95Ms, verdict: p50Ms > LLM_CLASS_REVEAL_THRESHOLD_MS ? 'build' : 'leave_out' };
}

// -- The tuning table the route table reads ----------------------------------
//
// Plan 43-14 wrote these literals from deriveRouteTuning over the committed record
// (status 'applied'); llm_tuning.test.ts asserts every entry equals that derivation.
// Review WR-A04 re-derived them with the no-retry headroom floor (the record is unchanged):
// the six swept no-retry routes moved from 512/512/768/1024/2560/256 to 1024/1024/1024/1536/2560/768.
// A route the derivation cannot tune keeps its baseline as 'insufficient_data'
// (smoke_test is 'not_swept').

const entry = (
  effort: LlmEffort,
  maxTokens: number,
  timeoutMs: number,
  status: TuningStatus,
  p99OutputTokens: number | null = null,
  samples = 0,
  tie = false,
): TunedRoute =>
  Object.freeze({
    effort,
    maxTokens,
    timeoutMs,
    status,
    source: LLM_TUNING_SOURCE,
    p99OutputTokens,
    samples,
    tie,
  });

export const LLM_TUNING: Readonly<Record<LlmRoute, TunedRoute>> = Object.freeze({
  creation_race: entry('low', 1024, 90_000, 'tuned', 265, 10, true),
  creation_class_reveal: entry('low', 1024, 60_000, 'tuned', 327, 10, true),
  creation_class: entry('low', 1024, 90_000, 'tuned', 465, 10, true),
  world_gen_start: entry('low', 1536, 90_000, 'tuned', 818, 10, true),
  world_gen: entry('low', 2560, 150_000, 'tuned', 1988, 10, true),
  skill_gen: entry('low', 1024, 60_000, 'tuned', 624, 10, true),
  npc_conversation: entry('low', 512, 30_000, 'tuned', 379, 10, true),
  combat_narration: entry('low', 768, 20_000, 'tuned', 168, 5, true),
  renown_perk_gen: entry('low', 1024, 60_000, 'tuned', 756, 10, false),
  region_economy: entry('low', 4096, 90_000, 'insufficient_data'),
  smoke_test: entry('low', 256, 30_000, 'not_swept'),
});
