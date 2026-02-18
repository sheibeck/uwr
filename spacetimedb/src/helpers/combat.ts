import { SenderError } from 'spacetimedb/server';
import { Timestamp, ScheduleAt } from 'spacetimedb';
import { getPerkProcs } from './renown';
import { RENOWN_PERK_POOLS } from '../data/renown_data';
import { normalizeClassName, computeBaseStats } from '../data/class_stats';
import {
  calculateCritChance,
  getCritMultiplier,
  getAbilityStatScaling,
  getAbilityMultiplier,
  calculateHealingPower,
  applyMagicResistMitigation,
  DOT_SCALING_RATE_MODIFIER,
  AOE_DAMAGE_MULTIPLIER,
  DEBUFF_POWER_COST_PERCENT,
  ENEMY_BASE_POWER,
  ENEMY_LEVEL_POWER_SCALING,
  GLOBAL_DAMAGE_MULTIPLIER,
  TANK_THREAT_MULTIPLIER,
  HEALER_THREAT_MULTIPLIER,
  HEALING_THREAT_PERCENT,
} from '../data/combat_scaling';
import { MAX_LEVEL, xpModifierForDiff, xpRequiredForLevel } from '../data/xp';
import { effectiveGroupId } from './group';
import { appendPrivateEvent, appendGroupEvent, logPrivateAndGroup } from './events';
import { getEquippedWeaponStats, hasInventorySpace, addItemToInventory } from './items';
import { getGatherableResourceTemplates } from './location';
import { partyMembersInLocation, recomputeCharacterDerived } from './character';
import { executeResurrect, executeCorpseSummon } from './corpse';
import { AggroEntry, EnemyTemplate, EnemyRoleTemplate, Character } from '../schema/tables';
import {
  COMBAT_LOOP_INTERVAL_MICROS,
  AUTO_ATTACK_INTERVAL,
  GROUP_SIZE_DANGER_BASE,
  GROUP_SIZE_BIAS_RANGE,
  GROUP_SIZE_BIAS_MAX,
} from '../data/combat_constants';
import { ENEMY_ABILITIES } from '../data/ability_catalog';

const GLOBAL_COOLDOWN_MICROS = 1_500_000n;

// Class sets for threat calculation
const TANK_CLASSES = new Set(['warrior', 'paladin']);
const HEALER_CLASSES = new Set(['cleric', 'shaman']);

// Helper to get active combat for character
function activeCombatIdForCharacter(ctx: any, characterId: bigint): bigint | null {
  for (const row of ctx.db.combatParticipant.by_character.filter(characterId)) {
    const combat = ctx.db.combatEncounter.id.find(row.combatId);
    if (combat && combat.state === 'active') return combat.id;
  }
  return null;
}

// Re-export constants from centralized file to maintain backwards compatibility
export {
  COMBAT_LOOP_INTERVAL_MICROS,
  AUTO_ATTACK_INTERVAL,
  GROUP_SIZE_DANGER_BASE,
  GROUP_SIZE_BIAS_RANGE,
  GROUP_SIZE_BIAS_MAX,
};

export const ENEMY_ROLE_CONFIG: Record<
  string,
  { hpPerLevel: bigint; damagePerLevel: bigint; baseHp: bigint; baseDamage: bigint; baseArmor: bigint; armorPerLevel: bigint }
> = {
  damage: {
    hpPerLevel: 10n,
    damagePerLevel: 5n,
    baseHp: 40n,
    baseDamage: 12n,
    baseArmor: 6n,
    armorPerLevel: 3n,
  },
  tank: {
    hpPerLevel: 15n,
    damagePerLevel: 3n,
    baseHp: 60n,
    baseDamage: 8n,
    baseArmor: 14n,
    armorPerLevel: 4n,
  },
  healer: {
    hpPerLevel: 8n,
    damagePerLevel: 2n,
    baseHp: 30n,
    baseDamage: 6n,
    baseArmor: 3n,
    armorPerLevel: 2n,
  },
  support: {
    hpPerLevel: 10n,
    damagePerLevel: 3n,
    baseHp: 35n,
    baseDamage: 7n,
    baseArmor: 5n,
    armorPerLevel: 2n,
  },
};
export function abilityResourceCost(level: bigint, power: bigint) {
  return 4n + level * 2n + power;
}

export function hasShieldEquipped(ctx: any, characterId: bigint) {
  for (const instance of ctx.db.itemInstance.by_owner.filter(characterId)) {
    if (instance.equippedSlot !== 'offHand') continue;
    const template = ctx.db.itemTemplate.id.find(instance.templateId);
    if (!template) continue;
    const name = template.name.toLowerCase();
    if (name.includes('shield') || template.armorType === 'shield') return true;
  }
  return false;
}

export function abilityCooldownMicros(ctx: any, abilityKey: string) {
  const rows = [...ctx.db.abilityTemplate.by_key.filter(abilityKey)];
  const ability = rows[0];
  if (!ability) return GLOBAL_COOLDOWN_MICROS;
  const specific = ability.cooldownSeconds ? ability.cooldownSeconds * 1_000_000n : 0n;
  return specific > GLOBAL_COOLDOWN_MICROS ? specific : GLOBAL_COOLDOWN_MICROS;
}

export function abilityCastMicros(ctx: any, abilityKey: string) {
  const rows = [...ctx.db.abilityTemplate.by_key.filter(abilityKey)];
  const ability = rows[0];
  if (ability?.castSeconds) return ability.castSeconds * 1_000_000n;
  return 0n;
}

export function enemyAbilityCastMicros(abilityKey: string) {
  const ability = ENEMY_ABILITIES[abilityKey as keyof typeof ENEMY_ABILITIES];
  if (ability?.castSeconds) return ability.castSeconds * 1_000_000n;
  return 0n;
}

export function enemyAbilityCooldownMicros(abilityKey: string) {
  const ability = ENEMY_ABILITIES[abilityKey as keyof typeof ENEMY_ABILITIES];
  if (ability?.cooldownSeconds) return ability.cooldownSeconds * 1_000_000n;
  return 0n;
}

export function rollAttackOutcome(
  seed: bigint,
  opts: {
    canBlock: boolean;
    canParry: boolean;
    canDodge: boolean;
    characterDex?: bigint;
    weaponName?: string;
    weaponType?: string;
  }
) {
  const roll = seed % 1000n;
  let cursor = 0n;
  if (opts.canDodge) {
    cursor += 50n;
    if (roll < cursor) return { outcome: 'dodge', multiplier: 0n };
  }
  if (opts.canParry) {
    cursor += 50n;
    if (roll < cursor) return { outcome: 'parry', multiplier: 0n };
  }
  if (opts.canBlock) {
    cursor += 50n;
    if (roll < cursor) return { outcome: 'block', multiplier: 50n };
  }
  // Critical strike check
  if (opts.characterDex !== undefined) {
    const critChance = calculateCritChance(opts.characterDex);
    if (roll < cursor + critChance) {
      const weaponType = opts.weaponType || '';
      const multiplier = getCritMultiplier(opts.weaponName ?? '', weaponType);
      return { outcome: 'crit', multiplier };
    }
  }
  return { outcome: 'hit', multiplier: 100n };
}

export function abilityDamageFromWeapon(
  weaponDamage: bigint,
  percent: bigint,
  bonus: bigint
) {
  const scaled = (weaponDamage * percent) / 100n + bonus;
  return scaled > weaponDamage ? scaled : weaponDamage + bonus;
}

export function addCharacterEffect(
  ctx: any,
  characterId: bigint,
  effectType: string,
  magnitude: bigint,
  roundsRemaining: bigint,
  sourceAbility: string
) {
  const existing = [...ctx.db.characterEffect.by_character.filter(characterId)].find(
    (effect) => effect.effectType === effectType && effect.sourceAbility === sourceAbility
  );
  if (existing) {
    ctx.db.characterEffect.id.update({
      ...existing,
      magnitude,
      roundsRemaining,
    });
    return;
  }
  ctx.db.characterEffect.insert({
    id: 0n,
    characterId,
    effectType,
    magnitude,
    roundsRemaining,
    sourceAbility,
  });
}

export function addEnemyEffect(
  ctx: any,
  combatId: bigint,
  enemyId: bigint,
  effectType: string,
  magnitude: bigint,
  roundsRemaining: bigint,
  sourceAbility: string
) {
  const existing = [...ctx.db.combatEnemyEffect.by_combat.filter(combatId)].find(
    (effect) =>
      effect.enemyId === enemyId &&
      effect.effectType === effectType &&
      effect.sourceAbility === sourceAbility
  );
  if (existing) {
    ctx.db.combatEnemyEffect.id.update({
      ...existing,
      magnitude,
      roundsRemaining,
    });
    return;
  }
  ctx.db.combatEnemyEffect.insert({
    id: 0n,
    combatId,
    enemyId,
    effectType,
    magnitude,
    roundsRemaining,
    sourceAbility,
  });
}

export function applyHpBonus(
  ctx: any,
  character: any,
  amount: bigint,
  roundsRemaining: bigint,
  sourceAbility: string
) {
  ctx.db.character.id.update({
    ...character,
    maxHp: character.maxHp + amount,
    hp: character.hp + amount,
  });
  addCharacterEffect(ctx, character.id, 'hp_bonus', amount, roundsRemaining, sourceAbility);
}

export function getTopAggroId(ctx: any, combatId: bigint, enemyId?: bigint) {
  let top: any | null = null;
  for (const entry of ctx.db.aggroEntry.by_combat.filter(combatId)) {
    if (enemyId && entry.enemyId !== enemyId) continue;
    if (entry.petId) continue;
    if (!top || entry.value > top.value) top = entry;
  }
  return top?.characterId ?? null;
}

export function sumCharacterEffect(ctx: any, characterId: bigint, effectType: string) {
  let total = 0n;
  for (const effect of ctx.db.characterEffect.by_character.filter(characterId)) {
    if (effect.effectType === effectType) total += BigInt(effect.magnitude);
  }
  return total;
}

export function sumEnemyEffect(ctx: any, combatId: bigint, effectType: string, enemyId?: bigint) {
  let total = 0n;
  for (const effect of ctx.db.combatEnemyEffect.by_combat.filter(combatId)) {
    if (enemyId && effect.enemyId !== enemyId) continue;
    if (effect.effectType === effectType) total += BigInt(effect.magnitude);
  }
  return total;
}

