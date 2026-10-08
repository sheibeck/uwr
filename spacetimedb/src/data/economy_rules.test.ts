import { describe, it, expect, vi } from 'vitest';
// This tsconfig has no @types/node; vitest runs the file in Node, so the built-ins resolve at runtime.
// @ts-ignore
import { readFileSync } from 'node:fs';
// @ts-ignore
import { join } from 'node:path';
// @ts-ignore
import { fileURLToPath } from 'node:url';
import {
  DIAL_RANGES,
  DEFAULT_DIALS,
  clampDial,
  effectiveDials,
  itemWeight,
  ROLL_INDEX,
  economyRoll,
  rollBelow,
  lootSeed,
  regionTableSeed,
  baseMix,
  shiftMix,
  rarityMix,
  rollRarity,
  jewelryFloor,
} from './economy_rules';
import { QUALITY_TIERS } from './mechanical_vocabulary';
import { rollQualityTier, TIER_RARITY_WEIGHTS, getWorldTier } from '../helpers/items';

// helpers/items imports spacetimedb/server (SenderError only); the real package does not load under plain vitest.
vi.mock('spacetimedb/server', () => ({
  SenderError: class extends Error {},
}));

const T = 1_700_000_000_000_000n;

describe('clampDial', () => {
  it('clamps rarityShift to -2..2 and reports it', () => {
    expect(clampDial('rarityShift', -3n)).toEqual({ value: -2n, clamped: true });
    expect(clampDial('rarityShift', -2n)).toEqual({ value: -2n, clamped: false });
    expect(clampDial('rarityShift', 2n)).toEqual({ value: 2n, clamped: false });
    expect(clampDial('rarityShift', 3n)).toEqual({ value: 2n, clamped: true });
  });

  it('clamps dropRatePct at 0 and 300, one step outside each', () => {
    expect(clampDial('dropRatePct', -1n)).toEqual({ value: 0n, clamped: true });
    expect(clampDial('dropRatePct', 0n)).toEqual({ value: 0n, clamped: false });
    expect(clampDial('dropRatePct', 300n)).toEqual({ value: 300n, clamped: false });
    expect(clampDial('dropRatePct', 301n)).toEqual({ value: 300n, clamped: true });
  });

  it('clamps gatherRatePct at 50 and 300', () => {
    expect(clampDial('gatherRatePct', 49n)).toEqual({ value: 50n, clamped: true });
    expect(clampDial('gatherRatePct', 50n)).toEqual({ value: 50n, clamped: false });
    expect(clampDial('gatherRatePct', 300n)).toEqual({ value: 300n, clamped: false });
    expect(clampDial('gatherRatePct', 301n)).toEqual({ value: 300n, clamped: true });
  });

  it('clamps goldPct, bossRarityBonus, tierPct and itemDropPct', () => {
    expect(clampDial('goldPct', 301n)).toEqual({ value: 300n, clamped: true });
    expect(clampDial('goldPct', -1n)).toEqual({ value: 0n, clamped: true });
    expect(clampDial('bossRarityBonus', 3n)).toEqual({ value: 2n, clamped: true });
    expect(clampDial('bossRarityBonus', -1n)).toEqual({ value: 0n, clamped: true });
    expect(clampDial('tierPct', 301n)).toEqual({ value: 300n, clamped: true });
    expect(clampDial('itemDropPct', 301n)).toEqual({ value: 300n, clamped: true });
  });

  it('never throws; a non-bigint gives the default with clamped true', () => {
    expect(clampDial('goldPct', undefined)).toEqual({ value: 100n, clamped: true });
    expect(clampDial('rarityShift', null)).toEqual({ value: 0n, clamped: true });
    expect(clampDial('dropRatePct', 'lots')).toEqual({ value: 100n, clamped: true });
    expect(clampDial('gatherRatePct', 5)).toEqual({ value: 100n, clamped: true });
  });

  it('keeps ranges ordered with the default inside', () => {
    for (const r of Object.values(DIAL_RANGES)) {
      expect(r.min <= r.def && r.def <= r.max).toBe(true);
    }
  });
});

