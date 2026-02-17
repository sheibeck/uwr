// Affix catalog for the loot quality / affix system (Phase 14).
//
// AffixDef.statKey values MUST match the stat field names used in ItemAffix.statKey
// and the stat application logic in loot generation / take_loot.
//
// SLOTS reference (from EQUIPMENT_SLOTS in helpers/items.ts):
//   weapon  : mainHand, offHand
//   armor   : chest, legs, boots, head, hands, wrists, belt
//   accessory: neck, earrings, cloak

export interface AffixDef {
  key: string;
  name: string;             // display name: 'Sturdy', 'of Haste'
  type: 'prefix' | 'suffix';
  slots: string[];          // which gear slots this applies to
  statKey: string;          // which stat it modifies (matches ItemAffix.statKey)
  minTier: number;          // minimum quality tier number (1=uncommon, 2=rare, 3=epic, 4=legendary)
  magnitudeByTier: bigint[]; // index 0 = tier 1 magnitude, index 1 = tier 2, etc.
}

export interface LegendaryDef {
  key: string;
  name: string;             // display name, e.g., 'Soulrender'
  baseTemplateName: string; // name of the ItemTemplate this is based on
  slot: string;             // equipment slot
  affixes: {
    affixKey: string;
    type: 'prefix' | 'suffix';
    statKey: string;
    magnitude: bigint;
    affixName: string;
  }[];
  enemyTemplateName: string; // which named enemy drops this (placeholder until World Bosses phase)
}

// ---------------------------------------------------------------------------
// PREFIXES
// ---------------------------------------------------------------------------

export const PREFIXES: AffixDef[] = [
  // --- Weapon-slot offensive prefixes ---
  {
    key: 'mighty',
    name: 'Mighty',
    type: 'prefix',
    slots: ['mainHand', 'offHand'],
    statKey: 'strBonus',
    minTier: 1,
    magnitudeByTier: [1n, 2n, 3n, 4n],
  },
  {
    key: 'swift',
    name: 'Swift',
    type: 'prefix',
    slots: ['mainHand', 'offHand'],
    statKey: 'dexBonus',
    minTier: 1,
    magnitudeByTier: [1n, 2n, 3n, 4n],
  },
  {
    key: 'arcane',
    name: 'Arcane',
    type: 'prefix',
    slots: ['mainHand', 'offHand'],
    statKey: 'intBonus',
    minTier: 1,
    magnitudeByTier: [1n, 2n, 3n, 4n],
  },
  {
    key: 'wise',
    name: 'Wise',
    type: 'prefix',
    slots: ['mainHand', 'offHand'],
    statKey: 'wisBonus',
    minTier: 1,
    magnitudeByTier: [1n, 2n, 3n, 4n],
  },
  {
    key: 'keen',
    name: 'Keen',
    type: 'prefix',
    slots: ['mainHand', 'offHand'],
    statKey: 'weaponBaseDamage',
    minTier: 1,
    magnitudeByTier: [2n, 4n, 7n, 10n],
  },
  {
    key: 'vampiric',
    name: 'Vampiric',
    type: 'prefix',
    slots: ['mainHand', 'offHand'],
    statKey: 'lifeOnHit',
    minTier: 3,
    magnitudeByTier: [0n, 0n, 3n, 5n],
  },

  // --- Armor-slot defensive prefixes ---
  {
    key: 'sturdy',
    name: 'Sturdy',
    type: 'prefix',
    slots: ['chest', 'legs', 'boots', 'head', 'hands', 'wrists', 'belt'],
    statKey: 'armorClassBonus',
    minTier: 1,
    magnitudeByTier: [1n, 2n, 3n, 5n],
  },
  {
    key: 'vital',
    name: 'Vital',
    type: 'prefix',
    slots: ['chest', 'legs', 'boots', 'head', 'hands', 'wrists', 'belt'],
    statKey: 'hpBonus',
    minTier: 1,
    magnitudeByTier: [5n, 10n, 20n, 35n],
  },
  {
    key: 'warded',
    name: 'Warded',
    type: 'prefix',
    slots: ['chest', 'legs', 'boots', 'head', 'hands', 'wrists', 'belt'],
    statKey: 'magicResistanceBonus',
    minTier: 1,
    magnitudeByTier: [1n, 2n, 4n, 6n],
  },
  {
    key: 'fortified',
    name: 'Fortified',
    type: 'prefix',
    slots: ['chest', 'legs', 'boots', 'head', 'hands', 'wrists', 'belt'],
    statKey: 'armorClassBonus',
    minTier: 2,
    magnitudeByTier: [0n, 3n, 5n, 8n],
  },

  // --- Accessory-slot mixed prefixes ---
  {
    key: 'empowered',
    name: 'Empowered',
    type: 'prefix',
    slots: ['neck', 'earrings', 'cloak'],
    statKey: 'intBonus',
    minTier: 1,
    magnitudeByTier: [1n, 2n, 3n, 4n],
  },
  {
    key: 'resolute',
    name: 'Resolute',
    type: 'prefix',
    slots: ['neck', 'earrings', 'cloak'],
    statKey: 'wisBonus',
    minTier: 1,
    magnitudeByTier: [1n, 2n, 3n, 4n],
  },
];

