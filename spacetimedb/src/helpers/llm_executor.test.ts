/**
 * Executor body tests (Phase 41, Plan 06): runLlmJob through createMockProcCtx.
 *
 * Proves guard, claim, cap, narration, ledger, key and input paths (Task 1) and the call, persist,
 * retry, settlement, apply, smoke and redaction paths (Task 2) offline. No network. The API key is
 * a fake built from fragments.
 */
import { describe, it, expect, vi, beforeAll, beforeEach, afterEach } from 'vitest';
// @ts-ignore node types are not part of this module's tsconfig (same as other source-reading tests)
import { readFileSync } from 'node:fs';
// @ts-ignore see above
import { fileURLToPath } from 'node:url';
// @ts-ignore see above
import { join } from 'node:path';
import { ScheduleAt } from 'spacetimedb';
import { createMockProcCtx, type MockReply, type MockThrow } from './test-utils';
import { snapshotDb, rowColumnProblems } from './schema_recorder';
import { enqueueLlmJob, SOURCE_KEYS, LLM_RESTING_LINE } from './llm_queue';
import { encodeRouteInput, smokeInputFor } from './llm_inputs';
import { insertLlmDispatch, scheduledMicros } from './llm_schedule';
import { applyLlmFailure, applyLlmResult } from './llm_apply';
import { runLlmJob, claimLlmJob, BILLED_FAILURE_CLASSES, type ExecutorDeps } from './llm_executor';
import { sweepLlmJobs } from './llm_sweeper';
import { isKeyValid, patchAdminState, setLlmEnabled } from './llm_admin_state';
import { addLedgerSpend, utcDay } from './llm_budget';
import { retryDelayMs, msToMicros } from './llm_retry';
import { awardRenown } from './renown';
import { appendPrivateEvent, appendCreationEvent } from './events';
import { estimateCostMicroUsd, findSecretLeaks } from './measurement';
import { LLM_ROUTES, type LlmRoute } from '../data/llm_routes';
import { ANTHROPIC_MESSAGES_URL } from '../data/llm_models';
import { LLM_MAX_IN_FLIGHT, LLM_NARRATION_MAX_IN_FLIGHT, LLM_PLAYER_DAILY_CALLS } from '../data/llm_limits';

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
    ledgerChargedMicroUsd: 0n,
    ledgerChargedDayUtc: '',
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
    const arg = takeDispatch(proc, jobId);
    const before = snapshotDb(proc.db);
    const deps = makeDeps(proc);

    const outcome = runLlmJob(proc.ctx, arg, deps);

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
// Region economy (Phase 51.3 Plan 12): background work
// ----------------------------------------------------------------------------

describe('region economy claim rules (background work)', () => {
  const enqueueEconomy = (proc: Proc) => enqueue(proc, 'region_economy', { budget: 'phase_only' });

  it('the background limit is one below the cap', () => {
    expect(LLM_NARRATION_MAX_IN_FLIGHT).toBe(LLM_MAX_IN_FLIGHT - 1);
  });

  it(`LLM_NARRATION_MAX_IN_FLIGHT in flight: a region_economy job is 'deferred' (the last slot stays for gameplay)`, () => {
    const proc = makeProc();
    seedInFlight(proc, LLM_NARRATION_MAX_IN_FLIGHT);
    const jobId = enqueueEconomy(proc);
    const outcome = runLlmJob(proc.ctx, takeDispatch(proc, jobId), makeDeps(proc));
    expect(outcome).toBe('deferred');
    expect(jobOf(proc, jobId).status).toBe('pending');
    expect(jobOf(proc, jobId).attempt).toBe(0n);
    expect(rows(proc, 'llm_dispatch')).toHaveLength(1);
    expect(proc.http.calls).toHaveLength(0);
  });

  it('one fewer in flight: a region_economy job is claimed', () => {
    const proc = makeProc();
    seedInFlight(proc, LLM_NARRATION_MAX_IN_FLIGHT - 1);
    const jobId = enqueueEconomy(proc);
    const claim = claimLlmJob(proc.ctx, takeDispatch(proc, jobId), makeDeps(proc));
    expect(claim.kind).toBe('run');
    expect(jobOf(proc, jobId).status).toBe('in_flight');
  });

  it('with the background limit full, a gameplay job still gets the last slot', () => {
    const proc = makeProc();
    seedInFlight(proc, LLM_NARRATION_MAX_IN_FLIGHT);
    const jobId = enqueue(proc, 'npc_conversation');
    const claim = claimLlmJob(proc.ctx, takeDispatch(proc, jobId), makeDeps(proc));
    expect(claim.kind).toBe('run');
  });

  it('an old region_economy job is never expired by the narration age rule', () => {
    const proc = makeProc();
    const jobId = enqueueEconomy(proc);
    const arg = takeDispatch(proc, jobId);
    proc.clock.advance(3_600_000_000n);
    const claim = claimLlmJob(proc.ctx, arg, makeDeps(proc));
    expect(claim.kind).toBe('run');
    expect(jobOf(proc, jobId).status).toBe('in_flight');
    expect(jobOf(proc, jobId).errorCode).toBeUndefined();
  });
});

// ----------------------------------------------------------------------------
// Ledger, key and input failures at claim
// ----------------------------------------------------------------------------