export function executeAbility(
  ctx: any,
  character: any,
  abilityKey: string,
  targetCharacterId?: bigint
) {
  const normalizedClass = normalizeClassName(character.className);
  const abilityRows = [...ctx.db.abilityTemplate.by_key.filter(abilityKey)];
  const ability = abilityRows[0];
  if (!ability) throw new SenderError('Unknown ability');
  if (ability.className !== normalizedClass) {
    throw new SenderError('Ability not available');
  }

  if (character.level < ability.level) throw new SenderError('Ability not unlocked');

  let staminaFree = false;
  if (ability.resource === 'stamina') {
    const free = [...ctx.db.characterEffect.by_character.filter(character.id)].find(
      (effect) => effect.effectType === 'stamina_free'
    );
    if (free) {
      staminaFree = true;
      ctx.db.characterEffect.id.delete(free.id);
    }
  }
  const resourceCost =
    ability.resource === 'stamina'
      ? staminaFree
        ? 0n
        : 3n
      : abilityResourceCost(ability.level, ability.power);
  if (ability.resource === 'mana') {
    if (character.mana < resourceCost) throw new SenderError('Not enough mana');
  } else if (ability.resource === 'stamina') {
    if (character.stamina < resourceCost) throw new SenderError('Not enough stamina');
  }

  const resolvedTargetId = targetCharacterId ?? character.id;
  const actorGroupId = effectiveGroupId(character);
  let targetCharacter: any | null = null;

  // Skip target validation for special abilities that handle targeting differently
  const specialTargetingAbilities = ['cleric_resurrect', 'necromancer_corpse_summon', 'summoner_corpse_summon'];
  if (!specialTargetingAbilities.includes(abilityKey) && resolvedTargetId) {
    targetCharacter = ctx.db.character.id.find(resolvedTargetId);
    if (!targetCharacter) throw new SenderError('Target not found');
    if (actorGroupId) {
      if (effectiveGroupId(targetCharacter) !== actorGroupId) {
        throw new SenderError('Target not in your group');
      }
      if (targetCharacter.locationId !== character.locationId) {
        throw new SenderError('Target is not at your location');
      }
    } else if (targetCharacter.id !== character.id) {
      throw new SenderError('Target must be yourself');
    }
  } else if (specialTargetingAbilities.includes(abilityKey) && resolvedTargetId) {
    // For special abilities, targetCharacterId is the target character - just verify it exists
    targetCharacter = ctx.db.character.id.find(resolvedTargetId);
    if (!targetCharacter) throw new SenderError('Target not found');
  }

  if (ability.resource === 'mana') {
    ctx.db.character.id.update({ ...character, mana: character.mana - resourceCost });
  } else if (ability.resource === 'stamina') {
    ctx.db.character.id.update({ ...character, stamina: character.stamina - resourceCost });
  }

  const combatId = activeCombatIdForCharacter(ctx, character.id);
  const combat = combatId ? ctx.db.combatEncounter.id.find(combatId) : null;
  const enemies = combatId ? [...ctx.db.combatEnemy.by_combat.filter(combatId)] : [];
  const preferredEnemy = character.combatTargetEnemyId
    ? enemies.find((row) => row.id === character.combatTargetEnemyId)
    : null;
  const enemy =
    preferredEnemy ??
    enemies.find((row) => row.currentHp > 0n) ??
    enemies[0] ??
    null;
  const enemyTemplate = enemy ? ctx.db.enemyTemplate.id.find(enemy.enemyTemplateId) : null;
  const enemyName = enemy?.displayName ?? enemyTemplate?.name ?? 'enemy';
  const weapon = getEquippedWeaponStats(ctx, character.id);
  const baseWeaponDamage = 5n + character.level + weapon.baseDamage + weapon.dps / 2n;
  const damageUp = sumCharacterEffect(ctx, character.id, 'damage_up');
  const totalDamageUp = damageUp;
  const nowMicros = ctx.timestamp.microsSinceUnixEpoch;

  const summonPet = (
    petLabel: string,
    petDescription: string,
    namePool: string[],
    ability?: { key: string; cooldownSeconds: bigint },
    stats?: {
      hpBase?: bigint;
      hpPerLevel?: bigint;
      damageBase?: bigint;
      damagePerLevel?: bigint;
      weaponScalePercent?: bigint;
    }
  ) => {
    if (!combatId || !combat || combat.state !== 'active') {
      throw new SenderError('Pets can only be summoned in combat');
    }
    if (!enemy) throw new SenderError('No enemy in combat');
    for (const existing of ctx.db.combatPet.by_combat.filter(combatId)) {
      if (existing.ownerCharacterId === character.id) {
        ctx.db.combatPet.id.delete(existing.id);
      }
    }
    const pickIndex = Number((nowMicros + character.id * 7n) % BigInt(namePool.length));
    const petName = namePool[pickIndex] ?? 'Echo';
    const displayName = `${petName} (${petLabel})`;
    // Pets inherit caster level so their baseline scales with the encounter tier.
    const petLevel = character.level > 0n ? character.level : 1n;
    const hpBase = stats?.hpBase ?? 16n;
    const hpPerLevel = stats?.hpPerLevel ?? 5n;
    const damageBase = stats?.damageBase ?? 3n;
    const damagePerLevel = stats?.damagePerLevel ?? 2n;
    const weaponScalePercent = stats?.weaponScalePercent ?? 50n;
    const weaponProxy = (weapon.baseDamage * weaponScalePercent) / 100n;
    const petMaxHp = hpBase + petLevel * hpPerLevel;
    const petAttackDamage = damageBase + petLevel * damagePerLevel + weaponProxy;
    const pet = ctx.db.combatPet.insert({
      id: 0n,
      combatId,
      ownerCharacterId: character.id,
      name: displayName,
      level: petLevel,
      currentHp: petMaxHp,
      maxHp: petMaxHp,
      attackDamage: petAttackDamage,
      abilityKey: ability?.key,
      abilityCooldownSeconds: ability?.cooldownSeconds,
      // Allow pets to attempt their ability immediately on summon.
      nextAbilityAt: ability ? nowMicros : undefined,
      targetEnemyId: enemy.id,
      nextAutoAttackAt: nowMicros + AUTO_ATTACK_INTERVAL,
    });
    appendPrivateEvent(
      ctx,
      character.id,
      character.ownerUserId,
      'ability',
      `You have summoned ${petDescription}.`
    );
    if (actorGroupId) {
      appendGroupEvent(
        ctx,
        actorGroupId,
        character.id,
        'ability',
        `${character.name} has summoned ${petDescription}.`
      );
    }
  };

  const logGroup = (kind: string, message: string) => {
    if (!actorGroupId) return;
    appendGroupEvent(ctx, actorGroupId, character.id, kind, message);
  };
  const applyDamage = (
    percent: bigint,
    bonus: bigint,
    options?: {
      hits?: bigint;
      ignoreArmor?: bigint;
      threatBonus?: bigint;
      debuff?: { type: string; magnitude: bigint; rounds: bigint; source: string };
      dot?: { magnitude: bigint; rounds: bigint; source: string };
      message?: string;
      perHitMessage?: (damage: bigint, hitIndex: bigint, totalHits: bigint) => string;
    }
  ) => {
    if (!enemy || !combatId) throw new SenderError('No enemy in combat');
    const hits = options?.hits ?? 1n;
    let armor = enemy.armorClass;
    const armorDebuff = sumEnemyEffect(ctx, combatId, 'armor_down', enemy.id);
    if (armorDebuff !== 0n) {
      armor = armor + armorDebuff;
      if (armor < 0n) armor = 0n;
    }
    if (options?.ignoreArmor) {
      armor = armor > options.ignoreArmor ? armor - options.ignoreArmor : 0n;
    }
    // Get ability info for stat scaling
    const statScaling = getAbilityStatScaling(
      { str: character.str, dex: character.dex, cha: character.cha, wis: character.wis, int: character.int },
      abilityKey,
      character.className,
      ability.statScaling ?? 'none'
    );
    const abilityMultiplier = ability
      ? getAbilityMultiplier(ability.castSeconds, ability.cooldownSeconds)
      : 100n;

    // Hybrid formula: (base + stat_scaling) * ability_multiplier / 100
    const abilityBaseDamage = ability ? (ability.power ?? 0n) * 5n : 0n;
    const scaledAbilityDamage = ((abilityBaseDamage + statScaling) * abilityMultiplier) / 100n;

    // Power budget split for DoT abilities
    const directPowerFraction = ability?.dotPowerSplit ? 1.0 - ability.dotPowerSplit : 1.0;

    // Apply power budget split to scaled ability damage
    const directAbilityDamage = (scaledAbilityDamage * BigInt(Math.floor(directPowerFraction * 100))) / 100n;

    // If ability has DoT, calculate DoT damage with reduced stat scaling
    let dotDamagePerTick = 0n;
    let dotDuration = 0n;
    if (ability?.dotPowerSplit && ability?.dotDuration) {
      const dotPowerFraction = ability.dotPowerSplit;
      const dotTotalDamage = (scaledAbilityDamage * BigInt(Math.floor(dotPowerFraction * 100))) / 100n;

      // DoT stat scaling uses REDUCED rate (50% of direct scaling)
      const dotStatScaling = (statScaling * DOT_SCALING_RATE_MODIFIER) / 100n;

      // DoT damage per tick = (total DoT power + reduced stat scaling) / duration
      dotDamagePerTick = ((dotTotalDamage + dotStatScaling) / ability.dotDuration);
      dotDuration = ability.dotDuration;
    }

    // If ability has debuff, reduce direct damage by debuff power cost
    let finalDirectDamage = directAbilityDamage;
    if (ability?.debuffType && ability?.debuffMagnitude && ability?.debuffDuration) {
      const debuffCostFraction = 1.0 - (Number(DEBUFF_POWER_COST_PERCENT) / 100);
      finalDirectDamage = (directAbilityDamage * BigInt(Math.floor(debuffCostFraction * 100))) / 100n;
    }

    // Weapon component (for weapon abilities that use percent > 0)
    const weaponComponent = percent > 0n ? abilityDamageFromWeapon(baseWeaponDamage, percent, bonus) : 0n;

    // AoE target enumeration and damage reduction
    if (ability?.aoeTargets === 'all_enemies') {
      const aoeMultiplier = Number(AOE_DAMAGE_MULTIPLIER) / 100;  // 65% = 0.65
      const enemies = [...ctx.db.combatEnemy.by_combat.filter(combatId)];

      for (const targetEnemy of enemies) {
        if (targetEnemy.currentHp === 0n) continue;  // Skip dead enemies

        // Apply AoE damage reduction to final direct damage
        const aoeDamage = (finalDirectDamage * BigInt(Math.floor(aoeMultiplier * 100))) / 100n;

        // Get target's armor for mitigation
        let targetArmor = targetEnemy.armorClass;
        const armorDebuff = sumEnemyEffect(ctx, combatId, 'armor_down', targetEnemy.id);
        if (armorDebuff !== 0n) {
          targetArmor = targetArmor + armorDebuff;
          if (targetArmor < 0n) targetArmor = 0n;
        }

        // Route mitigation by damage type
        const dmgType = ability?.damageType ?? 'physical';
        let mitigatedDamage: bigint;
        if (dmgType === 'magic') {
          mitigatedDamage = aoeDamage > 0n ? aoeDamage : 1n;
        } else {
          mitigatedDamage = applyArmorMitigation(aoeDamage, targetArmor);
        }

        // Apply damage to target
        const nextHp = targetEnemy.currentHp > mitigatedDamage ? targetEnemy.currentHp - mitigatedDamage : 0n;
        ctx.db.combatEnemy.id.update({ ...targetEnemy, currentHp: nextHp });

        // Update aggro for this target
        for (const entry of ctx.db.aggroEntry.by_combat.filter(combatId)) {
          if (entry.characterId === character.id && entry.enemyId === targetEnemy.id) {
            const className = character.className?.toLowerCase() ?? '';
            const threatMult = TANK_CLASSES.has(className) ? TANK_THREAT_MULTIPLIER
              : HEALER_CLASSES.has(className) ? HEALER_THREAT_MULTIPLIER : 100n;
            const threat = (mitigatedDamage * threatMult) / 100n;
            ctx.db.aggroEntry.id.update({
              ...entry,
              value: entry.value + threat,
            });
            break;
          }
        }

        // Apply DoT to all AoE targets (DoT not further reduced per user decision: "Single tax")
        if (dotDamagePerTick > 0n && dotDuration > 0n && ability?.name) {
          addEnemyEffect(
            ctx,
            combatId,
            targetEnemy.id,
            'dot',
            dotDamagePerTick,
            dotDuration,
            ability.name
          );
        }

        // Log damage for each target
        const targetEnemyTemplate = ctx.db.enemyTemplate.id.find(targetEnemy.enemyTemplateId);
        const targetName = targetEnemy.displayName ?? targetEnemyTemplate?.name ?? 'enemy';
        appendPrivateEvent(
          ctx,
          character.id,
          character.ownerUserId,
          'damage',
          `Your ${ability.name} hits ${targetName} for ${mitigatedDamage} damage.`
        );
        if (actorGroupId) {
          appendGroupEvent(
            ctx,
            actorGroupId,
            character.id,
            'damage',
            `${character.name}'s ${ability.name} hits ${targetName} for ${mitigatedDamage} damage.`
          );
        }
      }

      // AoE abilities skip single-target damage application (already processed all targets above)
      return 0n;  // Return early from applyDamage function
    }

    let totalDamage = 0n;
    const hitDamages: bigint[] = [];
    for (let i = 0n; i < hits; i += 1n) {
      // Total raw damage
      const raw = weaponComponent + finalDirectDamage + totalDamageUp + sumEnemyEffect(ctx, combatId, 'damage_taken', enemy.id);

      // Route mitigation by damage type
      const dmgType = ability?.damageType ?? 'physical';
      let reduced: bigint;
      if (dmgType === 'magic') {
        // Magic damage bypasses armor entirely (makes magic impactful)
        reduced = raw > 0n ? raw : 1n;
      } else {
        // Physical damage uses armor mitigation
        reduced = applyArmorMitigation(raw, armor);
      }
      hitDamages.push(reduced);
      totalDamage += reduced;
    }
    const nextHp = enemy.currentHp > totalDamage ? enemy.currentHp - totalDamage : 0n;
    ctx.db.combatEnemy.id.update({ ...enemy, currentHp: nextHp });
    for (const entry of ctx.db.aggroEntry.by_combat.filter(combatId)) {
      if (entry.characterId === character.id && entry.enemyId === enemy.id) {
        const className = character.className?.toLowerCase() ?? '';
        const threatMult = TANK_CLASSES.has(className) ? TANK_THREAT_MULTIPLIER
          : HEALER_CLASSES.has(className) ? HEALER_THREAT_MULTIPLIER : 100n;
        const threat = (totalDamage * threatMult) / 100n + (options?.threatBonus ?? 0n);
        ctx.db.aggroEntry.id.update({
          ...entry,
          value: entry.value + threat,
        });
        break;
      }
    }
    if (options?.debuff) {
      addEnemyEffect(
        ctx,
        combatId,
        enemy.id,
        options.debuff.type,
        options.debuff.magnitude,
        options.debuff.rounds,
        options.debuff.source
      );
    }
    if (options?.dot) {
      addEnemyEffect(
        ctx,
        combatId,
        enemy.id,
        'dot',
        options.dot.magnitude,
        options.dot.rounds,
        options.dot.source
      );
    }

    // Apply DoT effect if ability has DoT metadata
    if (dotDamagePerTick > 0n && dotDuration > 0n && ability?.name) {
      addEnemyEffect(
        ctx,
        combatId,
        enemy.id,
        'dot',
        dotDamagePerTick,
        dotDuration,
        ability.name
      );
    }

    // Apply debuff effect if ability has debuff metadata
    if (ability?.debuffType && ability?.debuffMagnitude && ability?.debuffDuration) {
      addEnemyEffect(
        ctx,
        combatId,
        enemy.id,
        ability.debuffType,
        ability.debuffMagnitude,
        ability.debuffDuration,
        ability.name
      );
    }

    if (options?.perHitMessage) {
      for (let i = 0; i < hitDamages.length; i += 1) {
        const hitIndex = BigInt(i + 1);
        const privateMessage = options.perHitMessage(hitDamages[i], hitIndex, hits);
        appendPrivateEvent(ctx, character.id, character.ownerUserId, 'damage', privateMessage);
        // For group, replace "Your" with character name (simple text replacement for per-hit messages)
        const groupMessage = privateMessage.replace(/^Your /, `${character.name}'s `).replace(/ your /, ` ${character.name}'s `);
        logGroup('damage', groupMessage);
      }
    } else {
      const privateMessage =
        options?.message ?? `Your ${ability.name} hits ${enemyName} for ${totalDamage} damage.`;
      const groupMessage = `${character.name}'s ${ability.name} hits ${enemyName} for ${totalDamage} damage.`;
      appendPrivateEvent(ctx, character.id, character.ownerUserId, 'damage', privateMessage);
      logGroup('damage', groupMessage);
    }
    return totalDamage;
  };

  const partyMembers = partyMembersInLocation(ctx, character);
  const applyHeal = (target: any, amount: bigint, source: string) => {
    const current = ctx.db.character.id.find(target.id);
    if (!current) return;

    // Power budget split for HoT abilities
    const directHealFraction = ability?.hotPowerSplit ? 1.0 - ability.hotPowerSplit : 1.0;
    const directHeal = (amount * BigInt(Math.floor(directHealFraction * 100))) / 100n;

    // If ability has HoT, calculate HoT healing with reduced stat scaling
    if (ability?.hotPowerSplit && ability?.hotDuration && ability?.name) {
      const hotPowerFraction = ability.hotPowerSplit;
      const hotTotalHealing = (amount * BigInt(Math.floor(hotPowerFraction * 100))) / 100n;

      // HoT stat scaling uses REDUCED rate (50% of direct healing scaling)
      // Note: WIS scaling already applied via calculateHealingPower, so we split the final scaled amount
      const scaledHotTotal = calculateHealingPower(hotTotalHealing, character.wis, character.className);
      const hotHealPerTick = scaledHotTotal / ability.hotDuration;

      // Apply HoT effect to target
      addCharacterEffect(ctx, target.id, 'regen', hotHealPerTick, ability.hotDuration, ability.name);
    }

    // Apply WIS scaling to healing output (uses the CASTER's WIS, not target's)
    // Use directHeal for immediate healing (replace 'amount' with 'directHeal')
    const scaledAmount = calculateHealingPower(directHeal, character.wis, character.className);
    const nextHp = current.hp + scaledAmount > current.maxHp ? current.maxHp : current.hp + scaledAmount;
    ctx.db.character.id.update({ ...current, hp: nextHp });
    const message = `${source} restores ${scaledAmount} health to ${current.name}.`;
    appendPrivateEvent(ctx, current.id, current.ownerUserId, 'heal', message);
    if (current.id !== character.id) {
      appendPrivateEvent(ctx, character.id, character.ownerUserId, 'heal', message);
    }
    logGroup('heal', message);

    // Healing generates threat: 50% of healing done, split across all enemies
    if (combatId) {
      const healingThreat = (scaledAmount * HEALING_THREAT_PERCENT) / 100n;
      if (healingThreat > 0n) {
        const enemiesInCombat = [...ctx.db.combatEnemy.by_combat.filter(combatId)]
          .filter((e: any) => e.currentHp > 0n);
        if (enemiesInCombat.length > 0) {
          const threatPerEnemy = healingThreat / BigInt(enemiesInCombat.length);
          if (threatPerEnemy > 0n) {
            for (const en of enemiesInCombat) {
              for (const entry of ctx.db.aggroEntry.by_combat.filter(combatId)) {
                if (entry.characterId === character.id && entry.enemyId === en.id) {
                  ctx.db.aggroEntry.id.update({ ...entry, value: entry.value + threatPerEnemy });
                  break;
                }
              }
            }
          }
        }
      }
    }
  };
  const applyMana = (target: any, amount: bigint, source: string) => {
    const current = ctx.db.character.id.find(target.id);
    if (!current || current.maxMana === 0n) return;
    const nextMana = current.mana + amount > current.maxMana ? current.maxMana : current.mana + amount;
    ctx.db.character.id.update({ ...current, mana: nextMana });
    const message = `${source} restores ${amount} mana to ${current.name}.`;
    appendPrivateEvent(ctx, current.id, current.ownerUserId, 'ability', message);
    if (current.id !== character.id) {
      appendPrivateEvent(ctx, character.id, character.ownerUserId, 'ability', message);
    }
    logGroup('ability', message);
  };
  const applyPartyEffect = (
    effectType: string,
    magnitude: bigint,
    rounds: bigint,
    source: string
  ) => {
    for (const member of partyMembers) {
      addCharacterEffect(ctx, member.id, effectType, magnitude, rounds, source);
    }
  };
  const applyPartyHpBonus = (amount: bigint, rounds: bigint, source: string) => {
    for (const member of partyMembers) {
      applyHpBonus(ctx, member, amount, rounds, source);
    }
  };

  switch (abilityKey) {
    case 'shaman_spirit_mender':
      if (!targetCharacter) throw new SenderError('Target required');
      applyHeal(targetCharacter, 12n, 'Spirit Mender');
      addCharacterEffect(ctx, targetCharacter.id, 'regen', 5n, 2n, 'Spirit Mender');
      appendPrivateEvent(
        ctx,
        character.id,
        character.ownerUserId,
        'ability',
        `Spirit Mender soothes ${targetCharacter.name}.`
      );
      return;
    case 'shaman_spirit_wolf':
      summonPet('Spirit Wolf', 'a spirit wolf', [
        'Mistfang',
        'Ghostpaw',
        'Duskhowl',
        'Frostpad',
        'Silent',
      ], undefined, { damageBase: 4n, damagePerLevel: 2n, weaponScalePercent: 45n });
      return;
    case 'shaman_hex':
      applyDamage(0n, 0n, {
        debuff: { type: 'damage_down', magnitude: -2n, rounds: 3n, source: 'Hex' },
      });
      return;
    case 'shaman_ancestral_ward':
      if (!targetCharacter) throw new SenderError('Target required');
      addCharacterEffect(ctx, targetCharacter.id, 'ac_bonus', 2n, 3n, 'Ancestral Ward');
      appendPrivateEvent(
        ctx,
        character.id,
        character.ownerUserId,
        'ability',
        `Ancestral Ward shields ${targetCharacter.name}.`
      );
      return;
    case 'shaman_stormcall':
      applyDamage(0n, 0n);
      return;
    case 'warrior_slam':
      applyDamage(0n, 0n, {
        threatBonus: 10n,
        debuff: { type: 'skip', magnitude: 1n, rounds: 1n, source: 'Slam' },
      });
      return;
    case 'warrior_intimidating_presence':
      if (!enemy || !combatId) throw new SenderError('No enemy target');
      addEnemyEffect(ctx, combatId, enemy.id, 'damage_down', -3n, 3n, 'Intimidating Presence');
      appendPrivateEvent(
        ctx,
        character.id,
        character.ownerUserId,
        'ability',
        `You intimidate ${enemyName}, sapping its strength.`
      );
      return;
    case 'warrior_cleave':
      applyDamage(0n, 0n);
      return;
    case 'warrior_rally':
      applyPartyEffect('ac_bonus', 3n, 3n, 'Rally');
      appendPrivateEvent(
        ctx,
        character.id,
        character.ownerUserId,
        'ability',
        'Your Rally fortifies the party.'
      );
      return;
    case 'warrior_crushing_blow':
      applyDamage(0n, 0n, { threatBonus: 5n });
      return;
    case 'bard_discordant_note':
      applyDamage(0n, 0n);
      applyPartyEffect('damage_up', 1n, 2n, 'Discordant Note');
      appendPrivateEvent(
        ctx,
        character.id,
        character.ownerUserId,
        'ability',
        'Discordant Note that deals damage and sharpens the party.'
      );
      return;
    case 'bard_ballad_of_resolve':
      for (const member of partyMembers) {
        addCharacterEffect(ctx, member.id, 'str_bonus', 1n, 60n, 'Ballad of Resolve');
        recomputeCharacterDerived(ctx, member);
      }
      appendPrivateEvent(
        ctx,
        character.id,
        character.ownerUserId,
        'ability',
        'Ballad of Resolve strengthens the party.'
      );
      return;
    case 'bard_echoed_chord': {
      const allyBonus = BigInt(partyMembers.length - 1) > 0n ? BigInt(partyMembers.length - 1) : 0n;
      applyDamage(0n, 0n);
      return;
    }
    case 'bard_harmony':
      applyPartyEffect('damage_up', 2n, 3n, 'Harmony');
      appendPrivateEvent(
        ctx,
        character.id,
        character.ownerUserId,
        'ability',
        'Harmony steadies the party.'
      );
      return;
    case 'bard_crushing_crescendo': {
      let bonus = 5n;
      if (enemy && enemy.currentHp * 2n <= enemy.maxHp) bonus += 3n;
      applyDamage(0n, 0n);
      return;
    }
    case 'enchanter_mind_fray':
      applyDamage(0n, 0n, {
        dot: { magnitude: 2n, rounds: 2n, source: 'Mind Fray' },
        debuff: { type: 'damage_down', magnitude: -2n, rounds: 2n, source: 'Mind Fray' },
      });
      return;
    case 'enchanter_veil_of_calm':
      addCharacterEffect(ctx, character.id, 'pull_veil', 1n, 12n, 'Veil of Calm');
      appendPrivateEvent(
        ctx,
        character.id,
        character.ownerUserId,
        'ability',
        'Veil of Calm settles your presence for the next pull.'
      );
      return;
    case 'enchanter_slow':
      applyDamage(0n, 0n, {
        debuff: { type: 'damage_down', magnitude: -3n, rounds: 2n, source: 'Slow' },
      });
      return;
    case 'enchanter_clarity_ii':
      if (!targetCharacter) throw new SenderError('Target required');
      addCharacterEffect(ctx, targetCharacter.id, 'mana_regen', 6n, 3n, 'Clarity II');
      appendPrivateEvent(
        ctx,
        character.id,
        character.ownerUserId,
        'ability',
        `Clarity II restores ${targetCharacter.name}'s mana.`
      );
      return;
    case 'enchanter_charm_fray':
      applyDamage(0n, 0n, {
        debuff: { type: 'damage_down', magnitude: -2n, rounds: 2n, source: 'Charm Fray' },
      });
      return;
    case 'cleric_mend':
      if (!targetCharacter) throw new SenderError('Target required');
      applyHeal(targetCharacter, 18n, 'Mend');
      return;
    case 'cleric_sanctify': {
      if (!targetCharacter) throw new SenderError('Target required');
      const effects = [...ctx.db.characterEffect.by_character.filter(targetCharacter.id)];
      const negative = effects.find(
        (effect) => effect.effectType === 'dot' || effect.magnitude < 0n
      );
      if (negative) {
        ctx.db.characterEffect.id.delete(negative.id);
        appendPrivateEvent(
          ctx,
          character.id,
          character.ownerUserId,
          'ability',
          `Sanctify cleanses ${targetCharacter.name}.`
        );
      } else {
        appendPrivateEvent(
          ctx,
          character.id,
          character.ownerUserId,
          'ability',
          `${targetCharacter.name} has no harmful effects to cleanse.`
        );
      }
      return;
    }
    case 'cleric_smite':
      applyDamage(0n, 0n);
      return;
    case 'cleric_sanctuary':
      applyPartyEffect('ac_bonus', 3n, 3n, 'Sanctuary');
      appendPrivateEvent(
        ctx,
        character.id,
        character.ownerUserId,
        'ability',
        'Sanctuary shelters the party.'
      );
      return;
    case 'cleric_heal':
      if (!targetCharacter) throw new SenderError('Target required');
      applyHeal(targetCharacter, 15n, 'Heal');
      return;
    case 'cleric_resurrect':
      // targetCharacter is the dead character (from CharacterCast.targetCharacterId)
      if (!targetCharacter) {
        appendPrivateEvent(
          ctx,
          character.id,
          character.ownerUserId,
          'error',
          'Resurrection failed - target not found.'
        );
        return;
      }

      // Find the corpse for this character at the caster's location
      const resurrectCorpses = [...ctx.db.corpse.by_character.filter(targetCharacter.id)];
      const resurrectCorpse = resurrectCorpses.find(c => c.locationId === character.locationId);
      if (!resurrectCorpse) {
        appendPrivateEvent(
          ctx,
          character.id,
          character.ownerUserId,
          'error',
          `Resurrection failed - no corpse found for ${targetCharacter.name} at this location.`
        );
        return;
      }

      // Execute the resurrection
      executeResurrect(ctx, character, targetCharacter, resurrectCorpse);
      return;

    case 'necromancer_corpse_summon':
    case 'summoner_corpse_summon':
      // targetCharacter is the character whose corpses we're summoning (from CharacterCast.targetCharacterId)
      if (!targetCharacter) {
        appendPrivateEvent(
          ctx,
          character.id,
          character.ownerUserId,
          'error',
          'Corpse summon failed - target not found.'
        );
        return;
      }

      // Execute the corpse summon
      executeCorpseSummon(ctx, character, targetCharacter);
      return;
    case 'wizard_magic_missile':
      applyDamage(0n, 0n);
      return;
    case 'wizard_arcane_reservoir': {
      const amount =
        character.maxMana > 0n ? (character.maxMana / 4n > 10n ? character.maxMana / 4n : 10n) : 0n;
      if (amount > 0n) {
        applyMana(character, amount, 'Arcane Reservoir');
      }
      return;
    }
    case 'wizard_frost_shard':
      applyDamage(0n, 0n, {
        debuff: { type: 'damage_down', magnitude: -2n, rounds: 2n, source: 'Frost Shard' },
      });
      return;
    case 'wizard_mana_shield':
      if (!targetCharacter) throw new SenderError('Target required');
      addCharacterEffect(ctx, targetCharacter.id, 'ac_bonus', 3n, 3n, 'Mana Shield');
      appendPrivateEvent(
        ctx,
        character.id,
        character.ownerUserId,
        'ability',
        `Mana Shield protects ${targetCharacter.name}.`
      );
      return;
    case 'wizard_lightning_surge':
      applyDamage(0n, 0n);
      return;
    case 'rogue_shadow_cut':
      applyDamage(0n, 0n, { dot: { magnitude: 2n, rounds: 2n, source: 'Shadow Cut' } });
      return;
    case 'rogue_pickpocket': {
      const seed = ctx.timestamp.microsSinceUnixEpoch + character.id;
      const roll = Number(seed % 100n);
      const targetLabel = enemy ? enemyName : 'your mark';
      if (roll < 60) {
        const gold = 2n + (seed % 5n);
        ctx.db.character.id.update({ ...character, gold: (character.gold ?? 0n) + gold });
        appendPrivateEvent(
          ctx,
          character.id,
          character.ownerUserId,
          'ability',
          `You pickpocket ${gold} gold from ${targetLabel}.`
        );
        return;
      }
      const junk = [...ctx.db.itemTemplate.iter()].filter((row) => row.isJunk);
      if (junk.length === 0) {
        appendPrivateEvent(
          ctx,
          character.id,
          character.ownerUserId,
          'ability',
          'You find nothing of value.'
        );
        return;
      }
      const template = junk[Number(seed % BigInt(junk.length))];
      if (!hasInventorySpace(ctx, character.id, template.id)) {
        appendPrivateEvent(
          ctx,
          character.id,
          character.ownerUserId,
          'ability',
          'Your pack is full.'
        );
        return;
      }
      addItemToInventory(ctx, character.id, template.id, 1n);
      appendPrivateEvent(
        ctx,
        character.id,
        character.ownerUserId,
        'ability',
        `You lift a ${template.name} from ${targetLabel}.`
      );
      return;
    }
    case 'rogue_bleed':
      applyDamage(0n, 0n, { dot: { magnitude: 3n, rounds: 2n, source: 'Bleed' } });
      return;
    case 'rogue_evasion':
      addCharacterEffect(ctx, character.id, 'ac_bonus', 3n, 2n, 'Evasion');
      appendPrivateEvent(
        ctx,
        character.id,
        character.ownerUserId,
        'ability',
        'Evasion heightens your defenses.'
      );
      return;
    case 'rogue_shadow_strike': {
      const dotAmount = enemy ? sumEnemyEffect(ctx, combatId ?? 0n, 'dot', enemy.id) : 0n;
      const bonus = dotAmount > 0n ? 6n : 4n;
      applyDamage(0n, 0n);
      return;
    }
    case 'paladin_holy_strike':
      applyDamage(0n, 0n);
      addCharacterEffect(ctx, character.id, 'ac_bonus', 2n, 2n, 'Holy Strike');
      appendPrivateEvent(
        ctx,
        character.id,
        character.ownerUserId,
        'ability',
        'Holy Strike steadies your guard.'
      );
      return;
    case 'paladin_lay_on_hands': {
      const target = targetCharacter ?? character;
      const missing = target.maxHp > target.hp ? BigInt(target.maxHp) - BigInt(target.hp) : 0n;
      if (missing > 0n) applyHeal(target, missing, 'Lay on Hands');
      appendPrivateEvent(
        ctx,
        character.id,
        character.ownerUserId,
        'ability',
        `Lay on Hands restores ${target.name}.`
      );
      return;
    }
    case 'paladin_shield_of_faith':
      if (!targetCharacter) throw new SenderError('Target required');
      addCharacterEffect(ctx, targetCharacter.id, 'ac_bonus', 3n, 3n, 'Shield of Faith');
      appendPrivateEvent(
        ctx,
        character.id,
        character.ownerUserId,
        'ability',
        `Shield of Faith protects ${targetCharacter.name}.`
      );
      return;
    case 'paladin_devotion':
      applyPartyEffect('damage_up', 3n, 3n, 'Devotion');
      appendPrivateEvent(
        ctx,
        character.id,
        character.ownerUserId,
        'ability',
        'Devotion inspires the party.'
      );
      return;
    case 'paladin_radiant_smite':
      applyDamage(0n, 0n, { dot: { magnitude: 2n, rounds: 2n, source: 'Radiant Smite' } });
      return;
    case 'ranger_marked_shot':
      applyDamage(0n, 0n, {
        debuff: { type: 'damage_taken', magnitude: 1n, rounds: 2n, source: 'Marked Shot' },
      });
      return;
    case 'ranger_track': {
      // Get all enemy spawns at the character's location
      const spawns = [...ctx.db.enemySpawn.by_location.filter(character.locationId)];

      if (spawns.length === 0) {
        appendPrivateEvent(
          ctx,
          character.id,
          character.ownerUserId,
          'ability',
          'You find no tracks worth following.'
        );
        return;
      }

      // Reveal information about each enemy spawn
      let trackedCount = 0;
      for (const spawn of spawns) {
        const template = ctx.db.enemyTemplate.id.find(spawn.enemyTemplateId);
        if (!template) continue;

        appendPrivateEvent(
          ctx,
          character.id,
          character.ownerUserId,
          'ability',
          `Tracks reveal: ${template.name} (Level ${template.level})`
        );
        trackedCount += 1;
      }

      if (trackedCount === 0) {
        appendPrivateEvent(
          ctx,
          character.id,
          character.ownerUserId,
          'ability',
          'You find no tracks worth following.'
        );
      } else {
        // Add tracking buff effect (cosmetic indicator that ability worked)
        addCharacterEffect(ctx, character.id, 'tracking', 1n, 6n, 'Track');
      }

      return;
    }
    case 'ranger_rapid_shot':
      applyDamage(0n, 0n, { hits: 2n });
      return;
    case 'ranger_natures_balm':
      if (!targetCharacter) throw new SenderError('Target required');
      addCharacterEffect(ctx, targetCharacter.id, 'regen', 7n, 3n, "Nature's Balm");
      appendPrivateEvent(
        ctx,
        character.id,
        character.ownerUserId,
        'ability',
        `Nature's Balm mends ${targetCharacter.name}.`
      );
      return;
    case 'ranger_piercing_arrow':
      applyDamage(0n, 0n, { ignoreArmor: 5n });
      return;
    case 'necromancer_plague_spark':
      applyDamage(0n, 0n, { dot: { magnitude: 3n, rounds: 2n, source: 'Plague Spark' } });
      applyHeal(character, 4n, 'Plague Spark');
      return;
    case 'necromancer_bone_servant':
      summonPet('Skeleton', 'a skeleton', [
        'Rattle',
        'Grin',
        'Shard',
        'Grave',
        'Morrow',
      ], undefined, { damageBase: 4n, damagePerLevel: 2n, weaponScalePercent: 45n });
      return;
    case 'necromancer_wither':
      applyDamage(0n, 0n, { dot: { magnitude: 3n, rounds: 2n, source: 'Wither' } });
      return;
    case 'necromancer_bone_ward':
      addCharacterEffect(ctx, character.id, 'ac_bonus', 3n, 3n, 'Bone Ward');
      appendPrivateEvent(
        ctx,
        character.id,
        character.ownerUserId,
        'ability',
        'Bone Ward hardens your defenses.'
      );
      return;
    case 'necromancer_grave_surge':
      applyDamage(0n, 0n);
      return;
    case 'spellblade_arcane_slash':
      applyDamage(0n, 0n, {
        debuff: { type: 'armor_down', magnitude: -2n, rounds: 2n, source: 'Arcane Slash' },
      });
      return;
    case 'spellblade_rune_ward':
      addCharacterEffect(ctx, character.id, 'damage_shield', 10n, 6n, 'Rune Ward');
      appendPrivateEvent(
        ctx,
        character.id,
        character.ownerUserId,
        'ability',
        'Rune Ward wraps you in protective sigils.'
      );
      return;
    case 'spellblade_runic_strike':
      applyDamage(0n, 0n, {
        debuff: { type: 'damage_down', magnitude: -2n, rounds: 2n, source: 'Runic Strike' },
      });
      return;
    case 'spellblade_ward':
      addCharacterEffect(ctx, character.id, 'ac_bonus', 3n, 3n, 'Ward');
      appendPrivateEvent(
        ctx,
        character.id,
        character.ownerUserId,
        'ability',
        'Ward surrounds you in arcane protection.'
      );
      return;
    case 'spellblade_spellstorm':
      applyDamage(0n, 0n, { hits: 3n });
      return;
    case 'beastmaster_pack_rush':
      applyDamage(0n, 0n, {
        hits: 2n,
        perHitMessage: (damage, hitIndex, totalHits) =>
          `Your ${ability.name} hits ${enemyName} for ${damage} damage. (${hitIndex}/${totalHits})`,
      });
      return;
    case 'beastmaster_call_beast':
      summonPet(
        'Beast',
        'a wild beast',
        ['Brindle', 'Moss', 'Cinder', 'Tawny', 'Thorn'],
        { key: 'pet_bleed', cooldownSeconds: 10n },
        { damageBase: 3n, damagePerLevel: 1n, weaponScalePercent: 35n }
      );
      return;
    case 'beastmaster_beast_fang':
      applyDamage(0n, 0n, { dot: { magnitude: 2n, rounds: 2n, source: 'Beast Fang' } });
      return;
    case 'beastmaster_wild_howl':
      applyPartyEffect('damage_up', 3n, 3n, 'Wild Howl');
      appendPrivateEvent(
        ctx,
        character.id,
        character.ownerUserId,
        'ability',
        'Wild Howl emboldens the party.'
      );
      return;
    case 'beastmaster_alpha_assault':
      applyDamage(0n, 0n);
      return;
    case 'monk_crippling_kick':
      applyDamage(0n, 0n, {
        debuff: { type: 'damage_down', magnitude: -2n, rounds: 2n, source: 'Crippling Kick' },
      });
      return;
    case 'monk_centering':
      addCharacterEffect(ctx, character.id, 'stamina_free', 1n, 2n, 'Centering');
      appendPrivateEvent(
        ctx,
        character.id,
        character.ownerUserId,
        'ability',
        'You center yourself for a cost-free strike.'
      );
      return;
    case 'monk_palm_strike':
      applyDamage(0n, 0n);
      return;
    case 'monk_inner_focus':
      addCharacterEffect(ctx, character.id, 'ac_bonus', 3n, 3n, 'Inner Focus');
      appendPrivateEvent(
        ctx,
        character.id,
        character.ownerUserId,
        'ability',
        'Inner Focus hardens your guard.'
      );
      return;
    case 'monk_tiger_flurry':
      applyDamage(0n, 0n, { hits: 3n });
      return;
    case 'druid_thorn_lash':
      applyDamage(0n, 0n, { dot: { magnitude: 2n, rounds: 2n, source: 'Thorn Lash' } });
      applyHeal(character, 6n, 'Thorn Lash');
      return;
    case 'druid_natures_mark': {
      if (activeCombatIdForCharacter(ctx, character.id)) {
        throw new SenderError('Cannot use while in combat');
      }
      // Re-read character from database to ensure fresh data after mana deduction
      const freshChar = ctx.db.character.id.find(character.id);
      if (!freshChar) {
        throw new SenderError('Character not found');
      }
      const location = ctx.db.location.id.find(freshChar.locationId);
      if (!location) throw new SenderError('Location not found');
      const pool = getGatherableResourceTemplates(ctx, location.terrainType ?? 'plains');
      if (pool.length === 0) {
        appendPrivateEvent(
          ctx,
          freshChar.id,
          freshChar.ownerUserId,
          'ability',
          'Nature yields nothing here.'
        );
        return;
      }
      const seed = ctx.timestamp.microsSinceUnixEpoch + freshChar.id;
      const picked = pool[Number(seed % BigInt(pool.length))];
      const template = picked?.template;
      if (!template) {
        appendPrivateEvent(
          ctx,
          freshChar.id,
          freshChar.ownerUserId,
          'ability',
          'Nature yields nothing here.'
        );
        return;
      }
      const quantity = 1n + (seed % 4n);
      if (!hasInventorySpace(ctx, freshChar.id, template.id)) {
        appendPrivateEvent(
          ctx,
          freshChar.id,
          freshChar.ownerUserId,
          'ability',
          'Your pack is full.'
        );
        return;
      }
      addItemToInventory(ctx, freshChar.id, template.id, quantity);
      appendPrivateEvent(
        ctx,
        freshChar.id,
        freshChar.ownerUserId,
        'ability',
        `Nature's Mark yields ${quantity} ${template.name}.`
      );
      return;
    }
    case 'druid_bramble':
      applyDamage(0n, 0n, { dot: { magnitude: 3n, rounds: 2n, source: 'Bramble' } });
      return;
    case 'druid_natures_gift':
      applyPartyHpBonus(15n, 3n, "Nature's Gift");
      appendPrivateEvent(
        ctx,
        character.id,
        character.ownerUserId,
        'ability',
        "Nature's Gift blesses the party."
      );
      return;
    case 'druid_wild_surge':
      applyDamage(0n, 0n);
      return;
    case 'reaver_blood_rend':
      {
        const dealt = applyDamage(0n, 0n);
        if (dealt > 0n) {
          const leech = (dealt * 30n) / 100n;
          applyHeal(character, leech > 0n ? leech : 1n, 'Blood Rend');
        }
      }
      return;
    case 'reaver_blood_pact':
      addCharacterEffect(ctx, character.id, 'damage_up', 3n, 3n, 'Blood Pact');
      appendPrivateEvent(
        ctx,
        character.id,
        character.ownerUserId,
        'ability',
        'Blood Pact fuels your offense.'
      );
      return;
    case 'reaver_soul_rend':
      applyDamage(0n, 0n, { dot: { magnitude: 3n, rounds: 2n, source: 'Soul Rend' } });
      return;
    case 'reaver_dread_aura':
      applyDamage(0n, 0n, {
        debuff: { type: 'damage_down', magnitude: -3n, rounds: 2n, source: 'Dread Aura' },
      });
      return;
    case 'reaver_oblivion':
      applyDamage(0n, 0n);
      return;
    case 'summoner_conjure_vessel':
      applyDamage(0n, 0n);
      addCharacterEffect(ctx, character.id, 'mana_regen', 2n, 2n, 'Familiar Strike');
      appendPrivateEvent(
        ctx,
        character.id,
        character.ownerUserId,
        'ability',
        'Conjure a vessel that strikes your enemy and captures some of their essence.'
      );
      return;
    case 'summoner_earth_familiar':
      summonPet(
        'Familiar',
        'an earth familiar',
        ['Cipher', 'Glim', 'Vex', 'Aster', 'Sigil'],
        { key: 'pet_taunt', cooldownSeconds: 10n },
        { hpBase: 22n, hpPerLevel: 6n, damageBase: 2n, damagePerLevel: 1n, weaponScalePercent: 30n }
      );
      return;
    case 'summoner_conjured_spike':
      applyDamage(0n, 0n);
      return;
    case 'summoner_empower':
      applyPartyEffect('damage_up', 2n, 3n, 'Empower');
      appendPrivateEvent(
        ctx,
        character.id,
        character.ownerUserId,
        'ability',
        'Empower strengthens the party.'
      );
      return;
    case 'summoner_spectral_lance':
      applyDamage(0n, 0n);
      return;
    default:
      appendPrivateEvent(
        ctx,
        character.id,
        character.ownerUserId,
        'ability',
        `You use ${ability.name}.`
      );
  }
}

