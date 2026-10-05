// Call-log report math for the Phase 44 live verification (QUAL-02, Plan 44-03).
//
// Pure functions over llm_call_log rows, plus a thin CLI at the bottom:
//   node scripts/llm/call_log_report.mjs --db uwr-verify --results <file> [--reconcile <console-totals-file>]
//
// Rules this module keeps:
//   - percentile and estimateCostMicroUsd come from the server's measurement module and the route
//     order from the server's route table; neither is reimplemented here
//   - latency percentiles use ok rows only (as /llm stats does), nearest rank
//   - token sums and the 2% test use BigInt integer math (no float rounding can hide a breach)
//   - a route or check that did not run is "not_run" and fails; a missing Console input is
//     "deferred", never "passed"
//   - the SQL names its columns and reads llm_call_log only (never llm_config); the fetch helper
//     refuses any base URL that is not the local server
//   - nothing here reads the key, .env.local or any prompt text

import fs from 'node:fs';
import { register } from 'node:module';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

import { LIVE_DBS, getCliToken, resolveLiveDb, resolveTarget, scrub } from './cli.mjs';
import { estimateCostMicroUsd, percentile } from '../../spacetimedb/src/helpers/measurement.ts';

// The route table imports its siblings without a file extension, which the bundler resolves but
// plain Node does not. Under Node a small resolve hook retries those with .ts; under vitest the
// bundler already resolves them.
if (!process.env.VITEST) register('./ts_resolve_hook.mjs', import.meta.url);
const { LLM_ROUTE_NAMES } = await import('../../spacetimedb/src/data/llm_routes.ts');

/** The llm_call_log columns the report reads, in SQL (snake_case) names. */
export const CALL_LOG_COLUMNS = Object.freeze([
  'route',
  'outcome',
  'latency_ms',
  'input_tokens',
  'output_tokens',
  'cache_write_tokens',
  'cache_read_tokens',
  'cost_micro_usd',
  'dispatch_late_ms',
  'job_id',
  'attempt',
  'http_status',
]);

const STRING_COLUMNS = new Set(['route', 'outcome']);

/** Fewer ok samples than this and p95/p99 are just the maximum: the route is only indicative. */
export const INDICATIVE_BELOW = 20;
/** The reconciliation tolerance, as a percentage of the Console figure. */
export const RECONCILE_PERCENT = 2n;
/** A Console category below this many tokens is judged on an absolute floor instead of a percentage. */
export const RECONCILE_SMALL_CATEGORY_TOKENS = 2000n;
/** The absolute floor, in tokens, for a small category. */
export const RECONCILE_ABSOLUTE_FLOOR_TOKENS = 50n;
/** Streaming is a next-milestone candidate when the NPC-chat p95 call latency is over this. */
export const STREAMING_P95_LIMIT_MS = 6000;
/** At least this many ok NPC-chat calls are needed before the streaming verdict is issued. */
export const STREAMING_MIN_SAMPLES = 20;
/** The route the streaming rule is measured on. */
export const STREAMING_ROUTE = 'npc_conversation';

const TOKEN_CATEGORIES = Object.freeze(['input', 'output', 'cacheWrite', 'cacheRead']);
const TOKEN_COLUMN_OF = Object.freeze({
  input: 'input_tokens',
  output: 'output_tokens',
  cacheWrite: 'cache_write_tokens',
  cacheRead: 'cache_read_tokens',
});

// ---------------------------------------------------------------------------
// SQL text and row mapping
// ---------------------------------------------------------------------------

/** The one query the report runs: named columns, llm_call_log only. */
export function callLogSql() {
  return 'SELECT ' + CALL_LOG_COLUMNS.join(', ') + ' FROM llm_call_log';
}

/** An Option value as the HTTP SQL API encodes it: { "0": v } is some, { "1": [] } is none. */
function decodeOption(v) {
  if (v && typeof v === 'object' && !Array.isArray(v)) {
    const keys = Object.keys(v);
    if (keys.length === 1 && keys[0] === '0') return v['0'];
    if (keys.length === 1 && keys[0] === '1') return null;
    if (keys.length === 1 && keys[0] === 'some') return v.some;
  }
  return v;
}

function schemaName(el) {
  const raw = el && typeof el === 'object' && 'name' in el ? el.name : el;
  const name = decodeOption(raw);
  return typeof name === 'string' ? name : null;
}

