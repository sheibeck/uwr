// crafting_materials.ts
// Defines the material taxonomy and helper functions for the Phase 13 crafting system.
//
// Materials are the core resource of gear crafting. Each material:
//   - Has a tier (1-3) that determines craft quality output
//   - Has sources (gather from terrain nodes, or drop from creature types)
//
// Crafted gear stat bonuses come from craft quality implicit affixes and modifier
// reagents (via CRAFTING_MODIFIER_DEFS), not material-specific affix maps.

export interface MaterialDef {
  key: string;              // matches ItemTemplate name lowercased with underscores
  name: string;             // display name e.g. 'Darksteel Ore'
  tier: bigint;             // 1n, 2n, or 3n
  vendorValue?: bigint;     // base vendor sell price
  description?: string;     // shown in hover tooltip
  sources: ('gather' | 'drop')[];
  dropCreatureTypes?: string[];  // which creature types drop this
  gatherTerrains?: string[];     // which terrain types have nodes
  gatherEntries?: { terrain: string; weight: bigint; timeOfDay: string }[];  // terrain gather pool entries
  affinityStats: string[];       // stat keys this material enables
}

// ---------------------------------------------------------------------------
// MATERIAL DEFINITIONS — 14 materials across 3 tiers (10 original + 4 Essence)
// ---------------------------------------------------------------------------

export const MATERIAL_DEFS: MaterialDef[] = [
  // Tier 1
  {
    key: 'copper_ore',
    name: 'Copper Ore',
    tier: 1n,
    vendorValue: 2n,
    description: 'Raw copper ore mined from rocky deposits. Used in basic metalworking recipes.',
    sources: ['gather'],
    gatherTerrains: ['mountains', 'plains'],
    gatherEntries: [
      { terrain: 'mountains', weight: 15n, timeOfDay: 'any' },
      { terrain: 'plains', weight: 10n, timeOfDay: 'any' },
    ],
    affinityStats: ['strBonus'],
  },
  {
    key: 'rough_hide',
    name: 'Rough Hide',
    tier: 1n,
    vendorValue: 2n,
    description: 'Untreated animal hide stripped from beasts. A staple leather-working material.',
    sources: ['drop'],
    dropCreatureTypes: ['animal', 'beast'],
    affinityStats: ['dexBonus'],
  },
  {
    key: 'bone_shard',
    name: 'Bone Shard',
    tier: 1n,
    vendorValue: 2n,
    description: 'Splintered bone fragments scavenged from the dead. Used to reinforce armor and accessories.',
    sources: ['drop'],
    dropCreatureTypes: ['undead', 'animal', 'humanoid'],
    affinityStats: ['hpBonus', 'armorClassBonus'],
  },

  // Tier 2
  {
    key: 'iron_ore',
    name: 'Iron Ore',
    tier: 2n,
    vendorValue: 4n,
    description: 'Dense iron ore found deep in mountain veins. Smelts into sturdy ingots for advanced crafting.',
    sources: ['gather'],
    gatherTerrains: ['mountains'],
    gatherEntries: [
      { terrain: 'mountains', weight: 10n, timeOfDay: 'any' },
    ],
    affinityStats: ['strBonus', 'armorClassBonus'],
  },
  {
    key: 'tanned_leather',
    name: 'Tanned Leather',
    tier: 2n,
    vendorValue: 4n,
    description: 'Cured animal leather, supple and durable. Essential for mid-tier armor crafting.',
    sources: ['drop'],
    dropCreatureTypes: ['beast', 'animal'],
    affinityStats: ['dexBonus', 'hpBonus'],
  },
  {
    key: 'spirit_essence',
    name: 'Spirit Essence',
    tier: 2n,
    vendorValue: 5n,
    description: 'Concentrated spiritual residue harvested from otherworldly creatures. Channels arcane properties into crafted items.',
    sources: ['drop'],
    dropCreatureTypes: ['spirit', 'undead', 'humanoid'],
    affinityStats: ['intBonus', 'wisBonus'],
  },

  // Tier 3
  {
    key: 'darksteel_ore',
    name: 'Darksteel Ore',
    tier: 3n,
    vendorValue: 8n,
    description: 'Rare dark-veined ore infused with residual magic. The finest metallic crafting material.',
    sources: ['gather'],
    gatherTerrains: ['dungeon', 'mountains'],
    gatherEntries: [
      { terrain: 'mountains', weight: 5n, timeOfDay: 'any' },
      { terrain: 'dungeon', weight: 10n, timeOfDay: 'any' },
    ],
    affinityStats: ['strBonus'],
  },
  {
    key: 'moonweave_cloth',
    name: 'Moonweave Cloth',
    tier: 3n,
    vendorValue: 8n,
    description: 'Gossamer fibers gathered under moonlight from enchanted flora. Prized by cloth-working artisans.',
    sources: ['gather'],
    gatherTerrains: ['swamp', 'woods'],
    gatherEntries: [
      { terrain: 'swamp', weight: 5n, timeOfDay: 'night' },
      { terrain: 'woods', weight: 5n, timeOfDay: 'night' },
    ],
    affinityStats: ['intBonus', 'wisBonus', 'manaBonus'],
  },
  {
    key: 'shadowhide',
    name: 'Shadowhide',
    tier: 3n,
    vendorValue: 8n,
    description: 'Supernaturally tough hide from shadow-touched beasts. Near-impervious when worked properly.',
    sources: ['drop'],
    dropCreatureTypes: ['beast', 'construct'],
    affinityStats: ['dexBonus', 'cooldownReduction'],
  },
  {
    key: 'void_crystal',
    name: 'Void Crystal',
    tier: 3n,
    vendorValue: 10n,
    description: 'A crystalline shard pulsing with void energy. Amplifies magical resistance when embedded in gear.',
    sources: ['drop'],
    dropCreatureTypes: ['spirit', 'construct'],
    affinityStats: ['magicResistanceBonus', 'manaRegen'],
  },

  // Essence (drop-only, used in crafting dialog to unlock stat affixes)
  { key: 'lesser_essence', name: 'Lesser Essence', tier: 1n, vendorValue: 3n, description: 'A faint spark of elemental power extracted from slain creatures. Used to imbue crafted gear with minor enchantments.', sources: ['drop'], dropCreatureTypes: ['animal', 'beast', 'humanoid', 'undead'], affinityStats: [] },
  { key: 'essence', name: 'Essence', tier: 2n, vendorValue: 6n, description: 'A concentrated elemental force drawn from formidable foes. Enables moderate gear enchantments.', sources: ['drop'], dropCreatureTypes: ['animal', 'beast', 'humanoid', 'undead', 'spirit'], affinityStats: [] },
  { key: 'greater_essence', name: 'Greater Essence', tier: 3n, vendorValue: 12n, description: 'A potent wellspring of elemental might. Unlocks the strongest gear enchantments.', sources: ['drop'], dropCreatureTypes: ['beast', 'construct', 'spirit', 'undead'], affinityStats: [] },
];