export function applyEnemyAbilityDamage(
  ctx: any,
  target: any,
  rawDamage: bigint,
  damageType: string,
  enemyName: string,
  abilityName: string
): bigint {
  let finalDamage = rawDamage;
  if (damageType === 'physical') {
    const effectiveArmor = target.armorClass + sumCharacterEffect(ctx, target.id, 'ac_bonus');
    finalDamage = applyArmorMitigation(rawDamage, effectiveArmor > 0n ? effectiveArmor : 0n);
  } else if (damageType === 'magic') {
    const magicResist = sumCharacterEffect(ctx, target.id, 'magic_resist');
    finalDamage = applyMagicResistMitigation(rawDamage, magicResist);
  }
  if (finalDamage < 1n) finalDamage = 1n;
  const nextHp = target.hp > finalDamage ? target.hp - finalDamage : 0n;
  ctx.db.character.id.update({ ...target, hp: nextHp });
  return finalDamage;
}

export function executeEnemyAbility(
  ctx: any,
  combatId: bigint,
  enemyId: bigint,
  abilityKey: string,
  targetCharacterId?: bigint
) {
  const combat = ctx.db.combatEncounter.id.find(combatId);
  if (!combat || combat.state !== 'active') return;
  const ability = ENEMY_ABILITIES[abilityKey as keyof typeof ENEMY_ABILITIES];
  if (!ability) return;
  const enemy = ctx.db.combatEnemy.id.find(enemyId);
  if (!enemy) return;
  const enemyTemplate = ctx.db.enemyTemplate.id.find(enemy.enemyTemplateId);
  const enemyName = enemy.displayName ?? enemyTemplate?.name ?? 'Enemy';
  const targetId = targetCharacterId ?? getTopAggroId(ctx, combatId, enemy.id);
  if (!targetId) return;
  const target = ctx.db.character.id.find(targetId);
  if (!target) return;

  // Calculate power for this enemy ability
  const enemyLevel = enemyTemplate?.level ?? 1n;
  const abilityPower = (ability as any).power ?? 3n;
  const enemyPower = ENEMY_BASE_POWER + (enemyLevel * ENEMY_LEVEL_POWER_SCALING);
  const totalPower = enemyPower + abilityPower * 5n; // Scale ability power like player system

  if (ability.kind === 'dot') {
    const damageType = (ability as any).damageType ?? 'physical';
    const dotPowerSplit = (ability as any).dotPowerSplit ?? 0.5;

    // Direct damage portion
    const directFraction = 1.0 - dotPowerSplit;
    const directDamage = (totalPower * BigInt(Math.floor(directFraction * 100))) / 100n;

    // DoT portion
    const dotFraction = dotPowerSplit;
    const dotTotalDamage = (totalPower * BigInt(Math.floor(dotFraction * 100))) / 100n;
    const dotPerTick = ability.rounds > 0n ? dotTotalDamage / ability.rounds : dotTotalDamage;

    // Apply direct damage with armor/magic resist routing
    let actualDamage = 0n;
    if (directDamage > 0n) {
      actualDamage = applyEnemyAbilityDamage(ctx, target, directDamage, damageType, enemyName, ability.name);
    }

    // Apply DoT via existing CharacterEffect system (tick_hot reducer handles it)
    if (dotPerTick > 0n) {
      addCharacterEffect(ctx, target.id, 'dot', dotPerTick, ability.rounds, ability.name);
    }

    // Log messages
    const dmgMsg = actualDamage > 0n ? ` for ${actualDamage}` : '';
    const privateMessage = `${enemyName} uses ${ability.name} on you${dmgMsg}.`;
    const groupMessage = `${enemyName} uses ${ability.name} on ${target.name}${dmgMsg}.`;
    appendPrivateEvent(ctx, target.id, target.ownerUserId, 'damage', privateMessage);
    if (target.groupId) {
      appendGroupEvent(ctx, target.groupId, target.id, 'damage', groupMessage);
    }
  } else if (ability.kind === 'debuff') {
    const damageType = (ability as any).damageType ?? 'physical';
    const debuffPowerCost = (ability as any).debuffPowerCost ?? 0.25;

    // Direct damage reduced by debuff cost
    const damageFraction = 1.0 - debuffPowerCost;
    const directDamage = (totalPower * BigInt(Math.floor(damageFraction * 100))) / 100n;

    // Apply direct damage with damage type routing
    let actualDamage = 0n;
    if (directDamage > 0n) {
      actualDamage = applyEnemyAbilityDamage(ctx, target, directDamage, damageType, enemyName, ability.name);
    }

    // Apply debuff effect (fixed magnitude from metadata, not scaled)
    const effectType = (ability as any).effectType ?? 'ac_bonus';
    addCharacterEffect(ctx, target.id, effectType, ability.magnitude, ability.rounds, ability.name);

    // Log messages
    const dmgMsg = actualDamage > 0n ? ` for ${actualDamage} and` : '';
    const privateMessage = `${enemyName} uses ${ability.name}${dmgMsg} afflicts you.`;
    const groupMessage = `${enemyName} uses ${ability.name}${dmgMsg} afflicts ${target.name}.`;
    appendPrivateEvent(ctx, target.id, target.ownerUserId, 'ability', privateMessage);
    if (target.groupId) {
      appendGroupEvent(ctx, target.groupId, target.id, 'ability', groupMessage);
    }
  } else if (ability.kind === 'heal') {
    const allies = [...ctx.db.combatEnemy.by_combat.filter(combatId)]
      .filter((e: any) => e.currentHp > 0n);
    if (allies.length === 0) return;

    // Find lowest HP ally
    let healTarget = allies[0];
    for (const ally of allies) {
      if (ally.currentHp < healTarget.currentHp) healTarget = ally;
    }

    const healPowerSplit = (ability as any).healPowerSplit ?? 1.0;
    const directHeal = (totalPower * BigInt(Math.floor(healPowerSplit * 100))) / 100n;

    // Cap at maxHp
    const healTargetTemplate = ctx.db.enemyTemplate.id.find(healTarget.enemyTemplateId);
    const maxHp = healTargetTemplate?.maxHp ?? 100n;
    const nextHp = healTarget.currentHp + directHeal > maxHp ? maxHp : healTarget.currentHp + directHeal;
    ctx.db.combatEnemy.id.update({ ...healTarget, currentHp: nextHp });

    // Apply HoT if split specified
    const hotDuration = (ability as any).hotDuration;
    if (hotDuration && healPowerSplit < 1.0) {
      const hotFraction = 1.0 - healPowerSplit;
      const hotTotal = (totalPower * BigInt(Math.floor(hotFraction * 100))) / 100n;
      const hotPerTick = hotDuration > 0n ? hotTotal / hotDuration : hotTotal;
      if (hotPerTick > 0n) {
        addEnemyEffect(ctx, combatId, healTarget.id, 'regen', hotPerTick, hotDuration, ability.name);
      }
    }

    // Log heal event to all active participants
    const healTargetName = healTarget.displayName ?? healTargetTemplate?.name ?? 'an ally';
    for (const participant of ctx.db.combatParticipant.by_combat.filter(combatId)) {
      if (participant.status !== 'active') continue;
      const pc = ctx.db.character.id.find(participant.characterId);
      if (!pc) continue;
      appendPrivateEvent(ctx, pc.id, pc.ownerUserId, 'combat',
        `${enemyName} heals ${healTargetName} for ${directHeal}.`);
    }
    const firstActive = [...ctx.db.combatParticipant.by_combat.filter(combatId)]
      .find((p: any) => p.status === 'active');
    if (firstActive) {
      const pc = ctx.db.character.id.find(firstActive.characterId);
      if (pc?.groupId) {
        appendGroupEvent(ctx, pc.groupId, pc.id, 'combat',
          `${enemyName} heals ${healTargetName} for ${directHeal}.`);
      }
    }
  } else if (ability.kind === 'aoe_damage') {
    const damageType = (ability as any).damageType ?? 'magic';
    const perTargetDamage = (totalPower * AOE_DAMAGE_MULTIPLIER) / 100n;

    // Hit all active participants
    for (const participant of ctx.db.combatParticipant.by_combat.filter(combatId)) {
      if (participant.status !== 'active') continue;
      const pc = ctx.db.character.id.find(participant.characterId);
      if (!pc || pc.hp === 0n) continue;

      const actualDamage = applyEnemyAbilityDamage(ctx, pc, perTargetDamage, damageType, enemyName, ability.name);

      appendPrivateEvent(ctx, pc.id, pc.ownerUserId, 'damage',
        `${enemyName} hits you with ${ability.name} for ${actualDamage}.`);
      if (pc.groupId) {
        appendGroupEvent(ctx, pc.groupId, pc.id, 'damage',
          `${enemyName} hits ${pc.name} with ${ability.name} for ${actualDamage}.`);
      }
    }
  } else if (ability.kind === 'buff') {
    const effectType = (ability as any).effectType ?? 'damage_bonus';
    const magnitude = ability.magnitude ?? 3n;
    const rounds = ability.rounds ?? 3n;

    // Buff all living enemy allies
    for (const ally of ctx.db.combatEnemy.by_combat.filter(combatId)) {
      if (ally.currentHp <= 0n) continue;
      addEnemyEffect(ctx, combatId, ally.id, effectType, magnitude, rounds, ability.name);
    }

    // Log buff event
    for (const participant of ctx.db.combatParticipant.by_combat.filter(combatId)) {
      if (participant.status !== 'active') continue;
      const pc = ctx.db.character.id.find(participant.characterId);
      if (!pc) continue;
      appendPrivateEvent(ctx, pc.id, pc.ownerUserId, 'combat',
        `${enemyName} rallies allies with ${ability.name}!`);
    }
    const firstActive = [...ctx.db.combatParticipant.by_combat.filter(combatId)]
      .find((p: any) => p.status === 'active');
    if (firstActive) {
      const pc = ctx.db.character.id.find(firstActive.characterId);
      if (pc?.groupId) {
        appendGroupEvent(ctx, pc.groupId, pc.id, 'combat',
          `${enemyName} rallies allies with ${ability.name}!`);
      }
    }
  }
}

