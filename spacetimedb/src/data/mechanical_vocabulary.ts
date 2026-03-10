// ============================================================================
// MECHANICAL VOCABULARY — The Rules of the World
// ============================================================================
//
// This file defines EVERY mechanical building block in UWR. All generated
// content (abilities, items, quests, NPCs, locations, enemies) must compose
// from these primitives. Nothing exists outside this vocabulary.
//
// The LLM generates content by selecting from these enums and filling in
// numeric parameters. The engine resolves mechanics by reading these values
// from table rows — no hardcoded ability names, no special cases.
//
// To add a NEW mechanical concept to the world, add it HERE first, then
// update the engine to handle it. This file is the single source of truth.
// ============================================================================

// ----------------------------------------------------------------------------
// 1. CHARACTER STATS — What exists on a character that can be read or modified
// ----------------------------------------------------------------------------

export const STAT_TYPES = ['str', 'dex', 'int', 'wis', 'cha'] as const;
export type StatType = (typeof STAT_TYPES)[number];

// Every numeric property on a character that abilities, items, or effects
// can reference. "Modify X by Y" — X must be one of these.
export const CHARACTER_STATS = [
  // Core attributes (base identity — grow with level)
  'str', 'dex', 'int', 'wis', 'cha',
  // Resource pools
  'hp', 'maxHp', 'mana', 'maxMana', 'stamina', 'maxStamina',
  // Offense
  'hitChance', 'critMelee', 'critRanged', 'critDivine', 'critArcane',
  // Defense
  'armorClass', 'dodgeChance', 'parryChance', 'magicResist',
  // Utility
  'perception', 'search', 'ccPower',
  // Economy
  'vendorBuyMod', 'vendorSellMod',
] as const;
export type CharacterStat = (typeof CHARACTER_STATS)[number];

// Racial bonus types — the mechanical properties a race can grant.
// These are applied at character creation and scale at even levels.
export const RACIAL_BONUS_TYPES = [
  // Stat bonuses
  'stat_str', 'stat_dex', 'stat_int', 'stat_wis', 'stat_cha',
  // Offense
  'spell_damage', 'phys_damage',
  // Resources
  'max_hp', 'max_mana', 'max_stamina',
  // Regeneration
  'hp_regen', 'mana_regen', 'stamina_regen',
  // Defense
  'armor', 'dodge', 'crit_chance', 'parry', 'magic_resist',
  // Utility
  'perception', 'hit_chance', 'loot_bonus',
  // Social
  'faction_bonus', 'npc_affinity_gain',
  // Travel
  'travel_cost_increase', 'travel_cost_discount',
] as const;
export type RacialBonusType = (typeof RACIAL_BONUS_TYPES)[number];

// ----------------------------------------------------------------------------
// 2. ABILITY MECHANICS — How abilities work
// ----------------------------------------------------------------------------

// What an ability fundamentally does. The engine dispatches on this.
export const ABILITY_KINDS = [
  'damage',        // Deal direct damage to target(s)
  'heal',          // Restore HP to target(s)
  'dot',           // Apply damage-over-time
  'hot',           // Apply heal-over-time
  'buff',          // Apply positive effect to target(s)
  'debuff',        // Apply negative effect to target(s)
  'shield',        // Apply damage absorption barrier
  'taunt',         // Force enemy to target caster (threat)
  'aoe_damage',    // Deal damage to multiple targets
  'aoe_heal',      // Heal multiple targets
  'summon',        // Summon a pet/creature
  'cc',            // Apply crowd control (stun, root, etc.)
  'drain',         // Deal damage and heal caster for portion
  'execute',       // Bonus damage to low-HP targets
  'utility',       // Non-combat effect (out-of-combat only)
  // Extended ability kinds (v2.1+)
  'song',          // Toggle-on/off party-wide persistent effect
  'aura',          // Passive area effect radiating from caster
  'travel',        // Movement speed boost or location reveal
  'fear',          // CC debuff preventing enemy from acting (flee)
  'bandage',       // Consumable-like heal with long cooldown
  'potion',        // Consumable-like buff/heal with long cooldown
  'food_summon',   // Create consumable food items
  'resurrect',     // Revive a dead party member at low HP
  'group_heal',    // Heal all party members (less than aoe_heal)
  'craft_boost',   // Temporarily boost next crafting action quality
  'gather_boost',  // Temporarily boost next gathering action yield
  'pet_command',   // Issue command to active summoned pet
] as const;
export type AbilityKind = (typeof ABILITY_KINDS)[number];

