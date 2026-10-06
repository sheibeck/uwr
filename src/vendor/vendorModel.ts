import { EQUIPMENT_SLOTS } from '@game-data/mechanical_vocabulary';
import { hasBackpackSpace } from '@game-data/inventory_rules';
import { canEquipItem } from '@game-data/item_usability';
import { isQuestItemTemplate } from '@game-data/item_rules';
import { perkBonusByField } from '@game-data/perk_rules';
import { buyPrice, rapportPercents, sellPayout } from '@game-data/vendor_pricing';
import type {
  ItemInstance,
  ItemTemplate,
  Npc,
  VendorBuyback,
  VendorInventory,
} from '../module_bindings/types';
import type { ScreenArgs } from '../game/context';
import {
  categoryWord,
  itemCategory,
  itemName,
  itemRarity,
  nameColor,
  rarityColor,
  slotLabel,
} from '../ledger/itemModel';
import type { ItemCategory } from '../ledger/itemModel';

// The vendor model (50-UI-SPEC "Vendor Contract"): which vendor, the For sale rows with the server's
// final prices and the usability and reason rules, the sell rows and values, the Sell all junk
// preview, the rapport line and the Just sold card state. Every price, payout, percent and rule is
// the server's own shared helper (@game-data); nothing is copied and no price arithmetic happens
// here. Names stay plain strings (no escaping, no HTML): the components render them as text nodes.
// Pure: no Vue.

/** The character fields the vendor screen reads. */
export interface VendorCharacter {
  level: bigint;
  className: string;
  weaponProficiencies?: string | null;
  armorProficiencies?: string | null;
  gold: bigint;
  locationId?: bigint;
  vendorBuyMod: bigint;
  vendorSellMod: bigint;
}

/** What the screen remembers about the chosen vendor, so a vendor that left stays on screen. */
export interface VendorSnapshot {
  id: bigint;
  name: string;
  greeting: string;
  factionId: bigint | null;
  locationId: bigint;
}

export type VendorResolution =
  | { kind: 'vendor'; npc: Npc }
  | { kind: 'gone'; npcId: bigint; name: string }
  | { kind: 'list'; vendors: Npc[] }
  | { kind: 'empty' };

const BACKPACK_FULL = 'Your backpack is full.';

function isVendorNpc(npc: Npc): boolean {
  return npc.npcType === 'vendor';
}

/**
 * Which vendor the screen shows (UI-SPEC "Which vendor"): the screen arguments' NPC when it is a
 * vendor here; an argument NPC that is not here is 'gone' with the name the caller passed; with no
 * argument NPC one vendor here is used, several are listed, none is empty. Non-vendor NPCs never
 * count.
 */
export function resolveVendor(args: ScreenArgs | null, npcsHere: readonly Npc[]): VendorResolution {
  const vendors = npcsHere.filter(isVendorNpc);
  if (args && args.npcId !== undefined) {
    const found = vendors.find((npc) => npc.id === args.npcId);
    if (found) return { kind: 'vendor', npc: found };
    return { kind: 'gone', npcId: args.npcId, name: args.npcName ?? '' };
  }
  if (vendors.length === 1) return { kind: 'vendor', npc: vendors[0] };
  if (vendors.length > 1) return { kind: 'list', vendors };
  return { kind: 'empty' };
}

/** True once the snapshot's NPC is no longer among the NPCs here (the character traveled). */
export function vendorLeft(snapshot: Pick<VendorSnapshot, 'id'>, npcsHere: readonly Npc[]): boolean {
  return !npcsHere.some((npc) => npc.id === snapshot.id);
}

function grouped(amount: bigint): string {
  return amount.toLocaleString('en-US');
}

function capitalize(word: string): string {
  return word === '' ? '' : word.charAt(0).toUpperCase() + word.slice(1);
}

function filled(value: string | null | undefined): value is string {
  return value !== null && value !== undefined && value !== '';
}

function isEquipped(instance: ItemInstance): boolean {
  return filled(instance.equippedSlot);
}

/** The renown percents the server applies to this character's buy and sell prices. */
function perkPercents(perkKeys: readonly string[], level: bigint): { buy: number; sell: number } {
  return {
    buy: perkBonusByField(perkKeys, 'vendorBuyDiscount', level),
    sell: perkBonusByField(perkKeys, 'vendorSellBonus', level),
  };
}

// ---------------------------------------------------------------------------------------------
// For sale

export type ForSaleFilterId = 'all' | 'usable';

export const FOR_SALE_FILTERS: ReadonlyArray<{ id: ForSaleFilterId; label: string }> = [
  { id: 'all', label: 'All' },
  { id: 'usable', label: 'Usable by you' },
];

