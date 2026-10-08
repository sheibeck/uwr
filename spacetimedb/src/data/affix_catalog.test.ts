import { describe, it, expect, vi } from 'vitest';
import { AFFIX_COUNT_BY_QUALITY } from './affix_catalog';
import { generateAffixData } from '../helpers/items';

// helpers/items imports spacetimedb/server (SenderError only); the real package does not load under plain vitest.
vi.mock('spacetimedb/server', () => ({
  SenderError: class extends Error {},
}));

// Phase 51.3: legendary items carry three affixes (the top magnitudes). They drop only from bosses and
// named foes, so the count is the same as epic but at the top tier of magnitudes.

describe('AFFIX_COUNT_BY_QUALITY', () => {
  it('is 0, 1, 2, 3, 3 for common through legendary', () => {
    expect(AFFIX_COUNT_BY_QUALITY['common']).toBe(0);
    expect(AFFIX_COUNT_BY_QUALITY['uncommon']).toBe(1);
    expect(AFFIX_COUNT_BY_QUALITY['rare']).toBe(2);
    expect(AFFIX_COUNT_BY_QUALITY['epic']).toBe(3);
    expect(AFFIX_COUNT_BY_QUALITY['legendary']).toBe(3);
  });
});

describe('generateAffixData with the real catalog', () => {
  it('gives a legendary main hand exactly 3 affixes over 5 seeds', () => {
    for (const seed of [0n, 1n, 17n, 12345n, 987654321012345n]) {
      expect(generateAffixData('mainHand', 'legendary', seed)).toHaveLength(3);
    }
  });

  it('gives a common item none', () => {
    for (const seed of [0n, 1n, 17n, 12345n, 987654321012345n]) {
      expect(generateAffixData('mainHand', 'common', seed)).toHaveLength(0);
    }
  });

  it('gives legendary affixes of distinct keys', () => {
    const affixes = generateAffixData('mainHand', 'legendary', 4242n);
    expect(new Set(affixes.map((a) => a.affixKey)).size).toBe(3);
  });
});
