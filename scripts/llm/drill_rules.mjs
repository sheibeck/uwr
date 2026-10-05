// Pure rules for the live failure drills (Plan 44-06, QUAL-03).
// No I/O, no SDK, no secrets. The harness (drills.live.ts) imports these; tests live in drill_rules.test.mjs.
//
// The four live drills run only on the local scratch database uwr-verify. They induce a failure on purpose
// (a fake key, a $0.01 ceiling, the kill switch off, a 50 ms route timeout), check the player-facing result and
// restore the state. Nothing here knows a real key; the fake key is built from fragments so no key-shaped literal
// exists in this source.

import { CREATION_ORDER } from './proof_rules.mjs';

/** The only database a live drill may run on. Stricter than the proof allowlist: never the user's uwr. */
export const DRILL_DB = 'uwr-verify';

/** The four drills, in the order they run. */
export const DRILLS = Object.freeze(['bad_key_401', 'ceiling', 'kill_switch', 'tiny_timeout']);

/** The four drills plus the final restore check: every name a record carries. */
export const DRILL_STEPS = Object.freeze([...DRILLS, 'restore_check']);

/** The tiny route timeout the timeout drill publishes temporarily (ms). */
export const TINY_TIMEOUT_MS = 50;

/** The lowest daily ceiling the module accepts ($0.01), used by the ceiling drill. */
export const CEILING_DRILL_MICRO_USD = 10_000n;

/** The statuses a drill record entry can hold. Only passed counts as a pass. */
export const DRILL_STATUSES = Object.freeze(['passed', 'failed', 'not_run', 'deferred', 'declined']);

/** What each drill does, what reaches the provider, what it restores. Printed by the dry run and the checkpoint. */
export const DRILL_PLAN = Object.freeze({
  bad_key_401: Object.freeze({
    does: 'store a fake key, submit a race description, expect a failed creation_race job (unavailable bucket), the lock back at AWAITING_RACE and a zero-token zero-cost call-log row',
    reachesProvider: true,
    expectedCostMicroUsd: 0,
    restores: 'the real key, through scripts/llm/set-key.mjs',
  }),
  ceiling: Object.freeze({
    does: 'lower the daily ceiling to the $0.01 minimum, submit input, expect a refusal before any call (no job, no call-log row, lock not stuck)',
    reachesProvider: false,
    expectedCostMicroUsd: 0,
    restores: 'the starting daily ceiling, and the real key',
  }),
  kill_switch: Object.freeze({
    does: 'turn the kill switch off, submit input, expect a refusal before any call (no job, no call-log row, lock not stuck)',
    reachesProvider: false,
    expectedCostMicroUsd: 0,
    restores: 'the kill switch on, and the real key',
  }),
  tiny_timeout: Object.freeze({
    does: 'with a build that has a 50 ms creation_race timeout and the fake key stored, submit input, expect a failed job, the lock released, a timeout call-log row with zero tokens and the reservation held as the ledger stand-in',
    reachesProvider: true,
    expectedCostMicroUsd: 0,
    restores: 'the real key; the temporary timeout edit is reverted and the unmodified source is published again',
  }),
  restore_check: Object.freeze({
    does: 'read the final admin status and the drill call-log rows and assert every restore and zero spend',
    reachesProvider: false,
    expectedCostMicroUsd: 0,
    restores: 'nothing (read only)',
  }),
});

/** True when the value is exactly the scratch database name. Exact, case-sensitive. */
export function isDrillDb(name) {
  return typeof name === 'string' && name === DRILL_DB;
}

/** Return the name when it is exactly uwr-verify, else throw (the bad value is not echoed). */
export function assertDrillDb(name) {
  if (!isDrillDb(name)) throw new Error('live drills run only on the scratch database ' + DRILL_DB + ' (never uwr)');
  return name;
}

/** DRILLS_LIVE_RUN to a mode. Unset or empty is the dry run, run is live, anything else throws. */
export function resolveDrillMode(value) {
  if (value === undefined || value === null || value === '') return 'dry';
  if (value === 'run') return 'run';
  throw new Error('DRILLS_LIVE_RUN must be unset (dry run) or run (live)');
}

/**
 * DRILLS_ONLY (a comma list of drill names and restore_check) to an ordered list. Unset or empty means every
 * step in a dry run and is refused in a live run (a live run names what it runs). Unknown names throw.
 */
export function parseDrillsOnly(value, mode) {
  const text = typeof value === 'string' ? value.trim() : '';
  if (text === '') {
    if (mode === 'run') throw new Error('DRILLS_ONLY is required for a live run: name the drills (' + DRILL_STEPS.join(', ') + ')');
    return [...DRILL_STEPS];
  }
  const wanted = text.split(',').map((s) => s.trim());
  for (const name of wanted) {
    if (!DRILL_STEPS.includes(name)) throw new Error('DRILLS_ONLY names an unknown drill (use ' + DRILL_STEPS.join(', ') + ')');
  }
  return DRILL_STEPS.filter((name) => wanted.includes(name));
}

