// pool_tick.ts
// The heartbeat of the density pools (Phase 51.3.1.1 Plan 14; SC4, SC5, D-21, D-23; RESEARCH
// Section 5). The scheduled `tick_pools` reducer (index.ts) runs runPoolTick once a minute after its
// guard and its one-row reschedule, once the world is migrated (pool_state.version at
// POOL_MIGRATION_VERSION; until then tick_pools runs the Plan 15 migration step of
// helpers/pool_migration.ts instead). Each step is a plain function:
//   1. settleDirtyPools: settle only the pools away from home or wiped and waiting (the by_dirty
//      index), so the cost follows active pools, not the size of the world (D-18, D-19, MD-13, B11);
//   2. runHunters: every HUNTER_INTERVAL_MICROS, a seeded HUNTER_ACTIVITY_PCT chance per region to
//      thin HUNTER_PLACES_PER_REGION creature pool(s) by HUNTER_THIN_POINTS, Overrun weighted; no
//      visible hunter parties (D-21);
//   3. runRegionTrends: every TREND_CHECK_MICROS, a region whose summed creature levels moved by
//      TREND_DELTA_LEVELS or more reads wilder or quieter through onPoolShift (D-23).
// Every pool and every region is isolated in try/catch, so one bad row never stops the chain.
// Deterministic: "now" is passed in (ctx.timestamp); no clock reads and no random calls.

import { ScheduleAt } from 'spacetimedb';
import { DENSITY_RULES, countToLevel, hunterActive, pickHunterTargets, poolSeed, regionTrend } from '../data/density_rules';
import { redactSecrets } from './measurement';
import { applyDepletion, settlePool } from './pools';
import type { PlacePoolRow } from './pools';
import { onPoolShift } from './pool_events';

/** The pool_state singleton (id 1n). */
export interface PoolStateRow {
  id: bigint;
  version: bigint;
  lastHunterMicros: bigint;
  lastTrendMicros: bigint;
  /** The region whose migration failed last (0n none) and its failures in a row (review A WR-02). */
  migrationFailRegionId: bigint;
  migrationFailCount: bigint;
  /** Comma-separated ids of regions the migration skipped after MIGRATION_MAX_ATTEMPTS. */
  migrationSkippedRegions: string;
}

const POOL_STATE_ID = 1n;

function byId(a: { id: bigint }, b: { id: bigint }): number {
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}

function logFailure(what: string, error: unknown): void {
  console.error(`tick_pools: ${what} failed: ${redactSecrets(String(error))}`);
}

/** The pool_state singleton, created with version 0n and zero times when missing. */
export function poolState(ctx: any): PoolStateRow {
  const existing = ctx.db.pool_state.id.find(POOL_STATE_ID);
  if (existing) return existing;
  return ctx.db.pool_state.insert({
    id: POOL_STATE_ID,
    version: 0n,
    lastHunterMicros: 0n,
    lastTrendMicros: 0n,
    migrationFailRegionId: 0n,
    migrationFailCount: 0n,
    migrationSkippedRegions: '',
  });
}

/** Writes some fields of the singleton over the stored row (never over a stale copy). Plan 15 sets `version` through it. */
export function updatePoolState(ctx: any, fields: Partial<PoolStateRow>): PoolStateRow {
  const updated = { ...poolState(ctx), ...fields };
  ctx.db.pool_state.id.update(updated);
  return updated;
}

/**
 * Step 1: settles every dirty pool (count away from home, or a wiped family waiting out its reset)
 * through settlePool, in id order. Clean pools are never read or written. A creature pool whose
 * family row is missing is a bad row: it is logged and left alone (no nameless mirror is written).
 * Each pool is isolated: a failure logs one line and the next pool still settles.
 */
export function settleDirtyPools(ctx: any, now: bigint): number {
  const dirty: PlacePoolRow[] = [...ctx.db.place_pool.by_dirty.filter(true)].sort(byId);
  let settled = 0;
  for (const pool of dirty) {
    try {
      if (pool.kind === 'creature' && !ctx.db.creature_family.id.find(pool.refId)) {
        throw new Error(`creature family ${pool.refId} is missing`);
      }
      settlePool(ctx, pool, now);
      settled += 1;
    } catch (error) {
      logFailure(`settling pool ${pool.id}`, error);
    }
  }
  return settled;
}

/**
 * Step 2, the background hunter (D-21): when HUNTER_INTERVAL_MICROS has passed since the last run,
 * each region rolls hunterActive(poolSeed(regionId, now / HUNTER_INTERVAL_MICROS)); an active region
 * thins pickHunterTargets(seed, its settled creature pools above 0, HUNTER_PLACES_PER_REGION) by
 * HUNTER_THIN_POINTS through applyDepletion (cause 'hunter', so a fall is announced and a wipe runs
 * the vacuum). lastHunterMicros becomes now. Each region is isolated.
 */
