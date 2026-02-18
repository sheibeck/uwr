// crafting_materials.ts
// Defines the material taxonomy, deterministic affix mappings, and helper functions
// for the Phase 13 crafting system.
//
// Materials are the core resource of gear crafting. Each material:
//   - Has a tier (1-3) that determines output quality
//   - Has sources (gather from terrain nodes, or drop from creature types)
//   - Maps to specific stat affinities that determine crafted gear affixes
//
// Power parity: crafted gear magnitudes match equivalent-tier dropped gear.
// standard craft quality affixes use magnitude 1n (matching PREFIXES/SUFFIXES magnitudeByTier[0])
// reinforced craft quality affixes use magnitude 2n (matching magnitudeByTier[1])
// exquisite craft quality affixes use magnitude 3n (matching magnitudeByTier[2])

export interface CraftedAffix {
  affixKey: string;
  statKey: string;
  affixName: string;
  affixType: 'prefix' | 'suffix';
  magnitude: bigint;
}

export interface MaterialDef {
  key: string;              // matches ItemTemplate name lowercased with underscores
  name: string;             // display name e.g. 'Darksteel Ore'
  tier: bigint;             // 1n, 2n, or 3n
  vendorValue?: bigint;     // base vendor sell price
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
    sources: ['gather'],
    gatherTerrains: ['mountains', 'plains'],
    gatherEntries: [
      { terrain: 'mountains', weight: 3n, timeOfDay: 'any' },
      { terrain: 'plains', weight: 2n, timeOfDay: 'any' },
    ],
    affinityStats: ['strBonus'],
  },
  {
    key: 'rough_hide',
    name: 'Rough Hide',
    tier: 1n,
    vendorValue: 2n,
    sources: ['drop'],
    dropCreatureTypes: ['animal', 'beast'],
    affinityStats: ['dexBonus'],
  },
  {
    key: 'bone_shard',
    name: 'Bone Shard',
    tier: 1n,
    vendorValue: 2n,
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
    sources: ['gather'],
    gatherTerrains: ['mountains'],
    gatherEntries: [
      { terrain: 'mountains', weight: 2n, timeOfDay: 'any' },
    ],
    affinityStats: ['strBonus', 'armorClassBonus'],
  },
  {
    key: 'tanned_leather',
    name: 'Tanned Leather',
    tier: 2n,
    vendorValue: 4n,
    sources: ['drop'],
    dropCreatureTypes: ['beast', 'animal'],
    affinityStats: ['dexBonus', 'hpBonus'],
  },
  {
    key: 'spirit_essence',
    name: 'Spirit Essence',
    tier: 2n,
    vendorValue: 5n,
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
    sources: ['gather'],
    gatherTerrains: ['dungeon', 'mountains'],
    gatherEntries: [
      { terrain: 'mountains', weight: 1n, timeOfDay: 'any' },
      { terrain: 'dungeon', weight: 2n, timeOfDay: 'any' },
    ],
    affinityStats: ['strBonus'],
  },
  {
    key: 'moonweave_cloth',
    name: 'Moonweave Cloth',
    tier: 3n,
    vendorValue: 8n,
    sources: ['gather'],
    gatherTerrains: ['swamp', 'woods'],
    gatherEntries: [
      { terrain: 'swamp', weight: 1n, timeOfDay: 'night' },
      { terrain: 'woods', weight: 1n, timeOfDay: 'night' },
    ],
    affinityStats: ['intBonus', 'wisBonus', 'manaBonus'],
  },
  {
    key: 'shadowhide',
    name: 'Shadowhide',
    tier: 3n,
    vendorValue: 8n,
    sources: ['drop'],
    dropCreatureTypes: ['beast', 'construct'],
    affinityStats: ['dexBonus', 'cooldownReduction'],
  },
  {
    key: 'void_crystal',
    name: 'Void Crystal',
    tier: 3n,
    vendorValue: 10n,
    sources: ['drop'],
    dropCreatureTypes: ['spirit', 'construct'],
    affinityStats: ['magicResistanceBonus', 'manaRegen'],
  },

  // Essence (drop-only, used in crafting dialog to unlock stat affixes)
  { key: 'lesser_essence',  name: 'Lesser Essence',  tier: 1n, vendorValue: 3n,  sources: ['drop'], dropCreatureTypes: ['animal', 'beast', 'humanoid', 'undead'],          affinityStats: [] },
  { key: 'essence',         name: 'Essence',          tier: 2n, vendorValue: 6n,  sources: ['drop'], dropCreatureTypes: ['animal', 'beast', 'humanoid', 'undead', 'spirit'], affinityStats: [] },
  { key: 'greater_essence', name: 'Greater Essence',  tier: 3n, vendorValue: 12n, sources: ['drop'], dropCreatureTypes: ['beast', 'construct', 'spirit', 'undead'],          affinityStats: [] },
];

