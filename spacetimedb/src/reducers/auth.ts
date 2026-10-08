import { scheduledReducers } from '../schema/tables';
import { syncCharacterOnline } from '../helpers/online';
import { ADMIN_IDENTITIES } from '../data/admin';
import { TOKEN_EMAIL_CHECK, readTokenEmail, resolveLoginEmail } from '../helpers/login_identity';

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
    ctx.db.disconnect_logout_tick.insert({
      scheduledId: 0n,
      scheduledAt: ScheduleAt.time(disconnectAtMicros + LOGOUT_DELAY_MICROS),
      playerId,
      disconnectAtMicros,
    });
  };

  spacetimedb.reducer('login_email', { email: t.string() }, (ctx, { email }) => {
    const player = ctx.db.player.id.find(ctx.sender);
    if (!player) throw new SenderError('Player not found');
    // CR-01 (51.1-05): the email comes from the verified sign-in token, not the argument.
    // The token must come from the pinned SpacetimeAuth issuer for our client (data/auth_config.ts).
    // Rollback: TOKEN_EMAIL_CHECK in helpers/login_identity.ts.
    const token = readTokenEmail(ctx.senderAuth);
    const result = resolveLoginEmail({
      argument: email,
      claimed: token.email,
      isAdmin: ADMIN_IDENTITIES.has(ctx.sender.toHexString()),
      enforce: TOKEN_EMAIL_CHECK,
    });
    if (!result.ok) {
      if (result.reason === 'no_claim') {
        // Server log only (spacetime logs): why the token gave no email. Never logs an email.
        console.warn(`login_email refused: the sign-in token gave no email (${token.refusal ?? 'unknown'}).`);
        throw new SenderError('Sign-in token carries no email.');
      }
      if (result.reason === 'mismatch') throw new SenderError('Email does not match the sign-in token.');
      throw new SenderError('Invalid email');
    }
    const trimmed = result.email;

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

  scheduledReducers['disconnect_logout'] = spacetimedb.reducer(
    'disconnect_logout',
    { arg: DisconnectLogoutTick.rowType },
    (ctx, { arg }) => {
      if (ctx.sender.toHexString() !== ctx.databaseIdentity.toHexString()) return;
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
        for (const pet of ctx.db.active_pet.by_character.filter(player.activeCharacterId)) {
          ctx.db.active_pet.id.delete(pet.id);
        }
      }
      const releasedCharacterId = player.activeCharacterId;
      ctx.db.player.id.update({
        ...player,
        userId: undefined,
        activeCharacterId: undefined,
        sessionStartedAt: undefined,
        lastSeenAt: ctx.timestamp,
      });
      // Online status (51.1): the flag flips here, 30 s after the disconnect, never in
      // clientDisconnected, so a page refresh does not flap (research A7).
      syncCharacterOnline(ctx, releasedCharacterId);
    }
  );
};
