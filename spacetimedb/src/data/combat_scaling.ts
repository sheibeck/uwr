import { getClassConfig, type StatKey } from './class_stats.js';

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
export const ABILITY_STAT_SCALING_PER_POINT = 1n;

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

/**
 * Global damage reduction percentage (on 100n scale)
 * Applied to ALL damage after armor/resist mitigation
 * 85n = 85% of damage dealt (15% reduction)
 * Easy lever to tune overall combat duration
 * Set to 100n to disable (100% = no reduction)
 */
export const GLOBAL_DAMAGE_MULTIPLIER = 85n;

/**
 * DoT/HoT stat scaling reduction factor (50% of direct damage scaling)
 * Prevents double-dipping: DoTs tick multiple times, so per-tick scaling is halved
 * User decision: DoTs use reduced scaling rate compared to direct damage
 */
export const DOT_SCALING_RATE_MODIFIER = 50n;  // 50% on 100n scale

/**
 * AoE damage multiplier per target (65% of single-target damage)
 * User decision: AoE abilities deal 60-70% damage per target
 * Starting point: 65%, tune via playtesting if needed
 */
export const AOE_DAMAGE_MULTIPLIER = 65n;  // 65% on 100n scale

/**
 * Debuff power cost percentage (25% of ability power budget)
 * User decision: Abilities with debuffs deal reduced damage proportionally
 * All debuff types cost the same power budget
 */
export const DEBUFF_POWER_COST_PERCENT = 25n;  // 25% on 100n scale

/**
 * Enemy base ability power (level 1 baseline)
 * Enemies do NOT have stats — damage is purely level + power rating
 * User decision: enemy ability damage scales by enemy level only
 */
export const ENEMY_BASE_POWER = 10n;

/**
 * Enemy ability power scaling per level
 * Formula: ENEMY_BASE_POWER + (enemyLevel * ENEMY_LEVEL_POWER_SCALING)
 * Level 1 = 15, Level 5 = 35, Level 10 = 60
 */
export const ENEMY_LEVEL_POWER_SCALING = 5n;

/** Tank threat multiplier (150n = 1.5x on 100n scale) */
export const TANK_THREAT_MULTIPLIER = 150n;

/** Healer threat multiplier (50n = 0.5x on 100n scale) */
export const HEALER_THREAT_MULTIPLIER = 50n;

/** Healing threat as percentage of healing done (50n = 50% on 100n scale) */
export const HEALING_THREAT_PERCENT = 50n;

// ============================================================================
// ABILITY STAT SCALING MAPPING
// ============================================================================

/**
 * Maps ability keys to their primary scaling stat
 * str: Pure STR class damage abilities (warrior)
 * dex: Pure DEX class damage abilities (rogue)
 * int: Pure INT class damage abilities (wizard/necromancer/summoner)
 * wis: Pure WIS class damage abilities (cleric/druid/shaman/paladin)
 * cha: Pure CHA class damage abilities (enchanter)
 * hybrid: 60% primary + 40% secondary per CLASS_CONFIG (ranger/monk/beastmaster/bard/spellblade/reaver)
 * none: Utility/non-damage abilities
 */