export interface ForSaleInput {
  stock: readonly VendorInventory[];
  templates: ReadonlyMap<bigint, ItemTemplate>;
  /** Every owned instance; the bag space check reads it. */
  items: readonly ItemInstance[];
  character: VendorCharacter;
  perkKeys: readonly string[];
  filter: ForSaleFilterId;
}

export type PriceTone = 'default' | 'muted' | 'short';

export interface ForSaleRow {
  /** The vendor_inventory row id. */
  key: bigint;
  templateId: bigint;
  name: string;
  rarity: string;
  /** The rarity token from the template rarity (never the listing's quality). */
  color: string;
  /** 'Tier 2 · Leather' for gear, else the category word; usability reasons follow ' · '. */
  subLine: string;
  /** The slot word, or '—'. */
  slotText: string;
  /** The server's final price (renown discount, then Charisma, minimum 1). */
  price: bigint;
  priceTone: PriceTone;
  /** False only when the class rule fails; level-short rows stay usable. */
  usable: boolean;
  levelShort: boolean;
  /** Set when Buy is unavailable: 'Not enough gold' or 'Backpack full'. */
  reason: string | null;
  ariaLabel: string;
}

const FOR_SALE_GROUP: Readonly<Record<ItemCategory, number>> = {
  gear: 0,
  food: 1,
  recipe: 2,
  material: 3,
  other: 4,
  quest: 4,
  junk: 4,
};

function gearSlotIndex(slot: string): number {
  const index = (EQUIPMENT_SLOTS as readonly string[]).indexOf(slot);
  return index === -1 ? EQUIPMENT_SLOTS.length : index;
}

function typeWordOf(template: ItemTemplate): string {
  if (filled(template.weaponType)) return capitalize(template.weaponType);
  if (filled(template.armorType)) return capitalize(template.armorType);
  return '';
}

function subLineBase(template: ItemTemplate, category: ItemCategory): string {
  if (category === 'gear') {
    const tier = typeof template.tier === 'bigint' && template.tier > 0n ? `Tier ${template.tier}` : '';
    const type = typeWordOf(template);
    const parts = [tier, type].filter((part) => part !== '');
    return parts.length > 0 ? parts.join(' · ') : 'Gear';
  }
  const word = categoryWord(template);
  return word === '' ? 'Item' : word;
}

/**
 * The For sale rows (UI-SPEC "For sale"). Order: Gear in equipment slot order, then Food, Recipe,
 * Material and Other; within a group by tier, then name. A row whose template has not arrived is
 * left out until it does. Under 'usable' only class-unusable rows are hidden; level-short rows
 * stay with their 'Requires Lv n' reason.
 */
export function forSaleRows(input: ForSaleInput): ForSaleRow[] {
  const { stock, templates, items, character, perkKeys, filter } = input;
  const perk = perkPercents(perkKeys, character.level);
  const built: Array<{ row: ForSaleRow; group: number; slot: number; tier: bigint }> = [];

  for (const listing of stock) {
    const template = templates.get(listing.itemTemplateId);
    if (!template) continue;
    const category = itemCategory(template);
    const gear = category === 'gear';

    let usable = true;
    let levelShort = false;
    let requiredLevel = 0n;
    if (gear) {
      const check = canEquipItem(template, character);
      levelShort = check.levelShort;
      requiredLevel = check.requiredLevel;
      usable = check.ok || check.reason === 'stackable' || check.reason === 'slot';
    }
    if (filter === 'usable' && !usable) continue;

    let subLine = subLineBase(template, category);
    if (!usable) subLine += ' · Not your class';
    if (levelShort) subLine += ` · Requires Lv ${requiredLevel}`;

    const price = buyPrice(listing.price, perk.buy, character.vendorBuyMod);
    let reason: string | null = null;
    if (character.gold < price) reason = 'Not enough gold';
    else if (!hasBackpackSpace(items, template.id, template.stackable)) reason = 'Backpack full';

    const priceTone: PriceTone = character.gold < price ? 'short' : !usable || levelShort ? 'muted' : 'default';
    const rarity = itemRarity(null, template);
    const name = template.name;

    built.push({
      row: {
        key: listing.id,
        templateId: template.id,
        name,
        rarity,
        color: rarityColor(rarity),
        subLine,
        slotText: gear ? slotLabel(template.slot) || '—' : '—',
        price,
        priceTone,
        usable,
        levelShort,
        reason,
        ariaLabel: `Buy ${name} for ${grouped(price)} gold`,
      },
      group: FOR_SALE_GROUP[category],
      slot: gear ? gearSlotIndex(template.slot) : 0,
      tier: typeof template.tier === 'bigint' ? template.tier : 0n,
    });
  }

  built.sort((a, b) => {
    if (a.group !== b.group) return a.group - b.group;
    if (a.slot !== b.slot) return a.slot - b.slot;
    if (a.tier !== b.tier) return a.tier < b.tier ? -1 : 1;
    const nameA = a.row.name.toLowerCase();
    const nameB = b.row.name.toLowerCase();
    if (nameA !== nameB) return nameA < nameB ? -1 : 1;
    return a.row.key < b.row.key ? -1 : a.row.key > b.row.key ? 1 : 0;
  });
  return built.map((entry) => entry.row);
}

