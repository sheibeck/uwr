const MAX_GROUP_SIZE = 5;

export const registerGroupReducers = (deps: any) => {
  const {
    spacetimedb,
    t,
    GroupMember,
    GroupInvite,
    requireCharacterOwnedBy,
    requirePlayerUserId,
    findCharacterByName,
    appendGroupEvent,
    appendPrivateEvent,
    fail,
  } = deps;
  const failGroup = (ctx: any, character: any, message: string) =>
    fail(ctx, character, message, 'group');

  spacetimedb.reducer('create_group', { characterId: t.u64(), name: t.string() }, (ctx, args) => {
    const character = requireCharacterOwnedBy(ctx, args.characterId);
    if (character.groupId) return failGroup(ctx, character, 'Character already in a group');
    const trimmed = args.name.trim();
    if (trimmed.length < 2) return failGroup(ctx, character, 'Group name too short');

    const group = ctx.db.group.insert({
      id: 0n,
      name: trimmed,
      leaderCharacterId: character.id,
      pullerCharacterId: character.id,
      createdAt: ctx.timestamp,
    });

    ctx.db.group_member.insert({
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
    if (character.groupId) return failGroup(ctx, character, 'Character already in a group');
    const group = ctx.db.group.id.find(args.groupId);
    if (!group) return failGroup(ctx, character, 'Group not found');

    const currentSize = [...ctx.db.group_member.by_group.filter(group.id)].length;
    if (currentSize >= MAX_GROUP_SIZE) return failGroup(ctx, character, 'Group is full.');

    ctx.db.group_member.insert({
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
    if (!character.groupId) return failGroup(ctx, character, 'Character not in a group');
    const groupId = character.groupId;
    const group = ctx.db.group.id.find(groupId);

    for (const member of ctx.db.group_member.by_group.filter(groupId)) {
      if (member.characterId === character.id) {
        ctx.db.group_member.id.delete(member.id);
        break;
      }
    }

    ctx.db.character.id.update({ ...character, groupId: undefined });
    appendGroupEvent(ctx, groupId, character.id, 'group', `${character.name} left the group.`);

    let newLeaderMember: typeof GroupMember.rowType | null = null;
    for (const member of ctx.db.group_member.by_group.filter(groupId)) {
      if (!newLeaderMember) newLeaderMember = member;
    }

    if (!newLeaderMember) {
      for (const invite of ctx.db.group_invite.by_group.filter(groupId)) {
        ctx.db.group_invite.id.delete(invite.id);
      }
      ctx.db.group.id.delete(groupId);
      return;
    }

    if (group && group.leaderCharacterId === character.id) {
      const newLeaderCharacter = ctx.db.character.id.find(newLeaderMember.characterId);
      if (newLeaderCharacter) {
        ctx.db.group.id.update({
          ...group,
          leaderCharacterId: newLeaderCharacter.id,
          pullerCharacterId:
            group.pullerCharacterId === character.id ? newLeaderCharacter.id : group.pullerCharacterId,
        });
        ctx.db.group_member.id.update({ ...newLeaderMember, role: 'leader' });
        appendGroupEvent(
          ctx,
          groupId,
          newLeaderCharacter.id,
          'group',
          `${newLeaderCharacter.name} is now the group leader.`
        );
      }
    } else if (group && group.pullerCharacterId === character.id) {
      const leaderCharacter = ctx.db.character.id.find(group.leaderCharacterId);
      if (leaderCharacter) {
        ctx.db.group.id.update({ ...group, pullerCharacterId: leaderCharacter.id });
      }
    }
  });

  spacetimedb.reducer(
    'set_follow_leader',
    { characterId: t.u64(), follow: t.bool() },
    (ctx, args) => {
      const character = requireCharacterOwnedBy(ctx, args.characterId);
      if (!character.groupId) return failGroup(ctx, character, 'Not in a group');
      for (const member of ctx.db.group_member.by_group.filter(character.groupId)) {
        if (member.characterId === character.id) {
          ctx.db.group_member.id.update({ ...member, followLeader: args.follow });
          return;
        }
      }
      return failGroup(ctx, character, 'Group membership not found');
    }
  );

  spacetimedb.reducer(
    'promote_group_leader',
    { characterId: t.u64(), targetName: t.string() },
    (ctx, args) => {
      const leader = requireCharacterOwnedBy(ctx, args.characterId);
      if (!leader.groupId) return failGroup(ctx, leader, 'Not in a group');
      const group = ctx.db.group.id.find(leader.groupId);
      if (!group) return failGroup(ctx, leader, 'Group not found');
      if (group.leaderCharacterId !== leader.id) return failGroup(ctx, leader, 'Only leader can promote');

      const target = findCharacterByName(ctx, args.targetName.trim());
      if (!target) return failGroup(ctx, leader, 'Target not found');
      if (target.groupId !== leader.groupId) return failGroup(ctx, leader, 'Target not in your group');

      ctx.db.group.id.update({
        ...group,
        leaderCharacterId: target.id,
        pullerCharacterId:
          group.pullerCharacterId === leader.id ? target.id : group.pullerCharacterId,
      });

      for (const member of ctx.db.group_member.by_group.filter(group.id)) {
        if (member.characterId === leader.id) {
          ctx.db.group_member.id.update({ ...member, role: 'member' });
        } else if (member.characterId === target.id) {
          ctx.db.group_member.id.update({ ...member, role: 'leader' });
        }
      }

      appendGroupEvent(ctx, group.id, target.id, 'group', `${target.name} is now the group leader.`);
    }
  );

  spacetimedb.reducer(
    'set_group_puller',
    { characterId: t.u64(), targetName: t.string() },
    (ctx, args) => {
      const leader = requireCharacterOwnedBy(ctx, args.characterId);
      if (!leader.groupId) return failGroup(ctx, leader, 'Not in a group');
      const group = ctx.db.group.id.find(leader.groupId);
      if (!group) return failGroup(ctx, leader, 'Group not found');
      if (group.leaderCharacterId !== leader.id) return failGroup(ctx, leader, 'Only leader can assign puller');

      const target = findCharacterByName(ctx, args.targetName.trim());
      if (!target) return failGroup(ctx, leader, 'Target not found');
      if (target.groupId !== leader.groupId) return failGroup(ctx, leader, 'Target not in your group');

      ctx.db.group.id.update({ ...group, pullerCharacterId: target.id });
      appendGroupEvent(ctx, group.id, target.id, 'group', `${target.name} is now the group puller.`);
    }
  );

  spacetimedb.reducer(
    'kick_group_member',
    { characterId: t.u64(), targetName: t.string() },
    (ctx, args) => {
      const leader = requireCharacterOwnedBy(ctx, args.characterId);
      if (!leader.groupId) return failGroup(ctx, leader, 'Not in a group');
      const group = ctx.db.group.id.find(leader.groupId);
      if (!group) return failGroup(ctx, leader, 'Group not found');
      if (group.leaderCharacterId !== leader.id) return failGroup(ctx, leader, 'Only leader can kick');

      const target = findCharacterByName(ctx, args.targetName.trim());
      if (!target) return failGroup(ctx, leader, 'Target not found');
      if (target.groupId !== leader.groupId) return failGroup(ctx, leader, 'Target not in your group');
      if (target.id === leader.id) return failGroup(ctx, leader, 'Leader cannot kick themselves');

      for (const member of ctx.db.group_member.by_group.filter(group.id)) {
        if (member.characterId === target.id) {
          ctx.db.group_member.id.delete(member.id);
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

      if (group.pullerCharacterId === target.id) {
        ctx.db.group.id.update({ ...group, pullerCharacterId: group.leaderCharacterId });
      }

      let remaining = 0;
      for (const _row of ctx.db.group_member.by_group.filter(group.id)) {
        remaining += 1;
        break;
      }
      if (remaining === 0) {
        for (const invite of ctx.db.group_invite.by_group.filter(group.id)) {
          ctx.db.group_invite.id.delete(invite.id);
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
      if (!targetName) return failGroup(ctx, inviter, 'Target required');
      const target = findCharacterByName(ctx, targetName);
      if (!target) return failGroup(ctx, inviter, 'Target not found');
      if (target.id === inviter.id) return failGroup(ctx, inviter, 'Cannot invite yourself');
      if (inviter.groupId) {
        const group = ctx.db.group.id.find(inviter.groupId);
        if (!group) return failGroup(ctx, inviter, 'Group not found');
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
          pullerCharacterId: inviter.id,
          createdAt: ctx.timestamp,
        });
        ctx.db.group_member.insert({
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

      const groupSize = [...ctx.db.group_member.by_group.filter(groupId)].length;
      if (groupSize >= MAX_GROUP_SIZE) {
        appendPrivateEvent(ctx, inviter.id, inviter.ownerUserId, 'group', 'Your group is full.');
        return;
      }

      for (const invite of ctx.db.group_invite.by_to_character.filter(target.id)) {
        appendPrivateEvent(
          ctx,
          inviter.id,
          inviter.ownerUserId,
          'group',
          `${target.name} already has a pending invite.`
        );
        return;
      }

      ctx.db.group_invite.insert({
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
      if (character.groupId) return failGroup(ctx, character, 'Character already in a group');
      const from = findCharacterByName(ctx, args.fromName.trim());
      if (!from) return failGroup(ctx, character, 'Inviter not found');

      let inviteRow: typeof GroupInvite.rowType | null = null;
      for (const invite of ctx.db.group_invite.by_to_character.filter(character.id)) {
        if (invite.fromCharacterId === from.id) {
          inviteRow = invite;
          break;
        }
      }
      if (!inviteRow) return failGroup(ctx, character, 'Invite not found');

      const group = ctx.db.group.id.find(inviteRow.groupId);
      if (!group) return failGroup(ctx, character, 'Group not found');

      const currentSize = [...ctx.db.group_member.by_group.filter(group.id)].length;
      if (currentSize >= MAX_GROUP_SIZE) return failGroup(ctx, character, 'Group is full.');

      ctx.db.group_invite.id.delete(inviteRow.id);
      ctx.db.group_member.insert({
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
      if (!from) return failGroup(ctx, character, 'Inviter not found');
      for (const invite of ctx.db.group_invite.by_to_character.filter(character.id)) {
        if (invite.fromCharacterId === from.id) {
          ctx.db.group_invite.id.delete(invite.id);
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
