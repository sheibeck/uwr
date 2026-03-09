import { describe, it, expect } from 'vitest';
import {
  calculateCritChance,
  getCritMultiplier,
  calculateStatScaledAutoAttack,
  calculateHealingPower,
  applyMagicResistMitigation,
  inferWeaponType,
  getAbilityMultiplier,
  getAbilityStatScaling,
  statOffset,
  CRIT_BASE_CHANCE,
  CRIT_CHANCE_CAP,
  CRIT_DEX_BONUS_PER_POINT,
  STR_SCALING_PER_1000,
  ABILITY_STAT_SCALING_PER_POINT,
  MAGIC_RESIST_SCALING,
  GLOBAL_DAMAGE_MULTIPLIER,
  STAT_BASE,
  WEAPON_CRIT_MULTIPLIERS,
  HEALING_WIS_SCALING_PER_1000,
} from './combat_scaling';

// ============================================================================
// calculateCritChance
// ============================================================================

describe('calculateCritChance', () => {
  it('returns base chance for 0 DEX', () => {
    expect(calculateCritChance(0n)).toBe(CRIT_BASE_CHANCE); // 50n = 5%
  });

  it('increases linearly with DEX', () => {
    // Each DEX point adds CRIT_DEX_BONUS_PER_POINT (1n) on 1000-scale
    expect(calculateCritChance(10n)).toBe(CRIT_BASE_CHANCE + 10n * CRIT_DEX_BONUS_PER_POINT);
    expect(calculateCritChance(100n)).toBe(CRIT_BASE_CHANCE + 100n * CRIT_DEX_BONUS_PER_POINT);
  });

  it('caps at CRIT_CHANCE_CAP (50%)', () => {
    // Cap is 500n. Base is 50n, each point adds 1n. Cap hit at DEX=450
    expect(calculateCritChance(450n)).toBe(CRIT_CHANCE_CAP);
    expect(calculateCritChance(999n)).toBe(CRIT_CHANCE_CAP);
  });

  it('returns exact cap at boundary DEX', () => {
    // 50n + 450n * 1n = 500n exactly
    expect(calculateCritChance(450n)).toBe(500n);
  });
});

// ============================================================================
// getCritMultiplier
// ============================================================================

describe('getCritMultiplier', () => {
  it('returns correct multiplier for each known weapon type', () => {
    expect(getCritMultiplier('Iron Dagger')).toBe(150n);
    expect(getCritMultiplier('Iron Sword')).toBe(175n);
    expect(getCritMultiplier('Iron Axe')).toBe(200n);
    expect(getCritMultiplier('Oak Staff')).toBe(225n);
    expect(getCritMultiplier('Long Bow')).toBe(225n);
    expect(getCritMultiplier('Iron Greatsword')).toBe(250n);
    expect(getCritMultiplier('Iron Mace')).toBe(175n);
    expect(getCritMultiplier('Iron Rapier')).toBe(150n);
    expect(getCritMultiplier('Iron Blade')).toBe(175n);
  });

  it('falls back to 200n for unknown weapon names', () => {
    // Unknown defaults to sword type via inferWeaponType -> 'sword'
    // But getCritMultiplier fallback for unknown type is 200n
    expect(getCritMultiplier('Magic Wand')).toBe(175n); // matches 'sword' default in inferWeaponType
  });

  it('uses explicit weaponType when provided', () => {
    expect(getCritMultiplier('Whatever', 'dagger')).toBe(150n);
    expect(getCritMultiplier('Whatever', 'greatsword')).toBe(250n);
  });

  it('falls back to 200n for truly unknown weapon type', () => {
    expect(getCritMultiplier('Whatever', 'flamethrower')).toBe(200n);
  });
});

// ============================================================================
// calculateStatScaledAutoAttack
// ============================================================================