// What resource an ability costs to use
export const RESOURCE_TYPES = ['mana', 'stamina', 'hp', 'none'] as const;
export type ResourceType = (typeof RESOURCE_TYPES)[number];

// What type of damage an ability deals
export const DAMAGE_TYPES = [
  'physical',  // Reduced by armorClass
  'arcane',    // Reduced by magicResist, scales with INT
  'divine',    // Reduced by magicResist, scales with WIS
  'nature',    // Reduced by magicResist, scales with WIS
  'fire',      // Reduced by magicResist (elemental)
  'ice',       // Reduced by magicResist (elemental)
  'shadow',    // Reduced by magicResist (dark magic)
  'none',      // No damage (utility/buff ability)
] as const;
export type DamageType = (typeof DAMAGE_TYPES)[number];

// Which stat scales the ability's power
export const SCALING_TYPES = [
  'str', 'dex', 'int', 'wis', 'cha',
  'hybrid',  // Uses class primary (60%) + secondary (40%)
  'none',    // Flat power, no stat scaling
] as const;
export type ScalingType = (typeof SCALING_TYPES)[number];

// How the ability selects its target(s)
export const TARGET_RULES = [
  'single_enemy',   // One enemy target
  'single_ally',    // One friendly target
  'self',           // Caster only
  'all_enemies',    // Every enemy in combat
  'all_allies',     // Every ally in combat (including self)
  'all_party',      // All party members
  'lowest_hp_ally', // Auto-select lowest HP ally
  'lowest_hp_enemy',// Auto-select lowest HP enemy
  'corpse',         // Target a corpse (resurrect, summon)
] as const;
export type TargetRule = (typeof TARGET_RULES)[number];

// When an ability can be used
export const COMBAT_STATES = [
  'any',                // Usable in or out of combat
  'combat_only',        // Only during active combat
  'out_of_combat_only', // Only outside combat
] as const;
export type CombatState = (typeof COMBAT_STATES)[number];

// ----------------------------------------------------------------------------
// 3. EFFECTS & CONDITIONS — Status effects that persist over time
// ----------------------------------------------------------------------------

// Every effect type the engine can apply to a character or enemy.
// Effects are rows in character_effect / combat_enemy_effect tables.
export const EFFECT_TYPES = [
  // Stat modifiers (positive = buff, negative = debuff)
  'str_bonus', 'dex_bonus', 'int_bonus', 'wis_bonus', 'cha_bonus',
  'hp_bonus', 'ac_bonus',

  // Offense modifiers
  'damage_up',      // Increase damage dealt (magnitude = % bonus)
  'damage_down',    // Decrease damage dealt (magnitude = % reduction)
  'damage_taken',   // Increase damage received (magnitude = % increase)

  // Defense
  'armor_up',       // Increase armor class
  'armor_down',     // Decrease armor class
  'damage_shield',  // Absorb N damage before breaking
  'magic_resist',   // Increase magic resistance

  // Regeneration
  'regen',           // HP regeneration (ticks over duration)
  'dot',             // Damage over time (ticks over duration)
  'mana_regen',      // Mana per tick
  'stamina_regen',   // Stamina per tick
  'health_regen',    // Flat HP regen per tick
  'mana_regen_bonus',// % increase to mana regen

  // Crowd control
  'stun',       // Cannot act (duration in magnitude as micros)
  'root',       // Cannot move but can act
  'silence',    // Cannot use magic abilities
  'slow',       // Reduced action speed
  'mesmerize',  // Cannot act, breaks on damage

  // Resource modifiers
  'stamina_free',  // Next stamina ability costs 0

  // Food buffs
  'food_health_regen',  // Food-based HP regen
  'food_mana_regen',    // Food-based mana regen
  'food_stamina_regen', // Food-based stamina regen

  // Social/utility
  'faction_bonus',          // Faction rep gain modifier
  'faction_standing_bonus', // Direct faction standing modifier
  'loot_bonus',             // Drop rate modifier

  // Proc triggers (passive effects that activate conditionally)
  'on_hit',          // Triggers when landing an attack
  'on_crit',         // Triggers on critical strike
  'on_kill',         // Triggers when killing an enemy
  'on_damage_taken', // Triggers when taking damage
] as const;
export type EffectType = (typeof EFFECT_TYPES)[number];

