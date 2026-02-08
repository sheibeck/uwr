import { schema, table, t, SenderError } from 'spacetimedb/server';
import { ScheduleAt, Timestamp } from 'spacetimedb';

const Player = table(
  { name: 'player', public: true },
  {
    id: t.identity().primaryKey(),
    createdAt: t.timestamp(),
    lastSeenAt: t.timestamp(),
    displayName: t.string().optional(),
    activeCharacterId: t.u64().optional(),
    userId: t.u64().optional(),
    sessionStartedAt: t.timestamp().optional(),
  }
);

const User = table(
  {
    name: 'user',
    public: true,
    indexes: [{ name: 'by_email', algorithm: 'btree', columns: ['email'] }],
  },
  {
    id: t.u64().primaryKey().autoInc(),
    email: t.string(),
    createdAt: t.timestamp(),
  }
);

const FriendRequest = table(
  {
    name: 'friend_request',
    indexes: [
      { name: 'by_from', algorithm: 'btree', columns: ['fromUserId'] },
      { name: 'by_to', algorithm: 'btree', columns: ['toUserId'] },
    ],
  },
  {
    id: t.u64().primaryKey().autoInc(),
    fromUserId: t.u64(),
    toUserId: t.u64(),
    createdAt: t.timestamp(),
  }
);

const Friend = table(
  {
    name: 'friend',
    indexes: [{ name: 'by_user', algorithm: 'btree', columns: ['userId'] }],
  },
  {
    id: t.u64().primaryKey().autoInc(),
    userId: t.u64(),
    friendUserId: t.u64(),
    createdAt: t.timestamp(),
  }
);

const WorldState = table(
  { name: 'world_state', public: true },
  {
    id: t.u64().primaryKey(),
    startingLocationId: t.u64(),
  }
);

const Region = table(
  { name: 'region', public: true },
  {
    id: t.u64().primaryKey().autoInc(),
    name: t.string(),
    dangerMultiplier: t.u64(),
  }
);

const Location = table(
  { name: 'location', public: true },
  {
    id: t.u64().primaryKey().autoInc(),
    name: t.string(),
    description: t.string(),
    zone: t.string(),
    regionId: t.u64(),
    levelOffset: t.i64(),
    isSafe: t.bool(),
  }
);

const LocationConnection = table(
  {
    name: 'location_connection',
    public: true,
    indexes: [
      { name: 'by_from', algorithm: 'btree', columns: ['fromLocationId'] },
      { name: 'by_to', algorithm: 'btree', columns: ['toLocationId'] },
    ],
  },
  {
    id: t.u64().primaryKey().autoInc(),
    fromLocationId: t.u64(),
    toLocationId: t.u64(),
  }
);

const Character = table(
  {
    name: 'character',
    public: true,
    indexes: [
      { name: 'by_owner_user', algorithm: 'btree', columns: ['ownerUserId'] },
      { name: 'by_location', algorithm: 'btree', columns: ['locationId'] },
    ],
  },
  {
    id: t.u64().primaryKey().autoInc(),
    ownerUserId: t.u64(),
    name: t.string(),
    race: t.string(),
    className: t.string(),
    level: t.u64(),
    xp: t.u64(),
    locationId: t.u64(),
    groupId: t.u64().optional(),
    hp: t.u64(),
    maxHp: t.u64(),
    mana: t.u64(),
    maxMana: t.u64(),
    str: t.u64(),
    dex: t.u64(),
    cha: t.u64(),
    wis: t.u64(),
    int: t.u64(),
    hitChance: t.u64(),
    dodgeChance: t.u64(),
    parryChance: t.u64(),
    critMelee: t.u64(),
    critRanged: t.u64(),
    critDivine: t.u64(),
    critArcane: t.u64(),
    armorClass: t.u64(),
    perception: t.u64(),
    search: t.u64(),
    ccPower: t.u64(),
    vendorBuyMod: t.u64(),
    vendorSellMod: t.u64(),
    createdAt: t.timestamp(),
    stamina: t.u64().default(0n),
    maxStamina: t.u64().default(0n),
  }
);

const ItemTemplate = table(
  { name: 'item_template', public: true },
  {
    id: t.u64().primaryKey().autoInc(),
    name: t.string(),
    slot: t.string(),
    armorType: t.string(),
    rarity: t.string(),
    requiredLevel: t.u64(),
    allowedClasses: t.string(),
    strBonus: t.u64(),
    dexBonus: t.u64(),
    chaBonus: t.u64(),
    wisBonus: t.u64(),
    intBonus: t.u64(),
    hpBonus: t.u64(),
    manaBonus: t.u64(),
    armorClassBonus: t.u64(),
    weaponBaseDamage: t.u64(),
    weaponDps: t.u64(),
  }
);

const ItemInstance = table(
  {
    name: 'item_instance',
    public: true,
    indexes: [{ name: 'by_owner', algorithm: 'btree', columns: ['ownerCharacterId'] }],
  },
  {
    id: t.u64().primaryKey().autoInc(),
    templateId: t.u64(),
    ownerCharacterId: t.u64(),
    equippedSlot: t.string().optional(),
  }
);

const HotbarSlot = table(
  {
    name: 'hotbar_slot',
    public: true,
    indexes: [{ name: 'by_character', algorithm: 'btree', columns: ['characterId'] }],
  },
  {
    id: t.u64().primaryKey().autoInc(),
    characterId: t.u64(),
    slot: t.u8(),
    abilityKey: t.string(),
    assignedAt: t.timestamp(),
  }
);

const Group = table(
  { name: 'group', public: true },
  {
    id: t.u64().primaryKey().autoInc(),
    name: t.string(),
    leaderCharacterId: t.u64(),
    createdAt: t.timestamp(),
  }
);

const GroupMember = table(
  {
    name: 'group_member',
    indexes: [
      { name: 'by_owner_user', algorithm: 'btree', columns: ['ownerUserId'] },
      { name: 'by_group', algorithm: 'btree', columns: ['groupId'] },
    ],
  },
  {
    id: t.u64().primaryKey().autoInc(),
    groupId: t.u64(),
    characterId: t.u64(),
    ownerUserId: t.u64(),
    role: t.string(),
    followLeader: t.bool(),
    joinedAt: t.timestamp(),
  }
);

const GroupInvite = table(
  {
    name: 'group_invite',
    indexes: [
      { name: 'by_to_character', algorithm: 'btree', columns: ['toCharacterId'] },
      { name: 'by_group', algorithm: 'btree', columns: ['groupId'] },
    ],
  },
  {
    id: t.u64().primaryKey().autoInc(),
    groupId: t.u64(),
    fromCharacterId: t.u64(),
    toCharacterId: t.u64(),
    createdAt: t.timestamp(),
  }
);

const EnemyTemplate = table(
  { name: 'enemy_template', public: true },
  {
    id: t.u64().primaryKey().autoInc(),
    name: t.string(),
    role: t.string(),
    roleDetail: t.string(),
    abilityProfile: t.string(),
    armorClass: t.u64(),
    level: t.u64(),
    maxHp: t.u64(),
    baseDamage: t.u64(),
    xpReward: t.u64(),
  }
);

const LocationEnemyTemplate = table(
  {
    name: 'location_enemy_template',
    indexes: [
      { name: 'by_location', algorithm: 'btree', columns: ['locationId'] },
    ],
  },
  {
    id: t.u64().primaryKey().autoInc(),
    locationId: t.u64(),
    enemyTemplateId: t.u64(),
  }
);

const EnemySpawn = table(
  {
    name: 'enemy_spawn',
    public: true,
    indexes: [
      { name: 'by_location', algorithm: 'btree', columns: ['locationId'] },
      { name: 'by_state', algorithm: 'btree', columns: ['state'] },
    ],
  },
  {
    id: t.u64().primaryKey().autoInc(),
    locationId: t.u64(),
    enemyTemplateId: t.u64(),
    name: t.string(),
    state: t.string(),
    lockedCombatId: t.u64().optional(),
  }
);

const CombatEncounter = table(
  {
    name: 'combat_encounter',
    public: true,
    indexes: [
      { name: 'by_location', algorithm: 'btree', columns: ['locationId'] },
      { name: 'by_group', algorithm: 'btree', columns: ['groupId'] },
    ],
  },
  {
    id: t.u64().primaryKey().autoInc(),
    locationId: t.u64(),
    groupId: t.u64().optional(),
    leaderCharacterId: t.u64().optional(),
    state: t.string(),
    roundNumber: t.u64(),
    roundEndsAt: t.timestamp(),
    createdAt: t.timestamp(),
  }
);

const CombatParticipant = table(
  {
    name: 'combat_participant',
    public: true,
    indexes: [
      { name: 'by_combat', algorithm: 'btree', columns: ['combatId'] },
      { name: 'by_character', algorithm: 'btree', columns: ['characterId'] },
    ],
  },
  {
    id: t.u64().primaryKey().autoInc(),
    combatId: t.u64(),
    characterId: t.u64(),
    status: t.string(),
    selectedAction: t.string().optional(),
  }
);

const CombatEnemy = table(
  {
    name: 'combat_enemy',
    public: true,
    indexes: [{ name: 'by_combat', algorithm: 'btree', columns: ['combatId'] }],
  },
  {
    id: t.u64().primaryKey().autoInc(),
    combatId: t.u64(),
    enemyTemplateId: t.u64(),
    currentHp: t.u64(),
    maxHp: t.u64(),
    attackDamage: t.u64(),
    armorClass: t.u64(),
    aggroTargetCharacterId: t.u64().optional(),
  }
);

const CharacterEffect = table(
  {
    name: 'character_effect',
    indexes: [{ name: 'by_character', algorithm: 'btree', columns: ['characterId'] }],
  },
  {
    id: t.u64().primaryKey().autoInc(),
    characterId: t.u64(),
    effectType: t.string(),
    magnitude: t.i64(),
    roundsRemaining: t.u64(),
  }
);

const CombatEnemyEffect = table(
  {
    name: 'combat_enemy_effect',
    indexes: [{ name: 'by_combat', algorithm: 'btree', columns: ['combatId'] }],
  },
  {
    id: t.u64().primaryKey().autoInc(),
    combatId: t.u64(),
    effectType: t.string(),
    magnitude: t.i64(),
    roundsRemaining: t.u64(),
  }
);

const CombatResult = table(
  {
    name: 'combat_result',
    indexes: [
      { name: 'by_owner_user', algorithm: 'btree', columns: ['ownerUserId'] },
      { name: 'by_group', algorithm: 'btree', columns: ['groupId'] },
    ],
  },
  {
    id: t.u64().primaryKey().autoInc(),
    ownerUserId: t.u64(),
    characterId: t.u64(),
    groupId: t.u64().optional(),
    combatId: t.u64(),
    summary: t.string(),
    createdAt: t.timestamp(),
  }
);

const AggroEntry = table(
  {
    name: 'aggro_entry',
    indexes: [{ name: 'by_combat', algorithm: 'btree', columns: ['combatId'] }],
  },
  {
    id: t.u64().primaryKey().autoInc(),
    combatId: t.u64(),
    characterId: t.u64(),
    value: t.u64(),
  }
);

const CombatRoundTick = table(
  {
    name: 'combat_round_tick',
    scheduled: 'resolve_round',
  },
  {
    scheduledId: t.u64().primaryKey().autoInc(),
    scheduledAt: t.scheduleAt(),
    combatId: t.u64(),
    roundNumber: t.u64(),
  }
);

const HealthRegenTick = table(
  {
    name: 'health_regen_tick',
    scheduled: 'regen_health',
  },
  {
    scheduledId: t.u64().primaryKey().autoInc(),
    scheduledAt: t.scheduleAt(),
  }
);

const Command = table(
  {
    name: 'command',
    public: true,
    indexes: [
      { name: 'by_owner_user', algorithm: 'btree', columns: ['ownerUserId'] },
      { name: 'by_character', algorithm: 'btree', columns: ['characterId'] },
    ],
  },
  {
    id: t.u64().primaryKey().autoInc(),
    ownerUserId: t.u64(),
    characterId: t.u64(),
    text: t.string(),
    status: t.string(),
    createdAt: t.timestamp(),
  }
);

const EventWorld = table(
  {
    name: 'event_world',
    public: true,
  },
  {
    id: t.u64().primaryKey().autoInc(),
    message: t.string(),
    kind: t.string(),
    createdAt: t.timestamp(),
  }
);

const EventLocation = table(
  {
    name: 'event_location',
    indexes: [{ name: 'by_location', algorithm: 'btree', columns: ['locationId'] }],
  },
  {
    id: t.u64().primaryKey().autoInc(),
    locationId: t.u64(),
    message: t.string(),
    kind: t.string(),
    excludeCharacterId: t.u64().optional(),
    createdAt: t.timestamp(),
  }
);

const EventPrivate = table(
  {
    name: 'event_private',
    indexes: [
      { name: 'by_owner_user', algorithm: 'btree', columns: ['ownerUserId'] },
      { name: 'by_character', algorithm: 'btree', columns: ['characterId'] },
    ],
  },
  {
    id: t.u64().primaryKey().autoInc(),
    ownerUserId: t.u64(),
    characterId: t.u64(),
    message: t.string(),
    kind: t.string(),
    createdAt: t.timestamp(),
  }
);

const EventGroup = table(
  {
    name: 'event_group',
    indexes: [
      { name: 'by_group', algorithm: 'btree', columns: ['groupId'] },
      { name: 'by_character', algorithm: 'btree', columns: ['characterId'] },
    ],
  },
  {
    id: t.u64().primaryKey().autoInc(),
    groupId: t.u64(),
    characterId: t.u64(),
    message: t.string(),
    kind: t.string(),
    createdAt: t.timestamp(),
  }
);

