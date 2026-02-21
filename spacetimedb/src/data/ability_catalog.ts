export const GLOBAL_COOLDOWN_MICROS = 1_000_000n;

export type DamageType = 'physical' | 'magic' | 'none';

// Ability entries use this shape (extended with DoT/HoT/debuff/AoE metadata)
export interface AbilityMetadata {
  name: string;
  description: string;
  className: string;
  resource: string;
  level: bigint;
  power: bigint;
  cooldownSeconds: bigint;
  castSeconds: bigint;
  damageType: DamageType;

  // DoT metadata (damage over time)
  dotPowerSplit?: number;        // 0-1, fraction of power allocated to DoT total damage
  dotDuration?: bigint;          // Duration in ticks (1 tick = 3 seconds)

  // HoT metadata (heal over time)
  hotPowerSplit?: number;        // 0-1, fraction of power allocated to HoT total healing
  hotDuration?: bigint;          // Duration in ticks

  // Debuff metadata
  debuffType?: string;           // 'ac_bonus' | 'damage_down' | 'armor_down' | 'slow'
  debuffMagnitude?: bigint;      // Fixed magnitude value (stat-independent per user decision)
  debuffDuration?: bigint;       // Duration in ticks

  // AoE metadata
  aoeTargets?: 'all_enemies' | 'all_allies' | 'all_party';  // Target type

  // Combat state restriction
  combatState?: 'any' | 'combat_only' | 'out_of_combat' | 'out_of_combat_only';

  // Override the computed resource cost (4 + level*2 + power) with a fixed value.
  // Use for pet summons where power represents pet stats, not casting strength.
  resourceCostOverride?: bigint;
}

