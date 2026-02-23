/**
 * combat_rewards.ts — Shared helpers extracted from combat.ts to eliminate
 * duplicated logic between victory and defeat paths.
 *
 * PURE REFACTOR: Every function performs the exact same DB mutations in the
 * exact same order as the original inline code.
 */

import { MAX_LEVEL, xpModifierForDiff, xpRequiredForLevel } from '../data/xp';
import { computeBaseStats } from '../data/class_stats';
import { recomputeCharacterDerived } from './character';
import { appendPrivateEvent as appendPrivateEventHelper } from './events';

/**
 * Award event contribution for a character killing an event-spawned enemy.
 * Finds or creates an EventContribution row for the given character + event.
 *
 * Extracted from victory path (lines ~2750-2766) and defeat path (lines ~3426-3442).
 */
export const awardEventContribution = (
  ctx: any,
  character: any,
  activeEvent: any
) => {
  let contribFound = false;
  for (const contrib of ctx.db.eventContribution.by_character.filter(character.id)) {
    if (contrib.eventId === activeEvent.id) {
      ctx.db.eventContribution.id.update({ ...contrib, count: contrib.count + 1n });
      contribFound = true;
      break;
    }
  }
  if (!contribFound) {
    ctx.db.eventContribution.insert({
      id: 0n,
      eventId: activeEvent.id,
      characterId: character.id,
      count: 1n,
      regionEnteredAt: ctx.timestamp,
    });
  }
};

/**
 * Advance kill_count objectives for an active event.
 * Increments currentCount on all kill_count-type EventObjective rows.
 *
 * Extracted from victory path (lines ~2789-2793) and defeat path (lines ~3445-3449).
 */
export const advanceEventKillObjectives = (
  ctx: any,
  activeEvent: any
) => {
  for (const obj of ctx.db.eventObjective.by_event.filter(activeEvent.id)) {
    if (obj.objectiveType === 'kill_count') {
      ctx.db.eventObjective.id.update({ ...obj, currentCount: obj.currentCount + 1n });
    }
  }
};

/**
 * Determine which killed enemies were spawned by a specific event.
 * Returns a Set of enemyTemplateIds that are event-spawned.
 *
 * Extracted from victory path (lines ~2738-2748).
 * The victory path iterates all enemies and checks eventSpawnEnemy.by_spawn
 * to build a set of template IDs.
 */
export const getEventSpawnTemplateIds = (
  ctx: any,
  enemies: any[],
  enemySpawnIds: Map<bigint, bigint>,
  eventId: bigint
): Set<bigint> => {
  const eventSpawnTemplateIds = new Set<bigint>();
  for (const enemyRow of enemies) {
    const spawnId = enemySpawnIds.get(enemyRow.id);
    if (spawnId === undefined) continue;
    for (const link of ctx.db.eventSpawnEnemy.by_spawn.filter(spawnId)) {
      if (link.eventId === eventId) {
        eventSpawnTemplateIds.add(enemyRow.enemyTemplateId);
        break;
      }
    }
  }
  return eventSpawnTemplateIds;
};

/**
 * Build the "Fallen: name1, name2." suffix for combat result summaries.
 *
 * Victory path (lines ~2802-2806): filters by p.status === 'dead'.
 * Defeat path (lines ~3454-3461): filters by character.hp === 0n.
 *
 * The `isDead` callback accommodates both filtering strategies.
 */
export const buildFallenNamesSuffix = (
  ctx: any,
  participants: any[],
  isDead: (p: any, character: any) => boolean
): string => {
  const fallenNames = participants
    .filter((p) => {
      const character = ctx.db.character.id.find(p.characterId);
      return character ? isDead(p, character) : false;
    })
    .map((p) => ctx.db.character.id.find(p.characterId)?.name)
    .filter((name): name is string => Boolean(name));
  return fallenNames.length > 0 ? ` Fallen: ${fallenNames.join(', ')}.` : '';
};

/**
 * Create corpses for dead participants and apply XP penalty with logging.
 *
 * Extracted from victory path (lines ~2979-3005) and defeat path (lines ~3477-3505).
 * Both paths: (1) create corpses for hp===0, (2) apply XP penalty + log.
 *
 * The defeat path also calls autoRespawnDeadCharacter after XP penalty, but
 * clearCombatArtifacts ordering differs between paths (victory: corpse->penalty->clear,
 * defeat: corpse->clear->penalty->respawn). To preserve exact ordering, this helper
 * only handles the corpse creation step. The caller handles the rest.
 */
export const createCorpsesForDead = (
  ctx: any,
  deps: any,
  participants: any[]
) => {
  for (const p of participants) {
    const character = ctx.db.character.id.find(p.characterId);
    if (character && character.hp === 0n) {
      deps.createCorpse(ctx, character);
    }
  }
};

/**
 * Apply death XP penalty to dead participants and log messages.
 *
 * Extracted from victory path (lines ~2987-3005) and defeat path (lines ~3487-3498).
 * Victory path also logs to group; defeat path only logs privately.
 */
