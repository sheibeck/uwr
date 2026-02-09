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
  } = deps;

  spacetimedb.reducer(
    'create_item_template',
    {
      name: t.string(),
      slot: t.string(),
      armorType: t.string(),
      rarity: t.string(),
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
      if (!EQUIPMENT_SLOTS.has(slot)) throw new SenderError('Invalid slot');
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
      try {
        executeAbility(ctx, character, abilityKey, args.targetCharacterId);
        const targetName = args.targetCharacterId
          ? ctx.db.character.id.find(args.targetCharacterId)?.name ?? 'your target'
          : 'yourself';
        appendPrivateEvent(
          ctx,
          character.id,
          character.ownerUserId,
          'ability',
          `You use ${abilityKey.replace(/_/g, ' ')} on ${targetName}.`
        );
      } catch (error) {
        appendPrivateEvent(
          ctx,
          character.id,
          character.ownerUserId,
          'ability',
          `Ability failed: ${error}`
        );
      }
    }
  );
};
