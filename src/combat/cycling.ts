// Tab target cycling (48-UI-SPEC "Keyboard (CMB-01)").
//
// The next target is computed from the most recently requested target, so rapid presses
// advance through the list before the server echoes the first one. The caller decides
// whether to preventDefault: only when this returns an id (the key acted).

/**
 * Next living hostile id in the given direction, wrapping, or null when the key should do nothing
 * (no living hostile, or the only living hostile is already the base).
 */
export function nextTargetId(
  livingIds: readonly bigint[],
  currentId: bigint | null,
  lastRequested: bigint | null,
  dir: 1 | -1,
): bigint | null {
  const count = livingIds.length;
  if (count === 0) return null;

  let base: bigint | null = null;
  if (lastRequested !== null && livingIds.indexOf(lastRequested) !== -1) base = lastRequested;
  else if (currentId !== null && livingIds.indexOf(currentId) !== -1) base = currentId;

  if (base === null) return dir === 1 ? livingIds[0] : livingIds[count - 1];

  const index = livingIds.indexOf(base);
  const next = livingIds[(index + dir + count) % count];
  return next === base ? null : next;
}
