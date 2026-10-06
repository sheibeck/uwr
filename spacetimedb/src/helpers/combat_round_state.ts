/**
 * Phase 46.1 (RND-01, RND-03, RND-04): rounds, ticks, choices and round cooldowns on the database.
 *
 * One owner for every write to combat_round, round_timer_tick, combat_action (choices) and the
 * round side of ability_cooldown. The engine and the reducers (46.1-05 to 08) call these; nothing
 * else writes those rows by hand. The ctx is duck-typed (no server SDK import), so the module runs
 * under the strict mock db in tests.
 *
 * What a client can read:
 *  - one open round (state 'action_select') per active fight, with its deadline
 *    (timerExpiresAtMicros) and start (startedAtMicros);
 *  - the choices of the open round only (clearRoundChoices removes them once the round resolves);
 *  - ability_cooldown.roundsRemaining as "rounds still blocked, including this one". The row is
 *    deleted when it reaches 0, so a present row with roundsRemaining > 0 means blocked.
 *
 * Wall-clock fields (startedAtMicros, durationMicros) are ESTIMATES while a fight is active:
 * rounds x 10 s for the hotbar (a round may end early). At the end of a fight the leftover rounds
 * turn back into a real wall-clock cooldown at 4 s per round (endCombatCooldowns), and at the start
 * of a fight a live wall-clock cooldown turns into ceil(remaining / 4 s) rounds
 * (beginCombatCooldowns). Every conversion is ceil over bigint microseconds, so a live cooldown is
 * never rounded down to nothing.
 */
import { ScheduleAt } from 'spacetimedb';
import {
  ROUND_STATE,
  allChosen,
  cooldownRounds,
  decrementRounds,
  isWaitedOn,
  remainingMicrosToRounds,
  roundDeadlineMicros,
  roundsToEstimateMicros,
  roundsToWallClockMicros,
  sortByKey,
} from './combat_rounds';

const nowMicros = (ctx: any): bigint => ctx.timestamp.microsSinceUnixEpoch as bigint;

// ---------------------------------------------------------------------------
// Rounds and ticks
// ---------------------------------------------------------------------------

/** Every round of a combat, ascending roundNumber. */
export function roundsForCombat(ctx: any, combatId: bigint): any[] {
  return sortByKey([...ctx.db.combat_round.by_combat.filter(combatId)], (r: any) => r.roundNumber);
}

/** The round open for choices: the highest-roundNumber row in 'action_select'. */
export function currentRound(ctx: any, combatId: bigint): any | undefined {
  let open: any | undefined;
  for (const row of ctx.db.combat_round.by_combat.filter(combatId)) {
    if (row.state !== ROUND_STATE.select) continue;
    if (!open || row.roundNumber > open.roundNumber) open = row;
  }
  return open;
}

/** Schedule the tick that resolves a round at an absolute time (a module-identity reducer call). */
export function scheduleRoundTick(ctx: any, combatId: bigint, roundNumber: bigint, atMicros: bigint): void {
  ctx.db.round_timer_tick.insert({
    scheduledId: 0n,
    scheduledAt: ScheduleAt.time(atMicros),
    combatId,
    roundNumber,
  });
}

/**
 * Delete a combat's pending round ticks, keyed on scheduledId (scheduled tables have no id column).
 * The row passed as exceptScheduledId is the tick that is running now and is left alone.
 */
export function cancelRoundTicks(ctx: any, combatId: bigint, exceptScheduledId?: bigint): number {
  const doomed: bigint[] = [];
  for (const row of ctx.db.round_timer_tick.iter()) {
    if (row.combatId !== combatId) continue;
    if (exceptScheduledId !== undefined && row.scheduledId === exceptScheduledId) continue;
    doomed.push(row.scheduledId);
  }
  for (const scheduledId of doomed) ctx.db.round_timer_tick.scheduledId.delete(scheduledId);
  return doomed.length;
}

/**
 * Open a round for choices: insert the combat_round row and its one tick, both at the deadline
 * now + ROUND_TIMER_MICROS. The deadline comes only from the server clock, never from a client.
 */
export function startRound(ctx: any, combatId: bigint, roundNumber: bigint, narrationCount: bigint = 0n): any {
  const now = nowMicros(ctx);
  const deadline = roundDeadlineMicros(now);
  const row = ctx.db.combat_round.insert({
    id: 0n,
    combatId,
    roundNumber,
    state: ROUND_STATE.select,
    timerExpiresAtMicros: deadline,
    narrationCount,
    startedAtMicros: now,
  });
  scheduleRoundTick(ctx, combatId, roundNumber, deadline);
  return row;
}

