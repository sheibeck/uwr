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
import { createPool, setPoolCount, settlePool, poolsAt, familyRangeAt, mirrorLevel } from './pools';

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