function decodeValue(column, value) {
  const v = decodeOption(value);
  if (v === null || v === undefined) return null;
  if (STRING_COLUMNS.has(column)) return String(v);
  if (typeof v === 'bigint') return v;
  if (typeof v === 'number' && Number.isSafeInteger(v) && v >= 0) return BigInt(v);
  if (typeof v === 'string' && /^\d+$/.test(v)) return BigInt(v);
  throw new Error('call log column ' + column + ' is not an unsigned integer');
}

/**
 * Turn the HTTP SQL response into row objects keyed by the SQL column names. Accepts the documented
 * shape (an array of results, the first holding a schema whose elements carry names and rows that
 * are arrays) and rows given as objects. Columns are mapped by schema name, never by position.
 * Unsigned integers become BigInt; route and outcome stay strings.
 */
export function mapSqlResult(json) {
  const result = Array.isArray(json) ? json[0] : json;
  if (!result || typeof result !== 'object') throw new Error('SQL response has no result');
  const rawRows = Array.isArray(result.rows) ? result.rows : [];
  const elements = Array.isArray(result.schema?.elements) ? result.schema.elements : Array.isArray(result.schema) ? result.schema : null;
  const names = elements ? elements.map(schemaName) : null;
  const out = [];
  for (const raw of rawRows) {
    let byName;
    if (Array.isArray(raw)) {
      if (!names || names.some((n) => n === null)) throw new Error('SQL response rows are arrays but the schema has no column names');
      byName = {};
      names.forEach((n, i) => {
        byName[n] = raw[i];
      });
    } else if (raw && typeof raw === 'object') {
      byName = raw;
    } else {
      throw new Error('SQL response row is neither an array nor an object');
    }
    const row = {};
    for (const column of CALL_LOG_COLUMNS) {
      if (!(column in byName)) throw new Error('SQL response is missing column ' + column);
      row[column] = decodeValue(column, byName[column]);
    }
    out.push(row);
  }
  return out;
}

/** Keep the rows whose job id is in the set (ids may be numbers, strings or BigInt). */
export function filterByJobIds(rows, jobIds) {
  const wanted = new Set([...jobIds].map((id) => String(id)));
  return rows.filter((r) => r.job_id !== null && wanted.has(String(r.job_id)));
}

/** True when ms is within [startMs, endMs], inclusive at both ends. */
export function inWindow(ms, startMs, endMs) {
  if (![ms, startMs, endMs].every((n) => typeof n === 'number' && Number.isFinite(n))) return false;
  return ms >= startMs && ms <= endMs;
}

// ---------------------------------------------------------------------------
// Per-route report
// ---------------------------------------------------------------------------

function zeroSums() {
  return { input: 0n, output: 0n, cacheWrite: 0n, cacheRead: 0n };
}

function addTokens(sums, row) {
  for (const cat of TOKEN_CATEGORIES) sums[cat] += row[TOKEN_COLUMN_OF[cat]] ?? 0n;
}

function priceOf(sums) {
  return estimateCostMicroUsd({
    input: Number(sums.input),
    output: Number(sums.output),
    cacheWrite: Number(sums.cacheWrite),
    cacheRead: Number(sums.cacheRead),
  });
}

/** Stats for one route's rows. Latency percentiles use ok rows only. */
function statsFor(route, rows) {
  const okLatencies = [];
  const sums = zeroSums();
  let errors = 0;
  let truncated = 0;
  for (const r of rows) {
    addTokens(sums, r);
    if (r.outcome === 'ok') okLatencies.push(Number(r.latency_ms));
    else {
      errors += 1;
      if (r.outcome === 'truncated') truncated += 1;
    }
  }
  const n = okLatencies.length;
  let status;
  if (rows.length === 0) status = 'not_run';
  else if (n === 0) status = 'no_ok_calls';
  else if (n < INDICATIVE_BELOW) status = 'indicative';
  else status = 'measured';
  return {
    route,
    status,
    calls: rows.length,
    n,
    errors,
    truncated,
    p50: n > 0 ? percentile(okLatencies, 50) : null,
    p95: n > 0 ? percentile(okLatencies, 95) : null,
    p99: n > 0 ? percentile(okLatencies, 99) : null,
    indicative: n < INDICATIVE_BELOW,
    tokens: sums,
    costMicroUsd: priceOf(sums),
  };
}

/** Stats per route, keyed by route name (only routes that appear in the rows). */
export function routeReport(rows) {
  const byRoute = new Map();
  for (const r of rows) {
    if (!byRoute.has(r.route)) byRoute.set(r.route, []);
    byRoute.get(r.route).push(r);
  }
  const out = {};
  for (const [route, list] of byRoute) out[route] = statsFor(route, list);
  return out;
}

