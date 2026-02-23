/**
 * combat_rewards.ts — Shared helpers extracted from combat.ts to eliminate
 * duplicated logic between victory and defeat paths.
 *
 * PURE REFACTOR: Every function performs the exact same DB mutations in the
 * exact same order as the original inline code.
 */

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
