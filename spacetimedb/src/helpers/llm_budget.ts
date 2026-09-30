// ============================================================================
// LLM budget module (pure, duck-typed ctx)
// ============================================================================
//
// Cost-weighted per-player daily reservation with a call backstop, the hard
// phase spend ledger, settlement, idempotent release and pruning (COST-02).
//
// Runs inside the caller's transaction (a reducer or a procedure withTx), and
// imports nothing from the SpacetimeDB server entry point, the schema, events
// or location helpers, so it loads in plain Node vitest (llm_queue.ts rule).
//
// Pattern: job.reservedMicroUsd is the single source of truth for what a job
// still holds. release and settle return a job patch that zeroes it, the
// caller writes the job row once, and a second release/settle is a no-op.
//
// No wall clock or randomness: time comes from ctx.timestamp only.
// All stored values are bigint whole micro-USD; the only rounding (ceil) lives
// in the tested measurement helpers.
// ============================================================================

import { LLM_ROUTES, type LlmRoute } from '../data/llm_routes';
import { KEEPER_BIBLE } from '../data/keeper_bible';
import { ROUTE_BLOCKS } from '../data/llm_layers';
import {
  LLM_PLAYER_DAILY_COST_MICRO_USD,
  LLM_PLAYER_DAILY_CALLS,
  LLM_PHASE_SPEND_CAP_MICRO_USD,
  LLM_BUDGET_RETENTION_DAYS,
  LLM_SPEND_ID,
} from '../data/llm_limits';
import { reserveCostMicroUsd } from './measurement';

export type LlmBudgetMode = 'player' | 'phase_only';
export type LlmBudgetRefusal = 'daily_cost' | 'daily_calls' | 'phase_cap';

export type LlmReserveResult =
  | { ok: true; reservedMicroUsd: bigint; budgetDay: string }
  | { ok: false; reason: LlmBudgetRefusal };

const MICROS_PER_DAY = 86_400_000_000n;

// ---------------------------------------------------------------------------
// Estimation
// ---------------------------------------------------------------------------

