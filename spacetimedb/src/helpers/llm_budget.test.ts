import { describe, it, expect, vi, beforeAll } from 'vitest';
import { createMockCtx as createLenientMockCtx } from './test-utils';
import { reserveCostMicroUsd } from './measurement';
import { LLM_ROUTES, LLM_ROUTE_NAMES } from '../data/llm_routes';
import { KEEPER_BIBLE } from '../data/keeper_bible';
import { ROUTE_BLOCKS } from '../data/llm_layers';
import {
  LLM_PLAYER_DAILY_COST_MICRO_USD,
  LLM_PLAYER_DAILY_CALLS,
  LLM_PHASE_SPEND_CAP_MICRO_USD,
} from '../data/llm_limits';
import {
  utcDay,
  estimatePromptChars,
  reservationMicroUsd,
  reserveLlmBudget,
  releaseLlmReservation,
  settleLlmCost,
  chargeLedgerUnknownBilling,
  addLedgerSpend,
  subtractLedgerSpend,
  getPhaseLedger,
  isPhaseLedgerExhausted,
  prunePlayerBudgets,
} from './llm_budget';

// Records the real column definitions so the strict mock knows the accessors.
vi.mock('spacetimedb/server', async () =>
  (await import('./schema_recorder')).createRecordingServerMock(),
);

beforeAll(async () => {
  await import('../schema/tables');
});

const createMockCtx = (o: Parameters<typeof createLenientMockCtx>[0] = {}) =>
  createLenientMockCtx({ ...o, strict: true });

// The mock compares identities with ===: ONE identity object is reused everywhere.
const PLAYER = { toHexString: () => 'player-aaa' };
const OTHER = { toHexString: () => 'player-bbb' };

const rows = (ctx: any, table: string): any[] => ctx.db[table]._rows();
// The mock creates an empty table array on first read, so empty tables are dropped from the snapshot.
const snapshotDb = (ctx: any): string =>
  JSON.stringify(
    Object.fromEntries(Object.entries(ctx.db._tables as Record<string, any[]>).filter(([, v]) => v.length > 0)),
    (_k, v) => (typeof v === 'bigint' ? `${v}n` : v),
  );

const micros = (iso: string, extra = 0n): bigint => BigInt(Date.parse(iso)) * 1000n + extra;
const T_2026_09_30 = micros('2026-09-30T12:00:00.000Z');
const T_LAST_MICRO = micros('2026-09-30T23:59:59.999Z', 999n);
const T_MIDNIGHT = micros('2026-10-01T00:00:00.000Z');

const ROUTE = 'npc_conversation' as const;
const JSON_BODY = '{"message":"hello"}';
const R = reservationMicroUsd(ROUTE, JSON_BODY);

function budgetRow(over: Record<string, unknown> = {}) {
  return {
    id: 1n,
    playerId: PLAYER,
    dayUtc: '2026-09-30',
    reservedMicroUsd: 0n,
    spentMicroUsd: 0n,
    calls: 0n,
    ...over,
  };
}

function ledgerRow(over: Record<string, unknown> = {}) {
  return {
    id: 1n,
    spentMicroUsd: 0n,
    reservedMicroUsd: 0n,
    calls: 0n,
    updatedAt: { microsSinceUnixEpoch: 1n },
    ...over,
  };
}

function reserve(ctx: any, over: Record<string, unknown> = {}) {
  return reserveLlmBudget(ctx, {
    playerId: PLAYER,
    route: ROUTE,
    requestJson: JSON_BODY,
    mode: 'player',
    ...over,
  } as any);
}

// ---------------------------------------------------------------------------
// Task 1: reservation, refusal reasons, UTC-day rows
// ---------------------------------------------------------------------------