export const spacetimedb = schema(
  Player,
  User,
  FriendRequest,
  Friend,
  WorldState,
  Region,
  Location,
  LocationConnection,
  HotbarSlot,
  Character,
  ItemTemplate,
  ItemInstance,
  Group,
  GroupMember,
  GroupInvite,
  EnemyTemplate,
  LocationEnemyTemplate,
  EnemySpawn,
  CombatEncounter,
  CombatParticipant,
  CombatEnemy,
  CharacterEffect,
  CombatEnemyEffect,
  AggroEntry,
  CombatRoundTick,
  HealthRegenTick,
  CombatResult,
  Command,
  EventWorld,
  EventLocation,
  EventPrivate,
  EventGroup
);

function tableHasRows<T>(iter: IterableIterator<T>): boolean {
  for (const _row of iter) return true;
  return false;
}

function requirePlayerUserId(ctx: any): bigint {
  const player = ctx.db.player.id.find(ctx.sender);
  if (!player || player.userId == null) throw new SenderError('Login required');
  return player.userId;
}

function requireCharacterOwnedBy(ctx: any, characterId: bigint) {
  const character = ctx.db.character.id.find(characterId);
  if (!character) throw new SenderError('Character not found');
  const userId = requirePlayerUserId(ctx);
  if (character.ownerUserId !== userId) {
    throw new SenderError('Not your character');
  }
  return character;
}

function activeCombatIdForCharacter(ctx: any, characterId: bigint): bigint | null {
  for (const participant of ctx.db.combatParticipant.by_character.filter(characterId)) {
    const combat = ctx.db.combatEncounter.id.find(participant.combatId);
    if (combat && combat.state === 'active') return combat.id;
  }
  return null;
}

function appendWorldEvent(ctx: any, kind: string, message: string) {
  ctx.db.eventWorld.insert({
    id: 0n,
    kind,
    message,
    createdAt: ctx.timestamp,
  });
}

function appendLocationEvent(
  ctx: any,
  locationId: bigint,
  kind: string,
  message: string,
  excludeCharacterId?: bigint
) {
  ctx.db.eventLocation.insert({
    id: 0n,
    locationId,
    kind,
    message,
    excludeCharacterId,
    createdAt: ctx.timestamp,
  });
}

function appendPrivateEvent(
  ctx: any,
  characterId: bigint,
  ownerUserId: bigint,
  kind: string,
  message: string
) {
  ctx.db.eventPrivate.insert({
    id: 0n,
    ownerUserId,
    characterId,
    kind,
    message,
    createdAt: ctx.timestamp,
  });
}

function appendGroupEvent(
  ctx: any,
  groupId: bigint,
  characterId: bigint,
  kind: string,
  message: string
) {
  ctx.db.eventGroup.insert({
    id: 0n,
    groupId,
    characterId,
    kind,
    message,
    createdAt: ctx.timestamp,
  });
}

type StatKey = 'str' | 'dex' | 'cha' | 'wis' | 'int';

const CLASS_CONFIG: Record<string, { primary: StatKey; secondary?: StatKey }> = {
  bard: { primary: 'cha', secondary: 'int' },
  enchanter: { primary: 'cha' },
  cleric: { primary: 'wis' },
  warrior: { primary: 'str' },
  rogue: { primary: 'dex' },
  paladin: { primary: 'wis' },
  ranger: { primary: 'dex', secondary: 'wis' },
  necromancer: { primary: 'int' },
  spellblade: { primary: 'int', secondary: 'str' },
  shaman: { primary: 'wis' },
  beastmaster: { primary: 'str', secondary: 'dex' },
  monk: { primary: 'dex', secondary: 'str' },
  druid: { primary: 'wis' },
  reaver: { primary: 'str', secondary: 'int' },
  summoner: { primary: 'int' },
};

const BASE_STAT = 8n;
const PRIMARY_BONUS = 4n;
const SECONDARY_BONUS = 2n;
const PRIMARY_GROWTH = 3n;
const SECONDARY_GROWTH = 2n;
const OTHER_GROWTH = 1n;

const BASE_HP = 20n;
const BASE_MANA = 10n;

const EQUIPMENT_SLOTS = new Set([
  'head',
  'chest',
  'wrists',
  'hands',
  'belt',
  'legs',
  'boots',
  'earrings',
  'neck',
  'cloak',
  'mainHand',
  'offHand',
]);

const ARMOR_TYPES = ['cloth', 'leather', 'chain', 'plate'] as const;
const ARMOR_TYPES_WITH_NONE = ['none', ...ARMOR_TYPES] as const;

const CLASS_ARMOR: Record<string, string[]> = {
  bard: ['cloth'],
  enchanter: ['cloth'],
  cleric: ['cloth'],
  druid: ['cloth'],
  necromancer: ['cloth'],
  summoner: ['cloth'],
  rogue: ['leather', 'cloth'],
  monk: ['leather', 'cloth'],
  spellblade: ['leather', 'cloth'],
  reaver: ['leather', 'cloth'],
  beastmaster: ['leather', 'cloth'],
  ranger: ['chain', 'leather', 'cloth'],
  shaman: ['chain', 'leather', 'cloth'],
  warrior: ['plate', 'chain', 'leather', 'cloth'],
  paladin: ['plate', 'chain', 'leather', 'cloth'],
};

const BASE_ARMOR_CLASS: Record<string, bigint> = {
  cloth: 2n,
  leather: 4n,
  chain: 6n,
  plate: 8n,
};

const STARTER_ARMOR: Record<
  string,
  { chest: { name: string; ac: bigint }; legs: { name: string; ac: bigint }; boots: { name: string; ac: bigint } }
> = {
  cloth: {
    chest: { name: 'Apprentice Robe', ac: 3n },
    legs: { name: 'Apprentice Trousers', ac: 2n },
    boots: { name: 'Apprentice Boots', ac: 1n },
  },
  leather: {
    chest: { name: 'Scout Jerkin', ac: 4n },
    legs: { name: 'Scout Pants', ac: 3n },
    boots: { name: 'Scout Boots', ac: 2n },
  },
  chain: {
    chest: { name: 'Warden Hauberk', ac: 5n },
    legs: { name: 'Warden Greaves', ac: 4n },
    boots: { name: 'Warden Boots', ac: 3n },
  },
  plate: {
    chest: { name: 'Vanguard Cuirass', ac: 6n },
    legs: { name: 'Vanguard Greaves', ac: 5n },
    boots: { name: 'Vanguard Boots', ac: 4n },
  },
};

const STARTER_WEAPONS: Record<string, { name: string; slot: string }> = {
  warrior: { name: 'Training Sword', slot: 'mainHand' },
  paladin: { name: 'Training Mace', slot: 'mainHand' },
  cleric: { name: 'Training Mace', slot: 'mainHand' },
  shaman: { name: 'Training Staff', slot: 'mainHand' },
  druid: { name: 'Training Staff', slot: 'mainHand' },
  ranger: { name: 'Training Bow', slot: 'mainHand' },
  rogue: { name: 'Training Dagger', slot: 'mainHand' },
  monk: { name: 'Training Staff', slot: 'mainHand' },
  beastmaster: { name: 'Training Axe', slot: 'mainHand' },
  spellblade: { name: 'Training Blade', slot: 'mainHand' },
  reaver: { name: 'Training Blade', slot: 'mainHand' },
  bard: { name: 'Training Rapier', slot: 'mainHand' },
  enchanter: { name: 'Training Staff', slot: 'mainHand' },
  necromancer: { name: 'Training Staff', slot: 'mainHand' },
  summoner: { name: 'Training Staff', slot: 'mainHand' },
};

function normalizeClassName(className: string) {
  return className.trim().toLowerCase();
}

function getClassConfig(className: string) {
  return CLASS_CONFIG[normalizeClassName(className)] ?? { primary: 'str' };
}

function computeBaseStats(className: string, level: bigint) {
  const config = getClassConfig(className);
  const levelsToApply = level > 1n ? level - 1n : 0n;
  const base = {
    str: BASE_STAT,
    dex: BASE_STAT,
    cha: BASE_STAT,
    wis: BASE_STAT,
    int: BASE_STAT,
  };
  base[config.primary] += PRIMARY_BONUS;
  if (config.secondary) base[config.secondary] += SECONDARY_BONUS;

  const applyGrowth = (key: StatKey) => {
    let growth = OTHER_GROWTH;
    if (key === config.primary) growth = PRIMARY_GROWTH;
    else if (config.secondary && key === config.secondary) growth = SECONDARY_GROWTH;
    return base[key] + growth * levelsToApply;
  };

  return {
    str: applyGrowth('str'),
    dex: applyGrowth('dex'),
    cha: applyGrowth('cha'),
    wis: applyGrowth('wis'),
    int: applyGrowth('int'),
  };
}

function manaStatForClass(className: string, stats: Record<StatKey, bigint>) {
  const config = getClassConfig(className);
  if (!config.secondary) return stats[config.primary];
  return (stats[config.primary] * 70n + stats[config.secondary] * 30n) / 100n;
}

function getEquippedBonuses(ctx: any, characterId: bigint) {
  const bonuses = {
    str: 0n,
    dex: 0n,
    cha: 0n,
    wis: 0n,
    int: 0n,
    hpBonus: 0n,
    manaBonus: 0n,
    armorClassBonus: 0n,
  };
  for (const instance of ctx.db.itemInstance.by_owner.filter(characterId)) {
    if (!instance.equippedSlot) continue;
    const template = ctx.db.itemTemplate.id.find(instance.templateId);
    if (!template) continue;
    bonuses.str += template.strBonus;
    bonuses.dex += template.dexBonus;
    bonuses.cha += template.chaBonus;
    bonuses.wis += template.wisBonus;
    bonuses.int += template.intBonus;
    bonuses.hpBonus += template.hpBonus;
    bonuses.manaBonus += template.manaBonus;
    bonuses.armorClassBonus += template.armorClassBonus;
  }
  return bonuses;
}

function getEquippedWeaponStats(ctx: any, characterId: bigint) {
  for (const instance of ctx.db.itemInstance.by_owner.filter(characterId)) {
    if (instance.equippedSlot !== 'mainHand') continue;
    const template = ctx.db.itemTemplate.id.find(instance.templateId);
    if (!template) continue;
    return { baseDamage: template.weaponBaseDamage, dps: template.weaponDps };
  }
  return { baseDamage: 0n, dps: 0n };
}

const SHAMAN_ABILITIES = {
  shaman_spirit_bolt: { name: 'Spirit Bolt', level: 1n, power: 2n },
  shaman_totem_of_vigor: { name: 'Totem of Vigor', level: 2n, power: 2n },
  shaman_hex: { name: 'Hex', level: 3n, power: 4n },
  shaman_ancestral_ward: { name: 'Ancestral Ward', level: 4n, power: 3n },
  shaman_stormcall: { name: 'Stormcall', level: 5n, power: 6n },
} as const;

function abilityManaCost(level: bigint, power: bigint) {
  return 4n + level * 2n + power;
}

function abilityDamageFromWeapon(
  weaponDamage: bigint,
  percent: bigint,
  bonus: bigint
) {
  const scaled = (weaponDamage * percent) / 100n + bonus;
  return scaled > weaponDamage ? scaled : weaponDamage + bonus;
}

function sumCharacterEffect(ctx: any, characterId: bigint, effectType: string) {
  let total = 0n;
  for (const effect of ctx.db.characterEffect.by_character.filter(characterId)) {
    if (effect.effectType === effectType) total += BigInt(effect.magnitude);
  }
  return total;
}

function sumEnemyEffect(ctx: any, combatId: bigint, effectType: string) {
  let total = 0n;
  for (const effect of ctx.db.combatEnemyEffect.by_combat.filter(combatId)) {
    if (effect.effectType === effectType) total += BigInt(effect.magnitude);
  }
  return total;
}

