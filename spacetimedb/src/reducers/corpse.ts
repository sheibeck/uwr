const CONFIRMATION_TIMEOUT = 30_000_000n; // 30 seconds in microseconds

export const registerCorpseReducers = (deps: any) => {
  const {
    spacetimedb,
    t,
    SenderError,
    requireCharacterOwnedBy,
    appendPrivateEvent,
    fail,
    removeCorpseIfEmpty,
    activeCombatIdForCharacter,
    PendingSpellCast,
    executeResurrect,
    executeCorpseSummon,
    abilityCastMicros,
  } = deps;

  spacetimedb.reducer('loot_corpse_item', { characterId: t.u64(), corpseItemId: t.u64() }, (ctx, args) => {
    const character = requireCharacterOwnedBy(ctx, args.characterId);

    // Find the CorpseItem row
    const corpseItem = ctx.db.corpseItem.id.find(args.corpseItemId);
    if (!corpseItem) {
      fail(ctx, character, 'Item not found in corpse');
      return;
    }

    // Find the Corpse row
    const corpse = ctx.db.corpse.id.find(corpseItem.corpseId);
    if (!corpse) {
      fail(ctx, character, 'Corpse not found');
      return;
    }

    // Verify ownership
    if (corpse.characterId !== character.id) {
      fail(ctx, character, 'This is not your corpse');
      return;
    }

    // Verify location
    if (character.locationId !== corpse.locationId) {
      fail(ctx, character, 'You must be at the corpse location');
      return;
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
    if (!corpse) {
      fail(ctx, character, 'Corpse not found');
      return;
    }

    // Verify ownership
    if (corpse.characterId !== character.id) {
      fail(ctx, character, 'This is not your corpse');
      return;
    }

    // Verify location
    if (character.locationId !== corpse.locationId) {
      fail(ctx, character, 'You must be at the corpse location');
      return;
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
      fail(ctx, caster, 'Cannot resurrect while in combat');
      return;
    }

    // Find the corpse
    const corpse = ctx.db.corpse.id.find(args.corpseId);
    if (!corpse) {
      fail(ctx, caster, 'Corpse not found');
      return;
    }

    // Verify caster is at same location as corpse
    if (caster.locationId !== corpse.locationId) {
      fail(ctx, caster, 'You must be at the corpse location');
      return;
    }

    // Find the target character
    const target = ctx.db.character.id.find(corpse.characterId);
    if (!target) {
      fail(ctx, caster, 'Target character not found');
      return;
    }

    // Verify caster has Resurrect ability
    const abilityTemplate = [...ctx.db.abilityTemplate.by_key.filter('cleric_resurrect')][0];
    if (!abilityTemplate) {
      fail(ctx, caster, 'Resurrect ability not found');
      return;
    }

    if (caster.className.toLowerCase() !== 'cleric' || caster.level < 6n) {
      fail(ctx, caster, `You must be a level 6+ cleric to resurrect (you are: ${caster.className} level ${caster.level})`);
      return;
    }

    // Check mana cost (flat 50 mana)
    const manaCost = 50n;
    if (caster.mana < manaCost) {
      fail(ctx, caster, 'Not enough mana to resurrect');
      return;
    }

    // Clean up expired pending spell casts
    const nowMicros = ctx.timestamp.microsSinceUnixEpoch;
    for (const pending of ctx.db.pendingSpellCast.iter()) {
      if (nowMicros - pending.createdAtMicros > CONFIRMATION_TIMEOUT) {
        ctx.db.pendingSpellCast.id.delete(pending.id);
      }
    }

    // Check for existing pending resurrect for this target
    for (const pending of ctx.db.pendingSpellCast.by_target.filter(target.id)) {
      if (pending.spellType === 'resurrect') {
        fail(ctx, caster, 'Target already has a pending resurrect');
        return;
      }
    }

    // Deduct mana cost upfront (before cast)
    ctx.db.character.id.update({
      ...caster,
      mana: caster.mana - manaCost,
    });

    // Create PendingSpellCast row (confirmation request is sent after cast completes via use_ability flow)
    ctx.db.pendingSpellCast.insert({
      id: 0n,
      spellType: 'resurrect',
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

    // Find PendingSpellCast row
    const pending = ctx.db.pendingSpellCast.id.find(args.pendingId);
    if (!pending) {
      fail(ctx, character, 'Pending resurrect not found');
      return;
    }

    // Verify this is a resurrect spell
    if (pending.spellType !== 'resurrect') {
      fail(ctx, character, 'Invalid spell type');
      return;
    }

    // Verify the pending action belongs to this character
    if (pending.targetCharacterId !== character.id) {
      fail(ctx, character, 'This resurrect is not for you');
      return;
    }

    // Verify not expired
    const nowMicros = ctx.timestamp.microsSinceUnixEpoch;
    if (nowMicros - pending.createdAtMicros > CONFIRMATION_TIMEOUT) {
      ctx.db.pendingSpellCast.id.delete(pending.id);
      fail(ctx, character, 'Resurrect request expired');
      return;
    }

    // Find the corpse (it might have been looted/decayed in the meantime)
    const corpse = pending.corpseId ? ctx.db.corpse.id.find(pending.corpseId) : null;
    if (!corpse) {
      // Notify caster before deleting
      const caster = ctx.db.character.id.find(pending.casterCharacterId);
      if (caster) {
        appendPrivateEvent(
          ctx,
          caster.id,
          caster.ownerUserId,
          'error',
          `${character.name} accepted, but the corpse no longer exists.`
        );
      }
      ctx.db.pendingSpellCast.id.delete(pending.id);
      fail(ctx, character, 'Corpse no longer exists');
      return;
    }

    // Find the caster (verify still exists and online)
    const caster = ctx.db.character.id.find(pending.casterCharacterId);
    if (!caster) {
      ctx.db.pendingSpellCast.id.delete(pending.id);
      fail(ctx, character, 'Caster no longer online');
      return;
    }

    // Check if caster is already casting
    const existingCast = [...ctx.db.characterCast.by_character.filter(caster.id)][0];
    if (existingCast && existingCast.endsAtMicros > nowMicros) {
      appendPrivateEvent(
        ctx,
        caster.id,
        caster.ownerUserId,
        'error',
        `${character.name} accepted, but you are already casting.`
      );
      ctx.db.pendingSpellCast.id.delete(pending.id);
      fail(ctx, character, 'Caster is already casting');
      return;
    }
    if (existingCast) {
      ctx.db.characterCast.id.delete(existingCast.id);
    }

    // Note: Mana was already deducted in initiate_resurrect

    // Start the cast (tick_casts will execute the ability and apply cooldown after cast completes)
    const castMicros = abilityCastMicros(ctx, 'cleric_resurrect');
    ctx.db.characterCast.insert({
      id: 0n,
      characterId: caster.id,
      abilityKey: 'cleric_resurrect',
      targetCharacterId: character.id,
      endsAtMicros: nowMicros + castMicros,
    });

    // Delete the PendingSpellCast so the confirmation dialog closes
    // tick_casts will execute the ability and apply cooldown after cast completes
    ctx.db.pendingSpellCast.id.delete(pending.id);

    appendPrivateEvent(
      ctx,
      caster.id,
      caster.ownerUserId,
      'ability',
      `${character.name} accepted. Casting Resurrect...`
    );
    appendPrivateEvent(
      ctx,
      character.id,
      character.ownerUserId,
      'system',
      'You accepted the resurrect. The caster is now casting...'
    );
  });

  spacetimedb.reducer('decline_resurrect', { characterId: t.u64(), pendingId: t.u64() }, (ctx, args) => {
    const character = requireCharacterOwnedBy(ctx, args.characterId);

    // Find PendingSpellCast row
    const pending = ctx.db.pendingSpellCast.id.find(args.pendingId);
    if (!pending) {
      fail(ctx, character, 'Pending resurrect not found');
      return;
    }

    // Verify this is a resurrect spell
    if (pending.spellType !== 'resurrect') {
      fail(ctx, character, 'Invalid spell type');
      return;
    }

    // Verify the pending action belongs to this character
    if (pending.targetCharacterId !== character.id) {
      fail(ctx, character, 'This resurrect is not for you');
      return;
    }

    // Find caster for notification
    const caster = ctx.db.character.id.find(pending.casterCharacterId);

    // Delete the pending row
    ctx.db.pendingSpellCast.id.delete(pending.id);

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
      fail(ctx, caster, 'Cannot summon corpses while in combat');
      return;
    }

    // Find target character
    const target = ctx.db.character.id.find(args.targetCharacterId);
    if (!target) {
      fail(ctx, caster, 'Target character not found');
      return;
    }

    // Verify target has at least one corpse
    const targetCorpses = [...ctx.db.corpse.by_character.filter(target.id)];
    if (targetCorpses.length === 0) {
      fail(ctx, caster, 'Target has no corpses to summon');
      return;
    }

    // Verify caster class and level
    const validCorpseSummonClass = caster.className.toLowerCase() === 'necromancer' || caster.className.toLowerCase() === 'summoner';
    if (!validCorpseSummonClass || caster.level < 6n) {
      fail(ctx, caster, 'You must be a level 6+ necromancer or summoner to summon corpses');
      return;
    }

    // Verify caster has Corpse Summon ability
    const abilityKey = `${caster.className.toLowerCase()}_corpse_summon`;
    const abilityTemplate = [...ctx.db.abilityTemplate.by_key.filter(abilityKey)][0];
    if (!abilityTemplate) {
      fail(ctx, caster, 'Corpse Summon ability not found');
      return;
    }

    // Check mana cost (flat 60 mana)
    const manaCost = 60n;
    if (caster.mana < manaCost) {
      fail(ctx, caster, 'Not enough mana to summon corpses');
      return;
    }

    // Clean up expired pending spell casts
    const nowMicros = ctx.timestamp.microsSinceUnixEpoch;
    for (const pending of ctx.db.pendingSpellCast.iter()) {
      if (nowMicros - pending.createdAtMicros > CONFIRMATION_TIMEOUT) {
        ctx.db.pendingSpellCast.id.delete(pending.id);
      }
    }

    // Check for existing pending summon for this target
    for (const pending of ctx.db.pendingSpellCast.by_target.filter(target.id)) {
      if (pending.spellType === 'corpse_summon') {
        fail(ctx, caster, 'Target already has a pending corpse summon');
        return;
      }
    }

    // Note: Mana will be deducted when target accepts (in accept_corpse_summon)

    // Create PendingSpellCast row
    ctx.db.pendingSpellCast.insert({
      id: 0n,
      spellType: 'corpse_summon',
      casterCharacterId: caster.id,
      targetCharacterId: target.id,
      corpseId: undefined,
      createdAtMicros: nowMicros,
    });

    appendPrivateEvent(ctx, caster.id, caster.ownerUserId, 'system', `Awaiting ${target.name}'s response to corpse summon...`);
    appendPrivateEvent(ctx, target.id, target.ownerUserId, 'system', `${caster.name} wants to summon your corpses. Accept or decline the summon.`);
  });

  spacetimedb.reducer('accept_corpse_summon', { characterId: t.u64(), pendingId: t.u64() }, (ctx, args) => {
    const character = requireCharacterOwnedBy(ctx, args.characterId);

    // Find PendingSpellCast row
    const pending = ctx.db.pendingSpellCast.id.find(args.pendingId);
    if (!pending) {
      fail(ctx, character, 'Pending corpse summon not found');
      return;
    }

    // Verify this is a corpse_summon spell
    if (pending.spellType !== 'corpse_summon') {
      fail(ctx, character, 'Invalid spell type');
      return;
    }

    // Verify the pending action belongs to this character
    if (pending.targetCharacterId !== character.id) {
      fail(ctx, character, 'This corpse summon is not for you');
      return;
    }

    // Verify not expired
    const nowMicros = ctx.timestamp.microsSinceUnixEpoch;
    if (nowMicros - pending.createdAtMicros > CONFIRMATION_TIMEOUT) {
      ctx.db.pendingSpellCast.id.delete(pending.id);
      fail(ctx, character, 'Corpse summon request expired');
      return;
    }

    // Find the caster (verify still exists and online)
    const caster = ctx.db.character.id.find(pending.casterCharacterId);
    if (!caster) {
      ctx.db.pendingSpellCast.id.delete(pending.id);
      fail(ctx, character, 'Caster no longer online');
      return;
    }

    // Check if caster is already casting
    const existingCast = [...ctx.db.characterCast.by_character.filter(caster.id)][0];
    if (existingCast && existingCast.endsAtMicros > nowMicros) {
      appendPrivateEvent(
        ctx,
        caster.id,
        caster.ownerUserId,
        'error',
        `${character.name} accepted, but you are already casting.`
      );
      ctx.db.pendingSpellCast.id.delete(pending.id);
      fail(ctx, character, 'Caster is already casting');
      return;
    }
    if (existingCast) {
      ctx.db.characterCast.id.delete(existingCast.id);
    }

    // Deduct mana cost now that target has accepted (flat 60 mana)
    const manaCost = 60n;
    if (caster.mana < manaCost) {
      ctx.db.pendingSpellCast.id.delete(pending.id);
      fail(ctx, character, 'Caster no longer has enough mana');
      return;
    }
    ctx.db.character.id.update({
      ...caster,
      mana: caster.mana - manaCost,
    });

    // Get the correct ability key based on caster class
    const abilityKey = `${caster.className.toLowerCase()}_corpse_summon`;

    // Start the cast (tick_casts will execute the ability and apply cooldown after cast completes)
    const castMicros = abilityCastMicros(ctx, abilityKey);
    ctx.db.characterCast.insert({
      id: 0n,
      characterId: caster.id,
      abilityKey,
      targetCharacterId: character.id,
      endsAtMicros: nowMicros + castMicros,
    });

    // Delete the PendingSpellCast so the confirmation dialog closes
    // tick_casts will execute the ability and apply cooldown after cast completes
    ctx.db.pendingSpellCast.id.delete(pending.id);

    appendPrivateEvent(
      ctx,
      caster.id,
      caster.ownerUserId,
      'ability',
      `${character.name} accepted. Casting Corpse Summon...`
    );
    appendPrivateEvent(
      ctx,
      character.id,
      character.ownerUserId,
      'system',
      'You accepted the corpse summon. The caster is now casting...'
    );
  });

  spacetimedb.reducer('decline_corpse_summon', { characterId: t.u64(), pendingId: t.u64() }, (ctx, args) => {
    const character = requireCharacterOwnedBy(ctx, args.characterId);

    // Find PendingSpellCast row
    const pending = ctx.db.pendingSpellCast.id.find(args.pendingId);
    if (!pending) {
      fail(ctx, character, 'Pending corpse summon not found');
      return;
    }

    // Verify this is a corpse_summon spell
    if (pending.spellType !== 'corpse_summon') {
      fail(ctx, character, 'Invalid spell type');
      return;
    }

    // Verify the pending action belongs to this character
    if (pending.targetCharacterId !== character.id) {
      fail(ctx, character, 'This corpse summon is not for you');
      return;
    }

    // Find caster for notification
    const caster = ctx.db.character.id.find(pending.casterCharacterId);

    // Delete the pending row
    ctx.db.pendingSpellCast.id.delete(pending.id);

    // Notify both players
    if (caster) {
      appendPrivateEvent(ctx, caster.id, caster.ownerUserId, 'system', `${character.name} declined the corpse summon.`);
    }
    appendPrivateEvent(ctx, character.id, character.ownerUserId, 'system', 'You declined the corpse summon.');
  });

  // ===== ADMIN/TESTING COMMANDS =====

  spacetimedb.reducer('spawn_corpse', { characterId: t.u64() }, (ctx, args) => {
    const character = requireCharacterOwnedBy(ctx, args.characterId);

    // Find a random junk item template
    const junkTemplates = [...ctx.db.itemTemplate.iter()].filter((row: any) => row.isJunk);

    if (junkTemplates.length === 0) {
      fail(ctx, character, 'No junk item templates found');
      return;
    }

    // Pick a random one using timestamp-based seed
    const seed = ctx.timestamp.microsSinceUnixEpoch;
    const template = junkTemplates[Number(seed % BigInt(junkTemplates.length))];

    // Create an ItemInstance owned by the character
    const item = ctx.db.itemInstance.insert({
      id: 0n,
      templateId: template.id,
      ownerCharacterId: character.id,
      equippedSlot: undefined,
      quantity: 1n,
    });

    // Check for existing corpse at character's current location
    const existingCorpses = [...ctx.db.corpse.by_character.filter(character.id)];
    const existingAtLocation = existingCorpses.find((c: any) => c.locationId === character.locationId);

    let corpse;
    if (existingAtLocation) {
      // Reuse existing corpse at this location, update timestamp
      corpse = ctx.db.corpse.id.update({
        ...existingAtLocation,
        createdAt: ctx.timestamp,
      });
    } else {
      // Create new corpse at character's location
      corpse = ctx.db.corpse.insert({
        id: 0n,
        characterId: character.id,
        locationId: character.locationId,
        createdAt: ctx.timestamp,
      });
    }

    // Insert CorpseItem linking the item to the corpse
    ctx.db.corpseItem.insert({
      id: 0n,
      corpseId: corpse.id,
      itemInstanceId: item.id,
    });

    // Log a message
    appendPrivateEvent(
      ctx,
      character.id,
      character.ownerUserId,
      'system',
      `A corpse appears with ${template.name}.`
    );
  });
};
