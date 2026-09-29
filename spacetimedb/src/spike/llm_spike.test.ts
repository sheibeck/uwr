import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { readFileSync } from 'node:fs';

// The real server module cannot load in plain Node; stub only what llm_spike/spike_tables touch.
vi.mock('spacetimedb/server', () => {
  const chain = (): any => new Proxy(function () {}, { get: () => chain(), apply: () => chain() });
  return {
    SenderError: class SenderError extends Error {
      constructor(msg: string) {
        super(msg);
      }
    },
    t: chain(),
    table: () => ({ rowType: {} }),
  };
});
vi.mock('spacetimedb', () => ({
  ScheduleAt: { time: (m: bigint) => ({ tag: 'Time', value: { microsSinceUnixEpoch: m } }) },
  TimeDuration: { fromMillis: (ms: number) => ({ __ms: ms }) },
}));

import { createMockDb } from '../helpers/test-utils';
import { COMBAT_LOOP_INTERVAL_MICROS } from '../data/combat_constants';
import { buildRequest, type SpikeSpec } from './spike_bodies';
import { reserveCostMicroUsd } from '../helpers/measurement';
import { CLI_IDENTITY, SPEND_CAP_MICRO_USD, SPIKE_BUILD_TAG, registerSpike, runSpec } from './llm_spike';

// Assembled at runtime; no key-shaped literal in this file.
const FAKE_KEY = ['sk', '-ant-', 'api03-', 'Q'.repeat(32)].join('');
const BASE = 1_800_000_000_000_000n;

function stateRow(over: Record<string, any> = {}) {
  return {
    id: 1n,
    phase: 'idle',
    probeOn: false,
    lastTickUs: 0n,
    inFlight: 0,
    calls: 0n,
    estCostMicroUsd: 0n,
    reservedMicroUsd: 0n,
    pings: 0n,
    ...over,
  };
}

interface FetchInit {
  method?: string;
  headers?: Record<string, string>;
  body?: string;
  timeout?: any;
}
type FetchImpl = (url: string, init: FetchInit) => any;

function okMessages(text = 'pong', usage: any = { input_tokens: 20, output_tokens: 4 }) {
  return {
    status: 200,
    headers: {
      forEach: (cb: (v: string, k: string) => void) => {
        cb('x', 'request-id');
        cb('x', 'content-type');
      },
      get: (n: string) => (n === 'request-id' ? 'req_1' : null),
    },
    text: () =>
      JSON.stringify({
        content: [{ type: 'text', text }],
        stop_reason: 'end_turn',
        usage,
      }),
  };
}

function makeCtx(opts: { state?: any; fetchImpl?: FetchImpl; seed?: Record<string, any[]>; sender?: string } = {}) {
  const db: any = createMockDb({
    spike_state: opts.state === null ? [] : [opts.state ?? stateRow()],
    llm_config: [{ id: 1n, apiKey: FAKE_KEY, updatedAt: { microsSinceUnixEpoch: 0n } }],
    ...(opts.seed ?? {}),
  });
  let inTx = false;
  let txCount = 0;
  const fetchCalls: { url: string; init: FetchInit }[] = [];
  const ctx: any = {
    sender: { toHexString: () => opts.sender ?? 'aa11' },
    databaseIdentity: { toHexString: () => 'bb22' },
    connectionId: null,
    timestamp: { microsSinceUnixEpoch: BASE },
    db,
    http: {
      fetch: (url: string, init: FetchInit) => {
        if (inTx) throw new Error('FETCH INSIDE withTx');
        fetchCalls.push({ url, init });
        return (opts.fetchImpl ?? (() => okMessages()))(url, init);
      },
    },
    withTx: (body: (tx: any) => any) => {
      inTx = true;
      txCount++;
      try {
        return body({ db, timestamp: { microsSinceUnixEpoch: BASE + BigInt(txCount) * 1000n } });
      } finally {
        inTx = false;
      }
    },
  };
  return { ctx, db, fetchCalls, txCount: () => txCount };
}

function resultRows(db: any): any[] {
  return db.spike_result._rows();
}
function stateOf(db: any): any {
  return db.spike_state.id.find(1n);
}