/**
 * A key-shaped fake: it passes the module's format check (prefix and length) so set_api_key accepts it, and the
 * provider rejects it. Built from fragments so this source holds no key-shaped literal; never printed.
 */
export function makeFakeKey() {
  return ['sk', '-ant-', 'api03-', 'drill', '-fake-key-', 'x'.repeat(30)].join('');
}

const asBig = (v) => {
  try {
    if (typeof v === 'bigint') return v >= 0n ? v : null;
    if (typeof v === 'number' && Number.isSafeInteger(v) && v >= 0) return BigInt(v);
    if (typeof v === 'string' && /^\d+$/.test(v)) return BigInt(v);
  } catch {
    // fall through
  }
  return null;
};

/**
 * Problems with the final admin_llm_status row after every drill: an empty list only when the real key is stored
 * again (keySet and the real key's length), the ceiling equals its starting value and the kill switch is on.
 * `expected` is { keyLength, ceilingMicroUsd }. Each deviation is a named problem.
 */
export function assertRestored(statusRow, expected) {
  const problems = [];
  if (!statusRow || typeof statusRow !== 'object') return ['status_missing'];
  if (statusRow.keySet !== true) problems.push('key_not_set');
  const wantLen = asBig(expected?.keyLength);
  const haveLen = asBig(statusRow.keyLength);
  if (wantLen === null || wantLen === 0n) problems.push('expected_key_length_unknown');
  else if (haveLen === null || haveLen !== wantLen) problems.push('key_length_mismatch');
  const wantCeil = asBig(expected?.ceilingMicroUsd);
  const haveCeil = asBig(statusRow.dailyCeilingMicroUsd);
  if (wantCeil === null) problems.push('expected_ceiling_unknown');
  else if (haveCeil === null || haveCeil !== wantCeil) problems.push('ceiling_not_restored');
  if (statusRow.llmEnabled !== true) problems.push('kill_switch_off');
  return problems;
}

const TOKEN_COLUMNS = Object.freeze(['input_tokens', 'output_tokens', 'cache_write_tokens', 'cache_read_tokens']);

/**
 * Problems with the call-log rows the drills created (SQL column names, as call_log_report.mjs returns them).
 * A row with any non-zero token column means real usage was billed: always a problem. A non-zero cost is a
 * problem too, except on a timeout row: a timed-out request has unknown billing, so the executor stores the
 * reservation as the ledger stand-in (spacetimedb/src/helpers/llm_executor.ts); with zero tokens on a fake key
 * nothing was billed. Returns one string per problem, naming the route and the column only.
 */
export function zeroSpendProblems(newRows) {
  const problems = [];
  for (const [i, row] of (Array.isArray(newRows) ? newRows : []).entries()) {
    const label = 'row ' + i + ' (' + String(row?.route ?? 'unknown') + ', ' + String(row?.outcome ?? 'unknown') + ')';
    for (const col of TOKEN_COLUMNS) {
      const v = asBig(row?.[col] ?? 0n);
      if (v === null) problems.push(label + ': ' + col + ' is not a number');
      else if (v !== 0n) problems.push(label + ': ' + col + ' is not zero');
    }
    const cost = asBig(row?.cost_micro_usd ?? 0n);
    if (cost === null) problems.push(label + ': cost_micro_usd is not a number');
    else if (cost !== 0n && row?.outcome !== 'timeout') problems.push(label + ': cost_micro_usd is not zero');
  }
  return problems;
}

/** The creation steps in which a generation lock is held (the player is told to wait). */
export function isGeneratingStep(step) {
  return typeof step === 'string' && (step.startsWith('GENERATING_') || step === 'CLASS_FILLING');
}

/** Problems with the creation state after a failure or refusal: released to its waiting step, never generating. */
export function lockProblems(step, awaitingStep) {
  const problems = [];
  if (!CREATION_ORDER.includes(awaitingStep)) problems.push('waiting_step_unknown');
  if (isGeneratingStep(step)) problems.push('stuck_generating');
  else if (step !== awaitingStep) problems.push('not_at_waiting_step');
  return problems;
}

/** Problems with a failed job: it exists, is failed, is on the expected route and carries the expected coarse bucket. */
export function failedJobProblems(job, expected) {
  if (!job) return ['job_missing'];
  const problems = [];
  if (job.route !== expected.route) problems.push('wrong_route');
  if (job.status !== 'failed') problems.push('job_not_failed');
  if (job.errorCode !== expected.bucket) problems.push('wrong_bucket');
  return problems;
}

