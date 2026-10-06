// The Stats screen's number formatting (50-UI-SPEC "Derived", "Scale"). Stored chances and
// modifiers use the server's 1000 scale, shown as a percent with two decimals (the behavior of the
// v2.2 client's stats panel): 150 is 15.00%. Integer math only, so a large value never rounds.

/** A 1000-scale stored value as a percent with two decimals: 150n gives '15.00%'. */
export function formatPermille(value: bigint): string {
  if (value < 0n) return `-${formatPermille(-value)}`;
  const whole = value / 10n;
  const tenths = value % 10n;
  return `${whole}.${tenths}0%`;
}

/** The vendor rapport pair with a true minus (U+2212) on the buy side: '−2.00% / +3.50%'. */
export function formatVendorMods(buyMod: bigint, sellMod: bigint): string {
  return `−${formatPermille(buyMod)} / +${formatPermille(sellMod)}`;
}
