import { SenderError } from 'spacetimedb/server';
import { Timestamp, ScheduleAt } from 'spacetimedb';
import { normalizeClassName } from '../data/class_stats';
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
  TANK_THREAT_MULTIPLIER,
  HEALER_THREAT_MULTIPLIER,
  SUMMONER_THREAT_MULTIPLIER,
  SUMMONER_PET_INITIAL_AGGRO,
  HEALING_THREAT_PERCENT,
} from '../data/combat_scaling';
import { effectiveGroupId } from './group';
import { appendPrivateEvent, appendGroupEvent, logPrivateAndGroup } from './events';
import { getEquippedWeaponStats, hasInventorySpace, addItemToInventory, getEquippedBonuses } from './items';
import { getGatherableResourceTemplates } from './location';
import { partyMembersInLocation, recomputeCharacterDerived } from './character';
import { executeResurrect, executeCorpseSummon } from './corpse';
import { AggroEntry } from '../schema/tables';
import {
  COMBAT_LOOP_INTERVAL_MICROS,
  AUTO_ATTACK_INTERVAL,
  GROUP_SIZE_DANGER_BASE,
  GROUP_SIZE_BIAS_RANGE,
  GROUP_SIZE_BIAS_MAX,
} from '../data/combat_constants';
import { ENEMY_ABILITIES } from '../data/abilities/enemy_abilities';
import { applyArmorMitigation, applyVariance, scaleByPercent } from './combat_enemies';

const GLOBAL_COOLDOWN_MICROS = 1_500_000n;

// Class sets for threat calculation
const TANK_CLASSES = new Set(['warrior', 'paladin']);
const HEALER_CLASSES = new Set(['cleric', 'shaman']);

