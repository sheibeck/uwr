import { schema, table, t, SenderError } from 'spacetimedb/server';
import { ScheduleAt, Timestamp } from 'spacetimedb';
import { registerReducers } from './reducers';
import { registerViews } from './views';
import {
  ARMOR_TYPES_WITH_NONE,
  BASE_HP,
  BASE_MANA,
  CLASS_ARMOR,
  baseArmorForClass,
  canParry,
  computeBaseStats,
  isArmorAllowedForClass,
  manaStatForClass,
  normalizeArmorType,
  normalizeClassName,
  usesMana,
} from './data/class_stats';
import {
  ABILITIES,
  ENEMY_ABILITIES,
  GLOBAL_COOLDOWN_MICROS,
} from './data/ability_catalog';
import { MAX_LEVEL, xpModifierForDiff, xpRequiredForLevel } from './data/xp';

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
    isNight: t.bool(),
    nextTransitionAtMicros: t.u64(),
  }
);

const Region = table(
  { name: 'region', public: true },
  {
    id: t.u64().primaryKey().autoInc(),
    name: t.string(),
    dangerMultiplier: t.u64(),
    regionType: t.string(),
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
    terrainType: t.string(),
    bindStone: t.bool(),
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

const Npc = table(
  {
    name: 'npc',
    public: true,
    indexes: [{ name: 'by_location', algorithm: 'btree', columns: ['locationId'] }],
  },
  {
    id: t.u64().primaryKey().autoInc(),
    name: t.string(),
    npcType: t.string(),
    locationId: t.u64(),
    description: t.string(),
    greeting: t.string(),
  }
);

const NpcDialog = table(
  {
    name: 'npc_dialog',
    indexes: [
      { name: 'by_character', algorithm: 'btree', columns: ['characterId'] },
      { name: 'by_npc', algorithm: 'btree', columns: ['npcId'] },
    ],
  },
  {
    id: t.u64().primaryKey().autoInc(),
    characterId: t.u64(),
    npcId: t.u64(),
    text: t.string(),
    createdAt: t.timestamp(),
  }
);

const QuestTemplate = table(
  {
    name: 'quest_template',
    public: true,
    indexes: [
      { name: 'by_npc', algorithm: 'btree', columns: ['npcId'] },
      { name: 'by_enemy', algorithm: 'btree', columns: ['targetEnemyTemplateId'] },
    ],
  },
  {
    id: t.u64().primaryKey().autoInc(),
    name: t.string(),
    npcId: t.u64(),
    targetEnemyTemplateId: t.u64(),
    requiredCount: t.u64(),
    minLevel: t.u64(),
    maxLevel: t.u64(),
    rewardXp: t.u64(),
  }
);

const QuestInstance = table(
  {
    name: 'quest_instance',
    indexes: [
      { name: 'by_character', algorithm: 'btree', columns: ['characterId'] },
      { name: 'by_template', algorithm: 'btree', columns: ['questTemplateId'] },
    ],
  },
  {
    id: t.u64().primaryKey().autoInc(),
    characterId: t.u64(),
    questTemplateId: t.u64(),
    progress: t.u64(),
    completed: t.bool(),
    acceptedAt: t.timestamp(),
    completedAt: t.timestamp().optional(),
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
    gold: t.u64(),
    locationId: t.u64(),
    boundLocationId: t.u64(),
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
    combatTargetEnemyId: t.u64().optional(),
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
    tier: t.u64(),
    isJunk: t.bool(),
    vendorValue: t.u64(),
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

const CombatLoot = table(
  {
    name: 'combat_loot',
    indexes: [
      { name: 'by_owner', algorithm: 'btree', columns: ['ownerUserId'] },
      { name: 'by_combat', algorithm: 'btree', columns: ['combatId'] },
      { name: 'by_character', algorithm: 'btree', columns: ['characterId'] },
    ],
  },
  {
    id: t.u64().primaryKey().autoInc(),
    combatId: t.u64(),
    ownerUserId: t.u64(),
    characterId: t.u64(),
    itemTemplateId: t.u64(),
    createdAt: t.timestamp(),
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
    public: true,
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
    public: true,
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
    terrainTypes: t.string(),
    creatureType: t.string(),
    timeOfDay: t.string(),
    socialGroup: t.string(),
    socialRadius: t.u64(),
    awareness: t.string(),
    groupMin: t.u64(),
    groupMax: t.u64(),
    armorClass: t.u64(),
    level: t.u64(),
    maxHp: t.u64(),
    baseDamage: t.u64(),
    xpReward: t.u64(),
  }
);

const EnemyAbility = table(
  {
    name: 'enemy_ability',
    public: true,
    indexes: [{ name: 'by_template', algorithm: 'btree', columns: ['enemyTemplateId'] }],
  },
  {
    id: t.u64().primaryKey().autoInc(),
    enemyTemplateId: t.u64(),
    abilityKey: t.string(),
    name: t.string(),
    kind: t.string(),
    castSeconds: t.u64(),
    cooldownSeconds: t.u64(),
    targetRule: t.string(),
  }
);

const CombatEnemyCooldown = table(
  {
    name: 'combat_enemy_cooldown',
    public: true,
    indexes: [
      { name: 'by_combat', algorithm: 'btree', columns: ['combatId'] },
      { name: 'by_enemy', algorithm: 'btree', columns: ['enemyId'] },
    ],
  },
  {
    id: t.u64().primaryKey().autoInc(),
    combatId: t.u64(),
    enemyId: t.u64(),
    abilityKey: t.string(),
    readyAtMicros: t.u64(),
  }
);

const VendorInventory = table(
  {
    name: 'vendor_inventory',
    public: true,
    indexes: [{ name: 'by_vendor', algorithm: 'btree', columns: ['npcId'] }],
  },
  {
    id: t.u64().primaryKey().autoInc(),
    npcId: t.u64(),
    itemTemplateId: t.u64(),
    price: t.u64(),
  }
);

const LootTable = table(
  {
    name: 'loot_table',
    public: true,
    indexes: [
      { name: 'by_key', algorithm: 'btree', columns: ['terrainType', 'creatureType', 'tier'] },
    ],
  },
  {
    id: t.u64().primaryKey().autoInc(),
    terrainType: t.string(),
    creatureType: t.string(),
    tier: t.u64(),
    junkChance: t.u64(),
    gearChance: t.u64(),
    goldMin: t.u64(),
    goldMax: t.u64(),
  }
);

const LootTableEntry = table(
  {
    name: 'loot_table_entry',
    indexes: [{ name: 'by_table', algorithm: 'btree', columns: ['lootTableId'] }],
  },
  {
    id: t.u64().primaryKey().autoInc(),
    lootTableId: t.u64(),
    itemTemplateId: t.u64(),
    weight: t.u64(),
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
    groupCount: t.u64(),
  }
);

const PullState = table(
  {
    name: 'pull_state',
    public: true,
    indexes: [
      { name: 'by_character', algorithm: 'btree', columns: ['characterId'] },
      { name: 'by_location', algorithm: 'btree', columns: ['locationId'] },
      { name: 'by_group', algorithm: 'btree', columns: ['groupId'] },
      { name: 'by_state', algorithm: 'btree', columns: ['state'] },
    ],
  },
  {
    id: t.u64().primaryKey().autoInc(),
    characterId: t.u64(),
    groupId: t.u64().optional(),
    locationId: t.u64(),
    enemySpawnId: t.u64(),
    pullType: t.string(),
    state: t.string(),
    outcome: t.string().optional(),
    delayedAdds: t.u64().optional(),
    delayedAddsAtMicros: t.u64().optional(),
    createdAt: t.timestamp(),
  }
);

const PullTick = table(
  {
    name: 'pull_tick',
    scheduled: 'resolve_pull',
    public: true,
    indexes: [{ name: 'by_pull', algorithm: 'btree', columns: ['pullId'] }],
  },
  {
    scheduledId: t.u64().primaryKey().autoInc(),
    scheduledAt: t.scheduleAt(),
    pullId: t.u64(),
  }
);


const CombatEnemyCast = table(
  {
    name: 'combat_enemy_cast',
    public: true,
    indexes: [{ name: 'by_combat', algorithm: 'btree', columns: ['combatId'] }],
  },
  {
    id: t.u64().primaryKey().autoInc(),
    combatId: t.u64(),
    enemyId: t.u64(),
    abilityKey: t.string(),
    endsAtMicros: t.u64(),
    targetCharacterId: t.u64().optional(),
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
    addCount: t.u64(),
    pendingAddCount: t.u64(),
    pendingAddAtMicros: t.u64().optional(),
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
    spawnId: t.u64(),
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
    sourceAbility: t.string().optional(),
  }
);

const CombatEnemyEffect = table(
  {
    name: 'combat_enemy_effect',
    public: true,
    indexes: [
      { name: 'by_combat', algorithm: 'btree', columns: ['combatId'] },
      { name: 'by_enemy', algorithm: 'btree', columns: ['enemyId'] },
    ],
  },
  {
    id: t.u64().primaryKey().autoInc(),
    combatId: t.u64(),
    enemyId: t.u64(),
    effectType: t.string(),
    magnitude: t.i64(),
    roundsRemaining: t.u64(),
    sourceAbility: t.string().optional(),
  }
);

const CombatPendingAdd = table(
  {
    name: 'combat_pending_add',
    public: true,
    indexes: [
      { name: 'by_combat', algorithm: 'btree', columns: ['combatId'] },
      { name: 'by_ready', algorithm: 'btree', columns: ['arriveAtMicros'] },
    ],
  },
  {
    id: t.u64().primaryKey().autoInc(),
    combatId: t.u64(),
    enemyTemplateId: t.u64(),
    spawnId: t.u64().optional(),
    arriveAtMicros: t.u64(),
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
    indexes: [
      { name: 'by_combat', algorithm: 'btree', columns: ['combatId'] },
      { name: 'by_enemy', algorithm: 'btree', columns: ['enemyId'] },
    ],
  },
  {
    id: t.u64().primaryKey().autoInc(),
    combatId: t.u64(),
    enemyId: t.u64(),
    characterId: t.u64(),
    value: t.u64(),
  }
);

const CombatLoopTick = table(
  {
    name: 'combat_loop_tick',
    scheduled: 'combat_loop',
  },
  {
    scheduledId: t.u64().primaryKey().autoInc(),
    scheduledAt: t.scheduleAt(),
    combatId: t.u64(),
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

const DayNightTick = table(
  {
    name: 'day_night_tick',
    scheduled: 'tick_day_night',
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
  Npc,
  NpcDialog,
  QuestTemplate,
  QuestInstance,
  HotbarSlot,
  AbilityCooldown,
  CharacterCast,
  Character,
  ItemTemplate,
  ItemInstance,
  CombatLoot,
  Group,
  GroupMember,
  GroupInvite,
  EnemyTemplate,
  EnemyAbility,
  VendorInventory,
  LootTable,
  LootTableEntry,
  LocationEnemyTemplate,
  EnemySpawn,
  PullState,
  PullTick,
  CombatEncounter,
  CombatParticipant,
  CombatEnemy,
  CombatEnemyCast,
  CombatEnemyCooldown,
  CharacterEffect,
  CombatEnemyEffect,
  CombatPendingAdd,
  AggroEntry,
  CombatLoopTick,
  HealthRegenTick,
  EffectTick,
  HotTick,
  CastTick,
  DayNightTick,
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

const EVENT_TRIM_MAX = 200;
const EVENT_TRIM_AGE_MICROS = 3_600_000_000n; // 1 hour

const trimEventRows = <T extends { id: bigint; createdAt: { microsSinceUnixEpoch: bigint } }>(
  rows: T[],
  deleteFn: (id: bigint) => void,
  nowMicros: bigint
) => {
  const cutoff = nowMicros - EVENT_TRIM_AGE_MICROS;

  if (rows.length <= EVENT_TRIM_MAX) {
    for (const row of rows) {
      if (row.createdAt.microsSinceUnixEpoch < cutoff) {
        deleteFn(row.id);
      }
    }
    return;
  }

  const sorted = [...rows].sort((a, b) => {
    const diff = a.createdAt.microsSinceUnixEpoch - b.createdAt.microsSinceUnixEpoch;
    return diff < 0n ? -1 : diff > 0n ? 1 : 0;
  });

  const excess = sorted.length - EVENT_TRIM_MAX;
  for (let i = 0; i < sorted.length; i += 1) {
    const row = sorted[i];
    if (i < excess || row.createdAt.microsSinceUnixEpoch < cutoff) {
      deleteFn(row.id);
    }
  }
};

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
  const row = ctx.db.eventWorld.insert({
    id: 0n,
    kind,
    message,
    createdAt: ctx.timestamp,
  });
  const rows = [...ctx.db.eventWorld.iter()];
  trimEventRows(rows, (id) => ctx.db.eventWorld.id.delete(id), ctx.timestamp.microsSinceUnixEpoch);
  return row;
}

function appendLocationEvent(
  ctx: any,
  locationId: bigint,
  kind: string,
  message: string,
  excludeCharacterId?: bigint
) {
  const row = ctx.db.eventLocation.insert({
    id: 0n,
    locationId,
    kind,
    message,
    excludeCharacterId,
    createdAt: ctx.timestamp,
  });
  const rows = [...ctx.db.eventLocation.by_location.filter(locationId)];
  trimEventRows(rows, (id) => ctx.db.eventLocation.id.delete(id), ctx.timestamp.microsSinceUnixEpoch);
  return row;
}

function appendPrivateEvent(
  ctx: any,
  characterId: bigint,
  ownerUserId: bigint,
  kind: string,
  message: string
) {
  const row = ctx.db.eventPrivate.insert({
    id: 0n,
    ownerUserId,
    characterId,
    kind,
    message,
    createdAt: ctx.timestamp,
  });
  const rows = [...ctx.db.eventPrivate.by_owner_user.filter(ownerUserId)];
  trimEventRows(rows, (id) => ctx.db.eventPrivate.id.delete(id), ctx.timestamp.microsSinceUnixEpoch);
  return row;
}

function appendNpcDialog(ctx: any, characterId: bigint, npcId: bigint, text: string) {
  const cutoff = ctx.timestamp.microsSinceUnixEpoch - 60_000_000n;
  for (const row of ctx.db.npcDialog.by_character.filter(characterId)) {
    if (row.npcId !== npcId) continue;
    if (row.text !== text) continue;
    if (row.createdAt.microsSinceUnixEpoch >= cutoff) {
      return;
    }
  }
  ctx.db.npcDialog.insert({
    id: 0n,
    characterId,
    npcId,
    text,
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
  const row = ctx.db.eventGroup.insert({
    id: 0n,
    groupId,
    characterId,
    kind,
    message,
    createdAt: ctx.timestamp,
  });
  const rows = [...ctx.db.eventGroup.by_group.filter(groupId)];
  trimEventRows(rows, (id) => ctx.db.eventGroup.id.delete(id), ctx.timestamp.microsSinceUnixEpoch);
  return row;
}

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
  wizard: { name: 'Training Staff', slot: 'mainHand' },
};

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

function abilityResourceCost(level: bigint, power: bigint) {
  return 4n + level * 2n + power;
}

function hasShieldEquipped(ctx: any, characterId: bigint) {
  for (const instance of ctx.db.itemInstance.by_owner.filter(characterId)) {
    if (instance.equippedSlot !== 'offHand') continue;
    const template = ctx.db.itemTemplate.id.find(instance.templateId);
    if (!template) continue;
    const name = template.name.toLowerCase();
    if (name.includes('shield') || template.armorType === 'shield') return true;
  }
  return false;
}

function abilityCooldownMicros(abilityKey: string) {
  const ability = ABILITIES[abilityKey as keyof typeof ABILITIES];
  if (!ability) return GLOBAL_COOLDOWN_MICROS;
  const castMicros = ability.castSeconds ? ability.castSeconds * 1_000_000n : 0n;
  if (castMicros > 0n) return castMicros;
  const specific = ability.cooldownSeconds ? ability.cooldownSeconds * 1_000_000n : 0n;
  return specific > GLOBAL_COOLDOWN_MICROS ? specific : GLOBAL_COOLDOWN_MICROS;
}

function abilityCastMicros(abilityKey: string) {
  const ability = ABILITIES[abilityKey as keyof typeof ABILITIES];
  if (ability?.castSeconds) return ability.castSeconds * 1_000_000n;
  return 0n;
}

function enemyAbilityCastMicros(abilityKey: string) {
  const ability = ENEMY_ABILITIES[abilityKey as keyof typeof ENEMY_ABILITIES];
  if (ability?.castSeconds) return ability.castSeconds * 1_000_000n;
  return 0n;
}

function enemyAbilityCooldownMicros(abilityKey: string) {
  const ability = ENEMY_ABILITIES[abilityKey as keyof typeof ENEMY_ABILITIES];
  if (ability?.cooldownSeconds) return ability.cooldownSeconds * 1_000_000n;
  return 0n;
}

function rollAttackOutcome(
  seed: bigint,
  opts: { canBlock: boolean; canParry: boolean; canDodge: boolean }
) {
  const roll = seed % 100n;
  let cursor = 0n;
  if (opts.canDodge) {
    cursor += 5n;
    if (roll < cursor) return { outcome: 'dodge', multiplier: 0n };
  }
  if (opts.canParry) {
    cursor += 5n;
    if (roll < cursor) return { outcome: 'parry', multiplier: 0n };
  }
  if (opts.canBlock) {
    cursor += 5n;
    if (roll < cursor) return { outcome: 'block', multiplier: 50n };
  }
  return { outcome: 'hit', multiplier: 100n };
}

function abilityDamageFromWeapon(
  weaponDamage: bigint,
  percent: bigint,
  bonus: bigint
) {
  const scaled = (weaponDamage * percent) / 100n + bonus;
  return scaled > weaponDamage ? scaled : weaponDamage + bonus;
}

function partyMembersInLocation(ctx: any, character: typeof Character.rowType) {
  if (!character.groupId) return [character];
  const members: typeof Character.rowType[] = [];
  for (const member of ctx.db.groupMember.by_group.filter(character.groupId)) {
    const memberChar = ctx.db.character.id.find(member.characterId);
    if (memberChar && memberChar.locationId === character.locationId) {
      members.push(memberChar);
    }
  }
  if (!members.find((row) => row.id === character.id)) members.unshift(character);
  return members;
}

function addCharacterEffect(
  ctx: any,
  characterId: bigint,
  effectType: string,
  magnitude: bigint,
  roundsRemaining: bigint,
  sourceAbility: string
) {
  const existing = [...ctx.db.characterEffect.by_character.filter(characterId)].find(
    (effect) => effect.effectType === effectType && effect.sourceAbility === sourceAbility
  );
  if (existing) {
    ctx.db.characterEffect.id.update({
      ...existing,
      magnitude,
      roundsRemaining,
    });
    return;
  }
  ctx.db.characterEffect.insert({
    id: 0n,
    characterId,
    effectType,
    magnitude,
    roundsRemaining,
    sourceAbility,
  });
}

function addEnemyEffect(
  ctx: any,
  combatId: bigint,
  enemyId: bigint,
  effectType: string,
  magnitude: bigint,
  roundsRemaining: bigint,
  sourceAbility: string
) {
  const existing = [...ctx.db.combatEnemyEffect.by_combat.filter(combatId)].find(
    (effect) =>
      effect.enemyId === enemyId &&
      effect.effectType === effectType &&
      effect.sourceAbility === sourceAbility
  );
  if (existing) {
    ctx.db.combatEnemyEffect.id.update({
      ...existing,
      magnitude,
      roundsRemaining,
    });
    return;
  }
  ctx.db.combatEnemyEffect.insert({
    id: 0n,
    combatId,
    enemyId,
    effectType,
    magnitude,
    roundsRemaining,
    sourceAbility,
  });
}

function applyHpBonus(
  ctx: any,
  character: typeof Character.rowType,
  amount: bigint,
  roundsRemaining: bigint,
  sourceAbility: string
) {
  ctx.db.character.id.update({
    ...character,
    maxHp: character.maxHp + amount,
    hp: character.hp + amount,
  });
  addCharacterEffect(ctx, character.id, 'hp_bonus', amount, roundsRemaining, sourceAbility);
}

function getTopAggroId(ctx: any, combatId: bigint, enemyId?: bigint) {
  let top: typeof AggroEntry.rowType | null = null;
  for (const entry of ctx.db.aggroEntry.by_combat.filter(combatId)) {
    if (enemyId && entry.enemyId !== enemyId) continue;
    if (!top || entry.value > top.value) top = entry;
  }
  return top?.characterId ?? null;
}

function sumCharacterEffect(ctx: any, characterId: bigint, effectType: string) {
  let total = 0n;
  for (const effect of ctx.db.characterEffect.by_character.filter(characterId)) {
    if (effect.effectType === effectType) total += BigInt(effect.magnitude);
  }
  return total;
}

function sumEnemyEffect(ctx: any, combatId: bigint, effectType: string, enemyId?: bigint) {
  let total = 0n;
  for (const effect of ctx.db.combatEnemyEffect.by_combat.filter(combatId)) {
    if (enemyId && effect.enemyId !== enemyId) continue;
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
  const ability = ABILITIES[abilityKey as keyof typeof ABILITIES];
  if (!ability) throw new SenderError('Unknown ability');
  if (ability.className !== normalizedClass) {
    throw new SenderError('Ability not available');
  }

  if (character.level < ability.level) throw new SenderError('Ability not unlocked');

  const resourceCost =
    ability.resource === 'stamina'
      ? 3n
      : abilityResourceCost(ability.level, ability.power);
  if (ability.resource === 'mana') {
    if (character.mana < resourceCost) throw new SenderError('Not enough mana');
  } else if (ability.resource === 'stamina') {
    if (character.stamina < resourceCost) throw new SenderError('Not enough stamina');
  }

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

  if (ability.resource === 'mana') {
    ctx.db.character.id.update({ ...character, mana: character.mana - resourceCost });
  } else if (ability.resource === 'stamina') {
    ctx.db.character.id.update({ ...character, stamina: character.stamina - resourceCost });
  }

  const combatId = activeCombatIdForCharacter(ctx, character.id);
  const combat = combatId ? ctx.db.combatEncounter.id.find(combatId) : null;
  const enemies = combatId ? [...ctx.db.combatEnemy.by_combat.filter(combatId)] : [];
  const preferredEnemy = character.combatTargetEnemyId
    ? enemies.find((row) => row.id === character.combatTargetEnemyId)
    : null;
  const enemy =
    preferredEnemy ??
    enemies.find((row) => row.currentHp > 0n) ??
    enemies[0] ??
    null;
  const enemyTemplate = enemy ? ctx.db.enemyTemplate.id.find(enemy.enemyTemplateId) : null;
  const enemyName = enemyTemplate?.name ?? 'enemy';
  const weapon = getEquippedWeaponStats(ctx, character.id);
  const baseWeaponDamage = 5n + character.level + weapon.baseDamage + weapon.dps / 2n;
  const damageUp = sumCharacterEffect(ctx, character.id, 'damage_up');

  const applyDamage = (
    percent: bigint,
    bonus: bigint,
    options?: {
      hits?: bigint;
      ignoreArmor?: bigint;
      threatBonus?: bigint;
      debuff?: { type: string; magnitude: bigint; rounds: bigint; source: string };
      dot?: { magnitude: bigint; rounds: bigint; source: string };
      message?: string;
    }
  ) => {
    if (!enemy || !combatId) throw new SenderError('No enemy in combat');
    const hits = options?.hits ?? 1n;
    let armor = enemy.armorClass;
    const armorDebuff = sumEnemyEffect(ctx, combatId, 'armor_down', enemy.id);
    if (armorDebuff !== 0n) {
      armor = armor + armorDebuff;
      if (armor < 0n) armor = 0n;
    }
    if (options?.ignoreArmor) {
      armor = armor > options.ignoreArmor ? armor - options.ignoreArmor : 0n;
    }
    let totalDamage = 0n;
    for (let i = 0n; i < hits; i += 1n) {
      const raw =
        abilityDamageFromWeapon(baseWeaponDamage, percent, bonus) +
        damageUp +
        sumEnemyEffect(ctx, combatId, 'damage_taken', enemy.id);
      const reduced = applyArmorMitigation(raw, armor);
      totalDamage += reduced;
    }
    const nextHp = enemy.currentHp > totalDamage ? enemy.currentHp - totalDamage : 0n;
    ctx.db.combatEnemy.id.update({ ...enemy, currentHp: nextHp });
        for (const entry of ctx.db.aggroEntry.by_combat.filter(combatId)) {
          if (entry.characterId === character.id && entry.enemyId === enemy.id) {
            ctx.db.aggroEntry.id.update({
              ...entry,
              value: entry.value + totalDamage + (options?.threatBonus ?? 0n),
            });
            break;
      }
    }
    if (options?.debuff) {
      addEnemyEffect(
        ctx,
        combatId,
        enemy.id,
        options.debuff.type,
        options.debuff.magnitude,
        options.debuff.rounds,
        options.debuff.source
      );
    }
    if (options?.dot) {
      addEnemyEffect(
        ctx,
        combatId,
        enemy.id,
        'dot',
        options.dot.magnitude,
        options.dot.rounds,
        options.dot.source
      );
    }
    appendPrivateEvent(
      ctx,
      character.id,
      character.ownerUserId,
      'damage',
      options?.message ?? `Your ${ability.name} hits ${enemyName} for ${totalDamage} damage.`
    );
    return totalDamage;
  };

  const partyMembers = partyMembersInLocation(ctx, character);
  const applyHeal = (target: typeof Character.rowType, amount: bigint, source: string) => {
    const current = ctx.db.character.id.find(target.id);
    if (!current) return;
    const nextHp = current.hp + amount > current.maxHp ? current.maxHp : current.hp + amount;
    ctx.db.character.id.update({ ...current, hp: nextHp });
    appendPrivateEvent(
      ctx,
      current.id,
      current.ownerUserId,
      'heal',
      `${source} restores ${amount} health to ${current.name}.`
    );
  };
  const applyPartyEffect = (
    effectType: string,
    magnitude: bigint,
    rounds: bigint,
    source: string
  ) => {
    for (const member of partyMembers) {
      addCharacterEffect(ctx, member.id, effectType, magnitude, rounds, source);
    }
  };
  const applyPartyHpBonus = (amount: bigint, rounds: bigint, source: string) => {
    for (const member of partyMembers) {
      applyHpBonus(ctx, member, amount, rounds, source);
    }
  };

  switch (abilityKey) {
    case 'shaman_spirit_mender':
      if (!targetCharacter) throw new SenderError('Target required');
      applyHeal(targetCharacter, 6n, 'Spirit Mender');
      addCharacterEffect(ctx, targetCharacter.id, 'regen', 3n, 2n, 'Spirit Mender');
      appendPrivateEvent(
        ctx,
        character.id,
        character.ownerUserId,
        'ability',
        `Spirit Mender soothes ${targetCharacter.name}.`
      );
      return;
    case 'shaman_totem_of_vigor':
      if (!targetCharacter) throw new SenderError('Target required');
      addCharacterEffect(ctx, targetCharacter.id, 'regen', 10n, 3n, 'Totem of Vigor');
      appendPrivateEvent(
        ctx,
        character.id,
        character.ownerUserId,
        'ability',
        `Totem of Vigor empowers ${targetCharacter.name}.`
      );
      return;
    case 'shaman_hex':
      applyDamage(115n, 1n, {
        debuff: { type: 'damage_down', magnitude: -2n, rounds: 3n, source: 'Hex' },
      });
      return;
    case 'shaman_ancestral_ward':
      if (!targetCharacter) throw new SenderError('Target required');
      addCharacterEffect(ctx, targetCharacter.id, 'ac_bonus', 2n, 3n, 'Ancestral Ward');
      appendPrivateEvent(
        ctx,
        character.id,
        character.ownerUserId,
        'ability',
        `Ancestral Ward shields ${targetCharacter.name}.`
      );
      return;
    case 'shaman_stormcall':
      applyDamage(160n, 4n);
      return;
    case 'warrior_slam':
      applyDamage(140n, 3n, {
        threatBonus: 10n,
        debuff: { type: 'skip', magnitude: 1n, rounds: 1n, source: 'Slam' },
      });
      return;
    case 'warrior_shout':
      applyPartyEffect('damage_up', 2n, 3n, 'Shout');
      appendPrivateEvent(
        ctx,
        character.id,
        character.ownerUserId,
        'ability',
        'Your Shout rallies the party.'
      );
      return;
    case 'warrior_cleave':
      applyDamage(150n, 4n);
      return;
    case 'warrior_rally':
      applyPartyEffect('ac_bonus', 3n, 3n, 'Rally');
      appendPrivateEvent(
        ctx,
        character.id,
        character.ownerUserId,
        'ability',
        'Your Rally fortifies the party.'
      );
      return;
    case 'warrior_crushing_blow':
      applyDamage(175n, 5n, { threatBonus: 5n });
      return;
    case 'bard_discordant_note':
      applyPartyEffect('damage_up', 1n, 2n, 'Discordant Note');
      appendPrivateEvent(
        ctx,
        character.id,
        character.ownerUserId,
        'ability',
        'Discordant Note sharpens the party.'
      );
      return;
    case 'bard_song_of_ease':
      applyPartyEffect('stamina_regen', 3n, 3n, 'Song of Ease');
      appendPrivateEvent(
        ctx,
        character.id,
        character.ownerUserId,
        'ability',
        'Song of Ease restores the party.'
      );
      return;
    case 'bard_echoed_chord': {
      const allyBonus = BigInt(partyMembers.length - 1) > 0n ? BigInt(partyMembers.length - 1) : 0n;
      applyDamage(135n, 2n + allyBonus);
      return;
    }
    case 'bard_harmony':
      applyPartyEffect('damage_up', 2n, 3n, 'Harmony');
      appendPrivateEvent(
        ctx,
        character.id,
        character.ownerUserId,
        'ability',
        'Harmony steadies the party.'
      );
      return;
    case 'bard_crushing_crescendo': {
      let bonus = 5n;
      if (enemy && enemy.currentHp * 2n <= enemy.maxHp) bonus += 3n;
      applyDamage(165n, bonus);
      return;
    }
    case 'enchanter_mind_fray':
      applyDamage(105n, 1n, {
        dot: { magnitude: 2n, rounds: 2n, source: 'Mind Fray' },
        debuff: { type: 'damage_down', magnitude: -2n, rounds: 2n, source: 'Mind Fray' },
      });
      return;
    case 'enchanter_clarity':
      if (!targetCharacter) throw new SenderError('Target required');
      addCharacterEffect(ctx, targetCharacter.id, 'mana_regen', 4n, 3n, 'Clarity');
      appendPrivateEvent(
        ctx,
        character.id,
        character.ownerUserId,
        'ability',
        `Clarity restores ${targetCharacter.name}'s mana.`
      );
      return;
    case 'enchanter_slow':
      applyDamage(110n, 1n, {
        debuff: { type: 'damage_down', magnitude: -3n, rounds: 2n, source: 'Slow' },
      });
      return;
    case 'enchanter_clarity_ii':
      if (!targetCharacter) throw new SenderError('Target required');
      addCharacterEffect(ctx, targetCharacter.id, 'mana_regen', 6n, 3n, 'Clarity II');
      appendPrivateEvent(
        ctx,
        character.id,
        character.ownerUserId,
        'ability',
        `Clarity II restores ${targetCharacter.name}'s mana.`
      );
      return;
    case 'enchanter_charm_fray':
      applyDamage(140n, 3n, {
        debuff: { type: 'damage_down', magnitude: -2n, rounds: 2n, source: 'Charm Fray' },
      });
      return;
    case 'cleric_mend':
      if (!targetCharacter) throw new SenderError('Target required');
      applyHeal(targetCharacter, 10n, 'Mend');
      return;
    case 'cleric_blessing':
      if (!targetCharacter) throw new SenderError('Target required');
      applyHpBonus(ctx, targetCharacter, 10n, 3n, 'Blessing');
      appendPrivateEvent(
        ctx,
        character.id,
        character.ownerUserId,
        'ability',
        `Blessing fortifies ${targetCharacter.name}.`
      );
      return;
    case 'cleric_smite':
      applyDamage(130n, 2n);
      return;
    case 'cleric_sanctuary':
      applyPartyEffect('ac_bonus', 3n, 3n, 'Sanctuary');
      appendPrivateEvent(
        ctx,
        character.id,
        character.ownerUserId,
        'ability',
        'Sanctuary shelters the party.'
      );
      return;
    case 'cleric_heal':
      if (!targetCharacter) throw new SenderError('Target required');
      applyHeal(targetCharacter, 15n, 'Heal');
      return;
    case 'wizard_magic_missile':
      applyDamage(145n, 3n);
      return;
    case 'wizard_arcane_intellect':
      if (!targetCharacter) throw new SenderError('Target required');
      addCharacterEffect(ctx, targetCharacter.id, 'mana_regen', 4n, 3n, 'Arcane Intellect');
      appendPrivateEvent(
        ctx,
        character.id,
        character.ownerUserId,
        'ability',
        `Arcane Intellect bolsters ${targetCharacter.name}.`
      );
      return;
    case 'wizard_frost_shard':
      applyDamage(120n, 2n, {
        debuff: { type: 'damage_down', magnitude: -2n, rounds: 2n, source: 'Frost Shard' },
      });
      return;
    case 'wizard_mana_shield':
      if (!targetCharacter) throw new SenderError('Target required');
      addCharacterEffect(ctx, targetCharacter.id, 'ac_bonus', 3n, 3n, 'Mana Shield');
      appendPrivateEvent(
        ctx,
        character.id,
        character.ownerUserId,
        'ability',
        `Mana Shield protects ${targetCharacter.name}.`
      );
      return;
    case 'wizard_lightning_surge':
      applyDamage(170n, 5n);
      return;
    case 'rogue_shadow_cut':
      applyDamage(150n, 4n, { dot: { magnitude: 2n, rounds: 2n, source: 'Shadow Cut' } });
      return;
    case 'rogue_smoke_step': {
      const combatIdLocal = combatId;
      if (combatIdLocal) {
        for (const entry of ctx.db.aggroEntry.by_combat.filter(combatIdLocal)) {
          if (entry.characterId === character.id) {
            const reduced = entry.value > 10n ? entry.value - 10n : 0n;
            ctx.db.aggroEntry.id.update({ ...entry, value: reduced });
            break;
          }
        }
      }
      appendPrivateEvent(
        ctx,
        character.id,
        character.ownerUserId,
        'ability',
        'Smoke Step lowers your threat.'
      );
      return;
    }
    case 'rogue_bleed':
      applyDamage(110n, 2n, { dot: { magnitude: 3n, rounds: 2n, source: 'Bleed' } });
      return;
    case 'rogue_evasion':
      addCharacterEffect(ctx, character.id, 'ac_bonus', 3n, 2n, 'Evasion');
      appendPrivateEvent(
        ctx,
        character.id,
        character.ownerUserId,
        'ability',
        'Evasion heightens your defenses.'
      );
      return;
    case 'rogue_shadow_strike': {
      const dotAmount = enemy ? sumEnemyEffect(ctx, combatId ?? 0n, 'dot', enemy.id) : 0n;
      const bonus = dotAmount > 0n ? 6n : 4n;
      applyDamage(165n, bonus);
      return;
    }
    case 'paladin_holy_strike':
      applyDamage(120n, 1n);
      addCharacterEffect(ctx, character.id, 'ac_bonus', 2n, 2n, 'Holy Strike');
      appendPrivateEvent(
        ctx,
        character.id,
        character.ownerUserId,
        'ability',
        'Holy Strike steadies your guard.'
      );
      return;
    case 'paladin_prayer':
      applyPartyHpBonus(10n, 3n, 'Prayer');
      appendPrivateEvent(
        ctx,
        character.id,
        character.ownerUserId,
        'ability',
        'Prayer blesses the party.'
      );
      return;
    case 'paladin_shield_of_faith':
      if (!targetCharacter) throw new SenderError('Target required');
      addCharacterEffect(ctx, targetCharacter.id, 'ac_bonus', 3n, 3n, 'Shield of Faith');
      appendPrivateEvent(
        ctx,
        character.id,
        character.ownerUserId,
        'ability',
        `Shield of Faith protects ${targetCharacter.name}.`
      );
      return;
    case 'paladin_devotion':
      applyPartyEffect('damage_up', 3n, 3n, 'Devotion');
      appendPrivateEvent(
        ctx,
        character.id,
        character.ownerUserId,
        'ability',
        'Devotion inspires the party.'
      );
      return;
    case 'paladin_radiant_smite':
      applyDamage(160n, 4n, { dot: { magnitude: 2n, rounds: 2n, source: 'Radiant Smite' } });
      return;
    case 'ranger_marked_shot':
      applyDamage(135n, 2n, {
        debuff: { type: 'damage_taken', magnitude: 1n, rounds: 2n, source: 'Marked Shot' },
      });
      return;
    case 'ranger_track':
      applyPartyEffect('damage_up', 1n, 3n, 'Track');
      appendPrivateEvent(
        ctx,
        character.id,
        character.ownerUserId,
        'ability',
        'Track reveals a weakness in nearby foes.'
      );
      return;
    case 'ranger_rapid_shot':
      applyDamage(90n, 1n, { hits: 2n });
      return;
    case 'ranger_natures_balm':
      if (!targetCharacter) throw new SenderError('Target required');
      addCharacterEffect(ctx, targetCharacter.id, 'regen', 4n, 3n, "Nature's Balm");
      appendPrivateEvent(
        ctx,
        character.id,
        character.ownerUserId,
        'ability',
        `Nature's Balm mends ${targetCharacter.name}.`
      );
      return;
    case 'ranger_piercing_arrow':
      applyDamage(150n, 4n, { ignoreArmor: 5n });
      return;
    case 'necromancer_plague_spark':
      applyDamage(110n, 1n, { dot: { magnitude: 3n, rounds: 2n, source: 'Plague Spark' } });
      applyHeal(character, 2n, 'Plague Spark');
      return;
    case 'necromancer_siphon_vitality': {
      const healAmount = 8n;
      applyHeal(character, healAmount, 'Siphon Vitality');
      return;
    }
    case 'necromancer_wither':
      applyDamage(120n, 2n, { dot: { magnitude: 3n, rounds: 2n, source: 'Wither' } });
      return;
    case 'necromancer_bone_ward':
      addCharacterEffect(ctx, character.id, 'ac_bonus', 3n, 3n, 'Bone Ward');
      appendPrivateEvent(
        ctx,
        character.id,
        character.ownerUserId,
        'ability',
        'Bone Ward hardens your defenses.'
      );
      return;
    case 'necromancer_grave_surge':
      applyDamage(170n, 6n);
      return;
    case 'spellblade_arcane_slash':
      applyDamage(125n, 2n, {
        debuff: { type: 'armor_down', magnitude: -2n, rounds: 2n, source: 'Arcane Slash' },
      });
      return;
    case 'spellblade_focus':
      addCharacterEffect(ctx, character.id, 'damage_up', 3n, 3n, 'Focus');
      appendPrivateEvent(
        ctx,
        character.id,
        character.ownerUserId,
        'ability',
        'Focus sharpens your offense.'
      );
      return;
    case 'spellblade_runic_strike':
      applyDamage(150n, 3n, {
        debuff: { type: 'damage_down', magnitude: -2n, rounds: 2n, source: 'Runic Strike' },
      });
      return;
    case 'spellblade_ward':
      addCharacterEffect(ctx, character.id, 'ac_bonus', 3n, 3n, 'Ward');
      appendPrivateEvent(
        ctx,
        character.id,
        character.ownerUserId,
        'ability',
        'Ward surrounds you in arcane protection.'
      );
      return;
    case 'spellblade_spellstorm':
      applyDamage(85n, 1n, { hits: 3n });
      return;
    case 'beastmaster_pack_rush':
      applyDamage(120n, 2n, { hits: 2n });
      return;
    case 'beastmaster_pack_bond':
      applyPartyEffect('damage_up', 2n, 3n, 'Pack Bond');
      appendPrivateEvent(
        ctx,
        character.id,
        character.ownerUserId,
        'ability',
        'Pack Bond empowers the party.'
      );
      return;
    case 'beastmaster_beast_fang':
      applyDamage(145n, 3n, { dot: { magnitude: 2n, rounds: 2n, source: 'Beast Fang' } });
      return;
    case 'beastmaster_wild_howl':
      applyPartyEffect('damage_up', 3n, 3n, 'Wild Howl');
      appendPrivateEvent(
        ctx,
        character.id,
        character.ownerUserId,
        'ability',
        'Wild Howl emboldens the party.'
      );
      return;
    case 'beastmaster_alpha_assault':
      applyDamage(170n, 5n);
      return;
    case 'monk_crippling_kick':
      applyDamage(120n, 1n, {
        debuff: { type: 'damage_down', magnitude: -2n, rounds: 2n, source: 'Crippling Kick' },
      });
      return;
    case 'monk_meditation':
      addCharacterEffect(ctx, character.id, 'regen', 4n, 3n, 'Meditation');
      appendPrivateEvent(
        ctx,
        character.id,
        character.ownerUserId,
        'ability',
        'Meditation steadies your breathing.'
      );
      return;
    case 'monk_palm_strike':
      applyDamage(145n, 3n);
      return;
    case 'monk_inner_focus':
      addCharacterEffect(ctx, character.id, 'ac_bonus', 3n, 3n, 'Inner Focus');
      appendPrivateEvent(
        ctx,
        character.id,
        character.ownerUserId,
        'ability',
        'Inner Focus hardens your guard.'
      );
      return;
    case 'monk_tiger_flurry':
      applyDamage(85n, 1n, { hits: 3n });
      return;
    case 'druid_thorn_lash':
      applyDamage(110n, 1n, { dot: { magnitude: 2n, rounds: 2n, source: 'Thorn Lash' } });
      applyHeal(character, 3n, 'Thorn Lash');
      return;
    case 'druid_regrowth':
      if (!targetCharacter) throw new SenderError('Target required');
      applyHeal(targetCharacter, 10n, 'Regrowth');
      return;
    case 'druid_bramble':
      applyDamage(110n, 2n, { dot: { magnitude: 3n, rounds: 2n, source: 'Bramble' } });
      return;
    case 'druid_natures_gift':
      applyPartyHpBonus(8n, 3n, "Nature's Gift");
      appendPrivateEvent(
        ctx,
        character.id,
        character.ownerUserId,
        'ability',
        "Nature's Gift blesses the party."
      );
      return;
    case 'druid_wild_surge':
      applyDamage(165n, 5n);
      return;
    case 'reaver_blood_rend':
      {
        const dealt = applyDamage(160n, 3n);
        if (dealt > 0n) {
          const leech = (dealt * 30n) / 100n;
          applyHeal(character, leech > 0n ? leech : 1n, 'Blood Rend');
        }
      }
      return;
    case 'reaver_blood_pact':
      addCharacterEffect(ctx, character.id, 'damage_up', 3n, 3n, 'Blood Pact');
      appendPrivateEvent(
        ctx,
        character.id,
        character.ownerUserId,
        'ability',
        'Blood Pact fuels your offense.'
      );
      return;
    case 'reaver_soul_rend':
      applyDamage(150n, 3n, { dot: { magnitude: 3n, rounds: 2n, source: 'Soul Rend' } });
      return;
    case 'reaver_dread_aura':
      applyDamage(110n, 1n, {
        debuff: { type: 'damage_down', magnitude: -3n, rounds: 2n, source: 'Dread Aura' },
      });
      return;
    case 'reaver_oblivion':
      applyDamage(175n, 6n);
      return;
    case 'summoner_familiar_strike':
      applyDamage(110n, 1n);
      addCharacterEffect(ctx, character.id, 'mana_regen', 2n, 2n, 'Familiar Strike');
      appendPrivateEvent(
        ctx,
        character.id,
        character.ownerUserId,
        'ability',
        'Familiar Strike steadies your focus.'
      );
      return;
    case 'summoner_familiar':
      addCharacterEffect(ctx, character.id, 'mana_regen', 4n, 3n, 'Familiar');
      appendPrivateEvent(
        ctx,
        character.id,
        character.ownerUserId,
        'ability',
        'Familiar restores your mana.'
      );
      return;
    case 'summoner_conjured_spike':
      applyDamage(145n, 3n);
      return;
    case 'summoner_empower':
      applyPartyEffect('damage_up', 2n, 3n, 'Empower');
      appendPrivateEvent(
        ctx,
        character.id,
        character.ownerUserId,
        'ability',
        'Empower strengthens the party.'
      );
      return;
    case 'summoner_spectral_lance':
      applyDamage(170n, 5n);
      return;
    default:
      appendPrivateEvent(
        ctx,
        character.id,
        character.ownerUserId,
        'ability',
        `You use ${ability.name}.`
      );
  }
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
  const maxMana = usesMana(character.className)
    ? BASE_MANA + manaStat * 6n + gear.manaBonus
    : 0n;

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
  const clampedMana = maxMana === 0n ? 0n : character.mana > maxMana ? maxMana : character.mana;
  ctx.db.character.id.update({
    ...updated,
    hp: clampedHp,
    mana: clampedMana,
  });
}

function executeEnemyAbility(
  ctx: any,
  combatId: bigint,
  enemyId: bigint,
  abilityKey: string,
  targetCharacterId?: bigint
) {
  const combat = ctx.db.combatEncounter.id.find(combatId);
  if (!combat || combat.state !== 'active') return;
  const ability = ENEMY_ABILITIES[abilityKey as keyof typeof ENEMY_ABILITIES];
  if (!ability) return;
  const enemy = ctx.db.combatEnemy.id.find(enemyId);
  if (!enemy) return;
  const enemyTemplate = ctx.db.enemyTemplate.id.find(enemy.enemyTemplateId);
  const enemyName = enemyTemplate?.name ?? 'Enemy';
  const targetId = targetCharacterId ?? getTopAggroId(ctx, combatId, enemy.id);
  if (!targetId) return;
  const target = ctx.db.character.id.find(targetId);
  if (!target) return;

  if (ability.kind === 'dot') {
    addCharacterEffect(ctx, target.id, 'dot', ability.magnitude, ability.rounds, ability.name);
    appendPrivateEvent(
      ctx,
      target.id,
      target.ownerUserId,
      'damage',
      `${enemyName} uses ${ability.name} on you.`
    );
  } else if (ability.kind === 'debuff') {
    const effectType = (ability as any).effectType ?? 'ac_bonus';
    addCharacterEffect(ctx, target.id, effectType, ability.magnitude, ability.rounds, ability.name);
    appendPrivateEvent(
      ctx,
      target.id,
      target.ownerUserId,
      'ability',
      `${enemyName} afflicts you with ${ability.name}.`
    );
  }
}

const COMBAT_LOOP_INTERVAL_MICROS = 1_000_000n;
const DAY_DURATION_MICROS = 1_200_000_000n;
const NIGHT_DURATION_MICROS = 600_000_000n;
const DEFAULT_LOCATION_SPAWNS = 3;
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
      allowed: 'enchanter,necromancer,summoner,druid,shaman,monk,wizard',
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
      tier: 1n,
      isJunk: false,
      vendorValue: 3n,
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

  const accessoryTemplates = [
    { name: 'Rough Band', slot: 'earrings', rarity: 'common', stat: { dexBonus: 1n } },
    { name: 'Worn Cloak', slot: 'cloak', rarity: 'common', stat: { hpBonus: 3n } },
    { name: 'Traveler Necklace', slot: 'neck', rarity: 'common', stat: { wisBonus: 1n } },
    { name: 'Glimmer Ring', slot: 'earrings', rarity: 'uncommon', stat: { intBonus: 1n } },
    { name: 'Shaded Cloak', slot: 'cloak', rarity: 'uncommon', stat: { dexBonus: 1n } },
  ];

  for (const template of accessoryTemplates) {
    ctx.db.itemTemplate.insert({
      id: 0n,
      name: template.name,
      slot: template.slot,
      armorType: 'none',
      rarity: template.rarity,
      tier: 1n,
      isJunk: false,
      vendorValue: template.rarity === 'uncommon' ? 8n : 5n,
      requiredLevel: 1n,
      allowedClasses: 'any',
      strBonus: template.stat.strBonus ?? 0n,
      dexBonus: template.stat.dexBonus ?? 0n,
      chaBonus: template.stat.chaBonus ?? 0n,
      wisBonus: template.stat.wisBonus ?? 0n,
      intBonus: template.stat.intBonus ?? 0n,
      hpBonus: template.stat.hpBonus ?? 0n,
      manaBonus: template.stat.manaBonus ?? 0n,
      armorClassBonus: 0n,
      weaponBaseDamage: 0n,
      weaponDps: 0n,
    });
  }

  const junkTemplates = [
    { name: 'Rat Tail', vendorValue: 1n },
    { name: 'Torn Pelt', vendorValue: 2n },
    { name: 'Cracked Fang', vendorValue: 1n },
    { name: 'Ashen Bone', vendorValue: 2n },
  ];

  for (const junk of junkTemplates) {
    ctx.db.itemTemplate.insert({
      id: 0n,
      name: junk.name,
      slot: 'junk',
      armorType: 'none',
      rarity: 'common',
      tier: 1n,
      isJunk: true,
      vendorValue: junk.vendorValue,
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
      weaponBaseDamage: 0n,
      weaponDps: 0n,
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

function ensureLootTables(ctx: any) {
  if (tableHasRows(ctx.db.lootTable.iter())) return;

  const junkTemplates = [...ctx.db.itemTemplate.iter()].filter((row) => row.isJunk);
  const gearTemplates = [...ctx.db.itemTemplate.iter()].filter(
    (row) => !row.isJunk && row.tier <= 1n && row.requiredLevel <= 9n
  );

  const addTable = (
    terrainType: string,
    creatureType: string,
    junkChance: bigint,
    gearChance: bigint,
    goldMin: bigint,
    goldMax: bigint
  ) => {
    const table = ctx.db.lootTable.insert({
      id: 0n,
      terrainType,
      creatureType,
      tier: 1n,
      junkChance,
      gearChance,
      goldMin,
      goldMax,
    });
    for (const item of junkTemplates) {
      ctx.db.lootTableEntry.insert({
        id: 0n,
        lootTableId: table.id,
        itemTemplateId: item.id,
        weight: 10n,
      });
    }
    for (const item of gearTemplates) {
      ctx.db.lootTableEntry.insert({
        id: 0n,
        lootTableId: table.id,
        itemTemplateId: item.id,
        weight: item.rarity === 'uncommon' ? 3n : 6n,
      });
    }
  };

  const terrains = ['plains', 'woods', 'swamp', 'mountains', 'town', 'city', 'dungeon'];
  for (const terrain of terrains) {
    addTable(terrain, 'animal', 75n, 10n, 0n, 2n);
    addTable(terrain, 'beast', 65n, 15n, 0n, 3n);
    addTable(terrain, 'humanoid', 40n, 25n, 2n, 6n);
    addTable(terrain, 'undead', 55n, 20n, 1n, 4n);
    addTable(terrain, 'spirit', 50n, 20n, 1n, 4n);
    addTable(terrain, 'construct', 60n, 20n, 1n, 4n);
  }
}

function ensureVendorInventory(ctx: any) {
  if (tableHasRows(ctx.db.vendorInventory.iter())) return;
  const vendor = [...ctx.db.npc.iter()].find((row) => row.npcType === 'vendor');
  if (!vendor) return;
  const templates = [...ctx.db.itemTemplate.iter()].filter(
    (row) => !row.isJunk && row.tier <= 1n
  );
  for (const template of templates) {
    const price = template.vendorValue > 0n ? template.vendorValue * 6n : 10n;
    ctx.db.vendorInventory.insert({
      id: 0n,
      npcId: vendor.id,
      itemTemplateId: template.id,
      price,
    });
  }
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

function getWorldState(ctx: any) {
  return ctx.db.worldState.id.find(1n);
}

function isNightTime(ctx: any) {
  const world = getWorldState(ctx);
  return world?.isNight ?? false;
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

function findEnemyTemplateByName(ctx: any, name: string) {
  for (const row of ctx.db.enemyTemplate.iter()) {
    if (row.name.toLowerCase() === name.toLowerCase()) return row;
  }
  return null;
}

function scheduleCombatTick(ctx: any, combatId: bigint) {
  const nextAt = ctx.timestamp.microsSinceUnixEpoch + COMBAT_LOOP_INTERVAL_MICROS;
  ctx.db.combatLoopTick.insert({
    scheduledId: 0n,
    scheduledAt: ScheduleAt.time(nextAt),
    combatId,
  });
}

function ensureLocationEnemyTemplates(ctx: any) {
  for (const location of ctx.db.location.iter()) {
    let hasAny = false;
    for (const _row of ctx.db.locationEnemyTemplate.by_location.filter(location.id)) {
      hasAny = true;
      break;
    }
    if (hasAny) continue;
    const locationTerrain = (location.terrainType ?? '').trim().toLowerCase();
    for (const template of ctx.db.enemyTemplate.iter()) {
      const allowed = (template.terrainTypes ?? '')
        .split(',')
        .map((entry) => entry.trim().toLowerCase())
        .filter((entry) => entry.length > 0);
      if (allowed.length > 0 && locationTerrain && !allowed.includes(locationTerrain)) {
        continue;
      }
      ctx.db.locationEnemyTemplate.insert({
        id: 0n,
        locationId: location.id,
        enemyTemplateId: template.id,
      });
    }
  }
}

function spawnEnemy(
  ctx: any,
  locationId: bigint,
  targetLevel: bigint = 1n,
  avoidTemplateIds: bigint[] = []
): typeof EnemySpawn.rowType {
  const templates = [...ctx.db.locationEnemyTemplate.by_location.filter(locationId)];
  if (templates.length === 0) throw new SenderError('No enemy templates for location');

  const timePref = isNightTime(ctx) ? 'night' : 'day';
  const allCandidates = templates
    .map((ref) => ctx.db.enemyTemplate.id.find(ref.enemyTemplateId))
    .filter(Boolean) as (typeof EnemyTemplate.rowType)[];
  const timeFiltered = allCandidates.filter((template) => {
    const pref = (template.timeOfDay ?? '').trim().toLowerCase();
    if (!pref || pref === 'any') return true;
    return pref === timePref;
  });
  const candidates = timeFiltered.length > 0 ? timeFiltered : allCandidates;
  if (candidates.length === 0) throw new SenderError('Enemy template missing');

  const adjustedTarget = computeLocationTargetLevel(ctx, locationId, targetLevel);
  const minLevel = adjustedTarget > 1n ? adjustedTarget - 1n : 1n;
  const maxLevel = adjustedTarget + 1n;
  const filteredByLevel = candidates.filter(
    (candidate) => candidate.level >= minLevel && candidate.level <= maxLevel
  );
  const viable = filteredByLevel.length > 0 ? filteredByLevel : candidates;
  const avoidSet = new Set(avoidTemplateIds.map((id) => id.toString()));
  const nonAvoid = viable.filter((candidate) => !avoidSet.has(candidate.id.toString()));
  const pool = nonAvoid.length > 0 ? nonAvoid : viable;

  const diffFor = (candidate: typeof EnemyTemplate.rowType) =>
    candidate.level > adjustedTarget
      ? candidate.level - adjustedTarget
      : adjustedTarget - candidate.level;
  const weighted: { candidate: typeof EnemyTemplate.rowType; weight: bigint }[] = [];
  let totalWeight = 0n;
  for (const candidate of pool) {
    const diff = diffFor(candidate);
    const weight = 4n - (diff > 3n ? 3n : diff);
    const finalWeight = weight > 0n ? weight : 1n;
    weighted.push({ candidate, weight: finalWeight });
    totalWeight += finalWeight;
  }
  const seed =
    ctx.timestamp.microsSinceUnixEpoch + locationId + BigInt(pool.length) + BigInt(totalWeight);
  let roll = totalWeight > 0n ? seed % totalWeight : 0n;
  let chosen = weighted[0]?.candidate ?? pool[0];
  for (const entry of weighted) {
    if (roll < entry.weight) {
      chosen = entry.candidate;
      break;
    }
    roll -= entry.weight;
  }

  const minGroup = chosen.groupMin && chosen.groupMin > 0n ? chosen.groupMin : 1n;
  const maxGroup = chosen.groupMax && chosen.groupMax > 0n ? chosen.groupMax : minGroup;
  const groupRange = maxGroup > minGroup ? maxGroup - minGroup + 1n : 1n;
  const groupSeed = seed + chosen.id * 11n;
  const groupCount = minGroup + (groupSeed % groupRange);

  const spawn = ctx.db.enemySpawn.insert({
    id: 0n,
    locationId,
    enemyTemplateId: chosen.id,
    name: chosen.name,
    state: 'available',
    lockedCombatId: undefined,
    groupCount,
  });

  ctx.db.enemySpawn.id.update({
    ...spawn,
    name: `${chosen.name} #${spawn.id}`,
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
    if (spawn.groupCount === 0n) continue;
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

function ensureDayNightTickScheduled(ctx: any) {
  if (!tableHasRows(ctx.db.dayNightTick.iter())) {
    const world = getWorldState(ctx);
    const nextAt =
      world?.nextTransitionAtMicros ?? ctx.timestamp.microsSinceUnixEpoch + DAY_DURATION_MICROS;
    ctx.db.dayNightTick.insert({
      scheduledId: 0n,
      scheduledAt: ScheduleAt.time(nextAt),
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
    const availableTemplates: bigint[] = [];
    for (const row of ctx.db.enemySpawn.by_location.filter(locationId)) {
      if (row.state !== 'available') continue;
      availableTemplates.push(row.enemyTemplateId);
    }
    spawnEnemy(ctx, locationId, 1n, availableTemplates);
    available += 1;
  }
}

function respawnLocationSpawns(ctx: any, locationId: bigint, desired: number) {
  for (const row of ctx.db.enemySpawn.by_location.filter(locationId)) {
    if (row.state === 'available') {
      ctx.db.enemySpawn.id.delete(row.id);
    }
  }
  let count = 0;
  for (const _row of ctx.db.enemySpawn.by_location.filter(locationId)) {
    count += 1;
  }
  while (count < desired) {
    const existingTemplates: bigint[] = [];
    for (const row of ctx.db.enemySpawn.by_location.filter(locationId)) {
      existingTemplates.push(row.enemyTemplateId);
    }
    spawnEnemy(ctx, locationId, 1n, existingTemplates);
    count += 1;
  }
}

spacetimedb.reducer('tick_day_night', { arg: DayNightTick.rowType }, (ctx) => {
  const world = getWorldState(ctx);
  if (!world) return;
  const now = ctx.timestamp.microsSinceUnixEpoch;
  if (world.nextTransitionAtMicros > now) {
    ctx.db.dayNightTick.insert({
      scheduledId: 0n,
      scheduledAt: ScheduleAt.time(world.nextTransitionAtMicros),
    });
    return;
  }
  const nextIsNight = !world.isNight;
  const nextDuration = nextIsNight ? NIGHT_DURATION_MICROS : DAY_DURATION_MICROS;
  const nextTransition = now + nextDuration;
  ctx.db.worldState.id.update({
    ...world,
    isNight: nextIsNight,
    nextTransitionAtMicros: nextTransition,
  });
  const message = nextIsNight ? 'Night falls over the realm.' : 'Dawn breaks over the realm.';
  appendWorldEvent(ctx, 'world', message);
  for (const location of ctx.db.location.iter()) {
    respawnLocationSpawns(ctx, location.id, DEFAULT_LOCATION_SPAWNS);
  }
  ctx.db.dayNightTick.insert({
    scheduledId: 0n,
    scheduledAt: ScheduleAt.time(nextTransition),
  });
});

registerViews({
  spacetimedb,
  t,
  Player,
  FriendRequest,
  Friend,
  GroupInvite,
  EventGroup,
  GroupMember,
  CharacterEffect,
  CombatResult,
  CombatLoot,
  EventLocation,
  EventPrivate,
  NpcDialog,
  QuestInstance,
});

spacetimedb.init((ctx) => {
  if (!tableHasRows(ctx.db.location.iter())) {
    const starter = ctx.db.region.insert({
      id: 0n,
      name: 'Hollowmere Vale',
      dangerMultiplier: 100n,
      regionType: 'outdoor',
    });
    const border = ctx.db.region.insert({
      id: 0n,
      name: 'Embermarch Fringe',
      dangerMultiplier: 160n,
      regionType: 'outdoor',
    });
    const embermarchDepths = ctx.db.region.insert({
      id: 0n,
      name: 'Embermarch Depths',
      dangerMultiplier: 200n,
      regionType: 'dungeon',
    });

    const town = ctx.db.location.insert({
      id: 0n,
      name: 'Hollowmere',
      description: 'A misty river town with lantern-lit docks and a quiet market square.',
      zone: 'Starter',
      regionId: starter.id,
      levelOffset: 0n,
      isSafe: true,
      terrainType: 'town',
      bindStone: false,
    });
    const ashen = ctx.db.location.insert({
      id: 0n,
      name: 'Ashen Road',
      description: 'A cracked highway flanked by dead trees and drifting embers.',
      zone: 'Starter',
      regionId: starter.id,
      levelOffset: 1n,
      isSafe: false,
      terrainType: 'plains',
      bindStone: true,
    });
    const fogroot = ctx.db.location.insert({
      id: 0n,
      name: 'Fogroot Crossing',
      description: 'Twisted roots and slick stones mark a shadowy crossing.',
      zone: 'Starter',
      regionId: starter.id,
      levelOffset: 2n,
      isSafe: false,
      terrainType: 'swamp',
      bindStone: false,
    });
    const bramble = ctx.db.location.insert({
      id: 0n,
      name: 'Bramble Hollow',
      description: 'A dense thicket where tangled branches muffle the light.',
      zone: 'Starter',
      regionId: starter.id,
      levelOffset: 2n,
      isSafe: false,
      terrainType: 'woods',
      bindStone: false,
    });
    const gate = ctx.db.location.insert({
      id: 0n,
      name: 'Embermarch Gate',
      description: 'A scorched pass leading toward harsher lands.',
      zone: 'Border',
      regionId: border.id,
      levelOffset: 3n,
      isSafe: false,
      terrainType: 'mountains',
      bindStone: false,
    });
    const cinder = ctx.db.location.insert({
      id: 0n,
      name: 'Cinderwatch',
      description: 'Ash dunes and ember winds test the brave.',
      zone: 'Border',
      regionId: border.id,
      levelOffset: 5n,
      isSafe: false,
      terrainType: 'plains',
      bindStone: false,
    });
    const ashvault = ctx.db.location.insert({
      id: 0n,
      name: 'Ashvault Entrance',
      description: 'Blackened stone stairs descend into a sulfur-lit vault.',
      zone: 'Dungeon',
      regionId: embermarchDepths.id,
      levelOffset: 2n,
      isSafe: false,
      terrainType: 'dungeon',
      bindStone: false,
    });
    const sootveil = ctx.db.location.insert({
      id: 0n,
      name: 'Sootveil Hall',
      description: 'Echoing halls where soot clings to every surface.',
      zone: 'Dungeon',
      regionId: embermarchDepths.id,
      levelOffset: 3n,
      isSafe: false,
      terrainType: 'dungeon',
      bindStone: false,
    });
    const furnace = ctx.db.location.insert({
      id: 0n,
      name: 'Furnace Crypt',
      description: 'A heat-soaked crypt of iron coffins and smoldering braziers.',
      zone: 'Dungeon',
      regionId: embermarchDepths.id,
      levelOffset: 4n,
      isSafe: false,
      terrainType: 'dungeon',
      bindStone: false,
    });

    ctx.db.worldState.insert({
      id: 1n,
      startingLocationId: town.id,
      isNight: false,
      nextTransitionAtMicros: ctx.timestamp.microsSinceUnixEpoch + DAY_DURATION_MICROS,
    });

    connectLocations(ctx, town.id, ashen.id);
    connectLocations(ctx, ashen.id, fogroot.id);
    connectLocations(ctx, fogroot.id, bramble.id);
    connectLocations(ctx, fogroot.id, gate.id);
    connectLocations(ctx, gate.id, cinder.id);
    connectLocations(ctx, gate.id, ashvault.id);
    connectLocations(ctx, ashvault.id, sootveil.id);
    connectLocations(ctx, sootveil.id, furnace.id);
  }

  if (!tableHasRows(ctx.db.enemyTemplate.iter())) {
    const bogRat = ctx.db.enemyTemplate.insert({
      id: 0n,
      name: 'Bog Rat',
      role: 'tank',
      roleDetail: 'melee',
      abilityProfile: 'thick hide, taunt',
      terrainTypes: 'swamp',
      creatureType: 'animal',
      timeOfDay: 'any',
      socialGroup: 'animal',
      socialRadius: 2n,
      awareness: 'idle',
      groupMin: 1n,
      groupMax: 1n,
      armorClass: 12n,
      level: 1n,
      maxHp: 26n,
      baseDamage: 4n,
      xpReward: 12n,
    });
    const emberWisp = ctx.db.enemyTemplate.insert({
      id: 0n,
      name: 'Ember Wisp',
      role: 'dps',
      roleDetail: 'magic',
      abilityProfile: 'fire bolts, ignite',
      terrainTypes: 'plains,mountains',
      creatureType: 'spirit',
      timeOfDay: 'night',
      socialGroup: 'spirit',
      socialRadius: 1n,
      awareness: 'idle',
      groupMin: 1n,
      groupMax: 1n,
      armorClass: 8n,
      level: 2n,
      maxHp: 28n,
      baseDamage: 6n,
      xpReward: 20n,
    });
    const banditArcher = ctx.db.enemyTemplate.insert({
      id: 0n,
      name: 'Bandit Archer',
      role: 'dps',
      roleDetail: 'ranged',
      abilityProfile: 'rapid shot, bleed',
      terrainTypes: 'plains,woods',
      creatureType: 'humanoid',
      timeOfDay: 'day',
      socialGroup: 'humanoid',
      socialRadius: 3n,
      awareness: 'idle',
      groupMin: 1n,
      groupMax: 2n,
      armorClass: 8n,
      level: 2n,
      maxHp: 24n,
      baseDamage: 7n,
      xpReward: 18n,
    });
    const blightStalker = ctx.db.enemyTemplate.insert({
      id: 0n,
      name: 'Blight Stalker',
      role: 'dps',
      roleDetail: 'melee',
      abilityProfile: 'pounce, shred',
      terrainTypes: 'woods,swamp',
      creatureType: 'beast',
      timeOfDay: 'night',
      socialGroup: 'beast',
      socialRadius: 2n,
      awareness: 'idle',
      groupMin: 1n,
      groupMax: 1n,
      armorClass: 9n,
      level: 3n,
      maxHp: 30n,
      baseDamage: 8n,
      xpReward: 24n,
    });
    const graveAcolyte = ctx.db.enemyTemplate.insert({
      id: 0n,
      name: 'Grave Acolyte',
      role: 'healer',
      roleDetail: 'support',
      abilityProfile: 'mend, cleanse',
      terrainTypes: 'town,city',
      creatureType: 'undead',
      timeOfDay: 'night',
      socialGroup: 'undead',
      socialRadius: 3n,
      awareness: 'idle',
      groupMin: 1n,
      groupMax: 1n,
      armorClass: 9n,
      level: 2n,
      maxHp: 22n,
      baseDamage: 4n,
      xpReward: 18n,
    });
    const hexbinder = ctx.db.enemyTemplate.insert({
      id: 0n,
      name: 'Hexbinder',
      role: 'support',
      roleDetail: 'control',
      abilityProfile: 'weaken, slow, snare',
      terrainTypes: 'woods,swamp',
      creatureType: 'humanoid',
      timeOfDay: 'night',
      socialGroup: 'humanoid',
      socialRadius: 3n,
      awareness: 'idle',
      groupMin: 1n,
      groupMax: 1n,
      armorClass: 9n,
      level: 3n,
      maxHp: 26n,
      baseDamage: 5n,
      xpReward: 22n,
    });
    const thicketWolf = ctx.db.enemyTemplate.insert({
      id: 0n,
      name: 'Thicket Wolf',
      role: 'dps',
      roleDetail: 'melee',
      abilityProfile: 'pack bite, lunge',
      terrainTypes: 'woods,plains',
      creatureType: 'animal',
      timeOfDay: 'day',
      socialGroup: 'animal',
      socialRadius: 2n,
      awareness: 'idle',
      groupMin: 1n,
      groupMax: 1n,
      armorClass: 9n,
      level: 1n,
      maxHp: 22n,
      baseDamage: 4n,
      xpReward: 12n,
    });
    const marshCroaker = ctx.db.enemyTemplate.insert({
      id: 0n,
      name: 'Marsh Croaker',
      role: 'dps',
      roleDetail: 'melee',
      abilityProfile: 'tongue lash, croak',
      terrainTypes: 'swamp',
      creatureType: 'animal',
      timeOfDay: 'day',
      socialGroup: 'animal',
      socialRadius: 2n,
      awareness: 'idle',
      groupMin: 1n,
      groupMax: 1n,
      armorClass: 8n,
      level: 1n,
      maxHp: 20n,
      baseDamage: 3n,
      xpReward: 10n,
    });
    const dustHare = ctx.db.enemyTemplate.insert({
      id: 0n,
      name: 'Dust Hare',
      role: 'dps',
      roleDetail: 'melee',
      abilityProfile: 'dart, nip',
      terrainTypes: 'plains',
      creatureType: 'animal',
      timeOfDay: 'day',
      socialGroup: 'animal',
      socialRadius: 2n,
      awareness: 'idle',
      groupMin: 1n,
      groupMax: 1n,
      armorClass: 7n,
      level: 1n,
      maxHp: 18n,
      baseDamage: 3n,
      xpReward: 10n,
    });
    const ashJackal = ctx.db.enemyTemplate.insert({
      id: 0n,
      name: 'Ash Jackal',
      role: 'dps',
      roleDetail: 'melee',
      abilityProfile: 'snap, pack feint',
      terrainTypes: 'plains',
      creatureType: 'beast',
      timeOfDay: 'any',
      socialGroup: 'beast',
      socialRadius: 2n,
      awareness: 'idle',
      groupMin: 1n,
      groupMax: 1n,
      armorClass: 8n,
      level: 2n,
      maxHp: 24n,
      baseDamage: 6n,
      xpReward: 18n,
    });
    const thornSprite = ctx.db.enemyTemplate.insert({
      id: 0n,
      name: 'Thorn Sprite',
      role: 'support',
      roleDetail: 'magic',
      abilityProfile: 'sting, wither pollen',
      terrainTypes: 'woods',
      creatureType: 'spirit',
      timeOfDay: 'night',
      socialGroup: 'spirit',
      socialRadius: 1n,
      awareness: 'idle',
      groupMin: 1n,
      groupMax: 1n,
      armorClass: 8n,
      level: 2n,
      maxHp: 20n,
      baseDamage: 4n,
      xpReward: 16n,
    });
    const gloomStag = ctx.db.enemyTemplate.insert({
      id: 0n,
      name: 'Gloom Stag',
      role: 'tank',
      roleDetail: 'melee',
      abilityProfile: 'gore, bulwark',
      terrainTypes: 'woods',
      creatureType: 'beast',
      timeOfDay: 'any',
      socialGroup: 'beast',
      socialRadius: 2n,
      awareness: 'idle',
      groupMin: 1n,
      groupMax: 1n,
      armorClass: 12n,
      level: 3n,
      maxHp: 34n,
      baseDamage: 7n,
      xpReward: 24n,
    });
    const mireLeech = ctx.db.enemyTemplate.insert({
      id: 0n,
      name: 'Mire Leech',
      role: 'dps',
      roleDetail: 'melee',
      abilityProfile: 'drain, latch',
      terrainTypes: 'swamp',
      creatureType: 'beast',
      timeOfDay: 'any',
      socialGroup: 'beast',
      socialRadius: 2n,
      awareness: 'idle',
      groupMin: 1n,
      groupMax: 1n,
      armorClass: 9n,
      level: 2n,
      maxHp: 26n,
      baseDamage: 6n,
      xpReward: 18n,
    });
    const fenWitch = ctx.db.enemyTemplate.insert({
      id: 0n,
      name: 'Fen Witch',
      role: 'support',
      roleDetail: 'magic',
      abilityProfile: 'curse, mire ward',
      terrainTypes: 'swamp',
      creatureType: 'humanoid',
      timeOfDay: 'night',
      socialGroup: 'humanoid',
      socialRadius: 3n,
      awareness: 'idle',
      groupMin: 1n,
      groupMax: 1n,
      armorClass: 9n,
      level: 3n,
      maxHp: 28n,
      baseDamage: 6n,
      xpReward: 22n,
    });
    const graveSkirmisher = ctx.db.enemyTemplate.insert({
      id: 0n,
      name: 'Grave Skirmisher',
      role: 'dps',
      roleDetail: 'melee',
      abilityProfile: 'rusty slash, feint',
      terrainTypes: 'town,city',
      creatureType: 'undead',
      timeOfDay: 'day',
      socialGroup: 'undead',
      socialRadius: 3n,
      awareness: 'idle',
      groupMin: 1n,
      groupMax: 1n,
      armorClass: 9n,
      level: 2n,
      maxHp: 26n,
      baseDamage: 6n,
      xpReward: 18n,
    });
    const cinderSentinel = ctx.db.enemyTemplate.insert({
      id: 0n,
      name: 'Cinder Sentinel',
      role: 'tank',
      roleDetail: 'melee',
      abilityProfile: 'stone wall, slam',
      terrainTypes: 'mountains,plains',
      creatureType: 'construct',
      timeOfDay: 'day',
      socialGroup: 'construct',
      socialRadius: 1n,
      awareness: 'idle',
      groupMin: 1n,
      groupMax: 1n,
      armorClass: 13n,
      level: 3n,
      maxHp: 36n,
      baseDamage: 6n,
      xpReward: 26n,
    });
    const emberling = ctx.db.enemyTemplate.insert({
      id: 0n,
      name: 'Emberling',
      role: 'support',
      roleDetail: 'magic',
      abilityProfile: 'ember spark, kindle',
      terrainTypes: 'mountains,plains',
      creatureType: 'spirit',
      timeOfDay: 'day',
      socialGroup: 'spirit',
      socialRadius: 1n,
      awareness: 'idle',
      groupMin: 1n,
      groupMax: 1n,
      armorClass: 7n,
      level: 1n,
      maxHp: 18n,
      baseDamage: 4n,
      xpReward: 12n,
    });
    const frostboneAcolyte = ctx.db.enemyTemplate.insert({
      id: 0n,
      name: 'Frostbone Acolyte',
      role: 'healer',
      roleDetail: 'support',
      abilityProfile: 'ice mend, ward',
      terrainTypes: 'mountains,city',
      creatureType: 'undead',
      timeOfDay: 'night',
      socialGroup: 'undead',
      socialRadius: 3n,
      awareness: 'idle',
      groupMin: 1n,
      groupMax: 1n,
      armorClass: 9n,
      level: 4n,
      maxHp: 30n,
      baseDamage: 6n,
      xpReward: 30n,
    });
    const ridgeSkirmisher = ctx.db.enemyTemplate.insert({
      id: 0n,
      name: 'Ridge Skirmisher',
      role: 'dps',
      roleDetail: 'melee',
      abilityProfile: 'rock slash, feint',
      terrainTypes: 'mountains',
      creatureType: 'humanoid',
      timeOfDay: 'day',
      socialGroup: 'humanoid',
      socialRadius: 3n,
      awareness: 'idle',
      groupMin: 1n,
      groupMax: 1n,
      armorClass: 10n,
      level: 3n,
      maxHp: 28n,
      baseDamage: 7n,
      xpReward: 24n,
    });
    const emberhawk = ctx.db.enemyTemplate.insert({
      id: 0n,
      name: 'Emberhawk',
      role: 'dps',
      roleDetail: 'ranged',
      abilityProfile: 'burning dive',
      terrainTypes: 'mountains,plains',
      creatureType: 'beast',
      timeOfDay: 'day',
      socialGroup: 'beast',
      socialRadius: 2n,
      awareness: 'idle',
      groupMin: 1n,
      groupMax: 1n,
      armorClass: 9n,
      level: 4n,
      maxHp: 26n,
      baseDamage: 8n,
      xpReward: 30n,
    });
    const basaltBrute = ctx.db.enemyTemplate.insert({
      id: 0n,
      name: 'Basalt Brute',
      role: 'tank',
      roleDetail: 'melee',
      abilityProfile: 'stone slam, brace',
      terrainTypes: 'mountains',
      creatureType: 'construct',
      timeOfDay: 'any',
      socialGroup: 'construct',
      socialRadius: 1n,
      awareness: 'idle',
      groupMin: 1n,
      groupMax: 1n,
      armorClass: 14n,
      level: 4n,
      maxHp: 40n,
      baseDamage: 7n,
      xpReward: 32n,
    });
    const graveServant = ctx.db.enemyTemplate.insert({
      id: 0n,
      name: 'Grave Servant',
      role: 'tank',
      roleDetail: 'melee',
      abilityProfile: 'shield crush, watchful',
      terrainTypes: 'town,city',
      creatureType: 'undead',
      timeOfDay: 'night',
      socialGroup: 'undead',
      socialRadius: 3n,
      awareness: 'idle',
      groupMin: 1n,
      groupMax: 1n,
      armorClass: 12n,
      level: 3n,
      maxHp: 34n,
      baseDamage: 6n,
      xpReward: 24n,
    });
    const alleyShade = ctx.db.enemyTemplate.insert({
      id: 0n,
      name: 'Alley Shade',
      role: 'dps',
      roleDetail: 'melee',
      abilityProfile: 'shadow cut, vanish',
      terrainTypes: 'town,city',
      creatureType: 'undead',
      timeOfDay: 'night',
      socialGroup: 'undead',
      socialRadius: 3n,
      awareness: 'idle',
      groupMin: 1n,
      groupMax: 1n,
      armorClass: 10n,
      level: 4n,
      maxHp: 28n,
      baseDamage: 9n,
      xpReward: 30n,
    });
    const vaultSentinel = ctx.db.enemyTemplate.insert({
      id: 0n,
      name: 'Vault Sentinel',
      role: 'tank',
      roleDetail: 'melee',
      abilityProfile: 'iron guard, shield bash',
      terrainTypes: 'dungeon',
      creatureType: 'construct',
      timeOfDay: 'any',
      socialGroup: 'construct',
      socialRadius: 1n,
      awareness: 'idle',
      groupMin: 1n,
      groupMax: 1n,
      armorClass: 14n,
      level: 4n,
      maxHp: 42n,
      baseDamage: 7n,
      xpReward: 34n,
    });
    const sootboundMystic = ctx.db.enemyTemplate.insert({
      id: 0n,
      name: 'Sootbound Mystic',
      role: 'support',
      roleDetail: 'magic',
      abilityProfile: 'cinder hex, ember veil',
      terrainTypes: 'dungeon',
      creatureType: 'humanoid',
      timeOfDay: 'any',
      socialGroup: 'humanoid',
      socialRadius: 3n,
      awareness: 'idle',
      groupMin: 1n,
      groupMax: 1n,
      armorClass: 10n,
      level: 5n,
      maxHp: 36n,
      baseDamage: 8n,
      xpReward: 38n,
    });
    const emberPriest = ctx.db.enemyTemplate.insert({
      id: 0n,
      name: 'Ember Priest',
      role: 'healer',
      roleDetail: 'support',
      abilityProfile: 'ashen mend, warding flame',
      terrainTypes: 'dungeon',
      creatureType: 'humanoid',
      timeOfDay: 'any',
      socialGroup: 'humanoid',
      socialRadius: 3n,
      awareness: 'idle',
      groupMin: 1n,
      groupMax: 1n,
      armorClass: 11n,
      level: 5n,
      maxHp: 38n,
      baseDamage: 6n,
      xpReward: 36n,
    });
    const ashforgedRevenant = ctx.db.enemyTemplate.insert({
      id: 0n,
      name: 'Ashforged Revenant',
      role: 'dps',
      roleDetail: 'melee',
      abilityProfile: 'searing cleave, molten strike',
      terrainTypes: 'dungeon',
      creatureType: 'undead',
      timeOfDay: 'any',
      socialGroup: 'undead',
      socialRadius: 3n,
      awareness: 'idle',
      groupMin: 1n,
      groupMax: 1n,
      armorClass: 12n,
      level: 6n,
      maxHp: 48n,
      baseDamage: 10n,
      xpReward: 44n,
    });
    if (!tableHasRows(ctx.db.enemyAbility.iter())) {
      const addEnemyAbility = (
        templateId: bigint,
        abilityKey: string,
        name: string,
        kind: string,
        castSeconds: bigint,
        cooldownSeconds: bigint,
        targetRule: string
      ) => {
        ctx.db.enemyAbility.insert({
          id: 0n,
          enemyTemplateId: templateId,
          abilityKey,
          name,
          kind,
          castSeconds,
          cooldownSeconds,
          targetRule,
        });
      };
      addEnemyAbility(bogRat.id, 'poison_bite', 'Poison Bite', 'dot', 3n, 20n, 'aggro');
      addEnemyAbility(emberWisp.id, 'ember_burn', 'Ember Burn', 'dot', 2n, 18n, 'aggro');
      addEnemyAbility(banditArcher.id, 'bleeding_shot', 'Bleeding Shot', 'dot', 1n, 15n, 'aggro');
      addEnemyAbility(blightStalker.id, 'shadow_rend', 'Shadow Rend', 'dot', 2n, 18n, 'aggro');
      addEnemyAbility(graveAcolyte.id, 'sapping_chant', 'Sapping Chant', 'debuff', 2n, 20n, 'aggro');
      addEnemyAbility(hexbinder.id, 'withering_hex', 'Withering Hex', 'debuff', 2n, 20n, 'aggro');
      addEnemyAbility(thicketWolf.id, 'rending_bite', 'Rending Bite', 'dot', 1n, 12n, 'aggro');
      addEnemyAbility(marshCroaker.id, 'bog_slime', 'Bog Slime', 'dot', 1n, 12n, 'aggro');
      addEnemyAbility(dustHare.id, 'quick_nip', 'Quick Nip', 'dot', 1n, 10n, 'aggro');
      addEnemyAbility(ashJackal.id, 'scorching_snap', 'Scorching Snap', 'dot', 1n, 14n, 'aggro');
      addEnemyAbility(thornSprite.id, 'thorn_venom', 'Thorn Venom', 'dot', 2n, 16n, 'aggro');
      addEnemyAbility(gloomStag.id, 'crushing_gore', 'Crushing Gore', 'debuff', 2n, 18n, 'aggro');
      addEnemyAbility(mireLeech.id, 'blood_drain', 'Blood Drain', 'dot', 2n, 18n, 'aggro');
      addEnemyAbility(fenWitch.id, 'mire_curse', 'Mire Curse', 'debuff', 2n, 20n, 'aggro');
      addEnemyAbility(graveSkirmisher.id, 'rusty_bleed', 'Rusty Bleed', 'dot', 1n, 12n, 'aggro');
      addEnemyAbility(cinderSentinel.id, 'ember_slam', 'Ember Slam', 'debuff', 2n, 20n, 'aggro');
      addEnemyAbility(emberling.id, 'ember_spark', 'Ember Spark', 'dot', 1n, 12n, 'aggro');
      addEnemyAbility(frostboneAcolyte.id, 'chill_touch', 'Chill Touch', 'debuff', 2n, 18n, 'aggro');
      addEnemyAbility(ridgeSkirmisher.id, 'stone_cleave', 'Stone Cleave', 'dot', 1n, 14n, 'aggro');
      addEnemyAbility(emberhawk.id, 'searing_talon', 'Searing Talon', 'dot', 2n, 18n, 'aggro');
      addEnemyAbility(basaltBrute.id, 'quake_stomp', 'Quake Stomp', 'debuff', 2n, 22n, 'aggro');
      addEnemyAbility(graveServant.id, 'grave_shield_break', 'Grave Shield Break', 'debuff', 2n, 18n, 'aggro');
      addEnemyAbility(alleyShade.id, 'shadow_bleed', 'Shadow Bleed', 'dot', 2n, 18n, 'aggro');
      addEnemyAbility(vaultSentinel.id, 'vault_crush', 'Vault Crush', 'debuff', 2n, 20n, 'aggro');
      addEnemyAbility(sootboundMystic.id, 'soot_hex', 'Soot Hex', 'debuff', 2n, 18n, 'aggro');
      addEnemyAbility(emberPriest.id, 'cinder_blight', 'Cinder Blight', 'dot', 2n, 16n, 'aggro');
      addEnemyAbility(ashforgedRevenant.id, 'molten_bleed', 'Molten Bleed', 'dot', 3n, 20n, 'aggro');
    }
  }

  if (!tableHasRows(ctx.db.npc.iter())) {
    const hollowmere = [...ctx.db.location.iter()].find((row) => row.name === 'Hollowmere');
    if (hollowmere) {
      ctx.db.npc.insert({
        id: 0n,
        name: 'Marla the Guide',
        npcType: 'quest',
        locationId: hollowmere.id,
        description: 'A veteran scout who knows every trail between the river and the emberlands.',
        greeting: 'Welcome, traveler. The road is cruel, but I can help you find your footing.',
      });
      ctx.db.npc.insert({
        id: 0n,
        name: 'Elder Soren',
        npcType: 'lore',
        locationId: hollowmere.id,
        description: 'A stoic town elder with a gaze that weighs every word.',
        greeting: 'Hollowmere watches over its own. Keep your blade sharp and your wits sharper.',
      });
      ctx.db.npc.insert({
        id: 0n,
        name: 'Quartermaster Jyn',
        npcType: 'vendor',
        locationId: hollowmere.id,
        description: 'A brisk quartermaster tallying supplies near the lantern-lit market.',
        greeting: 'Supplies are tight. If you can help keep the roads safe, the town will remember.',
      });
    }
  }

  if (!tableHasRows(ctx.db.questTemplate.iter())) {
    const marla = [...ctx.db.npc.iter()].find((row) => row.name === 'Marla the Guide');
    const bogRat = findEnemyTemplateByName(ctx, 'Bog Rat');
    const thicketWolf = findEnemyTemplateByName(ctx, 'Thicket Wolf');
    if (marla && bogRat) {
      ctx.db.questTemplate.insert({
        id: 0n,
        name: 'Bog Rat Cleanup',
        npcId: marla.id,
        targetEnemyTemplateId: bogRat.id,
        requiredCount: 3n,
        minLevel: 1n,
        maxLevel: 3n,
        rewardXp: 40n,
      });
    }
    if (marla && thicketWolf) {
      ctx.db.questTemplate.insert({
        id: 0n,
        name: 'Thicket Wolf Cull',
        npcId: marla.id,
        targetEnemyTemplateId: thicketWolf.id,
        requiredCount: 4n,
        minLevel: 2n,
        maxLevel: 5n,
        rewardXp: 60n,
      });
    }
  }

  ensureStarterItemTemplates(ctx);
  ensureVendorInventory(ctx);
  ensureLootTables(ctx);

  ensureLocationEnemyTemplates(ctx);

  const desired = DEFAULT_LOCATION_SPAWNS;
  for (const location of ctx.db.location.iter()) {
    let count = 0;
    for (const _row of ctx.db.enemySpawn.by_location.filter(location.id)) {
      count += 1;
    }
    while (count < desired) {
      const existingTemplates: bigint[] = [];
      for (const row of ctx.db.enemySpawn.by_location.filter(location.id)) {
        existingTemplates.push(row.enemyTemplateId);
      }
      spawnEnemy(ctx, location.id, 1n, existingTemplates);
      count += 1;
    }
  }

  ensureHealthRegenScheduled(ctx);
  ensureEffectTickScheduled(ctx);
  ensureHotTickScheduled(ctx);
  ensureCastTickScheduled(ctx);
  ensureDayNightTickScheduled(ctx);
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
  ensureDayNightTickScheduled(ctx);
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
  CombatLoopTick,
  PullState,
  PullTick,
  HealthRegenTick,
  EffectTick,
  HotTick,
  CastTick,
  DayNightTick,
  EnemyAbility,
  CombatEnemyCooldown,
  CombatEnemyCast,
  CombatPendingAdd,
  AggroEntry,
  requirePlayerUserId,
  requireCharacterOwnedBy,
  findCharacterByName,
  friendUserIds,
  appendPrivateEvent,
  appendNpcDialog,
  appendGroupEvent,
  appendLocationEvent,
  ensureSpawnsForLocation,
  ensureAvailableSpawn,
  computeEnemyStats,
  activeCombatIdForCharacter,
  scheduleCombatTick,
  recomputeCharacterDerived,
  executeAbility,
  executeEnemyAbility,
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
  enemyAbilityCastMicros,
  enemyAbilityCooldownMicros,
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
  rollAttackOutcome,
  hasShieldEquipped,
  canParry,
  usesMana,
};

registerReducers(reducerDeps);












