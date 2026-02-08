import { computed, type Ref } from 'vue';
import type { PlayerRow, UserRow } from '../module_bindings';

type UsePlayerArgs = {
  myPlayer: Ref<PlayerRow[]>;
  users: Ref<UserRow[]>;
};

export const usePlayer = ({ myPlayer, users }: UsePlayerArgs) => {
  const player = computed(() => (myPlayer.value.length ? myPlayer.value[0] : null));

  const userId = computed(() => player.value?.userId ?? null);
  const sessionStartedAt = computed(() => player.value?.sessionStartedAt ?? null);
  const userEmail = computed(() => {
    if (userId.value == null) return null;
    return users.value.find((row) => row.id === userId.value)?.email ?? null;
  });

  return { player, userId, userEmail, sessionStartedAt };
};
