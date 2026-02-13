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
}

// Import per-class abilities
import { SHAMAN_ABILITIES } from './abilities/shaman_abilities.js';
import { WARRIOR_ABILITIES } from './abilities/warrior_abilities.js';
import { ENCHANTER_ABILITIES } from './abilities/enchanter_abilities.js';
import { CLERIC_ABILITIES } from './abilities/cleric_abilities.js';
import { WIZARD_ABILITIES } from './abilities/wizard_abilities.js';
import { ROGUE_ABILITIES } from './abilities/rogue_abilities.js';
import { PALADIN_ABILITIES } from './abilities/paladin_abilities.js';
import { RANGER_ABILITIES } from './abilities/ranger_abilities.js';
import { NECROMANCER_ABILITIES } from './abilities/necromancer_abilities.js';
import { SPELLBLADE_ABILITIES } from './abilities/spellblade_abilities.js';
import { BARD_ABILITIES } from './abilities/bard_abilities.js';
import { BEASTMASTER_ABILITIES } from './abilities/beastmaster_abilities.js';
import { MONK_ABILITIES } from './abilities/monk_abilities.js';
import { DRUID_ABILITIES } from './abilities/druid_abilities.js';
import { REAVER_ABILITIES } from './abilities/reaver_abilities.js';
import { SUMMONER_ABILITIES } from './abilities/summoner_abilities.js';

// Merge all player abilities into single export
export const ABILITIES: Record<string, AbilityMetadata> = {
  ...SHAMAN_ABILITIES,
  ...WARRIOR_ABILITIES,
  ...ENCHANTER_ABILITIES,
  ...CLERIC_ABILITIES,
  ...WIZARD_ABILITIES,
  ...ROGUE_ABILITIES,
  ...PALADIN_ABILITIES,
  ...RANGER_ABILITIES,
  ...NECROMANCER_ABILITIES,
  ...SPELLBLADE_ABILITIES,
  ...BARD_ABILITIES,
  ...BEASTMASTER_ABILITIES,
  ...MONK_ABILITIES,
  ...DRUID_ABILITIES,
  ...REAVER_ABILITIES,
  ...SUMMONER_ABILITIES,
};

// Re-export enemy abilities
export { ENEMY_ABILITIES } from './abilities/enemy_abilities.js';
