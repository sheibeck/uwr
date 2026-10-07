// ============================================================================
// Visited places: every place a character has stood in (the map draws these)
// ============================================================================
//
// One visited_location row per (character, place). markLocationVisited is called at every arrival:
// a move, a first spawn, a respawn, a resurrection, and set_active_character (the backfill for
// characters that existed before the table did). fromLocationId is where the last arrival here
// came from; only a real arrival with a known origin changes it, so respawn, resurrection, first
// spawn and the backfill (no origin) never touch an existing row.
// ============================================================================

/**
 * Every visited row of the character for a place, lowest id first, read through the by_character
 * index (no table scan). There should be at most one; see markLocationVisited.
 */
function visitedRowsFor(ctx: any, characterId: bigint, locationId: bigint): any[] {
  const rows = [...ctx.db.visited_location.by_character.filter(characterId)].filter(
    (row: any) => row.locationId === locationId,
  );
  rows.sort((a: any, b: any) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  return rows;
}

/** The character's visited row for a place (the lowest-id one if duplicates exist), or undefined. */
export function visitedRowFor(ctx: any, characterId: bigint, locationId: bigint): any | undefined {
  return visitedRowsFor(ctx, characterId, locationId)[0];
}

/**
 * Record that the character has stood in a place. Inserts the row when missing; when it exists,
 * updates only fromLocationId and only when a different origin is given. locationId 0n (no place)
 * is ignored.
 *
 * This is the only writer that inserts visited_location rows (a source test pins that), and it
 * keeps one row per (character, place): the table has no composite unique key, so any duplicate
 * found here is deleted, keeping the lowest-id (first) row.
 */
export function markLocationVisited(
  ctx: any,
  characterId: bigint,
  locationId: bigint,
  fromLocationId?: bigint,
): void {
  if (locationId === 0n) return;
  const [existing, ...duplicates] = visitedRowsFor(ctx, characterId, locationId);
  for (const duplicate of duplicates) {
    ctx.db.visited_location.id.delete(duplicate.id);
  }
  if (!existing) {
    ctx.db.visited_location.insert({
      id: 0n,
      characterId,
      locationId,
      firstVisitedAt: ctx.timestamp,
      fromLocationId,
    });
    return;
  }
  if (fromLocationId !== undefined && existing.fromLocationId !== fromLocationId) {
    ctx.db.visited_location.id.update({ ...existing, fromLocationId });
  }
}
