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
// uncommon tier affixes use magnitude 1n (matching PREFIXES/SUFFIXES magnitudeByTier[0])
// rare tier affixes use magnitude 2n (matching magnitudeByTier[1])
// epic tier affixes use magnitude 3n (matching magnitudeByTier[2])

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
  sources: ('gather' | 'drop')[];
  dropCreatureTypes?: string[];  // which creature types drop this
  gatherTerrains?: string[];     // which terrain types have nodes
  affinityStats: string[];       // stat keys this material enables
}

// ---------------------------------------------------------------------------
// MATERIAL DEFINITIONS — 10 materials across 3 tiers
// ---------------------------------------------------------------------------

export const MATERIAL_DEFS: MaterialDef[] = [
  // Tier 1
  {
    key: 'copper_ore',
    name: 'Copper Ore',
    tier: 1n,
    sources: ['gather'],
    gatherTerrains: ['mountains', 'plains'],
    affinityStats: ['strBonus'],
  },
  {
    key: 'rough_hide',
    name: 'Rough Hide',
    tier: 1n,
    sources: ['drop'],
    dropCreatureTypes: ['animal', 'beast'],
    affinityStats: ['dexBonus'],
  },
  {
    key: 'bone_shard',
    name: 'Bone Shard',
    tier: 1n,
    sources: ['drop'],
    dropCreatureTypes: ['undead', 'animal', 'humanoid'],
    affinityStats: ['hpBonus', 'armorClassBonus'],
  },

  // Tier 2
  {
    key: 'iron_ore',
    name: 'Iron Ore',
    tier: 2n,
    sources: ['gather'],
    gatherTerrains: ['mountains'],
    affinityStats: ['strBonus', 'armorClassBonus'],
  },
  {
    key: 'tanned_leather',
    name: 'Tanned Leather',
    tier: 2n,
    sources: ['drop'],
    dropCreatureTypes: ['beast', 'animal'],
    affinityStats: ['dexBonus', 'hpBonus'],
  },
  {
    key: 'spirit_essence',
    name: 'Spirit Essence',
    tier: 2n,
    sources: ['drop'],
    dropCreatureTypes: ['spirit', 'undead', 'humanoid'],
    affinityStats: ['intBonus', 'wisBonus'],
  },

  // Tier 3
  {
    key: 'darksteel_ore',
    name: 'Darksteel Ore',
    tier: 3n,
    sources: ['gather'],
    gatherTerrains: ['dungeon', 'mountains'],
    affinityStats: ['strBonus'],
  },
  {
    key: 'moonweave_cloth',
    name: 'Moonweave Cloth',
    tier: 3n,
    sources: ['gather'],
    gatherTerrains: ['swamp', 'woods'],
    affinityStats: ['intBonus', 'wisBonus', 'manaBonus'],
  },
  {
    key: 'shadowhide',
    name: 'Shadowhide',
    tier: 3n,
    sources: ['drop'],
    dropCreatureTypes: ['beast', 'construct'],
    affinityStats: ['dexBonus', 'cooldownReduction'],
  },
  {
    key: 'void_crystal',
    name: 'Void Crystal',
    tier: 3n,
    sources: ['drop'],
    dropCreatureTypes: ['spirit', 'construct'],
    affinityStats: ['magicResistanceBonus', 'manaRegen'],
  },
];

// ---------------------------------------------------------------------------
// MATERIAL AFFIX MAP
// Outer key = material key, Inner key = quality tier ('uncommon'|'rare'|'epic')
// common quality = no affixes (empty array)
// Magnitudes align with affix_catalog.ts PREFIXES/SUFFIXES magnitudeByTier values:
//   uncommon: index 0 → 1n (stat) or 5n (hp)
//   rare:     index 1 → 2n (stat) or 8n (hp)
//   epic:     index 2 → 3n (stat) or 15n (hp)
// ---------------------------------------------------------------------------

