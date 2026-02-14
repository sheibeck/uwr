export const registerCorpseReducers = (deps: any) => {
  const {
    spacetimedb,
    t,
    SenderError,
    requireCharacterOwnedBy,
    appendPrivateEvent,
    removeCorpseIfEmpty,
  } = deps;

  spacetimedb.reducer('loot_corpse_item', { characterId: t.u64(), corpseItemId: t.u64() }, (ctx, args) => {
    const character = requireCharacterOwnedBy(ctx, args.characterId);

    // Find the CorpseItem row
    const corpseItem = ctx.db.corpseItem.id.find(args.corpseItemId);
    if (!corpseItem) throw new SenderError('Item not found in corpse');

    // Find the Corpse row
    const corpse = ctx.db.corpse.id.find(corpseItem.corpseId);
    if (!corpse) throw new SenderError('Corpse not found');

    // Verify ownership
    if (corpse.characterId !== character.id) {
      throw new SenderError('This is not your corpse');
    }

    // Verify location
    if (character.locationId !== corpse.locationId) {
      throw new SenderError('You must be at the corpse location');
    }

    // Get item details for message
    const itemInstance = ctx.db.itemInstance.id.find(corpseItem.itemInstanceId);
    const itemTemplate = itemInstance ? ctx.db.itemTemplate.id.find(itemInstance.templateId) : null;
    const itemName = itemTemplate?.name ?? 'item';

    // Delete the CorpseItem row (item returns to character's inventory automatically)
    ctx.db.corpseItem.id.delete(corpseItem.id);

    appendPrivateEvent(
      ctx,
      character.id,
      character.ownerUserId,
      'loot',
      `You retrieve ${itemName} from your corpse.`
    );

    // Check if corpse is now empty and auto-delete
    const deleted = removeCorpseIfEmpty(ctx, corpse.id);
    if (deleted) {
      appendPrivateEvent(
        ctx,
        character.id,
        character.ownerUserId,
        'system',
        'Your corpse crumbles to dust.'
      );
    }
  });

  spacetimedb.reducer('loot_all_corpse', { characterId: t.u64(), corpseId: t.u64() }, (ctx, args) => {
    const character = requireCharacterOwnedBy(ctx, args.characterId);

    // Find the Corpse row
    const corpse = ctx.db.corpse.id.find(args.corpseId);
    if (!corpse) throw new SenderError('Corpse not found');

    // Verify ownership
    if (corpse.characterId !== character.id) {
      throw new SenderError('This is not your corpse');
    }

    // Verify location
    if (character.locationId !== corpse.locationId) {
      throw new SenderError('You must be at the corpse location');
    }

    // Count and delete all CorpseItem rows
    let itemCount = 0;
    for (const corpseItem of ctx.db.corpseItem.by_corpse.filter(corpse.id)) {
      ctx.db.corpseItem.id.delete(corpseItem.id);
      itemCount += 1;
    }

    if (itemCount > 0) {
      appendPrivateEvent(
        ctx,
        character.id,
        character.ownerUserId,
        'loot',
        `You retrieve ${itemCount} item(s) from your corpse.`
      );
    }

    // Delete the corpse
    ctx.db.corpse.id.delete(corpse.id);

    appendPrivateEvent(
      ctx,
      character.id,
      character.ownerUserId,
      'system',
      'Your corpse crumbles to dust.'
    );
  });
};
