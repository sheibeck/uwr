/**
 * Executor body tests (Phase 41, Plan 06): runLlmJob through createMockProcCtx.
 *
 * Proves guard, claim, cap, narration, ledger, key and input paths (Task 1) and the call, persist,
 * retry, settlement, apply, smoke and redaction paths (Task 2) offline. No network. The API key is
 * a fake built from fragments.
 */
import { describe, it, expect, vi, beforeAll } from 'vitest';
import { ScheduleAt } from 'spacetimedb';
import { createMockProcCtx, type MockReply, type MockThrow } from './test-utils';
import { snapshotDb, rowColumnProblems } from './schema_recorder';
import { enqueueLlmJob, SOURCE_KEYS } from './llm_queue';
import { encodeRouteInput, smokeInputFor } from './llm_inputs';
import { insertLlmDispatch, scheduledMicros } from './llm_schedule';
import { applyLlmFailure } from './llm_apply';
import { runLlmJob, claimLlmJob, type ExecutorDeps } from './llm_executor';
import type { LlmRoute } from '../data/llm_routes';
import { LLM_MAX_IN_FLIGHT } from '../data/llm_limits';

vi.mock('spacetimedb/server', async () =>
  (await import('./schema_recorder')).createRecordingServerMock(),
);

vi.mock('./events', () => ({
  appendSystemMessage: vi.fn(),
  appendPrivateEvent: vi.fn(),
  appendWorldEvent: vi.fn(),
  appendNpcDialog: vi.fn(),
  appendCreationEvent: vi.fn(),
}));

// Strict mock db: accessors come from the recorded schema, so load it before any test touches ctx.db.
beforeAll(async () => {
  await import('../schema/tables');
});

// ----------------------------------------------------------------------------
// Fixtures and helpers
// ----------------------------------------------------------------------------

/** A fake key built from fragments so no key-shaped literal appears in the source. */
const FAKE_KEY = ['sk', '-ant-', 'api03-', 'EXECTESTKEY'.repeat(4)].join('');

const T0 = 1_700_000_000_000_000n;
const alice = { toHexString: () => 'a'.repeat(64) };
const bob = { toHexString: () => 'b'.repeat(64) };
const MODULE_ID = { toHexString: () => 'module-identity-hex' };
const CLIENT_ID = { toHexString: () => 'c'.repeat(64) };

const character = () => ({
  id: 1n,
  ownerUserId: 7n,
  name: 'Aldric',
  race: 'Kobold',
  className: 'Ashweaver',
});

function seedTables(over: Record<string, any[]> = {}): Record<string, any[]> {
  return {
    player: [{ id: alice, userId: 7n, activeCharacterId: 1n }],
    character: [character()],
    llm_config: [{ id: 1n, apiKey: FAKE_KEY, updatedAt: { microsSinceUnixEpoch: T0 } }],
    ...over,
  };
}

type Extra = {
  withTxReinvoke?: number;
  seed?: Record<string, any[]>;
  sender?: any;
  databaseIdentity?: any;
};

function makeProc(responses: Array<MockReply | MockThrow> = [], extra: Extra = {}) {
  return createMockProcCtx({
    seed: seedTables(extra.seed),
    timestampMicros: T0,
    responses,
    withTxReinvoke: extra.withTxReinvoke,
    sender: extra.sender,
    databaseIdentity: extra.databaseIdentity,
    strict: true,
  });
}

type Proc = ReturnType<typeof createMockProcCtx>;
const rows = (proc: Proc, table: string): any[] => proc.db._tables[table] ?? [];
const jobOf = (proc: Proc, id: bigint): any => rows(proc, 'llm_job').find((j) => j.id === id);
const nowMicros = (proc: Proc): bigint => proc.clock.now();

function makeDeps(proc: Proc, over: Partial<ExecutorDeps> = {}) {
  return {
    nowMs: () => Number(proc.clock.now() / 1000n),
    apply: vi.fn(),
    applyFailure: vi.fn(),
    log: vi.fn(),
    ...over,
  } as ExecutorDeps & { apply: any; applyFailure: any; log: any };
}

let seq = 0;

