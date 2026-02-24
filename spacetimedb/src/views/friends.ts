import type { ViewDeps } from './types';

export const registerFriendViews = ({ spacetimedb, t, FriendRequest, Friend }: ViewDeps) => {
  spacetimedb.view(
    { name: 'my_friend_requests', public: true },
    t.array(FriendRequest.rowType),
    (ctx: any) => {
      const player = ctx.db.player.id.find(ctx.sender);
      if (!player || player.userId == null) return [];
      const incoming = [...ctx.db.friend_request.by_to.filter(player.userId)];
      const outgoing = [...ctx.db.friend_request.by_from.filter(player.userId)];
      return [...incoming, ...outgoing];
    }
  );

  spacetimedb.view({ name: 'my_friends', public: true }, t.array(Friend.rowType), (ctx: any) => {
    const player = ctx.db.player.id.find(ctx.sender);
    if (!player || player.userId == null) return [];
    return [...ctx.db.friend.by_user.filter(player.userId)];
  });
};
