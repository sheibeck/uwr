/**
 * combat_enemies.ts -- Enemy stat computation, role config, and armor mitigation.
 *
 * PURE REFACTOR: Extracted from combat.ts with zero behavior changes.
 */

import { GLOBAL_DAMAGE_MULTIPLIER } from '../data/combat_scaling';

export const ENEMY_ROLE_CONFIG: Record<
  string,
  { hpBonusPerLevel: bigint; damagePerLevel: bigint; baseHpBonus: bigint; baseDamage: bigint; baseArmor: bigint; armorPerLevel: bigint }
> = {
  damage: {
    hpBonusPerLevel: 8n,
    damagePerLevel: 5n,
    baseHpBonus: 20n,
    baseDamage: 12n,
    baseArmor: 3n,
    armorPerLevel: 2n,
  },
  tank: {
    hpBonusPerLevel: 15n,
    damagePerLevel: 3n,
    baseHpBonus: 60n,
    baseDamage: 8n,
    baseArmor: 14n,
    armorPerLevel: 4n,
  },
  healer: {
    hpBonusPerLevel: 12n,
    damagePerLevel: 2n,
    baseHpBonus: 45n,
    baseDamage: 6n,
    baseArmor: 6n,
    armorPerLevel: 3n,
  },
  support: {
    hpBonusPerLevel: 10n,
    damagePerLevel: 3n,
    baseHpBonus: 35n,
    baseDamage: 7n,
    baseArmor: 5n,
    armorPerLevel: 2n,
  },
};

export function getEnemyRole(role: string) {
  const key = role.trim().toLowerCase();
  return ENEMY_ROLE_CONFIG[key] ?? ENEMY_ROLE_CONFIG.damage;
}

export function scaleByPercent(value: bigint, percent: bigint) {
  return (value * percent) / 100n;
}

/**
 * Apply armor mitigation to physical damage
 * Tuned curve: 50 armor = ~33% reduction, 100 armor = ~50% reduction
 * Formula: damage * 100 / (100 + armorClass)
 * Then apply global damage multiplier
 */
export function applyArmorMitigation(damage: bigint, armorClass: bigint) {
  const armorReduced = (damage * 100n) / (100n + armorClass);
  const globalReduced = (armorReduced * GLOBAL_DAMAGE_MULTIPLIER) / 100n;
  return globalReduced > 0n ? globalReduced : 1n;
}

/**
 * Apply +-15% variance to a damage or healing value using a deterministic seed.
 * Formula: value * (85 + seed % 31) / 100  -->  range [85%, 115%] of base
 * Returns at least 1n to avoid zero-damage hits.
 */
export function applyVariance(value: bigint, seed: bigint): bigint {
  if (value <= 0n) return value;
  const roll = ((seed < 0n ? -seed : seed) % 31n);  // 0-30
  const percent = 85n + roll;  // 85-115
  const result = (value * percent) / 100n;
  return result > 0n ? result : 1n;
}

export function computeEnemyStats(
  template: any,
  roleTemplate: any | null,
  participants: any[]
) {
  const roleKey = roleTemplate?.role ?? template.role;
  const role = getEnemyRole(roleKey);
  const effectiveLevel = template.level;
  const baseHp = template.maxHp + role.baseHpBonus + role.hpBonusPerLevel * effectiveLevel;
  const baseDamage = role.baseDamage + role.damagePerLevel * effectiveLevel;
  const baseArmorClass = template.armorClass + role.baseArmor + role.armorPerLevel * effectiveLevel;

  return {
    maxHp: baseHp,
    attackDamage: baseDamage,
    armorClass: baseArmorClass,
    avgLevel: effectiveLevel,
  };
}
