// Round timer state and the copy built from it (48-UI-SPEC "Round Contract", CMB-06).
//
// The countdown reads the open combat_round row and the server-clock estimate only. Epoch
// microseconds are bigint rows; Number() is used here for display arithmetic only.
import { ROUND_TIMER_MICROS } from '@game-data/combat_constants';

const MICROS_PER_SECOND = 1_000_000;

export interface RoundTimerState {
  /** True when there is no open round, or the open round has reached its expiry. */
  resolving: boolean;
  /** ceil(remaining / 1 s); 0 only while resolving. Never shows '0s'. */
  seconds: number;
  /** remaining / round length, clamped to 0..1. */
  fraction: number;
  /** The round's length in whole seconds (the progressbar's max). */
  totalSeconds: number;
}

export interface RoundTimerRow {
  timerExpiresAtMicros: bigint;
  startedAtMicros: bigint;
}

export function roundTimer(round: RoundTimerRow | null, nowMicros: number): RoundTimerState {
  const fallback = Number(ROUND_TIMER_MICROS);
  if (round === null) {
    return { resolving: true, seconds: 0, fraction: 0, totalSeconds: Math.ceil(fallback / MICROS_PER_SECOND) };
  }
  const rowLength = Number(round.timerExpiresAtMicros - round.startedAtMicros);
  const length = rowLength > 0 ? rowLength : fallback;
  const totalSeconds = Math.ceil(length / MICROS_PER_SECOND);
  const remaining = Number(round.timerExpiresAtMicros) - nowMicros;
  if (!(remaining > 0)) return { resolving: true, seconds: 0, fraction: 0, totalSeconds };
  return {
    resolving: false,
    seconds: Math.ceil(remaining / MICROS_PER_SECOND),
    fraction: Math.min(1, Math.max(0, remaining / length)),
    totalSeconds,
  };
}

/** '6s', or 'Resolving…' (U+2026) while there is no time left. */
export function timerText(state: RoundTimerState): string {
  return state.resolving ? 'Resolving…' : `${state.seconds}s`;
}

/** Header and strip tag: 'In combat · Round 3' (aria 'In combat, round 3'); no round -> 'In combat'. */
export function inCombatLabel(roundNumber: bigint | null): { text: string; ariaLabel: string } {
  if (roundNumber === null) return { text: 'In combat', ariaLabel: 'In combat' };
  return { text: `In combat · Round ${roundNumber}`, ariaLabel: `In combat, round ${roundNumber}` };
}

/** Encounter sheet meta: 'Round 3 · 6s' or 'Round 3 · Resolving…'; no round -> the timer text alone. */
export function sheetMeta(roundNumber: bigint | null, state: RoundTimerState): string {
  const timer = timerText(state);
  if (roundNumber === null) return timer;
  return `Round ${roundNumber} · ${timer}`;
}