// ---------------------------------------------------------------------------
// HELPER FUNCTIONS
// ---------------------------------------------------------------------------

/**
 * Maps material tier to craft quality level. Fully deterministic.
 * T1 → standard, T2 → reinforced, T3 → exquisite.
 * Dented and Mastercraft are not achievable via basic crafting.
 */
export function materialTierToCraftQuality(tier: bigint): string {
  if (tier === 1n) return 'standard';
  if (tier === 2n) return 'reinforced';
  if (tier === 3n) return 'exquisite';
  return 'standard';
}

/** Ordered craft quality levels from worst to best */
export const CRAFT_QUALITY_LEVELS = ['dented', 'standard', 'reinforced', 'exquisite', 'mastercraft'] as const;

/**
 * Maps equipment slot + armorType to the primary material for salvage.
 * Returns a material DISPLAY NAME (matching ItemTemplate.name) or undefined.
 */
export function getMaterialForSalvage(
  slot: string,
  armorType: string | undefined,
  tier: bigint
): string | undefined {
  // Weapons
  if (slot === 'mainHand' || slot === 'offHand') {
    if (tier === 1n) return 'Copper Ore';
    if (tier === 2n) return 'Iron Ore';
    if (tier >= 3n) return 'Darksteel Ore';
  }

  // Light armor (cloth/leather)
  if (slot === 'chest' || slot === 'legs' || slot === 'boots' ||
    slot === 'head' || slot === 'hands' || slot === 'wrists' || slot === 'belt') {
    const at = (armorType ?? '').toLowerCase();
    if (at === 'cloth' || at === 'leather' || at === 'light') {
      if (tier === 1n) return 'Rough Hide';
      if (tier === 2n) return 'Tanned Leather';
      if (tier >= 3n) return 'Shadowhide';
    }
    // Heavy armor (chain/plate/medium/heavy)
    if (tier === 1n) return 'Copper Ore';
    if (tier === 2n) return 'Iron Ore';
    if (tier >= 3n) return 'Darksteel Ore';
  }

  // Jewelry / accessories
  if (slot === 'earrings' || slot === 'neck' || slot === 'cloak') {
    if (tier === 1n) return 'Bone Shard';
    if (tier === 2n) return 'Spirit Essence';
    if (tier >= 3n) return 'Void Crystal';
  }

  return undefined;
}

