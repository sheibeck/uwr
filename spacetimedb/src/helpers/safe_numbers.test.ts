import { describe, it, expect } from 'vitest';
import { toBigIntSafe, clampInt } from './safe_numbers';

const OPTS = { min: 0n, max: 10n, fallback: 3n };

describe('toBigIntSafe', () => {
  it.each<[unknown, bigint]>([
    [1.7, 1n],
    [-5, 0n],
    [99, 10n],
    [0, 0n],
    [10, 10n],
    [-0.5, 0n],
    ['12', 10n],
    ['7', 7n],
    [' 7.9 ', 7n],
    [5n, 5n],
    [50n, 10n],
    [-50n, 0n],
    [1e300, 10n],
  ])('%s -> %s', (input, expected) => {
    expect(toBigIntSafe(input, OPTS)).toBe(expected);
  });

  it.each<[string, unknown]>([
    ['NaN', NaN],
    ['Infinity', Infinity],
    ['-Infinity', -Infinity],
    ['null', null],
    ['undefined', undefined],
    ['non-numeric string', 'abc'],
    ['empty string', ''],
    ['blank string', '   '],
    ['object', {}],
    ['array', [1]],
    ['boolean', true],
  ])('%s returns the fallback and never throws', (_label, input) => {
    expect(toBigIntSafe(input, OPTS)).toBe(3n);
  });

  it('does not clamp the fallback', () => {
    expect(toBigIntSafe(NaN, { min: 0n, max: 10n, fallback: 99n })).toBe(99n);
  });

  it('supports a wide range and a negative minimum', () => {
    expect(toBigIntSafe(-3.2, { min: -5n, max: 5n, fallback: 0n })).toBe(-4n);
    expect(toBigIntSafe(2 ** 40, { min: 0n, max: 1_000_000n, fallback: 0n })).toBe(1_000_000n);
  });
});

describe('clampInt', () => {
  it.each<[unknown, number]>([
    [1.7, 1],
    [-5, 0],
    [99, 10],
    ['12', 10],
    ['7', 7],
    [5n, 5],
    [50n, 10],
  ])('%s -> %s', (input, expected) => {
    expect(clampInt(input, 0, 10, 3)).toBe(expected);
  });

  it.each<unknown>([NaN, Infinity, null, undefined, 'abc', {}, ''])('%s returns the fallback', (input) => {
    expect(clampInt(input, 0, 10, 3)).toBe(3);
  });
});
