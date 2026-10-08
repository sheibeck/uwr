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
  pinWeights,
  pinnedChanceHit,
  scaleWeights,
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
  CREATURE_PROFILES,
  canonicalCreature,
  creatureProfile,
  pickCount,
  gearChancePct,
  goldReward,
  gatherYield,
  scaledChancePct,
  zoneTierOf,
  pickWeighted,
  pickWithoutReplacement,
  FALLBACK_WEIGHTS,
  fallbackCommonPool,
  gearPoolWeight,
  isQuestRewardName,
  AI_LOOT_WEIGHTS,
  aiLootTable,
  ESSENCE_CHANCE_PCT,
  MODIFIER_CHANCE_PCT,
  SCROLL_DROP_BASE_PCT,
  SCROLL_TIER_WEIGHTS,
} from './economy_rules';
import { JUNK_DEFS } from './equipment_rules';
import { MATERIAL_DEFS } from './crafting_rules';
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
  it('multiplies by the clamped item pin (default 100), on a x100 scale with no division', () => {
    expect(itemWeight(10n, undefined)).toBe(1000n);
    expect(itemWeight(10n, 0n)).toBe(0n);
    expect(itemWeight(10n, 100n)).toBe(1000n);
    expect(itemWeight(10n, 300n)).toBe(3000n);
    expect(itemWeight(10n, 999n)).toBe(3000n);
    expect(itemWeight(10n, -5n)).toBe(0n);
  });

  // Review CR-01: floor division zeroed a weight of 1 at 50% and left it unchanged at 150%.
  it('never rounds a small weight away: 1 at 50% stays half of 1 at 100%', () => {
    expect(itemWeight(1n, 50n)).toBe(50n);
    expect(itemWeight(1n, 150n)).toBe(150n);
    expect(itemWeight(3n, 50n) * 2n).toBe(itemWeight(3n, 100n));
  });
});

describe('scaleWeights (review CR-01: exact percent dials)', () => {
  it('equal percents leave the weights unchanged', () => {
    expect(scaleWeights([60n, 30n, 9n, 1n, 0n], [100n, 100n, 100n, 100n, 100n])).toEqual([60n, 30n, 9n, 1n, 0n]);
    expect(scaleWeights([6n, 3n, 1n], [300n, 300n, 300n])).toEqual([6n, 3n, 1n]);
  });

  it('keeps exact ratios: a weight of 1 at 50% is half of its neighbours, not 0', () => {
    expect(scaleWeights([60n, 30n, 9n, 1n], [100n, 100n, 100n, 50n])).toEqual([120n, 60n, 18n, 1n]);
    expect(scaleWeights([60n, 30n, 9n, 1n], [100n, 100n, 100n, 150n])).toEqual([120n, 60n, 18n, 3n]);
  });

  it('a percent of 0 removes only that weight; all zero gives all zero', () => {
    expect(scaleWeights([5n, 5n], [0n, 100n])).toEqual([0n, 5n]);
    expect(scaleWeights([5n, 5n], [0n, 0n])).toEqual([0n, 0n]);
  });
});

describe('pinnedChanceHit (review A WR-04: pins on essence and reagent chances)', () => {
  it('with no pin it is exactly the plain percent roll', () => {
    for (let k = 0n; k < 500n; k += 1n) {
      const seed = lootSeed(T + k, 1n, 1n);
      expect(pinnedChanceHit(seed, ROLL_INDEX.ESSENCE, 6n)).toBe(rollBelow(seed, ROLL_INDEX.ESSENCE, 100n) < 6n);
      expect(pinnedChanceHit(seed, ROLL_INDEX.ESSENCE, 6n, 100n)).toBe(rollBelow(seed, ROLL_INDEX.ESSENCE, 100n) < 6n);
    }
  });

  it('a pin of 0 never hits; a 1% chance pinned at 50 is about 0.5%, not 0 or 1', () => {
    let zero = 0;
    let half = 0;
    const N = 40000;
    for (let i = 0; i < N; i += 1) {
      const seed = lootSeed(T + BigInt(i), 2n, 3n);
      if (pinnedChanceHit(seed, ROLL_INDEX.MODIFIER, 100n, 0n)) zero += 1;
      if (pinnedChanceHit(seed, ROLL_INDEX.MODIFIER, 1n, 50n)) half += 1;
    }
    expect(zero).toBe(0);
    expect(half / N).toBeGreaterThan(0.003);
    expect(half / N).toBeLessThan(0.007);
  });
});

