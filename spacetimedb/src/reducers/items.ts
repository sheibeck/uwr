import { buildDisplayName, ensureDefaultHotbar } from '../helpers/items';
import { getPerkBonusByField } from '../helpers/renown';
import { TWO_HANDED_WEAPON_TYPES } from '../data/combat_constants';
import { appliedBuyDiscountPercent, appliedSellBonusPercent, listingBuyPrice, sellPayout } from '../data/vendor_pricing';
import { canEquipItem } from '../data/item_usability';
import { USE_ITEM_KEYS, isQuestItemTemplate } from '../data/item_rules';
import { sellInstanceToVendor, restoreBuyback, findVendorListing, takeFromVendorListing } from '../helpers/vendor_sale';

export const registerItemReducers = (deps: any) => {
  const {
    spacetimedb,
    t,
    SenderError,
    EQUIPMENT_SLOTS,
    ARMOR_TYPES_WITH_NONE,
    normalizeArmorType,
    requirePlayerUserId,
    requireCharacterOwnedBy,
    recomputeCharacterDerived,
    executeAbilityAction,
    appendPrivateEvent,
    appendGroupEvent,
    abilityCooldownMicros,
    abilityCastMicros,
    activeCombatIdForCharacter,
    addItemToInventory,
    logPrivateAndGroup,
    getInventorySlotCount,
    MAX_INVENTORY_SLOTS,
    hasInventorySpace,
    fail,
  } = deps;

  const failItem = (ctx: any, character: any, message: string) =>
    fail(ctx, character, message, 'system');

  spacetimedb.reducer(
    'create_item_template',
    {
      name: t.string(),
      slot: t.string(),
      armorType: t.string(),
      rarity: t.string(),
      tier: t.u64(),
      isJunk: t.bool(),
      vendorValue: t.u64(),
      requiredLevel: t.u64(),
      allowedClasses: t.string(),
      strBonus: t.u64(),
      dexBonus: t.u64(),
      chaBonus: t.u64(),
      wisBonus: t.u64(),
      intBonus: t.u64(),
      hpBonus: t.u64(),
      manaBonus: t.u64(),
      armorClassBonus: t.u64(),
      weaponBaseDamage: t.u64(),
      weaponDps: t.u64(),
      stackable: t.bool(),
    },
    (ctx, args) => {
      const slot = args.slot.trim();
      if (!EQUIPMENT_SLOTS.has(slot) && !['junk', 'resource', 'consumable'].includes(slot)) {
        throw new SenderError('Invalid slot');
      }
      const armorType = normalizeArmorType(args.armorType);
      if (!ARMOR_TYPES_WITH_NONE.includes(armorType as (typeof ARMOR_TYPES_WITH_NONE)[number])) {
        throw new SenderError('Invalid armor type');
      }
      ctx.db.item_template.insert({
        id: 0n,
        name: args.name.trim(),
        slot,
        armorType,
        rarity: args.rarity.trim(),
        tier: args.tier,
        isJunk: args.isJunk,
        vendorValue: args.vendorValue,
        requiredLevel: args.requiredLevel,
        allowedClasses: args.allowedClasses.trim(),
        strBonus: args.strBonus,
        dexBonus: args.dexBonus,
        chaBonus: args.chaBonus,
        wisBonus: args.wisBonus,
        intBonus: args.intBonus,
        hpBonus: args.hpBonus,
        manaBonus: args.manaBonus,
        armorClassBonus: args.armorClassBonus,
        magicResistanceBonus: 0n,
        weaponBaseDamage: args.weaponBaseDamage,
        weaponDps: args.weaponDps,
        weaponType: '',
        stackable: args.stackable,
        wellFedDurationMicros: 0n,
        wellFedBuffType: '',
        wellFedBuffMagnitude: 0n,
      });
    }
  );

  spacetimedb.reducer('grant_item', { characterId: t.u64(), templateId: t.u64() }, (ctx, args) => {
    const character = requireCharacterOwnedBy(ctx, args.characterId);
    const template = ctx.db.item_template.id.find(args.templateId);
    if (!template) return failItem(ctx, character, 'Item template not found');
    addItemToInventory(ctx, character.id, template.id, 1n);
  });

  spacetimedb.reducer(
    'buy_item',
    { characterId: t.u64(), npcId: t.u64(), itemTemplateId: t.u64() },
    (ctx, args) => {
      const character = requireCharacterOwnedBy(ctx, args.characterId);
      // Same rule as sell_item and the typed sell: the seller of the goods must be a vendor npc
      // standing at the character's location. Refused before any read of the listing or any write.
      const vendorNpc = ctx.db.npc.id.find(args.npcId);
      if (!vendorNpc || vendorNpc.npcType !== 'vendor' || vendorNpc.locationId !== character.locationId) {
        return failItem(ctx, character, 'There is no vendor here.');
      }
      const template = ctx.db.item_template.id.find(args.itemTemplateId);
      if (!template) return failItem(ctx, character, 'Item template missing');
      // Stock is finite: take one unit from a listing of this template that still has some. A sold
      // out or deleted listing reads the same, and nothing is written before this check passes.
      const stocked = [...ctx.db.vendor_inventory.by_vendor.filter(args.npcId)]
        .filter((row: any) => row.itemTemplateId === args.itemTemplateId && row.quantity >= 1n)
        .sort((a: any, b: any) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
      const vendorItem = stocked[0];
      if (!vendorItem) return failItem(ctx, character, `${vendorNpc.name} has no more ${template.name}.`);
      const itemCount = [...ctx.db.item_instance.by_owner.filter(character.id)].filter((row) => !row.equippedSlot).length;
      const hasStack =
        template.stackable &&
        [...ctx.db.item_instance.by_owner.filter(character.id)].some(
          (row) => row.templateId === template.id && !row.equippedSlot
        );
      if (!hasStack && itemCount >= MAX_INVENTORY_SLOTS) return failItem(ctx, character, 'Backpack is full');
      // Apply vendor buy discount perk
      const vendorBuyDiscount = getPerkBonusByField(ctx, character.id, 'vendorBuyDiscount', character.level);
      // Perk discount then CHA discount (character.vendorBuyMod is on 1000-scale): shared pricing.
      const discountMsg =
        appliedBuyDiscountPercent(vendorBuyDiscount) > 0
          ? ` (${appliedBuyDiscountPercent(vendorBuyDiscount)}% perk discount)`
          : '';
      const vendorSellBonus = getPerkBonusByField(ctx, character.id, 'vendorSellBonus', character.level);
      const finalPrice = listingBuyPrice({
        listPrice: vendorItem.price,
        vendorValue: template.vendorValue ?? 0n,
        perkBuyPct: vendorBuyDiscount,
        perkSellPct: vendorSellBonus,
        vendorBuyMod: character.vendorBuyMod,
        vendorSellMod: character.vendorSellMod ?? 0n,
      });
      if ((character.gold ?? 0n) < finalPrice) return failItem(ctx, character, 'Not enough gold');
      ctx.db.character.id.update({
        ...character,
        gold: (character.gold ?? 0n) - finalPrice,
      });
      addItemToInventory(ctx, character.id, template.id, 1n);
      takeFromVendorListing(ctx, vendorItem, 1n);
      appendPrivateEvent(
        ctx,
        character.id,
        character.ownerUserId,
        'reward',
        `You buy ${template.name} for ${finalPrice} gold.${discountMsg}`
      );
    }
  );

  // The checks every window sale shares. quantity undefined sells the whole instance (sell_item);
  // a number sells that many (sell_item_quantity). Every refusal happens before the first write.
  const sellFromBag = (
    ctx: any,
    args: { characterId: bigint; itemInstanceId: bigint; npcId: bigint },
    quantity: bigint | undefined
  ) => {
    const character = requireCharacterOwnedBy(ctx, args.characterId);
    const instance = ctx.db.item_instance.id.find(args.itemInstanceId);
    if (!instance) return failItem(ctx, character, 'Item not found');
    if (instance.ownerCharacterId !== character.id) {
      return failItem(ctx, character, 'Item does not belong to you');
    }
    if (instance.equippedSlot) return failItem(ctx, character, 'Unequip item first');
    const template = ctx.db.item_template.id.find(instance.templateId);
    if (!template) return failItem(ctx, character, 'Item template missing');
    // Same rule as the typed 'sell <item>' path: the buyer must be a vendor standing here. The
    // buy-back row records the seller's place, so this is what makes "go back to the vendor" true.
    const npc = ctx.db.npc.id.find(args.npcId);
    if (!npc || npc.npcType !== 'vendor' || npc.locationId !== character.locationId) {
      return failItem(ctx, character, 'There is no vendor here.');
    }
    sellInstanceToVendor(ctx, {
      character,
      instance,
      template,
      npcId: args.npcId,
      quantity,
      record: true,
      fail: failItem,
    });
  };

  // Kept with its exact argument layout for clients built before sell_item_quantity: it sells the
  // whole instance, which is exactly one unit for any item that is not a stack.
  spacetimedb.reducer(
    'sell_item',
    { characterId: t.u64(), itemInstanceId: t.u64(), npcId: t.u64() },
    (ctx, args) => sellFromBag(ctx, args, undefined)
  );

  // Sell 1 to n units of a stack. The remaining part keeps its id and fields; the sold units carry
  // no affixes. A quantity of 0 or above the stack is refused before any write.
  spacetimedb.reducer(
    'sell_item_quantity',
    { characterId: t.u64(), itemInstanceId: t.u64(), npcId: t.u64(), quantity: t.u64() },
    (ctx, args) => sellFromBag(ctx, args, args.quantity)
  );

  // Undo the character's last single sale. Only the character id crosses the wire: the price, the
  // item and the place all come from the caller's own private vendor_buyback row, so a client can
  // never supply them. Every refusal happens before the first write.
  spacetimedb.reducer('buyback_last_sale', { characterId: t.u64() }, (ctx, args) => {
    const character = requireCharacterOwnedBy(ctx, args.characterId);
    const sale = ctx.db.vendor_buyback.characterId.find(character.id);
    if (!sale) return failItem(ctx, character, 'Nothing to buy back.');
    // A template removed since the sale can never be restored: say so (instead of "backpack is
    // full") and clear the dead row, and the resale listing that sale created, so nothing lingers.
    if (!ctx.db.item_template.id.find(sale.templateId)) {
      const orphan = findVendorListing(ctx, sale.npcId, sale.templateId, sale.qualityTier ?? undefined);
      if (orphan) {
        takeFromVendorListing(ctx, orphan, sale.quantity < orphan.quantity ? sale.quantity : orphan.quantity);
      }
      ctx.db.vendor_buyback.characterId.delete(character.id);
      return failItem(ctx, character, 'That item can no longer be bought back.');
    }
    if ((character.gold ?? 0n) < sale.price) {
      return failItem(ctx, character, 'Not enough gold to buy that back.');
    }
    if (character.locationId !== sale.locationId) {
      return failItem(ctx, character, `Go back to ${sale.npcName} to buy that back.`);
    }
    // The units must still be on the vendor's shelf: buying them back moves them out of the
    // listing, so a vendor that has already resold them cannot be bought from twice.
    const listing = findVendorListing(ctx, sale.npcId, sale.templateId, sale.qualityTier ?? undefined);
    if (!listing || listing.quantity < sale.quantity) {
      return failItem(ctx, character, `${sale.npcName} has already sold ${sale.itemName}.`);
    }
    if (!hasInventorySpace(ctx, character.id, sale.templateId)) {
      return failItem(ctx, character, 'Your backpack is full.');
    }
    ctx.db.character.id.update({
      ...character,
      gold: (character.gold ?? 0n) - sale.price,
    });
    restoreBuyback(ctx, character, sale, addItemToInventory);
    // The refund stays exactly the stored price; the units leave the listing (a listing this sale
    // created is deleted at 0, a base-stock listing stays).
    takeFromVendorListing(ctx, listing, sale.quantity);
    ctx.db.vendor_buyback.characterId.delete(character.id);
    appendPrivateEvent(
      ctx,
      character.id,
      character.ownerUserId,
      'reward',
      `You buy back ${sale.itemName} for ${sale.price} gold.`
    );
  });

  spacetimedb.reducer('sell_all_junk', { characterId: t.u64() }, (ctx, args) => {
    const character = requireCharacterOwnedBy(ctx, args.characterId);
    // This reducer takes no npc id, so the rule is the typed 'sell junk' one: some vendor npc must
    // be at the character's location. Refused before any write.
    const hasVendorHere = [...ctx.db.npc.by_location.filter(character.locationId)].some(
      (n: any) => n.npcType === 'vendor'
    );
    if (!hasVendorHere) return failItem(ctx, character, 'There is no vendor here.');
    const vendorSellBonus = getPerkBonusByField(ctx, character.id, 'vendorSellBonus', character.level);
    let total = 0n;
    let count = 0;
    for (const instance of ctx.db.item_instance.by_owner.filter(character.id)) {
      if (instance.equippedSlot) continue;
      const template = ctx.db.item_template.id.find(instance.templateId);
      if (!template || !template.isJunk) continue;
      // Quest items are never sold, on any path (the typed 'sell junk' skips them the same way).
      if (isQuestItemTemplate(template)) continue;
      total += sellPayout(
        template.vendorValue ?? 0n,
        instance.quantity ?? 1n,
        vendorSellBonus,
        character.vendorSellMod ?? 0n
      );
      count++;
      // item_affix is public: delete the instance's affix rows first so none are orphaned.
      for (const row of [...ctx.db.item_affix.by_instance.filter(instance.id)]) {
        ctx.db.item_affix.id.delete(row.id);
      }
      ctx.db.item_instance.id.delete(instance.id);
    }
    if (total > 0n) {
      ctx.db.character.id.update({
        ...character,
        gold: (character.gold ?? 0n) + total,
      });
    }
    const bonusMsg = appliedSellBonusPercent(vendorSellBonus) > 0 ? ` (${appliedSellBonusPercent(vendorSellBonus)}% perk bonus)` : '';
    appendPrivateEvent(
      ctx,
      character.id,
      character.ownerUserId,
      'reward',
      `You sell ${count} junk item(s) for ${total} gold${bonusMsg}.`
    );
  });

  spacetimedb.reducer('take_loot', { characterId: t.u64(), lootId: t.u64() }, (ctx, args) => {
    const character = requireCharacterOwnedBy(ctx, args.characterId);
    const loot = ctx.db.combat_loot.id.find(args.lootId);
    if (!loot) return failItem(ctx, character, 'Loot not found');
    if (loot.characterId !== character.id || loot.ownerUserId !== character.ownerUserId) {
      return failItem(ctx, character, 'Loot does not belong to you');
    }
    const itemCount = [...ctx.db.item_instance.by_owner.filter(character.id)].filter((row) => !row.equippedSlot).length;
    const template = ctx.db.item_template.id.find(loot.itemTemplateId);
    if (!template) return failItem(ctx, character, 'Item template missing');
    const hasStack =
      template.stackable &&
      [...ctx.db.item_instance.by_owner.filter(character.id)].some(
        (row) => row.templateId === template.id && !row.equippedSlot
      );
    if (!hasStack && itemCount >= MAX_INVENTORY_SLOTS) return failItem(ctx, character, 'Backpack is full');
    addItemToInventory(ctx, character.id, template.id, 1n);

    // Apply affix data if this is a non-common quality item
    let displayName = template.name;
    if (loot.qualityTier && loot.qualityTier !== 'common') {
      // Find the newly created ItemInstance — most recent one for this character+template with no qualityTier
      const instances = [...ctx.db.item_instance.by_owner.filter(character.id)];
      const newInstance = instances.find(
        (i) => i.templateId === loot.itemTemplateId && !i.equippedSlot && !i.qualityTier
      );
      if (newInstance && loot.affixDataJson) {
        const affixes = JSON.parse(loot.affixDataJson) as {
          affixKey: string;
          affixType: string;
          magnitude: number;
          statKey: string;
          affixName: string;
        }[];
        for (const affix of affixes) {
          ctx.db.item_affix.insert({
            id: 0n,
            itemInstanceId: newInstance.id,
            affixType: affix.affixType,
            affixKey: affix.affixKey,
            affixName: affix.affixName,
            statKey: affix.statKey,
            magnitude: BigInt(affix.magnitude),
          });
        }
        displayName = buildDisplayName(template.name, affixes);
        ctx.db.item_instance.id.update({
          ...newInstance,
          qualityTier: loot.qualityTier,
          displayName,
          isNamed: loot.isNamed ?? undefined,
          craftQuality: loot.craftQuality ?? undefined,  // propagate rolled quality from loot row
        });
      }
    }

    // For common items (affix branch above was skipped), still propagate craftQuality if present
    if (loot.craftQuality && (!loot.qualityTier || loot.qualityTier === 'common')) {
      const instances = [...ctx.db.item_instance.by_owner.filter(character.id)];
      const newInstance = instances.find(
        (i) => i.templateId === loot.itemTemplateId && !i.equippedSlot && !i.qualityTier
      );
      if (newInstance) {
        ctx.db.item_instance.id.update({ ...newInstance, craftQuality: loot.craftQuality });
      }
    }

    ctx.db.combat_loot.id.delete(loot.id);
    logPrivateAndGroup(
      ctx,
      character,
      'reward',
      `You receive ${displayName}.`,
      `${character.name} takes ${displayName}.`
    );

    // Check if this character has any remaining loot for this combat
    const myRemainingLoot = [...ctx.db.combat_loot.by_character.filter(character.id)]
      .filter(row => row.combatId === loot.combatId);
    if (myRemainingLoot.length === 0) {
      // Delete only this character's result for this combat
      for (const result of ctx.db.combat_result.by_owner_user.filter(character.ownerUserId)) {
        if (result.combatId === loot.combatId) {
          ctx.db.combat_result.id.delete(result.id);
        }
      }
    }
  });

  spacetimedb.reducer('take_all_loot', { characterId: t.u64() }, (ctx, args) => {
    const character = requireCharacterOwnedBy(ctx, args.characterId);
    const allLoot = [...ctx.db.combat_loot.by_character.filter(character.id)];
    if (allLoot.length === 0) return;

    const takenNames: string[] = [];
    let skipped = 0;

    for (const loot of allLoot) {
      const itemCount = [...ctx.db.item_instance.by_owner.filter(character.id)].filter((row) => !row.equippedSlot).length;
      const template = ctx.db.item_template.id.find(loot.itemTemplateId);
      if (!template) continue;
      const hasStack =
        template.stackable &&
        [...ctx.db.item_instance.by_owner.filter(character.id)].some(
          (row) => row.templateId === template.id && !row.equippedSlot
        );
      if (!hasStack && itemCount >= MAX_INVENTORY_SLOTS) {
        skipped++;
        continue;
      }

      addItemToInventory(ctx, character.id, template.id, 1n);

      let displayName = template.name;
      if (loot.qualityTier && loot.qualityTier !== 'common') {
        const instances = [...ctx.db.item_instance.by_owner.filter(character.id)];
        const newInstance = instances.find(
          (i) => i.templateId === loot.itemTemplateId && !i.equippedSlot && !i.qualityTier
        );
        if (newInstance && loot.affixDataJson) {
          const affixes = JSON.parse(loot.affixDataJson) as {
            affixKey: string;
            affixType: string;
            magnitude: number;
            statKey: string;
            affixName: string;
          }[];
          for (const affix of affixes) {
            ctx.db.item_affix.insert({
              id: 0n,
              itemInstanceId: newInstance.id,
              affixType: affix.affixType,
              affixKey: affix.affixKey,
              affixName: affix.affixName,
              statKey: affix.statKey,
              magnitude: BigInt(affix.magnitude),
            });
          }
          displayName = buildDisplayName(template.name, affixes);
          ctx.db.item_instance.id.update({
            ...newInstance,
            qualityTier: loot.qualityTier,
            displayName,
            isNamed: loot.isNamed ?? undefined,
            craftQuality: loot.craftQuality ?? undefined,  // propagate rolled quality from loot row
          });
        }
      }

      // For common items (affix branch above was skipped), still propagate craftQuality if present
      if (loot.craftQuality && (!loot.qualityTier || loot.qualityTier === 'common')) {
        const instances = [...ctx.db.item_instance.by_owner.filter(character.id)];
        const newInstance = instances.find(
          (i) => i.templateId === loot.itemTemplateId && !i.equippedSlot && !i.qualityTier
        );
        if (newInstance) {
          ctx.db.item_instance.id.update({ ...newInstance, craftQuality: loot.craftQuality });
        }
      }

      ctx.db.combat_loot.id.delete(loot.id);
      takenNames.push(displayName);
    }

    if (takenNames.length > 0) {
      const msg = `You take all loot: ${takenNames.join(', ')}.`;
      logPrivateAndGroup(ctx, character, 'reward', msg, `${character.name} takes all loot.`);
    }
    if (skipped > 0) {
      appendPrivateEvent(ctx, character.id, character.ownerUserId, 'warning', `Backpack full — ${skipped} item(s) left behind.`);
    }

    // Clean up combat results if no loot remains
    const remaining = [...ctx.db.combat_loot.by_character.filter(character.id)];
    if (remaining.length === 0) {
      const combatIds = new Set(allLoot.map((l) => l.combatId));
      for (const combatId of combatIds) {
        for (const result of ctx.db.combat_result.by_owner_user.filter(character.ownerUserId)) {
          if (result.combatId === combatId) {
            ctx.db.combat_result.id.delete(result.id);
          }
        }
      }
    }
  });

  spacetimedb.reducer(
    'equip_item',
    { characterId: t.u64(), itemInstanceId: t.u64() },
    (ctx, args) => {
      const character = requireCharacterOwnedBy(ctx, args.characterId);
      if (activeCombatIdForCharacter(ctx, character.id)) {
        return failItem(ctx, character, 'Cannot change equipment during combat');
      }
      const instance = ctx.db.item_instance.id.find(args.itemInstanceId);
      if (!instance) return failItem(ctx, character, 'Item not found');
      if (instance.ownerCharacterId !== character.id) {
        return failItem(ctx, character, 'Item does not belong to you');
      }
      const template = ctx.db.item_template.id.find(instance.templateId);
      if (!template) return failItem(ctx, character, 'Item template missing');
      // REMOVED per world-tier spec: gear availability is world-driven, not character-level-gated.
      // Any item found in the world can be equipped by any character.
      // if (character.level < template.requiredLevel) return failItem(ctx, character, 'Level too low');
      // Stackable, weapon and armor proficiency (dynamic classes), legacy class list and slot:
      // one shared rule, also used by the client's Equip reason and Usable-by-you filter.
      const check = canEquipItem(template, character);
      if (!check.ok) return failItem(ctx, character, check.message);

      // --- Two-handed weapon enforcement ---
      // If equipping a mainHand weapon that is two-handed, auto-unequip offHand
      if (template.slot === 'mainHand' && template.weaponType && TWO_HANDED_WEAPON_TYPES.has(template.weaponType)) {
        for (const other of ctx.db.item_instance.by_owner.filter(character.id)) {
          if (other.equippedSlot === 'offHand') {
            ctx.db.item_instance.id.update({ ...other, equippedSlot: undefined });
          }
        }
      }
      // If equipping an offHand item, check if mainHand is two-handed and auto-unequip it
      if (template.slot === 'offHand') {
        for (const other of ctx.db.item_instance.by_owner.filter(character.id)) {
          if (other.equippedSlot === 'mainHand') {
            const otherTemplate = ctx.db.item_template.id.find(other.templateId);
            if (otherTemplate && otherTemplate.weaponType && TWO_HANDED_WEAPON_TYPES.has(otherTemplate.weaponType)) {
              ctx.db.item_instance.id.update({ ...other, equippedSlot: undefined });
            }
          }
        }
      }

      for (const other of ctx.db.item_instance.by_owner.filter(character.id)) {
        if (other.equippedSlot === template.slot) {
          ctx.db.item_instance.id.update({ ...other, equippedSlot: undefined });
        }
      }
      ctx.db.item_instance.id.update({ ...instance, equippedSlot: template.slot });
      recomputeCharacterDerived(ctx, character);
    }
  );

  spacetimedb.reducer(
    'unequip_item',
    { characterId: t.u64(), slot: t.string() },
    (ctx, args) => {
      const character = requireCharacterOwnedBy(ctx, args.characterId);
      if (activeCombatIdForCharacter(ctx, character.id)) {
        return failItem(ctx, character, 'Cannot change equipment during combat');
      }
      const slot = args.slot.trim();
      for (const instance of ctx.db.item_instance.by_owner.filter(character.id)) {
        if (instance.equippedSlot === slot) {
          ctx.db.item_instance.id.update({ ...instance, equippedSlot: undefined });
          recomputeCharacterDerived(ctx, character);
          return;
        }
      }
    }
  );

  spacetimedb.reducer('delete_item', { characterId: t.u64(), itemInstanceId: t.u64() }, (ctx, args) => {
    const character = requireCharacterOwnedBy(ctx, args.characterId);
    const instance = ctx.db.item_instance.id.find(args.itemInstanceId);
    if (!instance) return failItem(ctx, character, 'Item not found');
    if (instance.ownerCharacterId !== character.id) {
      return failItem(ctx, character, 'Item does not belong to you');
    }
    if (instance.equippedSlot) return failItem(ctx, character, 'Cannot delete equipped items');
    ctx.db.item_instance.id.delete(instance.id);
    appendPrivateEvent(
      ctx,
      character.id,
      character.ownerUserId,
      'system',
      'You discard the item.'
    );
  });

  spacetimedb.reducer('split_stack', { characterId: t.u64(), itemInstanceId: t.u64(), quantity: t.u64() }, (ctx, args) => {
    const character = requireCharacterOwnedBy(ctx, args.characterId);
    const instance = ctx.db.item_instance.id.find(args.itemInstanceId);
    if (!instance) return failItem(ctx, character, 'Item not found');
    if (instance.ownerCharacterId !== character.id) {
      return failItem(ctx, character, 'Item does not belong to you');
    }
    if (instance.equippedSlot) return failItem(ctx, character, 'Cannot split equipped items');
    const template = ctx.db.item_template.id.find(instance.templateId);
    if (!template) return failItem(ctx, character, 'Item template missing');
    if (!template.stackable) return failItem(ctx, character, 'This item cannot be split.');
    if (instance.quantity <= 1n || args.quantity <= 0n || args.quantity >= instance.quantity) {
      return failItem(ctx, character, 'Invalid split quantity.');
    }
    if (getInventorySlotCount(ctx, character.id) >= MAX_INVENTORY_SLOTS) {
      return failItem(ctx, character, 'Not enough room to split this stack.');
    }
    ctx.db.item_instance.id.update({ ...instance, quantity: instance.quantity - args.quantity });
    ctx.db.item_instance.insert({
      id: 0n,
      templateId: instance.templateId,
      ownerCharacterId: character.id,
      equippedSlot: undefined,
      quantity: args.quantity,
    });
    appendPrivateEvent(
      ctx,
      character.id,
      character.ownerUserId,
      'system',
      `You split off ${args.quantity} ${template.name}.`
    );
  });

  spacetimedb.reducer('consolidate_stacks', { characterId: t.u64() }, (ctx, args) => {
    const character = requireCharacterOwnedBy(ctx, args.characterId);
    // Group all unequipped stackable instances by templateId
    const stacks = new Map<string, any[]>();
    for (const instance of ctx.db.item_instance.by_owner.filter(character.id)) {
      if (instance.equippedSlot) continue;
      const template = ctx.db.item_template.id.find(instance.templateId);
      if (!template || !template.stackable) continue;
      const key = instance.templateId.toString();
      if (!stacks.has(key)) stacks.set(key, []);
      stacks.get(key)!.push(instance);
    }
    let merged = 0;
    for (const [, instances] of stacks) {
      if (instances.length <= 1) continue;
      // Sum all quantities into the first instance, delete the rest
      let totalQty = 0n;
      for (const inst of instances) {
        totalQty += inst.quantity ?? 1n;
      }
      ctx.db.item_instance.id.update({ ...instances[0], quantity: totalQty });
      for (let i = 1; i < instances.length; i++) {
        ctx.db.item_instance.id.delete(instances[i].id);
        merged++;
      }
    }
    if (merged > 0) {
      appendPrivateEvent(ctx, character.id, character.ownerUserId, 'system', `Inventory organized: ${merged} stack(s) consolidated.`);
    } else {
      appendPrivateEvent(ctx, character.id, character.ownerUserId, 'system', 'Inventory organized.');
    }
  });

  // ---------------------------------------------------------------------------
  // Hotbar helpers
  // ---------------------------------------------------------------------------

  // ensureDefaultHotbar imported from helpers/items.ts

  // ---------------------------------------------------------------------------
  // Hotbar reducers
  // ---------------------------------------------------------------------------

  spacetimedb.reducer(
    'create_hotbar',
    { characterId: t.u64(), name: t.string() },
    (ctx, args) => {
      const character = requireCharacterOwnedBy(ctx, args.characterId);
      const existing = [...ctx.db.hotbar.by_character.filter(character.id)];
      if (existing.length >= 10) {
        return failItem(ctx, character, 'You already have 10 hotbars (maximum).');
      }
      for (const h of existing) {
        ctx.db.hotbar.id.update({ ...h, isActive: false });
      }
      ctx.db.hotbar.insert({
        id: 0n,
        characterId: character.id,
        name: args.name,
        sortOrder: existing.length,
        isActive: true,
        createdAt: ctx.timestamp,
      });
      appendPrivateEvent(ctx, character.id, character.ownerUserId, 'system',
        `Hotbar "${args.name}" created and set as active.`);
    }
  );

  spacetimedb.reducer(
    'switch_hotbar',
    { characterId: t.u64(), hotbarName: t.string() },
    (ctx, args) => {
      const character = requireCharacterOwnedBy(ctx, args.characterId);
      const all = [...ctx.db.hotbar.by_character.filter(character.id)];
      const target = all.find((h: any) => h.name.toLowerCase() === args.hotbarName.toLowerCase());
      if (!target) {
        return failItem(ctx, character, `No hotbar named "${args.hotbarName}" found.`);
      }
      for (const h of all) {
        ctx.db.hotbar.id.update({ ...h, isActive: h.id === target.id });
      }
      appendPrivateEvent(ctx, character.id, character.ownerUserId, 'system',
        `Switched to hotbar "${target.name}".`);
    }
  );

  spacetimedb.reducer(
    'delete_hotbar',
    { characterId: t.u64(), hotbarName: t.string() },
    (ctx, args) => {
      const character = requireCharacterOwnedBy(ctx, args.characterId);
      const all = [...ctx.db.hotbar.by_character.filter(character.id)];
      const target = all.find((h: any) => h.name.toLowerCase() === args.hotbarName.toLowerCase());
      if (!target) return failItem(ctx, character, `No hotbar named "${args.hotbarName}" found.`);
      if (all.length <= 1) return failItem(ctx, character, 'Cannot delete your only hotbar.');
      // Delete all slots belonging to this hotbar
      for (const s of [...ctx.db.hotbar_slot.by_hotbar.filter(target.id)]) {
        ctx.db.hotbar_slot.id.delete(s.id);
      }
      ctx.db.hotbar.id.delete(target.id);
      // If was active, activate the first remaining hotbar
      if (target.isActive) {
        const remaining = all.filter((h: any) => h.id !== target.id);
        if (remaining.length > 0) {
          ctx.db.hotbar.id.update({ ...remaining[0], isActive: true });
        }
      }
      appendPrivateEvent(ctx, character.id, character.ownerUserId, 'system',
        `Hotbar "${target.name}" deleted.`);
    }
  );

  spacetimedb.reducer(
    'swap_hotbar_slots',
    { characterId: t.u64(), slot1: t.u8(), slot2: t.u8() },
    (ctx, args) => {
      const character = requireCharacterOwnedBy(ctx, args.characterId);
      const activeHotbar = ensureDefaultHotbar(ctx, character.id);
      const hotbarSlots = [...ctx.db.hotbar_slot.by_hotbar.filter(activeHotbar.id)];
      const s1 = hotbarSlots.find((s: any) => s.slot === args.slot1);
      const s2 = hotbarSlots.find((s: any) => s.slot === args.slot2);
      const id1 = s1?.abilityTemplateId ?? 0n;
      const id2 = s2?.abilityTemplateId ?? 0n;

      if (s1) {
        if (id2 === 0n) {
          ctx.db.hotbar_slot.id.delete(s1.id);
        } else {
          ctx.db.hotbar_slot.id.update({ ...s1, abilityTemplateId: id2, assignedAt: ctx.timestamp });
        }
      } else if (id2 !== 0n) {
        ctx.db.hotbar_slot.insert({
          id: 0n, characterId: character.id, hotbarId: activeHotbar.id,
          slot: args.slot1, abilityTemplateId: id2, assignedAt: ctx.timestamp,
        });
      }

      if (s2) {
        if (id1 === 0n) {
          ctx.db.hotbar_slot.id.delete(s2.id);
        } else {
          ctx.db.hotbar_slot.id.update({ ...s2, abilityTemplateId: id1, assignedAt: ctx.timestamp });
        }
      } else if (id1 !== 0n) {
        ctx.db.hotbar_slot.insert({
          id: 0n, characterId: character.id, hotbarId: activeHotbar.id,
          slot: args.slot2, abilityTemplateId: id1, assignedAt: ctx.timestamp,
        });
      }

      appendPrivateEvent(ctx, character.id, character.ownerUserId, 'system',
        `Hotbar slots ${args.slot1} and ${args.slot2} swapped.`);
    }
  );

  spacetimedb.reducer(
    'set_hotbar_slot',
    { characterId: t.u64(), slot: t.u8(), abilityTemplateId: t.u64() },
    (ctx, args) => {
      const character = requireCharacterOwnedBy(ctx, args.characterId);
      if (args.slot < 1 || args.slot > 10) return failItem(ctx, character, 'Invalid hotbar slot');
      const activeHotbar = ensureDefaultHotbar(ctx, character.id);
      const existing = [...ctx.db.hotbar_slot.by_hotbar.filter(activeHotbar.id)].find(
        (row: any) => row.slot === args.slot
      );
      if (existing) {
        if (!args.abilityTemplateId) {
          ctx.db.hotbar_slot.id.delete(existing.id);
          return;
        }
        ctx.db.hotbar_slot.id.update({
          ...existing,
          abilityTemplateId: args.abilityTemplateId,
          assignedAt: ctx.timestamp,
        });
        return;
      }
      if (!args.abilityTemplateId) return;
      ctx.db.hotbar_slot.insert({
        id: 0n,
        characterId: character.id,
        hotbarId: activeHotbar.id,
        slot: args.slot,
        abilityTemplateId: args.abilityTemplateId,
        assignedAt: ctx.timestamp,
      });
    }
  );

  spacetimedb.reducer(
    'use_ability',
    { characterId: t.u64(), abilityTemplateId: t.u64(), targetCharacterId: t.u64().optional() },
    (ctx, args) => {
      const character = requireCharacterOwnedBy(ctx, args.characterId);
      const _player = ctx.db.player.id.find(ctx.sender);
      if (_player) {
        ctx.db.player.id.update({ ..._player, lastActivityAt: ctx.timestamp });
      }
      if (!args.abilityTemplateId) return failItem(ctx, character, 'Ability required');

      // Look up ability by ID and validate ownership
      const ability = ctx.db.ability_template.id.find(args.abilityTemplateId);
      if (!ability) return failItem(ctx, character, 'Unknown ability');
      if (ability.characterId !== character.id) return failItem(ctx, character, 'Ability not available');

      // Combat state checks: utility abilities only work out of combat
      const combatId = activeCombatIdForCharacter(ctx, character.id);
      if (combatId) {
        if (ability.kind === 'utility') {
          appendPrivateEvent(ctx, character.id, character.ownerUserId, 'ability',
            'This ability can only be used when you are at peace.');
          return;
        }
        // In a fight the use is the player's choice for the open round (Phase 46.1): validated,
        // stored and, once every waited-on player has chosen, resolved by the combat module. The round
        // cooldown decides there; the wall-clock cooldown below is the out-of-combat rule only.
        // deps.submitCombatChoice is read at call time: registerItemReducers runs before
        // registerCombatReducers assigns it.
        deps.submitCombatChoice(ctx, character, {
          actionType: 'ability',
          abilityTemplateId: args.abilityTemplateId,
          targetCharacterId: args.targetCharacterId,
        });
        return;
      }

      const nowMicros = ctx.timestamp.microsSinceUnixEpoch;
      const existingCooldown = [...ctx.db.ability_cooldown.by_character.filter(character.id)].find(
        (row) => row.abilityTemplateId === args.abilityTemplateId
      );
      if (existingCooldown && existingCooldown.startedAtMicros + existingCooldown.durationMicros > nowMicros) {
        appendPrivateEvent(ctx, character.id, character.ownerUserId, 'ability', 'Ability is on cooldown.');
        return;
      }

      // Handle cast time
      const castMicros = abilityCastMicros(ctx, args.abilityTemplateId);
      if (castMicros > 0n) {
        const existingCast = [...ctx.db.character_cast.by_character.filter(character.id)][0];
        if (existingCast && existingCast.endsAtMicros > nowMicros) {
          appendPrivateEvent(ctx, character.id, character.ownerUserId, 'ability', 'Already casting.');
          return;
        }
        if (existingCast) {
          ctx.db.character_cast.id.delete(existingCast.id);
        }
        ctx.db.character_cast.insert({
          id: 0n,
          characterId: character.id,
          abilityTemplateId: args.abilityTemplateId,
          targetCharacterId: args.targetCharacterId,
          endsAtMicros: nowMicros + castMicros,
        });
        appendPrivateEvent(ctx, character.id, character.ownerUserId, 'ability',
          `Casting ${ability.name}...`);
        return;
      }

      try {
        // Resolve target name and emit "You use" message BEFORE execution
        const targetName = args.targetCharacterId
          ? ctx.db.character.id.find(args.targetCharacterId)?.name ?? 'your target'
          : 'yourself';
        appendPrivateEvent(ctx, character.id, character.ownerUserId, 'ability',
          `You use ${ability.name} on ${targetName}.`);

        const executed = executeAbilityAction(ctx, {
          actorType: 'character',
          actorId: character.id,
          abilityTemplateId: args.abilityTemplateId,
          targetCharacterId: args.targetCharacterId,
        });
        if (!executed) {
          appendPrivateEvent(ctx, character.id, character.ownerUserId, 'ability', 'Ability had no effect.');
          return;
        }
        // Apply cooldown only after ability completes successfully
        const cooldown = abilityCooldownMicros(ctx, args.abilityTemplateId);
        if (cooldown > 0n) {
          if (existingCooldown) {
            ctx.db.ability_cooldown.id.update({
              ...existingCooldown,
              startedAtMicros: nowMicros,
              durationMicros: cooldown,
            });
          } else {
            ctx.db.ability_cooldown.insert({
              id: 0n,
              characterId: character.id,
              abilityTemplateId: args.abilityTemplateId,
              startedAtMicros: nowMicros,
              durationMicros: cooldown,
              roundsRemaining: 0n,
            });
          }
        }
      } catch (error) {
        const message = String(error).replace(/^SenderError:\s*/i, '');
        appendPrivateEvent(ctx, character.id, character.ownerUserId, 'ability',
          `Ability failed: ${message}`);
      }
    }
  );

  const CONSUMABLE_COOLDOWN_MICROS = 10_000_000n;
  const BANDAGE_TICK_COUNT = 3n;
  const BANDAGE_TICK_HEAL = 5n;

  spacetimedb.reducer('use_item', { characterId: t.u64(), itemInstanceId: t.u64() }, (ctx, args) => {
    const character = requireCharacterOwnedBy(ctx, args.characterId);
    const instance = ctx.db.item_instance.id.find(args.itemInstanceId);
    if (!instance) return failItem(ctx, character, 'Item not found');
    if (instance.ownerCharacterId !== character.id) {
      return failItem(ctx, character, 'Item does not belong to you');
    }
    const template = ctx.db.item_template.id.find(instance.templateId);
    if (!template) return failItem(ctx, character, 'Item template missing');
    if (activeCombatIdForCharacter(ctx, character.id)) {
      return failItem(ctx, character, 'Cannot use this during combat');
    }
    const itemKey = template.name.toLowerCase().replace(/\s+/g, '_');
    const handledKeys = new Set<string>(USE_ITEM_KEYS);
    if (!handledKeys.has(itemKey)) return failItem(ctx, character, 'Item cannot be used');
    const nowMicros = ctx.timestamp.microsSinceUnixEpoch;
    const existingCooldown = [...ctx.db.item_cooldown.by_character.filter(character.id)].find(
      (row) => row.itemKey === itemKey
    );
    if (existingCooldown && existingCooldown.readyAtMicros > nowMicros) {
      appendPrivateEvent(ctx, character.id, character.ownerUserId, 'system', 'Item is on cooldown.');
      return;
    }
    const currentQty = instance.quantity ?? 1n;
    if (currentQty > 1n) {
      ctx.db.item_instance.id.update({ ...instance, quantity: currentQty - 1n });
    } else {
      ctx.db.item_instance.id.delete(instance.id);
    }
    const setCooldown = (micros: bigint) => {
      if (existingCooldown) {
        ctx.db.item_cooldown.id.update({
          ...existingCooldown,
          readyAtMicros: nowMicros + micros,
        });
      } else {
        ctx.db.item_cooldown.insert({
          id: 0n,
          characterId: character.id,
          itemKey,
          readyAtMicros: nowMicros + micros,
        });
      }
    };

    if (itemKey === 'bandage') {
      const existingEffect = [...ctx.db.character_effect.by_character.filter(character.id)].find(
        (effect) => effect.effectType === 'regen' && effect.sourceAbility === 'Bandage'
      );
      if (existingEffect) {
        ctx.db.character_effect.id.delete(existingEffect.id);
      }
      ctx.db.character_effect.insert({
        id: 0n,
        characterId: character.id,
        effectType: 'regen',
        magnitude: BANDAGE_TICK_HEAL,
        roundsRemaining: BANDAGE_TICK_COUNT,
        sourceAbility: 'Bandage',
      });
      setCooldown(CONSUMABLE_COOLDOWN_MICROS);
      appendPrivateEvent(
        ctx,
        character.id,
        character.ownerUserId,
        'heal',
        'You apply a bandage and begin to recover.'
      );
      return;
    }

    if (itemKey === 'basic_poultice') {
      const existingEffect = [...ctx.db.character_effect.by_character.filter(character.id)].find(
        (effect) => effect.effectType === 'stamina_regen' && effect.sourceAbility === 'Basic Poultice'
      );
      if (existingEffect) ctx.db.character_effect.id.delete(existingEffect.id);
      ctx.db.character_effect.insert({
        id: 0n,
        characterId: character.id,
        effectType: 'stamina_regen',
        magnitude: 4n,
        roundsRemaining: 3n,
        sourceAbility: 'Basic Poultice',
      });
      setCooldown(CONSUMABLE_COOLDOWN_MICROS);
      appendPrivateEvent(
        ctx,
        character.id,
        character.ownerUserId,
        'heal',
        'You apply a basic poultice and steady your stamina.'
      );
      return;
    }

    if (itemKey === 'simple_rations') {
      const existingEffect = [...ctx.db.character_effect.by_character.filter(character.id)].find(
        (effect) => effect.effectType === 'regen' && effect.sourceAbility === 'Simple Rations'
      );
      if (existingEffect) {
        ctx.db.character_effect.id.delete(existingEffect.id);
      }
      ctx.db.character_effect.insert({
        id: 0n,
        characterId: character.id,
        effectType: 'regen',
        magnitude: 1n,
        roundsRemaining: 10n,
        sourceAbility: 'Simple Rations',
      });
      setCooldown(CONSUMABLE_COOLDOWN_MICROS);
      appendPrivateEvent(
        ctx,
        character.id,
        character.ownerUserId,
        'heal',
        'You eat the simple rations and feel a little better.'
      );
      return;
    }

    if (itemKey === 'travelers_tea') {
      const existingEffect = [...ctx.db.character_effect.by_character.filter(character.id)].find(
        (effect) => effect.effectType === 'mana_regen' && effect.sourceAbility === 'Travelers Tea'
      );
      if (existingEffect) ctx.db.character_effect.id.delete(existingEffect.id);
      ctx.db.character_effect.insert({
        id: 0n,
        characterId: character.id,
        effectType: 'mana_regen',
        magnitude: 4n,
        roundsRemaining: 3n,
        sourceAbility: 'Travelers Tea',
      });
      setCooldown(CONSUMABLE_COOLDOWN_MICROS);
      appendPrivateEvent(
        ctx,
        character.id,
        character.ownerUserId,
        'heal',
        'You sip travelers tea and feel your focus return.'
      );
      return;
    }

    appendPrivateEvent(
      ctx,
      character.id,
      character.ownerUserId,
      'system',
      `You use ${template.name}, but nothing happens.`
    );
  });


};
