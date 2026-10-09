/**
 * Phase 51.3.1.1 Plan 06: the pool engine (helpers/pools.ts) on the shared pool world
 * (helpers/pool_fixture.ts), on a strict mock db whose accessors come from the recorded schema.
 */
import { describe, it, expect, vi, beforeAll } from 'vitest';
// @ts-ignore node types are not part of this module's tsconfig (same as other source-reading tests)
import { readdirSync, readFileSync, statSync } from 'node:fs';
// @ts-ignore
import { join, relative, sep } from 'node:path';
// @ts-ignore
import { fileURLToPath } from 'node:url';
import { rowColumnProblems } from './schema_recorder';
import { DENSITY_RULES } from '../data/density_rules';
import {
  T0,
  REGION_ID,
  ORCHARD_ID,
  FLATS_ID,
  GOBLINS_ID,
  SKITTERERS_ID,
  IRON_ORE_ID,
  BERRIES_ID,
  poolWorld,
  poolCtx,
  seedPools,
} from './pool_fixture';
import {
  createPool,
  setPoolCount,
  settlePool,
  poolsAt,
  familyRangeAt,
  mirrorLevel,
  applyDepletion,
  runVacuum,
} from './pools';
import { densityDownLine, densityGoneLine, overrunSettleLine, vacuumLine } from '../data/density_lines';

vi.mock('spacetimedb/server', async () =>
  (await import('./schema_recorder')).createRecordingServerMock(),
);

beforeAll(async () => {
  await import('../schema/tables');
});

const SEC = 1_000_000n;
const MIN = 60n * SEC;
const HOUR = 60n * MIN;

const rows = (ctx: any, table: string): any[] => ctx.db._tables[table] ?? [];
const poolRow = (ctx: any, id: bigint) => rows(ctx, 'place_pool').find((r: any) => r.id === id);
const levelRow = (ctx: any, id: bigint) => rows(ctx, 'pool_level').find((r: any) => r.id === id);

/** Counts insert and update calls on one table by wrapping ctx.db. */
function countWrites(ctx: any, table: string): { writes: number } {
  const counter = { writes: 0 };
  const db = ctx.db;
  ctx.db = new Proxy(db, {
    get(target: any, name: string) {
      const tbl = target[name];
      if (name !== table) return tbl;
      return new Proxy(tbl, {
        get(t2: any, prop: string) {
          const value = t2[prop];
          if (prop === 'insert') {
            return (row: any) => {
              counter.writes += 1;
              return value(row);
            };
          }
          if (value && typeof value === 'object' && typeof value.update === 'function') {
            return {
              ...value,
              update: (row: any) => {
                counter.writes += 1;
                return value.update(row);
              },
            };
          }
          return value;
        },
      });
    },
  });
  return counter;
}

