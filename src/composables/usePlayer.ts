import { computed, type Ref } from 'vue';
import type { PlayerRow, UserRow } from '../module_bindings';

type UsePlayerArgs = {
  players: Ref<PlayerRow[]>;
  users: Ref<UserRow[]>;
};

export const usePlayer = ({ players, users }: UsePlayerArgs) => {
  const player = computed(() => {
    const myIdentity = window.__my_identity;
    if (!myIdentity) return null;
    const myHex = myIdentity.toHexString();
    return players.value.find((row) => row.id.toHexString() === myHex) ?? null;
  });

  const userId = computed(() => player.value?.userId ?? null);
  const sessionStartedAt = computed(() => player.value?.sessionStartedAt ?? null);
  const userEmail = computed(() => {
    if (userId.value == null) return null;
    return users.value.find((row) => row.id === userId.value)?.email ?? null;
  });

  return { player, userId, userEmail, sessionStartedAt };
};