describe('DEFAULT_DIALS', () => {
  it('holds today tuning', () => {
    expect(DEFAULT_DIALS).toEqual({
      rarityShift: 0n,
      dropRatePct: 100n,
      goldPct: 100n,
      gatherRatePct: 100n,
      bossRarityBonus: 0n,
      tierCommonPct: 100n,
      tierUncommonPct: 100n,
      tierRarePct: 100n,
      tierEpicPct: 100n,
      tierLegendaryPct: 100n,
      aiEnabled: false,
    });
    expect(Object.isFrozen(DEFAULT_DIALS)).toBe(true);
  });
});

describe('effectiveDials', () => {
  it('with no region equals the clamped global', () => {
    const e = effectiveDials(DEFAULT_DIALS);
    expect(e.rarityShift).toBe(0n);
    expect(e.dropRatePct).toBe(100n);
    expect(e.goldPct).toBe(100n);
    expect(e.gatherRatePct).toBe(100n);
    expect(e.bossRarityBonus).toBe(0n);
    expect(e.tierPct).toEqual({ common: 100n, uncommon: 100n, rare: 100n, epic: 100n, legendary: 100n });
    const wild = effectiveDials({ ...DEFAULT_DIALS, goldPct: 9999n, gatherRatePct: 1n, rarityShift: -9n, tierEpicPct: 301n });
    expect(wild.goldPct).toBe(300n);
    expect(wild.gatherRatePct).toBe(50n);
    expect(wild.rarityShift).toBe(-2n);
    expect(wild.tierPct.epic).toBe(300n);
  });

  it('a region field replaces the global value and the rest inherit', () => {
    const g = { ...DEFAULT_DIALS, goldPct: 80n, dropRatePct: 120n };
    const e = effectiveDials(g, { goldPct: 150n });
    expect(e.goldPct).toBe(150n);
    expect(e.dropRatePct).toBe(120n);
    expect(e.gatherRatePct).toBe(100n);
  });

  it('an undefined or null region field inherits', () => {
    const g = { ...DEFAULT_DIALS, goldPct: 80n };
    expect(effectiveDials(g, { goldPct: undefined, dropRatePct: null }).goldPct).toBe(80n);
    expect(effectiveDials(g, { goldPct: undefined, dropRatePct: null }).dropRatePct).toBe(100n);
  });

  it('a region value equal to the global value gives the same effective dials', () => {
    const g = { ...DEFAULT_DIALS, goldPct: 150n, rarityShift: 1n };
    expect(effectiveDials(g, { goldPct: 150n, rarityShift: 1n })).toEqual(effectiveDials(g));
  });

  it('a region value replaces and never multiplies the global value', () => {
    const g = { ...DEFAULT_DIALS, goldPct: 200n };
    expect(effectiveDials(g, { goldPct: 50n }).goldPct).toBe(50n);
    expect(effectiveDials(g, { goldPct: 0n }).goldPct).toBe(0n);
  });

  it('clamps a bad region value', () => {
    expect(effectiveDials(DEFAULT_DIALS, { gatherRatePct: 49n }).gatherRatePct).toBe(50n);
    expect(effectiveDials(DEFAULT_DIALS, { dropRatePct: 301n }).dropRatePct).toBe(300n);
    expect(effectiveDials(DEFAULT_DIALS, { rarityShift: 3n }).rarityShift).toBe(2n);
    expect(effectiveDials(DEFAULT_DIALS, { bossRarityBonus: 3n }).bossRarityBonus).toBe(2n);
  });

  it('tolerates a partial or empty global', () => {
    expect(effectiveDials({}).dropRatePct).toBe(100n);
    expect(effectiveDials({}).tierPct.legendary).toBe(100n);
  });
});

