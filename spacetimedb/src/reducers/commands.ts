export const registerCommandReducers = (deps: any) => {
  const { spacetimedb, t, SenderError, requireCharacterOwnedBy, requirePlayerUserId, appendPrivateEvent, appendLocationEvent } =
    deps;

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