// ---------------------------------------------------------------------------
// MATERIAL AFFIX MAP
// Outer key = material key, Inner key = craft quality level ('standard'|'reinforced'|'exquisite')
// dented quality = no affixes (no entry needed, getCraftedAffixes returns [])
// Magnitudes align with affix_catalog.ts PREFIXES/SUFFIXES magnitudeByTier values:
//   standard:    index 0 -> 1n (stat) or 5n (hp)
//   reinforced:  index 1 -> 2n (stat) or 8n (hp)
//   exquisite:   index 2 -> 3n (stat) or 15n (hp)
// ---------------------------------------------------------------------------

export const MATERIAL_AFFIX_MAP: Record<string, Record<string, CraftedAffix[]>> = {
  copper_ore: {
    standard: [
      { affixKey: 'fierce', statKey: 'strBonus', affixName: 'Fierce', affixType: 'prefix', magnitude: 1n },
    ],
    reinforced: [
      { affixKey: 'fierce', statKey: 'strBonus', affixName: 'Fierce', affixType: 'prefix', magnitude: 2n },
      { affixKey: 'of_power', statKey: 'strBonus', affixName: 'of Power', affixType: 'suffix', magnitude: 1n },
    ],
    exquisite: [
      { affixKey: 'fierce', statKey: 'strBonus', affixName: 'Fierce', affixType: 'prefix', magnitude: 3n },
      { affixKey: 'of_power', statKey: 'strBonus', affixName: 'of Power', affixType: 'suffix', magnitude: 2n },
      { affixKey: 'of_strength', statKey: 'strBonus', affixName: 'of Strength', affixType: 'suffix', magnitude: 1n },
    ],
  },
  rough_hide: {
    standard: [
      { affixKey: 'swift', statKey: 'dexBonus', affixName: 'Swift', affixType: 'prefix', magnitude: 1n },
    ],
    reinforced: [
      { affixKey: 'swift', statKey: 'dexBonus', affixName: 'Swift', affixType: 'prefix', magnitude: 2n },
      { affixKey: 'of_precision', statKey: 'dexBonus', affixName: 'of Precision', affixType: 'suffix', magnitude: 1n },
    ],
    exquisite: [
      { affixKey: 'swift', statKey: 'dexBonus', affixName: 'Swift', affixType: 'prefix', magnitude: 3n },
      { affixKey: 'of_precision', statKey: 'dexBonus', affixName: 'of Precision', affixType: 'suffix', magnitude: 2n },
      { affixKey: 'of_endurance', statKey: 'hpBonus', affixName: 'of Endurance', affixType: 'suffix', magnitude: 5n },
    ],
  },
  bone_shard: {
    standard: [
      { affixKey: 'vital', statKey: 'hpBonus', affixName: 'Vital', affixType: 'prefix', magnitude: 5n },
    ],
    reinforced: [
      { affixKey: 'vital', statKey: 'hpBonus', affixName: 'Vital', affixType: 'prefix', magnitude: 8n },
      { affixKey: 'sturdy', statKey: 'armorClassBonus', affixName: 'Sturdy', affixType: 'prefix', magnitude: 1n },
    ],
    exquisite: [
      { affixKey: 'vital', statKey: 'hpBonus', affixName: 'Vital', affixType: 'prefix', magnitude: 15n },
      { affixKey: 'sturdy', statKey: 'armorClassBonus', affixName: 'Sturdy', affixType: 'prefix', magnitude: 2n },
      { affixKey: 'of_resilience', statKey: 'armorClassBonus', affixName: 'of Resilience', affixType: 'suffix', magnitude: 1n },
    ],
  },
  iron_ore: {
    standard: [
      { affixKey: 'fierce', statKey: 'strBonus', affixName: 'Fierce', affixType: 'prefix', magnitude: 1n },
    ],
    reinforced: [
      { affixKey: 'fierce', statKey: 'strBonus', affixName: 'Fierce', affixType: 'prefix', magnitude: 2n },
      { affixKey: 'sturdy', statKey: 'armorClassBonus', affixName: 'Sturdy', affixType: 'prefix', magnitude: 1n },
    ],
    exquisite: [
      { affixKey: 'fierce', statKey: 'strBonus', affixName: 'Fierce', affixType: 'prefix', magnitude: 3n },
      { affixKey: 'sturdy', statKey: 'armorClassBonus', affixName: 'Sturdy', affixType: 'prefix', magnitude: 2n },
      { affixKey: 'of_strength', statKey: 'strBonus', affixName: 'of Strength', affixType: 'suffix', magnitude: 2n },
    ],
  },
  tanned_leather: {
    standard: [
      { affixKey: 'swift', statKey: 'dexBonus', affixName: 'Swift', affixType: 'prefix', magnitude: 1n },
    ],
    reinforced: [
      { affixKey: 'swift', statKey: 'dexBonus', affixName: 'Swift', affixType: 'prefix', magnitude: 2n },
      { affixKey: 'vital', statKey: 'hpBonus', affixName: 'Vital', affixType: 'prefix', magnitude: 5n },
    ],
    exquisite: [
      { affixKey: 'swift', statKey: 'dexBonus', affixName: 'Swift', affixType: 'prefix', magnitude: 3n },
      { affixKey: 'vital', statKey: 'hpBonus', affixName: 'Vital', affixType: 'prefix', magnitude: 8n },
      { affixKey: 'of_precision', statKey: 'dexBonus', affixName: 'of Precision', affixType: 'suffix', magnitude: 2n },
    ],
  },
  spirit_essence: {
    standard: [
      { affixKey: 'arcane', statKey: 'intBonus', affixName: 'Arcane', affixType: 'prefix', magnitude: 1n },
    ],
    reinforced: [
      { affixKey: 'arcane', statKey: 'intBonus', affixName: 'Arcane', affixType: 'prefix', magnitude: 2n },
      { affixKey: 'wise', statKey: 'wisBonus', affixName: 'Wise', affixType: 'prefix', magnitude: 1n },
    ],
    exquisite: [
      { affixKey: 'arcane', statKey: 'intBonus', affixName: 'Arcane', affixType: 'prefix', magnitude: 3n },
      { affixKey: 'wise', statKey: 'wisBonus', affixName: 'Wise', affixType: 'prefix', magnitude: 2n },
      { affixKey: 'of_the_mind', statKey: 'intBonus', affixName: 'of the Mind', affixType: 'suffix', magnitude: 2n },
    ],
  },
  darksteel_ore: {
    standard: [
      { affixKey: 'fierce', statKey: 'strBonus', affixName: 'Fierce', affixType: 'prefix', magnitude: 1n },
    ],
    reinforced: [
      { affixKey: 'fierce', statKey: 'strBonus', affixName: 'Fierce', affixType: 'prefix', magnitude: 2n },
      { affixKey: 'fortified', statKey: 'armorClassBonus', affixName: 'Fortified', affixType: 'prefix', magnitude: 2n },
    ],
    exquisite: [
      { affixKey: 'fierce', statKey: 'strBonus', affixName: 'Fierce', affixType: 'prefix', magnitude: 3n },
      { affixKey: 'fortified', statKey: 'armorClassBonus', affixName: 'Fortified', affixType: 'prefix', magnitude: 4n },
      { affixKey: 'of_power', statKey: 'strBonus', affixName: 'of Power', affixType: 'suffix', magnitude: 3n },
    ],
  },
  moonweave_cloth: {
    standard: [
      { affixKey: 'arcane', statKey: 'intBonus', affixName: 'Arcane', affixType: 'prefix', magnitude: 1n },
    ],
    reinforced: [
      { affixKey: 'arcane', statKey: 'intBonus', affixName: 'Arcane', affixType: 'prefix', magnitude: 2n },
      { affixKey: 'wise', statKey: 'wisBonus', affixName: 'Wise', affixType: 'prefix', magnitude: 2n },
    ],
    exquisite: [
      { affixKey: 'arcane', statKey: 'intBonus', affixName: 'Arcane', affixType: 'prefix', magnitude: 3n },
      { affixKey: 'wise', statKey: 'wisBonus', affixName: 'Wise', affixType: 'prefix', magnitude: 3n },
      { affixKey: 'of_mana_flow', statKey: 'manaRegen', affixName: 'of Mana Flow', affixType: 'suffix', magnitude: 5n },
    ],
  },
  shadowhide: {
    standard: [
      { affixKey: 'swift', statKey: 'dexBonus', affixName: 'Swift', affixType: 'prefix', magnitude: 1n },
    ],
    reinforced: [
      { affixKey: 'swift', statKey: 'dexBonus', affixName: 'Swift', affixType: 'prefix', magnitude: 2n },
      { affixKey: 'of_haste', statKey: 'cooldownReduction', affixName: 'of Haste', affixType: 'suffix', magnitude: 10n },
    ],
    exquisite: [
      { affixKey: 'swift', statKey: 'dexBonus', affixName: 'Swift', affixType: 'prefix', magnitude: 3n },
      { affixKey: 'of_haste', statKey: 'cooldownReduction', affixName: 'of Haste', affixType: 'suffix', magnitude: 10n },
      { affixKey: 'of_precision', statKey: 'dexBonus', affixName: 'of Precision', affixType: 'suffix', magnitude: 3n },
    ],
  },
  void_crystal: {
    standard: [
      { affixKey: 'warded', statKey: 'magicResistanceBonus', affixName: 'Warded', affixType: 'prefix', magnitude: 1n },
    ],
    reinforced: [
      { affixKey: 'warded', statKey: 'magicResistanceBonus', affixName: 'Warded', affixType: 'prefix', magnitude: 2n },
      { affixKey: 'of_mana_flow', statKey: 'manaRegen', affixName: 'of Mana Flow', affixType: 'suffix', magnitude: 5n },
    ],
    exquisite: [
      { affixKey: 'warded', statKey: 'magicResistanceBonus', affixName: 'Warded', affixType: 'prefix', magnitude: 3n },
      { affixKey: 'of_mana_flow', statKey: 'manaRegen', affixName: 'of Mana Flow', affixType: 'suffix', magnitude: 5n },
      { affixKey: 'of_warding', statKey: 'magicResistanceBonus', affixName: 'of Warding', affixType: 'suffix', magnitude: 2n },
    ],
  },
};

