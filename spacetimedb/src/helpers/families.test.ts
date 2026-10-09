/**
 * Phase 51.3.1.1 Plan 07: the family and seeding layer (helpers/families.ts) on the shared pool world
 * (helpers/pool_fixture.ts), on a strict mock db whose accessors come from the recorded schema.
 */
import { describe, it, expect, vi, beforeAll } from 'vitest';
import { rowColumnProblems } from './schema_recorder';
import { enemyStatsForLevel } from '../data/enemy_rules';
import { memberAbilities } from '../data/family_rules';
import { DENSITY_RULES, creatureHomeLevels, homeCount, poolSeed } from '../data/density_rules';
import { T0, REGION_ID, ORCHARD_ID, FLATS_ID, MARKET_ID, GOBLINS_ID, SKITTERERS_ID, poolWorld, poolCtx } from './pool_fixture';
import { createPool } from './pools';
import {
  addResourcePoolsForRegion,
  buildRegionFamilies,
  createFamily,
  createRelations,
  ensurePoolsForLocation,
  familiesFromTemplates,
  familyFitPlaces,
  familyOfOne,
  isOrdinaryTemplate,
  linkFamilyToLocation,
  ruleRelations,
  seedCreaturePools,
  seedResourcePools,
  type FamilyDefinition,
} from './families';

vi.mock('spacetimedb/server', async () =>
  (await import('./schema_recorder')).createRecordingServerMock(),
);

beforeAll(async () => {
  await import('../schema/tables');
});

const rows = (ctx: any, table: string): any[] => ctx.db._tables[table] ?? [];
const counts = (ctx: any, tables: string[]): Record<string, number> =>
  Object.fromEntries(tables.map((t) => [t, rows(ctx, t).length]));

const FAMILY_TABLES = [
  'creature_family',
  'family_member',
  'family_relation',
  'enemy_template',
  'enemy_role_template',
  'enemy_ability',
  'location_enemy_template',
];

function enemyTemplate(id: bigint, name: string, role: string, creatureType: string, extra: Record<string, any> = {}) {
  return {
    id,
    name,
    role,
    roleDetail: role,
    abilityProfile: role,
    terrainTypes: 'swamp, woods',
    creatureType,
    timeOfDay: 'any',
    socialGroup: name,
    socialRadius: 0n,
    awareness: 'normal',
    groupMin: 1n,
    groupMax: 3n,
    armorClass: 5n,
    level: 3n,
    maxHp: 60n,
    baseDamage: 8n,
    xpReward: 30n,
    ...extra,
  };
}

function wolfDefinition(): FamilyDefinition {
  return {
    key: '1:wolfkin',
    name: 'Ash Wolves',
    singularNoun: 'wolf',
    pluralNoun: 'wolves',
    creatureType: 'beast',
    temperament: 'aggressive',
    iconKey: 'beast',
    ambushVerb: 'lunge',
    ambushRest: 'from the ash',
    fitTerrains: ['woods', 'plains'],
    members: [
      { role: 'tank', name: 'Ash Wolf Packleader', filler: false },
      { role: 'damage', name: 'Ash Wolf Biter', filler: false },
      { role: 'healer', name: 'Ash Wolf Tender', filler: false },
      { role: 'caster', name: 'Ash Wolf Howler', filler: false },
    ],
  };
}