// Crowd control subtypes — for the 'cc' ability kind
export const CC_TYPES = ['stun', 'root', 'silence', 'slow', 'mesmerize'] as const;
export type CcType = (typeof CC_TYPES)[number];

// ----------------------------------------------------------------------------
// 4. ITEMS & EQUIPMENT — What items can be and do
// ----------------------------------------------------------------------------

// Equipment slots on a character
export const EQUIPMENT_SLOTS = [
  'mainHand', 'offHand',
  'head', 'chest', 'legs', 'boots', 'hands', 'wrists', 'belt',
  'neck', 'earrings', 'cloak',
] as const;
export type EquipmentSlot = (typeof EQUIPMENT_SLOTS)[number];

// Armor material types (determines base AC and class restrictions)
export const ARMOR_TYPES = ['cloth', 'leather', 'chain', 'plate', 'shield'] as const;
export type ArmorType = (typeof ARMOR_TYPES)[number];

// Base armor class values per material
export const BASE_ARMOR_VALUES: Record<string, bigint> = {
  cloth: 2n,
  leather: 4n,
  chain: 6n,
  plate: 8n,
};

// Weapon categories (determines attack speed, crit multiplier, etc.)
export const WEAPON_TYPES = [
  'dagger', 'rapier', 'sword', 'blade', 'mace', 'axe',
  'bow', 'staff', 'greatsword', 'wand',
] as const;
export type WeaponType = (typeof WEAPON_TYPES)[number];

// Item quality tiers (determines affix count, power budget)
export const QUALITY_TIERS = [
  'common', 'uncommon', 'rare', 'epic', 'legendary',
] as const;
export type QualityTier = (typeof QUALITY_TIERS)[number];

// Crafting quality (how well an item was crafted)
export const CRAFT_QUALITIES = [
  'dented', 'standard', 'reinforced', 'exquisite', 'mastercraft',
] as const;
export type CraftQuality = (typeof CRAFT_QUALITIES)[number];

// Stats that item affixes can modify
export const AFFIX_STATS = [
  'strBonus', 'dexBonus', 'intBonus', 'wisBonus', 'chaBonus',
  'hpBonus', 'manaBonus',
  'armorClassBonus', 'magicResistanceBonus',
  'lifeOnHit', 'cooldownReduction', 'manaRegen',
] as const;
export type AffixStat = (typeof AFFIX_STATS)[number];

// Affix position on item name
export const AFFIX_TYPES = ['prefix', 'suffix'] as const;
export type AffixType = (typeof AFFIX_TYPES)[number];

// Item categories (what kind of thing is it)
export const ITEM_CATEGORIES = [
  'weapon', 'armor', 'accessory', 'consumable',
  'resource', 'quest_item', 'recipe', 'junk',
] as const;
export type ItemCategory = (typeof ITEM_CATEGORIES)[number];

