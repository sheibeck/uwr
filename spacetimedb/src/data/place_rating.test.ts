import { describe, it, expect } from 'vitest';
import { RATING_KEYS, RATING_WORDS, placeRating, ratingLevelRange } from './place_rating';

const base = { isSafe: false, ready: true, playerLevel: 5n };
const keyOf = (families: { level: number; lvHi: bigint }[], over: Partial<{ playerLevel: bigint; bossOrNamedHere: boolean }> = {}) =>
  placeRating({ ...base, families, ...over }).key;

describe('RATING_KEYS and RATING_WORDS', () => {
  it('lists the five keys with a label each', () => {
    expect([...RATING_KEYS]).toEqual(['safe', 'quiet', 'risky', 'deadly', 'unknown']);
    expect(RATING_WORDS).toEqual({ safe: 'Safe', quiet: 'Quiet', risky: 'Risky', deadly: 'Deadly', unknown: 'Unknown' });
  });
});

describe('placeRating: the places it does not rate', () => {
  it('a safe place is Safe, even with families and a boss', () => {
    expect(placeRating({ ...base, isSafe: true, families: [{ level: 3, lvHi: 9n }], bossOrNamedHere: true })).toEqual({
      key: 'safe',
      word: 'Safe',
    });
  });

  it('an uncharted place reads Danger unknown', () => {
    expect(placeRating({ ...base, isUncharted: true, families: [] })).toEqual({ key: 'unknown', word: 'Danger unknown' });
  });

  it('a non-safe place whose pool rows are not ready is Unknown with no word, never Safe', () => {
    expect(placeRating({ ...base, ready: false, families: [] })).toEqual({ key: 'unknown', word: '' });
    expect(placeRating({ ...base, ready: false, families: [{ level: 3, lvHi: 9n }] })).toEqual({ key: 'unknown', word: '' });
  });

  it('every family wiped out at a non-safe place reads Quiet (B3)', () => {
    expect(placeRating({ ...base, families: [{ level: 0, lvHi: 9n }, { level: 0, lvHi: 9n }] })).toEqual({
      key: 'quiet',
      word: 'Quiet',
    });
  });

  it('a charted non-safe place with no families at all reads Quiet', () => {
    expect(keyOf([])).toBe('quiet');
  });
});

describe('placeRating: level first (D-73)', () => {
  it('the toughest present family at or below the party level reads Quiet', () => {
    expect(placeRating({ ...base, families: [{ level: 2, lvHi: 5n }] })).toEqual({ key: 'quiet', word: 'Quiet' });
    expect(keyOf([{ level: 2, lvHi: 3n }])).toBe('quiet');
  });

  it('one or two levels above reads Risky', () => {
    expect(placeRating({ ...base, families: [{ level: 1, lvHi: 6n }] })).toEqual({ key: 'risky', word: 'Risky' });
    expect(keyOf([{ level: 1, lvHi: 7n }])).toBe('risky');
  });

  it('three or more levels above reads Deadly', () => {
    expect(placeRating({ ...base, families: [{ level: 1, lvHi: 8n }] })).toEqual({ key: 'deadly', word: 'Deadly' });
    expect(keyOf([{ level: 1, lvHi: 12n }])).toBe('deadly');
  });

  it('only present families count: a wiped-out family far above does not set the level', () => {
    expect(keyOf([{ level: 1, lvHi: 4n }, { level: 0, lvHi: 12n }])).toBe('quiet');
  });

  it('the toughest present family sets the base, whatever the order', () => {
    expect(keyOf([{ level: 1, lvHi: 3n }, { level: 1, lvHi: 7n }])).toBe('risky');
    expect(keyOf([{ level: 1, lvHi: 7n }, { level: 1, lvHi: 3n }])).toBe('risky');
  });

  it('reads the party\'s lowest level as given (D-56)', () => {
    expect(keyOf([{ level: 1, lvHi: 6n }], { playerLevel: 6n })).toBe('quiet');
    expect(keyOf([{ level: 1, lvHi: 6n }], { playerLevel: 3n })).toBe('deadly');
  });
});