describe('reservation estimate', () => {
  it('equals BigInt(reserveCostMicroUsd(maxTokens, bible + route block + json)) for all eight routes', () => {
    expect(LLM_ROUTE_NAMES).toHaveLength(8);
    for (const route of LLM_ROUTE_NAMES) {
      const chars = KEEPER_BIBLE.length + ROUTE_BLOCKS[route].length + JSON_BODY.length;
      expect(estimatePromptChars(route, JSON_BODY), route).toBe(chars);
      expect(reservationMicroUsd(route, JSON_BODY), route).toBe(
        BigInt(reserveCostMicroUsd(LLM_ROUTES[route].maxTokens, chars)),
      );
    }
  });

  it('world_gen reserves more than npc_conversation for the same json', () => {
    expect(reservationMicroUsd('world_gen', JSON_BODY)).toBeGreaterThan(
      reservationMicroUsd('npc_conversation', JSON_BODY),
    );
  });

  it('is a positive bigint of whole micro-USD', () => {
    expect(typeof R).toBe('bigint');
    expect(R > 0n).toBe(true);
  });

  it('utcDay renders the UTC date of a timestamp', () => {
    expect(utcDay({ microsSinceUnixEpoch: T_LAST_MICRO })).toBe('2026-09-30');
    expect(utcDay({ microsSinceUnixEpoch: T_MIDNIGHT })).toBe('2026-10-01');
  });
});

describe('reserveLlmBudget: first reservation', () => {
  it('creates the player day row and the ledger row', () => {
    const ctx = createMockCtx({ timestampMicros: T_2026_09_30 });
    const res = reserve(ctx);
    expect(res).toEqual({ ok: true, reservedMicroUsd: R, budgetDay: '2026-09-30' });

    const players = rows(ctx, 'llm_player_budget');
    expect(players).toHaveLength(1);
    expect(players[0]).toMatchObject({
      playerId: PLAYER,
      dayUtc: '2026-09-30',
      reservedMicroUsd: R,
      spentMicroUsd: 0n,
      calls: 1n,
    });

    const ledger = rows(ctx, 'llm_spend');
    expect(ledger).toHaveLength(1);
    expect(ledger[0]).toMatchObject({ id: 1n, reservedMicroUsd: R, spentMicroUsd: 0n, calls: 1n });
    expect(ledger[0].updatedAt).toBe(ctx.timestamp);
  });

  it('a second reservation updates the same rows', () => {
    const ctx = createMockCtx({ timestampMicros: T_2026_09_30 });
    reserve(ctx);
    reserve(ctx);
    expect(rows(ctx, 'llm_player_budget')).toHaveLength(1);
    expect(rows(ctx, 'llm_player_budget')[0]).toMatchObject({ reservedMicroUsd: R * 2n, calls: 2n });
    expect(rows(ctx, 'llm_spend')[0]).toMatchObject({ reservedMicroUsd: R * 2n, calls: 2n });
  });

  it('keeps players separate', () => {
    const ctx = createMockCtx({ timestampMicros: T_2026_09_30 });
    reserve(ctx);
    reserve(ctx, { playerId: OTHER });
    expect(rows(ctx, 'llm_player_budget')).toHaveLength(2);
    expect(rows(ctx, 'llm_spend')[0].calls).toBe(2n);
  });

  it('stores only bigint numeric budget values', () => {
    const ctx = createMockCtx({ timestampMicros: T_2026_09_30 });
    reserve(ctx);
    for (const row of [...rows(ctx, 'llm_player_budget'), ...rows(ctx, 'llm_spend')]) {
      for (const [key, value] of Object.entries(row)) {
        if (key === 'playerId' || key === 'dayUtc' || key === 'updatedAt') continue;
        expect(typeof value, key).toBe('bigint');
      }
    }
  });
});

describe('reserveLlmBudget: player daily cost boundary', () => {
  it('allows a reservation that brings spent + reserved to exactly $1.00', () => {
    // Split the seed across spent and reserved to prove both count.
    const held = LLM_PLAYER_DAILY_COST_MICRO_USD - R;
    const ctx = createMockCtx({
      timestampMicros: T_2026_09_30,
      seed: { llm_player_budget: [budgetRow({ spentMicroUsd: held - 10n, reservedMicroUsd: 10n, calls: 1n })] },
    });
    const res = reserve(ctx);
    expect(res.ok).toBe(true);
    const row = rows(ctx, 'llm_player_budget')[0];
    expect(row.spentMicroUsd + row.reservedMicroUsd).toBe(LLM_PLAYER_DAILY_COST_MICRO_USD);
  });

  it('refuses one micro-USD over $1.00 as daily_cost', () => {
    const held = LLM_PLAYER_DAILY_COST_MICRO_USD - R + 1n;
    const ctx = createMockCtx({
      timestampMicros: T_2026_09_30,
      seed: { llm_player_budget: [budgetRow({ spentMicroUsd: held, calls: 1n })] },
    });
    expect(reserve(ctx)).toEqual({ ok: false, reason: 'daily_cost' });
  });
});