/** UTC date string (YYYY-MM-DD) of a SpacetimeDB timestamp. */
export function utcDateString(timestamp: any): string {
  const ms = Number(timestamp.microsSinceUnixEpoch / 1000n);
  const d = new Date(ms);
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`;
}

/** UTC day (YYYY-MM-DD) of a SpacetimeDB timestamp. */
export function utcDay(timestamp: any): string {
  return utcDateString(timestamp);
}

/** Prompt size estimate: Keeper Bible + route block + the request JSON (stands in for the volatile tail). */
export function estimatePromptChars(route: LlmRoute, requestJson: string): number {
  return KEEPER_BIBLE.length + ROUTE_BLOCKS[route].length + requestJson.length;
}

/** Up-front reservation in whole micro-USD (the helper already rounds up). */
export function reservationMicroUsd(route: LlmRoute, requestJson: string): bigint {
  return BigInt(reserveCostMicroUsd(LLM_ROUTES[route].maxTokens, estimatePromptChars(route, requestJson)));
}

// ---------------------------------------------------------------------------
// Private helpers
// ---------------------------------------------------------------------------

function subFloor(a: bigint, b: bigint): bigint {
  return a > b ? a - b : 0n;
}

/** No multi-column index: filter by player, match the day in code. */
function findPlayerDay(ctx: any, playerId: any, dayUtc: string): any | undefined {
  for (const row of ctx.db.llm_player_budget.by_player.filter(playerId)) {
    if (row.dayUtc === dayUtc) return row;
  }
  return undefined;
}

export function getPhaseLedger(ctx: any): any | undefined {
  return ctx.db.llm_spend.id.find(LLM_SPEND_ID);
}

/** Returns the ledger row, inserting a zero row when absent. */
function ensureLedger(ctx: any): any {
  const existing = getPhaseLedger(ctx);
  if (existing) return existing;
  return ctx.db.llm_spend.insert({
    id: LLM_SPEND_ID,
    spentMicroUsd: 0n,
    reservedMicroUsd: 0n,
    calls: 0n,
    updatedAt: ctx.timestamp,
  });
}

// ---------------------------------------------------------------------------
// Reserve
// ---------------------------------------------------------------------------

/**
 * Reserve budget for one call. Refusal order (pinned): daily_calls, daily_cost,
 * phase_cap. A refusal writes nothing. 'phase_only' (smoke jobs) counts against
 * the ledger only and leaves every player row untouched.
 */
export function reserveLlmBudget(
  ctx: any,
  args: { playerId: any; route: LlmRoute; requestJson: string; mode: LlmBudgetMode },
): LlmReserveResult {
  const r = reservationMicroUsd(args.route, args.requestJson);
  const playerMode = args.mode === 'player';
  const today = utcDay(ctx.timestamp);

  const dayRow = playerMode ? findPlayerDay(ctx, args.playerId, today) : undefined;
  if (playerMode) {
    const calls: bigint = dayRow ? dayRow.calls : 0n;
    const held: bigint = dayRow ? dayRow.spentMicroUsd + dayRow.reservedMicroUsd : 0n;
    if (calls >= LLM_PLAYER_DAILY_CALLS) return { ok: false, reason: 'daily_calls' };
    if (held + r > LLM_PLAYER_DAILY_COST_MICRO_USD) return { ok: false, reason: 'daily_cost' };
  }

  const ledger = getPhaseLedger(ctx);
  const ledgerHeld: bigint = ledger ? ledger.spentMicroUsd + ledger.reservedMicroUsd : 0n;
  if (ledgerHeld + r > LLM_PHASE_SPEND_CAP_MICRO_USD) return { ok: false, reason: 'phase_cap' };

  // All checks passed: write.
  if (playerMode) {
    if (dayRow) {
      ctx.db.llm_player_budget.id.update({
        ...dayRow,
        reservedMicroUsd: dayRow.reservedMicroUsd + r,
        calls: dayRow.calls + 1n,
      });
    } else {
      ctx.db.llm_player_budget.insert({
        id: 0n,
        playerId: args.playerId,
        dayUtc: today,
        reservedMicroUsd: r,
        spentMicroUsd: 0n,
        calls: 1n,
      });
    }
  }
  const led = ensureLedger(ctx);
  ctx.db.llm_spend.id.update({
    ...led,
    reservedMicroUsd: led.reservedMicroUsd + r,
    calls: led.calls + 1n,
    updatedAt: ctx.timestamp,
  });

  return { ok: true, reservedMicroUsd: r, budgetDay: playerMode ? today : '' };
}

// ---------------------------------------------------------------------------
// Release and settle
// ---------------------------------------------------------------------------

/**
 * Release what a job still holds. Idempotent: does nothing when
 * job.reservedMicroUsd is 0n (which also refunds a call at most once).
 * Returns the job patch the caller must write.
 */
export function releaseLlmReservation(
  ctx: any,
  job: { playerId: any; budgetDay?: string; reservedMicroUsd: bigint },
  opts: { refundCall: boolean },
): { reservedMicroUsd: bigint } {
  const held = job.reservedMicroUsd;
  if (held > 0n) {
    const dayRow = job.budgetDay ? findPlayerDay(ctx, job.playerId, job.budgetDay) : undefined;
    if (dayRow) {
      ctx.db.llm_player_budget.id.update({
        ...dayRow,
        reservedMicroUsd: subFloor(dayRow.reservedMicroUsd, held),
        calls: opts.refundCall ? subFloor(dayRow.calls, 1n) : dayRow.calls,
      });
    }
    const ledger = getPhaseLedger(ctx);
    if (ledger) {
      ctx.db.llm_spend.id.update({
        ...ledger,
        reservedMicroUsd: subFloor(ledger.reservedMicroUsd, held),
        calls: opts.refundCall ? subFloor(ledger.calls, 1n) : ledger.calls,
        updatedAt: ctx.timestamp,
      });
    }
  }
  return { reservedMicroUsd: 0n };
}

/** Add to the ledger's spent only (settlement and the late-arrival path). */
export function addLedgerSpend(ctx: any, micro: bigint): void {
  const ledger = ensureLedger(ctx);
  ctx.db.llm_spend.id.update({
    ...ledger,
    spentMicroUsd: ledger.spentMicroUsd + micro,
    updatedAt: ctx.timestamp,
  });
}

/** Take back an earlier ledger charge (floored at zero): the late-arrival swap of a conservative charge. */
export function subtractLedgerSpend(ctx: any, micro: bigint): void {
  if (micro <= 0n) return;
  const ledger = getPhaseLedger(ctx);
  if (!ledger) return;
  ctx.db.llm_spend.id.update({
    ...ledger,
    spentMicroUsd: subFloor(ledger.spentMicroUsd, micro),
    updatedAt: ctx.timestamp,
  });
}

/**
 * Replace a reservation with the real cost: release without a call refund, add
 * the actual cost to the ledger always and to the player only when chargePlayer.
 * Returns the job patch the caller must write.
 */
export function settleLlmCost(
  ctx: any,
  job: { playerId: any; budgetDay?: string; reservedMicroUsd: bigint; costMicroUsd?: bigint },
  opts: { actualMicroUsd: bigint; chargePlayer: boolean },
): { reservedMicroUsd: bigint; costMicroUsd: bigint } {
  releaseLlmReservation(ctx, job, { refundCall: false });
  addLedgerSpend(ctx, opts.actualMicroUsd);
  if (opts.chargePlayer && job.budgetDay) {
    const dayRow = findPlayerDay(ctx, job.playerId, job.budgetDay);
    if (dayRow) {
      ctx.db.llm_player_budget.id.update({
        ...dayRow,
        spentMicroUsd: dayRow.spentMicroUsd + opts.actualMicroUsd,
      });
    }
  }
  return { reservedMicroUsd: 0n, costMicroUsd: (job.costMicroUsd ?? 0n) + opts.actualMicroUsd };
}

/**
 * A thrown attempt of unknown billing: the ledger conservatively counts the
 * reservation as spent. The reservation stays held for the next attempt or the
 * final release. The player is never touched.
 */
export function chargeLedgerUnknownBilling(ctx: any, job: { reservedMicroUsd: bigint }): void {
  if (job.reservedMicroUsd <= 0n) return;
  addLedgerSpend(ctx, job.reservedMicroUsd);
}

// ---------------------------------------------------------------------------
// Ledger status and pruning
// ---------------------------------------------------------------------------

export function isPhaseLedgerExhausted(ctx: any): boolean {
  const ledger = getPhaseLedger(ctx);
  if (!ledger) return false;
  return ledger.spentMicroUsd + ledger.reservedMicroUsd > LLM_PHASE_SPEND_CAP_MICRO_USD;
}

/**
 * Delete llm_player_budget rows older than the retention window. Iterates the
 * table: the only caller is the sweeper reducer, never a view.
 */
export function prunePlayerBudgets(ctx: any): number {
  const cutoffMicros = ctx.timestamp.microsSinceUnixEpoch - BigInt(LLM_BUDGET_RETENTION_DAYS) * MICROS_PER_DAY;
  const cutoff = utcDay({ microsSinceUnixEpoch: cutoffMicros });
  const stale = [...ctx.db.llm_player_budget.iter()].filter((row: any) => row.dayUtc < cutoff);
  for (const row of stale) ctx.db.llm_player_budget.id.delete(row.id);
  return stale.length;
}