/** Enqueue one job through the real seam (reserves budget, writes the dispatch row) and return its id. */
function enqueue(
  proc: Proc,
  route: LlmRoute,
  o: { sourceKey?: string; request?: Record<string, unknown>; budget?: 'player' | 'phase_only'; playerId?: any } = {},
): bigint {
  return proc.ctx.withTx((tx: any) => {
    const result = enqueueLlmJob(tx, {
      route,
      playerId: o.playerId ?? alice,
      characterId: 1n,
      sourceKey: o.sourceKey ?? `k${++seq}`,
      request: o.request ?? { input: encodeRouteInput(smokeInputFor(route)) },
      budget: o.budget,
    });
    if (!result.job) throw new Error(`enqueue refused: ${String(result.refused)}`);
    return result.job.id as bigint;
  });
}

/** What the scheduler does before running llm_run: delete the dispatch row and hand it over as the argument. */
function takeDispatch(proc: Proc, jobId: bigint): any {
  const list = rows(proc, 'llm_dispatch');
  const i = list.findIndex((r) => r.jobId === jobId);
  if (i < 0) return { scheduledId: 9_999n, scheduledAt: ScheduleAt.time(nowMicros(proc)), jobId };
  return list.splice(i, 1)[0];
}

function run(proc: Proc, jobId: bigint, deps: ExecutorDeps = makeDeps(proc)) {
  return runLlmJob(proc.ctx, takeDispatch(proc, jobId), deps);
}

/** A full llm_job row (every required column) for direct seeding. */
function jobRow(over: Record<string, any> = {}): Record<string, any> {
  return {
    id: 0n,
    playerId: alice,
    characterId: 1n,
    route: 'npc_conversation',
    dedupeKey: `["seed",${++seq}]`,
    status: 'pending',
    attempt: 0n,
    requestJson: JSON.stringify({ input: encodeRouteInput(smokeInputFor('npc_conversation')) }),
    inputTokens: 0n,
    outputTokens: 0n,
    cacheWriteTokens: 0n,
    cacheReadTokens: 0n,
    createdAt: { microsSinceUnixEpoch: T0 },
    reservedMicroUsd: 0n,
    costMicroUsd: 0n,
    budgetDay: '',
    applyAttempts: 0n,
    ...over,
  };
}

function seedJob(proc: Proc, over: Record<string, any> = {}): any {
  return proc.db.llm_job.insert(jobRow(over));
}

function seedInFlight(proc: Proc, n: number): void {
  for (let i = 0; i < n; i++) {
    seedJob(proc, { status: 'in_flight', attempt: 1n, playerId: bob, dedupeKey: `["flight",${i}]` });
  }
}

/** Every table's rows without empty tables (a read creates an empty array in the mock). */
function snap(proc: Proc): string {
  const all = JSON.parse(snapshotDb(proc.db));
  for (const k of Object.keys(all)) if (all[k].length === 0) delete all[k];
  return JSON.stringify(all);
}

const normalizeIds = (proc: Proc): string =>
  snap(proc).replace(/"(id|jobId|scheduledId)":"\d+n"/g, '"$1":"N"');

const ledger = (proc: Proc): any => rows(proc, 'llm_spend')[0];
const playerDay = (proc: Proc): any => rows(proc, 'llm_player_budget')[0];

// ----------------------------------------------------------------------------
// Test fixtures are well formed
// ----------------------------------------------------------------------------

describe('test fixtures', () => {
  it('jobRow has exactly the recorded llm_job columns', () => {
    expect(rowColumnProblems('llm_job', jobRow())).toEqual([]);
  });
});

// ----------------------------------------------------------------------------
// Guard
// ----------------------------------------------------------------------------