/**
 * The empty line of the For sale area, or null when rows exist (or while the listed templates
 * have not arrived yet, so the area shows nothing rather than a wrong sentence).
 */
export function forSaleEmptyText(input: ForSaleInput, vendorName: string): string | null {
  if (input.stock.length === 0) return `${vendorName} has nothing for sale right now.`;
  if (forSaleRows(input).length > 0) return null;
  if (input.filter === 'usable') {
    const everything = forSaleRows({ ...input, filter: 'all' });
    if (everything.length > 0) return 'Nothing here your character can use.';
  }
  return null;
}

// ---------------------------------------------------------------------------------------------
// Sell

export interface SellInput {
  items: readonly ItemInstance[];
  templates: ReadonlyMap<bigint, ItemTemplate>;
  character: Pick<VendorCharacter, 'level' | 'vendorSellMod'>;
  perkKeys: readonly string[];
}

export interface SellRow {
  instanceId: bigint;
  templateId: bigint;
  name: string;
  rarity: string;
  color: string;
  junk: boolean;
  quest: boolean;
  quantity: bigint;
  /** ' ×3' for a stack, else ''. */
  quantityText: string;
  /** The stack's payout; null for a quest item. */
  value: bigint | null;
  /** The grouped payout, or '—' for a quest item. */
  valueText: string;
  /** '{each} each' for a stack, "Quest item · can't be sold" for a quest item, else ''. */
  subLine: string;
  /** False for a quest item: no Sell button. */
  canSell: boolean;
  ariaLabel: string;
}

function byNameThenId(a: SellRow, b: SellRow): number {
  const nameA = a.name.toLowerCase();
  const nameB = b.name.toLowerCase();
  if (nameA !== nameB) return nameA < nameB ? -1 : 1;
  return a.instanceId < b.instanceId ? -1 : a.instanceId > b.instanceId ? 1 : 0;
}

/**
 * The Your backpack rows: non-equipped instances with a known template. Junk first, then sellable
 * items by name, then quest items last (they have no Sell action).
 */
export function sellRows(input: SellInput): SellRow[] {
  const { items, templates, character, perkKeys } = input;
  const perk = perkPercents(perkKeys, character.level);
  const junkRows: SellRow[] = [];
  const itemRows: SellRow[] = [];
  const questRows: SellRow[] = [];

  for (const instance of items) {
    if (isEquipped(instance)) continue;
    const template = templates.get(instance.templateId);
    if (!template) continue;

    const quest = isQuestItemTemplate(template);
    const junk = !quest && template.isJunk;
    const name = itemName(instance, template);
    const rarity = itemRarity(instance, template);
    const stack = instance.quantity > 1n;
    const quantityText = stack ? ` ×${instance.quantity}` : '';

    let value: bigint | null = null;
    let subLine = '';
    if (quest) {
      subLine = "Quest item · can't be sold";
    } else {
      value = sellPayout(template.vendorValue, instance.quantity, perk.sell, character.vendorSellMod);
      if (stack) {
        const each = sellPayout(template.vendorValue, 1n, perk.sell, character.vendorSellMod);
        subLine = `${grouped(each)} each`;
      }
    }

    const row: SellRow = {
      instanceId: instance.id,
      templateId: instance.templateId,
      name,
      rarity,
      color: nameColor(rarity, junk),
      junk,
      quest,
      quantity: instance.quantity,
      quantityText,
      value,
      valueText: value === null ? '—' : grouped(value),
      subLine,
      canSell: !quest,
      ariaLabel: quest ? '' : `Sell ${name}${quantityText} for ${grouped(value ?? 0n)} gold`,
    };
    (quest ? questRows : junk ? junkRows : itemRows).push(row);
  }

  junkRows.sort(byNameThenId);
  itemRows.sort(byNameThenId);
  questRows.sort(byNameThenId);
  return [...junkRows, ...itemRows, ...questRows];
}

export interface JunkSummary {
  count: number;
  /** The sum of per-instance payouts, exactly what sell_all_junk pays. */
  gold: bigint;
  /** The inline confirmation prompt; empty with nothing to sell. */
  prompt: string;
}