// Food/consumable buff types
export const FOOD_BUFF_TYPES = [
  'str', 'dex', 'int', 'wis', 'cha',
  'health_regen', 'mana_regen', 'stamina_regen',
] as const;
export type FoodBuffType = (typeof FOOD_BUFF_TYPES)[number];

// ----------------------------------------------------------------------------
// 5. COMBAT SYSTEM — Rules of engagement
// ----------------------------------------------------------------------------

// Combat encounter outcomes
export const COMBAT_OUTCOMES = ['active', 'victory', 'defeat', 'fled'] as const;
export type CombatOutcome = (typeof COMBAT_OUTCOMES)[number];

// Enemy roles (determines AI behavior and stat distribution)
export const ENEMY_ROLES = ['tank', 'damage', 'healer', 'caster'] as const;
export type EnemyRole = (typeof ENEMY_ROLES)[number];

// Threat multipliers by role
export const THREAT_CONFIG = {
  tankMultiplier: 1.5,      // Tanks generate 150% threat
  healerMultiplier: 0.5,    // Healers generate 50% threat
  summonerMultiplier: 0.75, // Summoners generate 75% threat
  healingThreatPercent: 0.5,// Healing generates 50% threat
  globalDamageMultiplier: 0.85, // All damage reduced by 15%
  aoeDamageMultiplier: 0.65,    // AoE damage per target is 65%
  dotScalingModifier: 0.5,      // DoTs get 50% of direct scaling
  debuffPowerCost: 0.25,        // Debuffs cost 25% of power budget
} as const;

// Summon/pet parameters
export const PET_CONFIG = {
  maxActivePets: 1,
  baseInitialAggro: 200n,
} as const;

// Global cooldown
export const GLOBAL_COOLDOWN_MICROS = 1_500_000n; // 1.5 seconds

// ----------------------------------------------------------------------------
// 6. WORLD & EXPLORATION — What the world can contain
// ----------------------------------------------------------------------------

// Biome types for generated regions
export const BIOME_TYPES = [
  'volcanic', 'forest', 'tundra', 'desert', 'swamp',
  'mountains', 'plains', 'coastal', 'cavern', 'ruins',
  'jungle', 'wasteland', 'arctic', 'underground',
] as const;
export type BiomeType = (typeof BIOME_TYPES)[number];

// Location features — what a location can have
export const LOCATION_FEATURES = [
  'bindStone',   // Players can bind here (respawn point)
  'vendor',      // Has a vendor NPC
  'bank',        // Has bank access
  'craftStation', // Has crafting station
  'questHub',    // NPCs with quests
  'dungeon',     // Instanced danger area
  'resource',    // Has gatherable resources
] as const;
export type LocationFeature = (typeof LOCATION_FEATURES)[number];

// ----------------------------------------------------------------------------
// 7. QUESTS — What quests can ask players to do
// ----------------------------------------------------------------------------

// Quest objective types — the mechanical actions a quest can require
export const QUEST_TYPES = [
  'kill',         // Kill N of a specific enemy type
  'kill_loot',    // Kill enemies and collect dropped items
  'explore',      // Visit a specific location
  'delivery',     // Bring an item to an NPC
  'boss_kill',    // Defeat a specific named enemy
  'gather',       // Collect N of a resource from the world
  'escort',       // Protect an NPC during travel
  'interact',     // Use/interact with a world object
  'discover',     // Find a hidden location or secret
] as const;
export type QuestType = (typeof QUEST_TYPES)[number];

// What quests can do to the world (side effects of quest progression)
export const QUEST_WORLD_EFFECTS = [
  'spawn_enemies',    // Quest creates enemies at a location
  'spawn_npc',        // Quest brings an NPC into existence
  'create_location',  // Quest creates a new location in a region
  'unlock_path',      // Quest opens a connection between locations
  'spawn_item',       // Quest places an item in the world
  'modify_faction',   // Quest changes faction standings
  'trigger_event',    // Quest triggers a world event
] as const;
export type QuestWorldEffect = (typeof QUEST_WORLD_EFFECTS)[number];

