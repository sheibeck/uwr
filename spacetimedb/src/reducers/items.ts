export const registerItemReducers = (deps: any) => {
  const {
    spacetimedb,
    t,
    SenderError,
    ScheduleAt,
    EQUIPMENT_SLOTS,
    ARMOR_TYPES_WITH_NONE,
    normalizeArmorType,
    requireCharacterOwnedBy,
    isClassAllowed,
    isArmorAllowedForClass,
    recomputeCharacterDerived,
    executeAbility,
    appendPrivateEvent,
    abilityCooldownMicros,
    abilityCastMicros,
    activeCombatIdForCharacter,
    addItemToInventory,
    removeItemFromInventory,
    getItemCount,
    ResourceGatherTick,
    ResourceRespawnTick,
  } = deps;

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
        weaponBaseDamage: args.weaponBaseDamage,
        weaponDps: args.weaponDps,
        stackable: args.stackable,
      });
    }
  );

  spacetimedb.reducer('grant_item', { characterId: t.u64(), templateId: t.u64() }, (ctx, args) => {
    const character = requireCharacterOwnedBy(ctx, args.characterId);
    const template = ctx.db.itemTemplate.id.find(args.templateId);
    if (!template) throw new SenderError('Item template not found');
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
      if (!vendorItem) throw new SenderError('Item not sold by this vendor');
      const template = ctx.db.itemTemplate.id.find(args.itemTemplateId);
      if (!template) throw new SenderError('Item template missing');
      const itemCount = [...ctx.db.itemInstance.by_owner.filter(character.id)].length;
      const hasStack =
        template.stackable &&
        [...ctx.db.itemInstance.by_owner.filter(character.id)].some(
          (row) => row.templateId === template.id && !row.equippedSlot
        );
      if (!hasStack && itemCount >= 20) throw new SenderError('Backpack is full');
      if ((character.gold ?? 0n) < vendorItem.price) throw new SenderError('Not enough gold');
      ctx.db.character.id.update({
        ...character,
        gold: (character.gold ?? 0n) - vendorItem.price,
      });
      addItemToInventory(ctx, character.id, template.id, 1n);
      appendPrivateEvent(
        ctx,
        character.id,
        character.ownerUserId,
        'reward',
        `You buy ${template.name} for ${vendorItem.price} gold.`
      );
    }
  );

  spacetimedb.reducer(
    'sell_item',
    { characterId: t.u64(), itemInstanceId: t.u64() },
    (ctx, args) => {
      const character = requireCharacterOwnedBy(ctx, args.characterId);
      const instance = ctx.db.itemInstance.id.find(args.itemInstanceId);
      if (!instance) throw new SenderError('Item not found');
      if (instance.ownerCharacterId !== character.id) {
        throw new SenderError('Item does not belong to you');
      }
      if (instance.equippedSlot) throw new SenderError('Unequip item first');
      const template = ctx.db.itemTemplate.id.find(instance.templateId);
      if (!template) throw new SenderError('Item template missing');
      const value = (template.vendorValue ?? 0n) * (instance.quantity ?? 1n);
      ctx.db.itemInstance.id.delete(instance.id);
      ctx.db.character.id.update({
        ...character,
        gold: (character.gold ?? 0n) + value,
      });
      appendPrivateEvent(
        ctx,
        character.id,
        character.ownerUserId,
        'reward',
        `You sell ${template.name} for ${value} gold.`
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
    if (!loot) throw new SenderError('Loot not found');
    if (loot.characterId !== character.id || loot.ownerUserId !== character.ownerUserId) {
      throw new SenderError('Loot does not belong to you');
    }
    const itemCount = [...ctx.db.itemInstance.by_owner.filter(character.id)].length;
    const template = ctx.db.itemTemplate.id.find(loot.itemTemplateId);
    if (!template) throw new SenderError('Item template missing');
    const hasStack =
      template.stackable &&
      [...ctx.db.itemInstance.by_owner.filter(character.id)].some(
        (row) => row.templateId === template.id && !row.equippedSlot
      );
    if (!hasStack && itemCount >= 20) throw new SenderError('Backpack is full');
    addItemToInventory(ctx, character.id, template.id, 1n);
    ctx.db.combatLoot.id.delete(loot.id);
    appendPrivateEvent(
      ctx,
      character.id,
      character.ownerUserId,
      'reward',
      `You take ${template.name}.`
    );
  });

  spacetimedb.reducer(
    'equip_item',
    { characterId: t.u64(), itemInstanceId: t.u64() },
    (ctx, args) => {
      const character = requireCharacterOwnedBy(ctx, args.characterId);
      const instance = ctx.db.itemInstance.id.find(args.itemInstanceId);
      if (!instance) throw new SenderError('Item not found');
      if (instance.ownerCharacterId !== character.id) {
        throw new SenderError('Item does not belong to you');
      }
      const template = ctx.db.itemTemplate.id.find(instance.templateId);
      if (!template) throw new SenderError('Item template missing');
      if (template.stackable) throw new SenderError('Cannot equip this item');
      if (character.level < template.requiredLevel) throw new SenderError('Level too low');
      if (!isClassAllowed(template.allowedClasses, character.className)) {
        throw new SenderError('Class cannot use this item');
      }
      if (!isArmorAllowedForClass(template.armorType, character.className)) {
        throw new SenderError('Armor type not allowed for this class');
      }
      if (!EQUIPMENT_SLOTS.has(template.slot)) throw new SenderError('Invalid slot');

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

  spacetimedb.reducer(
    'set_hotbar_slot',
    { characterId: t.u64(), slot: t.u8(), abilityKey: t.string() },
    (ctx, args) => {
      const character = requireCharacterOwnedBy(ctx, args.characterId);
      if (args.slot < 1 || args.slot > 10) throw new SenderError('Invalid hotbar slot');
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
      if (!abilityKey) throw new SenderError('Ability required');
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
      const castMicros = abilityCastMicros(abilityKey);
      const combatId = activeCombatIdForCharacter(ctx, character.id);
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
      try {
        executeAbility(ctx, character, abilityKey, args.targetCharacterId);
        const cooldown = abilityCooldownMicros(abilityKey);
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
        const combatId = activeCombatIdForCharacter(ctx, character.id);
        let targetName = args.targetCharacterId
          ? ctx.db.character.id.find(args.targetCharacterId)?.name ?? 'your target'
          : 'yourself';
        if (combatId) {
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

  const BANDAGE_COOLDOWN_MICROS = 10_000_000n;
  const BANDAGE_TICK_COUNT = 3n;
  const BANDAGE_TICK_HEAL = 5n;
  const RESOURCE_GATHER_CAST_MICROS = 8_000_000n;
  const RESOURCE_RESPAWN_MICROS = 10n * 60n * 1_000_000n;

  // Demo flow: gather_resources -> research_recipes -> craft_recipe -> use_item (Bandage).
  spacetimedb.reducer(
    'start_gather_resource',
    { characterId: t.u64(), nodeId: t.u64() },
    (ctx, args) => {
      const character = requireCharacterOwnedBy(ctx, args.characterId);
      if (activeCombatIdForCharacter(ctx, character.id)) {
        throw new SenderError('Cannot gather during combat');
      }
      const node = ctx.db.resourceNode.id.find(args.nodeId);
      if (!node) throw new SenderError('Resource not found');
      if (node.locationId !== character.locationId) {
        throw new SenderError('Resource is not here');
      }
      if (node.state !== 'available') {
        throw new SenderError('Resource is not available');
      }
      for (const gather of ctx.db.resourceGather.by_character.filter(character.id)) {
        throw new SenderError('Already gathering');
      }
      const endsAt = ctx.timestamp.microsSinceUnixEpoch + RESOURCE_GATHER_CAST_MICROS;
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
      appendPrivateEvent(
        ctx,
        character.id,
        character.ownerUserId,
        'system',
        `You begin gathering ${node.name}.`
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
      addItemToInventory(ctx, character.id, node.itemTemplateId, node.quantity);
      appendPrivateEvent(
        ctx,
        character.id,
        character.ownerUserId,
        'reward',
        `You gather ${node.name} x${node.quantity}.`
      );
      const respawnAt = ctx.timestamp.microsSinceUnixEpoch + RESOURCE_RESPAWN_MICROS;
      ctx.db.resourceNode.id.update({
        ...node,
        state: 'depleted',
        lockedByCharacterId: undefined,
        respawnAtMicros: respawnAt,
      });
      ctx.db.resourceRespawnTick.insert({
        scheduledId: 0n,
        scheduledAt: ScheduleAt.time(respawnAt),
        nodeId: node.id,
      });
    }
  );

  spacetimedb.reducer('respawn_resource', { arg: ResourceRespawnTick.rowType }, (ctx, { arg }) => {
    const node = ctx.db.resourceNode.id.find(arg.nodeId);
    if (!node) return;
    const location = ctx.db.location.id.find(node.locationId);
    if (!location) return;
    const world = ctx.db.worldState.id.find(1n);
    const timePref = world?.isNight ? 'night' : 'day';
    const nodePref = (node.timeOfDay ?? 'any').toLowerCase();
    if (nodePref !== 'any' && nodePref !== timePref) {
      ctx.db.resourceNode.id.update({
        ...node,
        state: 'hidden',
        respawnAtMicros: world?.nextTransitionAtMicros,
      });
      return;
    }
    const seed = ctx.timestamp.microsSinceUnixEpoch + node.id;
    const minQty = 2n;
    const maxQty = 6n;
    const qtyRange = maxQty - minQty + 1n;
    const quantity = minQty + (seed % qtyRange);
    ctx.db.resourceNode.id.update({
      ...node,
      state: 'available',
      quantity,
      lockedByCharacterId: undefined,
      respawnAtMicros: undefined,
    });
  });

  spacetimedb.reducer('research_recipes', { characterId: t.u64() }, (ctx, args) => {
    const character = requireCharacterOwnedBy(ctx, args.characterId);
    const discovered = new Set(
      [...ctx.db.recipeDiscovered.by_character.filter(character.id)].map((row) =>
        row.recipeTemplateId.toString()
      )
    );
    let found = 0;
    for (const recipe of ctx.db.recipeTemplate.iter()) {
      if (discovered.has(recipe.id.toString())) continue;
      const req1Count = getItemCount(ctx, character.id, recipe.req1TemplateId);
      const req2Count = getItemCount(ctx, character.id, recipe.req2TemplateId);
      if (req1Count >= recipe.req1Count && req2Count >= recipe.req2Count) {
        ctx.db.recipeDiscovered.insert({
          id: 0n,
          characterId: character.id,
          recipeTemplateId: recipe.id,
          discoveredAt: ctx.timestamp,
        });
        const req1 = ctx.db.itemTemplate.id.find(recipe.req1TemplateId);
        const req2 = ctx.db.itemTemplate.id.find(recipe.req2TemplateId);
        appendPrivateEvent(
          ctx,
          character.id,
          character.ownerUserId,
          'system',
          `You discover ${recipe.name} because you have ${req1?.name ?? 'materials'} and ${req2?.name ?? 'materials'}.`
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

  spacetimedb.reducer(
    'craft_recipe',
    { characterId: t.u64(), recipeTemplateId: t.u64() },
    (ctx, args) => {
      const character = requireCharacterOwnedBy(ctx, args.characterId);
      const recipe = ctx.db.recipeTemplate.id.find(args.recipeTemplateId);
      if (!recipe) throw new SenderError('Recipe not found');
      const discovered = [...ctx.db.recipeDiscovered.by_character.filter(character.id)].find(
        (row) => row.recipeTemplateId === recipe.id
      );
      if (!discovered) throw new SenderError('Recipe not discovered');
      const req1Count = getItemCount(ctx, character.id, recipe.req1TemplateId);
      const req2Count = getItemCount(ctx, character.id, recipe.req2TemplateId);
      if (req1Count < recipe.req1Count || req2Count < recipe.req2Count) {
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
      addItemToInventory(ctx, character.id, recipe.outputTemplateId, recipe.outputCount);
      const output = ctx.db.itemTemplate.id.find(recipe.outputTemplateId);
      appendPrivateEvent(
        ctx,
        character.id,
        character.ownerUserId,
        'reward',
        `You craft ${output?.name ?? recipe.name}.`
      );
    }
  );

  spacetimedb.reducer('use_item', { characterId: t.u64(), itemInstanceId: t.u64() }, (ctx, args) => {
    const character = requireCharacterOwnedBy(ctx, args.characterId);
    const instance = ctx.db.itemInstance.id.find(args.itemInstanceId);
    if (!instance) throw new SenderError('Item not found');
    if (instance.ownerCharacterId !== character.id) {
      throw new SenderError('Item does not belong to you');
    }
    const template = ctx.db.itemTemplate.id.find(instance.templateId);
    if (!template) throw new SenderError('Item template missing');
    if (activeCombatIdForCharacter(ctx, character.id)) {
      throw new SenderError('Cannot use this during combat');
    }
    const itemKey = template.name.toLowerCase().replace(/\s+/g, '_');
    if (itemKey !== 'bandage') throw new SenderError('Item cannot be used');
    const nowMicros = ctx.timestamp.microsSinceUnixEpoch;
    const existingCooldown = [...ctx.db.itemCooldown.by_character.filter(character.id)].find(
      (row) => row.itemKey === itemKey
    );
    if (existingCooldown && existingCooldown.readyAtMicros > nowMicros) {
      appendPrivateEvent(ctx, character.id, character.ownerUserId, 'system', 'Bandage is on cooldown.');
      return;
    }
    const currentQty = instance.quantity ?? 1n;
    if (currentQty > 1n) {
      ctx.db.itemInstance.id.update({ ...instance, quantity: currentQty - 1n });
    } else {
      ctx.db.itemInstance.id.delete(instance.id);
    }
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
    if (existingCooldown) {
      ctx.db.itemCooldown.id.update({
        ...existingCooldown,
        readyAtMicros: nowMicros + BANDAGE_COOLDOWN_MICROS,
      });
    } else {
      ctx.db.itemCooldown.insert({
        id: 0n,
        characterId: character.id,
        itemKey,
        readyAtMicros: nowMicros + BANDAGE_COOLDOWN_MICROS,
      });
    }
    appendPrivateEvent(
      ctx,
      character.id,
      character.ownerUserId,
      'heal',
      'You apply a bandage and begin to recover.'
    );
  });
};
