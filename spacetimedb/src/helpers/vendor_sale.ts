// The single-item vendor sale, in one place (Phase 50, LDG-09). sell_item and the typed
// "sell <item>" command both call sellInstanceToVendor, so the quest-item refusal and the buy-back
// record cannot be bypassed by one of the two paths. The buy-back row is the character's last
// single sale (one row per character, replaced by the next sale); the affixes are snapshotted
// BEFORE they are deleted, as decimal strings because item_affix.magnitude is a bigint.
import { getPerkBonusByField } from './renown';
import { appendPrivateEvent } from './events';
import { appliedSellBonusPercent, sellPayout } from '../data/vendor_pricing';
import { isQuestItemTemplate, QUEST_ITEM_SALE_REFUSAL } from '../data/item_rules';

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

export interface SellInstanceInput {
  character: any;
  instance: any;
  template: any;
  npcId: bigint;
  /** True for a single sale (window Sell or typed "sell <item>"): write the buy-back row. */
  record: boolean;
  fail: (ctx: any, character: any, message: string) => void;
}

/**
 * Sell one item instance to a vendor. Returns false (with one refusal line and no write at all)
 * for a quest item; otherwise pays, deletes, lists for resale, optionally records the buy-back
 * row, writes the reward line and returns true.
 */
export function sellInstanceToVendor(ctx: any, input: SellInstanceInput): boolean {
  const { character, instance, template, npcId } = input;
  if (isQuestItemTemplate(template)) {
    input.fail(ctx, character, QUEST_ITEM_SALE_REFUSAL);
    return false;
  }

  const quantity: bigint = instance.quantity ?? 1n;
  const vendorValue: bigint = template.vendorValue ?? 0n;
  const baseValue = BigInt(vendorValue) * BigInt(quantity);
  // Vendor sell bonus perk, then CHA sell bonus (character.vendorSellMod is on 1000-scale): shared pricing.
  const vendorSellBonus = getPerkBonusByField(ctx, character.id, 'vendorSellBonus', character.level);
  const appliedBonus = appliedSellBonusPercent(vendorSellBonus);
  const sellBonusMsg = appliedBonus > 0 && baseValue > 0n ? ` (${appliedBonus}% perk bonus)` : '';
  const value = sellPayout(vendorValue, quantity, vendorSellBonus, character.vendorSellMod ?? 0n);

  // Snapshot before any delete.
  const affixes = snapshotAffixes(ctx, instance.id);
  const soldTemplateId: bigint = instance.templateId;
  const soldQualityTier = instance.qualityTier ?? undefined;
  for (const row of [...ctx.db.item_affix.by_instance.filter(instance.id)]) {
    ctx.db.item_affix.id.delete(row.id);
  }
  ctx.db.item_instance.id.delete(instance.id);
  ctx.db.character.id.update({
    ...character,
    gold: (character.gold ?? 0n) + value,
  });

  // Add the sold item to the vendor's inventory so other players can buy it.
  const npc = ctx.db.npc.id.find(npcId);
  let createdListingId: bigint | undefined = undefined;
  if (npc && npc.npcType === 'vendor') {
    const alreadyListed = [...ctx.db.vendor_inventory.by_vendor.filter(npcId)].find(
      (row: any) => row.itemTemplateId === soldTemplateId && (row.qualityTier ?? undefined) === soldQualityTier
    );
    if (!alreadyListed) {
      // Price at 2x vendorValue (what the vendor paid per unit)
      const resalePrice = vendorValue > 0n ? vendorValue * 2n : 10n;
      const listing = ctx.db.vendor_inventory.insert({
        id: 0n,
        npcId,
        itemTemplateId: soldTemplateId,
        price: resalePrice,
        qualityTier: soldQualityTier,
      });
      createdListingId = listing.id;
    }
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

  appendPrivateEvent(
    ctx,
    character.id,
    character.ownerUserId,
    'reward',
    `You sell ${template.name} for ${value} gold.${sellBonusMsg}`
  );
  return true;
}
