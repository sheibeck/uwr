// Vendor price math: one place for what a vendor charges and pays. listingBuyPrice is the charged
// price: it never falls to or below what the same character earns selling that item. Shared by buy_item,
// sell_item, sell_all_junk, the natural-language sell paths and the client vendor screen, so the
// price shown is the price charged. Charisma modifiers (vendorBuyMod, vendorSellMod) are on a
// 1000 scale. The perk percent is passed in: the server reads it with getPerkBonusByField, the
// client with perkBonusByField over the same renown keys.
// No imports, so the client can reach it through @game-data. Browser-safe, ES2020 only, never
// throws.

/** Sell value with the Charisma bonus: base * (1000 + mod) / 1000 when both are above zero. */
export function computeSellValue(baseValue: bigint, vendorSellMod: bigint): bigint {
  if (vendorSellMod > 0n && baseValue > 0n) {
    return (baseValue * (1000n + vendorSellMod)) / 1000n;
  }
  return baseValue;
}

/** A perk percent as a whole number: fractions are cut off, anything not finite is zero. */
function wholePercent(pct: number): number {
  return typeof pct === 'number' && isFinite(pct) ? Math.trunc(pct) : 0;
}

/**
 * The renown sell bonus percent the payout math really applies (whole, never below zero). Use it
 * for any "(N% perk bonus)" text so the line matches the gold paid.
 */
export function appliedSellBonusPercent(perkSellPct: number): number {
  return Math.max(0, wholePercent(perkSellPct));
}

/**
 * The renown buy discount percent the price math really applies (whole, between zero and the 50
 * percent cap). Use it for any "(N% perk discount)" text so the line matches the price charged.
 */
export function appliedBuyDiscountPercent(perkDiscountPct: number): number {
  return Math.min(Math.max(0, wholePercent(perkDiscountPct)), 50);
}

/**
 * What the vendor pays for a stack: value times quantity, plus the renown sell bonus when it
 * applies, then the Charisma bonus. Rounding happens per call, so a sum over several stacks
 * must call this once per stack.
 */
export function sellPayout(
  vendorValue: bigint,
  quantity: bigint,
  perkSellPct: number,
  vendorSellMod: bigint,
): bigint {
  let base = vendorValue * quantity;
  const perk = wholePercent(perkSellPct);
  if (perk > 0 && base > 0n) {
    base = (base * BigInt(100 + perk)) / 100n;
  }
  return computeSellValue(base, vendorSellMod);
}

/**
 * What the player pays for one item: the renown discount (capped at 50 percent), then the
 * Charisma discount, each with a minimum price of 1. This is the discount math only: callers
 * charge listingBuyPrice, which adds the price floor.
 */
export function buyPrice(listPrice: bigint, perkDiscountPct: number, vendorBuyMod: bigint): bigint {
  let price = listPrice;
  const perk = wholePercent(perkDiscountPct);
  if (perk > 0) {
    price = (listPrice * BigInt(100 - Math.min(perk, 50))) / 100n;
    if (price < 1n) price = 1n;
  }
  if (vendorBuyMod > 0n) {
    price = (price * (1000n - vendorBuyMod)) / 1000n;
    if (price < 1n) price = 1n;
  }
  return price;
}

/**
 * The most a character can earn per unit selling an item: the exact per-unit payout rounded down
 * once. sellPayout rounds down per call, so no stack size ever pays more than this per unit.
 * A negative perk or modifier counts as 0.
 */
export function unitSellCeiling(vendorValue: bigint, perkSellPct: number, vendorSellMod: bigint): bigint {
  if (vendorValue <= 0n) return 0n;
  const perk = BigInt(100 + appliedSellBonusPercent(perkSellPct));
  const mod = vendorSellMod > 0n ? vendorSellMod : 0n;
  return (vendorValue * perk * (1000n + mod)) / 100000n;
}

export interface ListingPriceInput {
  listPrice: bigint;
  vendorValue: bigint;
  perkBuyPct: number;
  perkSellPct: number;
  vendorBuyMod: bigint;
  vendorSellMod: bigint;
}

/**
 * What a vendor charges for one unit of a listing: buy_item and the client For sale table both
 * charge it. It is always above what the same character earns per unit for selling any stack of
 * that item. Buy-back is the only exception, because it refunds the exact sale price.
 */
export function listingBuyPrice(input: ListingPriceInput): bigint {
  const raw = buyPrice(input.listPrice, input.perkBuyPct, input.vendorBuyMod);
  const floor = unitSellCeiling(input.vendorValue, input.perkSellPct, input.vendorSellMod) + 1n;
  return raw > floor ? raw : floor;
}

export interface RapportInput {
  perkBuyPct: number;
  perkSellPct: number;
  vendorBuyMod: bigint;
  vendorSellMod: bigint;
}

export interface RapportPercents {
  /** Buy price change in percent (negative is cheaper), one decimal. */
  buyPct: number;
  /** Sell payout change in percent (positive pays more), one decimal. */
  sellPct: number;
  /** True when a renown perk contributes to either figure. */
  fromRenown: boolean;
}

const oneDecimal = (x: number): number => {
  const r = Math.round(x * 10) / 10;
  return r === 0 ? 0 : r;
};

/**
 * The rapport line the vendor band shows: the combined buy and sell change from the renown
 * perks and the Charisma modifiers. Numbers only; the client formats them (U+2212 minus, one
 * decimal only when not whole).
 */
export function rapportPercents(input: RapportInput): RapportPercents {
  const perkBuy = wholePercent(input.perkBuyPct);
  const perkSell = wholePercent(input.perkSellPct);
  const buyMod = typeof input.vendorBuyMod === 'bigint' ? Number(input.vendorBuyMod) : 0;
  const sellMod = typeof input.vendorSellMod === 'bigint' ? Number(input.vendorSellMod) : 0;

  let buyFactor = 1;
  if (perkBuy > 0) buyFactor *= (100 - Math.min(perkBuy, 50)) / 100;
  if (buyMod > 0) buyFactor *= (1000 - buyMod) / 1000;

  let sellFactor = 1;
  if (perkSell > 0) sellFactor *= (100 + perkSell) / 100;
  if (sellMod > 0) sellFactor *= (1000 + sellMod) / 1000;

  return {
    buyPct: oneDecimal((buyFactor - 1) * 100),
    sellPct: oneDecimal((sellFactor - 1) * 100),
    fromRenown: perkBuy > 0 || perkSell > 0,
  };
}
