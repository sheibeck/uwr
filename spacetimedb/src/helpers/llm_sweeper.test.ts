/**
 * Sweeper tests (Phase 41, Plan 07): sweepLlmJobs through createMockCtx (a reducer context).
 *
 * The sweeper expires stuck jobs, re-dispatches received and orphaned ones, refunds budgets, releases
 * locks and posts the Keeper message. It never runs a success apply. No network; the API key is a
 * fake built from fragments.
 */
import { describe, it, expect, vi, beforeAll, beforeEach } from 'vitest';
import { createMockCtx } from './test-utils';
import { snapshotDb, rowColumnProblems } from './schema_recorder';
import { sweepLlmJobs, type SweepDeps } from './llm_sweeper';
import { applyLlmFailure } from './llm_apply';
import { hasLlmDispatch, scheduledMicros } from './llm_schedule';
import { LLM_SPEND_ID } from '../data/llm_limits';
import { appendCreationEvent } from './events';

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

beforeAll(async () => {
  await import('../schema/tables');
});

const FAKE_KEY = ['sk', '-ant-', 'api03-', 'SWEEPTESTKEY'.repeat(4)].join('');

const NOW = 1_700_000_000_000_000n;
const DAY = '2023-11-14'; // UTC day of NOW
const alice = { toHexString: () => 'a'.repeat(64) };
const bob = { toHexString: () => 'b'.repeat(64) };

const SEC = 1_000_000n;
const MIN = 60n * SEC;
const HOUR = 60n * MIN;

const character = () => ({ id: 1n, ownerUserId: 7n, name: 'Aldric', race: 'Kobold', className: 'Ashweaver' });

type Ctx = ReturnType<typeof makeCtx>;

function makeCtx(seed: Record<string, any[]> = {}) {
  return createMockCtx({
    seed: { player: [{ id: alice, userId: 7n, activeCharacterId: 1n }], character: [character()], ...seed },
    timestampMicros: NOW,
    strict: true,
  });
}

const rows = (ctx: Ctx, table: string): any[] => (ctx.db as any)._tables[table] ?? [];
const jobOf = (ctx: Ctx, id: bigint): any => rows(ctx, 'llm_job').find((j) => j.id === id);
const ledger = (ctx: Ctx): any => rows(ctx, 'llm_spend')[0];
const playerDay = (ctx: Ctx): any => rows(ctx, 'llm_player_budget')[0];

/** Every table's rows without empty tables (a read creates an empty array in the mock). */
function snap(ctx: Ctx): string {
  const all = JSON.parse(snapshotDb(ctx.db));
  for (const k of Object.keys(all)) if (all[k].length === 0) delete all[k];
  return JSON.stringify(all);
}

let seq = 0;

const ts = (micros: bigint) => ({ microsSinceUnixEpoch: micros });

/** A full llm_job row (every required column). */
function jobRow(over: Record<string, any> = {}): Record<string, any> {
  return {
    id: 0n,
    playerId: alice,
    characterId: 1n,
    route: 'npc_conversation',
    dedupeKey: `["seed",${++seq}]`,
    status: 'pending',
    attempt: 0n,
    requestJson: JSON.stringify({ characterId: '1', npcId: '1' }),
    inputTokens: 0n,
    outputTokens: 0n,
    cacheWriteTokens: 0n,
    cacheReadTokens: 0n,
    createdAt: ts(NOW),
    reservedMicroUsd: 0n,
    costMicroUsd: 0n,
    budgetDay: '',
    applyAttempts: 0n,
    ledgerChargedMicroUsd: 0n,
    ...over,
  };
}

const RESERVED = 5_000n;

/**
 * Seed one job that holds a reservation: the player-day row and the phase ledger both carry it, the way
 * enqueue leaves them (one call, `RESERVED` reserved). Adds to the rows when they already exist.
 */
