import { describe, expect, it } from 'vitest';
import { nextTargetId } from './cycling';

const LIVING = [3n, 5n, 9n];

describe('nextTargetId', () => {
  it('steps forward from the current target', () => {
    expect(nextTargetId(LIVING, 3n, null, 1)).toBe(5n);
    expect(nextTargetId(LIVING, 5n, null, 1)).toBe(9n);
  });

  it('wraps forward past the last', () => {
    expect(nextTargetId(LIVING, 9n, null, 1)).toBe(3n);
  });

  it('steps backward and wraps past the first', () => {
    expect(nextTargetId(LIVING, 9n, null, -1)).toBe(5n);
    expect(nextTargetId(LIVING, 3n, null, -1)).toBe(9n);
  });

  it('picks the first (forward) or last (backward) with no target', () => {
    expect(nextTargetId(LIVING, null, null, 1)).toBe(3n);
    expect(nextTargetId(LIVING, null, null, -1)).toBe(9n);
  });

  it('advances from the last requested target on rapid presses', () => {
    expect(nextTargetId(LIVING, 3n, 5n, 1)).toBe(9n);
    expect(nextTargetId(LIVING, 3n, 5n, -1)).toBe(3n);
  });

  it('falls back to the current target when the last requested one is no longer living', () => {
    expect(nextTargetId(LIVING, 5n, 4n, 1)).toBe(9n);
    expect(nextTargetId([3n, 9n], 3n, 5n, 1)).toBe(9n);
  });

  it('picks first or last when the current target is defeated and nothing was requested', () => {
    expect(nextTargetId([3n, 9n], 5n, null, 1)).toBe(3n);
    expect(nextTargetId([3n, 9n], 5n, null, -1)).toBe(9n);
  });

  it('does nothing for a single living hostile that is already the base', () => {
    expect(nextTargetId([5n], 5n, null, 1)).toBeNull();
    expect(nextTargetId([5n], 5n, null, -1)).toBeNull();
    expect(nextTargetId([5n], null, 5n, 1)).toBeNull();
  });

  it('picks the only living hostile when it is not yet the target', () => {
    expect(nextTargetId([5n], null, null, 1)).toBe(5n);
    expect(nextTargetId([5n], null, null, -1)).toBe(5n);
  });

  it('does nothing with no living hostile', () => {
    expect(nextTargetId([], null, null, 1)).toBeNull();
    expect(nextTargetId([], 5n, 3n, -1)).toBeNull();
  });
});
