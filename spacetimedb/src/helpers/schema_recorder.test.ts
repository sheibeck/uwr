import { describe, it, expect, vi, beforeAll, afterEach } from 'vitest';
import { ScheduleAt } from 'spacetimedb';
import {
  recordedTable,
  recordedTables,
  rowColumnProblems,
  capturedReducer,
  capturedProcedure,
  capturedViews,
  snapshotDb,
} from './schema_recorder';
import { createMockDb, createMockCtx, createMockProcCtx } from './test-utils';

vi.mock('spacetimedb/server', async () =>
  (await import('./schema_recorder')).createRecordingServerMock(),
);

describe('schema recorder: tables.ts', () => {
  it('records llm_config as a non-public table', async () => {
    await import('../schema/tables');
    const cfg = recordedTable('llm_config');
    expect(cfg).toBeDefined();
    expect(cfg!.opts.public).toBeUndefined();
    expect(cfg!.cols.id.primaryKey).toBe(true);
    expect(cfg!.cols.apiKey.optional).toBe(false);
  });

  it('records llm_job options, indexes and per-column flags', async () => {
    await import('../schema/tables');
    const job = recordedTable('llm_job');
    expect(job).toBeDefined();
    expect(job!.opts.public).not.toBe(true);
    expect(job!.opts.indexes).toEqual([
      { accessor: 'by_player', algorithm: 'btree', columns: ['playerId'] },
      { accessor: 'by_dedupe_key', algorithm: 'btree', columns: ['dedupeKey'] },
      { accessor: 'by_status', algorithm: 'btree', columns: ['status'] },
    ]);
    expect(job!.cols.id.primaryKey).toBe(true);
    expect(job!.cols.id.autoInc).toBe(true);
    expect(job!.cols.resultText.optional).toBe(true);
    expect(job!.cols.requestJson.optional).toBe(false);
    expect(job!.cols.playerId.kind).toBe('identity');
    expect(recordedTables().length).toBeGreaterThan(10);
  });
});

describe('rowColumnProblems', () => {
  // An llm_job-shaped row: every required column, the optional ones omitted.
  const validJobRow = {
    id: 0n,
    playerId: { toHexString: () => 'p' },
    characterId: 1n,
    route: 'world_gen',
    dedupeKey: '["k",1]',
    status: 'pending',
    attempt: 0n,
    requestJson: '{}',
    inputTokens: 0n,
    outputTokens: 0n,
    cacheWriteTokens: 0n,
    cacheReadTokens: 0n,
    createdAt: { microsSinceUnixEpoch: 1n },
    reservedMicroUsd: 0n,
    costMicroUsd: 0n,
    budgetDay: '',
    applyAttempts: 0n,
    ledgerChargedMicroUsd: 0n,
  };
  const withExtras = {
    ...validJobRow,
    completedAt: undefined,
    promptText: 'p',
    modelName: 'm',
  };

  it('flags three made-up columns on an llm_job-shaped row (PIPE-08 bug class)', async () => {
    await import('../schema/tables');
    expect(rowColumnProblems('llm_job', withExtras).sort()).toEqual([
      'unknown column completedAt',
      'unknown column modelName',
      'unknown column promptText',
    ]);
  });

  it('returns [] for a complete valid row', async () => {
    await import('../schema/tables');
    expect(rowColumnProblems('llm_job', validJobRow)).toEqual([]);
  });

  it('reports a missing required column but tolerates omitted optional and autoInc ones', async () => {
    await import('../schema/tables');
    const { id, requestJson, ...rest } = validJobRow; // id is autoInc; resultText and other optionals are already absent
    expect(rowColumnProblems('llm_job', rest)).toEqual(['missing column requestJson']);
  });

  it('reports an unrecorded table as unknown', async () => {
    await import('../schema/tables');
    expect(rowColumnProblems('no_such_table', {})).toEqual(['unknown table no_such_table']);
  });
});

