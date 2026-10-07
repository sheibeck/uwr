// Ordering helpers for the Map. src/rails/levelRange.ts keeps its own private copy of the name
// compare and is not edited by Phase 51, so the Map has this one.

/** Bigint ordering with comparisons, never subtraction (bigint cannot go through Number safely). */
export function compareBigint(a: bigint, b: bigint): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

/** Name ordering that ignores case and accents. */
export function compareNames(a: string, b: string): number {
  return a.localeCompare(b, undefined, { sensitivity: 'base' });
}
