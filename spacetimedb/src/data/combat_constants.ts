// Combat constants used across multiple modules
// Separated to avoid circular dependencies

export const COMBAT_LOOP_INTERVAL_MICROS = 1_000_000n;
export const AUTO_ATTACK_INTERVAL = 5_000_000n; // Used for enemies, pets, and pull delay — NOT player auto-attacks

/** Weapon auto-attack intervals by type (microseconds).
 *  Fast weapons swing more often but deal less per hit.
 *  DPS is balanced via inverse damage scaling.
 *
 *  Speed tiers:
 *    Fast   (3.0s): dagger, rapier
 *    Normal (3.5s): staff, bow
 *    Medium (4.0s): sword, blade, mace
 *    Slow   (5.0s): axe
 *  Default fallback (unarmed/unknown): 4_000_000n (4.0s)
 */
export const WEAPON_SPEED_MICROS: Record<string, bigint> = {
  dagger: 3_000_000n,
  rapier: 3_000_000n,
  staff:  3_500_000n,
  bow:    3_500_000n,
  sword:  4_000_000n,
  blade:  4_000_000n,
  mace:   4_000_000n,
  axe:    5_000_000n,
};
export const DEFAULT_WEAPON_SPEED_MICROS = 4_000_000n;
export const GROUP_SIZE_DANGER_BASE = 100n;
export const GROUP_SIZE_BIAS_RANGE = 200n;
export const GROUP_SIZE_BIAS_MAX = 0.8;

export const STARTER_ITEM_NAMES = new Set([
  // Starter weapons
  'Training Sword', 'Training Mace', 'Training Staff', 'Training Bow',
  'Training Dagger', 'Training Axe', 'Training Blade', 'Training Rapier',
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