/**
 * Idempotent: make sure an active combat has one open round and one tick for it.
 *  - not active: nothing is written, undefined is returned;
 *  - no open round: start (highest roundNumber + 1, or 1), carrying the last narrationCount;
 *  - open round without a tick: schedule one at the later of now and the round's deadline.
 */
export function ensureRound(ctx: any, combat: any): any | undefined {
  if (!combat || combat.state !== 'active') return undefined;
  const open = currentRound(ctx, combat.id);
  if (!open) {
    const rounds = roundsForCombat(ctx, combat.id);
    const last = rounds.length > 0 ? rounds[rounds.length - 1] : undefined;
    const next = (last ? last.roundNumber : 0n) + 1n;
    return startRound(ctx, combat.id, next, last ? last.narrationCount : 0n);
  }
  let hasTick = false;
  for (const tick of ctx.db.round_timer_tick.iter()) {
    if (tick.combatId === combat.id && tick.roundNumber === open.roundNumber) {
      hasTick = true;
      break;
    }
  }
  if (!hasTick) {
    const now = nowMicros(ctx);
    const at = open.timerExpiresAtMicros > now ? open.timerExpiresAtMicros : now;
    scheduleRoundTick(ctx, combat.id, open.roundNumber, at);
  }
  return open;
}

// ---------------------------------------------------------------------------
// Choices (combat_action: one row per combat, character and round)
// ---------------------------------------------------------------------------

/**
 * Store a character's choice for a round. A second choice in the same round replaces the first in
 * place (action, ability, targets, submittedAt). Ownership is checked by the reducer before this.
 */
export function upsertChoice(
  ctx: any,
  combatId: bigint,
  roundNumber: bigint,
  characterId: bigint,
  choice: {
    actionType: 'ability' | 'auto_attack' | 'flee';
    abilityTemplateId?: bigint;
    targetEnemyId?: bigint;
    targetCharacterId?: bigint;
  },
): any {
  const matches: any[] = [];
  for (const row of ctx.db.combat_action.by_character.filter(characterId)) {
    if (row.combatId === combatId && row.roundNumber === roundNumber) matches.push(row);
  }
  const fields = {
    actionType: choice.actionType,
    abilityTemplateId: choice.actionType === 'ability' ? choice.abilityTemplateId : undefined,
    targetEnemyId: choice.targetEnemyId,
    targetCharacterId: choice.targetCharacterId,
    submittedAt: ctx.timestamp,
  };
  if (matches.length === 0) {
    return ctx.db.combat_action.insert({ id: 0n, combatId, characterId, roundNumber, ...fields });
  }
  const [keep, ...extras] = matches;
  for (const extra of extras) ctx.db.combat_action.id.delete(extra.id);
  const updated = { ...keep, ...fields };
  ctx.db.combat_action.id.update(updated);
  return updated;
}

/** The choices stored for one round, ascending characterId. */
export function choicesForRound(ctx: any, combatId: bigint, roundNumber: bigint): any[] {
  const out: any[] = [];
  for (const row of ctx.db.combat_action.by_combat.filter(combatId)) {
    if (row.roundNumber === roundNumber) out.push(row);
  }
  return sortByKey(out, (r: any) => r.characterId);
}

/** Delete the combat's choices of the given round and every earlier round. */
export function clearRoundChoices(ctx: any, combatId: bigint, roundNumber: bigint): void {
  const doomed: bigint[] = [];
  for (const row of ctx.db.combat_action.by_combat.filter(combatId)) {
    if (row.roundNumber <= roundNumber) doomed.push(row.id);
  }
  for (const id of doomed) ctx.db.combat_action.id.delete(id);
}

/**
 * Characters the round waits on: participants whose status is active and whose character is alive,
 * ascending id. Dead, fled and missing characters are never waited on; a mid-fight joiner is.
 */
export function waitingCharacterIds(ctx: any, combatId: bigint): bigint[] {
  const ids: bigint[] = [];
  for (const participant of ctx.db.combat_participant.by_combat.filter(combatId)) {
    const character = ctx.db.character.id.find(participant.characterId);
    if (!character) continue;
    if (isWaitedOn(participant.status, character.hp)) ids.push(participant.characterId);
  }
  return sortByKey(ids, (id: bigint) => id);
}

/** True when every waited-on character has a choice stored for the round (trivially true for none). */
export function allWaitingChosen(ctx: any, combatId: bigint, roundNumber: bigint): boolean {
  const waiting = waitingCharacterIds(ctx, combatId);
  const chosen = choicesForRound(ctx, combatId, roundNumber).map((r: any) => r.characterId as bigint);
  return allChosen(waiting, chosen);
}

