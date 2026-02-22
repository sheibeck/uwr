export const registerBankReducers = (deps: any) => {
  const {
    spacetimedb,
    t,
    requirePlayerUserId,
    requireCharacterOwnedBy,
    appendPrivateEvent,
    hasInventorySpace,
    MAX_INVENTORY_SLOTS,
    getInventorySlotCount,
    fail,
  } = deps;

  const MAX_BANK_SLOTS = 40n;

  const failBank = (ctx: any, character: any, message: string) =>
    fail(ctx, character, message, 'system');

  spacetimedb.reducer(
    'deposit_to_bank',
    { characterId: t.u64(), instanceId: t.u64() },
    (ctx: any, args: any) => {
      const character = requireCharacterOwnedBy(ctx, args.characterId);
      const userId = requirePlayerUserId(ctx);

      const instance = ctx.db.itemInstance.id.find(args.instanceId);
      if (!instance) return failBank(ctx, character, 'Item not found');
      if (instance.ownerCharacterId !== character.id) {
        return failBank(ctx, character, 'Item does not belong to your character');
      }
      if (instance.equippedSlot) {
        return failBank(ctx, character, 'Unequip the item before depositing');
      }

      const template = ctx.db.itemTemplate.id.find(instance.templateId);
      if (!template) return failBank(ctx, character, 'Item template missing');

      // Check for existing stack in bank to merge into
      const existingSlots = [...ctx.db.bankSlot.by_owner.filter(userId)];
      if (template.stackable) {
        const existingBankStack = existingSlots
          .map((s: any) => ({ bankSlot: s, item: ctx.db.itemInstance.id.find(s.itemInstanceId) }))
          .find(({ item }) => item && item.templateId === instance.templateId);

        if (existingBankStack) {
          ctx.db.itemInstance.id.update({
            ...existingBankStack.item,
            quantity: (existingBankStack.item.quantity ?? 1n) + (instance.quantity ?? 1n),
          });
          ctx.db.itemInstance.id.delete(instance.id);
          appendPrivateEvent(ctx, character.id, character.ownerUserId, 'system',
            `You deposit ${template.name} into the bank.`);
          return;
        }
      }

      // No existing stack — need a free slot
      if (BigInt(existingSlots.length) >= MAX_BANK_SLOTS) {
        return failBank(ctx, character, 'Bank is full (40 slots maximum)');
      }

      // Find first free slot index (0-39)
      const usedSlots = new Set(existingSlots.map((s: any) => Number(s.slot)));
      let freeSlot = -1;
      for (let i = 0; i < 40; i++) {
        if (!usedSlots.has(i)) { freeSlot = i; break; }
      }
      if (freeSlot === -1) return failBank(ctx, character, 'Bank is full');

      // Remove from character inventory (ownerCharacterId = 0n means "in bank")
      ctx.db.itemInstance.id.update({
        ...instance,
        ownerCharacterId: 0n,
        equippedSlot: undefined,
      });

      ctx.db.bankSlot.insert({
        id: 0n,
        ownerUserId: userId,
        slot: BigInt(freeSlot),
        itemInstanceId: instance.id,
      });

      appendPrivateEvent(
        ctx,
        character.id,
        character.ownerUserId,
        'system',
        `You deposit ${template.name} into the bank.`
      );
    }
  );

  spacetimedb.reducer(
    'withdraw_from_bank',
    { characterId: t.u64(), bankSlotId: t.u64() },
    (ctx: any, args: any) => {
      const character = requireCharacterOwnedBy(ctx, args.characterId);
      const userId = requirePlayerUserId(ctx);

      const bankSlot = ctx.db.bankSlot.id.find(args.bankSlotId);
      if (!bankSlot) return failBank(ctx, character, 'Bank slot not found');
      if (bankSlot.ownerUserId !== userId) {
        return failBank(ctx, character, 'This is not your bank slot');
      }

      const instance = ctx.db.itemInstance.id.find(bankSlot.itemInstanceId);
      if (!instance) {
        // Orphaned bank slot — clean it up
        ctx.db.bankSlot.id.delete(bankSlot.id);
        return failBank(ctx, character, 'Item not found in bank');
      }

      // Check inventory space
      const template = ctx.db.itemTemplate.id.find(instance.templateId);
      if (!template) return failBank(ctx, character, 'Item template missing');

      // Check for existing stack to merge into
      const existingStack = template.stackable
        ? [...ctx.db.itemInstance.by_owner.filter(character.id)].find(
            (row: any) => row.templateId === template.id && !row.equippedSlot
          )
        : null;
      const slotCount = getInventorySlotCount(ctx, character.id);
      if (!existingStack && slotCount >= MAX_INVENTORY_SLOTS) {
        return failBank(ctx, character, 'Backpack is full');
      }

      if (existingStack) {
        // Merge quantity into existing stack, delete the bank instance
        ctx.db.itemInstance.id.update({
          ...existingStack,
          quantity: (existingStack.quantity ?? 1n) + (instance.quantity ?? 1n),
        });
        ctx.db.itemInstance.id.delete(instance.id);
      } else {
        // Transfer item back to character as a new slot
        ctx.db.itemInstance.id.update({
          ...instance,
          ownerCharacterId: character.id,
          equippedSlot: undefined,
        });
      }

      ctx.db.bankSlot.id.delete(bankSlot.id);

      appendPrivateEvent(
        ctx,
        character.id,
        character.ownerUserId,
        'system',
        `You withdraw ${template.name} from the bank.`
      );
    }
  );
};
