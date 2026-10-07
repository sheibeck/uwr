// ============================================================================
// Online status: the stored character.online flag (Phase 51.1)
// ============================================================================
//
// This module is the single writer of character.online and character.lastOnlineAtMicros (a
// source test pins that). The rule: a character is online exactly when some player row has it as
// activeCharacterId. syncCharacterOnline applies that rule, so two sessions on one character are
// handled by the rule itself: letting go in one session leaves the character online while the
// other still holds it (research Pitfall 2).
//
// Call the sync as the LAST character-row write of a reducer: setCharacterOnline re-reads the
// row, but a later update from an older snapshot would still overwrite the flag (research
// Pitfall 1). reconcileOnline repairs any drift; the module-guarded inactivity sweep runs it.
// ============================================================================

/** True when some player row has this character as its active character (bigint equality). */
export function isCharacterActive(ctx: any, characterId: bigint): boolean {
  for (const player of ctx.db.player.iter()) {
    if (player.activeCharacterId === characterId) return true;
  }
  return false;
}

/**
 * Set the stored flag. Re-reads the row by id and writes only on a real flip, stamping
 * lastOnlineAtMicros with the reducer timestamp (an exact u64). Returns true when it wrote; a
 * missing character is a no-op.
 */
export function setCharacterOnline(ctx: any, characterId: bigint, online: boolean): boolean {
  const row = ctx.db.character.id.find(characterId);
  if (!row) return false;
  if ((row.online === true) === online) return false;
  ctx.db.character.id.update({
    ...row,
    online,
    lastOnlineAtMicros: ctx.timestamp.microsSinceUnixEpoch,
  });
  return true;
}

/** Apply the online rule to one character. Null, undefined and missing ids are no-ops. */
export function syncCharacterOnline(ctx: any, characterId: bigint | null | undefined): boolean {
  if (characterId === null || characterId === undefined) return false;
  return setCharacterOnline(ctx, characterId, isCharacterActive(ctx, characterId));
}

/** Fix every character whose stored flag disagrees with the player rows. Returns the flips made. */
export function reconcileOnline(ctx: any): number {
  const active = new Set<bigint>();
  for (const player of ctx.db.player.iter()) {
    if (player.activeCharacterId !== undefined && player.activeCharacterId !== null) {
      active.add(player.activeCharacterId);
    }
  }
  // Collect first: no writes while the table iterator is open.
  const drifted = [...ctx.db.character.iter()].filter(
    (row: any) => (row.online === true) !== active.has(row.id),
  );
  let flips = 0;
  for (const row of drifted) {
    if (setCharacterOnline(ctx, row.id, active.has(row.id))) flips += 1;
  }
  return flips;
}

/** Which characters are online right now: the ids whose stored flag is true. */
export function onlineCharacterIds(ctx: any): Set<bigint> {
  const ids = new Set<bigint>();
  for (const row of ctx.db.character.iter()) {
    if (row.online === true) ids.add(row.id);
  }
  return ids;
}
