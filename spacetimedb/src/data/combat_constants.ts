// Combat constants used across multiple modules
// Separated to avoid circular dependencies

export const COMBAT_LOOP_INTERVAL_MICROS = 1_000_000n;
export const AUTO_ATTACK_INTERVAL = 5_000_000n;
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