let logged: string[] = [];
const spies: any[] = [];
beforeEach(() => {
  logged = [];
  for (const m of ['log', 'info', 'warn', 'error', 'debug'] as const) {
    spies.push(
      vi.spyOn(console, m).mockImplementation((...a: any[]) => {
        logged.push(a.map((x) => (typeof x === 'string' ? x : JSON.stringify(x))).join(' '));
      }),
    );
  }
});
afterEach(() => {
  spies.splice(0).forEach((s) => s.mockRestore());
});

const minimal: SpikeSpec = { kind: 'messages', class: 'reliability', route: 'minimal', effort: 'low' };

describe('runSpec', () => {
  it('runs a messages spec as two transactions around one fetch and leaves state balanced', () => {
    const { ctx, db, fetchCalls, txCount } = makeCtx();
    const out = runSpec(ctx, BASE - 5000n, 'run1', 'rung3', 7, minimal);
    expect(txCount()).toBe(2);
    expect(fetchCalls).toHaveLength(1);
    expect(fetchCalls[0].url).toBe('https://api.anthropic.com/v1/messages');
    expect(fetchCalls[0].init.headers!['x-api-key']).toBe(FAKE_KEY);
    expect(fetchCalls[0].init.timeout).toEqual({ __ms: 60000 });
    const rows = resultRows(db);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ runId: 'run1', rung: 'rung3', seq: 7, ok: true });
    const d = JSON.parse(rows[0].dataJson);
    expect(d.status).toBe(200);
    expect(d.failureClass).toBeNull();
    expect(d.ok).toBe(true);
    expect(d.buildTag).toBe(SPIKE_BUILD_TAG);
    expect(d.usage).toEqual({ input: 20, output: 4, cacheWrite: 0, cacheRead: 0 });
    expect(d.requestIdVisible).toBe(true);
    expect(d.retryAfterVisible).toBe(false);
    expect(d.headerNames).toEqual(['request-id', 'content-type']);
    expect(d.costMicroUsd).toBe(20 * 2 + 4 * 10);
    expect(d.callUs).toBe(1000);
    expect(out).toBe(rows[0].dataJson);
    const st = stateOf(db);
    expect(st.inFlight).toBe(0);
    expect(st.reservedMicroUsd).toBe(0n);
    expect(st.calls).toBe(1n);
    expect(st.estCostMicroUsd).toBe(BigInt(20 * 2 + 4 * 10));
  });

  it('records dispatch lateness and identity facts from server clocks only', () => {
    const { ctx, db } = makeCtx();
    runSpec(ctx, BASE - 5000n, 'r', 'dispatch', 0, { kind: 'noop', class: 'reliability' });
    const d = JSON.parse(resultRows(db)[0].dataJson);
    expect(d.ctxLateUs).toBe(5000);
    expect(d.dispatchLateUs).toBe(6000);
    expect(d.senderHex).toBe('aa11');
    expect(d.isModuleIdentity).toBe(false);
    expect(d.hasConnectionId).toBe(false);
    expect(d.scheduledUs).toBe(Number(BASE - 5000n));
    expect(d.class).toBe('reliability');
    expect(d.kind).toBe('noop');
  });

  it('a direct call has no scheduled time and null lateness', () => {
    const { ctx, db } = makeCtx();
    runSpec(ctx, null, 'direct', 'direct', 0, { kind: 'noop', class: 'reliability' });
    const d = JSON.parse(resultRows(db)[0].dataJson);
    expect(d.scheduledUs).toBeNull();
    expect(d.dispatchLateUs).toBeNull();
    expect(d.ctxLateUs).toBeNull();
  });

  it('noop performs no fetch and does not change inFlight or calls', () => {
    const { ctx, db, fetchCalls } = makeCtx({ state: stateRow({ inFlight: 2 }) });
    runSpec(ctx, BASE, 'r', 'dispatch', 1, { kind: 'noop', class: 'reliability' });
    expect(fetchCalls).toHaveLength(0);
    const st = stateOf(db);
    expect(st.inFlight).toBe(2);
    expect(st.calls).toBe(0n);
    const d = JSON.parse(resultRows(db)[0].dataJson);
    expect(d.ok).toBe(true);
    expect(d.failureClass).toBeNull();
    expect(d.inFlightAtStart).toBe(2);
  });

  it('blocks a call that would pass the spend cap without fetching', () => {
    const { ctx, db, fetchCalls } = makeCtx({ state: stateRow({ estCostMicroUsd: SPEND_CAP_MICRO_USD - 1n }) });
    runSpec(ctx, null, 'r', 'rung3', 0, minimal);
    expect(fetchCalls).toHaveLength(0);
    const rows = resultRows(db);
    expect(rows).toHaveLength(1);
    expect(rows[0].ok).toBe(false);
    const d = JSON.parse(rows[0].dataJson);
    expect(d.capBlocked).toBe(true);
    expect(d.ok).toBe(false);
    expect(d.failureClass).toBe('spend_cap');
    const st = stateOf(db);
    expect(st.inFlight).toBe(0);
    expect(st.reservedMicroUsd).toBe(0n);
    expect(st.calls).toBe(0n);
  });

  it('counts outstanding reservations toward the cap', () => {
    const req = buildRequest(minimal, FAKE_KEY);
    const reservation = BigInt(reserveCostMicroUsd(req.maxTokens, req.requestChars));
    const { ctx, fetchCalls } = makeCtx({
      state: stateRow({ estCostMicroUsd: SPEND_CAP_MICRO_USD - reservation, reservedMicroUsd: 1n }),
    });
    runSpec(ctx, null, 'r', 'rung3', 0, minimal);
    expect(fetchCalls).toHaveLength(0);
  });

  it('allows a call that exactly fits under the cap', () => {
    const req = buildRequest(minimal, FAKE_KEY);
    const reservation = BigInt(reserveCostMicroUsd(req.maxTokens, req.requestChars));
    const { ctx, fetchCalls } = makeCtx({ state: stateRow({ estCostMicroUsd: SPEND_CAP_MICRO_USD - reservation }) });
    runSpec(ctx, null, 'r', 'rung3', 0, minimal);
    expect(fetchCalls).toHaveLength(1);
  });

  it('fails closed when spike_state is missing for a network spec', () => {
    const { ctx, db, fetchCalls } = makeCtx({ state: null });
    runSpec(ctx, null, 'r', 'rung1', 0, { kind: 'public_url', class: 'reliability' });
    expect(fetchCalls).toHaveLength(0);
    expect(JSON.parse(resultRows(db)[0].dataJson).capBlocked).toBe(true);
  });

  it('never leaks the stored key into results or console, even when the server echoes it', () => {
    const { ctx, db } = makeCtx({
      fetchImpl: () => ({
        status: 401,
        headers: { forEach: () => {}, get: () => null },
        text: () =>
          JSON.stringify({ type: 'error', error: { type: 'authentication_error', message: `bad key ${FAKE_KEY}` } }),
      }),
    });
    runSpec(ctx, null, 'r', 'rung3', 0, minimal);
    const row = resultRows(db)[0];
    expect(row.dataJson).not.toContain(FAKE_KEY);
    expect(row.ok).toBe(false);
    const d = JSON.parse(row.dataJson);
    expect(d.anthropicErrorType).toBe('authentication_error');
    expect(d.failureClass).toBe('auth');
    expect(logged.join('\n')).not.toContain(FAKE_KEY);
  });

  it('a public_url spec sends no x-api-key header', () => {
    const { ctx, fetchCalls } = makeCtx({
      fetchImpl: () => ({ status: 200, headers: { forEach: () => {}, get: () => null }, text: () => '<html/>' }),
    });
    runSpec(ctx, null, 'r', 'rung1', 0, { kind: 'public_url', class: 'reliability' });
    expect(fetchCalls[0].url).toBe('https://example.com/');
    expect(fetchCalls[0].init.headers!['x-api-key']).toBeUndefined();
    expect(fetchCalls[0].init.headers!['anthropic-version']).toBeUndefined();
  });

  it('a bad-key drill sends the constant and reserves nothing', () => {
    const { ctx, db, fetchCalls } = makeCtx({
      fetchImpl: () => ({
        status: 401,
        headers: { forEach: () => {}, get: () => null },
        text: () => JSON.stringify({ type: 'error', error: { type: 'authentication_error', message: 'invalid' } }),
      }),
    });
    runSpec(ctx, null, 'r', 'drill', 0, { ...minimal, class: 'drill', keyMode: 'bad' });
    expect(fetchCalls[0].init.headers!['x-api-key']).not.toBe(FAKE_KEY);
    expect(JSON.parse(resultRows(db)[0].dataJson).costMicroUsd).toBe(0);
    expect(stateOf(db).estCostMicroUsd).toBe(0n);
  });

  it('a fetch that throws is a platform failure and settles cost to the reservation', () => {
    const { ctx, db } = makeCtx({
      fetchImpl: () => {
        throw new Error(`timed out talking with ${FAKE_KEY}`);
      },
    });
    runSpec(ctx, null, 'r', 'drill', 0, { ...minimal, class: 'drill', timeoutMs: 50 });
    const row = resultRows(db)[0];
    const d = JSON.parse(row.dataJson);
    expect(d.threw).toBe(true);
    expect(d.failureClass).toBe('platform');
    expect(d.ok).toBe(false);
    expect(d.errorMessage).toContain('timed out');
    expect(d.errorMessage).not.toContain(FAKE_KEY);
    expect(row.dataJson).not.toContain(FAKE_KEY);
    const req = buildRequest(minimal, FAKE_KEY);
    const reservation = reserveCostMicroUsd(req.maxTokens, req.requestChars);
    expect(d.reservedMicroUsd).toBe(reservation);
    expect(d.costMicroUsd).toBe(reservation);
    const st = stateOf(db);
    expect(st.estCostMicroUsd).toBe(BigInt(reservation));
    expect(st.reservedMicroUsd).toBe(0n);
    expect(st.inFlight).toBe(0);
  });
});