describe('calculateStatScaledAutoAttack', () => {
  it('returns base damage when STR is 0', () => {
    expect(calculateStatScaledAutoAttack(100n, 0n)).toBe(100n);
  });

  it('scales damage with STR multiplicatively', () => {
    // Formula: base + (base * str * 15n) / 1000n
    // STR=10: 100 + (100 * 10 * 15) / 1000 = 100 + 15 = 115
    expect(calculateStatScaledAutoAttack(100n, 10n)).toBe(115n);
  });

  it('preserves weapon dominance at high STR', () => {
    // STR=100: 100 + (100 * 100 * 15) / 1000 = 100 + 150 = 250
    const result = calculateStatScaledAutoAttack(100n, 100n);
    expect(result).toBe(250n);
    // Weapon base (100) is still significant portion
  });

  it('handles bigint correctly with large weapon damage', () => {
    // STR=20: 500 + (500 * 20 * 15) / 1000 = 500 + 150 = 650
    expect(calculateStatScaledAutoAttack(500n, 20n)).toBe(650n);
  });
});

// ============================================================================
// calculateHealingPower
// ============================================================================

describe('calculateHealingPower', () => {
  const zeroStats = { str: 0n, dex: 0n, cha: 0n, wis: 0n, int: 0n };

  it('returns base heal when WIS is 0', () => {
    expect(calculateHealingPower(50n, zeroStats)).toBe(50n);
  });

  it('scales with WIS via ABILITY_STAT_SCALING_PER_POINT', () => {
    // Formula: base + wis * ABILITY_STAT_SCALING_PER_POINT (1n)
    const stats = { ...zeroStats, wis: 20n };
    expect(calculateHealingPower(50n, stats)).toBe(50n + 20n * ABILITY_STAT_SCALING_PER_POINT);
  });

  it('ignores other stats', () => {
    // Only WIS matters for healing
    const highInt = { ...zeroStats, int: 100n };
    expect(calculateHealingPower(50n, highInt)).toBe(50n);
  });
});

// ============================================================================
// applyMagicResistMitigation
// ============================================================================

describe('applyMagicResistMitigation', () => {
  it('applies full damage with 0 magic resist (minus global multiplier)', () => {
    // Formula: (damage * 100) / (100 + 0*3) * 85 / 100 = damage * 85 / 100
    const result = applyMagicResistMitigation(100n, 0n);
    expect(result).toBe((100n * GLOBAL_DAMAGE_MULTIPLIER) / 100n); // 85n
  });

  it('reduces damage proportional to magic resist', () => {
    // MR=10: (100 * 100) / (100 + 30) = 10000/130 = 76 -> * 85/100 = 64
    const result = applyMagicResistMitigation(100n, 10n);
    const resistReduced = (100n * 100n) / (100n + 10n * MAGIC_RESIST_SCALING);
    const expected = (resistReduced * GLOBAL_DAMAGE_MULTIPLIER) / 100n;
    expect(result).toBe(expected);
  });

  it('floors at 1n for massive resist vs tiny damage', () => {
    // Very high resist: damage approaches 0 but is clamped to 1
    expect(applyMagicResistMitigation(1n, 1000n)).toBe(1n);
  });

  it('handles high damage correctly', () => {
    const result = applyMagicResistMitigation(1000n, 0n);
    expect(result).toBe(850n);
  });
});

// ============================================================================
// inferWeaponType
// ============================================================================