describe('createPool and mirrorLevel', () => {
  it('creates a creature pool at home with its public mirror', () => {
    const ctx = poolCtx(poolWorld());
    const pool = createPool(
      ctx,
      { regionId: REGION_ID, locationId: ORCHARD_ID, kind: 'creature', refId: GOBLINS_ID, homeLevel: 2 },
      T0,
    );
    expect(rows(ctx, 'place_pool')).toHaveLength(1);
    expect(pool).toMatchObject({
      regionId: REGION_ID,
      locationId: ORCHARD_ID,
      kind: 'creature',
      refId: GOBLINS_ID,
      count: 50n,
      homeLevel: 2n,
      wipedAtMicros: 0n,
      lastSettledMicros: T0,
      dirty: false,
      timeOfDay: 'any',
    });
    expect(rowColumnProblems('place_pool', poolRow(ctx, pool.id))).toEqual([]);

    const mirror = levelRow(ctx, pool.id);
    expect(rows(ctx, 'pool_level')).toHaveLength(1);
    expect(mirror).toEqual({
      id: pool.id,
      regionId: REGION_ID,
      locationId: ORCHARD_ID,
      kind: 'creature',
      refId: GOBLINS_ID,
      level: 2n,
      lvLo: 3n,
      lvHi: 5n,
      name: 'Goblins',
      iconKey: 'humanoid',
      temperament: 'aggressive',
      singularNoun: 'goblin',
      pluralNoun: 'goblins',
      timeOfDay: 'any',
    });
    expect(rowColumnProblems('pool_level', mirror)).toEqual([]);
  });

  it('returns the existing pool for the same place, kind and ref, inserting nothing', () => {
    const ctx = poolCtx(poolWorld());
    const first = createPool(
      ctx,
      { regionId: REGION_ID, locationId: ORCHARD_ID, kind: 'creature', refId: GOBLINS_ID, homeLevel: 2 },
      T0,
    );
    const again = createPool(
      ctx,
      { regionId: REGION_ID, locationId: ORCHARD_ID, kind: 'creature', refId: GOBLINS_ID, homeLevel: 1 },
      T0 + MIN,
    );
    expect(again.id).toBe(first.id);
    expect(again.homeLevel).toBe(2n);
    expect(rows(ctx, 'place_pool')).toHaveLength(1);
    expect(rows(ctx, 'pool_level')).toHaveLength(1);
  });

  it('a creature home above Stable reads as Stable (count 50)', () => {
    const ctx = poolCtx(poolWorld());
    const pool = createPool(
      ctx,
      { regionId: REGION_ID, locationId: ORCHARD_ID, kind: 'creature', refId: GOBLINS_ID, homeLevel: 3 },
      T0,
    );
    expect(pool.count).toBe(50n);
    expect(levelRow(ctx, pool.id).level).toBe(2n);
  });

  it('creates resource pools with the item name, icon from the material kind and time of day', () => {
    const ctx = poolCtx(poolWorld());
    const { ironOrchard, berriesOrchard } = seedPools(ctx);
    expect(ironOrchard.count).toBe(100n);
    expect(levelRow(ctx, ironOrchard.id)).toEqual({
      id: ironOrchard.id,
      regionId: REGION_ID,
      locationId: ORCHARD_ID,
      kind: 'resource',
      refId: IRON_ORE_ID,
      level: 3n,
      lvLo: 0n,
      lvHi: 0n,
      name: 'Iron Ore',
      iconKey: 'mineral',
      temperament: '',
      singularNoun: '',
      pluralNoun: '',
      timeOfDay: 'any',
    });
    expect(berriesOrchard.count).toBe(66n);
    expect(berriesOrchard.timeOfDay).toBe('night');
    expect(levelRow(ctx, berriesOrchard.id)).toMatchObject({
      kind: 'resource',
      refId: BERRIES_ID,
      level: 2n,
      name: 'Wild Berries',
      iconKey: 'herb',
      timeOfDay: 'night',
    });
  });

  it('honours an explicit starting count', () => {
    const ctx = poolCtx(poolWorld());
    const pool = createPool(
      ctx,
      { regionId: REGION_ID, locationId: FLATS_ID, kind: 'creature', refId: SKITTERERS_ID, homeLevel: 2, count: 75n },
      T0,
    );
    expect(pool.count).toBe(75n);
    expect(pool.dirty).toBe(true);
    expect(levelRow(ctx, pool.id).level).toBe(3n);
  });

  it('mirrorLevel writes nothing when no public field changed', () => {
    const ctx = poolCtx(poolWorld());
    const { goblinsOrchard } = seedPools(ctx);
    const counter = countWrites(ctx, 'pool_level');
    mirrorLevel(ctx, poolRow(ctx, goblinsOrchard.id));
    expect(counter.writes).toBe(0);
  });

  it('familyRangeAt reads the members at the place level band', () => {
    const ctx = poolCtx(poolWorld());
    // Orchard: target 3 + offset 1 = 4, band 3..5; members 3, 4, 5, 7 -> 3, 4, 5, 4.
    expect(familyRangeAt(ctx, GOBLINS_ID, ORCHARD_ID)).toEqual({ lo: 3n, hi: 5n });
    // Flats: target 3, offset 0 = exact; every member reads 3.
    expect(familyRangeAt(ctx, GOBLINS_ID, FLATS_ID)).toEqual({ lo: 3n, hi: 3n });
    // No members: 0..0.
    expect(familyRangeAt(ctx, 99n, ORCHARD_ID)).toEqual({ lo: 0n, hi: 0n });
  });
});

describe('setPoolCount: the single writer', () => {
  it('a fall inside a level updates place_pool only', () => {
    const ctx = poolCtx(poolWorld());
    const { goblinsOrchard } = seedPools(ctx);
    const before = { ...levelRow(ctx, goblinsOrchard.id) };
    const counter = countWrites(ctx, 'pool_level');
    const shift = setPoolCount(ctx, goblinsOrchard, 45n, T0 + SEC);
    expect(shift.fromLevel).toBe(2);
    expect(shift.toLevel).toBe(2);
    expect(poolRow(ctx, goblinsOrchard.id).count).toBe(45n);
    expect(shift.pool.count).toBe(45n);
    expect(counter.writes).toBe(0);
    expect(levelRow(ctx, goblinsOrchard.id)).toEqual(before);
  });

  it('a level change rewrites the mirror level', () => {
    const ctx = poolCtx(poolWorld());
    const { goblinsOrchard } = seedPools(ctx);
    const shift = setPoolCount(ctx, goblinsOrchard, 30n, T0 + SEC);
    expect(shift).toMatchObject({ fromLevel: 2, toLevel: 1 });
    expect(levelRow(ctx, goblinsOrchard.id).level).toBe(1n);
    expect(poolRow(ctx, goblinsOrchard.id).lastSettledMicros).toBe(T0 + SEC);
  });

  it('clamps to 0..COUNT_MAX, stamps the wipe once and keeps dirty honest', () => {
    const ctx = poolCtx(poolWorld());
    const { goblinsOrchard } = seedPools(ctx);
    expect(setPoolCount(ctx, goblinsOrchard, 150n, T0).pool.count).toBe(DENSITY_RULES.COUNT_MAX);
    expect(poolRow(ctx, goblinsOrchard.id).dirty).toBe(true);

    const atHome = setPoolCount(ctx, poolRow(ctx, goblinsOrchard.id), 50n, T0);
    expect(atHome.pool.dirty).toBe(false);

    const wiped = setPoolCount(ctx, poolRow(ctx, goblinsOrchard.id), -5n, T0 + 10n * SEC);
    expect(wiped.pool.count).toBe(0n);
    expect(wiped.pool.wipedAtMicros).toBe(T0 + 10n * SEC);
    expect(wiped.pool.dirty).toBe(true);
    expect(wiped.toLevel).toBe(0);
    expect(levelRow(ctx, goblinsOrchard.id).level).toBe(0n);

    const again = setPoolCount(ctx, poolRow(ctx, goblinsOrchard.id), 0n, T0 + 20n * SEC);
    expect(again.pool.wipedAtMicros).toBe(T0 + 10n * SEC);

    const back = setPoolCount(ctx, poolRow(ctx, goblinsOrchard.id), 20n, T0 + 30n * SEC);
    expect(back.pool.wipedAtMicros).toBe(0n);
    expect(back.pool.dirty).toBe(true);
  });
});

