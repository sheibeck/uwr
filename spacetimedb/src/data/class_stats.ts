export type StatKey = 'str' | 'dex' | 'cha' | 'wis' | 'int';

export const BASE_STAT = 8n;
export const PRIMARY_BONUS = 4n;
export const SECONDARY_BONUS = 2n;
export const PRIMARY_GROWTH = 3n;
export const SECONDARY_GROWTH = 2n;
export const OTHER_GROWTH = 1n;

export const BASE_HP = 50n;
export const HP_STR_MULTIPLIER = 8n;
export const BASE_MANA = 10n;
export const MANA_MULTIPLIER = 6n;

export const ARMOR_TYPES = ['cloth', 'leather', 'chain', 'plate'] as const;
export const ARMOR_TYPES_WITH_NONE = ['none', ...ARMOR_TYPES, 'shield'] as const;

export function normalizeClassName(className: string) {
  return className.trim().toLowerCase();
}

export function normalizeArmorType(armorType: string) {
  const lowered = armorType.trim().toLowerCase();
  return ARMOR_TYPES_WITH_NONE.includes(lowered as (typeof ARMOR_TYPES_WITH_NONE)[number])
    ? lowered
    : 'cloth';
}

export function computeBaseStatsForGenerated(
  primaryStat: StatKey,
  secondaryStat: StatKey | undefined,
  level: bigint
): Record<StatKey, bigint> {
  const stats: Record<StatKey, bigint> = { str: BASE_STAT, dex: BASE_STAT, cha: BASE_STAT, wis: BASE_STAT, int: BASE_STAT };
  stats[primaryStat] += PRIMARY_BONUS;
  if (secondaryStat) stats[secondaryStat] += SECONDARY_BONUS;
  if (level > 1n) {
    const extraLevels = level - 1n;
    for (const key of Object.keys(stats) as StatKey[]) {
      if (key === primaryStat) stats[key] += PRIMARY_GROWTH * extraLevels;
      else if (key === secondaryStat) stats[key] += SECONDARY_GROWTH * extraLevels;
      else stats[key] += OTHER_GROWTH * extraLevels;
    }
  }
  return stats;
}

/**
 * Check if a character has any ability with the given resourceType.
 * Used to derive mana/stamina usage from actual abilities instead of class name.
 */
export function characterUsesResource(ctx: any, characterId: bigint, resourceType: string): boolean {
  for (const ability of ctx.db.ability_template.by_character.filter(characterId)) {
    if (ability.resourceType === resourceType) return true;
  }
  return false;
}

/**
 * For characters with mana abilities, compute the mana stat as max(int, wis, cha).
 * This replaces the old class-based manaStatForClass lookup.
 */
export function bestCasterStat(stats: Record<StatKey, bigint>): bigint {
  const candidates: StatKey[] = ['int', 'wis', 'cha'];
  return candidates.reduce((best, key) => stats[key] > best ? stats[key] : best, 0n);
}

/**
 * Detect primary and secondary stats from a character's current stat values.
 * The two highest stats reveal primary/secondary since we applied PRIMARY_BONUS and SECONDARY_BONUS.
 */
export function detectPrimarySecondary(character: any): { primary: StatKey; secondary: StatKey | undefined } {
  const stats: [StatKey, bigint][] = [
    ['str', character.str], ['dex', character.dex], ['cha', character.cha],
    ['wis', character.wis], ['int', character.int],
  ];
  stats.sort((a, b) => Number(b[1] - a[1]));
  const primary = stats[0][0];
  // Secondary only if there's a clear gap between 2nd and 3rd
  const secondary = stats[1][1] > stats[2][1] ? stats[1][0] : undefined;
  return { primary, secondary };
}
