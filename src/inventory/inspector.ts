import { canEquipItem } from '@game-data/item_usability';
import {
  isQuestItemTemplate,
  isRecipeScrollName,
  isSalvageableTemplate,
  isUsableItemName,
} from '@game-data/item_rules';
import { perkBonusByField } from '@game-data/perk_rules';
import { sellPayout } from '@game-data/vendor_pricing';
import type { ItemAffix, ItemInstance, ItemTemplate } from '../module_bindings/types';
import { STAT_ROWS, affixesFor, compareRows, instanceStats } from '../ledger/compare';
import type { CompareRow } from '../ledger/compare';
import {
  categoryWord,
  itemCategory,
  itemName,
  itemRarity,
  nameColor,
  rarityLabel,
  slotLabel,
} from '../ledger/itemModel';
import type { SlotUsage } from './backpack';

// The inventory inspector view model (50-UI-SPEC "Inspector", "Comparison", "Actions per item",
// "Salvage confirmation"). Everything the card and the dock show is derived here from the selected
// instance and the server's shared rules (equip rule, item kinds, sell payout, perk percent), so the
// component only draws. Pure: no Vue.

export interface InspectorCharacter {
  level: bigint;
  className: string;
  weaponProficiencies?: string | null;
  armorProficiencies?: string | null;
  vendorSellMod: bigint;
}

export interface InspectorInput {
  instance: ItemInstance;
  templates: ReadonlyMap<bigint, ItemTemplate>;
  affixes: readonly ItemAffix[];
  /** Every owned instance; the same-slot equipped item is found here. */
  items: readonly ItemInstance[];
  character: InspectorCharacter;
  /** perkKey of every renown perk the character owns. */
  perkKeys: readonly string[];
  usage: SlotUsage;
}

export interface MetaPart {
  text: string;
  tone: 'normal' | 'short' | 'craft';
  /** The lowercase craft token key ('exquisite') when tone is 'craft'. */
  craftQuality?: string;
}

export type PrimaryKind = 'equip' | 'unequip' | 'use' | 'learn';

export interface InspectorPrimary {
  kind: PrimaryKind;
  label: string;
  mobileLabel: string;
  available: boolean;
  reason: string | null;
}

export interface InspectorSalvage {
  visible: boolean;
  needsConfirm: boolean;
  available: boolean;
  reason: string | null;
}

export interface InspectorFooter {
  kind: 'sell' | 'quest' | 'junk';
  text: string;
  amount: bigint | null;
}

export interface InspectorView {
  instanceId: bigint;
  rarity: string;
  rarityLabel: string;
  nameColor: string;
  name: string;
  kicker: string;
  /** The slot label (gear) or the category word, as the kicker ends. */
  typeWord: string;
  equipped: boolean;
  equippedSlot: string | null;
  gear: boolean;
  metaParts: MetaPart[];
  caption: string | null;
  rows: CompareRow[];
  affixRows: { name: string; text: string }[];
  flavor: string | null;
  primary: InspectorPrimary | null;
  salvage: InspectorSalvage;
  footer: InspectorFooter;
}

const BACKPACK_FULL = 'Your backpack is full.';

function filled(value: string | null | undefined): value is string {
  return value !== null && value !== undefined && value !== '';
}

function capitalize(word: string): string {
  return word === '' ? '' : word.charAt(0).toUpperCase() + word.slice(1);
}

function equippedSlotOf(instance: ItemInstance): string | null {
  return filled(instance.equippedSlot) ? instance.equippedSlot : null;
}

function typeWordOf(template: ItemTemplate): string {
  if (filled(template.weaponType)) return template.weaponType;
  if (filled(template.armorType)) return template.armorType;
  return '';
}

function metaPartsOf(
  instance: ItemInstance,
  template: ItemTemplate,
  characterLevel: bigint,
): MetaPart[] {
  const parts: MetaPart[] = [];
  const type = typeWordOf(template);
  if (type !== '') parts.push({ text: capitalize(type), tone: 'normal' });
  const required = typeof template.requiredLevel === 'bigint' ? template.requiredLevel : 0n;
  if (required > 1n) {
    parts.push({
      text: `Requires Lv ${required}`,
      tone: required > characterLevel ? 'short' : 'normal',
    });
  }
  if (filled(instance.craftQuality)) {
    const key = instance.craftQuality.toLowerCase();
    parts.push({ text: `${capitalize(key)} quality`, tone: 'craft', craftQuality: key });
  }
  return parts;
}

function affixRowsOf(
  instance: ItemInstance,
  affixes: readonly ItemAffix[],
): { name: string; text: string }[] {
  return affixesFor(instance.id, affixes).map((affix) => {
    const def = STAT_ROWS.find((row) => row.key === affix.statKey);
    const abbr = def ? def.abbr : affix.statKey;
    const amount = affix.magnitude < 0n ? String(affix.magnitude) : `+${affix.magnitude}`;
    return {
      name: affix.affixType === 'implicit' ? 'Quality' : affix.affixName,
      text: `${amount} ${abbr}`,
    };
  });
}

function equipPrimary(template: ItemTemplate, character: InspectorCharacter): InspectorPrimary {
  const check = canEquipItem(template, character);
  let reason: string | null = null;
  if (!check.ok) {
    if (check.reason === 'weapon' || check.reason === 'armor' || check.reason === 'legacyWeapon' || check.reason === 'legacyClass') {
      const type = typeWordOf(template).toLowerCase();
      reason = `Your class can't use ${type === '' ? 'this item' : type}.`;
    } else {
      reason = check.message;
    }
  }
  return {
    kind: 'equip',
    label: 'Equip item',
    mobileLabel: 'Equip',
    available: check.ok,
    reason,
  };
}

