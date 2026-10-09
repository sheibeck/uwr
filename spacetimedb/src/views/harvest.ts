import type { ViewDeps } from './types';

// ============================================================================
// Per-sender projection of the private pool_harvest table (Phase 51.3.1.1, D-27)
// ============================================================================
//
// The harvest cap is per player and per place (one row per owning user and place, review A WR-01).
// The client needs only to know where its active character is capped and until when, so this view
// returns three fields of the player's capped rows: no gather count and no window start (the cap
// amount stays private). It reaches the table with index lookups only (player by sender, then
// pool_harvest by_user, plus by_character for rows written before the userId column, which read
// userId 0n) and never reads the timestamp: the expiry is stored, and the client compares it with
// its own server clock.
// ============================================================================

export function myHarvestCapRows(ctx: any): Array<{ id: bigint; locationId: bigint; cappedUntilMicros: bigint }> {
  const player = ctx.db.player.id.find(ctx.sender);
  if (!player || player.userId == null || !player.activeCharacterId) return [];
  const byPlace = new Map<bigint, any>();
  for (const row of ctx.db.pool_harvest.by_user.filter(player.userId)) {
    if (!byPlace.has(row.locationId)) byPlace.set(row.locationId, row);
  }
  for (const row of ctx.db.pool_harvest.by_character.filter(player.activeCharacterId)) {
    if ((row.userId ?? 0n) === 0n && !byPlace.has(row.locationId)) byPlace.set(row.locationId, row);
  }
  return [...byPlace.values()]
    .filter((row: any) => row.cappedUntilMicros > 0n)
    .map((row: any) => ({ id: row.id, locationId: row.locationId, cappedUntilMicros: row.cappedUntilMicros }));
}

export const registerHarvestViews = ({ spacetimedb, t }: ViewDeps) => {
  // The row name must differ from the view's own generated struct (MyHarvestCaps).
  const MyHarvestCap = t.row('MyHarvestCap', {
    id: t.u64().primaryKey(),
    locationId: t.u64(),
    cappedUntilMicros: t.u64(),
  });

  spacetimedb.view(
    { name: 'my_harvest_caps', public: true },
    t.array(MyHarvestCap),
    (ctx: any) => myHarvestCapRows(ctx)
  );
};