describe('settlePool: lazy settling from elapsed time', () => {
  it('regrows 4 points a minute below home and stops at home', () => {
    const ctx = poolCtx(poolWorld());
    const { goblinsOrchard } = seedPools(ctx);
    setPoolCount(ctx, goblinsOrchard, 30n, T0);
    const minute = settlePool(ctx, poolRow(ctx, goblinsOrchard.id), T0 + MIN);
    expect(minute.pool.count).toBe(34n);
    expect(poolRow(ctx, goblinsOrchard.id).count).toBe(34n);
    expect(minute).toMatchObject({ fromLevel: 1, toLevel: 2 });
    expect(levelRow(ctx, goblinsOrchard.id).level).toBe(2n);

    const later = settlePool(ctx, poolRow(ctx, goblinsOrchard.id), T0 + 10n * MIN);
    expect(later.pool.count).toBe(50n);
    expect(later.pool.dirty).toBe(false);
  });

  it('settles an Overrun pool back toward home', () => {
    const ctx = poolCtx(poolWorld());
    const { goblinsOrchard } = seedPools(ctx);
    setPoolCount(ctx, goblinsOrchard, 75n, T0);
    const soon = settlePool(ctx, poolRow(ctx, goblinsOrchard.id), T0 + 90n * SEC);
    expect(soon.pool.count).toBe(65n);
    const later = settlePool(ctx, poolRow(ctx, goblinsOrchard.id), T0 + 2n * HOUR);
    expect(later.pool.count).toBe(50n);
  });

  it('keeps a wiped family gone for the long reset, then returns it Scarce', () => {
    const ctx = poolCtx(poolWorld());
    const { goblinsOrchard } = seedPools(ctx);
    setPoolCount(ctx, goblinsOrchard, 0n, T0);
    const waiting = settlePool(ctx, poolRow(ctx, goblinsOrchard.id), T0 + 2n * HOUR + 59n * MIN);
    expect(waiting.pool.count).toBe(0n);
    expect(waiting.pool.wipedAtMicros).toBe(T0);
    const back = settlePool(ctx, poolRow(ctx, goblinsOrchard.id), T0 + 3n * HOUR);
    expect(back.pool.count).toBe(DENSITY_RULES.WIPED_RETURN_COUNT);
    expect(back.pool.wipedAtMicros).toBe(0n);
    expect(levelRow(ctx, goblinsOrchard.id).level).toBe(1n);
  });

  it('writes nothing when nothing changed', () => {
    const ctx = poolCtx(poolWorld());
    const { goblinsOrchard } = seedPools(ctx);
    const counter = countWrites(ctx, 'place_pool');
    const settled = settlePool(ctx, goblinsOrchard, T0 + HOUR);
    expect(settled.pool.count).toBe(50n);
    expect(counter.writes).toBe(0);
  });

  it('carries leftover time so one late settle equals many small ones', () => {
    const ctxA = poolCtx(poolWorld());
    const a = seedPools(ctxA).goblinsOrchard;
    setPoolCount(ctxA, a, 30n, T0);
    for (let s = 10n; s <= 120n; s += 10n) settlePool(ctxA, poolRow(ctxA, a.id), T0 + s * SEC);

    const ctxB = poolCtx(poolWorld());
    const b = seedPools(ctxB).goblinsOrchard;
    setPoolCount(ctxB, b, 30n, T0);
    settlePool(ctxB, poolRow(ctxB, b.id), T0 + 120n * SEC);

    expect(poolRow(ctxA, a.id).count).toBe(38n);
    expect(poolRow(ctxB, b.id).count).toBe(38n);
  });

  it('a pool row that no longer exists is left alone', () => {
    const ctx = poolCtx(poolWorld());
    const { goblinsOrchard } = seedPools(ctx);
    ctx.db.place_pool.id.delete(goblinsOrchard.id);
    const result = settlePool(ctx, { ...goblinsOrchard, count: 10n }, T0 + HOUR);
    expect(result.fromLevel).toBe(result.toLevel);
    expect(poolRow(ctx, goblinsOrchard.id)).toBeUndefined();
    expect(rows(ctx, 'place_pool')).toHaveLength(3);
  });
});