function executeAbility(
  ctx: any,
  character: typeof Character.rowType,
  abilityKey: string,
  targetCharacterId?: bigint
) {
  const normalizedClass = normalizeClassName(character.className);
  if (normalizedClass !== 'shaman') {
    throw new SenderError('Ability not available');
  }

  const ability = SHAMAN_ABILITIES[abilityKey as keyof typeof SHAMAN_ABILITIES];
  if (!ability) throw new SenderError('Unknown ability');

  if (character.level < ability.level) throw new SenderError('Ability not unlocked');

  const manaCost = abilityManaCost(ability.level, ability.power);
  if (character.mana < manaCost) throw new SenderError('Not enough mana');

  const resolvedTargetId = targetCharacterId ?? character.id;
  let targetCharacter: typeof Character.rowType | null = null;
  if (resolvedTargetId) {
    targetCharacter = ctx.db.character.id.find(resolvedTargetId);
    if (!targetCharacter) throw new SenderError('Target not found');
    if (character.groupId) {
      if (targetCharacter.groupId !== character.groupId) {
        throw new SenderError('Target not in your group');
      }
    } else if (targetCharacter.id !== character.id) {
      throw new SenderError('Target must be yourself');
    }
  }

  ctx.db.character.id.update({ ...character, mana: character.mana - manaCost });

  const combatId = activeCombatIdForCharacter(ctx, character.id);
  const combat = combatId ? ctx.db.combatEncounter.id.find(combatId) : null;
  const enemy =
    combatId && combat
      ? [...ctx.db.combatEnemy.by_combat.filter(combatId)][0]
      : null;

  if (abilityKey === 'shaman_spirit_bolt') {
    if (!enemy || !combatId) throw new SenderError('No enemy in combat');
    const weapon = getEquippedWeaponStats(ctx, character.id);
    const weaponDamage = 5n + character.level + weapon.baseDamage + weapon.dps / 2n;
    const damage = abilityDamageFromWeapon(weaponDamage, 125n, 2n);
    const reduced = applyArmorMitigation(damage, enemy.armorClass);
    const nextHp = enemy.currentHp > reduced ? enemy.currentHp - reduced : 0n;
    ctx.db.combatEnemy.id.update({ ...enemy, currentHp: nextHp });
    for (const entry of ctx.db.aggroEntry.by_combat.filter(combatId)) {
      if (entry.characterId === character.id) {
        ctx.db.aggroEntry.id.update({ ...entry, value: entry.value + reduced });
        break;
      }
    }
    appendPrivateEvent(ctx, character.id, character.ownerUserId, 'ability', `Spirit Bolt hits for ${reduced}.`);
    return;
  }

  if (abilityKey === 'shaman_totem_of_vigor') {
    if (!targetCharacter) throw new SenderError('Target required');
    ctx.db.characterEffect.insert({
      id: 0n,
      characterId: targetCharacter.id,
      effectType: 'regen',
      magnitude: 5n,
      roundsRemaining: 3n,
    });
    appendPrivateEvent(
      ctx,
      character.id,
      character.ownerUserId,
      'ability',
      `Totem of Vigor empowers ${targetCharacter.name}.`
    );
    return;
  }

  if (abilityKey === 'shaman_hex') {
    if (!enemy || !combatId) throw new SenderError('No enemy in combat');
    const weapon = getEquippedWeaponStats(ctx, character.id);
    const weaponDamage = 5n + character.level + weapon.baseDamage + weapon.dps / 2n;
    const damage = abilityDamageFromWeapon(weaponDamage, 115n, 1n);
    const reduced = applyArmorMitigation(damage, enemy.armorClass);
    const nextHp = enemy.currentHp > reduced ? enemy.currentHp - reduced : 0n;
    ctx.db.combatEnemy.id.update({ ...enemy, currentHp: nextHp });
    ctx.db.combatEnemyEffect.insert({
      id: 0n,
      combatId,
      effectType: 'damage_down',
      magnitude: -2n,
      roundsRemaining: 3n,
    });
    for (const entry of ctx.db.aggroEntry.by_combat.filter(combatId)) {
      if (entry.characterId === character.id) {
        ctx.db.aggroEntry.id.update({ ...entry, value: entry.value + reduced });
        break;
      }
    }
    appendPrivateEvent(ctx, character.id, character.ownerUserId, 'ability', `Hex afflicts the enemy.`);
    return;
  }

  if (abilityKey === 'shaman_ancestral_ward') {
    if (!targetCharacter) throw new SenderError('Target required');
    ctx.db.characterEffect.insert({
      id: 0n,
      characterId: targetCharacter.id,
      effectType: 'ac_bonus',
      magnitude: 2n,
      roundsRemaining: 3n,
    });
    appendPrivateEvent(
      ctx,
      character.id,
      character.ownerUserId,
      'ability',
      `Ancestral Ward shields ${targetCharacter.name}.`
    );
    return;
  }

  if (abilityKey === 'shaman_stormcall') {
    if (!enemy || !combatId) throw new SenderError('No enemy in combat');
    const weapon = getEquippedWeaponStats(ctx, character.id);
    const weaponDamage = 5n + character.level + weapon.baseDamage + weapon.dps / 2n;
    const damage = abilityDamageFromWeapon(weaponDamage, 160n, 4n);
    const reduced = applyArmorMitigation(damage, enemy.armorClass);
    const nextHp = enemy.currentHp > reduced ? enemy.currentHp - reduced : 0n;
    ctx.db.combatEnemy.id.update({ ...enemy, currentHp: nextHp });
    for (const entry of ctx.db.aggroEntry.by_combat.filter(combatId)) {
      if (entry.characterId === character.id) {
        ctx.db.aggroEntry.id.update({ ...entry, value: entry.value + reduced });
        break;
      }
    }
    appendPrivateEvent(ctx, character.id, character.ownerUserId, 'ability', `Stormcall strikes for ${reduced}.`);
    return;
  }

  appendPrivateEvent(
    ctx,
    character.id,
    character.ownerUserId,
    'ability',
    `You use ${ability.name}.`
  );
}

function baseArmorForClass(className: string) {
  const normalized = normalizeClassName(className);
  const allowed = CLASS_ARMOR[normalized] ?? ['cloth'];
  const best = allowed[0] ?? 'cloth';
  return BASE_ARMOR_CLASS[best] ?? BASE_ARMOR_CLASS.cloth;
}

function recomputeCharacterDerived(ctx: any, character: typeof Character.rowType) {
  const gear = getEquippedBonuses(ctx, character.id);
  const totalStats = {
    str: character.str + gear.str,
    dex: character.dex + gear.dex,
    cha: character.cha + gear.cha,
    wis: character.wis + gear.wis,
    int: character.int + gear.int,
  };

  const manaStat = manaStatForClass(character.className, totalStats);
  const maxHp = BASE_HP + totalStats.str * 5n + gear.hpBonus;
  const maxMana = BASE_MANA + manaStat * 6n + gear.manaBonus;

  const hitChance = totalStats.dex * 15n;
  const dodgeChance = totalStats.dex * 12n;
  const parryChance = totalStats.dex * 10n;
  const critMelee = totalStats.dex * 12n;
  const critRanged = totalStats.dex * 12n;
  const critDivine = totalStats.wis * 12n;
  const critArcane = totalStats.int * 12n;
  const armorClass =
    baseArmorForClass(character.className) +
    gear.armorClassBonus +
    sumCharacterEffect(ctx, character.id, 'ac_bonus');
  const perception = totalStats.wis * 25n;
  const search = totalStats.int * 25n;
  const ccPower = totalStats.cha * 15n;
  const vendorBuyMod = totalStats.cha * 10n;
  const vendorSellMod = totalStats.cha * 8n;

  const updated = {
    ...character,
    maxHp,
    maxMana,
    hitChance,
    dodgeChance,
    parryChance,
    critMelee,
    critRanged,
    critDivine,
    critArcane,
    armorClass,
    perception,
    search,
    ccPower,
    vendorBuyMod,
    vendorSellMod,
  };

  const clampedHp = character.hp > maxHp ? maxHp : character.hp;
  const clampedMana = character.mana > maxMana ? maxMana : character.mana;
  ctx.db.character.id.update({
    ...updated,
    hp: clampedHp,
    mana: clampedMana,
  });
}

function isClassAllowed(allowedClasses: string, className: string) {
  if (!allowedClasses || allowedClasses.trim().length === 0) return true;
  const normalized = normalizeClassName(className);
  const allowed = allowedClasses
    .split(',')
    .map((entry) => normalizeClassName(entry))
    .filter((entry) => entry.length > 0);
  if (allowed.includes('any')) return true;
  return allowed.includes(normalized);
}

function normalizeArmorType(armorType: string) {
  return armorType.trim().toLowerCase();
}

function isArmorAllowedForClass(armorType: string, className: string) {
  const normalizedArmor = normalizeArmorType(armorType);
  if (normalizedArmor === 'none' || normalizedArmor.length === 0) return true;
  const allowed = CLASS_ARMOR[normalizeClassName(className)] ?? ['cloth'];
  return allowed.includes(normalizedArmor);
}

function findItemTemplateByName(ctx: any, name: string) {
  for (const row of ctx.db.itemTemplate.iter()) {
    if (row.name.toLowerCase() === name.toLowerCase()) return row;
  }
  return null;
}

function ensureStarterItemTemplates(ctx: any) {
  if (tableHasRows(ctx.db.itemTemplate.iter())) return;

  for (const [armorType, pieces] of Object.entries(STARTER_ARMOR)) {
    ctx.db.itemTemplate.insert({
      id: 0n,
      name: pieces.chest.name,
      slot: 'chest',
      armorType,
      rarity: 'common',
      requiredLevel: 1n,
      allowedClasses: 'any',
      strBonus: 0n,
      dexBonus: 0n,
      chaBonus: 0n,
      wisBonus: 0n,
      intBonus: 0n,
      hpBonus: 0n,
      manaBonus: 0n,
      armorClassBonus: pieces.chest.ac,
      weaponBaseDamage: 0n,
      weaponDps: 0n,
    });
    ctx.db.itemTemplate.insert({
      id: 0n,
      name: pieces.legs.name,
      slot: 'legs',
      armorType,
      rarity: 'common',
      requiredLevel: 1n,
      allowedClasses: 'any',
      strBonus: 0n,
      dexBonus: 0n,
      chaBonus: 0n,
      wisBonus: 0n,
      intBonus: 0n,
      hpBonus: 0n,
      manaBonus: 0n,
      armorClassBonus: pieces.legs.ac,
      weaponBaseDamage: 0n,
      weaponDps: 0n,
    });
    ctx.db.itemTemplate.insert({
      id: 0n,
      name: pieces.boots.name,
      slot: 'boots',
      armorType,
      rarity: 'common',
      requiredLevel: 1n,
      allowedClasses: 'any',
      strBonus: 0n,
      dexBonus: 0n,
      chaBonus: 0n,
      wisBonus: 0n,
      intBonus: 0n,
      hpBonus: 0n,
      manaBonus: 0n,
      armorClassBonus: pieces.boots.ac,
      weaponBaseDamage: 0n,
      weaponDps: 0n,
    });
  }

  const weaponTemplates: Record<string, { name: string; allowed: string }> = {
    'Training Sword': { name: 'Training Sword', allowed: 'warrior' },
    'Training Mace': { name: 'Training Mace', allowed: 'paladin,cleric' },
    'Training Staff': {
      name: 'Training Staff',
      allowed: 'enchanter,necromancer,summoner,druid,shaman,monk',
    },
    'Training Bow': { name: 'Training Bow', allowed: 'ranger' },
    'Training Dagger': { name: 'Training Dagger', allowed: 'rogue' },
    'Training Axe': { name: 'Training Axe', allowed: 'beastmaster' },
    'Training Blade': { name: 'Training Blade', allowed: 'spellblade,reaver' },
    'Training Rapier': { name: 'Training Rapier', allowed: 'bard' },
  };

  for (const weapon of Object.values(weaponTemplates)) {
    ctx.db.itemTemplate.insert({
      id: 0n,
      name: weapon.name,
      slot: 'mainHand',
      armorType: 'none',
      rarity: 'common',
      requiredLevel: 1n,
      allowedClasses: weapon.allowed,
      strBonus: 0n,
      dexBonus: 0n,
      chaBonus: 0n,
      wisBonus: 0n,
      intBonus: 0n,
      hpBonus: 0n,
      manaBonus: 0n,
      armorClassBonus: 0n,
      weaponBaseDamage: 4n,
      weaponDps: 6n,
    });
  }
}

function grantStarterItems(ctx: any, character: typeof Character.rowType) {
  ensureStarterItemTemplates(ctx);
  const armorType = CLASS_ARMOR[normalizeClassName(character.className)]?.[0] ?? 'cloth';
  const armorSet = STARTER_ARMOR[armorType] ?? STARTER_ARMOR.cloth;
  const weapon = STARTER_WEAPONS[normalizeClassName(character.className)] ?? {
    name: 'Training Staff',
    slot: 'mainHand',
  };

  const armorNames = [armorSet.chest.name, armorSet.legs.name, armorSet.boots.name];
  for (const name of armorNames) {
    const template = findItemTemplateByName(ctx, name);
    if (!template) continue;
    ctx.db.itemInstance.insert({
      id: 0n,
      templateId: template.id,
      ownerCharacterId: character.id,
      equippedSlot: undefined,
    });
  }

  const weaponTemplate = findItemTemplateByName(ctx, weapon.name);
  if (weaponTemplate) {
    ctx.db.itemInstance.insert({
      id: 0n,
      templateId: weaponTemplate.id,
      ownerCharacterId: character.id,
      equippedSlot: undefined,
    });
  }
}

const ENEMY_ROLE_CONFIG: Record<
  string,
  { hpPerLevel: bigint; damagePerLevel: bigint; baseHp: bigint; baseDamage: bigint }
> = {
  tank: { hpPerLevel: 26n, damagePerLevel: 5n, baseHp: 20n, baseDamage: 4n },
  healer: { hpPerLevel: 18n, damagePerLevel: 4n, baseHp: 16n, baseDamage: 3n },
  dps: { hpPerLevel: 20n, damagePerLevel: 6n, baseHp: 14n, baseDamage: 4n },
  support: { hpPerLevel: 16n, damagePerLevel: 4n, baseHp: 12n, baseDamage: 3n },
};

function getEnemyRole(role: string) {
  const key = role.trim().toLowerCase();
  return ENEMY_ROLE_CONFIG[key] ?? ENEMY_ROLE_CONFIG.dps;
}

function scaleByPercent(value: bigint, percent: bigint) {
  return (value * percent) / 100n;
}

function applyArmorMitigation(damage: bigint, armorClass: bigint) {
  const scaledArmor = armorClass * 5n;
  const mitigated = (damage * 100n) / (100n + scaledArmor);
  return mitigated > 0n ? mitigated : 1n;
}

function computeEnemyStats(
  template: typeof EnemyTemplate.rowType,
  participants: typeof Character.rowType[]
) {
  const role = getEnemyRole(template.role);
  const groupSize = participants.length;
  let totalLevel = 0n;
  for (const p of participants) totalLevel += p.level;
  const avgLevel = totalLevel / BigInt(groupSize);
  const effectiveLevel = template.level > avgLevel ? template.level : avgLevel;
  const baseHp = role.baseHp + role.hpPerLevel * effectiveLevel;
  const baseDamage = role.baseDamage + role.damagePerLevel * effectiveLevel;
  const baseArmorClass = template.armorClass + effectiveLevel;

  return {
    maxHp: baseHp,
    attackDamage: baseDamage,
    armorClass: baseArmorClass,
    avgLevel,
  };
}