describe('itemWeight', () => {
  it('scales by the item pin, defaulting to 100', () => {
    expect(itemWeight(10n, undefined)).toBe(10n);
    expect(itemWeight(10n, 0n)).toBe(0n);
    expect(itemWeight(10n, 100n)).toBe(10n);
    expect(itemWeight(10n, 300n)).toBe(30n);
    expect(itemWeight(10n, 999n)).toBe(30n);
    expect(itemWeight(10n, -5n)).toBe(0n);
  });

  it('floors', () => {
    expect(itemWeight(3n, 50n)).toBe(1n);
  });
});

describe('economyRoll', () => {
  it('is deterministic', () => {
    expect(economyRoll(T, 5n)).toBe(economyRoll(T, 5n));
    expect(economyRoll(T, 5n)).not.toBe(economyRoll(T, 6n));
    expect(economyRoll(T, 5n)).not.toBe(economyRoll(T + 1n, 5n));
  });

  it('returns the full 64-bit value, not a percent', () => {
    let big = false;
    for (let i = 0n; i < 100n; i += 1n) {
      const v = economyRoll(T, i);
      expect(v >= 0n && v < 2n ** 64n).toBe(true);
      if (v >= 2n ** 32n) big = true;
    }
    expect(big).toBe(true);
  });

  it('rollBelow is below n and 0 for a non-positive n', () => {
    for (let i = 0n; i < 50n; i += 1n) {
      const v = rollBelow(T, i, 7n);
      expect(v >= 0n && v < 7n).toBe(true);
    }
    expect(rollBelow(T, 1n, 0n)).toBe(0n);
    expect(rollBelow(T, 1n, -3n)).toBe(0n);
  });

  it('the indexes of one seed are uncorrelated (no fixed offset between two rolls)', () => {
    // The old bug: two rolls that were the same number shifted by a constant. Here the difference
    // between the gear roll and the rarity roll must vary across seeds.
    const diffs = new Set<bigint>();
    for (let s = 0n; s < 60n; s += 1n) {
      const seed = lootSeed(T + s, 1n, 1n);
      diffs.add((rollBelow(seed, ROLL_INDEX.RARITY, 100n) - rollBelow(seed, ROLL_INDEX.GEAR_CHANCE, 100n) + 100n) % 100n);
    }
    expect(diffs.size).toBeGreaterThan(20);
  });
});

describe('ROLL_INDEX uniqueness', () => {
  it('has unique bigint values', () => {
    const values = Object.values(ROLL_INDEX);
    for (const v of values) expect(typeof v).toBe('bigint');
    expect(new Set(values).size).toBe(values.length);
    expect(Object.isFrozen(ROLL_INDEX)).toBe(true);
  });

  it('has the fixed values later plans rely on', () => {
    expect(ROLL_INDEX.PICK_COUNT).toBe(1n);
    expect(ROLL_INDEX.PICK_BASE).toBe(2n);
    expect(ROLL_INDEX.GEAR_CHANCE).toBe(10n);
    expect(ROLL_INDEX.GEAR_PICK).toBe(11n);
    expect(ROLL_INDEX.RARITY).toBe(12n);
    expect(ROLL_INDEX.CRAFT_QUALITY).toBe(13n);
    expect(ROLL_INDEX.AFFIX).toBe(14n);
    expect(ROLL_INDEX.GOLD).toBe(20n);
    expect(ROLL_INDEX.ESSENCE).toBe(21n);
    expect(ROLL_INDEX.MODIFIER).toBe(22n);
    expect(ROLL_INDEX.SCROLL).toBe(23n);
    expect(ROLL_INDEX.SCROLL_PICK).toBe(24n);
    expect(ROLL_INDEX.MODIFIER_PICK).toBe(25n);
    expect(ROLL_INDEX.GATHER_QTY).toBe(30n);
    expect(ROLL_INDEX.AI_TABLE_COUNT).toBe(40n);
    expect(ROLL_INDEX.AI_TABLE_PICK_BASE).toBe(41n);
  });

  it('keeps the pick ranges clear of every single index', () => {
    const singles = Object.entries(ROLL_INDEX)
      .filter(([k]) => k !== 'PICK_BASE' && k !== 'AI_TABLE_PICK_BASE')
      .map(([, v]) => v);
    for (let i = 0n; i < 8n; i += 1n) expect(singles).not.toContain(ROLL_INDEX.PICK_BASE + i);
    for (let i = 0n; i < 3n; i += 1n) expect(singles).not.toContain(ROLL_INDEX.AI_TABLE_PICK_BASE + i);
  });
});

