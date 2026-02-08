import { computed, type Ref } from 'vue';
import {
  reducers,
  type CharacterRow,
  type GroupInviteRow,
  type GroupRow,
} from '../module_bindings';
import { useReducer } from 'spacetimedb/vue';

type UseGroupsArgs = {
  connActive: Ref<boolean>;
  selectedCharacter: Ref<CharacterRow | null>;
  groups: Ref<GroupRow[]>;
  groupInvites: Ref<GroupInviteRow[]>;
  characters: Ref<CharacterRow[]>;
};

export const useGroups = ({
  connActive,
  selectedCharacter,
  groups,
  groupInvites,
  characters,
}: UseGroupsArgs) => {
  const leaveGroupReducer = useReducer(reducers.leaveGroup);
  const acceptInviteReducer = useReducer(reducers.acceptGroupInvite);
  const rejectInviteReducer = useReducer(reducers.rejectGroupInvite);

  const leaveGroup = () => {
    if (!connActive.value || !selectedCharacter.value) return;
    leaveGroupReducer({ characterId: selectedCharacter.value.id });
  };

  const pendingInvites = computed(() => {
    if (!selectedCharacter.value) return [];
    return groupInvites.value.filter(
      (invite) => invite.toCharacterId === selectedCharacter.value?.id
    );
  });

  const inviteSummaries = computed(() =>
    pendingInvites.value.map((invite) => {
      const fromCharacter = characters.value.find(
        (row) => row.id === invite.fromCharacterId
      );
      const group = groups.value.find((row) => row.id === invite.groupId);
      return {
        invite,
        fromName: fromCharacter?.name ?? 'Unknown',
        groupName: group?.name ?? 'Group',
      };
    })
  );

  const acceptInvite = (fromName: string) => {
    if (!connActive.value || !selectedCharacter.value) return;
    acceptInviteReducer({ characterId: selectedCharacter.value.id, fromName });
  };

  const rejectInvite = (fromName: string) => {
    if (!connActive.value || !selectedCharacter.value) return;
    rejectInviteReducer({ characterId: selectedCharacter.value.id, fromName });
  };

  return { leaveGroup, inviteSummaries, acceptInvite, rejectInvite };
};
