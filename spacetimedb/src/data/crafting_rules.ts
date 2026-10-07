// crafting_rules.ts
// Mechanical rules extracted from legacy crafting_materials.ts.
// Contains material definitions, crafting modifiers, helper functions, and constants.
// Recipe definitions (CONSUMABLE_RECIPES, GEAR_RECIPES) remain in crafting_materials.ts
// for use by the seeding system only.

// ---------------------------------------------------------------------------
// MATERIAL DEFINITIONS
// ---------------------------------------------------------------------------

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
 * T1 -> standard, T2 -> reinforced, T3 -> exquisite.
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
// ESSENCE TIER THRESHOLDS -- used by combat.ts for runtime essence drops
// Ordered highest-first for early-return matching.
// ---------------------------------------------------------------------------

export const ESSENCE_TIER_THRESHOLDS: { minLevel: bigint; essenceName: string }[] = [
  { minLevel: 21n, essenceName: 'Greater Essence' },
  { minLevel: 11n, essenceName: 'Essence' },
  { minLevel: 1n, essenceName: 'Lesser Essence' },
];

// ---------------------------------------------------------------------------
// MODIFIER REAGENT THRESHOLDS -- used by combat.ts for runtime reagent drops
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

/** Essence item key -> stat magnitude applied per modifier */
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

/** Essence item key -> craft qualities it can unlock stat affixes for */
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

// ---------------------------------------------------------------------------
// CRAFT PLANNING -- one pure decision for one craft or a batch of n, shared by craft_recipe (validate before it mutates) and
// the client crafting model (pre-gates Craft, shows the quality and the "what would raise it"
// hint). Import-free, ES2020 only, never throws.
// ---------------------------------------------------------------------------

/** Template name to item key: lowercase, each whitespace run becomes one underscore. */
export function itemKeyFromName(name: string): string {
  return (typeof name === 'string' ? name : '').toLowerCase().replace(/\s+/g, '_');
}

/** The MATERIAL_DEFS tier of a material name (case and spacing as itemKeyFromName), 1n when unknown. */
export function primaryMaterialTier(name: string | null | undefined): bigint {
  const key = itemKeyFromName(name ?? '');
  const def = key === '' ? undefined : MATERIAL_DEFS.find((m) => m.key === key);
  return def ? def.tier : 1n;
}

/** Craft quality from the recipe's first material: its MATERIAL_DEFS tier (default T1). */
export function craftQualityForMaterialName(name: string | null | undefined): string {
  return materialTierToCraftQuality(primaryMaterialTier(name));
}

/**
 * The next material tier up and the quality it gives, or null when the quality is the top
 * reachable tier (exquisite) or is not on the material ladder.
 */
export function craftQualityUpgrade(quality: string): { materialTier: bigint; quality: string } | null {
  const tiers = [1n, 2n, 3n];
  for (const tier of tiers) {
    if (materialTierToCraftQuality(tier) !== quality) continue;
    if (tier === 3n) return null;
    const next = tier + 1n;
    return { materialTier: next, quality: materialTierToCraftQuality(next) };
  }
  return null;
}

/** Gear recipes (weapon, armor, accessory) take an Essence and reagents; consumables do not. */
export function isGearRecipe(recipe: { recipeType?: string | null }): boolean {
  return !!(recipe && recipe.recipeType && recipe.recipeType !== 'consumable');
}

export interface CraftPlanInput {
  recipe: {
    req1TemplateId: bigint;
    req1Count: bigint;
    req2TemplateId: bigint;
    req2Count: bigint;
    req3TemplateId?: bigint | null;
    req3Count?: bigint | null;
    recipeType?: string | null;
  };
  /** The batch size: 1n when omitted; a value below 1n counts as 1n. */
  count?: bigint;
  /** Name of the first requirement's item template (sets the quality). */
  primaryMaterialName: string | null;
  /** The chosen Essence, or null. A missing template is passed with name ''. */
  catalyst: { templateId: bigint; name: string } | null;
  /** The chosen reagents in slot order, null slots already dropped. name null = no template. */
  modifiers: ReadonlyArray<{ templateId: bigint; name: string | null }>;
  /** Non-equipped count the character holds of a template. */
  countOf: (templateId: bigint) => bigint;
}

