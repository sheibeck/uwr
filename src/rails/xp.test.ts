import { describe, expect, it } from 'vitest';
import { MAX_LEVEL } from '@game-data/xp';
import { xpProgress } from './xp';

describe('xpProgress', () => {
  it('shows progress into the level over that level need', () => {
    // level 3 floor 260, level 4 floor 480 -> need 220
    const p = xpProgress({ xp: 318n, level: 3n });
    expect(p).toMatchObject({ max: false, value: 58, need: 220, text: '58 / 220' });
    expect(p.fraction).toBeCloseTo(58 / 220, 6);
  });

  it('starts level 1 from 0', () => {
    expect(xpProgress({ xp: 40n, level: 1n })).toMatchObject({ value: 40, need: 100, text: '40 / 100' });
  });

  it('reads 0 when xp is below the level floor', () => {
    const p = xpProgress({ xp: 10n, level: 3n });
    expect(p.value).toBe(0);
    expect(p.fraction).toBe(0);
    expect(p.text).toBe('0 / 220');
  });

  it('clamps pending-level xp to the need', () => {
    const p = xpProgress({ xp: 900n, level: 3n });
    expect(p.value).toBe(220);
    expect(p.fraction).toBe(1);
    expect(p.text).toBe('220 / 220');
  });

  it('is full and reads Max level at the maximum level', () => {
    expect(xpProgress({ xp: 3060n, level: MAX_LEVEL })).toEqual({
      max: true,
      value: 1,
      need: 1,
      fraction: 1,
      text: 'Max level',
    });
    expect(xpProgress({ xp: 0n, level: MAX_LEVEL + 5n }).text).toBe('Max level');
  });

  it('never throws on huge values', () => {
    const p = xpProgress({ xp: 10n ** 30n, level: 2n });
    expect(p.fraction).toBe(1);
    expect(Number.isFinite(p.value)).toBe(true);
  });
});
