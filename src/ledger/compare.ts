import {
  addItemStats,
  emptyItemStats,
  sumItemStats,
  type ItemStatKey,
  type ItemStatTotals,
} from '@game-data/item_stats';
import type { ItemAffix, ItemInstance, ItemTemplate } from '../module_bindings/types';

// Item comparison and Gear totals (50-UI-SPEC "Comparison"): both sides use the shared per-instance
// stat sum (template stats plus every item_affix magnitude, including the implicit craft-quality
// affixes), the same math the server's examine uses, so the numbers can never drift. Pure.

export interface StatRowDef {
  key: ItemStatKey;
  label: string;
  abbr: string;
  /** Attributes, Health, Mana and Magic resist format as '+n'; Armor Class, Damage and DPS plain. */
  signed: boolean;
}

/** The fixed comparison order. */
export const STAT_ROWS: readonly StatRowDef[] = [
  { key: 'armorClassBonus', label: 'Armor Class', abbr: 'AC', signed: false },
  { key: 'weaponBaseDamage', label: 'Damage', abbr: 'DMG', signed: false },
  { key: 'weaponDps', label: 'DPS', abbr: 'DPS', signed: false },
  { key: 'strBonus', label: 'Strength', abbr: 'STR', signed: true },
  { key: 'dexBonus', label: 'Dexterity', abbr: 'DEX', signed: true },
  { key: 'intBonus', label: 'Intelligence', abbr: 'INT', signed: true },
  { key: 'wisBonus', label: 'Wisdom', abbr: 'WIS', signed: true },
  { key: 'chaBonus', label: 'Charisma', abbr: 'CHA', signed: true },
  { key: 'hpBonus', label: 'Health', abbr: 'HP', signed: true },
  { key: 'manaBonus', label: 'Mana', abbr: 'MP', signed: true },
  { key: 'magicResistanceBonus', label: 'Magic resist', abbr: 'MR', signed: true },
];

/** Only the affixes that belong to one instance. */
export function affixesFor(instanceId: bigint, affixes: readonly ItemAffix[]): ItemAffix[] {
  return affixes.filter((affix) => affix.itemInstanceId === instanceId);
}

/** Template stats plus that instance's own affixes; an affix of another instance is ignored. */
export function instanceStats(
  instance: Pick<ItemInstance, 'id'>,
  template: ItemTemplate | Readonly<Record<string, unknown>>,
  affixes: readonly ItemAffix[],
): ItemStatTotals {
  return sumItemStats(template as Readonly<Record<string, unknown>>, affixesFor(instance.id, affixes));
}

export interface CompareRow {
  key: ItemStatKey;
  label: string;
  abbr: string;
  /** The selected item's total. */
  value: bigint;
  valueText: string;
  /** Selected minus equipped (the full value when nothing is equipped). */
  delta: bigint;
  marker: '' | 'up' | 'down';
  /** The glyph (U+25B2 or U+25BC) plus the absolute delta; empty when there is no marker. */
  markerText: string;
  /** Screen-reader text, for example ', 3 more than equipped'; empty when there is no marker. */
  srText: string;
}

function formatValue(value: bigint, signed: boolean): string {
  if (!signed) return String(value);
  return value < 0n ? String(value) : `+${value}`;
}

/**
 * The union of non-zero stats of the selected item and the item equipped in the same slot, in the
 * fixed order. withDelta is false for equipped and non-gear items: no markers then.
 */
export function compareRows(
  selected: ItemStatTotals,
  equipped: ItemStatTotals | null,
  options: { withDelta: boolean },
): CompareRow[] {
  const rows: CompareRow[] = [];
  for (const def of STAT_ROWS) {
    const value = selected[def.key];
    const other = equipped ? equipped[def.key] : 0n;
    if (value === 0n && other === 0n) continue;
    const delta = value - other;
    let marker: CompareRow['marker'] = '';
    let markerText = '';
    let srText = '';
    if (options.withDelta && delta !== 0n) {
      const size = delta < 0n ? -delta : delta;
      if (delta > 0n) {
        marker = 'up';
        markerText = `▲${size}`;
        srText = `, ${size} more than equipped`;
      } else {
        marker = 'down';
        markerText = `▼${size}`;
        srText = `, ${size} less than equipped`;
      }
    }
    rows.push({
      key: def.key,
      label: def.label,
      abbr: def.abbr,
      value,
      valueText: formatValue(value, def.signed),
      delta,
      marker,
      markerText,
      srText,
    });
  }
  return rows;
}

/** Sum of instanceStats over the equipped instances (instances without an equipped slot are ignored). */
export function gearStatTotals(
  items: readonly ItemInstance[],
  templates: ReadonlyMap<bigint, ItemTemplate>,
  affixes: readonly ItemAffix[],
): ItemStatTotals {
  let totals = emptyItemStats();
  for (const item of items) {
    if (item.equippedSlot === undefined || item.equippedSlot === null || item.equippedSlot === '') {
      continue;
    }
    const template = templates.get(item.templateId);
    if (!template) continue;
    totals = addItemStats(totals, instanceStats(item, template, affixes));
  }
  return totals;
}
