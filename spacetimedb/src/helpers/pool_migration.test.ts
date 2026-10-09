/**
 * Phase 51.3.1.1 Plan 15: the migration of an existing (pre-phase) world to families and pools
 * (helpers/pool_migration.ts), on a strict mock db whose accessors come from the recorded schema.
 * The fixture is a world as it stands before this phase: enemy types linked to places, standing
 * enemy_spawn rows and personal resource_node rows, no families, no pools, no hubs.
 */
import { describe, it, expect, vi, beforeAll } from 'vitest';
import { createMockCtx } from './test-utils';
import { snapshotDb } from './schema_recorder';
import { MODULE, T0 } from './combat_fight_fixture';
import { ensurePoolsForLocation } from './families';
import {
  POOL_MIGRATION_VERSION,
  isInventedQuestKillTarget,
  markLegacyHub,
  migrateRegion,
  planMigrationStep,
  retireStandingState,
} from './pool_migration';
import { DENSITY_RULES } from '../data/density_rules';

vi.mock('spacetimedb/server', async () =>
  (await import('./schema_recorder')).createRecordingServerMock(),
);

beforeAll(async () => {
  await import('../schema/tables');
});

const rows = (ctx: any, table: string): any[] => ctx.db._tables[table] ?? [];
const ctxFor = (seed: Record<string, any[]>) =>
  createMockCtx({ strict: true, seed, sender: MODULE, databaseIdentity: MODULE, timestampMicros: T0 });

// Region 1 'Old Reach' (danger 300): a safe town (the lowest id, where world gen put the vendor and
// banker) and three non-safe places.
const REGION = 1n;
const TOWN = 1n;
const WOODS = 2n;
const SWAMP = 3n;
const CRYPT = 4n;

const SKITTERER = 11n; // beast melee (woods, swamp)
const ARCHER = 12n; // beast ranged (swamp)
const SEER = 13n; // undead caster (crypt)
const TYRANT = 14n; // boss (isBoss)
const GREYMAW = 15n; // a named enemy's template
const HORROR = 16n; // a boss_kill quest target
const LEECH = 17n; // an AI-invented kill target (terrainTypes any, socialGroup loner)
const LURKER = 18n; // a World event enemy (by name)

function regionRow(id: bigint, name: string, dangerMultiplier = 300n) {
  return { id, name, dangerMultiplier, regionType: 'wild', biome: 'forest', landmarks: '[]', threats: '[]' };
}

function placeRow(id: bigint, regionId: bigint, name: string, terrainType: string, isSafe: boolean, extra: Record<string, any> = {}) {
  return {
    id,
    name,
    description: `${name}.`,
    zone: 'z',
    regionId,
    levelOffset: 0n,
    isSafe,
    terrainType,
    bindStone: false,
    craftingAvailable: false,
    shortName: '',
    placeNoun: '',
    isHub: false,
    ...extra,
  };
}