function computeLocationTargetLevel(ctx: any, locationId: bigint, baseLevel: bigint) {
  const location = ctx.db.location.id.find(locationId);
  if (!location) return baseLevel;
  const region = ctx.db.region.id.find(location.regionId);
  const multiplier = region?.dangerMultiplier ?? 100n;
  const scaled = (baseLevel * multiplier) / 100n;
  const offset = location.levelOffset ?? 0n;
  const result = scaled + offset;
  return result > 1n ? result : 1n;
}

function connectLocations(ctx: any, fromId: bigint, toId: bigint) {
  ctx.db.locationConnection.insert({ id: 0n, fromLocationId: fromId, toLocationId: toId });
  ctx.db.locationConnection.insert({ id: 0n, fromLocationId: toId, toLocationId: fromId });
}

function areLocationsConnected(ctx: any, fromId: bigint, toId: bigint) {
  for (const row of ctx.db.locationConnection.by_from.filter(fromId)) {
    if (row.toLocationId === toId) return true;
  }
  return false;
}

function friendUserIds(ctx: any, userId: bigint): bigint[] {
  const ids: bigint[] = [];
  for (const row of ctx.db.friend.by_user.filter(userId)) {
    ids.push(row.friendUserId);
  }
  return ids;
}

function findCharacterByName(ctx: any, name: string) {
  let found: typeof Character.rowType | null = null;
  for (const row of ctx.db.character.iter()) {
    if (row.name.toLowerCase() === name.toLowerCase()) {
      if (found) throw new SenderError('Multiple characters share that name');
      found = row;
    }
  }
  return found;
}

function scheduleRound(ctx: any, combatId: bigint, roundNumber: bigint) {
  const nextAt = ctx.timestamp.microsSinceUnixEpoch + 10_000_000n;
  ctx.db.combatRoundTick.insert({
    scheduledId: 0n,
    scheduledAt: ScheduleAt.time(nextAt),
    combatId,
    roundNumber,
  });
  const combat = ctx.db.combatEncounter.id.find(combatId);
  if (combat) {
    ctx.db.combatEncounter.id.update({
      ...combat,
      roundEndsAt: new Timestamp(nextAt),
    });
  }
}

function ensureLocationEnemyTemplates(ctx: any) {
  for (const location of ctx.db.location.iter()) {
    let hasAny = false;
    for (const _row of ctx.db.locationEnemyTemplate.by_location.filter(location.id)) {
      hasAny = true;
      break;
    }
    if (hasAny) continue;
    for (const template of ctx.db.enemyTemplate.iter()) {
      ctx.db.locationEnemyTemplate.insert({
        id: 0n,
        locationId: location.id,
        enemyTemplateId: template.id,
      });
    }
  }
}

function spawnEnemy(ctx: any, locationId: bigint, targetLevel: bigint = 1n): typeof EnemySpawn.rowType {
  const templates = [...ctx.db.locationEnemyTemplate.by_location.filter(locationId)];
  if (templates.length === 0) throw new SenderError('No enemy templates for location');

  const candidates = templates
    .map((ref) => ctx.db.enemyTemplate.id.find(ref.enemyTemplateId))
    .filter(Boolean) as (typeof EnemyTemplate.rowType)[];
  if (candidates.length === 0) throw new SenderError('Enemy template missing');

  const adjustedTarget = computeLocationTargetLevel(ctx, locationId, targetLevel);
  let best = candidates[0];
  let bestDiff = best.level > adjustedTarget ? best.level - adjustedTarget : adjustedTarget - best.level;
  for (const candidate of candidates) {
    const diff =
      candidate.level > adjustedTarget
        ? candidate.level - adjustedTarget
        : adjustedTarget - candidate.level;
    if (diff < bestDiff) {
      best = candidate;
      bestDiff = diff;
    }
  }

  const spawn = ctx.db.enemySpawn.insert({
    id: 0n,
    locationId,
    enemyTemplateId: best.id,
    name: best.name,
    state: 'available',
    lockedCombatId: undefined,
  });

  ctx.db.enemySpawn.id.update({
    ...spawn,
    name: `${best.name} #${spawn.id}`,
  });
  return ctx.db.enemySpawn.id.find(spawn.id)!;
}

function ensureAvailableSpawn(
  ctx: any,
  locationId: bigint,
  targetLevel: bigint = 1n
): typeof EnemySpawn.rowType {
  let best: typeof EnemySpawn.rowType | null = null;
  let bestDiff: bigint | null = null;
  const adjustedTarget = computeLocationTargetLevel(ctx, locationId, targetLevel);
  for (const spawn of ctx.db.enemySpawn.by_location.filter(locationId)) {
    if (spawn.state !== 'available') continue;
    const template = ctx.db.enemyTemplate.id.find(spawn.enemyTemplateId);
    if (!template) continue;
    const diff =
      template.level > adjustedTarget
        ? template.level - adjustedTarget
        : adjustedTarget - template.level;
    if (!best || bestDiff === null || diff < bestDiff) {
      best = spawn;
      bestDiff = diff;
    }
  }
  if (best && bestDiff !== null && bestDiff <= 1n) return best;
  return spawnEnemy(ctx, locationId, targetLevel);
}

function ensureHealthRegenScheduled(ctx: any) {
  if (!tableHasRows(ctx.db.healthRegenTick.iter())) {
    ctx.db.healthRegenTick.insert({
      scheduledId: 0n,
      scheduledAt: ScheduleAt.time(ctx.timestamp.microsSinceUnixEpoch + 3_000_000n),
    });
  }
}

function ensureSpawnsForLocation(ctx: any, locationId: bigint) {
  const activeGroupKeys = new Set<string>();
  for (const player of ctx.db.player.iter()) {
    if (!player.activeCharacterId) continue;
    const character = ctx.db.character.id.find(player.activeCharacterId);
    if (!character || character.locationId !== locationId) continue;
    if (character.groupId) {
      activeGroupKeys.add(`g:${character.groupId.toString()}`);
    } else {
      activeGroupKeys.add(`solo:${character.id.toString()}`);
    }
  }
  const needed = activeGroupKeys.size;
  let available = 0;
  for (const row of ctx.db.enemySpawn.by_location.filter(locationId)) {
    if (row.state === 'available') available += 1;
  }
  while (available < needed) {
    spawnEnemy(ctx, locationId, 1n);
    available += 1;
  }
}

spacetimedb.view(
  { name: 'my_private_events', public: true },
  t.array(EventPrivate.rowType),
  (ctx) => {
    const player = ctx.db.player.id.find(ctx.sender);
    if (!player || player.userId == null) return [];
    return [...ctx.db.eventPrivate.by_owner_user.filter(player.userId)];
  }
);

spacetimedb.view({ name: 'my_player', public: true }, t.array(Player.rowType), (ctx) => {
  const player = ctx.db.player.id.find(ctx.sender);
  return player ? [player] : [];
});

spacetimedb.view(
  { name: 'my_friend_requests', public: true },
  t.array(FriendRequest.rowType),
  (ctx) => {
    const player = ctx.db.player.id.find(ctx.sender);
    if (!player || player.userId == null) return [];
    const incoming = [...ctx.db.friendRequest.by_to.filter(player.userId)];
    const outgoing = [...ctx.db.friendRequest.by_from.filter(player.userId)];
    return [...incoming, ...outgoing];
  }
);

spacetimedb.view({ name: 'my_friends', public: true }, t.array(Friend.rowType), (ctx) => {
  const player = ctx.db.player.id.find(ctx.sender);
  if (!player || player.userId == null) return [];
  return [...ctx.db.friend.by_user.filter(player.userId)];
});

spacetimedb.view(
  { name: 'my_group_invites', public: true },
  t.array(GroupInvite.rowType),
  (ctx) => {
    const player = ctx.db.player.id.find(ctx.sender);
    if (!player || player.userId == null) return [];
    const invites: typeof GroupInvite.rowType[] = [];
    for (const character of ctx.db.character.by_owner_user.filter(player.userId)) {
      for (const invite of ctx.db.groupInvite.by_to_character.filter(character.id)) {
        invites.push(invite);
      }
    }
    return invites;
  }
);

spacetimedb.view(
  { name: 'my_group_events', public: true },
  t.array(EventGroup.rowType),
  (ctx) => {
    const events: typeof EventGroup.rowType[] = [];
    const player = ctx.db.player.id.find(ctx.sender);
    if (!player || player.userId == null) return events;
    for (const member of ctx.db.groupMember.by_owner_user.filter(player.userId)) {
      for (const event of ctx.db.eventGroup.by_group.filter(member.groupId)) {
        events.push(event);
      }
    }
    return events;
  }
);

spacetimedb.view(
  { name: 'my_group_members', public: true },
  t.array(GroupMember.rowType),
  (ctx) => {
    const player = ctx.db.player.id.find(ctx.sender);
    if (!player || player.userId == null) return [];
    return [...ctx.db.groupMember.by_owner_user.filter(player.userId)];
  }
);

spacetimedb.view(
  { name: 'my_combat_results', public: true },
  t.array(CombatResult.rowType),
  (ctx) => {
    const player = ctx.db.player.id.find(ctx.sender);
    if (!player || player.userId == null) return [];
    return [...ctx.db.combatResult.by_owner_user.filter(player.userId)];
  }
);

spacetimedb.view(
  { name: 'my_location_events', public: true },
  t.array(EventLocation.rowType),
  (ctx) => {
    const player = ctx.db.player.id.find(ctx.sender);
    if (!player?.activeCharacterId) return [];
    const character = ctx.db.character.id.find(player.activeCharacterId);
    if (!character) return [];
    const events = [...ctx.db.eventLocation.by_location.filter(character.locationId)];
    return events.filter(
      (event) =>
        !event.excludeCharacterId || event.excludeCharacterId !== character.id
    );
  }
);

spacetimedb.init((ctx) => {
  if (!tableHasRows(ctx.db.location.iter())) {
    const starter = ctx.db.region.insert({
      id: 0n,
      name: 'Hollowmere Vale',
      dangerMultiplier: 100n,
    });
    const border = ctx.db.region.insert({
      id: 0n,
      name: 'Embermarch Fringe',
      dangerMultiplier: 160n,
    });

    const town = ctx.db.location.insert({
      id: 0n,
      name: 'Hollowmere',
      description: 'A misty river town with lantern-lit docks and a quiet market square.',
      zone: 'Starter',
      regionId: starter.id,
      levelOffset: 0n,
      isSafe: true,
    });
    const ashen = ctx.db.location.insert({
      id: 0n,
      name: 'Ashen Road',
      description: 'A cracked highway flanked by dead trees and drifting embers.',
      zone: 'Starter',
      regionId: starter.id,
      levelOffset: 1n,
      isSafe: false,
    });
    const fogroot = ctx.db.location.insert({
      id: 0n,
      name: 'Fogroot Crossing',
      description: 'Twisted roots and slick stones mark a shadowy crossing.',
      zone: 'Starter',
      regionId: starter.id,
      levelOffset: 2n,
      isSafe: false,
    });
    const gate = ctx.db.location.insert({
      id: 0n,
      name: 'Embermarch Gate',
      description: 'A scorched pass leading toward harsher lands.',
      zone: 'Border',
      regionId: border.id,
      levelOffset: 3n,
      isSafe: false,
    });
    const cinder = ctx.db.location.insert({
      id: 0n,
      name: 'Cinderwatch',
      description: 'Ash dunes and ember winds test the brave.',
      zone: 'Border',
      regionId: border.id,
      levelOffset: 5n,
      isSafe: false,
    });

    ctx.db.worldState.insert({ id: 1n, startingLocationId: town.id });

    connectLocations(ctx, town.id, ashen.id);
    connectLocations(ctx, ashen.id, fogroot.id);
    connectLocations(ctx, fogroot.id, gate.id);
    connectLocations(ctx, gate.id, cinder.id);
  }

  if (!tableHasRows(ctx.db.enemyTemplate.iter())) {
    ctx.db.enemyTemplate.insert({
      id: 0n,
      name: 'Bog Rat',
      role: 'tank',
      roleDetail: 'melee',
      abilityProfile: 'thick hide, taunt',
      armorClass: 12n,
      level: 1n,
      maxHp: 26n,
      baseDamage: 4n,
      xpReward: 12n,
    });
    ctx.db.enemyTemplate.insert({
      id: 0n,
      name: 'Ember Wisp',
      role: 'dps',
      roleDetail: 'magic',
      abilityProfile: 'fire bolts, ignite',
      armorClass: 8n,
      level: 2n,
      maxHp: 28n,
      baseDamage: 6n,
      xpReward: 20n,
    });
    ctx.db.enemyTemplate.insert({
      id: 0n,
      name: 'Bandit Archer',
      role: 'dps',
      roleDetail: 'ranged',
      abilityProfile: 'rapid shot, bleed',
      armorClass: 8n,
      level: 2n,
      maxHp: 24n,
      baseDamage: 7n,
      xpReward: 18n,
    });
    ctx.db.enemyTemplate.insert({
      id: 0n,
      name: 'Blight Stalker',
      role: 'dps',
      roleDetail: 'melee',
      abilityProfile: 'pounce, shred',
      armorClass: 9n,
      level: 3n,
      maxHp: 30n,
      baseDamage: 8n,
      xpReward: 24n,
    });
    ctx.db.enemyTemplate.insert({
      id: 0n,
      name: 'Grave Acolyte',
      role: 'healer',
      roleDetail: 'support',
      abilityProfile: 'mend, cleanse',
      armorClass: 9n,
      level: 2n,
      maxHp: 22n,
      baseDamage: 4n,
      xpReward: 18n,
    });
    ctx.db.enemyTemplate.insert({
      id: 0n,
      name: 'Hexbinder',
      role: 'support',
      roleDetail: 'control',
      abilityProfile: 'weaken, slow, snare',
      armorClass: 9n,
      level: 3n,
      maxHp: 26n,
      baseDamage: 5n,
      xpReward: 22n,
    });
  }

  ensureStarterItemTemplates(ctx);

  ensureLocationEnemyTemplates(ctx);

  const desired = 3;
  for (const location of ctx.db.location.iter()) {
    let count = 0;
    for (const _row of ctx.db.enemySpawn.by_location.filter(location.id)) {
      count += 1;
    }
    while (count < desired) {
      spawnEnemy(ctx, location.id, 1n);
      count += 1;
    }
  }

  ensureHealthRegenScheduled(ctx);
});

