import { computed, ref, watch, type Ref } from 'vue';
import { reducers, type CharacterRow, type GroupRow, type LocationRow } from '../module_bindings';
import { useReducer } from 'spacetimedb/vue';

export type PanelKey = 'none' | 'character' | 'inventory' | 'group' | 'stats' | 'travel' | 'combat';

type UseCharactersArgs = {
  connActive: Ref<boolean>;
  characters: Ref<CharacterRow[]>;
  locations: Ref<LocationRow[]>;
  groups: Ref<GroupRow[]>;
  userId: Ref<bigint | null>;
};

export const useCharacters = ({ connActive, characters, locations, groups, userId }: UseCharactersArgs) => {
  const setActiveCharacterReducer = useReducer(reducers.setActiveCharacter);
  const selectedCharacterId = ref('');

  const myCharacters = computed(() => {
    if (userId.value == null) return [];
    return characters.value.filter((row) => row.ownerUserId === userId.value);
  });

  const selectedCharacter = computed(() => {
    if (!selectedCharacterId.value) return null;
    const id = BigInt(selectedCharacterId.value);
    return myCharacters.value.find((row) => row.id === id) ?? null;
  });

  const currentLocation = computed(() => {
    if (!selectedCharacter.value) return null;
    return (
      locations.value.find((row) => row.id === selectedCharacter.value?.locationId) ??
      null
    );
  });

  const charactersHere = computed(() => {
    if (!selectedCharacter.value) return [];
    return characters.value.filter(
      (row) => row.locationId === selectedCharacter.value?.locationId
    );
  });

  const currentGroup = computed(() => {
    const groupId = selectedCharacter.value?.groupId;
    if (!groupId) return null;
    return groups.value.find((row) => row.id === groupId) ?? null;
  });

  const groupMembers = computed(() => {
    const groupId = selectedCharacter.value?.groupId;
    if (!groupId) return [];
    return characters.value.filter((row) => row.groupId === groupId);
  });

  watch(
    () => selectedCharacterId.value,
    (next) => {
      if (!next || !connActive.value) return;
      const id = BigInt(next);
      setActiveCharacterReducer({ characterId: id });
    }
  );

  return {
    selectedCharacterId,
    myCharacters,
    selectedCharacter,
    currentLocation,
    charactersHere,
    currentGroup,
    groupMembers,
  };
};
