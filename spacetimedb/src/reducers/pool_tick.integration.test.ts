/**
 * Phase 51.3.1.1 Plan 14: the scheduled pool tick (helpers/pool_tick.ts runPoolTick) on the shared
 * pool world (helpers/pool_fixture.ts) and a strict mock db. The tick settles only dirty pools,
 * runs the light background hunter (D-21) and reports region trends (D-23); one bad pool never
 * stops the others (SC5).
 */
import { describe, it, expect, vi, beforeAll, afterEach } from 'vitest';
import { DENSITY_RULES, hunterActive, poolSeed } from '../data/density_rules';
import { overrunSettleLine, worldEventName } from '../data/density_lines';
import {
  T0,
  REGION_ID,
  ORCHARD_ID,
  GOBLINS_ID,
  SKITTERERS_ID,
  poolWorld,
  poolCtx,
  seedPools,
} from '../helpers/pool_fixture';
import { createPool, setPoolCount } from '../helpers/pools';
import {
  poolState,
  runPoolTick,
  runHunters,
  runRegionTrends,
  settleDirtyPools,
} from '../helpers/pool_tick';

vi.mock('spacetimedb/server', async () =>
  (await import('../helpers/schema_recorder')).createRecordingServerMock(),
);

beforeAll(async () => {
  await import('../schema/tables');
}, 120_000);

afterEach(() => {
  vi.restoreAllMocks();
});

const SEC = 1_000_000n;
const MIN = 60n * SEC;
const HUNT = DENSITY_RULES.HUNTER_INTERVAL_MICROS;
const TREND = DENSITY_RULES.TREND_CHECK_MICROS;
const ARG = { scheduledId: 1n, afterRegionId: 0n };

const rows = (ctx: any, table: string): any[] => ctx.db._tables[table] ?? [];
const poolRow = (ctx: any, id: bigint) => rows(ctx, 'place_pool').find((r: any) => r.id === id);
const densityLines = (ctx: any) =>
  rows(ctx, 'event_private').filter((e: any) => e.kind === 'density_down' || e.kind === 'density_gone');

/** A pool world whose hunter and trend clocks were just reset at T0 (neither runs for a while). */
function quietWorld(opts: Parameters<typeof poolWorld>[0] = {}) {
  return poolWorld({
    ...opts,
    extra: { pool_state: [{ id: 1n, version: 0n, lastHunterMicros: T0, lastTrendMicros: T0 }], ...(opts.extra ?? {}) },
  });
}

/** One tick at `t`, the way the scheduled reducer runs it (ctx.timestamp moves with it). */
function tickAt(ctx: any, t: bigint): void {
  ctx.timestamp = { microsSinceUnixEpoch: t };
  runPoolTick(ctx, ARG, t);
}

/** Wraps ctx.db so place_pool.iter calls are counted and place_pool.id.update can be replaced. */
function interceptPlacePool(
  ctx: any,
  hooks: { onIter?: () => void; update?: (row: any, real: (row: any) => any) => any },
): void {
  const db = ctx.db;
  ctx.db = new Proxy(db, {
    get(target: any, name: string) {
      const table = target[name];
      if (name !== 'place_pool') return table;
      return new Proxy(table, {
        get(t2: any, prop: string) {
          const value = t2[prop];
          if (prop === 'iter' && hooks.onIter) {
            return (...args: any[]) => {
              hooks.onIter!();
              return value(...args);
            };
          }
          if (prop === 'id' && hooks.update) {
            return new Proxy(value, {
              get(o: any, p: string) {
                return p === 'update' ? (row: any) => hooks.update!(row, (r: any) => o.update(r)) : o[p];
              },
            });
          }
          return value;
        },
      });
    },
  });
}

/** Interval numbers (now / HUNTER_INTERVAL_MICROS) after T0 where region 1's hunter seed is active or not. */
function hunterIntervals(regionId: bigint): { active: bigint; inactive: bigint } {
  let active: bigint | null = null;
  let inactive: bigint | null = null;
  for (let k = T0 / HUNT + 1n; active === null || inactive === null; k += 1n) {
    if (hunterActive(poolSeed(regionId, k))) active ??= k;
    else inactive ??= k;
  }
  return { active, inactive };
}

