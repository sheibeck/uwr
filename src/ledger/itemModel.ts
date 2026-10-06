import type { Component } from 'vue';
import {
  PhBelt,
  PhBoot,
  PhBread,
  PhCoatHanger,
  PhCube,
  PhDiamond,
  PhEar,
  PhFlask,
  PhHandFist,
  PhHardHat,
  PhKey,
  PhKnife,
  PhMagicWand,
  PhPackage,
  PhPants,
  PhScroll,
  PhShield,
  PhSword,
  PhTShirt,
  PhWatch,
} from '@phosphor-icons/vue';
import { EQUIPMENT_SLOTS } from '@game-data/mechanical_vocabulary';
import { isQuestItemTemplate, isRecipeScrollName } from '@game-data/item_rules';
import type { ItemInstance, ItemTemplate } from '../module_bindings/types';

// Item naming, rarity colors, category, icon, slot labels and the bag sort (50-UI-SPEC "Rarity" and
// "Item naming, category and icon"). Pure: no reactivity, no DOM. Colors are var(--...) strings of
// existing tokens only. Every screen names, colors, categorizes and sorts an item through here, so
// the Inventory, Vendor and Crafting screens never disagree.

export type ItemInstanceLike = Pick<ItemInstance, 'displayName' | 'qualityTier'> &
  Partial<Pick<ItemInstance, 'id'>>;
export type ItemTemplateLike = Pick<ItemTemplate, 'name' | 'slot' | 'isJunk' | 'rarity'> &
  Partial<Pick<ItemTemplate, 'weaponType' | 'wellFedDurationMicros'>>;

export type ItemCategory = 'quest' | 'junk' | 'gear' | 'food' | 'recipe' | 'material' | 'other';

export const RARITY_ORDER = ['common', 'uncommon', 'rare', 'epic', 'legendary'] as const;
export type Rarity = (typeof RARITY_ORDER)[number];

const RARITY_TOKENS: Record<Rarity, string> = {
  common: 'var(--color-rarity-common)',
  uncommon: 'var(--color-rarity-uncommon)',
  rare: 'var(--color-rarity-rare)',
  epic: 'var(--color-rarity-epic)',
  legendary: 'var(--color-rarity-legendary)',
};

const JUNK_NAME_COLOR = 'var(--color-neutral-400)';
const JUNK_RING_COLOR = 'var(--color-neutral-700)';
const COMMON_RING_REST = 'var(--color-neutral-600)';

function filled(value: string | null | undefined): value is string {
  return value !== null && value !== undefined && value !== '';
}

/** instance.displayName when set, else the template name. */
export function itemName(
  instance: Pick<ItemInstance, 'displayName'> | null | undefined,
  template: Pick<ItemTemplate, 'name'> | null | undefined,
): string {
  if (instance && filled(instance.displayName)) return instance.displayName;
  return template ? template.name : '';
}

/** instance.qualityTier, else template.rarity, lowercased; unknown or missing is 'common' (Pitfall 8). */
export function itemRarity(
  instance: Pick<ItemInstance, 'qualityTier'> | null | undefined,
  template: Pick<ItemTemplate, 'rarity'> | null | undefined,
): Rarity {
  const raw = instance && filled(instance.qualityTier) ? instance.qualityTier : template?.rarity;
  const lower = typeof raw === 'string' ? raw.trim().toLowerCase() : '';
  return (RARITY_ORDER as readonly string[]).indexOf(lower) !== -1 ? (lower as Rarity) : 'common';
}

/** The rarity word with a capital, for kickers and aria labels. */
export function rarityLabel(rarity: string): string {
  return rarity === '' ? '' : rarity.charAt(0).toUpperCase() + rarity.slice(1);
}

/** The rarity token; anything unknown is the common token. */
export function rarityColor(rarity: string): string {
  const key = typeof rarity === 'string' ? rarity.toLowerCase() : '';
  return (RARITY_ORDER as readonly string[]).indexOf(key) !== -1
    ? RARITY_TOKENS[key as Rarity]
    : RARITY_TOKENS.common;
}

/** Item name color: the rarity token, neutral for junk. */
export function nameColor(rarity: string, junk: boolean): string {
  return junk ? JUNK_NAME_COLOR : rarityColor(rarity);
}

/** Tile and slot ring color: common is dim at rest and bright when selected; junk is dim. */
export function ringColor(
  rarity: string,
  options: { junk?: boolean; selected?: boolean } = {},
): string {
  if (options.junk) return JUNK_RING_COLOR;
  const key = typeof rarity === 'string' ? rarity.toLowerCase() : '';
  if (key === 'common' || (RARITY_ORDER as readonly string[]).indexOf(key) === -1) {
    return options.selected ? RARITY_TOKENS.common : COMMON_RING_REST;
  }
  return rarityColor(key);
}

function isGearSlot(slot: string): boolean {
  return (EQUIPMENT_SLOTS as readonly string[]).indexOf(slot) !== -1;
}