spacetimedb.clientConnected((ctx) => {
  const existing = ctx.db.player.id.find(ctx.sender);
  if (!existing) {
    ctx.db.player.insert({
      id: ctx.sender,
      createdAt: ctx.timestamp,
      lastSeenAt: ctx.timestamp,
      displayName: undefined,
      activeCharacterId: undefined,
      userId: undefined,
    });
  } else {
    ctx.db.player.id.update({ ...existing, lastSeenAt: ctx.timestamp });
  }
  ensureHealthRegenScheduled(ctx);
});

spacetimedb.clientDisconnected((_ctx) => {
  // Presence events are written here so others see logout.
  // Note: _ctx.sender is still available in disconnect.
  const ctx = _ctx as any;
  const player = ctx.db.player.id.find(ctx.sender);
  if (player) {
    ctx.db.player.id.update({ ...player, lastSeenAt: ctx.timestamp });
  }

  if (player && player.userId != null && player.activeCharacterId != null) {
    const character = ctx.db.character.id.find(player.activeCharacterId);
    if (character) {
      const friends = friendUserIds(ctx, player.userId);
      for (const friendId of friends) {
        appendPrivateEvent(
          ctx,
          character.id,
          friendId,
          'presence',
          `${character.name} went offline.`
        );
      }
    }
  }
});

spacetimedb.reducer('set_display_name', { name: t.string() }, (ctx, { name }) => {
  const player = ctx.db.player.id.find(ctx.sender);
  if (!player) throw new SenderError('Player not found');
  const trimmed = name.trim();
  if (trimmed.length < 2) throw new SenderError('Display name too short');
  ctx.db.player.id.update({ ...player, displayName: trimmed, lastSeenAt: ctx.timestamp });
});

spacetimedb.reducer('send_friend_request', { email: t.string() }, (ctx, { email }) => {
  const userId = requirePlayerUserId(ctx);
  const trimmed = email.trim().toLowerCase();
  if (!trimmed || !trimmed.includes('@')) throw new SenderError('Invalid email');
  const target = [...ctx.db.user.by_email.filter(trimmed)][0];
  if (!target) throw new SenderError('User not found');
  if (target.id === userId) throw new SenderError('Cannot friend yourself');

  for (const row of ctx.db.friend.by_user.filter(userId)) {
    if (row.friendUserId === target.id) return;
  }
  for (const row of ctx.db.friendRequest.by_from.filter(userId)) {
    if (row.toUserId === target.id) return;
  }

  ctx.db.friendRequest.insert({
    id: 0n,
    fromUserId: userId,
    toUserId: target.id,
    createdAt: ctx.timestamp,
  });
});

spacetimedb.reducer(
  'send_friend_request_to_character',
  { characterId: t.u64(), targetName: t.string() },
  (ctx, args) => {
    const requester = requireCharacterOwnedBy(ctx, args.characterId);
    const targetName = args.targetName.trim();
    if (!targetName) throw new SenderError('Target required');
    const target = findCharacterByName(ctx, targetName);
    if (!target) throw new SenderError('Target not found');
    if (target.ownerUserId === requester.ownerUserId) {
      throw new SenderError('Cannot friend yourself');
    }

    for (const row of ctx.db.friend.by_user.filter(requester.ownerUserId)) {
      if (row.friendUserId === target.ownerUserId) {
        appendPrivateEvent(
          ctx,
          requester.id,
          requester.ownerUserId,
          'friend',
          `You are already friends with ${target.name}.`
        );
        return;
      }
    }
    for (const row of ctx.db.friendRequest.by_from.filter(requester.ownerUserId)) {
      if (row.toUserId === target.ownerUserId) {
        appendPrivateEvent(
          ctx,
          requester.id,
          requester.ownerUserId,
          'friend',
          `You already sent a friend request to ${target.name}.`
        );
        return;
      }
    }

    ctx.db.friendRequest.insert({
      id: 0n,
      fromUserId: requester.ownerUserId,
      toUserId: target.ownerUserId,
      createdAt: ctx.timestamp,
    });

    appendPrivateEvent(
      ctx,
      requester.id,
      requester.ownerUserId,
      'friend',
      `You sent a friend request to ${target.name}.`
    );
    appendPrivateEvent(
      ctx,
      target.id,
      target.ownerUserId,
      'friend',
      `${requester.name} sent you a friend request.`
    );
  }
);

spacetimedb.reducer('accept_friend_request', { fromUserId: t.u64() }, (ctx, { fromUserId }) => {
  const userId = requirePlayerUserId(ctx);
  let requestId: bigint | null = null;
  for (const row of ctx.db.friendRequest.by_to.filter(userId)) {
    if (row.fromUserId === fromUserId) {
      requestId = row.id;
      break;
    }
  }
  if (requestId == null) throw new SenderError('Friend request not found');

  ctx.db.friendRequest.id.delete(requestId);

  ctx.db.friend.insert({
    id: 0n,
    userId,
    friendUserId: fromUserId,
    createdAt: ctx.timestamp,
  });
  ctx.db.friend.insert({
    id: 0n,
    userId: fromUserId,
    friendUserId: userId,
    createdAt: ctx.timestamp,
  });
});

spacetimedb.reducer('reject_friend_request', { fromUserId: t.u64() }, (ctx, { fromUserId }) => {
  const userId = requirePlayerUserId(ctx);
  for (const row of ctx.db.friendRequest.by_to.filter(userId)) {
    if (row.fromUserId === fromUserId) {
      ctx.db.friendRequest.id.delete(row.id);
      return;
    }
  }
});

spacetimedb.reducer('remove_friend', { friendUserId: t.u64() }, (ctx, { friendUserId }) => {
  const userId = requirePlayerUserId(ctx);
  for (const row of ctx.db.friend.by_user.filter(userId)) {
    if (row.friendUserId === friendUserId) {
      ctx.db.friend.id.delete(row.id);
      break;
    }
  }
  for (const row of ctx.db.friend.by_user.filter(friendUserId)) {
    if (row.friendUserId === userId) {
      ctx.db.friend.id.delete(row.id);
      break;
    }
  }
});

spacetimedb.reducer('login_email', { email: t.string() }, (ctx, { email }) => {
  const player = ctx.db.player.id.find(ctx.sender);
  if (!player) throw new SenderError('Player not found');
  const trimmed = email.trim().toLowerCase();
  if (!trimmed || !trimmed.includes('@')) throw new SenderError('Invalid email');

  const existing = [...ctx.db.user.by_email.filter(trimmed)][0];
  const user =
    existing ??
    ctx.db.user.insert({
      id: 0n,
      email: trimmed,
      createdAt: ctx.timestamp,
    });

  ctx.db.player.id.update({
    ...player,
    userId: user.id,
    sessionStartedAt: ctx.timestamp,
    lastSeenAt: ctx.timestamp,
  });
});

spacetimedb.reducer('logout', (ctx) => {
  const player = ctx.db.player.id.find(ctx.sender);
  if (!player) return;
  if (player.userId != null && player.activeCharacterId != null) {
    const character = ctx.db.character.id.find(player.activeCharacterId);
    if (character) {
      const friends = friendUserIds(ctx, player.userId);
      for (const friendId of friends) {
        appendPrivateEvent(
          ctx,
          character.id,
          friendId,
          'presence',
          `${character.name} went offline.`
        );
      }
    }
  }
  ctx.db.player.id.update({
    ...player,
    userId: undefined,
    activeCharacterId: undefined,
    sessionStartedAt: undefined,
    lastSeenAt: ctx.timestamp,
  });
});

spacetimedb.reducer('set_active_character', { characterId: t.u64() }, (ctx, { characterId }) => {
  const player = ctx.db.player.id.find(ctx.sender);
  if (!player) throw new SenderError('Player not found');
  const character = requireCharacterOwnedBy(ctx, characterId);
  const previousActiveId = player.activeCharacterId;
  if (previousActiveId && previousActiveId !== character.id) {
    const previous = ctx.db.character.id.find(previousActiveId);
    if (previous) {
      const userId = requirePlayerUserId(ctx);
      const friends = friendUserIds(ctx, userId);
      for (const friendId of friends) {
        appendPrivateEvent(
          ctx,
          previous.id,
          friendId,
          'presence',
          `${previous.name} went offline.`
        );
      }
    }
  }

  ctx.db.player.id.update({ ...player, activeCharacterId: character.id });

  const userId = requirePlayerUserId(ctx);
  appendPrivateEvent(ctx, character.id, userId, 'presence', 'You are online.');
  const friends = friendUserIds(ctx, userId);
  for (const friendId of friends) {
    appendPrivateEvent(
      ctx,
      character.id,
      friendId,
      'presence',
      `${character.name} is online.`
    );
  }

  appendLocationEvent(
    ctx,
    character.locationId,
    'system',
    `${character.name} steps into the area.`,
    character.id
  );
  ensureSpawnsForLocation(ctx, character.locationId);
});

spacetimedb.reducer(
  'create_character',
  { name: t.string(), race: t.string(), className: t.string() },
  (ctx, { name, race, className }) => {
    const trimmed = name.trim();
    if (trimmed.length < 2) throw new SenderError('Name too short');
    const userId = requirePlayerUserId(ctx);
    for (const row of ctx.db.character.iter()) {
      if (row.name.toLowerCase() === trimmed.toLowerCase()) {
        throw new SenderError('Character name already exists');
      }
    }

    const world = ctx.db.worldState.id.find(1n);
    if (!world) throw new SenderError('World not initialized');

    const baseStats = computeBaseStats(className, 1n);
    const manaStat = manaStatForClass(className, baseStats);
    const maxHp = BASE_HP + baseStats.str * 5n;
    const maxMana = BASE_MANA + manaStat * 6n;
    const armorClass = baseArmorForClass(className);
    const character = ctx.db.character.insert({
      id: 0n,
      ownerUserId: userId,
      name: trimmed,
      race: race.trim(),
      className: className.trim(),
      level: 1n,
      xp: 0n,
      locationId: world.startingLocationId,
      hp: maxHp,
      maxHp,
      mana: maxMana,
      maxMana,
      str: baseStats.str,
      dex: baseStats.dex,
      cha: baseStats.cha,
      wis: baseStats.wis,
      int: baseStats.int,
      hitChance: baseStats.dex * 15n,
      dodgeChance: baseStats.dex * 12n,
      parryChance: baseStats.dex * 10n,
      critMelee: baseStats.dex * 12n,
      critRanged: baseStats.dex * 12n,
      critDivine: baseStats.wis * 12n,
      critArcane: baseStats.int * 12n,
      armorClass,
      perception: baseStats.wis * 25n,
      search: baseStats.int * 25n,
      ccPower: baseStats.cha * 15n,
      vendorBuyMod: baseStats.cha * 10n,
      vendorSellMod: baseStats.cha * 8n,
      stamina: 20n,
      maxStamina: 20n,
      createdAt: ctx.timestamp,
    });

    grantStarterItems(ctx, character);

    appendPrivateEvent(ctx, character.id, userId, 'system', `${character.name} enters the world.`);
  }
);