export const MATERIAL_AFFIX_MAP: Record<string, Record<string, CraftedAffix[]>> = {
  copper_ore: {
    uncommon: [
      { affixKey: 'fierce', statKey: 'strBonus', affixName: 'Fierce', affixType: 'prefix', magnitude: 1n },
    ],
    rare: [
      { affixKey: 'fierce', statKey: 'strBonus', affixName: 'Fierce', affixType: 'prefix', magnitude: 2n },
      { affixKey: 'of_power', statKey: 'strBonus', affixName: 'of Power', affixType: 'suffix', magnitude: 1n },
    ],
    epic: [
      { affixKey: 'fierce', statKey: 'strBonus', affixName: 'Fierce', affixType: 'prefix', magnitude: 3n },
      { affixKey: 'of_power', statKey: 'strBonus', affixName: 'of Power', affixType: 'suffix', magnitude: 2n },
      { affixKey: 'of_strength', statKey: 'strBonus', affixName: 'of Strength', affixType: 'suffix', magnitude: 1n },
    ],
  },
  rough_hide: {
    uncommon: [
      { affixKey: 'swift', statKey: 'dexBonus', affixName: 'Swift', affixType: 'prefix', magnitude: 1n },
    ],
    rare: [
      { affixKey: 'swift', statKey: 'dexBonus', affixName: 'Swift', affixType: 'prefix', magnitude: 2n },
      { affixKey: 'of_precision', statKey: 'dexBonus', affixName: 'of Precision', affixType: 'suffix', magnitude: 1n },
    ],
    epic: [
      { affixKey: 'swift', statKey: 'dexBonus', affixName: 'Swift', affixType: 'prefix', magnitude: 3n },
      { affixKey: 'of_precision', statKey: 'dexBonus', affixName: 'of Precision', affixType: 'suffix', magnitude: 2n },
      { affixKey: 'of_endurance', statKey: 'hpBonus', affixName: 'of Endurance', affixType: 'suffix', magnitude: 5n },
    ],
  },
  bone_shard: {
    uncommon: [
      { affixKey: 'vital', statKey: 'hpBonus', affixName: 'Vital', affixType: 'prefix', magnitude: 5n },
    ],
    rare: [
      { affixKey: 'vital', statKey: 'hpBonus', affixName: 'Vital', affixType: 'prefix', magnitude: 8n },
      { affixKey: 'sturdy', statKey: 'armorClassBonus', affixName: 'Sturdy', affixType: 'prefix', magnitude: 1n },
    ],
    epic: [
      { affixKey: 'vital', statKey: 'hpBonus', affixName: 'Vital', affixType: 'prefix', magnitude: 15n },
      { affixKey: 'sturdy', statKey: 'armorClassBonus', affixName: 'Sturdy', affixType: 'prefix', magnitude: 2n },
      { affixKey: 'of_resilience', statKey: 'armorClassBonus', affixName: 'of Resilience', affixType: 'suffix', magnitude: 1n },
    ],
  },
  iron_ore: {
    uncommon: [
      { affixKey: 'fierce', statKey: 'strBonus', affixName: 'Fierce', affixType: 'prefix', magnitude: 1n },
    ],
    rare: [
      { affixKey: 'fierce', statKey: 'strBonus', affixName: 'Fierce', affixType: 'prefix', magnitude: 2n },
      { affixKey: 'sturdy', statKey: 'armorClassBonus', affixName: 'Sturdy', affixType: 'prefix', magnitude: 1n },
    ],
    epic: [
      { affixKey: 'fierce', statKey: 'strBonus', affixName: 'Fierce', affixType: 'prefix', magnitude: 3n },
      { affixKey: 'sturdy', statKey: 'armorClassBonus', affixName: 'Sturdy', affixType: 'prefix', magnitude: 2n },
      { affixKey: 'of_strength', statKey: 'strBonus', affixName: 'of Strength', affixType: 'suffix', magnitude: 2n },
    ],
  },
  tanned_leather: {
    uncommon: [
      { affixKey: 'swift', statKey: 'dexBonus', affixName: 'Swift', affixType: 'prefix', magnitude: 1n },
    ],
    rare: [
      { affixKey: 'swift', statKey: 'dexBonus', affixName: 'Swift', affixType: 'prefix', magnitude: 2n },
      { affixKey: 'vital', statKey: 'hpBonus', affixName: 'Vital', affixType: 'prefix', magnitude: 5n },
    ],
    epic: [
      { affixKey: 'swift', statKey: 'dexBonus', affixName: 'Swift', affixType: 'prefix', magnitude: 3n },
      { affixKey: 'vital', statKey: 'hpBonus', affixName: 'Vital', affixType: 'prefix', magnitude: 8n },
      { affixKey: 'of_precision', statKey: 'dexBonus', affixName: 'of Precision', affixType: 'suffix', magnitude: 2n },
    ],
  },
  spirit_essence: {
    uncommon: [
      { affixKey: 'arcane', statKey: 'intBonus', affixName: 'Arcane', affixType: 'prefix', magnitude: 1n },
    ],
    rare: [
      { affixKey: 'arcane', statKey: 'intBonus', affixName: 'Arcane', affixType: 'prefix', magnitude: 2n },
      { affixKey: 'wise', statKey: 'wisBonus', affixName: 'Wise', affixType: 'prefix', magnitude: 1n },
    ],
    epic: [
      { affixKey: 'arcane', statKey: 'intBonus', affixName: 'Arcane', affixType: 'prefix', magnitude: 3n },
      { affixKey: 'wise', statKey: 'wisBonus', affixName: 'Wise', affixType: 'prefix', magnitude: 2n },
      { affixKey: 'of_the_mind', statKey: 'intBonus', affixName: 'of the Mind', affixType: 'suffix', magnitude: 2n },
    ],
  },
  darksteel_ore: {
    uncommon: [
      { affixKey: 'fierce', statKey: 'strBonus', affixName: 'Fierce', affixType: 'prefix', magnitude: 1n },
    ],
    rare: [
      { affixKey: 'fierce', statKey: 'strBonus', affixName: 'Fierce', affixType: 'prefix', magnitude: 2n },
      { affixKey: 'fortified', statKey: 'armorClassBonus', affixName: 'Fortified', affixType: 'prefix', magnitude: 2n },
    ],
    epic: [
      { affixKey: 'fierce', statKey: 'strBonus', affixName: 'Fierce', affixType: 'prefix', magnitude: 3n },
      { affixKey: 'fortified', statKey: 'armorClassBonus', affixName: 'Fortified', affixType: 'prefix', magnitude: 4n },
      { affixKey: 'of_power', statKey: 'strBonus', affixName: 'of Power', affixType: 'suffix', magnitude: 3n },
    ],
  },
  moonweave_cloth: {
    uncommon: [
      { affixKey: 'arcane', statKey: 'intBonus', affixName: 'Arcane', affixType: 'prefix', magnitude: 1n },
    ],
    rare: [
      { affixKey: 'arcane', statKey: 'intBonus', affixName: 'Arcane', affixType: 'prefix', magnitude: 2n },
      { affixKey: 'wise', statKey: 'wisBonus', affixName: 'Wise', affixType: 'prefix', magnitude: 2n },
    ],
    epic: [
      { affixKey: 'arcane', statKey: 'intBonus', affixName: 'Arcane', affixType: 'prefix', magnitude: 3n },
      { affixKey: 'wise', statKey: 'wisBonus', affixName: 'Wise', affixType: 'prefix', magnitude: 3n },
      { affixKey: 'of_mana_flow', statKey: 'manaRegen', affixName: 'of Mana Flow', affixType: 'suffix', magnitude: 5n },
    ],
  },
  shadowhide: {
    uncommon: [
      { affixKey: 'swift', statKey: 'dexBonus', affixName: 'Swift', affixType: 'prefix', magnitude: 1n },
    ],
    rare: [
      { affixKey: 'swift', statKey: 'dexBonus', affixName: 'Swift', affixType: 'prefix', magnitude: 2n },
      { affixKey: 'of_haste', statKey: 'cooldownReduction', affixName: 'of Haste', affixType: 'suffix', magnitude: 10n },
    ],
    epic: [
      { affixKey: 'swift', statKey: 'dexBonus', affixName: 'Swift', affixType: 'prefix', magnitude: 3n },
      { affixKey: 'of_haste', statKey: 'cooldownReduction', affixName: 'of Haste', affixType: 'suffix', magnitude: 10n },
      { affixKey: 'of_precision', statKey: 'dexBonus', affixName: 'of Precision', affixType: 'suffix', magnitude: 3n },
    ],
  },
  void_crystal: {
    uncommon: [
      { affixKey: 'warded', statKey: 'magicResistanceBonus', affixName: 'Warded', affixType: 'prefix', magnitude: 1n },
    ],
    rare: [
      { affixKey: 'warded', statKey: 'magicResistanceBonus', affixName: 'Warded', affixType: 'prefix', magnitude: 2n },
      { affixKey: 'of_mana_flow', statKey: 'manaRegen', affixName: 'of Mana Flow', affixType: 'suffix', magnitude: 5n },
    ],
    epic: [
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
 * Returns the crafted affixes for a given material and quality tier.
 * Returns empty array for 'common' quality or missing entries.
 */
export function getCraftedAffixes(materialKey: string, qualityTier: string): CraftedAffix[] {
  if (qualityTier === 'common') return [];
  const materialMap = MATERIAL_AFFIX_MAP[materialKey];
  if (!materialMap) return [];
  return materialMap[qualityTier] ?? [];
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

/**
 * Number of material items yielded from salvaging a gear piece by tier.
 */
export const SALVAGE_YIELD_BY_TIER: Record<number, bigint> = {
  1: 2n,
  2: 2n,
  3: 3n,
};