/**
 * One entry per known route in LLM_ROUTE_NAMES order (a route with no rows is not_run), then any
 * unknown route names, sorted alphabetically. The row order never matters.
 */
export function routeTable(rows) {
  const report = routeReport(rows);
  const known = new Set(LLM_ROUTE_NAMES);
  const extra = Object.keys(report)
    .filter((name) => !known.has(name))
    .sort();
  return [...LLM_ROUTE_NAMES, ...extra].map((route) => report[route] ?? statsFor(route, []));
}

/**
 * Per required domain: ok when it has at least one ok call, otherwise not_run. The verdict passes
 * only when every required domain ran (and at least one domain is required): zero latency is never a pass.
 */
export function domainCoverage(rows, requiredRoutes) {
  const required = [...new Set(requiredRoutes)];
  const domains = required.map((route) => {
    const okCalls = rows.filter((r) => r.route === route && r.outcome === 'ok').length;
    const calls = rows.filter((r) => r.route === route).length;
    return { route, status: okCalls > 0 ? 'ok' : 'not_run', okCalls, calls };
  });
  return { pass: domains.length > 0 && domains.every((d) => d.status === 'ok'), domains };
}

// ---------------------------------------------------------------------------
// Token totals and Console reconciliation
// ---------------------------------------------------------------------------

/**
 * Four token sums (BigInt) over every row given (ok rows, billed failures and stale rows all carry
 * real usage), their total, and the recomputed price. The stored cost column is never the comparison
 * figure: a timeout row stores its reservation as a stand-in.
 */
export function tokenTotals(rows) {
  const sums = zeroSums();
  for (const r of rows) addTokens(sums, r);
  const total = sums.input + sums.output + sums.cacheWrite + sums.cacheRead;
  return { ...sums, total, recomputedCostMicroUsd: priceOf(sums) };
}

function absBig(n) {
  return n < 0n ? -n : n;
}

/** Basis points of the difference over the Console figure, by integer math, formatted as "2.00%". */
function percentText(diff, consoleValue) {
  if (consoleValue === 0n) return diff === 0n ? '0.00%' : 'n/a';
  const bp = (absBig(diff) * 10000n) / consoleValue; // floored hundredths of a percent
  return (bp / 100n).toString() + '.' + (bp % 100n).toString().padStart(2, '0') + '%';
}

function judge(label, logValue, consoleValue, allowFloor) {
  const diff = logValue - consoleValue;
  const useFloor = allowFloor && consoleValue > 0n && consoleValue < RECONCILE_SMALL_CATEGORY_TOKENS;
  const pass = useFloor
    ? absBig(diff) <= RECONCILE_ABSOLUTE_FLOOR_TOKENS
    : absBig(diff) * 100n <= consoleValue * RECONCILE_PERCENT;
  return {
    category: label,
    log: logValue,
    console: consoleValue,
    diff,
    percent: percentText(diff, consoleValue),
    rule: useFloor ? 'absolute_floor_' + RECONCILE_ABSOLUTE_FLOOR_TOKENS.toString() + '_tokens' : 'percent_' + RECONCILE_PERCENT.toString(),
    pass,
  };
}

/**
 * Parse Console totals as non-negative integers (numbers, BigInt or digit-only strings). Anything
 * else is refused before any comparison. Returns BigInt values for the four categories.
 */
export function parseConsoleTotals(input) {
  if (!input || typeof input !== 'object') throw new RangeError('console totals: expected an object');
  const out = {};
  for (const cat of TOKEN_CATEGORIES) {
    const v = input[cat];
    if (typeof v === 'bigint' && v >= 0n) out[cat] = v;
    else if (typeof v === 'number' && Number.isSafeInteger(v) && v >= 0) out[cat] = BigInt(v);
    else if (typeof v === 'string' && /^\d+$/.test(v)) out[cat] = BigInt(v);
    else throw new RangeError('console totals: ' + cat + ' must be a non-negative integer');
  }
  return out;
}

/**
 * Compare the log totals with the Console totals. Each of the four categories is judged: within 2%
 * (abs(log - console) * 100 <= console * 2), or, for a category with 1 to 1999 Console tokens, within
 * an absolute 50 tokens. Console 0 passes only when the log is 0. The sum is judged on the strict 2% only.
 */
