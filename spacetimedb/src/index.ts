import { schema, table, t, SenderError } from 'spacetimedb/server';
import { ScheduleAt, Timestamp } from 'spacetimedb';
import { registerReducers } from './reducers';

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

const AbilityCooldown = table(
  {
    name: 'ability_cooldown',
    indexes: [{ name: 'by_character', algorithm: 'btree', columns: ['characterId'] }],
  },
  {
    id: t.u64().primaryKey().autoInc(),
    characterId: t.u64(),
    abilityKey: t.string(),
    readyAtMicros: t.u64(),
  }
);

const CharacterCast = table(
  {
    name: 'character_cast',
    indexes: [{ name: 'by_character', algorithm: 'btree', columns: ['characterId'] }],
  },
  {
    id: t.u64().primaryKey().autoInc(),
    characterId: t.u64(),
    abilityKey: t.string(),
    targetCharacterId: t.u64().optional(),
    endsAtMicros: t.u64(),
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
    nextAutoAttackAt: t.u64(),
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
    nextAutoAttackAt: t.u64(),
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

const EffectTick = table(
  {
    name: 'effect_tick',
    scheduled: 'tick_effects',
  },
  {
    scheduledId: t.u64().primaryKey().autoInc(),
    scheduledAt: t.scheduleAt(),
  }
);

const HotTick = table(
  {
    name: 'hot_tick',
    scheduled: 'tick_hot',
  },
  {
    scheduledId: t.u64().primaryKey().autoInc(),
    scheduledAt: t.scheduleAt(),
  }
);

const CastTick = table(
  {
    name: 'cast_tick',
    scheduled: 'tick_casts',
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
  AbilityCooldown,
  CharacterCast,
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
  EffectTick,
  HotTick,
  CastTick,
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
  shaman_spirit_bolt: {
    name: 'Spirit Bolt',
    level: 1n,
    power: 2n,
    cooldownSeconds: 6n,
    castSeconds: 2n,
  },
  shaman_totem_of_vigor: {
    name: 'Totem of Vigor',
    level: 2n,
    power: 2n,
    cooldownSeconds: 10n,
    castSeconds: 2n,
  },
  shaman_hex: {
    name: 'Hex',
    level: 3n,
    power: 4n,
    cooldownSeconds: 10n,
    castSeconds: 1n,
  },
  shaman_ancestral_ward: {
    name: 'Ancestral Ward',
    level: 4n,
    power: 3n,
    cooldownSeconds: 12n,
    castSeconds: 0n,
  },
  shaman_stormcall: {
    name: 'Stormcall',
    level: 5n,
    power: 6n,
    cooldownSeconds: 15n,
    castSeconds: 2n,
  },
} as const;

function abilityManaCost(level: bigint, power: bigint) {
  return 4n + level * 2n + power;
}

function abilityCooldownMicros(abilityKey: string) {
  const ability = SHAMAN_ABILITIES[abilityKey as keyof typeof SHAMAN_ABILITIES];
  if (ability?.cooldownSeconds) return ability.cooldownSeconds * 1_000_000n;
  return 6_000_000n;
}

function abilityCastMicros(abilityKey: string) {
  const ability = SHAMAN_ABILITIES[abilityKey as keyof typeof SHAMAN_ABILITIES];
  if (ability?.castSeconds) return ability.castSeconds * 1_000_000n;
  return 0n;
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
      magnitude: 10n,
      roundsRemaining: 1n,
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

const MAX_LEVEL = 10n;
const XP_TOTAL_BY_LEVEL = [
  0n, // L1
  100n, // L2
  260n, // L3
  480n, // L4
  760n, // L5
  1100n, // L6
  1500n, // L7
  1960n, // L8
  2480n, // L9
  3060n, // L10
];

function xpRequiredForLevel(level: bigint) {
  if (level <= 1n) return 0n;
  const idx = Number(level - 1n);
  if (idx <= 0) return 0n;
  return XP_TOTAL_BY_LEVEL[Math.min(idx, XP_TOTAL_BY_LEVEL.length - 1)];
}

function xpModifierForDiff(diff: number) {
  if (diff <= -5) return 0n;
  if (diff === -4) return 10n;
  if (diff === -3) return 25n;
  if (diff === -2) return 50n;
  if (diff === -1) return 80n;
  if (diff === 0) return 100n;
  if (diff === 1) return 120n;
  if (diff === 2) return 140n;
  if (diff === 3) return 160n;
  if (diff === 4) return 180n;
  return 200n;
}

function awardCombatXp(
  ctx: any,
  character: typeof Character.rowType,
  enemyLevel: bigint,
  baseXp: bigint
) {
  if (character.level >= MAX_LEVEL) return { xpGained: 0n, leveledUp: false };
  const diff = Number(enemyLevel - character.level);
  const mod = xpModifierForDiff(diff);
  if (mod === 0n) return { xpGained: 0n, leveledUp: false };

  const gained = (baseXp * mod) / 100n;
  if (gained <= 0n) return { xpGained: 0n, leveledUp: false };

  const newXp = character.xp + gained;
  let newLevel = character.level;
  while (newLevel < MAX_LEVEL && newXp >= xpRequiredForLevel(newLevel + 1n)) {
    newLevel += 1n;
  }

  if (newLevel === character.level) {
    ctx.db.character.id.update({ ...character, xp: newXp });
    return { xpGained: gained, leveledUp: false };
  }

  const newBase = computeBaseStats(character.className, newLevel);
  const updated = {
    ...character,
    level: newLevel,
    xp: newXp,
    str: newBase.str,
    dex: newBase.dex,
    cha: newBase.cha,
    wis: newBase.wis,
    int: newBase.int,
  };
  ctx.db.character.id.update(updated);
  recomputeCharacterDerived(ctx, updated);
  return { xpGained: gained, leveledUp: true, newLevel };
}

function applyDeathXpPenalty(ctx: any, character: typeof Character.rowType) {
  if (character.level <= 5n) return 0n;
  const currentLevelFloor = xpRequiredForLevel(character.level);
  if (character.xp <= currentLevelFloor) return 0n;
  const progress = character.xp - currentLevelFloor;
  const loss = (progress * 5n) / 100n;
  if (loss <= 0n) return 0n;
  const nextXp = character.xp - loss;
  const clamped = nextXp < currentLevelFloor ? currentLevelFloor : nextXp;
  ctx.db.character.id.update({ ...character, xp: clamped });
  return loss;
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
  const effectiveLevel = template.level;
  const baseHp = role.baseHp + role.hpPerLevel * effectiveLevel;
  const baseDamage = role.baseDamage + role.damagePerLevel * effectiveLevel;
  const baseArmorClass = template.armorClass + effectiveLevel;

  return {
    maxHp: baseHp,
    attackDamage: baseDamage,
    armorClass: baseArmorClass,
    avgLevel: effectiveLevel,
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
  const nextAt = ctx.timestamp.microsSinceUnixEpoch + 1_000_000n;
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

function ensureEffectTickScheduled(ctx: any) {
  if (!tableHasRows(ctx.db.effectTick.iter())) {
    ctx.db.effectTick.insert({
      scheduledId: 0n,
      scheduledAt: ScheduleAt.time(ctx.timestamp.microsSinceUnixEpoch + 10_000_000n),
    });
  }
}

function ensureHotTickScheduled(ctx: any) {
  if (!tableHasRows(ctx.db.hotTick.iter())) {
    ctx.db.hotTick.insert({
      scheduledId: 0n,
      scheduledAt: ScheduleAt.time(ctx.timestamp.microsSinceUnixEpoch + 3_000_000n),
    });
  }
}

function ensureCastTickScheduled(ctx: any) {
  if (!tableHasRows(ctx.db.castTick.iter())) {
    ctx.db.castTick.insert({
      scheduledId: 0n,
      scheduledAt: ScheduleAt.time(ctx.timestamp.microsSinceUnixEpoch + 200_000n),
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
  { name: 'my_character_effects', public: true },
  t.array(CharacterEffect.rowType),
  (ctx) => {
    const player = ctx.db.player.id.find(ctx.sender);
    if (!player || !player.activeCharacterId) return [];
    const character = ctx.db.character.id.find(player.activeCharacterId);
    if (!character) return [];

    const ids = new Set<bigint>();
    ids.add(character.id);
    if (character.groupId) {
      for (const member of ctx.db.groupMember.by_group.filter(character.groupId)) {
        ids.add(member.characterId);
      }
    }

    const effects: typeof CharacterEffect.rowType[] = [];
    for (const effect of ctx.db.characterEffect.iter()) {
      if (ids.has(effect.characterId)) effects.push(effect);
    }
    return effects;
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
  ensureEffectTickScheduled(ctx);
  ensureHotTickScheduled(ctx);
  ensureCastTickScheduled(ctx);
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
  ensureEffectTickScheduled(ctx);
  ensureHotTickScheduled(ctx);
  ensureCastTickScheduled(ctx);
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

const reducerDeps = {
  spacetimedb,
  t,
  SenderError,
  ScheduleAt,
  Timestamp,
  Character,
  GroupMember,
  GroupInvite,
  CombatParticipant,
  CombatRoundTick,
  HealthRegenTick,
  EffectTick,
  HotTick,
  CastTick,
  AggroEntry,
  requirePlayerUserId,
  requireCharacterOwnedBy,
  findCharacterByName,
  friendUserIds,
  appendPrivateEvent,
  appendGroupEvent,
  appendLocationEvent,
  ensureSpawnsForLocation,
  ensureAvailableSpawn,
  computeEnemyStats,
  activeCombatIdForCharacter,
  scheduleRound,
  recomputeCharacterDerived,
  executeAbility,
  isClassAllowed,
  isArmorAllowedForClass,
  normalizeArmorType,
  EQUIPMENT_SLOTS,
  ARMOR_TYPES_WITH_NONE,
  computeBaseStats,
  manaStatForClass,
  baseArmorForClass,
  BASE_HP,
  BASE_MANA,
  abilityCooldownMicros,
  abilityCastMicros,
  grantStarterItems,
  areLocationsConnected,
  sumCharacterEffect,
  sumEnemyEffect,
  applyArmorMitigation,
  spawnEnemy,
  getEquippedWeaponStats,
  awardCombatXp,
  xpRequiredForLevel,
  MAX_LEVEL,
  applyDeathXpPenalty,
};

registerReducers(reducerDeps);