// ---------------------------------------------------------------------------
// CONSUMABLE RECIPE DEFINITIONS — 14 consumable recipes
// Centralized so seeding and other consumers don't duplicate recipe metadata.
// ---------------------------------------------------------------------------

export interface ConsumableRecipeDef {
  key: string;
  name: string;
  outputName: string;   // matches ItemTemplate.name
  outputCount: bigint;
  req1Name: string;     // matches ItemTemplate.name
  req1Count: bigint;
  req2Name: string;
  req2Count: bigint;
  req3Name?: string;
  req3Count?: bigint;
  description: string;
  outputSlot: string;
  outputVendorValue: bigint;
  foodBuff?: {
    buffType: string;
    magnitude: bigint;
    durationMicros: bigint;
  };
}

export const CONSUMABLE_RECIPES: ConsumableRecipeDef[] = [
  { key: 'bandage', name: 'Bandages', outputName: 'Bandage', outputCount: 1n, req1Name: 'Flax', req1Count: 1n, req2Name: 'Herbs', req2Count: 1n, description: 'Strips of clean cloth used to bind wounds. Restores a small amount of health.', outputSlot: 'consumable', outputVendorValue: 2n },
  { key: 'simple_rations', name: 'Simple Rations', outputName: 'Simple Rations', outputCount: 1n, req1Name: 'Raw Meat', req1Count: 1n, req2Name: 'Salt', req2Count: 1n, description: 'Basic preserved food. Staves off hunger but grants no special effects.', outputSlot: 'consumable', outputVendorValue: 2n },
  { key: 'torch', name: 'Torch', outputName: 'Torch', outputCount: 1n, req1Name: 'Wood', req1Count: 1n, req2Name: 'Resin', req2Count: 1n, description: 'A wooden shaft wrapped in oil-soaked cloth. Provides light in dark places.', outputSlot: 'utility', outputVendorValue: 2n },
  { key: 'basic_poultice', name: 'Basic Poultice', outputName: 'Basic Poultice', outputCount: 1n, req1Name: 'Herbs', req1Count: 1n, req2Name: 'Flax', req2Count: 1n, req3Name: 'Clear Water', req3Count: 1n, description: 'A moist herbal compress that speeds natural healing.', outputSlot: 'consumable', outputVendorValue: 2n },
  { key: 'travelers_tea', name: 'Travelers Tea', outputName: 'Travelers Tea', outputCount: 1n, req1Name: 'Herbs', req1Count: 1n, req2Name: 'Clear Water', req2Count: 1n, description: 'A warm herbal infusion that restores stamina on the road.', outputSlot: 'consumable', outputVendorValue: 2n },
  { key: 'whetstone', name: 'Whetstone', outputName: 'Whetstone', outputCount: 1n, req1Name: 'Stone', req1Count: 1n, req2Name: 'Sand', req2Count: 1n, description: 'A coarse grinding stone used to sharpen blades before battle.', outputSlot: 'utility', outputVendorValue: 2n },
  { key: 'kindling_bundle', name: 'Kindling Bundle', outputName: 'Kindling Bundle', outputCount: 1n, req1Name: 'Wood', req1Count: 1n, req2Name: 'Dry Grass', req2Count: 1n, description: 'A bundle of dry twigs and bark. Starts campfires quickly.', outputSlot: 'utility', outputVendorValue: 1n },
  { key: 'rough_rope', name: 'Rough Rope', outputName: 'Rough Rope', outputCount: 1n, req1Name: 'Flax', req1Count: 1n, req2Name: 'Resin', req2Count: 1n, description: 'Braided plant fibers twisted into a sturdy rope.', outputSlot: 'utility', outputVendorValue: 2n },
  { key: 'charcoal', name: 'Charcoal', outputName: 'Charcoal', outputCount: 1n, req1Name: 'Wood', req1Count: 1n, req2Name: 'Stone', req2Count: 1n, description: 'Blackened wood remnants. Burns hotter than raw timber.', outputSlot: 'resource', outputVendorValue: 1n },
  { key: 'crude_poison', name: 'Crude Poison', outputName: 'Crude Poison', outputCount: 1n, req1Name: 'Bitter Herbs', req1Count: 1n, req2Name: 'Resin', req2Count: 1n, description: 'A noxious paste distilled from bitter herbs. Applied to weapon edges.', outputSlot: 'consumable', outputVendorValue: 3n },
  { key: 'herb_broth', name: 'Herb Broth', outputName: 'Herb Broth', outputCount: 1n, req1Name: 'Wild Berries', req1Count: 2n, req2Name: 'Clear Water', req2Count: 1n, description: 'A fragrant broth steeped with wild herbs. Boosts mana regeneration while Well Fed.', outputSlot: 'food', outputVendorValue: 2n, foodBuff: { buffType: 'mana_regen', magnitude: 1n, durationMicros: 2_700_000_000n } },
  { key: 'roasted_roots', name: 'Roasted Roots', outputName: 'Roasted Roots', outputCount: 1n, req1Name: 'Root Vegetable', req1Count: 2n, req2Name: 'Salt', req2Count: 1n, description: 'Hearty roasted tubers seasoned with salt. Boosts strength while Well Fed.', outputSlot: 'food', outputVendorValue: 2n, foodBuff: { buffType: 'str', magnitude: 1n, durationMicros: 2_700_000_000n } },
  { key: 'travelers_stew', name: "Traveler's Stew", outputName: "Traveler's Stew", outputCount: 1n, req1Name: 'Root Vegetable', req1Count: 1n, req2Name: 'Raw Meat', req2Count: 1n, description: 'A thick stew of meat and vegetables. Boosts stamina regeneration while Well Fed.', outputSlot: 'food', outputVendorValue: 2n, foodBuff: { buffType: 'stamina_regen', magnitude: 1n, durationMicros: 2_700_000_000n } },
  { key: 'foragers_salad', name: "Forager's Salad", outputName: "Forager's Salad", outputCount: 1n, req1Name: 'Wild Berries', req1Count: 1n, req2Name: 'Herbs', req2Count: 1n, description: "A crisp mix of berries and greens. Boosts dexterity while Well Fed.", outputSlot: 'food', outputVendorValue: 2n, foodBuff: { buffType: 'dex', magnitude: 1n, durationMicros: 2_700_000_000n } },
  { key: 'healers_porridge', name: "Healer's Porridge", outputName: "Healer's Porridge", outputCount: 1n, req1Name: 'Herbs', req1Count: 2n, req2Name: 'Clear Water', req2Count: 1n, description: 'A soothing oat porridge infused with restorative herbs. Boosts health regeneration while Well Fed.', outputSlot: 'food', outputVendorValue: 3n, foodBuff: { buffType: 'health_regen', magnitude: 1n, durationMicros: 2_700_000_000n } },
];