export type CraftPlan =
  | {
      ok: true;
      /** The batch size, present only for a batch above 1n so a single craft's plan is unchanged. */
      count?: bigint;
      gear: boolean;
      quality: string | null;
      consumes: { templateId: bigint; count: bigint }[];
      usesCatalyst: boolean;
      reagents: { templateId: bigint; statKey: string; magnitude: bigint }[];
    }
  | {
      ok: false;
      reason: 'materials' | 'essence_tier' | 'catalyst_missing' | 'modifier_missing' | 'no_reagent';
      message: string;
      templateId?: bigint;
      have?: bigint;
      need?: bigint;
    };

function ownValue<T>(map: Record<string, T>, key: string): T | undefined {
  return Object.prototype.hasOwnProperty.call(map, key) ? map[key] : undefined;
}

/**
 * Every craft refusal in the server's order with the server's exact messages, decided before
 * anything is consumed. A catalyst or reagent that shares a template with a requirement (or
 * appears twice) is counted against what is still on hand after the earlier needs, the way the
 * reducer's sequential removals count it. The reducer additionally needs an output template and
 * a found instance for the essence step; those are server-only facts.
 */
export function planCraft(input: CraftPlanInput): CraftPlan {
  const { recipe } = input;
  // The batch size. Every need is multiplied by it before any check, so the rule stays linear:
  // a batch of n needs exactly n times the merged need of one craft.
  const n: bigint = typeof input.count === 'bigint' && input.count > 1n ? input.count : 1n;
  const batch: { count?: bigint } = n > 1n ? { count: n } : {};
  const consumes: { templateId: bigint; count: bigint }[] = [];
  const need = (templateId: bigint, count: bigint) => {
    const total = count * n;
    const hit = consumes.find((c) => c.templateId === templateId);
    if (hit) hit.count += total;
    else consumes.push({ templateId, count: total });
  };
  const consumed = (templateId: bigint): bigint => {
    const hit = consumes.find((c) => c.templateId === templateId);
    return hit ? hit.count : 0n;
  };

  // Materials: the reducer removes requirement 1, requirement 2 and (only when it has both a
  // template and a count) requirement 3. Requirements are decided by position, never by template
  // id, so a requirement that shares a template with a skipped third slot is still consumed.
  need(recipe.req1TemplateId, recipe.req1Count);
  need(recipe.req2TemplateId, recipe.req2Count);
  if (recipe.req3TemplateId != null && recipe.req3Count != null) {
    need(recipe.req3TemplateId, recipe.req3Count);
  }
  // Requirements that share a template are merged by need(), so the check is on the merged total:
  // req1 == req2 with counts 2 and 3 needs 5 on hand, not 3.
  for (const req of consumes) {
    const have = input.countOf(req.templateId);
    if (have < req.count) {
      return {
        ok: false,
        reason: 'materials',
        message: 'Missing materials to craft this recipe.',
        templateId: req.templateId,
        have,
        need: req.count,
      };
    }
  }

  const gear = isGearRecipe(recipe);
  if (!gear) {
    return { ok: true, ...batch, gear: false, quality: null, consumes, usesCatalyst: false, reagents: [] };
  }
  const quality = craftQualityForMaterialName(input.primaryMaterialName);
  const catalyst = input.catalyst;
  if (!catalyst) {
    return { ok: true, ...batch, gear: true, quality, consumes, usesCatalyst: false, reagents: [] };
  }

  const catalystKey = itemKeyFromName(catalyst.name);
  const allowed = ownValue(ESSENCE_QUALITY_GATE, catalystKey) ?? [];
  if (allowed.indexOf(quality) === -1) {
    return { ok: false, reason: 'essence_tier', message: 'Essence tier too low for this craft quality' };
  }
  if (input.countOf(catalyst.templateId) - consumed(catalyst.templateId) < n) {
    return { ok: false, reason: 'catalyst_missing', message: 'Missing catalyst (Essence)' };
  }
  need(catalyst.templateId, 1n);

  const slots = ownValue(AFFIX_SLOTS_BY_QUALITY, quality) ?? 1;
  const reagents: { templateId: bigint; statKey: string; magnitude: bigint }[] = [];
  for (const mod of input.modifiers.slice(0, slots)) {
    if (!mod || mod.name == null || mod.name === '') continue;
    const modKey = itemKeyFromName(mod.name);
    const def = CRAFTING_MODIFIER_DEFS.find((d) => d.key === modKey);
    if (!def) continue;
    if (input.countOf(mod.templateId) - consumed(mod.templateId) < n) {
      return { ok: false, reason: 'modifier_missing', message: `Missing modifier: ${mod.name}` };
    }
    need(mod.templateId, 1n);
    reagents.push({
      templateId: mod.templateId,
      statKey: def.statKey,
      magnitude: getModifierMagnitude(catalystKey, def.statKey),
    });
  }
  if (reagents.length === 0) {
    return { ok: false, reason: 'no_reagent', message: 'Must provide at least one reagent when using an Essence' };
  }
  return { ok: true, ...batch, gear: true, quality, consumes, usesCatalyst: true, reagents };
}