spacetimedb.reducer('delete_character', { characterId: t.u64() }, (ctx, args) => {
  const character = requireCharacterOwnedBy(ctx, args.characterId);
  const characterId = character.id;

  for (const player of ctx.db.player.iter()) {
    if (player.activeCharacterId === characterId) {
      ctx.db.player.id.update({ ...player, activeCharacterId: undefined });
    }
  }

  if (character.groupId) {
    const groupId = character.groupId;
    const group = ctx.db.group.id.find(groupId);
    const wasLeader = group?.leaderCharacterId === characterId;

    for (const member of ctx.db.groupMember.by_group.filter(groupId)) {
      if (member.characterId === characterId) {
        ctx.db.groupMember.id.delete(member.id);
        break;
      }
    }

    appendGroupEvent(
      ctx,
      groupId,
      characterId,
      'group',
      `${character.name} was removed from the group.`
    );

    let newLeaderMember: typeof GroupMember.rowType | null = null;
    for (const member of ctx.db.groupMember.by_group.filter(groupId)) {
      if (!newLeaderMember) newLeaderMember = member;
    }

    if (!newLeaderMember) {
      for (const invite of ctx.db.groupInvite.by_group.filter(groupId)) {
        ctx.db.groupInvite.id.delete(invite.id);
      }
      ctx.db.group.id.delete(groupId);
    } else if (group && wasLeader) {
      const newLeaderCharacter = ctx.db.character.id.find(newLeaderMember.characterId);
      if (newLeaderCharacter) {
        ctx.db.group.id.update({ ...group, leaderCharacterId: newLeaderCharacter.id });
        ctx.db.groupMember.id.update({ ...newLeaderMember, role: 'leader' });
        appendGroupEvent(
          ctx,
          groupId,
          newLeaderCharacter.id,
          'group',
          `${newLeaderCharacter.name} is now the group leader.`
        );
      }
    }
  }

  for (const invite of ctx.db.groupInvite.iter()) {
    if (invite.fromCharacterId === characterId || invite.toCharacterId === characterId) {
      ctx.db.groupInvite.id.delete(invite.id);
    }
  }

  for (const row of ctx.db.eventGroup.by_character.filter(characterId)) {
    ctx.db.eventGroup.id.delete(row.id);
  }
  for (const row of ctx.db.eventPrivate.by_character.filter(characterId)) {
    ctx.db.eventPrivate.id.delete(row.id);
  }
  for (const row of ctx.db.command.by_character.filter(characterId)) {
    ctx.db.command.id.delete(row.id);
  }
  for (const row of ctx.db.hotbarSlot.by_character.filter(characterId)) {
    ctx.db.hotbarSlot.id.delete(row.id);
  }
  for (const row of ctx.db.characterEffect.by_character.filter(characterId)) {
    ctx.db.characterEffect.id.delete(row.id);
  }
  for (const row of ctx.db.itemInstance.by_owner.filter(characterId)) {
    ctx.db.itemInstance.id.delete(row.id);
  }

  const combatIds = new Set<bigint>();
  for (const participant of ctx.db.combatParticipant.by_character.filter(characterId)) {
    combatIds.add(participant.combatId);
    ctx.db.combatParticipant.id.delete(participant.id);
  }

  for (const combatId of combatIds) {
    for (const entry of ctx.db.aggroEntry.by_combat.filter(combatId)) {
      if (entry.characterId === characterId) {
        ctx.db.aggroEntry.id.delete(entry.id);
      }
    }
    const combat = ctx.db.combatEncounter.id.find(combatId);
    if (combat && combat.leaderCharacterId === characterId) {
      let replacement: typeof CombatParticipant.rowType | null = null;
      for (const participant of ctx.db.combatParticipant.by_combat.filter(combatId)) {
        if (!replacement) replacement = participant;
      }
      ctx.db.combatEncounter.id.update({
        ...combat,
        leaderCharacterId: replacement ? replacement.characterId : undefined,
      });
    }
  }

  for (const row of ctx.db.combatResult.by_owner_user.filter(character.ownerUserId)) {
    if (row.characterId === characterId) {
      ctx.db.combatResult.id.delete(row.id);
    }
  }

  ctx.db.character.id.delete(characterId);
});

spacetimedb.reducer(
  'create_item_template',
  {
    name: t.string(),
    slot: t.string(),
    armorType: t.string(),
    rarity: t.string(),
    requiredLevel: t.u64(),
    allowedClasses: t.string(),
    strBonus: t.u64(),
    dexBonus: t.u64(),
    chaBonus: t.u64(),
    wisBonus: t.u64(),
    intBonus: t.u64(),
    hpBonus: t.u64(),
    manaBonus: t.u64(),
    armorClassBonus: t.u64(),
    weaponBaseDamage: t.u64(),
    weaponDps: t.u64(),
  },
  (ctx, args) => {
    const slot = args.slot.trim();
    if (!EQUIPMENT_SLOTS.has(slot)) throw new SenderError('Invalid slot');
    const armorType = normalizeArmorType(args.armorType);
    if (!ARMOR_TYPES_WITH_NONE.includes(armorType as (typeof ARMOR_TYPES_WITH_NONE)[number])) {
      throw new SenderError('Invalid armor type');
    }
    ctx.db.itemTemplate.insert({
      id: 0n,
      name: args.name.trim(),
      slot,
      armorType,
      rarity: args.rarity.trim(),
      requiredLevel: args.requiredLevel,
      allowedClasses: args.allowedClasses.trim(),
      strBonus: args.strBonus,
      dexBonus: args.dexBonus,
      chaBonus: args.chaBonus,
      wisBonus: args.wisBonus,
      intBonus: args.intBonus,
      hpBonus: args.hpBonus,
      manaBonus: args.manaBonus,
      armorClassBonus: args.armorClassBonus,
      weaponBaseDamage: args.weaponBaseDamage,
      weaponDps: args.weaponDps,
    });
  }
);

spacetimedb.reducer('grant_item', { characterId: t.u64(), templateId: t.u64() }, (ctx, args) => {
  const character = requireCharacterOwnedBy(ctx, args.characterId);
  const template = ctx.db.itemTemplate.id.find(args.templateId);
  if (!template) throw new SenderError('Item template not found');
  ctx.db.itemInstance.insert({
    id: 0n,
    templateId: template.id,
    ownerCharacterId: character.id,
    equippedSlot: undefined,
  });
});

spacetimedb.reducer(
  'equip_item',
  { characterId: t.u64(), itemInstanceId: t.u64() },
  (ctx, args) => {
    const character = requireCharacterOwnedBy(ctx, args.characterId);
    const instance = ctx.db.itemInstance.id.find(args.itemInstanceId);
    if (!instance) throw new SenderError('Item not found');
    if (instance.ownerCharacterId !== character.id) {
      throw new SenderError('Item does not belong to you');
    }
    const template = ctx.db.itemTemplate.id.find(instance.templateId);
    if (!template) throw new SenderError('Item template missing');
    if (character.level < template.requiredLevel) throw new SenderError('Level too low');
    if (!isClassAllowed(template.allowedClasses, character.className)) {
      throw new SenderError('Class cannot use this item');
    }
    if (!isArmorAllowedForClass(template.armorType, character.className)) {
      throw new SenderError('Armor type not allowed for this class');
    }
    if (!EQUIPMENT_SLOTS.has(template.slot)) throw new SenderError('Invalid slot');

    for (const other of ctx.db.itemInstance.by_owner.filter(character.id)) {
      if (other.equippedSlot === template.slot) {
        ctx.db.itemInstance.id.update({ ...other, equippedSlot: undefined });
      }
    }
    ctx.db.itemInstance.id.update({ ...instance, equippedSlot: template.slot });
    recomputeCharacterDerived(ctx, character);
  }
);

spacetimedb.reducer(
  'unequip_item',
  { characterId: t.u64(), slot: t.string() },
  (ctx, args) => {
    const character = requireCharacterOwnedBy(ctx, args.characterId);
    const slot = args.slot.trim();
    for (const instance of ctx.db.itemInstance.by_owner.filter(character.id)) {
      if (instance.equippedSlot === slot) {
        ctx.db.itemInstance.id.update({ ...instance, equippedSlot: undefined });
        recomputeCharacterDerived(ctx, character);
        return;
      }
    }
  }
);

spacetimedb.reducer(
  'set_hotbar_slot',
  { characterId: t.u64(), slot: t.u8(), abilityKey: t.string() },
  (ctx, args) => {
    const character = requireCharacterOwnedBy(ctx, args.characterId);
    if (args.slot < 1 || args.slot > 10) throw new SenderError('Invalid hotbar slot');
    const existing = [...ctx.db.hotbarSlot.by_character.filter(character.id)].find(
      (row) => row.slot === args.slot
    );
    if (existing) {
      if (!args.abilityKey) {
        ctx.db.hotbarSlot.id.delete(existing.id);
        return;
      }
      ctx.db.hotbarSlot.id.update({
        ...existing,
        abilityKey: args.abilityKey.trim(),
        assignedAt: ctx.timestamp,
      });
      return;
    }
    if (!args.abilityKey) return;
    ctx.db.hotbarSlot.insert({
      id: 0n,
      characterId: character.id,
      slot: args.slot,
      abilityKey: args.abilityKey.trim(),
      assignedAt: ctx.timestamp,
    });
  }
);

spacetimedb.reducer(
  'use_ability',
  { characterId: t.u64(), abilityKey: t.string(), targetCharacterId: t.u64().optional() },
  (ctx, args) => {
    const character = requireCharacterOwnedBy(ctx, args.characterId);
    const abilityKey = args.abilityKey.trim();
    if (!abilityKey) throw new SenderError('Ability required');
    executeAbility(ctx, character, abilityKey, args.targetCharacterId);
  }
);

spacetimedb.reducer('move_character', { characterId: t.u64(), locationId: t.u64() }, (ctx, args) => {
  const character = requireCharacterOwnedBy(ctx, args.characterId);
  const location = ctx.db.location.id.find(args.locationId);
  if (!location) throw new SenderError('Location not found');
  if (character.locationId === location.id) return;
  if (!areLocationsConnected(ctx, character.locationId, location.id)) {
    throw new SenderError('Location not connected');
  }

  const originLocationId = character.locationId;
  const userId = requirePlayerUserId(ctx);

  const moveOne = (row: typeof Character.rowType) => {
    ctx.db.character.id.update({ ...row, locationId: location.id });
    appendPrivateEvent(
      ctx,
      row.id,
      row.ownerUserId,
      'move',
      `You travel to ${location.name}. ${location.description}`
    );
    appendLocationEvent(ctx, originLocationId, 'move', `${row.name} departs.`, row.id);
    appendLocationEvent(ctx, location.id, 'move', `${row.name} arrives.`, row.id);
    ensureSpawnsForLocation(ctx, location.id);
  };

  if (character.groupId) {
    const group = ctx.db.group.id.find(character.groupId);
    if (group && group.leaderCharacterId === character.id) {
      for (const member of ctx.db.groupMember.by_group.filter(group.id)) {
        if (!member.followLeader) continue;
        const memberCharacter = ctx.db.character.id.find(member.characterId);
        if (
          memberCharacter &&
          memberCharacter.locationId === originLocationId &&
          memberCharacter.locationId !== location.id
        ) {
          moveOne(memberCharacter);
        }
      }
      return;
    }
  }

  moveOne(character);
});

spacetimedb.reducer('submit_command', { characterId: t.u64(), text: t.string() }, (ctx, args) => {
  const character = requireCharacterOwnedBy(ctx, args.characterId);
  const trimmed = args.text.trim();
  if (!trimmed) throw new SenderError('Command is empty');

  if (trimmed.toLowerCase() === '/look' || trimmed.toLowerCase() === 'look') {
    const location = ctx.db.location.id.find(character.locationId);
    if (location) {
      appendPrivateEvent(
        ctx,
        character.id,
        requirePlayerUserId(ctx),
        'look',
        `${location.name}: ${location.description}`
      );
    }
    return;
  }

  ctx.db.command.insert({
    id: 0n,
    ownerUserId: requirePlayerUserId(ctx),
    characterId: character.id,
    text: trimmed,
    status: 'pending',
    createdAt: ctx.timestamp,
  });

  appendPrivateEvent(ctx, character.id, requirePlayerUserId(ctx), 'command', `> ${trimmed}`);
});

spacetimedb.reducer('say', { characterId: t.u64(), message: t.string() }, (ctx, args) => {
  const character = requireCharacterOwnedBy(ctx, args.characterId);
  const trimmed = args.message.trim();
  if (!trimmed) throw new SenderError('Message is empty');

  appendLocationEvent(
    ctx,
    character.locationId,
    'say',
    `${character.name} says, "${trimmed}"`
  );
});

spacetimedb.reducer(
  'whisper',
  { characterId: t.u64(), targetName: t.string(), message: t.string() },
  (ctx, args) => {
    const character = requireCharacterOwnedBy(ctx, args.characterId);
    const targetName = args.targetName.trim();
    const message = args.message.trim();
    if (!targetName) throw new SenderError('Target required');
    if (!message) throw new SenderError('Message is empty');

    let target: typeof Character.rowType | null = null;
    for (const row of ctx.db.character.iter()) {
      if (row.name.toLowerCase() === targetName.toLowerCase()) {
        if (target) throw new SenderError('Multiple characters share that name');
        target = row;
      }
    }
    if (!target) throw new SenderError('Target not found');

    const senderUserId = requirePlayerUserId(ctx);
    appendPrivateEvent(
      ctx,
      character.id,
      senderUserId,
      'whisper',
      `You whisper to ${target.name}: "${message}"`
    );
    appendPrivateEvent(
      ctx,
      target.id,
      target.ownerUserId,
      'whisper',
      `${character.name} whispers: "${message}"`
    );
  }
);

spacetimedb.reducer('start_combat', { characterId: t.u64(), enemySpawnId: t.u64() }, (ctx, args) => {
  const character = requireCharacterOwnedBy(ctx, args.characterId);
  const locationId = character.locationId;

  // Must be leader if in group
  let groupId: bigint | null = character.groupId ?? null;
  if (groupId) {
    const group = ctx.db.group.id.find(groupId);
    if (!group) throw new SenderError('Group not found');
    if (group.leaderCharacterId !== character.id) {
      throw new SenderError('Only the group leader can start combat');
    }
  }

  // Determine participants
  const participants: typeof Character.rowType[] = [];
  if (groupId) {
    for (const member of ctx.db.groupMember.by_group.filter(groupId)) {
      const memberChar = ctx.db.character.id.find(member.characterId);
      if (memberChar && memberChar.locationId === locationId) {
        participants.push(memberChar);
      }
    }
  } else {
    participants.push(character);
  }
  if (participants.length === 0) throw new SenderError('No participants available');
  for (const p of participants) {
    if (activeCombatIdForCharacter(ctx, p.id)) {
      throw new SenderError(`${p.name} is already in combat`);
    }
  }

  const spawn = ctx.db.enemySpawn.id.find(args.enemySpawnId);
  let desiredLevel = character.level;
  if (participants.length >= 4) desiredLevel = desiredLevel + 2n;
  else if (participants.length >= 2) desiredLevel = desiredLevel + 1n;
  const spawnToUse =
    spawn && spawn.locationId === locationId && spawn.state === 'available'
      ? spawn
      : ensureAvailableSpawn(ctx, locationId, desiredLevel);

  const template = ctx.db.enemyTemplate.id.find(spawnToUse.enemyTemplateId);
  if (!template) throw new SenderError('Enemy template missing');

  // Scale enemy
    const { maxHp, attackDamage, armorClass } = computeEnemyStats(template, participants);

  const combat = ctx.db.combatEncounter.insert({
    id: 0n,
    locationId,
    groupId: groupId ?? undefined,
    leaderCharacterId: groupId ? character.id : undefined,
    state: 'active',
    roundNumber: 1n,
    roundEndsAt: new Timestamp(ctx.timestamp.microsSinceUnixEpoch + 10_000_000n),
    createdAt: ctx.timestamp,
  });

  ctx.db.enemySpawn.id.update({
    ...spawnToUse,
    state: 'engaged',
    lockedCombatId: combat.id,
  });

    ctx.db.combatEnemy.insert({
      id: 0n,
      combatId: combat.id,
      enemyTemplateId: template.id,
      currentHp: maxHp,
      maxHp,
      attackDamage,
      armorClass,
      aggroTargetCharacterId: undefined,
    });

  for (const p of participants) {
    ctx.db.combatParticipant.insert({
      id: 0n,
      combatId: combat.id,
      characterId: p.id,
      status: 'active',
      selectedAction: undefined,
    });
    ctx.db.aggroEntry.insert({
      id: 0n,
      combatId: combat.id,
      characterId: p.id,
      value: 0n,
    });
  }

  for (const p of participants) {
    appendPrivateEvent(
      ctx,
      p.id,
      p.ownerUserId,
      'combat',
      `Combat begins against ${spawnToUse.name}.`
    );
  }

  scheduleRound(ctx, combat.id, 1n);
});