export const applyDeathPenalties = (
  ctx: any,
  deps: any,
  participants: any[],
  appendPrivateEvent: any,
  logGroupEvent?: (ctx: any, combatId: bigint, characterId: bigint, kind: string, message: string) => void,
  combatId?: bigint
) => {
  for (const p of participants) {
    const character = ctx.db.character.id.find(p.characterId);
    if (character && character.hp === 0n) {
      const loss = deps.applyDeathXpPenalty(ctx, character);
      appendPrivateEvent(
        ctx,
        character.id,
        character.ownerUserId,
        'reward',
        `You lose ${loss} XP from the defeat.`
      );
      if (logGroupEvent && combatId !== undefined) {
        logGroupEvent(
          ctx,
          combatId,
          character.id,
          'reward',
          `${character.name} lost ${loss} XP from the defeat.`
        );
      }
    }
  }
};

/**
 * Handle spawn cleanup after combat ends.
 *
 * Victory path (lines ~2703-2720): For each enemy, if spawn has groupCount > 0
 * set available; else delete spawn + members and schedule respawn.
 *
 * Defeat path (lines ~3366-3407): Additionally re-inserts surviving enemies
 * (currentHp > 0) back into the spawn group.
 *
 * @param reinsertSurvivors - If true, re-insert surviving combat enemies into
 *   the spawn group before checking count. Used by defeat path.
 */
export const resetSpawnAfterCombat = (
  ctx: any,
  enemies: any[],
  ScheduleAt: any,
  ENEMY_RESPAWN_MICROS: bigint,
  reinsertSurvivors: boolean
) => {
  const spawnIds = new Set(enemies.map((e: any) => e.spawnId));
  for (const spawnId of spawnIds) {
    const spawn = ctx.db.enemySpawn.id.find(spawnId);
    if (!spawn) continue;

    if (reinsertSurvivors) {
      // Defeat path: count existing members + re-insert survivors
      const remainingMemberCount = BigInt([...ctx.db.enemySpawnMember.by_spawn.filter(spawnId)].length);
      let count = remainingMemberCount;
      for (const enemyRow of enemies) {
        if (enemyRow.spawnId !== spawnId) continue;
        if (enemyRow.currentHp === 0n) continue;
        ctx.db.enemySpawnMember.insert({
          id: 0n,
          spawnId: spawnId,
          enemyTemplateId: enemyRow.enemyTemplateId,
          roleTemplateId: enemyRow.enemyRoleTemplateId ?? 0n,
        });
        count += 1n;
      }
      if (count > 0n) {
        ctx.db.enemySpawn.id.update({
          ...spawn,
          state: 'available',
          lockedCombatId: undefined,
          groupCount: count,
        });
      } else {
        for (const member of ctx.db.enemySpawnMember.by_spawn.filter(spawn.id)) {
          ctx.db.enemySpawnMember.id.delete(member.id);
        }
        ctx.db.enemySpawn.id.delete(spawn.id);
        const respawnAt = ctx.timestamp.microsSinceUnixEpoch + ENEMY_RESPAWN_MICROS;
        ctx.db.enemyRespawnTick.insert({
          scheduledId: 0n,
          scheduledAt: ScheduleAt.time(respawnAt),
          locationId: spawn.locationId,
        });
      }
    } else {
      // Victory path: simple groupCount check
      if (spawn.groupCount > 0n) {
        ctx.db.enemySpawn.id.update({ ...spawn, state: 'available', lockedCombatId: undefined });
      } else {
        for (const member of ctx.db.enemySpawnMember.by_spawn.filter(spawn.id)) {
          ctx.db.enemySpawnMember.id.delete(member.id);
        }
        ctx.db.enemySpawn.id.delete(spawn.id);
        const respawnAt = ctx.timestamp.microsSinceUnixEpoch + ENEMY_RESPAWN_MICROS;
        ctx.db.enemyRespawnTick.insert({
          scheduledId: 0n,
          scheduledAt: ScheduleAt.time(respawnAt),
          locationId: spawn.locationId,
        });
      }
    }
  }
};

