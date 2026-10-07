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

/** The character's visited row for a place, or undefined. */
export function visitedRowFor(ctx: any, characterId: bigint, locationId: bigint): any | undefined {
  for (const row of ctx.db.visited_location.by_character.filter(characterId)) {
    if (row.locationId === locationId) return row;
  }
  return undefined;
}

/**
 * Record that the character has stood in a place. Inserts the row when missing; when it exists,
 * updates only fromLocationId and only when a different origin is given. locationId 0n (no place)
 * is ignored.
 */
export function markLocationVisited(
  ctx: any,
  characterId: bigint,
  locationId: bigint,
  fromLocationId?: bigint,
): void {
  if (locationId === 0n) return;
  const existing = visitedRowFor(ctx, characterId, locationId);
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