describe('poolsAt', () => {
  it('returns the settled pools of a place, optionally by kind', () => {
    const ctx = poolCtx(poolWorld());
    const { goblinsOrchard } = seedPools(ctx);
    setPoolCount(ctx, goblinsOrchard, 30n, T0);
    const all = poolsAt(ctx, ORCHARD_ID, undefined, T0 + MIN);
    expect(all.map((p: any) => p.kind).sort()).toEqual(['creature', 'resource', 'resource']);
    const creatures = poolsAt(ctx, ORCHARD_ID, 'creature', T0 + MIN);
    expect(creatures).toHaveLength(1);
    expect(creatures[0].count).toBe(34n);
    expect(poolsAt(ctx, FLATS_ID, 'resource', T0)).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// Task 2: applyDepletion, the vacuum and density lines
// ---------------------------------------------------------------------------

const densityLines = (ctx: any) =>
  rows(ctx, 'event_private').filter((e: any) => e.kind === 'density_down' || e.kind === 'density_gone');
const narrativeLines = (ctx: any) => rows(ctx, 'event_private').filter((e: any) => e.kind === 'narrative');
const worldLines = (ctx: any) => rows(ctx, 'event_world').map((e: any) => e.message);
const poolOf = (ctx: any, locationId: bigint, familyId: bigint) =>
  rows(ctx, 'place_pool').find((r: any) => r.locationId === locationId && r.kind === 'creature' && r.refId === familyId);

describe('applyDepletion and density lines', () => {
  it('a fall inside a level is silent; a level fall tells online characters at the place only', () => {
    // Bob stands at the flats; Cara is at the orchard but offline.
    const ctx = poolCtx(poolWorld({ bobLocationId: FLATS_ID }));
    const { goblinsOrchard } = seedPools(ctx);
    const first = applyDepletion(ctx, goblinsOrchard, 8n, T0, 'kill');
    expect(first.pool.count).toBe(42n);
    expect(first).toMatchObject({ fromLevel: 2, toLevel: 2 });
    expect(densityLines(ctx)).toEqual([]);

    const second = applyDepletion(ctx, poolRow(ctx, goblinsOrchard.id), 12n, T0, 'kill');
    expect(second.pool.count).toBe(30n);
    expect(second).toMatchObject({ fromLevel: 2, toLevel: 1 });
    const lines = densityLines(ctx);
    expect(lines).toHaveLength(1);
    expect(lines[0]).toMatchObject({ characterId: 1n, ownerUserId: 7n, kind: 'density_down' });
    expect(lines[0].message).toBe(densityDownLine('goblins', 'Glass Orchard', 'Scarce'));
    expect(lines[0].message).toBe('Goblins thin out around Glass Orchard. Goblins read scarce now.');
    expect(rowColumnProblems('event_private', lines[0])).toEqual([]);
  });

  it('every online character at the place hears it', () => {
    const ctx = poolCtx(poolWorld());
    const { goblinsOrchard } = seedPools(ctx);
    applyDepletion(ctx, goblinsOrchard, 20n, T0, 'hunter');
    expect(densityLines(ctx).map((e: any) => e.characterId).sort()).toEqual([1n, 2n]);
  });

  it('a wipe writes one density_gone line, stamps the wipe and runs the vacuum once', () => {
    const ctx = poolCtx(poolWorld({ bobLocationId: FLATS_ID }));
    const { goblinsOrchard } = seedPools(ctx);
    const shift = applyDepletion(ctx, goblinsOrchard, 60n, T0 + SEC, 'kill');
    expect(shift).toMatchObject({ fromLevel: 2, toLevel: 0 });
    expect(shift.pool.wipedAtMicros).toBe(T0 + SEC);
    const lines = densityLines(ctx);
    expect(lines).toHaveLength(1);
    expect(lines[0]).toMatchObject({ characterId: 1n, kind: 'density_gone' });
    expect(lines[0].message).toBe(densityGoneLine('goblins', 'Glass Orchard'));
    expect(worldLines(ctx)[0]).toBe('The Goblins are gone from Glass Orchard');
    // The rival moved in (the region path: the Skitterers fit woods).
    expect(poolOf(ctx, ORCHARD_ID, SKITTERERS_ID)?.count).toBe(DENSITY_RULES.OVERRUN_SURGE_COUNT);

    // Hitting a pool already at 0 is not a second wipe.
    const surgeRows = rows(ctx, 'place_pool').length;
    const again = applyDepletion(ctx, poolRow(ctx, goblinsOrchard.id), 8n, T0 + 2n * SEC, 'kill');
    expect(again.pool.count).toBe(0n);
    expect(again.pool.wipedAtMicros).toBe(T0 + SEC);
    expect(densityLines(ctx)).toHaveLength(1);
    expect(narrativeLines(ctx)).toHaveLength(1);
    expect(rows(ctx, 'place_pool')).toHaveLength(surgeRows);
    expect(worldLines(ctx)).toHaveLength(3);
  });

  it('two depletions from parallel fights both apply and clamp at 0', () => {
    const ctx = poolCtx(poolWorld({ noRelations: true }));
    const { goblinsOrchard } = seedPools(ctx);
    const stale = { ...goblinsOrchard };
    applyDepletion(ctx, stale, 30n, T0, 'kill');
    expect(poolRow(ctx, goblinsOrchard.id).count).toBe(20n);
    applyDepletion(ctx, stale, 30n, T0, 'kill');
    expect(poolRow(ctx, goblinsOrchard.id).count).toBe(0n);
  });

  it('settles before depleting', () => {
    const ctx = poolCtx(poolWorld());
    const { goblinsOrchard } = seedPools(ctx);
    setPoolCount(ctx, goblinsOrchard, 30n, T0);
    // One minute regrows 4 points (34), then the kill takes 8.
    expect(applyDepletion(ctx, poolRow(ctx, goblinsOrchard.id), 8n, T0 + MIN, 'kill').pool.count).toBe(26n);
  });

  it('resource falls and an exhausted resource are silent and never run the vacuum', () => {
    const ctx = poolCtx(poolWorld());
    const { ironOrchard } = seedPools(ctx);
    const fall = applyDepletion(ctx, ironOrchard, DENSITY_RULES.GATHER_DEPLETION_POINTS * 2n, T0, 'gather');
    expect(fall).toMatchObject({ fromLevel: 3, toLevel: 2 });
    const empty = applyDepletion(ctx, poolRow(ctx, ironOrchard.id), 100n, T0, 'gather');
    expect(empty.pool.count).toBe(0n);
    expect(empty.pool.wipedAtMicros).toBe(0n);
    expect(rows(ctx, 'event_private')).toEqual([]);
    expect(rows(ctx, 'event_world')).toEqual([]);
    expect(levelRow(ctx, ironOrchard.id).level).toBe(0n);
  });
});

describe('the vacuum (D-20, D-36)', () => {
  it('a rival pooled at the place surges to Overrun, its home rises to Stable, and the takeover is told', () => {
    const ctx = poolCtx(poolWorld({ bobLocationId: FLATS_ID }));
    const { goblinsOrchard } = seedPools(ctx);
    const rival = createPool(
      ctx,
      { regionId: REGION_ID, locationId: ORCHARD_ID, kind: 'creature', refId: SKITTERERS_ID, homeLevel: 1 },
      T0,
    );
    expect(rival.count).toBe(25n);
    const before = rows(ctx, 'place_pool').length;

    applyDepletion(ctx, goblinsOrchard, 50n, T0, 'kill');

    const surged = poolRow(ctx, rival.id);
    expect(surged.count).toBe(DENSITY_RULES.OVERRUN_SURGE_COUNT);
    expect(surged.homeLevel).toBe(BigInt(DENSITY_RULES.VACUUM_RIVAL_HOME_LEVEL));
    expect(levelRow(ctx, rival.id).level).toBe(3n);
    expect(rows(ctx, 'place_pool')).toHaveLength(before);

    const takeover = narrativeLines(ctx);
    expect(takeover).toHaveLength(1);
    expect(takeover[0]).toMatchObject({ characterId: 1n, kind: 'narrative' });
    expect(takeover[0].message).toBe(vacuumLine('goblins', 'skitterers', 'Glass Orchard'));
    expect(takeover[0].segments?.[0]?.speaker).toBe('The Keeper');
    expect(rowColumnProblems('event_private', takeover[0])).toEqual([]);

    // The seam, in order: the wipe, then the takeover, then the surge.
    expect(worldLines(ctx)).toEqual([
      'The Goblins are gone from Glass Orchard',
      'With the goblins gone, skitterers move into Glass Orchard',
      'Skitterers swarm Glass Orchard',
    ]);
    expect(rows(ctx, 'pool_rumor').map((r: any) => r.kind)).toEqual(['family_wiped', 'vacuum_takeover', 'overrun_surge']);

    // The wiped family keeps its pool and home and returns on the long reset (D-36, D-37).
    expect(poolRow(ctx, goblinsOrchard.id)).toMatchObject({ count: 0n, homeLevel: 2n });
  });

  it('a rival pooled here but wiped out never surges back; it keeps its long reset (review A CR-01, D-37)', () => {
    const ctx = poolCtx(poolWorld({ bobLocationId: FLATS_ID }));
    const { goblinsOrchard } = seedPools(ctx);
    const rival = createPool(
      ctx,
      { regionId: REGION_ID, locationId: ORCHARD_ID, kind: 'creature', refId: SKITTERERS_ID, homeLevel: 1 },
      T0,
    );

    // Wipe the goblins: the skitterers surge.
    applyDepletion(ctx, goblinsOrchard, 50n, T0, 'kill');
    expect(poolRow(ctx, rival.id).count).toBe(DENSITY_RULES.OVERRUN_SURGE_COUNT);
    const goblinsWipedAt = poolRow(ctx, goblinsOrchard.id).wipedAtMicros;
    expect(goblinsWipedAt).toBe(T0);
    const poolsBefore = rows(ctx, 'place_pool').length;

    // Wipe the skitterers minutes later: the wiped goblins are the only candidate and stay gone.
    const later = T0 + 5n * MIN;
    applyDepletion(ctx, poolRow(ctx, rival.id), 200n, later, 'kill');
    expect(poolRow(ctx, rival.id).count).toBe(0n);
    expect(poolRow(ctx, goblinsOrchard.id)).toMatchObject({ count: 0n, wipedAtMicros: goblinsWipedAt });
    expect(levelRow(ctx, goblinsOrchard.id).level).toBe(0n);
    expect(rows(ctx, 'place_pool')).toHaveLength(poolsBefore);
    expect(rows(ctx, 'pool_rumor').map((r: any) => r.kind)).toEqual([
      'family_wiped',
      'vacuum_takeover',
      'overrun_surge',
      'family_wiped',
    ]);

    // Still gone just before the long reset; back only once it has passed.
    expect(settlePool(ctx, poolRow(ctx, goblinsOrchard.id), T0 + DENSITY_RULES.WIPED_RESET_MICROS - MIN).pool.count).toBe(0n);
    expect(settlePool(ctx, poolRow(ctx, goblinsOrchard.id), T0 + DENSITY_RULES.WIPED_RESET_MICROS).pool.count).toBeGreaterThan(0n);
  });

  it('with no rival here, a region rival that fits the terrain gets a new Overrun pool with home Stable', () => {
    const ctx = poolCtx(poolWorld());
    const { goblinsOrchard } = seedPools(ctx);
    expect(poolOf(ctx, ORCHARD_ID, SKITTERERS_ID)).toBeUndefined();
    applyDepletion(ctx, goblinsOrchard, 50n, T0, 'kill');
    const fresh = poolOf(ctx, ORCHARD_ID, SKITTERERS_ID);
    expect(fresh).toMatchObject({
      regionId: REGION_ID,
      count: DENSITY_RULES.OVERRUN_SURGE_COUNT,
      homeLevel: 2n,
      timeOfDay: 'any',
    });
    expect(levelRow(ctx, fresh.id)).toMatchObject({ level: 3n, name: 'Salt-Crust Skitterers', lvLo: 3n, lvHi: 3n });
    expect(narrativeLines(ctx)).toHaveLength(2); // Alice and Bob are online at the orchard
  });

  it('a rival that does not fit the place and is not pooled here does not move in', () => {
    const seed = poolWorld();
    seed.creature_family = seed.creature_family.map((f: any) => (f.id === SKITTERERS_ID ? { ...f, fitTerrains: 'swamp' } : f));
    const ctx = poolCtx(seed);
    const { goblinsOrchard } = seedPools(ctx);
    const before = rows(ctx, 'place_pool').length;
    applyDepletion(ctx, goblinsOrchard, 50n, T0, 'kill');
    expect(rows(ctx, 'place_pool')).toHaveLength(before);
    expect(narrativeLines(ctx)).toEqual([]);
    expect(worldLines(ctx)).toEqual(['The Goblins are gone from Glass Orchard']);
  });

  it('with no rival or predator anywhere nothing changes and no takeover line is written', () => {
    const ctx = poolCtx(poolWorld({ noRelations: true }));
    const { goblinsOrchard, skitterersFlats } = seedPools(ctx);
    const flatsBefore = { ...poolRow(ctx, skitterersFlats.id) };
    const before = rows(ctx, 'place_pool').length;
    applyDepletion(ctx, goblinsOrchard, 50n, T0, 'kill');
    expect(rows(ctx, 'place_pool')).toHaveLength(before);
    expect(poolRow(ctx, skitterersFlats.id)).toEqual(flatsBefore);
    expect(narrativeLines(ctx)).toEqual([]);
    expect(worldLines(ctx)).toEqual(['The Goblins are gone from Glass Orchard']);
  });

  it('a family that names the wiped one as prey is a predator candidate; prey of the wiped family is not', () => {
    const preyOfOther = poolWorld({
      noRelations: true,
      extra: { family_relation: [{ id: 1n, familyId: SKITTERERS_ID, otherFamilyId: GOBLINS_ID, kind: 'prey' }] },
    });
    const ctxA = poolCtx(preyOfOther);
    applyDepletion(ctxA, seedPools(ctxA).goblinsOrchard, 50n, T0, 'kill');
    expect(poolOf(ctxA, ORCHARD_ID, SKITTERERS_ID)?.count).toBe(DENSITY_RULES.OVERRUN_SURGE_COUNT);

    const preyOfWiped = poolWorld({
      noRelations: true,
      extra: { family_relation: [{ id: 1n, familyId: GOBLINS_ID, otherFamilyId: SKITTERERS_ID, kind: 'prey' }] },
    });
    const ctxB = poolCtx(preyOfWiped);
    applyDepletion(ctxB, seedPools(ctxB).goblinsOrchard, 50n, T0, 'kill');
    expect(poolOf(ctxB, ORCHARD_ID, SKITTERERS_ID)).toBeUndefined();

    // Rivalry runs both ways: a family that names the wiped one as its rival is a candidate too.
    const rivalOfWiped = poolWorld({
      noRelations: true,
      extra: { family_relation: [{ id: 1n, familyId: SKITTERERS_ID, otherFamilyId: GOBLINS_ID, kind: 'rival' }] },
    });
    const ctxC = poolCtx(rivalOfWiped);
    applyDepletion(ctxC, seedPools(ctxC).goblinsOrchard, 50n, T0, 'kill');
    expect(poolOf(ctxC, ORCHARD_ID, SKITTERERS_ID)?.count).toBe(DENSITY_RULES.OVERRUN_SURGE_COUNT);
  });

  it('a candidate of another region never moves in', () => {
    const seed = poolWorld();
    seed.creature_family = seed.creature_family.map((f: any) => (f.id === SKITTERERS_ID ? { ...f, regionId: 2n } : f));
    const ctx = poolCtx(seed);
    applyDepletion(ctx, seedPools(ctx).goblinsOrchard, 50n, T0, 'kill');
    expect(poolOf(ctx, ORCHARD_ID, SKITTERERS_ID)).toBeUndefined();
  });

  it('picks the surge target deterministically from the seed', () => {
    const third = {
      id: 3n,
      regionId: REGION_ID,
      key: '1:undead',
      name: 'Hollow Pickers',
      singularNoun: 'picker',
      pluralNoun: 'pickers',
      temperament: 'wary',
      iconKey: 'undead',
      creatureType: 'undead',
      ambushVerb: 'lurch',
      ambushRest: 'out of the rows',
      fitTerrains: 'woods',
    };
    const world = () =>
      poolWorld({
        extra: {
          creature_family: [third],
          family_relation: [{ id: 2n, familyId: GOBLINS_ID, otherFamilyId: 3n, kind: 'predator' }],
        },
      });
    const target = (seedValue: bigint): bigint => {
      const ctx = poolCtx(world());
      const { goblinsOrchard } = seedPools(ctx);
      setPoolCount(ctx, goblinsOrchard, 0n, T0);
      const picked = runVacuum(ctx, poolRow(ctx, goblinsOrchard.id), T0, seedValue);
      return picked?.refId ?? 0n;
    };
    const picks = new Set<bigint>();
    for (let s = 1n; s <= 40n; s += 1n) {
      expect(target(s)).toBe(target(s));
      picks.add(target(s));
    }
    expect([...picks].sort()).toEqual([SKITTERERS_ID, 3n]);
  });

  // Plan 29 (D-20, D-70): a feud partner is a vacuum candidate exactly like a rival.
  const feudWorld = (rel: { familyId: bigint; otherFamilyId: bigint }, skitterersRegion = REGION_ID) => {
    const seed = poolWorld({
      bobLocationId: FLATS_ID,
      noRelations: true,
      extra: { family_relation: [{ id: 1n, ...rel, kind: 'feud' }] },
    });
    seed.creature_family = seed.creature_family.map((f: any) =>
      f.id === SKITTERERS_ID ? { ...f, regionId: skitterersRegion } : f,
    );
    return poolCtx(seed);
  };

  it("a feud row on the wiped family's side makes the partner surge like a rival: count, home, the takeover line and the rumours", () => {
    const ctx = feudWorld({ familyId: GOBLINS_ID, otherFamilyId: SKITTERERS_ID });
    const { goblinsOrchard } = seedPools(ctx);
    const partner = createPool(
      ctx,
      { regionId: REGION_ID, locationId: ORCHARD_ID, kind: 'creature', refId: SKITTERERS_ID, homeLevel: 1 },
      T0,
    );
    applyDepletion(ctx, goblinsOrchard, 50n, T0, 'kill');
    const surged = poolRow(ctx, partner.id);
    expect(surged.count).toBe(DENSITY_RULES.OVERRUN_SURGE_COUNT);
    expect(surged.homeLevel).toBe(BigInt(DENSITY_RULES.VACUUM_RIVAL_HOME_LEVEL));
    expect(narrativeLines(ctx).map((l: any) => l.message)).toEqual([vacuumLine('goblins', 'skitterers', 'Glass Orchard')]);
    expect(rows(ctx, 'pool_rumor').map((r: any) => r.kind)).toEqual(['family_wiped', 'vacuum_takeover', 'overrun_surge']);
  });

  it('a feud row that names the wiped family from the other side makes that family a candidate too', () => {
    const ctx = feudWorld({ familyId: SKITTERERS_ID, otherFamilyId: GOBLINS_ID });
    applyDepletion(ctx, seedPools(ctx).goblinsOrchard, 50n, T0, 'kill');
    expect(poolOf(ctx, ORCHARD_ID, SKITTERERS_ID)).toMatchObject({
      count: DENSITY_RULES.OVERRUN_SURGE_COUNT,
      homeLevel: BigInt(DENSITY_RULES.VACUUM_RIVAL_HOME_LEVEL),
    });
  });

  it('a feud partner of another region never moves in', () => {
    for (const rel of [
      { familyId: GOBLINS_ID, otherFamilyId: SKITTERERS_ID },
      { familyId: SKITTERERS_ID, otherFamilyId: GOBLINS_ID },
    ]) {
      const ctx = feudWorld(rel, 2n);
      applyDepletion(ctx, seedPools(ctx).goblinsOrchard, 50n, T0, 'kill');
      expect(poolOf(ctx, ORCHARD_ID, SKITTERERS_ID)).toBeUndefined();
      expect(narrativeLines(ctx)).toEqual([]);
    }
  });

  it('a family that is both rival and feud partner is one candidate; a rival and a feud partner are picked among in id order', () => {
    // Both a rival and a feud partner: one surge, one new pool, one takeover line.
    const both = poolWorld({
      noRelations: true,
      extra: {
        family_relation: [
          { id: 1n, familyId: GOBLINS_ID, otherFamilyId: SKITTERERS_ID, kind: 'rival' },
          { id: 2n, familyId: GOBLINS_ID, otherFamilyId: SKITTERERS_ID, kind: 'feud' },
          { id: 3n, familyId: SKITTERERS_ID, otherFamilyId: GOBLINS_ID, kind: 'feud' },
        ],
      },
    });
    const ctxA = poolCtx(both);
    const { goblinsOrchard } = seedPools(ctxA);
    const before = rows(ctxA, 'place_pool').length;
    applyDepletion(ctxA, goblinsOrchard, 50n, T0, 'kill');
    expect(rows(ctxA, 'place_pool')).toHaveLength(before + 1);
    expect(poolOf(ctxA, ORCHARD_ID, SKITTERERS_ID)?.count).toBe(DENSITY_RULES.OVERRUN_SURGE_COUNT);
    expect(narrativeLines(ctxA)).toHaveLength(2); // Alice and Bob are online at the orchard

    // A rival (the Skitterers) and a feud partner (a third family): the same pick as a rival pair.
    const third = {
      id: 3n,
      regionId: REGION_ID,
      key: '1:undead',
      name: 'Hollow Pickers',
      singularNoun: 'picker',
      pluralNoun: 'pickers',
      temperament: 'wary',
      iconKey: 'undead',
      creatureType: 'undead',
      ambushVerb: 'lurch',
      ambushRest: 'out of the rows',
      fitTerrains: 'woods',
    };
    const pickWith = (kind: string, seedValue: bigint): bigint => {
      const ctx = poolCtx(
        poolWorld({
          extra: { creature_family: [third], family_relation: [{ id: 2n, familyId: 3n, otherFamilyId: GOBLINS_ID, kind }] },
        }),
      );
      const pools = seedPools(ctx);
      setPoolCount(ctx, pools.goblinsOrchard, 0n, T0);
      return runVacuum(ctx, poolRow(ctx, pools.goblinsOrchard.id), T0, seedValue)?.refId ?? 0n;
    };
    const picks = new Set<bigint>();
    for (let s = 1n; s <= 40n; s += 1n) {
      expect(pickWith('feud', s)).toBe(pickWith('rival', s));
      picks.add(pickWith('feud', s));
    }
    expect([...picks].sort()).toEqual([SKITTERERS_ID, 3n]);
  });
});

describe('settling lines', () => {
  it('an Overrun pool settling across the Overrun floor says so once; regrowth is silent', () => {
    const ctx = poolCtx(poolWorld({ bobLocationId: FLATS_ID }));
    const { goblinsOrchard } = seedPools(ctx);
    setPoolCount(ctx, goblinsOrchard, 75n, T0);
    settlePool(ctx, poolRow(ctx, goblinsOrchard.id), T0 + 45n * SEC); // 70: still Overrun
    expect(densityLines(ctx)).toEqual([]);
    const down = settlePool(ctx, poolRow(ctx, goblinsOrchard.id), T0 + 81n * SEC); // 66: Stable
    expect(down).toMatchObject({ fromLevel: 3, toLevel: 2 });
    const lines = densityLines(ctx);
    expect(lines).toHaveLength(1);
    expect(lines[0]).toMatchObject({ characterId: 1n, kind: 'density_down' });
    expect(lines[0].message).toBe(overrunSettleLine('goblins', 'Glass Orchard'));

    const ctx2 = poolCtx(poolWorld());
    const pools2 = seedPools(ctx2);
    setPoolCount(ctx2, pools2.goblinsOrchard, 30n, T0);
    const up = settlePool(ctx2, poolRow(ctx2, pools2.goblinsOrchard.id), T0 + 150n * SEC);
    expect(up.pool.count).toBe(40n);
    expect(up).toMatchObject({ fromLevel: 1, toLevel: 2 });
    expect(rows(ctx2, 'event_private')).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// Source pin (T-51.3.1.1-18): setPoolCount is the only writer of place_pool.count
// ---------------------------------------------------------------------------

const SRC = join(fileURLToPath(new URL('.', import.meta.url)), '..');

function sourceFiles(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) {
      out.push(...sourceFiles(full));
    } else if (name.endsWith('.ts') && !name.endsWith('.test.ts') && !name.endsWith('.d.ts')) {
      out.push(full);
    }
  }
  return out;
}

/** The argument text of every `place_pool.id.update(` call in a source text. */
function placePoolUpdateArgs(text: string): string[] {
  const out: string[] = [];
  const needle = 'place_pool.id.update(';
  let at = text.indexOf(needle);
  while (at >= 0) {
    let depth = 1;
    let i = at + needle.length;
    while (i < text.length && depth > 0) {
      const ch = text[i];
      if (ch === '(') depth += 1;
      else if (ch === ')') depth -= 1;
      i += 1;
    }
    out.push(text.slice(at + needle.length, i - 1));
    at = text.indexOf(needle, i);
  }
  return out;
}

// Every place_pool update carries the count (an update writes the whole row, and a row variable can
// hide a `count:` field), so the pin is stricter than "an update that names count": no file but
// helpers/pools.ts may call `place_pool.id.update(` at all, and pools.ts calls it once, in setPoolCount.
// Other modules delete place_pool rows (helpers/passages.ts) or create them through createPool.
describe('source pin: one writer of place_pool.count', () => {
  it('the scanner finds each update call and its argument', () => {
    expect(placePoolUpdateArgs('ctx.db.place_pool.id.update({ ...p, count: f(1) }); tx.db.place_pool.id.update(row);')).toEqual([
      '{ ...p, count: f(1) }',
      'row',
    ]);
  });

  it('no file but helpers/pools.ts updates place_pool', () => {
    const offenders: string[] = [];
    for (const file of sourceFiles(SRC)) {
      const rel = relative(SRC, file).split(sep).join('/');
      if (rel === 'helpers/pools.ts') continue;
      const text = readFileSync(file, 'utf8');
      if (placePoolUpdateArgs(text).length > 0) offenders.push(rel);
    }
    expect(offenders).toEqual([]);
  });

  it('inside helpers/pools.ts the one update is in setPoolCount', () => {
    const text: string = readFileSync(join(SRC, 'helpers', 'pools.ts'), 'utf8');
    const start = text.indexOf('export function setPoolCount');
    expect(start).toBeGreaterThanOrEqual(0);
    const next = text.indexOf('\nexport function', start + 1);
    const body = text.slice(start, next < 0 ? text.length : next);
    expect(placePoolUpdateArgs(body)).toHaveLength(1);
    expect(placePoolUpdateArgs(text)).toHaveLength(1);
  });
});
