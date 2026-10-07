import type { ItemStatKey, ItemStatTotals } from '@game-data/item_stats';
import { isQuestItemTemplate } from '@game-data/item_rules';
import { perkBonusByField } from '@game-data/perk_rules';
import { FOOD_BUFF_LABELS } from '@game-data/recipe_rules';
import { sellPayout } from '@game-data/vendor_pricing';
import type { ItemTemplate } from '../module_bindings/types';
import { STAT_ROWS } from './compare';
import { categoryWord, itemCategory, slotLabel } from './itemModel';

// What an item is and does, for the Creates card (plans 50-35 and 50-38) and the result card. Every
// rule is the server's shared data through @game-data: the stat sum and order, the food labels and
// the sell payout. Names and descriptions stay plain strings (the components render text nodes).
// Pure: no Vue.

export interface ItemStatEntry {
  key: ItemStatKey;
  label: string;
  abbr: string;
  /** '+n' for attributes, Health, Mana and Magic resist; plain 'n' for Armor Class, Damage and DPS. */
  text: string;
}

export interface DetailPart {
  text: string;
  /** 'short' marks a level requirement the character does not meet. */
  tone: 'normal' | 'short';
}

export interface ItemDetails {
  typeParts: DetailPart[];
  stats: ItemStatEntry[];
  /** The food effect sentence, or null for an item that gives none. */
  effect: string | null;
  /** 'Stackable · Sells for 1,234', 'Sells for 12' or "Can't be sold". */
  meta: string;
  description: string | null;
}

function filled(value: string | null | undefined): value is string {
  return value !== null && value !== undefined && value !== '';
}

function capitalize(word: string): string {
  return word === '' ? '' : word.charAt(0).toUpperCase() + word.slice(1);
}

/** The non-zero stats in the fixed comparison order. */
export function itemStatEntries(stats: ItemStatTotals): ItemStatEntry[] {
  const entries: ItemStatEntry[] = [];
  for (const def of STAT_ROWS) {
    const value = stats[def.key];
    if (value === 0n) continue;
    const text = def.signed && value > 0n ? `+${value}` : String(value);
    entries.push({ key: def.key, label: def.label, abbr: def.abbr, text });
  }
  return entries;
}

/**
 * What one unit sells for at a vendor with the character's Charisma and the renown sell perks,
 * the same math the inspector footer uses; null for a quest item.
 */
export function unitSellValue(
  template: ItemTemplate,
  character: { level: bigint; vendorSellMod: bigint },
  perkKeys: readonly string[],
): bigint | null {
  if (isQuestItemTemplate(template)) return null;
  const perkPct = perkBonusByField(perkKeys, 'vendorSellBonus', character.level);
  return sellPayout(template.vendorValue, 1n, perkPct, character.vendorSellMod);
}

/** 'Eat to be well fed: +2 strength.' for a well-fed food, else null. */
export function foodEffect(template: ItemTemplate): string | null {
  const duration = template.wellFedDurationMicros;
  if (typeof duration !== 'bigint' || duration <= 0n) return null;
  const type = template.wellFedBuffType;
  const label = Object.prototype.hasOwnProperty.call(FOOD_BUFF_LABELS, type)
    ? FOOD_BUFF_LABELS[type]
    : type;
  return `Eat to be well fed: +${template.wellFedBuffMagnitude} ${label}.`;
}

function typeWordOf(template: ItemTemplate): string {
  const word = filled(template.weaponType) ? template.weaponType : template.armorType;
  return filled(word) && word !== 'none' ? word : '';
}

function typePartsOf(template: ItemTemplate, characterLevel: bigint): DetailPart[] {
  if (itemCategory(template) !== 'gear') {
    const word = categoryWord(template);
    return word === '' ? [] : [{ text: word, tone: 'normal' }];
  }
  const parts: DetailPart[] = [];
  const slot = slotLabel(template.slot);
  if (slot !== '') parts.push({ text: slot, tone: 'normal' });
  const type = typeWordOf(template);
  if (type !== '') parts.push({ text: capitalize(type), tone: 'normal' });
  if (typeof template.tier === 'bigint' && template.tier > 0n) {
    parts.push({ text: `Tier ${template.tier}`, tone: 'normal' });
  }
  const required = typeof template.requiredLevel === 'bigint' ? template.requiredLevel : 0n;
  if (required > 1n) {
    parts.push({
      text: `Requires Lv ${required}`,
      tone: required > characterLevel ? 'short' : 'normal',
    });
  }
  return parts;
}

export function itemDetails(input: {
  template: ItemTemplate;
  stats: ItemStatTotals;
  characterLevel: bigint;
  /** What one unit sells for, or null when it cannot be sold. */
  sellValue: bigint | null;
}): ItemDetails {
  const { template, stats, characterLevel, sellValue } = input;
  const sells = sellValue === null ? "Can't be sold" : `Sells for ${sellValue.toLocaleString('en-US')}`;
  const description = filled(template.description) ? template.description.trim() : '';
  return {
    typeParts: typePartsOf(template, characterLevel),
    stats: itemStatEntries(stats),
    effect: foodEffect(template),
    meta: template.stackable ? `Stackable · ${sells}` : sells,
    description: description === '' ? null : description,
  };
}
