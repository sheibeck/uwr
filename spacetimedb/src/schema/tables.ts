import { schema, table, t } from 'spacetimedb/server';

export const Player = table(
  { name: 'player', public: true },
  {
    id: t.identity().primaryKey(),
    createdAt: t.timestamp(),
    lastSeenAt: t.timestamp(),
    displayName: t.string().optional(),
    activeCharacterId: t.u64().optional(),
    userId: t.u64().optional(),
    sessionStartedAt: t.timestamp().optional(),
    lastActivityAt: t.timestamp().optional(),
  }
);

export const User = table(
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

export const FriendRequest = table(
  {
    name: 'friend_request',
    public: true,
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

export const Friend = table(
  {
    name: 'friend',
    public: true,
    indexes: [{ name: 'by_user', algorithm: 'btree', columns: ['userId'] }],
  },
  {
    id: t.u64().primaryKey().autoInc(),
    userId: t.u64(),
    friendUserId: t.u64(),
    createdAt: t.timestamp(),
  }
);

export const WorldState = table(
  { name: 'world_state', public: true },
  {
    id: t.u64().primaryKey(),
    startingLocationId: t.u64(),
    isNight: t.bool(),
    nextTransitionAtMicros: t.u64(),
  }
);

export const Region = table(
  { name: 'region', public: true },
  {
    id: t.u64().primaryKey().autoInc(),
    name: t.string(),
    dangerMultiplier: t.u64(),
    regionType: t.string(),
  }
);

export const Location = table(
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
    craftingAvailable: t.bool(),
  }
);

export const LocationConnection = table(
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

export const Npc = table(
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
    factionId: t.u64().optional(),
    personalityJson: t.string().optional(),
    baseMood: t.string().optional(),
  }
);

export const NpcDialog = table(
  {
    name: 'npc_dialog',
    public: true,
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

export const QuestTemplate = table(
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
    questType: t.string().optional(),          // 'kill' | 'kill_loot' | 'explore' | 'delivery' | 'boss_kill'; undefined = 'kill'
    targetLocationId: t.u64().optional(),      // for explore/delivery quests
    targetNpcId: t.u64().optional(),           // for delivery quest turn-in target NPC
    targetItemName: t.string().optional(),     // display name of the loot item (kill_loot quests)
    itemDropChance: t.u64().optional(),        // per-kill drop chance as integer percent (e.g., 25 = 25%)
  }
);

export const QuestItem = table(
  {
    name: 'quest_item',
    public: true,
    indexes: [
      { name: 'by_character', algorithm: 'btree', columns: ['characterId'] },
      { name: 'by_location', algorithm: 'btree', columns: ['locationId'] },
    ],
  },
  {
    id: t.u64().primaryKey().autoInc(),
    characterId: t.u64(),
    questTemplateId: t.u64(),
    locationId: t.u64(),
    name: t.string(),
    discovered: t.bool(),     // true when search reveals it
    looted: t.bool(),         // true when character loots it
  }
);

export const NamedEnemy = table(
  {
    name: 'named_enemy',
    public: true,
    indexes: [
      { name: 'by_character', algorithm: 'btree', columns: ['characterId'] },
      { name: 'by_location', algorithm: 'btree', columns: ['locationId'] },
    ],
  },
  {
    id: t.u64().primaryKey().autoInc(),
    characterId: t.u64(),
    name: t.string(),
    enemyTemplateId: t.u64(),
    locationId: t.u64(),
    isAlive: t.bool(),
    lastKilledAt: t.timestamp().optional(),
    respawnMinutes: t.u64(),
  }
);

export const SearchResult = table(
  {
    name: 'search_result',
    public: true,
    indexes: [
      { name: 'by_character', algorithm: 'btree', columns: ['characterId'] },
    ],
  },
  {
    id: t.u64().primaryKey().autoInc(),
    characterId: t.u64(),
    locationId: t.u64(),
    foundResources: t.bool(),
    foundQuestItem: t.bool(),
    questItemId: t.u64().optional(),
    foundNamedEnemy: t.bool(),
    namedEnemyId: t.u64().optional(),
    searchedAt: t.timestamp(),
  }
);

export const QuestInstance = table(
  {
    name: 'quest_instance',
    public: true,
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

export const Character = table(
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
    racialSpellDamage: t.u64().optional(),
    racialPhysDamage: t.u64().optional(),
    racialMaxHp: t.u64().optional(),
    racialMaxMana: t.u64().optional(),
    racialManaRegen: t.u64().optional(),
    racialStaminaRegen: t.u64().optional(),
    racialCritBonus: t.u64().optional(),
    racialArmorBonus: t.u64().optional(),
    racialDodgeBonus: t.u64().optional(),
    racialHpRegen: t.u64().optional(),
    racialMaxStamina: t.u64().optional(),
    racialTravelCostIncrease: t.u64().optional(),
    racialTravelCostDiscount: t.u64().optional(),
    racialHitBonus: t.u64().optional(),
    racialParryBonus: t.u64().optional(),
    racialFactionBonus: t.u64().optional(),
    racialMagicResist: t.u64().optional(),
    racialPerceptionBonus: t.u64().optional(),
    racialLootBonus: t.u64().optional(),
  }
);

export const ItemTemplate = table(
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
    magicResistanceBonus: t.u64(),
    weaponBaseDamage: t.u64(),
    weaponDps: t.u64(),
    weaponType: t.string(),
    stackable: t.bool(),
    wellFedDurationMicros: t.u64(),
    wellFedBuffType: t.string(),
    wellFedBuffMagnitude: t.u64(),
    description: t.string().optional(), // Flavor text / metadata description
  }
);

export const ItemInstance = table(
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
    quantity: t.u64(),
    qualityTier: t.string().optional(),   // 'common' | 'uncommon' | 'rare' | 'epic' | 'legendary'; undefined = 'common'
    craftQuality: t.string().optional(), // 'dented'|'standard'|'reinforced'|'exquisite'|'mastercraft'; undefined = 'standard'
    displayName: t.string().optional(),   // null for common, e.g., 'Sturdy Scout Jerkin of Haste'
    isNamed: t.bool().optional(),         // true only for Legendary unique items
    isTemporary: t.bool().optional(),     // true for Summoner Conjure Equipment items — deleted on logout
  }
);

export const ItemAffix = table(
  {
    name: 'item_affix',
    public: true,
    indexes: [{ name: 'by_instance', algorithm: 'btree', columns: ['itemInstanceId'] }],
  },
  {
    id: t.u64().primaryKey().autoInc(),
    itemInstanceId: t.u64(),
    affixType: t.string(),     // 'prefix' | 'suffix'
    affixKey: t.string(),      // e.g., 'sturdy', 'of_haste'
    affixName: t.string(),     // display name, e.g., 'Sturdy', 'of Haste'
    statKey: t.string(),       // e.g., 'strBonus', 'lifeOnHit', 'cooldownReduction'
    magnitude: t.i64(),        // fixed per tier; positive = bonus
  }
);

export const RecipeTemplate = table(
  { name: 'recipe_template', public: true },
  {
    id: t.u64().primaryKey().autoInc(),
    key: t.string(),
    name: t.string(),
    outputTemplateId: t.u64(),
    outputCount: t.u64(),
    req1TemplateId: t.u64(),
    req1Count: t.u64(),
    req2TemplateId: t.u64(),
    req2Count: t.u64(),
    req3TemplateId: t.u64().optional(),
    req3Count: t.u64().optional(),
    recipeType: t.string().optional(),      // 'weapon' | 'armor' | 'accessory' | 'consumable'
    materialType: t.string().optional(),    // e.g. 'darksteel_ore'; undefined for consumables
  }
);

export const RecipeDiscovered = table(
  {
    name: 'recipe_discovered',
    public: true,
    indexes: [{ name: 'by_character', algorithm: 'btree', columns: ['characterId'] }],
  },
  {
    id: t.u64().primaryKey().autoInc(),
    characterId: t.u64(),
    recipeTemplateId: t.u64(),
    discoveredAt: t.timestamp(),
  }
);

export const ItemCooldown = table(
  {
    name: 'item_cooldown',
    public: true,
    indexes: [{ name: 'by_character', algorithm: 'btree', columns: ['characterId'] }],
  },
  {
    id: t.u64().primaryKey().autoInc(),
    characterId: t.u64(),
    itemKey: t.string(),
    readyAtMicros: t.u64(),
  }
);

export const ResourceNode = table(
  {
    name: 'resource_node',
    public: true,
    indexes: [
      { name: 'by_location', algorithm: 'btree', columns: ['locationId'] },
      { name: 'by_character', algorithm: 'btree', columns: ['characterId'] },
    ],
  },
  {
    id: t.u64().primaryKey().autoInc(),
    locationId: t.u64(),
    characterId: t.u64().optional(),
    itemTemplateId: t.u64(),
    name: t.string(),
    timeOfDay: t.string(),
    quantity: t.u64(),
    state: t.string(),
    lockedByCharacterId: t.u64().optional(),
    respawnAtMicros: t.u64().optional(),
  }
);

export const ResourceGather = table(
  {
    name: 'resource_gather',
    public: true,
    indexes: [{ name: 'by_character', algorithm: 'btree', columns: ['characterId'] }],
  },
  {
    id: t.u64().primaryKey().autoInc(),
    characterId: t.u64(),
    nodeId: t.u64(),
    endsAtMicros: t.u64(),
  }
);

export const ResourceGatherTick = table(
  {
    name: 'resource_gather_tick',
    scheduled: 'finish_gather',
  },
  {
    scheduledId: t.u64().primaryKey().autoInc(),
    scheduledAt: t.scheduleAt(),
    gatherId: t.u64(),
  }
);

export const EnemyRespawnTick = table(
  {
    name: 'enemy_respawn_tick',
    scheduled: 'respawn_enemy',
  },
  {
    scheduledId: t.u64().primaryKey().autoInc(),
    scheduledAt: t.scheduleAt(),
    locationId: t.u64(),
  }
);

export const TradeSession = table(
  {
    name: 'trade_session',
    public: true,
    indexes: [
      { name: 'by_from', algorithm: 'btree', columns: ['fromCharacterId'] },
      { name: 'by_to', algorithm: 'btree', columns: ['toCharacterId'] },
    ],
  },
  {
    id: t.u64().primaryKey().autoInc(),
    fromCharacterId: t.u64(),
    toCharacterId: t.u64(),
    state: t.string(),
    fromAccepted: t.bool(),
    toAccepted: t.bool(),
    createdAt: t.timestamp(),
  }
);

export const TradeItem = table(
  {
    name: 'trade_item',
    public: true,
    indexes: [
      { name: 'by_trade', algorithm: 'btree', columns: ['tradeId'] },
      { name: 'by_character', algorithm: 'btree', columns: ['fromCharacterId'] },
    ],
  },
  {
    id: t.u64().primaryKey().autoInc(),
    tradeId: t.u64(),
    fromCharacterId: t.u64(),
    itemInstanceId: t.u64(),
    quantity: t.u64(),
  }
);

export const CombatLoot = table(
  {
    name: 'combat_loot',
    public: true,
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
    qualityTier: t.string().optional(),    // rolled rarity, e.g., 'uncommon'
    affixDataJson: t.string().optional(),  // JSON array of affix keys to apply at take time
    isNamed: t.bool().optional(),          // true for Legendary uniques
    craftQuality: t.string().optional(),   // rolled craftsmanship quality, e.g., 'reinforced'
  }
);

export const HotbarSlot = table(
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

export const AbilityTemplate = table(
  {
    name: 'ability_template',
    public: true,
    indexes: [
      { name: 'by_key', algorithm: 'btree', columns: ['key'] },
      { name: 'by_class', algorithm: 'btree', columns: ['className'] },
    ],
  },
  {
    id: t.u64().primaryKey().autoInc(),
    key: t.string(),
    name: t.string(),
    className: t.string(),
    level: t.u64(),
    resource: t.string(),
    castSeconds: t.u64(),
    cooldownSeconds: t.u64(),
    kind: t.string(),
    combatState: t.string(),
    description: t.string(),
    power: t.u64().optional(),
    damageType: t.string().optional(),
    statScaling: t.string().optional(),
    dotPowerSplit: t.f64().optional(),
    dotDuration: t.u64().optional(),
    hotPowerSplit: t.f64().optional(),
    hotDuration: t.u64().optional(),
    debuffType: t.string().optional(),
    debuffMagnitude: t.i64().optional(),
    debuffDuration: t.u64().optional(),
    aoeTargets: t.string().optional(),
    resourceCost: t.u64(),
  }
);

export const AbilityCooldown = table(
  {
    name: 'ability_cooldown',
    public: true,
    indexes: [{ name: 'by_character', algorithm: 'btree', columns: ['characterId'] }],
  },
  {
    id: t.u64().primaryKey().autoInc(),
    characterId: t.u64(),
    abilityKey: t.string(),
    startedAtMicros: t.u64(),
    durationMicros: t.u64(),
  }
);

export const CharacterCast = table(
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

export const Group = table(
  { name: 'group', public: true },
  {
    id: t.u64().primaryKey().autoInc(),
    name: t.string(),
    leaderCharacterId: t.u64(),
    pullerCharacterId: t.u64().optional(),
    createdAt: t.timestamp(),
  }
);

export const GroupMember = table(
  {
    name: 'group_member',
    public: true,
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

export const GroupInvite = table(
  {
    name: 'group_invite',
    public: true,
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

export const EnemyTemplate = table(
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
    factionId: t.u64().optional(),
    isBoss: t.bool().optional(),
    isSocial: t.bool().optional(),
  }
);

export const EnemyRoleTemplate = table(
  {
    name: 'enemy_role_template',
    public: true,
    indexes: [{ name: 'by_template', algorithm: 'btree', columns: ['enemyTemplateId'] }],
  },
  {
    id: t.u64().primaryKey().autoInc(),
    enemyTemplateId: t.u64(),
    roleKey: t.string(),
    displayName: t.string(),
    role: t.string(),
    roleDetail: t.string(),
    abilityProfile: t.string(),
  }
);

export const EnemyAbility = table(
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

export const CombatEnemyCooldown = table(
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

export const VendorInventory = table(
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
    qualityTier: t.string().optional(),  // 'common' | 'uncommon' | 'rare' | 'epic' | 'legendary'; undefined = 'common'
  }
);

export const LootTable = table(
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

export const LootTableEntry = table(
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

export const LocationEnemyTemplate = table(
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

export const EnemySpawn = table(
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

export const EnemySpawnMember = table(
  {
    name: 'enemy_spawn_member',
    public: true,
    indexes: [{ name: 'by_spawn', algorithm: 'btree', columns: ['spawnId'] }],
  },
  {
    id: t.u64().primaryKey().autoInc(),
    spawnId: t.u64(),
    enemyTemplateId: t.u64(),
    roleTemplateId: t.u64(),
  }
);

export const PullState = table(
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

export const PullTick = table(
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


export const CombatEnemyCast = table(
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
    targetPetId: t.u64().optional(),
  }
);

export const CombatEncounter = table(
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

export const CombatParticipant = table(
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

export const CombatEnemy = table(
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
    enemyRoleTemplateId: t.u64().optional(),
    displayName: t.string(),
    currentHp: t.u64(),
    maxHp: t.u64(),
    attackDamage: t.u64(),
    armorClass: t.u64(),
    aggroTargetCharacterId: t.u64().optional(),
    aggroTargetPetId: t.u64().optional(),
    nextAutoAttackAt: t.u64(),
  }
);

export const ActivePet = table(
  {
    name: 'active_pet',
    public: true,
    indexes: [
      { name: 'by_character', algorithm: 'btree', columns: ['characterId'] },
      { name: 'by_combat', algorithm: 'btree', columns: ['combatId'] },
    ],
  },
  {
    id: t.u64().primaryKey().autoInc(),
    characterId: t.u64(),
    combatId: t.u64().optional(),
    name: t.string(),
    level: t.u64(),
    currentHp: t.u64(),
    maxHp: t.u64(),
    attackDamage: t.u64(),
    abilityKey: t.string().optional(),
    nextAbilityAt: t.u64().optional(),
    abilityCooldownSeconds: t.u64().optional(),
    targetEnemyId: t.u64().optional(),
    nextAutoAttackAt: t.u64().optional(),
  }
);

export const CharacterEffect = table(
  {
    name: 'character_effect',
    public: true,
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

export const CombatEnemyEffect = table(
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
    ownerCharacterId: t.u64().optional(),  // for life drain DoTs — character that receives the heal
  }
);

export const CombatPendingAdd = table(
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
    enemyRoleTemplateId: t.u64().optional(),
    spawnId: t.u64().optional(),
    arriveAtMicros: t.u64(),
  }
);

export const CombatResult = table(
  {
    name: 'combat_result',
    public: true,
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

export const AggroEntry = table(
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
    petId: t.u64().optional(),
    value: t.u64(),
  }
);

export const CombatLoopTick = table(
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

export const HealthRegenTick = table(
  {
    name: 'health_regen_tick',
    scheduled: 'regen_health',
  },
  {
    scheduledId: t.u64().primaryKey().autoInc(),
    scheduledAt: t.scheduleAt(),
  }
);

// HungerDecayTick removed - no hunger decay system

export const EffectTick = table(
  {
    name: 'effect_tick',
    scheduled: 'tick_effects',
  },
  {
    scheduledId: t.u64().primaryKey().autoInc(),
    scheduledAt: t.scheduleAt(),
  }
);

export const HotTick = table(
  {
    name: 'hot_tick',
    scheduled: 'tick_hot',
  },
  {
    scheduledId: t.u64().primaryKey().autoInc(),
    scheduledAt: t.scheduleAt(),
  }
);

export const CastTick = table(
  {
    name: 'cast_tick',
    scheduled: 'tick_casts',
  },
  {
    scheduledId: t.u64().primaryKey().autoInc(),
    scheduledAt: t.scheduleAt(),
  }
);

export const DayNightTick = table(
  {
    name: 'day_night_tick',
    scheduled: 'tick_day_night',
  },
  {
    scheduledId: t.u64().primaryKey().autoInc(),
    scheduledAt: t.scheduleAt(),
  }
);

export const DisconnectLogoutTick = table(
  {
    name: 'disconnect_logout_tick',
    scheduled: 'disconnect_logout',
  },
  {
    scheduledId: t.u64().primaryKey().autoInc(),
    scheduledAt: t.scheduleAt(),
    playerId: t.identity(),
    disconnectAtMicros: t.u64(),
  }
);

export const CharacterLogoutTick = table(
  {
    name: 'character_logout_tick',
    public: true,
    scheduled: 'character_logout',
  },
  {
    scheduledId: t.u64().primaryKey().autoInc(),
    scheduledAt: t.scheduleAt(),
    characterId: t.u64(),
    ownerUserId: t.u64(),
    logoutAtMicros: t.u64(),
  }
);

export const Command = table(
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

export const EventWorld = table(
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

export const EventLocation = table(
  {
    name: 'event_location',
    public: true,
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

export const EventPrivate = table(
  {
    name: 'event_private',
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
    message: t.string(),
    kind: t.string(),
    createdAt: t.timestamp(),
  }
);

export const EventGroup = table(
  {
    name: 'event_group',
    public: true,
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

export const Race = table(
  { name: 'race', public: true },
  {
    id: t.u64().primaryKey().autoInc(),
    name: t.string(),
    description: t.string(),
    availableClasses: t.string(),
    bonus1Type: t.string(),
    bonus1Value: t.u64(),
    bonus2Type: t.string(),
    bonus2Value: t.u64(),
    penaltyType: t.string().optional(),
    penaltyValue: t.u64().optional(),
    levelBonusType: t.string(),
    levelBonusValue: t.u64(),
    unlocked: t.bool(),
  }
);

// Hunger table removed - food system now uses CharacterEffect for buffs

export const Faction = table(
  { name: 'faction', public: true },
  {
    id: t.u64().primaryKey().autoInc(),
    name: t.string(),
    description: t.string(),
    rivalFactionId: t.u64().optional(),
  }
);

export const FactionStanding = table(
  {
    name: 'faction_standing',
    public: true,
    indexes: [
      { name: 'by_character', algorithm: 'btree', columns: ['characterId'] },
    ],
  },
  {
    id: t.u64().primaryKey().autoInc(),
    characterId: t.u64(),
    factionId: t.u64(),
    standing: t.i64(),
  }
);

export const UiPanelLayout = table(
  {
    name: 'ui_panel_layout',
    public: true,
    indexes: [{ name: 'by_character', algorithm: 'btree', columns: ['characterId'] }],
  },
  {
    id: t.u64().primaryKey().autoInc(),
    characterId: t.u64(),
    panelStatesJson: t.string(),
    updatedAt: t.timestamp(),
  }
);

export const TravelCooldown = table(
  {
    name: 'travel_cooldown',
    public: true,
    indexes: [{ name: 'by_character', algorithm: 'btree', columns: ['characterId'] }],
  },
  {
    id: t.u64().primaryKey().autoInc(),
    characterId: t.u64(),
    readyAtMicros: t.u64(),
  }
);

export const Renown = table(
  {
    name: 'renown',
    public: true,
    indexes: [{ name: 'by_character', algorithm: 'btree', columns: ['characterId'] }],
  },
  {
    id: t.u64().primaryKey().autoInc(),
    characterId: t.u64(),
    points: t.u64(),
    currentRank: t.u64(),
    updatedAt: t.timestamp(),
  }
);

export const RenownPerk = table(
  {
    name: 'renown_perk',
    public: true,
    indexes: [{ name: 'by_character', algorithm: 'btree', columns: ['characterId'] }],
  },
  {
    id: t.u64().primaryKey().autoInc(),
    characterId: t.u64(),
    rank: t.u64(),
    perkKey: t.string(),
    chosenAt: t.timestamp(),
  }
);

export const RenownServerFirst = table(
  {
    name: 'renown_server_first',
    public: true,
    indexes: [{ name: 'by_category', algorithm: 'btree', columns: ['category'] }],
  },
  {
    id: t.u64().primaryKey().autoInc(),
    category: t.string(),
    achievementKey: t.string(),
    characterId: t.u64(),
    characterName: t.string(),
    achievedAt: t.timestamp(),
    position: t.u64(),
  }
);

export const Achievement = table(
  {
    name: 'achievement',
    public: true,
    indexes: [{ name: 'by_character', algorithm: 'btree', columns: ['characterId'] }],
  },
  {
    id: t.u64().primaryKey().autoInc(),
    characterId: t.u64(),
    achievementKey: t.string(),
    achievedAt: t.timestamp(),
  }
);

export const Corpse = table(
  {
    name: 'corpse',
    public: true,
    indexes: [
      { name: 'by_character', algorithm: 'btree', columns: ['characterId'] },
      { name: 'by_location', algorithm: 'btree', columns: ['locationId'] },
    ],
  },
  {
    id: t.u64().primaryKey().autoInc(),
    characterId: t.u64(),
    locationId: t.u64(),
    createdAt: t.timestamp(),
  }
);

export const CorpseItem = table(
  {
    name: 'corpse_item',
    public: true,
    indexes: [{ name: 'by_corpse', algorithm: 'btree', columns: ['corpseId'] }],
  },
  {
    id: t.u64().primaryKey().autoInc(),
    corpseId: t.u64(),
    itemInstanceId: t.u64(),
  }
);

export const PendingSpellCast = table(
  {
    name: 'pending_spell_cast',
    public: true,
    indexes: [
      { name: 'by_target', algorithm: 'btree', columns: ['targetCharacterId'] },
      { name: 'by_caster', algorithm: 'btree', columns: ['casterCharacterId'] },
    ],
  },
  {
    id: t.u64().primaryKey().autoInc(),
    spellType: t.string(),  // 'resurrect' | 'corpse_summon'
    casterCharacterId: t.u64(),
    targetCharacterId: t.u64(),
    corpseId: t.u64().optional(),  // Only set for resurrect
    createdAtMicros: t.u64(),
  }
);

export const NpcAffinity = table(
  {
    name: 'npc_affinity',
    public: true,
    indexes: [
      { name: 'by_character', algorithm: 'btree', columns: ['characterId'] },
      { name: 'by_npc', algorithm: 'btree', columns: ['npcId'] },
    ],
  },
  {
    id: t.u64().primaryKey().autoInc(),
    characterId: t.u64(),
    npcId: t.u64(),
    affinity: t.i64(),              // -100 to +100
    lastInteraction: t.timestamp(),
    giftsGiven: t.u64(),
    conversationCount: t.u64(),
    hasGreeted: t.bool().optional(),  // Track if first greeting has been logged to Journal (undefined = false)
  }
);

export const NpcDialogueOption = table(
  {
    name: 'npc_dialogue_option',
    public: true,
    indexes: [
      { name: 'by_npc', algorithm: 'btree', columns: ['npcId'] },
    ],
  },
  {
    id: t.u64().primaryKey().autoInc(),
    npcId: t.u64(),
    parentOptionId: t.u64().optional(),  // null = root dialogue option
    optionKey: t.string(),               // unique key like 'greet_stranger'
    playerText: t.string(),              // Keyword that triggers this (e.g., "forest", "ruins")
    npcResponse: t.string(),             // What the NPC responds (can contain [keywords])
    requiredAffinity: t.i64(),           // Minimum affinity to see this option
    requiredFactionId: t.u64().optional(),
    requiredFactionStanding: t.i64().optional(),
    requiredRenownRank: t.u64().optional(),
    affinityChange: t.i64(),             // Affinity delta if chosen
    sortOrder: t.u64(),                  // Display order
    questTemplateName: t.string().optional(), // Quest name offered/completed by this dialogue
    affinityHint: t.string().optional(), // Hint on increasing affinity ("Kill more ash jackals")
    isAffinityLocked: t.bool().optional(), // If true, show "talk later" when locked
  }
);

export const NpcDialogueVisited = table(
  {
    name: 'npc_dialogue_visited',
    public: true,
    indexes: [
      { name: 'by_character', algorithm: 'btree', columns: ['characterId'] },
    ],
  },
  {
    id: t.u64().primaryKey().autoInc(),
    characterId: t.u64(),
    npcId: t.u64(),
    dialogueOptionId: t.u64(),
    visitedAt: t.timestamp(),
  }
);

export const WorldEvent = table(
  {
    name: 'world_event',
    public: true,
    indexes: [
      { name: 'by_status', algorithm: 'btree', columns: ['status'] },
      { name: 'by_region', algorithm: 'btree', columns: ['regionId'] },
    ],
  },
  {
    id: t.u64().primaryKey().autoInc(),
    eventKey: t.string(),                    // data constant key, e.g. 'ashen_awakening'
    name: t.string(),                        // display name
    regionId: t.u64(),                       // region this event is scoped to
    status: t.string(),                      // 'active' | 'success' | 'failed'
    isRecurring: t.bool(),                   // one-time (default) vs recurring
    firedAt: t.timestamp(),
    resolvedAt: t.timestamp().optional(),

    // Failure condition type
    failureConditionType: t.string(),        // 'time' | 'threshold_race'

    // Time-based failure: event deadline as microseconds since epoch (0n = no deadline)
    deadlineAtMicros: t.u64(),

    // Two-sided threshold race counters (0n = not applicable)
    successThreshold: t.u64(),
    failureThreshold: t.u64(),
    successCounter: t.u64(),
    failureCounter: t.u64(),

    // Consequences — BOTH success AND failure (locked decision)
    successConsequenceType: t.string(),      // 'race_unlock' | 'enemy_composition_change' | 'faction_standing_bonus' | 'none'
    successConsequencePayload: t.string(),   // JSON or key string
    failureConsequenceType: t.string(),      // same types as success
    failureConsequencePayload: t.string(),

    // Reward specs per tier as JSON: { bronze: {...}, silver: {...}, gold: {...} }
    rewardTiersJson: t.string(),

    // Consequence text (written at fire time from eventDef.consequenceTextStub)
    consequenceText: t.string().optional(),
  }
);

export const EventContribution = table(
  {
    name: 'event_contribution',
    public: true,
    indexes: [
      { name: 'by_event', algorithm: 'btree', columns: ['eventId'] },
      { name: 'by_character', algorithm: 'btree', columns: ['characterId'] },
    ],
  },
  {
    id: t.u64().primaryKey().autoInc(),
    eventId: t.u64(),
    characterId: t.u64(),
    count: t.u64(),                 // meaningful interactions count; 0 = registered but no reward
    regionEnteredAt: t.timestamp(),
  }
);

export const EventSpawnEnemy = table(
  {
    name: 'event_spawn_enemy',
    public: true,
    indexes: [
      { name: 'by_event', algorithm: 'btree', columns: ['eventId'] },
      { name: 'by_spawn', algorithm: 'btree', columns: ['spawnId'] },
    ],
  },
  {
    id: t.u64().primaryKey().autoInc(),
    eventId: t.u64(),
    spawnId: t.u64(),      // FK to EnemySpawn.id
    locationId: t.u64(),
  }
);

export const EventSpawnItem = table(
  {
    name: 'event_spawn_item',
    public: true,
    indexes: [
      { name: 'by_event', algorithm: 'btree', columns: ['eventId'] },
      { name: 'by_location', algorithm: 'btree', columns: ['locationId'] },
    ],
  },
  {
    id: t.u64().primaryKey().autoInc(),
    eventId: t.u64(),
    locationId: t.u64(),
    name: t.string(),
    collected: t.bool(),
    collectedByCharacterId: t.u64().optional(),
  }
);

export const EventObjective = table(
  {
    name: 'event_objective',
    public: true,
    indexes: [
      { name: 'by_event', algorithm: 'btree', columns: ['eventId'] },
    ],
  },
  {
    id: t.u64().primaryKey().autoInc(),
    eventId: t.u64(),
    objectiveType: t.string(),   // 'protect_npc' | 'explore' | 'kill_count'
    locationId: t.u64(),
    name: t.string(),
    targetCount: t.u64(),
    currentCount: t.u64(),
    isAlive: t.bool().optional(), // for protect_npc objectives
  }
);

export const WorldStatTracker = table(
  {
    name: 'world_stat_tracker',
    public: true,
    indexes: [
      { name: 'by_stat_key', algorithm: 'btree', columns: ['statKey'] },
    ],
  },
  {
    id: t.u64().primaryKey().autoInc(),
    statKey: t.string(),                 // e.g. 'total_enemies_killed', 'total_quests_completed'
    currentValue: t.u64(),               // running counter
    fireThreshold: t.u64(),              // when currentValue crosses this, auto-fire eventKeyToFire
    eventKeyToFire: t.string(),          // key into WORLD_EVENT_DEFINITIONS
    fired: t.bool(),                     // true once threshold crossed and event fired (prevent re-fire)
  }
);

export const EventDespawnTick = table(
  {
    name: 'event_despawn_tick',
    scheduled: 'despawn_event_content',
  },
  {
    scheduledId: t.u64().primaryKey().autoInc(),
    scheduledAt: t.scheduleAt(),
    eventId: t.u64(),
  }
);

export const InactivityTick = table(
  {
    name: 'inactivity_tick',
    scheduled: 'sweep_inactivity',
  },
  {
    scheduledId: t.u64().primaryKey().autoInc(),
    scheduledAt: t.scheduleAt(),
  }
);

export const AppVersion = table(
  { name: 'app_version', public: true },
  {
    id: t.u64().primaryKey().autoInc(),
    version: t.string(),
    updatedAt: t.timestamp(),
  }
);

// Bard active song tracker — one row per bard in combat, replaced when a new song is cast
export const ActiveBardSong = table(
  {
    name: 'active_bard_song',
    public: true,
    indexes: [{ name: 'by_bard', algorithm: 'btree', columns: ['bardCharacterId'] }],
  },
  {
    id: t.u64().primaryKey().autoInc(),
    bardCharacterId: t.u64(),
    combatId: t.u64(),
    songKey: t.string(),       // e.g. 'bard_discordant_note', 'bard_battle_hymn'
    startedAtMicros: t.u64(), // timestamp when song became active (for fade tracking)
    isFading: t.bool(),        // true during the 6-second fade when a new song replaces it
  }
);

// Scheduled song tick — fires every 6 seconds to apply the active song's group effect
export const BardSongTick = table(
  {
    name: 'bard_song_tick',
    scheduled: 'tick_bard_songs',
  },
  {
    scheduledId: t.u64().primaryKey().autoInc(),
    scheduledAt: t.scheduleAt(),
    bardCharacterId: t.u64(),
    combatId: t.u64(),
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
  NpcAffinity,
  NpcDialogueOption,
  NpcDialogueVisited,
  QuestTemplate,
  QuestInstance,
  HotbarSlot,
  AbilityTemplate,
  AbilityCooldown,
  CharacterCast,
  Character,
  Race,
  ItemTemplate,
  ItemInstance,
  ItemAffix,
  RecipeTemplate,
  RecipeDiscovered,
  ItemCooldown,
  ResourceNode,
  ResourceGather,
  ResourceGatherTick,
  TradeSession,
  TradeItem,
  EnemyRespawnTick,
  CombatLoot,
  Group,
  GroupMember,
  GroupInvite,
  EnemyTemplate,
  EnemyRoleTemplate,
  EnemyAbility,
  VendorInventory,
  LootTable,
  LootTableEntry,
  LocationEnemyTemplate,
  EnemySpawn,
  EnemySpawnMember,
  PullState,
  PullTick,
  CombatEncounter,
  CombatParticipant,
  CombatEnemy,
  ActivePet,
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
  DisconnectLogoutTick,
  CharacterLogoutTick,
  CombatResult,
  Command,
  EventWorld,
  EventLocation,
  EventPrivate,
  EventGroup,
  Faction,
  FactionStanding,
  UiPanelLayout,
  TravelCooldown,
  Renown,
  RenownPerk,
  RenownServerFirst,
  Achievement,
  Corpse,
  CorpseItem,
  PendingSpellCast,
  QuestItem,
  NamedEnemy,
  SearchResult,
  WorldEvent,
  EventContribution,
  EventSpawnEnemy,
  EventSpawnItem,
  EventObjective,
  WorldStatTracker,
  EventDespawnTick,
  InactivityTick,
  AppVersion,
  ActiveBardSong,
  BardSongTick,
);