describe('reserveLlmBudget: player daily calls boundary', () => {
  it('allows the 200th call of the day', () => {
    const ctx = createMockCtx({
      timestampMicros: T_2026_09_30,
      seed: { llm_player_budget: [budgetRow({ calls: LLM_PLAYER_DAILY_CALLS - 1n })] },
    });
    expect(reserve(ctx).ok).toBe(true);
    expect(rows(ctx, 'llm_player_budget')[0].calls).toBe(LLM_PLAYER_DAILY_CALLS);
  });

  it('refuses the 201st call of the day as daily_calls', () => {
    const ctx = createMockCtx({
      timestampMicros: T_2026_09_30,
      seed: { llm_player_budget: [budgetRow({ calls: LLM_PLAYER_DAILY_CALLS })] },
    });
    expect(reserve(ctx)).toEqual({ ok: false, reason: 'daily_calls' });
  });
});

describe('reserveLlmBudget: phase cap boundary', () => {
  it('allows a reservation that brings the ledger to exactly $2.00', () => {
    const held = LLM_PHASE_SPEND_CAP_MICRO_USD - R;
    const ctx = createMockCtx({
      timestampMicros: T_2026_09_30,
      seed: { llm_spend: [ledgerRow({ spentMicroUsd: held - 5n, reservedMicroUsd: 5n })] },
    });
    expect(reserve(ctx).ok).toBe(true);
    const ledger = getPhaseLedger(ctx);
    expect(ledger.spentMicroUsd + ledger.reservedMicroUsd).toBe(LLM_PHASE_SPEND_CAP_MICRO_USD);
  });

  it('refuses one micro-USD over $2.00 as phase_cap', () => {
    const held = LLM_PHASE_SPEND_CAP_MICRO_USD - R + 1n;
    const ctx = createMockCtx({
      timestampMicros: T_2026_09_30,
      seed: { llm_spend: [ledgerRow({ spentMicroUsd: held })] },
    });
    expect(reserve(ctx)).toEqual({ ok: false, reason: 'phase_cap' });
  });

  it('phase_only counts against the ledger and leaves player rows untouched', () => {
    const ctx = createMockCtx({
      timestampMicros: T_2026_09_30,
      seed: { llm_player_budget: [budgetRow({ calls: LLM_PLAYER_DAILY_CALLS })] },
    });
    const before = JSON.stringify(rows(ctx, 'llm_player_budget'), (_k, v) => (typeof v === 'bigint' ? `${v}n` : v));
    const res = reserve(ctx, { mode: 'phase_only' });
    // Even a player at the call limit does not block a phase_only reservation.
    expect(res).toEqual({ ok: true, reservedMicroUsd: R, budgetDay: '' });
    const after = JSON.stringify(rows(ctx, 'llm_player_budget'), (_k, v) => (typeof v === 'bigint' ? `${v}n` : v));
    expect(after).toBe(before);
    expect(rows(ctx, 'llm_spend')[0]).toMatchObject({ reservedMicroUsd: R, calls: 1n });
  });

  it('phase_only is still refused by the phase cap', () => {
    const ctx = createMockCtx({
      timestampMicros: T_2026_09_30,
      seed: { llm_spend: [ledgerRow({ spentMicroUsd: LLM_PHASE_SPEND_CAP_MICRO_USD })] },
    });
    expect(reserve(ctx, { mode: 'phase_only' })).toEqual({ ok: false, reason: 'phase_cap' });
    expect(rows(ctx, 'llm_player_budget')).toHaveLength(0);
  });
});

