export const registerAuthReducers = (deps: any) => {
  const {
    spacetimedb,
    t,
    SenderError,
    requirePlayerUserId,
    friendUserIds,
    appendPrivateEvent,
    ScheduleAt,
    DisconnectLogoutTick,
  } = deps;

  const LOGOUT_DELAY_MICROS = 30_000_000n;

  const scheduleLogout = (ctx: any, playerId: bigint) => {
    const disconnectAtMicros = ctx.timestamp.microsSinceUnixEpoch;
    ctx.db.disconnectLogoutTick.insert({
      scheduledId: 0n,
      scheduledAt: ScheduleAt.time(disconnectAtMicros + LOGOUT_DELAY_MICROS),
      playerId,
      disconnectAtMicros,
    });
  };

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
    scheduleLogout(ctx, player.id);
    ctx.db.player.id.update({ ...player, lastSeenAt: ctx.timestamp });
  });

  spacetimedb.reducer(
    'disconnect_logout',
    { arg: DisconnectLogoutTick.rowType },
    (ctx, { arg }) => {
      const player = ctx.db.player.id.find(arg.playerId);
      if (!player) return;
      if (
        player.lastSeenAt &&
        player.lastSeenAt.microsSinceUnixEpoch > arg.disconnectAtMicros
      ) {
        return;
      }
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
        // Dismiss active pets on disconnect
        for (const pet of ctx.db.activePet.by_character.filter(player.activeCharacterId)) {
          ctx.db.activePet.id.delete(pet.id);
        }
      }
      ctx.db.player.id.update({
        ...player,
        userId: undefined,
        activeCharacterId: undefined,
        sessionStartedAt: undefined,
        lastSeenAt: ctx.timestamp,
      });
    }
  );
};
