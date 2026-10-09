/**
 * Phase 51.3.1.2 Plan 02: the rules that size and shape a bigger region (D-03, D-04, D-05, D-10).
 * Pure functions only; the property cases use a small seeded generator (an LCG), never Math.random.
 */
import { describe, it, expect } from 'vitest';
import { economyRoll } from './economy_rules';
import { DENSITY_RULES, POOL_ROLL, hubSeed } from './density_rules';
import { placeCountFor, acceptedNewPlaces } from './region_shape';

const R = DENSITY_RULES;

// ============================================================================
// Task 1: the place count (D-03)
// ============================================================================

describe('placeCountFor (D-03)', () => {
  it('always rolls a whole number in REGION_PLACES_MIN..REGION_PLACES_MAX and hits every value', () => {
    const seen = new Set<number>();
    for (let id = 1n; id <= 2000n; id += 1n) {
      const n = placeCountFor(id);
      expect(Number.isInteger(n)).toBe(true);
      expect(n).toBeGreaterThanOrEqual(R.REGION_PLACES_MIN);
      expect(n).toBeLessThanOrEqual(R.REGION_PLACES_MAX);
      seen.add(n);
    }
    expect([...seen].sort((a, b) => a - b)).toEqual([8, 9, 10]);
  });

  it('gives the same count on a second call (no timestamp)', () => {
    for (let id = 1n; id <= 200n; id += 1n) expect(placeCountFor(id)).toBe(placeCountFor(id));
  });

  it('rolls hubSeed(regionId) at POOL_ROLL.PLACE_COUNT', () => {
    const span = BigInt(R.REGION_PLACES_MAX - R.REGION_PLACES_MIN + 1);
    for (const id of [1n, 2n, 17n, 999n]) {
      expect(placeCountFor(id)).toBe(R.REGION_PLACES_MIN + Number(economyRoll(hubSeed(id), POOL_ROLL.PLACE_COUNT) % span));
    }
  });
});

describe('acceptedNewPlaces (D-03)', () => {
  it('keeps at most placeCount - 1 new places and accepts down to the floor', () => {
    expect(acceptedNewPlaces(12, 9)).toEqual({ keep: 8, ok: true });
    expect(acceptedNewPlaces(8, 9)).toEqual({ keep: 8, ok: true });
    expect(acceptedNewPlaces(5, 9)).toEqual({ keep: 5, ok: true }); // 6 in all: the floor
    expect(acceptedNewPlaces(4, 9)).toEqual({ keep: 4, ok: false }); // 5 in all: below the floor
    expect(acceptedNewPlaces(0, 9)).toEqual({ keep: 0, ok: false });
    expect(acceptedNewPlaces(20, 10)).toEqual({ keep: 9, ok: true });
    expect(acceptedNewPlaces(20, 8)).toEqual({ keep: 7, ok: true });
  });

  it('keeps at most REGION_PLACES_MAX - 1 and never fails when the job asked without a count', () => {
    expect(acceptedNewPlaces(12, null)).toEqual({ keep: 9, ok: true });
    expect(acceptedNewPlaces(9, null)).toEqual({ keep: 9, ok: true });
    expect(acceptedNewPlaces(3, null)).toEqual({ keep: 3, ok: true });
    expect(acceptedNewPlaces(0, null)).toEqual({ keep: 0, ok: true });
  });

  it('treats a negative or fractional usable count as whole and never keeps below 0', () => {
    expect(acceptedNewPlaces(-3, 9)).toEqual({ keep: 0, ok: false });
    expect(acceptedNewPlaces(6.7, 9)).toEqual({ keep: 6, ok: true });
    expect(acceptedNewPlaces(Number.NaN, null)).toEqual({ keep: 0, ok: true });
  });
});
