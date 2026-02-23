import { buildDisplayName } from '../helpers/items';
import { RENOWN_PERK_POOLS } from '../data/renown_data';
import { getPerkBonusByField } from '../helpers/renown';

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
    isClassAllowed,
    isArmorAllowedForClass,
    recomputeCharacterDerived,
    executeAbilityAction,
    executePerkAbility,
    appendPrivateEvent,
    appendGroupEvent,
    abilityCooldownMicros,
    abilityCastMicros,
    activeCombatIdForCharacter,
    addItemToInventory,
    logPrivateAndGroup,
    requirePullerOrLog,
    getInventorySlotCount,
    MAX_INVENTORY_SLOTS,
    ensureStarterItemTemplates,
    ensureResourceItemTemplates,
    ensureLootTables,
    ensureVendorInventory,
    ensureAbilityTemplates,
    ensureRecipeTemplates,
    ensureNpcs,
    ensureQuestTemplates,
    ensureEnemyTemplatesAndRoles,
    ensureEnemyAbilities,
    ensureWorldLayout,
    ensureLocationEnemyTemplates,
    ensureLocationRuntimeBootstrap,
    syncAllContent,
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
      ctx.db.itemTemplate.insert({
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
    const template = ctx.db.itemTemplate.id.find(args.templateId);
    if (!template) return failItem(ctx, character, 'Item template not found');
    addItemToInventory(ctx, character.id, template.id, 1n);
  });

  spacetimedb.reducer(
    'buy_item',
    { characterId: t.u64(), npcId: t.u64(), itemTemplateId: t.u64() },
    (ctx, args) => {
      const character = requireCharacterOwnedBy(ctx, args.characterId);
      const vendorItem = ctx.db.vendorInventory
        .by_vendor
        .filter(args.npcId)
        .find((row) => row.itemTemplateId === args.itemTemplateId);
      if (!vendorItem) return failItem(ctx, character, 'Item not sold by this vendor');
      const template = ctx.db.itemTemplate.id.find(args.itemTemplateId);
      if (!template) return failItem(ctx, character, 'Item template missing');
      const itemCount = [...ctx.db.itemInstance.by_owner.filter(character.id)].filter((row) => !row.equippedSlot).length;
      const hasStack =
        template.stackable &&
        [...ctx.db.itemInstance.by_owner.filter(character.id)].some(
          (row) => row.templateId === template.id && !row.equippedSlot
        );
      if (!hasStack && itemCount >= MAX_INVENTORY_SLOTS) return failItem(ctx, character, 'Backpack is full');
      // Apply vendor buy discount perk
      const vendorBuyDiscount = getPerkBonusByField(ctx, character.id, 'vendorBuyDiscount', character.level);
      let finalPrice = vendorItem.price;
      let discountMsg = '';
      if (vendorBuyDiscount > 0) {
        finalPrice = (vendorItem.price * BigInt(100 - Math.min(vendorBuyDiscount, 50))) / 100n;
        if (finalPrice < 1n) finalPrice = 1n;
        discountMsg = ` (${vendorBuyDiscount}% perk discount)`;
      }
      // Apply CHA vendor buy discount (character.vendorBuyMod is on 1000-scale)
      if (character.vendorBuyMod > 0n) {
        finalPrice = (finalPrice * (1000n - character.vendorBuyMod)) / 1000n;
        if (finalPrice < 1n) finalPrice = 1n;
      }
      if ((character.gold ?? 0n) < finalPrice) return failItem(ctx, character, 'Not enough gold');
      ctx.db.character.id.update({
        ...character,
        gold: (character.gold ?? 0n) - finalPrice,
      });
      addItemToInventory(ctx, character.id, template.id, 1n);
      appendPrivateEvent(
        ctx,
        character.id,
        character.ownerUserId,
        'reward',
        `You buy ${template.name} for ${finalPrice} gold.${discountMsg}`
      );
    }
  );

  spacetimedb.reducer(
    'sell_item',
    { characterId: t.u64(), itemInstanceId: t.u64(), npcId: t.u64() },
    (ctx, args) => {
      const character = requireCharacterOwnedBy(ctx, args.characterId);
      const instance = ctx.db.itemInstance.id.find(args.itemInstanceId);
      if (!instance) return failItem(ctx, character, 'Item not found');
      if (instance.ownerCharacterId !== character.id) {
        return failItem(ctx, character, 'Item does not belong to you');
      }
      if (instance.equippedSlot) return failItem(ctx, character, 'Unequip item first');
      const template = ctx.db.itemTemplate.id.find(instance.templateId);
      if (!template) return failItem(ctx, character, 'Item template missing');
      const baseValue = BigInt(template.vendorValue ?? 0) * BigInt(instance.quantity ?? 1);
      // Apply vendor sell bonus perk
      const vendorSellBonus = getPerkBonusByField(ctx, character.id, 'vendorSellBonus', character.level);
      let value = baseValue;
      let sellBonusMsg = '';
      if (vendorSellBonus > 0 && baseValue > 0n) {
        value = (baseValue * BigInt(100 + vendorSellBonus)) / 100n;
        sellBonusMsg = ` (${vendorSellBonus}% perk bonus)`;
      }
      // Apply CHA vendor sell bonus (character.vendorSellMod is on 1000-scale)
      if (character.vendorSellMod > 0n) {
        value = (value * (1000n + character.vendorSellMod)) / 1000n;
      }
      // Capture template info before deletion
      const soldTemplateId = instance.templateId;
      const soldVendorValue = template.vendorValue ?? 0n;
      const soldQualityTier = instance.qualityTier ?? undefined;
      // Clean up any affixes before deleting the item instance
      for (const affix of ctx.db.itemAffix.by_instance.filter(instance.id)) {
        ctx.db.itemAffix.id.delete(affix.id);
      }
      ctx.db.itemInstance.id.delete(instance.id);
      ctx.db.character.id.update({
        ...character,
        gold: (character.gold ?? 0n) + value,
      });
      // Add sold item to the vendor's inventory so other players can buy it
      const npc = ctx.db.npc.id.find(args.npcId);
      if (npc && npc.npcType === 'vendor') {
        const alreadyListed = [...ctx.db.vendorInventory.by_vendor.filter(args.npcId)].find(
          (row) => row.itemTemplateId === soldTemplateId && (row.qualityTier ?? undefined) === soldQualityTier
        );
        if (!alreadyListed) {
          // Price at 2x vendorValue (what the vendor paid per unit)
          const resalePrice = soldVendorValue > 0n ? soldVendorValue * 2n : 10n;
          ctx.db.vendorInventory.insert({
            id: 0n,
            npcId: args.npcId,
            itemTemplateId: soldTemplateId,
            price: resalePrice,
            qualityTier: soldQualityTier,
          });
        }
      }
      appendPrivateEvent(
        ctx,
        character.id,
        character.ownerUserId,
        'reward',
        `You sell ${template.name} for ${value} gold.${sellBonusMsg}`
      );
    }
  );

  spacetimedb.reducer('sell_all_junk', { characterId: t.u64() }, (ctx, args) => {
    const character = requireCharacterOwnedBy(ctx, args.characterId);
    let total = 0n;
    for (const instance of ctx.db.itemInstance.by_owner.filter(character.id)) {
      if (instance.equippedSlot) continue;
      const template = ctx.db.itemTemplate.id.find(instance.templateId);
      if (!template || !template.isJunk) continue;
      total += (template.vendorValue ?? 0n) * (instance.quantity ?? 1n);
      ctx.db.itemInstance.id.delete(instance.id);
    }
    if (total > 0n) {
      ctx.db.character.id.update({
        ...character,
        gold: (character.gold ?? 0n) + total,
      });
    }
    appendPrivateEvent(
      ctx,
      character.id,
      character.ownerUserId,
      'reward',
      `You sell all junk for ${total} gold.`
    );
  });

  spacetimedb.reducer('take_loot', { characterId: t.u64(), lootId: t.u64() }, (ctx, args) => {
    const character = requireCharacterOwnedBy(ctx, args.characterId);
    const loot = ctx.db.combatLoot.id.find(args.lootId);
    if (!loot) return failItem(ctx, character, 'Loot not found');
    if (loot.characterId !== character.id || loot.ownerUserId !== character.ownerUserId) {
      return failItem(ctx, character, 'Loot does not belong to you');
    }
    const itemCount = [...ctx.db.itemInstance.by_owner.filter(character.id)].filter((row) => !row.equippedSlot).length;
    const template = ctx.db.itemTemplate.id.find(loot.itemTemplateId);
    if (!template) return failItem(ctx, character, 'Item template missing');
    const hasStack =
      template.stackable &&
      [...ctx.db.itemInstance.by_owner.filter(character.id)].some(
        (row) => row.templateId === template.id && !row.equippedSlot
      );
    if (!hasStack && itemCount >= MAX_INVENTORY_SLOTS) return failItem(ctx, character, 'Backpack is full');
    addItemToInventory(ctx, character.id, template.id, 1n);

    // Apply affix data if this is a non-common quality item
    let displayName = template.name;
    if (loot.qualityTier && loot.qualityTier !== 'common') {
      // Find the newly created ItemInstance — most recent one for this character+template with no qualityTier
      const instances = [...ctx.db.itemInstance.by_owner.filter(character.id)];
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
          ctx.db.itemAffix.insert({
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
        ctx.db.itemInstance.id.update({
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
      const instances = [...ctx.db.itemInstance.by_owner.filter(character.id)];
      const newInstance = instances.find(
        (i) => i.templateId === loot.itemTemplateId && !i.equippedSlot && !i.qualityTier
      );
      if (newInstance) {
        ctx.db.itemInstance.id.update({ ...newInstance, craftQuality: loot.craftQuality });
      }
    }

    ctx.db.combatLoot.id.delete(loot.id);
    logPrivateAndGroup(
      ctx,
      character,
      'reward',
      `You receive ${displayName}.`,
      `${character.name} takes ${displayName}.`
    );

    // Check if this character has any remaining loot for this combat
    const myRemainingLoot = [...ctx.db.combatLoot.by_character.filter(character.id)]
      .filter(row => row.combatId === loot.combatId);
    if (myRemainingLoot.length === 0) {
      // Delete only this character's result for this combat
      for (const result of ctx.db.combatResult.by_owner_user.filter(character.ownerUserId)) {
        if (result.combatId === loot.combatId) {
          ctx.db.combatResult.id.delete(result.id);
        }
      }
    }
  });

  spacetimedb.reducer('take_all_loot', { characterId: t.u64() }, (ctx, args) => {
    const character = requireCharacterOwnedBy(ctx, args.characterId);
    const allLoot = [...ctx.db.combatLoot.by_character.filter(character.id)];
    if (allLoot.length === 0) return;

    const takenNames: string[] = [];
    let skipped = 0;

    for (const loot of allLoot) {
      const itemCount = [...ctx.db.itemInstance.by_owner.filter(character.id)].filter((row) => !row.equippedSlot).length;
      const template = ctx.db.itemTemplate.id.find(loot.itemTemplateId);
      if (!template) continue;
      const hasStack =
        template.stackable &&
        [...ctx.db.itemInstance.by_owner.filter(character.id)].some(
          (row) => row.templateId === template.id && !row.equippedSlot
        );
      if (!hasStack && itemCount >= MAX_INVENTORY_SLOTS) {
        skipped++;
        continue;
      }

      addItemToInventory(ctx, character.id, template.id, 1n);

      let displayName = template.name;
      if (loot.qualityTier && loot.qualityTier !== 'common') {
        const instances = [...ctx.db.itemInstance.by_owner.filter(character.id)];
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
            ctx.db.itemAffix.insert({
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
          ctx.db.itemInstance.id.update({
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
        const instances = [...ctx.db.itemInstance.by_owner.filter(character.id)];
        const newInstance = instances.find(
          (i) => i.templateId === loot.itemTemplateId && !i.equippedSlot && !i.qualityTier
        );
        if (newInstance) {
          ctx.db.itemInstance.id.update({ ...newInstance, craftQuality: loot.craftQuality });
        }
      }

      ctx.db.combatLoot.id.delete(loot.id);
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
    const remaining = [...ctx.db.combatLoot.by_character.filter(character.id)];
    if (remaining.length === 0) {
      const combatIds = new Set(allLoot.map((l) => l.combatId));
      for (const combatId of combatIds) {
        for (const result of ctx.db.combatResult.by_owner_user.filter(character.ownerUserId)) {
          if (result.combatId === combatId) {
            ctx.db.combatResult.id.delete(result.id);
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
      const instance = ctx.db.itemInstance.id.find(args.itemInstanceId);
      if (!instance) return failItem(ctx, character, 'Item not found');
      if (instance.ownerCharacterId !== character.id) {
        return failItem(ctx, character, 'Item does not belong to you');
      }
      const template = ctx.db.itemTemplate.id.find(instance.templateId);
      if (!template) return failItem(ctx, character, 'Item template missing');
      if (template.stackable) return failItem(ctx, character, 'Cannot equip this item');
      // REMOVED per world-tier spec: gear availability is world-driven, not character-level-gated.
      // Any item found in the world can be equipped by any character.
      // if (character.level < template.requiredLevel) return failItem(ctx, character, 'Level too low');
      if (!isClassAllowed(template.allowedClasses, character.className)) {
        const isWeaponSlot = template.slot === 'mainHand' || template.slot === 'offHand';
        return failItem(ctx, character, isWeaponSlot ? 'Weapon type not allowed for this class' : 'Class cannot use this item');
      }
      if (template.armorType !== 'none' && !isArmorAllowedForClass(character.className, template.armorType)) {
        return failItem(ctx, character, 'Armor type not allowed for this class');
      }
      if (!EQUIPMENT_SLOTS.has(template.slot)) return failItem(ctx, character, 'Invalid slot');

      for (const other of ctx.db.itemInstance.by_owner.filter(character.id)) {
        if (other.equippedSlot === template.slot) {
          ctx.db.itemInstance.id.update({ ...other, equippedSlot: undefined });
        }
      }
      ctx.db.itemInstance.id.update({ ...instance, equippedSlot: template.slot });
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
      for (const instance of ctx.db.itemInstance.by_owner.filter(character.id)) {
        if (instance.equippedSlot === slot) {
          ctx.db.itemInstance.id.update({ ...instance, equippedSlot: undefined });
          recomputeCharacterDerived(ctx, character);
          return;
        }
      }
    }
  );

  spacetimedb.reducer('delete_item', { characterId: t.u64(), itemInstanceId: t.u64() }, (ctx, args) => {
    const character = requireCharacterOwnedBy(ctx, args.characterId);
    const instance = ctx.db.itemInstance.id.find(args.itemInstanceId);
    if (!instance) return failItem(ctx, character, 'Item not found');
    if (instance.ownerCharacterId !== character.id) {
      return failItem(ctx, character, 'Item does not belong to you');
    }
    if (instance.equippedSlot) return failItem(ctx, character, 'Cannot delete equipped items');
    ctx.db.itemInstance.id.delete(instance.id);
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
    const instance = ctx.db.itemInstance.id.find(args.itemInstanceId);
    if (!instance) return failItem(ctx, character, 'Item not found');
    if (instance.ownerCharacterId !== character.id) {
      return failItem(ctx, character, 'Item does not belong to you');
    }
    if (instance.equippedSlot) return failItem(ctx, character, 'Cannot split equipped items');
    const template = ctx.db.itemTemplate.id.find(instance.templateId);
    if (!template) return failItem(ctx, character, 'Item template missing');
    if (!template.stackable) return failItem(ctx, character, 'This item cannot be split.');
    if (instance.quantity <= 1n || args.quantity <= 0n || args.quantity >= instance.quantity) {
      return failItem(ctx, character, 'Invalid split quantity.');
    }
    if (getInventorySlotCount(ctx, character.id) >= MAX_INVENTORY_SLOTS) {
      return failItem(ctx, character, 'Not enough room to split this stack.');
    }
    ctx.db.itemInstance.id.update({ ...instance, quantity: instance.quantity - args.quantity });
    ctx.db.itemInstance.insert({
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
    for (const instance of ctx.db.itemInstance.by_owner.filter(character.id)) {
      if (instance.equippedSlot) continue;
      const template = ctx.db.itemTemplate.id.find(instance.templateId);
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
      ctx.db.itemInstance.id.update({ ...instances[0], quantity: totalQty });
      for (let i = 1; i < instances.length; i++) {
        ctx.db.itemInstance.id.delete(instances[i].id);
        merged++;
      }
    }
    if (merged > 0) {
      appendPrivateEvent(ctx, character.id, character.ownerUserId, 'system', `Inventory organized: ${merged} stack(s) consolidated.`);
    } else {
      appendPrivateEvent(ctx, character.id, character.ownerUserId, 'system', 'Inventory organized.');
    }
  });

  spacetimedb.reducer(
    'set_hotbar_slot',
    { characterId: t.u64(), slot: t.u8(), abilityKey: t.string() },
    (ctx, args) => {
      const character = requireCharacterOwnedBy(ctx, args.characterId);
      if (args.slot < 1 || args.slot > 10) return failItem(ctx, character, 'Invalid hotbar slot');
      const existing = [...ctx.db.hotbarSlot.by_character.filter(character.id)].find(
        (row) => row.slot === args.slot
      );
      if (existing) {
        if (!args.abilityKey) {
          ctx.db.hotbarSlot.id.delete(existing.id);
          return;
        }
        ctx.db.hotbarSlot.id.update({
          ...existing,
          abilityKey: args.abilityKey.trim(),
          assignedAt: ctx.timestamp,
        });
        return;
      }
      if (!args.abilityKey) return;
      ctx.db.hotbarSlot.insert({
        id: 0n,
        characterId: character.id,
        slot: args.slot,
        abilityKey: args.abilityKey.trim(),
        assignedAt: ctx.timestamp,
      });
    }
  );

  spacetimedb.reducer(
    'use_ability',
    { characterId: t.u64(), abilityKey: t.string(), targetCharacterId: t.u64().optional() },
    (ctx, args) => {
      const character = requireCharacterOwnedBy(ctx, args.characterId);
      const _player = ctx.db.player.id.find(ctx.sender);
      if (_player) {
        ctx.db.player.id.update({ ..._player, lastActivityAt: ctx.timestamp });
      }
      const abilityKey = args.abilityKey.trim();
      if (!abilityKey) return failItem(ctx, character, 'Ability required');
      const nowMicros = ctx.timestamp.microsSinceUnixEpoch;
      const existingCooldown = [...ctx.db.abilityCooldown.by_character.filter(character.id)].find(
        (row) => row.abilityKey === abilityKey
      );
      if (existingCooldown && existingCooldown.startedAtMicros + existingCooldown.durationMicros > nowMicros) {
        appendPrivateEvent(
          ctx,
          character.id,
          character.ownerUserId,
          'ability',
          'Ability is on cooldown.'
        );
        return;
      }
      const abilityRow = [...ctx.db.abilityTemplate.by_key.filter(abilityKey)][0];
      const combatState = abilityRow?.combatState ?? 'any';
      const castMicros = abilityCastMicros(ctx, abilityKey);
      const combatId = activeCombatIdForCharacter(ctx, character.id);
      if (combatState === 'combat_only' && !combatId) {
        appendPrivateEvent(
          ctx,
          character.id,
          character.ownerUserId,
          'ability',
          'You must be engaged in battle to use this ability.'
        );
        return;
      }
      if (combatState === 'out_of_combat_only' && combatId) {
        appendPrivateEvent(
          ctx,
          character.id,
          character.ownerUserId,
          'ability',
          'This ability can only be used when you are at peace.'
        );
        return;
      }
      if (combatId) {
        const participant = [...ctx.db.combatParticipant.by_combat.filter(combatId)].find(
          (row) => row.characterId === character.id
        );
        if (!participant || participant.status !== 'active') {
          appendPrivateEvent(
            ctx,
            character.id,
            character.ownerUserId,
            'ability',
            'Cannot cast right now.'
          );
          return;
        }
      }
      if (castMicros > 0n) {
        const existingCast = [...ctx.db.characterCast.by_character.filter(character.id)][0];
        if (existingCast && existingCast.endsAtMicros > nowMicros) {
          appendPrivateEvent(
            ctx,
            character.id,
            character.ownerUserId,
            'ability',
            'Already casting.'
          );
          return;
        }
        if (existingCast) {
          ctx.db.characterCast.id.delete(existingCast.id);
        }
        ctx.db.characterCast.insert({
          id: 0n,
          characterId: character.id,
          abilityKey,
          targetCharacterId: args.targetCharacterId,
          endsAtMicros: nowMicros + castMicros,
        });
        appendPrivateEvent(
          ctx,
          character.id,
          character.ownerUserId,
          'ability',
          `Casting ${abilityKey.replace(/_/g, ' ')}...`
        );
        return;
      }
      // Block ranger_track for non-pullers in groups
      if (abilityKey === 'ranger_track') {
        const pullerResult = requirePullerOrLog(ctx, character, fail, 'You must be the puller to use this ability.');
        if (!pullerResult.ok) return;
      }
      // Route perk_ abilities to perk ability handler
      if (abilityKey.startsWith('perk_')) {
        try {
          executePerkAbility(ctx, character, abilityKey);
          // Record cooldown for perk ability using cooldownSeconds from perk data
          // Look up perk cooldown from perk data
          let perkCooldownMicros = 300_000_000n; // default 5 min
          const perkRawKey = abilityKey.replace(/^perk_/, '');
          for (const rankNum in RENOWN_PERK_POOLS) {
            const pool = RENOWN_PERK_POOLS[Number(rankNum)];
            const found = pool.find((p) => p.key === perkRawKey);
            if (found && found.effect.cooldownSeconds) {
              perkCooldownMicros = BigInt(found.effect.cooldownSeconds) * 1_000_000n;
              break;
            }
          }
          if (existingCooldown) {
            ctx.db.abilityCooldown.id.update({
              ...existingCooldown,
              startedAtMicros: nowMicros,
              durationMicros: perkCooldownMicros,
            });
          } else {
            ctx.db.abilityCooldown.insert({
              id: 0n,
              characterId: character.id,
              abilityKey,
              startedAtMicros: nowMicros,
              durationMicros: perkCooldownMicros,
            });
          }
        } catch (error) {
          const message = String(error).replace(/^SenderError:\s*/i, '');
          appendPrivateEvent(ctx, character.id, character.ownerUserId, 'ability', 'Ability failed: ' + message);
        }
        return;
      }

      // Bard song turn-off: clicking the active song again stops it and applies a 6s cooldown
      const BARD_SONG_KEYS = ['bard_discordant_note', 'bard_melody_of_mending', 'bard_chorus_of_vigor', 'bard_march_of_wayfarers', 'bard_requiem_of_ruin'];
      if (BARD_SONG_KEYS.includes(abilityKey)) {
        const activeSong = [...ctx.db.activeBardSong.by_bard.filter(character.id)].find((r: any) => !r.isFading);
        if (activeSong && activeSong.songKey === abilityKey) {
          ctx.db.activeBardSong.id.delete(activeSong.id);
          const songDisplayNames: Record<string, string> = {
            bard_discordant_note: 'Discordant Note',
            bard_melody_of_mending: 'Melody of Mending',
            bard_chorus_of_vigor: 'Chorus of Vigor',
            bard_march_of_wayfarers: 'March of Wayfarers',
            bard_requiem_of_ruin: 'Requiem of Ruin',
          };
          appendPrivateEvent(ctx, character.id, character.ownerUserId, 'ability',
            `You stop singing ${songDisplayNames[abilityKey] ?? abilityKey}.`
          );
          const offCooldownMicros = 3_000_000n;
          if (existingCooldown) {
            ctx.db.abilityCooldown.id.update({ ...existingCooldown, startedAtMicros: nowMicros, durationMicros: offCooldownMicros });
          } else {
            ctx.db.abilityCooldown.insert({ id: 0n, characterId: character.id, abilityKey, startedAtMicros: nowMicros, durationMicros: offCooldownMicros });
          }
          return;
        }
        // SWITCH: different song clicked while one is active — apply 3s cooldown to the old song
        if (activeSong && activeSong.songKey !== abilityKey) {
          const prevSongKey = activeSong.songKey;
          const prevCooldown = [...ctx.db.abilityCooldown.by_character.filter(character.id)]
            .find((r: any) => r.abilityKey === prevSongKey);
          if (prevCooldown) {
            ctx.db.abilityCooldown.id.update({ ...prevCooldown, startedAtMicros: nowMicros, durationMicros: 3_000_000n });
          } else {
            ctx.db.abilityCooldown.insert({ id: 0n, characterId: character.id, abilityKey: prevSongKey, startedAtMicros: nowMicros, durationMicros: 3_000_000n });
          }
          // Fall through to executeAbilityAction for the new song
        }
      }

      try {
        const executed = executeAbilityAction(ctx, {
          actorType: 'character',
          actorId: character.id,
          abilityKey,
          targetCharacterId: args.targetCharacterId,
        });
        if (!executed) {
          appendPrivateEvent(ctx, character.id, character.ownerUserId, 'ability', 'Ability had no effect.');
          return;
        }
        const combatId = activeCombatIdForCharacter(ctx, character.id);
        let targetName = args.targetCharacterId
          ? ctx.db.character.id.find(args.targetCharacterId)?.name ?? 'your target'
          : 'yourself';
        if (combatId && !args.targetCharacterId) {
          const enemies = [...ctx.db.combatEnemy.by_combat.filter(combatId)];
          const preferred = character.combatTargetEnemyId
            ? enemies.find((row) => row.id === character.combatTargetEnemyId)
            : null;
          const enemy = preferred ?? enemies.find((row) => row.currentHp > 0n) ?? enemies[0];
          if (enemy) {
            const template = ctx.db.enemyTemplate.id.find(enemy.enemyTemplateId);
            targetName = template?.name ?? 'enemy';
          }
        }
        // Bard songs self-log "You begin singing X" from within executeAbilityAction; skip the generic "You use X on Y" message for them.
        const BARD_SONG_KEYS = ['bard_discordant_note', 'bard_melody_of_mending', 'bard_chorus_of_vigor', 'bard_march_of_wayfarers', 'bard_requiem_of_ruin'];
        if (!BARD_SONG_KEYS.includes(abilityKey)) {
          appendPrivateEvent(
            ctx,
            character.id,
            character.ownerUserId,
            'ability',
            `You use ${abilityKey.replace(/_/g, ' ')} on ${targetName}.`
          );
        }
        // Apply cooldown only after ability completes successfully
        const cooldown = abilityCooldownMicros(ctx, abilityKey);
        if (cooldown > 0n) {
          if (existingCooldown) {
            ctx.db.abilityCooldown.id.update({
              ...existingCooldown,
              startedAtMicros: nowMicros,
              durationMicros: cooldown,
            });
          } else {
            ctx.db.abilityCooldown.insert({
              id: 0n,
              characterId: character.id,
              abilityKey,
              startedAtMicros: nowMicros,
              durationMicros: cooldown,
            });
          }
        }
      } catch (error) {
        const message = String(error).replace(/^SenderError:\s*/i, '');
        appendPrivateEvent(
          ctx,
          character.id,
          character.ownerUserId,
          'ability',
          `Ability failed: ${message}`
        );
      }
    }
  );

  const CONSUMABLE_COOLDOWN_MICROS = 10_000_000n;
  const BANDAGE_TICK_COUNT = 3n;
  const BANDAGE_TICK_HEAL = 5n;

  spacetimedb.reducer('use_item', { characterId: t.u64(), itemInstanceId: t.u64() }, (ctx, args) => {
    const character = requireCharacterOwnedBy(ctx, args.characterId);
    const instance = ctx.db.itemInstance.id.find(args.itemInstanceId);
    if (!instance) return failItem(ctx, character, 'Item not found');
    if (instance.ownerCharacterId !== character.id) {
      return failItem(ctx, character, 'Item does not belong to you');
    }
    const template = ctx.db.itemTemplate.id.find(instance.templateId);
    if (!template) return failItem(ctx, character, 'Item template missing');
    if (activeCombatIdForCharacter(ctx, character.id)) {
      return failItem(ctx, character, 'Cannot use this during combat');
    }
    const itemKey = template.name.toLowerCase().replace(/\s+/g, '_');
    const handledKeys = new Set([
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
    ]);
    if (!handledKeys.has(itemKey)) return failItem(ctx, character, 'Item cannot be used');
    const nowMicros = ctx.timestamp.microsSinceUnixEpoch;
    const existingCooldown = [...ctx.db.itemCooldown.by_character.filter(character.id)].find(
      (row) => row.itemKey === itemKey
    );
    if (existingCooldown && existingCooldown.readyAtMicros > nowMicros) {
      appendPrivateEvent(ctx, character.id, character.ownerUserId, 'system', 'Item is on cooldown.');
      return;
    }
    const currentQty = instance.quantity ?? 1n;
    if (currentQty > 1n) {
      ctx.db.itemInstance.id.update({ ...instance, quantity: currentQty - 1n });
    } else {
      ctx.db.itemInstance.id.delete(instance.id);
    }
    const setCooldown = (micros: bigint) => {
      if (existingCooldown) {
        ctx.db.itemCooldown.id.update({
          ...existingCooldown,
          readyAtMicros: nowMicros + micros,
        });
      } else {
        ctx.db.itemCooldown.insert({
          id: 0n,
          characterId: character.id,
          itemKey,
          readyAtMicros: nowMicros + micros,
        });
      }
    };

    if (itemKey === 'bandage') {
      const existingEffect = [...ctx.db.characterEffect.by_character.filter(character.id)].find(
        (effect) => effect.effectType === 'regen' && effect.sourceAbility === 'Bandage'
      );
      if (existingEffect) {
        ctx.db.characterEffect.id.delete(existingEffect.id);
      }
      ctx.db.characterEffect.insert({
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
      const existingEffect = [...ctx.db.characterEffect.by_character.filter(character.id)].find(
        (effect) => effect.effectType === 'stamina_regen' && effect.sourceAbility === 'Basic Poultice'
      );
      if (existingEffect) ctx.db.characterEffect.id.delete(existingEffect.id);
      ctx.db.characterEffect.insert({
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
      const existingEffect = [...ctx.db.characterEffect.by_character.filter(character.id)].find(
        (effect) => effect.effectType === 'regen' && effect.sourceAbility === 'Simple Rations'
      );
      if (existingEffect) {
        ctx.db.characterEffect.id.delete(existingEffect.id);
      }
      ctx.db.characterEffect.insert({
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
      const existingEffect = [...ctx.db.characterEffect.by_character.filter(character.id)].find(
        (effect) => effect.effectType === 'mana_regen' && effect.sourceAbility === 'Travelers Tea'
      );
      if (existingEffect) ctx.db.characterEffect.id.delete(existingEffect.id);
      ctx.db.characterEffect.insert({
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

  spacetimedb.reducer('sync_equipment_tables', (ctx) => {
    requirePlayerUserId(ctx);
    ensureStarterItemTemplates(ctx);
    ensureVendorInventory(ctx);
  });

  spacetimedb.reducer('sync_loot_tables', (ctx) => {
    requirePlayerUserId(ctx);
    ensureLootTables(ctx);
  });

  spacetimedb.reducer('sync_enemy_content', (ctx) => {
    requirePlayerUserId(ctx);
    ensureEnemyTemplatesAndRoles(ctx);
    ensureEnemyAbilities(ctx);
    ensureLocationEnemyTemplates(ctx);
  });

  spacetimedb.reducer('sync_world_layout', (ctx) => {
    requirePlayerUserId(ctx);
    ensureWorldLayout(ctx);
    ensureLocationRuntimeBootstrap(ctx);
  });

  spacetimedb.reducer('sync_ability_templates', (ctx) => {
    requirePlayerUserId(ctx);
    ensureAbilityTemplates(ctx);
  });

  spacetimedb.reducer('sync_recipe_templates', (ctx) => {
    requirePlayerUserId(ctx);
    ensureRecipeTemplates(ctx);
  });

  spacetimedb.reducer('sync_npc_quest_content', (ctx) => {
    requirePlayerUserId(ctx);
    ensureNpcs(ctx);
    ensureQuestTemplates(ctx);
  });

  spacetimedb.reducer('sync_all_content', (ctx) => {
    requirePlayerUserId(ctx);
    syncAllContent(ctx);
  });


};