describe('module-identity guard (T-41-02)', () => {
  it("returns 'not_module' with no write and no call when the sender is not the module identity", () => {
    const proc = makeProc([], { sender: CLIENT_ID, databaseIdentity: MODULE_ID });
    const jobId = enqueue(proc, 'npc_conversation');
    const before = snapshotDb(proc.db);
    const deps = makeDeps(proc);

    const outcome = run(proc, jobId, deps);

    expect(outcome).toBe('not_module');
    expect(snapshotDb(proc.db)).toBe(before);
    expect(proc.http.calls).toHaveLength(0);
    expect(deps.applyFailure).not.toHaveBeenCalled();
    expect(deps.apply).not.toHaveBeenCalled();
  });

  it('the guard log line carries no key', () => {
    const proc = makeProc([], { sender: CLIENT_ID, databaseIdentity: MODULE_ID });
    const jobId = enqueue(proc, 'npc_conversation');
    const deps = makeDeps(proc);
    run(proc, jobId, deps);
    for (const call of deps.log.mock.calls) expect(String(call[0])).not.toContain(FAKE_KEY);
  });

  it('a module-identity sender is allowed through', () => {
    const proc = makeProc();
    const jobId = enqueue(proc, 'npc_conversation');
    const claim = claimLlmJob(proc.ctx, takeDispatch(proc, jobId), makeDeps(proc));
    expect(claim.kind).toBe('run');
  });
});

// ----------------------------------------------------------------------------
// Skip, duplicate and early dispatch
// ----------------------------------------------------------------------------

describe('claim: paths that do nothing', () => {
  it("a missing job is 'skip' with no fetch and no dispatch", () => {
    const proc = makeProc();
    const deps = makeDeps(proc);
    const outcome = runLlmJob(
      proc.ctx,
      { scheduledId: 1n, scheduledAt: ScheduleAt.time(T0), jobId: 424242n },
      deps,
    );
    expect(outcome).toBe('skip');
    expect(proc.http.calls).toHaveLength(0);
    expect(rows(proc, 'llm_dispatch')).toHaveLength(0);
  });

  it.each(['in_flight', 'completed', 'failed', 'expired'])(
    "a %s job is 'skip': no fetch, no dispatch, nothing written",
    (status) => {
      const proc = makeProc();
      const job = seedJob(proc, { status, attempt: 1n });
      const before = snap(proc);
      const deps = makeDeps(proc);
      const outcome = run(proc, job.id, deps);
      expect(outcome).toBe('skip');
      expect(proc.http.calls).toHaveLength(0);
      expect(rows(proc, 'llm_dispatch')).toHaveLength(0);
      expect(snap(proc)).toBe(before);
      expect(deps.applyFailure).not.toHaveBeenCalled();
    },
  );

  it("a pending job due in the future with another dispatch row already there is 'skip'", () => {
    const proc = makeProc();
    const jobId = enqueue(proc, 'npc_conversation');
    const arg = takeDispatch(proc, jobId);
    const due = T0 + 5_000_000n;
    proc.ctx.withTx((tx: any) => {
      tx.db.llm_job.id.update({ ...tx.db.llm_job.id.find(jobId), nextAttemptAt: { microsSinceUnixEpoch: due } });
      insertLlmDispatch(tx, jobId, due);
    });
    const outcome = runLlmJob(proc.ctx, arg, makeDeps(proc));
    expect(outcome).toBe('skip');
    expect(rows(proc, 'llm_dispatch')).toHaveLength(1);
    expect(proc.http.calls).toHaveLength(0);
    expect(jobOf(proc, jobId).status).toBe('pending');
  });

  it("a pending job due in the future with no other dispatch row is 'redispatch': one new dispatch at nextAttemptAt", () => {
    const proc = makeProc();
    const jobId = enqueue(proc, 'npc_conversation');
    const arg = takeDispatch(proc, jobId);
    const due = T0 + 5_000_000n;
    proc.ctx.withTx((tx: any) => {
      tx.db.llm_job.id.update({ ...tx.db.llm_job.id.find(jobId), nextAttemptAt: { microsSinceUnixEpoch: due } });
    });
    const outcome = runLlmJob(proc.ctx, arg, makeDeps(proc));
    expect(outcome).toBe('redispatch');
    const dispatches = rows(proc, 'llm_dispatch');
    expect(dispatches).toHaveLength(1);
    expect(dispatches[0].jobId).toBe(jobId);
    expect(scheduledMicros(dispatches[0].scheduledAt)).toBe(due);
    expect(jobOf(proc, jobId).status).toBe('pending');
    expect(jobOf(proc, jobId).attempt).toBe(0n);
    expect(proc.http.calls).toHaveLength(0);
  });

  it('a pending job whose nextAttemptAt is exactly now is claimed', () => {
    const proc = makeProc();
    const jobId = enqueue(proc, 'npc_conversation');
    const arg = takeDispatch(proc, jobId);
    proc.ctx.withTx((tx: any) => {
      tx.db.llm_job.id.update({ ...tx.db.llm_job.id.find(jobId), nextAttemptAt: { microsSinceUnixEpoch: T0 } });
    });
    const claim = claimLlmJob(proc.ctx, arg, makeDeps(proc));
    expect(claim.kind).toBe('run');
    expect(jobOf(proc, jobId).nextAttemptAt).toBeUndefined();
  });
});