describe('settleDirtyPools: regrowth and Overrun settling on the tick', () => {
  it('a dirty creature pool at 30 (home 50) regrows to 50 over the ticks, then is clean; regrowth is silent', () => {
    const ctx = poolCtx(quietWorld());
    const { goblinsOrchard } = seedPools(ctx);
    setPoolCount(ctx, goblinsOrchard, 30n, T0);
    expect(poolRow(ctx, goblinsOrchard.id).dirty).toBe(true);

    tickAt(ctx, T0 + MIN);
    expect(poolRow(ctx, goblinsOrchard.id).count).toBe(34n); // 4 points a minute
    for (let m = 2n; m <= 6n; m += 1n) tickAt(ctx, T0 + m * MIN);

    expect(poolRow(ctx, goblinsOrchard.id)).toMatchObject({ count: 50n, dirty: false });
    expect(densityLines(ctx)).toEqual([]);
  });

  it('an Overrun pool at 75 (home 50) settles below 67 within 5 minutes and prints one settle line per online character there', () => {
    const ctx = poolCtx(quietWorld());
    const { goblinsOrchard } = seedPools(ctx);
    setPoolCount(ctx, goblinsOrchard, 75n, T0);
    for (let m = 1n; m <= 5n; m += 1n) tickAt(ctx, T0 + m * MIN);

    expect(poolRow(ctx, goblinsOrchard.id).count < DENSITY_RULES.OVERRUN_FLOOR).toBe(true);
    const lines = densityLines(ctx);
    // Alice and Bob are online at the orchard; Cara is offline.
    expect(lines.map((l: any) => l.characterId)).toEqual([1n, 2n]);
    for (const line of lines) {
      expect(line.kind).toBe('density_down');
      expect(line.message).toBe(overrunSettleLine('goblins', 'Glass Orchard'));
    }
  });

  it('a clean pool at home is never written by the tick', () => {
    const ctx = poolCtx(quietWorld());
    seedPools(ctx);
    const before = rows(ctx, 'place_pool').map((r: any) => ({ ...r }));
    const mirrors = rows(ctx, 'pool_level').map((r: any) => ({ ...r }));
    for (let m = 1n; m <= 5n; m += 1n) tickAt(ctx, T0 + m * MIN);
    expect(rows(ctx, 'place_pool')).toEqual(before);
    expect(rows(ctx, 'pool_level')).toEqual(mirrors);
  });

  it('only dirty pools are visited (the by_dirty index), not every pool of the world', () => {
    const ctx = poolCtx(quietWorld());
    const { goblinsOrchard } = seedPools(ctx);
    setPoolCount(ctx, goblinsOrchard, 30n, T0);
    let scans = 0;
    interceptPlacePool(ctx, { onIter: () => (scans += 1) });
    settleDirtyPools(ctx, T0 + MIN);
    expect(scans).toBe(0);
    expect(poolRow(ctx, goblinsOrchard.id).count).toBe(34n);
  });

  it('a creature pool whose family row is missing logs once and the other pools still settle in the same tick', () => {
    const ctx = poolCtx(quietWorld());
    const { goblinsOrchard } = seedPools(ctx);
    const orphan = createPool(
      ctx,
      { regionId: REGION_ID, locationId: ORCHARD_ID, kind: 'creature', refId: 99n, homeLevel: 2, count: 30n },
      T0,
    );
    setPoolCount(ctx, goblinsOrchard, 30n, T0);
    const errors = vi.spyOn(console, 'error').mockImplementation(() => {});

    tickAt(ctx, T0 + MIN);

    expect(errors).toHaveBeenCalledTimes(1);
    expect(String(errors.mock.calls[0][0])).toContain(`pool ${orphan.id}`);
    expect(poolRow(ctx, orphan.id).count).toBe(30n);
    expect(poolRow(ctx, goblinsOrchard.id).count).toBe(34n);
  });

  it('a pool that throws while settling is isolated: the next pool still settles', () => {
    const ctx = poolCtx(quietWorld());
    const { goblinsOrchard, skitterersFlats } = seedPools(ctx);
    setPoolCount(ctx, goblinsOrchard, 30n, T0);
    setPoolCount(ctx, skitterersFlats, 30n, T0);
    interceptPlacePool(ctx, {
      update: (row, real) => {
        if (row.id === goblinsOrchard.id) throw new Error('boom');
        return real(row);
      },
    });
    const errors = vi.spyOn(console, 'error').mockImplementation(() => {});

    tickAt(ctx, T0 + MIN);

    expect(errors).toHaveBeenCalledTimes(1);
    expect(poolRow(ctx, goblinsOrchard.id).count).toBe(30n);
    expect(poolRow(ctx, skitterersFlats.id).count).toBe(34n);
  });
});

