/**
 * Which characters are online right now: the ids that some player row has as its
 * activeCharacterId. Phase 51.1 replaces the body with the stored online flag; callers keep the
 * name.
 */
export function onlineCharacterIds(ctx: any): Set<bigint> {
  const ids = new Set<bigint>();
  for (const player of ctx.db.player.iter()) {
    if (player.activeCharacterId !== undefined && player.activeCharacterId !== null) {
      ids.add(player.activeCharacterId);
    }
  }
  return ids;
}