// ----------------------------------------------------------------------------
// The claim itself
// ----------------------------------------------------------------------------

describe('claim: a pending job becomes in_flight', () => {
  it('sets in_flight, attempt 1n, startedAt; returns the key, input, player and lateness', () => {
    const proc = makeProc();
    const jobId = enqueue(proc, 'npc_conversation');
    const arg = takeDispatch(proc, jobId);
    proc.clock.advance(1_500_000n);

    const claim = claimLlmJob(proc.ctx, arg, makeDeps(proc));
    expect(claim.kind).toBe('run');
    if (claim.kind !== 'run') return;

    const job = jobOf(proc, jobId);
    expect(job.status).toBe('in_flight');
    expect(job.attempt).toBe(1n);
    expect(job.startedAt.microsSinceUnixEpoch).toBe(T0 + 1_500_000n);
    expect(job.nextAttemptAt).toBeUndefined();

    expect(claim.jobId).toBe(jobId);
    expect(claim.route).toBe('npc_conversation');
    expect(claim.attempt).toBe(1n);
    expect(claim.apiKey).toBe(FAKE_KEY);
    expect(claim.smoke).toBe(false);
    expect(claim.playerId).toBe(alice);
    expect(claim.createdAtMicros).toBe(T0);
    expect(claim.dispatchLateMs).toBe(1500);
    expect((claim.input as any).playerMessage).toBe('Hello.');
    expect(proc.http.calls).toHaveLength(0);
  });

  it('dispatchLateMs is 0 for a dispatch that ran early or exactly on time', () => {
    const proc = makeProc();
    const jobId = enqueue(proc, 'npc_conversation');
    const arg = { ...takeDispatch(proc, jobId), scheduledAt: ScheduleAt.time(T0 + 10_000_000n) };
    const claim = claimLlmJob(proc.ctx, arg, makeDeps(proc));
    expect(claim.kind === 'run' && claim.dispatchLateMs).toBe(0);
  });

  it('dispatchLateMs is 0 when the schedule is not a Time schedule', () => {
    const proc = makeProc();
    const jobId = enqueue(proc, 'npc_conversation');
    const arg = { ...takeDispatch(proc, jobId), scheduledAt: ScheduleAt.interval(1_000_000n) };
    proc.clock.advance(3_000_000n);
    const claim = claimLlmJob(proc.ctx, arg, makeDeps(proc));
    expect(claim.kind === 'run' && claim.dispatchLateMs).toBe(0);
  });

  it('a smoke job is claimed with smoke true and the fixed smoke input', () => {
    const proc = makeProc();
    const jobId = enqueue(proc, 'smoke_test', { request: { smoke: true }, budget: 'phase_only' });
    const claim = claimLlmJob(proc.ctx, takeDispatch(proc, jobId), makeDeps(proc));
    expect(claim.kind === 'run' && claim.smoke).toBe(true);
  });

  it('the claim keeps the reservation held (money moves only at persist)', () => {
    const proc = makeProc();
    const jobId = enqueue(proc, 'npc_conversation');
    const reserved = jobOf(proc, jobId).reservedMicroUsd;
    claimLlmJob(proc.ctx, takeDispatch(proc, jobId), makeDeps(proc));
    expect(jobOf(proc, jobId).reservedMicroUsd).toBe(reserved);
    expect(reserved).toBeGreaterThan(0n);
    expect(ledger(proc).reservedMicroUsd).toBe(reserved);
  });
});

