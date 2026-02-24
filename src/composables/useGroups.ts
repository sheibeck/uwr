import { computed, type Ref } from 'vue';
import { reducers } from '../module_bindings';
import type {
  CharacterRow,
  GroupInviteRow,
  GroupRow,
  GroupMemberRow,
} from '../stdb-types';
import { useReducer } from 'spacetimedb/vue';

type UseGroupsArgs = {
  connActive: Ref<boolean>;
  selectedCharacter: Ref<CharacterRow | null>;
  groups: Ref<GroupRow[]>;
  groupInvites: Ref<GroupInviteRow[]>;
  characters: Ref<CharacterRow[]>;
  groupMembers: Ref<GroupMemberRow[]>;
};

export const useGroups = ({
  connActive,
  selectedCharacter,
  groups,
  groupInvites,
  characters,
  groupMembers,
}: UseGroupsArgs) => {
  const leaveGroupReducer = useReducer(reducers.leaveGroup);
  const acceptInviteReducer = useReducer(reducers.acceptGroupInvite);
  const rejectInviteReducer = useReducer(reducers.rejectGroupInvite);
  const promoteReducer = useReducer(reducers.promoteGroupLeader);
  const kickReducer = useReducer(reducers.kickGroupMember);
  const followReducer = useReducer(reducers.setFollowLeader);
  const pullerReducer = useReducer(reducers.setGroupPuller);

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

  const leaderId = computed(() => {
    const groupId = selectedCharacter.value?.groupId;
    if (!groupId) return null;
    return groups.value.find((row) => row.id === groupId)?.leaderCharacterId ?? null;
  });

  const pullerId = computed(() => {
    const groupId = selectedCharacter.value?.groupId;
    if (!groupId) return null;
    const group = groups.value.find((row) => row.id === groupId);
    return group?.pullerCharacterId ?? group?.leaderCharacterId ?? null;
  });

  const isLeader = computed(() => {
    if (!selectedCharacter.value) return false;
    return leaderId.value === selectedCharacter.value.id;
  });

  const followLeader = computed(() => {
    if (!selectedCharacter.value) return true;
    for (const member of groupMembers.value) {
      if (member.characterId === selectedCharacter.value.id) {
        return member.followLeader;
      }
    }
    return true;
  });

  const acceptInvite = (fromName: string) => {
    if (!connActive.value || !selectedCharacter.value) return;
    acceptInviteReducer({ characterId: selectedCharacter.value.id, fromName });
  };

  const rejectInvite = (fromName: string) => {
    if (!connActive.value || !selectedCharacter.value) return;
    rejectInviteReducer({ characterId: selectedCharacter.value.id, fromName });
  };

  const kickMember = (targetName: string) => {
    if (!connActive.value || !selectedCharacter.value) return;
    kickReducer({ characterId: selectedCharacter.value.id, targetName });
  };

  const promoteLeader = (targetName: string) => {
    if (!connActive.value || !selectedCharacter.value) return;
    promoteReducer({ characterId: selectedCharacter.value.id, targetName });
  };

  const setPuller = (targetName: string) => {
    if (!connActive.value || !selectedCharacter.value) return;
    pullerReducer({ characterId: selectedCharacter.value.id, targetName });
  };

  const setFollowLeader = (follow: boolean) => {
    if (!connActive.value || !selectedCharacter.value) return;
    followReducer({ characterId: selectedCharacter.value.id, follow });
  };

  return {
    leaveGroup,
    inviteSummaries,
    acceptInvite,
    rejectInvite,
    leaderId,
    pullerId,
    isLeader,
    kickMember,
    promoteLeader,
    setPuller,
    followLeader,
    setFollowLeader,
  };
};
