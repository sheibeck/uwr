/**
 * Core logic for accepting a friend request. Extracted for unit testing.
 *
 * Guarantees no duplicate `friend` rows are created even when a reciprocal
 * request exists (A→B and B→A) or the friendship already exists:
 *  - deletes the accepted request
 *  - deletes any reciprocal pending request so it can't be accepted again
 *  - inserts each friendship direction only if it does not already exist
 *
 * Returns true if the request was found and processed, false otherwise.
 */
export function acceptFriendRequestLogic(ctx: any, userId: bigint, fromUserId: bigint): boolean {
  let requestId: bigint | null = null;
  for (const row of ctx.db.friend_request.by_to.filter(userId)) {
    if (row.fromUserId === fromUserId) {
      requestId = row.id;
      break;
    }
  }
  if (requestId == null) return false;

  ctx.db.friend_request.id.delete(requestId);

  // Clear any reciprocal pending request so it can't later be accepted
  // into a second, duplicate friendship.
  for (const row of ctx.db.friend_request.by_from.filter(userId)) {
    if (row.toUserId === fromUserId) {
      ctx.db.friend_request.id.delete(row.id);
    }
  }

  // Insert friend rows idempotently — only create a direction that does
  // not already exist to avoid duplicate friend entries.
  let hasForward = false;
  for (const row of ctx.db.friend.by_user.filter(userId)) {
    if (row.friendUserId === fromUserId) {
      hasForward = true;
      break;
    }
  }
  if (!hasForward) {
    ctx.db.friend.insert({
      id: 0n,
      userId,
      friendUserId: fromUserId,
      createdAt: ctx.timestamp,
    });
  }

  let hasReverse = false;
  for (const row of ctx.db.friend.by_user.filter(fromUserId)) {
    if (row.friendUserId === userId) {
      hasReverse = true;
      break;
    }
  }
  if (!hasReverse) {
    ctx.db.friend.insert({
      id: 0n,
      userId: fromUserId,
      friendUserId: userId,
      createdAt: ctx.timestamp,
    });
  }

  return true;
}

export const registerSocialReducers = (deps: any) => {
  const {
    spacetimedb,
    t,
    SenderError,
    requirePlayerUserId,
    requireCharacterOwnedBy,
    findCharacterByName,
    appendPrivateEvent,
    fail,
  } = deps;

  spacetimedb.reducer('set_display_name', { name: t.string() }, (ctx, { name }) => {
    const player = ctx.db.player.id.find(ctx.sender);
    if (!player) throw new SenderError('Player not found');
    const trimmed = name.trim();
    if (trimmed.length < 2) throw new SenderError('Display name too short');
    ctx.db.player.id.update({ ...player, displayName: trimmed, lastSeenAt: ctx.timestamp });
  });

  // Closed (51.1-05, CR-01 / research Q10): this read the private user table by email and
  // answered 'User not found', an oracle for whether an email exists. The name and argument stay
  // so the bindings do not change; the client only uses send_friend_request_to_character.
  spacetimedb.reducer('send_friend_request', { email: t.string() }, () => {
    throw new SenderError('Send friend requests by character name.');
  });

  spacetimedb.reducer(
    'send_friend_request_to_character',
    { characterId: t.u64(), targetName: t.string() },
    (ctx, args) => {
      const requester = requireCharacterOwnedBy(ctx, args.characterId);
      const targetName = args.targetName.trim();
      if (!targetName) { fail(ctx, requester, 'Target required'); return; }
      const target = findCharacterByName(ctx, targetName);
      if (!target) { fail(ctx, requester, 'Target not found'); return; }
      if (target.ownerUserId === requester.ownerUserId) {
        fail(ctx, requester, 'Cannot friend yourself');
        return;
      }

      for (const row of ctx.db.friend.by_user.filter(requester.ownerUserId)) {
        if (row.friendUserId === target.ownerUserId) {
          appendPrivateEvent(
            ctx,
            requester.id,
            requester.ownerUserId,
            'friend',
            `You are already friends with ${target.name}.`
          );
          return;
        }
      }
      for (const row of ctx.db.friend_request.by_from.filter(requester.ownerUserId)) {
        if (row.toUserId === target.ownerUserId) {
          appendPrivateEvent(
            ctx,
            requester.id,
            requester.ownerUserId,
            'friend',
            `You already sent a friend request to ${target.name}.`
          );
          return;
        }
      }

      ctx.db.friend_request.insert({
        id: 0n,
        fromUserId: requester.ownerUserId,
        toUserId: target.ownerUserId,
        createdAt: ctx.timestamp,
      });

      appendPrivateEvent(
        ctx,
        requester.id,
        requester.ownerUserId,
        'friend',
        `You sent a friend request to ${target.name}.`
      );
      appendPrivateEvent(
        ctx,
        target.id,
        target.ownerUserId,
        'friend',
        `${requester.name} sent you a friend request.`
      );
    }
  );

  spacetimedb.reducer('accept_friend_request', { fromUserId: t.u64() }, (ctx, { fromUserId }) => {
    const userId = requirePlayerUserId(ctx);
    const ok = acceptFriendRequestLogic(ctx, userId, fromUserId);
    if (!ok) throw new SenderError('Friend request not found');
  });

  spacetimedb.reducer('reject_friend_request', { fromUserId: t.u64() }, (ctx, { fromUserId }) => {
    const userId = requirePlayerUserId(ctx);
    for (const row of ctx.db.friend_request.by_to.filter(userId)) {
      if (row.fromUserId === fromUserId) {
        ctx.db.friend_request.id.delete(row.id);
        return;
      }
    }
  });

  spacetimedb.reducer('remove_friend', { friendUserId: t.u64() }, (ctx, { friendUserId }) => {
    const userId = requirePlayerUserId(ctx);
    for (const row of ctx.db.friend.by_user.filter(userId)) {
      if (row.friendUserId === friendUserId) {
        ctx.db.friend.id.delete(row.id);
        break;
      }
    }
    for (const row of ctx.db.friend.by_user.filter(friendUserId)) {
      if (row.friendUserId === userId) {
        ctx.db.friend.id.delete(row.id);
        break;
      }
    }
  });
};