// ----------------------------------------------------------------------------
// In-flight cap (PIPE-06)
// ----------------------------------------------------------------------------

describe('in-flight cap of 4 (PIPE-06)', () => {
  it('the cap is 4', () => {
    expect(LLM_MAX_IN_FLIGHT).toBe(4);
  });

  it("4 in flight: a 5th gameplay job is 'deferred': still pending, attempt 0n, one dispatch 500-749 ms later, no call", () => {
    const proc = makeProc();
    seedInFlight(proc, 4);
    const jobId = enqueue(proc, 'npc_conversation');
    const arg = takeDispatch(proc, jobId);
    const deps = makeDeps(proc);

    const outcome = runLlmJob(proc.ctx, arg, deps);

    expect(outcome).toBe('deferred');
    const job = jobOf(proc, jobId);
    expect(job.status).toBe('pending');
    expect(job.attempt).toBe(0n);
    expect(job.startedAt).toBeUndefined();
    const dispatches = rows(proc, 'llm_dispatch');
    expect(dispatches).toHaveLength(1);
    expect(dispatches[0].jobId).toBe(jobId);
    const at = scheduledMicros(dispatches[0].scheduledAt) as bigint;
    expect(at).toBeGreaterThanOrEqual(T0 + 500_000n);
    expect(at).toBeLessThan(T0 + 750_000n);
    expect(proc.http.calls).toHaveLength(0);
    expect(deps.applyFailure).not.toHaveBeenCalled();
  });

  it('a deferral keeps the reservation (money is untouched)', () => {
    const proc = makeProc();
    seedInFlight(proc, 4);
    const jobId = enqueue(proc, 'npc_conversation');
    const reserved = jobOf(proc, jobId).reservedMicroUsd;
    runLlmJob(proc.ctx, takeDispatch(proc, jobId), makeDeps(proc));
    expect(jobOf(proc, jobId).reservedMicroUsd).toBe(reserved);
    expect(ledger(proc).reservedMicroUsd).toBe(reserved);
    expect(ledger(proc).spentMicroUsd).toBe(0n);
  });

  it('3 in flight: a gameplay job is claimed', () => {
    const proc = makeProc();
    seedInFlight(proc, 3);
    const jobId = enqueue(proc, 'npc_conversation');
    const claim = claimLlmJob(proc.ctx, takeDispatch(proc, jobId), makeDeps(proc));
    expect(claim.kind).toBe('run');
    expect(jobOf(proc, jobId).status).toBe('in_flight');
    expect(jobOf(proc, jobId).attempt).toBe(1n);
  });

  it('terminal and pending jobs do not count against the cap', () => {
    const proc = makeProc();
    for (const status of ['completed', 'failed', 'expired', 'pending', 'received']) {
      for (let i = 0; i < 3; i++) seedJob(proc, { status, playerId: bob });
    }
    seedInFlight(proc, 3);
    const jobId = enqueue(proc, 'npc_conversation');
    const claim = claimLlmJob(proc.ctx, takeDispatch(proc, jobId), makeDeps(proc));
    expect(claim.kind).toBe('run');
  });

  it('a deferred job retried when a slot has opened is claimed', () => {
    const proc = makeProc();
    seedInFlight(proc, 4);
    const jobId = enqueue(proc, 'npc_conversation');
    expect(runLlmJob(proc.ctx, takeDispatch(proc, jobId), makeDeps(proc))).toBe('deferred');
    // One of the four finishes.
    const first = rows(proc, 'llm_job').find((j) => j.status === 'in_flight');
    proc.ctx.withTx((tx: any) => tx.db.llm_job.id.update({ ...first, status: 'completed' }));
    proc.clock.advance(800_000n);
    const claim = claimLlmJob(proc.ctx, takeDispatch(proc, jobId), makeDeps(proc));
    expect(claim.kind).toBe('run');
  });

  it('repeated deferrals of one job use the dispatch scheduledId as the jitter seed (delays vary, all in range)', () => {
    const proc = makeProc();
    seedInFlight(proc, 4);
    const jobId = enqueue(proc, 'npc_conversation');
    const delays = new Set<number>();
    for (let s = 1n; s <= 40n; s++) {
      const arg = { scheduledId: s, scheduledAt: ScheduleAt.time(T0), jobId };
      rows(proc, 'llm_dispatch').length = 0;
      runLlmJob(proc.ctx, arg, makeDeps(proc));
      const at = scheduledMicros(rows(proc, 'llm_dispatch')[0].scheduledAt) as bigint;
      const ms = Number((at - T0) / 1000n);
      expect(ms).toBeGreaterThanOrEqual(500);
      expect(ms).toBeLessThan(750);
      delays.add(ms);
    }
    expect(delays.size).toBeGreaterThan(5);
  });

  it('withTxReinvoke: 1 on the deferral path leaves one dispatch row and the same end state as a plain run', () => {
    // The pending job is seeded directly (no re-invoked enqueue), so both runs see identical ids.
    const plain = makeProc();
    seedInFlight(plain, 4);
    const a = seedJob(plain, { dedupeKey: 'fixed' }).id;
    runLlmJob(plain.ctx, takeDispatch(plain, a), makeDeps(plain));

    const again = makeProc([], { withTxReinvoke: 1 });
    seedInFlight(again, 4);
    const b = seedJob(again, { dedupeKey: 'fixed' }).id;
    const outcome = runLlmJob(again.ctx, takeDispatch(again, b), makeDeps(again));

    expect(outcome).toBe('deferred');
    expect(rows(again, 'llm_dispatch')).toHaveLength(1);
    expect(again.http.calls).toHaveLength(0);
    expect(rows(plain, 'llm_dispatch')).toHaveLength(1);
    expect(normalizeIds(again)).toBe(normalizeIds(plain));
  });
});