// ---------------------------------------------------------------------------
// GEAR RECIPE DEFINITIONS — 15 gear recipes
// Centralized so seeding can loop instead of hardcoding each recipe.
// ---------------------------------------------------------------------------

export interface GearRecipeDef {
  key: string;
  name: string;
  outputName: string;   // matches ItemTemplate.name for the base gear output
  recipeType: 'weapon' | 'armor' | 'accessory';
  req1Name: string;     // default primary material (Copper Ore)
  req1Count: bigint;
  req2Name: string;     // default secondary material (Rough Hide)
  req2Count: bigint;
  req3Name?: string;    // optional (Essence moved to crafting dialog)
  req3Count?: bigint;
}

export const GEAR_RECIPES: GearRecipeDef[] = [
  // Weapons (mainHand)
  { key: 'craft_longsword', name: 'Longsword', outputName: 'Iron Shortsword', recipeType: 'weapon', req1Name: 'Copper Ore', req1Count: 4n, req2Name: 'Rough Hide', req2Count: 1n },
  { key: 'craft_dagger', name: 'Dagger', outputName: 'Chipped Dagger', recipeType: 'weapon', req1Name: 'Copper Ore', req1Count: 3n, req2Name: 'Rough Hide', req2Count: 1n },
  { key: 'craft_staff', name: 'Staff', outputName: 'Gnarled Staff', recipeType: 'weapon', req1Name: 'Copper Ore', req1Count: 2n, req2Name: 'Rough Hide', req2Count: 2n },
  { key: 'craft_mace', name: 'Mace', outputName: 'Worn Mace', recipeType: 'weapon', req1Name: 'Copper Ore', req1Count: 4n, req2Name: 'Rough Hide', req2Count: 1n },
  // OffHand
  { key: 'craft_shield', name: 'Shield', outputName: 'Wooden Shield', recipeType: 'weapon', req1Name: 'Copper Ore', req1Count: 3n, req2Name: 'Rough Hide', req2Count: 2n },
  // Armor
  { key: 'craft_helm', name: 'Helm', outputName: 'Iron Helm', recipeType: 'armor', req1Name: 'Copper Ore', req1Count: 3n, req2Name: 'Rough Hide', req2Count: 1n },
  { key: 'craft_breastplate', name: 'Breastplate', outputName: 'Battered Cuirass', recipeType: 'armor', req1Name: 'Copper Ore', req1Count: 4n, req2Name: 'Rough Hide', req2Count: 2n },
  { key: 'craft_bracers', name: 'Bracers', outputName: 'Leather Bracers', recipeType: 'armor', req1Name: 'Copper Ore', req1Count: 2n, req2Name: 'Rough Hide', req2Count: 2n },
  { key: 'craft_gauntlets', name: 'Gauntlets', outputName: 'Iron Gauntlets', recipeType: 'armor', req1Name: 'Copper Ore', req1Count: 3n, req2Name: 'Rough Hide', req2Count: 1n },
  { key: 'craft_girdle', name: 'Girdle', outputName: 'Rough Girdle', recipeType: 'armor', req1Name: 'Copper Ore', req1Count: 2n, req2Name: 'Rough Hide', req2Count: 2n },
  { key: 'craft_greaves', name: 'Greaves', outputName: 'Dented Greaves', recipeType: 'armor', req1Name: 'Copper Ore', req1Count: 4n, req2Name: 'Rough Hide', req2Count: 2n },
  { key: 'craft_sabatons', name: 'Sabatons', outputName: 'Dented Sabatons', recipeType: 'armor', req1Name: 'Copper Ore', req1Count: 3n, req2Name: 'Rough Hide', req2Count: 2n },
  // Accessories
  { key: 'craft_ring', name: 'Ring', outputName: 'Copper Band', recipeType: 'accessory', req1Name: 'Copper Ore', req1Count: 2n, req2Name: 'Rough Hide', req2Count: 1n },
  { key: 'craft_amulet', name: 'Amulet', outputName: 'Stone Pendant', recipeType: 'accessory', req1Name: 'Copper Ore', req1Count: 2n, req2Name: 'Rough Hide', req2Count: 1n },
  { key: 'craft_cloak', name: 'Cloak', outputName: 'Simple Cloak', recipeType: 'accessory', req1Name: 'Copper Ore', req1Count: 1n, req2Name: 'Rough Hide', req2Count: 3n },
];