spacetimedb.reducer('create_group', { characterId: t.u64(), name: t.string() }, (ctx, args) => {
  const character = requireCharacterOwnedBy(ctx, args.characterId);
  if (character.groupId) throw new SenderError('Character already in a group');
  const trimmed = args.name.trim();
  if (trimmed.length < 2) throw new SenderError('Group name too short');

  const group = ctx.db.group.insert({
    id: 0n,
    name: trimmed,
    leaderCharacterId: character.id,
    createdAt: ctx.timestamp,
  });

  ctx.db.groupMember.insert({
    id: 0n,
    groupId: group.id,
    characterId: character.id,
    ownerUserId: requirePlayerUserId(ctx),
    role: 'leader',
    followLeader: true,
    joinedAt: ctx.timestamp,
  });

  ctx.db.character.id.update({ ...character, groupId: group.id });
  appendGroupEvent(ctx, group.id, character.id, 'group', `${character.name} formed a group.`);
});

spacetimedb.reducer('join_group', { characterId: t.u64(), groupId: t.u64() }, (ctx, args) => {
  const character = requireCharacterOwnedBy(ctx, args.characterId);
  if (character.groupId) throw new SenderError('Character already in a group');
  const group = ctx.db.group.id.find(args.groupId);
  if (!group) throw new SenderError('Group not found');

  ctx.db.groupMember.insert({
    id: 0n,
    groupId: group.id,
    characterId: character.id,
    ownerUserId: requirePlayerUserId(ctx),
    role: 'member',
    followLeader: true,
    joinedAt: ctx.timestamp,
  });

  ctx.db.character.id.update({ ...character, groupId: group.id });
  appendGroupEvent(ctx, group.id, character.id, 'group', `${character.name} joined the group.`);
});

spacetimedb.reducer('leave_group', { characterId: t.u64() }, (ctx, args) => {
  const character = requireCharacterOwnedBy(ctx, args.characterId);
  if (!character.groupId) throw new SenderError('Character not in a group');
  const groupId = character.groupId;
  const group = ctx.db.group.id.find(groupId);

  for (const member of ctx.db.groupMember.by_group.filter(groupId)) {
    if (member.characterId === character.id) {
      ctx.db.groupMember.id.delete(member.id);
      break;
    }
  }

  ctx.db.character.id.update({ ...character, groupId: undefined });
  appendGroupEvent(ctx, groupId, character.id, 'group', `${character.name} left the group.`);

  let newLeaderMember: typeof GroupMember.rowType | null = null;
  for (const member of ctx.db.groupMember.by_group.filter(groupId)) {
    if (!newLeaderMember) newLeaderMember = member;
  }

  if (!newLeaderMember) {
    for (const invite of ctx.db.groupInvite.by_group.filter(groupId)) {
      ctx.db.groupInvite.id.delete(invite.id);
    }
    ctx.db.group.id.delete(groupId);
    return;
  }

  if (group && group.leaderCharacterId === character.id) {
    const newLeaderCharacter = ctx.db.character.id.find(newLeaderMember.characterId);
    if (newLeaderCharacter) {
      ctx.db.group.id.update({ ...group, leaderCharacterId: newLeaderCharacter.id });
      ctx.db.groupMember.id.update({ ...newLeaderMember, role: 'leader' });
      appendGroupEvent(
        ctx,
        groupId,
        newLeaderCharacter.id,
        'group',
        `${newLeaderCharacter.name} is now the group leader.`
      );
    }
  }
});

spacetimedb.reducer(
  'set_follow_leader',
  { characterId: t.u64(), follow: t.bool() },
  (ctx, args) => {
    const character = requireCharacterOwnedBy(ctx, args.characterId);
    if (!character.groupId) throw new SenderError('Not in a group');
    for (const member of ctx.db.groupMember.by_group.filter(character.groupId)) {
      if (member.characterId === character.id) {
        ctx.db.groupMember.id.update({ ...member, followLeader: args.follow });
        return;
      }
    }
    throw new SenderError('Group membership not found');
  }
);

spacetimedb.reducer(
  'promote_group_leader',
  { characterId: t.u64(), targetName: t.string() },
  (ctx, args) => {
    const leader = requireCharacterOwnedBy(ctx, args.characterId);
    if (!leader.groupId) throw new SenderError('Not in a group');
    const group = ctx.db.group.id.find(leader.groupId);
    if (!group) throw new SenderError('Group not found');
    if (group.leaderCharacterId !== leader.id) throw new SenderError('Only leader can promote');

    const target = findCharacterByName(ctx, args.targetName.trim());
    if (!target) throw new SenderError('Target not found');
    if (target.groupId !== leader.groupId) throw new SenderError('Target not in your group');

    ctx.db.group.id.update({ ...group, leaderCharacterId: target.id });

    for (const member of ctx.db.groupMember.by_group.filter(group.id)) {
      if (member.characterId === leader.id) {
        ctx.db.groupMember.id.update({ ...member, role: 'member' });
      } else if (member.characterId === target.id) {
        ctx.db.groupMember.id.update({ ...member, role: 'leader' });
      }
    }

    appendGroupEvent(ctx, group.id, target.id, 'group', `${target.name} is now the group leader.`);
  }
);

spacetimedb.reducer(
  'kick_group_member',
  { characterId: t.u64(), targetName: t.string() },
  (ctx, args) => {
    const leader = requireCharacterOwnedBy(ctx, args.characterId);
    if (!leader.groupId) throw new SenderError('Not in a group');
    const group = ctx.db.group.id.find(leader.groupId);
    if (!group) throw new SenderError('Group not found');
    if (group.leaderCharacterId !== leader.id) throw new SenderError('Only leader can kick');

    const target = findCharacterByName(ctx, args.targetName.trim());
    if (!target) throw new SenderError('Target not found');
    if (target.groupId !== leader.groupId) throw new SenderError('Target not in your group');
    if (target.id === leader.id) throw new SenderError('Leader cannot kick themselves');

    for (const member of ctx.db.groupMember.by_group.filter(group.id)) {
      if (member.characterId === target.id) {
        ctx.db.groupMember.id.delete(member.id);
        break;
      }
    }

    ctx.db.character.id.update({ ...target, groupId: undefined });
    appendGroupEvent(ctx, group.id, target.id, 'group', `${target.name} was removed from the group.`);
    appendPrivateEvent(
      ctx,
      target.id,
      target.ownerUserId,
      'group',
      `You were removed from ${group.name}.`
    );

    let remaining = 0;
    for (const _row of ctx.db.groupMember.by_group.filter(group.id)) {
      remaining += 1;
      break;
    }
    if (remaining === 0) {
      for (const invite of ctx.db.groupInvite.by_group.filter(group.id)) {
        ctx.db.groupInvite.id.delete(invite.id);
      }
      ctx.db.group.id.delete(group.id);
    }
  }
);

spacetimedb.reducer(
  'invite_to_group',
  { characterId: t.u64(), targetName: t.string() },
  (ctx, args) => {
    const inviter = requireCharacterOwnedBy(ctx, args.characterId);
    const targetName = args.targetName.trim();
    if (!targetName) throw new SenderError('Target required');
    const target = findCharacterByName(ctx, targetName);
    if (!target) throw new SenderError('Target not found');
    if (target.id === inviter.id) throw new SenderError('Cannot invite yourself');
    if (inviter.groupId) {
      const group = ctx.db.group.id.find(inviter.groupId);
      if (!group) throw new SenderError('Group not found');
      if (group.leaderCharacterId !== inviter.id) {
        appendPrivateEvent(
          ctx,
          inviter.id,
          inviter.ownerUserId,
          'group',
          'Only the group leader can invite new members.'
        );
        return;
      }
    }

    if (target.groupId) {
      appendPrivateEvent(
        ctx,
        inviter.id,
        inviter.ownerUserId,
        'group',
        `${target.name} is already in a group.`
      );
      return;
    }

    let groupId = inviter.groupId;
    if (!groupId) {
      const group = ctx.db.group.insert({
        id: 0n,
        name: `${inviter.name}'s group`,
        leaderCharacterId: inviter.id,
        createdAt: ctx.timestamp,
      });
    ctx.db.groupMember.insert({
      id: 0n,
      groupId: group.id,
      characterId: inviter.id,
      ownerUserId: inviter.ownerUserId,
      role: 'leader',
      followLeader: true,
      joinedAt: ctx.timestamp,
    });
      ctx.db.character.id.update({ ...inviter, groupId: group.id });
      groupId = group.id;
      appendGroupEvent(ctx, groupId, inviter.id, 'group', `${inviter.name} formed a group.`);
    }

    for (const invite of ctx.db.groupInvite.by_to_character.filter(target.id)) {
      appendPrivateEvent(
        ctx,
        inviter.id,
        inviter.ownerUserId,
        'group',
        `${target.name} already has a pending invite.`
      );
      return;
    }

    ctx.db.groupInvite.insert({
      id: 0n,
      groupId,
      fromCharacterId: inviter.id,
      toCharacterId: target.id,
      createdAt: ctx.timestamp,
    });

    appendPrivateEvent(
      ctx,
      target.id,
      target.ownerUserId,
      'group',
      `${inviter.name} invited you to a group.`
    );
  }
);

spacetimedb.reducer(
  'accept_group_invite',
  { characterId: t.u64(), fromName: t.string() },
  (ctx, args) => {
    const character = requireCharacterOwnedBy(ctx, args.characterId);
    if (character.groupId) throw new SenderError('Character already in a group');
    const from = findCharacterByName(ctx, args.fromName.trim());
    if (!from) throw new SenderError('Inviter not found');

    let inviteRow: typeof GroupInvite.rowType | null = null;
    for (const invite of ctx.db.groupInvite.by_to_character.filter(character.id)) {
      if (invite.fromCharacterId === from.id) {
        inviteRow = invite;
        break;
      }
    }
    if (!inviteRow) throw new SenderError('Invite not found');

    const group = ctx.db.group.id.find(inviteRow.groupId);
    if (!group) throw new SenderError('Group not found');

    ctx.db.groupInvite.id.delete(inviteRow.id);
    ctx.db.groupMember.insert({
      id: 0n,
      groupId: group.id,
      characterId: character.id,
      ownerUserId: character.ownerUserId,
      role: 'member',
      followLeader: true,
      joinedAt: ctx.timestamp,
    });
    ctx.db.character.id.update({ ...character, groupId: group.id });
    appendGroupEvent(ctx, group.id, character.id, 'group', `${character.name} joined the group.`);
  }
);

spacetimedb.reducer(
  'reject_group_invite',
  { characterId: t.u64(), fromName: t.string() },
  (ctx, args) => {
    const character = requireCharacterOwnedBy(ctx, args.characterId);
    const from = findCharacterByName(ctx, args.fromName.trim());
    if (!from) throw new SenderError('Inviter not found');
    for (const invite of ctx.db.groupInvite.by_to_character.filter(character.id)) {
      if (invite.fromCharacterId === from.id) {
        ctx.db.groupInvite.id.delete(invite.id);
        appendPrivateEvent(
          ctx,
          from.id,
          from.ownerUserId,
          'group',
          `${character.name} declined your group invite.`
        );
        return;
      }
    }
  }
);
spacetimedb.reducer(
  'choose_action',
  { characterId: t.u64(), combatId: t.u64(), action: t.string() },
  (ctx, args) => {
    const character = requireCharacterOwnedBy(ctx, args.characterId);
    const combat = ctx.db.combatEncounter.id.find(args.combatId);
    if (!combat || combat.state !== 'active') throw new SenderError('Combat not active');

    for (const participant of ctx.db.combatParticipant.by_combat.filter(combat.id)) {
      if (participant.characterId !== character.id) continue;
      if (participant.status !== 'active') return;
      const action = args.action.toLowerCase();
      if (action === 'flee') {
        ctx.db.combatParticipant.id.update({
          ...participant,
          status: 'fled',
          selectedAction: 'flee',
        });
        appendPrivateEvent(
          ctx,
          character.id,
          character.ownerUserId,
          'combat',
          'You attempt to flee.'
        );
        return;
      }
      if (action === 'attack' || action === 'skip' || action.startsWith('ability:')) {
        ctx.db.combatParticipant.id.update({
          ...participant,
          selectedAction: action,
        });
        return;
      }
    }
  }
);