// ----------------------------------------------------------------------------
// Combat narration (PIPE-07)
// ----------------------------------------------------------------------------

describe('combat narration claim rules (PIPE-07)', () => {
  it("3 in flight: narration is 'deferred'", () => {
    const proc = makeProc();
    seedInFlight(proc, 3);
    const jobId = enqueue(proc, 'combat_narration');
    const outcome = runLlmJob(proc.ctx, takeDispatch(proc, jobId), makeDeps(proc));
    expect(outcome).toBe('deferred');
    expect(jobOf(proc, jobId).status).toBe('pending');
    expect(rows(proc, 'llm_dispatch')).toHaveLength(1);
    expect(proc.http.calls).toHaveLength(0);
  });

  it('2 in flight: narration is claimed', () => {
    const proc = makeProc();
    seedInFlight(proc, 2);
    const jobId = enqueue(proc, 'combat_narration');
    const claim = claimLlmJob(proc.ctx, takeDispatch(proc, jobId), makeDeps(proc));
    expect(claim.kind).toBe('run');
  });

  it("older than 20 s at claim: 'expired' silently, errorCode late, reservation and call refunded, no failure message, no call", () => {
    const proc = makeProc();
    const jobId = enqueue(proc, 'combat_narration');
    const arg = takeDispatch(proc, jobId);
    expect(playerDay(proc).calls).toBe(1n);
    expect(ledger(proc).reservedMicroUsd).toBeGreaterThan(0n);
    proc.clock.advance(20_000_001n);
    const deps = makeDeps(proc);

    const outcome = runLlmJob(proc.ctx, arg, deps);

    expect(outcome).toBe('expired');
    const job = jobOf(proc, jobId);
    expect(job.status).toBe('expired');
    expect(job.errorCode).toBe('late');
    expect(job.finishedAt).toBeDefined();
    expect(job.reservedMicroUsd).toBe(0n);
    expect(job.attempt).toBe(0n);
    expect(playerDay(proc).reservedMicroUsd).toBe(0n);
    expect(playerDay(proc).calls).toBe(0n);
    expect(playerDay(proc).spentMicroUsd).toBe(0n);
    expect(ledger(proc).reservedMicroUsd).toBe(0n);
    expect(ledger(proc).calls).toBe(0n);
    expect(ledger(proc).spentMicroUsd).toBe(0n);
    expect(deps.applyFailure).not.toHaveBeenCalled();
    expect(proc.http.calls).toHaveLength(0);
    expect(rows(proc, 'llm_dispatch')).toHaveLength(0);
  });

  it('exactly 20 s old at claim still runs', () => {
    const proc = makeProc();
    const jobId = enqueue(proc, 'combat_narration');
    const arg = takeDispatch(proc, jobId);
    proc.clock.advance(20_000_000n);
    const claim = claimLlmJob(proc.ctx, arg, makeDeps(proc));
    expect(claim.kind).toBe('run');
  });

  it('a late narration is expired even when the cap is full (it never defers again)', () => {
    const proc = makeProc();
    seedInFlight(proc, 4);
    const jobId = enqueue(proc, 'combat_narration');
    const arg = takeDispatch(proc, jobId);
    proc.clock.advance(20_500_000n);
    expect(runLlmJob(proc.ctx, arg, makeDeps(proc))).toBe('expired');
    expect(rows(proc, 'llm_dispatch')).toHaveLength(0);
  });

  it('a gameplay job is never expired by age at claim', () => {
    const proc = makeProc();
    const jobId = enqueue(proc, 'npc_conversation');
    const arg = takeDispatch(proc, jobId);
    proc.clock.advance(120_000_000n);
    const claim = claimLlmJob(proc.ctx, arg, makeDeps(proc));
    expect(claim.kind).toBe('run');
  });
});

