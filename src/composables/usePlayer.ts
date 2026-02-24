import { computed, type Ref } from 'vue';
import type { Player, User } from '../module_bindings/types';
import { useSpacetimeDB } from 'spacetimedb/vue';

type UsePlayerArgs = {
  players: Ref<Player[]>;
  users: Ref<User[]>;
};

export const usePlayer = ({ players, users }: UsePlayerArgs) => {
  const conn = useSpacetimeDB();

  const player = computed(() => {
    // Use connection identity which is reactive
    const identity = conn.identity;
    if (!identity) return null;
    const myHex = identity.toHexString();
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
