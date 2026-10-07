import type { Component } from 'vue';
import { isSalvageableTemplate } from '@game-data/item_rules';
import type { ItemInstance, ItemTemplate } from '../module_bindings/types';
import {
  compareBagItems,
  itemIcon,
  itemName,
  itemRarity,
  nameColor,
  slotLabel,
} from '../ledger/itemModel';
import type { SalvagePreview } from '../ledger/salvagePreview';

// The Salvage tab's list rows and words (EXTRACT C.4, the Salvage list of mock 9a): the non-equipped
// gear in the bag that the shared salvage rule (isSalvageableTemplate) accepts, in the bag sort, with
// the '{Slot} · {Type} · Tier {n}' line. The yield heading reads 'May return' on purpose: mock C.9's
// receive heading promises a return, and the owner refined the rule on 2026-10-07: "Salvage should never
// be a guaranteed return. Just a chance for some lesser amount of some components. Rare components have
// rarer chance to be returned." So the detail only ever speaks in chances (plan 50-40), and the two hint
// sentences below are the ones salvagePreview's confirm text uses, so the detail and the confirm agree.
// Pure: no Vue state.

export const SALVAGE_INTRO = 'Gear in your bag. Unequip an item to salvage it.';
export const SALVAGE_EMPTY = 'Nothing left to salvage.';
export const SALVAGE_YIELD_HEADING = 'May return';
export const SALVAGE_NOTHING = 'Nothing usable will come of it.';
export const SALVAGE_UNKNOWN = 'It may return some materials.';

export interface SalvageRow {
  instanceId: bigint;
  name: string;
  /** The rarity name color token. */
  color: string;
  icon: Component;
  /** '{Slot} · {Type} · Tier {n}', absent parts omitted. */
  typeLine: string;
}

function filled(value: string | null | undefined): value is string {
  return value !== null && value !== undefined && value !== '';
}

function capitalize(word: string): string {
  return word === '' ? '' : word.charAt(0).toUpperCase() + word.slice(1);
}

function typeLineOf(template: ItemTemplate): string {
  const parts: string[] = [];
  const slot = slotLabel(template.slot);
  if (slot !== '') parts.push(slot);
  const word = filled(template.weaponType) ? template.weaponType : template.armorType;
  if (filled(word) && word !== 'none') parts.push(capitalize(word));
  if (typeof template.tier === 'bigint' && template.tier > 0n) parts.push(`Tier ${template.tier}`);
  return parts.join(' · ');
}

/** The salvageable, non-equipped gear in the bag, in the bag sort. */
export function salvageRows(
  items: readonly ItemInstance[],
  templates: ReadonlyMap<bigint, ItemTemplate>,
): SalvageRow[] {
  const entries: { instance: ItemInstance; template: ItemTemplate }[] = [];
  for (const instance of items) {
    if (filled(instance.equippedSlot)) continue;
    const template = templates.get(instance.templateId);
    if (!template || !isSalvageableTemplate(template)) continue;
    entries.push({ instance, template });
  }
  entries.sort(compareBagItems);
  return entries.map(({ instance, template }) => ({
    instanceId: instance.id,
    name: itemName(instance, template),
    color: nameColor(itemRarity(instance, template), template.isJunk),
    icon: itemIcon(template),
    typeLine: typeLineOf(template),
  }));
}

/** '{n} items can be salvaged' ('1 item can be salvaged' for one). */
export function salvageCountText(count: number): string {
  return `${count} ${count === 1 ? 'item' : 'items'} can be salvaged`;
}

/**
 * The line that stands in for component rows: materials may come back while the recipe parts are not
 * known, nothing usable when the parts are known and no yield exists, and no line when a row is shown.
 */
export function salvageYieldHint(preview: Pick<SalvagePreview, 'knowable' | 'yields'>): string {
  if (!preview.knowable) return SALVAGE_UNKNOWN;
  return preview.yields.length === 0 ? SALVAGE_NOTHING : '';
}