// Compute all racial contributions for a character at a given level.
// Creation bonuses (bonus1+bonus2+penalty) applied once; levelBonus per even level.
function computeRacialAtLevelFromRow(raceRow: any, level: bigint) {
  const evenLevels = level / 2n;
  const r = {
    str: 0n, dex: 0n, int: 0n, wis: 0n, cha: 0n,
    racialSpellDamage: 0n, racialPhysDamage: 0n,
    racialMaxHp: 0n, racialMaxMana: 0n,
    racialManaRegen: 0n, racialStaminaRegen: 0n,
    racialCritBonus: 0n, racialArmorBonus: 0n, racialDodgeBonus: 0n,
    racialHpRegen: 0n, racialMaxStamina: 0n,
    racialTravelCostIncrease: 0n, racialTravelCostDiscount: 0n,
    racialHitBonus: 0n, racialParryBonus: 0n,
    racialFactionBonus: 0n, racialMagicResist: 0n, racialPerceptionBonus: 0n,
    racialLootBonus: 0n,
  };
  function applyType(t: string, v: bigint) {
    switch (t) {
      case 'stat_str': r.str += v; break;
      case 'stat_dex': r.dex += v; break;
      case 'stat_int': r.int += v; break;
      case 'stat_wis': r.wis += v; break;
      case 'stat_cha': r.cha += v; break;
      case 'spell_damage': r.racialSpellDamage += v; break;
      case 'phys_damage': r.racialPhysDamage += v; break;
      case 'max_hp': r.racialMaxHp += v; break;
      case 'max_mana': r.racialMaxMana += v; break;
      case 'mana_regen': r.racialManaRegen += v; break;
      case 'stamina_regen': r.racialStaminaRegen += v; break;
      case 'crit_chance': r.racialCritBonus += v; break;
      case 'armor': r.racialArmorBonus += v; break;
      case 'dodge': r.racialDodgeBonus += v; break;
      case 'hp_regen': r.racialHpRegen += v; break;
      case 'max_stamina': r.racialMaxStamina += v; break;
      case 'hit_chance': r.racialHitBonus += v; break;
      case 'parry': r.racialParryBonus += v; break;
      case 'faction_bonus': r.racialFactionBonus += v; break;
      case 'magic_resist': r.racialMagicResist += v; break;
      case 'perception': r.racialPerceptionBonus += v; break;
      case 'travel_cost_increase': r.racialTravelCostIncrease += v; break;
      case 'travel_cost_discount': r.racialTravelCostDiscount += v; break;
      case 'loot_bonus': r.racialLootBonus += v; break;
    }
  }
  applyType(raceRow.bonus1Type, raceRow.bonus1Value);
  applyType(raceRow.bonus2Type, raceRow.bonus2Value);
  if (raceRow.penaltyType && raceRow.penaltyValue) {
    const pt = raceRow.penaltyType as string;
    const pv = raceRow.penaltyValue as bigint;
    if (pt === 'travel_cost_increase' || pt === 'travel_cost_discount') {
      applyType(pt, pv);
    } else {
      applyType(pt, -pv);
    }
  }
  if (evenLevels > 0n) {
    applyType(raceRow.levelBonusType, raceRow.levelBonusValue * evenLevels);
  }
  return r;
}

export function awardXp(
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

  // Look up the character's race row by name (character.race is a display name string, not an ID).
  const raceRow = [...ctx.db.race.iter()].find((r: any) => r.name === character.race);

  // Compute total racial contributions at the new level:
  //   - Creation bonuses (bonus1 + bonus2 + penalty): applied once
  //   - Level bonus (levelBonusType x levelBonusValue): applied per even level
  const racial = raceRow ? computeRacialAtLevelFromRow(raceRow, newLevel) : null;

  const updated = {
    ...character,
    level: newLevel,
    xp: newXp,
    str: newBase.str + (racial?.str ?? 0n),
    dex: newBase.dex + (racial?.dex ?? 0n),
    cha: newBase.cha + (racial?.cha ?? 0n),
    wis: newBase.wis + (racial?.wis ?? 0n),
    int: newBase.int + (racial?.int ?? 0n),
    racialSpellDamage: racial?.racialSpellDamage || undefined,
    racialPhysDamage: racial?.racialPhysDamage || undefined,
    racialMaxHp: racial?.racialMaxHp || undefined,
    racialMaxMana: racial?.racialMaxMana || undefined,
    racialManaRegen: racial?.racialManaRegen || undefined,
    racialStaminaRegen: racial?.racialStaminaRegen || undefined,
    racialCritBonus: racial?.racialCritBonus || undefined,
    racialArmorBonus: racial?.racialArmorBonus || undefined,
    racialDodgeBonus: racial?.racialDodgeBonus || undefined,
    racialHpRegen: racial?.racialHpRegen || undefined,
    racialMaxStamina: racial?.racialMaxStamina || undefined,
    racialTravelCostIncrease: racial?.racialTravelCostIncrease || undefined,
    racialTravelCostDiscount: racial?.racialTravelCostDiscount || undefined,
    racialHitBonus: racial?.racialHitBonus || undefined,
    racialParryBonus: racial?.racialParryBonus || undefined,
    racialFactionBonus: racial?.racialFactionBonus || undefined,
    racialMagicResist: racial?.racialMagicResist || undefined,
    racialPerceptionBonus: racial?.racialPerceptionBonus || undefined,
    racialLootBonus: racial?.racialLootBonus || undefined,
  };
  ctx.db.character.id.update(updated);
  recomputeCharacterDerived(ctx, updated);

  // Notify on even-level racial bonus re-application
  if (newLevel % 2n === 0n && raceRow) {
    appendPrivateEventHelper(
      ctx,
      character.id,
      character.ownerUserId,
      'system',
      `Your ${raceRow.name} heritage grows stronger at level ${newLevel}.`
    );
  }

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
