const BUFF_TYPE_LABELS: Record<string, string> = {
  'str': 'strength',
  'dex': 'dexterity',
  'mana_regen': 'mana regeneration',
  'stamina_regen': 'stamina regeneration',
  'health_regen': 'health regeneration',
};

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

      const instance = ctx.db.item_instance.id.find(itemInstanceId);
      if (!instance) throw new SenderError('Item not found');
      if (instance.ownerCharacterId !== characterId) throw new SenderError('Not your item');

      const template = ctx.db.item_template.id.find(instance.templateId);
      if (!template) throw new SenderError('Item template not found');
      if (template.slot !== 'food') throw new SenderError('This item is not food');

      // Consume the item
      if (instance.quantity > 1n) {
        ctx.db.item_instance.id.update({ ...instance, quantity: instance.quantity - 1n });
      } else {
        ctx.db.item_instance.id.delete(itemInstanceId);
      }

      // Apply food buff as CharacterEffect if the item has wellFed properties
      if (template.wellFedDurationMicros > 0n) {
        // Remove any existing food buff (one food at a time - sourceAbility 'Well Fed')
        for (const effect of ctx.db.character_effect.by_character.filter(characterId)) {
          if (effect.sourceAbility === 'Well Fed') {
            ctx.db.character_effect.id.delete(effect.id);
          }
        }

        // Map wellFedBuffType to CharacterEffect effectType
        // mana_regen and stamina_regen use food-specific types to act as regen rate bonuses
        // rather than periodic heal ticks (handled separately in regen_health reducer)
        let effectType = '';
        if (template.wellFedBuffType === 'str') effectType = 'str_bonus';
        else if (template.wellFedBuffType === 'dex') effectType = 'dex_bonus';
        else if (template.wellFedBuffType === 'mana_regen') effectType = 'food_mana_regen';
        else if (template.wellFedBuffType === 'stamina_regen') effectType = 'food_stamina_regen';
        else if (template.wellFedBuffType === 'health_regen') effectType = 'food_health_regen';

        if (effectType) {
          // Insert new food buff effect with high roundsRemaining (99 = long-duration)
          const magnitude = template.wellFedBuffMagnitude as bigint;
          // Convert to i64 for magnitude (cast from u64 to i64)
          const signedMagnitude = magnitude > 9223372036854775807n
            ? -(18446744073709551616n - magnitude)
            : magnitude;

          ctx.db.character_effect.insert({
            id: 0n,
            characterId,
            effectType,
            magnitude: signedMagnitude,
            roundsRemaining: 99n,
            sourceAbility: 'Well Fed',
          });

          const statLabel = BUFF_TYPE_LABELS[template.wellFedBuffType] || template.wellFedBuffType;
          appendPrivateEvent(
            ctx,
            character.id,
            character.ownerUserId,
            'system',
            `You eat the ${template.name} and feel well fed (+${template.wellFedBuffMagnitude} ${statLabel}).`
          );
        }
      }
    }
  );
};
