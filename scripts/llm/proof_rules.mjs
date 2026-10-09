// Pure rules for the local live-proof harness (Plan 41-15, OPS-01; staged for Phase 43 in Plan 44-05, QUAL-02).
// No I/O, no SDK, no secrets. The harness (prove-live.live.ts) imports these; tests live in proof_rules.test.mjs.
//
// The smoke expectation is read from the server (LLM_SMOKE_ROUTES) and the database name goes through
// resolveLiveDb in cli.mjs; neither is copied here.

import { resolveLiveDb } from './cli.mjs';
import { SWEEP_FIXTURES } from './sweep_fixtures.mjs';
import { LLM_SMOKE_ROUTES } from '../../spacetimedb/src/data/llm_limits.ts';
import { buildRouteLayers } from '../../spacetimedb/src/data/llm_layers.ts';
import { LLM_ROUTES } from '../../spacetimedb/src/data/llm_routes.ts';
import { buildClaudeRequest } from '../../spacetimedb/src/helpers/claude_request.ts';
import { smokeInputFor } from '../../spacetimedb/src/helpers/llm_inputs.ts';
import { reserveCostMicroUsd } from '../../spacetimedb/src/helpers/measurement.ts';

/**
 * The live-proof steps, in the order the harness runs them: the Phase 43 staged flow. Stage 1 (reveal, start)
 * and stage 2 (fill) are separate steps so they are timed separately. Phase 51.3.1.2 (D-01) split the region
 * fill into 2a (places, world_gen) and 2b (creature families, world_gen_families), so the families call is a
 * step of its own right after world_gen.
 */
export const PROOF_STEPS = Object.freeze([
  'smoke',
  'creation_race',
  'creation_class_reveal',
  'creation_class',
  'world_gen_start',
  'world_gen',
  'world_gen_families', // Phase 51.3.1.2 (D-01): stage 2b, the creature families
  'explore_region',
  'npc_conversation',
  'npc_burst',
  'combat_narration',
  'renown_perk_gen',
  'skill_gen',
  'llm_stats',
]);

/**
 * Domain to the steps that must all pass for it. llm_stats is in no domain: it is a free command whose line
 * may only be accepted (not read back) through the bindings, so it is recorded and left to the user checklist.
 */
export const PROOF_DOMAINS = Object.freeze({
  smoke: Object.freeze(['smoke']),
  creation: Object.freeze(['creation_race', 'creation_class_reveal', 'creation_class']),
  // Phase 51.3.1.2 (D-01): a region is only complete once its families land, so the families step belongs here.
  world_gen: Object.freeze(['world_gen_start', 'world_gen', 'world_gen_families', 'explore_region']),
  npc_chat: Object.freeze(['npc_conversation', 'npc_burst']),
  combat_narration: Object.freeze(['combat_narration']),
  renown: Object.freeze(['renown_perk_gen']),
  skills: Object.freeze(['skill_gen']),
});

/** Steps that cause no model job of their own to observe: they pass on the documented observable instead. */
const FREE_STEPS = Object.freeze(['explore_region', 'llm_stats']);

/** How many sequential NPC chat turns the burst makes (the report's indicative threshold is the same number). */
export const NPC_BURST_TURNS = 20;

/**
 * The creation state machine in order (spacetimedb/src/helpers/creation_generation.ts comment block, plus the
 * reducer's name and confirm steps). CLASS_FILL_ERROR is the failed side of the stage-2 fill; it sits before
 * CLASS_REVEALED so reaching CLASS_REVEALED is never confused with the error state. A drift test reads the
 * server source to keep every name here real.
 */
export const CREATION_ORDER = Object.freeze([
  'AWAITING_RACE',
  'GENERATING_RACE',
  'AWAITING_ARCHETYPE',
  'GENERATING_CLASS',
  'CLASS_FILLING',
  'CLASS_FILL_ERROR',
  'CLASS_REVEALED',
  'AWAITING_NAME',
  'CONFIRMING',
  'COMPLETE',
]);

/** PROVE_LIVE_RUN to a mode. Unset or empty is the free dry run, run is paid, anything else throws. */
export function resolveProveMode(value) {
  if (value === undefined || value === null || value === '') return 'dry';
  if (value === 'run') return 'run';
  throw new Error('PROVE_LIVE_RUN must be unset (dry run) or run (paid)');
}

/** LLM_LIVE_DB to a database name: scratch database by default, otherwise exactly an allowlisted local one. */
export function resolveProofDb(value) {
  if (value === undefined || value === null || value === '') return 'uwr-verify';
  return resolveLiveDb(value);
}