describe('runHunters: the light background hunter (D-21)', () => {
  const { active, inactive } = hunterIntervals(REGION_ID);

  function huntedWorld() {
    const ctx = poolCtx(poolWorld({ extra: { pool_state: [{ id: 1n, version: 0n, lastHunterMicros: 0n, lastTrendMicros: 0n }] } }));
    seedPools(ctx);
    return ctx;
  }

  it('an active seed thins exactly HUNTER_PLACES_PER_REGION creature pool by HUNTER_THIN_POINTS, the same pool for the same seed', () => {
    const t = active * HUNT;
    const picked: bigint[] = [];
    for (let run = 0; run < 2; run += 1) {
      const ctx = huntedWorld();
      const before = new Map(rows(ctx, 'place_pool').map((r: any) => [r.id, r.count]));
      runHunters(ctx, t, poolState(ctx));
      const thinned = rows(ctx, 'place_pool').filter((r: any) => r.count !== before.get(r.id));
      expect(thinned).toHaveLength(DENSITY_RULES.HUNTER_PLACES_PER_REGION);
      expect(thinned[0].kind).toBe('creature');
      expect(before.get(thinned[0].id)! - thinned[0].count).toBe(DENSITY_RULES.HUNTER_THIN_POINTS);
      expect(poolState(ctx).lastHunterMicros).toBe(t);
      picked.push(thinned[0].id);
    }
    expect(picked[0]).toBe(picked[1]);
  });

  it('an inactive seed leaves the region untouched, and lastHunterMicros still advances', () => {
    const t = inactive * HUNT;
    const ctx = huntedWorld();
    const before = rows(ctx, 'place_pool').map((r: any) => ({ ...r }));
    runHunters(ctx, t, poolState(ctx));
    expect(rows(ctx, 'place_pool')).toEqual(before);
    expect(poolState(ctx).lastHunterMicros).toBe(t);
  });

  it('does nothing before HUNTER_INTERVAL_MICROS has passed since the last run', () => {
    const t = active * HUNT;
    const ctx = poolCtx(poolWorld({ extra: { pool_state: [{ id: 1n, version: 0n, lastHunterMicros: t - HUNT + SEC, lastTrendMicros: 0n }] } }));
    seedPools(ctx);
    const before = rows(ctx, 'place_pool').map((r: any) => ({ ...r }));
    runHunters(ctx, t, poolState(ctx));
    expect(rows(ctx, 'place_pool')).toEqual(before);
    expect(poolState(ctx).lastHunterMicros).toBe(t - HUNT + SEC);
  });

  it('over 100 intervals hunters act near HUNTER_ACTIVITY_PCT of the time and pick Overrun pools more often than Stable ones', () => {
    const ctx = huntedWorld();
    const goblins = rows(ctx, 'place_pool').find((r: any) => r.kind === 'creature' && r.refId === GOBLINS_ID);
    const skitterers = rows(ctx, 'place_pool').find((r: any) => r.kind === 'creature' && r.refId === SKITTERERS_ID);
    let activeChecks = 0;
    let seededActive = 0;
    let overrunPicks = 0;
    let stablePicks = 0;
    const first = T0 / HUNT + 1n;
    for (let k = first; k < first + 100n; k += 1n) {
      const t = k * HUNT;
      // Goblins Overrun, Skitterers Stable, both freshly settled at t.
      setPoolCount(ctx, poolRow(ctx, goblins.id), 75n, t);
      setPoolCount(ctx, poolRow(ctx, skitterers.id), 50n, t);
      runHunters(ctx, t, poolState(ctx));
      const g = poolRow(ctx, goblins.id).count;
      const s = poolRow(ctx, skitterers.id).count;
      if (g !== 75n || s !== 50n) activeChecks += 1;
      if (hunterActive(poolSeed(REGION_ID, k))) seededActive += 1;
      if (g !== 75n) overrunPicks += 1;
      if (s !== 50n) stablePicks += 1;
    }
    const pct = DENSITY_RULES.HUNTER_ACTIVITY_PCT;
    expect(pct).toBeLessThanOrEqual(30); // low by default
    // The tick acts exactly on the checks whose region seed is active.
    expect(activeChecks).toBe(seededActive);
    expect(activeChecks).toBeGreaterThan(0);
    expect(activeChecks).toBeLessThan(50);
    // Across ten regions over the same 100 intervals, the active share is near HUNTER_ACTIVITY_PCT.
    let regionChecks = 0;
    for (let regionId = 1n; regionId <= 10n; regionId += 1n) {
      for (let k = first; k < first + 100n; k += 1n) if (hunterActive(poolSeed(regionId, k))) regionChecks += 1;
    }
    expect(Math.abs(regionChecks / 10 - pct)).toBeLessThanOrEqual(5);
    expect(overrunPicks + stablePicks).toBe(activeChecks * DENSITY_RULES.HUNTER_PLACES_PER_REGION);
    expect(overrunPicks).toBeGreaterThan(stablePicks);
  });
});

