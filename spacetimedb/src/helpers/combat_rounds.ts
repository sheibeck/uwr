/**
 * Phase 46.1 (RND-01, RND-02, RND-03): the pure rules the round engine is built on.
 *
 * Every in-combat timing goes through this module, so the ceil-and-minimum-1 rule and the
 * cooldown meaning are identical everywhere. All arithmetic is bigint; nothing here converts a
 * time or a round count to a JS number. No ctx, no SpacetimeDB imports.
 *
 * Cooldown meaning (CONTEXT): an ability with an in-combat cooldown of C rounds that is used in
 * round N is choosable again from round N + C. It is stored as C at use and decremented once at
 * the end of every round, the use round included. It reaches 0 at the end of round N + C - 1, so
 * C = 1 is choosable every round, C = 2 skips one round and C = 3 skips two.
 *
 * Wind-up: an ability announced in round N lands at the end of round N + windupRounds
 * (minimum 1 round when there is a cast time at all).
 */
import {
  ROUND_TIMER_MICROS,
  EFFECT_ROUND_CONVERSION_MICROS,
  MIN_EFFECT_ROUNDS,
} from '../data/combat_constants';

export const ROUND_STATE = { select: 'action_select', resolving: 'resolving', resolved: 'resolved' } as const;

export const CHOICE_ACTION_TYPES = ['ability', 'auto_attack', 'flee'] as const;
export type ChoiceActionType = (typeof CHOICE_ACTION_TYPES)[number];

export function isChoiceActionType(value: unknown): value is ChoiceActionType {
  return typeof value === 'string' && (CHOICE_ACTION_TYPES as readonly string[]).includes(value);
}

const MICROS_PER_SECOND = 1_000_000n;

/** ceil(micros / EFFECT_ROUND_CONVERSION_MICROS), never less than MIN_EFFECT_ROUNDS. */
export function durationMicrosToRounds(micros: bigint): bigint {
  const R = EFFECT_ROUND_CONVERSION_MICROS;
  const rounds = micros > 0n ? (micros + R - 1n) / R : 0n;
  return rounds < MIN_EFFECT_ROUNDS ? MIN_EFFECT_ROUNDS : rounds;
}

export function secondsToRounds(seconds: bigint | null | undefined): bigint {
  return durationMicrosToRounds((seconds ?? 0n) * MICROS_PER_SECOND);
}

/** Rounds still to run for a remaining wall-clock time; 0 when nothing remains. */
export function remainingMicrosToRounds(micros: bigint): bigint {
  return micros <= 0n ? 0n : durationMicrosToRounds(micros);
}

/** In-combat cooldown length in rounds; always at least 1. */
export function cooldownRounds(cooldownSeconds: bigint | null | undefined): bigint {
  return secondsToRounds(cooldownSeconds ?? 0n);
}

/** Rounds of wind-up: 0 for no cast time, else at least 1. */
export function windupRounds(castSeconds: bigint | null | undefined): bigint {
  if (castSeconds === null || castSeconds === undefined || castSeconds <= 0n) return 0n;
  return secondsToRounds(castSeconds);
}

export function roundDeadlineMicros(startMicros: bigint): bigint {
  return startMicros + ROUND_TIMER_MICROS;
}

/** Client hotbar estimate: a round lasts at most ROUND_TIMER_MICROS. */
export function roundsToEstimateMicros(rounds: bigint): bigint {
  return rounds * ROUND_TIMER_MICROS;
}

/** Fight-end conversion of remaining rounds back to wall-clock time. */
export function roundsToWallClockMicros(rounds: bigint): bigint {
  return rounds * EFFECT_ROUND_CONVERSION_MICROS;
}

export function decrementRounds(rounds: bigint): bigint {
  return rounds > 0n ? rounds - 1n : 0n;
}

export function compareBigint(a: bigint, b: bigint): -1 | 0 | 1 {
  return a < b ? -1 : a > b ? 1 : 0;
}

/** New array, ascending id. Never mutates the input. */
export function sortById<T extends { id: bigint }>(rows: readonly T[]): T[] {
  return [...rows].sort((a, b) => compareBigint(a.id, b.id));
}

/** New array, ascending key. Never mutates the input. */
export function sortByKey<T>(rows: readonly T[], key: (row: T) => bigint): T[] {
  return [...rows].sort((a, b) => compareBigint(key(a), key(b)));
}

/** A participant the round waits on: still active and alive. */
export function isWaitedOn(status: string, hp: bigint): boolean {
  return status === 'active' && hp > 0n;
}

/** True when every waited-on id has a choice (and trivially for an empty list). */
export function allChosen(waitingIds: readonly bigint[], chosenIds: readonly bigint[]): boolean {
  const chosen = new Set<bigint>(chosenIds);
  return waitingIds.every((id) => chosen.has(id));
}

/** The current target when it is still living, else the lowest living enemy id. */
export function autoAttackTargetId(
  currentTargetId: bigint | null | undefined,
  livingEnemyIds: readonly bigint[],
): bigint | undefined {
  if (livingEnemyIds.length === 0) return undefined;
  if (currentTargetId !== null && currentTargetId !== undefined && livingEnemyIds.includes(currentTargetId)) {
    return currentTargetId;
  }
  let lowest = livingEnemyIds[0];
  for (const id of livingEnemyIds) {
    if (id < lowest) lowest = id;
  }
  return lowest;
}

/** A scheduled round tick is stale unless its round is still open for choices. */
export function isStaleTick(
  tickRoundNumber: bigint,
  round: { roundNumber: bigint; state: string } | null | undefined,
): boolean {
  if (!round) return true;
  return round.roundNumber !== tickRoundNumber || round.state !== ROUND_STATE.select;
}

/** Pet abilities fire on a period of secondsToRounds(cooldown, default 10 s) rounds, from round 1. */
export function petAbilityDue(roundNumber: bigint, cooldownSeconds: bigint | null | undefined): boolean {
  return (roundNumber - 1n) % secondsToRounds(cooldownSeconds ?? 10n) === 0n;
}

/** An enemy ability is ready when it has no cooldown mark or the ready round has arrived. */
export function enemyAbilityReady(readyAtRound: bigint | null | undefined, roundNumber: bigint): boolean {
  return readyAtRound === null || readyAtRound === undefined || readyAtRound <= roundNumber;
}

export const ROUND_SEED_STRIDE = 104729n;

export function roundSeed(base: bigint, roundNumber: bigint): bigint {
  return base + roundNumber * ROUND_SEED_STRIDE;
}