export function executePetAbility(
  ctx: any,
  combatId: bigint,
  petId: bigint,
  abilityKey: string,
  targetEnemyId?: bigint
) {
  const combat = ctx.db.combatEncounter.id.find(combatId);
  if (!combat || combat.state !== 'active') return false;
  const pet = ctx.db.combatPet.id.find(petId);
  if (!pet) return false;
  const owner = ctx.db.character.id.find(pet.ownerCharacterId);
  if (!owner || owner.hp === 0n) return false;
  const target =
    (targetEnemyId ? ctx.db.combatEnemy.id.find(targetEnemyId) : null) ??
    (pet.targetEnemyId ? ctx.db.combatEnemy.id.find(pet.targetEnemyId) : null);
  if (!target || target.currentHp === 0n) return false;

  const actorGroupId = effectiveGroupId(owner);
  if (abilityKey === 'pet_taunt') {
    let maxAggro = 0n;
    let petEntry: typeof AggroEntry.rowType | null = null;
    for (const entry of ctx.db.aggroEntry.by_combat.filter(combatId)) {
      if (entry.enemyId !== target.id) continue;
      if (entry.value > maxAggro) maxAggro = entry.value;
      if (entry.petId && entry.petId === pet.id) petEntry = entry;
    }
    const newValue = maxAggro + 5n;
    if (petEntry) {
      ctx.db.aggroEntry.id.update({ ...petEntry, value: newValue });
    } else {
      ctx.db.aggroEntry.insert({
        id: 0n,
        combatId,
        enemyId: target.id,
        characterId: owner.id,
        petId: pet.id,
        value: newValue,
      });
    }
    const message = `${pet.name} taunts ${target.displayName ?? 'the enemy'}.`;
    appendPrivateEvent(ctx, owner.id, owner.ownerUserId, 'ability', message);
    if (actorGroupId) {
      appendGroupEvent(ctx, actorGroupId, owner.id, 'ability', message);
    }
    ctx.db.combatEnemy.id.update({
      ...target,
      aggroTargetPetId: pet.id,
      aggroTargetCharacterId: owner.id,
    });
    return true;
  }

  if (abilityKey === 'pet_bleed') {
    addEnemyEffect(ctx, combatId, target.id, 'dot', 2n, 3n, 'Pet Bleed');
    const message = `${pet.name} rends ${target.displayName ?? 'the enemy'}.`;
    appendPrivateEvent(ctx, owner.id, owner.ownerUserId, 'ability', message);
    if (actorGroupId) {
      appendGroupEvent(ctx, actorGroupId, owner.id, 'ability', message);
    }
    return true;
  }

  return false;
}