// ABILITY_STAT_SCALING is kept for seeding purposes only (ensureAbilityTemplates)
// Execution code reads statScaling from database rows, not this constant
export const ABILITY_STAT_SCALING: Record<string, 'str' | 'dex' | 'int' | 'wis' | 'cha' | 'hybrid' | 'none'> = {
  // STR abilities (warrior — pure STR class)
  warrior_slam: 'str',
  warrior_cleave: 'str',
  warrior_crushing_blow: 'str',

  // DEX abilities (rogue finesse — rogue primary is DEX, not STR)
  rogue_shadow_cut: 'dex',
  rogue_bleed: 'dex',
  rogue_shadow_strike: 'dex',

  // INT abilities (arcane spells — wizard/necromancer/summoner pure INT classes)
  wizard_magic_missile: 'int',
  wizard_frost_shard: 'int',
  wizard_lightning_surge: 'int',
  necromancer_plague_spark: 'int',
  necromancer_wither: 'int',
  necromancer_grave_surge: 'int',
  summoner_conjure_vessel: 'int',
  summoner_conjured_spike: 'int',
  summoner_spectral_lance: 'int',

  // WIS abilities (divine/nature — cleric/druid/shaman/paladin pure WIS classes)
  cleric_smite: 'wis',
  cleric_mend: 'wis',
  cleric_heal: 'wis',
  druid_thorn_lash: 'wis',
  druid_bramble: 'wis',
  druid_wild_surge: 'wis',
  shaman_hex: 'wis',
  shaman_stormcall: 'wis',
  shaman_spirit_mender: 'wis',
  paladin_holy_strike: 'wis',
  paladin_radiant_smite: 'wis',

  // CHA abilities (enchanter/bard pure CHA — enchanter has no secondary stat)
  enchanter_mind_fray: 'cha',
  enchanter_slow: 'cha',
  enchanter_charm_fray: 'cha',

  // Hybrid abilities (60% primary + 40% secondary per CLASS_CONFIG)
  // ranger: primary=dex, secondary=wis
  ranger_marked_shot: 'hybrid',
  ranger_rapid_shot: 'hybrid',
  ranger_piercing_arrow: 'hybrid',
  // monk: primary=dex, secondary=str
  monk_crippling_kick: 'hybrid',
  monk_palm_strike: 'hybrid',
  monk_tiger_flurry: 'hybrid',
  // beastmaster: primary=str, secondary=dex
  beastmaster_pack_rush: 'hybrid',
  beastmaster_beast_fang: 'hybrid',
  beastmaster_alpha_assault: 'hybrid',
  // bard: primary=cha, secondary=int
  bard_discordant_note: 'hybrid',
  bard_echoed_chord: 'hybrid',
  bard_crushing_crescendo: 'hybrid',
  // spellblade: primary=int, secondary=str
  spellblade_arcane_slash: 'hybrid',
  spellblade_runic_strike: 'hybrid',
  spellblade_spellstorm: 'hybrid',
  // reaver: primary=str, secondary=int
  reaver_blood_rend: 'hybrid',
  reaver_soul_rend: 'hybrid',
  reaver_oblivion: 'hybrid',

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
export function getCritMultiplier(weaponName: string, weaponType?: string): bigint {
  const type = weaponType && weaponType !== '' ? weaponType : inferWeaponType(weaponName);
  return WEAPON_CRIT_MULTIPLIERS[type] ?? 200n;
}

/**
 * Get ability stat scaling contribution
 * Reads statScaling from database row parameter
 * Returns flat stat contribution based on ability type
 */
export function getAbilityStatScaling(
  characterStats: { str: bigint; dex: bigint; cha: bigint; wis: bigint; int: bigint },
  abilityKey: string,
  className: string,
  statScaling: string
): bigint {
  if (!statScaling || statScaling === 'none') {
    return 0n;
  }

  if (statScaling === 'hybrid') {
    // Hybrid abilities: 60% primary + 40% secondary from CLASS_CONFIG
    const config = getClassConfig(className);
    if (config.secondary) {
      const primaryVal = characterStats[config.primary as keyof typeof characterStats] ?? 0n;
      const secondaryVal = characterStats[config.secondary as keyof typeof characterStats] ?? 0n;
      // 60% primary + 40% secondary, scaled by ABILITY_STAT_SCALING_PER_POINT
      return ((primaryVal * 60n + secondaryVal * 40n) / 100n) * ABILITY_STAT_SCALING_PER_POINT;
    }
    // Fallback: class has no secondary, use primary only
    return characterStats[config.primary as keyof typeof characterStats] * ABILITY_STAT_SCALING_PER_POINT;
  }

  // Pure stat scaling: 2n per point
  return characterStats[statScaling as keyof typeof characterStats] * ABILITY_STAT_SCALING_PER_POINT;
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
 * Calculate healing power — always scales with Wisdom for all healing types.
 * Formula: baseHealing + wis * ABILITY_STAT_SCALING_PER_POINT
 */
export function calculateHealingPower(
  baseHealing: bigint,
  characterStats: { str: bigint; dex: bigint; cha: bigint; wis: bigint; int: bigint }
): bigint {
  return baseHealing + characterStats.wis * ABILITY_STAT_SCALING_PER_POINT;
}

/**
 * Apply magic resistance mitigation
 * Formula: (damage * 100n) / (100n + magicResist * MAGIC_RESIST_SCALING)
 * Then apply global damage multiplier
 * Returns max(mitigated, 1n)
 * Magic resist is rarer but more powerful per point than armor (per user decision)
 */
export function applyMagicResistMitigation(damage: bigint, magicResist: bigint): bigint {
  const resistReduced = (damage * 100n) / (100n + magicResist * MAGIC_RESIST_SCALING);
  const globalReduced = (resistReduced * GLOBAL_DAMAGE_MULTIPLIER) / 100n;
  return globalReduced > 0n ? globalReduced : 1n;
}

// ============================================================================
// STAT OFFSET SCALING (Phase 21.1)
// ============================================================================

/**
 * Symmetric stat scaling base — all off-stat hooks scale around this value.
 * Formula: bonus above STAT_BASE = penalty below STAT_BASE (mirror symmetry).
 */
export const STAT_BASE = 10n;

/**
 * Compute a signed bigint offset for a stat relative to STAT_BASE (10).
 * Returns: (statValue - STAT_BASE) * bonusPerPoint
 *   - statValue > 10: positive offset (bonus)
 *   - statValue = 10: zero offset (no change)
 *   - statValue < 10: negative offset (penalty)
 *
 * TypeScript bigint handles negatives natively.
 * Do NOT store this as u64 in the DB — compute inline at call sites only.
 *
 * @param statValue  Character stat (u64 from DB, treated as signed in arithmetic)
 * @param bonusPerPoint Bonus per point above 10 (same magnitude used for penalty below 10)
 */
export function statOffset(statValue: bigint, bonusPerPoint: bigint): bigint {
  return (statValue - STAT_BASE) * bonusPerPoint;
}

// ===== Block system constants (DEX / STR) =====

/** Block chance on 1000-scale per DEX point above/below 10.
 *  5n = 0.5% per point. At DEX=10: base only. At DEX=14: +2%. At DEX=6: -2%. */
export const BLOCK_CHANCE_DEX_PER_POINT = 5n;

/** Base block chance on 1000-scale (50n = 5%). Applied when shield is equipped.
 *  DEX offset added/subtracted from this base. */
export const BLOCK_CHANCE_BASE = 50n;

/** Block mitigation per STR point above/below 10, on 100n (percent) scale.
 *  2n = 2% per point. At STR=10: 30%. At STR=14: 38%. At STR=6: 22%. */
export const BLOCK_MITIGATION_STR_PER_POINT = 2n;

/** Base block mitigation percent on 100n scale (30n = 30% damage absorbed).
 *  STR offset added/subtracted from this base. */
export const BLOCK_MITIGATION_BASE = 30n;

// ===== WIS pull hook constant =====

/** WIS offset per point for pull success/fail shift, in integer percentage points.
 *  2n = ±2 percentage points per WIS point above/below 10. */
export const WIS_PULL_BONUS_PER_POINT = 2n;

// ===== INT salvage scroll constant =====

/** INT offset per point for scroll drop chance, on 100n (percent) scale.
 *  3n = ±3% per point. At INT=10: base 25%. At INT=14: 37%. At INT=6: 13%. */
export const INT_SALVAGE_BONUS_PER_POINT = 3n;

/** Base scroll drop chance on 100n scale. Replaces old hardcoded 75n auto-learn.
 *  Lower base reflects that the player now gets a tradeable item (more valuable). */
export const SALVAGE_SCROLL_CHANCE_BASE = 25n;

// ===== CHA hooks constants =====

/** CHA offset per point for faction gains, on 100n (percent) scale.
 *  1n = ±1% per point. Applied as a multiplier on positive faction deltas. */
export const CHA_FACTION_BONUS_PER_POINT = 1n;

/** CHA offset per point for NPC affinity gains, on 100n (percent) scale.
 *  1n = ±1% per point. Applied as a multiplier on positive affinity changes. */
export const CHA_AFFINITY_BONUS_PER_POINT = 1n;

/** CHA vendor modifier scale for recomputeCharacterDerived.
 *  10n means CHA=10 gives +0, CHA=11 gives +10, CHA=9 gives -10 (on 1000-scale).
 *  vendorBuyMod = (cha - 10) * 10 (clamped ≥ 0 to avoid penalties on u64 col) */
export const CHA_VENDOR_SCALE = 10n;

/** CHA vendor sell modifier scale for recomputeCharacterDerived.
 *  8n means CHA=10 gives +0, CHA=11 gives +8, CHA=9 gives -8 (on 1000-scale).
 *  vendorSellMod = (cha - 10) * 8 (clamped ≥ 0 to avoid penalties on u64 col) */
export const CHA_VENDOR_SELL_SCALE = 8n;