describe('lootSeed', () => {
  it('differs for two enemies of one template in the same fight', () => {
    expect(lootSeed(T, 1n, 1n)).not.toBe(lootSeed(T, 1n, 2n));
  });

  it('differs for two characters', () => {
    expect(lootSeed(T, 1n, 1n)).not.toBe(lootSeed(T, 2n, 1n));
  });

  it('is within 64 bits and deterministic', () => {
    const s = lootSeed(2n ** 70n, 123456789n, 987654321n);
    expect(s >= 0n && s < 2n ** 64n).toBe(true);
    expect(s).toBe(lootSeed(2n ** 70n, 123456789n, 987654321n));
  });

  it('gives different first rolls for each enemy of a fight', () => {
    const rolls = new Set<bigint>();
    for (let e = 1n; e <= 12n; e += 1n) rolls.add(rollBelow(lootSeed(T, 7n, e), ROLL_INDEX.GEAR_CHANCE, 1000n));
    expect(rolls.size).toBeGreaterThan(8);
  });

  it('regionTableSeed differs per region and per enemy', () => {
    expect(regionTableSeed(1n, 1n)).not.toBe(regionTableSeed(2n, 1n));
    expect(regionTableSeed(1n, 1n)).not.toBe(regionTableSeed(1n, 2n));
  });
});

describe('baseMix', () => {
  it('matches the known T1 rows', () => {
    expect(baseMix(1n, 100n)).toEqual([95n, 5n, 0n, 0n, 0n]);
    expect(baseMix(6n, 100n)).toEqual([70n, 30n, 0n, 0n, 0n]);
    expect(baseMix(1n, 200n)).toEqual([87n, 13n, 0n, 0n, 0n]);
  });

  it('matches the known T2+ rows', () => {
    expect(baseMix(11n, 100n)).toEqual([60n, 30n, 9n, 1n, 0n]);
    expect(baseMix(45n, 300n)).toEqual([0n, 20n, 40n, 40n, 0n]);
  });

  it('always sums to 100', () => {
    for (let level = 1n; level <= 50n; level += 1n) {
      for (let danger = 100n; danger <= 1000n; danger += 50n) {
        const sum = baseMix(level, danger).reduce((a, b) => a + b, 0n);
        expect(sum).toBe(100n);
      }
    }
  });

  it('parity: equals the rollQualityTier distribution for levels 1..50 and dangers 100..1000', () => {
    const names = QUALITY_TIERS as readonly string[];
    for (let level = 1; level <= 50; level += 1) {
      for (let danger = 100; danger <= 1000; danger += 10) {
        const counts = [0, 0, 0, 0, 0];
        for (let seed = 0; seed < 100; seed += 1) {
          const tier = rollQualityTier(BigInt(level), BigInt(seed), BigInt(danger));
          counts[names.indexOf(tier)] += 1;
        }
        const mix = baseMix(BigInt(level), BigInt(danger)).map(Number);
        expect(mix, `level ${level} danger ${danger}`).toEqual(counts);
      }
    }
  });

  it('parity holds at the T1/T2 seam and the danger bonus seams', () => {
    const names = QUALITY_TIERS as readonly string[];
    for (const level of [10, 11]) {
      for (const danger of [100, 120, 121, 135, 136, 150, 151]) {
        const counts = [0, 0, 0, 0, 0];
        for (let seed = 0; seed < 100; seed += 1) {
          counts[names.indexOf(rollQualityTier(BigInt(level), BigInt(seed), BigInt(danger)))] += 1;
        }
        expect(baseMix(BigInt(level), BigInt(danger)).map(Number), `level ${level} danger ${danger}`).toEqual(counts);
      }
    }
    expect(getWorldTier(10n)).toBe(1);
    expect(getWorldTier(11n)).toBe(2);
    expect(baseMix(10n, 100n)).toEqual([70n, 30n, 0n, 0n, 0n]);
    expect(baseMix(11n, 100n)).toEqual([60n, 30n, 9n, 1n, 0n]);
  });

  it('copies the TIER_RARITY_WEIGHTS rows at the neutral danger', () => {
    const levels: [bigint, number][] = [[11n, 2], [21n, 3], [31n, 4], [41n, 5]];
    for (const [level, tier] of levels) {
      const row = TIER_RARITY_WEIGHTS[tier]!;
      expect(baseMix(level, 100n)).toEqual([BigInt(row[0]), BigInt(row[1]), BigInt(row[2]), BigInt(row[3]), 0n]);
    }
  });

  it('never has legendary weight', () => {
    for (let level = 1n; level <= 50n; level += 7n) expect(baseMix(level, 500n)[4]).toBe(0n);
  });
});

