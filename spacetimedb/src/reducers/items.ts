import { buildDisplayName, findItemTemplateByName } from '../helpers/items';
import { RENOWN_PERK_POOLS } from '../data/renown_data';
import { getPerkBonusByField } from '../helpers/renown';
import { getMaterialForSalvage, SALVAGE_YIELD_BY_TIER, MATERIAL_DEFS, materialTierToCraftQuality, getCraftQualityStatBonus, CRAFTING_MODIFIER_DEFS, AFFIX_SLOTS_BY_QUALITY, ESSENCE_MAGNITUDE, ESSENCE_QUALITY_GATE, getModifierMagnitude } from '../data/crafting_materials';

export const registerItemReducers = (deps: any) => {
  const {
    spacetimedb,
    t,
    SenderError,
    ScheduleAt,
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
    removeItemFromInventory,
    getItemCount,
    logPrivateAndGroup,
    startCombatForSpawn,
    effectiveGroupId,
    requirePullerOrLog,
    getGroupParticipants,
    getInventorySlotCount,
    MAX_INVENTORY_SLOTS,
    ResourceGatherTick,
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

  // Gathering aggro tuning (percent chance).
  // Base chance applies at dangerMultiplier 100. Each +100 danger adds per-step.
  const GATHER_AGGRO_BASE_CHANCE = 20;
  const GATHER_AGGRO_PER_DANGER_STEP = 5;
  const GATHER_AGGRO_MAX_CHANCE = 45;

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
        });
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
          });
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
      if (character.level < template.requiredLevel) return failItem(ctx, character, 'Level too low');
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
      const abilityKey = args.abilityKey.trim();
      if (!abilityKey) return failItem(ctx, character, 'Ability required');
      const nowMicros = ctx.timestamp.microsSinceUnixEpoch;
      const existingCooldown = [...ctx.db.abilityCooldown.by_character.filter(character.id)].find(
        (row) => row.abilityKey === abilityKey
      );
      if (existingCooldown && existingCooldown.readyAtMicros > nowMicros) {
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
          'This ability can only be used in combat.'
        );
        return;
      }
      if (combatState === 'out_of_combat_only' && combatId) {
        appendPrivateEvent(
          ctx,
          character.id,
          character.ownerUserId,
          'ability',
          'This ability cannot be used in combat.'
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
              readyAtMicros: nowMicros + perkCooldownMicros,
            });
          } else {
            ctx.db.abilityCooldown.insert({
              id: 0n,
              characterId: character.id,
              abilityKey,
              readyAtMicros: nowMicros + perkCooldownMicros,
            });
          }
        } catch (error) {
          const message = String(error).replace(/^SenderError:\s*/i, '');
          appendPrivateEvent(ctx, character.id, character.ownerUserId, 'ability', 'Ability failed: ' + message);
        }
        return;
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
        appendPrivateEvent(
          ctx,
          character.id,
          character.ownerUserId,
          'ability',
          `You use ${abilityKey.replace(/_/g, ' ')} on ${targetName}.`
        );
        // Apply cooldown only after ability completes successfully
        const cooldown = abilityCooldownMicros(ctx, abilityKey);
        if (cooldown > 0n) {
          if (existingCooldown) {
            ctx.db.abilityCooldown.id.update({
              ...existingCooldown,
              readyAtMicros: nowMicros + cooldown,
            });
          } else {
            ctx.db.abilityCooldown.insert({
              id: 0n,
              characterId: character.id,
              abilityKey,
              readyAtMicros: nowMicros + cooldown,
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
  const RESOURCE_GATHER_CAST_MICROS = 8_000_000n;
  const RESOURCE_GATHER_MIN_QTY = 2n;
  const RESOURCE_GATHER_MAX_QTY = 6n;

  // Demo flow: gather_resources -> research_recipes -> craft_recipe -> use_item (Bandage).
  spacetimedb.reducer(
    'start_gather_resource',
    { characterId: t.u64(), nodeId: t.u64() },
    (ctx, args) => {
      const character = requireCharacterOwnedBy(ctx, args.characterId);
      if (activeCombatIdForCharacter(ctx, character.id)) {
        return failItem(ctx, character, 'Cannot gather during combat');
      }
      const node = ctx.db.resourceNode.id.find(args.nodeId);
      if (!node) return failItem(ctx, character, 'Resource not found');
      if (node.locationId !== character.locationId) {
        return failItem(ctx, character, 'Resource is not here');
      }
      if (node.state !== 'available') {
        return failItem(ctx, character, 'Resource is not available');
      }
      for (const gather of ctx.db.resourceGather.by_character.filter(character.id)) {
        return failItem(ctx, character, 'Already gathering');
      }

      const location = ctx.db.location.id.find(character.locationId);
      const region = location ? ctx.db.region.id.find(location.regionId) : null;
      if (location && !location.isSafe) {
        const availableSpawns = [
          ...ctx.db.enemySpawn.by_location.filter(character.locationId),
        ].filter((row) => {
          if (row.state !== 'available') return false;
          if (row.groupCount > 0n) return true;
          return ctx.db.enemySpawnMember.by_spawn.filter(row.id).length > 0;
        });
        if (availableSpawns.length > 0) {
          const danger = Number(region?.dangerMultiplier ?? 100n);
          const dangerSteps = Math.max(0, Math.floor((danger - 100) / 100));
          const aggroChance = Math.min(
            GATHER_AGGRO_MAX_CHANCE,
            GATHER_AGGRO_BASE_CHANCE + dangerSteps * GATHER_AGGRO_PER_DANGER_STEP
          );
          const roll = Number(
            (ctx.timestamp.microsSinceUnixEpoch + character.id) % 100n
          );
          if (roll < aggroChance) {
            const spawnIndex = Number(
              (ctx.timestamp.microsSinceUnixEpoch + node.id) %
              BigInt(availableSpawns.length)
            );
            const spawnToUse = availableSpawns[spawnIndex] ?? availableSpawns[0];
              const participants = getGroupParticipants(ctx, character, true);
              appendPrivateEvent(
                ctx,
                character.id,
              character.ownerUserId,
              'system',
              `As you reach for ${node.name}, ${spawnToUse.name} notices you and attacks!`
            );
            startCombatForSpawn(
              ctx,
              character,
              spawnToUse,
              participants,
              effectiveGroupId(character)
            );
            return;
          }
        }
      }

      const gatherSpeedBonus = getPerkBonusByField(ctx, character.id, 'gatherSpeedBonus', character.level);
      const rawGatherDuration = BigInt(Math.round(Number(RESOURCE_GATHER_CAST_MICROS) * (1 - gatherSpeedBonus / 100)));
      const gatherDurationMicros = rawGatherDuration < 500_000n ? 500_000n : rawGatherDuration;
      const endsAt = ctx.timestamp.microsSinceUnixEpoch + gatherDurationMicros;
      ctx.db.resourceNode.id.update({
        ...node,
        state: 'harvesting',
        lockedByCharacterId: character.id,
      });
      const gather = ctx.db.resourceGather.insert({
        id: 0n,
        characterId: character.id,
        nodeId: node.id,
        endsAtMicros: endsAt,
      });
      ctx.db.resourceGatherTick.insert({
        scheduledId: 0n,
        scheduledAt: ScheduleAt.time(endsAt),
        gatherId: gather.id,
      });
    logPrivateAndGroup(
      ctx,
      character,
      'system',
      `You begin gathering ${node.name}.`,
      `${character.name} begins gathering ${node.name}.`
    );
    }
  );

  spacetimedb.reducer(
    'finish_gather',
    { arg: ResourceGatherTick.rowType },
    (ctx, { arg }) => {
      const gather = ctx.db.resourceGather.id.find(arg.gatherId);
      if (!gather) return;
      if (!gather) return;
      const character = ctx.db.character.id.find(gather.characterId);
      const node = ctx.db.resourceNode.id.find(gather.nodeId);
      ctx.db.resourceGather.id.delete(gather.id);
      if (!character || !node) return;
      if (node.lockedByCharacterId?.toString() !== character.id.toString()) {
        ctx.db.resourceNode.id.update({ ...node, state: 'available', lockedByCharacterId: undefined });
        return;
      }
      if (character.locationId !== node.locationId || activeCombatIdForCharacter(ctx, character.id)) {
        ctx.db.resourceNode.id.update({ ...node, state: 'available', lockedByCharacterId: undefined });
        return;
      }
      // Modifier reagents (crafting affix components) always yield exactly 1
      const isModifierReagent = CRAFTING_MODIFIER_DEFS.some(d => d.name === node.name);
      let quantity: bigint;
      if (isModifierReagent) {
        quantity = 1n;
      } else {
        const qtyRange = RESOURCE_GATHER_MAX_QTY - RESOURCE_GATHER_MIN_QTY + 1n;
        quantity =
          RESOURCE_GATHER_MIN_QTY +
          ((ctx.timestamp.microsSinceUnixEpoch + node.id) % qtyRange);
      }

      // Apply gathering perk bonuses — skipped for modifier reagents (always exactly 1)
      let gatherBonusMsg = '';
      if (!isModifierReagent) {
        const gatherSeed = (ctx.timestamp.microsSinceUnixEpoch + node.id) % 100n;
        const gatherDoubleChance = getPerkBonusByField(ctx, character.id, 'gatherDoubleChance', character.level);
        if (gatherDoubleChance > 0 && gatherSeed < BigInt(Math.floor(gatherDoubleChance))) {
          quantity = quantity * 2n;
          gatherBonusMsg = ' Your gathering perk triggered! Double resources collected.';
        } else {
          // Check rareGatherChance only if double didn't trigger (independent roll)
          const rareSeed = (ctx.timestamp.microsSinceUnixEpoch + node.id + character.id) % 100n;
          const rareGatherChance = getPerkBonusByField(ctx, character.id, 'rareGatherChance', character.level);
          if (rareGatherChance > 0 && rareSeed < BigInt(Math.floor(rareGatherChance))) {
            // Rare gather: add 50% extra resources
            const bonus = (quantity + 1n) / 2n;
            quantity = quantity + bonus;
            gatherBonusMsg = ' Your gathering perk found rare materials!';
          }
        }
      }

      addItemToInventory(ctx, character.id, node.itemTemplateId, quantity);
      logPrivateAndGroup(
        ctx,
        character,
        'reward',
        `You gather ${node.name} x${quantity}.${gatherBonusMsg}`,
        `${character.name} gathers ${node.name} x${quantity}.`
      );
      // Personal node: delete immediately after gathering, no respawn
      ctx.db.resourceNode.id.delete(node.id);
    }
  );

  spacetimedb.reducer('research_recipes', { characterId: t.u64() }, (ctx, args) => {
    const character = requireCharacterOwnedBy(ctx, args.characterId);
    const location = ctx.db.location.id.find(character.locationId);
    if (!location?.craftingAvailable) {
      appendPrivateEvent(
        ctx,
        character.id,
        character.ownerUserId,
        'system',
        'Crafting is only available at locations with crafting stations.'
      );
      return;
    }
    const discovered = new Set(
      [...ctx.db.recipeDiscovered.by_character.filter(character.id)].map((row) =>
        row.recipeTemplateId.toString()
      )
    );
    let found = 0;
    for (const recipe of ctx.db.recipeTemplate.iter()) {
      if (discovered.has(recipe.id.toString())) continue;
      // Skip gear recipes — only consumables are auto-discoverable
      // Gear recipes require salvaging or recipe scrolls
      const isGearRecipe = recipe.recipeType && recipe.recipeType !== 'consumable';
      if (isGearRecipe) continue;
      const req1Count = getItemCount(ctx, character.id, recipe.req1TemplateId);
      const req2Count = getItemCount(ctx, character.id, recipe.req2TemplateId);
      const req3Count =
        recipe.req3TemplateId != null
          ? getItemCount(ctx, character.id, recipe.req3TemplateId)
          : 0n;
      const meetsReq3 = recipe.req3TemplateId == null || req3Count >= (recipe.req3Count ?? 0n);
      if (req1Count >= recipe.req1Count && req2Count >= recipe.req2Count && meetsReq3) {
        ctx.db.recipeDiscovered.insert({
          id: 0n,
          characterId: character.id,
          recipeTemplateId: recipe.id,
          discoveredAt: ctx.timestamp,
        });
        const req1 = ctx.db.itemTemplate.id.find(recipe.req1TemplateId);
        const req2 = ctx.db.itemTemplate.id.find(recipe.req2TemplateId);
        const req3 = recipe.req3TemplateId
          ? ctx.db.itemTemplate.id.find(recipe.req3TemplateId)
          : null;
        appendPrivateEvent(
          ctx,
          character.id,
          character.ownerUserId,
          'system',
          `You discover ${recipe.name} because you have ${req1?.name ?? 'materials'} and ${req2?.name ?? 'materials'}${req3 ? ` and ${req3.name}` : ''}.`
        );
        found += 1;
      }
    }
    if (found === 0) {
      appendPrivateEvent(
        ctx,
        character.id,
        character.ownerUserId,
        'system',
        'You discover nothing new.'
      );
    }
  });

  // Maps stat key → readable affix suffix name for crafted items
  const statKeyToAffix = (statKey: string): string => {
    const map: Record<string, string> = {
      strBonus:             'of Strength',
      dexBonus:             'of Dexterity',
      intBonus:             'of Intelligence',
      wisBonus:             'of Wisdom',
      chaBonus:             'of Charisma',
      hpBonus:              'of Vitality',
      manaBonus:            'of the Arcane',
      armorClassBonus:      'of Warding',
      magicResistanceBonus: 'of Magic Resistance',
    };
    return map[statKey] ?? 'of Power';
  };

  spacetimedb.reducer(
    'craft_recipe',
    {
      characterId:         t.u64(),
      recipeTemplateId:    t.u64(),
      catalystTemplateId:  t.u64().optional(),
      modifier1TemplateId: t.u64().optional(),
      modifier2TemplateId: t.u64().optional(),
      modifier3TemplateId: t.u64().optional(),
    },
    (ctx, args) => {
      const character = requireCharacterOwnedBy(ctx, args.characterId);
      const location = ctx.db.location.id.find(character.locationId);
      if (!location?.craftingAvailable) {
        appendPrivateEvent(
          ctx,
          character.id,
          character.ownerUserId,
          'system',
          'Crafting is only available at locations with crafting stations.'
        );
        return;
      }
      const recipe = ctx.db.recipeTemplate.id.find(args.recipeTemplateId);
      if (!recipe) return failItem(ctx, character, 'Recipe not found');
      const discovered = [...ctx.db.recipeDiscovered.by_character.filter(character.id)].find(
        (row) => row.recipeTemplateId === recipe.id
      );
      if (!discovered) return failItem(ctx, character, 'Recipe not discovered');
      const req1Count = getItemCount(ctx, character.id, recipe.req1TemplateId);
      const req2Count = getItemCount(ctx, character.id, recipe.req2TemplateId);
      const req3Count =
        recipe.req3TemplateId != null
          ? getItemCount(ctx, character.id, recipe.req3TemplateId)
          : 0n;
      if (
        req1Count < recipe.req1Count ||
        req2Count < recipe.req2Count ||
        (recipe.req3TemplateId != null && req3Count < (recipe.req3Count ?? 0n))
      ) {
        appendPrivateEvent(
          ctx,
          character.id,
          character.ownerUserId,
          'system',
          'Missing materials to craft this recipe.'
        );
        return;
      }
      removeItemFromInventory(ctx, character.id, recipe.req1TemplateId, recipe.req1Count);
      removeItemFromInventory(ctx, character.id, recipe.req2TemplateId, recipe.req2Count);
      if (recipe.req3TemplateId != null && recipe.req3Count != null) {
        removeItemFromInventory(ctx, character.id, recipe.req3TemplateId, recipe.req3Count);
      }
      addItemToInventory(ctx, character.id, recipe.outputTemplateId, recipe.outputCount);
      const output = ctx.db.itemTemplate.id.find(recipe.outputTemplateId);

      // --- Gear recipe affix application (catalyst + modifier system) ---
      let craftedDisplayName = output?.name ?? recipe.name;
      const isGearRecipe = recipe.recipeType && recipe.recipeType !== 'consumable';
      if (isGearRecipe && output) {
        // Determine craft quality from primary material tier
        const req1Template = ctx.db.itemTemplate.id.find(recipe.req1TemplateId);
        const materialKey = req1Template
          ? req1Template.name.toLowerCase().replace(/\s+/g, '_')
          : '';
        const materialDef = MATERIAL_DEFS.find((m) => m.key === materialKey);
        const materialTier = materialDef ? materialDef.tier : 1n;
        const craftQuality = materialTierToCraftQuality(materialTier);
        const qualityTier = 'common';

        // Find the newly created ItemInstance
        const newInstance = [...ctx.db.itemInstance.by_owner.filter(character.id)].find(
          (i) => i.templateId === recipe.outputTemplateId && !i.equippedSlot && !i.qualityTier && !i.craftQuality
        );

        if (newInstance) {
          const appliedAffixes: { affixType: string; affixKey: string; affixName: string; statKey: string; magnitude: bigint }[] = [];

          // --- Catalyst (Essence) + Modifier logic ---
          if (args.catalystTemplateId) {
            const catalystTemplate = ctx.db.itemTemplate.id.find(args.catalystTemplateId);
            const catalystKey = catalystTemplate
              ? catalystTemplate.name.toLowerCase().replace(/\s+/g, '_')
              : '';
            const magnitude = ESSENCE_MAGNITUDE[catalystKey] ?? 1n;
            const slotsAvailable = AFFIX_SLOTS_BY_QUALITY[craftQuality] ?? 1;
            const allowedQualities = ESSENCE_QUALITY_GATE[catalystKey] ?? [];

            if (!allowedQualities.includes(craftQuality)) {
              return failItem(ctx, character, 'Essence tier too low for this craft quality');
            }
            if (getItemCount(ctx, character.id, args.catalystTemplateId) < 1n) {
              return failItem(ctx, character, 'Missing catalyst (Essence)');
            }
            removeItemFromInventory(ctx, character.id, args.catalystTemplateId, 1n);

            // Collect modifier IDs up to available slots
            const modifierIds = [args.modifier1TemplateId, args.modifier2TemplateId, args.modifier3TemplateId]
              .filter((id): id is bigint => id != null)
              .slice(0, slotsAvailable);

            for (const modId of modifierIds) {
              const modTemplate = ctx.db.itemTemplate.id.find(modId);
              if (!modTemplate) continue;
              const modKey = modTemplate.name.toLowerCase().replace(/\s+/g, '_');
              const modDef = CRAFTING_MODIFIER_DEFS.find((d) => d.key === modKey);
              if (!modDef) continue;

              if (getItemCount(ctx, character.id, modId) < 1n) {
                return failItem(ctx, character, `Missing modifier: ${modTemplate.name}`);
              }
              removeItemFromInventory(ctx, character.id, modId, 1n);

              const modMagnitude = getModifierMagnitude(catalystKey, modDef.statKey);
              appliedAffixes.push({
                affixType: 'suffix',
                affixKey: `crafted_${modDef.statKey}`,
                affixName: statKeyToAffix(modDef.statKey),
                statKey: modDef.statKey,
                magnitude: modMagnitude,
              });
            }

            // Both Essence and at least one valid reagent are required to apply affixes
            if (appliedAffixes.length === 0) {
              return failItem(ctx, character, 'Must provide at least one reagent when using an Essence');
            }

            // Insert affix rows for modifier-based affixes
            for (const affix of appliedAffixes) {
              ctx.db.itemAffix.insert({
                id: 0n,
                itemInstanceId: newInstance.id,
                affixType: affix.affixType,
                affixKey: affix.affixKey,
                affixName: affix.affixName,
                statKey: affix.statKey,
                magnitude: affix.magnitude,
              });
            }

            if (appliedAffixes.length > 0) {
              craftedDisplayName = buildDisplayName(output.name, appliedAffixes);
            }
          }

          // --- Implicit craft quality base stat bonus (unchanged) ---
          const statBonus = getCraftQualityStatBonus(craftQuality);
          if (statBonus > 0n) {
            if (output.armorClassBonus > 0n) {
              ctx.db.itemAffix.insert({
                id: 0n,
                itemInstanceId: newInstance.id,
                affixType: 'implicit',
                affixKey: 'craft_quality_ac',
                affixName: 'Quality',
                statKey: 'armorClassBonus',
                magnitude: statBonus,
              });
            }
            if (output.weaponBaseDamage > 0n) {
              ctx.db.itemAffix.insert({
                id: 0n,
                itemInstanceId: newInstance.id,
                affixType: 'implicit',
                affixKey: 'craft_quality_dmg',
                affixName: 'Quality',
                statKey: 'weaponBaseDamage',
                magnitude: statBonus,
              });
              ctx.db.itemAffix.insert({
                id: 0n,
                itemInstanceId: newInstance.id,
                affixType: 'implicit',
                affixKey: 'craft_quality_dps',
                affixName: 'Quality',
                statKey: 'weaponDps',
                magnitude: statBonus,
              });
            }
          }

          ctx.db.itemInstance.id.update({
            ...newInstance,
            qualityTier,
            craftQuality,
            displayName: appliedAffixes.length > 0 ? craftedDisplayName : undefined,
          });
        }
      }

      appendPrivateEvent(
        ctx,
        character.id,
        character.ownerUserId,
        'reward',
        `You craft ${craftedDisplayName}.`
      );
    }
  );

  spacetimedb.reducer(
    'learn_recipe_scroll',
    { characterId: t.u64(), itemInstanceId: t.u64() },
    (ctx, args) => {
      const character = requireCharacterOwnedBy(ctx, args.characterId);

      // Find the scroll item
      const instance = ctx.db.itemInstance.id.find(args.itemInstanceId);
      if (!instance) return failItem(ctx, character, 'Item not found');
      if (instance.ownerCharacterId !== character.id) return failItem(ctx, character, 'Not your item');

      const template = ctx.db.itemTemplate.id.find(instance.templateId);
      if (!template) return failItem(ctx, character, 'Template not found');

      // Verify it's a recipe scroll
      if (!template.name.startsWith('Scroll:')) return failItem(ctx, character, 'Not a recipe scroll');

      // Extract recipe name from scroll name: "Scroll: Longsword" → "Longsword"
      const recipeName = template.name.replace('Scroll: ', '').trim();
      const recipe = [...ctx.db.recipeTemplate.iter()].find((r) => r.name === recipeName);
      if (!recipe) return failItem(ctx, character, 'No recipe found for this scroll');

      // Check if already known
      const alreadyKnown = [...ctx.db.recipeDiscovered.by_character.filter(character.id)]
        .some((r) => r.recipeTemplateId === recipe.id);

      if (alreadyKnown) {
        appendPrivateEvent(ctx, character.id, character.ownerUserId, 'system',
          `You already know: ${recipe.name}`);
      } else {
        ctx.db.recipeDiscovered.insert({
          id: 0n,
          characterId: character.id,
          recipeTemplateId: recipe.id,
          discoveredAt: ctx.timestamp,
        });
        appendPrivateEvent(ctx, character.id, character.ownerUserId, 'system',
          `You have learned: ${recipe.name}`);
      }

      // Consume the scroll (remove 1 from stack)
      removeItemFromInventory(ctx, character.id, instance.templateId, 1n);
    }
  );

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

  const findActiveTrade = (ctx: any, characterId: bigint) => {
    for (const trade of ctx.db.tradeSession.iter()) {
      if (trade.state !== 'open') continue;
      if (trade.fromCharacterId === characterId || trade.toCharacterId === characterId) {
        return trade;
      }
    }
    return null;
  };

  const inventoryHasSpaceForItems = (ctx: any, characterId: bigint, items: any[]) => {
    let requiredSlots = 0;
    const existingStacks = new Set<string>();
    for (const instance of ctx.db.itemInstance.by_owner.filter(characterId)) {
      if (instance.equippedSlot) continue;
      const template = ctx.db.itemTemplate.id.find(instance.templateId);
      if (template?.stackable) {
        existingStacks.add(template.id.toString());
      }
    }
    const incomingStacked = new Set<string>();
    for (const item of items) {
      const template = ctx.db.itemTemplate.id.find(item.templateId);
      if (!template) return false;
      if (template.stackable) {
        const key = template.id.toString();
        if (existingStacks.has(key) || incomingStacked.has(key)) continue;
        incomingStacked.add(key);
        requiredSlots += 1;
      } else {
        requiredSlots += 1;
      }
    }
    return getInventorySlotCount(ctx, characterId) + requiredSlots <= MAX_INVENTORY_SLOTS;
  };

  const finalizeTrade = (ctx: any, trade: any) => {
    const fromItems = [...ctx.db.tradeItem.by_trade.filter(trade.id)].filter(
      (row) => row.fromCharacterId === trade.fromCharacterId
    );
    const toItems = [...ctx.db.tradeItem.by_trade.filter(trade.id)].filter(
      (row) => row.fromCharacterId === trade.toCharacterId
    );

    const fromPayload = fromItems
      .map((row) => ctx.db.itemInstance.id.find(row.itemInstanceId))
      .filter(Boolean);
    const toPayload = toItems
      .map((row) => ctx.db.itemInstance.id.find(row.itemInstanceId))
      .filter(Boolean);

    if (
      !inventoryHasSpaceForItems(ctx, trade.toCharacterId, fromPayload) ||
      !inventoryHasSpaceForItems(ctx, trade.fromCharacterId, toPayload)
    ) {
      const fromChar = ctx.db.character.id.find(trade.fromCharacterId);
      const toChar = ctx.db.character.id.find(trade.toCharacterId);
      if (fromChar) {
        appendPrivateEvent(
          ctx,
          fromChar.id,
          fromChar.ownerUserId,
          'system',
          'Trade failed: not enough inventory space.'
        );
      }
      if (toChar) {
        appendPrivateEvent(
          ctx,
          toChar.id,
          toChar.ownerUserId,
          'system',
          'Trade failed: not enough inventory space.'
        );
      }
      ctx.db.tradeSession.id.update({ ...trade, fromAccepted: false, toAccepted: false });
      return;
    }

    const transferItem = (instance: any, receiverId: bigint) => {
      const template = ctx.db.itemTemplate.id.find(instance.templateId);
      if (!template) return;
      if (template.stackable) {
        const existing = [...ctx.db.itemInstance.by_owner.filter(receiverId)].find(
          (row) => row.templateId === template.id && !row.equippedSlot
        );
        if (existing) {
          ctx.db.itemInstance.id.update({
            ...existing,
            quantity: (existing.quantity ?? 1n) + (instance.quantity ?? 1n),
          });
          ctx.db.itemInstance.id.delete(instance.id);
          return;
        }
      }
      ctx.db.itemInstance.id.update({
        ...instance,
        ownerCharacterId: receiverId,
        equippedSlot: undefined,
      });
    };

    for (const instance of fromPayload) {
      if (instance.equippedSlot) continue;
      transferItem(instance, trade.toCharacterId);
    }
    for (const instance of toPayload) {
      if (instance.equippedSlot) continue;
      transferItem(instance, trade.fromCharacterId);
    }

    for (const row of ctx.db.tradeItem.by_trade.filter(trade.id)) {
      ctx.db.tradeItem.id.delete(row.id);
    }
    ctx.db.tradeSession.id.delete(trade.id);

    const fromChar = ctx.db.character.id.find(trade.fromCharacterId);
    const toChar = ctx.db.character.id.find(trade.toCharacterId);
    if (fromChar) {
      appendPrivateEvent(
        ctx,
        fromChar.id,
        fromChar.ownerUserId,
        'system',
        'Trade completed.'
      );
    }
    if (toChar) {
      appendPrivateEvent(
        ctx,
        toChar.id,
        toChar.ownerUserId,
        'system',
        'Trade completed.'
      );
    }
  };

  spacetimedb.reducer(
    'start_trade',
    { characterId: t.u64(), targetName: t.string() },
    (ctx, args) => {
      const character = requireCharacterOwnedBy(ctx, args.characterId);
      const target = deps.findCharacterByName(ctx, args.targetName.trim());
      if (!target) return failItem(ctx, character, 'Target not found');
      if (target.id === character.id) return failItem(ctx, character, 'Cannot trade with yourself');
      if (target.locationId !== character.locationId) {
        return failItem(ctx, character, 'Target is not here');
      }
      const existing = findActiveTrade(ctx, character.id);
      if (existing) return failItem(ctx, character, 'Trade already in progress');
      const targetExisting = findActiveTrade(ctx, target.id);
      if (targetExisting) return failItem(ctx, character, 'Target is already trading');
      const trade = ctx.db.tradeSession.insert({
        id: 0n,
        fromCharacterId: character.id,
        toCharacterId: target.id,
        state: 'open',
        fromAccepted: false,
        toAccepted: false,
        createdAt: ctx.timestamp,
      });
      appendPrivateEvent(
        ctx,
        character.id,
        character.ownerUserId,
        'system',
        `You start a trade with ${target.name}.`
      );
      appendPrivateEvent(
        ctx,
        target.id,
        target.ownerUserId,
        'system',
        `${character.name} wants to trade with you.`
      );
      }
    );

  spacetimedb.reducer(
    'add_trade_item',
    { characterId: t.u64(), itemInstanceId: t.u64() },
    (ctx, args) => {
      const character = requireCharacterOwnedBy(ctx, args.characterId);
      const trade = findActiveTrade(ctx, character.id);
      if (!trade) return failItem(ctx, character, 'No active trade');
      const instance = ctx.db.itemInstance.id.find(args.itemInstanceId);
      if (!instance) return failItem(ctx, character, 'Item not found');
      if (instance.ownerCharacterId !== character.id) {
        return failItem(ctx, character, 'Item does not belong to you');
      }
      if (instance.equippedSlot) return failItem(ctx, character, 'Cannot trade equipped items');
      for (const row of ctx.db.tradeItem.by_trade.filter(trade.id)) {
        if (row.itemInstanceId === instance.id) return;
      }
      ctx.db.tradeItem.insert({
        id: 0n,
        tradeId: trade.id,
        fromCharacterId: character.id,
        itemInstanceId: instance.id,
        quantity: instance.quantity ?? 1n,
      });
      ctx.db.tradeSession.id.update({ ...trade, fromAccepted: false, toAccepted: false });
    }
  );

  spacetimedb.reducer(
    'remove_trade_item',
    { characterId: t.u64(), itemInstanceId: t.u64() },
    (ctx, args) => {
      const character = requireCharacterOwnedBy(ctx, args.characterId);
      const trade = findActiveTrade(ctx, character.id);
      if (!trade) return failItem(ctx, character, 'No active trade');
      for (const row of ctx.db.tradeItem.by_trade.filter(trade.id)) {
        if (row.itemInstanceId === args.itemInstanceId) {
          ctx.db.tradeItem.id.delete(row.id);
          ctx.db.tradeSession.id.update({ ...trade, fromAccepted: false, toAccepted: false });
          return;
        }
      }
    }
  );

  spacetimedb.reducer('offer_trade', { characterId: t.u64() }, (ctx, args) => {
    const character = requireCharacterOwnedBy(ctx, args.characterId);
    const trade = findActiveTrade(ctx, character.id);
    if (!trade) return failItem(ctx, character, 'No active trade');
    if (trade.fromCharacterId === character.id) {
      ctx.db.tradeSession.id.update({ ...trade, fromAccepted: true });
    } else {
      ctx.db.tradeSession.id.update({ ...trade, toAccepted: true });
    }
    const updated = ctx.db.tradeSession.id.find(trade.id);
    if (updated && updated.fromAccepted && updated.toAccepted) {
      finalizeTrade(ctx, updated);
    }
  });

  spacetimedb.reducer('cancel_trade', { characterId: t.u64() }, (ctx, args) => {
    const character = requireCharacterOwnedBy(ctx, args.characterId);
    const trade = findActiveTrade(ctx, character.id);
    if (!trade) return;
    for (const row of ctx.db.tradeItem.by_trade.filter(trade.id)) {
      ctx.db.tradeItem.id.delete(row.id);
    }
    ctx.db.tradeSession.id.delete(trade.id);
    const otherId =
      trade.fromCharacterId === character.id ? trade.toCharacterId : trade.fromCharacterId;
    const other = ctx.db.character.id.find(otherId);
    appendPrivateEvent(
      ctx,
      character.id,
      character.ownerUserId,
      'system',
      'Trade cancelled.'
    );
    if (other) {
      appendPrivateEvent(
        ctx,
        other.id,
        other.ownerUserId,
        'system',
        'Trade cancelled.'
      );
    }
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

  spacetimedb.reducer('salvage_item', { characterId: t.u64(), itemInstanceId: t.u64() }, (ctx, args) => {
    const character = requireCharacterOwnedBy(ctx, args.characterId);
    const instance = ctx.db.itemInstance.id.find(args.itemInstanceId);
    if (!instance) return failItem(ctx, character, 'Item not found');
    if (instance.ownerCharacterId !== character.id) return failItem(ctx, character, 'Not your item');
    if (instance.equippedSlot) return failItem(ctx, character, 'Unequip item first');

    const template = ctx.db.itemTemplate.id.find(instance.templateId);
    if (!template) return failItem(ctx, character, 'Item template not found');

    // Only gear in equipment slots can be salvaged
    if (template.isJunk) return failItem(ctx, character, 'Cannot salvage junk items');
    const nonSalvageSlots = ['consumable', 'food', 'resource', 'quest', 'junk'];
    if (nonSalvageSlots.includes(template.slot)) {
      return failItem(ctx, character, 'Cannot salvage this item type');
    }
    if (!EQUIPMENT_SLOTS.has(template.slot)) {
      return failItem(ctx, character, 'Cannot salvage this item type');
    }

    const itemName = instance.displayName ?? template.name;
    const tier = template.tier ?? 1n;

    // --- Material yield ---
    const materialName = getMaterialForSalvage(template.slot, template.armorType, tier);
    if (materialName) {
      const materialTemplate = findItemTemplateByName(ctx, materialName);
      if (materialTemplate) {
        const yieldCount = SALVAGE_YIELD_BY_TIER[Number(tier)] ?? 2n;
        addItemToInventory(ctx, character.id, materialTemplate.id, yieldCount);
        appendPrivateEvent(ctx, character.id, character.ownerUserId, 'reward',
          `You salvaged ${itemName} and received ${yieldCount}x ${materialTemplate.name}.`);
      }
    }

    // --- Bonus modifier reagent yield (30% chance) ---
    const modifierRoll = (ctx.timestamp.microsSinceUnixEpoch + args.itemInstanceId * 13n) % 100n;
    if (modifierRoll < 30n) {
      const modIdx = Number((args.itemInstanceId + character.id) % BigInt(CRAFTING_MODIFIER_DEFS.length));
      const modDef = CRAFTING_MODIFIER_DEFS[modIdx];
      const modifierTemplate = findItemTemplateByName(ctx, modDef.name);
      if (modifierTemplate) {
        addItemToInventory(ctx, character.id, modifierTemplate.id, 1n);
        appendPrivateEvent(ctx, character.id, character.ownerUserId, 'reward',
          `You also found 1x ${modDef.name} while salvaging.`);
      }
    }

    // --- Recipe discovery (75% chance) ---
    // Find a recipe that outputs this item type
    const matchingRecipe = [...ctx.db.recipeTemplate.iter()].find(
      (r) => r.outputTemplateId === instance.templateId
    );
    if (matchingRecipe) {
      const alreadyKnown = [...ctx.db.recipeDiscovered.by_character.filter(character.id)]
        .some((r) => r.recipeTemplateId === matchingRecipe.id);
      if (!alreadyKnown) {
        // Deterministic 75% roll
        const roll = (ctx.timestamp.microsSinceUnixEpoch + character.id) % 100n;
        if (roll < 75n) {
          ctx.db.recipeDiscovered.insert({
            id: 0n,
            characterId: character.id,
            recipeTemplateId: matchingRecipe.id,
            discoveredAt: ctx.timestamp,
          });
          appendPrivateEvent(ctx, character.id, character.ownerUserId, 'system',
            `You have learned: ${matchingRecipe.name}`);
        }
      }
    }

    // Delete associated ItemAffix rows first
    for (const affix of ctx.db.itemAffix.by_instance.filter(instance.id)) {
      ctx.db.itemAffix.id.delete(affix.id);
    }

    // Delete the item instance
    ctx.db.itemInstance.id.delete(instance.id);
  });
};
