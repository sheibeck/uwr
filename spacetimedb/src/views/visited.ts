import type { ViewDeps } from './types';

// ============================================================================
// Per-sender projection of the private visited_location table
// ============================================================================
//
// The table is private (every place each character has stood in), so the client reads its own
// active character's rows only through this view. It reaches the table with index lookups only
// (player by sender, then visited_location by_character) and never scans, so a subscriber sees
// where their own character has been and nobody else's.
// ============================================================================

export function myVisitedLocationRows(ctx: any): any[] {
  const player = ctx.db.player.id.find(ctx.sender);
  if (!player?.activeCharacterId) return [];
  return [...ctx.db.visited_location.by_character.filter(player.activeCharacterId)];
}

export const registerVisitedViews = ({ spacetimedb, t, VisitedLocation }: ViewDeps) => {
  spacetimedb.view(
    { name: 'my_visited_locations', public: true },
    t.array(VisitedLocation.rowType),
    (ctx: any) => myVisitedLocationRows(ctx)
  );
};