describe('createFamily', () => {
  it('inserts the family, four members, their templates, role templates and rule abilities', () => {
    const ctx = poolCtx(poolWorld());
    const before = counts(ctx, FAMILY_TABLES);
    const family = createFamily(ctx, REGION_ID, wolfDefinition(), 3n);

    const after = counts(ctx, FAMILY_TABLES);
    expect(after.creature_family - before.creature_family).toBe(1);
    expect(after.family_member - before.family_member).toBe(4);
    expect(after.enemy_template - before.enemy_template).toBe(4);
    expect(after.enemy_role_template - before.enemy_role_template).toBe(4);
    expect(after.enemy_ability - before.enemy_ability).toBe(8);

    const stored = rows(ctx, 'creature_family').find((r: any) => r.id === family.id);
    expect(stored).toMatchObject({
      regionId: REGION_ID,
      key: '1:wolfkin',
      name: 'Ash Wolves',
      singularNoun: 'wolf',
      pluralNoun: 'wolves',
      temperament: 'aggressive',
      iconKey: 'beast',
      creatureType: 'beast',
      ambushVerb: 'lunge',
      ambushRest: 'from the ash',
      fitTerrains: 'woods,plains',
    });
    expect(rowColumnProblems('creature_family', stored)).toEqual([]);

    const stats = enemyStatsForLevel(3n);
    const members = rows(ctx, 'family_member').filter((m: any) => m.familyId === family.id);
    expect(members.map((m: any) => m.role)).toEqual(['tank', 'damage', 'healer', 'caster']);
    for (const member of members) {
      expect(member.filler).toBe(false);
      expect(rowColumnProblems('family_member', member)).toEqual([]);
      const template = rows(ctx, 'enemy_template').find((t: any) => t.id === member.enemyTemplateId);
      expect(template).toMatchObject({
        role: member.role,
        roleDetail: member.role,
        abilityProfile: member.role,
        terrainTypes: 'woods,plains',
        creatureType: 'beast',
        socialGroup: 'Ash Wolves',
        groupMin: 1n,
        groupMax: 1n,
        level: 3n,
        maxHp: stats.maxHp,
        baseDamage: stats.baseDamage,
        xpReward: stats.xpReward,
        armorClass: stats.armorClass,
      });
      expect(rowColumnProblems('enemy_template', template)).toEqual([]);
      const roleRows = rows(ctx, 'enemy_role_template').filter((r: any) => r.enemyTemplateId === template.id);
      expect(roleRows).toHaveLength(1);
      expect(roleRows[0]).toMatchObject({ role: member.role, roleKey: member.role, displayName: template.name });
      expect(rowColumnProblems('enemy_role_template', roleRows[0])).toEqual([]);
      const abilities = rows(ctx, 'enemy_ability').filter((a: any) => a.enemyTemplateId === template.id);
      expect(abilities.map((a: any) => a.abilityKey)).toEqual(memberAbilities(member.role).map((a) => a.abilityKey));
      for (const ability of abilities) expect(rowColumnProblems('enemy_ability', ability)).toEqual([]);
    }
  });

  it('is find-or-create by key: a second call inserts nothing and returns the same family', () => {
    const ctx = poolCtx(poolWorld());
    const first = createFamily(ctx, REGION_ID, wolfDefinition(), 3n);
    const before = counts(ctx, FAMILY_TABLES);
    const second = createFamily(ctx, REGION_ID, wolfDefinition(), 3n);
    expect(second.id).toBe(first.id);
    expect(counts(ctx, FAMILY_TABLES)).toEqual(before);
  });

  it('clamps a base level below 1 to 1', () => {
    const ctx = poolCtx(poolWorld());
    const family = createFamily(ctx, REGION_ID, wolfDefinition(), 0n);
    const member = rows(ctx, 'family_member').find((m: any) => m.familyId === family.id);
    const template = rows(ctx, 'enemy_template').find((t: any) => t.id === member.enemyTemplateId);
    expect(template.level).toBe(1n);
    expect(template.maxHp).toBe(enemyStatsForLevel(1n).maxHp);
  });

  it('an existing template joins with its role rewritten to the canonical role and no new template', () => {
    const ctx = poolCtx(
      poolWorld({
        extra: {
          enemy_template: [enemyTemplate(501n, 'Brine Lurker', 'melee', 'beast')],
          enemy_role_template: [
            { id: 900n, enemyTemplateId: 501n, roleKey: 'melee', displayName: 'Brine Lurker', role: 'melee', roleDetail: 'melee', abilityProfile: 'melee' },
          ],
        },
      }),
    );
    const def: FamilyDefinition = {
      ...wolfDefinition(),
      key: '1:lurkers',
      name: 'Brine Lurkers',
      members: [{ role: 'tank', name: 'Brine Lurker', existingTemplateId: 501n, filler: false }],
    };
    const before = counts(ctx, FAMILY_TABLES);
    const family = createFamily(ctx, REGION_ID, def, 3n);
    const after = counts(ctx, FAMILY_TABLES);

    expect(after.enemy_template).toBe(before.enemy_template);
    expect(after.enemy_role_template).toBe(before.enemy_role_template);
    expect(after.enemy_ability).toBe(before.enemy_ability);
    const template = rows(ctx, 'enemy_template').find((t: any) => t.id === 501n);
    expect(template).toMatchObject({ role: 'tank', roleDetail: 'tank', abilityProfile: 'tank', level: 3n, maxHp: 60n });
    const roleRow = rows(ctx, 'enemy_role_template').find((r: any) => r.id === 900n);
    expect(roleRow).toMatchObject({ role: 'tank', roleKey: 'tank', roleDetail: 'tank', abilityProfile: 'tank' });
    const members = rows(ctx, 'family_member').filter((m: any) => m.familyId === family.id);
    expect(members).toEqual([{ id: members[0].id, familyId: family.id, enemyTemplateId: 501n, role: 'tank', filler: false }]);
  });

  it('marks filler members as filler', () => {
    const ctx = poolCtx(poolWorld());
    const def: FamilyDefinition = {
      ...wolfDefinition(),
      members: [
        { role: 'damage', name: 'Ash Wolf Biter', filler: false },
        { role: 'healer', name: 'Wolf Mender', filler: true },
      ],
    };
    const family = createFamily(ctx, REGION_ID, def, 2n);
    const members = rows(ctx, 'family_member').filter((m: any) => m.familyId === family.id);
    expect(members.map((m: any) => [m.role, m.filler])).toEqual([
      ['damage', false],
      ['healer', true],
    ]);
  });
});

describe('linkFamilyToLocation', () => {
  it('links every member to the place once', () => {
    const ctx = poolCtx(poolWorld());
    const family = createFamily(ctx, REGION_ID, wolfDefinition(), 3n);
    linkFamilyToLocation(ctx, family.id, ORCHARD_ID);
    linkFamilyToLocation(ctx, family.id, ORCHARD_ID);
    const memberIds = rows(ctx, 'family_member')
      .filter((m: any) => m.familyId === family.id)
      .map((m: any) => m.enemyTemplateId);
    const links = rows(ctx, 'location_enemy_template').filter((l: any) => l.locationId === ORCHARD_ID);
    expect(links.map((l: any) => l.enemyTemplateId).sort()).toEqual([...memberIds].sort());
    for (const link of links) expect(rowColumnProblems('location_enemy_template', link)).toEqual([]);
  });

  it('keeps a link that already exists', () => {
    const ctx = poolCtx(
      poolWorld({ extra: { location_enemy_template: [{ id: 1n, locationId: FLATS_ID, enemyTemplateId: 201n }] } }),
    );
    linkFamilyToLocation(ctx, SKITTERERS_ID, FLATS_ID);
    const links = rows(ctx, 'location_enemy_template').filter((l: any) => l.locationId === FLATS_ID);
    expect(links.map((l: any) => l.enemyTemplateId)).toEqual([201n, 202n, 203n]);
  });
});