describe('schema recorder: index.ts reducer capture', () => {
  it('loads the real index.ts module graph and captures reducers as functions', async () => {
    await import('../index');
    expect(typeof capturedReducer('set_api_key')).toBe('function');
    expect(typeof capturedReducer('request_skill_offer')).toBe('function');
    expect(capturedViews().some((v) => v.opts?.name === 'my_bank_slots')).toBe(true);
    // Loading the whole index.ts module graph can exceed vitest's 5 s default when the full
    // suite runs many workers in parallel on a slow machine.
  }, 120_000);
});

describe('snapshotDb', () => {
  it('serializes bigint, identity, timestamp, drops functions and sorts tables', () => {
    const id = { toHexString: () => 'abc' };
    const db = createMockDb({
      zeta: [{ id: 1n, who: id, at: { microsSinceUnixEpoch: 5n }, fn: () => 1, n: 'x' }],
      alpha: [{ id: 2n }],
    });
    const snap = snapshotDb(db);
    expect(snap).toContain('"1n"');
    expect(snap).toContain('"identity:abc"');
    expect(snap).toContain('"ts:5n"');
    expect(snap).not.toContain('fn');
    expect(snap.indexOf('alpha')).toBeLessThan(snap.indexOf('zeta'));
  });

  it('two equal databases serialize identically regardless of insertion order', () => {
    const a = createMockDb();
    a.one.insert({ id: 0n, b: 1n, a: 2n });
    a.two.insert({ id: 0n });
    const b = createMockDb();
    b.two.insert({ id: 0n });
    b.one.insert({ a: 2n, b: 1n, id: 0n });
    expect(snapshotDb(a)).toBe(snapshotDb(b));
  });
});

// ----------------------------------------------------------------------------
// Phase 41 Plan 07: llm_run and llm_sweep registration, guards, sweep tick ensure
// ----------------------------------------------------------------------------

