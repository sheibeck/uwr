import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { FACTION_TIER_LABELS, factionTier } from './faction_rules';
import { FACTION_STANDING_THRESHOLDS } from './mechanical_vocabulary';

function importSpecifiers(fileName: string): string[] {
  const path = fileURLToPath(new URL(`./${fileName}`, import.meta.url));
  const source = readFileSync(path, 'utf8');
  const out: string[] = [];
  const re = /from\s+'([^']+)'/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(source)) !== null) out.push(m[1]);
  return out;
}

describe('factionTier edges', () => {
  it.each([
    [100n, 'exalted', 'Exalted'],
    [99n, 'revered', 'Revered'],
    [75n, 'revered', 'Revered'],
    [74n, 'honored', 'Honored'],
    [50n, 'honored', 'Honored'],
    [49n, 'friendly', 'Friendly'],
    [25n, 'friendly', 'Friendly'],
    [24n, 'neutral', 'Neutral'],
    [0n, 'neutral', 'Neutral'],
    [-24n, 'neutral', 'Neutral'],
    [-25n, 'unfriendly', 'Unfriendly'],
    [-49n, 'unfriendly', 'Unfriendly'],
    [-50n, 'hostile', 'Hostile'],
    [-99n, 'hostile', 'Hostile'],
    [-100n, 'hated', 'Hated'],
    [-500n, 'hated', 'Hated'],
    [500n, 'exalted', 'Exalted'],
  ])('%s is %s', (standing, key, label) => {
    expect(factionTier(standing)).toEqual({ key, label });
  });
});

describe('factionTier shape and labels', () => {
  it('returns a key in the eight tier keys and a capitalized label', () => {
    const keys = Object.keys(FACTION_STANDING_THRESHOLDS);
    for (const standing of [-200n, -75n, -30n, -1n, 0n, 30n, 60n, 90n, 150n]) {
      const tier = factionTier(standing);
      expect(keys).toContain(tier.key);
      expect(tier.label).toBe(tier.key.charAt(0).toUpperCase() + tier.key.slice(1));
    }
  });

  it('FACTION_TIER_LABELS lists the eight labels from Hated to Exalted', () => {
    expect([...FACTION_TIER_LABELS]).toEqual([
      'Hated',
      'Hostile',
      'Unfriendly',
      'Neutral',
      'Friendly',
      'Honored',
      'Revered',
      'Exalted',
    ]);
  });

  it('the thresholds the rule reads are the vocabulary thresholds', () => {
    expect(factionTier(FACTION_STANDING_THRESHOLDS.exalted).key).toBe('exalted');
    expect(factionTier(FACTION_STANDING_THRESHOLDS.hated).key).toBe('hated');
    expect(factionTier(FACTION_STANDING_THRESHOLDS.neutral).key).toBe('neutral');
  });
});

describe('import pin', () => {
  it('faction_rules imports only ./mechanical_vocabulary', () => {
    expect(new Set(importSpecifiers('faction_rules.ts'))).toEqual(new Set(['./mechanical_vocabulary']));
  });
});
