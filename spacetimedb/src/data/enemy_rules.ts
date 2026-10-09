// enemy_rules.ts
// Mechanical rules extracted from legacy named_enemy_defs.ts.
// Contains loot table structure interface and boss stat scaling constants.
// All specific named enemy definitions and boss drop items are discarded.

// ---------------------------------------------------------------------------
// LOOT TABLE STRUCTURE
// ---------------------------------------------------------------------------

export interface NamedEnemyLootDef {
  junkChance: bigint;
  gearChance: bigint;
  goldMin: bigint;
  goldMax: bigint;
  entries: { itemName: string; weight: bigint }[];
}

// ---------------------------------------------------------------------------
// BOSS STAT SCALING
// ---------------------------------------------------------------------------
// Named enemies (isBoss=true) have enhanced stats vs normal enemies of the same level:
// - HP: ~2-3x normal (formula: level * 25n + 50n for normals, bosses use 2-3x)
// - Damage: ~1.5x normal
// - Armor: ~1.5x normal
// - XP: ~1.5-2x normal
//
// Boss ability slot counts by tier:
// - Tier 1 (levels 1-5): 2-3 abilities
// - Tier 2 (levels 6-10): 3-4 abilities
//
// Loot drop rate ranges for bosses:
// - junkChance: 10-15%
// - gearChance: 70-80%
// - goldMin/goldMax: scales with level (5-15 at low levels)
// - Unique rare items: weight 3-5n per entry (vs 15-20n for common drops)

export const BOSS_HP_MULTIPLIER = 2.5;
export const BOSS_DAMAGE_MULTIPLIER = 1.5;
export const BOSS_ARMOR_MULTIPLIER = 1.5;
export const BOSS_XP_MULTIPLIER = 2.0;

export const BOSS_ABILITY_SLOTS_BY_TIER: Record<number, { min: number; max: number }> = {
  1: { min: 2, max: 3 },
  2: { min: 3, max: 4 },
};

export const BOSS_LOOT_DEFAULTS = {
  junkChanceMin: 10n,
  junkChanceMax: 15n,
  gearChanceMin: 70n,
  gearChanceMax: 80n,
  uniqueItemWeight: 3n,
  commonItemWeight: 20n,
} as const;

// ---------------------------------------------------------------------------
// ENEMY LEVEL SCALING (quick 261008-ag8)
// ---------------------------------------------------------------------------
// A spawn at a place that no enemy type fits takes the place's target level. These rules are pure
// (no imports) so the server and the client share them through @game-data.

/** The world-gen stat formulas for an enemy of this level (writeRegionFill uses the same function). */
export function enemyStatsForLevel(level: bigint): {
  maxHp: bigint;
  baseDamage: bigint;
  armorClass: bigint;
  xpReward: bigint;
} {
  return {
    maxHp: level * 12n + 20n,
    baseDamage: level * 3n + 5n,
    armorClass: level * 2n + 2n,
    xpReward: level * 15n + 10n,
  };
}

/**
 * A place's target level: the base level scaled by the region's danger multiplier (floored, an
 * unknown region reads as 100), plus the place's own levelOffset, never below 1. The server's
 * computeLocationTargetLevel and the client's place labels both use this one rule.
 */
export function placeTargetLevelFor(
  dangerMultiplier: bigint | null | undefined,
  levelOffset: bigint | null | undefined,
  baseLevel: bigint = 1n,
): bigint {
  const scaled = (baseLevel * (dangerMultiplier ?? 100n)) / 100n;
  const level = scaled + (levelOffset ?? 0n);
  return level > 1n ? level : 1n;
}

/** The level band of a place: exactly the target at an offset-0 place, else target -1 .. target +1. */
export function placeLevelBand(target: bigint, levelOffset: bigint): { min: bigint; max: bigint } {
  const exact = levelOffset === 0n;
  return {
    min: exact ? target : target > 1n ? target - 1n : 1n,
    max: exact ? target : target + 1n,
  };
}

/** The level a spawn fights at: the type's own level when it sits inside the place band, else the place's target. */
export function placeSpawnLevel(typeLevel: bigint, target: bigint, levelOffset: bigint): bigint {
  const band = placeLevelBand(target, levelOffset);
  return typeLevel >= band.min && typeLevel <= band.max ? typeLevel : target;
}

/**
 * The level of a spawn or combat enemy row. A row level of 0 (or missing) marks a row from before
 * the level column, so it reads as its type's level.
 */
export function effectiveEnemyLevel<T extends bigint | undefined>(
  rowLevel: bigint | null | undefined,
  templateLevel: T,
): bigint | T {
  return typeof rowLevel === 'bigint' && rowLevel > 0n ? rowLevel : templateLevel;
}

/**
 * The enemy template as it fights at this row level. The scaled stats follow the world-gen formulas
 * so a scaled spawn matches a type generated at that level. Returns the same object when the level
 * is unchanged.
 */
export function templateAtLevel<T extends { level: bigint }>(
  template: T,
  rowLevel: bigint | null | undefined,
): T {
  const level = effectiveEnemyLevel(rowLevel, template.level);
  if (level === template.level) return template;
  return { ...template, level, ...enemyStatsForLevel(level) };
}
