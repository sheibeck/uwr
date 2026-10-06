// Small item-kind rules shared by the server and the client: which template is a quest item,
// which names use_item accepts and which of those have an effect, what salvage_item accepts and
// what counts as a recipe scroll. Callers: the sell helper (quest refusal), use_item (accepted
// names) and the client inventory and vendor models.
// Honest note: no generated item uses the quest slot yet. The quest refusal is a guard for the
// day one does, so selling can never destroy a quest item.
// Imports only ./crafting_rules and ./mechanical_vocabulary so the client can reach it through
// @game-data. Browser-safe, ES2020 only, never throws.
import { itemKeyFromName } from './crafting_rules';
import { EQUIPMENT_SLOTS } from './mechanical_vocabulary';

/** A quest item is a template in the 'quest' slot. */
export function isQuestItemTemplate(t: { slot?: string | null }): boolean {
  return !!t && t.slot === 'quest';
}

/** The refusal line every sell path writes for a quest item. */
export const QUEST_ITEM_SALE_REFUSAL = "Quest items can't be sold.";

/** Every item key use_item accepts (anything else gets 'Item cannot be used'). */
export const USE_ITEM_KEYS = [
  'bandage',
  'basic_poultice',
  'travelers_tea',
  'simple_rations',
  'torch',
  'whetstone',
  'kindling_bundle',
  'rough_rope',
  'charcoal',
  'crude_poison',
] as const;

/** The subset of USE_ITEM_KEYS that has an effect today; the client offers Use only for these. */
export const USABLE_ITEM_KEYS = ['bandage', 'basic_poultice', 'travelers_tea', 'simple_rations'] as const;

/** True when a template name maps to one of the effectful use_item keys. */
export function isUsableItemName(name: string): boolean {
  return (USABLE_ITEM_KEYS as readonly string[]).indexOf(itemKeyFromName(name)) !== -1;
}

/** salvage_item's rule: not junk, and in one of the 12 equipment slots. */
export function isSalvageableTemplate(t: { slot?: string | null; isJunk?: boolean | null }): boolean {
  if (!t || t.isJunk) return false;
  return typeof t.slot === 'string' && (EQUIPMENT_SLOTS as readonly string[]).indexOf(t.slot) !== -1;
}

/** learn_recipe_scroll accepts only templates whose name starts with 'Scroll:'. */
export function isRecipeScrollName(name: string): boolean {
  return typeof name === 'string' && name.startsWith('Scroll:');
}
