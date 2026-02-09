export const MAX_LEVEL = 10n;

export const XP_TOTAL_BY_LEVEL = [
  0n, // L1
  100n, // L2
  260n, // L3
  480n, // L4
  760n, // L5
  1100n, // L6
  1500n, // L7
  1960n, // L8
  2480n, // L9
  3060n, // L10
];

export function xpRequiredForLevel(level: bigint) {
  if (level <= 1n) return 0n;
  const idx = Number(level - 1n);
  if (idx <= 0) return 0n;
  return XP_TOTAL_BY_LEVEL[Math.min(idx, XP_TOTAL_BY_LEVEL.length - 1)];
}

export function xpModifierForDiff(diff: number) {
  if (diff <= -5) return 0n;
  if (diff === -4) return 10n;
  if (diff === -3) return 25n;
  if (diff === -2) return 50n;
  if (diff === -1) return 80n;
  if (diff === 0) return 100n;
  if (diff === 1) return 120n;
  if (diff === 2) return 140n;
  if (diff === 3) return 160n;
  if (diff === 4) return 180n;
  return 200n;
}