function isWellFed(template: ItemTemplateLike): boolean {
  const value = template.wellFedDurationMicros;
  return typeof value === 'bigint' && value > 0n;
}

/** The first matching row of the UI-SPEC category table. */
export function itemCategory(template: ItemTemplateLike): ItemCategory {
  if (isQuestItemTemplate(template)) return 'quest';
  if (template.isJunk) return 'junk';
  if (isGearSlot(template.slot)) return 'gear';
  if (template.slot === 'food' || template.slot === 'consumable' || isWellFed(template)) {
    return 'food';
  }
  if (isRecipeScrollName(template.name)) return 'recipe';
  if (template.slot === 'material' || template.slot === 'resource') return 'material';
  return 'other';
}

/** Kicker word for non-gear items; empty for gear and other (gear uses the slot label). */
export function categoryWord(template: ItemTemplateLike): string {
  switch (itemCategory(template)) {
    case 'material':
      return 'Material';
    case 'food':
      return template.slot === 'consumable' && !isWellFed(template) ? 'Consumable' : 'Food';
    case 'recipe':
      return 'Recipe';
    case 'quest':
      return 'Quest item';
    case 'junk':
      return 'Junk';
    default:
      return '';
  }
}

/** The icon of an item, by the UI-SPEC icon table. */
export function itemIcon(template: ItemTemplateLike): Component {
  const category = itemCategory(template);
  if (category === 'gear') {
    switch (template.slot) {
      case 'mainHand': {
        const type = (template.weaponType ?? '').toLowerCase();
        if (type === 'staff' || type === 'wand') return PhMagicWand;
        if (type === 'dagger' || type === 'rapier') return PhKnife;
        return PhSword;
      }
      case 'offHand':
        return PhShield;
      case 'head':
        return PhHardHat;
      case 'chest':
        return PhTShirt;
      case 'legs':
        return PhPants;
      case 'boots':
        return PhBoot;
      case 'hands':
        return PhHandFist;
      case 'wrists':
        return PhWatch;
      case 'belt':
        return PhBelt;
      case 'neck':
        return PhDiamond;
      case 'earrings':
        return PhEar;
      case 'cloak':
        return PhCoatHanger;
      default:
        return PhPackage;
    }
  }
  if (category === 'material') return PhCube;
  if (category === 'food') {
    return template.slot === 'consumable' && !isWellFed(template) ? PhFlask : PhBread;
  }
  if (category === 'recipe') return PhScroll;
  if (category === 'quest') return PhKey;
  return PhPackage;
}

export const SLOT_LABELS: Readonly<Record<string, string>> = {
  head: 'Head',
  neck: 'Neck',
  earrings: 'Earrings',
  cloak: 'Cloak',
  chest: 'Chest',
  wrists: 'Wrists',
  hands: 'Hands',
  belt: 'Belt',
  legs: 'Legs',
  boots: 'Boots',
  mainHand: 'Main hand',
  offHand: 'Off hand',
};

/** The display order of the equipment slot grid (slot keys). */
export const EQUIP_SLOT_ORDER: readonly string[] = [
  'head',
  'neck',
  'earrings',
  'cloak',
  'chest',
  'wrists',
  'hands',
  'belt',
  'legs',
  'boots',
  'mainHand',
  'offHand',
];

/** The slot word, or an empty string for a key that is not an equipment slot. */
export function slotLabel(slot: string): string {
  return EQUIP_SLOT_ORDER.indexOf(slot) !== -1 ? SLOT_LABELS[slot] : '';
}

const CATEGORY_SORT: Readonly<Record<ItemCategory, number>> = {
  gear: 0,
  material: 1,
  food: 2,
  recipe: 3,
  other: 4,
  quest: 5,
  junk: 6,
};

export interface BagEntry {
  instance: ItemInstance;
  template: ItemTemplate;
}

/**
 * Backpack sort: category (Gear, Material, Food, Recipe, Other, Quest, Junk), rarity high to low,
 * name A to Z, then id ascending as the last tie-break only (ids are not ordered by recency).
 */
export function compareBagItems(a: BagEntry, b: BagEntry): number {
  const category = CATEGORY_SORT[itemCategory(a.template)] - CATEGORY_SORT[itemCategory(b.template)];
  if (category !== 0) return category;
  const rarity =
    (RARITY_ORDER as readonly string[]).indexOf(itemRarity(b.instance, b.template)) -
    (RARITY_ORDER as readonly string[]).indexOf(itemRarity(a.instance, a.template));
  if (rarity !== 0) return rarity;
  const nameA = itemName(a.instance, a.template).toLowerCase();
  const nameB = itemName(b.instance, b.template).toLowerCase();
  if (nameA !== nameB) return nameA < nameB ? -1 : 1;
  return a.instance.id < b.instance.id ? -1 : a.instance.id > b.instance.id ? 1 : 0;
}