export function executeAbilityAction(
  ctx: any,
  args:
    | {
      actorType: 'character';
      actorId: bigint;
      abilityKey: string;
      targetCharacterId?: bigint;
    }
    | {
      actorType: 'enemy';
      actorId: bigint;
      combatId: bigint;
      abilityKey: string;
      targetCharacterId?: bigint;
    }
    | {
      actorType: 'pet';
      actorId: bigint;
      combatId: bigint;
      abilityKey: string;
      targetEnemyId?: bigint;
    }
) {
  if (args.actorType === 'character') {
    const character = ctx.db.character.id.find(args.actorId);
    if (!character) return false;
    executeAbility(ctx, character, args.abilityKey, args.targetCharacterId);
    return true;
  }
  if (args.actorType === 'enemy') {
    executeEnemyAbility(
      ctx,
      args.combatId,
      args.actorId,
      args.abilityKey,
      args.targetCharacterId
    );
    return true;
  }
  return executePetAbility(
    ctx,
    args.combatId,
    args.actorId,
    args.abilityKey,
    args.targetEnemyId
  );
}

export function awardCombatXp(
  ctx: any,
  character: any,
  enemyLevel: bigint,
  baseXp: bigint
) {
  if (character.level >= MAX_LEVEL) return { xpGained: 0n, leveledUp: false };
  const diff = Number(enemyLevel - character.level);
  const mod = xpModifierForDiff(diff);
  if (mod === 0n) return { xpGained: 0n, leveledUp: false };

  const gained = (baseXp * mod) / 100n;
  if (gained <= 0n) return { xpGained: 0n, leveledUp: false };

  const newXp = character.xp + gained;
  let newLevel = character.level;
  while (newLevel < MAX_LEVEL && newXp >= xpRequiredForLevel(newLevel + 1n)) {
    newLevel += 1n;
  }

  if (newLevel === character.level) {
    ctx.db.character.id.update({ ...character, xp: newXp });
    return { xpGained: gained, leveledUp: false };
  }

  const newBase = computeBaseStats(character.className, newLevel);
  const updated = {
    ...character,
    level: newLevel,
    xp: newXp,
    str: newBase.str,
    dex: newBase.dex,
    cha: newBase.cha,
    wis: newBase.wis,
    int: newBase.int,
  };
  ctx.db.character.id.update(updated);
  recomputeCharacterDerived(ctx, updated);
  return { xpGained: gained, leveledUp: true, newLevel };
}