// ---------------------------------------------------------------------------
// Round cooldowns (ability_cooldown.roundsRemaining)
// ---------------------------------------------------------------------------

function cooldownRows(ctx: any, characterId: bigint, abilityTemplateId?: bigint): any[] {
  const out: any[] = [];
  for (const row of ctx.db.ability_cooldown.by_character.filter(characterId)) {
    if (abilityTemplateId === undefined || row.abilityTemplateId === abilityTemplateId) out.push(row);
  }
  return out;
}

/** Rounds an ability is still blocked for a character, including this one; 0n when there is no row. */
export function roundCooldownRemaining(ctx: any, characterId: bigint, abilityTemplateId: bigint): bigint {
  const [row] = cooldownRows(ctx, characterId, abilityTemplateId);
  return row ? (row.roundsRemaining as bigint) : 0n;
}

/**
 * Start (or restart) an in-combat cooldown: roundsRemaining = cooldownRounds(seconds), with the
 * hotbar estimate rounds x 10 s. Keeps one row per (character, ability).
 */
export function setRoundCooldown(
  ctx: any,
  characterId: bigint,
  abilityTemplateId: bigint,
  cooldownSeconds: bigint | null | undefined,
): void {
  const rounds = cooldownRounds(cooldownSeconds);
  const now = nowMicros(ctx);
  const fields = {
    startedAtMicros: now,
    durationMicros: roundsToEstimateMicros(rounds),
    roundsRemaining: rounds,
  };
  const matches = cooldownRows(ctx, characterId, abilityTemplateId);
  if (matches.length === 0) {
    ctx.db.ability_cooldown.insert({ id: 0n, characterId, abilityTemplateId, ...fields });
    return;
  }
  const [keep, ...extras] = matches;
  for (const extra of extras) ctx.db.ability_cooldown.id.delete(extra.id);
  ctx.db.ability_cooldown.id.update({ ...keep, ...fields });
}

/**
 * End of a round: lower every positive roundsRemaining of these characters by 1. A row that reaches
 * 0 is deleted in the same call; otherwise the estimate is rewritten from now.
 */
export function decrementRoundCooldowns(ctx: any, characterIds: readonly bigint[]): void {
  const now = nowMicros(ctx);
  for (const characterId of characterIds) {
    for (const row of cooldownRows(ctx, characterId)) {
      if (row.roundsRemaining <= 0n) continue;
      const next = decrementRounds(row.roundsRemaining);
      if (next === 0n) {
        ctx.db.ability_cooldown.id.delete(row.id);
      } else {
        ctx.db.ability_cooldown.id.update({
          ...row,
          roundsRemaining: next,
          startedAtMicros: now,
          durationMicros: roundsToEstimateMicros(next),
        });
      }
    }
  }
}

/**
 * Fight start: a live wall-clock cooldown becomes ceil(remaining / 4 s) rounds (estimate rounds x
 * 10 s); an expired one is deleted; a row already holding rounds is left alone.
 */
export function beginCombatCooldowns(ctx: any, characterId: bigint): void {
  const now = nowMicros(ctx);
  for (const row of cooldownRows(ctx, characterId)) {
    if (row.roundsRemaining > 0n) continue;
    const rounds = remainingMicrosToRounds(row.startedAtMicros + row.durationMicros - now);
    if (rounds === 0n) {
      ctx.db.ability_cooldown.id.delete(row.id);
      continue;
    }
    ctx.db.ability_cooldown.id.update({
      ...row,
      roundsRemaining: rounds,
      startedAtMicros: now,
      durationMicros: roundsToEstimateMicros(rounds),
    });
  }
}

/**
 * Fight end: leftover rounds become a wall-clock cooldown of rounds x 4 s from now (roundsRemaining
 * back to 0); a zero-round row that has expired is deleted; a live zero-round row is left alone.
 */
export function endCombatCooldowns(ctx: any, characterId: bigint): void {
  const now = nowMicros(ctx);
  for (const row of cooldownRows(ctx, characterId)) {
    if (row.roundsRemaining > 0n) {
      ctx.db.ability_cooldown.id.update({
        ...row,
        roundsRemaining: 0n,
        startedAtMicros: now,
        durationMicros: roundsToWallClockMicros(row.roundsRemaining),
      });
    } else if (row.startedAtMicros + row.durationMicros <= now) {
      ctx.db.ability_cooldown.id.delete(row.id);
    }
  }
}
