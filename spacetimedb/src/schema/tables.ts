import { schema, table, t } from 'spacetimedb/server';

// Registry for scheduled reducer references (v2 requires lazy thunks, not string names)
export const scheduledReducers: Record<string, any> = {};

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

// Private (Phase 51.1 security fix, CONTEXT Area 2): emails never leave the server.
// login_email and send_friend_request read it inside reducers; no client subscribes to it.
export const User = table(
  {
    name: 'user',
    indexes: [{ accessor: 'by_email', algorithm: 'btree', columns: ['email'] }],
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
      { accessor: 'by_from', algorithm: 'btree', columns: ['fromUserId'] },
      { accessor: 'by_to', algorithm: 'btree', columns: ['toUserId'] },
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
    indexes: [{ accessor: 'by_user', algorithm: 'btree', columns: ['userId'] }],
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
    // Canonical fact fields for procedural generation (optional for backward compat with seeded regions)
    biome: t.string().optional(),           // volcanic, forest, tundra, desert, swamp, mountains, plains, coastal, cavern, ruins
    dominantFaction: t.string().optional(),  // Faction name or description
    landmarks: t.string().optional(),        // JSON-stringified array of landmark names
    threats: t.string().optional(),          // JSON-stringified array of threat descriptions
    generatedByCharacterId: t.u64().optional(), // Who triggered generation
    isGenerated: t.bool().optional(),        // Distinguish from seeded content
    starterForRace: t.string().optional(),   // Race name (lowercase) this region was generated as starter for
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
      { accessor: 'by_from', algorithm: 'btree', columns: ['fromLocationId'] },
      { accessor: 'by_to', algorithm: 'btree', columns: ['toLocationId'] },
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
    indexes: [{ accessor: 'by_location', algorithm: 'btree', columns: ['locationId'] }],
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
    // male or female, set on every insert through resolveNpcGender; '' only on rows written before the column (read them with npcGender)
    gender: t.string().default(''),
  }
);