export function runHunters(ctx: any, now: bigint, state: PoolStateRow): PoolStateRow {
  if (now - state.lastHunterMicros < DENSITY_RULES.HUNTER_INTERVAL_MICROS) return state;
  const regions = [...ctx.db.region.iter()].sort(byId);
  for (const region of regions) {
    try {
      const seed = poolSeed(region.id, now / DENSITY_RULES.HUNTER_INTERVAL_MICROS);
      if (!hunterActive(seed)) continue;
      const pools = [...ctx.db.place_pool.by_region.filter(region.id)]
        .filter((row: PlacePoolRow) => row.kind === 'creature')
        .sort(byId)
        .map((row: PlacePoolRow) => settlePool(ctx, row, now).pool)
        .map((pool: PlacePoolRow) => ({ pool, level: countToLevel(pool.count) as number }))
        .filter((entry) => entry.level > 0);
      const targets = pickHunterTargets(seed, pools, DENSITY_RULES.HUNTER_PLACES_PER_REGION);
      for (const target of targets) {
        applyDepletion(ctx, target.pool, DENSITY_RULES.HUNTER_THIN_POINTS, now, 'hunter', seed);
      }
    } catch (error) {
      logFailure(`hunters in region ${region.id}`, error);
    }
  }
  return updatePoolState(ctx, { lastHunterMicros: now });
}

/**
 * Step 3, region trends (D-23): when TREND_CHECK_MICROS has passed since the last check, each region
 * with creature pools sums their public levels (pool_level, kind creature). The first check stores
 * the sum (pool_region) without a shift; later checks compare with the stored sum and a move of
 * TREND_DELTA_LEVELS or more calls onPoolShift region_trend 'wilder' or 'quieter'. The new sum is
 * always stored. A region without creature pools stores nothing, so its first pools are not a trend.
 * lastTrendMicros becomes now. Each region is isolated.
 */
export function runRegionTrends(ctx: any, now: bigint, state: PoolStateRow): PoolStateRow {
  if (now - state.lastTrendMicros < DENSITY_RULES.TREND_CHECK_MICROS) return state;
  const regions = [...ctx.db.region.iter()].sort(byId);
  for (const region of regions) {
    try {
      const levels = [...ctx.db.pool_level.by_region.filter(region.id)].filter((row: any) => row.kind === 'creature');
      if (levels.length === 0) continue;
      const sum = levels.reduce((total: bigint, row: any) => total + BigInt(row.level ?? 0n), 0n);
      const stored = ctx.db.pool_region.regionId.find(region.id);
      if (!stored) {
        ctx.db.pool_region.insert({ regionId: region.id, trendSum: sum });
        continue;
      }
      const trend = regionTrend(Number(stored.trendSum), Number(sum));
      if (trend) onPoolShift(ctx, { kind: 'region_trend', regionId: region.id, trend }, now);
      if (stored.trendSum !== sum) ctx.db.pool_region.regionId.update({ ...stored, trendSum: sum });
    } catch (error) {
      logFailure(`trend in region ${region.id}`, error);
    }
  }
  return updatePoolState(ctx, { lastTrendMicros: now });
}

/**
 * The work of one `tick_pools` run, after the reducer's guard and reschedule. `arg` is the scheduled
 * row (its afterRegionId cursor is for a later batching step). Steps run in order; a step that
 * throws is logged and the next one still runs.
 */
export function runPoolTick(ctx: any, _arg: { afterRegionId?: bigint } | undefined, now: bigint): void {
  try {
    settleDirtyPools(ctx, now);
  } catch (error) {
    logFailure('settling dirty pools', error);
  }
  try {
    runHunters(ctx, now, poolState(ctx));
  } catch (error) {
    logFailure('hunters', error);
  }
  try {
    runRegionTrends(ctx, now, poolState(ctx));
  } catch (error) {
    logFailure('region trends', error);
  }
}

/**
 * Arms the pool tick: a row due now when none is pending. Called from init, clientConnected and the
 * passage sweep, because init does not run again on a republish.
 */
export function ensurePoolTickScheduled(ctx: any): void {
  if ([...ctx.db.pool_tick.iter()].length > 0) return;
  ctx.db.pool_tick.insert({
    scheduledId: 0n,
    scheduledAt: ScheduleAt.time(ctx.timestamp.microsSinceUnixEpoch),
    afterRegionId: 0n,
  });
}