/** The most crafts one request may batch (the server cap and the stepper's top). */
export const MAX_CRAFT_COUNT = 99n;

/**
 * The stepper maximum: the largest n in 0..MAX_CRAFT_COUNT for which planCraft with count n
 * succeeds, and 0n when a single craft is refused for any reason. planCraft is linear in the count,
 * so the bag counts divided by the per-craft consumes give the answer, and planCraft at this count
 * always passes (and at one more is refused, below the cap).
 */
export function maxCraftCount(input: Omit<CraftPlanInput, 'count'>): bigint {
  const single = planCraft({ ...input, count: 1n });
  if (!single.ok) return 0n;
  let max = MAX_CRAFT_COUNT;
  for (const c of single.consumes) {
    if (c.count <= 0n) continue;
    const fits = input.countOf(c.templateId) / c.count;
    if (fits < max) max = fits;
  }
  return max < 0n ? 0n : max;
}

// ---------------------------------------------------------------------------
// SALVAGE YIELD: one rule for salvage_item and the client preview
// salvage_item calls these (plan 50-30), and the client values the material from MATERIAL_DEFS,
// the same vendor value helpers/items.ts upserts into the material's item template.
// ---------------------------------------------------------------------------

/** The chance, in percent, that a salvage also yields one reagent the item's affixes could give. */
export const SALVAGE_REAGENT_CHANCE_PCT = 12n;

export interface SalvageYieldInput {
  slot: string;
  armorType?: string | null;
  /** The item template tier; a missing tier counts as 1n. */
  tier?: bigint | null;
  /** The item template's vendor value. */
  itemValue?: bigint | null;
  /** The item template of the salvage material, or null when none exists. */
  material: { name: string; vendorValue?: bigint | null } | null;
  /** How much of that material the recipe that makes the item consumes (0n when no recipe). */
  recipeConsumed?: bigint | null;
}

/**
 * The guaranteed salvage material: the tier table count, capped by item value over material value
 * (salvage never pays back more than the item is worth) and by what the recipe consumed of it
 * (never more than the craft put in). Returns null when the slot has no salvage material or no
 * material template exists; a count of 0n means nothing usable was left.
 */
export function salvageMaterialYield(input: SalvageYieldInput): { name: string; count: bigint } | null {
  const tier = input.tier ?? 1n;
  const name = getMaterialForSalvage(input.slot, input.armorType ?? undefined, tier);
  if (!name || !input.material) return null;
  let count: bigint = SALVAGE_YIELD_BY_TIER[Number(tier)] ?? 2n;
  const materialValue = input.material.vendorValue ?? 0n;
  if (materialValue > 0n) {
    const byValue = (input.itemValue ?? 0n) / materialValue;
    if (byValue < count) count = byValue;
  }
  const consumed = input.recipeConsumed ?? 0n;
  if (consumed > 0n && consumed < count) count = consumed;
  return { name, count };
}

/**
 * The reagent defs a salvage can yield: the CRAFTING_MODIFIER_DEFS whose statKey matches one of the
 * item's non-implicit affixes, in CRAFTING_MODIFIER_DEFS order, each once. The implicit craft-quality
 * affixes never count (they gave a free Iron Ward for every crafted piece of armor).
 */
export function salvageReagentDefs(
  affixes: ReadonlyArray<{ affixType?: string | null; statKey: string }> | null | undefined,
): (typeof CRAFTING_MODIFIER_DEFS)[number][] {
  if (!affixes || typeof affixes.length !== 'number') return [];
  const keys: string[] = [];
  for (const a of affixes) {
    if (a && a.affixType !== 'implicit' && typeof a.statKey === 'string') keys.push(a.statKey);
  }
  if (keys.length === 0) return [];
  return CRAFTING_MODIFIER_DEFS.filter((d) => keys.indexOf(d.statKey) !== -1);
}
