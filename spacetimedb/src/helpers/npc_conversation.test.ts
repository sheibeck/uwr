/**
 * Plan 51.3.1.1-32 (deferred row 31): the NPC's "Enemies in the area" context comes from the pools: one
 * entry per creature family (family name, level range, place) from pool_level at the NPC's place and its
 * connected places, never a member or filler template name, never a wiped-out family, at most
 * NPC_NEARBY_FAMILIES_MAX. Strict pool fixture (helpers/pool_fixture.ts) on the recording mock.
 */
import { describe, it, expect, vi, beforeAll } from 'vitest';
import { T0, REGION_ID, ORCHARD_ID, FLATS_ID, MARKET_ID, GOBLINS_ID, SKITTERERS_ID, poolWorld, poolCtx, seedPools } from './pool_fixture';
import { createPool, setPoolCount } from './pools';
import { familyOfOne } from './families';
import { getNearbyEnemyContext, NPC_NEARBY_FAMILIES_MAX } from './npc_conversation';

vi.mock('spacetimedb/server', async () =>
  (await import('./schema_recorder')).createRecordingServerMock(),
);

beforeAll(async () => {
  await import('../schema/tables');
});

const rows = (ctx: any, table: string): any[] => ctx.db._tables[table] ?? [];
const levelRow = (ctx: any, locationId: bigint, refId: bigint) =>
  rows(ctx, 'pool_level').find((r: any) => r.kind === 'creature' && r.locationId === locationId && r.refId === refId);

function world(extra: Record<string, any[]> = {}) {
  const ctx = poolCtx(poolWorld({ extra }), undefined, T0);
  const pools = seedPools(ctx);
  return { ctx, pools };
}

/** A pool_level row with every column, for a family pooled only in the public mirror. */
function mirrorRow(id: bigint, locationId: bigint, name: string, level = 2n) {
  return {
    id,
    regionId: REGION_ID,
    locationId,
    kind: 'creature',
    refId: 1000n + id,
    level,
    lvLo: 2n,
    lvHi: 4n,
    name,
    iconKey: 'beast',
    temperament: 'wary',
    singularNoun: 'beast',
    pluralNoun: 'beasts',
    timeOfDay: 'any',
  };
}

describe('getNearbyEnemyContext (pool families, row 31)', () => {
  it('names the cap', () => {
    expect(NPC_NEARBY_FAMILIES_MAX).toBe(15);
  });

  it('one entry per family: the NPC place first, then connected places in ascending id, with its level range', () => {
    const { ctx } = world();
    const goblins = levelRow(ctx, ORCHARD_ID, GOBLINS_ID);
    const skitterers = levelRow(ctx, FLATS_ID, SKITTERERS_ID);
    expect(getNearbyEnemyContext(ctx, ORCHARD_ID)).toEqual([
      { name: 'Goblins', level: Number(goblins.lvLo), levelHi: Number(goblins.lvHi), location: 'Glass Orchard' },
      { name: 'Salt-Crust Skitterers', level: Number(skitterers.lvLo), levelHi: Number(skitterers.lvHi), location: 'Mother Pan Flats' },
    ]);
    expect(goblins.lvLo).toBe(3n);
    expect(goblins.lvHi).toBe(5n);
    // From the market (no pools of its own) the orchard is the one neighbour.
    expect(getNearbyEnemyContext(ctx, MARKET_ID).map((e) => e.name)).toEqual(['Goblins']);
  });

  it('a family pooled at two places is listed once, at the first place', () => {
    const { ctx } = world();
    createPool(ctx, { regionId: REGION_ID, locationId: FLATS_ID, kind: 'creature', refId: GOBLINS_ID, homeLevel: 2 }, T0);
    const list = getNearbyEnemyContext(ctx, FLATS_ID);
    expect(list.filter((e) => e.name === 'Goblins')).toEqual([expect.objectContaining({ location: 'Mother Pan Flats' })]);
  });

  it('a wiped-out family is not listed', () => {
    const { ctx, pools } = world();
    setPoolCount(ctx, pools.skitterersFlats, 0n, T0);
    expect(getNearbyEnemyContext(ctx, ORCHARD_ID).map((e) => e.name)).toEqual(['Goblins']);
  });

  it('no member or filler template name appears', () => {
    const { ctx } = world();
    const names = getNearbyEnemyContext(ctx, ORCHARD_ID).map((e) => e.name);
    const templateNames = rows(ctx, 'enemy_template').map((t: any) => t.name);
    for (const name of names) expect(templateNames).not.toContain(name);
    expect(JSON.stringify(getNearbyEnemyContext(ctx, ORCHARD_ID))).not.toMatch(/Brute|Cutter|Mender|Hexer/);
  });

  it('a quest family of one is listed by its family name', () => {
    const template = {
      id: 950n, name: 'Gloomfang', role: 'melee', roleDetail: 'melee', abilityProfile: 'melee', terrainTypes: 'any', creatureType: 'beast',
      timeOfDay: 'any', socialGroup: 'loner', socialRadius: 0n, awareness: 'normal', groupMin: 1n, groupMax: 1n, armorClass: 5n,
      level: 3n, maxHp: 60n, baseDamage: 8n, xpReward: 30n,
    };
    const { ctx } = world({ enemy_template: [template] });
    const family = familyOfOne(ctx, rows(ctx, 'enemy_template').find((t: any) => t.id === 950n), ORCHARD_ID, T0);
    const list = getNearbyEnemyContext(ctx, ORCHARD_ID);
    expect(list.map((e) => e.name)).toContain(family.name);
    expect(list.map((e) => e.name)).not.toContain('Gloomfang');
  });

  it('16 or more families give 15 entries', () => {
    const extra = Array.from({ length: 16 }, (_, i) => mirrorRow(500n + BigInt(i), ORCHARD_ID, `Family ${i + 1}`));
    const { ctx } = world({ pool_level: extra });
    const list = getNearbyEnemyContext(ctx, ORCHARD_ID);
    expect(list).toHaveLength(NPC_NEARBY_FAMILIES_MAX);
  });

  it('is read-only', () => {
    const { ctx } = world();
    const dump = () =>
      JSON.stringify(
        Object.entries(ctx.db._tables as Record<string, any[]>).filter(([, list]) => list.length > 0).sort(([a], [b]) => (a < b ? -1 : 1)),
        (_k, v) => (typeof v === 'bigint' ? v.toString() : v),
      );
    const before = dump();
    getNearbyEnemyContext(ctx, ORCHARD_ID);
    expect(dump()).toBe(before);
  });
});
