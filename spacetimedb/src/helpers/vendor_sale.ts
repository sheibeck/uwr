// The vendor sale, in one place (Phase 50, LDG-09). sell_item, sell_item_quantity and the typed
// "sell <item>" and "sell N <item>" commands all call sellInstanceToVendor, so the quest-item
// refusal, the quantity rules and the buy-back record cannot be bypassed by one of the paths. The
// buy-back row is the character's last single sale (one row per character, replaced by the next
// sale); the affixes are snapshotted BEFORE they are deleted, as decimal strings because
// item_affix.magnitude is a bigint.
// Vendor stock is finite (plan 50-26): a vendor_inventory row has a quantity. findVendorListing,
// addToVendorListing and takeFromVendorListing are the only writers of that quantity besides the
// restock: a sale adds the sold units, a buy or buy-back takes exactly what it moves.
import { getPerkBonusByField } from './renown';
import { appendPrivateEvent } from './events';
import { appliedSellBonusPercent, sellPayout } from '../data/vendor_pricing';
import { isQuestItemTemplate, QUEST_ITEM_SALE_REFUSAL } from '../data/item_rules';
import { listPriceFor } from '../data/vendor_stock';

export interface AffixSnapshot {
  affixType: string;
  affixKey: string;
  affixName: string;
  statKey: string;
  /** Decimal string of the bigint magnitude (JSON.stringify cannot carry a bigint). */
  magnitude: string;
}

/** Copy every affix of an instance, in table order. Call before the affixes are deleted. */
export function snapshotAffixes(ctx: any, instanceId: bigint): AffixSnapshot[] {
  const out: AffixSnapshot[] = [];
  for (const row of [...ctx.db.item_affix.by_instance.filter(instanceId)]) {
    out.push({
      affixType: row.affixType,
      affixKey: row.affixKey,
      affixName: row.affixName,
      statKey: row.statKey,
      magnitude: String(row.magnitude),
    });
  }
  return out;
}

/**
 * Read a stored snapshot back. Never throws: malformed JSON gives [], and an entry with a missing
 * or non-string field, or a magnitude that is not an integer string, is dropped.
 */
export function parseAffixSnapshot(json: string): AffixSnapshot[] {
  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch {
    return [];
  }
  if (!Array.isArray(parsed)) return [];
  const out: AffixSnapshot[] = [];
  for (const entry of parsed) {
    if (!entry || typeof entry !== 'object') continue;
    const e = entry as Record<string, unknown>;
    if (
      typeof e.affixType !== 'string' ||
      typeof e.affixKey !== 'string' ||
      typeof e.affixName !== 'string' ||
      typeof e.statKey !== 'string' ||
      typeof e.magnitude !== 'string' ||
      !/^-?\d+$/.test(e.magnitude)
    ) {
      continue;
    }
    out.push({
      affixType: e.affixType,
      affixKey: e.affixKey,
      affixName: e.affixName,
      statKey: e.statKey,
      magnitude: e.magnitude,
    });
  }
  return out;
}

/**
 * Put a recorded sale back in the character's bag (the buy-back restore). A stackable template
 * goes through addItemToInventory (merges onto an existing stack, else a plain instance); any other
 * template gets a new instance carrying the stored quality, craft quality, display name and flags,
 * plus one item_affix row per valid snapshot entry. The caller has already checked room and gold.
 *
 * Assumption (stackable path): a stackable template never carries quality, craft quality, a display
 * name, flags or affixes today (only gear is crafted, named or given affixes), so merging onto the
 * first stack loses nothing. If a stackable ever gains any of those, restore it as its own instance
 * like the non-stackable path instead.
 */
