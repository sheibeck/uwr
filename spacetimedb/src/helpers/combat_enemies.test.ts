import { describe, it, expect } from 'vitest';
import {
  applyArmorMitigation,
  applyVariance,
  scaleByPercent,
  computeEnemyStats,
  getEnemyRole,
  getEnemyAttackSpeed,
  ENEMY_ROLE_CONFIG,
} from './combat_enemies';
import { GLOBAL_DAMAGE_MULTIPLIER, calculateStatScaledAutoAttack } from '../data/combat_scaling';

// ============================================================================
// applyArmorMitigation
// ============================================================================

describe('applyArmorMitigation', () => {
  it('returns damage * global multiplier for 0 armor', () => {
    // Formula: (100 * 100) / (100 + 0) = 100 -> * 85/100 = 85
    expect(applyArmorMitigation(100n, 0n)).toBe(
      (100n * GLOBAL_DAMAGE_MULTIPLIER) / 100n
    );
  });

  it('applies armor reduction formula correctly', () => {
    // 50 armor: (100*100)/(100+50) = 66 -> * 85/100 = 56
    const armorReduced = (100n * 100n) / (100n + 50n);
    const expected = (armorReduced * GLOBAL_DAMAGE_MULTIPLIER) / 100n;
    expect(applyArmorMitigation(100n, 50n)).toBe(expected);
  });

  it('100 armor gives ~50% physical reduction before global', () => {
    // (100*100)/(100+100) = 50 -> * GLOBAL/100
    // With GLOBAL=100: 50 * 100/100 = 50
    const armorReduced = (100n * 100n) / (100n + 100n);
    const expected = (armorReduced * GLOBAL_DAMAGE_MULTIPLIER) / 100n;
    const result = applyArmorMitigation(100n, 100n);
    expect(result).toBe(expected);
  });

  it('floors at 1n for tiny damage vs massive armor', () => {
    expect(applyArmorMitigation(1n, 10000n)).toBe(1n);
  });

  it('handles large damage values correctly', () => {
    // With GLOBAL=100: 1000 * 100/100 = 1000
    const result = applyArmorMitigation(1000n, 0n);
    expect(result).toBe((1000n * GLOBAL_DAMAGE_MULTIPLIER) / 100n);
  });
});

// ============================================================================
// applyVariance
// ============================================================================

describe('applyVariance', () => {
  it('returns value in [85%, 115%] range', () => {
    // seed % 31 gives 0-30, so percent = 85-115
    for (let s = 0n; s < 31n; s++) {
      const result = applyVariance(100n, s);
      expect(result).toBeGreaterThanOrEqual(85n);
      expect(result).toBeLessThanOrEqual(115n);
    }
  });

  it('returns at least 1n for positive input', () => {
    expect(applyVariance(1n, 0n)).toBeGreaterThanOrEqual(1n);
  });

  it('returns 0n for 0n input', () => {
    expect(applyVariance(0n, 42n)).toBe(0n);
  });

  it('returns negative for negative input (no clamping)', () => {
    // value <= 0n returns value directly
    expect(applyVariance(-5n, 0n)).toBe(-5n);
  });

  it('handles negative seeds by using absolute value', () => {
    const pos = applyVariance(100n, 10n);
    const neg = applyVariance(100n, -10n);
    expect(pos).toBe(neg);
  });

  it('produces minimum at seed=0 (85%) and max at seed=30 (115%)', () => {
    expect(applyVariance(100n, 0n)).toBe(85n);   // 85+0=85 -> 85%
    expect(applyVariance(100n, 30n)).toBe(115n);  // 85+30=115 -> 115%
  });
});

// ============================================================================
// scaleByPercent
// ============================================================================

describe('scaleByPercent', () => {
  it('returns same value at 100%', () => {
    expect(scaleByPercent(100n, 100n)).toBe(100n);
  });

  it('returns 0 at 0%', () => {
    expect(scaleByPercent(100n, 0n)).toBe(0n);
  });

  it('doubles at 200%', () => {
    expect(scaleByPercent(100n, 200n)).toBe(200n);
  });

  it('halves at 50%', () => {
    expect(scaleByPercent(100n, 50n)).toBe(50n);
  });

  it('handles rounding down for non-even splits', () => {
    // 33% of 100 = 33 (integer division)
    expect(scaleByPercent(100n, 33n)).toBe(33n);
  });
});

