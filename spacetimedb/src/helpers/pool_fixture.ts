/**
 * TEST-ONLY. Never import this module from production code (anything the `spacetime build`
 * bundler can reach). It must not import vitest.
 *
 * The shared density-pool world of Phase 51.3.1.1 (Plan 06 and every later pool plan):
 *   - region 1 'Ashen Reach' (dangerMultiplier 300, so the place target is 3 plus the offset);
 *   - location 10 'Glass Orchard' (non-safe woods, placeNoun 'the orchard', levelOffset 1: target 4,
 *     band 3..5), location 11 'Mother Pan Flats' (non-safe swamp, offset 0: target 3) and location 1
 *     'Kestrel Market' (safe town, the hub); connections 1-10 and 10-11 both ways;
 *   - family 1 'Goblins' (aggressive humanoids; tank, damage, healer, caster: templates 101-104 at
 *     levels 3, 4, 5, 7, so at the orchard they read 3..5) and family 2 'Salt-Crust Skitterers'
 *     (skittish; damage, healer, caster: templates 201-203 at level 3); family 1 names family 2 its
 *     rival; family 2 fits swamp and woods, family 1 fits woods and plains;
 *   - resources: item 301 'Iron Ore' (economy_item kind metal) and item 302 'Wild Berries' (no
 *     economy_item row; the material name reads edible);
 *   - Alice (character 1, level 3, online, at 10, group 5 leader), Bob (character 2, level 6,
 *     online, following Alice, at 10 unless `bobLocationId` says otherwise) and Cara (character 3,
 *     offline, in the group, at 10).
 *
 * No pools are seeded here: `seedPools(ctx)` creates them through the real createPool.
 */
import { createMockCtx } from './test-utils';
import { T0, MODULE, ALICE, BOB } from './combat_fight_fixture';
import { memberAbilities } from '../data/family_rules';
import { createPool } from './pools';

export { T0, MODULE, ALICE, BOB };

/** Owns character 3 (userId 9n), offline. */
export const CARA = { toHexString: () => 'c'.repeat(64) };

export const REGION_ID = 1n;
export const ORCHARD_ID = 10n;
export const FLATS_ID = 11n;
export const MARKET_ID = 1n;
export const GOBLINS_ID = 1n;
export const SKITTERERS_ID = 2n;
export const IRON_ORE_ID = 301n;
export const BERRIES_ID = 302n;
export const GROUP_ID = 5n;

export type PoolWorldOptions = {
  /** Where Bob stands (default the orchard, with Alice). */
  bobLocationId?: bigint;
  /** Drop the Goblins-rival-Skitterers relation. */
  noRelations?: boolean;
  /** Extra rows, appended to (never replacing) the table rows built here. */
  extra?: Record<string, any[]>;
};

function characterRow(id: bigint, ownerUserId: bigint, name: string, level: bigint, locationId: bigint, online: boolean) {
  return {
    id,
    ownerUserId,
    name,
    race: 'Human',
    className: 'Warrior',
    level,
    xp: 0n,
    gold: 0n,
    locationId,
    boundLocationId: MARKET_ID,
    groupId: GROUP_ID,
    hp: 100n,
    maxHp: 100n,
    mana: 50n,
    maxMana: 50n,
    stamina: 50n,
    maxStamina: 50n,
    str: 10n,
    dex: 10n,
    cha: 10n,
    wis: 10n,
    int: 10n,
    hitChance: 0n,
    dodgeChance: 0n,
    parryChance: 0n,
    critMelee: 0n,
    critRanged: 0n,
    critDivine: 0n,
    critArcane: 0n,
    armorClass: 0n,
    perception: 0n,
    search: 0n,
    ccPower: 0n,
    vendorBuyMod: 0n,
    vendorSellMod: 0n,
    createdAt: { microsSinceUnixEpoch: T0 },
    combatTargetEnemyId: undefined,
    pendingLevels: 0n,
    online,
    lastOnlineAtMicros: 0n,
  };
}

function locationRow(
  id: bigint,
  name: string,
  terrainType: string,
  isSafe: boolean,
  levelOffset: bigint,
  placeNoun: string,
  isHub = false,
) {
  return {
    id,
    name,
    description: `${name}.`,
    zone: 'z',
    regionId: REGION_ID,
    levelOffset,
    isSafe,
    terrainType,
    bindStone: isHub,
    craftingAvailable: isHub,
    shortName: '',
    placeNoun,
    isHub,
  };
}