function seedHeld(ctx: Ctx, over: Record<string, any> = {}): any {
  const dayRows = rows(ctx, 'llm_player_budget');
  if (dayRows.length === 0) {
    ctx.db.llm_player_budget.insert({
      id: 0n,
      playerId: alice,
      dayUtc: DAY,
      reservedMicroUsd: RESERVED,
      spentMicroUsd: 0n,
      calls: 1n,
    });
  } else {
    dayRows[0].reservedMicroUsd += RESERVED;
    dayRows[0].calls += 1n;
  }
  const led = rows(ctx, 'llm_spend');
  if (led.length === 0) {
    ctx.db.llm_spend.insert({
      id: LLM_SPEND_ID,
      spentMicroUsd: 0n,
      reservedMicroUsd: RESERVED,
      calls: 1n,
      updatedAt: ts(NOW),
    });
  } else {
    led[0].reservedMicroUsd += RESERVED;
    led[0].calls += 1n;
  }
  return ctx.db.llm_job.insert(jobRow({ reservedMicroUsd: RESERVED, budgetDay: DAY, ...over }));
}

function seedDispatch(ctx: Ctx, jobId: bigint, at: bigint = NOW): void {
  ctx.db.llm_dispatch.insert({ scheduledId: 0n, scheduledAt: { tag: 'Time', value: ts(at) }, jobId });
}

function makeDeps(over: Partial<SweepDeps> = {}) {
  return { applyFailure: vi.fn(), log: vi.fn(), ...over } as SweepDeps & { applyFailure: any; log: any };
}

