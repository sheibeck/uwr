// Run from the repo root: pnpm exec vitest run --maxWorkers=1 scripts/llm/call_log_report.test.mjs
// All sample data is synthetic; nothing here touches a server, a key or a database.

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

import { LLM_ROUTE_NAMES } from '../../spacetimedb/src/data/llm_routes.ts';
import { estimateCostMicroUsd, percentile } from '../../spacetimedb/src/helpers/measurement.ts';
import { TARGETS, resolveTarget } from './cli.mjs';
import {
  CALL_LOG_COLUMNS,
  buildReport,
  callLogSql,
  domainCoverage,
  fetchCallLogRows,
  filterByJobIds,
  inWindow,
  main,
  mapSqlResult,
  parseConsoleTotals,
  reconcile,
  reconciliationRecord,
  routeReport,
  routeTable,
  streamingVerdict,
  toJsonSafe,
  tokenTotals,
} from './call_log_report.mjs';

const FAKE_TOKEN = ['eyJhbGciOiJFUzI1NiJ9', 'eyJzdWIiOiJ0ZXN0LXVzZXIifQ', 'c2lnbmF0dXJlLXBhcnQtdGVzdA'].join('.');

let nextJob = 1n;
function row(route, latency, extra = {}) {
  return {
    route,
    outcome: 'ok',
    latency_ms: BigInt(latency),
    input_tokens: 0n,
    output_tokens: 0n,
    cache_write_tokens: 0n,
    cache_read_tokens: 0n,
    cost_micro_usd: 0n,
    dispatch_late_ms: 0n,
    job_id: nextJob++,
    attempt: 1n,
    http_status: 200n,
    ...extra,
  };
}

function seq1to20(route) {
  return Array.from({ length: 20 }, (_, i) => row(route, i + 1));
}