describe('reserveLlmBudget: refusal order and no writes', () => {
  it('reports daily_calls before daily_cost before phase_cap', () => {
    const everything = {
      llm_player_budget: [
        budgetRow({ calls: LLM_PLAYER_DAILY_CALLS, spentMicroUsd: LLM_PLAYER_DAILY_COST_MICRO_USD }),
      ],
      llm_spend: [ledgerRow({ spentMicroUsd: LLM_PHASE_SPEND_CAP_MICRO_USD })],
    };
    expect(reserve(createMockCtx({ timestampMicros: T_2026_09_30, seed: everything }))).toEqual({
      ok: false,
      reason: 'daily_calls',
    });

    const costAndCap = {
      llm_player_budget: [budgetRow({ calls: 1n, spentMicroUsd: LLM_PLAYER_DAILY_COST_MICRO_USD })],
      llm_spend: [ledgerRow({ spentMicroUsd: LLM_PHASE_SPEND_CAP_MICRO_USD })],
    };
    expect(reserve(createMockCtx({ timestampMicros: T_2026_09_30, seed: costAndCap }))).toEqual({
      ok: false,
      reason: 'daily_cost',
    });
  });

  it('every refusal leaves the database snapshot identical', () => {
    const seeds: Record<string, any[]>[] = [
      { llm_player_budget: [budgetRow({ calls: LLM_PLAYER_DAILY_CALLS })] },
      { llm_player_budget: [budgetRow({ calls: 1n, spentMicroUsd: LLM_PLAYER_DAILY_COST_MICRO_USD })] },
      { llm_spend: [ledgerRow({ spentMicroUsd: LLM_PHASE_SPEND_CAP_MICRO_USD })] },
      // Refused on an empty database: no ledger row may be created either.
      {},
    ];
    for (const seed of seeds) {
      const ctx = createMockCtx({ timestampMicros: T_2026_09_30, seed });
      const before = snapshotDb(ctx);
      // Force a refusal on the empty seed with an impossible reservation.
      const res =
        Object.keys(seed).length === 0
          ? reserveLlmBudget(ctx, {
              playerId: PLAYER,
              route: ROUTE,
              requestJson: 'x'.repeat(10_000_000),
              mode: 'player',
            })
          : reserve(ctx);
      expect(res.ok).toBe(false);
      expect(snapshotDb(ctx)).toBe(before);
    }
  });
});

describe('reserveLlmBudget: UTC day rollover', () => {
  it('23:59:59.999999 UTC lands on that day and 00:00:00.000000 on a fresh row with full limits', () => {
    const ctx = createMockCtx({
      timestampMicros: T_LAST_MICRO,
      seed: {
        llm_player_budget: [
          budgetRow({
            calls: LLM_PLAYER_DAILY_CALLS - 1n,
            spentMicroUsd: LLM_PLAYER_DAILY_COST_MICRO_USD - R,
          }),
        ],
      },
    });
    // Last microsecond of the day: allowed, exactly at both limits.
    expect(reserve(ctx)).toMatchObject({ ok: true, budgetDay: '2026-09-30' });
    expect(reserve(ctx)).toEqual({ ok: false, reason: 'daily_calls' });

    // First microsecond of the next day: a fresh row with full limits.
    (ctx as any).timestamp = { microsSinceUnixEpoch: T_MIDNIGHT };
    const res = reserve(ctx);
    expect(res).toMatchObject({ ok: true, budgetDay: '2026-10-01' });
    const next = rows(ctx, 'llm_player_budget').find((r: any) => r.dayUtc === '2026-10-01');
    expect(next).toMatchObject({ reservedMicroUsd: R, spentMicroUsd: 0n, calls: 1n });
    expect(rows(ctx, 'llm_player_budget')).toHaveLength(2);
  });
});

// ---------------------------------------------------------------------------
// Task 2: release, settle, unknown billing, exhaustion, pruning
// ---------------------------------------------------------------------------

/** Reserve through the real path and return the job fields a caller would persist. */
function reservedJob(ctx: any, over: Record<string, unknown> = {}) {
  const res = reserve(ctx, over);
  if (!res.ok) throw new Error('setup reservation refused');
  return {
    playerId: PLAYER,
    budgetDay: res.budgetDay,
    reservedMicroUsd: res.reservedMicroUsd,
    costMicroUsd: 0n,
  };
}

const playerRow = (ctx: any) => rows(ctx, 'llm_player_budget')[0];
const ledger = (ctx: any) => rows(ctx, 'llm_spend')[0];

