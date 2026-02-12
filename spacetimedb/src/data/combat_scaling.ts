import { CLASS_CONFIG, getClassConfig, type StatKey } from './class_stats.js';
import { ABILITIES } from './ability_catalog.js';

// ============================================================================
// COMBAT SCALING CONSTANTS
// ============================================================================

/**
 * Weapon crit multipliers by weapon type (per 100n base)
 * Fast weapons: 1.5x crit multiplier
 * Medium weapons: 2.0x crit multiplier
 * Slow weapons: 2.5x crit multiplier
 */
export const WEAPON_CRIT_MULTIPLIERS: Record<string, bigint> = {
  dagger: 150n,
  rapier: 150n,
  staff: 150n,
  sword: 200n,
  blade: 200n,
  mace: 200n,
  bow: 200n,
  axe: 250n,
};

/**
 * STR scaling per 1000 for auto-attacks (1.5% per STR point)
 * User decision: 1-2% range, chose 1.5% for balance
 */
export const STR_SCALING_PER_1000 = 15n;

/**
 * Flat stat contribution per point for abilities
 * Used in ability hybrid formula
 */
export const ABILITY_STAT_SCALING_PER_POINT = 2n;

/**
 * Base crit chance (5% on 1000 scale)
 */
export const CRIT_BASE_CHANCE = 50n;

/**
 * Crit chance bonus per DEX point (0.1% per DEX on 1000 scale)
 */
export const CRIT_DEX_BONUS_PER_POINT = 1n;

/**
 * Maximum crit chance cap (50% on 1000 scale)
 */
export const CRIT_CHANCE_CAP = 500n;

/**
 * WIS scaling per 1000 for healing (2% per WIS point)
 * Matches STR/INT magnitude for consistency
 */
export const HEALING_WIS_SCALING_PER_1000 = 20n;

/**
 * Magic resist uses 3x multiplier in mitigation formula
 * (vs armor's adjusted multiplier) - rarer but more powerful per point
 */
export const MAGIC_RESIST_SCALING = 3n;

// ============================================================================
// ABILITY STAT SCALING MAPPING
// ============================================================================

/**
 * Maps ability keys to their primary scaling stat
 * str: Melee weapon abilities
 * int: Arcane spells
 * wis: Divine/nature abilities
 * hybrid: STR+INT abilities
 * cha: Bard abilities
 * none: Utility/non-damage abilities
 */
export const ABILITY_STAT_SCALING: Record<string, 'str' | 'dex' | 'int' | 'wis' | 'cha' | 'hybrid' | 'none'> = {
  // STR abilities (melee weapon)
  warrior_slam: 'str',
  warrior_cleave: 'str',
  warrior_crushing_blow: 'str',
  rogue_shadow_cut: 'str',
  rogue_bleed: 'str',
  rogue_shadow_strike: 'str',
  monk_crippling_kick: 'str',
  monk_palm_strike: 'str',
  monk_tiger_flurry: 'str',
  beastmaster_pack_rush: 'str',
  beastmaster_beast_fang: 'str',
  beastmaster_alpha_assault: 'str',

  // INT abilities (arcane spells)
  wizard_magic_missile: 'int',
  wizard_frost_shard: 'int',
  wizard_lightning_surge: 'int',
  necromancer_plague_spark: 'int',
  necromancer_wither: 'int',
  necromancer_grave_surge: 'int',
  summoner_conjure_vessel: 'int',
  summoner_conjured_spike: 'int',
  summoner_spectral_lance: 'int',
  enchanter_mind_fray: 'int',
  enchanter_slow: 'int',
  enchanter_charm_fray: 'int',

  // WIS abilities (divine/nature)
  cleric_smite: 'wis',
  cleric_mend: 'wis',
  cleric_heal: 'wis',
  druid_thorn_lash: 'wis',
  druid_bramble: 'wis',
  druid_wild_surge: 'wis',
  shaman_hex: 'wis',
  shaman_stormcall: 'wis',
  shaman_spirit_mender: 'wis',
  ranger_marked_shot: 'wis',
  ranger_rapid_shot: 'wis',
  ranger_piercing_arrow: 'wis',

  // Hybrid abilities (STR+INT)
  paladin_holy_strike: 'hybrid',
  paladin_radiant_smite: 'hybrid',
  spellblade_arcane_slash: 'hybrid',
  spellblade_runic_strike: 'hybrid',
  spellblade_spellstorm: 'hybrid',
  reaver_blood_rend: 'hybrid',
  reaver_soul_rend: 'hybrid',
  reaver_oblivion: 'hybrid',

  // CHA abilities
  bard_discordant_note: 'cha',
  bard_echoed_chord: 'cha',
  bard_crushing_crescendo: 'cha',

  // None (utility/non-damage)
  warrior_intimidating_presence: 'none',
  warrior_rally: 'none',
  enchanter_veil_of_calm: 'none',
  enchanter_clarity_ii: 'none',
  cleric_sanctify: 'none',
  cleric_sanctuary: 'none',
  wizard_arcane_reservoir: 'none',
  wizard_mana_shield: 'none',
  rogue_pickpocket: 'none',
  rogue_evasion: 'none',
  paladin_lay_on_hands: 'none',
  paladin_shield_of_faith: 'none',
  paladin_devotion: 'none',
  ranger_track: 'none',
  ranger_natures_balm: 'none',
  necromancer_bone_servant: 'none',
  necromancer_bone_ward: 'none',
  spellblade_rune_ward: 'none',
  spellblade_ward: 'none',
  reaver_blood_pact: 'none',
  reaver_dread_aura: 'none',
  summoner_earth_familiar: 'none',
  summoner_empower: 'none',
  bard_ballad_of_resolve: 'none',
  bard_harmony: 'none',
  beastmaster_call_beast: 'none',
  beastmaster_wild_howl: 'none',
  monk_centering: 'none',
  monk_inner_focus: 'none',
  druid_natures_mark: 'none',
  druid_natures_gift: 'none',
  shaman_spirit_wolf: 'none',
  shaman_ancestral_ward: 'none',
};

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Infer weapon type from weapon name
 * Checks for weapon type keywords in the name (case-insensitive)
 * Falls back to 'sword' if no match found
 */
