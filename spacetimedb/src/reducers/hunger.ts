export const registerHungerReducers = (deps: any) => {
  const {
    spacetimedb,
    t,
    SenderError,
    ScheduleAt,
    Timestamp,
    Hunger,
    HungerDecayTick,
    HUNGER_DECAY_INTERVAL_MICROS,
    requireCharacterOwnedBy,
    appendPrivateEvent,
  } = deps;

  spacetimedb.reducer('decay_hunger', { arg: HungerDecayTick.rowType }, (ctx: any) => {
    for (const hunger of ctx.db.hunger.iter()) {
      if (hunger.currentHunger <= 0n) continue;
      const next = hunger.currentHunger > 2n ? hunger.currentHunger - 2n : 0n;
      let updatedHunger = { ...hunger, currentHunger: next };

      // Apply regen buffs on each decay tick if the buff is still active
      if (hunger.wellFedUntil.microsSinceUnixEpoch > ctx.timestamp.microsSinceUnixEpoch) {
        const character = ctx.db.character.id.find(hunger.characterId);
        if (character) {
          if (hunger.wellFedBuffType === 'stamina_regen') {
            // TODO: implement when stamina regen from Well Fed is wired to combat stamina flow
          }
          if (hunger.wellFedBuffType === 'mana_regen') {
            // TODO: implement when mana regen from Well Fed is wired to mana flow
          }
        }
      }

      ctx.db.hunger.id.update(updatedHunger);
    }
    ctx.db.hungerDecayTick.insert({
      scheduledId: 0n,
      scheduledAt: ScheduleAt.time(ctx.timestamp.microsSinceUnixEpoch + HUNGER_DECAY_INTERVAL_MICROS),
    });
  });

  spacetimedb.reducer(
    'eat_food',
    { characterId: t.u64(), itemInstanceId: t.u64() },
    (ctx: any, { characterId, itemInstanceId }: { characterId: bigint; itemInstanceId: bigint }) => {
      const character = requireCharacterOwnedBy(ctx, characterId);

      const instance = ctx.db.itemInstance.id.find(itemInstanceId);
      if (!instance) throw new SenderError('Item not found');
      if (instance.ownerCharacterId !== characterId) throw new SenderError('Not your item');

      const template = ctx.db.itemTemplate.id.find(instance.templateId);
      if (!template) throw new SenderError('Item template not found');
      if (template.slot !== 'food') throw new SenderError('This item is not food');

      const hungerRow = [...ctx.db.hunger.characterId.filter(characterId)][0] ?? null;
      if (!hungerRow) throw new SenderError('No hunger record for this character');

      // Consume the item
      if (instance.quantity > 1n) {
        ctx.db.itemInstance.id.update({ ...instance, quantity: instance.quantity - 1n });
      } else {
        ctx.db.itemInstance.id.delete(itemInstanceId);
      }

      if (template.wellFedDurationMicros > 0n) {
        const nowMicros = ctx.timestamp.microsSinceUnixEpoch;
        const newExpiry = nowMicros + template.wellFedDurationMicros;
        const currentExpiry = hungerRow.wellFedUntil.microsSinceUnixEpoch;
        const wellFedUntilMicros = newExpiry > currentExpiry ? newExpiry : currentExpiry;

        ctx.db.hunger.id.update({
          ...hungerRow,
          wellFedUntil: new Timestamp(wellFedUntilMicros),
          wellFedBuffType: template.wellFedBuffType,
          wellFedBuffMagnitude: template.wellFedBuffMagnitude,
        });

        appendPrivateEvent(
          ctx,
          character.id,
          character.ownerUserId,
          'system',
          `You eat the ${template.name} and feel well fed.`
        );
      }
    }
  );
};