// ---------------------------------------------------------------------------
// SUFFIXES
// ---------------------------------------------------------------------------

export const SUFFIXES: AffixDef[] = [
  // --- Weapon-slot offensive suffixes ---
  {
    key: 'of_power',
    name: 'of Power',
    type: 'suffix',
    slots: ['mainHand', 'offHand'],
    statKey: 'strBonus',
    minTier: 1,
    magnitudeByTier: [1n, 2n, 3n, 4n],
  },
  {
    key: 'of_precision',
    name: 'of Precision',
    type: 'suffix',
    slots: ['mainHand', 'offHand'],
    statKey: 'dexBonus',
    minTier: 1,
    magnitudeByTier: [1n, 2n, 3n, 4n],
  },
  {
    key: 'of_haste',
    name: 'of Haste',
    type: 'suffix',
    slots: ['mainHand', 'offHand'],
    statKey: 'cooldownReduction',
    minTier: 3,
    magnitudeByTier: [0n, 0n, 10n, 15n],
  },

  // --- Armor-slot defensive suffixes ---
  {
    key: 'of_endurance',
    name: 'of Endurance',
    type: 'suffix',
    slots: ['chest', 'legs', 'boots', 'head', 'hands', 'wrists', 'belt'],
    statKey: 'hpBonus',
    minTier: 1,
    magnitudeByTier: [5n, 10n, 20n, 35n],
  },
  {
    key: 'of_strength',
    name: 'of Strength',
    type: 'suffix',
    slots: ['chest', 'legs', 'boots', 'head', 'hands', 'wrists', 'belt'],
    statKey: 'strBonus',
    minTier: 1,
    magnitudeByTier: [1n, 2n, 3n, 4n],
  },
  {
    key: 'of_the_mind',
    name: 'of the Mind',
    type: 'suffix',
    slots: ['chest', 'legs', 'boots', 'head', 'hands', 'wrists', 'belt'],
    statKey: 'intBonus',
    minTier: 1,
    magnitudeByTier: [1n, 2n, 3n, 4n],
  },
  {
    key: 'of_warding',
    name: 'of Warding',
    type: 'suffix',
    slots: ['chest', 'legs', 'boots', 'head', 'hands', 'wrists', 'belt'],
    statKey: 'magicResistanceBonus',
    minTier: 2,
    magnitudeByTier: [0n, 2n, 4n, 7n],
  },
  {
    key: 'of_resilience',
    name: 'of Resilience',
    type: 'suffix',
    slots: ['chest', 'legs', 'boots', 'head', 'hands', 'wrists', 'belt'],
    statKey: 'armorClassBonus',
    minTier: 1,
    magnitudeByTier: [1n, 2n, 3n, 5n],
  },

  // --- Accessory-slot mixed suffixes ---
  {
    key: 'of_mana_flow',
    name: 'of Mana Flow',
    type: 'suffix',
    slots: ['neck', 'earrings', 'cloak'],
    statKey: 'manaRegen',
    minTier: 3,
    magnitudeByTier: [0n, 0n, 5n, 8n],
  },
  {
    key: 'of_insight',
    name: 'of Insight',
    type: 'suffix',
    slots: ['neck', 'earrings', 'cloak'],
    statKey: 'wisBonus',
    minTier: 1,
    magnitudeByTier: [1n, 2n, 3n, 4n],
  },
  {
    key: 'of_vigor',
    name: 'of Vigor',
    type: 'suffix',
    slots: ['neck', 'earrings', 'cloak'],
    statKey: 'hpBonus',
    minTier: 1,
    magnitudeByTier: [5n, 10n, 15n, 25n],
  },
];