// Quest reward types
export const QUEST_REWARD_TYPES = [
  'xp', 'gold', 'item', 'faction_standing', 'renown',
  'recipe', 'ability', 'location_unlock',
] as const;
export type QuestRewardType = (typeof QUEST_REWARD_TYPES)[number];

// ----------------------------------------------------------------------------
// 8. NPC MECHANICS — How NPCs behave
// ----------------------------------------------------------------------------

// NPC roles — what function an NPC serves
export const NPC_ROLES = [
  'vendor',       // Buys and sells items
  'questgiver',   // Offers and progresses quests
  'trainer',      // Teaches abilities or skills
  'banker',       // Provides bank access
  'crafter',      // Crafts items from materials
  'lorekeeper',   // Provides world lore and hints
  'guide',        // Helps with navigation/travel
  'guard',        // Protects a location
  'wanderer',     // Moves between locations
] as const;
export type NpcRole = (typeof NPC_ROLES)[number];

// ----------------------------------------------------------------------------
// NPC CONVERSATION SYSTEM — Dynamic, not scripted
// ----------------------------------------------------------------------------
//
// NPCs are living characters with memory. Conversations are natural language
// routed through the LLM, constrained by:
//   1. NPC personality, role, knowledge (generated at NPC creation)
//   2. Affinity level (determines willingness to share/help)
//   3. Conversation history with THIS player (NPC remembers)
//   4. World state (region, threats, events, faction tensions)
//
// There are NO dialogue trees. Players type freely. The LLM responds in
// character, and the response can trigger mechanical effects (quest offers,
// item gifts, location reveals) based on the conversation context.

// Affinity thresholds — what the NPC is willing to do at each level
// Affinity is per-player, per-NPC (the existing npc_affinity table)
export const NPC_AFFINITY_THRESHOLDS = {
  hostile: -50n,      // NPC refuses to interact, may alert guards
  unfriendly: -25n,   // NPC is curt, minimal responses, no services
  neutral: 0n,        // NPC is polite but guarded, basic services only
  friendly: 25n,      // NPC shares personal lore, offers side quests
  trusted: 50n,       // NPC reveals secrets, offers rare quests/items
  bonded: 75n,        // NPC treats player as confidant, deepest content
} as const;

// What affinity unlocks (cumulative — higher includes lower)
export const AFFINITY_UNLOCKS = [
  'basic_services',    // Vendor, banking, basic directions (neutral+)
  'personal_lore',     // NPC shares their backstory (friendly+)
  'side_quests',       // NPC offers optional quests (friendly+)
  'rare_items',        // NPC offers rare items for sale/trade (trusted+)
  'secret_locations',  // NPC reveals hidden places (trusted+)
  'unique_quests',     // NPC offers one-of-a-kind quest chains (trusted+)
  'faction_secrets',   // NPC reveals deep faction politics (bonded+)
  'unique_abilities',  // NPC can teach unique abilities (bonded+)
  'world_secrets',     // NPC shares world-altering knowledge (bonded+)
] as const;
export type AffinityUnlock = (typeof AFFINITY_UNLOCKS)[number];

// What changes affinity (the system tracks these automatically)
export const AFFINITY_MODIFIERS = [
  'quest_complete',    // Completing a quest for this NPC (+)
  'gift_given',        // Giving the NPC a gift (+, scaled by item value)
  'conversation',      // Positive/respectful conversation (+small)
  'insult',            // Rude/hostile conversation (-moderate)
  'theft',             // Stealing from NPC's vendor stock (-large)
  'faction_action',    // Actions affecting NPC's faction (+/-)
  'betrayal',          // Failing/abandoning NPC's quest (-large)
  'rescue',            // Saving NPC from danger (+large)
  'world_event',       // World event outcome affecting NPC (+/-)
] as const;
export type AffinityModifier = (typeof AFFINITY_MODIFIERS)[number];

