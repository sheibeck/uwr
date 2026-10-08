import { describe, it, expect } from 'vitest';
import { RATING_KEYS, RATING_WORDS, placeRating, ratingLevelRange } from './place_rating';

const base = { isSafe: false, ready: true, playerLevel: 5n };

describe('RATING_KEYS and RATING_WORDS', () => {
  it('lists the five keys with a label each', () => {
    expect([...RATING_KEYS]).toEqual(['safe', 'quiet', 'risky', 'deadly', 'unknown']);
    expect(RATING_WORDS).toEqual({ safe: 'Safe', quiet: 'Quiet', risky: 'Risky', deadly: 'Deadly', unknown: 'Unknown' });
  });
});

describe('placeRating', () => {
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

  it('one Stable family at the player level scores 20 tenths: Quiet', () => {
    expect(placeRating({ ...base, families: [{ level: 2, lvHi: 5n }] }).key).toBe('quiet');
  });

  it('two Stable families 2 above the player score 64 tenths: Deadly', () => {
    expect(
      placeRating({ ...base, families: [{ level: 2, lvHi: 7n }, { level: 2, lvHi: 7n }] }),
    ).toEqual({ key: 'deadly', word: 'Deadly' });
  });

  it('one Overrun family 1 below scores 30 tenths: Risky', () => {
    expect(placeRating({ ...base, families: [{ level: 3, lvHi: 4n }] })).toEqual({ key: 'risky', word: 'Risky' });
  });

  it('one Scarce family 3 below scores 5 tenths: Quiet', () => {
    expect(placeRating({ ...base, families: [{ level: 1, lvHi: 2n }] }).key).toBe('quiet');
  });

  it('a family 3 or more above weighs 2.5: one Stable family reads Deadly (50 tenths)', () => {
    expect(placeRating({ ...base, families: [{ level: 2, lvHi: 8n }] }).key).toBe('deadly');
  });

  it('scores sit on the right side of the thresholds', () => {
    expect(placeRating({ ...base, families: [{ level: 1, lvHi: 6n }] }).key).toBe('quiet'); // 1 x 16 = 16
    expect(placeRating({ ...base, families: [{ level: 2, lvHi: 6n }] }).key).toBe('risky'); // 2 x 16 = 32
    // 2 x 10 + 2 x 10 + 1 x 5 = 45: just above Risky
    expect(
      placeRating({ ...base, families: [{ level: 2, lvHi: 5n }, { level: 2, lvHi: 4n }, { level: 1, lvHi: 3n }] }).key,
    ).toBe('deadly');
    // 2 x 10 + 2 x 10 = 40: Risky
    expect(placeRating({ ...base, families: [{ level: 2, lvHi: 5n }, { level: 2, lvHi: 4n }] }).key).toBe('risky');
  });

  it('every family wiped out at a non-safe place reads Quiet (B3)', () => {
    expect(placeRating({ ...base, families: [{ level: 0, lvHi: 9n }, { level: 0, lvHi: 9n }] })).toEqual({
      key: 'quiet',
      word: 'Quiet',
    });
  });

  it('a charted non-safe place with no families at all reads Quiet', () => {
    expect(placeRating({ ...base, families: [] }).key).toBe('quiet');
  });

  it('a living boss or named enemy raises the rating one step; Deadly stays Deadly', () => {
    expect(placeRating({ ...base, families: [{ level: 2, lvHi: 5n }], bossOrNamedHere: true }).key).toBe('risky');
    expect(placeRating({ ...base, families: [{ level: 3, lvHi: 4n }], bossOrNamedHere: true }).key).toBe('deadly');
    expect(placeRating({ ...base, families: [{ level: 2, lvHi: 8n }], bossOrNamedHere: true }).key).toBe('deadly');
    expect(placeRating({ ...base, families: [], bossOrNamedHere: true }).key).toBe('risky');
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