// ---------------------------------------------------------------------------
// HELPER FUNCTIONS
// ---------------------------------------------------------------------------

/**
 * Maps material tier to a quality tier string.
 * Tier 1 = common, Tier 2 = uncommon, Tier 3 = rare.
 * (Higher tiers possible in future.)
 */
export function materialTierToQuality(tier: bigint): string {
  if (tier === 1n) return 'common';
  if (tier === 2n) return 'uncommon';
  if (tier === 3n) return 'rare';
  return 'common';
}

/**
 * Maps material tier to a craft quality level string.
 * Tier 1 = standard, Tier 2 = reinforced, Tier 3 = exquisite.
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
 * Returns the crafted affixes for a given material and craft quality level.
 * Returns empty array for 'dented' or 'common' quality or missing entries.
 */
export function getCraftedAffixes(materialKey: string, craftQuality: string): CraftedAffix[] {
  if (craftQuality === 'dented' || craftQuality === 'common') return [];
  const materialMap = MATERIAL_AFFIX_MAP[materialKey];
  if (!materialMap) return [];
  return materialMap[craftQuality] ?? [];
}

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
}

export const CONSUMABLE_RECIPES: ConsumableRecipeDef[] = [
  { key: 'bandage',         name: 'Bandages',          outputName: 'Bandage',          outputCount: 1n, req1Name: 'Flax',          req1Count: 1n, req2Name: 'Herbs',       req2Count: 1n },
  { key: 'simple_rations',  name: 'Simple Rations',    outputName: 'Simple Rations',   outputCount: 1n, req1Name: 'Raw Meat',      req1Count: 1n, req2Name: 'Salt',        req2Count: 1n },
  { key: 'torch',           name: 'Torch',             outputName: 'Torch',            outputCount: 1n, req1Name: 'Wood',          req1Count: 1n, req2Name: 'Resin',       req2Count: 1n },
  { key: 'basic_poultice',  name: 'Basic Poultice',    outputName: 'Basic Poultice',   outputCount: 1n, req1Name: 'Herbs',         req1Count: 1n, req2Name: 'Flax',        req2Count: 1n, req3Name: 'Clear Water', req3Count: 1n },
  { key: 'travelers_tea',   name: 'Travelers Tea',     outputName: 'Travelers Tea',    outputCount: 1n, req1Name: 'Herbs',         req1Count: 1n, req2Name: 'Clear Water', req2Count: 1n },
  { key: 'whetstone',       name: 'Whetstone',         outputName: 'Whetstone',        outputCount: 1n, req1Name: 'Stone',         req1Count: 1n, req2Name: 'Sand',        req2Count: 1n },
  { key: 'kindling_bundle', name: 'Kindling Bundle',   outputName: 'Kindling Bundle',  outputCount: 1n, req1Name: 'Wood',          req1Count: 1n, req2Name: 'Dry Grass',   req2Count: 1n },
  { key: 'rough_rope',      name: 'Rough Rope',        outputName: 'Rough Rope',       outputCount: 1n, req1Name: 'Flax',          req1Count: 1n, req2Name: 'Resin',       req2Count: 1n },
  { key: 'charcoal',        name: 'Charcoal',          outputName: 'Charcoal',         outputCount: 1n, req1Name: 'Wood',          req1Count: 1n, req2Name: 'Stone',       req2Count: 1n },
  { key: 'crude_poison',    name: 'Crude Poison',      outputName: 'Crude Poison',     outputCount: 1n, req1Name: 'Bitter Herbs',  req1Count: 1n, req2Name: 'Resin',       req2Count: 1n },
  { key: 'herb_broth',      name: 'Herb Broth',        outputName: 'Herb Broth',       outputCount: 1n, req1Name: 'Wild Berries',  req1Count: 2n, req2Name: 'Clear Water', req2Count: 1n },
  { key: 'roasted_roots',   name: 'Roasted Roots',     outputName: 'Roasted Roots',    outputCount: 1n, req1Name: 'Root Vegetable',req1Count: 2n, req2Name: 'Salt',        req2Count: 1n },
  { key: 'travelers_stew',  name: "Traveler's Stew",   outputName: "Traveler's Stew",  outputCount: 1n, req1Name: 'Root Vegetable',req1Count: 1n, req2Name: 'Raw Meat',    req2Count: 1n },
  { key: 'foragers_salad',  name: "Forager's Salad",   outputName: "Forager's Salad",  outputCount: 1n, req1Name: 'Wild Berries',  req1Count: 1n, req2Name: 'Herbs',       req2Count: 1n },
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
  { key: 'craft_longsword',  name: 'Longsword',   outputName: 'Iron Shortsword',  recipeType: 'weapon',    req1Name: 'Copper Ore', req1Count: 4n, req2Name: 'Rough Hide', req2Count: 1n },
  { key: 'craft_dagger',     name: 'Dagger',      outputName: 'Chipped Dagger',   recipeType: 'weapon',    req1Name: 'Copper Ore', req1Count: 3n, req2Name: 'Rough Hide', req2Count: 1n },
  { key: 'craft_staff',      name: 'Staff',       outputName: 'Gnarled Staff',    recipeType: 'weapon',    req1Name: 'Copper Ore', req1Count: 2n, req2Name: 'Rough Hide', req2Count: 2n },
  { key: 'craft_mace',       name: 'Mace',        outputName: 'Worn Mace',        recipeType: 'weapon',    req1Name: 'Copper Ore', req1Count: 4n, req2Name: 'Rough Hide', req2Count: 1n },
  // OffHand
  { key: 'craft_shield',     name: 'Shield',      outputName: 'Wooden Shield',    recipeType: 'weapon',    req1Name: 'Copper Ore', req1Count: 3n, req2Name: 'Rough Hide', req2Count: 2n },
  // Armor
  { key: 'craft_helm',       name: 'Helm',        outputName: 'Iron Helm',        recipeType: 'armor',     req1Name: 'Copper Ore', req1Count: 3n, req2Name: 'Rough Hide', req2Count: 1n },
  { key: 'craft_breastplate',name: 'Breastplate', outputName: 'Battered Cuirass', recipeType: 'armor',     req1Name: 'Copper Ore', req1Count: 4n, req2Name: 'Rough Hide', req2Count: 2n },
  { key: 'craft_bracers',    name: 'Bracers',     outputName: 'Leather Bracers',  recipeType: 'armor',     req1Name: 'Copper Ore', req1Count: 2n, req2Name: 'Rough Hide', req2Count: 2n },
  { key: 'craft_gauntlets',  name: 'Gauntlets',   outputName: 'Iron Gauntlets',   recipeType: 'armor',     req1Name: 'Copper Ore', req1Count: 3n, req2Name: 'Rough Hide', req2Count: 1n },
  { key: 'craft_girdle',     name: 'Girdle',      outputName: 'Rough Girdle',     recipeType: 'armor',     req1Name: 'Copper Ore', req1Count: 2n, req2Name: 'Rough Hide', req2Count: 2n },
  { key: 'craft_greaves',    name: 'Greaves',     outputName: 'Dented Greaves',   recipeType: 'armor',     req1Name: 'Copper Ore', req1Count: 4n, req2Name: 'Rough Hide', req2Count: 2n },
  { key: 'craft_sabatons',   name: 'Sabatons',    outputName: 'Dented Sabatons',  recipeType: 'armor',     req1Name: 'Copper Ore', req1Count: 3n, req2Name: 'Rough Hide', req2Count: 2n },
  // Accessories
  { key: 'craft_ring',       name: 'Ring',        outputName: 'Copper Band',      recipeType: 'accessory', req1Name: 'Copper Ore', req1Count: 2n, req2Name: 'Rough Hide', req2Count: 1n },
  { key: 'craft_amulet',     name: 'Amulet',      outputName: 'Stone Pendant',    recipeType: 'accessory', req1Name: 'Copper Ore', req1Count: 2n, req2Name: 'Rough Hide', req2Count: 1n },
  { key: 'craft_cloak',      name: 'Cloak',       outputName: 'Simple Cloak',     recipeType: 'accessory', req1Name: 'Copper Ore', req1Count: 1n, req2Name: 'Rough Hide', req2Count: 3n },
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
  { minLevel:  1n, essenceName: 'Lesser Essence' },
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

export const CRAFTING_MODIFIER_DEFS: CraftingModifierDef[] = [
  { key: 'glowing_stone',  name: 'Glowing Stone',  statKey: 'strBonus',             description: 'Adds Strength to the crafted item.',
    gatherEntries: [{ terrain: 'mountains', weight: 1n, timeOfDay: 'any' }, { terrain: 'plains', weight: 1n, timeOfDay: 'any' }] },
  { key: 'clear_crystal',  name: 'Clear Crystal',  statKey: 'dexBonus',             description: 'Adds Dexterity to the crafted item.',
    gatherEntries: [{ terrain: 'mountains', weight: 1n, timeOfDay: 'any' }, { terrain: 'dungeon', weight: 1n, timeOfDay: 'any' }] },
  { key: 'ancient_rune',   name: 'Ancient Rune',   statKey: 'intBonus',             description: 'Adds Intelligence to the crafted item.',
    gatherEntries: [{ terrain: 'dungeon', weight: 1n, timeOfDay: 'any' }] },
  { key: 'wisdom_herb',    name: 'Wisdom Herb',    statKey: 'wisBonus',             description: 'Adds Wisdom to the crafted item.',
    gatherEntries: [{ terrain: 'woods', weight: 1n, timeOfDay: 'any' }, { terrain: 'swamp', weight: 1n, timeOfDay: 'any' }] },
  { key: 'silver_token',   name: 'Silver Token',   statKey: 'chaBonus',             description: 'Adds Charisma to the crafted item.',
    gatherEntries: [{ terrain: 'plains', weight: 1n, timeOfDay: 'any' }, { terrain: 'city', weight: 1n, timeOfDay: 'any' }] },
  { key: 'life_stone',     name: 'Life Stone',     statKey: 'hpBonus',              description: 'Adds max HP to the crafted item.',
    gatherEntries: [{ terrain: 'woods', weight: 1n, timeOfDay: 'any' }, { terrain: 'swamp', weight: 1n, timeOfDay: 'any' }] },
  { key: 'mana_pearl',     name: 'Mana Pearl',     statKey: 'manaBonus',            description: 'Adds max Mana to the crafted item.',
    gatherEntries: [{ terrain: 'swamp', weight: 1n, timeOfDay: 'any' }] },
  { key: 'iron_ward',      name: 'Iron Ward',      statKey: 'armorClassBonus',      description: 'Adds Armor Class to the crafted item.',
    gatherEntries: [{ terrain: 'mountains', weight: 1n, timeOfDay: 'any' }, { terrain: 'dungeon', weight: 1n, timeOfDay: 'any' }] },
  { key: 'spirit_ward',    name: 'Spirit Ward',    statKey: 'magicResistanceBonus', description: 'Adds Magic Resistance to the crafted item.',
    gatherEntries: [{ terrain: 'swamp', weight: 1n, timeOfDay: 'any' }, { terrain: 'woods', weight: 1n, timeOfDay: 'any' }] },
];

/** Affix slots available per craft quality level */
export const AFFIX_SLOTS_BY_QUALITY: Record<string, number> = {
  dented:      0,
  standard:    1,
  reinforced:  2,
  exquisite:   3,
  mastercraft: 3,
};

/** Essence item key → stat magnitude applied per modifier */
export const ESSENCE_MAGNITUDE: Record<string, bigint> = {
  'lesser_essence':  1n,
  'essence':         2n,
  'greater_essence': 3n,
};

/** Essence item key → craft qualities it can unlock stat affixes for */
export const ESSENCE_QUALITY_GATE: Record<string, string[]> = {
  'lesser_essence':  ['standard'],
  'essence':         ['standard', 'reinforced'],
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
