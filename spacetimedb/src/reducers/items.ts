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
    startCombatForSpawn,
    getGroupParticipants,
    getInventorySlotCount,
    hasInventorySpace,
    ResourceGatherTick,
    ResourceRespawnTick,
    TradeSession,
    TradeItem,
  } = deps;

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
      if (activeCombatIdForCharacter(ctx, character.id)) {
        throw new SenderError('Cannot change equipment during combat');
      }
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
      if (activeCombatIdForCharacter(ctx, character.id)) {
        throw new SenderError('Cannot change equipment during combat');
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
    if (!instance) throw new SenderError('Item not found');
    if (instance.ownerCharacterId !== character.id) {
      throw new SenderError('Item does not belong to you');
    }
    if (instance.equippedSlot) throw new SenderError('Cannot delete equipped items');
    ctx.db.itemInstance.id.delete(instance.id);
    appendPrivateEvent(
      ctx,
      character.id,
      character.ownerUserId,
      'system',
      'You discard the item.'
    );
  });

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

  const CONSUMABLE_COOLDOWN_MICROS = 10_000_000n;
  const BANDAGE_TICK_COUNT = 3n;
  const BANDAGE_TICK_HEAL = 5n;
  const RESOURCE_GATHER_CAST_MICROS = 8_000_000n;
  const RESOURCE_RESPAWN_MICROS = 10n * 60n * 1_000_000n;
  const RESOURCE_GATHER_MIN_QTY = 2n;
  const RESOURCE_GATHER_MAX_QTY = 6n;

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
            startCombatForSpawn(ctx, character, spawnToUse, participants, character.groupId ?? null);
            return;
          }
        }
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
      const qtyRange = RESOURCE_GATHER_MAX_QTY - RESOURCE_GATHER_MIN_QTY + 1n;
      const quantity =
        RESOURCE_GATHER_MIN_QTY +
        ((ctx.timestamp.microsSinceUnixEpoch + node.id) % qtyRange);
      addItemToInventory(ctx, character.id, node.itemTemplateId, quantity);
      appendPrivateEvent(
        ctx,
        character.id,
        character.ownerUserId,
        'reward',
        `You gather ${node.name} x${quantity}.`
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
    ctx.db.resourceNode.id.delete(node.id);
    deps.spawnResourceNode(ctx, location.id);
  });

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

  spacetimedb.reducer(
    'craft_recipe',
    { characterId: t.u64(), recipeTemplateId: t.u64() },
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
      if (!recipe) throw new SenderError('Recipe not found');
      const discovered = [...ctx.db.recipeDiscovered.by_character.filter(character.id)].find(
        (row) => row.recipeTemplateId === recipe.id
      );
      if (!discovered) throw new SenderError('Recipe not discovered');
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
    if (!handledKeys.has(itemKey)) throw new SenderError('Item cannot be used');
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
    return getInventorySlotCount(ctx, characterId) + requiredSlots <= 20;
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
      if (!target) throw new SenderError('Target not found');
      if (target.id === character.id) throw new SenderError('Cannot trade with yourself');
      if (target.locationId !== character.locationId) {
        throw new SenderError('Target is not here');
      }
      const existing = findActiveTrade(ctx, character.id);
      if (existing) throw new SenderError('Trade already in progress');
      const targetExisting = findActiveTrade(ctx, target.id);
      if (targetExisting) throw new SenderError('Target is already trading');
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
      return trade;
    }
  );

  spacetimedb.reducer(
    'add_trade_item',
    { characterId: t.u64(), itemInstanceId: t.u64() },
    (ctx, args) => {
      const character = requireCharacterOwnedBy(ctx, args.characterId);
      const trade = findActiveTrade(ctx, character.id);
      if (!trade) throw new SenderError('No active trade');
      const instance = ctx.db.itemInstance.id.find(args.itemInstanceId);
      if (!instance) throw new SenderError('Item not found');
      if (instance.ownerCharacterId !== character.id) {
        throw new SenderError('Item does not belong to you');
      }
      if (instance.equippedSlot) throw new SenderError('Cannot trade equipped items');
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
      if (!trade) throw new SenderError('No active trade');
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
    if (!trade) throw new SenderError('No active trade');
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
};