describe('familiesFromTemplates (D-25)', () => {
  const skitterer = enemyTemplate(601n, 'Salt-Crust Skitterer', 'melee', 'beast', { terrainTypes: 'swamp, woods' });
  const archer = enemyTemplate(602n, 'Brine Archer', 'ranged', 'beast', { terrainTypes: 'swamp,plains' });
  const seer = enemyTemplate(603n, 'Drowned Seer', 'caster', 'undead', { terrainTypes: 'swamp' });

  it('groups by creature type with rule roles, fillers, nouns, temperament and icon', () => {
    const ctx = poolCtx(poolWorld());
    const defs = familiesFromTemplates(ctx, REGION_ID, [seer, archer, skitterer]);
    expect(defs).toHaveLength(2);

    const [beast, undead] = defs;
    expect(beast).toMatchObject({
      key: '1:beast',
      name: 'Salt-Crust Skitterers',
      singularNoun: 'skitterer',
      pluralNoun: 'skitterers',
      creatureType: 'beast',
      temperament: 'aggressive',
      iconKey: 'beast',
      ambushVerb: '',
      ambushRest: '',
      fitTerrains: ['swamp', 'woods', 'plains'],
    });
    expect(beast!.members).toEqual([
      { role: 'tank', name: 'Salt-Crust Skitterer', existingTemplateId: 601n, filler: false },
      { role: 'damage', name: 'Brine Archer', existingTemplateId: 602n, filler: false },
      { role: 'healer', name: 'Skitterer Mender', filler: true },
      { role: 'caster', name: 'Skitterer Hexer', filler: true },
    ]);

    expect(undead).toMatchObject({ key: '1:undead', name: 'Drowned Seers', singularNoun: 'seer', pluralNoun: 'seers' });
    expect(undead!.members).toEqual([
      { role: 'caster', name: 'Drowned Seer', existingTemplateId: 603n, filler: false },
      { role: 'tank', name: 'Seer Warder', filler: true },
      { role: 'damage', name: 'Seer Raider', filler: true },
      { role: 'healer', name: 'Seer Mender', filler: true },
    ]);
  });

  it('a second melee is damage and support reads healer', () => {
    const ctx = poolCtx(poolWorld());
    const defs = familiesFromTemplates(ctx, REGION_ID, [
      enemyTemplate(701n, 'Bog Brute', 'melee', 'humanoid'),
      enemyTemplate(702n, 'Bog Thug', 'melee', 'humanoid'),
      enemyTemplate(703n, 'Bog Witch', 'support', 'humanoid'),
    ]);
    expect(defs).toHaveLength(1);
    expect(defs[0]!.temperament).toBe('wary');
    expect(defs[0]!.members.map((m) => [m.role, m.name, m.filler])).toEqual([
      ['tank', 'Bog Brute', false],
      ['damage', 'Bog Thug', false],
      ['healer', 'Bog Witch', false],
      ['caster', 'Brute Hexer', true],
    ]);
  });

  it('gives nothing for no templates', () => {
    const ctx = poolCtx(poolWorld());
    expect(familiesFromTemplates(ctx, REGION_ID, [])).toEqual([]);
  });
});

describe('isOrdinaryTemplate', () => {
  const seed = () =>
    poolWorld({
      extra: {
        enemy_template: [
          enemyTemplate(801n, 'Ash Tyrant', 'melee', 'beast', { isBoss: true }),
          enemyTemplate(802n, 'Old Grimjaw', 'melee', 'beast'),
          enemyTemplate(803n, 'Marsh Queen', 'caster', 'beast'),
          enemyTemplate(804n, 'Bog Rat', 'melee', 'beast'),
          enemyTemplate(805n, 'Reed Stalker', 'melee', 'beast'),
          enemyTemplate(806n, 'Plain Hopper', 'melee', 'beast'),
        ],
        named_enemy: [
          { id: 1n, characterId: 1n, name: 'Old Grimjaw', enemyTemplateId: 802n, locationId: ORCHARD_ID, isAlive: true, respawnMinutes: 30n },
        ],
        quest_template: [
          { id: 1n, name: 'Crown of Reeds', npcId: 1n, targetEnemyTemplateId: 803n, requiredCount: 1n, minLevel: 1n, maxLevel: 10n, rewardXp: 10n, questType: 'boss_kill' },
          { id: 2n, name: 'Thin the Stalkers', npcId: 1n, targetEnemyTemplateId: 805n, requiredCount: 5n, minLevel: 1n, maxLevel: 10n, rewardXp: 10n, questType: 'kill' },
        ],
      },
    });

  it('excludes bosses, named enemies, boss_kill targets and World event enemies', () => {
    const ctx = poolCtx(seed());
    expect(isOrdinaryTemplate(ctx, 801n)).toBe(false);
    expect(isOrdinaryTemplate(ctx, 802n)).toBe(false);
    expect(isOrdinaryTemplate(ctx, 803n)).toBe(false);
    expect(isOrdinaryTemplate(ctx, 804n)).toBe(false);
  });

  it('keeps kill targets and plain templates; a missing template is not ordinary', () => {
    const ctx = poolCtx(seed());
    expect(isOrdinaryTemplate(ctx, 805n)).toBe(true);
    expect(isOrdinaryTemplate(ctx, 806n)).toBe(true);
    expect(isOrdinaryTemplate(ctx, 101n)).toBe(true);
    expect(isOrdinaryTemplate(ctx, 9999n)).toBe(false);
  });
});