function templateRow(id: bigint, name: string, role: string, creatureType: string, terrainTypes: string, extra: Record<string, any> = {}) {
  return {
    id,
    name,
    role,
    roleDetail: role,
    abilityProfile: role,
    terrainTypes,
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

function npcRow(id: bigint, name: string, npcType: string, locationId: bigint) {
  return { id, name, npcType, locationId, description: `${name}.`, greeting: 'Well met.', gender: 'male' };
}

function questRow(id: bigint, targetEnemyTemplateId: bigint, questType: string) {
  return {
    id,
    name: `Quest ${id}`,
    npcId: 1n,
    targetEnemyTemplateId,
    requiredCount: 3n,
    minLevel: 1n,
    maxLevel: 10n,
    rewardXp: 50n,
    questType,
  };
}

function spawnRow(id: bigint, locationId: bigint, enemyTemplateId: bigint, state: string, name = `Spawn ${id}`) {
  return { id, locationId, enemyTemplateId, name, state, lockedCombatId: state === 'engaged' ? 77n : undefined, groupCount: 1n, level: 3n };
}

function nodeRow(id: bigint, locationId: bigint, itemTemplateId: bigint, state: string, lockedByCharacterId?: bigint) {
  return {
    id,
    locationId,
    characterId: 1n,
    itemTemplateId,
    name: `Node ${id}`,
    timeOfDay: 'any',
    quantity: 3n,
    state,
    lockedByCharacterId,
    respawnAtMicros: undefined,
  };
}

let linkId = 1n;
const link = (locationId: bigint, enemyTemplateId: bigint) => ({ id: linkId++, locationId, enemyTemplateId });

/** The pre-phase world of region 1. */
function preWorld(): Record<string, any[]> {
  linkId = 1n;
  return {
    region: [regionRow(REGION, 'Old Reach')],
    location: [
      placeRow(TOWN, REGION, 'Kestrel Town', 'town', true, { craftingAvailable: true, bindStone: true }),
      placeRow(WOODS, REGION, 'Bramble Woods', 'woods', false),
      placeRow(SWAMP, REGION, 'Brine Swamp', 'swamp', false),
      placeRow(CRYPT, REGION, 'Drowned Crypt', 'dungeon', false),
    ],
    location_connection: [
      { id: 1n, fromLocationId: TOWN, toLocationId: WOODS },
      { id: 2n, fromLocationId: WOODS, toLocationId: TOWN },
      { id: 3n, fromLocationId: WOODS, toLocationId: SWAMP },
      { id: 4n, fromLocationId: SWAMP, toLocationId: WOODS },
      { id: 5n, fromLocationId: SWAMP, toLocationId: CRYPT },
      { id: 6n, fromLocationId: CRYPT, toLocationId: SWAMP },
    ],
    npc: [npcRow(1n, 'Marta Vell', 'vendor', TOWN), npcRow(2n, 'Oswin Trent', 'banker', TOWN), npcRow(3n, 'Old Pell', 'lore', TOWN)],
    enemy_template: [
      templateRow(SKITTERER, 'Skitterer', 'melee', 'beast', 'woods,swamp'),
      templateRow(ARCHER, 'Brine Archer', 'ranged', 'beast', 'swamp'),
      templateRow(SEER, 'Drowned Seer', 'caster', 'undead', 'dungeon'),
      templateRow(TYRANT, 'Crypt Tyrant', 'melee', 'undead', 'dungeon', { isBoss: true }),
      templateRow(GREYMAW, 'Old Greymaw', 'melee', 'beast', 'woods'),
      templateRow(HORROR, 'Bog Horror', 'melee', 'undead', 'swamp'),
      templateRow(LEECH, 'Mire Leech', 'melee', 'beast', 'any', { socialGroup: 'loner', groupMin: 1n, groupMax: 1n }),
      templateRow(LURKER, 'Bog Lurker', 'melee', 'beast', 'swamp'),
    ],
    location_enemy_template: [
      link(WOODS, SKITTERER),
      link(SWAMP, SKITTERER),
      link(SWAMP, ARCHER),
      link(CRYPT, SEER),
      link(CRYPT, TYRANT),
      link(WOODS, GREYMAW),
      link(SWAMP, HORROR),
      link(SWAMP, LEECH),
      link(SWAMP, LURKER),
    ],
    named_enemy: [
      { id: 1n, characterId: 1n, name: 'Old Greymaw', enemyTemplateId: GREYMAW, locationId: WOODS, isAlive: true, respawnMinutes: 30n },
    ],
    quest_template: [questRow(1n, HORROR, 'boss_kill'), questRow(2n, LEECH, 'kill')],
    enemy_spawn: [
      spawnRow(1n, WOODS, SKITTERER, 'available'),
      spawnRow(2n, SWAMP, SKITTERER, 'available'),
      spawnRow(3n, SWAMP, ARCHER, 'available'),
      spawnRow(4n, CRYPT, SEER, 'available'),
      spawnRow(5n, SWAMP, ARCHER, 'engaged'),
      spawnRow(6n, SWAMP, LURKER, 'available', 'Bog Lurker (Event)'),
      spawnRow(7n, SWAMP, HORROR, 'available', 'Bog Horror'),
    ],
    enemy_spawn_member: [
      { id: 1n, spawnId: 1n, enemyTemplateId: SKITTERER, roleTemplateId: 0n },
      { id: 2n, spawnId: 1n, enemyTemplateId: SKITTERER, roleTemplateId: 0n },
      { id: 3n, spawnId: 2n, enemyTemplateId: SKITTERER, roleTemplateId: 0n },
      { id: 4n, spawnId: 3n, enemyTemplateId: ARCHER, roleTemplateId: 0n },
      { id: 5n, spawnId: 4n, enemyTemplateId: SEER, roleTemplateId: 0n },
      { id: 6n, spawnId: 5n, enemyTemplateId: ARCHER, roleTemplateId: 0n },
      { id: 7n, spawnId: 6n, enemyTemplateId: LURKER, roleTemplateId: 0n },
      { id: 8n, spawnId: 7n, enemyTemplateId: HORROR, roleTemplateId: 0n },
    ],
    event_spawn_enemy: [{ id: 1n, eventId: 9n, spawnId: 6n, locationId: SWAMP }],
    item_template: [itemRow(301n, 'Wood'), itemRow(302n, 'Peat'), itemRow(303n, 'Stone'), itemRow(304n, 'Scrap Cloth')],
    resource_node: [
      nodeRow(1n, WOODS, 301n, 'available'),
      nodeRow(2n, SWAMP, 302n, 'available'),
      nodeRow(3n, CRYPT, 303n, 'available'),
      nodeRow(4n, WOODS, 301n, 'harvesting', 1n),
    ],
  };
}

const familyByKey = (ctx: any, key: string) => rows(ctx, 'creature_family').find((f: any) => f.key === key);
const membersOf = (ctx: any, familyId: bigint) => rows(ctx, 'family_member').filter((m: any) => m.familyId === familyId);
const creaturePoolPlaces = (ctx: any, familyId: bigint) =>
  rows(ctx, 'place_pool')
    .filter((p: any) => p.kind === 'creature' && p.refId === familyId)
    .map((p: any) => p.locationId)
    .sort((a: bigint, b: bigint) => (a < b ? -1 : 1));
const templateById = (ctx: any, id: bigint) => rows(ctx, 'enemy_template').find((t: any) => t.id === id);
const placeById = (ctx: any, id: bigint) => rows(ctx, 'location').find((l: any) => l.id === id);

describe('POOL_MIGRATION_VERSION', () => {
  it('is the data version 1n (Plan 25 raises it with the economy step)', () => {
    expect(POOL_MIGRATION_VERSION).toBe(1n);
  });
});

describe('isInventedQuestKillTarget (D-54)', () => {
  it('a kill target with terrain any and socialGroup loner is one; a boss_kill target or an ordinary type is not', () => {
    const ctx = ctxFor(preWorld());
    expect(isInventedQuestKillTarget(ctx, templateById(ctx, LEECH))).toBe(true);
    expect(isInventedQuestKillTarget(ctx, templateById(ctx, HORROR))).toBe(false);
    expect(isInventedQuestKillTarget(ctx, templateById(ctx, SKITTERER))).toBe(false);
  });

  it('a loner with terrain any that no kill or kill_loot quest targets is not one', () => {
    const seed = preWorld();
    seed.quest_template = [questRow(1n, HORROR, 'boss_kill')];
    const ctx = ctxFor(seed);
    expect(isInventedQuestKillTarget(ctx, templateById(ctx, LEECH))).toBe(false);
  });

  it('kill_loot counts, and so does a quest with no questType (it reads kill)', () => {
    const seed = preWorld();
    seed.quest_template = [questRow(2n, LEECH, 'kill_loot')];
    expect(isInventedQuestKillTarget(ctxFor(seed), templateById(ctxFor(seed), LEECH))).toBe(true);
    const bare = preWorld();
    bare.quest_template = [{ ...questRow(2n, LEECH, 'kill'), questType: undefined }];
    const ctx = ctxFor(bare);
    expect(isInventedQuestKillTarget(ctx, templateById(ctx, LEECH))).toBe(true);
  });
});

describe('migrateRegion on a pre-phase region (D-25, D-26, D-53, D-54, D-01)', () => {
  it('groups today types into families by creature type with canonical roles and fillers', () => {
    const ctx = ctxFor(preWorld());
    migrateRegion(ctx, REGION, T0);

    const beast = familyByKey(ctx, '1:beast');
    expect(beast).toBeDefined();
    const beastMembers = membersOf(ctx, beast.id);
    expect(beastMembers.filter((m: any) => !m.filler).map((m: any) => [m.enemyTemplateId, m.role])).toEqual([
      [SKITTERER, 'tank'],
      [ARCHER, 'damage'],
    ]);
    expect(beastMembers.filter((m: any) => m.filler).map((m: any) => m.role).sort()).toEqual(['caster', 'healer']);
    expect(templateById(ctx, SKITTERER)).toMatchObject({ role: 'tank', roleDetail: 'tank', abilityProfile: 'tank' });
    expect(templateById(ctx, ARCHER)).toMatchObject({ role: 'damage' });

    const undead = familyByKey(ctx, '1:undead');
    expect(undead).toBeDefined();
    const undeadMembers = membersOf(ctx, undead.id);
    expect(undeadMembers.filter((m: any) => !m.filler).map((m: any) => [m.enemyTemplateId, m.role])).toEqual([[SEER, 'caster']]);
    expect(undeadMembers.filter((m: any) => m.filler).map((m: any) => m.role).sort()).toEqual(['damage', 'healer', 'tank']);
  });

  it('pools each family where its real members were linked (not by terrain), with rival relations', () => {
    const ctx = ctxFor(preWorld());
    migrateRegion(ctx, REGION, T0);
    const beast = familyByKey(ctx, '1:beast');
    const undead = familyByKey(ctx, '1:undead');
    expect(creaturePoolPlaces(ctx, beast.id)).toEqual([WOODS, SWAMP]);
    expect(creaturePoolPlaces(ctx, undead.id)).toEqual([CRYPT]);
    const relations = rows(ctx, 'family_relation').map((r: any) => [r.familyId, r.otherFamilyId, r.kind]);
    expect(relations).toEqual(
      expect.arrayContaining([
        [beast.id, undead.id, 'rival'],
        [undead.id, beast.id, 'rival'],
      ]),
    );
    expect(relations).toHaveLength(2);
    // Every creature pool has its public level row.
    for (const pool of rows(ctx, 'place_pool')) {
      expect(rows(ctx, 'pool_level').some((l: any) => l.id === pool.id)).toBe(true);
    }
  });

  it('the invented kill target becomes a family of one with its own pool at its place', () => {
    const ctx = ctxFor(preWorld());
    migrateRegion(ctx, REGION, T0);
    const quest = familyByKey(ctx, `quest:${LEECH}`);
    expect(quest).toBeDefined();
    expect(membersOf(ctx, quest.id).map((m: any) => m.enemyTemplateId)).toEqual([LEECH]);
    expect(creaturePoolPlaces(ctx, quest.id)).toEqual([SWAMP]);
    // It is in no other family.
    expect(rows(ctx, 'family_member').filter((m: any) => m.enemyTemplateId === LEECH)).toHaveLength(1);
    // Quest families take no rule relations.
    expect(rows(ctx, 'family_relation').some((r: any) => r.familyId === quest.id || r.otherFamilyId === quest.id)).toBe(false);
  });

  it('boss, named, boss_kill and World event templates are in no family and left as they were', () => {
    const seed = preWorld();
    const before = seed.enemy_template.filter((t: any) => [TYRANT, GREYMAW, HORROR, LURKER].includes(t.id)).map((t: any) => ({ ...t }));
    const ctx = ctxFor(seed);
    migrateRegion(ctx, REGION, T0);
    for (const id of [TYRANT, GREYMAW, HORROR, LURKER]) {
      expect(rows(ctx, 'family_member').some((m: any) => m.enemyTemplateId === id)).toBe(false);
    }
    expect(rows(ctx, 'enemy_template').filter((t: any) => [TYRANT, GREYMAW, HORROR, LURKER].includes(t.id))).toEqual(before);
  });

  it('resource pools at the town and at the three places', () => {
    const ctx = ctxFor(preWorld());
    migrateRegion(ctx, REGION, T0);
    const resourcePlaces = new Set(rows(ctx, 'place_pool').filter((p: any) => p.kind === 'resource').map((p: any) => p.locationId));
    expect([...resourcePlaces].sort()).toEqual([TOWN, WOODS, SWAMP, CRYPT]);
    // No creature pool at the town (safe, and now the hub).
    expect(rows(ctx, 'place_pool').some((p: any) => p.kind === 'creature' && p.locationId === TOWN)).toBe(false);
  });

  it('retires standing ordinary spawns and available nodes; event, engaged, boss_kill and harvesting rows stay', () => {
    const ctx = ctxFor(preWorld());
    migrateRegion(ctx, REGION, T0);
    expect(rows(ctx, 'enemy_spawn').map((s: any) => s.id).sort()).toEqual([5n, 6n, 7n]);
    expect(rows(ctx, 'enemy_spawn_member').map((m: any) => m.spawnId).sort()).toEqual([5n, 6n, 7n]);
    expect(rows(ctx, 'resource_node').map((n: any) => n.id)).toEqual([4n]);
    expect(rows(ctx, 'event_spawn_enemy')).toHaveLength(1);
  });

  it('the start location becomes the hub and keeps isSafe, its station, its bind stone and its NPCs (D-61, D-63, D-64)', () => {
    const seed = preWorld();
    const npcsBefore = seed.npc.map((n: any) => ({ ...n }));
    const ctx = ctxFor(seed);
    migrateRegion(ctx, REGION, T0);
    expect(placeById(ctx, TOWN)).toMatchObject({ isHub: true, isSafe: true, craftingAvailable: true, bindStone: true });
    for (const id of [WOODS, SWAMP, CRYPT]) expect(placeById(ctx, id).isHub).toBe(false);
    expect(rows(ctx, 'npc')).toEqual(npcsBefore);
  });

  it('enqueues no LLM job (no paid call)', () => {
    const ctx = ctxFor(preWorld());
    migrateRegion(ctx, REGION, T0);
    expect(rows(ctx, 'llm_job')).toHaveLength(0);
  });

  it('a second run inserts, updates and deletes nothing', () => {
    const ctx = ctxFor(preWorld());
    migrateRegion(ctx, REGION, T0);
    const first = snapshotDb(ctx.db);
    migrateRegion(ctx, REGION, T0 + 5_000_000n);
    expect(snapshotDb(ctx.db)).toBe(first);
  });

  it('a region with no ordinary templates still gets resource pools and no family', () => {
    const seed = preWorld();
    seed.location_enemy_template = [];
    seed.quest_template = [];
    const ctx = ctxFor(seed);
    migrateRegion(ctx, REGION, T0);
    expect(rows(ctx, 'creature_family')).toHaveLength(0);
    expect(rows(ctx, 'place_pool').filter((p: any) => p.kind === 'creature')).toHaveLength(0);
    expect(rows(ctx, 'place_pool').filter((p: any) => p.kind === 'resource').length).toBeGreaterThan(0);
  });

  it('only touches its own region', () => {
    const seed = preWorld();
    seed.region.push(regionRow(2n, 'Far Fen'));
    seed.location.push(placeRow(20n, 2n, 'Fen Camp', 'town', true), placeRow(21n, 2n, 'Fen Reeds', 'swamp', false));
    seed.npc.push(npcRow(20n, 'Hale Dunmore', 'vendor', 20n));
    seed.location_enemy_template.push(link(21n, ARCHER));
    seed.enemy_spawn.push(spawnRow(30n, 21n, ARCHER, 'available'));
    const ctx = ctxFor(seed);
    migrateRegion(ctx, REGION, T0);
    expect(rows(ctx, 'place_pool').some((p: any) => p.locationId === 20n || p.locationId === 21n)).toBe(false);
    expect(rows(ctx, 'enemy_spawn').some((s: any) => s.id === 30n)).toBe(true);
    expect(placeById(ctx, 20n).isHub).toBe(false);
  });

  it('a family that already exists from the lazy net gets its missing places and keeps its row', () => {
    const ctx = ctxFor(preWorld());
    // The arrival net already pooled the woods before the migration ran.
    ensurePoolsForLocation(ctx, WOODS);
    const beastBefore = familyByKey(ctx, '1:beast');
    const woodsPool = rows(ctx, 'place_pool').find((p: any) => p.kind === 'creature' && p.locationId === WOODS);
    migrateRegion(ctx, REGION, T0);
    const beastRows = rows(ctx, 'creature_family').filter((f: any) => f.key === '1:beast');
    expect(beastRows).toEqual([beastBefore]);
    expect(creaturePoolPlaces(ctx, beastBefore.id)).toEqual([WOODS, SWAMP]);
    expect(rows(ctx, 'place_pool').find((p: any) => p.id === woodsPool.id)).toEqual(woodsPool);
    expect(membersOf(ctx, beastBefore.id).some((m: any) => m.enemyTemplateId === ARCHER && m.role === 'damage')).toBe(true);
  });

  it('deletes an orphan creature pool (its family row is missing) and its level row', () => {
    const seed = preWorld();
    seed.place_pool = [
      {
        id: 900n,
        regionId: REGION,
        locationId: WOODS,
        kind: 'creature',
        refId: 999n,
        count: 50n,
        homeLevel: 2n,
        wipedAtMicros: 0n,
        lastSettledMicros: T0,
        dirty: false,
        timeOfDay: 'any',
      },
    ];
    seed.pool_level = [
      {
        id: 900n,
        regionId: REGION,
        locationId: WOODS,
        kind: 'creature',
        refId: 999n,
        level: 2n,
        lvLo: 3n,
        lvHi: 3n,
        name: 'Gone',
        iconKey: '',
        temperament: 'wary',
        singularNoun: 'gone',
        pluralNoun: 'gones',
        timeOfDay: 'any',
      },
    ];
    const ctx = ctxFor(seed);
    migrateRegion(ctx, REGION, T0);
    expect(rows(ctx, 'place_pool').some((p: any) => p.id === 900n)).toBe(false);
    expect(rows(ctx, 'pool_level').some((l: any) => l.id === 900n)).toBe(false);
  });
});

describe('markLegacyHub (D-61, D-63)', () => {
  it('a start location with no station becomes a hub and keeps craftingAvailable false', () => {
    const seed = preWorld();
    seed.region.push(regionRow(2n, 'Far Fen'));
    seed.location.push(placeRow(20n, 2n, 'Fen Camp', 'town', true), placeRow(21n, 2n, 'Fen Reeds', 'swamp', false));
    seed.npc.push(npcRow(20n, 'Hale Dunmore', 'banker', 20n));
    const ctx = ctxFor(seed);
    expect(markLegacyHub(ctx, 2n)).toBe(true);
    expect(placeById(ctx, 20n)).toMatchObject({ isHub: true, isSafe: true, craftingAvailable: false, bindStone: false });
    expect(placeById(ctx, 21n).isHub).toBe(false);
    // A rerun changes nothing.
    const snap = snapshotDb(ctx.db);
    expect(markLegacyHub(ctx, 2n)).toBe(false);
    expect(snapshotDb(ctx.db)).toBe(snap);
  });

  it('a region that already has a hub keeps exactly its hubs', () => {
    const seed = preWorld();
    seed.location = seed.location.map((l: any) => (l.id === WOODS ? { ...l, isHub: true, isSafe: true } : l));
    const ctx = ctxFor(seed);
    expect(markLegacyHub(ctx, REGION)).toBe(false);
    expect(rows(ctx, 'location').filter((l: any) => l.isHub).map((l: any) => l.id)).toEqual([WOODS]);
  });

  it('a start location with neither a vendor nor a banker gets no hub (a region rolled with none stays so)', () => {
    const seed = preWorld();
    seed.npc = [npcRow(3n, 'Old Pell', 'lore', TOWN), npcRow(4n, 'Marta Vell', 'vendor', WOODS)];
    const ctx = ctxFor(seed);
    expect(markLegacyHub(ctx, REGION)).toBe(false);
    expect(rows(ctx, 'location').some((l: any) => l.isHub)).toBe(false);
  });

  it('an uncharted lowest-id place is skipped: the lowest charted place is the start', () => {
    const seed = preWorld();
    seed.location = [placeRow(0n, REGION, 'Fog', 'uncharted', false), ...seed.location];
    const ctx = ctxFor(seed);
    expect(markLegacyHub(ctx, REGION)).toBe(true);
    expect(placeById(ctx, TOWN).isHub).toBe(true);
    expect(placeById(ctx, 0n).isHub).toBe(false);
  });
});

describe('retireStandingState (D-01, T-51.3.1.1-48)', () => {
  it('deletes only available unlinked ordinary spawns with their members, and available unlocked nodes', () => {
    const ctx = ctxFor(preWorld());
    const result = retireStandingState(ctx, [TOWN, WOODS, SWAMP, CRYPT]);
    expect(result).toEqual({ spawns: 4, members: 5, nodes: 3 });
    expect(rows(ctx, 'enemy_spawn').map((s: any) => s.id).sort()).toEqual([5n, 6n, 7n]);
    expect(rows(ctx, 'resource_node').map((n: any) => n.id)).toEqual([4n]);
  });

  it('an available node locked by a character stays', () => {
    const seed = preWorld();
    seed.resource_node = [nodeRow(1n, WOODS, 301n, 'available', 2n)];
    const ctx = ctxFor(seed);
    retireStandingState(ctx, [WOODS]);
    expect(rows(ctx, 'resource_node')).toHaveLength(1);
  });

  it('places outside the list are not touched', () => {
    const ctx = ctxFor(preWorld());
    retireStandingState(ctx, [CRYPT]);
    expect(rows(ctx, 'enemy_spawn').map((s: any) => s.id).sort()).toEqual([1n, 2n, 3n, 5n, 6n, 7n]);
    expect(rows(ctx, 'resource_node').map((n: any) => n.id).sort()).toEqual([1n, 2n, 4n]);
  });
});

describe('planMigrationStep (the cursor plan, planRestockBatch pattern)', () => {
  const twoRegions = () => {
    const seed = preWorld();
    // Inserted out of order: the plan sorts the region ids.
    seed.region = [regionRow(2n, 'Far Fen'), regionRow(REGION, 'Old Reach')];
    return seed;
  };

  it('below POOL_MIGRATION_VERSION: one region per run, continuing after MIGRATION_CONTINUE_MICROS', () => {
    const ctx = ctxFor(twoRegions());
    expect(planMigrationStep(ctx, { afterRegionId: 0n }, T0)).toEqual({
      migrating: true,
      batch: [1n],
      more: true,
      afterRegionId: 0n,
      nextAt: T0 + DENSITY_RULES.MIGRATION_CONTINUE_MICROS,
      nextAfterRegionId: 1n,
    });
  });

  it('the last region hands over to the normal cadence with the cursor reset', () => {
    const ctx = ctxFor(twoRegions());
    expect(planMigrationStep(ctx, { afterRegionId: 1n }, T0)).toEqual({
      migrating: true,
      batch: [2n],
      more: false,
      afterRegionId: 1n,
      nextAt: T0 + DENSITY_RULES.POOL_TICK_MICROS,
      nextAfterRegionId: 0n,
    });
  });

  it('a missing arg or cursor reads 0n', () => {
    const ctx = ctxFor(twoRegions());
    expect(planMigrationStep(ctx, undefined, T0).batch).toEqual([1n]);
    expect(planMigrationStep(ctx, {}, T0).batch).toEqual([1n]);
  });

  it('at POOL_MIGRATION_VERSION it does not migrate: the normal tick every POOL_TICK_MICROS, cursor 0n', () => {
    const seed = twoRegions();
    seed.pool_state = [{ id: 1n, version: POOL_MIGRATION_VERSION, lastHunterMicros: 0n, lastTrendMicros: 0n }];
    const ctx = ctxFor(seed);
    expect(planMigrationStep(ctx, { afterRegionId: 1n }, T0)).toEqual({
      migrating: false,
      batch: [],
      more: false,
      afterRegionId: 0n,
      nextAt: T0 + DENSITY_RULES.POOL_TICK_MICROS,
      nextAfterRegionId: 0n,
    });
  });
});