/**
 * A paid run only ever targets the scratch database. The allowlist lets the harness connect to the user's own
 * `uwr` for the free dry run, but a paid run there would write characters, jobs and spend into it. Throws then.
 */
export function assertRunTarget(mode, db) {
  if (mode === 'run' && db !== 'uwr-verify') {
    throw new Error('a paid run only targets the scratch database uwr-verify; the free dry run may connect to uwr');
  }
}

/** The number of routes the smoke test must report, read from the server list. */
export function expectedSmokeCount() {
  return LLM_SMOKE_ROUTES.length;
}

/** The sample count below which a latency figure is only indicative. */
export function burstSampleVerdict(okCount) {
  const n = Number.isFinite(okCount) ? Number(okCount) : 0;
  return { okCount: n, indicative: n < NPC_BURST_TURNS };
}

/**
 * Real model calls the whole run makes, per route, in the server route order: the smoke routes once each, then
 * creation race, class reveal and fill once each, world start, places fill and families fill twice each (the
 * starter region and the explored one), one NPC chat turn plus the burst, one narration, one renown call and one
 * skill call. The harness prices these for the worst-case bound it prints before any spend (worstCaseMicroUsd).
 */
export function plannedCallCounts() {
  const counts = {};
  const add = (route, n) => {
    counts[route] = (counts[route] ?? 0) + n;
  };
  for (const route of LLM_SMOKE_ROUTES) add(route, 1);
  add('creation_race', 1);
  add('creation_class_reveal', 1);
  add('creation_class', 1);
  add('world_gen_start', 2);
  add('world_gen', 2);
  add('world_gen_families', 2); // Phase 51.3.1.2 (D-01): one 2b call per region (the smoke list adds its own)
  add('npc_conversation', 1 + NPC_BURST_TURNS);
  add('combat_narration', 1);
  add('renown_perk_gen', 1);
  add('skill_gen', 1);
  const order = [
    'creation_race',
    'creation_class_reveal',
    'creation_class',
    'world_gen_start',
    'world_gen',
    'world_gen_families', // Phase 51.3.1.2 (D-01): the server route order puts it right after world_gen
    'skill_gen',
    'npc_conversation',
    'combat_narration',
    'renown_perk_gen',
    'smoke_test',
  ];
  const ordered = {};
  for (const route of order) if (counts[route] !== undefined) ordered[route] = counts[route];
  for (const route of Object.keys(counts)) if (ordered[route] === undefined) ordered[route] = counts[route];
  return Object.freeze(ordered);
}

/**
 * The input that prices one call of a route: the first sweep fixture, else the server's fixed smoke input
 * (Phase 51.3.1.2: world_gen_families has no sweep fixture yet), and an empty input for the smoke test itself.
 */
export function proofPricingInput(route) {
  if (route === 'smoke_test') return {};
  const fixtures = SWEEP_FIXTURES[route];
  if (Array.isArray(fixtures) && fixtures.length > 0) return fixtures[0];
  return smokeInputFor(route);
}

/**
 * The reservation one call of a route holds, by the server's own rule: reserveCostMicroUsd over the route's
 * maxTokens (LLM_ROUTES) and the built request's length. Every planned call is priced at this full amount.
 */
export function proofReservationMicroUsd(route) {
  if (!Object.prototype.hasOwnProperty.call(LLM_ROUTES, route)) throw new Error('unknown route: ' + String(route));
  const request = buildClaudeRequest(route, buildRouteLayers(route, proofPricingInput(route)));
  return BigInt(reserveCostMicroUsd(LLM_ROUTES[route].maxTokens, request.bodyText.length));
}

/**
 * The worst-case cost of a planned run: each route's call count times its full reservation (no retries exist).
 * Pure over its arguments. Returns { total, lines: [{ route, calls, eachMicroUsd }] } in the counts order, with
 * bigint amounts. A count or reservation that is not a whole, non-negative amount throws, so the bound can never
 * silently under-count (T-51.3.1.2-29).
 */
export function worstCaseMicroUsd(counts, reservationFor = proofReservationMicroUsd) {
  let total = 0n;
  const lines = [];
  for (const [route, calls] of Object.entries(counts ?? {})) {
    if (typeof calls !== 'number' || !Number.isInteger(calls) || calls < 0) throw new Error('bad call count for ' + route);
    const raw = reservationFor(route);
    const ok = typeof raw === 'bigint' ? raw >= 0n : typeof raw === 'number' && Number.isInteger(raw) && raw >= 0;
    if (!ok) throw new Error('bad reservation for ' + route);
    const eachMicroUsd = BigInt(raw);
    total += eachMicroUsd * BigInt(calls);
    lines.push({ route, calls, eachMicroUsd });
  }
  return { total, lines };
}