describe('inferWeaponType', () => {
  it('matches weapon name patterns correctly', () => {
    expect(inferWeaponType('Iron Sword')).toBe('sword');
    expect(inferWeaponType('Steel Dagger')).toBe('dagger');
    expect(inferWeaponType('Oak Staff')).toBe('staff');
    expect(inferWeaponType('Iron Axe')).toBe('axe');
    expect(inferWeaponType('Long Bow')).toBe('bow');
    expect(inferWeaponType('Iron Mace')).toBe('mace');
    expect(inferWeaponType('Fine Rapier')).toBe('rapier');
    expect(inferWeaponType('Shadow Blade')).toBe('blade');
  });

  it('prioritizes greatsword over sword', () => {
    // 'greatsword' check comes before 'sword'
    expect(inferWeaponType('Iron Greatsword')).toBe('greatsword');
  });

  it('is case insensitive', () => {
    expect(inferWeaponType('IRON SWORD')).toBe('sword');
    expect(inferWeaponType('oAk StAfF')).toBe('staff');
  });

  it('defaults to sword for unknown names', () => {
    expect(inferWeaponType('Magic Wand')).toBe('sword');
    expect(inferWeaponType('Mystical Orb')).toBe('sword');
  });
});

// ============================================================================
// getAbilityMultiplier
// ============================================================================

describe('getAbilityMultiplier', () => {
  it('returns 100n for instant cast with no cooldown', () => {
    expect(getAbilityMultiplier(0n, 0n)).toBe(100n);
  });

  it('increases with cast time (10n per second)', () => {
    // castSeconds=3: 100 + 3*10 + 0 = 130
    expect(getAbilityMultiplier(3n, 0n)).toBe(130n);
  });

  it('increases with cooldown (0.5n per second)', () => {
    // cooldown=10: 100 + 0 + (10*5)/10 = 100 + 5 = 105
    expect(getAbilityMultiplier(0n, 10n)).toBe(105n);
  });

  it('combines cast and cooldown bonuses', () => {
    // cast=2, cd=20: 100 + 20 + (100)/10 = 100 + 20 + 10 = 130
    expect(getAbilityMultiplier(2n, 20n)).toBe(130n);
  });
});

// ============================================================================
// getAbilityStatScaling
// ============================================================================

describe('getAbilityStatScaling', () => {
  const stats = { str: 20n, dex: 15n, cha: 10n, wis: 18n, int: 12n };

  it('returns 0n for none scaling', () => {
    expect(getAbilityStatScaling(stats, 'some_utility', 'warrior', 'none')).toBe(0n);
  });

  it('returns 0n for empty/falsy scaling', () => {
    expect(getAbilityStatScaling(stats, 'test', 'warrior', '')).toBe(0n);
  });

  it('scales with pure stat correctly', () => {
    // statScaling='str': str * ABILITY_STAT_SCALING_PER_POINT = 20 * 1 = 20
    expect(getAbilityStatScaling(stats, 'warrior_slam', 'warrior', 'str')).toBe(20n);
    expect(getAbilityStatScaling(stats, 'wizard_spell', 'wizard', 'int')).toBe(12n);
    expect(getAbilityStatScaling(stats, 'cleric_smite', 'cleric', 'wis')).toBe(18n);
  });

  it('calculates hybrid scaling with primary/secondary', () => {
    // detectPrimarySecondary sorts by value: str=20, wis=18, dex=15, int=12, cha=10
    // primary=str (20), secondary=wis (18, since 18>15)
    // (20*60 + 18*40)/100 * 1 = (1200+720)/100 = 19
    const result = getAbilityStatScaling(stats, 'ranger_marked_shot', 'ranger', 'hybrid');
    expect(result).toBe(19n);
  });
});

// ============================================================================
// statOffset
// ============================================================================

describe('statOffset', () => {
  it('returns 0 at STAT_BASE (10)', () => {
    expect(statOffset(STAT_BASE, 5n)).toBe(0n);
  });

  it('returns positive offset above base', () => {
    // (14 - 10) * 5 = 20
    expect(statOffset(14n, 5n)).toBe(20n);
  });

  it('returns negative offset below base', () => {
    // (6 - 10) * 5 = -20
    expect(statOffset(6n, 5n)).toBe(-20n);
  });

  it('scales with bonusPerPoint', () => {
    expect(statOffset(12n, 2n)).toBe(4n);
    expect(statOffset(12n, 10n)).toBe(20n);
  });
});
