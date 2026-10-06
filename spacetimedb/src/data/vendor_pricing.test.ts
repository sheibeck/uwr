import { describe, expect, it, vi, beforeAll } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import {
  appliedBuyDiscountPercent,
  appliedSellBonusPercent,
  buyPrice,
  computeSellValue,
  rapportPercents,
  sellPayout,
} from './vendor_pricing';

// helpers/economy.ts imports server modules; record the real table definitions first.
vi.mock('spacetimedb/server', async () =>
  (await import('../helpers/schema_recorder')).createRecordingServerMock(),
);

let economy: typeof import('../helpers/economy');
beforeAll(async () => {
  await import('../schema/tables');
  economy = await import('../helpers/economy');
});

function importSpecifiers(fileName: string): string[] {
  const path = fileURLToPath(new URL(`./${fileName}`, import.meta.url));
  const source = readFileSync(path, 'utf8');
  const out: string[] = [];
  const re = /from\s+'([^']+)'/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(source)) !== null) out.push(m[1]);
  return out;
}

describe('computeSellValue', () => {
  it('applies the Charisma bonus on the 1000 scale', () => {
    expect(computeSellValue(100n, 0n)).toBe(100n);
    expect(computeSellValue(100n, 50n)).toBe(105n);
    expect(computeSellValue(0n, 50n)).toBe(0n);
    expect(computeSellValue(100n, -20n)).toBe(100n);
  });

  it('truncates toward zero', () => {
    expect(computeSellValue(7n, 37n)).toBe((7n * 1037n) / 1000n);
  });
});

describe('sellPayout', () => {
  it('is value times quantity with no perk and no mod', () => {
    expect(sellPayout(7n, 3n, 0, 0n)).toBe(21n);
  });

  it('applies the perk bonus with truncation: 21 * 105 / 100 is 22', () => {
    expect(sellPayout(7n, 3n, 5, 0n)).toBe(22n);
  });

  it('applies the Charisma bonus after the perk', () => {
    expect(sellPayout(7n, 3n, 5, 37n)).toBe(computeSellValue(22n, 37n));
  });

  it('a fractional perk behaves as its whole part and never throws', () => {
    expect(sellPayout(7n, 3n, 5.5, 0n)).toBe(sellPayout(7n, 3n, 5, 0n));
    expect(() => sellPayout(7n, 3n, 5.9999, 0n)).not.toThrow();
    expect(() => sellPayout(7n, 3n, NaN, 0n)).not.toThrow();
    expect(sellPayout(7n, 3n, NaN, 0n)).toBe(21n);
  });

  it('a worthless item pays nothing whatever the perk', () => {
    expect(sellPayout(0n, 4n, 5, 150n)).toBe(0n);
  });

  it('rounds per call: three stacks of 7 pay 21 apiece-wise but 22 pooled', () => {
    expect(sellPayout(7n, 1n, 5, 0n) * 3n).toBe(21n); // 7 * 105 / 100 = 7 each
    expect(sellPayout(7n, 3n, 5, 0n)).toBe(22n); // 21 * 105 / 100 = 22
  });
});

describe('buyPrice', () => {
  it('is the list price with no perk and no mod', () => {
    expect(buyPrice(100n, 0, 0n)).toBe(100n);
  });

  it('applies the renown discount', () => {
    expect(buyPrice(100n, 5, 0n)).toBe(95n);
  });

  it('caps the renown discount at 50 percent', () => {
    expect(buyPrice(100n, 80, 0n)).toBe(50n);
  });

  it('never goes below 1', () => {
    expect(buyPrice(1n, 50, 0n)).toBe(1n);
    expect(buyPrice(1n, 0, 999n)).toBe(1n);
  });

  it('applies the Charisma discount on the 1000 scale', () => {
    expect(buyPrice(100n, 0, 150n)).toBe(85n);
  });

  it('applies the perk first, then Charisma: 95 * 850 / 1000 is 80', () => {
    expect(buyPrice(100n, 5, 150n)).toBe(80n);
  });

  it('a vendorBuyMod of zero or below applies nothing', () => {
    expect(buyPrice(100n, 0, 0n)).toBe(100n);
    expect(buyPrice(100n, 0, -50n)).toBe(100n);
  });

  it('a fractional perk behaves as its whole part', () => {
    expect(buyPrice(100n, 5.7, 0n)).toBe(buyPrice(100n, 5, 0n));
  });
});