spacetimedb.reducer('dismiss_combat_results', { characterId: t.u64() }, (ctx, args) => {
  const character = requireCharacterOwnedBy(ctx, args.characterId);
  const groupId = character.groupId;
  if (groupId) {
    const group = ctx.db.group.id.find(groupId);
    if (!group) throw new SenderError('Group not found');
    if (group.leaderCharacterId !== character.id) {
      throw new SenderError('Only the leader can dismiss results');
    }
    for (const row of ctx.db.combatResult.by_group.filter(groupId)) {
      ctx.db.combatResult.id.delete(row.id);
    }
    return;
  }
  for (const row of ctx.db.combatResult.by_owner_user.filter(character.ownerUserId)) {
    ctx.db.combatResult.id.delete(row.id);
  }
});

const HP_REGEN_OUT = 1n;
const MANA_REGEN_OUT = 1n;
const STAMINA_REGEN_OUT = 1n;
const HP_REGEN_IN = 1n;
const MANA_REGEN_IN = 1n;
const STAMINA_REGEN_IN = 1n;
const REGEN_TICK_MICROS = 3_000_000n;

spacetimedb.reducer('regen_health', { arg: HealthRegenTick.rowType }, (ctx) => {
  const tickIndex = ctx.timestamp.microsSinceUnixEpoch / REGEN_TICK_MICROS;
  const halfTick = tickIndex % 2n === 0n;

  for (const character of ctx.db.character.iter()) {
    if (character.hp === 0n) continue;

    const inCombat = !!activeCombatIdForCharacter(ctx, character.id);
    if (inCombat && !halfTick) continue;

    const hpRegen = inCombat ? HP_REGEN_IN : HP_REGEN_OUT;
    const manaRegen = inCombat ? MANA_REGEN_IN : MANA_REGEN_OUT;
    const staminaRegen = inCombat ? STAMINA_REGEN_IN : STAMINA_REGEN_OUT;

    const nextHp =
      character.hp >= character.maxHp ? character.hp : character.hp + hpRegen;
    const nextMana =
      character.mana >= character.maxMana ? character.mana : character.mana + manaRegen;
    const nextStamina =
      character.stamina >= character.maxStamina
        ? character.stamina
        : character.stamina + staminaRegen;

    ctx.db.character.id.update({
      ...character,
      hp: nextHp > character.maxHp ? character.maxHp : nextHp,
      mana: nextMana > character.maxMana ? character.maxMana : nextMana,
      stamina: nextStamina > character.maxStamina ? character.maxStamina : nextStamina,
    });
  }
  ctx.db.healthRegenTick.insert({
    scheduledId: 0n,
    scheduledAt: ScheduleAt.time(ctx.timestamp.microsSinceUnixEpoch + REGEN_TICK_MICROS),
  });
});

spacetimedb.reducer('resolve_round', { arg: CombatRoundTick.rowType }, (ctx, { arg }) => {
  const combat = ctx.db.combatEncounter.id.find(arg.combatId);
  if (!combat || combat.state !== 'active') return;
  if (combat.roundNumber !== arg.roundNumber) return;

  const enemy = [...ctx.db.combatEnemy.by_combat.filter(combat.id)][0];
  if (!enemy) return;

  const participants = [...ctx.db.combatParticipant.by_combat.filter(combat.id)];
  for (const p of participants) {
    if (p.status !== 'active') continue;
    const character = ctx.db.character.id.find(p.characterId);
    if (character && character.hp === 0n) {
      ctx.db.combatParticipant.id.update({ ...p, status: 'dead' });
    }
  }
  const refreshedParticipants = [...ctx.db.combatParticipant.by_combat.filter(combat.id)];
  const activeParticipants = refreshedParticipants.filter((p) => p.status === 'active');

  for (const participant of activeParticipants) {
    const character = ctx.db.character.id.find(participant.characterId);
    if (!character) continue;
    const regen = sumCharacterEffect(ctx, character.id, 'regen');
    if (regen > 0n && character.hp > 0n) {
      const nextHp = character.hp + regen > character.maxHp ? character.maxHp : character.hp + regen;
      ctx.db.character.id.update({ ...character, hp: nextHp });
    }
  }

  for (const participant of activeParticipants) {
    const action = participant.selectedAction ?? 'skip';
    const character = ctx.db.character.id.find(participant.characterId);
    if (!character) continue;

    if (action === 'attack') {
      const weapon = getEquippedWeaponStats(ctx, character.id);
      const damage = 5n + character.level + weapon.baseDamage + (weapon.dps / 2n);
      const reducedDamage = applyArmorMitigation(damage, enemy.armorClass);
      const nextHp = enemy.currentHp > reducedDamage ? enemy.currentHp - reducedDamage : 0n;
      ctx.db.combatEnemy.id.update({ ...enemy, currentHp: nextHp });

      for (const entry of ctx.db.aggroEntry.by_combat.filter(combat.id)) {
        if (entry.characterId === character.id) {
          ctx.db.aggroEntry.id.update({ ...entry, value: entry.value + reducedDamage });
          break;
        }
      }
      appendPrivateEvent(
        ctx,
        character.id,
        character.ownerUserId,
        'combat',
        `You strike for ${reducedDamage} damage.`
      );
    } else if (action === 'skip') {
      for (const entry of ctx.db.aggroEntry.by_combat.filter(combat.id)) {
        if (entry.characterId === character.id) {
          const reduced = (entry.value * 7n) / 10n;
          ctx.db.aggroEntry.id.update({ ...entry, value: reduced });
          break;
        }
      }
      appendPrivateEvent(
        ctx,
        character.id,
        character.ownerUserId,
        'combat',
        'You hold your action.'
      );
    } else if (action.startsWith('ability:')) {
      const abilityKey = action.replace('ability:', '');
      executeAbility(ctx, character, abilityKey);
    }

    ctx.db.combatParticipant.id.update({ ...participant, selectedAction: undefined });
  }

  const participantIds = new Set(activeParticipants.map((p) => p.characterId));
  for (const effect of ctx.db.characterEffect.iter()) {
    if (!participantIds.has(effect.characterId)) continue;
    if (effect.roundsRemaining === 0n) {
      ctx.db.characterEffect.id.delete(effect.id);
    } else {
      ctx.db.characterEffect.id.update({
        ...effect,
        roundsRemaining: effect.roundsRemaining - 1n,
      });
    }
  }
  for (const effect of ctx.db.combatEnemyEffect.by_combat.filter(combat.id)) {
    if (effect.roundsRemaining === 0n) {
      ctx.db.combatEnemyEffect.id.delete(effect.id);
    } else {
      ctx.db.combatEnemyEffect.id.update({
        ...effect,
        roundsRemaining: effect.roundsRemaining - 1n,
      });
    }
  }

  const updatedEnemy = ctx.db.combatEnemy.id.find(enemy.id)!;
  if (updatedEnemy.currentHp === 0n) {
    const enemyName =
      [...ctx.db.enemySpawn.by_location.filter(combat.locationId)].find(
        (s) => s.lockedCombatId === combat.id
      )?.name ?? 'enemy';
    const spawn = [...ctx.db.enemySpawn.by_location.filter(combat.locationId)].find(
      (s) => s.lockedCombatId === combat.id
    );
    if (spawn) {
      ctx.db.enemySpawn.id.delete(spawn.id);
      spawnEnemy(ctx, spawn.locationId, 1n);
    }
    for (const p of participants) {
      const character = ctx.db.character.id.find(p.characterId);
      if (!character) continue;
      ctx.db.combatResult.insert({
        id: 0n,
        ownerUserId: character.ownerUserId,
        characterId: character.id,
        groupId: combat.groupId,
        combatId: combat.id,
        summary: `Victory against ${enemyName} in ${combat.roundNumber} rounds.`,
        createdAt: ctx.timestamp,
      });
    }
    for (const p of participants) {
      const character = ctx.db.character.id.find(p.characterId);
      if (character && p.status === 'dead') {
        const quarterHp = character.maxHp / 4n;
        const quarterMana = character.maxMana / 4n;
        const quarterStamina = character.maxStamina / 4n;
        ctx.db.character.id.update({
          ...character,
          hp: quarterHp > 0n ? quarterHp : 1n,
          mana: quarterMana > 0n ? quarterMana : 1n,
          stamina: quarterStamina > 0n ? quarterStamina : 1n,
        });
      }
    }
  for (const row of ctx.db.combatParticipant.by_combat.filter(combat.id)) {
    ctx.db.combatParticipant.id.delete(row.id);
  }
  for (const row of ctx.db.aggroEntry.by_combat.filter(combat.id)) {
    ctx.db.aggroEntry.id.delete(row.id);
  }
  for (const row of ctx.db.combatEnemy.by_combat.filter(combat.id)) {
    ctx.db.combatEnemy.id.delete(row.id);
  }
  for (const row of ctx.db.combatEnemyEffect.by_combat.filter(combat.id)) {
    ctx.db.combatEnemyEffect.id.delete(row.id);
  }
  for (const row of ctx.db.combatEnemyEffect.by_combat.filter(combat.id)) {
    ctx.db.combatEnemyEffect.id.delete(row.id);
  }
    ctx.db.combatEncounter.id.update({ ...combat, state: 'resolved' });
    return;
  }

  // Enemy attacks highest aggro
  const activeIds = new Set(activeParticipants.map((p) => p.characterId));
  let topAggro: typeof AggroEntry.rowType | null = null;
  for (const entry of ctx.db.aggroEntry.by_combat.filter(combat.id)) {
    if (!activeIds.has(entry.characterId)) continue;
    if (!topAggro || entry.value > topAggro.value) topAggro = entry;
  }
  if (topAggro) {
    const targetCharacter = ctx.db.character.id.find(topAggro.characterId);
    if (targetCharacter && targetCharacter.hp > 0n) {
      const template = ctx.db.enemyTemplate.id.find(updatedEnemy.enemyTemplateId);
      const enemyLevel = template?.level ?? 1n;
      const levelDiff =
        enemyLevel > targetCharacter.level ? enemyLevel - targetCharacter.level : 0n;
      const damageMultiplier = 100n + levelDiff * 20n;
      const debuff = sumEnemyEffect(ctx, combat.id, 'damage_down');
      const baseDamage = updatedEnemy.attackDamage + debuff;
      const scaledDamage = (baseDamage * damageMultiplier) / 100n;
      const effectiveArmor =
        targetCharacter.armorClass + sumCharacterEffect(ctx, targetCharacter.id, 'ac_bonus');
      const reducedDamage = applyArmorMitigation(scaledDamage, effectiveArmor);
      const nextHp =
        targetCharacter.hp > reducedDamage ? targetCharacter.hp - reducedDamage : 0n;
      ctx.db.character.id.update({ ...targetCharacter, hp: nextHp });
      if (nextHp === 0n) {
        for (const p of participants) {
          if (p.characterId === targetCharacter.id) {
            ctx.db.combatParticipant.id.update({ ...p, status: 'dead' });
            break;
          }
        }
      }
    }
  }

  let stillActive = false;
  for (const p of ctx.db.combatParticipant.by_combat.filter(combat.id)) {
    if (p.status !== 'active') continue;
    const character = ctx.db.character.id.find(p.characterId);
    if (character && character.hp > 0n) {
      stillActive = true;
      break;
    }
  }
  if (!stillActive) {
    const enemyName =
      [...ctx.db.enemySpawn.by_location.filter(combat.locationId)].find(
        (s) => s.lockedCombatId === combat.id
      )?.name ?? 'enemy';
    const spawn = [...ctx.db.enemySpawn.by_location.filter(combat.locationId)].find(
      (s) => s.lockedCombatId === combat.id
    );
    if (spawn) {
      ctx.db.enemySpawn.id.update({ ...spawn, state: 'available', lockedCombatId: undefined });
    }
    for (const p of participants) {
      const character = ctx.db.character.id.find(p.characterId);
      if (!character) continue;
      ctx.db.combatResult.insert({
        id: 0n,
        ownerUserId: character.ownerUserId,
        characterId: character.id,
        groupId: combat.groupId,
        combatId: combat.id,
        summary: `Defeat against ${enemyName} after ${combat.roundNumber} rounds.`,
        createdAt: ctx.timestamp,
      });
    }
    for (const p of participants) {
      const character = ctx.db.character.id.find(p.characterId);
      if (character && p.status === 'dead') {
        const quarterHp = character.maxHp / 4n;
        const quarterMana = character.maxMana / 4n;
        const quarterStamina = character.maxStamina / 4n;
        ctx.db.character.id.update({
          ...character,
          hp: quarterHp > 0n ? quarterHp : 1n,
          mana: quarterMana > 0n ? quarterMana : 1n,
          stamina: quarterStamina > 0n ? quarterStamina : 1n,
        });
      }
    }
    for (const row of ctx.db.combatParticipant.by_combat.filter(combat.id)) {
      ctx.db.combatParticipant.id.delete(row.id);
    }
    for (const row of ctx.db.aggroEntry.by_combat.filter(combat.id)) {
      ctx.db.aggroEntry.id.delete(row.id);
    }
    for (const row of ctx.db.combatEnemy.by_combat.filter(combat.id)) {
      ctx.db.combatEnemy.id.delete(row.id);
    }
    ctx.db.combatEncounter.id.update({ ...combat, state: 'resolved' });
    return;
  }

  const nextRound = combat.roundNumber + 1n;
  ctx.db.combatEncounter.id.update({
    ...combat,
    roundNumber: nextRound,
  });
  scheduleRound(ctx, combat.id, nextRound);
});