/**
 * The Sell all junk preview: every non-equipped isJunk instance (the set the reducer sells, with
 * the payout rounded per instance like the reducer does).
 */
export function junkSummary(input: SellInput): JunkSummary {
  const { items, templates, character, perkKeys } = input;
  const perk = perkPercents(perkKeys, character.level);
  let count = 0;
  let gold = 0n;
  for (const instance of items) {
    if (isEquipped(instance)) continue;
    const template = templates.get(instance.templateId);
    if (!template || !template.isJunk) continue;
    count += 1;
    gold += sellPayout(template.vendorValue, instance.quantity, perk.sell, character.vendorSellMod);
  }
  const prompt =
    count === 0
      ? ''
      : `Sell ${count} junk ${count === 1 ? 'item' : 'items'} for ${grouped(gold)} gold? Junk sales can't be bought back.`;
  return { count, gold, prompt };
}

// ---------------------------------------------------------------------------------------------
// Rapport

/** '−2%' (U+2212), '+3.5%', '0%'. The helper's numbers carry at most one decimal. */
export function formatRapportPercent(value: number): string {
  if (!isFinite(value) || value === 0) return '0%';
  const body = String(Math.abs(value));
  return value < 0 ? `−${body}%` : `+${body}%`;
}

export interface RapportParts {
  lead: string;
  /** '−2% buy, +3.5% sell': drawn in the accent-300 step. */
  figures: string;
  suffix: string;
}

/** The three pieces of the rapport line, so the figures can carry their own color. */
export function rapportParts(input: {
  perkKeys: readonly string[];
  level: bigint;
  vendorBuyMod: bigint;
  vendorSellMod: bigint;
}): RapportParts {
  const perk = perkPercents(input.perkKeys, input.level);
  const rapport = rapportPercents({
    perkBuyPct: perk.buy,
    perkSellPct: perk.sell,
    vendorBuyMod: input.vendorBuyMod,
    vendorSellMod: input.vendorSellMod,
  });
  return {
    lead: 'Your rapport: ',
    figures: `${formatRapportPercent(rapport.buyPct)} buy, ${formatRapportPercent(rapport.sellPct)} sell`,
    suffix: rapport.fromRenown ? ' from Charisma and renown.' : ' from Charisma.',
  };
}

/** 'Your rapport: −2% buy, +3.5% sell from Charisma.' */
export function rapportText(input: {
  perkKeys: readonly string[];
  level: bigint;
  vendorBuyMod: bigint;
  vendorSellMod: bigint;
}): string {
  const parts = rapportParts(input);
  return `${parts.lead}${parts.figures}${parts.suffix}`;
}

// ---------------------------------------------------------------------------------------------
// Just sold

export type BuybackState = 'ready' | 'gold' | 'place' | 'full';

export interface BuybackCard {
  /** '{name}{ ×n}'. */
  name: string;
  color: string;
  price: bigint;
  state: BuybackState;
  /** The reason line when the button is unavailable. */
  reason: string | null;
  ariaLabel: string;
}

/**
 * The Just sold card, derived only from the caller's own last-sale row (the per-sender view). The
 * button states and reasons follow the UI-SPEC table order: gold short, wrong place, full bag.
 */
export function buybackCard(
  lastSale: VendorBuyback | null,
  character: Pick<VendorCharacter, 'gold'> & { locationId?: bigint } | null,
  openVendorId: bigint | null,
  items: readonly ItemInstance[],
  templates: ReadonlyMap<bigint, ItemTemplate>,
): BuybackCard | null {
  if (!lastSale) return null;
  const quantityText = lastSale.quantity > 1n ? ` ×${lastSale.quantity}` : '';
  const name = `${lastSale.itemName}${quantityText}`;
  const gold = character ? character.gold : 0n;

  let state: BuybackState = 'ready';
  let reason: string | null = null;
  if (gold < lastSale.price) {
    state = 'gold';
    reason = `You need ${grouped(lastSale.price)} gold to buy it back.`;
  } else if (
    openVendorId === null ||
    openVendorId !== lastSale.npcId ||
    !character ||
    character.locationId !== lastSale.locationId
  ) {
    state = 'place';
    reason = `Sold to ${lastSale.npcName}. Go back there to buy it back.`;
  } else {
    const template = templates.get(lastSale.templateId);
    if (!hasBackpackSpace(items, lastSale.templateId, template ? template.stackable : false)) {
      state = 'full';
      reason = BACKPACK_FULL;
    }
  }

  return {
    name,
    color: rarityColor(lastSale.rarity),
    price: lastSale.price,
    state,
    reason,
    ariaLabel: `Buy back ${name} for ${grouped(lastSale.price)} gold`,
  };
}