// ============================================================================
// computeEnemyStats
// ============================================================================

describe('computeEnemyStats', () => {
  const makeTemplate = (level: bigint, maxHp: bigint, armorClass: bigint) => ({
    level,
    maxHp,
    armorClass,
    role: 'damage',
  });

  it('returns valid stat block for damage role', () => {
    const template = makeTemplate(5n, 50n, 5n);
    const result = computeEnemyStats(template, null, []);
    const role = ENEMY_ROLE_CONFIG.damage;

    expect(result.maxHp).toBe(50n + role.baseHpBonus + role.hpBonusPerLevel * 5n);
    expect(result.attackDamage).toBe(role.baseDamage + role.damagePerLevel * 5n);
    expect(result.armorClass).toBe(5n + role.baseArmor + role.armorPerLevel * 5n);
    expect(result.attackSpeedMicros).toBe(role.attackSpeedMicros);
  });

  it('returns valid stat block for tank role', () => {
    const template = { ...makeTemplate(3n, 100n, 10n), role: 'tank' };
    const result = computeEnemyStats(template, null, []);
    const role = ENEMY_ROLE_CONFIG.tank;

    expect(result.maxHp).toBe(100n + role.baseHpBonus + role.hpBonusPerLevel * 3n);
    expect(result.attackDamage).toBe(role.baseDamage + role.damagePerLevel * 3n);
    expect(result.armorClass).toBe(10n + role.baseArmor + role.armorPerLevel * 3n);
  });

  it('stats scale with level', () => {
    const low = computeEnemyStats(makeTemplate(1n, 10n, 0n), null, []);
    const high = computeEnemyStats(makeTemplate(10n, 10n, 0n), null, []);

    expect(high.maxHp).toBeGreaterThan(low.maxHp);
    expect(high.attackDamage).toBeGreaterThan(low.attackDamage);
    expect(high.armorClass).toBeGreaterThan(low.armorClass);
  });

  it('uses roleTemplate role when provided', () => {
    const template = makeTemplate(5n, 50n, 5n); // default damage role
    const roleTemplate = { role: 'tank' };
    const result = computeEnemyStats(template, roleTemplate, []);

    // Should use tank role config, not damage
    expect(result.attackSpeedMicros).toBe(ENEMY_ROLE_CONFIG.tank.attackSpeedMicros);
  });
});

// ============================================================================
// getEnemyRole
// ============================================================================

describe('getEnemyRole', () => {
  it('returns correct config for each defined role', () => {
    for (const roleName of Object.keys(ENEMY_ROLE_CONFIG)) {
      const config = getEnemyRole(roleName);
      expect(config).toEqual(ENEMY_ROLE_CONFIG[roleName]);
    }
  });

  it('falls back to damage role for unknown roles', () => {
    expect(getEnemyRole('unknown_role')).toEqual(ENEMY_ROLE_CONFIG.damage);
  });

  it('trims and lowercases role name', () => {
    expect(getEnemyRole('  Tank  ')).toEqual(ENEMY_ROLE_CONFIG.tank);
    expect(getEnemyRole('HEALER')).toEqual(ENEMY_ROLE_CONFIG.healer);
  });
});

// ============================================================================
// getEnemyAttackSpeed
// ============================================================================

describe('getEnemyAttackSpeed', () => {
  it('returns attack speed for each role', () => {
    expect(getEnemyAttackSpeed('damage')).toBe(3_500_000n);
    expect(getEnemyAttackSpeed('tank')).toBe(5_000_000n);
    expect(getEnemyAttackSpeed('healer')).toBe(4_000_000n);
  });

  it('falls back to damage role attack speed for unknown', () => {
    expect(getEnemyAttackSpeed('unknown')).toBe(ENEMY_ROLE_CONFIG.damage.attackSpeedMicros);
  });
});

// ============================================================================
// Balance Assertions — regression guard for solo-winnable math
// ============================================================================