export function applyDeathXpPenalty(ctx: any, character: any) {
  if (character.level <= 5n) return 0n;
  const currentLevelFloor = xpRequiredForLevel(character.level);
  if (character.xp <= currentLevelFloor) return 0n;
  const progress = character.xp - currentLevelFloor;
  const loss = (progress * 5n) / 100n;
  if (loss <= 0n) return 0n;
  const nextXp = character.xp - loss;
  const clamped = nextXp < currentLevelFloor ? currentLevelFloor : nextXp;
  ctx.db.character.id.update({ ...character, xp: clamped });
  return loss;
}


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

export function computeEnemyStats(
  template: typeof EnemyTemplate.rowType,
  roleTemplate: typeof EnemyRoleTemplate.rowType | null,
  participants: typeof Character.rowType[]
) {
  const roleKey = roleTemplate?.role ?? template.role;
  const role = getEnemyRole(roleKey);
  const effectiveLevel = template.level;
  const baseHp = role.baseHp + role.hpPerLevel * effectiveLevel;
  const baseDamage = role.baseDamage + role.damagePerLevel * effectiveLevel;
  const baseArmorClass = role.baseArmor + role.armorPerLevel * effectiveLevel;

  return {
    maxHp: baseHp,
    attackDamage: baseDamage,
    armorClass: baseArmorClass,
    avgLevel: effectiveLevel,
  };
}