describe('pinWeights (item pins over one pool)', () => {
  it('no pins leaves every weight as it is', () => {
    const pool = [{ itemTemplateId: 1n, weight: 10n }, { itemTemplateId: 2n, weight: 6n }];
    expect(pinWeights(pool, new Map()).map((e) => e.weight)).toEqual([10n, 6n]);
  });

  it('a pin at 50 halves one entry against the rest without zeroing a weight of 1', () => {
    const pool = [{ itemTemplateId: 1n, weight: 1n }, { itemTemplateId: 2n, weight: 6n }];
    expect(pinWeights(pool, new Map([[1n, 50n]])).map((e) => e.weight)).toEqual([1n, 12n]);
    expect(pinWeights(pool, new Map([[1n, 150n]])).map((e) => e.weight)).toEqual([3n, 12n]);
    expect(pinWeights(pool, new Map([[1n, 0n]])).map((e) => e.weight)).toEqual([0n, 6n]);
  });

  it('keeps the other fields of an entry', () => {
    const out = pinWeights([{ itemTemplateId: 1n, weight: 2n, role: 'junk' }], new Map());
    expect(out[0]).toEqual({ itemTemplateId: 1n, weight: 2n, role: 'junk' });
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

  it('multiplies by the tier weights with exact ratios (no division)', () => {
    const dials = effectiveDials({ ...DEFAULT_DIALS, tierRarePct: 50n, tierCommonPct: 300n });
    const base = baseMix(25n, 100n);
    const mix = rarityMix(25n, 100n, false, dials);
    // Percents 300/100/50/100/100 over their common divisor 50: x6, x2, x1, x2, x2.
    expect(mix).toEqual([base[0] * 6n, base[1] * 2n, base[2], base[3] * 2n, 0n]);
  });

  // Review CR-01: the owner's own example (epic x0.5) removed epic entirely at world tier 2.
  it('T2 epic at 50% halves epic instead of removing it; at 150% it rises', () => {
    const half = rarityMix(15n, 100n, false, effectiveDials({ ...DEFAULT_DIALS, tierEpicPct: 50n }));
    expect(half).toEqual([120n, 60n, 18n, 1n, 0n]);
    const more = rarityMix(15n, 100n, false, effectiveDials({ ...DEFAULT_DIALS, tierEpicPct: 150n }));
    expect(more).toEqual([120n, 60n, 18n, 3n, 0n]);
  });

  it('T2 boss legendary at 50% keeps legendary at half; at 150% it rises', () => {
    const half = rarityMix(15n, 100n, true, effectiveDials({ ...DEFAULT_DIALS, tierLegendaryPct: 50n }));
    expect(half).toEqual([0n, 120n, 60n, 18n, 1n]);
    const more = rarityMix(15n, 100n, true, effectiveDials({ ...DEFAULT_DIALS, tierLegendaryPct: 150n }));
    expect(more).toEqual([0n, 120n, 60n, 18n, 3n]);
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

describe('pickCount', () => {
  it('is exactly 1 at 100%, 0 at 0% and 3 at 300% for every seed', () => {
    for (let s = 0n; s < 200n; s += 1n) {
      expect(pickCount(s, 100n)).toBe(1n);
      expect(pickCount(s, 0n)).toBe(0n);
      expect(pickCount(s, 300n)).toBe(3n);
    }
  });

  it('clamps out-of-range rates', () => {
    expect(pickCount(7n, 999n)).toBe(3n);
    expect(pickCount(7n, -5n)).toBe(0n);
  });

  it('averages 1.5 at 150% over 10,000 seeds', () => {
    let total = 0n;
    const N = 10000n;
    for (let i = 0n; i < N; i += 1n) total += pickCount(lootSeed(T + i, 2n, 3n), 150n);
    const avg = Number(total) / Number(N);
    expect(Math.abs(avg - 1.5)).toBeLessThan(0.03);
  });

  it('at 150% is always 1 or 2', () => {
    for (let i = 0n; i < 300n; i += 1n) {
      const n = pickCount(i, 150n);
      expect(n === 1n || n === 2n).toBe(true);
    }
  });
});

describe('creature profiles', () => {
  it('holds the pre-v2.0 numbers', () => {
    expect(CREATURE_PROFILES.animal).toMatchObject({ gearChance: 10n, goldMin: 0n, goldMax: 2n });
    expect(CREATURE_PROFILES.beast).toMatchObject({ gearChance: 15n, goldMin: 0n, goldMax: 3n });
    expect(CREATURE_PROFILES.humanoid).toMatchObject({ gearChance: 25n, goldMin: 2n, goldMax: 6n });
    expect(CREATURE_PROFILES.undead).toMatchObject({ gearChance: 20n, goldMin: 1n, goldMax: 4n });
    expect(CREATURE_PROFILES.spirit).toMatchObject({ gearChance: 20n, goldMin: 1n, goldMax: 4n });
    expect(CREATURE_PROFILES.construct).toMatchObject({ gearChance: 20n, goldMin: 1n, goldMax: 4n });
    expect(CREATURE_PROFILES.animal.dropTypes).toEqual(['animal', 'beast']);
    expect(CREATURE_PROFILES.beast.dropTypes).toEqual(['beast', 'animal']);
    expect(CREATURE_PROFILES.spirit.dropTypes).toEqual(['spirit', 'construct']);
  });

  it('canonicalCreature maps aliases and falls back to beast', () => {
    expect(canonicalCreature('beast')).toBe('beast');
    expect(canonicalCreature('animal')).toBe('animal');
    expect(canonicalCreature('undead')).toBe('undead');
    expect(canonicalCreature('humanoid')).toBe('humanoid');
    expect(canonicalCreature('construct')).toBe('construct');
    expect(canonicalCreature('spirit')).toBe('spirit');
    expect(canonicalCreature('elemental')).toBe('spirit');
    expect(canonicalCreature('aberration')).toBe('spirit');
    expect(canonicalCreature('')).toBe('beast');
    expect(canonicalCreature('Dragon')).toBe('beast');
    expect(canonicalCreature('  UNDEAD ')).toBe('undead');
    expect(canonicalCreature('Elemental')).toBe('spirit');
    expect(canonicalCreature(undefined)).toBe('beast');
    expect(canonicalCreature(null)).toBe('beast');
  });

  it('creatureProfile returns the profile of the canonical type', () => {
    expect(creatureProfile('elemental')).toBe(CREATURE_PROFILES.spirit);
    expect(creatureProfile('')).toBe(CREATURE_PROFILES.beast);
    expect(creatureProfile('humanoid')).toBe(CREATURE_PROFILES.humanoid);
  });

  it('does not let a prototype name pick a profile', () => {
    expect(canonicalCreature('constructor')).toBe('beast');
    expect(canonicalCreature('__proto__')).toBe('beast');
    expect(canonicalCreature('toString')).toBe('beast');
  });
});

describe('gearChancePct', () => {
  it('uses the old formula: gearChance + min(25, 2 * level)', () => {
    expect(gearChancePct(CREATURE_PROFILES.beast, 1n, 100n)).toBe(17n);
    expect(gearChancePct(CREATURE_PROFILES.humanoid, 30n, 100n)).toBe(50n);
    expect(gearChancePct(CREATURE_PROFILES.animal, 50n, 100n)).toBe(35n);
  });

  it('scales by the drop rate, caps at 100 and is 0 at 0', () => {
    expect(gearChancePct(CREATURE_PROFILES.humanoid, 30n, 300n)).toBe(100n);
    expect(gearChancePct(CREATURE_PROFILES.beast, 1n, 200n)).toBe(34n);
    expect(gearChancePct(CREATURE_PROFILES.humanoid, 30n, 0n)).toBe(0n);
  });
});

describe('goldReward', () => {
  const profiles = Object.keys(CREATURE_PROFILES) as (keyof typeof CREATURE_PROFILES)[];

  it('is at least 1 at default dials for every profile at level 1', () => {
    for (const p of profiles) {
      for (let s = 0n; s < 100n; s += 1n) {
        expect(goldReward(CREATURE_PROFILES[p], 1n, s, 100n) >= 1n).toBe(true);
      }
    }
  });

  it('stays within goldMin + level .. goldMax + level at 100%', () => {
    const p = CREATURE_PROFILES.humanoid;
    for (let s = 0n; s < 100n; s += 1n) {
      const g = goldReward(p, 12n, s, 100n);
      expect(g >= p.goldMin + 12n && g <= p.goldMax + 12n).toBe(true);
    }
  });

  it('is exactly 3 times at 300% and 0 at 0%', () => {
    for (const p of profiles) {
      for (let s = 0n; s < 30n; s += 1n) {
        const base = goldReward(CREATURE_PROFILES[p], 9n, s, 100n);
        expect(goldReward(CREATURE_PROFILES[p], 9n, s, 300n)).toBe(base * 3n);
        expect(goldReward(CREATURE_PROFILES[p], 9n, s, 0n)).toBe(0n);
      }
    }
  });

  it('floors the scaled value', () => {
    const p = CREATURE_PROFILES.animal;
    for (let s = 0n; s < 30n; s += 1n) {
      const base = goldReward(p, 1n, s, 100n);
      expect(goldReward(p, 1n, s, 150n)).toBe((base * 150n) / 100n);
    }
  });

  it('treats a level below 1 as 1', () => {
    expect(goldReward(CREATURE_PROFILES.animal, 0n, 3n, 100n) >= 1n).toBe(true);
  });
});

describe('gatherYield', () => {
  it('scales and floors, never below 1', () => {
    expect(gatherYield(5n, 50n)).toBe(2n);
    expect(gatherYield(1n, 50n)).toBe(1n);
    expect(gatherYield(4n, 300n)).toBe(12n);
    expect(gatherYield(4n, 100n)).toBe(4n);
  });

  it('clamps the rate to 50..300', () => {
    expect(gatherYield(4n, 1n)).toBe(2n);
    expect(gatherYield(4n, 9999n)).toBe(12n);
    expect(gatherYield(0n, 100n)).toBe(1n);
  });
});

describe('scaledChancePct and zoneTierOf and constants', () => {
  it('scales a chance and caps it at 100', () => {
    expect(scaledChancePct(6n, 100n)).toBe(6n);
    expect(scaledChancePct(6n, 300n)).toBe(18n);
    expect(scaledChancePct(60n, 300n)).toBe(100n);
    expect(scaledChancePct(6n, 0n)).toBe(0n);
  });

  it('zoneTierOf follows the node spawn rule', () => {
    expect(zoneTierOf(100n)).toBe(1n);
    expect(zoneTierOf(129n)).toBe(1n);
    expect(zoneTierOf(130n)).toBe(2n);
    expect(zoneTierOf(189n)).toBe(2n);
    expect(zoneTierOf(190n)).toBe(3n);
    expect(zoneTierOf(900n)).toBe(3n);
  });

  it('holds today chances and the scroll weights', () => {
    expect(ESSENCE_CHANCE_PCT).toBe(6n);
    expect(MODIFIER_CHANCE_PCT).toBe(10n);
    expect(SCROLL_DROP_BASE_PCT).toBe(10n); // owner, 2026-10-08
    expect(SCROLL_TIER_WEIGHTS).toEqual({ rare: 6n, epic: 3n, legendary: 1n });
  });
});

describe('weighted picks', () => {
  const entries = [
    { itemTemplateId: 5n, weight: 6n },
    { itemTemplateId: 2n, weight: 10n },
    { itemTemplateId: 9n, weight: 3n },
    { itemTemplateId: 4n, weight: 0n },
    { itemTemplateId: 7n, weight: 8n },
    { itemTemplateId: 1n, weight: 1n },
  ];

  function shuffled<X>(list: X[], salt: number): X[] {
    const out = list.slice();
    let state = salt * 2654435761 + 1;
    for (let i = out.length - 1; i > 0; i -= 1) {
      state = (state * 1103515245 + 12345) % 2147483648;
      const j = state % (i + 1);
      [out[i], out[j]] = [out[j]!, out[i]!];
    }
    return out;
  }

  it('pickWeighted does not depend on the input order', () => {
    for (let s = 0n; s < 40n; s += 1n) {
      const expected = pickWeighted(entries, s, ROLL_INDEX.GEAR_PICK);
      for (let salt = 1; salt <= 5; salt += 1) {
        expect(pickWeighted(shuffled(entries, salt), s, ROLL_INDEX.GEAR_PICK)).toEqual(expected);
      }
    }
  });

  it('pickWeighted skips weight 0 and returns null when the total is 0', () => {
    for (let s = 0n; s < 100n; s += 1n) {
      expect(pickWeighted(entries, s, 3n)?.itemTemplateId).not.toBe(4n);
    }
    expect(pickWeighted([], 1n, 3n)).toBeNull();
    expect(pickWeighted([{ itemTemplateId: 1n, weight: 0n }], 1n, 3n)).toBeNull();
  });

  it('pickWeighted follows the weights', () => {
    const counts = new Map<bigint, number>();
    const N = 6000;
    for (let i = 0; i < N; i += 1) {
      const pick = pickWeighted(entries, lootSeed(T + BigInt(i), 1n, 1n), ROLL_INDEX.GEAR_PICK)!;
      counts.set(pick.itemTemplateId, (counts.get(pick.itemTemplateId) ?? 0) + 1);
    }
    const totalWeight = 28;
    for (const e of entries) {
      const expected = (Number(e.weight) / totalWeight) * 100;
      const actual = ((counts.get(e.itemTemplateId) ?? 0) / N) * 100;
      expect(Math.abs(actual - expected), String(e.itemTemplateId)).toBeLessThan(3);
    }
  });

  it('pickWithoutReplacement gives the same picks for any input order', () => {
    for (let s = 0n; s < 40n; s += 1n) {
      const expected = pickWithoutReplacement(entries, 3, s, ROLL_INDEX.PICK_BASE).map((e) => e.itemTemplateId);
      for (let salt = 1; salt <= 5; salt += 1) {
        const got = pickWithoutReplacement(shuffled(entries, salt), 3, s, ROLL_INDEX.PICK_BASE).map((e) => e.itemTemplateId);
        expect(got).toEqual(expected);
      }
    }
  });

  it('pickWithoutReplacement never returns one id twice, and stops when the pool runs out', () => {
    for (let s = 0n; s < 60n; s += 1n) {
      const picks = pickWithoutReplacement(entries, 5, s, ROLL_INDEX.PICK_BASE).map((e) => e.itemTemplateId);
      expect(new Set(picks).size).toBe(picks.length);
      expect(picks).toHaveLength(5);
    }
    const all = pickWithoutReplacement(entries, 20, 3n, ROLL_INDEX.PICK_BASE);
    expect(all).toHaveLength(5);
    expect(all.map((e) => e.itemTemplateId)).not.toContain(4n);
    expect(pickWithoutReplacement(entries, 0, 3n, ROLL_INDEX.PICK_BASE)).toEqual([]);
  });

  it('pickWithoutReplacement treats a repeated id as one entry', () => {
    const dup = [
      { itemTemplateId: 1n, weight: 5n },
      { itemTemplateId: 1n, weight: 5n },
      { itemTemplateId: 2n, weight: 5n },
    ];
    for (let s = 0n; s < 30n; s += 1n) {
      const ids = pickWithoutReplacement(dup, 3, s, ROLL_INDEX.PICK_BASE).map((e) => e.itemTemplateId);
      expect(new Set(ids).size).toBe(ids.length);
    }
  });
});

describe('fallbackCommonPool', () => {
  const junk = [{ itemTemplateId: 1n }, { itemTemplateId: 2n }, { itemTemplateId: 3n }, { itemTemplateId: 4n }];
  const materials = MATERIAL_DEFS.map((m, i) => ({
    itemTemplateId: BigInt(100 + i),
    tier: m.tier,
    sources: m.sources,
    dropCreatureTypes: m.dropCreatureTypes ?? [],
  }));
  const regionMaterials = [
    { itemTemplateId: 500n, role: 'gather', rarity: 'common' },
    { itemTemplateId: 501n, role: 'drop', rarity: 'uncommon' },
    { itemTemplateId: 502n, role: 'gather', rarity: 'rare' },
    { itemTemplateId: 503n, role: 'trophy', rarity: 'common' },
    { itemTemplateId: 504n, role: 'gear', rarity: 'common' },
    { itemTemplateId: 505n, role: 'recipe_output', rarity: 'common' },
  ];
  const weightOf = (pool: { itemTemplateId: bigint; weight: bigint }[], id: bigint) =>
    pool.find((e) => e.itemTemplateId === id)?.weight;

  it('always contains every junk template at weight 10', () => {
    for (const type of ['beast', 'humanoid', 'undead', 'spirit', 'construct', 'animal', 'elemental', '']) {
      const pool = fallbackCommonPool({ junk, materials, regionMaterials: [], creatureType: type, zoneTier: 1n });
      for (const j of junk) expect(weightOf(pool, j.itemTemplateId)).toBe(10n);
    }
  });

  it('adds drop materials of the creature kind up to the zone tier at weight 6', () => {
    const pool = fallbackCommonPool({ junk, materials, regionMaterials: [], creatureType: 'beast', zoneTier: 1n });
    const expectedIds = materials
      .filter((m) => m.sources.includes('drop') && m.tier <= 1n && m.dropCreatureTypes.some((t) => ['beast', 'animal'].includes(t)))
      .map((m) => m.itemTemplateId);
    expect(expectedIds.length).toBeGreaterThan(0);
    for (const id of expectedIds) expect(weightOf(pool, id)).toBe(6n);
    // no gather-only material, no material above the zone tier, no material of another creature type
    for (const m of materials) {
      if (!m.sources.includes('drop')) expect(weightOf(pool, m.itemTemplateId)).toBeUndefined();
      if (m.tier > 1n) expect(weightOf(pool, m.itemTemplateId)).toBeUndefined();
    }
    const humanoidOnly = materials.find(
      (m) => m.sources.includes('drop') && m.tier <= 1n && m.dropCreatureTypes.length > 0 && !m.dropCreatureTypes.some((t) => ['beast', 'animal'].includes(t)),
    );
    if (humanoidOnly) expect(weightOf(pool, humanoidOnly.itemTemplateId)).toBeUndefined();
  });

  it('a higher zone tier admits higher tier materials', () => {
    const low = fallbackCommonPool({ junk, materials, regionMaterials: [], creatureType: 'undead', zoneTier: 1n });
    const high = fallbackCommonPool({ junk, materials, regionMaterials: [], creatureType: 'undead', zoneTier: 3n });
    expect(high.length).toBeGreaterThanOrEqual(low.length);
  });

  it('adds own-region gather and drop materials of common or uncommon rarity at weight 6', () => {
    const pool = fallbackCommonPool({ junk, materials, regionMaterials, creatureType: 'beast', zoneTier: 1n });
    expect(weightOf(pool, 500n)).toBe(6n);
    expect(weightOf(pool, 501n)).toBe(6n);
    expect(weightOf(pool, 502n)).toBeUndefined();
    expect(weightOf(pool, 503n)).toBeUndefined();
    expect(weightOf(pool, 504n)).toBeUndefined();
    expect(weightOf(pool, 505n)).toBeUndefined();
  });

  it('lists nothing from another region when only the own region is passed', () => {
    const own = fallbackCommonPool({ junk, materials, regionMaterials: [regionMaterials[0]!], creatureType: 'beast', zoneTier: 1n });
    expect(weightOf(own, 501n)).toBeUndefined();
  });

  it('has no repeated ids', () => {
    const pool = fallbackCommonPool({ junk, materials, regionMaterials, creatureType: 'spirit', zoneTier: 3n });
    expect(new Set(pool.map((e) => e.itemTemplateId)).size).toBe(pool.length);
  });

  it('is the same for any input order', () => {
    const a = fallbackCommonPool({ junk, materials, regionMaterials, creatureType: 'beast', zoneTier: 2n });
    const b = fallbackCommonPool({
      junk: junk.slice().reverse(),
      materials: materials.slice().reverse(),
      regionMaterials: regionMaterials.slice().reverse(),
      creatureType: 'beast',
      zoneTier: 2n,
    });
    const key = (p: { itemTemplateId: bigint; weight: bigint }[]) =>
      p.map((e) => `${e.itemTemplateId}:${e.weight}`).sort().join(',');
    expect(key(a)).toBe(key(b));
  });

  it('holds the fallback weights', () => {
    expect(FALLBACK_WEIGHTS).toEqual({
      junk: 10n,
      material: 6n,
      regionMaterial: 6n,
      gearCommon: 6n,
      gearUncommon: 3n,
      gearRare: 1n,
      gearJewelry: 1n,
    });
  });
});

describe('gearPoolWeight', () => {
  it('weights jewelry 1, uncommon 3 and the rest 6', () => {
    expect(gearPoolWeight({ slot: 'neck', rarity: 'common' })).toBe(1n);
    expect(gearPoolWeight({ slot: 'earrings', rarity: 'uncommon' })).toBe(1n);
    expect(gearPoolWeight({ slot: 'chest', rarity: 'uncommon' })).toBe(3n);
    expect(gearPoolWeight({ slot: 'chest', rarity: 'common' })).toBe(6n);
    expect(gearPoolWeight({ slot: 'mainHand', rarity: 'common' })).toBe(6n);
  });

  // Review A WR-05: a rare or epic template weighed as much as a common one.
  it('weights by the real rarity: rare 1, epic and legendary 0 (never a free fallback drop)', () => {
    expect(gearPoolWeight({ slot: 'chest', rarity: 'rare' })).toBe(1n);
    expect(gearPoolWeight({ slot: 'mainHand', rarity: 'epic' })).toBe(0n);
    expect(gearPoolWeight({ slot: 'mainHand', rarity: 'legendary' })).toBe(0n);
    expect(gearPoolWeight({ slot: 'neck', rarity: 'rare' })).toBe(1n);
    expect(gearPoolWeight({ slot: 'neck', rarity: 'epic' })).toBe(0n);
    expect(gearPoolWeight({ slot: 'legs', rarity: 'odd' })).toBe(6n);
  });
});

describe('isQuestRewardName (review A WR-05: quest rewards stay out of the fallback gear pool)', () => {
  const bases = new Set(["varek's blade", 'tide ring', 'traveler necklace']);
  const seeded = new Set(['traveler necklace']);

  it('matches the questRewardItemName forms: the base, NPC stem, Quest-won stem, numbered stems', () => {
    expect(isQuestRewardName('Tide Ring', bases, seeded)).toBe(true);
    expect(isQuestRewardName("Old Marla's Tide Ring", bases, seeded)).toBe(true);
    expect(isQuestRewardName("Old Marla's Tide Ring 3", bases, seeded)).toBe(true);
    expect(isQuestRewardName('Quest-won Tide Ring', bases, seeded)).toBe(true);
    expect(isQuestRewardName('quest-won tide ring 2', bases, seeded)).toBe(true);
    expect(isQuestRewardName("Varek's Blade", bases, seeded)).toBe(true);
  });

  it('a seeded template that only shares the base name is not a quest reward; others are not either', () => {
    expect(isQuestRewardName('Traveler Necklace', bases, seeded)).toBe(false);
    expect(isQuestRewardName("Hob's Traveler Necklace", bases, seeded)).toBe(true);
    expect(isQuestRewardName('Iron Sword', bases, seeded)).toBe(false);
    expect(isQuestRewardName('Tide Ring Mail', bases, seeded)).toBe(false);
    expect(isQuestRewardName('', bases, seeded)).toBe(false);
  });
});

describe('aiLootTable', () => {
  const ids = { dropId: 10n, trophyId: 11n, gearId: 12n, gatherableIds: [20n, 21n, 22n] };

  it('returns 4 to 6 entries with one drop, one trophy and one gear', () => {
    for (let region = 1n; region <= 12n; region += 1n) {
      for (let enemy = 1n; enemy <= 12n; enemy += 1n) {
        const table = aiLootTable(region, enemy, ids);
        expect(table.length).toBeGreaterThanOrEqual(4);
        expect(table.length).toBeLessThanOrEqual(6);
        expect(table.filter((e) => e.role === 'drop')).toHaveLength(1);
        expect(table.filter((e) => e.role === 'trophy')).toHaveLength(1);
        expect(table.filter((e) => e.role === 'gear')).toHaveLength(1);
        const gatherables = table.filter((e) => e.role === 'gatherable');
        expect(gatherables.length).toBeGreaterThanOrEqual(1);
        expect(gatherables.length).toBeLessThanOrEqual(3);
      }
    }
  });

  it('uses the fixed weights', () => {
    expect(AI_LOOT_WEIGHTS).toEqual({ drop: 40n, trophy: 25n, gear: 10n, gatherable: 15n });
    const table = aiLootTable(3n, 4n, ids);
    for (const e of table) {
      expect(e.weight).toBe(AI_LOOT_WEIGHTS[e.role as keyof typeof AI_LOOT_WEIGHTS]);
    }
    expect(table.find((e) => e.role === 'drop')!.itemTemplateId).toBe(10n);
    expect(table.find((e) => e.role === 'trophy')!.itemTemplateId).toBe(11n);
    expect(table.find((e) => e.role === 'gear')!.itemTemplateId).toBe(12n);
  });

  it('is the same for the same ids', () => {
    expect(aiLootTable(5n, 9n, ids)).toEqual(aiLootTable(5n, 9n, ids));
  });

  it('does not depend on the order of the gatherable ids', () => {
    const reversed = { ...ids, gatherableIds: [22n, 21n, 20n] };
    expect(aiLootTable(5n, 9n, reversed)).toEqual(aiLootTable(5n, 9n, ids));
  });

  it('picks distinct gatherables and varies the count across enemies', () => {
    const counts = new Set<number>();
    for (let enemy = 1n; enemy <= 40n; enemy += 1n) {
      const table = aiLootTable(2n, enemy, ids);
      const g = table.filter((e) => e.role === 'gatherable').map((e) => e.itemTemplateId);
      expect(new Set(g).size).toBe(g.length);
      for (const id of g) expect(ids.gatherableIds).toContain(id);
      counts.add(g.length);
    }
    expect(counts.size).toBeGreaterThan(1);
  });

  it('caps the gatherable count at the ids it is given', () => {
    const table = aiLootTable(2n, 3n, { ...ids, gatherableIds: [20n] });
    expect(table.filter((e) => e.role === 'gatherable')).toHaveLength(1);
  });
});

describe('never empty (CUT-01, SC4)', () => {
  const junk = JUNK_DEFS.map((_, i) => ({ itemTemplateId: BigInt(i + 1) }));
  const types = ['animal', 'beast', 'humanoid', 'undead', 'spirit', 'construct', 'elemental', 'aberration', ''];

  it('has a pool, one pick and at least 1 gold for 9 creature types x 3 levels at default dials', () => {
    expect(types).toHaveLength(9);
    for (const type of types) {
      for (const level of [1n, 10n, 30n]) {
        const pool = fallbackCommonPool({ junk, materials: [], regionMaterials: [], creatureType: type, zoneTier: 1n });
        expect(pool.length, `${type} L${level}`).toBeGreaterThan(0);
        for (let s = 0n; s < 25n; s += 1n) {
          expect(pickCount(s, 100n)).toBe(1n);
          expect(pickWeighted(pool, s, ROLL_INDEX.PICK_BASE)).not.toBeNull();
          expect(goldReward(creatureProfile(type), level, s, 100n) >= 1n).toBe(true);
        }
      }
    }
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