describe('balance assertions', () => {
  // World gen formula post-rebalance: level * 12n + 20n HP, level * 2n + 2n armor
  const makeWorldGenTemplate = (level: bigint) => ({
    level,
    maxHp: level * 12n + 20n,
    armorClass: level * 2n + 2n,
    role: 'damage',
  });

  it('level 1 damage-role enemy has HP in range 35-60', () => {
    const stats = computeEnemyStats(makeWorldGenTemplate(1n), null, []);
    expect(stats.maxHp).toBeGreaterThanOrEqual(35n);
    expect(stats.maxHp).toBeLessThanOrEqual(60n);
  });

  it('level 1 damage-role enemy attack damage is in range 5-10', () => {
    const stats = computeEnemyStats(makeWorldGenTemplate(1n), null, []);
    expect(stats.attackDamage).toBeGreaterThanOrEqual(5n);
    expect(stats.attackDamage).toBeLessThanOrEqual(10n);
  });

  it('level 1 tank-role enemy has HP in range 35-80', () => {
    const template = { ...makeWorldGenTemplate(1n), role: 'tank' };
    const stats = computeEnemyStats(template, null, []);
    expect(stats.maxHp).toBeGreaterThanOrEqual(35n);
    expect(stats.maxHp).toBeLessThanOrEqual(80n);
  });

  it('player with sword (baseDamage 6, STR 14) deals damage after enemy armor', () => {
    // Warrior STR=14, sword baseDamage=6
    const playerRaw = calculateStatScaledAutoAttack(6n, 14n);
    const enemyStats = computeEnemyStats(makeWorldGenTemplate(1n), null, []);
    const playerDamagePerHit = applyArmorMitigation(playerRaw, enemyStats.armorClass);
    // Player should deal at least 3 damage per hit (not rounded to 0 or 1)
    expect(playerDamagePerHit).toBeGreaterThanOrEqual(3n);
  });

  it('player time-to-kill enemy is under 60 seconds solo', () => {
    // Warrior STR=14, sword baseDamage=6, attack speed 3.5s
    const playerRaw = calculateStatScaledAutoAttack(6n, 14n);
    const enemyStats = computeEnemyStats(makeWorldGenTemplate(1n), null, []);
    const playerDamagePerHit = applyArmorMitigation(playerRaw, enemyStats.armorClass);
    const playerDps = (playerDamagePerHit * 1_000_000n) / 3_500_000n; // DPS scaled
    // Time to kill = enemyHp / playerDps (in seconds, scaled by 1_000_000)
    const ttk = (enemyStats.maxHp * 1_000_000n) / playerDps; // microseconds-like
    // Player should kill in under 60 seconds
    expect(ttk).toBeLessThanOrEqual(60_000_000n);
  });

  it('player survives longer than it takes them to kill enemy (player wins)', () => {
    // Player: STR=14, sword baseDamage=6, HP=162 (50 + 14*8), starter armor ~5
    const PLAYER_HP = 162n;
    const PLAYER_ARMOR = 5n;
    const playerRaw = calculateStatScaledAutoAttack(6n, 14n);
    const enemyStats = computeEnemyStats(makeWorldGenTemplate(1n), null, []);

    const playerDamagePerHit = applyArmorMitigation(playerRaw, enemyStats.armorClass);
    const enemyDamagePerHit = applyArmorMitigation(enemyStats.attackDamage, PLAYER_ARMOR);

    // Scale by attack speed (in units of 3.5s intervals)
    const playerDpsScaled = (playerDamagePerHit * 1_000_000n) / 3_500_000n;
    const enemyDpsScaled = (enemyDamagePerHit * 1_000_000n) / enemyStats.attackSpeedMicros;

    // Time to kill (in 1M units = seconds)
    const playerTtk = (enemyStats.maxHp * 1_000_000n) / playerDpsScaled;
    const enemyTtk = (PLAYER_HP * 1_000_000n) / enemyDpsScaled;

    // Player should kill enemy before dying
    expect(playerTtk).toBeLessThan(enemyTtk);
  });

  it('level 5 enemies are significantly harder than level 1 (1.5x+ HP)', () => {
    const l1 = computeEnemyStats(makeWorldGenTemplate(1n), null, []);
    const l5 = computeEnemyStats(makeWorldGenTemplate(5n), null, []);
    // Level 5 HP should be at least 1.5x level 1 HP
    expect(l5.maxHp * 10n).toBeGreaterThan(l1.maxHp * 15n);
  });

  it('level 5 enemy deals more damage than level 1 enemy', () => {
    const l1 = computeEnemyStats(makeWorldGenTemplate(1n), null, []);
    const l5 = computeEnemyStats(makeWorldGenTemplate(5n), null, []);
    expect(l5.attackDamage).toBeGreaterThan(l1.attackDamage);
  });
});
