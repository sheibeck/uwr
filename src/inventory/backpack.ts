import { MAX_INVENTORY_SLOTS, backpackSlotCount } from '@game-data/inventory_rules';
import type { ItemInstance, ItemTemplate } from '../module_bindings/types';
import { compareBagItems, itemCategory } from '../ledger/itemModel';
import type { BagEntry, ItemCategory } from '../ledger/itemModel';

// The backpack model (50-UI-SPEC "Header" and "Backpack"): slot count against the server's capacity,
// the four filters, the deterministic sort and the empty tiles. The capacity and the count rule are
// the server's own shared rule module, never copied. Pure.

export type BagFilterId = 'all' | 'gear' | 'materials' | 'food';

export const BAG_FILTERS: ReadonlyArray<{ id: BagFilterId; label: string }> = [
  { id: 'all', label: 'All' },
  { id: 'gear', label: 'Gear' },
  { id: 'materials', label: 'Materials' },
  { id: 'food', label: 'Food' },
];

export const FILTER_EMPTY_TEXT: Readonly<Record<string, string>> = {
  gear: 'No gear in your backpack.',
  materials: 'No materials in your backpack.',
  food: 'No food in your backpack.',
};

export interface SlotUsage {
  used: number;
  cap: number;
  full: boolean;
}

/** Non-equipped instances (a stack counts once) against the capacity; full at the cap. */
export function slotUsage(items: readonly ItemInstance[]): SlotUsage {
  const used = backpackSlotCount(items);
  const cap = MAX_INVENTORY_SLOTS;
  return { used, cap, full: used >= cap };
}

/** '12 / 50 slots', '50 / 50 slots · Full', and the short mobile form '12 / 50'. */
export function slotMetaText(usage: SlotUsage, mobile: boolean): string {
  const count = `${usage.used} / ${usage.cap}`;
  if (mobile) return count;
  return usage.full ? `${count} slots · Full` : `${count} slots`;
}

const FILTER_CATEGORY: Readonly<Record<string, ItemCategory>> = {
  gear: 'gear',
  materials: 'material',
  food: 'food',
};

/**
 * The backpack entries (non-equipped instances whose template is known) that pass the filter, in
 * no particular order. An instance whose template has not arrived yet is left out until it does.
 */
export function filterBag(
  items: readonly ItemInstance[],
  templates: ReadonlyMap<bigint, ItemTemplate>,
  filter: BagFilterId,
): BagEntry[] {
  const entries: BagEntry[] = [];
  for (const instance of items) {
    if (instance.equippedSlot !== undefined && instance.equippedSlot !== null && instance.equippedSlot !== '') {
      continue;
    }
    const template = templates.get(instance.templateId);
    if (!template) continue;
    if (filter !== 'all' && itemCategory(template) !== FILTER_CATEGORY[filter]) continue;
    entries.push({ instance, template });
  }
  return entries;
}

/**
 * The grid: sorted entries, then (under All only) empty tiles up to the capacity. With the bag at
 * or over capacity there are no empty tiles; other filters never show empty tiles.
 */
export function bagTiles(
  items: readonly ItemInstance[],
  templates: ReadonlyMap<bigint, ItemTemplate>,
  filter: BagFilterId,
): { items: BagEntry[]; emptyCount: number } {
  const sorted = filterBag(items, templates, filter).sort(compareBagItems);
  const usage = slotUsage(items);
  // From the slot count, not the rendered entries: an instance whose template has not arrived is
  // left out of `sorted` but still holds a slot, so counting `sorted` would show extra empty tiles.
  const emptyCount = filter === 'all' && !usage.full ? Math.max(0, usage.cap - usage.used) : 0;
  return { items: sorted, emptyCount };
}

// The backpack tile size (Plans 50-32 and 50-39). The owner's 2026-10-07 decision replaces the 50-32
// cap of 58px: the desktop grid fills the backpack column, using the fewest columns whose tile is at
// most 72px (backpackColumns), so a wider window adds columns instead of growing the tiles. 6 is only
// the column count before the column has been measured. Mobile stays 5 columns of at most 66px. The
// mock's 6px gap maps to 4px on the spacing scale.
export const BACKPACK_COLUMNS = { desktop: 6, mobile: 5 } as const;
export const BACKPACK_TILE_MAX_PX = { desktop: 72, mobile: 66 } as const;
export const BACKPACK_TILE_MIN_PX = 44;
export const BACKPACK_GAP_PX = 4;

// The even share of a column of the given width across `cols` columns with the gap between them.
function tileShare(columnWidthPx: number, cols: number): number {
  return Math.floor((columnWidthPx - BACKPACK_GAP_PX * (cols - 1)) / cols);
}

/**
 * How many columns fill a column of the given width. Mobile is always 5. On desktop it is the fewest
 * columns whose tile is at most 72px, so the grid fills the width; a column that has not been
 * measured (zero, negative or not a number) gives the initial 6. Never a tile under 44px unless a
 * single column is all there is.
 */
export function backpackColumns(columnWidthPx: number, mobile: boolean): number {
  if (mobile) return BACKPACK_COLUMNS.mobile;
  if (!(columnWidthPx > 0)) return BACKPACK_COLUMNS.desktop;
  const unit = BACKPACK_TILE_MAX_PX.desktop + BACKPACK_GAP_PX;
  let cols = Math.max(1, Math.ceil((columnWidthPx + BACKPACK_GAP_PX) / unit));
  while (cols > 1 && tileShare(columnWidthPx, cols) < BACKPACK_TILE_MIN_PX) cols -= 1;
  return cols;
}

/**
 * The square tile edge the grid gives in a column of the given width: the even share of the width
 * across the columns backpackColumns picks, held between the 44px touch target and the cap.
 */
export function backpackTileSize(columnWidthPx: number, mobile: boolean): number {
  const cols = backpackColumns(columnWidthPx, mobile);
  const max = mobile ? BACKPACK_TILE_MAX_PX.mobile : BACKPACK_TILE_MAX_PX.desktop;
  return Math.min(max, Math.max(BACKPACK_TILE_MIN_PX, tileShare(columnWidthPx, cols)));
}

/**
 * The tile's top-right count, as the mock draws it: 'x14' for every stackable (including 'x1'), and
 * for a non-stackable only above 1. Empty when no count shows. A missing quantity counts as 1.
 */
export function stackCountText(
  instance: Pick<ItemInstance, 'quantity'>,
  template: Pick<ItemTemplate, 'stackable'>,
): string {
  const quantity = typeof instance.quantity === 'bigint' ? instance.quantity : 1n;
  if (template.stackable || quantity > 1n) return `x${quantity}`;
  return '';
}