describe('placeRating: crowds nudge (D-73)', () => {
  it('one Overrun family crowds the place: Quiet becomes Risky', () => {
    expect(keyOf([{ level: 3, lvHi: 5n }])).toBe('risky');
  });

  it('three living families crowd the place, at any density above Wiped out', () => {
    expect(keyOf([{ level: 2, lvHi: 5n }, { level: 2, lvHi: 5n }, { level: 2, lvHi: 5n }])).toBe('risky');
    expect(keyOf([{ level: 2, lvHi: 5n }, { level: 2, lvHi: 5n }, { level: 1, lvHi: 5n }])).toBe('risky');
    expect(keyOf([{ level: 1, lvHi: 4n }, { level: 1, lvHi: 4n }, { level: 1, lvHi: 4n }])).toBe('risky');
  });

  it('two families at an even level are not a crowd: Quiet', () => {
    expect(keyOf([{ level: 2, lvHi: 5n }, { level: 2, lvHi: 5n }])).toBe('quiet');
  });

  it('a wiped-out family does not count toward a crowd', () => {
    expect(keyOf([{ level: 2, lvHi: 5n }, { level: 2, lvHi: 5n }, { level: 0, lvHi: 5n }])).toBe('quiet');
  });

  it('a crowd on Risky reads Deadly, and Deadly stays Deadly', () => {
    expect(keyOf([{ level: 3, lvHi: 6n }])).toBe('deadly');
    expect(keyOf([{ level: 1, lvHi: 7n }, { level: 1, lvHi: 5n }, { level: 1, lvHi: 5n }])).toBe('deadly');
    expect(keyOf([{ level: 3, lvHi: 9n }])).toBe('deadly');
  });

  it('The Drowned Bell (owner, 2026-10-09): three level-3 families at Stable, Scarce, Stable for a level-3 player read Risky, not Deadly', () => {
    const families = [
      { level: 2, lvHi: 3n }, // Salt-Crust Skitterers
      { level: 1, lvHi: 3n }, // Glass Orchard Wisps
      { level: 2, lvHi: 3n }, // Brine Sentinels
    ];
    expect(placeRating({ ...base, playerLevel: 3n, families })).toEqual({ key: 'risky', word: 'Risky' });
    // The same place with every family at Stable is crowded too: Risky.
    expect(keyOf(families.map((f) => ({ ...f, level: 2 })), { playerLevel: 3n })).toBe('risky');
  });
});

describe('placeRating: a boss or named enemy (D-34)', () => {
  it('raises the rating one step; Deadly stays Deadly', () => {
    expect(keyOf([{ level: 2, lvHi: 5n }], { bossOrNamedHere: true })).toBe('risky');
    expect(keyOf([{ level: 1, lvHi: 6n }], { bossOrNamedHere: true })).toBe('deadly');
    expect(keyOf([{ level: 2, lvHi: 8n }], { bossOrNamedHere: true })).toBe('deadly');
  });

  it('a crowd and a boss both apply: Quiet becomes Deadly', () => {
    expect(keyOf([{ level: 3, lvHi: 5n }], { bossOrNamedHere: true })).toBe('deadly');
  });

  it('no families plus a boss reads Risky', () => {
    expect(keyOf([], { bossOrNamedHere: true })).toBe('risky');
  });
});

describe('ratingLevelRange', () => {
  it('spans every family, wiped-out ones included', () => {
    expect(ratingLevelRange([{ lvLo: 4n, lvHi: 5n }, { lvLo: 3n, lvHi: 6n }])).toEqual({ lo: 3n, hi: 6n });
  });

  it('is null for no families', () => {
    expect(ratingLevelRange([])).toBeNull();
  });
});