function templateRow(id: bigint, name: string, role: string, creatureType: string, level: bigint, terrainTypes: string) {
  return {
    id,
    name,
    role,
    roleDetail: '',
    abilityProfile: '',
    terrainTypes,
    creatureType,
    timeOfDay: 'any',
    socialGroup: '',
    socialRadius: 0n,
    awareness: 'normal',
    groupMin: 1n,
    groupMax: 1n,
    armorClass: 0n,
    level,
    maxHp: 40n + level * 10n,
    baseDamage: 5n + level,
    xpReward: 10n * level,
  };
}

function itemTemplateRow(id: bigint, name: string) {
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

const GOBLIN_MEMBERS: { id: bigint; name: string; role: string; level: bigint }[] = [
  { id: 101n, name: 'Goblin Brute', role: 'tank', level: 3n },
  { id: 102n, name: 'Goblin Cutter', role: 'damage', level: 4n },
  { id: 103n, name: 'Goblin Mender', role: 'healer', level: 5n },
  { id: 104n, name: 'Goblin Hexer', role: 'caster', level: 7n },
];

const SKITTERER_MEMBERS: { id: bigint; name: string; role: string; level: bigint }[] = [
  { id: 201n, name: 'Salt-Crust Skitterer', role: 'damage', level: 3n },
  { id: 202n, name: 'Skitterer Mender', role: 'healer', level: 3n },
  { id: 203n, name: 'Skitterer Hexer', role: 'caster', level: 3n },
];

export function poolWorld(opts: PoolWorldOptions = {}): Record<string, any[]> {
  const bobAt = opts.bobLocationId ?? ORCHARD_ID;
  const templates = [
    ...GOBLIN_MEMBERS.map((m) => templateRow(m.id, m.name, m.role, 'humanoid', m.level, 'woods,plains')),
    ...SKITTERER_MEMBERS.map((m) => templateRow(m.id, m.name, m.role, 'beast', m.level, 'swamp,woods')),
  ];
  let abilityId = 1n;
  const abilities: any[] = [];
  for (const m of [...GOBLIN_MEMBERS, ...SKITTERER_MEMBERS]) {
    for (const a of memberAbilities(m.role)) abilities.push({ id: abilityId++, enemyTemplateId: m.id, ...a });
  }
  let memberId = 1n;
  const members = [
    ...GOBLIN_MEMBERS.map((m) => ({ id: memberId++, familyId: GOBLINS_ID, enemyTemplateId: m.id, role: m.role, filler: false })),
    ...SKITTERER_MEMBERS.map((m) => ({ id: memberId++, familyId: SKITTERERS_ID, enemyTemplateId: m.id, role: m.role, filler: false })),
  ];

  const seed: Record<string, any[]> = {
    player: [
      { id: ALICE, userId: 7n, activeCharacterId: 1n },
      { id: BOB, userId: 8n, activeCharacterId: 2n },
      { id: CARA, userId: 9n, activeCharacterId: 3n },
    ],
    world_state: [{ id: 1n, startingLocationId: MARKET_ID, isNight: false, nextTransitionAtMicros: T0 + 3_600_000_000n }],
    region: [
      {
        id: REGION_ID,
        name: 'Ashen Reach',
        dangerMultiplier: 300n,
        regionType: 'wild',
        biome: 'forest',
        landmarks: '[]',
        threats: '[]',
      },
    ],
    location: [
      locationRow(MARKET_ID, 'Kestrel Market', 'town', true, 0n, '', true),
      locationRow(ORCHARD_ID, 'Glass Orchard', 'woods', false, 1n, 'the orchard'),
      locationRow(FLATS_ID, 'Mother Pan Flats', 'swamp', false, 0n, ''),
    ],
    location_connection: [
      { id: 1n, fromLocationId: MARKET_ID, toLocationId: ORCHARD_ID },
      { id: 2n, fromLocationId: ORCHARD_ID, toLocationId: MARKET_ID },
      { id: 3n, fromLocationId: ORCHARD_ID, toLocationId: FLATS_ID },
      { id: 4n, fromLocationId: FLATS_ID, toLocationId: ORCHARD_ID },
    ],
    enemy_template: templates,
    enemy_ability: abilities,
    creature_family: [
      {
        id: GOBLINS_ID,
        regionId: REGION_ID,
        key: '1:humanoid',
        name: 'Goblins',
        singularNoun: 'goblin',
        pluralNoun: 'goblins',
        temperament: 'aggressive',
        iconKey: 'humanoid',
        creatureType: 'humanoid',
        ambushVerb: 'charge',
        ambushRest: 'out of the trees',
        fitTerrains: 'woods,plains',
      },
      {
        id: SKITTERERS_ID,
        regionId: REGION_ID,
        key: '1:beast',
        name: 'Salt-Crust Skitterers',
        singularNoun: 'skitterer',
        pluralNoun: 'skitterers',
        temperament: 'skittish',
        iconKey: 'insect',
        creatureType: 'beast',
        ambushVerb: 'scuttle',
        ambushRest: 'out of the salt',
        fitTerrains: 'swamp,woods',
      },
    ],
    family_member: members,
    family_relation: opts.noRelations ? [] : [{ id: 1n, familyId: GOBLINS_ID, otherFamilyId: SKITTERERS_ID, kind: 'rival' }],
    item_template: [itemTemplateRow(IRON_ORE_ID, 'Iron Ore'), itemTemplateRow(BERRIES_ID, 'Wild Berries')],
    economy_item: [
      {
        itemTemplateId: IRON_ORE_ID,
        regionId: REGION_ID,
        role: 'gather',
        slotKey: 'gather:iron',
        kind: 'metal',
        rarity: 'common',
        terrain: 'woods',
        timeOfDay: 'any',
        enemyTemplateId: 0n,
        familyId: 0n,
      },
    ],
    character: [
      characterRow(1n, 7n, 'Aldric', 3n, ORCHARD_ID, true),
      characterRow(2n, 8n, 'Brienne', 6n, bobAt, true),
      characterRow(3n, 9n, 'Cara', 4n, ORCHARD_ID, false),
    ],
    group: [{ id: GROUP_ID, name: 'Wayfarers', leaderCharacterId: 1n, pullerCharacterId: 1n, createdAt: { microsSinceUnixEpoch: T0 } }],
    group_member: [
      { id: 1n, groupId: GROUP_ID, characterId: 1n, ownerUserId: 7n, role: 'leader', followLeader: false, joinedAt: { microsSinceUnixEpoch: T0 } },
      { id: 2n, groupId: GROUP_ID, characterId: 2n, ownerUserId: 8n, role: 'member', followLeader: true, joinedAt: { microsSinceUnixEpoch: T0 } },
      { id: 3n, groupId: GROUP_ID, characterId: 3n, ownerUserId: 9n, role: 'member', followLeader: true, joinedAt: { microsSinceUnixEpoch: T0 } },
    ],
  };

  for (const [table, rowsToAdd] of Object.entries(opts.extra ?? {})) {
    seed[table] = [...(seed[table] ?? []), ...rowsToAdd];
  }
  return seed;
}

/** A strict mock ctx over a pool world (import ../schema/tables under the recording mock first). */
export function poolCtx(seed: Record<string, any[]>, sender: any = MODULE, ts: bigint = T0): any {
  return createMockCtx({ strict: true, seed, sender, databaseIdentity: MODULE, timestampMicros: ts });
}

export type SeededPools = {
  /** Goblins at the orchard, home Stable (count 50). */
  goblinsOrchard: any;
  /** Skitterers at the flats, home Stable (count 50). */
  skitterersFlats: any;
  /** Iron Ore at the orchard, home Abundant (count 100). */
  ironOrchard: any;
  /** Wild Berries at the orchard, night only, home Plentiful (count 66). */
  berriesOrchard: any;
};

/** The standard pools, created through createPool at the ctx's timestamp. */
export function seedPools(ctx: any): SeededPools {
  const now: bigint = ctx.timestamp.microsSinceUnixEpoch;
  return {
    goblinsOrchard: createPool(
      ctx,
      { regionId: REGION_ID, locationId: ORCHARD_ID, kind: 'creature', refId: GOBLINS_ID, homeLevel: 2 },
      now,
    ),
    skitterersFlats: createPool(
      ctx,
      { regionId: REGION_ID, locationId: FLATS_ID, kind: 'creature', refId: SKITTERERS_ID, homeLevel: 2 },
      now,
    ),
    ironOrchard: createPool(
      ctx,
      { regionId: REGION_ID, locationId: ORCHARD_ID, kind: 'resource', refId: IRON_ORE_ID, homeLevel: 3 },
      now,
    ),
    berriesOrchard: createPool(
      ctx,
      { regionId: REGION_ID, locationId: ORCHARD_ID, kind: 'resource', refId: BERRIES_ID, homeLevel: 2, timeOfDay: 'night' },
      now,
    ),
  };
}
