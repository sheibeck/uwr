/**
 * combat_perks.ts -- Perk proc system, active perk abilities, and flee chance.
 *
 * PURE REFACTOR: Extracted from combat.ts with zero behavior changes.
 */

import { SenderError } from 'spacetimedb/server';
import { getPerkProcs } from './renown';
import { RENOWN_PERK_POOLS } from '../data/renown_data';
import { addCharacterEffect } from './combat';
import { appendPrivateEvent, appendGroupEvent, fail } from './events';
import { getEquippedWeaponStats } from './items';
import { effectiveGroupId } from './group';

// Private helper: get active combat for character
function activeCombatIdForCharacter(ctx: any, characterId: bigint): bigint | null {
  for (const row of ctx.db.combat_participant.by_character.filter(characterId)) {
    const combat = ctx.db.combat_encounter.id.find(row.combatId);
    if (combat && combat.state === 'active') return combat.id;
  }
  return null;
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
        ctx.db.combat_enemy.id.update({ ...enemy, currentHp: newHp });
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
      ctx.db.combat_enemy.id.update({ ...enemy, currentHp: newHp });
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
        for (const otherEnemy of ctx.db.combat_enemy.by_combat.filter(combatId)) {
          if (otherEnemy.id === enemy?.id) continue;
          if (otherEnemy.currentHp <= 0n) continue;
          const newHp = otherEnemy.currentHp > aoeDmg ? otherEnemy.currentHp - aoeDmg : 0n;
          ctx.db.combat_enemy.id.update({ ...otherEnemy, currentHp: newHp });
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
    fail(ctx, character, 'Invalid perk ability');
    throw new SenderError('Invalid perk ability');
  }

  // Verify the character actually has this perk
  let hasPerk = false;
  for (const row of ctx.db.renown_perk.by_character.filter(character.id)) {
    if (row.perkKey === rawKey) {
      hasPerk = true;
      break;
    }
  }
  if (!hasPerk) {
    fail(ctx, character, 'You do not have this perk');
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
      fail(ctx, character, 'Thunderous Blow can only be used in combat');
      throw new SenderError('Thunderous Blow can only be used in combat');
    }
    const enemies = [...ctx.db.combat_enemy.by_combat.filter(combatId)].filter((e: any) => e.currentHp > 0n);
    const preferredEnemy = character.combatTargetEnemyId
      ? enemies.find((e: any) => e.id === character.combatTargetEnemyId)
      : null;
    const enemy = preferredEnemy ?? enemies[0] ?? null;
    if (!enemy) {
      fail(ctx, character, 'No target in combat');
      throw new SenderError('No target in combat');
    }
    const weapon = getEquippedWeaponStats(ctx, character.id);
    const baseDamage = 5n + character.level + weapon.baseDamage + weapon.dps / 2n;
    const totalDamage = (baseDamage * BigInt(effect.damagePercent)) / 100n;
    const newHp = enemy.currentHp > totalDamage ? enemy.currentHp - totalDamage : 0n;
    ctx.db.combat_enemy.id.update({ ...enemy, currentHp: newHp });
    const enemyTemplate = ctx.db.enemy_template.id.find(enemy.enemyTemplateId);
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
    fail(ctx, character, 'Unknown active perk effect type');
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