// Helper to get active combat for character
function activeCombatIdForCharacter(ctx: any, characterId: bigint): bigint | null {
  for (const row of ctx.db.combat_participant.by_character.filter(characterId)) {
    const combat = ctx.db.combat_encounter.id.find(row.combatId);
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

export function abilityResourceCost(level: bigint, power: bigint) {
  return 4n + level * 2n + power;
}

export function staminaResourceCost(power: bigint) {
  return 2n + power / 2n;
}

export function hasShieldEquipped(ctx: any, characterId: bigint) {
  for (const instance of ctx.db.item_instance.by_owner.filter(characterId)) {
    if (instance.equippedSlot !== 'offHand') continue;
    const template = ctx.db.item_template.id.find(instance.templateId);
    if (!template) continue;
    const name = template.name.toLowerCase();
    if (name.includes('shield') || template.armorType === 'shield') return true;
  }
  return false;
}

export function abilityCooldownMicros(ctx: any, abilityKey: string) {
  const rows = [...ctx.db.ability_template.by_key.filter(abilityKey)];
  const ability = rows[0];
  if (!ability) return GLOBAL_COOLDOWN_MICROS;
  const specific = ability.cooldownSeconds ? ability.cooldownSeconds * 1_000_000n : 0n;
  return specific > GLOBAL_COOLDOWN_MICROS ? specific : GLOBAL_COOLDOWN_MICROS;
}

export function abilityCastMicros(ctx: any, abilityKey: string) {
  const rows = [...ctx.db.ability_template.by_key.filter(abilityKey)];
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
    blockChanceBasis?: bigint;        // on 1000-scale; default 50n (5%)
    blockMitigationPercent?: bigint;  // on 100n-scale; default 50n (50% mitigation)
    canParry: boolean;
    canDodge: boolean;
    dodgeChanceBasis?: bigint;        // on 1000-scale; default 50n (5%) — defender's pre-computed dodgeChance
    parryChanceBasis?: bigint;        // on 1000-scale; default 50n (5%) — defender's pre-computed parryChance
    attackerHitBonus?: bigint;        // on 1000-scale; default 0n — attacker's pre-computed hitChance
    characterDex?: bigint;
    weaponName?: string;
    weaponType?: string;
  }
) {
  const roll = seed % 1000n;
  let cursor = 0n;
  const hitBonus = opts.attackerHitBonus ?? 0n;
  if (opts.canDodge) {
    const raw = opts.dodgeChanceBasis ?? 50n;
    const net = raw > hitBonus ? raw - hitBonus : 0n;
    cursor += net;
    if (roll < cursor) return { outcome: 'dodge', multiplier: 0n };
  }
  if (opts.canParry) {
    const raw = opts.parryChanceBasis ?? 50n;
    const net = raw > hitBonus ? raw - hitBonus : 0n;
    cursor += net;
    if (roll < cursor) return { outcome: 'parry', multiplier: 0n };
  }
  if (opts.canBlock) {
    const blockChance = opts.blockChanceBasis ?? 50n;          // default 5% on 1000-scale
    const blockMitigation = opts.blockMitigationPercent ?? 50n; // default 50% mitigation
    cursor += blockChance;
    if (roll < cursor) {
      // multiplier represents damage taken: 100% - mitigation%
      // e.g. 30% mitigation → multiplier 70n (player takes 70% of hit damage)
      const damageTaken = 100n - blockMitigation;
      return { outcome: 'block', multiplier: damageTaken > 0n ? damageTaken : 1n };
    }
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
  const existing = [...ctx.db.character_effect.by_character.filter(characterId)].find(
    (effect) => effect.effectType === effectType && effect.sourceAbility === sourceAbility
  );
  if (existing) {
    ctx.db.character_effect.id.update({
      ...existing,
      magnitude,
      roundsRemaining,
    });
    return;
  }
  ctx.db.character_effect.insert({
    id: 0n,
    characterId,
    effectType,
    magnitude,
    roundsRemaining,
    sourceAbility,
  });
  // Apply the first tick immediately for DoTs and HoTs so the effect is felt on cast.
  // Subsequent ticks are handled by the global tick_hot scheduler (every 3s).
  if (effectType === 'regen' || effectType === 'dot') {
    const character = ctx.db.character.id.find(characterId);
    if (character && character.hp > 0n) {
      if (effectType === 'regen') {
        const healed = character.hp + magnitude > character.maxHp ? character.maxHp : character.hp + magnitude;
        ctx.db.character.id.update({ ...character, hp: healed });
      } else {
        const nextHp = character.hp > magnitude ? character.hp - magnitude : 0n;
        ctx.db.character.id.update({ ...character, hp: nextHp });
      }
    }
  }
}

export function addEnemyEffect(
  ctx: any,
  combatId: bigint,
  enemyId: bigint,
  effectType: string,
  magnitude: bigint,
  roundsRemaining: bigint,
  sourceAbility: string,
  ownerCharacterId?: bigint
) {
  // Stun uses a time-based window stored in CombatEnemyEffect.magnitude (expiry micros).
  // roundsRemaining is treated as seconds. Multiple stuns extend the window via max().
  if (effectType === 'stun') {
    const durationMicros = roundsRemaining * 1_000_000n;
    const newUntil = ctx.timestamp.microsSinceUnixEpoch + durationMicros;
    const existing = [...ctx.db.combat_enemy_effect.by_enemy.filter(enemyId)].find(
      (effect: any) => effect.effectType === 'stun'
    );
    if (existing) {
      const maxExpiry = existing.magnitude > newUntil ? existing.magnitude : newUntil;
      ctx.db.combat_enemy_effect.id.update({ ...existing, magnitude: maxExpiry, ownerCharacterId });
    } else {
      ctx.db.combat_enemy_effect.insert({
        id: 0n,
        combatId,
        enemyId,
        effectType: 'stun',
        magnitude: newUntil,
        roundsRemaining: 0n,
        sourceAbility,
        ownerCharacterId,
      });
    }
    return;
  }

  const existing = [...ctx.db.combat_enemy_effect.by_combat.filter(combatId)].find(
    (effect) =>
      effect.enemyId === enemyId &&
      effect.effectType === effectType &&
      effect.sourceAbility === sourceAbility
  );
  if (existing) {
    ctx.db.combat_enemy_effect.id.update({
      ...existing,
      magnitude,
      roundsRemaining,
      ownerCharacterId,
    });
    return;
  }
  ctx.db.combat_enemy_effect.insert({
    id: 0n,
    combatId,
    enemyId,
    effectType,
    magnitude,
    roundsRemaining,
    sourceAbility,
    ownerCharacterId,
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
  for (const entry of ctx.db.aggro_entry.by_combat.filter(combatId)) {
    if (enemyId && entry.enemyId !== enemyId) continue;
    if (entry.petId) continue;
    if (!top || entry.value > top.value) top = entry;
  }
  return top?.characterId ?? null;
}

export function sumCharacterEffect(ctx: any, characterId: bigint, effectType: string) {
  let total = 0n;
  for (const effect of ctx.db.character_effect.by_character.filter(characterId)) {
    if (effect.effectType === effectType) total += BigInt(effect.magnitude);
  }
  return total;
}

export function sumEnemyEffect(ctx: any, combatId: bigint, effectType: string, enemyId?: bigint) {
  let total = 0n;
  for (const effect of ctx.db.combat_enemy_effect.by_combat.filter(combatId)) {
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
  const abilityRows = [...ctx.db.ability_template.by_key.filter(abilityKey)];
  const ability = abilityRows[0];
  if (!ability) throw new SenderError('Unknown ability');
  if (ability.className !== normalizedClass) {
    throw new SenderError('Ability not available');
  }

  if (character.level < ability.level) throw new SenderError('Ability not unlocked');

  let staminaFree = false;
  let staminaFreeEffectId: bigint | undefined;
  if (ability.resource === 'stamina') {
    const free = [...ctx.db.character_effect.by_character.filter(character.id)].find(
      (effect) => effect.effectType === 'stamina_free'
    );
    if (free) {
      staminaFree = true;
      staminaFreeEffectId = free.id;
      // Do NOT delete the effect here — delete it only after the ability fires successfully
    }
  }
  // Use the pre-baked resourceCost from AbilityTemplate (respects resourceCostOverride at seed time).
  // AbilityTemplate has no resourceCostOverride column — only resourceCost (final value).
  const resourceCost = staminaFree && ability.resource === 'stamina' ? 0n : ability.resourceCost;
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

  const combatId = activeCombatIdForCharacter(ctx, character.id);
  const combat = combatId ? ctx.db.combat_encounter.id.find(combatId) : null;
  const enemies = combatId ? [...ctx.db.combat_enemy.by_combat.filter(combatId)] : [];
  const preferredEnemy = character.combatTargetEnemyId
    ? enemies.find((row) => row.id === character.combatTargetEnemyId)
    : null;
  const enemy =
    preferredEnemy ??
    enemies.find((row) => row.currentHp > 0n) ??
    enemies[0] ??
    null;
  const enemyTemplate = enemy ? ctx.db.enemy_template.id.find(enemy.enemyTemplateId) : null;
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
    },
    durationSeconds?: bigint
  ) => {
    // Dismiss any existing pet for this character (single pet at a time)
    for (const existing of ctx.db.active_pet.by_character.filter(character.id)) {
      ctx.db.active_pet.id.delete(existing.id);
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
    const inActiveCombat = combatId && combat && combat.state === 'active';
    if (inActiveCombat && !enemy) throw new SenderError('You have no target to unleash this upon.');
    const pet = ctx.db.active_pet.insert({
      id: 0n,
      characterId: character.id,
      combatId: inActiveCombat ? combatId : undefined,
      name: displayName,
      level: petLevel,
      currentHp: petMaxHp,
      maxHp: petMaxHp,
      attackDamage: petAttackDamage,
      abilityKey: ability?.key,
      abilityCooldownSeconds: ability?.cooldownSeconds,
      // Combat-only fields
      nextAbilityAt: inActiveCombat && ability
        ? nowMicros
        : (!inActiveCombat && (ability?.key === 'pet_heal' || ability?.key === 'pet_aoe_heal'))
          ? nowMicros
          : undefined,
      targetEnemyId: inActiveCombat ? enemy!.id : undefined,
      nextAutoAttackAt: inActiveCombat ? nowMicros + AUTO_ATTACK_INTERVAL : undefined,
      expiresAtMicros: durationSeconds ? nowMicros + durationSeconds * 1_000_000n : undefined,
    });
    if (inActiveCombat && character.className?.toLowerCase() === 'summoner' && ability?.key === 'pet_taunt') {
      // Single-target taunt: only generate initial aggro against the targeted enemy,
      // not an AoE taunt against every enemy in combat.
      // Only pet_taunt pets (earth elemental) get initial aggro; fire/water elementals do not.
      ctx.db.aggro_entry.insert({
        id: 0n,
        combatId,
        enemyId: enemy!.id,
        characterId: character.id,
        petId: pet.id,
        value: SUMMONER_PET_INITIAL_AGGRO,
      });
    } else if (inActiveCombat && ability?.key === 'pet_aoe_heal') {
      // Primal Titan draws aggro from ALL enemies on summon
      for (const combatEnemy of ctx.db.combat_enemy.by_combat.filter(combatId!)) {
        if (combatEnemy.currentHp === 0n) continue; // skip dead enemies
        ctx.db.aggro_entry.insert({
          id: 0n,
          combatId: combatId!,
          enemyId: combatEnemy.id,
          characterId: character.id,
          petId: pet.id,
          value: SUMMONER_PET_INITIAL_AGGRO,
        });
        ctx.db.combat_enemy.id.update({
          ...combatEnemy,
          aggroTargetPetId: pet.id,
          aggroTargetCharacterId: character.id,
        });
      }
    }
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
      hitMultiplier?: bigint;
      ignoreArmor?: bigint;
      threatBonus?: bigint;
      debuff?: { type: string; magnitude: bigint; rounds: bigint; source: string };
      dot?: { magnitude: bigint; rounds: bigint; source: string };
      message?: string;
      perHitMessage?: (damage: bigint, hitIndex: bigint, totalHits: bigint) => string;
    }
  ) => {
    if (!enemy || !combatId) throw new SenderError('You have no target to unleash this upon.');
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
      const enemies = [...ctx.db.combat_enemy.by_combat.filter(combatId)];

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

        // Apply variance to mitigated damage
        const variedMitigated = applyVariance(mitigatedDamage, nowMicros + character.id + targetEnemy.id);

        // Apply damage to target
        const nextHp = targetEnemy.currentHp > variedMitigated ? targetEnemy.currentHp - variedMitigated : 0n;
        ctx.db.combat_enemy.id.update({ ...targetEnemy, currentHp: nextHp });

        // Update aggro for this target (threat tracks actual damage dealt)
        for (const entry of ctx.db.aggro_entry.by_combat.filter(combatId)) {
          if (entry.characterId === character.id && entry.enemyId === targetEnemy.id) {
            const className = character.className?.toLowerCase() ?? '';
            const threatMult = TANK_CLASSES.has(className) ? TANK_THREAT_MULTIPLIER
              : HEALER_CLASSES.has(className) ? HEALER_THREAT_MULTIPLIER
                : className === 'summoner' ? SUMMONER_THREAT_MULTIPLIER : 100n;
            const threat = (variedMitigated * threatMult) / 100n;
            ctx.db.aggro_entry.id.update({
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
            ability.name,
            character.id
          );
        }

        // Log damage for each target
        const targetEnemyTemplate = ctx.db.enemy_template.id.find(targetEnemy.enemyTemplateId);
        const targetName = targetEnemy.displayName ?? targetEnemyTemplate?.name ?? 'enemy';
        appendPrivateEvent(
          ctx,
          character.id,
          character.ownerUserId,
          'damage',
          `Your ${ability.name} hits ${targetName} for ${variedMitigated} damage.`
        );
        if (actorGroupId) {
          appendGroupEvent(
            ctx,
            actorGroupId,
            character.id,
            'damage',
            `${character.name}'s ${ability.name} hits ${targetName} for ${variedMitigated} damage.`
          );
        }
      }

      // AoE abilities skip single-target damage application (already processed all targets above)
      return 0n;  // Return early from applyDamage function
    }

    // Read racial damage bonuses from character row — these are flat additions to each hit
    const racialSpellBonus = character.racialSpellDamage ?? 0n;
    const racialPhysBonus = character.racialPhysDamage ?? 0n;

    let totalDamage = 0n;
    const hitDamages: bigint[] = [];
    for (let i = 0n; i < hits; i += 1n) {
      // Route racial bonus by damage type
      const dmgType = ability?.damageType ?? 'physical';
      const racialDamageBonus = dmgType === 'magic' ? racialSpellBonus : racialPhysBonus;

      // Total raw damage (racial bonus added per hit)
      let raw = weaponComponent + finalDirectDamage + totalDamageUp + racialDamageBonus + sumEnemyEffect(ctx, combatId, 'damage_taken', enemy.id);
      if (options?.hitMultiplier) raw = (raw * options.hitMultiplier) / 100n;

      // Route mitigation by damage type
      let reduced: bigint;
      if (dmgType === 'magic') {
        // Magic damage bypasses armor entirely (makes magic impactful)
        reduced = raw > 0n ? raw : 1n;
      } else {
        // Physical damage uses armor mitigation
        reduced = applyArmorMitigation(raw, armor);
      }
      const variedReduced = applyVariance(reduced, nowMicros + character.id + i * 997n);
      hitDamages.push(variedReduced);
      totalDamage += variedReduced;
    }
    const nextHp = enemy.currentHp > totalDamage ? enemy.currentHp - totalDamage : 0n;
    ctx.db.combat_enemy.id.update({ ...enemy, currentHp: nextHp });
    for (const entry of ctx.db.aggro_entry.by_combat.filter(combatId)) {
      if (entry.characterId === character.id && entry.enemyId === enemy.id) {
        const className = character.className?.toLowerCase() ?? '';
        const threatMult = TANK_CLASSES.has(className) ? TANK_THREAT_MULTIPLIER
          : HEALER_CLASSES.has(className) ? HEALER_THREAT_MULTIPLIER
            : className === 'summoner' ? SUMMONER_THREAT_MULTIPLIER : 100n;
        const threat = (totalDamage * threatMult) / 100n + (options?.threatBonus ?? 0n);
        ctx.db.aggro_entry.id.update({
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
        options.debuff.source,
        character.id
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
        options.dot.source,
        character.id
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
        ability.name,
        character.id
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
        ability.name,
        character.id
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

    // Build characterStats object for stat scaling (same pattern as applyDamage)
    const characterStats = {
      str: character.str,
      dex: character.dex,
      cha: character.cha,
      wis: character.wis,
      int: character.int,
    };

    // If ability has HoT, calculate HoT healing with reduced stat scaling
    if (ability?.hotPowerSplit && ability?.hotDuration && ability?.name) {
      const hotPowerFraction = ability.hotPowerSplit;
      const hotTotalHealing = (amount * BigInt(Math.floor(hotPowerFraction * 100))) / 100n;

      // Apply Wisdom scaling to HoT total
      const scaledHotTotal = calculateHealingPower(hotTotalHealing, characterStats);
      const hotHealPerTick = scaledHotTotal / ability.hotDuration;

      // Apply HoT effect to target
      addCharacterEffect(ctx, target.id, 'regen', hotHealPerTick, ability.hotDuration, ability.name);
    }

    // Apply Wisdom scaling to direct heal output (uses the CASTER's stats, not target's)
    const rawScaledAmount = calculateHealingPower(directHeal, characterStats);
    const scaledAmount = applyVariance(rawScaledAmount, nowMicros + character.id + target.id + 4231n);
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
        const enemiesInCombat = [...ctx.db.combat_enemy.by_combat.filter(combatId)]
          .filter((e: any) => e.currentHp > 0n);
        if (enemiesInCombat.length > 0) {
          const threatPerEnemy = healingThreat / BigInt(enemiesInCombat.length);
          if (threatPerEnemy > 0n) {
            for (const en of enemiesInCombat) {
              for (const entry of ctx.db.aggro_entry.by_combat.filter(combatId)) {
                if (entry.characterId === character.id && entry.enemyId === en.id) {
                  ctx.db.aggro_entry.id.update({ ...entry, value: entry.value + threatPerEnemy });
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

  // Wrap the switch in an arrow function so that `return` exits only the inner function,
  // allowing resource deduction to occur after a successful ability fire.
  const runAbility = () => {
    switch (abilityKey) {
      case 'shaman_spirit_mender':
        if (!targetCharacter) throw new SenderError('Target required');
        applyHeal(targetCharacter, 15n, 'Spirit Mender');
        appendPrivateEvent(ctx, character.id, character.ownerUserId, 'ability',
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
          debuff: { type: 'ac_bonus', magnitude: -2n, rounds: 3n, source: 'Hex' },
        });
        return;
      case 'shaman_ancestral_ward':
        if (!targetCharacter) throw new SenderError('Target required');
        addCharacterEffect(ctx, targetCharacter.id, 'ac_bonus', 4n, 4n, 'Ancestral Ward');
        appendPrivateEvent(ctx, character.id, character.ownerUserId, 'ability',
          `Ancestral Ward shields ${targetCharacter.name}.`
        );
        return;
      case 'shaman_stormcall':
        applyDamage(0n, 0n);
        return;
      case 'shaman_earthquake':
        // AoE physical damage + stun all enemies
        applyDamage(0n, 0n);
        if (combatId) {
          const earthquakeEnemies = [...ctx.db.combat_enemy.by_combat.filter(combatId)];
          for (const en of earthquakeEnemies) {
            if (en.currentHp === 0n) continue;
            addEnemyEffect(ctx, combatId, en.id, 'stun', 1n, 4n, 'Earthquake', character.id);
          }
        }
        appendPrivateEvent(ctx, character.id, character.ownerUserId, 'ability',
          'Earthquake shakes the ground, stunning all enemies!'
        );
        return;
      case 'warrior_slam':
        applyDamage(0n, 0n, {
          threatBonus: 10n,
          debuff: { type: 'skip', magnitude: 1n, rounds: 1n, source: 'Slam' },
        });
        return;
      case 'warrior_intimidating_presence':
        if (!enemy || !combatId) throw new SenderError('You have no target to unleash this upon.');
        addEnemyEffect(ctx, combatId, enemy.id, 'damage_down', -3n, 3n, 'Intimidating Presence', character.id);
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
      case 'warrior_berserker_rage':
        // 30s stance: +50% physical damage, blocks defensive abilities
        addCharacterEffect(ctx, character.id, 'damage_up', 5n, 6n, 'Berserker Rage');
        addCharacterEffect(ctx, character.id, 'berserker_stance', 1n, 6n, 'Berserker Rage');
        appendPrivateEvent(ctx, character.id, character.ownerUserId, 'ability',
          'Berserker Rage ignites your fury! Physical damage increased. Cannot use defensive abilities.'
        );
        return;
      // ===== BARD SONG SYSTEM =====
      // All bard songs insert/update ActiveBardSong and schedule a BardSongTick if none exists.
      case 'bard_discordant_note':
      case 'bard_melody_of_mending':
      case 'bard_chorus_of_vigor':
      case 'bard_march_of_wayfarers':
      case 'bard_requiem_of_ruin': {
        const COMBAT_SONGS = ['bard_discordant_note', 'bard_requiem_of_ruin'];
        if (COMBAT_SONGS.includes(abilityKey) && (!combatId || !combat)) {
          throw new SenderError('This song can only be sung in combat.');
        }
        // Mark previous song as fading (only consider non-fading songs to avoid double-fading)
        const prevSong = [...ctx.db.active_bard_song.by_bard.filter(character.id)].find((r: any) => !r.isFading);
        if (prevSong) {
          ctx.db.active_bard_song.id.update({ ...prevSong, isFading: true });
        } else {
          // Schedule first tick 6s after cast — damage songs fire immediately on cast below,
          // so the tick loop begins at the standard 6s interval.
          ctx.db.bard_song_tick.insert({
            scheduledId: 0n,
            scheduledAt: ScheduleAt.time(nowMicros + 6_000_000n),
            bardCharacterId: character.id,
            combatId: combatId ?? undefined,
          });
        }
        // Insert new active song. The previous (fading) row is kept alive in DB
        // so it fires one final tick and then deletes itself naturally.
        ctx.db.active_bard_song.insert({
          id: 0n,
          bardCharacterId: character.id,
          combatId: combatId ?? undefined,
          songKey: abilityKey,
          startedAtMicros: nowMicros,
          isFading: false,
        });
        const songNames: Record<string, string> = {
          bard_discordant_note: 'Discordant Note',
          bard_melody_of_mending: 'Melody of Mending',
          bard_chorus_of_vigor: 'Chorus of Vigor',
          bard_march_of_wayfarers: 'March of Wayfarers',
          bard_requiem_of_ruin: 'Requiem of Ruin',
        };
        // Discordant Note deals an immediate tick on cast
        if (abilityKey === 'bard_discordant_note') {
          const activeEnemies = combatId
            ? [...ctx.db.combat_enemy.by_combat.filter(combatId)].filter((e: any) => e.currentHp > 0n)
            : [];
          const burstDmg = ((8n + character.level * 2n + character.cha) * 65n) / 100n;
          let totalDamage = 0n;
          for (const en of activeEnemies) {
            const actualDmg = en.currentHp > burstDmg ? burstDmg : en.currentHp;
            totalDamage += actualDmg;
            const nextHp = en.currentHp > burstDmg ? en.currentHp - burstDmg : 0n;
            ctx.db.combat_enemy.id.update({ ...en, currentHp: nextHp });
          }
          const freshBard = ctx.db.character.id.find(character.id);
          if (freshBard && freshBard.mana > 0n) {
            const manaCost = 3n;
            const newMana = freshBard.mana > manaCost ? freshBard.mana - manaCost : 0n;
            ctx.db.character.id.update({ ...freshBard, mana: newMana });
          }
          logPrivateAndGroup(ctx, character, 'damage', `Discordant Note deals ${totalDamage} damage to all enemies.`);
        }
        // Requiem of Ruin applies damage_taken debuff to all active enemies immediately on cast
        if (abilityKey === 'bard_requiem_of_ruin') {
          const activeEnemies = combatId
            ? [...ctx.db.combat_enemy.by_combat.filter(combatId)].filter((e: any) => e.currentHp > 0n)
            : [];
          for (const en of activeEnemies) {
            addEnemyEffect(ctx, combatId!, en.id, 'damage_taken', 3n, 1n, 'Requiem of Ruin', character.id);
          }
          logPrivateAndGroup(ctx, character, 'ability', 'Requiem of Ruin weakens all enemies, increasing damage they take.');
        }
        // Melody of Mending heals the group immediately on cast
        if (abilityKey === 'bard_melody_of_mending') {
          const healAmt = (10n * 65n) / 100n;
          let totalHealed = 0n;
          for (const member of partyMembers) {
            const fresh = ctx.db.character.id.find(member.id);
            if (!fresh) continue;
            const newHp = fresh.hp + healAmt > fresh.maxHp ? fresh.maxHp : fresh.hp + healAmt;
            totalHealed += newHp - fresh.hp;
            ctx.db.character.id.update({ ...fresh, hp: newHp });
          }
          if (totalHealed > 0n) {
            logPrivateAndGroup(ctx, character, 'heal', `Melody of Mending heals the group for ${totalHealed} health.`);
          }
        }
        appendPrivateEvent(ctx, character.id, character.ownerUserId, 'ability',
          `You begin singing ${songNames[abilityKey] ?? abilityKey}.`
        );
        return;
      }

      case 'bard_finale': {
        // Burst the active song: apply its effect once immediately
        const activeSong = [...ctx.db.active_bard_song.by_bard.filter(character.id)].find((r: any) => !r.isFading);
        if (!activeSong) {
          appendPrivateEvent(ctx, character.id, character.ownerUserId, 'ability',
            'No active song to unleash.'
          );
          return;
        }
        // Apply the current song's effect immediately once
        const bardEnemies = combatId ? [...ctx.db.combat_enemy.by_combat.filter(combatId)].filter((e: any) => e.currentHp > 0n) : [];
        switch (activeSong.songKey) {
          case 'bard_discordant_note':
            for (const tEnemy of bardEnemies) {
              const dmg = 5n + character.level;
              const nextHp = tEnemy.currentHp > dmg ? tEnemy.currentHp - dmg : 0n;
              ctx.db.combat_enemy.id.update({ ...tEnemy, currentHp: nextHp });
            }
            break;
          case 'bard_requiem_of_ruin':
            for (const tEnemy of bardEnemies) {
              addEnemyEffect(ctx, combatId!, tEnemy.id, 'damage_taken', 3n, 1n, 'Requiem of Ruin', character.id);
            }
            break;
          case 'bard_melody_of_mending':
            for (const m of partyMembers) {
              const fresh = ctx.db.character.id.find(m.id);
              if (!fresh) continue;
              const healed = fresh.hp + 10n > fresh.maxHp ? fresh.maxHp : fresh.hp + 10n;
              ctx.db.character.id.update({ ...fresh, hp: healed });
            }
            break;
          case 'bard_chorus_of_vigor':
            for (const m of partyMembers) {
              const fresh = ctx.db.character.id.find(m.id);
              if (!fresh || fresh.maxMana === 0n) continue;
              const manaGain = fresh.mana + 8n > fresh.maxMana ? fresh.maxMana : fresh.mana + 8n;
              ctx.db.character.id.update({ ...fresh, mana: manaGain });
            }
            break;
          case 'bard_march_of_wayfarers':
            for (const m of partyMembers) {
              addCharacterEffect(ctx, m.id, 'travel_discount', 3n, 2n, 'March of Wayfarers');
            }
            break;
        }
        appendPrivateEvent(ctx, character.id, character.ownerUserId, 'ability',
          'Finale! Your song crescendos in a powerful burst!'
        );
        return;
      }
      case 'enchanter_mind_fray':
        applyDamage(0n, 0n, {
          dot: { magnitude: 3n, rounds: 3n, source: 'Mind Fray' },
        });
        return;
      case 'enchanter_mesmerize':
        applyDamage(0n, 0n, {
          debuff: { type: 'stun', magnitude: 1n, rounds: 4n, source: 'Mesmerize' },
        });
        return;
      case 'enchanter_clarity':
        if (!targetCharacter) throw new SenderError('Target required');
        addCharacterEffect(ctx, targetCharacter.id, 'mana_regen_bonus', 1n, 270n, 'Clarity');
        appendPrivateEvent(ctx, character.id, character.ownerUserId, 'ability',
          `Clarity increases ${targetCharacter.name}'s mana regeneration rate for 45 minutes.`
        );
        return;
      case 'enchanter_haste':
        // Party-wide haste buff
        applyPartyEffect('haste', 1n, 5n, 'Haste');
        appendPrivateEvent(ctx, character.id, character.ownerUserId, 'ability',
          'Haste accelerates the entire party!'
        );
        return;
      case 'enchanter_bewilderment':
        // AoE AC debuff on all enemies
        if (combatId) {
          const bewilderedEnemies = [...ctx.db.combat_enemy.by_combat.filter(combatId)];
          for (const en of bewilderedEnemies) {
            if (en.currentHp === 0n) continue;
            addEnemyEffect(ctx, combatId, en.id, 'ac_bonus', -3n, 3n, 'Bewilderment', character.id);
          }
        }
        appendPrivateEvent(ctx, character.id, character.ownerUserId, 'ability',
          'Bewilderment confuses all enemies, reducing their defenses!'
        );
        return;
      case 'enchanter_charm': {
        // Spawn a charmed copy of the current enemy as a CombatPet
        if (!enemy || !combatId) throw new SenderError('You have no target to unleash this upon.');
        summonPet(
          'Charmed', `a charmed ${enemyName}`,
          [enemyName, 'Echo', 'Mirror'],
          undefined,
          {
            hpBase: enemy.maxHp / 2n > 10n ? enemy.maxHp / 2n : 10n,
            hpPerLevel: 0n,
            damageBase: enemy.attackDamage / 2n > 2n ? enemy.attackDamage / 2n : 2n,
            damagePerLevel: 0n,
            weaponScalePercent: 0n,
          }
        );
        return;
      }
      case 'cleric_mend':
        if (!targetCharacter) throw new SenderError('Target required');
        applyHeal(targetCharacter, 18n, 'Mend');
        return;
      case 'cleric_sanctify':
        // Group AC + HP regen buff ~45min
        applyPartyEffect('ac_bonus', 3n, 450n, 'Sanctify');
        applyPartyEffect('regen', 4n, 450n, 'Sanctify');
        appendPrivateEvent(ctx, character.id, character.ownerUserId, 'ability',
          'Sanctify blesses the party with divine protection.'
        );
        return;
      case 'cleric_blessing_of_might':
        // Group STR buff ~45min = 450 rounds
        applyPartyEffect('str_bonus', 3n, 450n, 'Blessing of Might');
        for (const member of partyMembers) {
          recomputeCharacterDerived(ctx, member);
        }
        appendPrivateEvent(ctx, character.id, character.ownerUserId, 'ability',
          'Blessing of Might strengthens the party with divine power.'
        );
        return;
      case 'cleric_holy_nova':
        // AoE magic damage to all enemies + heal all allies simultaneously
        applyDamage(0n, 0n);
        for (const member of partyMembers) {
          applyHeal(member, 20n, 'Holy Nova');
        }
        appendPrivateEvent(ctx, character.id, character.ownerUserId, 'ability',
          'Holy Nova erupts in divine light!'
        );
        return;
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
      case 'wizard_arcane_storm':
        applyDamage(0n, 0n);
        return;
      case 'wizard_arcane_explosion':
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
        const junk = [...ctx.db.item_template.iter()].filter((row) => row.isJunk);
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
      case 'rogue_death_mark': {
        if (!enemy || !combatId) throw new SenderError('You have no target to unleash this upon.');
        // Debuff: increases damage taken by enemy
        addEnemyEffect(ctx, combatId, enemy.id, 'damage_taken', 5n, 3n, 'Death Mark', character.id);
        appendPrivateEvent(ctx, character.id, character.ownerUserId, 'ability',
          `Death Mark condemns ${enemyName} — all damage to them increased.`
        );
        return;
      }
      case 'paladin_holy_strike':
        applyDamage(0n, 0n, { threatBonus: 5n });
        addCharacterEffect(ctx, character.id, 'ac_bonus', 2n, 2n, 'Holy Strike');
        appendPrivateEvent(ctx, character.id, character.ownerUserId, 'ability',
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
      case 'paladin_consecrated_ground': {
        // AoE DoT all enemies + HoT all allies simultaneously
        applyDamage(0n, 0n);
        for (const member of partyMembers) {
          addCharacterEffect(ctx, member.id, 'regen', 8n, 3n, 'Consecrated Ground');
        }
        appendPrivateEvent(ctx, character.id, character.ownerUserId, 'ability',
          'Consecrated Ground burns your enemies and heals your allies!'
        );
        return;
      }
      case 'ranger_marked_shot':
        applyDamage(0n, 0n, {
          debuff: { type: 'damage_taken', magnitude: 1n, rounds: 2n, source: 'Marked Shot' },
        });
        return;
      case 'ranger_track': {
        // Get all enemy spawns at the character's location
        const spawns = [...ctx.db.enemy_spawn.by_location.filter(character.locationId)];

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
          const template = ctx.db.enemy_template.id.find(spawn.enemyTemplateId);
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
      case 'ranger_rain_of_arrows':
        applyDamage(0n, 0n);
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
      case 'necromancer_wither': {
        // Life drain DoT: damages enemy AND heals caster per tick via ownerCharacterId
        if (!enemy || !combatId) throw new SenderError('You have no target to unleash this upon.');
        const witherDotDamage = 5n + character.level;
        addEnemyEffect(ctx, combatId, enemy.id, 'dot', witherDotDamage, 3n, 'Wither', character.id);
        // Find the just-inserted effect and add ownerCharacterId
        const witherEffect = [...ctx.db.combat_enemy_effect.by_enemy.filter(enemy.id)]
          .find((e: any) => e.effectType === 'dot' && e.sourceAbility === 'Wither');
        if (witherEffect) {
          ctx.db.combat_enemy_effect.id.update({ ...witherEffect, ownerCharacterId: character.id });
        }
        appendPrivateEvent(ctx, character.id, character.ownerUserId, 'ability',
          `Wither drains life from ${enemyName}.`
        );
        return;
      }
      case 'necromancer_soul_rot': {
        // DoT + AC debuff
        applyDamage(0n, 0n, {
          debuff: { type: 'ac_bonus', magnitude: -2n, rounds: 3n, source: 'Soul Rot' },
          dot: { magnitude: 4n, rounds: 3n, source: 'Soul Rot' },
        });
        return;
      }
      case 'necromancer_plague_lord_form':
        // 30s stance: marker that combat loop uses for DoT amplification
        addCharacterEffect(ctx, character.id, 'plague_lord_stance', 1n, 5n, 'Plague Lord Form');
        addCharacterEffect(ctx, character.id, 'damage_up', 4n, 5n, 'Plague Lord Form');
        appendPrivateEvent(ctx, character.id, character.ownerUserId, 'ability',
          'Plague Lord Form consumes you with dark power!'
        );
        return;
      case 'spellblade_flame_strike':
        applyDamage(0n, 0n, { dot: { magnitude: 3n, rounds: 2n, source: 'Flame Strike' } });
        return;
      case 'spellblade_frost_armor':
        addCharacterEffect(ctx, character.id, 'ac_bonus', 4n, 4n, 'Frost Armor');
        addCharacterEffect(ctx, character.id, 'damage_shield', 5n, 4n, 'Frost Armor');
        appendPrivateEvent(ctx, character.id, character.ownerUserId, 'ability',
          'Frost Armor encases you in protective ice.'
        );
        return;
      case 'spellblade_thunder_cleave':
        applyDamage(0n, 0n);
        return;
      case 'spellblade_stone_skin':
        addCharacterEffect(ctx, character.id, 'ac_bonus', 8n, 5n, 'Stone Skin');
        appendPrivateEvent(ctx, character.id, character.ownerUserId, 'ability',
          'Stone Skin hardens you like the earth itself.'
        );
        return;
      case 'spellblade_magma_shield':
        addCharacterEffect(ctx, character.id, 'ac_bonus', 5n, 5n, 'Magma Shield');
        addCharacterEffect(ctx, character.id, 'damage_shield', 8n, 5n, 'Magma Shield');
        appendPrivateEvent(ctx, character.id, character.ownerUserId, 'ability',
          'Magma Shield surrounds you in molten protection.'
        );
        return;
      case 'spellblade_elemental_surge':
        applyDamage(0n, 0n);
        return;
      case 'beastmaster_call_beast':
        summonPet(
          'Beast', 'a wild beast',
          ['Brindle', 'Moss', 'Cinder', 'Tawny', 'Thorn'],
          { key: 'pet_bleed', cooldownSeconds: 10n },
          { damageBase: 3n, damagePerLevel: 2n, weaponScalePercent: 40n }
        );
        return;
      case 'beastmaster_pack_rush':
        applyDamage(0n, 0n, {
          hits: 2n,
          hitMultiplier: 65n,
          perHitMessage: (damage: bigint, hitIndex: bigint, totalHits: bigint) =>
            `Pack Rush strikes ${enemyName} for ${damage} damage. (${hitIndex}/${totalHits})`,
        });
        return;
      case 'beastmaster_beast_fang':
        applyDamage(0n, 0n, { dot: { magnitude: 3n, rounds: 2n, source: 'Beast Fang' } });
        return;
      case 'beastmaster_wild_howl':
        applyPartyEffect('damage_up', 3n, 4n, 'Wild Howl');
        appendPrivateEvent(ctx, character.id, character.ownerUserId, 'ability',
          'Wild Howl emboldens you and your beast!'
        );
        return;
      case 'beastmaster_alpha_assault':
        applyDamage(0n, 0n);
        return;
      case 'beastmaster_wild_hunt':
        // Pet AoE: applies AoE damage from the character (acting as pet-proxy)
        applyDamage(0n, 0n);
        appendPrivateEvent(ctx, character.id, character.ownerUserId, 'ability',
          'Wild Hunt! Your beast ravages all enemies!'
        );
        return;
      case 'monk_crippling_kick':
        applyDamage(0n, 0n, {
          debuff: { type: 'damage_down', magnitude: -2n, rounds: 2n, source: 'Crippling Kick' },
        });
        return;
      case 'monk_stunning_strike':
        // Physical damage + stun
        applyDamage(0n, 0n, {
          debuff: { type: 'stun', magnitude: 1n, rounds: 4n, source: 'Stunning Strike' },
        });
        return;
      case 'monk_centering': {
        // Restore stamina directly
        const latestChar = ctx.db.character.id.find(character.id);
        if (latestChar) {
          const restored = latestChar.stamina + 15n > latestChar.maxStamina
            ? latestChar.maxStamina
            : latestChar.stamina + 15n;
          ctx.db.character.id.update({ ...latestChar, stamina: restored });
        }
        appendPrivateEvent(ctx, character.id, character.ownerUserId, 'ability',
          'Centering restores your inner energy.'
        );
        return;
      }
      case 'monk_inner_focus':
        addCharacterEffect(ctx, character.id, 'damage_up', 3n, 3n, 'Inner Focus');
        appendPrivateEvent(ctx, character.id, character.ownerUserId, 'ability',
          'Inner Focus sharpens your combat senses.'
        );
        return;
      case 'monk_tiger_flurry':
        applyDamage(0n, 0n, { hits: 3n });
        return;
      case 'monk_hundred_fists':
        applyDamage(0n, 0n, {
          hits: 5n,
          perHitMessage: (damage: bigint, hitIndex: bigint, totalHits: bigint) =>
            `Hundred Fists strikes ${enemyName} for ${damage} damage. (${hitIndex}/${totalHits})`,
        });
        return;
      case 'druid_thorn_lash':
        applyDamage(0n, 0n, { dot: { magnitude: 2n, rounds: 2n, source: 'Thorn Lash' } });
        applyHeal(character, 6n, 'Thorn Lash');
        return;
      case 'druid_natures_mark': {
        if (activeCombatIdForCharacter(ctx, character.id)) {
          throw new SenderError('Cannot use while in combat');
        }
        // Re-read character from database to ensure fresh location/state data
        const freshChar = ctx.db.character.id.find(character.id);
        if (!freshChar) {
          throw new SenderError('Character not found');
        }
        const location = ctx.db.location.id.find(freshChar.locationId);
        if (!location) throw new SenderError('Location not found');
        const region = ctx.db.region.id.find(location.regionId);
        const dm = region?.dangerMultiplier ?? 100n;
        const gatherZoneTier = dm < 130n ? 1 : dm < 190n ? 2 : 3;
        const pool = getGatherableResourceTemplates(ctx, location.terrainType ?? 'plains', undefined, gatherZoneTier);
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
      case 'druid_entangle':
        applyDamage(0n, 0n);
        return;
      case 'druid_shapeshifter_form':
        // +40% physical damage for ~5 rounds (30s), temp HP buffer as hp_bonus
        addCharacterEffect(ctx, character.id, 'damage_up', 4n, 5n, 'Shapeshifter Form');
        addCharacterEffect(ctx, character.id, 'shapeshifter_stance', 1n, 5n, 'Shapeshifter Form');
        applyHpBonus(ctx, character, 20n, 5n, 'Shapeshifter Form');
        appendPrivateEvent(ctx, character.id, character.ownerUserId, 'ability',
          'You shift into a primal beast form! Physical damage increased.'
        );
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
        addCharacterEffect(ctx, character.id, 'damage_up', 4n, 4n, 'Blood Pact');
        appendPrivateEvent(ctx, character.id, character.ownerUserId, 'ability',
          'Blood Pact fuels your dark power.'
        );
        return;
      case 'reaver_soul_rend':
        applyDamage(0n, 0n);
        return;
      case 'reaver_dread_aura':
        // AoE debuff all enemies
        if (combatId) {
          const dreadEnemies = [...ctx.db.combat_enemy.by_combat.filter(combatId)];
          for (const en of dreadEnemies) {
            if (en.currentHp === 0n) continue;
            addEnemyEffect(ctx, combatId, en.id, 'damage_down', -3n, 3n, 'Dread Aura', character.id);
          }
        }
        appendPrivateEvent(ctx, character.id, character.ownerUserId, 'ability',
          'Dread Aura weakens all enemies around you.'
        );
        return;
      case 'reaver_oblivion':
        applyDamage(0n, 0n);
        return;
      case 'reaver_deaths_embrace':
        // 30s stance: lifesteal + damage_up
        addCharacterEffect(ctx, character.id, 'deaths_embrace_stance', 1n, 5n, "Death's Embrace");
        addCharacterEffect(ctx, character.id, 'damage_up', 3n, 5n, "Death's Embrace");
        appendPrivateEvent(ctx, character.id, character.ownerUserId, 'ability',
          "Death's Embrace empowers you with dark vitality!"
        );
        return;
      case 'summoner_earth_elemental':
        summonPet(
          'Earth Elemental', 'an earth elemental',
          ['Granite', 'Boulder', 'Stone', 'Clay', 'Bedrock'],
          { key: 'pet_taunt', cooldownSeconds: 8n },
          // High HP tank with enough damage to generate meaningful aggro between taunts
          { hpBase: 50n, hpPerLevel: 12n, damageBase: 5n, damagePerLevel: 2n, weaponScalePercent: 40n }
        );
        return;
      case 'summoner_fire_elemental':
        summonPet(
          'Fire Elemental', 'a fire elemental',
          ['Ember', 'Blaze', 'Scorch', 'Cinder', 'Pyre'],
          undefined,
          { hpBase: 30n, hpPerLevel: 6n, damageBase: 5n, damagePerLevel: 4n, weaponScalePercent: 60n }
        );
        return;
      case 'summoner_water_elemental':
        // Water elemental with heal ability
        summonPet(
          'Water Elemental', 'a water elemental',
          ['Tide', 'Current', 'Flow', 'Rill', 'Mist'],
          { key: 'pet_heal', cooldownSeconds: 6n },
          { hpBase: 40n, hpPerLevel: 8n, damageBase: 3n, damagePerLevel: 2n, weaponScalePercent: 30n }
        );
        return;
      case 'summoner_primal_titan':
        summonPet(
          'Primal Titan', 'the Primal Titan',
          ['Titan', 'Colossus', 'Ancient'],
          { key: 'pet_aoe_heal', cooldownSeconds: 6n },
          { hpBase: 60n, hpPerLevel: 20n, damageBase: 6n, damagePerLevel: 4n, weaponScalePercent: 70n },
          90n
        );
        appendPrivateEvent(ctx, character.id, character.ownerUserId, 'ability',
          'The Primal Titan answers your call!'
        );
        return;
      case 'summoner_redirect': {
        // Pull all enemy aggro off the active pet and onto the summoner.
        if (!combatId) throw new SenderError('You must be in combat to use Redirect.');
        const myPets = [...ctx.db.active_pet.by_character.filter(character.id)]
          .filter((p: any) => p.combatId === combatId);
        if (myPets.length === 0) throw new SenderError('You have no active pet to redirect from.');
        const combatEnemies = [...ctx.db.combat_enemy.by_combat.filter(combatId)];
        let redirected = 0;
        for (const petRow of myPets) {
          for (const e of combatEnemies) {
            if (e.currentHp <= 0n) continue;
            // Force this enemy to target the summoner instead of the pet
            if (e.aggroTargetPetId === petRow.id) {
              ctx.db.combat_enemy.id.update({
                ...e,
                aggroTargetCharacterId: character.id,
                aggroTargetPetId: undefined,
              });
              redirected++;
            }
            // Transfer the pet's aggro value to the summoner so they stay top of the list
            const petEntry = [...ctx.db.aggro_entry.by_enemy.filter(e.id)]
              .find((a: any) => a.petId === petRow.id && a.characterId === character.id);
            if (petEntry) {
              const myEntry = [...ctx.db.aggro_entry.by_enemy.filter(e.id)]
                .find((a: any) => !a.petId && a.characterId === character.id);
              if (myEntry) {
                ctx.db.aggro_entry.id.update({ ...myEntry, value: myEntry.value + petEntry.value });
                ctx.db.aggro_entry.id.delete(petEntry.id);
              } else {
                ctx.db.aggro_entry.id.update({ ...petEntry, petId: undefined });
              }
            }
          }
        }
        const msg = redirected > 0
          ? 'You draw all enemy attention to yourself!'
          : 'You steel yourself, drawing enemy focus.';
        appendPrivateEvent(ctx, character.id, character.ownerUserId, 'ability', msg);
        if (actorGroupId) logGroup('ability', `${character.name} uses Redirect, drawing enemy aggro.`);
        return;
      }
      case 'summoner_conjure_sustenance': {
        // Give all party members food items from existing templates
        const bandageTemplate = [...ctx.db.item_template.iter()].find(
          (t: any) => t.name.toLowerCase().includes('bandage')
        );
        const foodTemplate = [...ctx.db.item_template.iter()].find(
          (t: any) => t.isJunk === false && t.wellFedDurationMicros > 0n
        );
        let conjured = 0;
        for (const member of partyMembers) {
          if (bandageTemplate && hasInventorySpace(ctx, member.id, bandageTemplate.id)) {
            addItemToInventory(ctx, member.id, bandageTemplate.id, 10n);
            conjured++;
          }
          if (foodTemplate && hasInventorySpace(ctx, member.id, foodTemplate.id)) {
            addItemToInventory(ctx, member.id, foodTemplate.id, 5n);
          }
        }
        appendPrivateEvent(ctx, character.id, character.ownerUserId, 'ability',
          `Conjure Sustenance provides supplies to ${conjured} party members.`
        );
        return;
      }
      case 'summoner_conjure_equipment': {
        // Create temporary weapon and armor items marked isTemporary=true
        const weaponCandidates = [...ctx.db.item_template.iter()].filter(
          (t: any) => t.slot === 'mainHand' && !t.isJunk
        );
        const armorCandidates = [...ctx.db.item_template.iter()].filter(
          (t: any) => t.slot === 'chest' && !t.isJunk
        );
        const seed = nowMicros + character.id;
        const weaponTpl = weaponCandidates.length > 0
          ? weaponCandidates[Number(seed % BigInt(weaponCandidates.length))]
          : null;
        const armorTpl = armorCandidates.length > 0
          ? armorCandidates[Number((seed + 7n) % BigInt(armorCandidates.length))]
          : null;
        if (weaponTpl && hasInventorySpace(ctx, character.id, weaponTpl.id)) {
          ctx.db.item_instance.insert({
            id: 0n,
            templateId: weaponTpl.id,
            ownerCharacterId: character.id,
            equippedSlot: undefined,
            quantity: 1n,
            qualityTier: 'uncommon',
            craftQuality: undefined,
            displayName: `Conjured ${weaponTpl.name}`,
            isNamed: undefined,
            isTemporary: true,
          });
        }
        if (armorTpl && hasInventorySpace(ctx, character.id, armorTpl.id)) {
          ctx.db.item_instance.insert({
            id: 0n,
            templateId: armorTpl.id,
            ownerCharacterId: character.id,
            equippedSlot: undefined,
            quantity: 1n,
            qualityTier: 'uncommon',
            craftQuality: undefined,
            displayName: `Conjured ${armorTpl.name}`,
            isNamed: undefined,
            isTemporary: true,
          });
        }
        appendPrivateEvent(ctx, character.id, character.ownerUserId, 'ability',
          'Conjure Equipment materializes temporary gear.'
        );
        return;
      }
      default:
        appendPrivateEvent(
          ctx,
          character.id,
          character.ownerUserId,
          'ability',
          `You use ${ability.name}.`
        );
    }
  }; // end runAbility
  runAbility();

  // Ability fired successfully — now consume resources
  if (staminaFreeEffectId !== undefined) {
    ctx.db.character_effect.id.delete(staminaFreeEffectId);
  }
  if (ability.resource === 'mana') {
    const latest = ctx.db.character.id.find(character.id);
    if (latest) ctx.db.character.id.update({ ...latest, mana: character.mana - resourceCost });
  } else if (ability.resource === 'stamina') {
    const latest = ctx.db.character.id.find(character.id);
    if (latest) ctx.db.character.id.update({ ...latest, stamina: character.stamina - resourceCost });
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
    const gearMR = getEquippedBonuses(ctx, target.id).magicResistanceBonus;
    const magicResist = sumCharacterEffect(ctx, target.id, 'magic_resist') + (target.racialMagicResist ?? 0n) + gearMR;
    finalDamage = applyMagicResistMitigation(rawDamage, magicResist);
  }
  finalDamage = applyVariance(finalDamage, target.id + BigInt(abilityName.length) * 1009n);
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
  targetCharacterId?: bigint,
  targetPetId?: bigint
) {
  const combat = ctx.db.combat_encounter.id.find(combatId);
  if (!combat || combat.state !== 'active') return;
  const ability = ENEMY_ABILITIES[abilityKey as keyof typeof ENEMY_ABILITIES];
  if (!ability) return;
  const desc = (ability as any).description ?? '';
  const enemy = ctx.db.combat_enemy.id.find(enemyId);
  if (!enemy) return;
  const enemyTemplate = ctx.db.enemy_template.id.find(enemy.enemyTemplateId);
  const enemyName = enemy.displayName ?? enemyTemplate?.name ?? 'Enemy';

  // If ability targets a pet, route to pet instead of character
  if (targetPetId) {
    const pet = ctx.db.active_pet.id.find(targetPetId);
    if (!pet || pet.currentHp === 0n) return;
    const owner = ctx.db.character.id.find(pet.characterId);
    if (!owner) return;

    // Calculate power for this enemy ability
    const enemyLevel = enemyTemplate?.level ?? 1n;
    const abilityPower = (ability as any).power ?? 3n;
    const enemyPower = ENEMY_BASE_POWER + (enemyLevel * ENEMY_LEVEL_POWER_SCALING);
    const totalPower = enemyPower + abilityPower * 5n;
    const rawDamage = applyVariance(totalPower, enemyId + pet.id + 6173n);
    const newHp = pet.currentHp > rawDamage ? pet.currentHp - rawDamage : 0n;
    ctx.db.active_pet.id.update({ ...pet, currentHp: newHp });

    // Log pet being targeted
    const privateMessage = `${enemyName} uses ${ability.name} on ${pet.name} for ${rawDamage}.`;
    appendPrivateEvent(ctx, owner.id, owner.ownerUserId, 'damage', privateMessage);
    if (owner.groupId) {
      appendGroupEvent(ctx, owner.groupId, owner.id, 'damage', `${enemyName} uses ${ability.name} on ${pet.name} for ${rawDamage}.`);
    }

    // Handle pet death
    if (newHp === 0n) {
      const deathMsg = `${pet.name} has been slain!`;
      appendPrivateEvent(ctx, owner.id, owner.ownerUserId, 'combat', deathMsg);
      if (owner.groupId) {
        appendGroupEvent(ctx, owner.groupId, owner.id, 'combat', deathMsg);
      }
      // Remove pet's aggro entries
      for (const entry of ctx.db.aggro_entry.by_combat.filter(combatId)) {
        if (entry.petId && entry.petId === pet.id) {
          ctx.db.aggro_entry.id.delete(entry.id);
        }
      }
      // Delete the pet
      ctx.db.active_pet.id.delete(pet.id);
    }
    return;
  }

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
    const dotPerTick = (ability as any).rounds > 0n ? dotTotalDamage / (ability as any).rounds : dotTotalDamage;

    // Apply direct damage with armor/magic resist routing
    let actualDamage = 0n;
    if (directDamage > 0n) {
      actualDamage = applyEnemyAbilityDamage(ctx, target, directDamage, damageType, enemyName, ability.name);
    }

    // Apply DoT via existing CharacterEffect system (tick_hot reducer handles it)
    if (dotPerTick > 0n) {
      addCharacterEffect(ctx, target.id, 'dot', dotPerTick, (ability as any).rounds, ability.name);
    }

    // Log messages
    const dmgMsg = actualDamage > 0n ? ` for ${actualDamage}` : '';
    const privateMessage = desc
      ? `${enemyName} uses ${ability.name} on you${dmgMsg}. ${desc}`
      : `${enemyName} uses ${ability.name} on you${dmgMsg}.`;
    const groupMessage = desc
      ? `${enemyName} uses ${ability.name} on ${target.name}${dmgMsg}. ${desc}`
      : `${enemyName} uses ${ability.name} on ${target.name}${dmgMsg}.`;
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
    addCharacterEffect(ctx, target.id, effectType, (ability as any).magnitude, (ability as any).rounds, ability.name);

    // Log messages
    const dmgMsg = actualDamage > 0n ? ` for ${actualDamage} and` : '';
    const privateMessage = desc
      ? `${enemyName} uses ${ability.name}${dmgMsg} afflicts you. ${desc}`
      : `${enemyName} uses ${ability.name}${dmgMsg} afflicts you.`;
    const groupMessage = desc
      ? `${enemyName} uses ${ability.name}${dmgMsg} afflicts ${target.name}. ${desc}`
      : `${enemyName} uses ${ability.name}${dmgMsg} afflicts ${target.name}.`;
    appendPrivateEvent(ctx, target.id, target.ownerUserId, 'ability', privateMessage);
    if (target.groupId) {
      appendGroupEvent(ctx, target.groupId, target.id, 'ability', groupMessage);
    }
  } else if (ability.kind === 'heal') {
    const allies = [...ctx.db.combat_enemy.by_combat.filter(combatId)]
      .filter((e: any) => e.currentHp > 0n);
    if (allies.length === 0) return;

    // Find lowest HP ally
    let healTarget = allies[0];
    for (const ally of allies) {
      if (ally.currentHp < healTarget.currentHp) healTarget = ally;
    }

    const healPowerSplit = (ability as any).healPowerSplit ?? 1.0;
    const directHeal = (totalPower * BigInt(Math.floor(healPowerSplit * 100))) / 100n;

    // Cap at maxHp (use computed combat maxHp from combatEnemy row, not stale template value)
    const maxHp = healTarget.maxHp;
    const nextHp = healTarget.currentHp + directHeal > maxHp ? maxHp : healTarget.currentHp + directHeal;
    ctx.db.combat_enemy.id.update({ ...healTarget, currentHp: nextHp });

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
    const healTargetName = healTarget.displayName ?? 'an ally';
    const healMsg = desc
      ? `${enemyName} heals ${healTargetName} for ${directHeal}. ${desc}`
      : `${enemyName} heals ${healTargetName} for ${directHeal}.`;
    for (const participant of ctx.db.combat_participant.by_combat.filter(combatId)) {
      if (participant.status !== 'active') continue;
      const pc = ctx.db.character.id.find(participant.characterId);
      if (!pc) continue;
      appendPrivateEvent(ctx, pc.id, pc.ownerUserId, 'combat', healMsg);
    }
    const firstActive = [...ctx.db.combat_participant.by_combat.filter(combatId)]
      .find((p: any) => p.status === 'active');
    if (firstActive) {
      const pc = ctx.db.character.id.find(firstActive.characterId);
      if (pc?.groupId) {
        appendGroupEvent(ctx, pc.groupId, pc.id, 'combat', healMsg);
      }
    }
  } else if (ability.kind === 'aoe_damage') {
    const damageType = (ability as any).damageType ?? 'magic';
    const perTargetDamage = (totalPower * AOE_DAMAGE_MULTIPLIER) / 100n;

    // Hit all active participants
    for (const participant of ctx.db.combat_participant.by_combat.filter(combatId)) {
      if (participant.status !== 'active') continue;
      const pc = ctx.db.character.id.find(participant.characterId);
      if (!pc || pc.hp === 0n) continue;

      const actualDamage = applyEnemyAbilityDamage(ctx, pc, perTargetDamage, damageType, enemyName, ability.name);

      appendPrivateEvent(ctx, pc.id, pc.ownerUserId, 'damage',
        desc
          ? `${enemyName} hits you with ${ability.name} for ${actualDamage}. ${desc}`
          : `${enemyName} hits you with ${ability.name} for ${actualDamage}.`);
      if (pc.groupId) {
        appendGroupEvent(ctx, pc.groupId, pc.id, 'damage',
          desc
            ? `${enemyName} hits ${pc.name} with ${ability.name} for ${actualDamage}. ${desc}`
            : `${enemyName} hits ${pc.name} with ${ability.name} for ${actualDamage}.`);
      }
    }
  } else if (ability.kind === 'buff') {
    const effectType = (ability as any).effectType ?? 'damage_bonus';
    const magnitude = (ability as any).magnitude ?? 3n;
    const rounds = (ability as any).rounds ?? 3n;

    // Buff all living enemy allies
    for (const ally of ctx.db.combat_enemy.by_combat.filter(combatId)) {
      if (ally.currentHp <= 0n) continue;
      addEnemyEffect(ctx, combatId, ally.id, effectType, magnitude, rounds, ability.name);
    }

    // Log buff event
    const buffMsg = desc
      ? `${enemyName} rallies allies with ${ability.name}! ${desc}`
      : `${enemyName} rallies allies with ${ability.name}!`;
    for (const participant of ctx.db.combat_participant.by_combat.filter(combatId)) {
      if (participant.status !== 'active') continue;
      const pc = ctx.db.character.id.find(participant.characterId);
      if (!pc) continue;
      appendPrivateEvent(ctx, pc.id, pc.ownerUserId, 'combat', buffMsg);
    }
    const firstActive = [...ctx.db.combat_participant.by_combat.filter(combatId)]
      .find((p: any) => p.status === 'active');
    if (firstActive) {
      const pc = ctx.db.character.id.find(firstActive.characterId);
      if (pc?.groupId) {
        appendGroupEvent(ctx, pc.groupId, pc.id, 'combat', buffMsg);
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
  const combat = ctx.db.combat_encounter.id.find(combatId);
  if (!combat || combat.state !== 'active') return false;
  const pet = ctx.db.active_pet.id.find(petId);
  if (!pet) return false;
  const owner = ctx.db.character.id.find(pet.characterId);
  if (!owner || owner.hp === 0n) return false;

  const actorGroupId = effectiveGroupId(owner);

  if (abilityKey === 'pet_heal') {
    // Find the lowest-HP living party member among combat participants
    let healTarget: any = null;
    let lowestHpRatio = 101n; // > 100 to ensure first candidate wins
    let healTargetIsPet = false;

    for (const participant of ctx.db.combat_participant.by_combat.filter(combatId)) {
      if (participant.status !== 'active') continue;
      const member = ctx.db.character.id.find(participant.characterId);
      if (!member || member.hp === 0n || member.hp >= member.maxHp) continue;
      // Use integer ratio comparison: hp * 100 / maxHp
      const ratio = (member.hp * 100n) / member.maxHp;
      if (ratio < lowestHpRatio) {
        lowestHpRatio = ratio;
        healTarget = member;
        healTargetIsPet = false;
      }
    }

    // Consider the pet itself as a heal candidate
    if (pet.currentHp > 0n && pet.currentHp < pet.maxHp) {
      const petRatio = (pet.currentHp * 100n) / pet.maxHp;
      if (petRatio < lowestHpRatio) {
        lowestHpRatio = petRatio;
        healTarget = pet;
        healTargetIsPet = true;
      }
    }

    // Also consider the owner if they're injured and not already found via participants
    if (!healTarget && owner.hp > 0n && owner.hp < owner.maxHp) {
      healTarget = owner;
    }

    if (!healTarget) return false; // Everyone is full HP

    const healAmount = 10n + pet.level * 5n;
    const targetCurrentHp = healTargetIsPet ? healTarget.currentHp : healTarget.hp;
    const newHp = targetCurrentHp + healAmount > healTarget.maxHp
      ? healTarget.maxHp
      : targetCurrentHp + healAmount;
    if (healTargetIsPet) {
      ctx.db.active_pet.id.update({ ...healTarget, currentHp: newHp });
    } else {
      ctx.db.character.id.update({ ...healTarget, hp: newHp });
    }

    const message = `${pet.name} heals ${healTarget.name} for ${healAmount}.`;
    appendPrivateEvent(ctx, owner.id, owner.ownerUserId, 'ability', message);
    if (actorGroupId) {
      appendGroupEvent(ctx, actorGroupId, owner.id, 'ability', message);
    }
    return true;
  }

  if (abilityKey === 'pet_aoe_heal') {
    const healAmount = 10n + pet.level * 5n;
    let healedCount = 0n;

    // Heal owner first if injured
    if (owner.hp > 0n && owner.hp < owner.maxHp) {
      const newHp = owner.hp + healAmount > owner.maxHp ? owner.maxHp : owner.hp + healAmount;
      ctx.db.character.id.update({ ...owner, hp: newHp });
      healedCount++;
    }

    // Heal all active combat participants (party members)
    for (const participant of ctx.db.combat_participant.by_combat.filter(combatId)) {
      if (participant.status !== 'active') continue;
      const member = ctx.db.character.id.find(participant.characterId);
      if (!member || member.hp === 0n || member.hp >= member.maxHp) continue;
      if (member.id === owner.id) continue; // already healed above
      const newHp = member.hp + healAmount > member.maxHp ? member.maxHp : member.hp + healAmount;
      ctx.db.character.id.update({ ...member, hp: newHp });
      healedCount++;
    }

    // Also heal the pet itself if injured
    if (pet.currentHp > 0n && pet.currentHp < pet.maxHp) {
      const newPetHp = pet.currentHp + healAmount > pet.maxHp ? pet.maxHp : pet.currentHp + healAmount;
      ctx.db.active_pet.id.update({ ...pet, currentHp: newPetHp });
      healedCount++;
    }

    if (healedCount === 0n) return false; // Nothing to heal

    const message = `${pet.name} heals the party for ${healAmount}!`;
    appendPrivateEvent(ctx, owner.id, owner.ownerUserId, 'ability', message);
    if (actorGroupId) {
      appendGroupEvent(ctx, actorGroupId, owner.id, 'ability', message);
    }
    return true;
  }

  const target =
    (targetEnemyId ? ctx.db.combat_enemy.id.find(targetEnemyId) : null) ??
    (pet.targetEnemyId ? ctx.db.combat_enemy.id.find(pet.targetEnemyId) : null);
  if (!target || target.currentHp === 0n) return false;

  if (abilityKey === 'pet_taunt') {
    let maxAggro = 0n;
    let petEntry: typeof AggroEntry.rowType | null = null;
    for (const entry of ctx.db.aggro_entry.by_combat.filter(combatId)) {
      if (entry.enemyId !== target.id) continue;
      if (entry.value > maxAggro) maxAggro = entry.value;
      if (entry.petId && entry.petId === pet.id) petEntry = entry;
    }
    const newValue = maxAggro + 20n;
    if (petEntry) {
      ctx.db.aggro_entry.id.update({ ...petEntry, value: newValue });
    } else {
      ctx.db.aggro_entry.insert({
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
    ctx.db.combat_enemy.id.update({
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
      targetPetId?: bigint;
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
      args.targetCharacterId,
      args.targetPetId
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

export function scheduleCombatTick(ctx: any, combatId: bigint) {
  const nextAt = ctx.timestamp.microsSinceUnixEpoch + COMBAT_LOOP_INTERVAL_MICROS;
  ctx.db.combat_loop_tick.insert({
    scheduledId: 0n,
    scheduledAt: ScheduleAt.time(nextAt),
    combatId,
  });
}


