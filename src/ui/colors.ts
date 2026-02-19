/** Rarity tier color hex values — single source of truth for all client UI */
export const RARITY_COLORS: Record<string, string> = {
  common: '#ffffff',
  uncommon: '#22c55e',
  rare: '#3b82f6',
  epic: '#aa44ff',
  legendary: '#ff8800',
};

/** Craft quality color hex values */
export const CRAFT_QUALITY_COLORS: Record<string, string> = {
  dented: '#888',
  standard: '#ccc',
  reinforced: '#6c9',
  exquisite: '#9cf',
  mastercraft: '#f90',
};

/** Returns hex color string for a rarity tier (case-insensitive, defaults to common white) */
export function rarityColor(rarity: string): string {
  return RARITY_COLORS[(rarity ?? 'common').toLowerCase()] ?? '#ffffff';
}

/** Returns hex color string for a craft quality level (defaults to standard gray) */
export function craftQualityColor(cq: string): string {
  return CRAFT_QUALITY_COLORS[cq] ?? '#ccc';
}
