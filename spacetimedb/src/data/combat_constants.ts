// Combat constants used across multiple modules
// Separated to avoid circular dependencies

// Legacy tick-based combat loop interval (kept for backward compat, not used in round-based combat)
export const COMBAT_LOOP_INTERVAL_MICROS = 1_000_000n;

// Round-based combat timing
export const ROUND_TIMER_MICROS = 10_000_000n;              // 10 seconds for group combat
export const SOLO_TIMER_MICROS = 6_000_000n;                // 6 seconds for solo combat
export const EFFECT_ROUND_CONVERSION_MICROS = 4_000_000n;   // 1 round ~ 4 seconds for duration conversion
export const MIN_EFFECT_ROUNDS = 1n;
export const MAX_COMBAT_NARRATIONS = 3n;                     // cap narrations per encounter
export const NARRATION_BUDGET_THRESHOLD = 10n;               // skip narration when budget below this
export const AUTO_ATTACK_INTERVAL = 5_000_000n; // Used for enemies, pets, and pull delay — NOT player auto-attacks

/** Weapon auto-attack intervals by type (microseconds).
 *  Fast weapons swing more often but deal less per hit.
 *  DPS is balanced via inverse damage scaling.
 *
 *  Speed tiers:
 *    Fast   (3.0s): dagger, rapier
 *    Normal (3.5s): sword, blade, mace
 *    Medium (4.0s): axe
 *    Slow   (5.0s): staff, bow, greatsword (two-handed)
 *  Default fallback (unarmed/unknown): 4_000_000n (4.0s)
 */
export const WEAPON_SPEED_MICROS: Record<string, bigint> = {
  dagger:     3_000_000n,
  rapier:     3_000_000n,
  sword:      3_500_000n,
  blade:      3_500_000n,
  mace:       3_500_000n,
  axe:        4_000_000n,
  staff:      5_000_000n,
  bow:        5_000_000n,
  greatsword: 5_000_000n,
};
export const DEFAULT_WEAPON_SPEED_MICROS = 4_000_000n;

/** Weapon types that occupy both hands — cannot equip offHand alongside these. */
export const TWO_HANDED_WEAPON_TYPES = new Set(['staff', 'bow', 'greatsword']);

export const GROUP_SIZE_DANGER_BASE = 100n;
export const GROUP_SIZE_BIAS_RANGE = 200n;
export const GROUP_SIZE_BIAS_MAX = 0.8;

export const STARTER_ITEM_NAMES = new Set([
  // Starter weapons
  'Training Sword', 'Training Mace', 'Training Staff', 'Training Bow',
  'Training Dagger', 'Training Axe', 'Training Blade', 'Training Rapier',
  'Training Greatsword',
  // Starter cloth armor
  'Apprentice Robe', 'Apprentice Trousers', 'Apprentice Boots',
  // Starter leather armor
  'Scout Jerkin', 'Scout Pants', 'Scout Boots',
  // Starter chain armor
  'Warden Hauberk', 'Warden Greaves', 'Warden Boots',
  // Starter plate armor
  'Vanguard Cuirass', 'Vanguard Greaves', 'Vanguard Boots',
  // Starter accessories
  'Rough Band', 'Worn Cloak', 'Traveler Necklace', 'Glimmer Ring', 'Shaded Cloak',
]);