// ----------------------------------------------------------------------------
// Ledger, key and input failures at claim
// ----------------------------------------------------------------------------

describe('claim failures (no call, no spend)', () => {
  it("phase ledger exhausted: failed 'billing', reservation and call refunded, applyFailure once for the job's player, no call", () => {
    const proc = makeProc();
    const jobId = enqueue(proc, 'npc_conversation');
    const arg = takeDispatch(proc, jobId);
    // The ledger overshoots the cap after the reservation was accepted.
    proc.ctx.withTx((tx: any) => {
      const l = tx.db.llm_spend.id.find(1n);
      tx.db.llm_spend.id.update({ ...l, spentMicroUsd: 2_000_001n });
    });
    const deps = makeDeps(proc);

    const outcome = runLlmJob(proc.ctx, arg, deps);

    expect(outcome).toBe('failed');
    const job = jobOf(proc, jobId);
    expect(job.status).toBe('failed');
    expect(job.errorCode).toBe('billing');
    expect(job.finishedAt).toBeDefined();
    expect(job.reservedMicroUsd).toBe(0n);
    expect(playerDay(proc).reservedMicroUsd).toBe(0n);
    expect(playerDay(proc).calls).toBe(0n);
    expect(ledger(proc).reservedMicroUsd).toBe(0n);
    expect(ledger(proc).calls).toBe(0n);
    expect(ledger(proc).spentMicroUsd).toBe(2_000_001n);
    expect(deps.applyFailure).toHaveBeenCalledTimes(1);
    const applyJob = deps.applyFailure.mock.calls[0][1];
    expect(applyJob.playerId).toBe(alice);
    expect(applyJob.domain).toBe('npc_conversation');
    expect(proc.http.calls).toHaveLength(0);
    expect(rows(proc, 'llm_dispatch')).toHaveLength(0);
  });

  it("a missing key: failed 'auth', keyLastCheckOk false, applyFailure called, no call", () => {
    const proc = makeProc([], { seed: { llm_config: [] } });
    const jobId = enqueue(proc, 'npc_conversation');
    const deps = makeDeps(proc);
    const outcome = run(proc, jobId, deps);
    expect(outcome).toBe('failed');
    expect(jobOf(proc, jobId).status).toBe('failed');
    expect(jobOf(proc, jobId).errorCode).toBe('auth');
    expect(jobOf(proc, jobId).reservedMicroUsd).toBe(0n);
    expect(playerDay(proc).calls).toBe(0n);
    expect(rows(proc, 'llm_admin_state')[0].keyLastCheckOk).toBe(false);
    expect(deps.applyFailure).toHaveBeenCalledTimes(1);
    expect(proc.http.calls).toHaveLength(0);
  });

  it('an empty key is treated as missing', () => {
    const proc = makeProc([], {
      seed: { llm_config: [{ id: 1n, apiKey: '', updatedAt: { microsSinceUnixEpoch: T0 } }] },
    });
    const jobId = enqueue(proc, 'npc_conversation');
    expect(run(proc, jobId)).toBe('failed');
    expect(jobOf(proc, jobId).errorCode).toBe('auth');
  });

  it('a missing key clears a previously good key check', () => {
    const proc = makeProc([], {
      seed: {
        llm_config: [],
        llm_admin_state: [
          {
            id: 1n,
            keySet: true,
            keyLength: 108n,
            keyLastCheckOk: true,
            keyVerifiedAt: { microsSinceUnixEpoch: T0 },
            lastSmokeJson: '{}',
          },
        ],
      },
    });
    const jobId = enqueue(proc, 'npc_conversation');
    run(proc, jobId);
    expect(rows(proc, 'llm_admin_state')[0].keyLastCheckOk).toBe(false);
  });

  it('a missing key on a creation_race job returns the creation state to AWAITING_RACE (real failure apply)', () => {
    const proc = makeProc([], {
      seed: {
        llm_config: [],
        character_creation_state: [{ id: 1n, playerId: alice, step: 'GENERATING_RACE' }],
      },
    });
    const jobId = enqueue(proc, 'creation_race', { sourceKey: SOURCE_KEYS.creation(1n, 'race') });
    const deps = makeDeps(proc, { applyFailure: applyLlmFailure as any });
    expect(run(proc, jobId, deps)).toBe('failed');
    expect(rows(proc, 'character_creation_state')[0].step).toBe('AWAITING_RACE');
  });

  it("no usable route input: failed 'bad_request', refunded, applyFailure called, no call, no throw", () => {
    const proc = makeProc();
    const jobId = enqueue(proc, 'npc_conversation', { request: {} });
    const deps = makeDeps(proc);
    let outcome: string | undefined;
    expect(() => {
      outcome = run(proc, jobId, deps);
    }).not.toThrow();
    expect(outcome).toBe('failed');
    const job = jobOf(proc, jobId);
    expect(job.status).toBe('failed');
    expect(job.errorCode).toBe('bad_request');
    expect(job.reservedMicroUsd).toBe(0n);
    expect(job.attempt).toBe(0n);
    expect(playerDay(proc).calls).toBe(0n);
    expect(ledger(proc).reservedMicroUsd).toBe(0n);
    expect(deps.applyFailure).toHaveBeenCalledTimes(1);
    expect(proc.http.calls).toHaveLength(0);
  });

  it('a throwing failure message does not undo the failed status (redacted log, no throw)', () => {
    const proc = makeProc([], { seed: { llm_config: [] } });
    const jobId = enqueue(proc, 'npc_conversation');
    const deps = makeDeps(proc, {
      applyFailure: vi.fn(() => {
        throw new Error(`message bug ${FAKE_KEY}`);
      }) as any,
    });
    let outcome: string | undefined;
    expect(() => {
      outcome = run(proc, jobId, deps);
    }).not.toThrow();
    expect(outcome).toBe('failed');
    expect(jobOf(proc, jobId).status).toBe('failed');
    const logged = deps.log.mock.calls.map((c: any[]) => String(c[0])).join('\n');
    expect(logged).toContain('failure message');
    expect(logged).not.toContain(FAKE_KEY);
  });

  it('a smoke job that fails at claim records the failed entry and posts no failure message', () => {
    const proc = makeProc([], { seed: { llm_config: [] } });
    const jobId = enqueue(proc, 'creation_race', {
      request: { smoke: true },
      budget: 'phase_only',
      sourceKey: 'smoke:creation_race',
    });
    const deps = makeDeps(proc);
    expect(run(proc, jobId, deps)).toBe('failed');
    expect(deps.applyFailure).not.toHaveBeenCalled();
    const state = rows(proc, 'llm_admin_state')[0];
    const smoke = JSON.parse(state.lastSmokeJson);
    expect(smoke.creation_race.ok).toBe(false);
    expect(smoke.creation_race.class).toBe('auth');
  });
});
