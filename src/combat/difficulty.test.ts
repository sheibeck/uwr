import { describe, expect, it } from 'vitest';
import { conFor } from './difficulty';

const PLAYER = 3n;

describe('conFor (CMB-01 difficulty by level difference)', () => {
  it.each([
    [-6n, 'con-gray', 'Trivial'],
    [-5n, 'con-gray', 'Trivial'],
    [-4n, 'con-light-green', 'Easy'],
    [-2n, 'con-light-green', 'Easy'],
    [-1n, 'con-blue', 'Slightly easy'],
    [0n, 'con-white', 'Even match'],
    [1n, 'con-yellow', 'Tough'],
    [2n, 'con-orange', 'Hard'],
    [3n, 'con-red', 'Deadly'],
    [9n, 'con-red', 'Deadly'],
  ])('diff %s maps to %s (%s)', (diff, className, meaning) => {
    const view = conFor(PLAYER + diff, PLAYER);
    expect(view.className).toBe(className);
    expect(view.meaning).toBe(meaning);
    expect(view.token).toBe(`--color-${className}`);
  });

  it('also covers the -3 step inside the Easy band', () => {
    expect(conFor(PLAYER - 3n, PLAYER).className).toBe('con-light-green');
  });

  it('treats a missing enemy level as an even match', () => {
    for (const level of [undefined, null]) {
      const view = conFor(level, PLAYER);
      expect(view.className).toBe('con-white');
      expect(view.meaning).toBe('Even match');
      expect(view.token).toBe('--color-con-white');
    }
  });

  it('works when the player level is high and the enemy level is low', () => {
    expect(conFor(1n, 30n).className).toBe('con-gray');
  });
});