export function restoreBuyback(
  ctx: any,
  character: any,
  sale: any,
  addItemToInventory: (ctx: any, characterId: bigint, templateId: bigint, quantity: bigint) => void
): void {
  const template = ctx.db.item_template.id.find(sale.templateId);
  if (template && template.stackable) {
    addItemToInventory(ctx, character.id, sale.templateId, sale.quantity);
    return;
  }
  const instance = ctx.db.item_instance.insert({
    id: 0n,
    templateId: sale.templateId,
    ownerCharacterId: character.id,
    equippedSlot: undefined,
    quantity: sale.quantity,
    qualityTier: sale.qualityTier ?? undefined,
    craftQuality: sale.craftQuality ?? undefined,
    displayName: sale.displayName ?? undefined,
    isNamed: sale.isNamed ?? undefined,
    isTemporary: sale.isTemporary ?? undefined,
  });
  for (const entry of parseAffixSnapshot(sale.affixesJson)) {
    ctx.db.item_affix.insert({
      id: 0n,
      itemInstanceId: instance.id,
      affixType: entry.affixType,
      affixKey: entry.affixKey,
      affixName: entry.affixName,
      statKey: entry.statKey,
      magnitude: BigInt(entry.magnitude),
    });
  }
}

/**
 * The listing of this template and quality tier at a vendor: the lowest id when there are several,
 * or undefined. A missing tier equals an undefined tier.
 */