export function reconcile(logTotals, consoleTotals) {
  const categories = TOKEN_CATEGORIES.map((cat) => judge(cat, BigInt(logTotals[cat]), BigInt(consoleTotals[cat]), true));
  const sumLog = TOKEN_CATEGORIES.reduce((acc, cat) => acc + BigInt(logTotals[cat]), 0n);
  const sumConsole = TOKEN_CATEGORIES.reduce((acc, cat) => acc + BigInt(consoleTotals[cat]), 0n);
  const sum = judge('sum', sumLog, sumConsole, false);
  return { pass: categories.every((c) => c.pass) && sum.pass, categories, sum };
}

/**
 * The reconciliation record: status passed, failed, deferred or invalid, with both numbers per
 * category and the window. A missing Console input is deferred (never passed); malformed Console
 * input or an unusable window is invalid (never passed).
 */
export function reconciliationRecord(logTotals, consoleTotals, window) {
  const windowRecord = windowText(window);
  if (consoleTotals === null || consoleTotals === undefined) {
    return { status: 'deferred', reason: 'console totals not supplied', window: windowRecord };
  }
  if (!windowRecord.valid) {
    return { status: 'invalid', reason: 'window start and end must be finite numbers with start <= end', window: windowRecord };
  }
  let parsed;
  try {
    parsed = parseConsoleTotals(consoleTotals);
  } catch (e) {
    return { status: 'invalid', reason: e.message, window: windowRecord };
  }
  const result = reconcile(logTotals, parsed);
  return { status: result.pass ? 'passed' : 'failed', window: windowRecord, categories: result.categories, sum: result.sum };
}

function windowText(window) {
  const startMs = window?.startMs;
  const endMs = window?.endMs;
  const valid = [startMs, endMs].every((n) => typeof n === 'number' && Number.isFinite(n)) && startMs <= endMs;
  return {
    valid,
    inclusive: true,
    startMs: valid ? startMs : (startMs ?? null),
    endMs: valid ? endMs : (endMs ?? null),
    startIso: valid ? new Date(startMs).toISOString() : null,
    endIso: valid ? new Date(endMs).toISOString() : null,
  };
}

// ---------------------------------------------------------------------------
// Streaming verdict
// ---------------------------------------------------------------------------

/**
 * The streaming decision over ok NPC-chat call latencies (llm_call_log.latency_ms): fewer than 20
 * samples is needs_more_samples; a p95 over 6000 ms makes streaming a next-milestone candidate;
 * anything at or under 6000 ms leaves the out-of-scope decision standing.
 */
export function streamingVerdict(rows) {
  const samples = rows.filter((r) => r.route === STREAMING_ROUTE && r.outcome === 'ok').map((r) => Number(r.latency_ms));
  const n = samples.length;
  const base = {
    metric: 'call_latency_ms',
    route: STREAMING_ROUTE,
    n,
    p50: n > 0 ? percentile(samples, 50) : null,
    p95: n > 0 ? percentile(samples, 95) : null,
    p99: n > 0 ? percentile(samples, 99) : null,
    limitMs: STREAMING_P95_LIMIT_MS,
    minSamples: STREAMING_MIN_SAMPLES,
  };
  if (n < STREAMING_MIN_SAMPLES) return { ...base, verdict: 'needs_more_samples' };
  return { ...base, verdict: base.p95 > STREAMING_P95_LIMIT_MS ? 'next_milestone_candidate' : 'out_of_scope_stands' };
}

// ---------------------------------------------------------------------------
// Fetching the rows (local server only)
// ---------------------------------------------------------------------------

function assertLocalBase(httpBase) {
  let url;
  try {
    url = new URL(String(httpBase));
  } catch {
    throw new Error('call log fetch refused: base URL is not valid');
  }
  if (url.protocol !== 'http:' || url.hostname !== '127.0.0.1') {
    throw new Error('call log fetch refused: only the local server (http://127.0.0.1) is allowed');
  }
}

/**
 * Read the call-log rows from the owner-authenticated HTTP SQL endpoint of target.db. The base URL is
 * checked local before any request; the database must be allowlisted. Errors are scrubbed.
 * `fetchImpl` is a test hook.
 */
export async function fetchCallLogRows(target, token, fetchImpl = fetch) {
  assertLocalBase(target.httpBase);
  const db = resolveLiveDb(target.db);
  const needles = [token];
  let res;
  try {
    res = await fetchImpl(`${target.httpBase}/v1/database/${db}/sql`, {
      method: 'POST',
      headers: { authorization: `Bearer ${token}`, 'content-type': 'text/plain' },
      body: callLogSql(),
    });
  } catch (e) {
    throw new Error('call log fetch failed: ' + scrub(e && e.message ? e.message : String(e), needles));
  }
  let text = '';
  try {
    text = await res.text();
  } catch {
    text = '';
  }
  if (res.status < 200 || res.status >= 300) {
    throw new Error('call log fetch failed: HTTP ' + res.status + ' ' + scrub(text, needles).slice(0, 200));
  }
  try {
    return mapSqlResult(JSON.parse(text));
  } catch (e) {
    throw new Error('call log response unreadable: ' + scrub(e && e.message ? e.message : String(e), needles));
  }
}

