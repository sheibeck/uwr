// Combat constants used across multiple modules
// Separated to avoid circular dependencies

export const COMBAT_LOOP_INTERVAL_MICROS = 1_000_000n;
export const AUTO_ATTACK_INTERVAL = 5_000_000n;
export const GROUP_SIZE_DANGER_BASE = 100n;
export const GROUP_SIZE_BIAS_RANGE = 200n;
export const GROUP_SIZE_BIAS_MAX = 0.8;
