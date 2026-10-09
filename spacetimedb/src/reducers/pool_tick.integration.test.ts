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
  MODULE,
  ALICE,
  REGION_ID,
  ORCHARD_ID,
  GOBLINS_ID,
  SKITTERERS_ID,
  poolWorld,
  poolCtx,
  seedPools,
} from '../helpers/pool_fixture';
import { createPool, setPoolCount } from '../helpers/pools';
import { capturedReducer } from '../helpers/schema_recorder';
import {
  poolState,
  runPoolTick,
  runHunters,
  runRegionTrends,
  settleDirtyPools,
  ensurePoolTickScheduled,
} from '../helpers/pool_tick';
import { POOL_MIGRATION_VERSION, migrateRegion } from '../helpers/pool_migration';

vi.mock('spacetimedb/server', async () =>
  (await import('../helpers/schema_recorder')).createRecordingServerMock(),
);

let tickPools: (...args: any[]) => any;
let onInit: (...args: any[]) => any;
let onConnect: (...args: any[]) => any;
let sweepPassagesTick: (...args: any[]) => any;

beforeAll(async () => {
  await import('../index');
  const grab = (name: string) => {
    const h = capturedReducer(name);
    if (typeof h !== 'function') {
      throw new Error(`capturedReducer('${name}') is not a function: STOP and report; never edit production code to fix this.`);
    }
    return h;
  };
  tickPools = grab('tick_pools');
  onInit = grab('__init__');
  onConnect = grab('__client_connected__');
  sweepPassagesTick = grab('sweep_passages');
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

/**
 * A migrated pool world (Plan 15: pool_state.version is POOL_MIGRATION_VERSION, so tick_pools runs the
 * normal tick) whose hunter and trend clocks were just reset at T0 (neither runs for a while).
 */
function quietWorld(opts: Parameters<typeof poolWorld>[0] = {}) {
  return poolWorld({
    ...opts,
    extra: {
      pool_state: [{ id: 1n, version: POOL_MIGRATION_VERSION, lastHunterMicros: T0, lastTrendMicros: T0 }],
      ...(opts.extra ?? {}),
    },
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
    expect(poolState(ctx)).toEqual({
      id: 1n,
      version: 0n,
      lastHunterMicros: 0n,
      lastTrendMicros: 0n,
      migrationFailRegionId: 0n,
      migrationFailCount: 0n,
      migrationSkippedRegions: '',
    });
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

describe('tick_pools: the guarded scheduled reducer', () => {
  const pendingTicks = (ctx: any) => rows(ctx, 'pool_tick');

  it('with the module sender it reschedules exactly one row (now + POOL_TICK_MICROS, afterRegionId 0n), then does the work', () => {
    const ctx = poolCtx(quietWorld(), MODULE, T0 + MIN);
    const { goblinsOrchard } = seedPools(ctx);
    setPoolCount(ctx, goblinsOrchard, 30n, T0);
    tickPools(ctx, { arg: ARG });

    const ticks = pendingTicks(ctx);
    expect(ticks).toHaveLength(1);
    expect(ticks[0].afterRegionId).toBe(0n);
    expect(ticks[0].scheduledAt.value.microsSinceUnixEpoch).toBe(T0 + MIN + DENSITY_RULES.POOL_TICK_MICROS);
    expect(poolRow(ctx, goblinsOrchard.id).count).toBe(34n);
  });

  it('a failing step is logged and the reschedule stays', () => {
    const ctx = poolCtx(quietWorld(), MODULE, T0 + MIN);
    const { goblinsOrchard } = seedPools(ctx);
    setPoolCount(ctx, goblinsOrchard, 30n, T0);
    interceptPlacePool(ctx, {
      update: () => {
        throw new Error('boom');
      },
    });
    const errors = vi.spyOn(console, 'error').mockImplementation(() => {});
    expect(() => tickPools(ctx, { arg: ARG })).not.toThrow();
    expect(errors).toHaveBeenCalled();
    expect(pendingTicks(ctx)).toHaveLength(1);
  });

  it('a forged client call schedules nothing and settles nothing', () => {
    const ctx = poolCtx(quietWorld(), ALICE, T0 + MIN);
    const { goblinsOrchard } = seedPools(ctx);
    setPoolCount(ctx, goblinsOrchard, 30n, T0);
    tickPools(ctx, { arg: ARG });
    expect(pendingTicks(ctx)).toHaveLength(0);
    expect(poolRow(ctx, goblinsOrchard.id).count).toBe(30n);
    expect(rows(ctx, 'pool_state')).toHaveLength(1); // only the seeded row
  });
});

describe('arming the pool tick (init, clientConnected, sweep_passages)', () => {
  const pendingTicks = (ctx: any) => rows(ctx, 'pool_tick');
  const existing = { scheduledId: 9n, scheduledAt: { tag: 'Time', value: { microsSinceUnixEpoch: T0 + MIN } }, afterRegionId: 0n };

  it('ensurePoolTickScheduled inserts one row due now only when none is pending', () => {
    const ctx = poolCtx(poolWorld());
    ensurePoolTickScheduled(ctx);
    ensurePoolTickScheduled(ctx);
    const ticks = pendingTicks(ctx);
    expect(ticks).toHaveLength(1);
    expect(ticks[0].scheduledAt.value.microsSinceUnixEpoch).toBe(T0);
    expect(ticks[0].afterRegionId).toBe(0n);
  });

  it('init arms exactly one pool tick when none exists, and none when one exists', () => {
    const fresh = poolCtx({}, MODULE);
    onInit(fresh);
    expect(pendingTicks(fresh)).toHaveLength(1);

    const armed = poolCtx({ pool_tick: [existing] }, MODULE);
    onInit(armed);
    expect(pendingTicks(armed)).toEqual([existing]);
  });

  it('clientConnected arms exactly one pool tick when none exists, and none when one exists', () => {
    const fresh = poolCtx(poolWorld(), ALICE);
    onConnect(fresh);
    expect(pendingTicks(fresh)).toHaveLength(1);
    onConnect(fresh);
    expect(pendingTicks(fresh)).toHaveLength(1);

    const armed = poolCtx(poolWorld({ extra: { pool_tick: [existing] } }), ALICE);
    onConnect(armed);
    expect(pendingTicks(armed)).toEqual([existing]);
  });

  it('sweep_passages (module sender) arms the pool tick when none exists, so a republished database starts the chain', () => {
    const fresh = poolCtx(poolWorld(), MODULE);
    sweepPassagesTick(fresh, { arg: { scheduledId: 1n } });
    expect(pendingTicks(fresh)).toHaveLength(1);
    expect(pendingTicks(fresh)[0].scheduledAt.value.microsSinceUnixEpoch).toBe(T0);

    const armed = poolCtx(poolWorld({ extra: { pool_tick: [existing] } }), MODULE);
    sweepPassagesTick(armed, { arg: { scheduledId: 1n } });
    expect(pendingTicks(armed)).toEqual([existing]);

    const forged = poolCtx(poolWorld(), ALICE);
    sweepPassagesTick(forged, { arg: { scheduledId: 1n } });
    expect(pendingTicks(forged)).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// Plan 15: the cursor-batched migration step in front of the normal tick
// ---------------------------------------------------------------------------

describe('tick_pools: the migration of an existing world, one region per run (51.3.1.1-15)', () => {
  const CONTINUE = DENSITY_RULES.MIGRATION_CONTINUE_MICROS;
  const TICK = DENSITY_RULES.POOL_TICK_MICROS;
  const pendingTicks = (ctx: any) => rows(ctx, 'pool_tick');
  const atOf = (row: any) => row.scheduledAt.value.microsSinceUnixEpoch;
  const version = (ctx: any) => rows(ctx, 'pool_state')[0]?.version;

  /** Region 2 'Far Fen' as it stood before this phase: a start camp with a vendor, a reed bed with a standing Thorn Boar. */
  function twoRegionWorld() {
    return poolWorld({
      extra: {
        region: [{ id: 2n, name: 'Far Fen', dangerMultiplier: 200n, regionType: 'wild', biome: 'swamp', landmarks: '[]', threats: '[]' }],
        location: [
          { id: 50n, name: 'Fen Camp', description: 'Fen Camp.', zone: 'z', regionId: 2n, levelOffset: 0n, isSafe: true, terrainType: 'town', bindStone: true, craftingAvailable: false, shortName: '', placeNoun: '', isHub: false },
          { id: 51n, name: 'Fen Reeds', description: 'Fen Reeds.', zone: 'z', regionId: 2n, levelOffset: 0n, isSafe: false, terrainType: 'woods', bindStone: false, craftingAvailable: false, shortName: '', placeNoun: '', isHub: false },
        ],
        npc: [{ id: 1n, name: 'Hale Dunmore', npcType: 'vendor', locationId: 50n, description: 'A trader.', greeting: 'Well met.', gender: 'male' }],
        enemy_template: [
          {
            id: 501n, name: 'Thorn Boar', role: 'melee', roleDetail: 'melee', abilityProfile: 'melee', terrainTypes: 'woods',
            creatureType: 'beast', timeOfDay: 'any', socialGroup: 'Thorn Boar', socialRadius: 0n, awareness: 'normal',
            groupMin: 1n, groupMax: 3n, armorClass: 5n, level: 2n, maxHp: 50n, baseDamage: 6n, xpReward: 20n,
          },
        ],
        location_enemy_template: [{ id: 1n, locationId: 51n, enemyTemplateId: 501n }],
        enemy_spawn: [{ id: 1n, locationId: 51n, enemyTemplateId: 501n, name: 'Thorn Boar', state: 'available', lockedCombatId: undefined, groupCount: 2n, level: 2n }],
        enemy_spawn_member: [{ id: 1n, spawnId: 1n, enemyTemplateId: 501n, roleTemplateId: 0n }],
      },
    });
  }

  /** Fires one scheduled run the way the scheduler does: the fired row leaves the table, ctx.timestamp is `t`. */
  function fire(ctx: any, t: bigint, arg: any = pendingTicks(ctx)[0]): void {
    ctx.db._tables.pool_tick = pendingTicks(ctx).filter((row: any) => row !== arg);
    ctx.timestamp = { microsSinceUnixEpoch: t };
    tickPools(ctx, { arg });
  }

  /** Wraps ctx.db so any resource_node access throws (the last step of a region's migration). */
  function failingNodes(ctx: any): () => void {
    const realDb = ctx.db;
    ctx.db = new Proxy(realDb, {
      get(target: any, name: string) {
        if (name === 'resource_node') throw new Error('boom');
        return target[name];
      },
    });
    return () => {
      ctx.db = realDb;
    };
  }

  it('migrates region 1, then region 2 (setting the version), then runs the normal tick; one row per run', () => {
    const ctx = poolCtx(twoRegionWorld(), MODULE, T0);
    const t1 = T0;
    fire(ctx, t1, ARG);
    expect(pendingTicks(ctx)).toHaveLength(1);
    expect(pendingTicks(ctx)[0].afterRegionId).toBe(1n);
    expect(atOf(pendingTicks(ctx)[0])).toBe(t1 + CONTINUE);
    expect(rows(ctx, 'place_pool').some((p: any) => p.regionId === REGION_ID && p.kind === 'resource')).toBe(true);
    expect(rows(ctx, 'place_pool').some((p: any) => p.regionId === 2n)).toBe(false);
    expect(version(ctx)).toBe(0n);

    const t2 = t1 + CONTINUE;
    fire(ctx, t2);
    expect(pendingTicks(ctx)).toHaveLength(1);
    expect(pendingTicks(ctx)[0].afterRegionId).toBe(0n);
    expect(atOf(pendingTicks(ctx)[0])).toBe(t2 + TICK);
    expect(version(ctx)).toBe(POOL_MIGRATION_VERSION);
    const boars = rows(ctx, 'creature_family').find((f: any) => f.key === '2:beast');
    expect(boars).toBeDefined();
    expect(rows(ctx, 'place_pool').some((p: any) => p.kind === 'creature' && p.refId === boars.id && p.locationId === 51n)).toBe(true);
    expect(rows(ctx, 'enemy_spawn')).toHaveLength(0);
    expect(rows(ctx, 'enemy_spawn_member')).toHaveLength(0);
    expect(rows(ctx, 'location').find((l: any) => l.id === 50n)).toMatchObject({ isHub: true, craftingAvailable: false });

    // While migrating, hunters and trends never ran.
    expect(rows(ctx, 'pool_state')[0]).toMatchObject({ lastHunterMicros: 0n, lastTrendMicros: 0n });
    expect(rows(ctx, 'pool_region')).toHaveLength(0);

    const t3 = t2 + TICK;
    fire(ctx, t3);
    expect(pendingTicks(ctx)).toHaveLength(1);
    expect(pendingTicks(ctx)[0].afterRegionId).toBe(0n);
    expect(atOf(pendingTicks(ctx)[0])).toBe(t3 + TICK);
    expect(rows(ctx, 'pool_state')[0]).toMatchObject({ version: POOL_MIGRATION_VERSION, lastHunterMicros: t3, lastTrendMicros: t3 });
    expect(rows(ctx, 'pool_region').length).toBeGreaterThan(0);
  });

  it('the migration enqueues no LLM job (no paid call)', () => {
    const ctx = poolCtx(twoRegionWorld(), MODULE, T0);
    fire(ctx, T0, ARG);
    fire(ctx, T0 + CONTINUE);
    expect(rows(ctx, 'llm_job')).toHaveLength(0);
  });

  it('a failing region is logged, the reschedule stays and the cursor is not advanced past it; the next run retries it', () => {
    const ctx = poolCtx(twoRegionWorld(), MODULE, T0);
    const restore = failingNodes(ctx);
    const errors = vi.spyOn(console, 'error').mockImplementation(() => {});
    expect(() => fire(ctx, T0, ARG)).not.toThrow();
    expect(errors.mock.calls.some((call) => String(call[0]).includes('migrating region 1'))).toBe(true);
    expect(pendingTicks(ctx)).toHaveLength(1);
    expect(pendingTicks(ctx)[0].afterRegionId).toBe(0n);
    expect(atOf(pendingTicks(ctx)[0])).toBe(T0 + CONTINUE);
    expect(version(ctx)).toBe(0n);

    restore();
    fire(ctx, T0 + CONTINUE);
    expect(pendingTicks(ctx)).toHaveLength(1);
    expect(pendingTicks(ctx)[0].afterRegionId).toBe(1n);
  });

  it('a failing last region keeps the version below POOL_MIGRATION_VERSION and is retried after MIGRATION_CONTINUE_MICROS', () => {
    const ctx = poolCtx(twoRegionWorld(), MODULE, T0);
    fire(ctx, T0, ARG);
    const restore = failingNodes(ctx);
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const t2 = T0 + CONTINUE;
    fire(ctx, t2);
    expect(pendingTicks(ctx)).toHaveLength(1);
    expect(pendingTicks(ctx)[0].afterRegionId).toBe(1n);
    expect(atOf(pendingTicks(ctx)[0])).toBe(t2 + CONTINUE);
    expect(version(ctx)).toBe(0n);

    restore();
    fire(ctx, t2 + CONTINUE);
    expect(version(ctx)).toBe(POOL_MIGRATION_VERSION);
    expect(pendingTicks(ctx)[0].afterRegionId).toBe(0n);
  });

  /** Wraps ctx.db so the node step throws only for places of region 1 (a region that fails every run). */
  function failingRegionOne(ctx: any): void {
    const realDb = ctx.db;
    const regionOf = (locationId: bigint) => rows(ctx, 'location').find((l: any) => l.id === locationId)?.regionId;
    ctx.db = new Proxy(realDb, {
      get(target: any, name: string) {
        if (name !== 'resource_node') return target[name];
        const table = target[name];
        return new Proxy(table, {
          get(t2: any, prop: string) {
            if (prop !== 'by_location') return t2[prop];
            return {
              filter: (locationId: bigint) => {
                if (regionOf(locationId) === REGION_ID) throw new Error('boom');
                return t2.by_location.filter(locationId);
              },
            };
          },
        });
      },
    });
  }

  it('a region that fails MIGRATION_MAX_ATTEMPTS runs in a row is skipped and recorded; the rest migrates (review A WR-02)', () => {
    const ctx = poolCtx(twoRegionWorld(), MODULE, T0);
    failingRegionOne(ctx);
    const errors = vi.spyOn(console, 'error').mockImplementation(() => {});
    const MAX = DENSITY_RULES.MIGRATION_MAX_ATTEMPTS;
    expect(MAX).toBeGreaterThan(1n);

    let t = T0;
    fire(ctx, t, ARG);
    for (let attempt = 2n; attempt < MAX; attempt += 1n) {
      expect(pendingTicks(ctx)[0].afterRegionId).toBe(0n);
      expect(rows(ctx, 'pool_state')[0]).toMatchObject({ migrationFailRegionId: REGION_ID, migrationFailCount: attempt - 1n });
      t += CONTINUE;
      fire(ctx, t);
    }
    expect(rows(ctx, 'pool_state')[0]).toMatchObject({ migrationFailRegionId: REGION_ID, migrationFailCount: MAX - 1n });
    expect(version(ctx)).toBe(0n);

    // The MAX-th failure skips region 1: the cursor moves past it, it is recorded, the record clears.
    t += CONTINUE;
    fire(ctx, t);
    expect(pendingTicks(ctx)).toHaveLength(1);
    expect(pendingTicks(ctx)[0].afterRegionId).toBe(1n);
    expect(rows(ctx, 'pool_state')[0]).toMatchObject({
      migrationFailRegionId: 0n,
      migrationFailCount: 0n,
      migrationSkippedRegions: '1',
    });
    expect(errors.mock.calls.filter((call) => String(call[0]).includes('skipped'))).toHaveLength(1);
    expect(errors.mock.calls.filter((call) => String(call[0]).includes('migrating region 1'))).toHaveLength(Number(MAX));

    // Region 2 still migrates, the version is set and the normal tick takes over.
    t += CONTINUE;
    fire(ctx, t);
    expect(version(ctx)).toBe(POOL_MIGRATION_VERSION);
    expect(rows(ctx, 'creature_family').some((f: any) => f.key === '2:beast')).toBe(true);
    expect(atOf(pendingTicks(ctx)[0])).toBe(t + TICK);
  });

  it('a region that recovers before MIGRATION_MAX_ATTEMPTS clears its failure record', () => {
    const ctx = poolCtx(twoRegionWorld(), MODULE, T0);
    const restore = failingNodes(ctx);
    vi.spyOn(console, 'error').mockImplementation(() => {});
    fire(ctx, T0, ARG);
    expect(rows(ctx, 'pool_state')[0]).toMatchObject({ migrationFailRegionId: REGION_ID, migrationFailCount: 1n });
    restore();
    fire(ctx, T0 + CONTINUE);
    expect(rows(ctx, 'pool_state')[0]).toMatchObject({ migrationFailRegionId: 0n, migrationFailCount: 0n, migrationSkippedRegions: '' });
    expect(pendingTicks(ctx)[0].afterRegionId).toBe(1n);
  });

  it('a stale overlapping run that replays a region changes no family, pool or spawn', () => {
    const ctx = poolCtx(twoRegionWorld(), MODULE, T0);
    fire(ctx, T0, ARG);
    fire(ctx, T0 + CONTINUE);
    const families = rows(ctx, 'creature_family').length;
    const pools = rows(ctx, 'place_pool').length;
    // Replays the region 2 work directly (the version is set, so tick_pools itself would not).
    ctx.timestamp = { microsSinceUnixEpoch: T0 + 2n * CONTINUE };
    migrateRegion(ctx, 2n, T0 + 2n * CONTINUE);
    migrateRegion(ctx, REGION_ID, T0 + 2n * CONTINUE);
    expect(rows(ctx, 'creature_family')).toHaveLength(families);
    expect(rows(ctx, 'place_pool')).toHaveLength(pools);
  });

  it('a world with no regions sets the version on its first run', () => {
    const seed = poolWorld();
    seed.region = [];
    const ctx = poolCtx(seed, MODULE, T0);
    fire(ctx, T0, ARG);
    expect(version(ctx)).toBe(POOL_MIGRATION_VERSION);
    expect(atOf(pendingTicks(ctx)[0])).toBe(T0 + TICK);
  });
});