// NPC memory — what an NPC remembers about a specific player
// This is stored per-NPC-per-player and fed into the LLM context
export const NPC_MEMORY_TYPES = [
  'quest_history',     // Quests completed/failed for this NPC
  'conversation_topic',// Key topics discussed (summarized, not full logs)
  'gift_history',      // Notable gifts given
  'betrayal',          // Times the player broke trust
  'shared_secret',     // Secrets the NPC has revealed to this player
  'nickname',          // What the NPC calls this player
  'faction_opinion',   // NPC's view of player's faction activities
] as const;
export type NpcMemoryType = (typeof NPC_MEMORY_TYPES)[number];

// Conversation side effects — what an LLM-driven conversation can trigger
// The LLM response includes structured data alongside the dialogue text
export const CONVERSATION_EFFECTS = [
  'offer_quest',       // NPC offers a new quest
  'reveal_location',   // NPC tells player about a place (may create it)
  'give_item',         // NPC hands player an item
  'teach_ability',     // NPC teaches a new ability
  'share_recipe',      // NPC shares a crafting recipe
  'affinity_change',   // Conversation shifts affinity (+/-)
  'faction_info',      // NPC reveals faction intelligence
  'warn_danger',       // NPC warns about threats (spawns enemies?)
  'request_item',      // NPC asks player to bring something
  'open_shop',         // Conversation leads to vendor interface
  'none',              // Pure conversation, no mechanical effect
] as const;
export type ConversationEffect = (typeof CONVERSATION_EFFECTS)[number];

// ----------------------------------------------------------------------------
// 9. CRAFTING — How items are made
// ----------------------------------------------------------------------------

// Crafting material categories (generated, not hardcoded)
// Materials belong to tiers and have affinities toward certain item types.
export const MATERIAL_TIERS = [1, 2, 3, 4, 5] as const;
export type MaterialTier = (typeof MATERIAL_TIERS)[number];

// What a material can be used for
export const MATERIAL_AFFINITIES = [
  'weapon', 'armor', 'accessory', 'consumable', 'any',
] as const;
export type MaterialAffinity = (typeof MATERIAL_AFFINITIES)[number];

// How materials are obtained
export const MATERIAL_SOURCES = [
  'gathering',   // Harvested from resource nodes
  'enemy_drop',  // Dropped by enemies
  'quest_reward', // Given as quest reward
  'vendor',      // Purchased from NPC
  'crafting',    // Created from other materials (refined)
  'discovery',   // Found during exploration
] as const;
export type MaterialSource = (typeof MATERIAL_SOURCES)[number];

// Crafting essence types — the stat-infusion system
export const ESSENCE_TYPES = [
  // Stat essences
  'glowing_stone',  // STR infusion
  'clear_crystal',  // DEX infusion
  'ancient_rune',   // INT infusion
  'wisdom_herb',    // WIS infusion
  'silver_token',   // CHA infusion
  // Defense essences
  'life_stone',     // HP infusion
  'mana_pearl',     // Mana infusion
  'iron_ward',      // Armor infusion
  'spirit_ward',    // Magic resist infusion
] as const;
export type EssenceType = (typeof ESSENCE_TYPES)[number];

// ----------------------------------------------------------------------------
// 10. STAT FORMULAS — How base stats are computed
// ----------------------------------------------------------------------------

// These are the RULES for stat computation. Not content — math.
export const STAT_FORMULAS = {
  baseStat: 8n,          // Every stat starts at 8
  primaryBonus: 4n,      // Primary stat gets +4 at creation
  secondaryBonus: 2n,    // Secondary stat gets +2 at creation
  primaryGrowth: 3n,     // Primary stat gains +3 per level
  secondaryGrowth: 2n,   // Secondary stat gains +2 per level
  otherGrowth: 1n,       // Other stats gain +1 per level
  baseHp: 50n,           // Starting HP pool
  hpStrMultiplier: 8n,   // HP per STR point
  baseMana: 10n,         // Starting mana pool
  manaMultiplier: 6n,    // Mana per primary caster stat
  hybridManaMultiplier: 4n, // Mana per stat for hybrid classes
} as const;