describe('rapportPercents', () => {
  it('shows the Charisma modifiers alone', () => {
    expect(rapportPercents({ perkBuyPct: 0, perkSellPct: 0, vendorBuyMod: 20n, vendorSellMod: 35n })).toEqual({
      buyPct: -2,
      sellPct: 3.5,
      fromRenown: false,
    });
  });

  it('combines the renown perk and the Charisma modifier and flags renown', () => {
    const r = rapportPercents({ perkBuyPct: 5, perkSellPct: 5, vendorBuyMod: 20n, vendorSellMod: 35n });
    const buy = Math.round(((((100 - 5) / 100) * (1000 - 20)) / 1000 - 1) * 100 * 10) / 10;
    const sell = Math.round(((((100 + 5) / 100) * (1000 + 35)) / 1000 - 1) * 100 * 10) / 10;
    expect(r).toEqual({ buyPct: buy, sellPct: sell, fromRenown: true });
    expect(r.buyPct).toBe(-6.9);
  });

  it('is zero when nothing applies, with no negative zero', () => {
    const r = rapportPercents({ perkBuyPct: 0, perkSellPct: 0, vendorBuyMod: 0n, vendorSellMod: 0n });
    expect(r).toEqual({ buyPct: 0, sellPct: 0, fromRenown: false });
    expect(Object.is(r.buyPct, -0)).toBe(false);
    expect(Object.is(r.sellPct, -0)).toBe(false);
  });

  it('never returns NaN, even for bad input', () => {
    const r = rapportPercents({ perkBuyPct: NaN, perkSellPct: Infinity, vendorBuyMod: 0n, vendorSellMod: 0n });
    expect(Number.isNaN(r.buyPct)).toBe(false);
    expect(Number.isNaN(r.sellPct)).toBe(false);
    expect(r.fromRenown).toBe(false);
  });

  it('caps the buy discount from the perk at 50 percent', () => {
    expect(rapportPercents({ perkBuyPct: 80, perkSellPct: 0, vendorBuyMod: 0n, vendorSellMod: 0n }).buyPct).toBe(-50);
  });

  it('percentages are rounded to one decimal', () => {
    const r = rapportPercents({ perkBuyPct: 0, perkSellPct: 0, vendorBuyMod: 33n, vendorSellMod: 37n });
    expect(r.buyPct).toBe(-3.3);
    expect(r.sellPct).toBe(3.7);
  });
});

describe('helpers/economy re-export', () => {
  it('exports the same computeSellValue function object', () => {
    expect(economy.computeSellValue).toBe(computeSellValue);
  });
});

describe('applied perk percent (the number shown in the sale and buy lines)', () => {
  it('matches what the price math applies: whole, floored at zero, buy discount capped at 50', () => {
    expect(appliedSellBonusPercent(7.9)).toBe(7);
    expect(appliedSellBonusPercent(0.5)).toBe(0);
    expect(appliedSellBonusPercent(-3)).toBe(0);
    expect(appliedSellBonusPercent(Number.NaN)).toBe(0);
    expect(appliedBuyDiscountPercent(12.7)).toBe(12);
    expect(appliedBuyDiscountPercent(80)).toBe(50);
    expect(appliedBuyDiscountPercent(0.9)).toBe(0);
    expect(appliedBuyDiscountPercent(-1)).toBe(0);
  });

  it('the shown percent reproduces the charged price and payout', () => {
    expect(buyPrice(200n, 80, 0n)).toBe(buyPrice(200n, appliedBuyDiscountPercent(80), 0n));
    expect(buyPrice(200n, 12.7, 0n)).toBe(buyPrice(200n, appliedBuyDiscountPercent(12.7), 0n));
    expect(sellPayout(10n, 5n, 7.9, 0n)).toBe(sellPayout(10n, 5n, appliedSellBonusPercent(7.9), 0n));
  });
});

describe('import pin', () => {
  it('vendor_pricing has no import specifier', () => {
    expect(importSpecifiers('vendor_pricing.ts')).toEqual([]);
  });
});