const isObject = (x) => x !== null && typeof x === 'object' && !Array.isArray(x);

/**
 * True when one recorded step result counts as observed and passing: the harness marked it ok, it measured a
 * positive latency (zero latency never passes), and the job status is completed (a job step) or completed or
 * observed (a free step). skipped, missing, none, timeout, error and anything else fail.
 */
function stepPassed(result) {
  if (!isObject(result) || result.ok !== true) return false;
  if (typeof result.elapsedMs !== 'number' || !Number.isFinite(result.elapsedMs) || result.elapsedMs <= 0) return false;
  if (FREE_STEPS.includes(result.step)) return result.jobStatus === 'completed' || result.jobStatus === 'observed';
  return result.jobStatus === 'completed';
}

/**
 * The overall verdict over the recorded step results. Per domain: passed (every step passed), not_run (no step
 * has a result) or failed (anything else, including a step that never ran inside a domain that did). The last
 * result recorded for a step wins. Any domain not passed makes the run a failure; nothing skipped passes.
 */
export function proofVerdict(results) {
  const last = new Map();
  for (const r of Array.isArray(results) ? results : []) {
    if (isObject(r) && typeof r.step === 'string') last.set(r.step, r);
  }
  const domains = {};
  const missingSteps = {};
  const notRun = [];
  const failed = [];
  for (const [domain, steps] of Object.entries(PROOF_DOMAINS)) {
    const present = steps.filter((s) => last.has(s));
    if (present.length === 0) {
      domains[domain] = 'not_run';
      notRun.push(domain);
      continue;
    }
    const missing = steps.filter((s) => !last.has(s));
    if (missing.length > 0) missingSteps[domain] = missing;
    if (missing.length === 0 && steps.every((s) => stepPassed(last.get(s)))) domains[domain] = 'passed';
    else {
      domains[domain] = 'failed';
      failed.push(domain);
    }
  }
  return { pass: notRun.length === 0 && failed.length === 0, domains, notRun, failed, missingSteps };
}

/** True only when lastSmokeJson holds exactly expectedSmokeCount() routes and every one is ok. */
export function smokeAllOk(json) {
  const s = summarizeSmoke(json);
  return s.total === expectedSmokeCount() && s.ok === s.total;
}

/** The harness stops before any paid step that would bring today's held spend within this of the daily ceiling ($0.20). */
export const PROOF_SPEND_MARGIN_MICRO_USD = 200_000n;

/**
 * The harness's own fixed spend cap for one paid run ($2.00), checked alongside the daily ceiling (review WR-A02).
 * The daily ceiling is an admin-set production knob (default $10, up to $1,000) that resets every UTC day, so it
 * must never be the harness's only bound. With the margin above, a run stops once it has used $1.80, the same
 * bound as the retired $2 phase cap. Measured from the run's own start, on all-time figures that never reset.
 */
export const PROOF_RUN_CAP_MICRO_USD = 2_000_000n;

/**
 * The owner deferred the "worst-case bound under the stop line" check on 2026-10-09 (51.3.1.2 D-19: the
 * region-creation output cap is generous on purpose; the bound is checked when all systems are in place, Phase 52.5
 * or milestone end). The free dry run prints the bound with this note and never fails on it (code review B, WR-04),
 * matching the skipped assertion in proof_rules.test.mjs. The paid mode's own spend checks (the daily ceiling and the
 * run cap before every paid step) are unchanged.
 */
export const PROOF_BOUND_DEFERRED_NOTE =
  'the bound check is deferred by the owner (2026-10-09, 51.3.1.2 D-19; checked at Phase 52.5 / milestone end). ' +
  'The paid mode keeps its own spend checks (daily ceiling and run cap before each paid step).';

/** The dry run's bound line: the bound, where it sits against the stop line, and the deferral note. Never throws. */
export function proofBoundReport(totalMicroUsd, stopLineMicroUsd = PROOF_RUN_CAP_MICRO_USD - PROOF_SPEND_MARGIN_MICRO_USD) {
  const fmt = (micro) => '$' + (Number(micro) / 1_000_000).toFixed(4);
  const total = BigInt(totalMicroUsd);
  const stop = BigInt(stopLineMicroUsd);
  const where = total < stop ? 'under' : 'OVER';
  return `worst-case bound ${fmt(total)} (${total} micro-USD) is ${where} the ${fmt(stop)} stop line; ${PROOF_BOUND_DEFERRED_NOTE}`;
}

