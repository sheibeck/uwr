import type { ViewDeps } from './types';

// ============================================================================
// my_action_result: per-sender projection of the private action_result table
// ============================================================================
//
// The table is private (one row per character: that character's last craft, salvage or Discover),
// so the client reads its own active character's row only through this view. It reaches the table
// with two primary-key lookups (player by sender, then the row by the active character id) and
// nothing else, so a subscriber sees their own last result and nobody else's.
// ============================================================================

export function myActionResultRows(ctx: any): any[] {
  const player = ctx.db.player.id.find(ctx.sender);
  if (!player?.activeCharacterId) return [];
  const row = ctx.db.action_result.characterId.find(player.activeCharacterId);
  return row ? [row] : [];
}

export const registerActionResultViews = ({ spacetimedb, t, ActionResult }: ViewDeps) => {
  spacetimedb.view(
    { name: 'my_action_result', public: true },
    t.array(ActionResult.rowType),
    (ctx: any) => myActionResultRows(ctx)
  );
};
