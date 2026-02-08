export const registerGroupReducers = (deps: any) => {
  const {
    spacetimedb,
    t,
    SenderError,
    GroupMember,
    GroupInvite,
    requireCharacterOwnedBy,
    requirePlayerUserId,
    findCharacterByName,
    appendGroupEvent,
    appendPrivateEvent,
  } = deps;

  spacetimedb.reducer('create_group', { characterId: t.u64(), name: t.string() }, (ctx, args) => {
    const character = requireCharacterOwnedBy(ctx, args.characterId);
    if (character.groupId) throw new SenderError('Character already in a group');
    const trimmed = args.name.trim();
    if (trimmed.length < 2) throw new SenderError('Group name too short');

    const group = ctx.db.group.insert({
      id: 0n,
      name: trimmed,
      leaderCharacterId: character.id,
      createdAt: ctx.timestamp,
    });

    ctx.db.groupMember.insert({
      id: 0n,
      groupId: group.id,
      characterId: character.id,
      ownerUserId: requirePlayerUserId(ctx),
      role: 'leader',
      followLeader: true,
      joinedAt: ctx.timestamp,
    });

    ctx.db.character.id.update({ ...character, groupId: group.id });
    appendGroupEvent(ctx, group.id, character.id, 'group', `${character.name} formed a group.`);
  });

  spacetimedb.reducer('join_group', { characterId: t.u64(), groupId: t.u64() }, (ctx, args) => {
    const character = requireCharacterOwnedBy(ctx, args.characterId);
    if (character.groupId) throw new SenderError('Character already in a group');
    const group = ctx.db.group.id.find(args.groupId);
    if (!group) throw new SenderError('Group not found');

    ctx.db.groupMember.insert({
      id: 0n,
      groupId: group.id,
      characterId: character.id,
      ownerUserId: requirePlayerUserId(ctx),
      role: 'member',
      followLeader: true,
      joinedAt: ctx.timestamp,
    });

    ctx.db.character.id.update({ ...character, groupId: group.id });
    appendGroupEvent(ctx, group.id, character.id, 'group', `${character.name} joined the group.`);
  });

  spacetimedb.reducer('leave_group', { characterId: t.u64() }, (ctx, args) => {
    const character = requireCharacterOwnedBy(ctx, args.characterId);
    if (!character.groupId) throw new SenderError('Character not in a group');
    const groupId = character.groupId;
    const group = ctx.db.group.id.find(groupId);

    for (const member of ctx.db.groupMember.by_group.filter(groupId)) {
      if (member.characterId === character.id) {
        ctx.db.groupMember.id.delete(member.id);
        break;
      }
    }

    ctx.db.character.id.update({ ...character, groupId: undefined });
    appendGroupEvent(ctx, groupId, character.id, 'group', `${character.name} left the group.`);

    let newLeaderMember: typeof GroupMember.rowType | null = null;
    for (const member of ctx.db.groupMember.by_group.filter(groupId)) {
      if (!newLeaderMember) newLeaderMember = member;
    }

    if (!newLeaderMember) {
      for (const invite of ctx.db.groupInvite.by_group.filter(groupId)) {
        ctx.db.groupInvite.id.delete(invite.id);
      }
      ctx.db.group.id.delete(groupId);
      return;
    }

    if (group && group.leaderCharacterId === character.id) {
      const newLeaderCharacter = ctx.db.character.id.find(newLeaderMember.characterId);
      if (newLeaderCharacter) {
        ctx.db.group.id.update({ ...group, leaderCharacterId: newLeaderCharacter.id });
        ctx.db.groupMember.id.update({ ...newLeaderMember, role: 'leader' });
        appendGroupEvent(
          ctx,
          groupId,
          newLeaderCharacter.id,
          'group',
          `${newLeaderCharacter.name} is now the group leader.`
        );
      }
    }
  });

  spacetimedb.reducer(
    'set_follow_leader',
    { characterId: t.u64(), follow: t.bool() },
    (ctx, args) => {
      const character = requireCharacterOwnedBy(ctx, args.characterId);
      if (!character.groupId) throw new SenderError('Not in a group');
      for (const member of ctx.db.groupMember.by_group.filter(character.groupId)) {
        if (member.characterId === character.id) {
          ctx.db.groupMember.id.update({ ...member, followLeader: args.follow });
          return;
        }
      }
      throw new SenderError('Group membership not found');
    }
  );

  spacetimedb.reducer(
    'promote_group_leader',
    { characterId: t.u64(), targetName: t.string() },
    (ctx, args) => {
      const leader = requireCharacterOwnedBy(ctx, args.characterId);
      if (!leader.groupId) throw new SenderError('Not in a group');
      const group = ctx.db.group.id.find(leader.groupId);
      if (!group) throw new SenderError('Group not found');
      if (group.leaderCharacterId !== leader.id) throw new SenderError('Only leader can promote');

      const target = findCharacterByName(ctx, args.targetName.trim());
      if (!target) throw new SenderError('Target not found');
      if (target.groupId !== leader.groupId) throw new SenderError('Target not in your group');

      ctx.db.group.id.update({ ...group, leaderCharacterId: target.id });

      for (const member of ctx.db.groupMember.by_group.filter(group.id)) {
        if (member.characterId === leader.id) {
          ctx.db.groupMember.id.update({ ...member, role: 'member' });
        } else if (member.characterId === target.id) {
          ctx.db.groupMember.id.update({ ...member, role: 'leader' });
        }
      }

      appendGroupEvent(ctx, group.id, target.id, 'group', `${target.name} is now the group leader.`);
    }
  );

  spacetimedb.reducer(
    'kick_group_member',
    { characterId: t.u64(), targetName: t.string() },
    (ctx, args) => {
      const leader = requireCharacterOwnedBy(ctx, args.characterId);
      if (!leader.groupId) throw new SenderError('Not in a group');
      const group = ctx.db.group.id.find(leader.groupId);
      if (!group) throw new SenderError('Group not found');
      if (group.leaderCharacterId !== leader.id) throw new SenderError('Only leader can kick');

      const target = findCharacterByName(ctx, args.targetName.trim());
      if (!target) throw new SenderError('Target not found');
      if (target.groupId !== leader.groupId) throw new SenderError('Target not in your group');
      if (target.id === leader.id) throw new SenderError('Leader cannot kick themselves');

      for (const member of ctx.db.groupMember.by_group.filter(group.id)) {
        if (member.characterId === target.id) {
          ctx.db.groupMember.id.delete(member.id);
          break;
        }
      }

      ctx.db.character.id.update({ ...target, groupId: undefined });
      appendGroupEvent(ctx, group.id, target.id, 'group', `${target.name} was removed from the group.`);
      appendPrivateEvent(
        ctx,
        target.id,
        target.ownerUserId,
        'group',
        `You were removed from ${group.name}.`
      );

      let remaining = 0;
      for (const _row of ctx.db.groupMember.by_group.filter(group.id)) {
        remaining += 1;
        break;
      }
      if (remaining === 0) {
        for (const invite of ctx.db.groupInvite.by_group.filter(group.id)) {
          ctx.db.groupInvite.id.delete(invite.id);
        }
        ctx.db.group.id.delete(group.id);
      }
    }
  );

  spacetimedb.reducer(
    'invite_to_group',
    { characterId: t.u64(), targetName: t.string() },
    (ctx, args) => {
      const inviter = requireCharacterOwnedBy(ctx, args.characterId);
      const targetName = args.targetName.trim();
      if (!targetName) throw new SenderError('Target required');
      const target = findCharacterByName(ctx, targetName);
      if (!target) throw new SenderError('Target not found');
      if (target.id === inviter.id) throw new SenderError('Cannot invite yourself');
      if (inviter.groupId) {
        const group = ctx.db.group.id.find(inviter.groupId);
        if (!group) throw new SenderError('Group not found');
        if (group.leaderCharacterId !== inviter.id) {
          appendPrivateEvent(
            ctx,
            inviter.id,
            inviter.ownerUserId,
            'group',
            'Only the group leader can invite new members.'
          );
          return;
        }
      }

      if (target.groupId) {
        appendPrivateEvent(
          ctx,
          inviter.id,
          inviter.ownerUserId,
          'group',
          `${target.name} is already in a group.`
        );
        return;
      }

      let groupId = inviter.groupId;
      if (!groupId) {
        const group = ctx.db.group.insert({
          id: 0n,
          name: `${inviter.name}'s group`,
          leaderCharacterId: inviter.id,
          createdAt: ctx.timestamp,
        });
        ctx.db.groupMember.insert({
          id: 0n,
          groupId: group.id,
          characterId: inviter.id,
          ownerUserId: inviter.ownerUserId,
          role: 'leader',
          followLeader: true,
          joinedAt: ctx.timestamp,
        });
        ctx.db.character.id.update({ ...inviter, groupId: group.id });
        groupId = group.id;
        appendGroupEvent(ctx, groupId, inviter.id, 'group', `${inviter.name} formed a group.`);
      }

      for (const invite of ctx.db.groupInvite.by_to_character.filter(target.id)) {
        appendPrivateEvent(
          ctx,
          inviter.id,
          inviter.ownerUserId,
          'group',
          `${target.name} already has a pending invite.`
        );
        return;
      }

      ctx.db.groupInvite.insert({
        id: 0n,
        groupId,
        fromCharacterId: inviter.id,
        toCharacterId: target.id,
        createdAt: ctx.timestamp,
      });

      appendPrivateEvent(
        ctx,
        target.id,
        target.ownerUserId,
        'group',
        `${inviter.name} invited you to a group.`
      );
    }
  );

  spacetimedb.reducer(
    'accept_group_invite',
    { characterId: t.u64(), fromName: t.string() },
    (ctx, args) => {
      const character = requireCharacterOwnedBy(ctx, args.characterId);
      if (character.groupId) throw new SenderError('Character already in a group');
      const from = findCharacterByName(ctx, args.fromName.trim());
      if (!from) throw new SenderError('Inviter not found');

      let inviteRow: typeof GroupInvite.rowType | null = null;
      for (const invite of ctx.db.groupInvite.by_to_character.filter(character.id)) {
        if (invite.fromCharacterId === from.id) {
          inviteRow = invite;
          break;
        }
      }
      if (!inviteRow) throw new SenderError('Invite not found');

      const group = ctx.db.group.id.find(inviteRow.groupId);
      if (!group) throw new SenderError('Group not found');

      ctx.db.groupInvite.id.delete(inviteRow.id);
      ctx.db.groupMember.insert({
        id: 0n,
        groupId: group.id,
        characterId: character.id,
        ownerUserId: character.ownerUserId,
        role: 'member',
        followLeader: true,
        joinedAt: ctx.timestamp,
      });
      ctx.db.character.id.update({ ...character, groupId: group.id });
      appendGroupEvent(ctx, group.id, character.id, 'group', `${character.name} joined the group.`);
    }
  );

  spacetimedb.reducer(
    'reject_group_invite',
    { characterId: t.u64(), fromName: t.string() },
    (ctx, args) => {
      const character = requireCharacterOwnedBy(ctx, args.characterId);
      const from = findCharacterByName(ctx, args.fromName.trim());
      if (!from) throw new SenderError('Inviter not found');
      for (const invite of ctx.db.groupInvite.by_to_character.filter(character.id)) {
        if (invite.fromCharacterId === from.id) {
          ctx.db.groupInvite.id.delete(invite.id);
          appendPrivateEvent(
            ctx,
            from.id,
            from.ownerUserId,
            'group',
            `${character.name} declined your group invite.`
          );
          return;
        }
      }
    }
  );
};
