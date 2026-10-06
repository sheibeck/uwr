// Combat constants used across multiple modules
// Separated to avoid circular dependencies

// Round-based combat timings: a round lasts at most 10 s (it ends early once everyone has chosen);
// effect and cooldown seconds convert to rounds at 4 s each (see helpers/combat_rounds.ts).
export const ROUND_TIMER_MICROS = 10_000_000n;
export const EFFECT_ROUND_CONVERSION_MICROS = 4_000_000n;
export const MIN_EFFECT_ROUNDS = 1n;
export const MAX_COMBAT_NARRATIONS = 3n;                     // per-fight cap on big-moment narrations; the end-of-fight narration is separate (+1)
export const COMBAT_INTRO_TIMEOUT_MICROS = 12_000_000n; // Fallback if LLM intro never completes (12 seconds)

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