/** Derived from GEAR_RECIPES — single source of truth for gear recipe names */
export const GEAR_RECIPE_NAMES = GEAR_RECIPES.map(r => r.name);

// ---------------------------------------------------------------------------
// ESSENCE TIER THRESHOLDS — used by combat.ts for runtime essence drops
// Ordered highest-first for early-return matching.
// ---------------------------------------------------------------------------

export const ESSENCE_TIER_THRESHOLDS: { minLevel: bigint; essenceName: string }[] = [
  { minLevel: 21n, essenceName: 'Greater Essence' },
  { minLevel: 11n, essenceName: 'Essence' },
  { minLevel: 1n, essenceName: 'Lesser Essence' },
];

// ---------------------------------------------------------------------------
// MODIFIER REAGENT THRESHOLDS — used by combat.ts for runtime reagent drops
// Maps enemy level ranges to eligible modifier reagent names.
// Ordered highest-first for early-return matching.
// ---------------------------------------------------------------------------

export const MODIFIER_REAGENT_THRESHOLDS: { minLevel: bigint; reagentNames: string[] }[] = [
  {
    // Level 21+: all 9 modifier reagents available
    minLevel: 21n,
    reagentNames: [
      'Glowing Stone', 'Clear Crystal', 'Life Stone',
      'Ancient Rune', 'Wisdom Herb', 'Iron Ward',
      'Silver Token', 'Mana Pearl', 'Spirit Ward',
    ],
  },
  {
    // Level 11-20: basic + mid-tier (caster + defensive added)
    minLevel: 11n,
    reagentNames: [
      'Glowing Stone', 'Clear Crystal', 'Life Stone',
      'Ancient Rune', 'Wisdom Herb', 'Iron Ward',
    ],
  },
  {
    // Level 1-10: basic stat reagents only
    minLevel: 1n,
    reagentNames: ['Glowing Stone', 'Clear Crystal', 'Life Stone'],
  },
];

