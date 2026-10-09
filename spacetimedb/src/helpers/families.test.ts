/**
 * Phase 51.3.1.1 Plan 07: the family and seeding layer (helpers/families.ts) on the shared pool world
 * (helpers/pool_fixture.ts), on a strict mock db whose accessors come from the recorded schema.
 */
import { describe, it, expect, vi, beforeAll } from 'vitest';
import { rowColumnProblems } from './schema_recorder';
import { enemyStatsForLevel } from '../data/enemy_rules';
import { memberAbilities } from '../data/family_rules';
import { REGION_ID, ORCHARD_ID, FLATS_ID, MARKET_ID, GOBLINS_ID, SKITTERERS_ID, poolWorld, poolCtx } from './pool_fixture';
import {
  createFamily,
  createRelations,
  familiesFromTemplates,
  isOrdinaryTemplate,
  linkFamilyToLocation,
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

// Keep the unused fixture ids referenced for later describe blocks.
void MARKET_ID;