describe('createRelations', () => {
  it('stores rival, prey and predator rows and ignores a self-relation and unknown kinds', () => {
    const ctx = poolCtx(poolWorld({ noRelations: true }));
    createRelations(ctx, GOBLINS_ID, [
      { otherFamilyId: SKITTERERS_ID, kind: 'rival' },
      { otherFamilyId: SKITTERERS_ID, kind: 'prey' },
      { otherFamilyId: SKITTERERS_ID, kind: 'predator' },
      { otherFamilyId: GOBLINS_ID, kind: 'rival' },
      { otherFamilyId: SKITTERERS_ID, kind: 'friend' as any },
    ]);
    const stored = rows(ctx, 'family_relation');
    expect(stored.map((r: any) => [r.familyId, r.otherFamilyId, r.kind])).toEqual([
      [GOBLINS_ID, SKITTERERS_ID, 'rival'],
      [GOBLINS_ID, SKITTERERS_ID, 'prey'],
      [GOBLINS_ID, SKITTERERS_ID, 'predator'],
    ]);
    for (const row of stored) expect(rowColumnProblems('family_relation', row)).toEqual([]);
  });

  it('is idempotent', () => {
    const ctx = poolCtx(poolWorld({ noRelations: true }));
    createRelations(ctx, GOBLINS_ID, [{ otherFamilyId: SKITTERERS_ID, kind: 'rival' }]);
    createRelations(ctx, GOBLINS_ID, [{ otherFamilyId: SKITTERERS_ID, kind: 'rival' }]);
    expect(rows(ctx, 'family_relation')).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------
// Task 2: pool seeding, ensurePoolsForLocation, region resource pools, the family of one
// ---------------------------------------------------------------------------

const FOG_ID = 12n;

function itemRow(id: bigint, name: string) {
  return {
    id,
    name,
    slot: 'resource',
    armorType: 'none',
    rarity: 'common',
    tier: 1n,
    isJunk: false,
    vendorValue: 2n,
    requiredLevel: 1n,
    allowedClasses: 'any',
    strBonus: 0n,
    dexBonus: 0n,
    chaBonus: 0n,
    wisBonus: 0n,
    intBonus: 0n,
    hpBonus: 0n,
    manaBonus: 0n,
    armorClassBonus: 0n,
    magicResistanceBonus: 0n,
    weaponBaseDamage: 0n,
    weaponDps: 0n,
    weaponType: '',
    stackable: true,
    wellFedDurationMicros: 0n,
    wellFedBuffType: '',
    wellFedBuffMagnitude: 0n,
  };
}

function gatherRow(itemTemplateId: bigint, terrain: string, rarity: string, timeOfDay = 'any') {
  return {
    itemTemplateId,
    regionId: REGION_ID,
    role: 'gather',
    slotKey: `gather:${itemTemplateId.toString()}`,
    kind: 'edible',
    rarity,
    terrain,
    timeOfDay,
    enemyTemplateId: 0n,
    familyId: 0n,
  };
}

function placeRow(id: bigint, name: string, terrainType: string, isSafe: boolean, isHub = false) {
  return {
    id,
    name,
    description: `${name}.`,
    zone: 'z',
    regionId: REGION_ID,
    levelOffset: 0n,
    isSafe,
    terrainType,
    bindStone: isHub,
    craftingAvailable: isHub,
    shortName: '',
    placeNoun: '',
    isHub,
  };
}

const location = (ctx: any, id: bigint) => rows(ctx, 'location').find((l: any) => l.id === id);
const poolsHere = (ctx: any, locationId: bigint, kind: string) =>
  rows(ctx, 'place_pool').filter((p: any) => p.locationId === locationId && p.kind === kind);
const nameOf = (ctx: any, itemId: bigint) => rows(ctx, 'item_template').find((i: any) => i.id === itemId)?.name;

function thirdFamily() {
  return {
    id: 3n,
    regionId: REGION_ID,
    key: '1:undead',
    name: 'Drowned Seers',
    singularNoun: 'seer',
    pluralNoun: 'seers',
    temperament: 'aggressive',
    iconKey: 'undead',
    creatureType: 'undead',
    ambushVerb: '',
    ambushRest: '',
    fitTerrains: 'swamp',
  };
}

describe('seedCreaturePools (D-18, D-46)', () => {
  it('seeds one pool per family at a non-safe place with rule home levels [2, 2, 1] in seeded order', () => {
    const ctx = poolCtx(poolWorld({ extra: { creature_family: [thirdFamily()] } }));
    const created = seedCreaturePools(ctx, location(ctx, ORCHARD_ID), [GOBLINS_ID, SKITTERERS_ID, 3n], T0);
    const expected = creatureHomeLevels(3, poolSeed(ORCHARD_ID, REGION_ID));
    expect([...expected].sort()).toEqual([1, 2, 2]);
    expect(created.map((p: any) => p.refId)).toEqual([GOBLINS_ID, SKITTERERS_ID, 3n]);
    expect(created.map((p: any) => Number(p.homeLevel))).toEqual(expected);
    expect(created.map((p: any) => p.count)).toEqual(expected.map((level) => homeCount('creature', level)));
    for (const pool of created) {
      expect(pool).toMatchObject({ kind: 'creature', regionId: REGION_ID, locationId: ORCHARD_ID, timeOfDay: 'any' });
      expect(rows(ctx, 'pool_level').some((l: any) => l.id === pool.id)).toBe(true);
    }
  });

  it('never seeds a safe place, a hub or an uncharted place', () => {
    const ctx = poolCtx(poolWorld({ extra: { location: [placeRow(FOG_ID, 'Fog Edge', 'uncharted', false)] } }));
    expect(seedCreaturePools(ctx, location(ctx, MARKET_ID), [GOBLINS_ID], T0)).toEqual([]);
    expect(seedCreaturePools(ctx, location(ctx, FOG_ID), [GOBLINS_ID], T0)).toEqual([]);
    expect(rows(ctx, 'place_pool')).toEqual([]);
  });

  it('is idempotent', () => {
    const ctx = poolCtx(poolWorld());
    seedCreaturePools(ctx, location(ctx, ORCHARD_ID), [GOBLINS_ID, SKITTERERS_ID], T0);
    const before = rows(ctx, 'place_pool').length;
    seedCreaturePools(ctx, location(ctx, ORCHARD_ID), [GOBLINS_ID, SKITTERERS_ID], T0);
    expect(rows(ctx, 'place_pool')).toHaveLength(before);
  });
});

describe('seedResourcePools (D-26, D-38, D-55)', () => {
  it('home levels by rarity: common 3, regional uncommon 2, modifier reagent 1', () => {
    const seed = poolWorld({
      extra: {
        item_template: [itemRow(310n, 'Glassbloom'), itemRow(311n, 'Wisdom Herb')],
        economy_item: [gatherRow(310n, 'woods', 'uncommon')],
      },
    });
    const ctx = poolCtx(seed);
    const created = seedResourcePools(ctx, location(ctx, ORCHARD_ID), T0);
    const byName = Object.fromEntries(created.map((p: any) => [nameOf(ctx, p.refId), p]));
    expect(Object.keys(byName).sort()).toEqual(['Glassbloom', 'Iron Ore', 'Wild Berries', 'Wisdom Herb']);
    expect(byName['Wild Berries']).toMatchObject({ homeLevel: 3n, count: 100n, timeOfDay: 'any', kind: 'resource' });
    expect(byName['Iron Ore']).toMatchObject({ homeLevel: 3n, count: 100n });
    expect(byName['Glassbloom']).toMatchObject({ homeLevel: 2n, count: 66n });
    expect(byName['Wisdom Herb']).toMatchObject({ homeLevel: 1n, count: 33n });
  });

  it('keeps night on the pool and its level row; the same template as any and night is stored as any', () => {
    const seed = poolWorld({ extra: { item_template: [itemRow(312n, 'Moonweave Cloth')] } });
    seed.economy_item = [gatherRow(302n, 'woods', 'common', 'night'), ...seed.economy_item!];
    const ctx = poolCtx(seed);
    const created = seedResourcePools(ctx, location(ctx, ORCHARD_ID), T0);
    const byName = Object.fromEntries(created.map((p: any) => [nameOf(ctx, p.refId), p]));
    expect(Object.keys(byName).sort()).toEqual(['Iron Ore', 'Moonweave Cloth', 'Wild Berries']);
    expect(byName['Moonweave Cloth']).toMatchObject({ timeOfDay: 'night', homeLevel: 1n });
    const level = rows(ctx, 'pool_level').find((l: any) => l.id === byName['Moonweave Cloth'].id);
    expect(level.timeOfDay).toBe('night');
    expect(byName['Wild Berries']).toMatchObject({ timeOfDay: 'any', homeLevel: 3n });
  });

  it('picks at most RESOURCE_POOLS_PER_PLACE distinct items and never one pinned to 0', () => {
    const woods = ['Wood', 'Resin', 'Dry Grass', 'Bitter Herbs', 'Clear Water'];
    const seed = poolWorld({
      extra: {
        item_template: woods.map((name, i) => itemRow(320n + BigInt(i), name)),
        economy_item_dial: [{ itemTemplateId: 320n, dropRatePct: 0n }],
      },
    });
    for (const placeId of [ORCHARD_ID, 30n, 31n, 32n, 33n]) {
      const s = { ...seed, location: [...seed.location!, placeRow(30n, 'A', 'woods', false), placeRow(31n, 'B', 'woods', false), placeRow(32n, 'C', 'woods', false), placeRow(33n, 'D', 'woods', true)] };
      const ctx = poolCtx(s);
      const created = seedResourcePools(ctx, location(ctx, placeId), T0);
      expect(created.length).toBe(DENSITY_RULES.RESOURCE_POOLS_PER_PLACE);
      const ids = created.map((p: any) => p.refId);
      expect(new Set(ids).size).toBe(ids.length);
      expect(ids).not.toContain(320n);
    }
  });

  it('seeds a safe town, never an uncharted place, and adds nothing on a rerun', () => {
    const seed = poolWorld({
      extra: {
        item_template: [itemRow(330n, 'Clear Water')],
        location: [placeRow(FOG_ID, 'Fog Edge', 'uncharted', false)],
      },
    });
    const ctx = poolCtx(seed);
    const town = seedResourcePools(ctx, location(ctx, MARKET_ID), T0);
    expect(town.map((p: any) => nameOf(ctx, p.refId))).toEqual(['Clear Water']);
    expect(seedResourcePools(ctx, location(ctx, FOG_ID), T0)).toEqual([]);
    const before = rows(ctx, 'place_pool').length;
    seedResourcePools(ctx, location(ctx, MARKET_ID), T0);
    expect(rows(ctx, 'place_pool')).toHaveLength(before);
  });
});

describe('ensurePoolsForLocation (lazy safety net)', () => {
  const flatsSeed = () =>
    poolWorld({
      extra: {
        enemy_template: [
          enemyTemplate(901n, 'Drowned Seer', 'caster', 'undead'),
          enemyTemplate(902n, 'Bog Wight', 'melee', 'undead'),
          enemyTemplate(903n, 'Mire Spark', 'caster', 'elemental'),
          enemyTemplate(904n, 'Mire King', 'melee', 'undead', { isBoss: true }),
        ],
        location_enemy_template: [901n, 902n, 903n, 904n, 201n].map((tid, i) => ({
          id: BigInt(i + 1),
          locationId: FLATS_ID,
          enemyTemplateId: tid,
        })),
        item_template: [itemRow(340n, 'Peat'), itemRow(341n, 'Murky Water')],
        location: [placeRow(FOG_ID, 'Fog Edge', 'uncharted', false)],
      },
    });

  it('groups linked ordinary templates into families, links them and seeds creature and resource pools', () => {
    const ctx = poolCtx(flatsSeed());
    ensurePoolsForLocation(ctx, FLATS_ID);

    const families = rows(ctx, 'creature_family');
    const undead = families.find((f: any) => f.key === '1:undead');
    const elemental = families.find((f: any) => f.key === '1:elemental');
    expect(undead).toBeTruthy();
    expect(elemental).toBeTruthy();
    expect(families).toHaveLength(4);

    const undeadMembers = rows(ctx, 'family_member').filter((m: any) => m.familyId === undead.id);
    expect(undeadMembers.map((m: any) => [m.enemyTemplateId, m.role])).toEqual(
      expect.arrayContaining([
        [901n, 'caster'],
        [902n, 'tank'],
      ]),
    );
    expect(rows(ctx, 'family_member').some((m: any) => m.enemyTemplateId === 904n)).toBe(false);

    const linked = rows(ctx, 'location_enemy_template')
      .filter((l: any) => l.locationId === FLATS_ID)
      .map((l: any) => l.enemyTemplateId);
    for (const member of undeadMembers) expect(linked).toContain(member.enemyTemplateId);

    const creature = poolsHere(ctx, FLATS_ID, 'creature').map((p: any) => p.refId);
    expect(creature.sort()).toEqual([SKITTERERS_ID, undead.id, elemental.id].sort());
    expect(poolsHere(ctx, FLATS_ID, 'resource').length).toBeGreaterThan(0);
  });

  it('a second call changes nothing and reads only the pools', () => {
    const ctx = poolCtx(flatsSeed());
    ensurePoolsForLocation(ctx, FLATS_ID);
    const snapshot = JSON.stringify(ctx.db._tables, (_k, v) => (typeof v === 'bigint' ? v.toString() : v));
    const db = ctx.db;
    ctx.db = new Proxy(db, {
      get(target: any, name: string) {
        if (name === 'location_enemy_template' || name === 'creature_family' || name === 'item_template') {
          throw new Error(`unexpected read of ${name}`);
        }
        return target[name];
      },
    });
    ensurePoolsForLocation(ctx, FLATS_ID);
    ctx.db = db;
    expect(JSON.stringify(ctx.db._tables, (_k, v) => (typeof v === 'bigint' ? v.toString() : v))).toBe(snapshot);
  });

  it('never seeds creature pools at a safe place and never touches an uncharted place', () => {
    const seed = flatsSeed();
    seed.location_enemy_template = [
      ...seed.location_enemy_template!,
      { id: 50n, locationId: MARKET_ID, enemyTemplateId: 901n },
      { id: 51n, locationId: FOG_ID, enemyTemplateId: 902n },
    ];
    seed.item_template = [...seed.item_template!, itemRow(342n, 'Clear Water')];
    const ctx = poolCtx(seed);
    ensurePoolsForLocation(ctx, MARKET_ID);
    expect(poolsHere(ctx, MARKET_ID, 'creature')).toEqual([]);
    expect(poolsHere(ctx, MARKET_ID, 'resource').length).toBeGreaterThan(0);
    expect(rows(ctx, 'creature_family')).toHaveLength(2);

    const before = JSON.stringify(ctx.db._tables, (_k, v) => (typeof v === 'bigint' ? v.toString() : v));
    ensurePoolsForLocation(ctx, FOG_ID);
    ensurePoolsForLocation(ctx, 9999n);
    expect(JSON.stringify(ctx.db._tables, (_k, v) => (typeof v === 'bigint' ? v.toString() : v))).toBe(before);
  });
});

describe('addResourcePoolsForRegion (D-48)', () => {
  it("adds the region's AI gatherables at every place of matching terrain, beyond the per-place count", () => {
    const seed = poolWorld({
      extra: {
        item_template: [itemRow(350n, 'Glassbloom'), itemRow(351n, 'Saltmoss'), itemRow(352n, 'Pan Salt')],
        economy_item: [gatherRow(350n, 'woods', 'uncommon', 'night'), gatherRow(351n, 'swamp', 'rare'), gatherRow(352n, 'town', 'common')],
      },
    });
    const ctx = poolCtx(seed);
    for (let i = 0n; i < 4n; i += 1n) {
      createPool(ctx, { regionId: REGION_ID, locationId: ORCHARD_ID, kind: 'resource', refId: 400n + i, homeLevel: 2 }, T0);
    }
    addResourcePoolsForRegion(ctx, REGION_ID, T0);

    const orchard = poolsHere(ctx, ORCHARD_ID, 'resource');
    expect(orchard).toHaveLength(6);
    expect(orchard.find((p: any) => p.refId === 301n)).toMatchObject({ homeLevel: 3n, timeOfDay: 'any' });
    expect(orchard.find((p: any) => p.refId === 350n)).toMatchObject({ homeLevel: 2n, timeOfDay: 'night' });
    expect(poolsHere(ctx, FLATS_ID, 'resource').map((p: any) => [p.refId, p.homeLevel])).toEqual([[351n, 1n]]);
    expect(poolsHere(ctx, MARKET_ID, 'resource').map((p: any) => p.refId)).toEqual([352n]);

    const before = rows(ctx, 'place_pool').length;
    addResourcePoolsForRegion(ctx, REGION_ID, T0);
    expect(rows(ctx, 'place_pool')).toHaveLength(before);
  });
});

describe('familyOfOne (D-54)', () => {
  const questSeed = () =>
    poolWorld({
      extra: {
        enemy_template: [
          enemyTemplate(950n, 'Gloomfang', 'melee', 'beast', { terrainTypes: 'any', socialGroup: 'loner', groupMax: 1n }),
        ],
        location: [placeRow(5n, 'Quiet Chapel', 'town', true), placeRow(6n, 'Lone Shrine', 'town', true)],
        location_connection: [
          { id: 20n, fromLocationId: MARKET_ID, toLocationId: FLATS_ID },
          { id: 21n, fromLocationId: MARKET_ID, toLocationId: 5n },
        ],
      },
    });
  const template = (ctx: any) => rows(ctx, 'enemy_template').find((t: any) => t.id === 950n);

  it('at a non-safe place: family quest:<id> with one member and a Scarce pool there', () => {
    const ctx = poolCtx(questSeed());
    const templatesBefore = rows(ctx, 'enemy_template').length;
    const family = familyOfOne(ctx, template(ctx), ORCHARD_ID, T0);

    expect(family).toMatchObject({
      key: 'quest:950',
      name: 'Gloomfangs',
      singularNoun: 'gloomfang',
      pluralNoun: 'gloomfangs',
      temperament: 'aggressive',
      iconKey: 'beast',
      creatureType: 'beast',
    });
    expect(rows(ctx, 'enemy_template')).toHaveLength(templatesBefore);
    expect(rows(ctx, 'family_member').filter((m: any) => m.familyId === family.id)).toEqual([
      expect.objectContaining({ enemyTemplateId: 950n, role: 'damage', filler: false }),
    ]);
    expect(template(ctx).role).toBe('damage');
    const pools = poolsHere(ctx, ORCHARD_ID, 'creature').filter((p: any) => p.refId === family.id);
    expect(pools).toHaveLength(1);
    expect(pools[0]).toMatchObject({ homeLevel: 1n, count: 25n });
    expect(
      rows(ctx, 'location_enemy_template').some((l: any) => l.locationId === ORCHARD_ID && l.enemyTemplateId === 950n),
    ).toBe(true);
  });

  it('at a safe place: the pool goes to the lowest-id non-safe connected place', () => {
    const ctx = poolCtx(questSeed());
    const family = familyOfOne(ctx, template(ctx), MARKET_ID, T0);
    const pools = rows(ctx, 'place_pool').filter((p: any) => p.kind === 'creature' && p.refId === family.id);
    expect(pools.map((p: any) => p.locationId)).toEqual([ORCHARD_ID]);
  });

  it('with no non-safe place nearby: the family and no pool', () => {
    const ctx = poolCtx(questSeed());
    const family = familyOfOne(ctx, template(ctx), 6n, T0);
    expect(family.key).toBe('quest:950');
    expect(rows(ctx, 'place_pool').filter((p: any) => p.kind === 'creature')).toEqual([]);
  });

  it('is idempotent', () => {
    const ctx = poolCtx(questSeed());
    const first = familyOfOne(ctx, template(ctx), ORCHARD_ID, T0);
    const before = counts(ctx, [...FAMILY_TABLES, 'place_pool', 'pool_level']);
    const second = familyOfOne(ctx, template(ctx), ORCHARD_ID, T0);
    expect(second.id).toBe(first.id);
    expect(counts(ctx, [...FAMILY_TABLES, 'place_pool', 'pool_level'])).toEqual(before);
  });

  it('seeds the place first, so its ordinary families still get pools', () => {
    const seed = questSeed();
    seed.location_enemy_template = [
      { id: 60n, locationId: ORCHARD_ID, enemyTemplateId: 101n },
      { id: 61n, locationId: ORCHARD_ID, enemyTemplateId: 950n },
    ];
    const ctx = poolCtx(seed);
    const family = familyOfOne(ctx, template(ctx), ORCHARD_ID, T0);
    const refs = poolsHere(ctx, ORCHARD_ID, 'creature').map((p: any) => p.refId);
    expect(refs).toContain(GOBLINS_ID);
    expect(refs).toContain(family.id);
    expect(rows(ctx, 'family_member').filter((m: any) => m.enemyTemplateId === 950n)).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------
// Plan 09: region fill families by rule (D-20, D-25, D-26, D-61)
// ---------------------------------------------------------------------------

describe('ruleRelations (D-20 rule default)', () => {
  it('every ordered pair of distinct families is a rival, deduplicated', () => {
    expect(ruleRelations([1n, 2n, 2n, 3n])).toEqual([
      { familyId: 1n, otherFamilyId: 2n, kind: 'rival' },
      { familyId: 1n, otherFamilyId: 3n, kind: 'rival' },
      { familyId: 2n, otherFamilyId: 1n, kind: 'rival' },
      { familyId: 2n, otherFamilyId: 3n, kind: 'rival' },
      { familyId: 3n, otherFamilyId: 1n, kind: 'rival' },
      { familyId: 3n, otherFamilyId: 2n, kind: 'rival' },
    ]);
    expect(ruleRelations([4n])).toEqual([]);
    expect(ruleRelations([])).toEqual([]);
  });
});

describe('buildRegionFamilies (Plan 09)', () => {
  const NEW_REGION = 2n;
  const regionPlace = (id: bigint, name: string, terrainType: string, isSafe: boolean, isHub = false) => ({
    ...placeRow(id, name, terrainType, isSafe, isHub),
    regionId: NEW_REGION,
  });
  const fillSeed = () =>
    poolWorld({
      extra: {
        region: [
          { id: NEW_REGION, name: 'Mirefold', dangerMultiplier: 200n, regionType: 'generated', biome: 'swamp', landmarks: '[]', threats: '[]' },
        ],
        location: [
          regionPlace(20n, 'Reed Landing', 'town', true),
          regionPlace(21n, 'Sallow Wood', 'woods', false),
          regionPlace(22n, 'Black Fen', 'swamp', false),
          regionPlace(23n, 'Lantern Post', 'town', true, true),
          regionPlace(24n, 'Mist Edge', 'uncharted', true),
        ],
        enemy_template: [
          enemyTemplate(960n, 'Fen Stalker', 'melee', 'beast', { terrainTypes: 'woods, swamp' }),
          enemyTemplate(961n, 'Drowned Seer', 'caster', 'undead', { terrainTypes: 'swamp' }),
        ],
        item_template: [itemRow(370n, 'Wood'), itemRow(371n, 'Peat'), itemRow(372n, 'Scrap Cloth')],
      },
    });
  const regionRow = (ctx: any) => rows(ctx, 'region').find((r: any) => r.id === NEW_REGION);
  const places = (ctx: any) => rows(ctx, 'location').filter((l: any) => l.regionId === NEW_REGION);
  const templates = (ctx: any) => rows(ctx, 'enemy_template').filter((t: any) => t.id === 960n || t.id === 961n);
  const linksAt = (ctx: any, locationId: bigint) =>
    rows(ctx, 'location_enemy_template')
      .filter((l: any) => l.locationId === locationId)
      .map((l: any) => l.enemyTemplateId);

  it('builds one family per creature type, links by terrain fit, pairs rivals and seeds the pools', () => {
    const ctx = poolCtx(fillSeed());
    const families = buildRegionFamilies(ctx, regionRow(ctx), templates(ctx), places(ctx), T0);

    expect(families.map((f: any) => f.key)).toEqual(['2:beast', '2:undead']);
    const [beast, undead] = families;
    for (const family of families) {
      const members = rows(ctx, 'family_member').filter((m: any) => m.familyId === family.id);
      expect(members.map((m: any) => m.role).sort()).toEqual(['caster', 'damage', 'healer', 'tank']);
    }
    const beastMembers = rows(ctx, 'family_member').filter((m: any) => m.familyId === beast.id);
    expect(beastMembers.filter((m: any) => m.filler)).toHaveLength(3);
    expect(beastMembers.find((m: any) => !m.filler)).toMatchObject({ enemyTemplateId: 960n, role: 'tank' });

    // Beasts fit woods and swamp; the undead fit only the swamp. Safe places, hubs and uncharted get no link.
    for (const member of beastMembers) {
      expect(linksAt(ctx, 21n)).toContain(member.enemyTemplateId);
      expect(linksAt(ctx, 22n)).toContain(member.enemyTemplateId);
    }
    const undeadMembers = rows(ctx, 'family_member').filter((m: any) => m.familyId === undead.id);
    for (const member of undeadMembers) {
      expect(linksAt(ctx, 22n)).toContain(member.enemyTemplateId);
      expect(linksAt(ctx, 21n)).not.toContain(member.enemyTemplateId);
    }
    for (const id of [20n, 23n, 24n]) expect(linksAt(ctx, id)).toEqual([]);

    const relations = rows(ctx, 'family_relation')
      .filter((r: any) => r.familyId === beast.id || r.familyId === undead.id)
      .map((r: any) => [r.familyId, r.otherFamilyId, r.kind]);
    expect(relations).toEqual([
      [beast.id, undead.id, 'rival'],
      [undead.id, beast.id, 'rival'],
    ]);

    expect(poolsHere(ctx, 21n, 'creature').map((p: any) => p.refId)).toEqual([beast.id]);
    expect(poolsHere(ctx, 21n, 'creature')[0].homeLevel).toBe(2n);
    const fen = poolsHere(ctx, 22n, 'creature');
    expect(fen.map((p: any) => p.refId)).toEqual([beast.id, undead.id]);
    expect(fen.map((p: any) => Number(p.homeLevel))).toEqual(creatureHomeLevels(2, poolSeed(22n, NEW_REGION)));
    for (const id of [20n, 23n, 24n]) expect(poolsHere(ctx, id, 'creature')).toEqual([]);

    // Resource pools at every charted place (the safe landing and the hub included), never uncharted.
    for (const id of [20n, 21n, 22n, 23n]) expect(poolsHere(ctx, id, 'resource').length).toBeGreaterThan(0);
    expect(poolsHere(ctx, 24n, 'resource')).toEqual([]);
  });

  it('a family that fits no host place lives at every host place', () => {
    const seed = fillSeed();
    seed.enemy_template = seed.enemy_template!.map((t: any) => (t.id === 961n ? { ...t, terrainTypes: 'mountains' } : t));
    const ctx = poolCtx(seed);
    const [, undead] = buildRegionFamilies(ctx, regionRow(ctx), templates(ctx), places(ctx), T0);
    expect(poolsHere(ctx, 21n, 'creature').map((p: any) => p.refId)).toContain(undead.id);
    expect(poolsHere(ctx, 22n, 'creature').map((p: any) => p.refId)).toContain(undead.id);
  });

  it('no templates: resource pools only, no family', () => {
    const ctx = poolCtx(fillSeed());
    const familiesBefore = rows(ctx, 'creature_family').length;
    expect(buildRegionFamilies(ctx, regionRow(ctx), [], places(ctx), T0)).toEqual([]);
    expect(rows(ctx, 'creature_family')).toHaveLength(familiesBefore);
    expect(rows(ctx, 'place_pool').filter((p: any) => p.kind === 'creature')).toEqual([]);
    expect(poolsHere(ctx, 21n, 'resource').length).toBeGreaterThan(0);
  });

  it('a second run for the same region inserts nothing', () => {
    const ctx = poolCtx(fillSeed());
    buildRegionFamilies(ctx, regionRow(ctx), templates(ctx), places(ctx), T0);
    const tables = [...FAMILY_TABLES, 'place_pool', 'pool_level'];
    const before = counts(ctx, tables);
    buildRegionFamilies(ctx, regionRow(ctx), templates(ctx), places(ctx), T0);
    expect(counts(ctx, tables)).toEqual(before);
  });

  it('familyFitPlaces (reused by Plan 23): host places of a fitting terrain, else every host place', () => {
    const ctx = poolCtx(fillSeed());
    const all = places(ctx);
    expect(familyFitPlaces(['swamp'], all).map((p: any) => p.id)).toEqual([22n]);
    expect(familyFitPlaces(['mountains'], all).map((p: any) => p.id)).toEqual([21n, 22n]);
    expect(familyFitPlaces([], all).map((p: any) => p.id)).toEqual([21n, 22n]);
  });
});
