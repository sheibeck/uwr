import { SenderError } from 'spacetimedb/server';
import { Timestamp, ScheduleAt } from 'spacetimedb';
// normalizeClassName no longer needed — ability ownership checked by characterId
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
  ABILITY_DAMAGE_SCALER,
  MANA_COST_MULTIPLIER,
  MANA_MIN_CAST_SECONDS,
  HEALING_POWER_SCALER,
} from '../data/combat_scaling';
import { effectiveGroupId } from './group';
import { appendPrivateEvent, appendGroupEvent, logPrivateAndGroup, fail } from './events';
import { getEquippedWeaponStats, getEquippedBonuses } from './items';
import { partyMembersInLocation } from './character';
import { AggroEntry } from '../schema/tables';
import {
  COMBAT_LOOP_INTERVAL_MICROS,
  AUTO_ATTACK_INTERVAL,
  GROUP_SIZE_DANGER_BASE,
  GROUP_SIZE_BIAS_RANGE,
  GROUP_SIZE_BIAS_MAX,
} from '../data/combat_constants';
import { applyArmorMitigation, applyVariance, scaleByPercent } from './combat_enemies';

const GLOBAL_COOLDOWN_MICROS = 1_500_000n;

// Helper: check if character has healing abilities (for threat reduction)
function hasHealingAbilities(ctx: any, characterId: bigint): boolean {
  for (const ability of ctx.db.ability_template.by_character.filter(characterId)) {
    if (ability.kind === 'heal' || ability.kind === 'group_heal') return true;
  }
  return false;
}

// Helper: check if character has a shield equipped (for tank threat)
function hasShieldForThreat(ctx: any, characterId: bigint): boolean {
  for (const instance of ctx.db.item_instance.by_owner.filter(characterId)) {
    if (instance.equippedSlot === 'offHand') {
      const template = ctx.db.item_template.id.find(instance.templateId);
      if (template && template.armorType === 'shield') return true;
    }
  }
  return false;
}

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