// ---------------------------------------------------------------------------
// Report assembly and JSON output
// ---------------------------------------------------------------------------

/** Copy a value with every BigInt turned into a decimal string, so JSON.stringify accepts it. */
export function toJsonSafe(value) {
  if (typeof value === 'bigint') return value.toString();
  if (Array.isArray(value)) return value.map(toJsonSafe);
  if (value && typeof value === 'object') {
    const out = {};
    for (const [k, v] of Object.entries(value)) out[k] = toJsonSafe(v);
    return out;
  }
  return value;
}

/**
 * Everything the report records for one run: the per-route table, token totals, coverage of the
 * required domains, the Console reconciliation and the streaming verdict. `rows` must already be
 * filtered to the run's job ids.
 */
export function buildReport({ rows, requiredRoutes, window, consoleTotals }) {
  const totals = tokenTotals(rows);
  return {
    rowCount: rows.length,
    window: windowText(window),
    routes: routeTable(rows),
    totals,
    coverage: domainCoverage(rows, requiredRoutes),
    reconciliation: reconciliationRecord(totals, consoleTotals ?? null, window),
    streaming: streamingVerdict(rows),
  };
}

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------

function argValue(argv, flag) {
  const i = argv.indexOf(flag);
  return i === -1 ? undefined : argv[i + 1];
}

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

function collectJobIds(jobIds) {
  if (Array.isArray(jobIds)) return jobIds;
  if (jobIds && typeof jobIds === 'object') return Object.values(jobIds).flat();
  return [];
}

export async function main(argv = process.argv.slice(2), deps = {}) {
  const print = deps.print ?? ((line) => console.log(line));
  const token = deps.token ?? getCliToken();
  const needles = [token ?? ''];
  const out = (line) => print(scrub(line, needles));
  try {
    if (!argv.includes('--db')) throw new Error('--db is required (' + LIVE_DBS.join(' or ') + ', local only)');
    const target = resolveTarget(argv);
    const resultsFile = argValue(argv, '--results');
    if (!resultsFile) throw new Error('--results <file> is required');
    if (!token) throw new Error('spacetime login token: not found (run: spacetime login)');
    const results = readJson(resultsFile);
    const consoleFile = argValue(argv, '--reconcile');
    const consoleTotals = consoleFile ? readJson(consoleFile) : null;

    const all = await (deps.fetchRows ?? ((t, k) => fetchCallLogRows(t, k)))(target, token);
    const rows = filterByJobIds(all, collectJobIds(results.jobIds));
    const requiredRoutes =
      Array.isArray(results.requiredRoutes) ? results.requiredRoutes : results.jobIds && !Array.isArray(results.jobIds) ? Object.keys(results.jobIds) : [];
    const report = buildReport({ rows, requiredRoutes, window: results.window, consoleTotals });

    fs.writeFileSync(resultsFile, JSON.stringify({ ...results, report: toJsonSafe(report) }, null, 2) + '\n');

    out('call log report: ' + report.rowCount + ' rows for ' + collectJobIds(results.jobIds).length + ' jobs (db ' + target.db + ')');
    for (const r of report.routes) {
      out(r.route + ': ' + r.status + ', n ' + r.n + ', p50 ' + r.p50 + ', p95 ' + r.p95 + ', p99 ' + r.p99 + ', errors ' + r.errors);
    }
    out('tokens: input ' + report.totals.input + ', output ' + report.totals.output + ', cache write ' + report.totals.cacheWrite + ', cache read ' + report.totals.cacheRead);
    out('coverage: ' + (report.coverage.pass ? 'all required domains ran' : 'NOT RUN: ' + report.coverage.domains.filter((d) => d.status !== 'ok').map((d) => d.route).join(', ')));
    out('reconciliation: ' + report.reconciliation.status);
    out('streaming: ' + report.streaming.verdict + ' (n ' + report.streaming.n + ', p95 ' + report.streaming.p95 + ')');
    return 0;
  } catch (e) {
    out('call log report failed: ' + (e && e.message ? e.message : String(e)));
    return 1;
  }
}

const isEntry = process.argv[1] && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url;
if (isEntry) process.exit(await main());
