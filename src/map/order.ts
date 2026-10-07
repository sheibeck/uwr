// Ordering helpers for the Map. src/rails/levelRange.ts keeps its own private copy of the name
// compare and is not edited by Phase 51, so the Map has this one.

/** Bigint ordering with comparisons, never subtraction (bigint cannot go through Number safely). */
export function compareBigint(a: bigint, b: bigint): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

/**
 * Name ordering that ignores case and accents. The locale is fixed to 'en', not the browser's, so
 * the order (and the map layout built on it) is the same for every player (51 review IN-06).
 */
export function compareNames(a: string, b: string): number {
  return a.localeCompare(b, 'en', { sensitivity: 'base' });
}