const ZERO = {
  expiredInFlight: 0,
  redispatchedReceived: 0,
  failedReceived: 0,
  expiredPending: 0,
  dispatchedOrphans: 0,
  prunedBudgets: 0,
  releasedLocks: 0,
  errors: 0,
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe('test fixtures', () => {
  it('jobRow has exactly the recorded llm_job columns', () => {
    expect(rowColumnProblems('llm_job', jobRow())).toEqual([]);
  });
});

// ----------------------------------------------------------------------------
// Empty queue
// ----------------------------------------------------------------------------

describe('empty queue', () => {
  it('reports zeros and leaves the database unchanged', () => {
    const ctx = makeCtx();
    const before = snap(ctx);
    const deps = makeDeps();
    expect(sweepLlmJobs(ctx, deps)).toEqual(ZERO);
    expect(snap(ctx)).toBe(before);
    expect(deps.applyFailure).not.toHaveBeenCalled();
  });
});

// ----------------------------------------------------------------------------
// in_flight
// ----------------------------------------------------------------------------

describe('in_flight jobs (PIPE-05)', () => {
  it('expires a job one micro past timeout plus 30 s: timeout, refunded, ledger charged, failure once for the stored player', () => {
    const ctx = makeCtx();
    const job = seedHeld(ctx, { status: 'in_flight', attempt: 1n, startedAt: ts(NOW - 60_000_001n) });
    const deps = makeDeps();

    const report = sweepLlmJobs(ctx, deps);

    expect(report).toEqual({ ...ZERO, expiredInFlight: 1 });
    const after = jobOf(ctx, job.id);
    expect(after.status).toBe('expired');
    expect(after.errorCode).toBe('timeout');
    expect(after.reservedMicroUsd).toBe(0n);
    expect(after.finishedAt.microsSinceUnixEpoch).toBe(NOW);
    // player: reservation and call refunded, nothing charged
    expect(playerDay(ctx).reservedMicroUsd).toBe(0n);
    expect(playerDay(ctx).calls).toBe(0n);
    expect(playerDay(ctx).spentMicroUsd).toBe(0n);
    // ledger: reservation released and the billing-unknown reservation counted as spent
    expect(ledger(ctx).reservedMicroUsd).toBe(0n);
    expect(ledger(ctx).calls).toBe(0n);
    expect(ledger(ctx).spentMicroUsd).toBe(RESERVED);
    expect(deps.applyFailure).toHaveBeenCalledTimes(1);
    expect(deps.applyFailure.mock.calls[0][1].playerId).toBe(alice);
    expect(deps.applyFailure.mock.calls[0][1].domain).toBe('npc_conversation');
  });

  it('leaves a job exactly timeout plus 30 s old alone', () => {
    const ctx = makeCtx();
    const job = seedHeld(ctx, { status: 'in_flight', attempt: 1n, startedAt: ts(NOW - 60_000_000n) });
    const before = snap(ctx);
    const deps = makeDeps();

    expect(sweepLlmJobs(ctx, deps)).toEqual(ZERO);
    expect(snap(ctx)).toBe(before);
    expect(jobOf(ctx, job.id).status).toBe('in_flight');
    expect(deps.applyFailure).not.toHaveBeenCalled();
  });

  it('measures from createdAt when startedAt is missing', () => {
    const ctx = makeCtx();
    const job = seedHeld(ctx, { status: 'in_flight', attempt: 1n, createdAt: ts(NOW - 60_000_001n) });
    sweepLlmJobs(ctx, makeDeps());
    expect(jobOf(ctx, job.id).status).toBe('expired');
  });

  it('uses the route timeout: a creation job is not expired at 100 s but is past 120 s', () => {
    const ctx = makeCtx();
    const job = seedHeld(ctx, {
      route: 'creation_race',
      status: 'in_flight',
      attempt: 1n,
      startedAt: ts(NOW - 100n * SEC),
    });
    expect(sweepLlmJobs(ctx, makeDeps())).toEqual(ZERO);
    expect(jobOf(ctx, job.id).status).toBe('in_flight');

    ctx.db.llm_job.id.update({ ...jobOf(ctx, job.id), startedAt: ts(NOW - 120n * SEC - 1n) });
    expect(sweepLlmJobs(ctx, makeDeps()).expiredInFlight).toBe(1);
    expect(jobOf(ctx, job.id).status).toBe('expired');
  });

  it('a creation job that expires puts the creation state back at AWAITING_RACE (real failure handling)', () => {
    const ctx = makeCtx({
      character_creation_state: [
        { id: 1n, playerId: alice, step: 'GENERATING_RACE', createdAt: ts(NOW), updatedAt: ts(NOW) },
      ],
    });
    seedHeld(ctx, {
      route: 'creation_race',
      status: 'in_flight',
      attempt: 1n,
      startedAt: ts(NOW - 120n * SEC - 1n),
      requestJson: '{}',
    });

    const report = sweepLlmJobs(ctx, { applyFailure: applyLlmFailure, log: vi.fn() });

    expect(report.expiredInFlight).toBe(1);
    expect(report.errors).toBe(0);
    expect(rows(ctx, 'character_creation_state')[0].step).toBe('AWAITING_RACE');
  });

  it('a job with no reservation (a Phase 40 job) expires without touching any budget row', () => {
    const ctx = makeCtx();
    ctx.db.llm_job.insert(jobRow({ status: 'in_flight', attempt: 1n, startedAt: ts(NOW - 61n * SEC) }));
    const report = sweepLlmJobs(ctx, makeDeps());
    expect(report.expiredInFlight).toBe(1);
    expect(rows(ctx, 'llm_spend')).toHaveLength(0);
    expect(rows(ctx, 'llm_player_budget')).toHaveLength(0);
  });
});

// ----------------------------------------------------------------------------
// received
// ----------------------------------------------------------------------------

describe('received jobs (PIPE-02)', () => {
  const stale = { status: 'received', route: 'skill_gen', attempt: 1n, resultText: '{}' };

  it('gives a job past timeout plus 60 s exactly one dispatch at now and runs no apply', () => {
    const ctx = makeCtx();
    const job = ctx.db.llm_job.insert(jobRow({ ...stale, startedAt: ts(NOW - 120n * SEC - 1n) }));
    const deps = makeDeps();

    const report = sweepLlmJobs(ctx, deps);

    expect(report).toEqual({ ...ZERO, redispatchedReceived: 1 });
    expect(jobOf(ctx, job.id).status).toBe('received');
    const dispatches = rows(ctx, 'llm_dispatch').filter((d) => d.jobId === job.id);
    expect(dispatches).toHaveLength(1);
    expect(scheduledMicros(dispatches[0].scheduledAt)).toBe(NOW);
    expect(deps.applyFailure).not.toHaveBeenCalled();
  });

  it('leaves a received job exactly at the limit alone', () => {
    const ctx = makeCtx();
    ctx.db.llm_job.insert(jobRow({ ...stale, startedAt: ts(NOW - 120n * SEC) }));
    const before = snap(ctx);
    expect(sweepLlmJobs(ctx, makeDeps())).toEqual(ZERO);
    expect(snap(ctx)).toBe(before);
  });

  it('adds no dispatch when one is already present', () => {
    const ctx = makeCtx();
    const job = ctx.db.llm_job.insert(jobRow({ ...stale, startedAt: ts(NOW - 200n * SEC) }));
    seedDispatch(ctx, job.id, NOW + 5n * SEC);
    const report = sweepLlmJobs(ctx, makeDeps());
    expect(report).toEqual(ZERO);
    expect(rows(ctx, 'llm_dispatch').filter((d) => d.jobId === job.id)).toHaveLength(1);
  });

  it("fails a job that already failed to apply twice: 'apply_error', failure message once", () => {
    const ctx = makeCtx();
    const job = ctx.db.llm_job.insert(jobRow({ ...stale, applyAttempts: 2n, startedAt: ts(NOW - 200n * SEC) }));
    const deps = makeDeps();

    const report = sweepLlmJobs(ctx, deps);

    expect(report).toEqual({ ...ZERO, failedReceived: 1 });
    const after = jobOf(ctx, job.id);
    expect(after.status).toBe('failed');
    expect(after.errorCode).toBe('apply_error');
    expect(after.finishedAt.microsSinceUnixEpoch).toBe(NOW);
    expect(rows(ctx, 'llm_dispatch')).toHaveLength(0);
    expect(deps.applyFailure).toHaveBeenCalledTimes(1);
    expect(deps.applyFailure.mock.calls[0][1].playerId).toBe(alice);
  });
});

// ----------------------------------------------------------------------------
// pending
// ----------------------------------------------------------------------------

describe('pending jobs (PIPE-05)', () => {
  it('expires a job older than 10 minutes with reservation and call refunded and the failure message', () => {
    const ctx = makeCtx();
    const job = seedHeld(ctx, { createdAt: ts(NOW - 600_000_001n) });
    const deps = makeDeps();

    const report = sweepLlmJobs(ctx, deps);

    expect(report).toEqual({ ...ZERO, expiredPending: 1 });
    const after = jobOf(ctx, job.id);
    expect(after.status).toBe('expired');
    expect(after.errorCode).toBe('expired');
    expect(after.reservedMicroUsd).toBe(0n);
    expect(playerDay(ctx).reservedMicroUsd).toBe(0n);
    expect(playerDay(ctx).calls).toBe(0n);
    expect(ledger(ctx).reservedMicroUsd).toBe(0n);
    expect(ledger(ctx).calls).toBe(0n);
    expect(ledger(ctx).spentMicroUsd).toBe(0n);
    expect(deps.applyFailure).toHaveBeenCalledTimes(1);
  });

  it('keeps the last retry error code on the expired job', () => {
    const ctx = makeCtx();
    const job = seedHeld(ctx, { createdAt: ts(NOW - 601n * SEC), errorCode: 'rate_limit' });
    sweepLlmJobs(ctx, makeDeps());
    expect(jobOf(ctx, job.id).errorCode).toBe('rate_limit');
  });

  it('dispatches a younger pending job with no dispatch once, at now', () => {
    const ctx = makeCtx();
    const job = seedHeld(ctx, { createdAt: ts(NOW - 599_999_999n) });
    const report = sweepLlmJobs(ctx, makeDeps());
    expect(report).toEqual({ ...ZERO, dispatchedOrphans: 1 });
    expect(jobOf(ctx, job.id).status).toBe('pending');
    const dispatches = rows(ctx, 'llm_dispatch').filter((d) => d.jobId === job.id);
    expect(dispatches).toHaveLength(1);
    expect(scheduledMicros(dispatches[0].scheduledAt)).toBe(NOW);
  });

  it('dispatches at the later of now and nextAttemptAt', () => {
    const ctx = makeCtx();
    const job = seedHeld(ctx, { createdAt: ts(NOW - 60n * SEC), nextAttemptAt: ts(NOW + 7n * SEC) });
    sweepLlmJobs(ctx, makeDeps());
    const d = rows(ctx, 'llm_dispatch').find((r) => r.jobId === job.id);
    expect(scheduledMicros(d.scheduledAt)).toBe(NOW + 7n * SEC);

    const ctx2 = makeCtx();
    const job2 = seedHeld(ctx2, { createdAt: ts(NOW - 60n * SEC), nextAttemptAt: ts(NOW - 7n * SEC) });
    sweepLlmJobs(ctx2, makeDeps());
    const d2 = rows(ctx2, 'llm_dispatch').find((r) => r.jobId === job2.id);
    expect(scheduledMicros(d2.scheduledAt)).toBe(NOW);
  });

  it('adds nothing for a pending job that already has a dispatch', () => {
    const ctx = makeCtx();
    const job = seedHeld(ctx, { createdAt: ts(NOW - 60n * SEC) });
    seedDispatch(ctx, job.id, NOW + 3n * SEC);
    const before = snap(ctx);
    expect(sweepLlmJobs(ctx, makeDeps())).toEqual(ZERO);
    expect(snap(ctx)).toBe(before);
  });

  it('a Phase 40 renown job (no budget day) 11 minutes old is not expired and gets one dispatch', () => {
    const ctx = makeCtx();
    const job = ctx.db.llm_job.insert(
      jobRow({ route: 'renown_perk_gen', createdAt: ts(NOW - 11n * MIN), budgetDay: '', reservedMicroUsd: 0n }),
    );
    const deps = makeDeps();
    const report = sweepLlmJobs(ctx, deps);
    expect(report).toEqual({ ...ZERO, dispatchedOrphans: 1 });
    expect(jobOf(ctx, job.id).status).toBe('pending');
    expect(hasLlmDispatch(ctx, job.id)).toBe(true);
    expect(deps.applyFailure).not.toHaveBeenCalled();
  });

  it('a renown job past 24 hours expires and the static rank options are inserted through the failure handling', () => {
    const ctx = makeCtx();
    const job = ctx.db.llm_job.insert(
      jobRow({
        route: 'renown_perk_gen',
        createdAt: ts(NOW - HOUR * 24n - 1n),
        requestJson: JSON.stringify({ characterId: '1', rank: 2 }),
      }),
    );

    const report = sweepLlmJobs(ctx, { applyFailure: applyLlmFailure, log: vi.fn() });

    expect(report).toEqual({ ...ZERO, expiredPending: 1 });
    expect(jobOf(ctx, job.id).status).toBe('expired');
    const perks = rows(ctx, 'pending_renown_perk');
    expect(perks).toHaveLength(3);
    expect(perks.every((p) => p.characterId === 1n && p.rank === 2n)).toBe(true);
  });

  it('a renown job at exactly 24 hours is left to be dispatched, not expired', () => {
    const ctx = makeCtx();
    const job = ctx.db.llm_job.insert(jobRow({ route: 'renown_perk_gen', createdAt: ts(NOW - HOUR * 24n) }));
    const report = sweepLlmJobs(ctx, makeDeps());
    expect(report.expiredPending).toBe(0);
    expect(jobOf(ctx, job.id).status).toBe('pending');
  });
});

// ----------------------------------------------------------------------------
// Idempotence
// ----------------------------------------------------------------------------

describe('idempotence (T-41-08)', () => {
  function mixedCtx() {
    const ctx = makeCtx();
    seedHeld(ctx, { status: 'in_flight', attempt: 1n, startedAt: ts(NOW - 90n * SEC) });
    seedHeld(ctx, { createdAt: ts(NOW - 601n * SEC) });
    seedHeld(ctx, { createdAt: ts(NOW - 30n * SEC), route: 'skill_gen' });
    ctx.db.llm_job.insert(
      jobRow({ status: 'received', route: 'skill_gen', attempt: 1n, startedAt: ts(NOW - 300n * SEC), resultText: '{}' }),
    );
    ctx.db.llm_job.insert(
      jobRow({
        status: 'received',
        route: 'skill_gen',
        attempt: 1n,
        applyAttempts: 2n,
        startedAt: ts(NOW - 300n * SEC),
        resultText: '{}',
      }),
    );
    ctx.db.llm_job.insert(jobRow({ route: 'renown_perk_gen', createdAt: ts(NOW - 11n * MIN) }));
    return ctx;
  }

  it('a second sweep over the same state changes nothing: no double refund, dispatch or message', () => {
    const ctx = mixedCtx();
    const deps = makeDeps();

    const first = sweepLlmJobs(ctx, deps);
    expect(first).toEqual({
      ...ZERO,
      expiredInFlight: 1,
      expiredPending: 1,
      dispatchedOrphans: 2,
      redispatchedReceived: 1,
      failedReceived: 1,
    });
    const afterFirst = snap(ctx);
    const messages = deps.applyFailure.mock.calls.length;
    expect(messages).toBe(3);

    const second = sweepLlmJobs(ctx, deps);

    expect(second).toEqual(ZERO);
    expect(snap(ctx)).toBe(afterFirst);
    expect(deps.applyFailure).toHaveBeenCalledTimes(messages);
  });

  it('refunds are exact: three expired jobs release exactly what they held', () => {
    const ctx = makeCtx();
    seedHeld(ctx, { status: 'in_flight', attempt: 1n, startedAt: ts(NOW - 90n * SEC) });
    seedHeld(ctx, { createdAt: ts(NOW - 601n * SEC) });
    seedHeld(ctx, { createdAt: ts(NOW - 700n * SEC) });
    sweepLlmJobs(ctx, makeDeps());
    sweepLlmJobs(ctx, makeDeps());
    expect(playerDay(ctx).reservedMicroUsd).toBe(0n);
    expect(playerDay(ctx).calls).toBe(0n);
    expect(ledger(ctx).reservedMicroUsd).toBe(0n);
    expect(ledger(ctx).calls).toBe(0n);
    expect(ledger(ctx).spentMicroUsd).toBe(RESERVED); // only the in_flight (billing unknown) one
  });
});

// ----------------------------------------------------------------------------
// Failure isolation
// ----------------------------------------------------------------------------

describe('failure isolation (T-41-10)', () => {
  it('one throwing failure message does not stop the rest, and the sweep does not throw', () => {
    const ctx = makeCtx();
    const a = seedHeld(ctx, { status: 'in_flight', attempt: 1n, startedAt: ts(NOW - 90n * SEC) });
    const b = seedHeld(ctx, { status: 'in_flight', attempt: 1n, startedAt: ts(NOW - 91n * SEC), playerId: bob });
    const messaged: any[] = [];
    const deps = makeDeps({
      applyFailure: vi.fn((_ctx: any, job: any) => {
        messaged.push(job.playerId);
        if (job.playerId === alice) throw new Error('message exploded');
      }),
    });

    let report: any;
    expect(() => {
      report = sweepLlmJobs(ctx, deps);
    }).not.toThrow();

    expect(report.errors).toBe(1);
    expect(report.expiredInFlight).toBe(2);
    // A: status and refund were written before the throw
    expect(jobOf(ctx, a.id).status).toBe('expired');
    expect(jobOf(ctx, a.id).reservedMicroUsd).toBe(0n);
    // B: expired and messaged
    expect(jobOf(ctx, b.id).status).toBe('expired');
    expect(messaged).toContain(bob);
    expect(deps.log).toHaveBeenCalledTimes(1);
    expect(String(deps.log.mock.calls[0][0])).toContain('message exploded');
  });

  it('a malformed job row cannot stop the sweep of the others', () => {
    const ctx = makeCtx();
    // an unknown route makes the timeout lookup throw for this row only
    ctx.db.llm_job.insert(jobRow({ route: 'no_such_route', status: 'in_flight', startedAt: ts(NOW - 900n * SEC) }));
    const good = seedHeld(ctx, { status: 'in_flight', attempt: 1n, startedAt: ts(NOW - 90n * SEC) });
    const deps = makeDeps();
    const report = sweepLlmJobs(ctx, deps);
    expect(report.errors).toBe(1);
    expect(jobOf(ctx, good.id).status).toBe('expired');
  });

  it('the logged line carries no API key even when the error message does', () => {
    const ctx = makeCtx();
    seedHeld(ctx, { status: 'in_flight', attempt: 1n, startedAt: ts(NOW - 90n * SEC) });
    const deps = makeDeps({
      applyFailure: vi.fn(() => {
        throw new Error(`boom ${FAKE_KEY}`);
      }),
    });
    sweepLlmJobs(ctx, deps);
    expect(deps.log).toHaveBeenCalledTimes(1);
    expect(String(deps.log.mock.calls[0][0])).not.toContain(FAKE_KEY);
  });
});

// ----------------------------------------------------------------------------
// Pruning and smoke
// ----------------------------------------------------------------------------

describe('budget pruning', () => {
  it('prunes player-day rows older than two days and counts them', () => {
    const ctx = makeCtx({
      llm_player_budget: [
        { id: 1n, playerId: alice, dayUtc: '2023-11-10', reservedMicroUsd: 0n, spentMicroUsd: 5n, calls: 1n },
        { id: 2n, playerId: alice, dayUtc: '2023-11-11', reservedMicroUsd: 0n, spentMicroUsd: 5n, calls: 1n },
        { id: 3n, playerId: alice, dayUtc: DAY, reservedMicroUsd: 0n, spentMicroUsd: 5n, calls: 1n },
      ],
    });
    const report = sweepLlmJobs(ctx, makeDeps());
    expect(report.prunedBudgets).toBe(2);
    expect(rows(ctx, 'llm_player_budget').map((r) => r.id)).toEqual([3n]);
  });
});

describe('smoke jobs', () => {
  it('an expired smoke job records a failed entry for its route and never calls the failure handler', () => {
    const ctx = makeCtx();
    const job = seedHeld(ctx, {
      route: 'smoke_test',
      status: 'in_flight',
      attempt: 1n,
      budgetDay: '',
      requestJson: JSON.stringify({ smoke: true }),
      startedAt: ts(NOW - 90n * SEC),
    });
    const deps = makeDeps();

    const report = sweepLlmJobs(ctx, deps);

    expect(report.expiredInFlight).toBe(1);
    expect(jobOf(ctx, job.id).status).toBe('expired');
    expect(deps.applyFailure).not.toHaveBeenCalled();
    const state = rows(ctx, 'llm_admin_state')[0];
    const smoke = JSON.parse(state.lastSmokeJson);
    expect(smoke.smoke_test.ok).toBe(false);
    expect(smoke.smoke_test.class).toBe('timeout');
  });
});

// ----------------------------------------------------------------------------
// Prohibition: no player is left locked out
// ----------------------------------------------------------------------------

describe('no lock-out (fairness prohibition)', () => {
  it('after a sweep no stuck job is left in an active status', () => {
    const ctx = makeCtx();
    seedHeld(ctx, { status: 'in_flight', attempt: 1n, startedAt: ts(NOW - 5n * MIN) });
    seedHeld(ctx, { createdAt: ts(NOW - 20n * MIN) });
    ctx.db.llm_job.insert(
      jobRow({ status: 'received', attempt: 1n, applyAttempts: 2n, startedAt: ts(NOW - 5n * MIN), resultText: 'x' }),
    );
    sweepLlmJobs(ctx, makeDeps());
    for (const j of rows(ctx, 'llm_job')) {
      expect(['expired', 'failed']).toContain(j.status);
    }
  });
});

// ----------------------------------------------------------------------------
// WR-A01: a generation lock whose job is gone is released
// ----------------------------------------------------------------------------

describe('stranded generation locks (a lost failure message)', () => {
  const creationState = (step: string, updatedAt: bigint, over: Record<string, any> = {}) => ({
    id: 1n,
    playerId: alice,
    step,
    createdAt: ts(updatedAt),
    updatedAt: ts(updatedAt),
    ...over,
  });
  const genState = (step: string, updatedAt: bigint, over: Record<string, any> = {}) => ({
    id: 5n,
    playerId: alice,
    characterId: 1n,
    sourceLocationId: 0n,
    sourceRegionId: 0n,
    step,
    createdAt: ts(updatedAt),
    updatedAt: ts(updatedAt),
    ...over,
  });

  it.each([
    ['GENERATING_RACE', 'AWAITING_RACE'],
    ['GENERATING_CLASS', 'AWAITING_ARCHETYPE'],
  ])('a %s creation step whose job ended failed is returned to %s with the try again line', (step, back) => {
    const ctx = makeCtx({ character_creation_state: [creationState(step, NOW - 2n * MIN)] });
    ctx.db.llm_job.insert(
      jobRow({ route: step === 'GENERATING_RACE' ? 'creation_race' : 'creation_class', status: 'failed', characterId: 0n }),
    );
    const report = sweepLlmJobs(ctx, makeDeps());

    expect(report).toEqual({ ...ZERO, releasedLocks: 1 });
    expect(rows(ctx, 'character_creation_state')[0].step).toBe(back);
    expect(appendCreationEvent).toHaveBeenCalledTimes(1);
    expect((appendCreationEvent as any).mock.calls[0].slice(1)).toEqual([
      alice,
      'creation_error',
      'The Keeper flickers. "Something went wrong in the cosmic machinery. Try again."',
    ]);
    // Idempotent: the next sweep finds nothing.
    expect(sweepLlmJobs(ctx, makeDeps())).toEqual(ZERO);
  });

  it.each(['pending', 'in_flight', 'received'])('a creation step with a %s creation job of the same identity is left alone', (status) => {
    const ctx = makeCtx({ character_creation_state: [creationState('GENERATING_RACE', NOW - 30n * MIN)] });
    ctx.db.llm_job.insert(jobRow({ route: 'creation_race', status, characterId: 0n, createdAt: ts(NOW - 10n * SEC) }));
    sweepLlmJobs(ctx, makeDeps());
    expect(rows(ctx, 'character_creation_state')[0].step).toBe('GENERATING_RACE');
    expect(appendCreationEvent).not.toHaveBeenCalled();
  });

  it("another identity's active creation job does not hold this state", () => {
    const ctx = makeCtx({ character_creation_state: [creationState('GENERATING_RACE', NOW - 2n * MIN)] });
    ctx.db.llm_job.insert(jobRow({ playerId: bob, route: 'creation_race', status: 'pending', characterId: 0n }));
    sweepLlmJobs(ctx, makeDeps());
    expect(rows(ctx, 'character_creation_state')[0].step).toBe('AWAITING_RACE');
  });

  it('a lock younger than the grace is left alone', () => {
    const ctx = makeCtx({ character_creation_state: [creationState('GENERATING_CLASS', NOW - 30n * SEC)] });
    sweepLlmJobs(ctx, makeDeps());
    expect(rows(ctx, 'character_creation_state')[0].step).toBe('GENERATING_CLASS');
  });

  it.each(['PENDING', 'GENERATING'])('a %s world-gen state with no active job goes to ERROR with the [explore] line', (step) => {
    // A starter state: the character is still at location 0, so the line goes to the creation log.
    const ctx = makeCtx({ character: [{ ...character(), locationId: 0n }], world_gen_state: [genState(step, NOW - 5n * MIN)] });
    ctx.db.llm_job.insert(
      jobRow({ route: 'world_gen', status: 'expired', requestJson: JSON.stringify({ genStateId: '5', input: {} }) }),
    );
    const report = sweepLlmJobs(ctx, makeDeps());

    expect(report).toEqual({ ...ZERO, releasedLocks: 1 });
    const state = rows(ctx, 'world_gen_state')[0];
    expect(state.step).toBe('ERROR');
    expect(state.errorMessage).toBe('The Keeper falters. "The world refuses to be remembered right now."');
    expect((appendCreationEvent as any).mock.calls[0][3]).toContain('Type [explore] to try again.');
  });

  it('a GENERATING world-gen state whose world_gen job is still active is left alone', () => {
    const ctx = makeCtx({ world_gen_state: [genState('GENERATING', NOW - 5n * MIN), genState('GENERATING', NOW - 5n * MIN, { id: 6n })] });
    ctx.db.llm_job.insert(
      jobRow({ route: 'world_gen', status: 'in_flight', attempt: 1n, startedAt: ts(NOW - 10n * SEC), requestJson: JSON.stringify({ genStateId: '5', input: {} }) }),
    );
    sweepLlmJobs(ctx, makeDeps());
    const states = rows(ctx, 'world_gen_state');
    expect(states.find((s: any) => s.id === 5n).step).toBe('GENERATING');
    expect(states.find((s: any) => s.id === 6n).step).toBe('ERROR');
  });

  it('COMPLETE and ERROR states are never touched', () => {
    const ctx = makeCtx({
      character_creation_state: [creationState('COMPLETE', NOW - HOUR)],
      world_gen_state: [genState('COMPLETE', NOW - HOUR), genState('ERROR', NOW - HOUR, { id: 6n })],
    });
    const before = snap(ctx);
    expect(sweepLlmJobs(ctx, makeDeps())).toEqual(ZERO);
    expect(snap(ctx)).toBe(before);
  });
});
