import type { ViewDeps } from './types';

export const registerGroupViews = ({ spacetimedb, t, GroupInvite, EventGroup, GroupMember }: ViewDeps) => {
  spacetimedb.view(
    { name: 'my_group_invites', public: true },
    t.array(GroupInvite.rowType),
    (ctx: any) => {
      const player = ctx.db.player.id.find(ctx.sender);
      if (!player || player.userId == null) return [];
      const invites: typeof GroupInvite.rowType[] = [];
      for (const character of ctx.db.character.by_owner_user.filter(player.userId)) {
        for (const invite of ctx.db.group_invite.by_to_character.filter(character.id)) {
          invites.push(invite);
        }
      }
      return invites;
    }
  );

  spacetimedb.view(
    { name: 'my_group_events', public: true },
    t.array(EventGroup.rowType),
    (ctx: any) => {
      const events: typeof EventGroup.rowType[] = [];
      const player = ctx.db.player.id.find(ctx.sender);
      if (!player || player.userId == null) return events;
      for (const member of ctx.db.group_member.by_owner_user.filter(player.userId)) {
        for (const event of ctx.db.event_group.by_group.filter(member.groupId)) {
          events.push(event);
        }
      }
      return events;
    }
  );

  spacetimedb.view(
    { name: 'my_group_members', public: true },
    t.array(GroupMember.rowType),
    (ctx: any) => {
      const player = ctx.db.player.id.find(ctx.sender);
      if (!player || player.userId == null) return [];
      return [...ctx.db.group_member.by_owner_user.filter(player.userId)];
    }
  );
};