export function scheduleCombatTick(ctx: any, combatId: bigint) {
  const nextAt = ctx.timestamp.microsSinceUnixEpoch + COMBAT_LOOP_INTERVAL_MICROS;
  ctx.db.combatLoopTick.insert({
    scheduledId: 0n,
    scheduledAt: ScheduleAt.time(nextAt),
    combatId,
  });
}

/**
 * Apply passive perk proc effects after a combat event.
 * Uses deterministic RNG (seed-based arithmetic, no Math.random).
 * Returns { bonusDamage, healing } from triggered procs.
 */
export function applyPerkProcs(
  ctx: any,
  character: any,
  eventType: string,
  damageDealt: bigint,
  seed: bigint,
  combatId: bigint,
  enemy: any | null
): { bonusDamage: bigint; healing: bigint } {
  const procs = getPerkProcs(ctx, character.id, eventType);
  let totalBonusDamage = 0n;
  let totalHealing = 0n;

  for (let i = 0; i < procs.length; i++) {
    const perk = procs[i];
    const effect = perk.effect;
    const procChance = BigInt(effect.procChance ?? 0);
    if (procChance <= 0n) continue;

    // Deterministic roll: (seed + perkIndex) % 100
    const roll = (seed + BigInt(i)) % 100n;
    if (roll >= procChance) continue;

    const perkName = perk.name;

    // procDamageMultiplier: deal bonus damage as percentage of damageDealt
    if (effect.procDamageMultiplier && enemy && enemy.currentHp > 0n) {
      const bonusDmg = (damageDealt * effect.procDamageMultiplier) / 100n;
      if (bonusDmg > 0n) {
        const newHp = enemy.currentHp > bonusDmg ? enemy.currentHp - bonusDmg : 0n;
        ctx.db.combatEnemy.id.update({ ...enemy, currentHp: newHp });
        totalBonusDamage += bonusDmg;
        appendPrivateEvent(
          ctx,
          character.id,
          character.ownerUserId,
          'damage',
          `Your ${perkName} triggered! Bonus strike for ${bonusDmg} damage.`
        );
      }
    }

    // procBonusDamage: flat bonus damage
    if (effect.procBonusDamage && effect.procBonusDamage > 0n && enemy && enemy.currentHp > 0n) {
      const bonusDmg = effect.procBonusDamage as bigint;
      const newHp = enemy.currentHp > bonusDmg ? enemy.currentHp - bonusDmg : 0n;
      ctx.db.combatEnemy.id.update({ ...enemy, currentHp: newHp });
      totalBonusDamage += bonusDmg;
      appendPrivateEvent(
        ctx,
        character.id,
        character.ownerUserId,
        'damage',
        `Your ${perkName} triggered! Bonus damage for ${bonusDmg}.`
      );
    }

    // procHealPercent: heal character for X% of damage dealt
    if (effect.procHealPercent && damageDealt > 0n) {
      const healAmount = (damageDealt * BigInt(effect.procHealPercent)) / 100n;
      if (healAmount > 0n) {
        const freshChar = ctx.db.character.id.find(character.id);
        if (freshChar) {
          const newHp = freshChar.hp + healAmount > freshChar.maxHp ? freshChar.maxHp : freshChar.hp + healAmount;
          ctx.db.character.id.update({ ...freshChar, hp: newHp });
          totalHealing += healAmount;
          appendPrivateEvent(
            ctx,
            character.id,
            character.ownerUserId,
            'heal',
            `Your ${perkName} triggered! Healed for ${healAmount}.`
          );
        }
      }
    }

    // buffType: apply a CharacterEffect buff on proc
    if (effect.buffType) {
      const buffDuration = effect.buffDurationSeconds ?? 10;
      const roundsRemaining = BigInt(Math.max(1, Math.ceil(buffDuration / 3)));
      const buffMagnitude = effect.buffMagnitude ?? 1n;
      addCharacterEffect(ctx, character.id, effect.buffType, buffMagnitude, roundsRemaining, perkName);
      appendPrivateEvent(
        ctx,
        character.id,
        character.ownerUserId,
        'ability',
        `Your ${perkName} triggered! +${buffMagnitude}% damage for ${buffDuration}s.`
      );
    }

    // on_kill AoE proc (Deathbringer): deal damage to all other enemies in combat
    if (eventType === 'on_kill' && effect.procDamageMultiplier && combatId) {
      const aoeDmg = (damageDealt * effect.procDamageMultiplier) / 100n;
      if (aoeDmg > 0n) {
        for (const otherEnemy of ctx.db.combatEnemy.by_combat.filter(combatId)) {
          if (otherEnemy.id === enemy?.id) continue;
          if (otherEnemy.currentHp <= 0n) continue;
          const newHp = otherEnemy.currentHp > aoeDmg ? otherEnemy.currentHp - aoeDmg : 0n;
          ctx.db.combatEnemy.id.update({ ...otherEnemy, currentHp: newHp });
          totalBonusDamage += aoeDmg;
          appendPrivateEvent(
            ctx,
            character.id,
            character.ownerUserId,
            'damage',
            `Your ${perkName} radiates death for ${aoeDmg} to nearby enemies.`
          );
        }
      }
    }
  }

  return { bonusDamage: totalBonusDamage, healing: totalHealing };
}