// ---------------------------------------------------------------------------
// LEGENDARIES
// ---------------------------------------------------------------------------
// Note: enemyTemplateName is a placeholder until Phase 17 (World Bosses) adds
// actual boss enemies. These names reference existing high-level enemy templates.

export const LEGENDARIES: LegendaryDef[] = [
  {
    key: 'soulrender',
    name: 'Soulrender',
    baseTemplateName: 'Training Sword', // placeholder — replace with actual legendary base
    slot: 'mainHand',
    affixes: [
      {
        affixKey: 'vampiric',
        type: 'prefix',
        statKey: 'lifeOnHit',
        magnitude: 5n,
        affixName: 'Vampiric',
      },
      {
        affixKey: 'of_haste',
        type: 'suffix',
        statKey: 'cooldownReduction',
        magnitude: 15n,
        affixName: 'of Haste',
      },
    ],
    enemyTemplateName: 'Fen Witch', // placeholder boss — update when World Bosses added
  },
  {
    key: 'ironveil',
    name: 'Ironveil',
    baseTemplateName: 'Scout Jerkin', // placeholder — replace with actual legendary base
    slot: 'chest',
    affixes: [
      {
        affixKey: 'fortified',
        type: 'prefix',
        statKey: 'armorClassBonus',
        magnitude: 8n,
        affixName: 'Fortified',
      },
      {
        affixKey: 'of_endurance',
        type: 'suffix',
        statKey: 'hpBonus',
        magnitude: 35n,
        affixName: 'of Endurance',
      },
    ],
    enemyTemplateName: 'Cinder Sentinel', // placeholder boss — update when World Bosses added
  },
  {
    key: 'whisperwind',
    name: 'Whisperwind',
    baseTemplateName: 'Training Staff', // placeholder — cloak base item TBD
    slot: 'cloak',
    affixes: [
      {
        affixKey: 'resolute',
        type: 'prefix',
        statKey: 'wisBonus',
        magnitude: 4n,
        affixName: 'Resolute',
      },
      {
        affixKey: 'of_mana_flow',
        type: 'suffix',
        statKey: 'manaRegen',
        magnitude: 8n,
        affixName: 'of Mana Flow',
      },
    ],
    enemyTemplateName: 'Hexbinder', // placeholder boss — update when World Bosses added
  },
  {
    key: 'dreadmaw',
    name: 'Dreadmaw',
    baseTemplateName: 'Training Axe', // placeholder — replace with actual legendary base
    slot: 'mainHand',
    affixes: [
      {
        affixKey: 'keen',
        type: 'prefix',
        statKey: 'weaponBaseDamage',
        magnitude: 10n,
        affixName: 'Keen',
      },
      {
        affixKey: 'of_power',
        type: 'suffix',
        statKey: 'strBonus',
        magnitude: 4n,
        affixName: 'of Power',
      },
    ],
    enemyTemplateName: 'Basalt Brute', // placeholder boss — update when World Bosses added
  },
];

// ---------------------------------------------------------------------------
// QUALITY TIER CONSTANTS
// ---------------------------------------------------------------------------

export const QUALITY_TIERS = ['common', 'uncommon', 'rare', 'epic', 'legendary'] as const;
export type QualityTier = (typeof QUALITY_TIERS)[number];

// Number of affixes rolled per quality tier (legendaries use fixed affixes, not rolled)
export const AFFIX_COUNT_BY_QUALITY: Record<string, number> = {
  common: 0,
  uncommon: 1,
  rare: 2,
  epic: 3,
  legendary: 0,
};

// Display colors for each quality tier (hex)
export const QUALITY_TIER_COLORS: Record<string, string> = {
  common: '#ffffff',
  uncommon: '#00ff00',
  rare: '#4488ff',
  epic: '#aa44ff',
  legendary: '#ff8800',
};

// Quality tier number for magnitudeByTier index lookup (1-indexed, matching minTier)
export const QUALITY_TIER_NUMBER: Record<string, number> = {
  common: 0,
  uncommon: 1,
  rare: 2,
  epic: 3,
  legendary: 4,
};
