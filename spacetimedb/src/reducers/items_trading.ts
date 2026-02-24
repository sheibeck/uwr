export const registerItemTradingReducers = (deps: any) => {
  const {
    spacetimedb,
    t,
    requireCharacterOwnedBy,
    appendPrivateEvent,
    getInventorySlotCount,
    MAX_INVENTORY_SLOTS,
    findCharacterByName,
    fail,
  } = deps;

  const failItem = (ctx: any, character: any, message: string) =>
    fail(ctx, character, message, 'system');

  const findActiveTrade = (ctx: any, characterId: bigint) => {
    for (const trade of ctx.db.trade_session.iter()) {
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
    for (const instance of ctx.db.item_instance.by_owner.filter(characterId)) {
      if (instance.equippedSlot) continue;
      const template = ctx.db.item_template.id.find(instance.templateId);
      if (template?.stackable) {
        existingStacks.add(template.id.toString());
      }
    }
    const incomingStacked = new Set<string>();
    for (const item of items) {
      const template = ctx.db.item_template.id.find(item.templateId);
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
    const fromItems = [...ctx.db.trade_item.by_trade.filter(trade.id)].filter(
      (row) => row.fromCharacterId === trade.fromCharacterId
    );
    const toItems = [...ctx.db.trade_item.by_trade.filter(trade.id)].filter(
      (row) => row.fromCharacterId === trade.toCharacterId
    );

    const fromPayload = fromItems
      .map((row) => ctx.db.item_instance.id.find(row.itemInstanceId))
      .filter(Boolean);
    const toPayload = toItems
      .map((row) => ctx.db.item_instance.id.find(row.itemInstanceId))
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
      ctx.db.trade_session.id.update({ ...trade, fromAccepted: false, toAccepted: false });
      return;
    }

    const transferItem = (instance: any, receiverId: bigint) => {
      const template = ctx.db.item_template.id.find(instance.templateId);
      if (!template) return;
      if (template.stackable) {
        const existing = [...ctx.db.item_instance.by_owner.filter(receiverId)].find(
          (row) => row.templateId === template.id && !row.equippedSlot
        );
        if (existing) {
          ctx.db.item_instance.id.update({
            ...existing,
            quantity: (existing.quantity ?? 1n) + (instance.quantity ?? 1n),
          });
          ctx.db.item_instance.id.delete(instance.id);
          return;
        }
      }
      ctx.db.item_instance.id.update({
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

    for (const row of ctx.db.trade_item.by_trade.filter(trade.id)) {
      ctx.db.trade_item.id.delete(row.id);
    }
    ctx.db.trade_session.id.delete(trade.id);

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
      const target = findCharacterByName(ctx, args.targetName.trim());
      if (!target) return failItem(ctx, character, 'Target not found');
      if (target.id === character.id) return failItem(ctx, character, 'Cannot trade with yourself');
      if (target.locationId !== character.locationId) {
        return failItem(ctx, character, 'Target is not here');
      }
      const existing = findActiveTrade(ctx, character.id);
      if (existing) return failItem(ctx, character, 'Trade already in progress');
      const targetExisting = findActiveTrade(ctx, target.id);
      if (targetExisting) return failItem(ctx, character, 'Target is already trading');
      const trade = ctx.db.trade_session.insert({
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
      const instance = ctx.db.item_instance.id.find(args.itemInstanceId);
      if (!instance) return failItem(ctx, character, 'Item not found');
      if (instance.ownerCharacterId !== character.id) {
        return failItem(ctx, character, 'Item does not belong to you');
      }
      if (instance.equippedSlot) return failItem(ctx, character, 'Cannot trade equipped items');
      for (const row of ctx.db.trade_item.by_trade.filter(trade.id)) {
        if (row.itemInstanceId === instance.id) return;
      }
      ctx.db.trade_item.insert({
        id: 0n,
        tradeId: trade.id,
        fromCharacterId: character.id,
        itemInstanceId: instance.id,
        quantity: instance.quantity ?? 1n,
      });
      ctx.db.trade_session.id.update({ ...trade, fromAccepted: false, toAccepted: false });
    }
  );

  spacetimedb.reducer(
    'remove_trade_item',
    { characterId: t.u64(), itemInstanceId: t.u64() },
    (ctx, args) => {
      const character = requireCharacterOwnedBy(ctx, args.characterId);
      const trade = findActiveTrade(ctx, character.id);
      if (!trade) return failItem(ctx, character, 'No active trade');
      for (const row of ctx.db.trade_item.by_trade.filter(trade.id)) {
        if (row.itemInstanceId === args.itemInstanceId) {
          ctx.db.trade_item.id.delete(row.id);
          ctx.db.trade_session.id.update({ ...trade, fromAccepted: false, toAccepted: false });
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
      ctx.db.trade_session.id.update({ ...trade, fromAccepted: true });
    } else {
      ctx.db.trade_session.id.update({ ...trade, toAccepted: true });
    }
    const updated = ctx.db.trade_session.id.find(trade.id);
    if (updated && updated.fromAccepted && updated.toAccepted) {
      finalizeTrade(ctx, updated);
    }
  });

  spacetimedb.reducer('cancel_trade', { characterId: t.u64() }, (ctx, args) => {
    const character = requireCharacterOwnedBy(ctx, args.characterId);
    const trade = findActiveTrade(ctx, character.id);
    if (!trade) return;
    for (const row of ctx.db.trade_item.by_trade.filter(trade.id)) {
      ctx.db.trade_item.id.delete(row.id);
    }
    ctx.db.trade_session.id.delete(trade.id);
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