describe('claim failures (no call, no spend)', () => {
  // Phase 43 retires the $2 phase cap: the kill switch and the global ceiling replace it at claim
  // (PLANNING-NOTES item 2). The case that used to pin "phase ledger exhausted: failed 'billing'" is
  // flipped on purpose into the kill-switch case below: the old assertion was errorCode 'billing' after
  // the phase ledger passed $2; the new one is errorCode 'halted' after llmEnabled is turned off.
  /** A claim-time refusal ends the job as failed with the code, no call, and every reservation and call refunded. */
  function expectClaimRefusal(proc: Proc, jobId: bigint, outcome: string, deps: any, code: string): void {
    expect(outcome).toBe('failed');
    const job = jobOf(proc, jobId);
    expect(job.status).toBe('failed');
    expect(job.errorCode).toBe(code);
    expect(job.finishedAt).toBeDefined();
    expect(job.reservedMicroUsd).toBe(0n);
    expect(job.attempt).toBe(0n);
    expect(playerDay(proc).reservedMicroUsd).toBe(0n);
    expect(playerDay(proc).calls).toBe(0n);
    expect(playerDay(proc).spentMicroUsd).toBe(0n);
    expect(ledger(proc).reservedMicroUsd).toBe(0n);
    expect(ledger(proc).calls).toBe(0n);
    expect(ledger(proc).spentMicroUsd).toBe(0n);
    expect(deps.applyFailure).toHaveBeenCalledTimes(1);
    const applyJob = deps.applyFailure.mock.calls[0][1];
    expect(applyJob.playerId).toBe(alice);
    expect(applyJob.domain).toBe('npc_conversation');
    expect(applyJob.errorCode).toBe(code);
    expect(proc.http.calls).toHaveLength(0);
    expect(rows(proc, 'llm_dispatch')).toHaveLength(0);
  }

  it("kill switch off after enqueue: failed 'halted', reservation and call refunded, applyFailure once for the job's player, no call", () => {
    const proc = makeProc();
    const jobId = enqueue(proc, 'npc_conversation');
    const arg = takeDispatch(proc, jobId);
    expect(ledger(proc).reservedMicroUsd).toBeGreaterThan(0n);
    proc.ctx.withTx((tx: any) => setLlmEnabled(tx, false));
    const deps = makeDeps(proc);

    const outcome = runLlmJob(proc.ctx, arg, deps);

    expectClaimRefusal(proc, jobId, outcome, deps, 'halted');
  });

  it("a missing admin-state row after enqueue fails closed: failed 'halted' with the same refunds", () => {
    const proc = makeProc();
    const jobId = enqueue(proc, 'npc_conversation');
    const arg = takeDispatch(proc, jobId);
    proc.ctx.withTx((tx: any) => tx.db.llm_admin_state.id.delete(1n));
    expect(rows(proc, 'llm_admin_state')).toHaveLength(0);
    const deps = makeDeps(proc);

    const outcome = runLlmJob(proc.ctx, arg, deps);

    expectClaimRefusal(proc, jobId, outcome, deps, 'halted');
  });

  it("ceiling lowered below the job's own reservation after enqueue: failed 'ceiling' with the same refunds and no call", () => {
    const proc = makeProc();
    const jobId = enqueue(proc, 'npc_conversation');
    const arg = takeDispatch(proc, jobId);
    const reserved = jobOf(proc, jobId).reservedMicroUsd as bigint;
    proc.ctx.withTx((tx: any) => patchAdminState(tx, { dailyCeilingMicroUsd: reserved - 1n }));
    const deps = makeDeps(proc);

    const outcome = runLlmJob(proc.ctx, arg, deps);

    expectClaimRefusal(proc, jobId, outcome, deps, 'ceiling');
  });

  it('a ceiling exactly equal to the job reservation still admits it (the boundary is inclusive)', () => {
    const proc = makeProc();
    const jobId = enqueue(proc, 'npc_conversation');
    const arg = takeDispatch(proc, jobId);
    const reserved = jobOf(proc, jobId).reservedMicroUsd as bigint;
    proc.ctx.withTx((tx: any) => patchAdminState(tx, { dailyCeilingMicroUsd: reserved }));
    expect(claimLlmJob(proc.ctx, arg, makeDeps(proc)).kind).toBe('run');
  });

  it('claim order: queued jobs competing for the last headroom are admitted in claim order and the rest refused, each refund once', () => {
    const proc = makeProc();
    const ids = [enqueue(proc, 'npc_conversation'), enqueue(proc, 'npc_conversation'), enqueue(proc, 'npc_conversation')];
    const args = ids.map((id) => takeDispatch(proc, id));
    const r = jobOf(proc, ids[0]).reservedMicroUsd as bigint;
    expect(jobOf(proc, ids[1]).reservedMicroUsd).toBe(r);
    expect(jobOf(proc, ids[2]).reservedMicroUsd).toBe(r);
    const s = 500n;
    // Today's spend s, then the ceiling set to s + 2r: room for exactly two of the three.
    proc.ctx.withTx((tx: any) => {
      const l = tx.db.llm_spend.id.find(1n);
      tx.db.llm_spend.id.update({ ...l, dayUtc: utcDay({ microsSinceUnixEpoch: T0 }), daySpentMicroUsd: s, spentMicroUsd: s });
      patchAdminState(tx, { dailyCeilingMicroUsd: s + 2n * r });
    });
    const deps = makeDeps(proc);

    const first = claimLlmJob(proc.ctx, args[0], deps);
    const second = claimLlmJob(proc.ctx, args[1], deps);
    const third = claimLlmJob(proc.ctx, args[2], deps);

    expect(first.kind).toBe('run');
    expect(second.kind).toBe('run');
    expect(third.kind).toBe('failed');
    expect(jobOf(proc, ids[0]).status).toBe('in_flight');
    expect(jobOf(proc, ids[1]).status).toBe('in_flight');
    expect(jobOf(proc, ids[2]).status).toBe('failed');
    expect(jobOf(proc, ids[2]).errorCode).toBe('ceiling');
    // The ledger holds only what the two admitted jobs still hold; the refused job's call is refunded.
    expect(ledger(proc).reservedMicroUsd).toBe(2n * r);
    expect(ledger(proc).calls).toBe(2n);
    expect(playerDay(proc).reservedMicroUsd).toBe(2n * r);
    expect(playerDay(proc).calls).toBe(2n);
    expect(deps.applyFailure).toHaveBeenCalledTimes(1);
    expect(deps.applyFailure.mock.calls[0][1].errorCode).toBe('ceiling');
    expect(proc.http.calls).toHaveLength(0);
  });

  it('refund once: the sweeper leaves the ledger and the player day unchanged after a claim-time halted or ceiling refusal', () => {
    for (const code of ['halted', 'ceiling'] as const) {
      const proc = makeProc();
      const jobId = enqueue(proc, 'npc_conversation');
      const arg = takeDispatch(proc, jobId);
      proc.ctx.withTx((tx: any) => (code === 'halted' ? setLlmEnabled(tx, false) : patchAdminState(tx, { dailyCeilingMicroUsd: 1n })));
      expect(runLlmJob(proc.ctx, arg, makeDeps(proc))).toBe('failed');
      expect(jobOf(proc, jobId).errorCode).toBe(code);
      const ledgerBefore = { ...ledger(proc) };
      const dayBefore = { ...playerDay(proc) };

      proc.clock.advance(3_600_000_000n);
      proc.ctx.withTx((tx: any) => sweepLlmJobs(tx, { applyFailure: () => {}, log: () => {} }));

      expect(ledger(proc).reservedMicroUsd).toBe(ledgerBefore.reservedMicroUsd);
      expect(ledger(proc).calls).toBe(ledgerBefore.calls);
      expect(ledger(proc).spentMicroUsd).toBe(ledgerBefore.spentMicroUsd);
      expect(playerDay(proc).reservedMicroUsd).toBe(dayBefore.reservedMicroUsd);
      expect(playerDay(proc).calls).toBe(dayBefore.calls);
      expect(playerDay(proc).spentMicroUsd).toBe(dayBefore.spentMicroUsd);
      expect(ledger(proc).reservedMicroUsd).toBe(0n);
      expect(ledger(proc).calls).toBe(0n);
      expect(jobOf(proc, jobId).status).toBe('failed');
    }
  });

  it('a creation_race job halted at claim returns the creation state to AWAITING_RACE through the real failure apply and posts the resting line once', () => {
    const proc = makeProc([], { seed: { character_creation_state: [{ id: 1n, playerId: alice, step: 'GENERATING_RACE' }] } });
    const jobId = enqueue(proc, 'creation_race', { sourceKey: SOURCE_KEYS.creation(1n, 'race') });
    const arg = takeDispatch(proc, jobId);
    proc.ctx.withTx((tx: any) => setLlmEnabled(tx, false));
    const deps = makeDeps(proc, { applyFailure: applyLlmFailure as any });

    expect(runLlmJob(proc.ctx, arg, deps)).toBe('failed');

    expect(rows(proc, 'character_creation_state')[0].step).toBe('AWAITING_RACE');
    const posted = (appendCreationEvent as any).mock.calls;
    expect(posted).toHaveLength(1);
    expect(posted[0]).toContain(LLM_RESTING_LINE);
  });

  it('in-flight finishes: flipping the kill switch off after the claim committed does not stop the job (it completes, applies and settles)', () => {
    const proc = makeProc([reply('ok_text')]);
    const jobId = enqueue(proc, 'npc_conversation');
    const arg = takeDispatch(proc, jobId);
    let flipped = false;
    const deps = makeDeps(proc, {
      nowMs: () => {
        if (!flipped) {
          flipped = true;
          proc.ctx.withTx((tx: any) => setLlmEnabled(tx, false));
        }
        return Number(proc.clock.now() / 1000n);
      },
    });

    const outcome = runLlmJob(proc.ctx, arg, deps);

    expect(flipped).toBe(true);
    expect(rows(proc, 'llm_admin_state')[0].llmEnabled).toBe(false);
    expect(outcome).toBe('completed');
    expect(proc.http.calls).toHaveLength(1);
    expect(jobOf(proc, jobId).status).toBe('completed');
    expect(deps.apply).toHaveBeenCalledTimes(1);
    expect(deps.applyFailure).not.toHaveBeenCalled();
    expect(jobOf(proc, jobId).costMicroUsd).toBe(FIXTURE_COST);
    expect(ledger(proc).spentMicroUsd).toBe(FIXTURE_COST);
    expect(ledger(proc).reservedMicroUsd).toBe(0n);
    expect(playerDay(proc).spentMicroUsd).toBe(FIXTURE_COST);
  });

  it("a smoke job halted at claim records a smoke failure with class 'halted' and never calls applyFailure", () => {
    const proc = makeProc();
    const jobId = enqueue(proc, 'smoke_test', { request: { smoke: true }, budget: 'phase_only' });
    const arg = takeDispatch(proc, jobId);
    proc.ctx.withTx((tx: any) => setLlmEnabled(tx, false));
    const deps = makeDeps(proc);

    expect(runLlmJob(proc.ctx, arg, deps)).toBe('failed');

    expect(deps.applyFailure).not.toHaveBeenCalled();
    expect(jobOf(proc, jobId).errorCode).toBe('halted');
    const smoke = JSON.parse(rows(proc, 'llm_admin_state')[0].lastSmokeJson);
    expect(smoke.smoke_test.ok).toBe(false);
    expect(smoke.smoke_test.class).toBe('halted');
    expect(proc.http.calls).toHaveLength(0);
  });

  it('the kill switch is checked before the ceiling, and both before the in-flight cap (a stopped job is refunded, never deferred)', () => {
    const proc = makeProc();
    seedInFlight(proc, 4);
    const jobId = enqueue(proc, 'npc_conversation');
    const arg = takeDispatch(proc, jobId);
    proc.ctx.withTx((tx: any) => setLlmEnabled(tx, false));
    expect(runLlmJob(proc.ctx, arg, makeDeps(proc))).toBe('failed');
    expect(jobOf(proc, jobId).errorCode).toBe('halted');
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

  // WR-A01: the terminal status and the in-voice failure message commit together, so a crash
  // between two transactions can no longer leave a terminal job with its domain lock still held.
  describe('the failure message commits with the terminal status (WR-A01)', () => {
    /** Wrap withTx so the state at the end of every committed transaction is recorded. */
    const recordCommits = (proc: Proc, jobId: bigint) => {
      const commits: { jobStatus: string; step: string }[] = [];
      const orig = proc.ctx.withTx.bind(proc.ctx);
      (proc.ctx as any).withTx = (body: any) => {
        const out = orig(body);
        commits.push({ jobStatus: jobOf(proc, jobId).status, step: rows(proc, 'character_creation_state')[0].step });
        return out;
      };
      return commits;
    };
    const creationProc = (responses: Array<MockReply | MockThrow>, seed: Record<string, any[]> = {}) =>
      makeProc(responses, {
        seed: { character_creation_state: [{ id: 1n, playerId: alice, step: 'GENERATING_RACE' }], ...seed },
      });

    it.each([
      ['a claim failure (missing key)', () => creationProc([], { llm_config: [] })],
      ['a call failure (500, creation never retries)', () => creationProc([fixture('err_500')])],
      ['a build failure (bad route input)', () => creationProc([])],
    ])('%s: the transaction that fails the job also returns the creation step', (label, makeP) => {
      const proc = makeP();
      const jobId = enqueue(proc, 'creation_race', {
        sourceKey: SOURCE_KEYS.creation(1n, 'race'),
        ...(label.startsWith('a build') ? { request: { input: {} } } : {}),
      });
      const commits = recordCommits(proc, jobId);
      const deps = makeDeps(proc, { applyFailure: applyLlmFailure as any });

      expect(run(proc, jobId, deps)).toBe('failed');

      const firstFailed = commits.find((c) => c.jobStatus === 'failed');
      expect(firstFailed).toEqual({ jobStatus: 'failed', step: 'AWAITING_RACE' });
    });

    it('a throwing message rolls back its own partial writes; the status and refund still commit', () => {
      const proc = creationProc([], { llm_config: [] });
      const jobId = enqueue(proc, 'creation_race', { sourceKey: SOURCE_KEYS.creation(1n, 'race') });
      const deps = makeDeps(proc, {
        applyFailure: vi.fn((tx: any) => {
          tx.db.event_creation.insert({ id: 0n, playerId: alice, kind: 'creation_error', message: 'half', createdAt: tx.timestamp });
          throw new Error('message bug');
        }) as any,
      });

      expect(run(proc, jobId, deps)).toBe('failed');
      expect(jobOf(proc, jobId)).toMatchObject({ status: 'failed', errorCode: 'auth', reservedMicroUsd: 0n });
      expect(rows(proc, 'event_creation')).toHaveLength(0);
      expect(deps.applyFailure).toHaveBeenCalledTimes(1);
      // The lock stays for the sweeper's stranded-lock rule (llm_sweeper.test.ts).
      expect(rows(proc, 'character_creation_state')[0].step).toBe('GENERATING_RACE');
    });
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

// ============================================================================
// Task 2: the call, persist, retry, settlement, apply, smoke and redaction paths
// ============================================================================

const FIXTURE_DIR = fileURLToPath(new URL('./__fixtures__/claude/', import.meta.url));
const fixture = (name: string): any => JSON.parse(readFileSync(join(FIXTURE_DIR, `${name}.json`), 'utf8'));

/** ok_json fixture with the text block replaced by the given text. */
function okReply(text: string): any {
  const f = fixture('ok_json');
  f.body.content[0].text = text;
  return f;
}

const PERKS = [
  { name: 'Merchant Favor', perkDomain: 'social', perkEffectJson: '{"vendorSellBonus":5}' },
  { name: 'Whisper Network', perkDomain: 'social', perkEffectJson: '{"npcAffinityGainBonus":2}' },
  { name: 'Iron Constitution', perkDomain: 'combat', perkEffectJson: '{"maxHp":25}' },
].map((p) => ({
  name: p.name,
  description: `A plain description of ${p.name}.`,
  kind: '',
  targetRule: 'self',
  resourceType: 'none',
  resourceCost: 0,
  castSeconds: 0,
  cooldownSeconds: 0,
  scaling: 'none',
  value1: 0,
  value2: null,
  damageType: null,
  effectType: null,
  effectMagnitude: null,
  effectDuration: null,
  perkEffectJson: p.perkEffectJson,
  perkDomain: p.perkDomain,
}));

const threePerkReply = (extra: Record<string, unknown> = {}): any => ({
  ...okReply(JSON.stringify({ perks: PERKS })),
  ...extra,
});

/** Usage of the ok_json, ok_text, refusal and max_tokens fixtures. */
const FIXTURE_USAGE = { input: 116, output: 562, cacheWrite: 0, cacheRead: 3727 };
const FIXTURE_COST = BigInt(estimateCostMicroUsd(FIXTURE_USAGE));

const renownSeed = (): Record<string, any[]> => ({
  renown: [{ id: 1n, characterId: 1n, points: 90n, currentRank: 1n }],
});

/** Trigger a renown rank-up (90 + 20 points = rank 2) and return the enqueued job id. */
function enqueueRenownJob(proc: Proc): bigint {
  proc.ctx.withTx((tx: any) => awardRenown(tx, character(), 20n, 'test'));
  const jobs = rows(proc, 'llm_job');
  expect(jobs).toHaveLength(1);
  return jobs[0].id;
}

/** Real apply and failure functions wrapped in spies. */
function realDeps(proc: Proc, over: Partial<ExecutorDeps> = {}) {
  return makeDeps(proc, {
    apply: vi.fn(applyLlmResult) as any,
    applyFailure: vi.fn(applyLlmFailure) as any,
    ...over,
  });
}

/** Rows of every table except llm_config, as one string. */
function snapshotWithoutConfig(proc: Proc): string {
  const all = JSON.parse(snapshotDb(proc.db));
  delete all.llm_config;
  return JSON.stringify(all);
}

/** Game tables only: every llm_ table and every empty table is dropped. */
const gameTablesSnapshot = (proc: Proc): string => {
  const all = JSON.parse(snapshotDb(proc.db));
  for (const k of Object.keys(all)) {
    if (k.startsWith('llm_') || all[k].length === 0) delete all[k];
  }
  return JSON.stringify(all);
};

const callLogs = (proc: Proc, jobId: bigint): any[] =>
  rows(proc, 'llm_call_log')
    .filter((r) => r.jobId === jobId)
    .sort((a, b) => (a.attempt < b.attempt ? -1 : a.attempt > b.attempt ? 1 : 0));

const reply = (name: string, over: Record<string, unknown> = {}): any => ({ ...fixture(name), ...over });

beforeEach(() => {
  vi.clearAllMocks();
});

describe('ok reply: call, persist, apply (PIPE-09, PIPE-02, COST-01)', () => {
  it('renown ok JSON: one POST with the key only in x-api-key, job completed, usage, cost, perks for the stored player, one call-log row, money settled', () => {
    const proc = makeProc([threePerkReply({ advanceMicros: 2_300_000n })], { seed: renownSeed() });
    const jobId = enqueueRenownJob(proc);
    const reserved = jobOf(proc, jobId).reservedMicroUsd;
    expect(reserved).toBeGreaterThan(0n);
    const deps = realDeps(proc);

    const outcome = run(proc, jobId, deps);

    expect(outcome).toBe('completed');
    expect(proc.http.calls).toHaveLength(1);
    const call = proc.http.calls[0];
    expect(call.url).toBe(ANTHROPIC_MESSAGES_URL);
    expect(call.method).toBe('POST');
    expect(call.headers['x-api-key']).toBe(FAKE_KEY);
    expect(call.body as string).not.toContain(FAKE_KEY);
    expect(call.timeoutMs).toBe(LLM_ROUTES.renown_perk_gen.timeoutMs);

    const job = jobOf(proc, jobId);
    expect(job.status).toBe('completed');
    expect(job.attempt).toBe(1n);
    expect(job.errorCode).toBeUndefined();
    expect(job.stopReason).toBe('end_turn');
    expect(job.requestId).toBe('req_011CTestOkFixture');
    expect(JSON.parse(job.resultText).perks).toHaveLength(3);
    expect(job.inputTokens).toBe(116n);
    expect(job.outputTokens).toBe(562n);
    expect(job.cacheWriteTokens).toBe(0n);
    expect(job.cacheReadTokens).toBe(3727n);
    expect(job.costMicroUsd).toBe(FIXTURE_COST);
    expect(job.reservedMicroUsd).toBe(0n);
    expect(job.startedAt).toBeDefined();
    expect(job.finishedAt).toBeDefined();

    // Applied for the stored player (alice), never the module identity.
    expect(deps.apply).toHaveBeenCalledTimes(1);
    expect(deps.apply.mock.calls[0][1].playerId).toBe(alice);
    expect(deps.apply.mock.calls[0][1].domain).toBe('renown_perk_gen');
    const perks = rows(proc, 'pending_renown_perk');
    expect(perks).toHaveLength(3);
    expect(perks.every((p) => p.characterId === 1n && p.rank === 2n)).toBe(true);

    const logs = callLogs(proc, jobId);
    expect(logs).toHaveLength(1);
    expect(logs[0].outcome).toBe('ok');
    expect(logs[0].attempt).toBe(1n);
    expect(logs[0].httpStatus).toBe(200n);
    expect(logs[0].inputTokens).toBe(116n);
    expect(logs[0].outputTokens).toBe(562n);
    expect(logs[0].cacheWriteTokens).toBe(0n);
    expect(logs[0].cacheReadTokens).toBe(3727n);
    expect(logs[0].costMicroUsd).toBe(FIXTURE_COST);
    expect(logs[0].dispatchLateMs).toBe(0n);
    expect(logs[0].latencyMs).toBe(2300n);
    expect(logs[0].playerId).toBe(alice);

    expect(playerDay(proc).spentMicroUsd).toBe(FIXTURE_COST);
    expect(playerDay(proc).reservedMicroUsd).toBe(0n);
    expect(ledger(proc).spentMicroUsd).toBe(FIXTURE_COST);
    expect(ledger(proc).reservedMicroUsd).toBe(0n);
  });

  it('records the dispatch lateness on the call-log row', () => {
    const proc = makeProc([threePerkReply()], { seed: renownSeed() });
    const jobId = enqueueRenownJob(proc);
    proc.clock.advance(1_500_000n);
    run(proc, jobId, realDeps(proc));
    expect(callLogs(proc, jobId)[0].dispatchLateMs).toBe(1500n);
  });

  it('emits one module log line with route, job, attempt, outcome, status, ms and the four counts, and no text', () => {
    const proc = makeProc([threePerkReply({ advanceMicros: 1_000_000n })], { seed: renownSeed() });
    const jobId = enqueueRenownJob(proc);
    const deps = realDeps(proc);
    run(proc, jobId, deps);
    expect(deps.log).toHaveBeenCalledTimes(1);
    const line = String(deps.log.mock.calls[0][0]);
    expect(line).toContain('route=renown_perk_gen');
    expect(line).toContain(`job=${jobId}`);
    expect(line).toContain('attempt=1');
    expect(line).toContain('outcome=ok');
    expect(line).toContain('status=200');
    expect(line).toContain('ms=1000');
    expect(line).toContain('in=116');
    expect(line).toContain('out=562');
    expect(line).toContain('cw=0');
    expect(line).toContain('cr=3727');
    expect(line).not.toContain('Merchant Favor');
    expect(line).not.toContain(FAKE_KEY);
  });

  it('the job row accumulates the counts of every attempt; each attempt has its own call-log row', () => {
    const proc = makeProc([threePerkReply()], { seed: renownSeed() });
    const jobId = enqueueRenownJob(proc);
    // Prior counts on the row, as if attempt 1 had been billed.
    proc.ctx.withTx((tx: any) => {
      const j = tx.db.llm_job.id.find(jobId);
      tx.db.llm_job.id.update({ ...j, attempt: 1n, inputTokens: 5n, outputTokens: 6n, cacheWriteTokens: 7n, cacheReadTokens: 8n });
    });
    run(proc, jobId, realDeps(proc));
    const job = jobOf(proc, jobId);
    expect(job.attempt).toBe(2n);
    expect(job.inputTokens).toBe(121n);
    expect(job.outputTokens).toBe(568n);
    expect(job.cacheWriteTokens).toBe(7n);
    expect(job.cacheReadTokens).toBe(3735n);
    const logs = callLogs(proc, jobId);
    expect(logs).toHaveLength(1);
    expect(logs[0].attempt).toBe(2n);
    expect(logs[0].inputTokens).toBe(116n);
  });

  it('the call timeout comes from LLM_ROUTES for a text route too', () => {
    const proc = makeProc([reply('ok_text')]);
    const jobId = enqueue(proc, 'npc_conversation');
    run(proc, jobId);
    expect(proc.http.calls[0].timeoutMs).toBe(LLM_ROUTES.npc_conversation.timeoutMs);
  });

  it('a job whose request cannot be built fails bad_request with a refunded call, no fetch and a failure message', () => {
    const proc = makeProc();
    const jobId = enqueue(proc, 'npc_conversation', { request: { input: {} } });
    const deps = makeDeps(proc);
    const outcome = run(proc, jobId, deps);
    expect(outcome).toBe('failed');
    const job = jobOf(proc, jobId);
    expect(job.status).toBe('failed');
    expect(job.errorCode).toBe('bad_request');
    expect(job.reservedMicroUsd).toBe(0n);
    expect(playerDay(proc).calls).toBe(0n);
    expect(ledger(proc).reservedMicroUsd).toBe(0n);
    expect(proc.http.calls).toHaveLength(0);
    expect(deps.applyFailure).toHaveBeenCalledTimes(1);
  });
});

describe('retry by class (PIPE-04)', () => {
  it('429 with retry-after 30 on npc_conversation attempt 1: pending, rate_limit, one new dispatch at persist time plus the delay, reservation held, player untouched', () => {
    const r = reply('err_429_retry_after');
    r.headers = { ...r.headers, 'retry-after': '30' };
    const proc = makeProc([r]);
    const jobId = enqueue(proc, 'npc_conversation');
    const reserved = jobOf(proc, jobId).reservedMicroUsd;
    const deps = makeDeps(proc);

    const outcome = run(proc, jobId, deps);

    expect(outcome).toBe('retry');
    const job = jobOf(proc, jobId);
    expect(job.status).toBe('pending');
    expect(job.errorCode).toBe('rate_limit');
    expect(job.attempt).toBe(1n);
    expect(job.finishedAt).toBeUndefined();
    const dueMicros = T0 + msToMicros(retryDelayMs(1, 30, jobId));
    expect(job.nextAttemptAt.microsSinceUnixEpoch).toBe(dueMicros);
    const dispatches = rows(proc, 'llm_dispatch');
    expect(dispatches).toHaveLength(1);
    expect(dispatches[0].jobId).toBe(jobId);
    expect(scheduledMicros(dispatches[0].scheduledAt)).toBe(dueMicros);
    expect(job.reservedMicroUsd).toBe(reserved);
    expect(playerDay(proc).spentMicroUsd).toBe(0n);
    expect(playerDay(proc).calls).toBe(1n);
    expect(ledger(proc).spentMicroUsd).toBe(0n);
    expect(ledger(proc).reservedMicroUsd).toBe(reserved);
    expect(deps.applyFailure).not.toHaveBeenCalled();
    const log = callLogs(proc, jobId)[0];
    expect(log.outcome).toBe('rate_limit');
    expect(log.httpStatus).toBe(429n);
    expect(log.costMicroUsd).toBe(0n);
  });

  it('retry-after 61 is capped at 60 s plus jitter', () => {
    const r = reply('err_429_retry_after');
    r.headers = { ...r.headers, 'retry-after': '61' };
    const proc = makeProc([r]);
    const jobId = enqueue(proc, 'npc_conversation');
    run(proc, jobId);
    const delay = jobOf(proc, jobId).nextAttemptAt.microsSinceUnixEpoch - T0;
    expect(delay).toBeGreaterThanOrEqual(60_000_000n);
    expect(delay).toBeLessThan(60_400_000n);
  });

  it('529 then 500 then 500: the third attempt is terminal, refunded, one failure message, three call-log rows 1n 2n 3n', () => {
    const proc = makeProc([reply('err_529'), reply('err_500'), reply('err_500')]);
    const jobId = enqueue(proc, 'npc_conversation');
    const deps = makeDeps(proc);

    expect(run(proc, jobId, deps)).toBe('retry');
    expect(jobOf(proc, jobId).errorCode).toBe('overloaded');
    proc.clock.advance(3_000_000n);
    expect(run(proc, jobId, deps)).toBe('retry');
    expect(jobOf(proc, jobId).errorCode).toBe('server');
    expect(jobOf(proc, jobId).attempt).toBe(2n);
    proc.clock.advance(10_000_000n);
    expect(run(proc, jobId, deps)).toBe('failed');

    const job = jobOf(proc, jobId);
    expect(job.status).toBe('failed');
    expect(job.errorCode).toBe('server');
    expect(job.attempt).toBe(3n);
    expect(job.reservedMicroUsd).toBe(0n);
    expect(rows(proc, 'llm_dispatch')).toHaveLength(0);
    expect(playerDay(proc).calls).toBe(0n);
    expect(playerDay(proc).reservedMicroUsd).toBe(0n);
    expect(playerDay(proc).spentMicroUsd).toBe(0n);
    expect(ledger(proc).calls).toBe(0n);
    expect(ledger(proc).reservedMicroUsd).toBe(0n);
    expect(ledger(proc).spentMicroUsd).toBe(0n);
    expect(deps.applyFailure).toHaveBeenCalledTimes(1);
    expect(deps.applyFailure.mock.calls[0][1].playerId).toBe(alice);
    expect(proc.http.calls).toHaveLength(3);
    const logs = callLogs(proc, jobId);
    expect(logs.map((l) => l.attempt)).toEqual([1n, 2n, 3n]);
    expect(logs.map((l) => l.outcome)).toEqual(['overloaded', 'server', 'server']);
  });

  it('a retry dispatched before it is due makes no second call', () => {
    const proc = makeProc([reply('err_529'), reply('ok_text')]);
    const jobId = enqueue(proc, 'npc_conversation');
    run(proc, jobId);
    // A stray dispatch arrives before the retry is due and nothing else is scheduled: re-dispatch only.
    const early = { scheduledId: 77n, scheduledAt: ScheduleAt.time(T0), jobId };
    rows(proc, 'llm_dispatch').length = 0;
    expect(runLlmJob(proc.ctx, early, makeDeps(proc))).toBe('redispatch');
    expect(proc.http.calls).toHaveLength(1);
    expect(rows(proc, 'llm_dispatch')).toHaveLength(1);
  });

  it('thrown timeouts on skill_gen: ledger grows by the reservation at each attempt, terminal at attempt 3, player untouched, call refunded', () => {
    const proc = makeProc([{ throw: 'timeout' }, { throw: 'timeout' }, { throw: 'timeout' }]);
    const jobId = enqueue(proc, 'skill_gen');
    const reserved = jobOf(proc, jobId).reservedMicroUsd;
    const deps = makeDeps(proc);

    expect(run(proc, jobId, deps)).toBe('retry');
    expect(ledger(proc).spentMicroUsd).toBe(reserved);
    expect(jobOf(proc, jobId).reservedMicroUsd).toBe(reserved);
    proc.clock.advance(3_000_000n);
    expect(run(proc, jobId, deps)).toBe('retry');
    expect(ledger(proc).spentMicroUsd).toBe(reserved * 2n);
    proc.clock.advance(10_000_000n);
    expect(run(proc, jobId, deps)).toBe('failed');

    expect(ledger(proc).spentMicroUsd).toBe(reserved * 3n);
    expect(ledger(proc).reservedMicroUsd).toBe(0n);
    expect(jobOf(proc, jobId).status).toBe('failed');
    expect(jobOf(proc, jobId).errorCode).toBe('timeout');
    expect(playerDay(proc).spentMicroUsd).toBe(0n);
    expect(playerDay(proc).reservedMicroUsd).toBe(0n);
    expect(playerDay(proc).calls).toBe(0n);
    expect(deps.applyFailure).toHaveBeenCalledTimes(1);
    const logs = callLogs(proc, jobId);
    expect(logs.map((l) => l.costMicroUsd)).toEqual([reserved, reserved, reserved]);
    expect(logs.map((l) => l.httpStatus)).toEqual([0n, 0n, 0n]);
  });

  it('creation_race thrown timeout at attempt 1: failed at once, no dispatch, creation state back at AWAITING_RACE, ledger charged, player not', () => {
    const proc = makeProc([{ throw: 'timeout' }], {
      seed: { character_creation_state: [{ id: 1n, playerId: alice, step: 'GENERATING_RACE' }] },
    });
    const jobId = enqueue(proc, 'creation_race', { sourceKey: SOURCE_KEYS.creation(1n, 'race') });
    const reserved = jobOf(proc, jobId).reservedMicroUsd;
    expect(run(proc, jobId, realDeps(proc))).toBe('failed');
    expect(jobOf(proc, jobId).status).toBe('failed');
    expect(jobOf(proc, jobId).errorCode).toBe('timeout');
    expect(rows(proc, 'llm_dispatch')).toHaveLength(0);
    expect(rows(proc, 'character_creation_state')[0].step).toBe('AWAITING_RACE');
    expect(ledger(proc).spentMicroUsd).toBe(reserved);
    expect(playerDay(proc).spentMicroUsd).toBe(0n);
    expect(playerDay(proc).calls).toBe(0n);
    expect(proc.http.calls).toHaveLength(1);
  });

  // WR-A05: a 2xx whose body is not JSON was run (and billed) by Anthropic: the ledger is charged.
  it('a 200 with a non-JSON body on npc_conversation retries and charges the ledger the reservation, player untouched', () => {
    const proc = makeProc([reply('non_json_200')]);
    const jobId = enqueue(proc, 'npc_conversation');
    const reserved = jobOf(proc, jobId).reservedMicroUsd;
    expect(run(proc, jobId)).toBe('retry');
    expect(jobOf(proc, jobId).errorCode).toBe('server');
    expect(ledger(proc).spentMicroUsd).toBe(reserved);
    expect(jobOf(proc, jobId).reservedMicroUsd).toBe(reserved);
    expect(playerDay(proc).spentMicroUsd).toBe(0n);
    expect(callLogs(proc, jobId).map((l) => [l.httpStatus, l.costMicroUsd])).toEqual([[200n, reserved]]);
  });

  it('a 200 with a non-JSON body on creation_race fails at once with the ledger charged and the player not', () => {
    const proc = makeProc([reply('non_json_200')]);
    const jobId = enqueue(proc, 'creation_race', { sourceKey: SOURCE_KEYS.creation(1n, 'race') });
    const reserved = jobOf(proc, jobId).reservedMicroUsd;
    expect(run(proc, jobId)).toBe('failed');
    expect(ledger(proc).spentMicroUsd).toBe(reserved);
    expect(ledger(proc).reservedMicroUsd).toBe(0n);
    expect(playerDay(proc).spentMicroUsd).toBe(0n);
    expect(playerDay(proc).calls).toBe(0n);
  });

  it('a non-2xx server error (500) is not billed: the ledger stays at zero', () => {
    const proc = makeProc([reply('err_500')]);
    const jobId = enqueue(proc, 'creation_race', { sourceKey: SOURCE_KEYS.creation(1n, 'race') });
    expect(run(proc, jobId)).toBe('failed');
    expect(ledger(proc).spentMicroUsd).toBe(0n);
  });

  it('world_gen 529 at attempt 1: failed, no dispatch (a failure there waits for the player)', () => {
    const proc = makeProc([reply('err_529')]);
    const jobId = enqueue(proc, 'world_gen', { sourceKey: SOURCE_KEYS.worldGen(1n) });
    const deps = makeDeps(proc);
    expect(run(proc, jobId, deps)).toBe('failed');
    expect(jobOf(proc, jobId).status).toBe('failed');
    expect(jobOf(proc, jobId).errorCode).toBe('overloaded');
    expect(rows(proc, 'llm_dispatch')).toHaveLength(0);
    expect(deps.applyFailure).toHaveBeenCalledTimes(1);
    expect(proc.http.calls).toHaveLength(1);
  });

  it.each(['creation_race', 'creation_class', 'world_gen', 'combat_narration'] as LlmRoute[])(
    'never auto-retries %s: a 500 is terminal at attempt 1 with no dispatch',
    (route) => {
      const proc = makeProc([reply('err_500')]);
      const jobId = enqueue(proc, route);
      const outcome = run(proc, jobId);
      expect(outcome).toBe('failed');
      expect(rows(proc, 'llm_dispatch')).toHaveLength(0);
      expect(proc.http.calls).toHaveLength(1);
    },
  );

  it.each([
    ['err_401', 'auth'],
    ['err_429_spend_cap', 'billing'],
    ['err_400', 'bad_request'],
  ])('%s fails on the first attempt as %s with no retry, refunded', (name, code) => {
    const proc = makeProc([reply(name)]);
    const jobId = enqueue(proc, 'npc_conversation');
    const deps = makeDeps(proc);
    expect(run(proc, jobId, deps)).toBe('failed');
    const job = jobOf(proc, jobId);
    expect(job.status).toBe('failed');
    expect(job.errorCode).toBe(code);
    expect(job.attempt).toBe(1n);
    expect(rows(proc, 'llm_dispatch')).toHaveLength(0);
    expect(job.reservedMicroUsd).toBe(0n);
    expect(playerDay(proc).calls).toBe(0n);
    expect(playerDay(proc).spentMicroUsd).toBe(0n);
    expect(ledger(proc).spentMicroUsd).toBe(0n);
    expect(deps.applyFailure).toHaveBeenCalledTimes(1);
  });

  it('auth and billing failures clear keyLastCheckOk; a bad_request does not', () => {
    const verified = {
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
    };
    const bad = makeProc([reply('err_400')], { seed: verified });
    run(bad, enqueue(bad, 'npc_conversation'));
    expect(rows(bad, 'llm_admin_state')[0].keyLastCheckOk).toBe(true);

    for (const name of ['err_401', 'err_429_spend_cap']) {
      const proc = makeProc([reply(name)], { seed: verified });
      run(proc, enqueue(proc, 'npc_conversation'));
      expect(rows(proc, 'llm_admin_state')[0].keyLastCheckOk).toBe(false);
    }
  });

  it('a refusal (200, billed) fails as refusal and charges the player and the ledger the real cost', () => {
    const proc = makeProc([reply('refusal')]);
    const jobId = enqueue(proc, 'npc_conversation');
    const deps = makeDeps(proc);
    expect(run(proc, jobId, deps)).toBe('failed');
    const job = jobOf(proc, jobId);
    expect(job.status).toBe('failed');
    expect(job.errorCode).toBe('refusal');
    expect(job.stopReason).toBe('refusal');
    expect(job.inputTokens).toBe(116n);
    expect(job.outputTokens).toBe(562n);
    expect(job.costMicroUsd).toBe(FIXTURE_COST);
    expect(job.reservedMicroUsd).toBe(0n);
    expect(playerDay(proc).spentMicroUsd).toBe(FIXTURE_COST);
    expect(playerDay(proc).reservedMicroUsd).toBe(0n);
    expect(playerDay(proc).calls).toBe(1n);
    expect(ledger(proc).spentMicroUsd).toBe(FIXTURE_COST);
    expect(rows(proc, 'llm_dispatch')).toHaveLength(0);
    expect(deps.applyFailure).toHaveBeenCalledTimes(1);
    expect(callLogs(proc, jobId)[0].costMicroUsd).toBe(FIXTURE_COST);
  });

  it('the billed failure classes are exactly the six 200-with-unusable-content classes', () => {
    expect([...BILLED_FAILURE_CLASSES].sort()).toEqual(
      ['empty_output', 'invalid_json', 'refusal', 'schema_mismatch', 'truncated', 'unexpected_stop'],
    );
  });

  // Plan 51.3.1.1-32 (deferred row 31, owner 2026-10-09): a truncated npc_conversation reply is retried
  // ONCE automatically before the "seems distracted" line. The truncated attempt is billed and logged.
  it('npc_conversation truncated once: billed, logged as truncated, re-reserved and retried at once; the retry completes', () => {
    const proc = makeProc([reply('max_tokens'), reply('ok_text')]);
    const jobId = enqueue(proc, 'npc_conversation');
    const deps = makeDeps(proc);

    expect(run(proc, jobId, deps)).toBe('retry');

    const job = jobOf(proc, jobId);
    const persistAt = nowMicros(proc);
    expect(job.status).toBe('pending');
    expect(job.errorCode).toBe('truncated');
    expect(job.stopReason).toBe('max_tokens');
    expect(job.attempt).toBe(1n);
    expect(job.costMicroUsd).toBe(FIXTURE_COST);
    expect(job.reservedMicroUsd > 0n).toBe(true);
    expect(job.nextAttemptAt.microsSinceUnixEpoch).toBe(persistAt);
    const dispatches = rows(proc, 'llm_dispatch');
    expect(dispatches).toHaveLength(1);
    expect(dispatches[0].jobId).toBe(jobId);
    expect(scheduledMicros(dispatches[0].scheduledAt)).toBe(persistAt);
    // The truncated attempt is charged; a fresh reservation (and call) is held for the retry.
    expect(playerDay(proc).spentMicroUsd).toBe(FIXTURE_COST);
    expect(playerDay(proc).calls).toBe(2n);
    expect(playerDay(proc).reservedMicroUsd).toBe(job.reservedMicroUsd);
    expect(ledger(proc).spentMicroUsd).toBe(FIXTURE_COST);
    expect(ledger(proc).reservedMicroUsd).toBe(job.reservedMicroUsd);
    const logs = callLogs(proc, jobId);
    expect(logs).toHaveLength(1);
    expect(logs[0]).toMatchObject({ outcome: 'truncated', stopReason: 'max_tokens', costMicroUsd: FIXTURE_COST });
    expect(deps.applyFailure).not.toHaveBeenCalled();
    expect(deps.apply).not.toHaveBeenCalled();

    expect(run(proc, jobId, deps)).toBe('completed');
    expect(jobOf(proc, jobId).status).toBe('completed');
    expect(jobOf(proc, jobId).attempt).toBe(2n);
    expect(deps.apply).toHaveBeenCalledTimes(1);
    expect(deps.applyFailure).not.toHaveBeenCalled();
    expect(callLogs(proc, jobId).map((l) => l.outcome)).toEqual(['truncated', 'ok']);
    expect(jobOf(proc, jobId).reservedMicroUsd).toBe(0n);
    expect(playerDay(proc).reservedMicroUsd).toBe(0n);
    expect(ledger(proc).reservedMicroUsd).toBe(0n);
  });

  it('npc_conversation truncated twice: the second is terminal, one failure, both attempts billed, nothing held', () => {
    const proc = makeProc([reply('max_tokens'), reply('max_tokens')]);
    const jobId = enqueue(proc, 'npc_conversation');
    const deps = makeDeps(proc);

    expect(run(proc, jobId, deps)).toBe('retry');
    expect(run(proc, jobId, deps)).toBe('failed');

    const job = jobOf(proc, jobId);
    expect(job.status).toBe('failed');
    expect(job.errorCode).toBe('truncated');
    expect(job.attempt).toBe(2n);
    expect(job.costMicroUsd).toBe(FIXTURE_COST * 2n);
    expect(job.reservedMicroUsd).toBe(0n);
    expect(deps.applyFailure).toHaveBeenCalledTimes(1);
    expect(callLogs(proc, jobId).map((l) => [l.outcome, l.stopReason])).toEqual([
      ['truncated', 'max_tokens'],
      ['truncated', 'max_tokens'],
    ]);
    expect(playerDay(proc).spentMicroUsd).toBe(FIXTURE_COST * 2n);
    expect(playerDay(proc).reservedMicroUsd).toBe(0n);
    expect(playerDay(proc).calls).toBe(2n);
    expect(ledger(proc).spentMicroUsd).toBe(FIXTURE_COST * 2n);
    expect(ledger(proc).reservedMicroUsd).toBe(0n);
    expect(rows(proc, 'llm_dispatch')).toHaveLength(0);
  });

  it('a truncated skill_gen reply (max_tokens, billed) is terminal at once and charges the real cost', () => {
    const proc = makeProc([reply('max_tokens')]);
    const jobId = enqueue(proc, 'skill_gen');
    const deps = makeDeps(proc);
    expect(run(proc, jobId, deps)).toBe('failed');
    expect(jobOf(proc, jobId).errorCode).toBe('truncated');
    expect(playerDay(proc).spentMicroUsd).toBe(FIXTURE_COST);
    expect(playerDay(proc).calls).toBe(1n);
    expect(rows(proc, 'llm_dispatch')).toHaveLength(0);
    expect(deps.applyFailure).toHaveBeenCalledTimes(1);
    expect(callLogs(proc, jobId).map((l) => l.outcome)).toEqual(['truncated']);
  });

  it('npc_conversation truncated when the retry cannot be reserved (daily call cap): terminal at once', () => {
    const today = utcDay({ microsSinceUnixEpoch: T0 });
    const proc = makeProc([reply('max_tokens')], {
      seed: {
        llm_player_budget: [
          { id: 1n, playerId: alice, dayUtc: today, reservedMicroUsd: 0n, spentMicroUsd: 0n, calls: LLM_PLAYER_DAILY_CALLS - 1n },
        ],
      },
    });
    const jobId = enqueue(proc, 'npc_conversation');
    const deps = makeDeps(proc);
    expect(run(proc, jobId, deps)).toBe('failed');
    const job = jobOf(proc, jobId);
    expect(job.errorCode).toBe('truncated');
    expect(job.reservedMicroUsd).toBe(0n);
    expect(playerDay(proc).spentMicroUsd).toBe(FIXTURE_COST);
    expect(playerDay(proc).reservedMicroUsd).toBe(0n);
    expect(playerDay(proc).calls).toBe(LLM_PLAYER_DAILY_CALLS);
    expect(ledger(proc).reservedMicroUsd).toBe(0n);
    expect(rows(proc, 'llm_dispatch')).toHaveLength(0);
    expect(deps.applyFailure).toHaveBeenCalledTimes(1);
  });

  it('an ok reply whose usage is missing: completed; the ledger is charged the reservation, the player nothing', () => {
    const f = fixture('ok_text');
    delete f.body.usage;
    const proc = makeProc([f]);
    const jobId = enqueue(proc, 'npc_conversation');
    const reserved = jobOf(proc, jobId).reservedMicroUsd;
    const deps = makeDeps(proc);
    expect(run(proc, jobId, deps)).toBe('completed');
    expect(jobOf(proc, jobId).status).toBe('completed');
    expect(jobOf(proc, jobId).reservedMicroUsd).toBe(0n);
    expect(ledger(proc).spentMicroUsd).toBe(reserved);
    expect(ledger(proc).reservedMicroUsd).toBe(0n);
    expect(playerDay(proc).spentMicroUsd).toBe(0n);
    expect(playerDay(proc).reservedMicroUsd).toBe(0n);
    expect(callLogs(proc, jobId)[0].costMicroUsd).toBe(reserved);
  });

  it('an ok skill_gen reply settles the real cost against the player', () => {
    const proc = makeProc([reply('ok_json')]);
    const jobId = enqueue(proc, 'skill_gen');
    const deps = makeDeps(proc);
    expect(run(proc, jobId, deps)).toBe('completed');
    expect(playerDay(proc).spentMicroUsd).toBe(FIXTURE_COST);
    expect(deps.apply).toHaveBeenCalledTimes(1);
    expect(deps.apply.mock.calls[0][1].domain).toBe('skill_gen');
  });
});

describe('combat narration lateness at persist (PIPE-07)', () => {
  it('an ok reply persisted more than 20 s after enqueue is expired late: not applied, no message, player charged nothing, ledger records the real cost', () => {
    const proc = makeProc([reply('ok_combat_segments', { advanceMicros: 21_000_000n })]);
    const jobId = enqueue(proc, 'combat_narration');
    const deps = makeDeps(proc);
    const outcome = run(proc, jobId, deps);
    expect(outcome).toBe('expired');
    const job = jobOf(proc, jobId);
    expect(job.status).toBe('expired');
    expect(job.errorCode).toBe('late');
    expect(job.reservedMicroUsd).toBe(0n);
    expect(deps.apply).not.toHaveBeenCalled();
    expect(deps.applyFailure).not.toHaveBeenCalled();
    expect(rows(proc, 'combat_narrative')).toHaveLength(0);
    expect(vi.mocked(appendPrivateEvent)).not.toHaveBeenCalled();
    expect(playerDay(proc).spentMicroUsd).toBe(0n);
    expect(playerDay(proc).reservedMicroUsd).toBe(0n);
    expect(ledger(proc).spentMicroUsd).toBe(FIXTURE_COST);
    expect(callLogs(proc, jobId)).toHaveLength(1);
    expect(callLogs(proc, jobId)[0].outcome).toBe('ok');
  });

  it('a reply persisted exactly 20 s after enqueue is on time and is applied', () => {
    const proc = makeProc([reply('ok_combat_segments', { advanceMicros: 20_000_000n })]);
    const jobId = enqueue(proc, 'combat_narration');
    const deps = makeDeps(proc);
    expect(run(proc, jobId, deps)).toBe('completed');
    expect(deps.apply).toHaveBeenCalledTimes(1);
    expect(playerDay(proc).spentMicroUsd).toBe(FIXTURE_COST);
  });

  it('narration makes exactly one attempt: a 429 with retry-after is terminal and silent', () => {
    const proc = makeProc([reply('err_429_retry_after')]);
    const jobId = enqueue(proc, 'combat_narration');
    const deps = makeDeps(proc);
    expect(run(proc, jobId, deps)).toBe('failed');
    expect(rows(proc, 'llm_dispatch')).toHaveLength(0);
    expect(jobOf(proc, jobId).status).toBe('failed');
  });
});

describe('stale arrival (T-41-08)', () => {
  /**
   * The real sweeper expires the job while the call is in flight: the clock moves past the route
   * timeout plus the grace, and sweepLlmJobs runs in its own transaction (it charges the ledger the
   * reservation, because billing is unknown, and refunds the player).
   */
  const sweepMidCall = (proc: Proc) => {
    const originalFetch = proc.ctx.http.fetch.bind(proc.ctx.http);
    proc.ctx.http.fetch = (url: string, init: any) => {
      const res = originalFetch(url, init);
      proc.clock.advance(BigInt(LLM_ROUTES.npc_conversation.timeoutMs) * 1000n + 31_000_000n);
      proc.ctx.withTx((tx: any) => sweepLlmJobs(tx, { applyFailure: () => {}, log: () => {} }));
      return res;
    };
  };

  it('a reply arriving after the sweeper expired the job: the job stays expired, no apply, one call-log row, the ledger holds only the real cost (the stand-in is swapped, never added), player untouched', () => {
    const proc = makeProc([reply('ok_text')]);
    const jobId = enqueue(proc, 'npc_conversation');
    const reserved: bigint = jobOf(proc, jobId).reservedMicroUsd;
    expect(reserved).toBeGreaterThan(0n);
    sweepMidCall(proc);
    const deps = makeDeps(proc);

    const outcome = run(proc, jobId, deps);

    expect(outcome).toBe('stale');
    const job = jobOf(proc, jobId);
    expect(job.status).toBe('expired');
    expect(job.errorCode).toBe('timeout');
    expect(job.resultText).toBeUndefined();
    expect(job.ledgerChargedMicroUsd).toBe(0n);
    expect(job.costMicroUsd).toBe(FIXTURE_COST);
    expect(deps.apply).not.toHaveBeenCalled();
    expect(callLogs(proc, jobId)).toHaveLength(1);
    expect(ledger(proc).spentMicroUsd).toBe(FIXTURE_COST);
    expect(ledger(proc).reservedMicroUsd).toBe(0n);
    expect(playerDay(proc).spentMicroUsd).toBe(0n);
    expect(playerDay(proc).reservedMicroUsd).toBe(0n);
    expect(playerDay(proc).calls).toBe(0n);
  });

  it('the sweeper records its conservative charge on the job while the reply is outstanding', () => {
    const proc = makeProc([reply('ok_text')]);
    const jobId = enqueue(proc, 'npc_conversation');
    const reserved: bigint = jobOf(proc, jobId).reservedMicroUsd;
    let seen: any;
    const originalFetch = proc.ctx.http.fetch.bind(proc.ctx.http);
    proc.ctx.http.fetch = (url: string, init: any) => {
      const res = originalFetch(url, init);
      proc.clock.advance(BigInt(LLM_ROUTES.npc_conversation.timeoutMs) * 1000n + 31_000_000n);
      proc.ctx.withTx((tx: any) => sweepLlmJobs(tx, { applyFailure: () => {}, log: () => {} }));
      seen = { job: { ...jobOf(proc, jobId) }, spent: ledger(proc).spentMicroUsd };
      return res;
    };
    run(proc, jobId);
    expect(seen.job.status).toBe('expired');
    expect(seen.job.ledgerChargedMicroUsd).toBe(reserved);
    expect(seen.job.ledgerChargedDayUtc).toBe(utcDay({ microsSinceUnixEpoch: T0 }));
    expect(seen.spent).toBe(reserved);
  });

  it("a late reply after UTC midnight never takes yesterday's stand-in out of today's figure (review WR-A01)", () => {
    const proc = makeProc([reply('ok_text')]);
    const jobId = enqueue(proc, 'npc_conversation');
    const reserved: bigint = jobOf(proc, jobId).reservedMicroUsd;
    const todaysSpend = reserved * 3n; // real spend already booked on the new day
    let chargedDay = '';
    const originalFetch = proc.ctx.http.fetch.bind(proc.ctx.http);
    proc.ctx.http.fetch = (url: string, init: any) => {
      const res = originalFetch(url, init);
      proc.clock.advance(BigInt(LLM_ROUTES.npc_conversation.timeoutMs) * 1000n + 31_000_000n);
      proc.ctx.withTx((tx: any) => sweepLlmJobs(tx, { applyFailure: () => {}, log: () => {} }));
      chargedDay = jobOf(proc, jobId).ledgerChargedDayUtc;
      // Cross UTC midnight; another write rolls the day counter to the new day first.
      const dayMicros = 86_400_000_000n;
      proc.clock.advance(dayMicros - (proc.clock.now() % dayMicros) + 1_000_000n);
      proc.ctx.withTx((tx: any) => addLedgerSpend(tx, todaysSpend));
      return res;
    };

    expect(run(proc, jobId)).toBe('stale');

    const today = utcDay({ microsSinceUnixEpoch: proc.clock.now() });
    expect(chargedDay).toBe(utcDay({ microsSinceUnixEpoch: T0 }));
    expect(chargedDay).not.toBe(today);
    // Today's figure is today's real spend plus the real cost: never below it.
    expect(ledger(proc)).toMatchObject({ dayUtc: today, daySpentMicroUsd: todaysSpend + FIXTURE_COST });
    // The all-time figure swaps the stand-in for the real cost.
    expect(ledger(proc).spentMicroUsd).toBe(todaysSpend + FIXTURE_COST);
    expect(jobOf(proc, jobId)).toMatchObject({ ledgerChargedMicroUsd: 0n, ledgerChargedDayUtc: '' });
  });

  it('a late reply on the same UTC day swaps the stand-in out of the day figure too', () => {
    const proc = makeProc([reply('ok_text')]);
    const jobId = enqueue(proc, 'npc_conversation');
    sweepMidCall(proc);
    expect(run(proc, jobId)).toBe('stale');
    expect(ledger(proc)).toMatchObject({ spentMicroUsd: FIXTURE_COST, daySpentMicroUsd: FIXTURE_COST });
  });

  it('a late reply with no usage keeps the conservative charge and adds nothing', () => {
    const noUsage = reply('ok_text');
    noUsage.body = { ...noUsage.body };
    delete noUsage.body.usage;
    const proc = makeProc([noUsage]);
    const jobId = enqueue(proc, 'npc_conversation');
    const reserved: bigint = jobOf(proc, jobId).reservedMicroUsd;
    sweepMidCall(proc);

    expect(run(proc, jobId)).toBe('stale');
    expect(ledger(proc).spentMicroUsd).toBe(reserved);
    expect(jobOf(proc, jobId).ledgerChargedMicroUsd).toBe(reserved);
  });
});

describe('apply with a stored-text re-run (PIPE-02)', () => {
  it('apply throws once then succeeds: completed, applyAttempts 1n, exactly one fetch', () => {
    const proc = makeProc([reply('ok_text')]);
    const jobId = enqueue(proc, 'npc_conversation');
    const apply = vi.fn().mockImplementationOnce(() => {
      throw new Error('apply bug');
    });
    const deps = makeDeps(proc, { apply: apply as any });
    expect(run(proc, jobId, deps)).toBe('completed');
    expect(apply).toHaveBeenCalledTimes(2);
    expect(apply.mock.calls[1][2]).toBe(apply.mock.calls[0][2]);
    const job = jobOf(proc, jobId);
    expect(job.status).toBe('completed');
    expect(job.applyAttempts).toBe(1n);
    expect(proc.http.calls).toHaveLength(1);
    expect(deps.applyFailure).not.toHaveBeenCalled();
  });

  it("apply throws twice: failed 'apply_error', applyAttempts 2n, one failure message, exactly one fetch", () => {
    const proc = makeProc([reply('ok_text')]);
    const jobId = enqueue(proc, 'npc_conversation');
    const apply = vi.fn(() => {
      throw new Error('apply bug');
    });
    const deps = makeDeps(proc, { apply: apply as any });
    expect(run(proc, jobId, deps)).toBe('apply_failed');
    const job = jobOf(proc, jobId);
    expect(job.status).toBe('failed');
    expect(job.errorCode).toBe('apply_error');
    expect(job.applyAttempts).toBe(2n);
    expect(job.resultText).toBeDefined();
    expect(apply).toHaveBeenCalledTimes(2);
    expect(deps.applyFailure).toHaveBeenCalledTimes(1);
    expect(deps.applyFailure.mock.calls[0][1].playerId).toBe(alice);
    expect(proc.http.calls).toHaveLength(1);
    // The money was already settled at persist; a failed apply does not touch it.
    expect(playerDay(proc).spentMicroUsd).toBe(FIXTURE_COST);
  });

  it('a received job re-dispatched later is applied without any call', () => {
    const proc = makeProc();
    const job = seedJob(proc, { status: 'received', attempt: 1n, resultText: 'stored reply text' });
    const deps = makeDeps(proc);
    expect(run(proc, job.id, deps)).toBe('completed');
    expect(proc.http.calls).toHaveLength(0);
    expect(deps.apply).toHaveBeenCalledTimes(1);
    expect(deps.apply.mock.calls[0][2]).toBe('stored reply text');
    expect(jobOf(proc, job.id).status).toBe('completed');
  });

  it('a received job that has already used its apply attempts fails in voice without applying', () => {
    const proc = makeProc();
    const job = seedJob(proc, { status: 'received', attempt: 1n, resultText: 'stored', applyAttempts: 2n });
    const deps = makeDeps(proc);
    expect(run(proc, job.id, deps)).toBe('apply_failed');
    expect(deps.apply).not.toHaveBeenCalled();
    expect(deps.applyFailure).toHaveBeenCalledTimes(1);
    expect(jobOf(proc, job.id).errorCode).toBe('apply_error');
  });

  it('applies for the stored player, never the module sender (T-41-03)', () => {
    const proc = makeProc([reply('ok_text')]);
    const jobId = enqueue(proc, 'npc_conversation');
    const deps = makeDeps(proc);
    run(proc, jobId, deps);
    expect(deps.apply.mock.calls[0][1].playerId).toBe(alice);
    expect(deps.apply.mock.calls[0][1].playerId).not.toBe(proc.ctx.sender);
  });
});

describe('smoke jobs never touch game state', () => {
  it('an ok smoke_test reply is completed without apply and recorded per route, with a redacted reply excerpt, and verifies the key', () => {
    const proc = makeProc([reply('ok_text')]);
    const jobId = enqueue(proc, 'smoke_test', { request: { smoke: true }, budget: 'phase_only' });
    const before = gameTablesSnapshot(proc);
    const deps = makeDeps(proc);

    expect(run(proc, jobId, deps)).toBe('completed');

    expect(deps.apply).not.toHaveBeenCalled();
    expect(deps.applyFailure).not.toHaveBeenCalled();
    expect(jobOf(proc, jobId).status).toBe('completed');
    expect(gameTablesSnapshot(proc)).toBe(before);
    const state = rows(proc, 'llm_admin_state')[0];
    const smoke = JSON.parse(state.lastSmokeJson);
    expect(smoke.smoke_test.ok).toBe(true);
    const text = 'The rat considers you, then the door, and chooses neither.';
    expect(smoke.smoke_test.reply).toBe([...text].slice(0, 120).join(''));
    expect(smoke.smoke_test.input).toBe(116);
    expect(smoke.smoke_test.output).toBe(562);
    expect(smoke.smoke_test.cacheRead).toBe(3727);
    expect(smoke.smoke_test.costMicroUsd).toBe(String(FIXTURE_COST));
    expect(state.keyLastCheckOk).toBe(true);
    expect(state.keyVerifiedAt).toBeDefined();
    expect(state.lastSmokeAt).toBeDefined();
    // Smoke jobs charge the phase ledger only.
    expect(rows(proc, 'llm_player_budget')).toHaveLength(0);
    expect(ledger(proc).spentMicroUsd).toBe(FIXTURE_COST);
    expect(ledger(proc).reservedMicroUsd).toBe(0n);
  });

  it('an ok JSON smoke reply (creation_race) is completed with no reply text and does not verify the key', () => {
    const race = okReply(JSON.stringify({ raceName: 'Hillfolk', narrative: 'A quiet people.', bonuses: {} }));
    const proc = makeProc([race]);
    const jobId = enqueue(proc, 'creation_race', {
      request: { smoke: true },
      budget: 'phase_only',
      sourceKey: 'smoke:creation_race',
    });
    const deps = makeDeps(proc);
    expect(run(proc, jobId, deps)).toBe('completed');
    expect(deps.apply).not.toHaveBeenCalled();
    expect(deps.applyFailure).not.toHaveBeenCalled();
    const state = rows(proc, 'llm_admin_state')[0];
    const smoke = JSON.parse(state.lastSmokeJson);
    expect(smoke.creation_race.ok).toBe(true);
    expect(smoke.creation_race.reply).toBeUndefined();
    expect(state.keyLastCheckOk).toBe(false);
    expect(state.keyVerifiedAt).toBeUndefined();
  });

  it('a smoke creation_race job with a 401 fails, records ok false class auth, posts no failure message and clears the key check', () => {
    const proc = makeProc([reply('err_401')]);
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
    expect(state.keyLastCheckOk).toBe(false);
    expect(jobOf(proc, jobId).status).toBe('failed');
  });

  it('a billing failure on the smoke_test route clears a previously good key check', () => {
    const proc = makeProc([reply('err_429_spend_cap')], {
      seed: {
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
    const jobId = enqueue(proc, 'smoke_test', { request: { smoke: true }, budget: 'phase_only' });
    run(proc, jobId);
    const state = rows(proc, 'llm_admin_state')[0];
    expect(state.keyLastCheckOk).toBe(false);
    expect(JSON.parse(state.lastSmokeJson).smoke_test.class).toBe('billing');
  });

  // WR-A03: a key rotated while a call is in flight. The reply tells nothing about the new key.
  describe('a key rotated mid-call records no key check', () => {
    const NEW_KEY = ['sk', '-ant-', 'api03-', 'ROTATEDKEY'.repeat(4)].join('');
    /** What set_api_key writes, done while the call is out (the key and its version change). */
    const rotateDuringCall = (proc: Proc) => {
      const originalFetch = proc.ctx.http.fetch.bind(proc.ctx.http);
      proc.ctx.http.fetch = (url: string, init: any) => {
        const res = originalFetch(url, init);
        proc.clock.advance(1_000_000n);
        proc.ctx.withTx((tx: any) => {
          const cfg = tx.db.llm_config.id.find(1n);
          tx.db.llm_config.id.update({ ...cfg, apiKey: NEW_KEY, updatedAt: tx.timestamp });
          const st = tx.db.llm_admin_state.id.find(1n);
          tx.db.llm_admin_state.id.update({
            ...st,
            keySet: true,
            keyUpdatedAt: tx.timestamp,
            keyVerifiedAt: undefined,
            keyLastCheckOk: false,
          });
        });
        return res;
      };
    };
    const adminSeed = (over: Record<string, unknown> = {}) => ({
      llm_admin_state: [{ id: 1n, keySet: true, keyLength: 108n, keyLastCheckOk: false, lastSmokeJson: '{}', ...over }],
    });

    it('an old-key smoke success does not mark the new, unproven key valid', () => {
      const proc = makeProc([reply('ok_text')], { seed: adminSeed() });
      const jobId = enqueue(proc, 'smoke_test', { request: { smoke: true }, budget: 'phase_only' });
      rotateDuringCall(proc);

      expect(run(proc, jobId)).toBe('completed');
      const state = rows(proc, 'llm_admin_state')[0];
      expect(state.keyLastCheckOk).toBe(false);
      expect(state.keyVerifiedAt).toBeUndefined();
      expect(isKeyValid(state)).toBe(false);
      // The smoke result itself is still recorded.
      expect(JSON.parse(state.lastSmokeJson).smoke_test.ok).toBe(true);
    });

    it('an old-key 401 (the old key was revoked) does not mark the new key invalid', () => {
      const proc = makeProc([reply('err_401')], { seed: adminSeed() });
      const jobId = enqueue(proc, 'npc_conversation');
      rotateDuringCall(proc);
      // The new key is proven by a smoke run that finished while the old call was out.
      const originalFetch = proc.ctx.http.fetch;
      proc.ctx.http.fetch = (url: string, init: any) => {
        const res = originalFetch(url, init);
        proc.ctx.withTx((tx: any) => {
          const st = tx.db.llm_admin_state.id.find(1n);
          tx.db.llm_admin_state.id.update({ ...st, keyLastCheckOk: true, keyVerifiedAt: tx.timestamp });
        });
        return res;
      };

      expect(run(proc, jobId)).toBe('failed');
      const state = rows(proc, 'llm_admin_state')[0];
      expect(state.keyLastCheckOk).toBe(true);
      expect(isKeyValid(state)).toBe(true);
    });

    it('with the same key, a 401 still clears the key check and a smoke success still verifies it', () => {
      const bad = makeProc([reply('err_401')], { seed: adminSeed({ keyLastCheckOk: true, keyVerifiedAt: { microsSinceUnixEpoch: T0 } }) });
      run(bad, enqueue(bad, 'npc_conversation'));
      expect(rows(bad, 'llm_admin_state')[0].keyLastCheckOk).toBe(false);

      const good = makeProc([reply('ok_text')], { seed: adminSeed() });
      run(good, enqueue(good, 'smoke_test', { request: { smoke: true }, budget: 'phase_only' }));
      expect(rows(good, 'llm_admin_state')[0].keyLastCheckOk).toBe(true);
    });
  });

  it('a smoke_test never retries: a 529 is terminal', () => {
    const proc = makeProc([reply('err_529')]);
    const jobId = enqueue(proc, 'smoke_test', { request: { smoke: true }, budget: 'phase_only' });
    expect(run(proc, jobId)).toBe('failed');
    expect(rows(proc, 'llm_dispatch')).toHaveLength(0);
  });
});

describe('the key never leaves llm_config (SEC-04, T-41-01)', () => {
  const spies: any[] = [];
  const captured = (): string =>
    spies
      .flatMap((s) => s.mock.calls)
      .map((args: any[]) => args.map((a) => (typeof a === 'string' ? a : JSON.stringify(a))).join(' '))
      .join('\n');

  beforeEach(() => {
    spies.length = 0;
    for (const name of ['log', 'info', 'error', 'warn'] as const) {
      spies.push(vi.spyOn(console, name).mockImplementation(() => {}));
    }
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  function expectNoLeak(proc: Proc): void {
    expect(rows(proc, 'llm_config')[0].apiKey).toBe(FAKE_KEY);
    const all = `${snapshotWithoutConfig(proc)}\n${captured()}`;
    expect(findSecretLeaks(all, { strictPrefix: true, needles: [FAKE_KEY] }).total).toBe(0);
  }

  it('a 401 body that echoes the key (plain and inside a JSON string) leaves no trace outside llm_config or in the console', () => {
    const body = {
      type: 'error',
      error: {
        type: 'authentication_error',
        message: `invalid x-api-key ${FAKE_KEY} and "${FAKE_KEY}" and ${JSON.stringify(`k=${FAKE_KEY}`)}`,
      },
    };
    const proc = makeProc([{ status: 401, headers: { 'content-type': 'application/json' }, body }]);
    const jobId = enqueue(proc, 'npc_conversation');
    // Default deps: the real console logger, with the console spied.
    runLlmJob(proc.ctx, takeDispatch(proc, jobId), { nowMs: () => Number(proc.clock.now() / 1000n) });
    expect(jobOf(proc, jobId).status).toBe('failed');
    expect(callLogs(proc, jobId)[0].errorMessage).toContain('[REDACTED]');
    expectNoLeak(proc);
    expect(captured()).toContain('route=npc_conversation');
  });

  it('a thrown error whose message echoes the key leaves no trace, across every retry', () => {
    const throws = [1, 2, 3].map(() => ({ throw: new Error(`socket closed while sending ${FAKE_KEY}`) }));
    const proc = makeProc(throws);
    const jobId = enqueue(proc, 'npc_conversation');
    const deps = { nowMs: () => Number(proc.clock.now() / 1000n) };
    runLlmJob(proc.ctx, takeDispatch(proc, jobId), deps);
    proc.clock.advance(3_000_000n);
    runLlmJob(proc.ctx, takeDispatch(proc, jobId), deps);
    proc.clock.advance(10_000_000n);
    runLlmJob(proc.ctx, takeDispatch(proc, jobId), deps);
    expect(jobOf(proc, jobId).status).toBe('failed');
    expect(callLogs(proc, jobId)).toHaveLength(3);
    for (const l of callLogs(proc, jobId)) expect(l.errorMessage).toContain('[REDACTED]');
    expectNoLeak(proc);
  });

  it('an apply that throws with the key in its message is logged redacted', () => {
    const proc = makeProc([reply('ok_text')]);
    const jobId = enqueue(proc, 'npc_conversation');
    const deps = {
      nowMs: () => Number(proc.clock.now() / 1000n),
      apply: () => {
        throw new Error(`apply exploded ${FAKE_KEY}`);
      },
    };
    runLlmJob(proc.ctx, takeDispatch(proc, jobId), deps);
    expect(jobOf(proc, jobId).errorCode).toBe('apply_error');
    expectNoLeak(proc);
  });

  it('an ok run leaves no trace either, and the key is only in the x-api-key header', () => {
    const proc = makeProc([threePerkReply()], { seed: renownSeed() });
    const jobId = enqueueRenownJob(proc);
    runLlmJob(proc.ctx, takeDispatch(proc, jobId), { nowMs: () => Number(proc.clock.now() / 1000n) });
    expect(jobOf(proc, jobId).status).toBe('completed');
    expectNoLeak(proc);
    const call = proc.http.calls[0];
    expect(call.headers['x-api-key']).toBe(FAKE_KEY);
    expect(call.body as string).not.toContain(FAKE_KEY);
    expect(call.url).not.toContain(FAKE_KEY);
  });

  it('a smoke reply that echoes the key is redacted in the admin state', () => {
    const f = fixture('ok_text');
    f.body.content[0].text = `the key is ${FAKE_KEY}`;
    const proc = makeProc([f]);
    const jobId = enqueue(proc, 'smoke_test', { request: { smoke: true }, budget: 'phase_only' });
    runLlmJob(proc.ctx, takeDispatch(proc, jobId), { nowMs: () => Number(proc.clock.now() / 1000n) });
    expect(rows(proc, 'llm_admin_state')[0].lastSmokeJson).toContain('[REDACTED]');
    expectNoLeak(proc);
  });
});

describe('re-invoked transactions (Pitfall 7)', () => {
  it('withTxReinvoke: 1 on the ok path: one fetch and the same end state as a plain run, ids normalised', () => {
    const a = makeProc([threePerkReply()], { seed: renownSeed() });
    run(a, enqueueRenownJob(a), realDeps(a));

    const b = makeProc([threePerkReply()], { seed: renownSeed(), withTxReinvoke: 1 });
    run(b, enqueueRenownJob(b), realDeps(b));

    expect(b.http.calls).toHaveLength(1);
    expect(rows(b, 'pending_renown_perk')).toHaveLength(3);
    expect(rows(b, 'llm_call_log')).toHaveLength(1);
    expect(rows(b, 'llm_job')).toHaveLength(1);
    expect(rows(b, 'llm_job')[0].status).toBe('completed');
    expect(normalizeIds(b)).toBe(normalizeIds(a));
  });

  it('withTxReinvoke: 1 on the retry path: one fetch, one new dispatch row', () => {
    const b = makeProc([reply('err_529')], { withTxReinvoke: 1 });
    const jobId = enqueue(b, 'npc_conversation');
    expect(run(b, jobId)).toBe('retry');
    expect(b.http.calls).toHaveLength(1);
    expect(rows(b, 'llm_dispatch')).toHaveLength(1);
    expect(callLogs(b, jobId)).toHaveLength(1);
  });
});