export const NpcDialog = table(
  {
    name: 'npc_dialog',
    public: true,
    indexes: [
      { accessor: 'by_character', algorithm: 'btree', columns: ['characterId'] },
      { accessor: 'by_npc', algorithm: 'btree', columns: ['npcId'] },
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
      { accessor: 'by_npc', algorithm: 'btree', columns: ['npcId'] },
      { accessor: 'by_enemy', algorithm: 'btree', columns: ['targetEnemyTemplateId'] },
      { accessor: 'by_character', algorithm: 'btree', columns: ['characterId'] },
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
    sourceLocationId: t.u64().optional(),      // for delivery quests: where to PICK UP the item (quest giver's location)
    targetNpcId: t.u64().optional(),           // for delivery quest turn-in target NPC
    targetItemName: t.string().optional(),     // display name of the loot item (kill_loot quests)
    itemDropChance: t.u64().optional(),        // per-kill drop chance as integer percent (e.g., 25 = 25%)
    description: t.string().optional(),        // LLM-generated narrative quest description
    rewardType: t.string().optional(),         // 'xp' | 'gold' | 'item' | 'ability'
    rewardItemName: t.string().optional(),     // LLM-generated item name for item rewards
    rewardItemDesc: t.string().optional(),     // LLM-generated item flavor text
    rewardGold: t.u64().optional(),            // Gold reward amount
    characterId: t.u64().optional(),           // Per-player quest (who it was generated for)
  }
);

export const QuestItem = table(
  {
    name: 'quest_item',
    public: true,
    indexes: [
      { accessor: 'by_character', algorithm: 'btree', columns: ['characterId'] },
      { accessor: 'by_location', algorithm: 'btree', columns: ['locationId'] },
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
      { accessor: 'by_character', algorithm: 'btree', columns: ['characterId'] },
      { accessor: 'by_location', algorithm: 'btree', columns: ['locationId'] },
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
      { accessor: 'by_character', algorithm: 'btree', columns: ['characterId'] },
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
      { accessor: 'by_character', algorithm: 'btree', columns: ['characterId'] },
      { accessor: 'by_template', algorithm: 'btree', columns: ['questTemplateId'] },
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
      { accessor: 'by_owner_user', algorithm: 'btree', columns: ['ownerUserId'] },
      { accessor: 'by_location', algorithm: 'btree', columns: ['locationId'] },
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
    lastCombatEndAt: t.u64().optional(),
    weaponProficiencies: t.string().optional(),
    armorProficiencies: t.string().optional(),
    pendingLevels: t.u64().default(0n),
    // Phase 51.1 online status. Written only by helpers/online.ts (setCharacterOnline).
    online: t.bool().default(false),
    // u64 microseconds of the last online/offline flip; 0 = never recorded.
    lastOnlineAtMicros: t.u64().default(0n),
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
    indexes: [{ accessor: 'by_owner', algorithm: 'btree', columns: ['ownerCharacterId'] }],
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
    indexes: [{ accessor: 'by_instance', algorithm: 'btree', columns: ['itemInstanceId'] }],
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
    indexes: [{ accessor: 'by_character', algorithm: 'btree', columns: ['characterId'] }],
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
    indexes: [{ accessor: 'by_character', algorithm: 'btree', columns: ['characterId'] }],
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
      { accessor: 'by_location', algorithm: 'btree', columns: ['locationId'] },
      { accessor: 'by_character', algorithm: 'btree', columns: ['characterId'] },
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
    indexes: [{ accessor: 'by_character', algorithm: 'btree', columns: ['characterId'] }],
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
    scheduled: () => scheduledReducers['finish_gather'],
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
    scheduled: () => scheduledReducers['respawn_enemy'],
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
      { accessor: 'by_from', algorithm: 'btree', columns: ['fromCharacterId'] },
      { accessor: 'by_to', algorithm: 'btree', columns: ['toCharacterId'] },
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
      { accessor: 'by_trade', algorithm: 'btree', columns: ['tradeId'] },
      { accessor: 'by_character', algorithm: 'btree', columns: ['fromCharacterId'] },
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
      { accessor: 'by_owner', algorithm: 'btree', columns: ['ownerUserId'] },
      { accessor: 'by_combat', algorithm: 'btree', columns: ['combatId'] },
      { accessor: 'by_character', algorithm: 'btree', columns: ['characterId'] },
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

export const Hotbar = table(
  {
    name: 'hotbar',
    public: true,
    indexes: [{ accessor: 'by_character', algorithm: 'btree', columns: ['characterId'] }],
  },
  {
    id: t.u64().primaryKey().autoInc(),
    characterId: t.u64(),
    name: t.string(),
    sortOrder: t.u8(),
    isActive: t.bool(),
    createdAt: t.timestamp(),
  }
);

export const HotbarSlot = table(
  {
    name: 'hotbar_slot',
    public: true,
    indexes: [
      { accessor: 'by_character', algorithm: 'btree', columns: ['characterId'] },
      { accessor: 'by_hotbar', algorithm: 'btree', columns: ['hotbarId'] },
    ],
  },
  {
    id: t.u64().primaryKey().autoInc(),
    characterId: t.u64(),
    hotbarId: t.u64(),
    slot: t.u8(),
    abilityTemplateId: t.u64(),
    assignedAt: t.timestamp(),
  }
);

export const AbilityTemplate = table(
  {
    name: 'ability_template',
    public: true,
    indexes: [
      { accessor: 'by_character', algorithm: 'btree', columns: ['characterId'] },
    ],
  },
  {
    id: t.u64().primaryKey().autoInc(),
    characterId: t.u64(),
    name: t.string(),
    description: t.string(),
    kind: t.string(),
    targetRule: t.string(),
    resourceType: t.string(),
    resourceCost: t.u64(),
    castSeconds: t.u64(),
    cooldownSeconds: t.u64(),
    scaling: t.string(),
    value1: t.u64(),
    value2: t.u64().optional(),
    damageType: t.string().optional(),
    effectType: t.string().optional(),
    effectMagnitude: t.u64().optional(),
    effectDuration: t.u64().optional(),
    levelRequired: t.u64(),
    isGenerated: t.bool(),
    source: t.string().optional(),      // 'Class' | 'Renown' | 'Race' (null defaults to 'Class')
    abilityKey: t.string().optional(),  // stable key for race/renown abilities (e.g. 'race_troll_regen')
  }
);

export const PendingSkill = table(
  {
    name: 'pending_skill',
    public: true,
    indexes: [{ accessor: 'by_character', algorithm: 'btree', columns: ['characterId'] }],
  },
  {
    id: t.u64().primaryKey().autoInc(),
    characterId: t.u64(),
    name: t.string(),
    description: t.string(),
    kind: t.string(),
    targetRule: t.string(),
    resourceType: t.string(),
    resourceCost: t.u64(),
    castSeconds: t.u64(),
    cooldownSeconds: t.u64(),
    scaling: t.string(),
    value1: t.u64(),
    value2: t.u64().optional(),
    damageType: t.string().optional(),
    effectType: t.string().optional(),
    effectMagnitude: t.u64().optional(),
    effectDuration: t.u64().optional(),
    levelRequired: t.u64(),
    createdAt: t.timestamp(),
  }
);

export const PendingRenownPerk = table(
  {
    name: 'pending_renown_perk',
    public: true,
    indexes: [{ accessor: 'by_character', algorithm: 'btree', columns: ['characterId'] }],
  },
  {
    id: t.u64().primaryKey().autoInc(),
    characterId: t.u64(),
    rank: t.u64(),
    name: t.string(),
    description: t.string(),
    kind: t.string(),                     // ability kind or empty for passive
    targetRule: t.string(),
    resourceType: t.string(),
    resourceCost: t.u64(),
    castSeconds: t.u64(),
    cooldownSeconds: t.u64(),
    scaling: t.string(),
    value1: t.u64(),
    value2: t.u64().optional(),
    damageType: t.string().optional(),
    effectType: t.string().optional(),
    effectMagnitude: t.u64().optional(),
    effectDuration: t.u64().optional(),
    perkEffectJson: t.string().optional(), // JSON passive bonus for non-ability perks
    perkDomain: t.string().optional(),     // 'combat' | 'crafting' | 'social'
    createdAt: t.timestamp(),
  }
);

export const AbilityCooldown = table(
  {
    name: 'ability_cooldown',
    public: true,
    indexes: [{ accessor: 'by_character', algorithm: 'btree', columns: ['characterId'] }],
  },
  {
    id: t.u64().primaryKey().autoInc(),
    characterId: t.u64(),
    abilityTemplateId: t.u64(),
    startedAtMicros: t.u64(),
    durationMicros: t.u64(),
    roundsRemaining: t.u64().default(0n), // in-combat cooldown measured in rounds (0 = none)
  }
);

export const CharacterCast = table(
  {
    name: 'character_cast',
    public: true,
    indexes: [{ accessor: 'by_character', algorithm: 'btree', columns: ['characterId'] }],
  },
  {
    id: t.u64().primaryKey().autoInc(),
    characterId: t.u64(),
    abilityTemplateId: t.u64(),
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
      { accessor: 'by_owner_user', algorithm: 'btree', columns: ['ownerUserId'] },
      { accessor: 'by_group', algorithm: 'btree', columns: ['groupId'] },
      { accessor: 'by_character', algorithm: 'btree', columns: ['characterId'] },
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
      { accessor: 'by_to_character', algorithm: 'btree', columns: ['toCharacterId'] },
      { accessor: 'by_group', algorithm: 'btree', columns: ['groupId'] },
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
    bossRegionName: t.string().optional(),
  }
);

export const EnemyRoleTemplate = table(
  {
    name: 'enemy_role_template',
    public: true,
    indexes: [{ accessor: 'by_template', algorithm: 'btree', columns: ['enemyTemplateId'] }],
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
    indexes: [{ accessor: 'by_template', algorithm: 'btree', columns: ['enemyTemplateId'] }],
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
      { accessor: 'by_combat', algorithm: 'btree', columns: ['combatId'] },
      { accessor: 'by_enemy', algorithm: 'btree', columns: ['enemyId'] },
    ],
  },
  {
    id: t.u64().primaryKey().autoInc(),
    combatId: t.u64(),
    enemyId: t.u64(),
    abilityKey: t.string(),
    readyAtMicros: t.u64(),
    readyAtRound: t.u64().default(0n), // round number the ability is ready again (rounds, not microseconds)
  }
);

export const VendorInventory = table(
  {
    name: 'vendor_inventory',
    public: true,
    indexes: [{ accessor: 'by_vendor', algorithm: 'btree', columns: ['npcId'] }],
  },
  {
    id: t.u64().primaryKey().autoInc(),
    npcId: t.u64(),
    itemTemplateId: t.u64(),
    price: t.u64(),
    qualityTier: t.string().optional(),  // 'common' | 'uncommon' | 'rare' | 'epic' | 'legendary'; undefined = 'common'
    quantity: t.u64().default(1n),  // units in stock; sales add, buys and buy-backs take; rows from before this column read 1
  }
);

export const LootTable = table(
  {
    name: 'loot_table',
    public: true,
    indexes: [
      { accessor: 'by_key', algorithm: 'btree', columns: ['terrainType', 'creatureType', 'tier'] },
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
    indexes: [{ accessor: 'by_table', algorithm: 'btree', columns: ['lootTableId'] }],
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
      { accessor: 'by_location', algorithm: 'btree', columns: ['locationId'] },
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
      { accessor: 'by_location', algorithm: 'btree', columns: ['locationId'] },
      { accessor: 'by_state', algorithm: 'btree', columns: ['state'] },
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
    indexes: [{ accessor: 'by_spawn', algorithm: 'btree', columns: ['spawnId'] }],
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
      { accessor: 'by_character', algorithm: 'btree', columns: ['characterId'] },
      { accessor: 'by_location', algorithm: 'btree', columns: ['locationId'] },
      { accessor: 'by_group', algorithm: 'btree', columns: ['groupId'] },
      { accessor: 'by_state', algorithm: 'btree', columns: ['state'] },
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
    scheduled: () => scheduledReducers['resolve_pull'],
    public: true,
    indexes: [{ accessor: 'by_pull', algorithm: 'btree', columns: ['pullId'] }],
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
    indexes: [{ accessor: 'by_combat', algorithm: 'btree', columns: ['combatId'] }],
  },
  {
    id: t.u64().primaryKey().autoInc(),
    combatId: t.u64(),
    enemyId: t.u64(),
    abilityKey: t.string(),
    endsAtMicros: t.u64(),
    targetCharacterId: t.u64().optional(),
    targetPetId: t.u64().optional(),
    announcedRound: t.u64().default(0n), // round the wind-up was announced (rounds, not microseconds)
    landsAtRound: t.u64().default(0n),   // round the wind-up lands
  }
);

export const CombatEncounter = table(
  {
    name: 'combat_encounter',
    public: true,
    indexes: [
      { accessor: 'by_location', algorithm: 'btree', columns: ['locationId'] },
      { accessor: 'by_group', algorithm: 'btree', columns: ['groupId'] },
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
      { accessor: 'by_combat', algorithm: 'btree', columns: ['combatId'] },
      { accessor: 'by_character', algorithm: 'btree', columns: ['characterId'] },
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
    indexes: [{ accessor: 'by_combat', algorithm: 'btree', columns: ['combatId'] }],
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
      { accessor: 'by_character', algorithm: 'btree', columns: ['characterId'] },
      { accessor: 'by_combat', algorithm: 'btree', columns: ['combatId'] },
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
    expiresAtMicros: t.u64().optional(),
  }
);

export const CharacterEffect = table(
  {
    name: 'character_effect',
    public: true,
    indexes: [{ accessor: 'by_character', algorithm: 'btree', columns: ['characterId'] }],
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
      { accessor: 'by_combat', algorithm: 'btree', columns: ['combatId'] },
      { accessor: 'by_enemy', algorithm: 'btree', columns: ['enemyId'] },
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
      { accessor: 'by_combat', algorithm: 'btree', columns: ['combatId'] },
      { accessor: 'by_ready', algorithm: 'btree', columns: ['arriveAtMicros'] },
    ],
  },
  {
    id: t.u64().primaryKey().autoInc(),
    combatId: t.u64(),
    enemyTemplateId: t.u64(),
    enemyRoleTemplateId: t.u64().optional(),
    spawnId: t.u64().optional(),
    arriveAtMicros: t.u64(),
    arriveAtRound: t.u64().default(0n), // round number the add joins the fight (rounds, not microseconds)
  }
);

export const CombatResult = table(
  {
    name: 'combat_result',
    public: true,
    indexes: [
      { accessor: 'by_owner_user', algorithm: 'btree', columns: ['ownerUserId'] },
      { accessor: 'by_group', algorithm: 'btree', columns: ['groupId'] },
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
      { accessor: 'by_combat', algorithm: 'btree', columns: ['combatId'] },
      { accessor: 'by_enemy', algorithm: 'btree', columns: ['enemyId'] },
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
    scheduled: () => scheduledReducers['combat_loop'],
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
    scheduled: () => scheduledReducers['regen_health'],
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
    scheduled: () => scheduledReducers['tick_effects'],
  },
  {
    scheduledId: t.u64().primaryKey().autoInc(),
    scheduledAt: t.scheduleAt(),
  }
);

export const HotTick = table(
  {
    name: 'hot_tick',
    scheduled: () => scheduledReducers['tick_hot'],
  },
  {
    scheduledId: t.u64().primaryKey().autoInc(),
    scheduledAt: t.scheduleAt(),
  }
);

export const CastTick = table(
  {
    name: 'cast_tick',
    scheduled: () => scheduledReducers['tick_casts'],
  },
  {
    scheduledId: t.u64().primaryKey().autoInc(),
    scheduledAt: t.scheduleAt(),
  }
);

export const DayNightTick = table(
  {
    name: 'day_night_tick',
    scheduled: () => scheduledReducers['tick_day_night'],
  },
  {
    scheduledId: t.u64().primaryKey().autoInc(),
    scheduledAt: t.scheduleAt(),
  }
);

export const DisconnectLogoutTick = table(
  {
    name: 'disconnect_logout_tick',
    scheduled: () => scheduledReducers['disconnect_logout'],
  },
  {
    scheduledId: t.u64().primaryKey().autoInc(),
    scheduledAt: t.scheduleAt(),
    playerId: t.identity(),
    disconnectAtMicros: t.u64(),
  }
);

// One-shot expiry for a party invite (plan 51.1-03), due at createdAt + GROUP_INVITE_TTL_MICROS.
// Private. A tick whose invite already ended (accept, decline, cancel) is a no-op.
export const GroupInviteExpiryTick = table(
  {
    name: 'group_invite_expiry_tick',
    scheduled: () => scheduledReducers['expire_group_invite'],
  },
  {
    scheduledId: t.u64().primaryKey().autoInc(),
    scheduledAt: t.scheduleAt(),
    inviteId: t.u64(),
  }
);

// Re-invite wait (code review WR-02): after an invite from one character to another is declined or
// cancelled, that inviter waits GROUP_REINVITE_COOLDOWN_MICROS before inviting the same person again.
// Private, server-only (no view). One row per pair, pruned when the target is next invited.
export const GroupInviteCooldown = table(
  {
    name: 'group_invite_cooldown',
    indexes: [{ accessor: 'by_to_character', algorithm: 'btree', columns: ['toCharacterId'] }],
  },
  {
    id: t.u64().primaryKey().autoInc(),
    fromCharacterId: t.u64(),
    toCharacterId: t.u64(),
    untilMicros: t.u64(),
  }
);

export const CharacterLogoutTick = table(
  {
    name: 'character_logout_tick',
    public: true,
    scheduled: () => scheduledReducers['character_logout'],
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
      { accessor: 'by_owner_user', algorithm: 'btree', columns: ['ownerUserId'] },
      { accessor: 'by_character', algorithm: 'btree', columns: ['characterId'] },
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
    event: true,
  },
  {
    id: t.u64().primaryKey().autoInc(),
    message: t.string(),
    kind: t.string(),
    createdAt: t.timestamp(),
  }
);

// Phase 46 (SEG-02): one segment of a Keeper reply. kind is 'narration' or 'dialogue' (a string,
// validated by helpers/segments.ts). speaker is 'The Keeper' or a present NPC's stored name.
// Used only as the optional LAST column of the three event tables below: an optional column with
// no default is refused on a persisted table, so never copy it onto one.
export const KeeperSegment = t.object('KeeperSegment', {
  kind: t.string(),
  speaker: t.string(),
  text: t.string(),
  speakerNpcId: t.u64().optional(),
});

export const EventLocation = table(
  {
    name: 'event_location',
    public: true,
    event: true,
    indexes: [{ accessor: 'by_location', algorithm: 'btree', columns: ['locationId'] }],
  },
  {
    id: t.u64().primaryKey().autoInc(),
    locationId: t.u64(),
    message: t.string(),
    kind: t.string(),
    excludeCharacterId: t.u64().optional(),
    createdAt: t.timestamp(),
    segments: t.array(KeeperSegment).optional(),
  }
);

export const EventPrivate = table(
  {
    name: 'event_private',
    public: true,
    event: true,
    indexes: [
      { accessor: 'by_owner_user', algorithm: 'btree', columns: ['ownerUserId'] },
      { accessor: 'by_character', algorithm: 'btree', columns: ['characterId'] },
    ],
  },
  {
    id: t.u64().primaryKey().autoInc(),
    ownerUserId: t.u64(),
    characterId: t.u64(),
    message: t.string(),
    kind: t.string(),
    createdAt: t.timestamp(),
    segments: t.array(KeeperSegment).optional(),
  }
);

export const EventGroup = table(
  {
    name: 'event_group',
    public: true,
    event: true,
    indexes: [
      { accessor: 'by_group', algorithm: 'btree', columns: ['groupId'] },
      { accessor: 'by_character', algorithm: 'btree', columns: ['characterId'] },
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
      { accessor: 'by_character', algorithm: 'btree', columns: ['characterId'] },
    ],
  },
  {
    id: t.u64().primaryKey().autoInc(),
    characterId: t.u64(),
    factionId: t.u64(),
    standing: t.i64(),
  }
);

// A character's last single sale to a vendor, replaced by the next one (buy-back). Private: it is
// read only through the my_vendor_buyback view, so no one sees another player's sales.
// affixesJson holds [{ affixType, affixKey, affixName, statKey, magnitude }] with magnitude as a
// decimal string, because the item_affix column is i64 and JSON.stringify throws on a bigint.
export const VendorBuyback = table(
  { name: 'vendor_buyback' },
  {
    characterId: t.u64().primaryKey(),
    npcId: t.u64(),
    npcName: t.string(),
    locationId: t.u64(),
    templateId: t.u64(),
    itemName: t.string(),
    rarity: t.string(),
    quantity: t.u64(),
    price: t.u64(),                         // the exact gold the vendor paid
    qualityTier: t.string().optional(),
    craftQuality: t.string().optional(),
    displayName: t.string().optional(),
    isNamed: t.bool().optional(),
    isTemporary: t.bool().optional(),
    affixesJson: t.string(),
    listingId: t.u64().optional(),          // the resale listing the sale created, if any
    soldAt: t.timestamp(),
  }
);

// The last craft, salvage or Discover of each character, replaced by the next one. Private: it is
// read only through the my_action_result view, so no one sees another player's results.
// linesJson is data/action_result.ts encodeResultLines. kind is one of RESULT_KINDS.
export const ActionResult = table(
  { name: 'action_result' },
  {
    characterId: t.u64().primaryKey(),
    seq: t.u64(),                           // raised by 1 on every write, so the client can tell a new result
    kind: t.string(),
    templateId: t.u64().optional(),
    itemInstanceId: t.u64().optional(),
    itemName: t.string(),
    rarity: t.string(),
    craftQuality: t.string().optional(),
    quantity: t.u64(),
    recipeTemplateId: t.u64().optional(),
    craftCount: t.u64(),
    linesJson: t.string(),
    at: t.timestamp(),
  }
);

export const UiPanelLayout = table(
  {
    name: 'ui_panel_layout',
    public: true,
    indexes: [{ accessor: 'by_character', algorithm: 'btree', columns: ['characterId'] }],
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
    indexes: [{ accessor: 'by_character', algorithm: 'btree', columns: ['characterId'] }],
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
    indexes: [{ accessor: 'by_character', algorithm: 'btree', columns: ['characterId'] }],
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
    indexes: [{ accessor: 'by_character', algorithm: 'btree', columns: ['characterId'] }],
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
    indexes: [{ accessor: 'by_category', algorithm: 'btree', columns: ['category'] }],
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
    indexes: [{ accessor: 'by_character', algorithm: 'btree', columns: ['characterId'] }],
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
      { accessor: 'by_character', algorithm: 'btree', columns: ['characterId'] },
      { accessor: 'by_location', algorithm: 'btree', columns: ['locationId'] },
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
    indexes: [{ accessor: 'by_corpse', algorithm: 'btree', columns: ['corpseId'] }],
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
      { accessor: 'by_target', algorithm: 'btree', columns: ['targetCharacterId'] },
      { accessor: 'by_caster', algorithm: 'btree', columns: ['casterCharacterId'] },
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
      { accessor: 'by_character', algorithm: 'btree', columns: ['characterId'] },
      { accessor: 'by_npc', algorithm: 'btree', columns: ['npcId'] },
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
      { accessor: 'by_npc', algorithm: 'btree', columns: ['npcId'] },
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
      { accessor: 'by_character', algorithm: 'btree', columns: ['characterId'] },
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

// Per-player-per-NPC summarized conversation memory for LLM context
export const NpcMemory = table(
  {
    name: 'npc_memory',
    public: true,
    indexes: [
      { accessor: 'by_character', algorithm: 'btree', columns: ['characterId'] },
      { accessor: 'by_npc', algorithm: 'btree', columns: ['npcId'] },
    ],
  },
  {
    id: t.u64().primaryKey().autoInc(),
    characterId: t.u64(),
    npcId: t.u64(),
    memoryJson: t.string(),     // JSON: { topics: string[], questsCompleted: string[], secretsShared: string[], giftsGiven: string[], lastConversationSummary: string }
    lastUpdated: t.timestamp(),
  }
);

export const WorldEvent = table(
  {
    name: 'world_event',
    public: true,
    indexes: [
      { accessor: 'by_status', algorithm: 'btree', columns: ['status'] },
      { accessor: 'by_region', algorithm: 'btree', columns: ['regionId'] },
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
      { accessor: 'by_event', algorithm: 'btree', columns: ['eventId'] },
      { accessor: 'by_character', algorithm: 'btree', columns: ['characterId'] },
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
      { accessor: 'by_event', algorithm: 'btree', columns: ['eventId'] },
      { accessor: 'by_spawn', algorithm: 'btree', columns: ['spawnId'] },
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
      { accessor: 'by_event', algorithm: 'btree', columns: ['eventId'] },
      { accessor: 'by_location', algorithm: 'btree', columns: ['locationId'] },
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
      { accessor: 'by_event', algorithm: 'btree', columns: ['eventId'] },
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
      { accessor: 'by_stat_key', algorithm: 'btree', columns: ['statKey'] },
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
    scheduled: () => scheduledReducers['despawn_event_content'],
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
    scheduled: () => scheduledReducers['sweep_inactivity'],
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
    indexes: [{ accessor: 'by_bard', algorithm: 'btree', columns: ['bardCharacterId'] }],
  },
  {
    id: t.u64().primaryKey().autoInc(),
    bardCharacterId: t.u64(),
    combatId: t.u64().optional(),
    songKey: t.string(),       // e.g. 'bard_discordant_note', 'bard_requiem_of_ruin'
    startedAtMicros: t.u64(), // timestamp when song became active (for fade tracking)
    isFading: t.bool(),        // true during the 6-second fade when a new song replaces it
  }
);

// Scheduled song tick — fires every 6 seconds to apply the active song's group effect
export const BardSongTick = table(
  {
    name: 'bard_song_tick',
    scheduled: () => scheduledReducers['tick_bard_songs'],
  },
  {
    scheduledId: t.u64().primaryKey().autoInc(),
    scheduledAt: t.scheduleAt(),
    bardCharacterId: t.u64(),
    combatId: t.u64().optional(),
  }
);

export const BankSlot = table(
  {
    name: 'bank_slot',
    indexes: [
      { accessor: 'by_owner', algorithm: 'btree', columns: ['ownerUserId'] },
      { accessor: 'by_item', algorithm: 'btree', columns: ['itemInstanceId'] },
    ],
  },
  {
    id: t.u64().primaryKey().autoInc(),
    ownerUserId: t.u64(),
    slot: t.u64(),         // 0-39 bank slot index
    itemInstanceId: t.u64(),
  }
);

// LLM Pipeline tables (all private — no public: true)

export const LlmConfig = table(
  { name: 'llm_config' },
  {
    id: t.u64().primaryKey(),  // Always 1 (singleton pattern)
    apiKey: t.string(),
    updatedAt: t.timestamp(),
  }
);

// Character creation state — tracks multi-step narrative creation flow per player
export const CharacterCreationState = table(
  {
    name: 'character_creation_state',
    public: true,
    indexes: [
      { accessor: 'by_player', algorithm: 'btree', columns: ['playerId'] },
    ],
  },
  {
    id: t.u64().primaryKey().autoInc(),
    playerId: t.identity(),
    step: t.string(),                    // AWAITING_RACE, AWAITING_ARCHETYPE, GENERATING_CLASS, CLASS_REVEALED, AWAITING_NAME, CONFIRMING, CONFIRMING_GO_BACK, COMPLETE
    goBackTarget: t.string().optional(), // Which step we're confirming go-back to
    raceDescription: t.string().optional(),
    raceName: t.string().optional(),
    raceNarrative: t.string().optional(),
    raceBonuses: t.string().optional(),    // JSON: { primary: {stat, value}, secondary: {stat, value}, flavor }
    archetype: t.string().optional(),      // 'warrior' or 'mystic'
    className: t.string().optional(),
    classDescription: t.string().optional(),
    classStats: t.string().optional(),     // JSON: { primaryStat, secondaryStat, bonusHp, bonusMana, armorProficiency, usesMana }
    abilities: t.string().optional(),      // JSON: array of 3 generated abilities
    chosenAbilityIndex: t.u64().optional(),
    characterName: t.string().optional(),
    previousStep: t.string().optional(),   // Used to restore step when go-back is declined
    createdAt: t.timestamp(),
    updatedAt: t.timestamp(),
  }
);

// Race definitions — persists generated race data for reuse across players
export const RaceDefinition = table(
  {
    name: 'race_definition',
    public: true,
    indexes: [{ accessor: 'by_name', algorithm: 'btree', columns: ['nameLower'] }],
  },
  {
    id: t.u64().primaryKey().autoInc(),
    name: t.string(),           // Exact race name as displayed (e.g. "Cyclops")
    nameLower: t.string(),      // Lowercase for lookup (e.g. "cyclops")
    narrative: t.string(),      // Keeper's sardonic commentary
    bonusesJson: t.string(),    // JSON: { primary: {stat, value}, secondary: {stat, value}, flavor }
    createdAt: t.timestamp(),
  }
);

// Pre-character event messaging — uses player identity instead of characterId
export const EventCreation = table(
  {
    name: 'event_creation',
    public: true,
    event: true,
    indexes: [
      { accessor: 'by_player', algorithm: 'btree', columns: ['playerId'] },
    ],
  },
  {
    id: t.u64().primaryKey().autoInc(),
    playerId: t.identity(),
    message: t.string(),
    kind: t.string(),       // 'creation', 'creation_warning', 'creation_error'
    createdAt: t.timestamp(),
    segments: t.array(KeeperSegment).optional(),
  }
);

// World generation state — tracks generation lock and state machine per exploration trigger
export const WorldGenState = table(
  {
    name: 'world_gen_state',
    public: true,
    indexes: [
      { accessor: 'by_player', algorithm: 'btree', columns: ['playerId'] },
      { accessor: 'by_source_location', algorithm: 'btree', columns: ['sourceLocationId'] },
    ],
  },
  {
    id: t.u64().primaryKey().autoInc(),
    playerId: t.identity(),
    characterId: t.u64(),
    sourceLocationId: t.u64(),
    sourceRegionId: t.u64(),
    step: t.string(),                    // PENDING, GENERATING, COMPLETE, ERROR
    generatedRegionId: t.u64().optional(),
    errorMessage: t.string().optional(),
    createdAt: t.timestamp(),
    updatedAt: t.timestamp(),
  }
);

// Round-based combat tables

export const CombatRound = table(
  {
    name: 'combat_round',
    public: true,
    indexes: [{ accessor: 'by_combat', algorithm: 'btree', columns: ['combatId'] }],
  },
  {
    id: t.u64().primaryKey().autoInc(),
    combatId: t.u64(),
    roundNumber: t.u64(),
    state: t.string(),              // 'action_select', 'resolving', 'resolved'
    timerExpiresAtMicros: t.u64(),
    narrationCount: t.u64(),        // Total narrations triggered so far in this combat
    startedAtMicros: t.u64().default(0n), // round start, u64 microseconds since the Unix epoch (0 on rows from before this column)
  }
);

export const CombatAction = table(
  {
    name: 'combat_action',
    public: true,
    indexes: [
      { accessor: 'by_combat', algorithm: 'btree', columns: ['combatId'] },
      { accessor: 'by_character', algorithm: 'btree', columns: ['characterId'] },
    ],
  },
  {
    id: t.u64().primaryKey().autoInc(),
    combatId: t.u64(),
    characterId: t.u64(),
    roundNumber: t.u64(),
    actionType: t.string(),         // 'ability', 'auto_attack', 'flee'
    abilityTemplateId: t.u64().optional(),
    targetEnemyId: t.u64().optional(),
    targetCharacterId: t.u64().optional(),
    submittedAt: t.timestamp(),
  }
);

export const CombatNarrative = table(
  {
    name: 'combat_narrative',
    public: true,
    indexes: [{ accessor: 'by_combat', algorithm: 'btree', columns: ['combatId'] }],
  },
  {
    id: t.u64().primaryKey().autoInc(),
    combatId: t.u64(),
    roundNumber: t.u64(),
    narrativeText: t.string(),
    narrativeType: t.string(),      // 'intro', 'round', 'victory', 'defeat', 'kill', 'near_death', 'phase'
    createdAt: t.timestamp(),
  }
);

export const RoundTimerTick = table(
  {
    name: 'round_timer_tick',
    scheduled: () => scheduledReducers['resolve_round_timer'],
  },
  {
    scheduledId: t.u64().primaryKey().autoInc(),
    scheduledAt: t.scheduleAt(),
    combatId: t.u64(),
    roundNumber: t.u64(),
  }
);

// Per-fight big-moment bookkeeping (once-per-fight flags and the narration budget). PRIVATE: no
// `public` flag. Clients never read it.
export const CombatMoment = table(
  {
    name: 'combat_moment',
    indexes: [{ accessor: 'by_combat', algorithm: 'btree', columns: ['combatId'] }],
  },
  {
    id: t.u64().primaryKey().autoInc(),
    combatId: t.u64(),
    kind: t.string(),
    subjectKey: t.string(),
    roundNumber: t.u64(),
    createdAt: t.timestamp(),
  }
);

// Server-side Claude job queue (Phase 40). PRIVATE: no `public` flag. Clients never read jobs;
// results reach players through domain tables. requestJson holds ids plus player text or an
// event summary; never a built prompt, header or key.
export const LlmJob = table(
  {
    name: 'llm_job',
    indexes: [
      { accessor: 'by_player', algorithm: 'btree', columns: ['playerId'] },
      { accessor: 'by_dedupe_key', algorithm: 'btree', columns: ['dedupeKey'] },
      { accessor: 'by_status', algorithm: 'btree', columns: ['status'] },
    ],
  },
  {
    id: t.u64().primaryKey().autoInc(),
    playerId: t.identity(),
    characterId: t.u64(),         // 0n when the job is not tied to a character
    route: t.string(),            // one of LLM_ROUTE_NAMES
    dedupeKey: t.string(),        // JSON array [playerHex, route, sourceKey]
    status: t.string(),           // 'pending', 'in_flight', 'received', 'completed', 'failed', 'expired'
    attempt: t.u64(),
    requestJson: t.string(),      // ids plus player text or event summary; never a built prompt, header or key
    resultText: t.string().optional(),
    stopReason: t.string().optional(),
    errorCode: t.string().optional(),
    requestId: t.string().optional(),
    inputTokens: t.u64(),
    outputTokens: t.u64(),
    cacheWriteTokens: t.u64(),
    cacheReadTokens: t.u64(),
    createdAt: t.timestamp(),
    startedAt: t.timestamp().optional(),
    finishedAt: t.timestamp().optional(),
    // Phase 41 columns. Defaults let a non-clearing publish migrate existing rows.
    nextAttemptAt: t.timestamp().optional(), // when a retry or deferral is next due
    reservedMicroUsd: t.u64().default(0n),   // budget reserved at enqueue, refunded or settled on result
    costMicroUsd: t.u64().default(0n),       // settled cost from the four usage counts
    budgetDay: t.string().default(''),       // UTC date the reservation was booked against
    applyAttempts: t.u64().default(0n),      // apply runs so far (re-runs once from stored text)
    // The sweeper's conservative ledger charge for an in_flight attempt it expired (billing unknown).
    // A reply that arrives later swaps it for the real cost, so the ledger never counts the call twice.
    ledgerChargedMicroUsd: t.u64().default(0n),
    // The UTC day (YYYY-MM-DD) that charge was booked on. The late-reply swap takes the charge back from
    // the day counter only when it is still that day (review WR-A01); '' (rows before the column) never does.
    ledgerChargedDayUtc: t.string().default(''),
  }
);

// One row per Claude HTTP attempt (Phase 40). PRIVATE: no `public` flag.
export const LlmCallLog = table(
  {
    name: 'llm_call_log',
    indexes: [
      { accessor: 'by_job', algorithm: 'btree', columns: ['jobId'] },
      { accessor: 'by_player', algorithm: 'btree', columns: ['playerId'] },
    ],
  },
  {
    id: t.u64().primaryKey().autoInc(),
    jobId: t.u64(),
    playerId: t.identity(),
    route: t.string(),
    model: t.string(),
    outcome: t.string(),
    attempt: t.u64(),
    httpStatus: t.u64(),
    latencyMs: t.u64(),
    stopReason: t.string().optional(),
    requestId: t.string().optional(),
    errorMessage: t.string().optional(), // redacted, capped at 400 code points
    inputTokens: t.u64(),
    outputTokens: t.u64(),
    cacheWriteTokens: t.u64(),
    cacheReadTokens: t.u64(),
    createdAt: t.timestamp(),
    // Phase 41 columns (COST-01 and the maincloud gate re-check).
    costMicroUsd: t.u64().default(0n),
    dispatchLateMs: t.u64().default(0n), // claim time minus scheduled time
  }
);

// Phase 41 executor tables. All PRIVATE: no `public` flag.

// One row per dispatch; the scheduler deletes the row before llm_run runs, so every retry or
// deferral inserts a new row. Bound to the llm_run procedure with onSchedule (Plan 41-07).
export const LlmDispatch = table(
  { name: 'llm_dispatch' },
  {
    scheduledId: t.u64().primaryKey().autoInc(),
    scheduledAt: t.scheduleAt(),
    jobId: t.u64(),
  }
);

// Repeating 30 s sweeper tick. Bound to llm_sweep (Plan 41-07).
export const LlmSweepTick = table(
  { name: 'llm_sweep_tick' },
  {
    scheduledId: t.u64().primaryKey().autoInc(),
    scheduledAt: t.scheduleAt(),
  }
);

// Per-player-per-UTC-day budget: cost-weighted (reserved and spent micro-USD) with a call-count backstop.
export const LlmPlayerBudget = table(
  {
    name: 'llm_player_budget',
    indexes: [
      { accessor: 'by_player', algorithm: 'btree', columns: ['playerId'] },
    ],
  },
  {
    id: t.u64().primaryKey().autoInc(),
    playerId: t.identity(),
    dayUtc: t.string(),            // "2026-09-30" UTC date string
    reservedMicroUsd: t.u64(),
    spentMicroUsd: t.u64(),
    calls: t.u64(),
  }
);

// Spend ledger (singleton id 1): all-time spent, reserved and calls (the record, no longer a limit),
// plus the current UTC day's spent figure that the global daily ceiling counts (Phase 43).
export const LlmSpend = table(
  { name: 'llm_spend' },
  {
    id: t.u64().primaryKey(),
    spentMicroUsd: t.u64(),
    reservedMicroUsd: t.u64(),
    calls: t.u64(),
    updatedAt: t.timestamp(),
    dayUtc: t.string().default(''),            // UTC day the day counter belongs to; '' until the first spend
    daySpentMicroUsd: t.u64().default(0n),     // spent on dayUtc; rolls lazily at UTC midnight
  }
);

// Admin key status, last smoke result, kill switch and global daily ceiling (singleton id 1).
// Never holds the key itself.
export const LlmAdminState = table(
  { name: 'llm_admin_state' },
  {
    id: t.u64().primaryKey(),
    keySet: t.bool(),
    keyLength: t.u64(),
    keyUpdatedAt: t.timestamp().optional(),
    keyVerifiedAt: t.timestamp().optional(),
    keyLastCheckOk: t.bool(),
    lastSmokeAt: t.timestamp().optional(),
    lastSmokeJson: t.string(),
    llmEnabled: t.bool().default(true),                      // kill switch: true means calls run
    dailyCeilingMicroUsd: t.u64().default(10_000_000n),      // global daily ceiling (= LLM_DAILY_CEILING_DEFAULT_MICRO_USD)
  }
);

// One row per vendor_inventory row that is base stock, so restock can tell its own listings from
// player-sold ones (both look identical in vendor_inventory). Private: clients never read it.
export const VendorBaseStock = table(
  {
    name: 'vendor_base_stock',
    indexes: [{ accessor: 'by_vendor', algorithm: 'btree', columns: ['npcId'] }],
  },
  {
    listingId: t.u64().primaryKey(),
    npcId: t.u64(),
  }
);

// Private scheduled tick that restocks vendor base stock. afterNpcId is the batch cursor (0n starts
// a pass over all vendors).
export const VendorRestockTick = table(
  { name: 'vendor_restock_tick', scheduled: () => scheduledReducers['restock_vendors'] },
  {
    scheduledId: t.u64().primaryKey().autoInc(),
    scheduledAt: t.scheduleAt(),
    afterNpcId: t.u64(),
  }
);

// Every place a character has stood in (the map draws these). Private: it is read only through the
// my_visited_locations view, so no one sees where another player has been. fromLocationId is where
// the last arrival here came from (the passage sweep's own-side rule, plan 51-03); respawn,
// resurrection, first spawn and the set_active_character backfill record no origin.
export const VisitedLocation = table(
  {
    name: 'visited_location',
    indexes: [
      { accessor: 'by_character', algorithm: 'btree', columns: ['characterId'] },
      { accessor: 'by_location', algorithm: 'btree', columns: ['locationId'] },
    ],
  },
  {
    id: t.u64().primaryKey().autoInc(),
    characterId: t.u64(),
    locationId: t.u64(),
    firstVisitedAt: t.timestamp(),
    fromLocationId: t.u64().optional(),
  }
);

// Private scheduled tick that sweeps passages (plan 51-03): offline characters in a passage go back
// to their own side and an empty passage collapses. One pending row at a time.
export const PassageSweepTick = table(
  { name: 'passage_sweep_tick', scheduled: () => scheduledReducers['sweep_passages'] },
  {
    scheduledId: t.u64().primaryKey().autoInc(),
    scheduledAt: t.scheduleAt(),
  }
);

const spacetimedb = schema({
  player: Player,
  user: User,
  friend_request: FriendRequest,
  friend: Friend,
  world_state: WorldState,
  region: Region,
  location: Location,
  location_connection: LocationConnection,
  npc: Npc,
  npc_dialog: NpcDialog,
  npc_affinity: NpcAffinity,
  npc_dialogue_option: NpcDialogueOption,
  npc_dialogue_visited: NpcDialogueVisited,
  npc_memory: NpcMemory,
  quest_template: QuestTemplate,
  quest_instance: QuestInstance,
  hotbar: Hotbar,
  hotbar_slot: HotbarSlot,
  ability_template: AbilityTemplate,
  ability_cooldown: AbilityCooldown,
  character_cast: CharacterCast,
  character: Character,
  race: Race,
  item_template: ItemTemplate,
  item_instance: ItemInstance,
  item_affix: ItemAffix,
  recipe_template: RecipeTemplate,
  recipe_discovered: RecipeDiscovered,
  item_cooldown: ItemCooldown,
  resource_node: ResourceNode,
  resource_gather: ResourceGather,
  resource_gather_tick: ResourceGatherTick,
  trade_session: TradeSession,
  trade_item: TradeItem,
  enemy_respawn_tick: EnemyRespawnTick,
  combat_loot: CombatLoot,
  group: Group,
  group_member: GroupMember,
  group_invite: GroupInvite,
  enemy_template: EnemyTemplate,
  enemy_role_template: EnemyRoleTemplate,
  enemy_ability: EnemyAbility,
  vendor_inventory: VendorInventory,
  loot_table: LootTable,
  loot_table_entry: LootTableEntry,
  location_enemy_template: LocationEnemyTemplate,
  enemy_spawn: EnemySpawn,
  enemy_spawn_member: EnemySpawnMember,
  pull_state: PullState,
  pull_tick: PullTick,
  combat_encounter: CombatEncounter,
  combat_participant: CombatParticipant,
  combat_enemy: CombatEnemy,
  active_pet: ActivePet,
  combat_enemy_cast: CombatEnemyCast,
  combat_enemy_cooldown: CombatEnemyCooldown,
  character_effect: CharacterEffect,
  combat_enemy_effect: CombatEnemyEffect,
  combat_pending_add: CombatPendingAdd,
  aggro_entry: AggroEntry,
  combat_loop_tick: CombatLoopTick,
  health_regen_tick: HealthRegenTick,
  effect_tick: EffectTick,
  hot_tick: HotTick,
  cast_tick: CastTick,
  day_night_tick: DayNightTick,
  disconnect_logout_tick: DisconnectLogoutTick,
  character_logout_tick: CharacterLogoutTick,
  combat_result: CombatResult,
  command: Command,
  event_world: EventWorld,
  event_location: EventLocation,
  event_private: EventPrivate,
  event_group: EventGroup,
  faction: Faction,
  faction_standing: FactionStanding,
  vendor_buyback: VendorBuyback,
  ui_panel_layout: UiPanelLayout,
  travel_cooldown: TravelCooldown,
  renown: Renown,
  renown_perk: RenownPerk,
  pending_renown_perk: PendingRenownPerk,
  renown_server_first: RenownServerFirst,
  achievement: Achievement,
  corpse: Corpse,
  corpse_item: CorpseItem,
  pending_spell_cast: PendingSpellCast,
  quest_item: QuestItem,
  named_enemy: NamedEnemy,
  search_result: SearchResult,
  world_event: WorldEvent,
  event_contribution: EventContribution,
  event_spawn_enemy: EventSpawnEnemy,
  event_spawn_item: EventSpawnItem,
  event_objective: EventObjective,
  world_stat_tracker: WorldStatTracker,
  event_despawn_tick: EventDespawnTick,
  inactivity_tick: InactivityTick,
  app_version: AppVersion,
  active_bard_song: ActiveBardSong,
  bard_song_tick: BardSongTick,
  bank_slot: BankSlot,
  llm_config: LlmConfig,
  character_creation_state: CharacterCreationState,
  race_definition: RaceDefinition,
  event_creation: EventCreation,
  world_gen_state: WorldGenState,
  llm_job: LlmJob,
  llm_call_log: LlmCallLog,
  llm_dispatch: LlmDispatch,
  llm_sweep_tick: LlmSweepTick,
  llm_player_budget: LlmPlayerBudget,
  llm_spend: LlmSpend,
  llm_admin_state: LlmAdminState,
  pending_skill: PendingSkill,
  combat_round: CombatRound,
  combat_action: CombatAction,
  combat_narrative: CombatNarrative,
  round_timer_tick: RoundTimerTick,
  combat_moment: CombatMoment,
  vendor_base_stock: VendorBaseStock,
  vendor_restock_tick: VendorRestockTick,
  action_result: ActionResult,
  visited_location: VisitedLocation,
  passage_sweep_tick: PassageSweepTick,
  group_invite_expiry_tick: GroupInviteExpiryTick,
  group_invite_cooldown: GroupInviteCooldown,
});
export default spacetimedb;
export { spacetimedb };

export const myBankSlotsView = spacetimedb.view(
  { name: 'my_bank_slots', public: true },
  t.array(BankSlot.rowType),
  (ctx) => {
    const player = ctx.db.player.id.find(ctx.sender);
    if (!player || player.userId == null) return [];
    return [...ctx.db.bank_slot.by_owner.filter(player.userId)];
  }
);