/** Problems with a local refusal (kill switch or ceiling): no job and no call-log row may have appeared. */
export function localRefusalProblems({ newJobCount, newCallRowCount }) {
  const problems = [];
  if (newJobCount !== 0) problems.push('job_created');
  if (newCallRowCount !== 0) problems.push('call_row_created');
  return problems;
}

/**
 * Problems with the ledger after the timeout drill: the timeout row exists with outcome timeout, the call-log row
 * holds the reservation as its stand-in cost (positive), the all-time spent figure rose by exactly that stand-in
 * and no reservation is still held. `before` and `after` are admin_llm_status rows.
 */
export function timeoutLedgerProblems(before, after, row) {
  if (!row) return ['timeout_row_missing'];
  const problems = [];
  if (row.outcome !== 'timeout') problems.push('outcome_not_timeout');
  const cost = asBig(row.cost_micro_usd);
  if (cost === null || cost <= 0n) problems.push('stand_in_missing');
  const spentBefore = asBig(before?.phaseSpentMicroUsd);
  const spentAfter = asBig(after?.phaseSpentMicroUsd);
  if (spentBefore === null || spentAfter === null || cost === null || spentAfter - spentBefore !== cost) problems.push('ledger_stand_in_mismatch');
  const reservedBefore = asBig(before?.phaseReservedMicroUsd);
  const reservedAfter = asBig(after?.phaseReservedMicroUsd);
  if (reservedBefore === null || reservedAfter === null || reservedAfter !== reservedBefore) problems.push('reservation_still_held');
  return problems;
}

/**
 * Words a player-facing line must never carry (the provider, the key, an HTTP status, billing, the spend cap).
 * Whole-word matches, so the in-voice word narrate is not flagged as rate. Returns the matching rule ids only.
 */
const LEAK_RULES = Object.freeze([
  ['http_status', /\b(401|403|429|500|529)\b/],
  ['provider_name', /\b(anthropic|claude)\b/i],
  ['api_key', /\bapi[ -]?key\b/i],
  ['rate_limit', /\brate[ -]?limit(ed)?\b/i],
  ['billing', /\b(billing|quota|credit balance)\b/i],
  ['http_word', /\bhttps?\b/i],
  ['spend_cap', /\b(spend|daily)\s+(cap|ceiling)\b/i],
  ['unauthorized', /\bunauthori[sz]ed\b/i],
  ['kill_switch', /\bkill[ -]?switch\b/i],
]);

export function leakHits(text) {
  const s = String(text ?? '');
  return LEAK_RULES.filter(([, re]) => re.test(s)).map(([id]) => id);
}

const REASON_MAX = 240;
const EVIDENCE_VALUE_MAX = 200;

function cleanEvidence(evidence) {
  const out = {};
  if (!evidence || typeof evidence !== 'object' || Array.isArray(evidence)) return out;
  for (const key of Object.keys(evidence).sort()) {
    const v = evidence[key];
    if (typeof v === 'bigint') out[key] = v.toString();
    else if (typeof v === 'number' || typeof v === 'boolean') out[key] = v;
    else if (typeof v === 'string') out[key] = v.slice(0, EVIDENCE_VALUE_MAX);
    else if (Array.isArray(v) && v.every((x) => typeof x === 'string')) out[key] = v.map((x) => x.slice(0, EVIDENCE_VALUE_MAX)).slice(0, 20);
  }
  return out;
}

/**
 * The drill record, with a fixed key order and one entry per step in DRILL_STEPS order. `entries` is an array of
 * { name, status, reason?, evidence? } (later entries for a name win). A step with no entry, or with a status that
 * is not one of the five, is not_run. The overall status is passed only when every drill and the restore check
 * passed; a deferral or decline is never passed; any failure is failed; otherwise it is the first non-pass state.
 */
export function drillRecord(entries) {
  const byName = new Map();
  for (const e of Array.isArray(entries) ? entries : []) {
    if (e && typeof e === 'object' && typeof e.name === 'string') byName.set(e.name, e);
  }
  const drills = DRILL_STEPS.map((name) => {
    const e = byName.get(name);
    const status = e && DRILL_STATUSES.includes(e.status) ? e.status : 'not_run';
    const entry = { name, status };
    if (e && typeof e.reason === 'string' && e.reason !== '') entry.reason = e.reason.slice(0, REASON_MAX);
    const evidence = cleanEvidence(e?.evidence);
    if (Object.keys(evidence).length > 0) entry.evidence = evidence;
    return entry;
  });
  const statuses = drills.map((d) => d.status);
  let overall;
  if (statuses.every((s) => s === 'passed')) overall = 'passed';
  else if (statuses.includes('failed')) overall = 'failed';
  else if (statuses.includes('declined')) overall = 'declined';
  else if (statuses.includes('deferred')) overall = 'deferred';
  else overall = 'not_run';
  return { plan: '44-06', database: DRILL_DB, overall, drills };
}