export function findVendorListing(ctx: any, npcId: bigint, templateId: bigint, qualityTier: string | undefined): any {
  const matches = [...ctx.db.vendor_inventory.by_vendor.filter(npcId)].filter(
    (row: any) => row.itemTemplateId === templateId && (row.qualityTier ?? undefined) === (qualityTier ?? undefined)
  );
  matches.sort((a: any, b: any) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  return matches[0];
}

/**
 * Put sold units on a vendor's listing: raises the existing listing for that template and tier, or
 * creates it with that quantity. A base-stock listing that receives player-sold units loses its
 * vendor_base_stock marker, so restock never deletes goods a player sold.
 */
export function addToVendorListing(
  ctx: any,
  input: { npcId: bigint; templateId: bigint; qualityTier: string | undefined; quantity: bigint; price: bigint }
): { listingId: bigint; created: boolean } {
  const existing = findVendorListing(ctx, input.npcId, input.templateId, input.qualityTier);
  if (existing) {
    ctx.db.vendor_inventory.id.update({ ...existing, quantity: (existing.quantity ?? 0n) + input.quantity });
    if (ctx.db.vendor_base_stock.listingId.find(existing.id)) {
      ctx.db.vendor_base_stock.listingId.delete(existing.id);
    }
    return { listingId: existing.id, created: false };
  }
  const listing = ctx.db.vendor_inventory.insert({
    id: 0n,
    npcId: input.npcId,
    itemTemplateId: input.templateId,
    price: input.price,
    qualityTier: input.qualityTier,
    quantity: input.quantity,
  });
  return { listingId: listing.id, created: true };
}

/**
 * Take units out of a listing (a buy or a buy-back). Above zero the row is lowered. At zero a
 * player listing is deleted, and a base-stock listing stays at 0 (sold out) until the next restock.
 */
export function takeFromVendorListing(ctx: any, listing: any, quantity: bigint): void {
  const have: bigint = listing.quantity ?? 0n;
  const left = have > quantity ? have - quantity : 0n;
  if (left > 0n) {
    ctx.db.vendor_inventory.id.update({ ...listing, quantity: left });
    return;
  }
  if (ctx.db.vendor_base_stock.listingId.find(listing.id)) {
    ctx.db.vendor_inventory.id.update({ ...listing, quantity: 0n });
    return;
  }
  ctx.db.vendor_inventory.id.delete(listing.id);
}

export interface SellInstanceInput {
  character: any;
  instance: any;
  template: any;
  npcId: bigint;
  /** True for a single sale (window Sell or typed "sell <item>"): write the buy-back row. */
  record: boolean;
  fail: (ctx: any, character: any, message: string) => void;
  /** Units to sell. Omitted: the whole instance. */
  quantity?: bigint;
  /** Default true. False lets a bulk caller write its own summary line. */
  announce?: boolean;
}

/**
 * Sell units of one item instance to a vendor. Returns null (with one refusal line and no write at
 * all) for a quest item, a quantity below 1 or a quantity above the stack; otherwise pays, lowers
 * or deletes the instance, adds the units to the vendor's listing, optionally records the buy-back
 * row, writes the reward line (unless announce is false) and returns the gold paid. A partial sale
 * lowers the stack in place: the remaining part keeps its id, affixes and every field, and the sold
 * units carry no affixes.
 */
export function sellInstanceToVendor(ctx: any, input: SellInstanceInput): bigint | null {
  const { character, instance, template, npcId } = input;
  if (isQuestItemTemplate(template)) {
    input.fail(ctx, character, QUEST_ITEM_SALE_REFUSAL);
    return null;
  }

  const have: bigint = instance.quantity ?? 1n;
  const quantity: bigint = input.quantity ?? have;
  if (quantity < 1n) {
    input.fail(ctx, character, 'Choose at least one to sell.');
    return null;
  }
  if (quantity > have) {
    input.fail(ctx, character, `You only have ${have} ${instance.displayName || template.name}.`);
    return null;
  }
  const whole = quantity === have;
  const vendorValue: bigint = template.vendorValue ?? 0n;
  const baseValue = BigInt(vendorValue) * BigInt(quantity);
  // Vendor sell bonus perk, then CHA sell bonus (character.vendorSellMod is on 1000-scale): shared pricing.
  const vendorSellBonus = getPerkBonusByField(ctx, character.id, 'vendorSellBonus', character.level);
  const appliedBonus = appliedSellBonusPercent(vendorSellBonus);
  const sellBonusMsg = appliedBonus > 0 && baseValue > 0n ? ` (${appliedBonus}% perk bonus)` : '';
  const value = sellPayout(vendorValue, quantity, vendorSellBonus, character.vendorSellMod ?? 0n);

  const soldTemplateId: bigint = instance.templateId;
  const soldQualityTier = instance.qualityTier ?? undefined;
  let affixes: AffixSnapshot[] = [];
  if (whole) {
    // Snapshot before any delete.
    affixes = snapshotAffixes(ctx, instance.id);
    for (const row of [...ctx.db.item_affix.by_instance.filter(instance.id)]) {
      ctx.db.item_affix.id.delete(row.id);
    }
    ctx.db.item_instance.id.delete(instance.id);
  } else {
    ctx.db.item_instance.id.update({ ...instance, quantity: have - quantity });
  }
  // Credit the CURRENT row: a bulk caller (typed "sell N") sells several stacks with one character
  // object, and a stale copy would overwrite the gold of the earlier sale.
  const current = ctx.db.character.id.find(character.id) ?? character;
  ctx.db.character.id.update({
    ...current,
    gold: (current.gold ?? 0n) + value,
  });

  // Add the sold units to the vendor's inventory so other players can buy them.
  const npc = ctx.db.npc.id.find(npcId);
  let createdListingId: bigint | undefined = undefined;
  if (npc && npc.npcType === 'vendor') {
    const added = addToVendorListing(ctx, {
      npcId,
      templateId: soldTemplateId,
      qualityTier: soldQualityTier,
      quantity,
      price: listPriceFor(vendorValue),
    });
    if (added.created) createdListingId = added.listingId;
  }

  // A temporary (conjured) item is swept at logout; a buy-back row must not outlive that sweep and
  // recreate it, so a temporary item is paid for but never recorded.
  if (input.record && !instance.isTemporary) {
    const row = {
      characterId: character.id,
      npcId,
      npcName: npc?.name ?? 'the vendor',
      locationId: character.locationId,
      templateId: soldTemplateId,
      itemName: instance.displayName || template.name,
      rarity: instance.qualityTier || template.rarity || 'common',
      quantity,
      price: value,
      qualityTier: soldQualityTier,
      craftQuality: instance.craftQuality ?? undefined,
      displayName: instance.displayName ?? undefined,
      isNamed: instance.isNamed ?? undefined,
      isTemporary: instance.isTemporary ?? undefined,
      affixesJson: JSON.stringify(affixes),
      listingId: createdListingId,
      soldAt: ctx.timestamp,
    };
    if (ctx.db.vendor_buyback.characterId.find(character.id)) {
      ctx.db.vendor_buyback.characterId.update(row);
    } else {
      ctx.db.vendor_buyback.insert(row);
    }
  }

  if (input.announce !== false) {
    appendPrivateEvent(
      ctx,
      character.id,
      character.ownerUserId,
      'reward',
      whole
        ? `You sell ${template.name} for ${value} gold.${sellBonusMsg}`
        : `You sell ${quantity}x ${template.name} for ${value} gold.${sellBonusMsg}`
    );
  }
  return value;
}
