export const registerCommandReducers = (deps: any) => {
  const {
    spacetimedb,
    t,
    SenderError,
    requireCharacterOwnedBy,
    requirePlayerUserId,
    appendPrivateEvent,
    appendLocationEvent,
    appendGroupEvent,
    computeBaseStats,
    recomputeCharacterDerived,
    xpRequiredForLevel,
    MAX_LEVEL,
  } = deps;

  spacetimedb.reducer('submit_command', { characterId: t.u64(), text: t.string() }, (ctx, args) => {
    const character = requireCharacterOwnedBy(ctx, args.characterId);
    const trimmed = args.text.trim();
    if (!trimmed) throw new SenderError('Command is empty');

    if (trimmed.toLowerCase() === '/look' || trimmed.toLowerCase() === 'look') {
      const location = ctx.db.location.id.find(character.locationId);
      if (location) {
        appendPrivateEvent(
          ctx,
          character.id,
          requirePlayerUserId(ctx),
          'look',
          `${location.name}: ${location.description}`
        );
      }
      return;
    }

    ctx.db.command.insert({
      id: 0n,
      ownerUserId: requirePlayerUserId(ctx),
      characterId: character.id,
      text: trimmed,
      status: 'pending',
      createdAt: ctx.timestamp,
    });

    appendPrivateEvent(ctx, character.id, requirePlayerUserId(ctx), 'command', `> ${trimmed}`);
  });

  spacetimedb.reducer('say', { characterId: t.u64(), message: t.string() }, (ctx, args) => {
    const character = requireCharacterOwnedBy(ctx, args.characterId);
    const trimmed = args.message.trim();
    if (!trimmed) throw new SenderError('Message is empty');

    appendLocationEvent(ctx, character.locationId, 'say', `${character.name} says, "${trimmed}"`);
  });

  spacetimedb.reducer('group_message', { characterId: t.u64(), message: t.string() }, (ctx, args) => {
    const character = requireCharacterOwnedBy(ctx, args.characterId);
    const trimmed = args.message.trim();
    if (!trimmed) throw new SenderError('Message is empty');
    if (!character.groupId) throw new SenderError('You are not in a group');
    appendGroupEvent(ctx, character.groupId, character.id, 'group', `${character.name}: ${trimmed}`);
  });

  spacetimedb.reducer('level_character', { characterId: t.u64(), level: t.u64() }, (ctx, args) => {
    const character = requireCharacterOwnedBy(ctx, args.characterId);
    const target = args.level;
    if (target < 1n || target > MAX_LEVEL) {
      throw new SenderError(`Level must be between 1 and ${MAX_LEVEL.toString()}`);
    }
    if (target < character.level) {
      throw new SenderError('Leveling down is not supported');
    }
    if (target === character.level) {
      appendPrivateEvent(
        ctx,
        character.id,
        character.ownerUserId,
        'system',
        `You are already level ${target}.`
      );
      return;
    }

    for (let lvl = character.level + 1n; lvl <= target; lvl += 1n) {
      appendPrivateEvent(
        ctx,
        character.id,
        character.ownerUserId,
        'system',
        `You reached level ${lvl}.`
      );
    }

    const newBase = computeBaseStats(character.className, target);
    const updated = {
      ...character,
      level: target,
      xp: xpRequiredForLevel(target),
      str: newBase.str,
      dex: newBase.dex,
      cha: newBase.cha,
      wis: newBase.wis,
      int: newBase.int,
    };
    ctx.db.character.id.update(updated);
    recomputeCharacterDerived(ctx, updated);
  });

  spacetimedb.reducer(
    'whisper',
    { characterId: t.u64(), targetName: t.string(), message: t.string() },
    (ctx, args) => {
      const character = requireCharacterOwnedBy(ctx, args.characterId);
      const targetName = args.targetName.trim();
      const message = args.message.trim();
      if (!targetName) throw new SenderError('Target required');
      if (!message) throw new SenderError('Message is empty');

      let target: typeof deps.Character.rowType | null = null;
      for (const row of ctx.db.character.iter()) {
        if (row.name.toLowerCase() === targetName.toLowerCase()) {
          if (target) throw new SenderError('Multiple characters share that name');
          target = row;
        }
      }
      if (!target) throw new SenderError('Target not found');

      const senderUserId = requirePlayerUserId(ctx);
      appendPrivateEvent(
        ctx,
        character.id,
        senderUserId,
        'whisper',
        `You whisper to ${target.name}: "${message}"`
      );
      appendPrivateEvent(
        ctx,
        target.id,
        target.ownerUserId,
        'whisper',
        `${character.name} whispers: "${message}"`
      );
    }
  );
};
