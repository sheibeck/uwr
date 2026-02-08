export const registerAuthReducers = (deps: any) => {
  const { spacetimedb, t, SenderError, requirePlayerUserId, friendUserIds, appendPrivateEvent } =
    deps;

  spacetimedb.reducer('login_email', { email: t.string() }, (ctx, { email }) => {
    const player = ctx.db.player.id.find(ctx.sender);
    if (!player) throw new SenderError('Player not found');
    const trimmed = email.trim().toLowerCase();
    if (!trimmed || !trimmed.includes('@')) throw new SenderError('Invalid email');

    const existing = [...ctx.db.user.by_email.filter(trimmed)][0];
    const user =
      existing ??
      ctx.db.user.insert({
        id: 0n,
        email: trimmed,
        createdAt: ctx.timestamp,
      });

    ctx.db.player.id.update({
      ...player,
      userId: user.id,
      sessionStartedAt: ctx.timestamp,
      lastSeenAt: ctx.timestamp,
    });
  });

  spacetimedb.reducer('logout', (ctx) => {
    const player = ctx.db.player.id.find(ctx.sender);
    if (!player) return;
    if (player.userId != null && player.activeCharacterId != null) {
      const character = ctx.db.character.id.find(player.activeCharacterId);
      if (character) {
        const friends = friendUserIds(ctx, player.userId);
        for (const friendId of friends) {
          appendPrivateEvent(
            ctx,
            character.id,
            friendId,
            'presence',
            `${character.name} went offline.`
          );
        }
      }
    }
    ctx.db.player.id.update({
      ...player,
      userId: undefined,
      activeCharacterId: undefined,
      sessionStartedAt: undefined,
      lastSeenAt: ctx.timestamp,
    });
  });
};
