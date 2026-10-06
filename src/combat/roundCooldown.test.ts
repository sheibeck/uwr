import { describe, expect, it } from 'vitest';
import { cooldownTotalRounds, roundCooldownView, roundsText } from './roundCooldown';

describe('cooldownTotalRounds', () => {
  it('ceils cooldownSeconds over 4 s rounds', () => {
    expect(cooldownTotalRounds(12n)).toBe(3n);
    expect(cooldownTotalRounds(9n)).toBe(3n);
    expect(cooldownTotalRounds(8n)).toBe(2n);
    expect(cooldownTotalRounds(5n)).toBe(2n);
    expect(cooldownTotalRounds(4n)).toBe(1n);
    expect(cooldownTotalRounds(1n)).toBe(1n);
  });

  it('never goes below one round', () => {
    expect(cooldownTotalRounds(0n)).toBe(1n);
  });
});

describe('roundsText', () => {
  it('pluralizes', () => {
    expect(roundsText(1n)).toBe('1 round');
    expect(roundsText(2n)).toBe('2 rounds');
    expect(roundsText(10n)).toBe('10 rounds');
  });
});

describe('roundCooldownView', () => {
  it('cools with two rounds left of a 12 s ability', () => {
    expect(roundCooldownView({ roundsRemaining: 2n }, { cooldownSeconds: 12n })).toEqual({
      cooling: true,
      rounds: 2n,
      totalRounds: 3n,
      fraction: 2 / 3,
      text: '2 rounds',
      ariaSuffix: ', ready in 2 rounds',
    });
  });

  it('uses the singular for one round', () => {
    const view = roundCooldownView({ roundsRemaining: 1n }, { cooldownSeconds: 12n });
    expect(view.text).toBe('1 round');
    expect(view.ariaSuffix).toBe(', ready in 1 round');
  });

  it('never lets the total fall below the rounds left', () => {
    const view = roundCooldownView({ roundsRemaining: 5n }, { cooldownSeconds: 4n });
    expect(view.totalRounds).toBe(5n);
    expect(view.fraction).toBe(1);
  });

  it('is not cooling at 0 rounds or with no row', () => {
    const idle = { cooling: false, rounds: 0n, totalRounds: 0n, fraction: 0, text: '', ariaSuffix: '' };
    expect(roundCooldownView({ roundsRemaining: 0n }, { cooldownSeconds: 12n })).toEqual(idle);
    expect(roundCooldownView(undefined, { cooldownSeconds: 12n })).toEqual(idle);
  });

  it('takes the total from cooldownSeconds, never from a wall-clock field on the row', () => {
    // A row literal that also carries a wall-clock estimate: the extra field must change nothing.
    const row = { roundsRemaining: 3n, durationMicros: 30_000_000n };
    const view = roundCooldownView(row, { cooldownSeconds: 20n });
    expect(view.totalRounds).toBe(5n);
    expect(view.fraction).toBeCloseTo(0.6, 10);
    expect(roundCooldownView(row, { cooldownSeconds: 12n })).toMatchObject({ totalRounds: 3n, fraction: 1 });
    expect(roundCooldownView({ roundsRemaining: 3n }, { cooldownSeconds: 20n })).toEqual(view);
  });
});
