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