function shuffled(list) {
  const out = [...list];
  let seed = 7;
  for (let i = out.length - 1; i > 0; i--) {
    seed = (seed * 1103515245 + 12345) & 0x7fffffff;
    const j = seed % (i + 1);
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

describe('Test 1: nearest-rank percentiles', () => {
  it('p50 10, p95 19, p99 20 over 1 to 20 in any order, and identical on a shuffle', () => {
    const rows = seq1to20('npc_conversation');
    const a = routeReport(rows).npc_conversation;
    const b = routeReport(shuffled(rows)).npc_conversation;
    expect([a.p50, a.p95, a.p99]).toEqual([10, 19, 20]);
    expect(toJsonSafe(b)).toEqual(toJsonSafe(a));
    expect(a.indicative).toBe(false);
    expect(a.status).toBe('measured');
  });

  it('uses the same rule as the server percentile helper', () => {
    const samples = [5, 1, 9, 3, 7, 2, 8];
    const rows = samples.map((s) => row('skill_gen', s));
    const r = routeReport(rows).skill_gen;
    expect(r.p50).toBe(percentile(samples, 50));
    expect(r.p95).toBe(percentile(samples, 95));
    expect(r.p99).toBe(percentile(samples, 99));
  });

  it('marks a route with fewer than 20 ok samples as indicative', () => {
    const rows = seq1to20('world_gen').slice(0, 19);
    const r = routeReport(rows).world_gen;
    expect(r.indicative).toBe(true);
    expect(r.status).toBe('indicative');
  });

  it('counts only ok rows toward latency; errors and truncated are counted apart', () => {
    const rows = [row('skill_gen', 100), row('skill_gen', 9999, { outcome: 'timeout' }), row('skill_gen', 8888, { outcome: 'truncated' })];
    const r = routeReport(rows).skill_gen;
    expect(r.n).toBe(1);
    expect(r.p95).toBe(100);
    expect(r.errors).toBe(2);
    expect(r.truncated).toBe(1);
    expect(r.calls).toBe(3);
  });
});

describe('Test 2: route ordering', () => {
  it('lists every known route in LLM_ROUTE_NAMES order, zero-sample routes as not_run, unknown routes last', () => {
    const rows = [row('zeta_unknown', 5), row('skill_gen', 5), row('alpha_unknown', 5), row('creation_race', 5)];
    const table = routeTable(rows);
    expect(table.map((t) => t.route)).toEqual([...LLM_ROUTE_NAMES, 'alpha_unknown', 'zeta_unknown']);
    const byRoute = Object.fromEntries(table.map((t) => [t.route, t]));
    expect(byRoute.world_gen.status).toBe('not_run');
    expect(byRoute.world_gen.p95).toBeNull();
    expect(byRoute.skill_gen.n).toBe(1);
  });

  it('a route with only failed calls is reported as no_ok_calls with no latency', () => {
    const t = routeTable([row('skill_gen', 50, { outcome: 'error' })]).find((r) => r.route === 'skill_gen');
    expect(t.status).toBe('no_ok_calls');
    expect(t.p50).toBeNull();
  });

  it('is byte-identical when the same rows arrive in a shuffled order', () => {
    const rows = [...seq1to20('npc_conversation'), ...seq1to20('creation_race'), row('skill_gen', 1, { input_tokens: 40n, output_tokens: 3n })];
    const window = { startMs: 1000, endMs: 2000 };
    const a = JSON.stringify(toJsonSafe(buildReport({ rows, requiredRoutes: ['skill_gen'], window, consoleTotals: null })));
    const b = JSON.stringify(toJsonSafe(buildReport({ rows: shuffled(rows), requiredRoutes: ['skill_gen'], window, consoleTotals: null })));
    expect(b).toBe(a);
  });
});

describe('Test 3: not run and deferred are never passed', () => {
  it('a required domain without an ok call is not_run and the coverage verdict fails', () => {
    const rows = [row('creation_race', 800), row('skill_gen', 50, { outcome: 'error' })];
    const cov = domainCoverage(rows, ['creation_race', 'skill_gen', 'world_gen']);
    expect(cov.pass).toBe(false);
    expect(Object.fromEntries(cov.domains.map((d) => [d.route, d.status]))).toEqual({
      creation_race: 'ok',
      skill_gen: 'not_run',
      world_gen: 'not_run',
    });
  });

  it('passes only when every required domain ran, and never on an empty requirement or empty rows', () => {
    expect(domainCoverage([row('creation_race', 1)], ['creation_race']).pass).toBe(true);
    expect(domainCoverage([row('creation_race', 1)], []).pass).toBe(false);
    expect(domainCoverage([], ['creation_race']).pass).toBe(false);
  });

  it('a missing Console input is deferred, never passed', () => {
    const totals = tokenTotals([row('skill_gen', 1, { input_tokens: 100n })]);
    for (const missing of [null, undefined]) {
      const rec = reconciliationRecord(totals, missing, { startMs: 1, endMs: 2 });
      expect(rec.status).toBe('deferred');
      expect(rec.status).not.toBe('passed');
    }
  });

  it('malformed or negative Console input and a broken window are invalid, never passed', () => {
    const totals = tokenTotals([]);
    const ok = { input: 0, output: 0, cacheWrite: 0, cacheRead: 0 };
    const window = { startMs: 1, endMs: 2 };
    for (const bad of [{ ...ok, input: -1 }, { ...ok, input: 1.5 }, { ...ok, input: '12abc' }, { ...ok, input: '1,234' }, { ...ok, output: NaN }, { input: 1 }, 'text', 7]) {
      expect(reconciliationRecord(totals, bad, window).status).toBe('invalid');
    }
    expect(reconciliationRecord(totals, ok, { startMs: 5, endMs: 1 }).status).toBe('invalid');
    expect(reconciliationRecord(totals, ok, undefined).status).toBe('invalid');
    expect(() => parseConsoleTotals({ ...ok, input: '-5' })).toThrow();
    expect(parseConsoleTotals({ input: '10', output: 2, cacheWrite: 0n, cacheRead: '0' })).toEqual({ input: 10n, output: 2n, cacheWrite: 0n, cacheRead: 0n });
  });
});

describe('Test 4: reconcile with integer math', () => {
  const zero = { input: 0n, output: 0n, cacheWrite: 0n, cacheRead: 0n };
  const big = { input: 100000n, output: 100000n, cacheWrite: 100000n, cacheRead: 100000n };

  it('exactly 2.00% passes and 2.01% fails (percentage rule)', () => {
    const exact = reconcile({ ...big, input: 102000n }, big);
    expect(exact.categories[0].diff).toBe(2000n);
    expect(exact.categories[0].percent).toBe('2.00%');
    expect(exact.categories[0].pass).toBe(true);
    const over = reconcile({ ...big, input: 102001n }, big);
    expect(over.categories[0].pass).toBe(false);
    expect(over.pass).toBe(false);
    const under = reconcile({ ...big, input: 98000n }, big);
    expect(under.categories[0].pass).toBe(true);
    expect(reconcile({ ...big, input: 97999n }, big).categories[0].pass).toBe(false);
  });

  it('console 0 passes only when the log is 0', () => {
    expect(reconcile(zero, zero).pass).toBe(true);
    const r = reconcile({ ...zero, cacheRead: 1n }, zero);
    expect(r.categories[3].pass).toBe(false);
    expect(r.pass).toBe(false);
  });

  it('judges each of the four categories and the sum', () => {
    const r = reconcile(big, big);
    expect(r.categories.map((c) => c.category)).toEqual(['input', 'output', 'cacheWrite', 'cacheRead']);
    expect(r.sum.category).toBe('sum');
    expect(r.pass).toBe(true);
    for (const cat of ['input', 'output', 'cacheWrite', 'cacheRead']) {
      expect(reconcile({ ...big, [cat]: big[cat] + 2001n }, big).pass).toBe(false);
    }
  });

  it('a small Console category uses the absolute 50-token floor and says so; 2000 tokens uses the percentage', () => {
    const smallConsole = { ...big, cacheWrite: 300n };
    const within = reconcile({ ...big, cacheWrite: 350n }, smallConsole);
    expect(within.categories[2].rule).toBe('absolute_floor_50_tokens');
    expect(within.categories[2].pass).toBe(true);
    expect(reconcile({ ...big, cacheWrite: 351n }, smallConsole).categories[2].pass).toBe(false);
    const edge = reconcile({ ...big, cacheWrite: 2041n }, { ...big, cacheWrite: 2000n });
    expect(edge.categories[2].rule).toBe('percent_2');
    expect(edge.categories[2].pass).toBe(false);
    expect(reconcile({ ...big, cacheWrite: 2040n }, { ...big, cacheWrite: 2000n }).categories[2].pass).toBe(true);
    expect(reconcile({ ...big, cacheWrite: 1999n }, { ...big, cacheWrite: 1999n }).categories[2].rule).toBe('absolute_floor_50_tokens');
  });

  it('the sum is judged on the strict 2% only, with no floor', () => {
    const smallConsole = { input: 300n, output: 300n, cacheWrite: 300n, cacheRead: 300n };
    const log = { input: 340n, output: 340n, cacheWrite: 340n, cacheRead: 340n };
    const r = reconcile(log, smallConsole);
    expect(r.categories.every((c) => c.pass)).toBe(true);
    expect(r.sum.rule).toBe('percent_2');
    expect(r.sum.pass).toBe(false);
    expect(r.pass).toBe(false);
  });

  it('math stays exact beyond float precision', () => {
    const huge = 9007199254740993n * 10n;
    const c = { input: huge, output: 0n, cacheWrite: 0n, cacheRead: 0n };
    const exactEdge = { ...c, input: huge + huge / 50n };
    expect(reconcile(exactEdge, c).categories[0].pass).toBe(true);
    expect(reconcile({ ...c, input: huge + huge / 50n + 1n }, c).categories[0].pass).toBe(false);
  });

  it('the record carries both numbers per category, the window, and a passed or failed status', () => {
    const totals = { ...big, total: 400000n };
    const win = { startMs: 1_700_000_000_000, endMs: 1_700_000_600_000 };
    const passed = reconciliationRecord(totals, { input: 100000, output: '100000', cacheWrite: 100000, cacheRead: 100000 }, win);
    expect(passed.status).toBe('passed');
    expect(passed.categories[0]).toMatchObject({ log: 100000n, console: 100000n });
    expect(passed.window).toMatchObject({ startMs: win.startMs, endMs: win.endMs, inclusive: true });
    const failed = reconciliationRecord(totals, { input: 50000, output: 100000, cacheWrite: 100000, cacheRead: 100000 }, win);
    expect(failed.status).toBe('failed');
  });

  it('token totals sum all four categories over every row and price them with the server helper', () => {
    const rows = [
      row('skill_gen', 1, { input_tokens: 10n, output_tokens: 20n, cache_write_tokens: 30n, cache_read_tokens: 40n }),
      row('skill_gen', 1, { outcome: 'refusal', input_tokens: 1n, output_tokens: 2n, cache_write_tokens: 3n, cache_read_tokens: 4n, cost_micro_usd: 99999n }),
    ];
    const t = tokenTotals(rows);
    expect([t.input, t.output, t.cacheWrite, t.cacheRead, t.total]).toEqual([11n, 22n, 33n, 44n, 110n]);
    expect(t.recomputedCostMicroUsd).toBe(estimateCostMicroUsd({ input: 11, output: 22, cacheWrite: 33, cacheRead: 44 }));
  });
});

describe('Test 5: window', () => {
  it('is inclusive at both ends', () => {
    expect(inWindow(100, 100, 200)).toBe(true);
    expect(inWindow(200, 100, 200)).toBe(true);
    expect(inWindow(99, 100, 200)).toBe(false);
    expect(inWindow(201, 100, 200)).toBe(false);
    expect(inWindow(NaN, 100, 200)).toBe(false);
  });

  it('the report records the window start and end it used', () => {
    const rep = buildReport({ rows: [], requiredRoutes: [], window: { startMs: 1_700_000_000_000, endMs: 1_700_000_100_000 }, consoleTotals: null });
    expect(rep.window).toMatchObject({ startMs: 1_700_000_000_000, endMs: 1_700_000_100_000, inclusive: true, valid: true });
    expect(rep.window.startIso).toBe(new Date(1_700_000_000_000).toISOString());
  });

  it('job-id filtering isolates a run (numbers, strings and BigInt all match)', () => {
    const rows = [row('skill_gen', 1, { job_id: 5n }), row('skill_gen', 2, { job_id: 6n }), row('skill_gen', 3, { job_id: 7n })];
    expect(filterByJobIds(rows, [5, '7']).map((r) => r.job_id)).toEqual([5n, 7n]);
    expect(filterByJobIds(rows, [])).toEqual([]);
  });
});

describe('Test 6: mapSqlResult', () => {
  const values = {
    route: 'npc_conversation',
    outcome: 'ok',
    latency_ms: 3500,
    input_tokens: 120,
    output_tokens: 40,
    cache_write_tokens: 0,
    cache_read_tokens: '2200',
    cost_micro_usd: 900,
    dispatch_late_ms: 3,
    job_id: 42,
    attempt: 1,
    http_status: 200,
  };

  it('maps the documented array-row shape and the object-row shape to identical rows', () => {
    const shape = (name) => ({ some: name });
    const arrayShape = [
      {
        schema: { elements: CALL_LOG_COLUMNS.map((c) => ({ name: shape(c), algebraic_type: {} })) },
        rows: [CALL_LOG_COLUMNS.map((c) => values[c])],
      },
    ];
    const objectShape = [{ schema: { elements: [] }, rows: [{ ...values }] }];
    const a = mapSqlResult(arrayShape);
    const b = mapSqlResult(objectShape);
    expect(a).toEqual(b);
    expect(a[0].latency_ms).toBe(3500n);
    expect(a[0].cache_read_tokens).toBe(2200n);
    expect(a[0].route).toBe('npc_conversation');
  });

  it('maps by schema name and not by position, with plain-string names and Option-wrapped values', () => {
    const reversed = [...CALL_LOG_COLUMNS].reverse();
    const json = [
      {
        schema: { elements: reversed.map((c) => ({ name: c })) },
        rows: [reversed.map((c) => (c === 'latency_ms' ? { 0: 777 } : values[c]))],
      },
    ];
    const r = mapSqlResult(json)[0];
    expect(r.latency_ms).toBe(777n);
    expect(r.route).toBe('npc_conversation');
    expect(r.job_id).toBe(42n);
  });

  it('accepts a bare result object and no rows, and refuses a missing column or a non-integer', () => {
    expect(mapSqlResult({ schema: { elements: [] }, rows: [] })).toEqual([]);
    const { latency_ms, ...rest } = values;
    expect(() => mapSqlResult([{ schema: { elements: [] }, rows: [rest] }])).toThrow(/latency_ms/);
    expect(() => mapSqlResult([{ schema: { elements: [] }, rows: [{ ...values, latency_ms: -1 }] }])).toThrow();
    expect(() => mapSqlResult([{ schema: { elements: [] }, rows: [{ ...values, latency_ms: 'soon' }] }])).toThrow();
    expect(() => mapSqlResult(null)).toThrow();
  });
});

describe('Test 7: SQL text and the local-only fetch', () => {
  it('names its columns, reads llm_call_log only and never llm_config', () => {
    const sql = callLogSql();
    expect(sql).toBe('SELECT ' + CALL_LOG_COLUMNS.join(', ') + ' FROM llm_call_log');
    expect(sql).not.toContain('*');
    expect(sql).not.toContain('llm_config');
    expect(sql.match(/llm_[a-z_]+/g)).toEqual(['llm_call_log']);
    const src = fs.readFileSync(new URL('./call_log_report.mjs', import.meta.url), 'utf8');
    expect(src.match(/FROM\s+\w+/g)).toEqual(['FROM llm_call_log']);
  });

  it('refuses a base URL that is not the local server, before any request', async () => {
    let called = false;
    const fetchImpl = async () => {
      called = true;
      return { status: 200, text: async () => '[]' };
    };
    for (const httpBase of [TARGETS.maincloud.httpBase, 'http://127.0.0.1.evil.example', 'https://127.0.0.1:3000', 'http://localhost:3000', 'http://10.0.0.1:3000', 'nonsense']) {
      await expect(fetchCallLogRows({ ...TARGETS.local, httpBase }, FAKE_TOKEN, fetchImpl)).rejects.toThrow(/refused/);
    }
    expect(called).toBe(false);
  });

  it('refuses a database outside the allowlist', async () => {
    await expect(fetchCallLogRows({ ...TARGETS.local, db: 'prod' }, FAKE_TOKEN, async () => ({ status: 200, text: async () => '[]' }))).rejects.toThrow();
  });

  it('posts the SQL to the scratch database with the bearer token and maps the answer', async () => {
    const seen = {};
    const fetchImpl = async (url, init) => {
      Object.assign(seen, { url, init });
      return { status: 200, text: async () => JSON.stringify([{ schema: { elements: [] }, rows: [] }]) };
    };
    const rows = await fetchCallLogRows(resolveTarget(['--db', 'uwr-verify']), FAKE_TOKEN, fetchImpl);
    expect(rows).toEqual([]);
    expect(seen.url).toBe('http://127.0.0.1:3000/v1/database/uwr-verify/sql');
    expect(seen.init.method).toBe('POST');
    expect(seen.init.body).toBe(callLogSql());
    expect(seen.init.headers.authorization).toBe('Bearer ' + FAKE_TOKEN);
  });

  it('scrubs the token out of every error it raises', async () => {
    const target = resolveTarget(['--db', 'uwr-verify']);
    const denied = fetchCallLogRows(target, FAKE_TOKEN, async () => ({ status: 401, text: async () => 'denied ' + FAKE_TOKEN }));
    await expect(denied).rejects.toThrow(/HTTP 401/);
    await denied.catch((e) => expect(e.message).not.toContain(FAKE_TOKEN));
    const thrown = fetchCallLogRows(target, FAKE_TOKEN, async () => {
      throw new Error('socket closed for ' + FAKE_TOKEN);
    });
    await thrown.catch((e) => expect(e.message).not.toContain(FAKE_TOKEN));
    const garbled = fetchCallLogRows(target, FAKE_TOKEN, async () => ({ status: 200, text: async () => 'not json ' + FAKE_TOKEN }));
    await garbled.catch((e) => expect(e.message).not.toContain(FAKE_TOKEN));
  });
});

describe('Test 8: streamingVerdict', () => {
  const npc = (latencies) => latencies.map((l) => row('npc_conversation', l));

  it('fewer than 20 ok samples is needs_more_samples', () => {
    const v = streamingVerdict(npc(Array.from({ length: 19 }, () => 9000)));
    expect(v.verdict).toBe('needs_more_samples');
    expect(v.n).toBe(19);
    expect(streamingVerdict([]).verdict).toBe('needs_more_samples');
    expect(streamingVerdict([]).p95).toBeNull();
  });

  it('a p95 of exactly 6000 leaves the decision standing; 6001 makes streaming a candidate', () => {
    const at = streamingVerdict(npc([...Array.from({ length: 19 }, () => 1000), 6000]));
    expect(at.p95).toBe(1000); // nearest rank: ceil(0.95 * 20) = 19th of 20
    const edgeAt = streamingVerdict(npc([...Array.from({ length: 18 }, () => 1000), 6000, 6000]));
    expect(edgeAt.p95).toBe(6000);
    expect(edgeAt.verdict).toBe('out_of_scope_stands');
    const edgeOver = streamingVerdict(npc([...Array.from({ length: 18 }, () => 1000), 6001, 6001]));
    expect(edgeOver.p95).toBe(6001);
    expect(edgeOver.verdict).toBe('next_milestone_candidate');
  });

  it('carries n, p50, p95, p99 and the metric, and counts ok NPC-chat rows only', () => {
    const rows = [...npc(Array.from({ length: 20 }, (_, i) => (i + 1) * 100)), row('npc_conversation', 99999, { outcome: 'timeout' }), row('skill_gen', 99999)];
    const v = streamingVerdict(rows);
    expect(v).toMatchObject({ n: 20, p50: 1000, p95: 1900, p99: 2000, metric: 'call_latency_ms', verdict: 'out_of_scope_stands' });
  });
});

describe('CLI main (offline, injected rows)', () => {
  it('writes the report under the report key, prints only counts, and never passes a deferred reconciliation', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'uwr-report-'));
    try {
      const file = path.join(dir, 'results.json');
      const rows = [row('creation_race', 800, { job_id: 1n, input_tokens: 5n }), row('skill_gen', 600, { job_id: 2n }), row('skill_gen', 700, { job_id: 99n })];
      fs.writeFileSync(file, JSON.stringify({ jobIds: { creation_race: [1], skill_gen: [2], world_gen: [] }, window: { startMs: 10, endMs: 20 } }));
      const printed = [];
      const code = await main(['--db', 'uwr-verify', '--results', file], { token: FAKE_TOKEN, print: (l) => printed.push(l), fetchRows: async () => rows });
      expect(code).toBe(0);
      const written = JSON.parse(fs.readFileSync(file, 'utf8'));
      expect(written.jobIds).toBeDefined();
      expect(written.report.rowCount).toBe(2);
      expect(written.report.reconciliation.status).toBe('deferred');
      expect(written.report.coverage.pass).toBe(false);
      expect(written.report.coverage.domains.find((d) => d.route === 'world_gen').status).toBe('not_run');
      expect(written.report.routes.map((r) => r.route).slice(0, 3)).toEqual(['creation_race', 'creation_class_reveal', 'creation_class']);
      expect(printed.join('\n')).toContain('NOT RUN: world_gen');
      expect(printed.join('\n')).not.toContain(FAKE_TOKEN);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it('refuses without --db, with a non-allowlisted --db and with the hosted target', async () => {
    const printed = [];
    const deps = { token: FAKE_TOKEN, print: (l) => printed.push(l), fetchRows: async () => [] };
    expect(await main(['--results', 'x.json'], deps)).toBe(1);
    expect(await main(['--db', 'prod', '--results', 'x.json'], deps)).toBe(1);
    expect(await main(['--db', 'uwr-verify', '--target', 'maincloud', '--confirm-maincloud', '--results', 'x.json'], deps)).toBe(1);
  });
});

describe('static safety', () => {
  const src = fs.readFileSync(new URL('./call_log_report.mjs', import.meta.url), 'utf8');

  it('imports the server helpers and route names rather than reimplementing them', () => {
    expect(src).toContain('spacetimedb/src/helpers/measurement.ts');
    expect(src).toContain('spacetimedb/src/data/llm_routes.ts');
    expect(src).not.toMatch(/function percentile|function estimateCostMicroUsd/);
  });

  it('never reads llm_config, the key file, process.env keys or spawns anything', () => {
    expect(src).not.toMatch(/FROM\s+llm_config/);
    expect(src).not.toContain('ENV_LOCAL');
    expect(src).not.toContain('loadAnthropicKey');
    expect(src).not.toMatch(/spawn|exec\(|execSync|child_process/);
  });
});