describe('releaseLlmReservation', () => {
  it('lowers reserved and calls on both rows and returns a zeroing patch', () => {
    const ctx = createMockCtx({ timestampMicros: T_2026_09_30 });
    const job = reservedJob(ctx);
    const patch = releaseLlmReservation(ctx, job, { refundCall: true });
    expect(patch).toEqual({ reservedMicroUsd: 0n });
    expect(playerRow(ctx)).toMatchObject({ reservedMicroUsd: 0n, calls: 0n });
    expect(ledger(ctx)).toMatchObject({ reservedMicroUsd: 0n, calls: 0n });
  });

  it('a second release with the returned patch changes nothing', () => {
    const ctx = createMockCtx({ timestampMicros: T_2026_09_30 });
    const job = reservedJob(ctx);
    reserve(ctx); // a second, unrelated call keeps the counters above zero
    const patch = releaseLlmReservation(ctx, job, { refundCall: true });
    const before = snapshotDb(ctx);
    releaseLlmReservation(ctx, { ...job, ...patch }, { refundCall: true });
    expect(snapshotDb(ctx)).toBe(before);
    expect(playerRow(ctx)).toMatchObject({ reservedMicroUsd: R, calls: 1n });
  });

  it('refundCall false keeps the call counts', () => {
    const ctx = createMockCtx({ timestampMicros: T_2026_09_30 });
    const job = reservedJob(ctx);
    releaseLlmReservation(ctx, job, { refundCall: false });
    expect(playerRow(ctx)).toMatchObject({ reservedMicroUsd: 0n, calls: 1n });
    expect(ledger(ctx)).toMatchObject({ reservedMicroUsd: 0n, calls: 1n });
  });

  it('never drives reserved or calls below zero', () => {
    const ctx = createMockCtx({
      timestampMicros: T_2026_09_30,
      seed: {
        llm_player_budget: [budgetRow({ reservedMicroUsd: 3n, calls: 0n })],
        llm_spend: [ledgerRow({ reservedMicroUsd: 2n, calls: 0n })],
      },
    });
    releaseLlmReservation(
      ctx,
      { playerId: PLAYER, budgetDay: '2026-09-30', reservedMicroUsd: 1_000n },
      { refundCall: true },
    );
    expect(playerRow(ctx)).toMatchObject({ reservedMicroUsd: 0n, calls: 0n });
    expect(ledger(ctx)).toMatchObject({ reservedMicroUsd: 0n, calls: 0n });
  });

  it('a job with an empty budgetDay touches only the ledger', () => {
    const ctx = createMockCtx({ timestampMicros: T_2026_09_30 });
    const job = reservedJob(ctx, { mode: 'phase_only' });
    expect(job.budgetDay).toBe('');
    releaseLlmReservation(ctx, job, { refundCall: true });
    expect(rows(ctx, 'llm_player_budget')).toHaveLength(0);
    expect(ledger(ctx)).toMatchObject({ reservedMicroUsd: 0n, calls: 0n });
  });

  it('a job whose day row was pruned touches only the ledger', () => {
    const ctx = createMockCtx({
      timestampMicros: T_2026_09_30,
      seed: { llm_spend: [ledgerRow({ reservedMicroUsd: R, calls: 1n })] },
    });
    const patch = releaseLlmReservation(
      ctx,
      { playerId: PLAYER, budgetDay: '2026-09-20', reservedMicroUsd: R },
      { refundCall: true },
    );
    expect(patch).toEqual({ reservedMicroUsd: 0n });
    expect(ledger(ctx)).toMatchObject({ reservedMicroUsd: 0n, calls: 0n });
    expect(rows(ctx, 'llm_player_budget')).toHaveLength(0);
  });

  it('a job reserved before midnight releases against its own budgetDay row', () => {
    const ctx = createMockCtx({ timestampMicros: T_LAST_MICRO });
    const job = reservedJob(ctx);
    expect(job.budgetDay).toBe('2026-09-30');
    (ctx as any).timestamp = { microsSinceUnixEpoch: T_MIDNIGHT };
    reserve(ctx); // new day row
    releaseLlmReservation(ctx, job, { refundCall: true });
    const old = rows(ctx, 'llm_player_budget').find((r: any) => r.dayUtc === '2026-09-30');
    const fresh = rows(ctx, 'llm_player_budget').find((r: any) => r.dayUtc === '2026-10-01');
    expect(old).toMatchObject({ reservedMicroUsd: 0n, calls: 0n });
    expect(fresh).toMatchObject({ reservedMicroUsd: R, calls: 1n });
  });
});

