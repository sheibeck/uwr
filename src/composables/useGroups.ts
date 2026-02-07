import { ref, type Ref } from 'vue';
import { reducers, type CharacterRow } from '../module_bindings';
import { useReducer } from 'spacetimedb/vue';

type UseGroupsArgs = {
  connActive: Ref<boolean>;
  selectedCharacter: Ref<CharacterRow | null>;
};

export const useGroups = ({ connActive, selectedCharacter }: UseGroupsArgs) => {
  const createGroupReducer = useReducer(reducers.createGroup);
  const joinGroupReducer = useReducer(reducers.joinGroup);
  const leaveGroupReducer = useReducer(reducers.leaveGroup);

  const groupName = ref('');

  const createGroup = () => {
    if (!connActive.value || !selectedCharacter.value || !groupName.value.trim()) return;
    createGroupReducer({
      characterId: selectedCharacter.value.id,
      name: groupName.value.trim(),
    });
    groupName.value = '';
  };

  const joinGroup = (groupId: bigint) => {
    if (!connActive.value || !selectedCharacter.value) return;
    joinGroupReducer({ characterId: selectedCharacter.value.id, groupId });
  };

  const leaveGroup = () => {
    if (!connActive.value || !selectedCharacter.value) return;
    leaveGroupReducer({ characterId: selectedCharacter.value.id });
  };

  return { groupName, createGroup, joinGroup, leaveGroup };
};