// ----------------------------------------------------------------------------
// 11. ARCHETYPE SYSTEM — The two fundamental paths
// ----------------------------------------------------------------------------
//
// Every generated class falls under one of two archetypes.
// The archetype determines baseline mechanical behavior when a generated
// class name isn't recognized by the legacy system.

export const ARCHETYPES = ['warrior', 'mystic'] as const;
export type Archetype = (typeof ARCHETYPES)[number];

export const ARCHETYPE_DEFAULTS: Record<Archetype, {
  primaryStat: StatType;
  secondaryStat: StatType;
  usesMana: boolean;
  canParry: boolean;
  baseArmor: string;
}> = {
  warrior: {
    primaryStat: 'str',
    secondaryStat: 'dex',
    usesMana: false,
    canParry: true,
    baseArmor: 'chain',
  },
  mystic: {
    primaryStat: 'int',
    secondaryStat: 'wis',
    usesMana: true,
    canParry: false,
    baseArmor: 'cloth',
  },
};

// ----------------------------------------------------------------------------
// 12. PROC SYSTEM — Passive triggered effects
// ----------------------------------------------------------------------------

export const PROC_TRIGGERS = [
  'on_hit',          // When landing a successful attack
  'on_crit',         // When landing a critical strike
  'on_kill',         // When killing an enemy
  'on_damage_taken', // When receiving damage
  'on_heal',         // When healing a target
  'on_ability_use',  // When using any ability
] as const;
export type ProcTrigger = (typeof PROC_TRIGGERS)[number];

// What a proc can do when it triggers
export const PROC_EFFECTS = [
  'bonus_damage',    // Deal extra damage (procDamageMultiplier)
  'heal_percent',    // Heal caster for % of damage/max HP
  'apply_effect',    // Apply an effect (uses buffType + buffMagnitude)
  'restore_resource',// Restore mana/stamina
  'reset_cooldown',  // Reset an ability cooldown
] as const;
export type ProcEffect = (typeof PROC_EFFECTS)[number];

// ----------------------------------------------------------------------------
// 13. FACTION & REPUTATION
// ----------------------------------------------------------------------------

// Factions are generated content, but the standing system is a rule.
// Standing is a signed integer. Higher = more friendly.
export const FACTION_STANDING_THRESHOLDS = {
  hated: -100n,
  hostile: -50n,
  unfriendly: -25n,
  neutral: 0n,
  friendly: 25n,
  honored: 50n,
  revered: 75n,
  exalted: 100n,
} as const;

// What faction standing unlocks
export const FACTION_UNLOCKS = [
  'vendor_access',    // Can buy from faction vendors
  'quest_access',     // Can accept faction quests
  'location_access',  // Can enter faction-restricted areas
  'recipe_access',    // Can learn faction recipes
  'title',            // Earn a faction title
] as const;
export type FactionUnlock = (typeof FACTION_UNLOCKS)[number];

// ----------------------------------------------------------------------------
// 14. WORLD EVENT SYSTEM
// ----------------------------------------------------------------------------

// World events are generated, but the consequence types are rules.
export const EVENT_CONSEQUENCE_TYPES = [
  'race_unlock',                // Unlocks a playable race
  'enemy_composition_change',   // Changes enemy spawns in a region
  'faction_standing_bonus',     // Adjusts faction standings
  'location_change',            // Modifies a location
  'npc_arrival',                // New NPC appears
  'resource_spawn',             // New gathering node appears
  'none',                       // Flavor only
] as const;
export type EventConsequenceType = (typeof EVENT_CONSEQUENCE_TYPES)[number];
