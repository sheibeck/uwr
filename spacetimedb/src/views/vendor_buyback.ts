import type { ViewDeps } from './types';

// ============================================================================
// my_vendor_buyback: per-sender projection of the private vendor_buyback table
// ============================================================================
//
// The table is private (one row per character: that character's last sale to a vendor), so the
// client reads its own active character's row only through this view. It reaches the table with
// two primary-key lookups (player by sender, then the row by the active character id) and nothing
// else, so a subscriber sees their own last sale and nobody else's.
// ============================================================================

export function myVendorBuybackRows(ctx: any): any[] {
  const player = ctx.db.player.id.find(ctx.sender);
  if (!player?.activeCharacterId) return [];
  const row = ctx.db.vendor_buyback.characterId.find(player.activeCharacterId);
  return row ? [row] : [];
}

export const registerVendorBuybackViews = ({ spacetimedb, t, VendorBuyback }: ViewDeps) => {
  spacetimedb.view(
    { name: 'my_vendor_buyback', public: true },
    t.array(VendorBuyback.rowType),
    (ctx: any) => myVendorBuybackRows(ctx)
  );
};
