const CONFIRMATION_TIMEOUT = 30_000_000n; // 30 seconds in microseconds

export const registerCorpseReducers = (deps: any) => {
  const {
    spacetimedb,
    t,
    SenderError,
    requireCharacterOwnedBy,
    appendPrivateEvent,
    removeCorpseIfEmpty,
    activeCombatIdForCharacter,
    PendingResurrect,
    PendingCorpseSummon,
    executeResurrect,
    executeCorpseSummon,
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

  // ===== RESURRECTION FLOW =====

  spacetimedb.reducer('initiate_resurrect', { casterCharacterId: t.u64(), corpseId: t.u64() }, (ctx, args) => {
    const caster = requireCharacterOwnedBy(ctx, args.casterCharacterId);

    // Verify caster is not in combat
    const combatId = activeCombatIdForCharacter(ctx, caster.id);
    if (combatId !== null) {
      throw new SenderError('Cannot resurrect while in combat');
    }

    // Find the corpse
    const corpse = ctx.db.corpse.id.find(args.corpseId);
    if (!corpse) throw new SenderError('Corpse not found');

    // Verify caster is at same location as corpse
    if (caster.locationId !== corpse.locationId) {
      throw new SenderError('You must be at the corpse location');
    }

    // Find the target character
    const target = ctx.db.character.id.find(corpse.characterId);
    if (!target) throw new SenderError('Target character not found');

    // Verify caster has Resurrect ability
    const abilityTemplate = [...ctx.db.abilityTemplate.by_key.filter('cleric_resurrect')][0];
    if (!abilityTemplate) throw new SenderError('Resurrect ability not found');

    if (caster.className !== 'cleric' || caster.level < 6n) {
      throw new SenderError('You must be a level 6+ cleric to resurrect');
    }

    // Check mana cost (simple formula: 4 + level * 2 + power, where level=6 power=0)
    const manaCost = 4n + 6n * 2n + 0n; // = 16 mana
    if (caster.mana < manaCost) {
      throw new SenderError('Not enough mana to resurrect');
    }

    // Clean up expired pending resurrect actions
    const nowMicros = ctx.timestamp.microsSinceUnixEpoch;
    for (const pending of ctx.db.pendingResurrect.iter()) {
      if (nowMicros - pending.createdAtMicros > CONFIRMATION_TIMEOUT) {
        ctx.db.pendingResurrect.id.delete(pending.id);
      }
    }

    // Check for existing pending resurrect for this target
    for (const pending of ctx.db.pendingResurrect.by_target.filter(target.id)) {
      throw new SenderError('Target already has a pending resurrect');
    }

    // Create PendingResurrect row
    ctx.db.pendingResurrect.insert({
      id: 0n,
      casterCharacterId: caster.id,
      targetCharacterId: target.id,
      corpseId: corpse.id,
      createdAtMicros: nowMicros,
    });

    appendPrivateEvent(ctx, caster.id, caster.ownerUserId, 'system', `Awaiting ${target.name}'s response to resurrect...`);
    appendPrivateEvent(ctx, target.id, target.ownerUserId, 'system', `${caster.name} wants to resurrect you. Accept or decline the resurrect.`);
  });

  spacetimedb.reducer('accept_resurrect', { characterId: t.u64(), pendingId: t.u64() }, (ctx, args) => {
    const character = requireCharacterOwnedBy(ctx, args.characterId);

    // Find PendingResurrect row
    const pending = ctx.db.pendingResurrect.id.find(args.pendingId);
    if (!pending) throw new SenderError('Pending resurrect not found');

    // Verify the pending action belongs to this character
    if (pending.targetCharacterId !== character.id) {
      throw new SenderError('This resurrect is not for you');
    }

    // Verify not expired
    const nowMicros = ctx.timestamp.microsSinceUnixEpoch;
    if (nowMicros - pending.createdAtMicros > CONFIRMATION_TIMEOUT) {
      ctx.db.pendingResurrect.id.delete(pending.id);
      throw new SenderError('Resurrect request expired');
    }

    // Find the corpse (it might have been looted/decayed in the meantime)
    const corpse = ctx.db.corpse.id.find(pending.corpseId);
    if (!corpse) {
      ctx.db.pendingResurrect.id.delete(pending.id);
      throw new SenderError('Corpse no longer exists');
    }

    // Find the caster (verify still exists and online)
    const caster = ctx.db.character.id.find(pending.casterCharacterId);
    if (!caster) {
      ctx.db.pendingResurrect.id.delete(pending.id);
      throw new SenderError('Caster no longer online');
    }

    // Re-verify mana availability
    const manaCost = 4n + 6n * 2n + 0n; // = 16 mana
    if (caster.mana < manaCost) {
      ctx.db.pendingResurrect.id.delete(pending.id);
      throw new SenderError('Caster no longer has enough mana');
    }

    // Deduct mana from caster
    ctx.db.character.id.update({
      ...caster,
      mana: caster.mana - manaCost,
    });

    // Execute resurrection
    executeResurrect(ctx, caster, character, corpse);

    // Delete the PendingResurrect row
    ctx.db.pendingResurrect.id.delete(pending.id);

    // Apply ability cooldown for cleric_resurrect on caster
    const abilityTemplate = [...ctx.db.abilityTemplate.by_key.filter('cleric_resurrect')][0];
    if (abilityTemplate) {
      const cooldownMicros = abilityTemplate.cooldownSeconds * 1_000_000n;
      ctx.db.abilityCooldown.insert({
        id: 0n,
        characterId: caster.id,
        abilityKey: 'cleric_resurrect',
        expiresAt: ctx.timestamp.microsSinceUnixEpoch + cooldownMicros,
      });
    }
  });

  spacetimedb.reducer('decline_resurrect', { characterId: t.u64(), pendingId: t.u64() }, (ctx, args) => {
    const character = requireCharacterOwnedBy(ctx, args.characterId);

    // Find PendingResurrect row
    const pending = ctx.db.pendingResurrect.id.find(args.pendingId);
    if (!pending) throw new SenderError('Pending resurrect not found');

    // Verify the pending action belongs to this character
    if (pending.targetCharacterId !== character.id) {
      throw new SenderError('This resurrect is not for you');
    }

    // Find caster for notification
    const caster = ctx.db.character.id.find(pending.casterCharacterId);

    // Delete the pending row
    ctx.db.pendingResurrect.id.delete(pending.id);

    // Notify both players
    if (caster) {
      appendPrivateEvent(ctx, caster.id, caster.ownerUserId, 'system', `${character.name} declined the resurrect.`);
    }
    appendPrivateEvent(ctx, character.id, character.ownerUserId, 'system', 'You declined the resurrect.');
  });

  // ===== CORPSE SUMMON FLOW =====

  spacetimedb.reducer('initiate_corpse_summon', { casterCharacterId: t.u64(), targetCharacterId: t.u64() }, (ctx, args) => {
    const caster = requireCharacterOwnedBy(ctx, args.casterCharacterId);

    // Verify caster is not in combat
    const combatId = activeCombatIdForCharacter(ctx, caster.id);
    if (combatId !== null) {
      throw new SenderError('Cannot summon corpses while in combat');
    }

    // Find target character
    const target = ctx.db.character.id.find(args.targetCharacterId);
    if (!target) throw new SenderError('Target character not found');

    // Verify target has at least one corpse
    const targetCorpses = [...ctx.db.corpse.by_character.filter(target.id)];
    if (targetCorpses.length === 0) {
      throw new SenderError('Target has no corpses to summon');
    }

    // Verify caster has Corpse Summon ability
    const abilityTemplate = [...ctx.db.abilityTemplate.by_key.filter('cleric_corpse_summon')][0];
    if (!abilityTemplate) throw new SenderError('Corpse Summon ability not found');

    if (caster.className !== 'cleric' || caster.level < 7n) {
      throw new SenderError('You must be a level 7+ cleric to summon corpses');
    }

    // Check mana cost (simple formula: 4 + level * 2 + power, where level=7 power=0)
    const manaCost = 4n + 7n * 2n + 0n; // = 18 mana
    if (caster.mana < manaCost) {
      throw new SenderError('Not enough mana to summon corpses');
    }

    // Clean up expired pending corpse summon actions
    const nowMicros = ctx.timestamp.microsSinceUnixEpoch;
    for (const pending of ctx.db.pendingCorpseSummon.iter()) {
      if (nowMicros - pending.createdAtMicros > CONFIRMATION_TIMEOUT) {
        ctx.db.pendingCorpseSummon.id.delete(pending.id);
      }
    }

    // Check for existing pending summon for this target
    for (const pending of ctx.db.pendingCorpseSummon.by_target.filter(target.id)) {
      throw new SenderError('Target already has a pending corpse summon');
    }

    // Create PendingCorpseSummon row
    ctx.db.pendingCorpseSummon.insert({
      id: 0n,
      casterCharacterId: caster.id,
      targetCharacterId: target.id,
      createdAtMicros: nowMicros,
    });

    appendPrivateEvent(ctx, caster.id, caster.ownerUserId, 'system', `Awaiting ${target.name}'s response to corpse summon...`);
    appendPrivateEvent(ctx, target.id, target.ownerUserId, 'system', `${caster.name} wants to summon your corpses. Accept or decline the summon.`);
  });

  spacetimedb.reducer('accept_corpse_summon', { characterId: t.u64(), pendingId: t.u64() }, (ctx, args) => {
    const character = requireCharacterOwnedBy(ctx, args.characterId);

    // Find PendingCorpseSummon row
    const pending = ctx.db.pendingCorpseSummon.id.find(args.pendingId);
    if (!pending) throw new SenderError('Pending corpse summon not found');

    // Verify the pending action belongs to this character
    if (pending.targetCharacterId !== character.id) {
      throw new SenderError('This corpse summon is not for you');
    }

    // Verify not expired
    const nowMicros = ctx.timestamp.microsSinceUnixEpoch;
    if (nowMicros - pending.createdAtMicros > CONFIRMATION_TIMEOUT) {
      ctx.db.pendingCorpseSummon.id.delete(pending.id);
      throw new SenderError('Corpse summon request expired');
    }

    // Find the caster (verify still exists and online)
    const caster = ctx.db.character.id.find(pending.casterCharacterId);
    if (!caster) {
      ctx.db.pendingCorpseSummon.id.delete(pending.id);
      throw new SenderError('Caster no longer online');
    }

    // Re-verify mana availability
    const manaCost = 4n + 7n * 2n + 0n; // = 18 mana
    if (caster.mana < manaCost) {
      ctx.db.pendingCorpseSummon.id.delete(pending.id);
      throw new SenderError('Caster no longer has enough mana');
    }

    // Deduct mana from caster
    ctx.db.character.id.update({
      ...caster,
      mana: caster.mana - manaCost,
    });

    // Execute corpse summon
    executeCorpseSummon(ctx, caster, character);

    // Delete the PendingCorpseSummon row
    ctx.db.pendingCorpseSummon.id.delete(pending.id);

    // Apply ability cooldown for cleric_corpse_summon on caster
    const abilityTemplate = [...ctx.db.abilityTemplate.by_key.filter('cleric_corpse_summon')][0];
    if (abilityTemplate) {
      const cooldownMicros = abilityTemplate.cooldownSeconds * 1_000_000n;
      ctx.db.abilityCooldown.insert({
        id: 0n,
        characterId: caster.id,
        abilityKey: 'cleric_corpse_summon',
        expiresAt: ctx.timestamp.microsSinceUnixEpoch + cooldownMicros,
      });
    }
  });

  spacetimedb.reducer('decline_corpse_summon', { characterId: t.u64(), pendingId: t.u64() }, (ctx, args) => {
    const character = requireCharacterOwnedBy(ctx, args.characterId);

    // Find PendingCorpseSummon row
    const pending = ctx.db.pendingCorpseSummon.id.find(args.pendingId);
    if (!pending) throw new SenderError('Pending corpse summon not found');

    // Verify the pending action belongs to this character
    if (pending.targetCharacterId !== character.id) {
      throw new SenderError('This corpse summon is not for you');
    }

    // Find caster for notification
    const caster = ctx.db.character.id.find(pending.casterCharacterId);

    // Delete the pending row
    ctx.db.pendingCorpseSummon.id.delete(pending.id);

    // Notify both players
    if (caster) {
      appendPrivateEvent(ctx, caster.id, caster.ownerUserId, 'system', `${character.name} declined the corpse summon.`);
    }
    appendPrivateEvent(ctx, character.id, character.ownerUserId, 'system', 'You declined the corpse summon.');
  });
};
