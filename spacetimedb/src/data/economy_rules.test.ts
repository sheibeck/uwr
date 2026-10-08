import { describe, it, expect } from 'vitest';
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
} from './economy_rules';

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