function makeSpacetimedb() {
  const procedures: any[][] = [];
  const reducers: any[][] = [];
  const db = {
    procedure: (...a: any[]) => {
      procedures.push(a);
      return { kind: 'procedure' };
    },
    reducer: (...a: any[]) => {
      reducers.push(a);
      return { kind: 'reducer' };
    },
  };
  registerSpike(db);
  const reducer = (name: string) => {
    const call = reducers.find((c) => (typeof c[0] === 'string' ? c[0] : c[0].name) === name);
    if (!call) throw new Error('reducer not registered: ' + name);
    return { opts: call[0], fn: call[call.length - 1] as (ctx: any, args: any) => void };
  };
  const procedure = (name: string) => {
    const call = procedures.find((c) => c[0].name === name);
    if (!call) throw new Error('procedure not registered: ' + name);
    return { opts: call[0], args: call, fn: call[3] as (ctx: any, args: any) => any };
  };
  return { procedures, reducers, reducer, procedure };
}

describe('registerSpike', () => {
  it('registers both procedures in the 4-argument named form', () => {
    const s = makeSpacetimedb();
    expect(s.procedures).toHaveLength(2);
    for (const call of s.procedures) {
      expect(call).toHaveLength(4);
      expect(typeof call[0].name).toBe('string');
    }
    expect(s.procedure('spike_run_job').opts.onSchedule).toBeDefined();
    expect(s.procedure('spike_direct_call').opts.onSchedule).toBeUndefined();
  });

  it('registers the tick probe as a scheduled reducer and every control reducer', () => {
    const s = makeSpacetimedb();
    expect(s.reducer('spike_tick_probe').opts.onSchedule).toBeDefined();
    for (const n of [
      'spike_whoami',
      'spike_set_key',
      'spike_reset',
      'spike_set_phase',
      'spike_ping',
      'spike_echo',
      'spike_enqueue',
    ]) {
      expect(() => s.reducer(n)).not.toThrow();
    }
  });

  it('spike_run_job derives the scheduled time from arg.scheduledAt and returns unit', () => {
    const s = makeSpacetimedb();
    const { ctx, db } = makeCtx();
    const ret = s.procedure('spike_run_job').fn(ctx, {
      arg: {
        scheduledId: 1n,
        scheduledAt: { tag: 'Time', value: { microsSinceUnixEpoch: BASE - 2000n } },
        runId: 'j',
        rung: 'dispatch',
        seq: 3,
        specJson: JSON.stringify({ kind: 'noop', class: 'reliability' }),
      },
    });
    expect(ret).toEqual({});
    const rows = resultRows(db);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ runId: 'j', rung: 'dispatch', seq: 3 });
    expect(JSON.parse(rows[0].dataJson).ctxLateUs).toBe(2000);
  });

  it('spike_run_job records a failed result for an invalid spec instead of trapping', () => {
    const s = makeSpacetimedb();
    const { ctx, db } = makeCtx();
    s.procedure('spike_run_job').fn(ctx, {
      arg: { scheduledId: 1n, scheduledAt: { tag: 'Time', value: { microsSinceUnixEpoch: BASE } }, runId: 'j', rung: 'x', seq: 0, specJson: '{bad' },
    });
    expect(resultRows(db)[0].ok).toBe(false);
  });

  it('spike_direct_call returns the result json', () => {
    const s = makeSpacetimedb();
    const { ctx } = makeCtx();
    const out = s.procedure('spike_direct_call').fn(ctx, {
      specJson: JSON.stringify({ kind: 'noop', class: 'reliability' }),
    });
    expect(JSON.parse(out).kind).toBe('noop');
  });

  it('spike_set_key rejects any sender other than the CLI identity and logs only the sender hex', () => {
    const s = makeSpacetimedb();
    const { ctx, db } = makeCtx({ sender: 'deadbeef' });
    expect(() => s.reducer('spike_set_key').fn(ctx, { apiKey: FAKE_KEY })).toThrow();
    expect(db.llm_config.id.find(1n).apiKey).toBe(FAKE_KEY); // unchanged (seeded)
    const text = logged.join('\n');
    expect(text).toContain('deadbeef');
    expect(text).not.toContain(FAKE_KEY);
  });

  it('spike_set_key stores the trimmed key for the CLI identity and logs only its length', () => {
    const s = makeSpacetimedb();
    const { ctx, db } = makeCtx({ sender: CLI_IDENTITY });
    const newKey = ['sk', '-ant-', 'api03-', 'N'.repeat(40)].join('');
    s.reducer('spike_set_key').fn(ctx, { apiKey: `  ${newKey}\n` });
    expect(db.llm_config.id.find(1n).apiKey).toBe(newKey);
    const text = logged.join('\n');
    expect(text).toContain('len=' + newKey.length);
    expect(text).not.toContain(newKey);
  });

  it('spike_set_key rejects an empty key', () => {
    const s = makeSpacetimedb();
    const { ctx } = makeCtx({ sender: CLI_IDENTITY });
    expect(() => s.reducer('spike_set_key').fn(ctx, { apiKey: '   ' })).toThrow();
  });

  it('CLI_IDENTITY is the locked operator identity', () => {
    expect(CLI_IDENTITY).toBe('c200252497b98fff5aab75f8fbc675956b5a12a5b85042ab355d3a05c6ab7d6e');
  });

  it('spike_reset never touches spend counters, clears samples and seeds one tick when probing', () => {
    const s = makeSpacetimedb();
    const { ctx, db } = makeCtx({
      state: stateRow({ estCostMicroUsd: 777n, calls: 9n, inFlight: 3, reservedMicroUsd: 5n, phase: 'x', lastTickUs: 5n }),
      seed: {
        spike_tick_sample: [
          { id: 1n, phase: 'a', inFlight: 0, lateUs: 1n, gapUs: 1n },
          { id: 2n, phase: 'a', inFlight: 0, lateUs: 1n, gapUs: 1n },
        ],
        spike_tick: [{ scheduledId: 1n, scheduledAt: { tag: 'Time', value: { microsSinceUnixEpoch: 1n } } }],
      },
    });
    s.reducer('spike_reset').fn(ctx, { probeOn: true });
    const st = stateOf(db);
    expect(st.estCostMicroUsd).toBe(777n);
    expect(st.calls).toBe(9n);
    expect(st.inFlight).toBe(0);
    expect(st.reservedMicroUsd).toBe(0n);
    expect(st.phase).toBe('idle');
    expect(st.probeOn).toBe(true);
    expect(st.lastTickUs).toBe(0n);
    expect(db.spike_tick_sample._rows()).toHaveLength(0);
    const ticks = db.spike_tick._rows();
    expect(ticks).toHaveLength(1);
    expect(ticks[0].scheduledAt.value.microsSinceUnixEpoch).toBe(BASE + COMBAT_LOOP_INTERVAL_MICROS);
  });

  it('spike_reset with probeOn false leaves no tick and creates state when missing', () => {
    const s = makeSpacetimedb();
    const { ctx, db } = makeCtx({ state: null });
    s.reducer('spike_reset').fn(ctx, { probeOn: false });
    expect(stateOf(db)).toMatchObject({ probeOn: false, estCostMicroUsd: 0n, calls: 0n });
    expect(db.spike_tick._rows()).toHaveLength(0);
  });

  it('spike_tick_probe records a sample and reschedules at the combat cadence', () => {
    const s = makeSpacetimedb();
    const { ctx, db } = makeCtx({ state: stateRow({ probeOn: true, phase: 'baseline', inFlight: 4, lastTickUs: BASE - 1_000_000n }) });
    s.reducer('spike_tick_probe').fn(ctx, {
      arg: { scheduledId: 1n, scheduledAt: { tag: 'Time', value: { microsSinceUnixEpoch: BASE - 1500n } } },
    });
    const samples = db.spike_tick_sample._rows();
    expect(samples).toHaveLength(1);
    expect(samples[0]).toMatchObject({ phase: 'baseline', inFlight: 4, lateUs: 1500n, gapUs: 1_000_000n });
    expect(stateOf(db).lastTickUs).toBe(BASE);
    const ticks = db.spike_tick._rows();
    expect(ticks).toHaveLength(1);
    expect(ticks[0].scheduledAt.value.microsSinceUnixEpoch).toBe(BASE + COMBAT_LOOP_INTERVAL_MICROS);
  });

  it('spike_tick_probe stops the chain when the probe is off or state is missing', () => {
    const s = makeSpacetimedb();
    const arg = { scheduledId: 1n, scheduledAt: { tag: 'Time', value: { microsSinceUnixEpoch: BASE } } };
    const off = makeCtx({ state: stateRow({ probeOn: false }) });
    s.reducer('spike_tick_probe').fn(off.ctx, { arg });
    expect(off.db.spike_tick._rows()).toHaveLength(0);
    expect(off.db.spike_tick_sample._rows()).toHaveLength(0);
    const none = makeCtx({ state: null });
    s.reducer('spike_tick_probe').fn(none.ctx, { arg });
    expect(none.db.spike_tick._rows()).toHaveLength(0);
  });

  it('spike_enqueue validates the spec and count and inserts scheduled jobs', () => {
    const s = makeSpacetimedb();
    const { ctx, db } = makeCtx();
    const specJson = JSON.stringify({ kind: 'noop', class: 'reliability' });
    s.reducer('spike_enqueue').fn(ctx, { runId: 'r', rung: 'dispatch', specJson, count: 3, seqStart: 10 });
    const jobs = db.spike_job._rows();
    expect(jobs.map((j: any) => j.seq)).toEqual([10, 11, 12]);
    expect(jobs[0]).toMatchObject({ runId: 'r', rung: 'dispatch', specJson });
    expect(jobs[0].scheduledAt.value.microsSinceUnixEpoch).toBe(BASE);
    expect(() => s.reducer('spike_enqueue').fn(ctx, { runId: 'r', rung: 'x', specJson, count: 0, seqStart: 0 })).toThrow();
    expect(() => s.reducer('spike_enqueue').fn(ctx, { runId: 'r', rung: 'x', specJson, count: 51, seqStart: 0 })).toThrow();
    expect(() =>
      s.reducer('spike_enqueue').fn(ctx, { runId: 'r', rung: 'x', specJson: '{"kind":"zzz","class":"drill"}', count: 1, seqStart: 0 }),
    ).toThrow();
  });

  it('spike_ping bumps the private counter and spike_echo writes a public result row', () => {
    const s = makeSpacetimedb();
    const { ctx, db } = makeCtx();
    s.reducer('spike_ping').fn(ctx, { nonce: 5n });
    s.reducer('spike_ping').fn(ctx, { nonce: 6n });
    expect(stateOf(db).pings).toBe(2n);
    s.reducer('spike_echo').fn(ctx, { runId: 'e', nonce: 42 });
    expect(resultRows(db)[0]).toMatchObject({ runId: 'e', rung: 'echo', seq: 42, ok: true, dataJson: '{}' });
  });

  it('spike_set_phase updates the phase label', () => {
    const s = makeSpacetimedb();
    const { ctx, db } = makeCtx();
    s.reducer('spike_set_phase').fn(ctx, { phase: 'load8' });
    expect(stateOf(db).phase).toBe('load8');
  });

  it('spike_whoami logs the sender hex', () => {
    const s = makeSpacetimedb();
    const { ctx } = makeCtx({ sender: 'cafe01' });
    s.reducer('spike_whoami').fn(ctx, {});
    expect(logged.join('\n')).toContain('spike_whoami sender=cafe01');
  });
});

