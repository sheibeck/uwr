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

  spacetimedb.reducer('send_friend_request', { email: t.string() }, (ctx, { email }) => {
    const userId = requirePlayerUserId(ctx);
    const trimmed = email.trim().toLowerCase();
    if (!trimmed || !trimmed.includes('@')) throw new SenderError('Invalid email');
    const target = [...ctx.db.user.by_email.filter(trimmed)][0];
    if (!target) throw new SenderError('User not found');
    if (target.id === userId) throw new SenderError('Cannot friend yourself');

    for (const row of ctx.db.friend.by_user.filter(userId)) {
      if (row.friendUserId === target.id) return;
    }
    for (const row of ctx.db.friend_request.by_from.filter(userId)) {
      if (row.toUserId === target.id) return;
    }

    ctx.db.friend_request.insert({
      id: 0n,
      fromUserId: userId,
      toUserId: target.id,
      createdAt: ctx.timestamp,
    });
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
    let requestId: bigint | null = null;
    for (const row of ctx.db.friend_request.by_to.filter(userId)) {
      if (row.fromUserId === fromUserId) {
        requestId = row.id;
        break;
      }
    }
    if (requestId == null) throw new SenderError('Friend request not found');

    ctx.db.friend_request.id.delete(requestId);

    ctx.db.friend.insert({
      id: 0n,
      userId,
      friendUserId: fromUserId,
      createdAt: ctx.timestamp,
    });
    ctx.db.friend.insert({
      id: 0n,
      userId: fromUserId,
      friendUserId: userId,
      createdAt: ctx.timestamp,
    });
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