describe('runRegionTrends: wilder and quieter regions (D-23)', () => {
  function trendWorld() {
    const ctx = poolCtx(poolWorld({ extra: { pool_state: [{ id: 1n, version: 0n, lastHunterMicros: T0, lastTrendMicros: 0n }] } }));
    const pools = seedPools(ctx);
    return { ctx, pools };
  }
  const trendLines = (ctx: any) => rows(ctx, 'event_world').filter((e: any) => e.kind === 'world_event');

  it('the first check stores the region sum without a shift', () => {
    const { ctx } = trendWorld();
    runRegionTrends(ctx, T0, poolState(ctx));
    expect(rows(ctx, 'pool_region')).toEqual([{ regionId: REGION_ID, trendSum: 4n }]);
    expect(trendLines(ctx)).toEqual([]);
    expect(poolState(ctx).lastTrendMicros).toBe(T0);
  });

  it('a drop of 3+ levels reads quieter (one World event line), a later rise reads wilder', () => {
    const { ctx, pools } = trendWorld();
    runRegionTrends(ctx, T0, poolState(ctx));

    // Goblins wiped out (2 -> 0), Skitterers Scarce (2 -> 1): sum 4 -> 1.
    setPoolCount(ctx, poolRow(ctx, pools.goblinsOrchard.id), 0n, T0 + MIN);
    setPoolCount(ctx, poolRow(ctx, pools.skitterersFlats.id), 20n, T0 + MIN);
    runRegionTrends(ctx, T0 + TREND, poolState(ctx));
    expect(trendLines(ctx).map((e: any) => e.message)).toEqual([
      worldEventName({ kind: 'region_trend', regionName: 'Ashen Reach', trend: 'quieter' }),
    ]);
    expect(rows(ctx, 'pool_rumor').map((r: any) => r.kind)).toEqual(['region_trend:quieter']);
    expect(rows(ctx, 'pool_region')[0].trendSum).toBe(1n);

    // Goblins back to Stable (0 -> 2), Skitterers Overrun (1 -> 3): sum 1 -> 5.
    setPoolCount(ctx, poolRow(ctx, pools.goblinsOrchard.id), 50n, T0 + TREND + MIN);
    setPoolCount(ctx, poolRow(ctx, pools.skitterersFlats.id), 75n, T0 + TREND + MIN);
    runRegionTrends(ctx, T0 + 2n * TREND, poolState(ctx));
    expect(trendLines(ctx).map((e: any) => e.message)).toEqual([
      worldEventName({ kind: 'region_trend', regionName: 'Ashen Reach', trend: 'quieter' }),
      worldEventName({ kind: 'region_trend', regionName: 'Ashen Reach', trend: 'wilder' }),
    ]);
    expect(rows(ctx, 'pool_region')[0].trendSum).toBe(5n);
  });

  it('a small move is no trend, and nothing runs before TREND_CHECK_MICROS has passed', () => {
    const { ctx, pools } = trendWorld();
    runRegionTrends(ctx, T0, poolState(ctx));
    setPoolCount(ctx, poolRow(ctx, pools.goblinsOrchard.id), 20n, T0 + MIN); // 4 -> 3

    runRegionTrends(ctx, T0 + TREND - SEC, poolState(ctx));
    expect(poolState(ctx).lastTrendMicros).toBe(T0);
    runRegionTrends(ctx, T0 + TREND, poolState(ctx));
    expect(trendLines(ctx)).toEqual([]);
    expect(rows(ctx, 'pool_region')[0].trendSum).toBe(3n);
  });

  it('a region with no creature pools stores nothing (its first pools are not a trend)', () => {
    const ctx = poolCtx(poolWorld());
    runRegionTrends(ctx, T0, poolState(ctx));
    expect(rows(ctx, 'pool_region')).toEqual([]);
  });
});

describe('runPoolTick and poolState', () => {
  it('poolState creates the singleton once with zero times', () => {
    const ctx = poolCtx(poolWorld());
    expect(poolState(ctx)).toEqual({ id: 1n, version: 0n, lastHunterMicros: 0n, lastTrendMicros: 0n });
    poolState(ctx);
    expect(rows(ctx, 'pool_state')).toHaveLength(1);
  });

  it('one tick settles, hunts and checks trends, and keeps both clocks', () => {
    const ctx = poolCtx(poolWorld());
    seedPools(ctx);
    const t = hunterIntervals(REGION_ID).active * HUNT;
    tickAt(ctx, t);
    expect(poolState(ctx)).toMatchObject({ lastHunterMicros: t, lastTrendMicros: t });
    expect(rows(ctx, 'pool_region')).toHaveLength(1);
  });
});