/**
 * The card's content for one selected instance, or null while its template has not arrived.
 * Bag gear is compared with the item equipped in the same slot; equipped and non-gear items carry
 * no deltas.
 */
export function inspectorView(input: InspectorInput): InspectorView | null {
  const { instance, templates, affixes, items, character, perkKeys, usage } = input;
  const template = templates.get(instance.templateId);
  if (!template) return null;

  const category = itemCategory(template);
  const gear = category === 'gear';
  const slot = equippedSlotOf(instance);
  const equipped = slot !== null;
  const rarity = itemRarity(instance, template);
  const label = rarityLabel(rarity);
  const word = gear ? slotLabel(template.slot) : categoryWord(template);

  const kickerParts = [label];
  if (typeof template.tier === 'bigint' && template.tier > 0n) kickerParts.push(`Tier ${template.tier}`);
  if (word !== '') kickerParts.push(word);
  if (equipped) kickerParts.push('Equipped');

  const bagGear = gear && !equipped;
  let comparedWith: ItemInstance | null = null;
  if (bagGear) {
    for (const other of items) {
      if (other.id !== instance.id && other.equippedSlot === template.slot) {
        comparedWith = other;
        break;
      }
    }
  }
  const selectedStats = instanceStats(instance, template, affixes);
  const comparedTemplate = comparedWith ? templates.get(comparedWith.templateId) : undefined;
  const comparedStats =
    comparedWith && comparedTemplate ? instanceStats(comparedWith, comparedTemplate, affixes) : null;

  let caption: string | null = null;
  if (bagGear) {
    caption =
      comparedWith && comparedTemplate
        ? `Compared with ${itemName(comparedWith, comparedTemplate)}`
        : `Nothing equipped in ${slotLabel(template.slot)}`;
  }

  let primary: InspectorPrimary | null = null;
  if (gear && !equipped) {
    primary = equipPrimary(template, character);
  } else if (gear && equipped) {
    primary = {
      kind: 'unequip',
      label: 'Unequip item',
      mobileLabel: 'Unequip',
      available: !usage.full,
      reason: usage.full ? BACKPACK_FULL : null,
    };
  } else if (isRecipeScrollName(template.name)) {
    primary = {
      kind: 'learn',
      label: 'Learn recipe',
      mobileLabel: 'Learn recipe',
      available: true,
      reason: null,
    };
  } else if (category === 'food' && isUsableItemName(template.name)) {
    primary = { kind: 'use', label: 'Use item', mobileLabel: 'Use', available: true, reason: null };
  }

  const salvageVisible = isSalvageableTemplate(template);
  const salvageBlocked = salvageVisible && equipped && usage.full;
  const salvage: InspectorSalvage = {
    visible: salvageVisible,
    needsConfirm: salvageVisible && (rarity !== 'common' || equipped),
    available: !salvageBlocked,
    reason: salvageBlocked ? BACKPACK_FULL : null,
  };

  let footer: InspectorFooter;
  if (isQuestItemTemplate(template)) {
    footer = { kind: 'quest', text: "Can't be sold", amount: null };
  } else {
    const perkPct = perkBonusByField(perkKeys, 'vendorSellBonus', character.level);
    const amount = sellPayout(template.vendorValue, instance.quantity, perkPct, character.vendorSellMod);
    footer = template.isJunk
      ? {
          kind: 'junk',
          text: `Junk. Sells for ${amount.toLocaleString('en-US')} at a vendor.`,
          amount,
        }
      : { kind: 'sell', text: 'Sells for', amount };
  }

  return {
    instanceId: instance.id,
    rarity,
    rarityLabel: label,
    nameColor: nameColor(rarity, template.isJunk),
    name: itemName(instance, template),
    kicker: kickerParts.join(' · '),
    typeWord: word,
    equipped,
    equippedSlot: slot,
    gear,
    metaParts: metaPartsOf(instance, template, character.level),
    caption,
    rows: compareRows(selectedStats, comparedStats, { withDelta: bagGear }),
    affixRows: affixRowsOf(instance, affixes),
    flavor: filled(template.description) && template.description.trim() !== '' ? template.description : null,
    primary,
    salvage,
    footer,
  };
}

/** The confirmation prompt for Salvage (UI-SPEC "Salvage confirmation"). */
export function salvagePrompt(name: string, equipped: boolean): string {
  return equipped
    ? `Salvage ${name}? It's unequipped first, then broken down into materials. This can't be undone.`
    : `Salvage ${name}? It breaks down into materials. This can't be undone.`;
}

/** The mobile dock summary: 'Rare chest · AC 14 ▲3 · INT +3 ▲1', at most four stats. */
export function dockSummary(view: Pick<InspectorView, 'rarityLabel' | 'typeWord' | 'rows'>): string {
  const head = view.typeWord === '' ? view.rarityLabel : `${view.rarityLabel} ${view.typeWord.toLowerCase()}`;
  const stats = view.rows.slice(0, 4).map((row) => {
    const delta = row.markerText === '' ? '' : ` ${row.markerText}`;
    return `${row.abbr} ${row.valueText}${delta}`;
  });
  return [head, ...stats].join(' · ');
}
