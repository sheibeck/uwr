// Pure rules for the golden run (Phase 44, Plan 44-04). No I/O, no SDK, no secrets.
// The live harness (golden.live.ts) and the review page (golden_review.mjs) import these; the tests live in
// golden_run.test.mjs.
//
// This module owns: the run modes, the spend stop line, the record guard, the run record (built in golden-set
// order with every item present, text redacted), the hygiene check, rerun and verdict merging, and the one rule
// that decides whether a tone approval may be recorded. It never sets an approval: the approval is the owner's
// own overall approve, supplied from outside, and the record carries `approval: null` until the owner gives it.
//
// There is no automatic retry anywhere in the golden run, so the worst-case bound shown to the owner before a
// paid run is exactly the sum of the request reservations.

import { GOLDEN_IDS, goldenItem } from './golden_set.mjs';
import { evaluateGoldenItem } from './golden_rules.mjs';
import { sweepCallCostMicroUsd } from './sweep_rules.mjs';
import { KEEPER_BIBLE_HEADINGS } from '../../spacetimedb/src/data/keeper_bible.ts';
import { redactSecrets } from '../../spacetimedb/src/helpers/measurement.ts';

export { sweepCallCostMicroUsd };

// -- Constants ---------------------------------------------------------------

/** The cap for one golden run: $2. */
export const GOLDEN_CAP_MICRO_USD = 2_000_000n;
/** The harness stops before a call that would pass this: the cap minus a $0.20 margin. */
export const GOLDEN_STOP_AT_MICRO_USD = 1_800_000n;

/** GOLDEN_LIVE_RUN values. Unset is the free dry run. */
export const GOLDEN_MODES = Object.freeze(['dry', 'check-key', 'run', 'rerun']);

/** Record statuses a caller may ask for; 'recorded' is only believed when at least one call ran. */
const STATUSES = Object.freeze(['not_run', 'recorded', 'declined', 'deferred']);

/** Longest verdict comment kept, in characters. */
export const GOLDEN_COMMENT_MAX_CHARS = 2000;
/** Longest note string kept on a mechanical result, in characters. */
const NOTE_MAX_CHARS = 300;

const isObject = (x) => x !== null && typeof x === 'object' && !Array.isArray(x);

// -- Modes -------------------------------------------------------------------

/** GOLDEN_LIVE_RUN to a mode. Unset (or empty) is the free dry run; anything not listed throws. */
export function resolveGoldenMode(value) {
  if (value === undefined || value === null || value === '') return 'dry';
  if (GOLDEN_MODES.includes(value)) return value;
  throw new Error('GOLDEN_LIVE_RUN must be unset (dry), check-key, run or rerun');
}

/**
 * GOLDEN_ONLY to a list of golden ids: comma separated, trimmed, de-duplicated, validated against the golden
 * set and returned in golden-set order whatever order they were typed in. An empty list or an unknown id throws.
 */
