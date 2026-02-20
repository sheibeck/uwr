export type StatKey = 'str' | 'dex' | 'cha' | 'wis' | 'int';

export const CLASS_CONFIG: Record<string, { primary: StatKey; secondary?: StatKey }> = {
  bard: { primary: 'cha', secondary: 'int' },
  enchanter: { primary: 'cha' },
  cleric: { primary: 'wis' },
  wizard: { primary: 'int' },
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

export const BASE_STAT = 8n;
export const PRIMARY_BONUS = 4n;
export const SECONDARY_BONUS = 2n;
export const PRIMARY_GROWTH = 3n;
export const SECONDARY_GROWTH = 2n;
export const OTHER_GROWTH = 1n;

export const BASE_HP = 50n;
export const HP_STR_MULTIPLIER = 8n;
export const BASE_MANA = 10n;

export const ARMOR_TYPES = ['cloth', 'leather', 'chain', 'plate'] as const;
export const ARMOR_TYPES_WITH_NONE = ['none', ...ARMOR_TYPES, 'shield'] as const;

export const PARRY_CLASSES = new Set([
  'warrior',
  'paladin',
  'reaver',
  'rogue',
  'ranger',
  'monk',
  'beastmaster',
  'spellblade',
]);

export const MANA_CLASSES = new Set([
  'bard',
  'enchanter',
  'cleric',
  'wizard',
  'paladin',
  'ranger',
  'necromancer',
  'spellblade',
  'shaman',
  'druid',
  'reaver',
  'summoner',
]);

export const TANK_CLASSES = new Set([
  'warrior',
  'paladin',
]);

export const HEALER_CLASSES = new Set([
  'cleric',
  'druid',
  'shaman',
]);

export const CLASS_ARMOR: Record<string, string[]> = {
  bard: ['plate', 'chain', 'leather', 'cloth'],
  enchanter: ['cloth'],
  cleric: ['plate', 'chain', 'leather', 'cloth', 'shield'],
  wizard: ['cloth'],
  druid: ['leather', 'cloth'],
  necromancer: ['cloth'],
  summoner: ['cloth'],
  rogue: ['leather', 'cloth'],
  monk: ['leather', 'cloth'],
  spellblade: ['chain', 'leather', 'cloth', 'shield'],
  reaver: ['chain', 'leather', 'cloth'],
  beastmaster: ['leather', 'cloth'],
  ranger: ['chain', 'leather', 'cloth'],
  shaman: ['chain', 'leather', 'cloth', 'shield'],
  warrior: ['plate', 'chain', 'leather', 'cloth', 'shield'],
  paladin: ['plate', 'chain', 'leather', 'cloth', 'shield'],
};

export const SHIELD_CLASSES = new Set([
  'warrior', 'paladin', 'cleric', 'spellblade', 'shaman',
]);

export const BASE_ARMOR_CLASS: Record<string, bigint> = {
  cloth: 2n,
  leather: 4n,
  chain: 6n,
  plate: 8n,
};

export function normalizeClassName(className: string) {
  return className.trim().toLowerCase();
}

export function getClassConfig(className: string) {
  return CLASS_CONFIG[normalizeClassName(className)] ?? { primary: 'str' };
}

export function computeBaseStats(className: string, level: bigint) {
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

export function usesMana(className: string) {
  return MANA_CLASSES.has(normalizeClassName(className));
}

export function canParry(className: string) {
  return PARRY_CLASSES.has(normalizeClassName(className));
}

export function manaStatForClass(className: string, stats: Record<StatKey, bigint>) {
  if (!usesMana(className)) return 0n;
  const config = getClassConfig(className);
  if (!config.secondary) return stats[config.primary];
  return (stats[config.primary] * 70n + stats[config.secondary] * 30n) / 100n;
}

export function normalizeArmorType(armorType: string) {
  const lowered = armorType.trim().toLowerCase();
  return ARMOR_TYPES_WITH_NONE.includes(lowered as (typeof ARMOR_TYPES_WITH_NONE)[number])
    ? lowered
    : 'cloth';
}

export function baseArmorForClass(className: string) {
  const normalized = normalizeClassName(className);
  const allowed = CLASS_ARMOR[normalized] ?? ['cloth'];
  const best = allowed[0];
  return BASE_ARMOR_CLASS[best] ?? BASE_ARMOR_CLASS.cloth;
}

export function isArmorAllowedForClass(className: string, armorType: string) {
  const normalized = normalizeClassName(className);
  const allowed = CLASS_ARMOR[normalized] ?? ['cloth'];
  return allowed.includes(normalizeArmorType(armorType));
}