describe('settleLlmCost', () => {
  it('releases the reservation and charges ledger and player when chargePlayer', () => {
    const ctx = createMockCtx({ timestampMicros: T_2026_09_30 });
    const job = reservedJob(ctx);
    const patch = settleLlmCost(ctx, job, { actualMicroUsd: 1234n, chargePlayer: true });
    expect(patch).toEqual({ reservedMicroUsd: 0n, costMicroUsd: 1234n });
    expect(playerRow(ctx)).toMatchObject({ reservedMicroUsd: 0n, spentMicroUsd: 1234n, calls: 1n });
    expect(ledger(ctx)).toMatchObject({ reservedMicroUsd: 0n, spentMicroUsd: 1234n, calls: 1n });
  });

  it('with chargePlayer false only the ledger spent grows', () => {
    const ctx = createMockCtx({ timestampMicros: T_2026_09_30 });
    const job = reservedJob(ctx);
    settleLlmCost(ctx, job, { actualMicroUsd: 500n, chargePlayer: false });
    expect(playerRow(ctx)).toMatchObject({ reservedMicroUsd: 0n, spentMicroUsd: 0n });
    expect(ledger(ctx)).toMatchObject({ reservedMicroUsd: 0n, spentMicroUsd: 500n });
  });

  it('accumulates onto the job cost already recorded', () => {
    const ctx = createMockCtx({ timestampMicros: T_2026_09_30 });
    const job = { ...reservedJob(ctx), costMicroUsd: 40n };
    expect(settleLlmCost(ctx, job, { actualMicroUsd: 2n, chargePlayer: true }).costMicroUsd).toBe(42n);
  });

  it('settle then release ends with the reservation released exactly once', () => {
    const ctx = createMockCtx({ timestampMicros: T_2026_09_30 });
    reserve(ctx); // keeps counters above zero so a double release would show
    const job = reservedJob(ctx);
    const patch = settleLlmCost(ctx, job, { actualMicroUsd: 100n, chargePlayer: true });
    releaseLlmReservation(ctx, { ...job, ...patch }, { refundCall: true });
    expect(playerRow(ctx)).toMatchObject({ reservedMicroUsd: R, spentMicroUsd: 100n, calls: 2n });
    expect(ledger(ctx)).toMatchObject({ reservedMicroUsd: R, spentMicroUsd: 100n, calls: 2n });
  });

  it('release then settle ends with the reservation released exactly once', () => {
    const ctx = createMockCtx({ timestampMicros: T_2026_09_30 });
    reserve(ctx);
    const job = reservedJob(ctx);
    const patch = releaseLlmReservation(ctx, job, { refundCall: true });
    settleLlmCost(ctx, { ...job, ...patch }, { actualMicroUsd: 0n, chargePlayer: true });
    expect(playerRow(ctx)).toMatchObject({ reservedMicroUsd: R, calls: 1n });
    expect(ledger(ctx)).toMatchObject({ reservedMicroUsd: R, calls: 1n });
  });
});