export function parseGoldenOnly(value) {
  const asked = String(value ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter((s) => s !== '');
  if (asked.length === 0) throw new Error('GOLDEN_ONLY needs at least one golden item id (comma separated)');
  for (const id of asked) goldenItem(id); // throws "unknown golden item id"
  const wanted = new Set(asked);
  return GOLDEN_IDS.filter((id) => wanted.has(id));
}

// -- Spend guard -------------------------------------------------------------

/** True when spending `nextReserve` more would pass the stop line. Exactly at the line is false. */
export function goldenShouldStop(spentMicroUsd, nextReserveMicroUsd) {
  return BigInt(spentMicroUsd) + BigInt(nextReserveMicroUsd) > GOLDEN_STOP_AT_MICRO_USD;
}

// -- Record guard ------------------------------------------------------------

/** True when the record carries the owner's own approval. */
function ownerApproved(record) {
  const a = isObject(record) ? record.approval : undefined;
  return isObject(a) && a.approved === true && a.approvedBy === 'user';
}

/**
 * Why a paid mode must not start over the existing record, or '' when it may. `run` never replaces a recorded
 * run (use `rerun`); `rerun` needs a recorded run and never touches a record the owner has fully approved.
 * dry and check-key are never refused.
 */
export function goldenRunRefusal(mode, existing) {
  if (!GOLDEN_MODES.includes(mode)) throw new Error('unknown golden mode');
  const status = isObject(existing) ? existing.status : undefined;
  if (mode === 'run' && status === 'recorded') {
    return 'a golden run is already recorded; use rerun with GOLDEN_ONLY to redo failed items';
  }
  if (mode === 'rerun') {
    if (status !== 'recorded') return 'rerun needs a recorded run';
    if (ownerApproved(existing)) return 'the owner has approved this record; it is not rerun';
  }
  return '';
}

// -- Redaction and hygiene ---------------------------------------------------

const MARKER = '[REDACTED]';
const BIBLE_HEADING_LINES = new Set(KEEPER_BIBLE_HEADINGS);

const TOKEN_RE = /eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g;
// The opening of a player_input tag, raw, HTML-escaped or unicode-escaped, with any inner whitespace and a closing slash.
const TAG_RE = /(?:<|&lt;|\\u003c)\s*\/?\s*player_input/gi;
const HEADER_RE = /\b(?:authorization|x-api-key|anthropic-version)\s*[:=]/gi;
const BODY_MARKER_RE = /"(?:output_config|max_tokens|cache_control|anthropic_version)"\s*:/g;
const TASK_LINE_RE = /^\s*TASK:/;

/** Keys that must never appear anywhere in a record. */
const FORBIDDEN_KEYS = new Set([
  'system', 'headers', 'header', 'body', 'requestBody', 'request', 'prompt', 'messages',
  'apiKey', 'api_key', 'key', 'token', 'authorization', 'layers',
]);

/**
 * Replace everything that must never reach a record or a review page: key-shaped strings, three-part tokens,
 * player_input tags (raw, escaped or unicode-escaped), whole lines that are a Keeper Bible heading or a route
 * task line, authorization and key header strings and request-body markers. Idempotent. Never throws.
 */
export function redactForRecord(text) {
  let out = redactSecrets(String(text ?? ''));
  out = out
    .replace(TOKEN_RE, MARKER)
    .replace(TAG_RE, MARKER)
    .replace(HEADER_RE, MARKER)
    .replace(BODY_MARKER_RE, MARKER);
  if (out.includes('\n') || BIBLE_HEADING_LINES.has(out.trim()) || TASK_LINE_RE.test(out)) {
    out = out
      .split('\n')
      .map((line) => {
        const bare = line.replace(/\r$/, '').trim();
        return BIBLE_HEADING_LINES.has(bare) || TASK_LINE_RE.test(line) ? MARKER : line;
      })
      .join('\n');
  }
  return out;
}

/** Every string value in a value, recursively (keys are checked apart). */
function stringsOf(value, out = [], depth = 0) {
  if (depth > 12) return out;
  if (typeof value === 'string') out.push(value);
  else if (Array.isArray(value)) for (const v of value) stringsOf(v, out, depth + 1);
  else if (isObject(value)) for (const v of Object.values(value)) stringsOf(v, out, depth + 1);
  return out;
}

/** Every key in a value, recursively. */
function keysOf(value, out = [], depth = 0) {
  if (depth > 12) return out;
  if (Array.isArray(value)) for (const v of value) keysOf(v, out, depth + 1);
  else if (isObject(value)) {
    for (const [k, v] of Object.entries(value)) {
      out.push(k);
      keysOf(v, out, depth + 1);
    }
  }
  return out;
}

/** True when the pattern matches (global patterns are reset first so no regex state leaks between calls). */
function matches(re, s) {
  re.lastIndex = 0;
  const hit = re.test(s);
  re.lastIndex = 0;
  return hit;
}

/**
 * What a record must not hold, as problem codes in a fixed order, each at most once: key_shaped, token,
 * player_input_tag, bible_heading, task_line, auth_header, request_body_marker, forbidden_key. A clean record
 * returns []. Anything redactForRecord has cleaned is clean here.
 */
export function recordHygieneProblems(record) {
  const found = new Set();
  for (const s of stringsOf(record)) {
    if (redactSecrets(s) !== s) found.add('key_shaped');
    if (matches(TOKEN_RE, s)) found.add('token');
    if (matches(TAG_RE, s)) found.add('player_input_tag');
    if (matches(HEADER_RE, s)) found.add('auth_header');
    if (matches(BODY_MARKER_RE, s)) found.add('request_body_marker');
    for (const line of s.split('\n')) {
      if (BIBLE_HEADING_LINES.has(line.replace(/\r$/, '').trim())) found.add('bible_heading');
      if (TASK_LINE_RE.test(line)) found.add('task_line');
    }
  }
  if (keysOf(record).some((k) => FORBIDDEN_KEYS.has(k))) found.add('forbidden_key');
  return ['key_shaped', 'token', 'player_input_tag', 'bible_heading', 'task_line', 'auth_header', 'request_body_marker', 'forbidden_key'].filter(
    (code) => found.has(code),
  );
}

// -- Record ------------------------------------------------------------------

const count = (v) => (typeof v === 'number' && Number.isFinite(v) && v >= 0 ? Math.trunc(v) : 0);

/** A non-negative integer micro-USD amount from a bigint, an integer number or a digit string; else 0n. */
function toMicro(v) {
  try {
    if (typeof v === 'bigint') return v >= 0n ? v : 0n;
    if (typeof v === 'number' && Number.isInteger(v) && v >= 0) return BigInt(v);
    if (typeof v === 'string' && /^\d+$/.test(v)) return BigInt(v);
  } catch {
    /* fall through */
  }
  return 0n;
}

const isoOrNull = (v) => (typeof v === 'string' && /^\d{4}-\d\d-\d\dT[\d:.]+Z$/.test(v) && !Number.isNaN(Date.parse(v)) ? v : null);

const cleanUsage = (u) => ({
  input: count(u?.input),
  output: count(u?.output),
  cacheWrite: count(u?.cacheWrite),
  cacheRead: count(u?.cacheRead),
});

/** A note value with every string redacted and capped; objects and arrays are kept to a small depth. */
function cleanNote(value, depth = 0) {
  if (typeof value === 'string') return redactForRecord(value).slice(0, NOTE_MAX_CHARS);
  if (typeof value === 'number' || typeof value === 'boolean' || value === null) return value;
  if (depth >= 4) return null;
  if (Array.isArray(value)) return value.slice(0, 20).map((v) => cleanNote(v, depth + 1));
  if (isObject(value)) {
    const out = {};
    for (const [k, v] of Object.entries(value).slice(0, 20)) {
      if (v !== undefined) out[String(k).slice(0, 40)] = cleanNote(v, depth + 1);
    }
    return out;
  }
  return null;
}

/** An item entry in its fixed key order. Used by every builder so reruns diff cleanly. */
function itemEntry(f) {
  return {
    id: f.id,
    route: f.route,
    kind: f.kind,
    ran: f.ran,
    ok: f.ok,
    failureClass: f.failureClass,
    stopReason: f.stopReason,
    latencyMs: f.latencyMs,
    usage: f.usage,
    costMicroUsd: f.costMicroUsd,
    text: f.text,
    redacted: f.redacted,
    mechanical: f.mechanical,
    rerunCount: f.rerunCount,
    verdict: f.verdict,
    comment: f.comment,
  };
}

const STOP_REASON = /^[a-z_]{1,40}$/i;
const FAILURE_CLASS = /^[a-z_]{1,40}$/i;

/**
 * One item entry from the result of one call. `result` is { ran, ok, failureClass, stopReason, latencyMs, usage,
 * costMicroUsd, text, json } as the harness measured it; undefined or ran !== true is an item that never ran,
 * recorded as a failed item with reason not_run, never omitted. The mechanical result is computed on the RAW
 * text, then the text is redacted for the record.
 */
export function buildGoldenItem(id, result) {
  const item = goldenItem(id);
  const base = { id: item.id, route: item.route, kind: item.kind, rerunCount: 0, verdict: null, comment: '' };
  if (!isObject(result) || result.ran !== true) {
    return itemEntry({
      ...base,
      ran: false,
      ok: false,
      failureClass: 'not_run',
      stopReason: null,
      latencyMs: 0,
      usage: cleanUsage(null),
      costMicroUsd: '0',
      text: '',
      redacted: false,
      mechanical: { pass: false, failures: ['call_failed'], notes: { reason: 'not_run' } },
    });
  }

  const ok = result.ok === true;
  const rawText = typeof result.text === 'string' ? result.text : '';
  const usage = cleanUsage(result.usage);
  const stopReason = typeof result.stopReason === 'string' && STOP_REASON.test(result.stopReason) ? result.stopReason : null;
  const failureClass = !ok && typeof result.failureClass === 'string' && FAILURE_CLASS.test(result.failureClass) ? result.failureClass : null;
  const verdict = evaluateGoldenItem(item, {
    ok,
    failureClass,
    stopReason,
    text: rawText,
    json: isObject(result.json) ? result.json : undefined,
    usage,
  });
  const text = redactForRecord(rawText);
  return itemEntry({
    ...base,
    ran: true,
    ok,
    failureClass,
    stopReason,
    latencyMs: count(result.latencyMs),
    usage,
    costMicroUsd: toMicro(result.costMicroUsd).toString(),
    text,
    redacted: text !== rawText,
    mechanical: { pass: verdict.pass === true, failures: [...verdict.failures], notes: cleanNote(verdict.notes ?? {}) },
  });
}

/** Totals over a list of item entries: calls made, exact cost, token sums. */
function totalsOf(items) {
  let cost = 0n;
  const t = { calls: 0, inputTokens: 0, outputTokens: 0, cacheWriteTokens: 0, cacheReadTokens: 0 };
  for (const i of items) {
    if (i.ran) t.calls += 1; // rerun attempts are added by mergeRerun, not derived here
    cost += BigInt(i.costMicroUsd);
    t.inputTokens += i.usage.input;
    t.outputTokens += i.usage.output;
    t.cacheWriteTokens += i.usage.cacheWrite;
    t.cacheReadTokens += i.usage.cacheRead;
  }
  return { calls: t.calls, costMicroUsd: cost.toString(), inputTokens: t.inputTokens, outputTokens: t.outputTokens, cacheWriteTokens: t.cacheWriteTokens, cacheReadTokens: t.cacheReadTokens };
}

/**
 * The run record in its fixed key order, with an entry for every golden id in set order. input: { status?,
 * model, window: { startedAt, endedAt }, results: { [id]: result } }. Nothing outside the whitelisted fields is
 * ever stored (no request body, header, key, token or system text). The total cost is the exact sum of the item
 * costs. The approval is null: nothing in this module sets one.
 */
export function buildGoldenRecord(input) {
  const i = isObject(input) ? input : {};
  const results = isObject(i.results) ? i.results : {};
  const items = GOLDEN_IDS.map((id) => buildGoldenItem(id, Object.hasOwn(results, id) ? results[id] : undefined));
  const ran = items.some((x) => x.ran);
  let status = STATUSES.includes(i.status) ? i.status : ran ? 'recorded' : 'not_run';
  if (status === 'recorded' && !ran) status = 'not_run';
  const w = isObject(i.window) ? i.window : {};
  return {
    schemaVersion: 1,
    status,
    model: typeof i.model === 'string' ? redactForRecord(i.model).slice(0, 80) : null,
    window: { startedAt: isoOrNull(w.startedAt), endedAt: isoOrNull(w.endedAt) },
    totals: totalsOf(items),
    items,
    rerunWindows: [],
    approval: null,
  };
}

const clone = (v) => JSON.parse(JSON.stringify(v));

/**
 * The record with the named items replaced by their rerun entries. Every other entry is kept byte for byte, in
 * set order. A replaced entry keeps its id, counts one more rerun, starts with no verdict, and carries the
 * cost of every attempt so the total stays the exact sum of the item costs. Totals accumulate. Never mutates
 * its arguments. opts.window ({ startedAt, endedAt }) is appended to rerunWindows for the Console reconciliation.
 */
export function mergeRerun(existing, rerunItems, opts = {}) {
  if (!isObject(existing) || existing.status !== 'recorded' || !Array.isArray(existing.items)) {
    throw new Error('mergeRerun needs a recorded run');
  }
  const next = clone(existing);
  const byId = new Map();
  for (const entry of Array.isArray(rerunItems) ? rerunItems : []) {
    goldenItem(entry?.id); // throws on an unknown id
    byId.set(entry.id, entry);
  }
  let addCost = 0n;
  const add = { calls: 0, inputTokens: 0, outputTokens: 0, cacheWriteTokens: 0, cacheReadTokens: 0 };
  next.items = GOLDEN_IDS.map((id) => {
    const old = next.items.find((x) => x.id === id);
    const fresh = byId.get(id);
    if (!fresh) return old;
    const entry = buildGoldenItem(id, undefined); // fixed shape, then filled from the sanitized rerun entry
    const source = clone(fresh);
    const newCost = toMicro(source.costMicroUsd);
    const oldCost = toMicro(old?.costMicroUsd);
    addCost += newCost;
    if (source.ran === true) add.calls += 1;
    const u = cleanUsage(source.usage);
    add.inputTokens += u.input;
    add.outputTokens += u.output;
    add.cacheWriteTokens += u.cacheWrite;
    add.cacheReadTokens += u.cacheRead;
    return itemEntry({
      ...entry,
      ...source,
      usage: u,
      costMicroUsd: (oldCost + newCost).toString(),
      rerunCount: count(old?.rerunCount) + 1,
      verdict: null,
      comment: '',
    });
  });
  const t = next.totals;
  next.totals = {
    calls: count(t.calls) + add.calls,
    costMicroUsd: (toMicro(t.costMicroUsd) + addCost).toString(),
    inputTokens: count(t.inputTokens) + add.inputTokens,
    outputTokens: count(t.outputTokens) + add.outputTokens,
    cacheWriteTokens: count(t.cacheWriteTokens) + add.cacheWriteTokens,
    cacheReadTokens: count(t.cacheReadTokens) + add.cacheReadTokens,
  };
  const w = isObject(opts) && isObject(opts.window) ? opts.window : null;
  next.rerunWindows = [
    ...(Array.isArray(next.rerunWindows) ? next.rerunWindows : []),
    ...(w ? [{ startedAt: isoOrNull(w.startedAt), endedAt: isoOrNull(w.endedAt) }] : []),
  ];
  return next;
}

// -- Verdicts ----------------------------------------------------------------

/**
 * Verdicts read back from the review page or pasted by the owner are untrusted DATA. Keep only golden ids with
 * a verdict of exactly 'pass' or 'fail'; the comment becomes a redacted, capped string. Returns the clean
 * verdicts and the ids that were rejected.
 */
export function validateVerdicts(raw) {
  const verdicts = {};
  const rejected = [];
  const src = isObject(raw) ? raw : {};
  for (const id of GOLDEN_IDS) {
    if (!Object.hasOwn(src, id)) continue;
    const v = src[id];
    if (!isObject(v) || (v.verdict !== 'pass' && v.verdict !== 'fail')) {
      rejected.push(id);
      continue;
    }
    verdicts[id] = {
      verdict: v.verdict,
      comment: typeof v.comment === 'string' ? redactForRecord(v.comment).slice(0, GOLDEN_COMMENT_MAX_CHARS) : '',
    };
  }
  for (const k of Object.keys(src)) if (!GOLDEN_IDS.includes(k)) rejected.push(k);
  return { verdicts, rejected };
}

/** The record with the valid verdicts written onto their items. Never sets an approval. Never mutates. */
export function mergeVerdicts(record, verdicts) {
  const next = clone(record);
  const { verdicts: clean } = validateVerdicts(verdicts);
  for (const item of next.items ?? []) {
    const v = clean[item.id];
    if (v) {
      item.verdict = v.verdict;
      item.comment = v.comment;
    }
  }
  return next;
}

// -- Approval ----------------------------------------------------------------

/**
 * Whether a tone approval may be recorded. Returns { allowed, reasons }. Allowed only when ALL hold: the set is
 * not empty, at least one item completed (ran, ok, non-empty text), every one of the golden ids has a verdict
 * (from `verdicts`, else the one stored on the record), every item that was passed over a mechanical failure
 * carries a non-empty comment (an explicit waiver), and `overall` is the owner's own approve
 * ({ approved: true, approvedBy: 'user' }). An agent message, a default, a timeout or a passing mechanical result
 * is never an approval. Nothing here sets one.
 */
export function approvalAllowed({ record, verdicts, overall } = {}) {
  const reasons = [];
  const items = isObject(record) && Array.isArray(record.items) ? record.items : [];
  if (items.length === 0) reasons.push('empty_set');

  const completed = items.some((i) => isObject(i) && i.ran === true && i.ok === true && typeof i.text === 'string' && i.text.trim() !== '');
  if (!completed) reasons.push('no_completed_items');

  const { verdicts: clean } = validateVerdicts(verdicts);
  for (const id of GOLDEN_IDS) {
    const item = items.find((x) => isObject(x) && x.id === id);
    const stored = item && (item.verdict === 'pass' || item.verdict === 'fail') ? { verdict: item.verdict, comment: String(item.comment ?? '') } : undefined;
    const v = clean[id] ?? stored;
    if (!v) {
      reasons.push(`missing_verdict:${id}`);
      continue;
    }
    if (items.length > 0 && !item) reasons.push(`missing_item:${id}`);
    if (v.verdict === 'pass' && item && item.mechanical?.pass === false && v.comment.trim() === '') {
      reasons.push(`waiver_comment_needed:${id}`);
    }
  }

  const ownerOverall = isObject(overall) && overall.approved === true && overall.approvedBy === 'user';
  if (!ownerOverall) reasons.push('overall_not_owner_approve');

  return { allowed: reasons.length === 0, reasons };
}