/** Longest piece of player-visible text the harness prints or records. */
export const PROOF_EXCERPT_MAX = 120;

/**
 * True when the next paid step must not start: spent + reserved has reached (cap - margin), where the cap is
 * the global daily ceiling and spent + reserved is today's held spend (see heldTodayMicroUsd).
 * At cap - margin - 1 it is false; at exactly cap - margin it is true. Accepts bigint or integer numbers.
 */
export function shouldStopForSpend(spent, reserved, cap, margin = PROOF_SPEND_MARGIN_MICRO_USD) {
  return BigInt(spent) + BigInt(reserved) >= BigInt(cap) - BigInt(margin);
}

/** Letters-only name of 3 to 20 characters, deterministic per n, distinct for distinct n (base-26 after a fixed prefix). */
export function proofCharacterName(nowMs) {
  let n = BigInt(Math.trunc(Number(nowMs)));
  if (n < 0n) n = -n;
  let tail = '';
  do {
    tail = String.fromCharCode(97 + Number(n % 26n)) + tail;
    n /= 26n;
  } while (n > 0n);
  return 'Pr' + tail;
}

/** A unique, well-formed email per n (the server lowercases it and only needs an '@'). */
export function proofEmail(nowMs) {
  return 'proof-' + Math.trunc(Number(nowMs)) + '@example.test';
}

/**
 * Summarise llm_admin_state.lastSmokeJson: { route: { ok: boolean, ... }, ... }.
 * Malformed JSON, or JSON that is not an object, gives { total: 0, ok: 0, failed: [] } and never throws.
 */
export function summarizeSmoke(json) {
  const empty = { total: 0, ok: 0, failed: [] };
  let parsed;
  try {
    parsed = JSON.parse(String(json ?? ''));
  } catch {
    return empty;
  }
  if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) return empty;
  const failed = [];
  let ok = 0;
  const keys = Object.keys(parsed);
  for (const key of keys) {
    const entry = parsed[key];
    if (entry !== null && typeof entry === 'object' && entry.ok === true) ok += 1;
    else failed.push(key);
  }
  return { total: keys.length, ok, failed };
}

/** A job status after which nothing more will happen to the job. */
export function isTerminalJobStatus(status) {
  return status === 'completed' || status === 'failed' || status === 'expired';
}

/** First PROOF_EXCERPT_MAX characters of text on one line (whitespace collapsed); the caller scrubs it first. */
export function excerpt(text, max = PROOF_EXCERPT_MAX) {
  return String(text ?? '').replace(/\s+/g, ' ').trim().slice(0, max);
}

/** The next step after `current` in PROOF_STEPS, or null at the end. */
export function nextProofStep(current) {
  const i = PROOF_STEPS.indexOf(current);
  return i >= 0 && i + 1 < PROOF_STEPS.length ? PROOF_STEPS[i + 1] : null;
}

/** The UTC day (YYYY-MM-DD) of a millisecond timestamp. Pure; the harness passes Date.now(). */
export function todayUtcString(ms) {
  const d = new Date(Number(ms));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`;
}

/**
 * What the daily ceiling counts for today, from an admin_llm_status row: today's spent (only when the row's
 * spendDayUtc is today; the counter rolls lazily, so a stale day counts 0) plus every reservation still held.
 * Accepts bigint or integer numbers and returns a bigint.
 */
export function heldTodayMicroUsd(status, todayUtc) {
  const reserved = BigInt(status?.phaseReservedMicroUsd ?? 0);
  if (status?.spendDayUtc !== todayUtc) return reserved;
  return BigInt(status?.daySpentMicroUsd ?? 0) + reserved;
}

/**
 * All-time spent plus every reservation still held, from an admin_llm_status row. Unlike the day figure it never
 * resets at UTC midnight, so the difference between two readings is what was spent or reserved in between.
 * Accepts bigint or integer numbers and returns a bigint.
 */
export function heldAllTimeMicroUsd(status) {
  return BigInt(status?.phaseSpentMicroUsd ?? 0) + BigInt(status?.phaseReservedMicroUsd ?? 0);
}

/**
 * True when the next paid step must not start because this run has reached its own cap minus the margin:
 * (held now - held at the run's start) >= runCap - margin. Independent of the daily ceiling (review WR-A02).
 */
export function shouldStopForRunCap(startHeld, nowHeld, runCap = PROOF_RUN_CAP_MICRO_USD, margin = PROOF_SPEND_MARGIN_MICRO_USD) {
  return shouldStopForSpend(BigInt(nowHeld) - BigInt(startHeld), 0n, runCap, margin);
}
