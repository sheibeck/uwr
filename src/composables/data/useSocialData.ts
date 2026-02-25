import { shallowRef, watch } from 'vue';
import { useSpacetimeDB } from 'spacetimedb/vue';

type ConnectionState = ReturnType<typeof useSpacetimeDB>;

export function useSocialData(conn: ConnectionState) {
  const friendRequests = shallowRef<any[]>([]);
  const friends = shallowRef<any[]>([]);
  const groupInvites = shallowRef<any[]>([]);
  const groups = shallowRef<any[]>([]);
  const groupMembers = shallowRef<any[]>([]);
  const tradeSessions = shallowRef<any[]>([]);
  const tradeItems = shallowRef<any[]>([]);
  const npcAffinities = shallowRef<any[]>([]);
  const npcDialogueOptions = shallowRef<any[]>([]);

  function refresh(dbConn: any) {
    friendRequests.value = [...dbConn.db.friend_request.iter()];
    friends.value = [...dbConn.db.friend.iter()];
    groupInvites.value = [...dbConn.db.group_invite.iter()];
    groups.value = [...dbConn.db.group.iter()];
    groupMembers.value = [...dbConn.db.group_member.iter()];
    tradeSessions.value = [...dbConn.db.trade_session.iter()];
    tradeItems.value = [...dbConn.db.trade_item.iter()];
    npcAffinities.value = [...dbConn.db.npc_affinity.iter()];
    npcDialogueOptions.value = [...dbConn.db.npc_dialogue_option.iter()];
  }

  watch(
    () => conn.isActive,
    (isActive) => {
      if (!isActive) return;
      const dbConn = conn.getConnection();
      if (!dbConn) return;

      dbConn.subscriptionBuilder()
        .onApplied(() => refresh(dbConn))
        .subscribe([
          'SELECT * FROM friend_request',
          'SELECT * FROM friend',
          'SELECT * FROM group_invite',
          'SELECT * FROM group',
          'SELECT * FROM group_member',
          'SELECT * FROM trade_session',
          'SELECT * FROM trade_item',
          'SELECT * FROM npc_affinity',
          'SELECT * FROM npc_dialogue_option',
        ]);

      const rebind = (table: any, ref: { value: any[] }, iter: () => Iterable<any>) => {
        const rebuild = () => { ref.value = [...iter()]; };
        table.onInsert(rebuild);
        table.onUpdate(rebuild);
        table.onDelete(rebuild);
      };

      rebind(dbConn.db.friend_request, friendRequests, () => dbConn.db.friend_request.iter());
      rebind(dbConn.db.friend, friends, () => dbConn.db.friend.iter());
      rebind(dbConn.db.group_invite, groupInvites, () => dbConn.db.group_invite.iter());
      rebind(dbConn.db.group, groups, () => dbConn.db.group.iter());
      rebind(dbConn.db.group_member, groupMembers, () => dbConn.db.group_member.iter());
      rebind(dbConn.db.trade_session, tradeSessions, () => dbConn.db.trade_session.iter());
      rebind(dbConn.db.trade_item, tradeItems, () => dbConn.db.trade_item.iter());
      rebind(dbConn.db.npc_affinity, npcAffinities, () => dbConn.db.npc_affinity.iter());
      rebind(dbConn.db.npc_dialogue_option, npcDialogueOptions, () => dbConn.db.npc_dialogue_option.iter());
    },
    { immediate: true }
  );

  return {
    friendRequests,
    friends,
    groupInvites,
    groups,
    groupMembers,
    tradeSessions,
    tradeItems,
    npcAffinities,
    npcDialogueOptions,
  };
}