describe('shiftMix', () => {
  it('moves every tier up by k, piling overflow on the cap', () => {
    expect(shiftMix([95n, 5n, 0n, 0n, 0n], 1n, 3)).toEqual([0n, 95n, 5n, 0n, 0n]);
    expect(shiftMix([10n, 20n, 40n, 30n, 0n], 5n, 3)).toEqual([0n, 0n, 0n, 100n, 0n]);
    expect(shiftMix([10n, 20n, 40n, 30n, 0n], 1n, 4)).toEqual([0n, 10n, 20n, 40n, 30n]);
    expect(shiftMix([10n, 20n, 40n, 30n, 0n], 2n, 4)).toEqual([0n, 0n, 10n, 20n, 70n]);
  });

  it('moves down and piles on common', () => {
    expect(shiftMix([60n, 30n, 9n, 1n, 0n], -1n, 3)).toEqual([90n, 9n, 1n, 0n, 0n]);
    expect(shiftMix([60n, 30n, 9n, 1n, 0n], -9n, 3)).toEqual([100n, 0n, 0n, 0n, 0n]);
  });

  it('returns a new array and keeps the total', () => {
    const mix = [10n, 20n, 40n, 30n, 0n];
    const out = shiftMix(mix, 0n, 3);
    expect(out).not.toBe(mix);
    expect(out).toEqual(mix);
    expect(shiftMix(mix, 2n, 3).reduce((a, b) => a + b, 0n)).toBe(100n);
  });
});