/**
 * Find a perk definition by its raw key (without 'perk_' prefix) across all RENOWN_PERK_POOLS.
 */
function findPerkByKey(perkKey: string) {
  for (const rankNum in RENOWN_PERK_POOLS) {
    const pool = RENOWN_PERK_POOLS[Number(rankNum)];
    const found = pool.find((p) => p.key === perkKey);
    if (found) return found;
  }
  return null;
}

/**
 * Execute an active perk ability cast from the hotbar.
 * Handles Second Wind (heal), Thunderous Blow (damage), Wrath of the Fallen (buff).
 * Cooldowns are managed via AbilityCooldown table using readyAtMicros.
 * Second Wind is usable outside combat. Thunderous Blow requires combat.
 * Wrath of the Fallen is usable in or out of combat.
 */
export function executePerkAbility(
  ctx: any,
  character: any,
  abilityKey: string
): void {
  // Strip the 'perk_' prefix to get the raw perk key
  const rawKey = abilityKey.replace(/^perk_/, '');
  const perkDef = findPerkByKey(rawKey);
  if (!perkDef || perkDef.type !== 'active') {
    throw new SenderError('Invalid perk ability');
  }

  // Verify the character actually has this perk
  let hasPerk = false;
  for (const row of ctx.db.renownPerk.by_character.filter(character.id)) {
    if (row.perkKey === rawKey) {
      hasPerk = true;
      break;
    }
  }
  if (!hasPerk) {
    throw new SenderError('You do not have this perk');
  }

  const effect = perkDef.effect;
  const actorGroupId = effectiveGroupId(character);
  const combatId = activeCombatIdForCharacter(ctx, character.id);

  if (effect.healPercent) {
    // Second Wind: heal for X% of max HP -- usable outside combat
    const maxHp = character.maxHp;
    const healAmount = (maxHp * BigInt(effect.healPercent)) / 100n;
    const newHp = character.hp + healAmount > maxHp ? maxHp : character.hp + healAmount;
    ctx.db.character.id.update({ ...character, hp: newHp });
    const msg = character.name + ' uses ' + perkDef.name + '! Healed for ' + healAmount + ' HP.';
    appendPrivateEvent(ctx, character.id, character.ownerUserId, 'heal', msg);
    if (actorGroupId) {
      appendGroupEvent(ctx, actorGroupId, character.id, 'heal', msg);
    }
  } else if (effect.damagePercent) {
    // Thunderous Blow: deal X% weapon damage to current target -- requires combat
    if (!combatId) {
      throw new SenderError('Thunderous Blow can only be used in combat');
    }
    const enemies = [...ctx.db.combatEnemy.by_combat.filter(combatId)].filter((e: any) => e.currentHp > 0n);
    const preferredEnemy = character.combatTargetEnemyId
      ? enemies.find((e: any) => e.id === character.combatTargetEnemyId)
      : null;
    const enemy = preferredEnemy ?? enemies[0] ?? null;
    if (!enemy) {
      throw new SenderError('No target in combat');
    }
    const weapon = getEquippedWeaponStats(ctx, character.id);
    const baseDamage = 5n + character.level + weapon.baseDamage + weapon.dps / 2n;
    const totalDamage = (baseDamage * BigInt(effect.damagePercent)) / 100n;
    const newHp = enemy.currentHp > totalDamage ? enemy.currentHp - totalDamage : 0n;
    ctx.db.combatEnemy.id.update({ ...enemy, currentHp: newHp });
    const enemyTemplate = ctx.db.enemyTemplate.id.find(enemy.enemyTemplateId);
    const enemyName = enemy.displayName ?? enemyTemplate?.name ?? 'enemy';
    const msg = character.name + ' unleashes ' + perkDef.name + ' on ' + enemyName + ' for ' + totalDamage + ' damage!';
    appendPrivateEvent(ctx, character.id, character.ownerUserId, 'damage', msg);
    if (actorGroupId) {
      appendGroupEvent(ctx, actorGroupId, character.id, 'damage', msg);
    }
  } else if (effect.buffType) {
    // Wrath of the Fallen: grant a damage buff -- usable in or out of combat
    const buffDuration = effect.buffDurationSeconds ?? 20;
    // Convert seconds to combat rounds (3s per round), minimum 1 round
    const roundsRemaining = BigInt(Math.max(1, Math.ceil(buffDuration / 3)));
    const buffMagnitude = effect.buffMagnitude ?? 25n;
    addCharacterEffect(ctx, character.id, effect.buffType, buffMagnitude, roundsRemaining, abilityKey);
    const msg = character.name + ' activates ' + perkDef.name + '! +' + buffMagnitude + '% damage for ' + buffDuration + 's.';
    appendPrivateEvent(ctx, character.id, character.ownerUserId, 'ability', msg);
    if (actorGroupId) {
      appendGroupEvent(ctx, actorGroupId, character.id, 'ability', msg);
    }
  } else {
    throw new SenderError('Unknown active perk effect type');
  }
}

/**
 * Calculate flee success chance based on region danger level.
 * Formula: 120 - floor(dangerMultiplier / 3), clamped to [10, 95]
 * - dangerMultiplier 100 (starter zone) => ~87% flee chance
 * - dangerMultiplier 160 (border zone)  => ~67% flee chance
 * - dangerMultiplier 200 (dungeon zone) => ~53% flee chance
 * Floor of 10% so it's never impossible; cap of 95% so it's never guaranteed.
 */
export function calculateFleeChance(dangerMultiplier: bigint): number {
  return Math.max(10, Math.min(95, 120 - Math.floor(Number(dangerMultiplier) / 3)));
}

