export const registerItemReducers = (deps: any) => {
  const {
    spacetimedb,
    t,
    SenderError,
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
    },
    (ctx, args) => {
      const slot = args.slot.trim();
      if (!EQUIPMENT_SLOTS.has(slot) && slot !== 'junk') throw new SenderError('Invalid slot');
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
      });
    }
  );

  spacetimedb.reducer('grant_item', { characterId: t.u64(), templateId: t.u64() }, (ctx, args) => {
    const character = requireCharacterOwnedBy(ctx, args.characterId);
    const template = ctx.db.itemTemplate.id.find(args.templateId);
    if (!template) throw new SenderError('Item template not found');
    ctx.db.itemInstance.insert({
      id: 0n,
      templateId: template.id,
      ownerCharacterId: character.id,
      equippedSlot: undefined,
    });
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
      if (itemCount >= 20) throw new SenderError('Backpack is full');
      if ((character.gold ?? 0n) < vendorItem.price) throw new SenderError('Not enough gold');
      ctx.db.character.id.update({
        ...character,
        gold: (character.gold ?? 0n) - vendorItem.price,
      });
      ctx.db.itemInstance.insert({
        id: 0n,
        templateId: template.id,
        ownerCharacterId: character.id,
        equippedSlot: undefined,
      });
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
      const value = template.vendorValue ?? 0n;
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
      total += template.vendorValue ?? 0n;
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
    if (itemCount >= 20) throw new SenderError('Backpack is full');
    const template = ctx.db.itemTemplate.id.find(loot.itemTemplateId);
    if (!template) throw new SenderError('Item template missing');
    ctx.db.itemInstance.insert({
      id: 0n,
      templateId: template.id,
      ownerCharacterId: character.id,
      equippedSlot: undefined,
    });
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
};