describe('rarityMix', () => {
  const sum = (m: bigint[]) => m.reduce((a, b) => a + b, 0n);

  it('at default dials a normal foe equals the base mix', () => {
    for (const [level, danger] of [[1n, 100n], [11n, 150n], [30n, 300n], [45n, 500n]] as [bigint, bigint][]) {
      expect(rarityMix(level, danger, false, effectiveDials(DEFAULT_DIALS))).toEqual(baseMix(level, danger));
    }
  });

  it('a normal foe has legendary 0 under every dial setting', () => {
    for (let shift = -2n; shift <= 2n; shift += 1n) {
      for (let bonus = 0n; bonus <= 2n; bonus += 1n) {
        for (const pct of [0n, 100n, 300n]) {
          const dials = effectiveDials({
            ...DEFAULT_DIALS,
            rarityShift: shift,
            bossRarityBonus: bonus,
            tierCommonPct: pct,
            tierUncommonPct: pct,
            tierRarePct: pct,
            tierEpicPct: pct,
            tierLegendaryPct: 300n,
          });
          for (const level of [1n, 11n, 25n, 45n, 50n]) {
            expect(rarityMix(level, 1000n, false, dials)[4]).toBe(0n);
          }
        }
      }
    }
  });

  it('a normal foe has legendary 0 at shift +2 with every tier weight 300', () => {
    const dials = effectiveDials({
      ...DEFAULT_DIALS,
      rarityShift: 2n,
      tierCommonPct: 300n,
      tierUncommonPct: 300n,
      tierRarePct: 300n,
      tierEpicPct: 300n,
      tierLegendaryPct: 300n,
    });
    const mix = rarityMix(45n, 300n, false, dials);
    expect(mix[4]).toBe(0n);
    expect(mix[3] > 0n).toBe(true);
  });

  it('a boss at level 45 with bonus 2 has legendary above 0', () => {
    const dials = effectiveDials({ ...DEFAULT_DIALS, bossRarityBonus: 2n });
    expect(rarityMix(45n, 300n, true, dials)[4] > 0n).toBe(true);
  });

  it('a boss gets a built-in +1 shift at default dials', () => {
    const dials = effectiveDials(DEFAULT_DIALS);
    const boss = rarityMix(45n, 100n, true, dials);
    expect(boss).toEqual(shiftMix(baseMix(45n, 100n), 1n, 4));
    expect(boss[4] > 0n).toBe(true);
    const normal = rarityMix(45n, 100n, false, dials);
    expect(boss[0] <= normal[0]).toBe(true);
  });

  it('a negative shift lowers a boss too, but the built-in step still applies', () => {
    const dials = effectiveDials({ ...DEFAULT_DIALS, rarityShift: -1n });
    expect(rarityMix(11n, 100n, true, dials)).toEqual(shiftMix(baseMix(11n, 100n), 0n, 4));
  });

  it('tier pct 0 for epic removes epic', () => {
    const dials = effectiveDials({ ...DEFAULT_DIALS, tierEpicPct: 0n });
    expect(rarityMix(45n, 300n, false, dials)[3]).toBe(0n);
    expect(rarityMix(45n, 300n, true, dials)[3]).toBe(0n);
  });

  it('multiplies by the tier weights (floor)', () => {
    const dials = effectiveDials({ ...DEFAULT_DIALS, tierRarePct: 50n, tierCommonPct: 300n });
    const base = baseMix(25n, 100n);
    const mix = rarityMix(25n, 100n, false, dials);
    expect(mix[0]).toBe(base[0] * 3n);
    expect(mix[2]).toBe((base[2] * 50n) / 100n);
    expect(mix[1]).toBe(base[1]);
  });

  it('keeps a total of 100 at default dials', () => {
    for (let level = 1n; level <= 50n; level += 1n) {
      expect(sum(rarityMix(level, 100n, false, effectiveDials(DEFAULT_DIALS)))).toBe(100n);
      expect(sum(rarityMix(level, 100n, true, effectiveDials(DEFAULT_DIALS)))).toBe(100n);
    }
  });
});