// ---------------------------------------------------------------------------
// CRAFTING MODIFIER DEFINITIONS
// Modifier items that can be added to gear during crafting via the crafting dialog.
// Each modifier item corresponds to one stat affix applied to the crafted item.
// ---------------------------------------------------------------------------

export interface CraftingModifierDef {
  key: string;          // matches ItemTemplate name lowercased with underscores
  name: string;         // display name
  statKey: string;      // stat field name on ItemAffix
  description: string;  // shown in hover tooltip
  gatherEntries: { terrain: string; weight: bigint; timeOfDay: string }[];  // terrain gather pool entries (weight 1n = rare)
}

export const CRAFTING_MODIFIER_WEIGHT_MULTIPLIER = 0.5;

export const CRAFTING_MODIFIER_DEFS: CraftingModifierDef[] = [
  {
    key: 'glowing_stone', name: 'Glowing Stone', statKey: 'strBonus', description: 'Adds Strength to the crafted item.',
    gatherEntries: [{ terrain: 'mountains', weight: 1n, timeOfDay: 'any' }, { terrain: 'plains', weight: 1n, timeOfDay: 'any' }]
  },
  {
    key: 'clear_crystal', name: 'Clear Crystal', statKey: 'dexBonus', description: 'Adds Dexterity to the crafted item.',
    gatherEntries: [{ terrain: 'mountains', weight: 1n, timeOfDay: 'any' }, { terrain: 'dungeon', weight: 1n, timeOfDay: 'any' }]
  },
  {
    key: 'ancient_rune', name: 'Ancient Rune', statKey: 'intBonus', description: 'Adds Intelligence to the crafted item.',
    gatherEntries: [{ terrain: 'dungeon', weight: 1n, timeOfDay: 'any' }]
  },
  {
    key: 'wisdom_herb', name: 'Wisdom Herb', statKey: 'wisBonus', description: 'Adds Wisdom to the crafted item.',
    gatherEntries: [{ terrain: 'woods', weight: 1n, timeOfDay: 'any' }, { terrain: 'swamp', weight: 1n, timeOfDay: 'any' }]
  },
  {
    key: 'silver_token', name: 'Silver Token', statKey: 'chaBonus', description: 'Adds Charisma to the crafted item.',
    gatherEntries: [{ terrain: 'plains', weight: 1n, timeOfDay: 'any' }, { terrain: 'city', weight: 1n, timeOfDay: 'any' }]
  },
  {
    key: 'life_stone', name: 'Life Stone', statKey: 'hpBonus', description: 'Adds max HP to the crafted item.',
    gatherEntries: [{ terrain: 'woods', weight: 1n, timeOfDay: 'any' }, { terrain: 'swamp', weight: 1n, timeOfDay: 'any' }]
  },
  {
    key: 'mana_pearl', name: 'Mana Pearl', statKey: 'manaBonus', description: 'Adds max Mana to the crafted item.',
    gatherEntries: [{ terrain: 'swamp', weight: 1n, timeOfDay: 'any' }]
  },
  {
    key: 'iron_ward', name: 'Iron Ward', statKey: 'armorClassBonus', description: 'Adds Armor Class to the crafted item.',
    gatherEntries: [{ terrain: 'mountains', weight: 1n, timeOfDay: 'any' }, { terrain: 'dungeon', weight: 1n, timeOfDay: 'any' }]
  },
  {
    key: 'spirit_ward', name: 'Spirit Ward', statKey: 'magicResistanceBonus', description: 'Adds Magic Resistance to the crafted item.',
    gatherEntries: [{ terrain: 'swamp', weight: 1n, timeOfDay: 'any' }, { terrain: 'woods', weight: 1n, timeOfDay: 'any' }]
  },
];