describe('unknown billing and late arrivals', () => {
  it('chargeLedgerUnknownBilling adds the reservation to ledger spent only', () => {
    const ctx = createMockCtx({ timestampMicros: T_2026_09_30 });
    const job = reservedJob(ctx);
    const playerBefore = { ...playerRow(ctx) };
    chargeLedgerUnknownBilling(ctx, job);
    expect(ledger(ctx)).toMatchObject({ spentMicroUsd: R, reservedMicroUsd: R });
    expect(playerRow(ctx)).toEqual(playerBefore);
  });

  it('chargeLedgerUnknownBilling on a released job does nothing', () => {
    const ctx = createMockCtx({ timestampMicros: T_2026_09_30 });
    const job = reservedJob(ctx);
    const patch = releaseLlmReservation(ctx, job, { refundCall: true });
    const before = snapshotDb(ctx);
    chargeLedgerUnknownBilling(ctx, { ...job, ...patch });
    expect(snapshotDb(ctx)).toBe(before);
  });

  it('addLedgerSpend adds to ledger spent only, creating the row when absent', () => {
    const ctx = createMockCtx({ timestampMicros: T_2026_09_30 });
    addLedgerSpend(ctx, 77n);
    addLedgerSpend(ctx, 3n);
    expect(rows(ctx, 'llm_spend')).toHaveLength(1);
    expect(ledger(ctx)).toMatchObject({ spentMicroUsd: 80n, reservedMicroUsd: 0n, calls: 0n });
    expect(rows(ctx, 'llm_player_budget')).toHaveLength(0);
  });

  it('subtractLedgerSpend takes back an earlier charge, floored at zero, and never creates the row', () => {
    const empty = createMockCtx({ timestampMicros: T_2026_09_30 });
    subtractLedgerSpend(empty, 5n);
    expect(rows(empty, 'llm_spend')).toHaveLength(0);

    const ctx = createMockCtx({ timestampMicros: T_2026_09_30 });
    addLedgerSpend(ctx, 80n);
    subtractLedgerSpend(ctx, 30n);
    expect(ledger(ctx).spentMicroUsd).toBe(50n);
    subtractLedgerSpend(ctx, 500n);
    expect(ledger(ctx).spentMicroUsd).toBe(0n);
  });

  it('a late arrival swaps the conservative charge: charge, take back, add the real cost = the real cost only', () => {
    const ctx = createMockCtx({ timestampMicros: T_2026_09_30 });
    const job = reservedJob(ctx);
    chargeLedgerUnknownBilling(ctx, job); // the sweeper's stand-in
    releaseLlmReservation(ctx, job, { refundCall: true });
    subtractLedgerSpend(ctx, R); // the reply arrived: billing is known now
    addLedgerSpend(ctx, 123n);
    expect(ledger(ctx).spentMicroUsd).toBe(123n);
    expect(ledger(ctx).reservedMicroUsd).toBe(0n);
  });

  it('a never-billed platform failure never charges the player (T-41-04 fairness)', () => {
    const ctx = createMockCtx({ timestampMicros: T_2026_09_30 });
    const job = reservedJob(ctx);
    chargeLedgerUnknownBilling(ctx, job); // thrown attempt
    settleLlmCost(ctx, job, { actualMicroUsd: 0n, chargePlayer: false }); // final settle, player exempt
    expect(playerRow(ctx).spentMicroUsd).toBe(0n);
    expect(ledger(ctx).spentMicroUsd).toBe(R);
  });
});

describe('isPhaseLedgerExhausted', () => {
  it('is false when the ledger row is absent', () => {
    expect(isPhaseLedgerExhausted(createMockCtx())).toBe(false);
  });

  it('is false at exactly the cap and true one micro-USD above it', () => {
    const at = createMockCtx({
      seed: { llm_spend: [ledgerRow({ spentMicroUsd: 1_500_000n, reservedMicroUsd: 500_000n })] },
    });
    expect(isPhaseLedgerExhausted(at)).toBe(false);
    const over = createMockCtx({
      seed: { llm_spend: [ledgerRow({ spentMicroUsd: 1_500_000n, reservedMicroUsd: 500_001n })] },
    });
    expect(isPhaseLedgerExhausted(over)).toBe(true);
  });
});

describe('prunePlayerBudgets', () => {
  const day = (dayUtc: string, id: bigint) => budgetRow({ id, dayUtc });

  it('deletes rows older than the retention window and keeps the last three days', () => {
    const ctx = createMockCtx({
      timestampMicros: micros('2026-10-03T08:00:00.000Z'),
      seed: {
        llm_player_budget: [
          day('2026-09-29', 1n),
          day('2026-09-30', 2n),
          day('2026-10-01', 3n),
          day('2026-10-02', 4n),
          day('2026-10-03', 5n),
        ],
      },
    });
    expect(prunePlayerBudgets(ctx)).toBe(2);
    expect(rows(ctx, 'llm_player_budget').map((r: any) => r.dayUtc)).toEqual([
      '2026-10-01',
      '2026-10-02',
      '2026-10-03',
    ]);
  });

  it('returns 0 and writes nothing on an empty table', () => {
    const ctx = createMockCtx({ timestampMicros: micros('2026-10-03T08:00:00.000Z') });
    const before = snapshotDb(ctx);
    expect(prunePlayerBudgets(ctx)).toBe(0);
    expect(snapshotDb(ctx)).toBe(before);
  });

  it('prunes across players', () => {
    const ctx = createMockCtx({
      timestampMicros: micros('2026-10-03T08:00:00.000Z'),
      seed: {
        llm_player_budget: [
          day('2026-09-01', 1n),
          { ...day('2026-09-01', 2n), playerId: OTHER },
          { ...day('2026-10-03', 3n), playerId: OTHER },
        ],
      },
    });
    expect(prunePlayerBudgets(ctx)).toBe(2);
    expect(rows(ctx, 'llm_player_budget')).toHaveLength(1);
  });
});
