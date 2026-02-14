export const TRAVEL_CONFIG = {
  WITHIN_REGION_STAMINA: 5n,     // Stamina cost per character for same-region travel
  CROSS_REGION_STAMINA: 10n,     // Stamina cost per character for cross-region travel
  CROSS_REGION_COOLDOWN_MICROS: 5n * 60n * 1_000_000n, // 5 minutes in microseconds
};
