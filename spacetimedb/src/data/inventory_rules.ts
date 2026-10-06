// Backpack capacity rule: the one place the bag size and the slot-count rule live. Used by
// helpers/items.ts (buy, buy-back and craft gates through getInventorySlotCount and
// hasInventorySpace) and by the client's slot count and full-bag reasons, so screen and server
// agree. No imports, so the client can reach it through @game-data. Browser-safe, ES2020 only,
// never throws.

export const MAX_INVENTORY_SLOTS = 50;

export interface BackpackRowLike {
  templateId?: bigint;
  equippedSlot?: string | null;
}

/** Non-equipped rows. One stack is one row, whatever its quantity. */
export function backpackSlotCount(rows: ReadonlyArray<BackpackRowLike>): number {
  let count = 0;
  for (const row of rows) {
    if (!row) continue;
    if (!row.equippedSlot) count += 1;
  }
  return count;
}

/**
 * A stackable template with an existing non-equipped stack always fits; otherwise the bag must
 * have a free slot.
 */
export function hasBackpackSpace(
  rows: ReadonlyArray<BackpackRowLike>,
  templateId: bigint,
  stackable: boolean,
): boolean {
  if (stackable) {
    for (const row of rows) {
      if (row && row.templateId === templateId && !row.equippedSlot) return true;
    }
  }
  return backpackSlotCount(rows) < MAX_INVENTORY_SLOTS;
}