export function inferWeaponType(weaponName: string): string {
  const name = weaponName.toLowerCase();
  if (name.includes('dagger')) return 'dagger';
  if (name.includes('rapier')) return 'rapier';
  if (name.includes('staff')) return 'staff';
  if (name.includes('sword')) return 'sword';
  if (name.includes('blade')) return 'blade';
  if (name.includes('axe')) return 'axe';
  if (name.includes('bow')) return 'bow';
  if (name.includes('mace')) return 'mace';
  return 'sword'; // default fallback
}

/**
 * Calculate stat-scaled auto-attack damage
 * Formula: baseWeaponDamage + (baseWeaponDamage * characterStr * STR_SCALING_PER_1000) / 1000n
 * Multiplicative scaling keeps gear dominant (per user decision)
 */
export function calculateStatScaledAutoAttack(baseWeaponDamage: bigint, characterStr: bigint): bigint {
  return baseWeaponDamage + (baseWeaponDamage * characterStr * STR_SCALING_PER_1000) / 1000n;
}

/**
 * Calculate crit chance from DEX
 * Formula: min(CRIT_BASE_CHANCE + characterDex * CRIT_DEX_BONUS_PER_POINT, CRIT_CHANCE_CAP)
 * Returns value on 0-1000 scale (50 = 5%, 500 = 50%)
 */
export function calculateCritChance(characterDex: bigint): bigint {
  const chance = CRIT_BASE_CHANCE + characterDex * CRIT_DEX_BONUS_PER_POINT;
  return chance > CRIT_CHANCE_CAP ? CRIT_CHANCE_CAP : chance;
}

/**
 * Get crit multiplier for weapon type
 * Returns multiplier (150n = 1.5x, 200n = 2.0x, 250n = 2.5x)
 */
export function getCritMultiplier(weaponName: string): bigint {
  const weaponType = inferWeaponType(weaponName);
  return WEAPON_CRIT_MULTIPLIERS[weaponType] ?? 200n;
}

/**
 * Get ability stat scaling contribution
 * Uses ABILITY_STAT_SCALING mapping to determine which stat(s) to use
 * Returns flat stat contribution based on ability type
 */
export function getAbilityStatScaling(
  characterStats: { str: bigint; dex: bigint; cha: bigint; wis: bigint; int: bigint },
  abilityKey: string,
  className: string
): bigint {
  const scalingType = ABILITY_STAT_SCALING[abilityKey];

  if (!scalingType || scalingType === 'none') {
    return 0n;
  }

  if (scalingType === 'hybrid') {
    // Hybrid abilities: sum STR + INT, 1n per point (slightly lower than pure classes)
    return (characterStats.str + characterStats.int) * 1n;
  }

  // Pure stat scaling: 2n per point
  return characterStats[scalingType] * ABILITY_STAT_SCALING_PER_POINT;
}

/**
 * Get ability damage multiplier based on cast time and cooldown
 * Formula: 100n + castSeconds * 10n + (cooldownSeconds > 0n ? (cooldownSeconds * 5n) / 10n : 0n)
 * Returns multiplier on 100n = 1.0x scale
 * Longer cast = higher multiplier, longer CD = higher burst (per user decision)
 */
export function getAbilityMultiplier(castSeconds: bigint, cooldownSeconds: bigint): bigint {
  const castBonus = castSeconds * 10n;
  const cdBonus = cooldownSeconds > 0n ? (cooldownSeconds * 5n) / 10n : 0n;
  return 100n + castBonus + cdBonus;
}

/**
 * Calculate healing power with WIS scaling
 * Only applies WIS scaling if class config has primary='wis' or secondary='wis'
 * Formula: baseHealing + (baseHealing * casterWis * HEALING_WIS_SCALING_PER_1000) / 1000n
 */
export function calculateHealingPower(baseHealing: bigint, casterWis: bigint, className: string): bigint {
  const config = getClassConfig(className);

  // Only apply WIS scaling for healing classes
  const isHealingClass = config.primary === 'wis' || config.secondary === 'wis';

  if (!isHealingClass) {
    return baseHealing;
  }

  return baseHealing + (baseHealing * casterWis * HEALING_WIS_SCALING_PER_1000) / 1000n;
}

/**
 * Apply magic resistance mitigation
 * Formula: (damage * 100n) / (100n + magicResist * MAGIC_RESIST_SCALING)
 * Returns max(mitigated, 1n)
 * Magic resist is rarer but more powerful per point than armor (per user decision)
 */
export function applyMagicResistMitigation(damage: bigint, magicResist: bigint): bigint {
  const mitigated = (damage * 100n) / (100n + magicResist * MAGIC_RESIST_SCALING);
  return mitigated > 0n ? mitigated : 1n;
}
