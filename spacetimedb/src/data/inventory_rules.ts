// Backpack capacity rule: the one place the bag size and the slot-count rule live. Used by
// helpers/items.ts (the buy and buy-back gates through getInventorySlotCount and
// hasInventorySpace), by craft_recipe and craft_recipe_count (craftBatchFits, and through it the
// shared maxCraftCount), and by the client's slot count, full-bag reasons and craft stepper, so
// screen and server agree. No imports, so the client can reach it through @game-data.
// Browser-safe, ES2020 only, never throws.

export const MAX_INVENTORY_SLOTS = 50;

export interface BackpackRowLike {
  templateId?: bigint;
  equippedSlot?: string | null;
}

/** A backpack row with its stack size (a missing quantity counts as 1). */
export interface BagRowLike extends BackpackRowLike {
  quantity?: bigint;
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

// ---------------------------------------------------------------------------
// CRAFT ROOM: the capacity gate of craft_recipe and craft_recipe_count (Phase 50 review WR-01).
// The reducer removes the inputs first, deleting each row it empties, then adds the output: a
// stackable output merges into an existing non-equipped stack (or makes one new row for the whole
// batch), and a non-stackable output makes one new row per craft. The rows the inputs free are
// counted with a bound that holds whatever order the rows are walked in, so the client (whose row
// order can differ from the server's index order) gets the same answer.
// ---------------------------------------------------------------------------

function quantityOf(row: BagRowLike): bigint {
  return typeof row.quantity === 'bigint' ? row.quantity : 1n;
}

/**
 * The fewest rows that removing `count` units of a template is sure to delete. The removal walks
 * the rows in some order and deletes each one it empties; taking the biggest stacks first deletes
 * the fewest, so this is a lower bound for every order.
 */
export function rowsSurelyEmptied(
  rows: ReadonlyArray<BagRowLike>,
  templateId: bigint,
  count: bigint,
): number {
  const sizes: bigint[] = [];
  for (const row of rows) {
    if (!row || row.equippedSlot || row.templateId !== templateId) continue;
    sizes.push(quantityOf(row));
  }
  sizes.sort((a, b) => (a > b ? -1 : a < b ? 1 : 0));
  let left = count;
  let emptied = 0;
  for (const size of sizes) {
    if (size > left) break;
    left -= size;
    emptied += 1;
  }
  return emptied;
}

export interface CraftOutputLike {
  templateId: bigint;
  stackable: boolean;
}

/**
 * The backpack rows after a craft batch of `count`: the rows the consumes surely empty go, then
 * the output lands (no new row when a stack of it surely survives the consumes, one row for a
 * stackable batch otherwise, one row per craft for a non-stackable output).
 */
export function craftSlotsAfter(
  rows: ReadonlyArray<BagRowLike>,
  consumes: ReadonlyArray<{ templateId: bigint; count: bigint }>,
  output: CraftOutputLike,
  count: bigint,
): number {
  let after = backpackSlotCount(rows);
  for (const c of consumes) after -= rowsSurelyEmptied(rows, c.templateId, c.count);
  if (output.stackable) {
    let held = 0n;
    for (const row of rows) {
      if (row && !row.equippedSlot && row.templateId === output.templateId) held += quantityOf(row);
    }
    let used = 0n;
    for (const c of consumes) if (c.templateId === output.templateId) used += c.count;
    if (held <= used) after += 1;
  } else {
    after += count > 0n ? Number(count) : 0;
  }
  return after;
}

/**
 * Whether a craft batch fits the backpack: the rows after it stay within MAX_INVENTORY_SLOTS, or
 * the batch does not grow the bag at all (a stack merge into an over-full bag is still allowed,
 * as for buying).
 */
export function craftBatchFits(
  rows: ReadonlyArray<BagRowLike>,
  consumes: ReadonlyArray<{ templateId: bigint; count: bigint }>,
  output: CraftOutputLike,
  count: bigint,
): boolean {
  const after = craftSlotsAfter(rows, consumes, output, count);
  return after <= MAX_INVENTORY_SLOTS || after <= backpackSlotCount(rows);
}