export function abilityResourceCost(level: bigint, power: bigint, resourceType?: string) {
  let cost = 4n + level * 2n + power;
  if (resourceType === 'mana') {
    cost = (cost * MANA_COST_MULTIPLIER) / 100n;
  }
  return cost;
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

export function abilityCooldownMicros(ctx: any, abilityTemplateId: bigint) {
  const ability = ctx.db.ability_template.id.find(abilityTemplateId);
  if (!ability) return GLOBAL_COOLDOWN_MICROS;
  const specific = ability.cooldownSeconds ? ability.cooldownSeconds * 1_000_000n : 0n;
  return specific > GLOBAL_COOLDOWN_MICROS ? specific : GLOBAL_COOLDOWN_MICROS;
}

export function abilityCastMicros(ctx: any, abilityTemplateId: bigint) {
  const ability = ctx.db.ability_template.id.find(abilityTemplateId);
  if (!ability) return 0n;
  let castSeconds = ability.castSeconds ?? 0n;
  // Enforce mana cast time floor
  if (ability.resourceType === 'mana' && castSeconds < MANA_MIN_CAST_SECONDS) {
    castSeconds = MANA_MIN_CAST_SECONDS;
  }
  return castSeconds > 0n ? castSeconds * 1_000_000n : 0n;
}

export function enemyAbilityCastMicros(ctx: any, enemyAbilityId: bigint) {
  const ability = ctx.db.enemy_ability.id.find(enemyAbilityId);
  if (ability?.castSeconds) return ability.castSeconds * 1_000_000n;
  return 0n;
}

export function enemyAbilityCooldownMicros(ctx: any, enemyAbilityId: bigint) {
  const ability = ctx.db.enemy_ability.id.find(enemyAbilityId);
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
  // Emit buff/debuff application event
  const BUFF_TYPES = ['regen', 'damage_up', 'armor_up', 'ac_bonus', 'damage_shield', 'hp_bonus', 'magic_resist', 'stamina_free'];
  const DEBUFF_TYPES = ['dot', 'armor_down', 'stun'];
  const character = ctx.db.character.id.find(characterId);
  if (character) {
    if (BUFF_TYPES.includes(effectType) && effectType !== 'regen') {
      appendPrivateEvent(ctx, character.id, character.ownerUserId, 'buff',
        `${sourceAbility} grants ${effectType}${magnitude > 0n ? ' +' + magnitude : ''} for ${roundsRemaining} rounds.`);
    } else if (DEBUFF_TYPES.includes(effectType) && effectType !== 'dot') {
      appendPrivateEvent(ctx, character.id, character.ownerUserId, 'debuff',
        `${sourceAbility} afflicts you with ${effectType} for ${roundsRemaining} rounds.`);
    }
  }

  // Apply the first tick immediately for DoTs so the effect is felt on cast.
  // Regen (HoT) does NOT get an immediate tick here — the resolveAbility 'hot' handler
  // already applies a direct heal. Subsequent regen ticks are handled by tick_hot scheduler.
  if (effectType === 'dot') {
    if (character && character.hp > 0n) {
      if (effectType === 'regen') {
        const healed = character.hp + magnitude > character.maxHp ? character.maxHp : character.hp + magnitude;
        ctx.db.character.id.update({ ...character, hp: healed });
        appendPrivateEvent(ctx, character.id, character.ownerUserId, 'heal',
          `${sourceAbility} soothes you for ${magnitude} HP.`);
      } else {
        const nextHp = character.hp > magnitude ? character.hp - magnitude : 0n;
        ctx.db.character.id.update({ ...character, hp: nextHp });
        appendPrivateEvent(ctx, character.id, character.ownerUserId, 'damage',
          `You suffer ${magnitude} damage from ${sourceAbility}.`);
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

// ===========================================================================
// UNIFIED ABILITY DISPATCH MAP — All abilities resolve through kind
// ===========================================================================

export type AbilityActor = {
  type: 'character' | 'enemy';
  id: bigint;
  stats: { str: bigint; dex: bigint; int: bigint; wis: bigint; cha: bigint };
  level: bigint;
  name: string;
};

export type AbilityRow = {
  id: bigint;
  kind: string;
  targetRule: string;
  value1: bigint;
  value2?: bigint;
  damageType?: string;
  scaling: string;
  effectType?: string;
  effectMagnitude?: bigint;
  effectDuration?: bigint;
  name: string;
  resourceType: string;
  resourceCost: bigint;
  cooldownSeconds: bigint;
  castSeconds: bigint;
};

/**
 * Unified ability resolution. Called by both player and enemy ability paths.
 * Dispatches on ability.kind to generic handlers.
 */
export function resolveAbility(
  ctx: any,
  combatId: bigint | null,
  actor: AbilityActor,
  ability: AbilityRow,
  targetCharacterId?: bigint,
  targetPetId?: bigint
) {
  const combat = combatId ? ctx.db.combat_encounter.id.find(combatId) : null;
  const enemies = combatId ? [...ctx.db.combat_enemy.by_combat.filter(combatId)] : [];
  const actorGroupId = actor.type === 'character'
    ? effectiveGroupId(ctx.db.character.id.find(actor.id))
    : null;
  const nowMicros = ctx.timestamp.microsSinceUnixEpoch;

  // Find the primary enemy target for damage/debuff abilities
  const findEnemyTarget = () => {
    if (actor.type === 'character') {
      const character = ctx.db.character.id.find(actor.id);
      const preferredEnemy = character?.combatTargetEnemyId
        ? enemies.find((row: any) => row.id === character.combatTargetEnemyId)
        : null;
      return preferredEnemy ?? enemies.find((row: any) => row.currentHp > 0n) ?? enemies[0] ?? null;
    }
    return enemies.find((row: any) => row.currentHp > 0n) ?? null;
  };

  const getEnemyName = (enemy: any) => {
    if (!enemy) return 'enemy';
    const template = ctx.db.enemy_template.id.find(enemy.enemyTemplateId);
    return enemy.displayName ?? template?.name ?? 'enemy';
  };

  // Helper to apply damage to an enemy (physical/magic routing, armor/resist)
  const applyDamageToEnemy = (enemy: any, rawDamage: bigint, dmgType: string): bigint => {
    if (!enemy || !combatId) return 0n;
    let finalDamage = rawDamage;
    if (dmgType === 'physical' || (!dmgType || dmgType === 'none')) {
      let armor = enemy.armorClass;
      const armorDebuff = sumEnemyEffect(ctx, combatId, 'armor_down', enemy.id);
      if (armorDebuff !== 0n) {
        armor = armor + armorDebuff;
        if (armor < 0n) armor = 0n;
      }
      finalDamage = applyArmorMitigation(rawDamage, armor);
    } else {
      // Magic damage types (arcane, divine, nature, fire, ice, shadow)
      finalDamage = rawDamage > 0n ? rawDamage : 1n;
    }
    finalDamage = applyVariance(finalDamage, nowMicros + actor.id + enemy.id);
    if (finalDamage < 1n) finalDamage = 1n;
    const nextHp = enemy.currentHp > finalDamage ? enemy.currentHp - finalDamage : 0n;
    ctx.db.combat_enemy.id.update({ ...enemy, currentHp: nextHp });

    // Update aggro — derive threat multiplier from character data, not class name
    for (const entry of ctx.db.aggro_entry.by_combat.filter(combatId)) {
      if (entry.characterId === actor.id && entry.enemyId === enemy.id && !entry.petId) {
        let threatMult = 100n;
        if (actor.type === 'character') {
          if (hasShieldForThreat(ctx, actor.id)) threatMult = TANK_THREAT_MULTIPLIER;
          else if (hasHealingAbilities(ctx, actor.id)) threatMult = HEALER_THREAT_MULTIPLIER;
        }
        ctx.db.aggro_entry.id.update({ ...entry, value: entry.value + (finalDamage * threatMult) / 100n });
        break;
      }
    }
    return finalDamage;
  };

  // Helper to apply damage to a character (for enemy abilities targeting players)
  const applyDamageToCharacter = (target: any, rawDamage: bigint, dmgType: string): bigint => {
    return applyEnemyAbilityDamage(ctx, target, rawDamage, dmgType, actor.name, ability.name);
  };

  // Helper to calculate stat-scaled power (with ABILITY_DAMAGE_SCALER applied)
  const scaledPower = (): bigint => {
    const statScale = getAbilityStatScaling(actor.stats, '', '', ability.scaling);
    // Enforce mana minimum cast time at resolution
    let effectiveCast = ability.castSeconds;
    if (ability.resourceType === 'mana' && effectiveCast < MANA_MIN_CAST_SECONDS) {
      effectiveCast = MANA_MIN_CAST_SECONDS;
    }
    const abilityMult = getAbilityMultiplier(effectiveCast, ability.cooldownSeconds);
    let power = ((ability.value1 * 3n + statScale) * abilityMult) / 100n;
    // Apply ability damage scaler to roughly halve ability damage
    power = (power * ABILITY_DAMAGE_SCALER) / 100n;
    if (power < 1n) power = 1n;
    return power;
  };

  // Log helpers
  const logPrivate = (characterId: bigint, ownerUserId: bigint, kind: string, msg: string) => {
    appendPrivateEvent(ctx, characterId, ownerUserId, kind, msg);
  };
  const logGroup = (kind: string, msg: string) => {
    if (actorGroupId) appendGroupEvent(ctx, actorGroupId, actor.id, kind, msg);
  };

  // Helper: get party members for AoE heals/buffs
  const getPartyMembers = (): any[] => {
    if (actor.type !== 'character') return [];
    const character = ctx.db.character.id.find(actor.id);
    return character ? partyMembersInLocation(ctx, character) : [];
  };

  // ======= DISPATCH BY KIND =======

  const kind = ability.kind;
  const dmgType = ability.damageType ?? 'physical';

  if (kind === 'damage') {
    if (actor.type === 'enemy') {
      // Enemy damage ability targets a player character
      if (!targetCharacterId) return;
      const target = ctx.db.character.id.find(targetCharacterId);
      if (!target || target.hp === 0n) return;
      const power = scaledPower();
      const dealt = applyDamageToCharacter(target, power, dmgType);
      logPrivate(target.id, target.ownerUserId, 'damage', `${actor.name}'s ${ability.name} hits you for ${dealt} damage.`);
      if (target.groupId) appendGroupEvent(ctx, target.groupId, target.id, 'damage', `${actor.name}'s ${ability.name} hits ${target.name} for ${dealt} damage.`);
    } else {
      // Player/pet damage ability targets an enemy
      const enemy = findEnemyTarget();
      if (!enemy || !combatId) { throw new SenderError('No target'); }
      const power = scaledPower();
      const dealt = applyDamageToEnemy(enemy, power, dmgType);
      const char = ctx.db.character.id.find(actor.id);
      if (char) logPrivate(char.id, char.ownerUserId, 'damage', `Your ${ability.name} hits ${getEnemyName(enemy)} for ${dealt} damage.`);
      logGroup('damage', `${actor.name}'s ${ability.name} hits ${getEnemyName(enemy)} for ${dealt} damage.`);
    }
    return;
  }

  if (kind === 'heal') {
    // Heal a friendly target
    const target = targetCharacterId ? ctx.db.character.id.find(targetCharacterId) : null;
    const healTarget = target ?? (actor.type === 'character' ? ctx.db.character.id.find(actor.id) : null);
    if (!healTarget) return;
    const power = scaledPower();
    const healAmount = calculateHealingPower(power, actor.stats);
    const scaled = (healAmount * HEALING_POWER_SCALER) / 100n > 0n ? (healAmount * HEALING_POWER_SCALER) / 100n : 1n;
    const varied = applyVariance(scaled, nowMicros + actor.id + healTarget.id);
    const nextHp = healTarget.hp + varied > healTarget.maxHp ? healTarget.maxHp : healTarget.hp + varied;
    ctx.db.character.id.update({ ...healTarget, hp: nextHp });
    const msg = `${ability.name} restores ${varied} health to ${healTarget.name}.`;
    logPrivate(healTarget.id, healTarget.ownerUserId, 'heal', msg);
    if (healTarget.id !== actor.id) {
      const char = actor.type === 'character' ? ctx.db.character.id.find(actor.id) : null;
      if (char) logPrivate(char.id, char.ownerUserId, 'heal', msg);
    }
    logGroup('heal', msg);

    // Healing generates threat
    if (combatId && varied > 0n) {
      const healingThreat = (varied * HEALING_THREAT_PERCENT) / 100n;
      const enemiesInCombat = [...ctx.db.combat_enemy.by_combat.filter(combatId)].filter((e: any) => e.currentHp > 0n);
      if (enemiesInCombat.length > 0 && healingThreat > 0n) {
        const threatPerEnemy = healingThreat / BigInt(enemiesInCombat.length);
        for (const en of enemiesInCombat) {
          for (const entry of ctx.db.aggro_entry.by_combat.filter(combatId)) {
            if (entry.characterId === actor.id && entry.enemyId === en.id && !entry.petId) {
              ctx.db.aggro_entry.id.update({ ...entry, value: entry.value + threatPerEnemy });
              break;
            }
          }
        }
      }
    }
    return;
  }

  if (kind === 'dot') {
    // Damage over time: initial hit + DoT effect
    const power = scaledPower();
    const directDamage = power / 2n; // 50% direct
    const dotTotal = power - directDamage; // 50% DoT
    const duration = ability.effectDuration ?? 3n;
    const dotPerTick = duration > 0n ? dotTotal / duration : dotTotal;

    if (actor.type === 'enemy') {
      // Enemy DoT targets a player character
      if (!targetCharacterId) return;
      const target = ctx.db.character.id.find(targetCharacterId);
      if (!target || target.hp === 0n) return;
      const dealt = applyDamageToCharacter(target, directDamage, dmgType);
      if (dotPerTick > 0n) {
        addCharacterEffect(ctx, targetCharacterId, 'dot', dotPerTick, duration, ability.name);
      }
      logPrivate(target.id, target.ownerUserId, 'damage', `${actor.name}'s ${ability.name} hits you for ${dealt} damage and applies a burning effect.`);
      if (target.groupId) appendGroupEvent(ctx, target.groupId, target.id, 'damage', `${actor.name}'s ${ability.name} hits ${target.name} for ${dealt}.`);
    } else {
      // Player/pet DoT targets an enemy
      const enemy = findEnemyTarget();
      if (!enemy || !combatId) { throw new SenderError('No target'); }
      const dealt = applyDamageToEnemy(enemy, directDamage, dmgType);
      if (dotPerTick > 0n) {
        addEnemyEffect(ctx, combatId, enemy.id, 'dot', dotPerTick, duration, ability.name, actor.id);
      }
      const char = ctx.db.character.id.find(actor.id);
      if (char) logPrivate(char.id, char.ownerUserId, 'damage', `Your ${ability.name} hits ${getEnemyName(enemy)} for ${dealt} damage.`);
      logGroup('damage', `${actor.name}'s ${ability.name} hits ${getEnemyName(enemy)} for ${dealt} damage.`);
    }
    return;
  }

  if (kind === 'hot') {
    // Heal over time on friendly target
    const target = targetCharacterId ? ctx.db.character.id.find(targetCharacterId) : null;
    const healTarget = target ?? (actor.type === 'character' ? ctx.db.character.id.find(actor.id) : null);
    if (!healTarget) return;
    const power = scaledPower();
    const directHeal = power / 2n;
    const hotTotal = power - directHeal;
    const duration = ability.effectDuration ?? 3n;
    const hotPerTick = duration > 0n ? hotTotal / duration : hotTotal;
    // Apply direct heal
    const varied = applyVariance(calculateHealingPower(directHeal, actor.stats), nowMicros + actor.id + healTarget.id);
    const nextHp = healTarget.hp + varied > healTarget.maxHp ? healTarget.maxHp : healTarget.hp + varied;
    ctx.db.character.id.update({ ...healTarget, hp: nextHp });
    // Apply HoT effect
    if (hotPerTick > 0n) {
      addCharacterEffect(ctx, healTarget.id, 'regen', hotPerTick, duration, ability.name);
    }
    const msg = `${ability.name} restores ${varied} health to ${healTarget.name}.`;
    logPrivate(healTarget.id, healTarget.ownerUserId, 'heal', msg);
    logGroup('heal', msg);
    return;
  }

  if (kind === 'buff') {
    // Apply positive effect to target(s)
    const eType = ability.effectType ?? 'damage_up';
    const eMag = ability.effectMagnitude ?? 3n;
    const eDur = ability.effectDuration ?? 3n;

    // Guard: LLM may generate kind='buff' with a debuff-type effectType (e.g. armor_down, stun).
    // Redirect these to the enemy targeting path so debuffs land on enemies, not the caster.
    const DEBUFF_EFFECT_TYPES = ['armor_down', 'stun', 'dot', 'damage_down', 'slow', 'root', 'silence', 'mesmerize'];
    if (DEBUFF_EFFECT_TYPES.includes(eType)) {
      if (actor.type === 'character') {
        const enemy = findEnemyTarget();
        if (!enemy || !combatId) { throw new SenderError('No target'); }
        addEnemyEffect(ctx, combatId, enemy.id, eType, eMag, eDur, ability.name, actor.id);
        const char = ctx.db.character.id.find(actor.id);
        if (char) logPrivate(char.id, char.ownerUserId, 'ability', `Your ${ability.name} afflicts ${getEnemyName(enemy)}.`);
        logGroup('ability', `${actor.name}'s ${ability.name} afflicts ${getEnemyName(enemy)}.`);
      } else if (actor.type === 'enemy') {
        // Enemy "buff" with debuff effectType — target a player character
        if (!targetCharacterId) return;
        const target = ctx.db.character.id.find(targetCharacterId);
        if (!target || target.hp === 0n) return;
        addCharacterEffect(ctx, targetCharacterId, eType, eMag, eDur, ability.name);
        logPrivate(target.id, target.ownerUserId, 'ability', `${actor.name}'s ${ability.name} weakens you.`);
      }
      return;
    }

    if (ability.targetRule === 'all_allies' || ability.targetRule === 'all_party') {
      const members = getPartyMembers();
      for (const member of members) {
        addCharacterEffect(ctx, member.id, eType, eMag, eDur, ability.name);
      }
    } else {
      const target = targetCharacterId ? ctx.db.character.id.find(targetCharacterId) : null;
      const buffTarget = target ?? (actor.type === 'character' ? ctx.db.character.id.find(actor.id) : null);
      if (buffTarget) addCharacterEffect(ctx, buffTarget.id, eType, eMag, eDur, ability.name);
    }
    if (actor.type === 'character') {
      const char = ctx.db.character.id.find(actor.id);
      if (char) logPrivate(char.id, char.ownerUserId, 'ability', `You use ${ability.name}.`);
      logGroup('ability', `${actor.name} uses ${ability.name}.`);
    } else if (actor.type === 'enemy' && combatId) {
      for (const p of ctx.db.combat_participant.by_combat.filter(combatId)) {
        if (p.status !== 'active') continue;
        const pc = ctx.db.character.id.find(p.characterId);
        if (pc) logPrivate(pc.id, pc.ownerUserId, 'ability', `${actor.name} uses ${ability.name}.`);
      }
    }
    return;
  }

  if (kind === 'debuff') {
    const eType = ability.effectType ?? 'armor_down';
    const eMag = ability.effectMagnitude ?? 3n;
    const eDur = ability.effectDuration ?? 3n;
    const power = scaledPower();
    const directDamage = (power * 75n) / 100n; // 75% direct, 25% budget to debuff

    if (actor.type === 'enemy') {
      // Enemy debuff targets a player character
      if (!targetCharacterId) return;
      const target = ctx.db.character.id.find(targetCharacterId);
      if (!target || target.hp === 0n) return;
      if (directDamage > 0n) {
        applyDamageToCharacter(target, directDamage, dmgType);
      }
      addCharacterEffect(ctx, targetCharacterId, eType, eMag, eDur, ability.name);
      logPrivate(target.id, target.ownerUserId, 'ability', `${actor.name}'s ${ability.name} weakens you.`);
      if (target.groupId) appendGroupEvent(ctx, target.groupId, target.id, 'ability', `${actor.name}'s ${ability.name} weakens ${target.name}.`);
    } else {
      // Player/pet debuff targets an enemy
      const enemy = findEnemyTarget();
      if (!enemy || !combatId) { throw new SenderError('No target'); }
      if (directDamage > 0n) {
        applyDamageToEnemy(enemy, directDamage, dmgType);
      }
      addEnemyEffect(ctx, combatId, enemy.id, eType, eMag, eDur, ability.name, actor.id);
      const char = ctx.db.character.id.find(actor.id);
      if (char) logPrivate(char.id, char.ownerUserId, 'ability', `Your ${ability.name} afflicts ${getEnemyName(enemy)}.`);
      logGroup('ability', `${actor.name}'s ${ability.name} afflicts ${getEnemyName(enemy)}.`);
    }
    return;
  }

  if (kind === 'shield') {
    // Apply damage_shield effect
    const target = targetCharacterId ? ctx.db.character.id.find(targetCharacterId) : null;
    const shieldTarget = target ?? (actor.type === 'character' ? ctx.db.character.id.find(actor.id) : null);
    if (!shieldTarget) return;
    const shieldAmount = ability.value1;
    const duration = ability.effectDuration ?? 5n;
    addCharacterEffect(ctx, shieldTarget.id, 'damage_shield', shieldAmount, duration, ability.name);
    if (actor.type === 'character') {
      const char = ctx.db.character.id.find(actor.id);
      if (char) logPrivate(char.id, char.ownerUserId, 'ability', `${ability.name} shields ${shieldTarget.name}.`);
      logGroup('ability', `${actor.name}'s ${ability.name} shields ${shieldTarget.name}.`);
    } else if (actor.type === 'enemy' && combatId) {
      for (const p of ctx.db.combat_participant.by_combat.filter(combatId)) {
        if (p.status !== 'active') continue;
        const pc = ctx.db.character.id.find(p.characterId);
        if (pc) logPrivate(pc.id, pc.ownerUserId, 'ability', `${actor.name} shields itself with ${ability.name}.`);
      }
    }
    return;
  }

  if (kind === 'taunt') {
    // Generate massive threat
    if (!combatId) { throw new SenderError('Must be in combat'); }
    const enemy = findEnemyTarget();
    if (!enemy) { throw new SenderError('No target'); }
    // Find max aggro and set ours higher
    let maxAggro = 0n;
    for (const entry of ctx.db.aggro_entry.by_combat.filter(combatId)) {
      if (entry.enemyId === enemy.id && entry.value > maxAggro) maxAggro = entry.value;
    }
    const newValue = maxAggro + ability.value1 + 20n;
    let found = false;
    for (const entry of ctx.db.aggro_entry.by_combat.filter(combatId)) {
      if (entry.characterId === actor.id && entry.enemyId === enemy.id && !entry.petId) {
        ctx.db.aggro_entry.id.update({ ...entry, value: newValue });
        found = true;
        break;
      }
    }
    if (!found) {
      ctx.db.aggro_entry.insert({ id: 0n, combatId, enemyId: enemy.id, characterId: actor.id, value: newValue });
    }
    ctx.db.combat_enemy.id.update({ ...enemy, aggroTargetCharacterId: actor.id, aggroTargetPetId: undefined });
    if (actor.type === 'character') {
      const char = ctx.db.character.id.find(actor.id);
      if (char) logPrivate(char.id, char.ownerUserId, 'ability', `You taunt ${getEnemyName(enemy)}.`);
      logGroup('ability', `${actor.name} taunts ${getEnemyName(enemy)}.`);
    }
    return;
  }

  if (kind === 'aoe_damage') {
    // Damage all enemies
    if (!combatId) { throw new SenderError('Must be in combat'); }
    const power = scaledPower();
    const aoeMultiplier = 65n; // 65% per target (THREAT_CONFIG.aoeDamageMultiplier)
    const perTargetDamage = (power * aoeMultiplier) / 100n;

    if (actor.type === 'character') {
      // Player AoE: damage all enemies
      for (const targetEnemy of enemies) {
        if (targetEnemy.currentHp === 0n) continue;
        const dealt = applyDamageToEnemy(targetEnemy, perTargetDamage, dmgType);
        const char = ctx.db.character.id.find(actor.id);
        if (char) logPrivate(char.id, char.ownerUserId, 'damage', `Your ${ability.name} hits ${getEnemyName(targetEnemy)} for ${dealt} damage.`);
      }
      logGroup('damage', `${actor.name}'s ${ability.name} hits all enemies.`);
    } else {
      // Enemy AoE: damage all player participants
      for (const participant of ctx.db.combat_participant.by_combat.filter(combatId)) {
        if (participant.status !== 'active') continue;
        const pc = ctx.db.character.id.find(participant.characterId);
        if (!pc || pc.hp === 0n) continue;
        const dealt = applyDamageToCharacter(pc, perTargetDamage, dmgType);
        logPrivate(pc.id, pc.ownerUserId, 'damage', `${actor.name} hits you with ${ability.name} for ${dealt}.`);
        if (pc.groupId) appendGroupEvent(ctx, pc.groupId, pc.id, 'damage', `${actor.name} hits ${pc.name} with ${ability.name} for ${dealt}.`);
      }
    }
    return;
  }

  if (kind === 'aoe_heal') {
    // Heal all allies
    const members = getPartyMembers();
    const power = scaledPower();
    const healAmount = calculateHealingPower(power, actor.stats);
    for (const member of members) {
      const current = ctx.db.character.id.find(member.id);
      if (!current || current.hp >= current.maxHp) continue;
      const varied = applyVariance(healAmount, nowMicros + actor.id + member.id);
      const nextHp = current.hp + varied > current.maxHp ? current.maxHp : current.hp + varied;
      ctx.db.character.id.update({ ...current, hp: nextHp });
    }
    if (actor.type === 'character') {
      const char = ctx.db.character.id.find(actor.id);
      if (char) logPrivate(char.id, char.ownerUserId, 'heal', `${ability.name} heals the party.`);
      logGroup('heal', `${actor.name}'s ${ability.name} heals the party.`);
    }
    return;
  }

  if (kind === 'summon') {
    // Summon a pet
    if (actor.type !== 'character') return;
    const character = ctx.db.character.id.find(actor.id);
    if (!character) return;
    // Dismiss existing pet
    for (const existing of ctx.db.active_pet.by_character.filter(character.id)) {
      ctx.db.active_pet.id.delete(existing.id);
    }
    const weapon = getEquippedWeaponStats(ctx, character.id);
    const petLevel = character.level > 0n ? character.level : 1n;
    const petMaxHp = 16n + petLevel * 5n + ability.value1;
    const petDamage = 3n + petLevel * 2n + (weapon.baseDamage * 50n) / 100n;
    const inActiveCombat = combatId && combat && combat.state === 'active';
    const enemy = findEnemyTarget();
    const pet = ctx.db.active_pet.insert({
      id: 0n,
      characterId: character.id,
      combatId: inActiveCombat ? combatId : undefined,
      name: ability.name,
      level: petLevel,
      currentHp: petMaxHp,
      maxHp: petMaxHp,
      attackDamage: petDamage,
      abilityKey: undefined,
      abilityCooldownSeconds: undefined,
      nextAbilityAt: undefined,
      targetEnemyId: inActiveCombat && enemy ? enemy.id : undefined,
      nextAutoAttackAt: inActiveCombat ? nowMicros + AUTO_ATTACK_INTERVAL : undefined,
      expiresAtMicros: ability.value2 ? nowMicros + ability.value2 * 1_000_000n : undefined,
    });
    logPrivate(character.id, character.ownerUserId, 'ability', `You have summoned ${ability.name}.`);
    logGroup('ability', `${character.name} has summoned ${ability.name}.`);
    return;
  }

  if (kind === 'cc') {
    // Crowd control (stun, root, silence)
    const enemy = findEnemyTarget();
    if (!enemy || !combatId) { throw new SenderError('No target'); }
    const ccType = ability.effectType ?? 'stun';
    const ccDuration = ability.effectDuration ?? 4n;
    addEnemyEffect(ctx, combatId, enemy.id, ccType, 1n, ccDuration, ability.name, actor.id);
    if (actor.type === 'character') {
      const char = ctx.db.character.id.find(actor.id);
      if (char) logPrivate(char.id, char.ownerUserId, 'ability', `Your ${ability.name} ${ccType}s ${getEnemyName(enemy)}.`);
      logGroup('ability', `${actor.name}'s ${ability.name} ${ccType}s ${getEnemyName(enemy)}.`);
    } else if (actor.type === 'enemy' && targetCharacterId) {
      const target = ctx.db.character.id.find(targetCharacterId);
      if (target) logPrivate(target.id, target.ownerUserId, 'ability', `${actor.name}'s ${ability.name} stuns you!`);
    }
    return;
  }

  if (kind === 'drain') {
    // Deal damage and heal caster for a portion
    const enemy = findEnemyTarget();
    if (!enemy || !combatId) { throw new SenderError('No target'); }
    const power = scaledPower();
    const dealt = applyDamageToEnemy(enemy, power, dmgType);
    // Heal caster for value2% of damage (default 30%)
    const healPercent = ability.value2 ?? 30n;
    const healAmount = (dealt * healPercent) / 100n;
    if (actor.type === 'character' && healAmount > 0n) {
      const char = ctx.db.character.id.find(actor.id);
      if (char) {
        const nextHp = char.hp + healAmount > char.maxHp ? char.maxHp : char.hp + healAmount;
        ctx.db.character.id.update({ ...char, hp: nextHp });
        logPrivate(char.id, char.ownerUserId, 'damage', `Your ${ability.name} drains ${getEnemyName(enemy)} for ${dealt} damage, healing you for ${healAmount}.`);
        logGroup('damage', `${actor.name}'s ${ability.name} drains ${getEnemyName(enemy)} for ${dealt} damage.`);
      }
    } else if (actor.type === 'enemy' && targetCharacterId) {
      const target = ctx.db.character.id.find(targetCharacterId);
      if (target) logPrivate(target.id, target.ownerUserId, 'damage', `${actor.name}'s ${ability.name} drains you for ${dealt} damage.`);
    }
    return;
  }

  if (kind === 'execute') {
    // Bonus damage to low-HP targets
    const enemy = findEnemyTarget();
    if (!enemy || !combatId) { throw new SenderError('No target'); }
    const power = scaledPower();
    // 2x multiplier if target below 30% HP
    const threshold = enemy.maxHp > 0n ? (enemy.maxHp * 30n) / 100n : 0n;
    const multiplier = enemy.currentHp <= threshold ? 2n : 1n;
    const finalDamage = power * multiplier;
    const dealt = applyDamageToEnemy(enemy, finalDamage, dmgType);
    if (actor.type === 'character') {
      const char = ctx.db.character.id.find(actor.id);
      const bonusMsg = multiplier > 1n ? ' (EXECUTE!)' : '';
      if (char) logPrivate(char.id, char.ownerUserId, 'damage', `Your ${ability.name} hits ${getEnemyName(enemy)} for ${dealt} damage${bonusMsg}.`);
      logGroup('damage', `${actor.name}'s ${ability.name} hits ${getEnemyName(enemy)} for ${dealt} damage${bonusMsg}.`);
    } else if (actor.type === 'enemy' && targetCharacterId) {
      const target = ctx.db.character.id.find(targetCharacterId);
      const bonusMsg = multiplier > 1n ? ' (EXECUTE!)' : '';
      if (target) logPrivate(target.id, target.ownerUserId, 'damage', `${actor.name}'s ${ability.name} hits you for ${dealt} damage${bonusMsg}.`);
    }
    return;
  }

  if (kind === 'utility') {
    // Non-combat effect — just log
    if (actor.type === 'character') {
      const char = ctx.db.character.id.find(actor.id);
      if (char) logPrivate(char.id, char.ownerUserId, 'ability', `You use ${ability.name}.`);
      logGroup('ability', `${actor.name} uses ${ability.name}.`);
    }
    return;
  }

  // Fallback for unknown kinds
  if (actor.type === 'character') {
    const char = ctx.db.character.id.find(actor.id);
    if (char) logPrivate(char.id, char.ownerUserId, 'ability', `You use ${ability.name}.`);
  }
}

// ===========================================================================
// PLAYER ABILITY EXECUTION — Looks up ability by ID, builds actor, resolves
// ===========================================================================

export function executeAbility(
  ctx: any,
  character: any,
  abilityTemplateId: bigint,
  targetCharacterId?: bigint
) {
  const ability = ctx.db.ability_template.id.find(abilityTemplateId);
  if (!ability) { fail(ctx, character, 'Unknown ability'); throw new SenderError('Unknown ability'); }
  // Validate ownership: ability must belong to this character
  if (ability.characterId !== character.id) {
    fail(ctx, character, 'Ability not available');
    throw new SenderError('Ability not available');
  }

  if (character.level < ability.levelRequired) { fail(ctx, character, 'Ability not unlocked'); throw new SenderError('Ability not unlocked'); }

  let staminaFree = false;
  let staminaFreeEffectId: bigint | undefined;
  if (ability.resourceType === 'stamina') {
    const free = [...ctx.db.character_effect.by_character.filter(character.id)].find(
      (effect: any) => effect.effectType === 'stamina_free'
    );
    if (free) {
      staminaFree = true;
      staminaFreeEffectId = free.id;
    }
  }
  const resourceCost = staminaFree && ability.resourceType === 'stamina' ? 0n : ability.resourceCost;
  if (ability.resourceType === 'mana') {
    if (character.mana < resourceCost) { fail(ctx, character, 'Not enough mana'); throw new SenderError('Not enough mana'); }
  } else if (ability.resourceType === 'stamina') {
    if (character.stamina < resourceCost) { fail(ctx, character, 'Not enough stamina'); throw new SenderError('Not enough stamina'); }
  }

  const combatId = activeCombatIdForCharacter(ctx, character.id);

  // Build actor for unified dispatch
  const actor: AbilityActor = {
    type: 'character',
    id: character.id,
    stats: { str: character.str, dex: character.dex, int: character.int, wis: character.wis, cha: character.cha },
    level: character.level,
    name: character.name,
  };

  // Build ability row for dispatch
  const abilityRow: AbilityRow = {
    id: ability.id,
    kind: ability.kind,
    targetRule: ability.targetRule,
    value1: ability.value1,
    value2: ability.value2,
    damageType: ability.damageType,
    scaling: ability.scaling,
    effectType: ability.effectType,
    effectMagnitude: ability.effectMagnitude,
    effectDuration: ability.effectDuration,
    name: ability.name,
    resourceType: ability.resourceType,
    resourceCost: ability.resourceCost,
    cooldownSeconds: ability.cooldownSeconds,
    castSeconds: ability.castSeconds,
  };

  // Execute via unified dispatch
  resolveAbility(ctx, combatId, actor, abilityRow, targetCharacterId);

  // Ability fired successfully — now consume resources
  if (staminaFreeEffectId !== undefined) {
    ctx.db.character_effect.id.delete(staminaFreeEffectId);
  }
  if (ability.resourceType === 'mana') {
    const latest = ctx.db.character.id.find(character.id);
    if (latest) ctx.db.character.id.update({ ...latest, mana: character.mana - resourceCost });
  } else if (ability.resourceType === 'stamina') {
    const latest = ctx.db.character.id.find(character.id);
    if (latest) ctx.db.character.id.update({ ...latest, stamina: character.stamina - resourceCost });
  }
}

// Dead code marker: The following old functions are preserved temporarily but the 106-case switch
// has been removed. All ability resolution now goes through resolveAbility above.
// TODO: Clean up remaining old code references in future plan
const _oldCodeRemoved = true;

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
  const enemy = ctx.db.combat_enemy.id.find(enemyId);
  if (!enemy) return;
  const enemyTemplate = ctx.db.enemy_template.id.find(enemy.enemyTemplateId);
  const enemyName = enemy.displayName ?? enemyTemplate?.name ?? 'Enemy';
  const enemyLevel = enemyTemplate?.level ?? 1n;

  // Look up the enemy ability from the DB table by abilityKey match
  const enemyAbilities = [...ctx.db.enemy_ability.by_template.filter(enemy.enemyTemplateId)];
  const abilityRow = enemyAbilities.find((a: any) => a.abilityKey === abilityKey);
  if (!abilityRow) return;

  // Calculate power based on enemy level (EnemyAbility doesn't have value1)
  const totalPower = ENEMY_BASE_POWER + (enemyLevel * ENEMY_LEVEL_POWER_SCALING);

  // If ability targets a pet, route to pet instead of character
  if (targetPetId) {
    const pet = ctx.db.active_pet.id.find(targetPetId);
    if (!pet || pet.currentHp === 0n) return;
    const owner = ctx.db.character.id.find(pet.characterId);
    if (!owner) return;
    const rawDamage = applyVariance(totalPower, enemyId + pet.id + 6173n);
    const newHp = pet.currentHp > rawDamage ? pet.currentHp - rawDamage : 0n;
    ctx.db.active_pet.id.update({ ...pet, currentHp: newHp });
    const privateMessage = `${enemyName} uses ${abilityRow.name} on ${pet.name} for ${rawDamage}.`;
    appendPrivateEvent(ctx, owner.id, owner.ownerUserId, 'damage', privateMessage);
    if (owner.groupId) {
      appendGroupEvent(ctx, owner.groupId, owner.id, 'damage', `${enemyName} uses ${abilityRow.name} on ${pet.name} for ${rawDamage}.`);
    }
    if (newHp === 0n) {
      const deathMsg = `${pet.name} has been slain!`;
      appendPrivateEvent(ctx, owner.id, owner.ownerUserId, 'combat', deathMsg);
      if (owner.groupId) appendGroupEvent(ctx, owner.groupId, owner.id, 'combat', deathMsg);
      for (const entry of ctx.db.aggro_entry.by_combat.filter(combatId)) {
        if (entry.petId && entry.petId === pet.id) ctx.db.aggro_entry.id.delete(entry.id);
      }
      ctx.db.active_pet.id.delete(pet.id);
    }
    return;
  }

  // Build actor and ability for unified dispatch
  const actor: AbilityActor = {
    type: 'enemy',
    id: enemyId,
    stats: { str: enemyLevel * 2n, dex: enemyLevel, int: enemyLevel, wis: enemyLevel, cha: enemyLevel },
    level: enemyLevel,
    name: enemyName,
  };

  const dispatchAbility: AbilityRow = {
    id: abilityRow.id,
    kind: abilityRow.kind,
    targetRule: abilityRow.targetRule ?? 'single_enemy',
    value1: totalPower,
    value2: undefined,
    damageType: 'physical',
    scaling: 'none',
    effectType: undefined,
    effectMagnitude: undefined,
    effectDuration: undefined,
    name: abilityRow.name,
    resourceType: 'none',
    resourceCost: 0n,
    cooldownSeconds: abilityRow.cooldownSeconds,
    castSeconds: abilityRow.castSeconds,
  };

  resolveAbility(ctx, combatId, actor, dispatchAbility, targetCharacterId, targetPetId);
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
      abilityTemplateId: bigint;
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
    executeAbility(ctx, character, args.abilityTemplateId, args.targetCharacterId);
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

import {
  ROUND_TIMER_MICROS,
  SOLO_TIMER_MICROS,
  EFFECT_ROUND_CONVERSION_MICROS,
  MIN_EFFECT_ROUNDS,
} from '../data/combat_constants';

/** Convert time-based duration (microseconds) to round count. */
export function convertDurationToRounds(durationMicros: bigint): bigint {
  const rounds = durationMicros / EFFECT_ROUND_CONVERSION_MICROS;
  return rounds < MIN_EFFECT_ROUNDS ? MIN_EFFECT_ROUNDS : rounds;
}

/** Schedule a RoundTimerTick for the given combat round. */
export function scheduleRoundTimer(ctx: any, combatId: bigint, roundNumber: bigint, isGroup: boolean) {
  const timerDuration = isGroup ? ROUND_TIMER_MICROS : SOLO_TIMER_MICROS;
  const expiresAt = ctx.timestamp.microsSinceUnixEpoch + timerDuration;
  ctx.db.round_timer_tick.insert({
    scheduledId: 0n,
    scheduledAt: ScheduleAt.time(expiresAt),
    combatId,
    roundNumber,
  });
  return expiresAt;
}

/** Create the first CombatRound for a new combat encounter. */
export function createFirstRound(ctx: any, combatId: bigint, isGroup: boolean) {
  const timerExpires = scheduleRoundTimer(ctx, combatId, 1n, isGroup);
  ctx.db.combat_round.insert({
    id: 0n,
    combatId,
    roundNumber: 1n,
    state: 'action_select',
    timerExpiresAtMicros: timerExpires,
    narrationCount: 0n,
  });
}


