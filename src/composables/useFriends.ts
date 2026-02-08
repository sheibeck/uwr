import { computed, ref, type Ref } from 'vue';
import {
  reducers,
  type FriendRequestRow,
  type FriendRow,
  type UserRow,
} from '../module_bindings';
import { useReducer } from 'spacetimedb/vue';

type UseFriendsArgs = {
  connActive: Ref<boolean>;
  userId: Ref<bigint | null>;
  friends: Ref<FriendRow[]>;
  friendRequests: Ref<FriendRequestRow[]>;
  users: Ref<UserRow[]>;
};

export const useFriends = ({
  connActive,
  userId,
  friends,
  friendRequests,
  users,
}: UseFriendsArgs) => {
  const sendFriendRequestReducer = useReducer(reducers.sendFriendRequest);
  const acceptFriendRequestReducer = useReducer(reducers.acceptFriendRequest);
  const rejectFriendRequestReducer = useReducer(reducers.rejectFriendRequest);
  const removeFriendReducer = useReducer(reducers.removeFriend);

  const friendEmail = ref('');

  const incomingRequests = computed(() => {
    if (userId.value == null) return [];
    return friendRequests.value.filter((row) => row.toUserId === userId.value);
  });

  const outgoingRequests = computed(() => {
    if (userId.value == null) return [];
    return friendRequests.value.filter((row) => row.fromUserId === userId.value);
  });

  const myFriends = computed(() => {
    if (userId.value == null) return [];
    return friends.value.filter((row) => row.userId === userId.value);
  });

  const emailByUserId = (id: bigint) =>
    users.value.find((row) => row.id === id)?.email ?? 'unknown';

  const sendRequest = () => {
    if (!connActive.value || userId.value == null || !friendEmail.value.trim()) return;
    sendFriendRequestReducer({ email: friendEmail.value.trim() });
    friendEmail.value = '';
  };

  const acceptRequest = (fromUserId: bigint) => {
    if (!connActive.value || userId.value == null) return;
    acceptFriendRequestReducer({ fromUserId });
  };

  const rejectRequest = (fromUserId: bigint) => {
    if (!connActive.value || userId.value == null) return;
    rejectFriendRequestReducer({ fromUserId });
  };

  const removeFriend = (friendUserId: bigint) => {
    if (!connActive.value || userId.value == null) return;
    removeFriendReducer({ friendUserId });
  };

  return {
    friendEmail,
    incomingRequests,
    outgoingRequests,
    myFriends,
    emailByUserId,
    sendRequest,
    acceptRequest,
    rejectRequest,
    removeFriend,
  };
};