describe('llm_run and llm_sweep registration (PIPE-09, PIPE-05)', () => {
  const T0 = 1_700_000_000_000_000n;
  const MODULE_ID = { toHexString: () => 'module-identity-hex' };
  const CLIENT_ID = { toHexString: () => 'c'.repeat(64) };
  const FAKE_KEY = ['sk', '-ant-', 'api03-', 'REGTESTKEY'.repeat(4)].join('');
  const alice = { toHexString: () => 'a'.repeat(64) };

  // Loading the whole index.ts module graph can exceed vitest's 5 s default on a slow machine.
  beforeAll(async () => {
    await import('../index');
  }, 120_000);

  afterEach(() => {
    vi.restoreAllMocks();
  });

  const ts = (micros: bigint) => ({ microsSinceUnixEpoch: micros });
  const tickRows = (db: any): any[] => db._tables.llm_sweep_tick ?? [];

  const staleInFlightJob = () => ({
    id: 1n,
    playerId: alice,
    characterId: 1n,
    route: 'npc_conversation',
    dedupeKey: '["seed",1]',
    status: 'in_flight',
    attempt: 1n,
    requestJson: '{"characterId":"1","npcId":"1"}',
    inputTokens: 0n,
    outputTokens: 0n,
    cacheWriteTokens: 0n,
    cacheReadTokens: 0n,
    createdAt: ts(T0 - 200_000_000n),
    startedAt: ts(T0 - 100_000_000n),
    reservedMicroUsd: 0n,
    costMicroUsd: 0n,
    budgetDay: '',
    applyAttempts: 0n,
    ledgerChargedMicroUsd: 0n,
  });

  it('captures llm_run as a procedure and llm_sweep as a reducer', () => {
    expect(typeof capturedProcedure('llm_run')).toBe('function');
    expect(typeof capturedReducer('llm_sweep')).toBe('function');
  });

  it('llm_run ignores a caller that is not the module identity: nothing changes and no call is made', () => {
    vi.spyOn(console, 'log').mockImplementation(() => {});
    const run = capturedProcedure('llm_run')!;
    const proc = createMockProcCtx({
      sender: CLIENT_ID,
      databaseIdentity: MODULE_ID,
      timestampMicros: T0,
      strict: true,
      seed: { llm_job: [{ ...staleInFlightJob(), status: 'pending' }] },
    });
    const before = snapshotDb(proc.db);

    const result = run(proc.ctx, { arg: { scheduledId: 1n, scheduledAt: ScheduleAt.time(T0), jobId: 1n } });

    expect(result).toEqual({});
    expect(snapshotDb(proc.db)).toBe(before);
    expect(proc.http.calls).toHaveLength(0);
  });

  it('llm_run with the module identity and a missing job does nothing and makes no call', () => {
    vi.spyOn(console, 'log').mockImplementation(() => {});
    const run = capturedProcedure('llm_run')!;
    const proc = createMockProcCtx({ databaseIdentity: MODULE_ID, sender: MODULE_ID, timestampMicros: T0, strict: true });
    expect(run(proc.ctx, { arg: { scheduledId: 1n, scheduledAt: ScheduleAt.time(T0), jobId: 999n } })).toEqual({});
    expect(proc.http.calls).toHaveLength(0);
  });

  it('llm_sweep throws a SenderError for a client caller and inserts no tick', () => {
    const sweep = capturedReducer('llm_sweep')!;
    const ctx = createMockCtx({ sender: CLIENT_ID, databaseIdentity: MODULE_ID, timestampMicros: T0, strict: true });
    expect(() => sweep(ctx, { arg: { scheduledId: 1n, scheduledAt: ScheduleAt.time(T0) } })).toThrow(/Scheduled only/);
    expect(tickRows(ctx.db)).toHaveLength(0);
  });

  it('llm_sweep with the module identity inserts one tick 30 s out and runs the sweep', () => {
    const sweep = capturedReducer('llm_sweep')!;
    const ctx = createMockCtx({
      sender: MODULE_ID,
      databaseIdentity: MODULE_ID,
      timestampMicros: T0,
      strict: true,
      seed: { llm_job: [staleInFlightJob()] },
    });

    sweep(ctx, { arg: { scheduledId: 1n, scheduledAt: ScheduleAt.time(T0) } });

    const ticks = tickRows(ctx.db);
    expect(ticks).toHaveLength(1);
    expect(ticks[0].scheduledAt.tag).toBe('Time');
    expect(ticks[0].scheduledAt.value.microsSinceUnixEpoch).toBe(T0 + 30_000_000n);
    expect((ctx.db as any)._tables.llm_job[0].status).toBe('expired');
  });

  it('llm_sweep never throws when the sweep throws, still inserts the next tick and logs no key', () => {
    const errors = vi.spyOn(console, 'error').mockImplementation(() => {});
    const sweep = capturedReducer('llm_sweep')!;
    const ctx: any = createMockCtx({ sender: MODULE_ID, databaseIdentity: MODULE_ID, timestampMicros: T0, strict: true });
    const realDb = ctx.db;
    ctx.db = new Proxy(realDb, {
      get(target, prop) {
        if (prop === 'llm_job') throw new Error(`table exploded ${FAKE_KEY}`);
        return (target as any)[prop];
      },
    });

    expect(() => sweep(ctx, { arg: { scheduledId: 1n, scheduledAt: ScheduleAt.time(T0) } })).not.toThrow();

    expect(tickRows(realDb)).toHaveLength(1);
    expect(errors).toHaveBeenCalledTimes(1);
    expect(String(errors.mock.calls[0][0])).not.toContain(FAKE_KEY);
  });

  it('initScheduledTables leaves exactly one llm_sweep_tick row, even when called twice', async () => {
    const { initScheduledTables } = await import('./scheduling');
    const ctx = createMockCtx({ timestampMicros: T0, strict: true });
    initScheduledTables(ctx);
    initScheduledTables(ctx);
    expect(tickRows(ctx.db)).toHaveLength(1);
    expect(tickRows(ctx.db)[0].scheduledAt.value.microsSinceUnixEpoch).toBe(T0 + 30_000_000n);
  });

  it('the clientConnected handler leaves exactly one llm_sweep_tick row, even when called twice', () => {
    const connected = capturedReducer('__client_connected__')!;
    const ctx = createMockCtx({ sender: CLIENT_ID, databaseIdentity: MODULE_ID, timestampMicros: T0, strict: true });
    connected(ctx);
    connected(ctx);
    expect(tickRows(ctx.db)).toHaveLength(1);
  });
});
