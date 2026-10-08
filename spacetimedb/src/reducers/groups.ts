import { scheduledReducers } from '../schema/tables';
import { flattenLineBreaks } from '../helpers/chat_text';
import { MAX_GROUP_SIZE } from '../data/group_config';
import {
  byId,
  cancelInviteExpiry,
  endExpiredInvitesOfGroup,
  endExpiredInvitesTo,
  endInvite,
  inviteIsLive,
  liveInvitesOfGroup,
  liveInvitesTo,
  reinviteWaitActive,
  scheduleInviteExpiry,
  settleGroupAfterLeave,
} from '../helpers/group_invites';

export const registerGroupReducers = (deps: any) => {
  const {
    spacetimedb,
    t,
    GroupInviteExpiryTick,
    requireCharacterOwnedBy,
    requirePlayerUserId,
    findCharacterByName,
    appendGroupEvent,
    appendPrivateEvent,
    fail,
  } = deps;
  const failGroup = (ctx: any, character: any, message: string) =>
    fail(ctx, character, message, 'group');
  /**
   * Code review IN-06: inviting, accepting, joining and cancelling act for the caller's online
   * (active) character, never for an offline alt the caller also owns. Refuses with the usual
   * '{name} is offline.' line and returns false.
   */
  const actorOnline = (ctx: any, character: any): boolean => {
    if (character.online === true) return true;
    failGroup(ctx, character, `${character.name} is offline.`);
    return false;
  };

  /** Of the matching invites, a live one when there is one, else an expired one (or null). */
  const pickInvite = (ctx: any, invites: any[]): any | null => {
    const now = ctx.timestamp.microsSinceUnixEpoch;
    const sorted = [...invites].sort(byId);
    return sorted.find((invite) => inviteIsLive(invite, now)) ?? sorted[0] ?? null;
  };

  /**
   * Joins `character` to the invite's group and consumes the invite, in one transaction. The
   * caller has already checked that the invite is addressed to this character and is live.
   */
  const joinFromInvite = (ctx: any, character: any, invite: any) => {
    const group = ctx.db.group.id.find(invite.groupId);
    if (!group) {
      ctx.db.group_invite.id.delete(invite.id);
      cancelInviteExpiry(ctx, invite.id);
      return failGroup(ctx, character, 'Group not found');
    }

    const currentSize = [...ctx.db.group_member.by_group.filter(group.id)].length;
    if (currentSize >= MAX_GROUP_SIZE) return failGroup(ctx, character, 'Group is full.');

    ctx.db.group_invite.id.delete(invite.id);
    cancelInviteExpiry(ctx, invite.id);
    ctx.db.group_member.insert({
      id: 0n,
      groupId: group.id,
      characterId: character.id,
      ownerUserId: character.ownerUserId,
      role: 'member',
      followLeader: true,
      joinedAt: ctx.timestamp,
    });
    const fresh = ctx.db.character.id.find(character.id) ?? character;
    ctx.db.character.id.update({ ...fresh, groupId: group.id });
    appendGroupEvent(ctx, group.id, character.id, 'group', `${character.name} joined the group.`);
  };

  spacetimedb.reducer('create_group', { characterId: t.u64(), name: t.string() }, (ctx, args) => {
    const character = requireCharacterOwnedBy(ctx, args.characterId);
    if (character.groupId) return failGroup(ctx, character, 'Character already in a group');
    const trimmed = flattenLineBreaks(args.name);
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
    if (!actorOnline(ctx, character)) return;
    if (character.groupId) return failGroup(ctx, character, 'Character already in a group');
    const group = ctx.db.group.id.find(args.groupId);
    if (!group) return failGroup(ctx, character, 'Group not found');

    // Consent: only a live invite addressed to this character for this group lets it in.
    const invite = pickInvite(
      ctx,
      [...ctx.db.group_invite.by_to_character.filter(character.id)].filter(
        (row: any) => row.groupId === group.id
      )
    );
    if (!invite) return failGroup(ctx, character, 'You need an invite to join.');
    if (!inviteIsLive(invite, ctx.timestamp.microsSinceUnixEpoch)) {
      endInvite(ctx, invite, 'expired');
      return failGroup(ctx, character, 'That invite has expired.');
    }
    joinFromInvite(ctx, character, invite);
  });

  spacetimedb.reducer('leave_group', { characterId: t.u64() }, (ctx, args) => {
    const character = requireCharacterOwnedBy(ctx, args.characterId);
    if (!character.groupId) return failGroup(ctx, character, 'Character not in a group');
    const groupId = character.groupId;

    for (const member of ctx.db.group_member.by_group.filter(groupId)) {
      if (member.characterId === character.id) {
        ctx.db.group_member.id.delete(member.id);
        break;
      }
    }

    ctx.db.character.id.update({ ...character, groupId: undefined });
    const departure = `${character.name} left the group.`;
    appendGroupEvent(ctx, groupId, character.id, 'group', departure);

    // Successor (online first), withdrawn invites, or the lone-group dissolve (WR-04, WR-05).
    settleGroupAfterLeave(ctx, groupId, character.id, departure);
  });

  spacetimedb.reducer(
    'set_follow_leader',
    { characterId: t.u64(), follow: t.bool() },
    (ctx, args) => {
      const character = requireCharacterOwnedBy(ctx, args.characterId);
      if (!character.groupId) return failGroup(ctx, character, 'Not in a group');
      for (const member of ctx.db.group_member.by_group.filter(character.groupId)) {
        if (member.characterId === character.id) {
          // Owner 2026-10-08: "When someone turns their follow on/off the party should get a
          // message" saying that so-and-so stopped or started following the leader. One group
          // line on a real change; an unchanged flag writes nothing. The actor reads it
          // through my_group_events like everyone else.
          if (member.followLeader === args.follow) return;
          ctx.db.group_member.id.update({ ...member, followLeader: args.follow });
          appendGroupEvent(
            ctx,
            character.groupId,
            character.id,
            'group',
            args.follow
              ? `${character.name} is now following the leader.`
              : `${character.name} is no longer following the leader.`
          );
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
      if (target.id === leader.id) return failGroup(ctx, leader, 'You cannot kick yourself.');

      for (const member of ctx.db.group_member.by_group.filter(group.id)) {
        if (member.characterId === target.id) {
          ctx.db.group_member.id.delete(member.id);
          break;
        }
      }

      ctx.db.character.id.update({ ...target, groupId: undefined });
      const departure = `${target.name} was removed from the group.`;
      appendGroupEvent(ctx, group.id, target.id, 'group', departure);
      appendPrivateEvent(
        ctx,
        target.id,
        target.ownerUserId,
        'group',
        `You were removed from ${group.name}.`
      );

      // The puller role, withdrawn invites, or the lone-group dissolve (WR-05).
      settleGroupAfterLeave(ctx, group.id, target.id, departure);
    }
  );

  spacetimedb.reducer(
    'invite_to_group',
    { characterId: t.u64(), targetName: t.string() },
    (ctx, args) => {
      // Every check runs before anything is created, so a refused invite leaves no group,
      // member or invite row behind.
      let inviter = requireCharacterOwnedBy(ctx, args.characterId);
      if (!actorOnline(ctx, inviter)) return;
      const targetName = args.targetName.trim();
      if (!targetName) return failGroup(ctx, inviter, 'Target required');
      const target = findCharacterByName(ctx, targetName);
      if (!target) return failGroup(ctx, inviter, 'Target not found');
      if (target.id === inviter.id) return failGroup(ctx, inviter, 'Cannot invite yourself');

      // Stale invites never block: end the target's expired invites and the inviter's group's.
      endExpiredInvitesTo(ctx, target.id);
      if (inviter.groupId) endExpiredInvitesOfGroup(ctx, inviter.groupId);
      // A dissolve above may have cleared the inviter's groupId.
      inviter = ctx.db.character.id.find(inviter.id) ?? inviter;

      if (inviter.groupId) {
        const group = ctx.db.group.id.find(inviter.groupId);
        if (!group) return failGroup(ctx, inviter, 'Group not found');
        if (group.leaderCharacterId !== inviter.id) {
          return failGroup(ctx, inviter, 'Only the group leader can invite new members.');
        }
      }

      if (target.groupId) return failGroup(ctx, inviter, `${target.name} is already in a group.`);

      if (target.online !== true) return failGroup(ctx, inviter, `${target.name} is offline.`);

      if (liveInvitesTo(ctx, target.id).length > 0) {
        return failGroup(ctx, inviter, `${target.name} already has a pending invite.`);
      }

      // Invite spam guard (WR-02): after a decline, a cancel or the inviter's own leave/camp
      // (review 2 WR-01), wait before inviting the same person.
      if (reinviteWaitActive(ctx, inviter.id, target.id)) {
        return failGroup(ctx, inviter, `Wait a moment before inviting ${target.name} again.`);
      }

      // The cap counts live invites too: members plus pending invites stay below MAX_GROUP_SIZE.
      if (inviter.groupId) {
        const members = [...ctx.db.group_member.by_group.filter(inviter.groupId)].length;
        if (members + liveInvitesOfGroup(ctx, inviter.groupId).length >= MAX_GROUP_SIZE) {
          return failGroup(ctx, inviter, 'Your group is full.');
        }
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

      const invite = ctx.db.group_invite.insert({
        id: 0n,
        groupId,
        fromCharacterId: inviter.id,
        toCharacterId: target.id,
        createdAt: ctx.timestamp,
      });
      scheduleInviteExpiry(ctx, invite);

      appendPrivateEvent(
        ctx,
        target.id,
        target.ownerUserId,
        'group',
        `${inviter.name} invited you to a group. Type [accept ${inviter.name}] to join or [decline ${inviter.name}] to refuse.`
      );
      appendPrivateEvent(ctx, inviter.id, inviter.ownerUserId, 'group', `You invited ${target.name}.`);
    }
  );

  spacetimedb.reducer(
    'accept_group_invite',
    { characterId: t.u64(), fromName: t.string() },
    (ctx, args) => {
      const character = requireCharacterOwnedBy(ctx, args.characterId);
      if (!actorOnline(ctx, character)) return;
      if (character.groupId) return failGroup(ctx, character, 'Character already in a group');
      const from = findCharacterByName(ctx, args.fromName.trim());
      if (!from) return failGroup(ctx, character, 'Inviter not found');

      const invite = pickInvite(
        ctx,
        [...ctx.db.group_invite.by_to_character.filter(character.id)].filter(
          (row: any) => row.fromCharacterId === from.id
        )
      );
      if (!invite) return failGroup(ctx, character, 'Invite not found');
      if (!inviteIsLive(invite, ctx.timestamp.microsSinceUnixEpoch)) {
        endInvite(ctx, invite, 'expired');
        return failGroup(ctx, character, 'That invite has expired.');
      }
      joinFromInvite(ctx, character, invite);
    }
  );

  spacetimedb.reducer(
    'reject_group_invite',
    { characterId: t.u64(), fromName: t.string() },
    (ctx, args) => {
      const character = requireCharacterOwnedBy(ctx, args.characterId);
      const from = findCharacterByName(ctx, args.fromName.trim());
      if (!from) return failGroup(ctx, character, 'Inviter not found');
      const invite = pickInvite(
        ctx,
        [...ctx.db.group_invite.by_to_character.filter(character.id)].filter(
          (row: any) => row.fromCharacterId === from.id
        )
      );
      if (!invite) return;
      // An expired invite ends as expired, never as declined (IN-01), like join, accept and cancel.
      if (!inviteIsLive(invite, ctx.timestamp.microsSinceUnixEpoch)) return endInvite(ctx, invite, 'expired');
      endInvite(ctx, invite, 'declined', character);
    }
  );

  // The invite's group leader or its inviter may withdraw a pending invite.
  spacetimedb.reducer(
    'cancel_group_invite',
    { characterId: t.u64(), targetName: t.string() },
    (ctx, args) => {
      let caller = requireCharacterOwnedBy(ctx, args.characterId);
      if (!actorOnline(ctx, caller)) return;
      const targetName = args.targetName.trim();
      if (!targetName) return failGroup(ctx, caller, 'Target required');
      const target = findCharacterByName(ctx, targetName);
      if (!target) return failGroup(ctx, caller, 'Target not found');

      // An expired invite is ended as expired, never cancelled; a dissolve may clear groupId.
      endExpiredInvitesTo(ctx, target.id);
      caller = ctx.db.character.id.find(caller.id) ?? caller;

      const group = caller.groupId ? ctx.db.group.id.find(caller.groupId) : null;
      const mine = group
        ? liveInvitesTo(ctx, target.id).filter(
            (invite: any) =>
              invite.groupId === group.id &&
              (group.leaderCharacterId === caller.id || invite.fromCharacterId === caller.id)
          )
        : [];
      if (mine.length === 0) return failGroup(ctx, caller, `No pending invite to ${target.name}.`);
      for (const invite of mine) endInvite(ctx, invite, 'cancelled', caller);
    }
  );

  // One-shot expiry tick. Ends the invite only if it still exists and is expired, so a tick for
  // an invite already accepted, declined or cancelled is a no-op.
  scheduledReducers['expire_group_invite'] = spacetimedb.reducer(
    'expire_group_invite',
    { arg: GroupInviteExpiryTick.rowType },
    (ctx, { arg }) => {
      if (ctx.sender.toHexString() !== ctx.databaseIdentity.toHexString()) return;
      const invite = ctx.db.group_invite.id.find(arg.inviteId);
      if (!invite) return;
      if (inviteIsLive(invite, ctx.timestamp.microsSinceUnixEpoch)) return;
      endInvite(ctx, invite, 'expired', undefined, arg.scheduledId);
    }
  );
};