/** Affix slots available per craft quality level */
export const AFFIX_SLOTS_BY_QUALITY: Record<string, number> = {
  dented: 0,
  standard: 1,
  reinforced: 2,
  exquisite: 3,
  mastercraft: 3,
};

/** Essence item key → stat magnitude applied per modifier */
export const ESSENCE_MAGNITUDE: Record<string, bigint> = {
  'lesser_essence': 1n,
  'essence': 2n,
  'greater_essence': 3n,
};

/**
 * Stat-specific magnitude overrides for modifier reagents per Essence tier.
 * hpBonus and manaBonus use higher magnitudes (5/8/15) to match the Vital prefix
 * magnitudeByTier in affix_catalog.ts. All other stats fall through to ESSENCE_MAGNITUDE.
 *
 * Outer key = essence item key, inner key = stat key, value = magnitude.
 */
export const MODIFIER_MAGNITUDE_BY_ESSENCE: Record<string, Record<string, bigint>> = {
  'lesser_essence': {
    hpBonus: 5n,
    manaBonus: 5n,
    armorClassBonus: 2n,
  },
  'essence': {
    hpBonus: 8n,
    manaBonus: 8n,
    armorClassBonus: 4n,
  },
  'greater_essence': {
    hpBonus: 15n,
    manaBonus: 15n,
    armorClassBonus: 8n,
  },
};

/**
 * Returns the magnitude for a specific modifier stat + essence tier combination.
 * Checks MODIFIER_MAGNITUDE_BY_ESSENCE for stat-specific overrides first,
 * then falls back to the flat ESSENCE_MAGNITUDE value.
 */
export function getModifierMagnitude(essenceKey: string, statKey: string): bigint {
  return MODIFIER_MAGNITUDE_BY_ESSENCE[essenceKey]?.[statKey] ?? ESSENCE_MAGNITUDE[essenceKey] ?? 1n;
}

/** Essence item key → craft qualities it can unlock stat affixes for */
export const ESSENCE_QUALITY_GATE: Record<string, string[]> = {
  'lesser_essence': ['standard'],
  'essence': ['standard', 'reinforced'],
  'greater_essence': ['standard', 'reinforced', 'exquisite'],
};

/**
 * Number of material items yielded from salvaging a gear piece by tier.
 */
export const SALVAGE_YIELD_BY_TIER: Record<number, bigint> = {
  1: 2n,
  2: 2n,
  3: 3n,
};

/**
 * Returns the numeric stat bonus for a given craft quality level.
 * This bonus is applied as implicit ItemAffix rows on crafted gear to represent
 * the base stat improvement from using higher-tier materials.
 *
 * - dented:     0n (no bonus, below standard quality)
 * - standard:   0n (no bonus, tier 1 baseline)
 * - reinforced: 1n (tier 2 bonus: +1 AC or +1/+1 baseDamage/dps)
 * - exquisite:  2n (tier 3 bonus: +2 AC or +2/+2 baseDamage/dps)
 * - mastercraft: 3n (reserved for future use)
 * - default:    0n
 */
export function getCraftQualityStatBonus(craftQuality: string): bigint {
  if (craftQuality === 'reinforced') return 1n;
  if (craftQuality === 'exquisite') return 2n;
  if (craftQuality === 'mastercraft') return 3n;
  return 0n;
}
