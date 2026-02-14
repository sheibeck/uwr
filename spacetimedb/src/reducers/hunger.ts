export const registerFoodReducers = (deps: any) => {
  const {
    spacetimedb,
    t,
    SenderError,
    requireCharacterOwnedBy,
    appendPrivateEvent,
  } = deps;

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

      // Consume the item
      if (instance.quantity > 1n) {
        ctx.db.itemInstance.id.update({ ...instance, quantity: instance.quantity - 1n });
      } else {
        ctx.db.itemInstance.id.delete(itemInstanceId);
      }

      // Apply food buff as CharacterEffect if the item has wellFed properties
      if (template.wellFedDurationMicros > 0n) {
        // Map wellFedBuffType to CharacterEffect effectType
        let effectType = '';
        if (template.wellFedBuffType === 'str') effectType = 'str_bonus';
        else if (template.wellFedBuffType === 'dex') effectType = 'dex_bonus';
        else if (template.wellFedBuffType === 'mana_regen') effectType = 'mana_regen';
        else if (template.wellFedBuffType === 'stamina_regen') effectType = 'stamina_regen';

        if (effectType) {
          // Remove any existing food buff of the same type to prevent stacking
          for (const effect of ctx.db.characterEffect.by_character.filter(characterId)) {
            if (effect.sourceAbility === 'food_buff' && effect.effectType === effectType) {
              ctx.db.characterEffect.id.delete(effect.id);
            }
          }

          // Insert new food buff effect with high roundsRemaining (99 = long-duration)
          const magnitude = template.wellFedBuffMagnitude as bigint;
          // Convert to i64 for magnitude (cast from u64 to i64)
          const signedMagnitude = magnitude > 9223372036854775807n
            ? -(18446744073709551616n - magnitude)
            : magnitude;

          ctx.db.characterEffect.insert({
            id: 0n,
            characterId,
            effectType,
            magnitude: signedMagnitude,
            roundsRemaining: 99n,
            sourceAbility: 'food_buff',
          });

          appendPrivateEvent(
            ctx,
            character.id,
            character.ownerUserId,
            'system',
            `You eat the ${template.name} and feel well fed (+${template.wellFedBuffMagnitude} ${template.wellFedBuffType.toUpperCase()}).`
          );
        }
      }
    }
  );
};
