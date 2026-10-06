import { describe, expect, it } from 'vitest';
import { ROUND_TIMER_MICROS } from '@game-data/combat_constants';
import { inCombatLabel, roundTimer, sheetMeta, timerText } from './roundClock';

const S = 1_700_000_000_000_000n;
const NOW = Number(S);
const round = { startedAtMicros: S, timerExpiresAtMicros: S + 10_000_000n };

/** A clock that leaves exactly `remaining` microseconds in the round. */
function at(remaining: number): number {
  return Number(round.timerExpiresAtMicros) - remaining;
}

describe('roundTimer', () => {
  it('shows 10s at the start with a full bar', () => {
    const state = roundTimer(round, at(10_000_000));
    expect(state).toEqual({ resolving: false, seconds: 10, fraction: 1, totalSeconds: 10 });
    expect(timerText(state)).toBe('10s');
  });

  it('rounds up at every second boundary', () => {
    expect(roundTimer(round, at(9_000_001)).seconds).toBe(10);
    expect(roundTimer(round, at(9_000_000)).seconds).toBe(9);
    expect(roundTimer(round, at(1_000_001)).seconds).toBe(2);
    expect(roundTimer(round, at(1_000_000)).seconds).toBe(1);
    expect(roundTimer(round, at(1)).seconds).toBe(1);
  });

  it('never shows 0s: 1 microsecond left reads 1s, 0 and below read Resolving…', () => {
    expect(timerText(roundTimer(round, at(1)))).toBe('1s');
    for (const remaining of [0, -1, -5_000_000]) {
      const state = roundTimer(round, at(remaining));
      expect(state.resolving).toBe(true);
      expect(state.seconds).toBe(0);
      expect(state.fraction).toBe(0);
      expect(timerText(state)).toBe('Resolving…');
    }
  });

  it('is resolving with no open round', () => {
    const state = roundTimer(null, NOW);
    expect(state).toEqual({ resolving: true, seconds: 0, fraction: 0, totalSeconds: 10 });
    expect(timerText(state)).toBe('Resolving…');
  });

  it('computes the bar fraction over the round length', () => {
    expect(roundTimer(round, at(5_000_000)).fraction).toBeCloseTo(0.5, 10);
    expect(roundTimer(round, at(2_500_000)).fraction).toBeCloseTo(0.25, 10);
  });

  it('clamps the fraction to 1 when more than the round length remains', () => {
    const state = roundTimer(round, at(12_000_000));
    expect(state.fraction).toBe(1);
    expect(state.seconds).toBe(12);
  });

  it('uses ROUND_TIMER_MICROS when the expiry is not after the start', () => {
    const flat = { startedAtMicros: S, timerExpiresAtMicros: S };
    const backwards = { startedAtMicros: S, timerExpiresAtMicros: S - 5n };
    expect(ROUND_TIMER_MICROS).toBe(10_000_000n);
    const a = roundTimer(flat, Number(S) - 5_000_000);
    expect(a.totalSeconds).toBe(10);
    expect(a.fraction).toBeCloseTo(0.5, 10);
    expect(roundTimer(backwards, Number(S) - 5 - 1_000_000).totalSeconds).toBe(10);
  });

  it('reports a non-default round length in whole seconds', () => {
    const long = { startedAtMicros: S, timerExpiresAtMicros: S + 15_500_000n };
    expect(roundTimer(long, Number(S)).totalSeconds).toBe(16);
  });
});

describe('inCombatLabel', () => {
  it('names the round', () => {
    expect(inCombatLabel(3n)).toEqual({ text: 'In combat · Round 3', ariaLabel: 'In combat, round 3' });
  });
  it('drops the round when there is none', () => {
    expect(inCombatLabel(null)).toEqual({ text: 'In combat', ariaLabel: 'In combat' });
  });
});

describe('sheetMeta', () => {
  it('joins the round and the seconds', () => {
    expect(sheetMeta(3n, roundTimer(round, at(5_500_000)))).toBe('Round 3 · 6s');
  });
  it('shows Resolving… at 0', () => {
    expect(sheetMeta(3n, roundTimer(round, at(0)))).toBe('Round 3 · Resolving…');
  });
  it('shows the timer text alone without a round number', () => {
    expect(sheetMeta(null, roundTimer(null, NOW))).toBe('Resolving…');
    expect(sheetMeta(null, roundTimer(round, at(4_000_000)))).toBe('4s');
  });
});