describe('rollRarity', () => {
  it('returns common when every tier weight is 0', () => {
    const dials = effectiveDials({
      ...DEFAULT_DIALS,
      tierCommonPct: 0n,
      tierUncommonPct: 0n,
      tierRarePct: 0n,
      tierEpicPct: 0n,
      tierLegendaryPct: 0n,
    });
    const mix = rarityMix(30n, 300n, true, dials);
    expect(mix.every((w) => w === 0n)).toBe(true);
    for (let s = 0n; s < 20n; s += 1n) expect(rollRarity(mix, s)).toBe('common');
  });

  it('is deterministic', () => {
    const mix = baseMix(25n, 100n);
    expect(rollRarity(mix, 12345n)).toBe(rollRarity(mix, 12345n));
  });

  it('frequencies over 10,000 loot seeds are within 2 points of the mix', () => {
    const mix = baseMix(25n, 100n);
    const counts: Record<string, number> = {};
    const N = 10000;
    for (let i = 0; i < N; i += 1) {
      const tier = rollRarity(mix, lootSeed(T + BigInt(i), 3n, BigInt(i % 7) + 1n));
      counts[tier] = (counts[tier] ?? 0) + 1;
    }
    QUALITY_TIERS.forEach((tier, idx) => {
      const expected = Number(mix[idx]);
      const actual = ((counts[tier] ?? 0) / N) * 100;
      expect(Math.abs(actual - expected), tier).toBeLessThan(2);
    });
    expect(counts['legendary'] ?? 0).toBe(0);
  });

  it('a boss mix reaches legendary at roughly its weight', () => {
    const mix = rarityMix(45n, 100n, true, effectiveDials(DEFAULT_DIALS));
    let legendary = 0;
    const N = 5000;
    for (let i = 0; i < N; i += 1) {
      if (rollRarity(mix, lootSeed(T + BigInt(i), 9n, 1n)) === 'legendary') legendary += 1;
    }
    expect(Math.abs((legendary / N) * 100 - Number(mix[4]))).toBeLessThan(3);
  });

  it('the gear-chance roll and the rarity roll do not decide each other', () => {
    // Among seeds where the gear roll passes a 17% chance, T1 uncommon (5%) must still be near 5%
    // rather than pinned (the old code made the two rolls the same number shifted by a constant).
    const mix = baseMix(1n, 100n);
    let gear = 0;
    let uncommon = 0;
    for (let i = 0; i < 20000; i += 1) {
      const seed = lootSeed(T + BigInt(i), 1n, 1n);
      if (rollBelow(seed, ROLL_INDEX.GEAR_CHANCE, 100n) < 17n) {
        gear += 1;
        if (rollRarity(mix, seed) === 'uncommon') uncommon += 1;
      }
    }
    expect(gear).toBeGreaterThan(2500);
    expect(Math.abs((uncommon / gear) * 100 - 5)).toBeLessThan(2);
  });
});

describe('jewelryFloor', () => {
  it('lifts common neck and earrings without armor to uncommon', () => {
    expect(jewelryFloor('neck', 0n, 'common')).toBe('uncommon');
    expect(jewelryFloor('earrings', 0n, 'common')).toBe('uncommon');
  });

  it('leaves everything else alone', () => {
    expect(jewelryFloor('neck', 1n, 'common')).toBe('common');
    expect(jewelryFloor('neck', 0n, 'rare')).toBe('rare');
    expect(jewelryFloor('chest', 0n, 'common')).toBe('common');
    expect(jewelryFloor('mainHand', 0n, 'common')).toBe('common');
  });
});

describe('purity', () => {
  const source: string = readFileSync(join(fileURLToPath(new URL('.', import.meta.url)), 'economy_rules.ts'), 'utf8');
  const code = source
    .split('\n')
    .filter((l: string) => {
      const t = l.trim();
      return !(t.startsWith('//') || t.startsWith('*') || t.startsWith('/*'));
    })
    .join('\n');

  it('reads no clock and no source of chance', () => {
    expect(code).not.toMatch(/Math\.random|Date\.now|new Date\(|performance\.now|crypto\./);
  });

  it('imports only from ./mechanical_vocabulary and ./crafting_rules', () => {
    const froms = [...code.matchAll(/from\s+'([^']+)'/g)].map((m) => m[1]);
    for (const f of froms) expect(['./mechanical_vocabulary', './crafting_rules']).toContain(f);
  });

  it('copies the reviewed splitmix64 constants', () => {
    expect(source).toContain('0x9e3779b97f4a7c15n');
    expect(source).toContain('0xbf58476d1ce4e5b9n');
    expect(source).toContain('0x94d049bb133111ebn');
  });

  it('uses no APIs newer than ES2020', () => {
    expect(code).not.toMatch(/replaceAll|\.at\(|Object\.hasOwn/);
  });
});