// ---------------------------------------------------------------------------
// Static source checks
// ---------------------------------------------------------------------------

const SOURCE = readFileSync(new URL('./llm_spike.ts', import.meta.url), 'utf8');

/** Extract the argument text of every `needle(` call by balanced-paren scan, skipping string literals. */
function callBodies(src: string, needle: string): string[] {
  const out: string[] = [];
  let from = 0;
  for (;;) {
    const start = src.indexOf(needle + '(', from);
    if (start < 0) break;
    let i = start + needle.length + 1;
    const bodyStart = i;
    let depth = 1;
    while (i < src.length && depth > 0) {
      const c = src[i];
      if (c === "'" || c === '"' || c === '`') {
        i++;
        while (i < src.length && src[i] !== c) {
          if (src[i] === '\\') i++;
          i++;
        }
      } else if (c === '(') depth++;
      else if (c === ')') depth--;
      i++;
    }
    out.push(src.slice(bodyStart, i - 1));
    from = i;
  }
  return out;
}

describe('llm_spike.ts static rules', () => {
  it('has withTx callbacks and none is async or contains fetch or await', () => {
    const bodies = callBodies(SOURCE, 'ctx.withTx');
    expect(bodies.length).toBeGreaterThanOrEqual(2);
    for (const b of bodies) {
      expect(b.trimStart().startsWith('async')).toBe(false);
      expect(b).not.toContain('http.fetch');
      expect(b).not.toContain('await');
    }
  });

  it('calls http.fetch exactly once, outside every withTx body', () => {
    const outside = callBodies(SOURCE, 'ctx.withTx').reduce((acc, b) => acc.replace(b, ''), SOURCE);
    expect((outside.match(/http\.fetch\(/g) ?? []).length).toBe(1);
  });

  it('both procedures use the 4-argument object-name form', () => {
    expect((SOURCE.match(/spacetimedb\.procedure\(/g) ?? []).length).toBe(2);
    expect(SOURCE).toMatch(/spacetimedb\.procedure\(\s*\{ name: 'spike_run_job', onSchedule: SpikeJob \}/);
    expect(SOURCE).toMatch(/spacetimedb\.procedure\(\s*\{ name: 'spike_direct_call' \}/);
  });

  it('no console call references a key value', () => {
    const bodies = callBodies(SOURCE, 'console.info')
      .concat(callBodies(SOURCE, 'console.error'))
      .concat(callBodies(SOURCE, 'console.log'))
      .concat(callBodies(SOURCE, 'console.warn'));
    expect(bodies.length).toBeGreaterThan(0);
    for (const b of bodies) {
      const withoutStrings = b.replace(/'[^']*'|"[^"]*"|`[^`]*`/g, '');
      expect(withoutStrings).not.toMatch(/\b(apiKey|storedKey|key|trimmed)\b/);
    }
  });

  it('the spend cap is a code constant, not a table column or reducer argument', () => {
    expect(SOURCE).toMatch(/export const SPEND_CAP_MICRO_USD = /);
    expect(SOURCE).not.toMatch(/capMicroUsd/);
  });
});
