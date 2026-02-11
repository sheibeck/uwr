import { computed, ref, watch, type Ref } from 'vue';
import {
  reducers,
  type CharacterRow,
  type GroupRow,
  type LocationRow,
  type PlayerRow,
  type CharacterLogoutTickRow,
} from '../module_bindings';
import { useReducer } from 'spacetimedb/vue';

export type PanelKey =
  | 'none'
  | 'character'
  | 'inventory'
  | 'hotbar'
  | 'group'
  | 'stats'
  | 'travel'
  | 'combat';

type UseCharactersArgs = {
  connActive: Ref<boolean>;
  characters: Ref<CharacterRow[]>;
  locations: Ref<LocationRow[]>;
  groups: Ref<GroupRow[]>;
  players: Ref<PlayerRow[]>;
  userId: Ref<bigint | null>;
  characterLogoutTicks: Ref<CharacterLogoutTickRow[]>;
  nowMicros: Ref<number>;
};

export const useCharacters = ({
  connActive,
  characters,
  locations,
  groups,
  players,
  userId,
  characterLogoutTicks,
  nowMicros,
}: UseCharactersArgs) => {
  const setActiveCharacterReducer = useReducer(reducers.setActiveCharacter);
  const deleteCharacterReducer = useReducer(reducers.deleteCharacter);
  const bindLocationReducer = useReducer(reducers.bindLocation);
  const respawnCharacterReducer = useReducer(reducers.respawnCharacter);
  const selectedCharacterId = ref('');

  const myCharacters = computed(() => {
    if (userId.value == null) return [];
    return characters.value.filter((row) => row.ownerUserId === userId.value);
  });

  watch(
    () => myCharacters.value.map((row) => row.id.toString()).join(','),
    (next, prev) => {
      if (!next || next === prev) return;
      if (selectedCharacterId.value) return;
      const latest = myCharacters.value.at(-1);
      if (latest) {
        selectedCharacterId.value = latest.id.toString();
      }
    }
  );

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

  const activeCharacterIds = computed(() => {
    const ids = new Set<string>();
    for (const row of players.value) {
      if (row.activeCharacterId != null) {
        ids.add(row.activeCharacterId.toString());
      }
    }
    return ids;
  });

  const pendingLogoutIds = computed(() => {
    const ids = new Set<string>();
    const now = nowMicros.value;
    for (const tick of characterLogoutTicks.value) {
      if (Number(tick.logoutAtMicros) > now) {
        ids.add(tick.characterId.toString());
      }
    }
    return ids;
  });

  const charactersHere = computed(() => {
    if (!selectedCharacter.value) return [];
    const pendingIds = pendingLogoutIds.value;
    return characters.value.filter(
      (row) =>
        row.locationId === selectedCharacter.value?.locationId &&
        row.id !== selectedCharacter.value?.id &&
        (activeCharacterIds.value.has(row.id.toString()) || pendingIds.has(row.id.toString()))
    );
  });

  const charactersHereWithStatus = computed(() => {
    const pendingIds = pendingLogoutIds.value;
    return charactersHere.value.map((character) => ({
      character,
      disconnected: pendingIds.has(character.id.toString()),
    }));
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

  const deleteCharacter = (characterId: string) => {
    if (!connActive.value) return;
    deleteCharacterReducer({ characterId: BigInt(characterId) });
    if (selectedCharacterId.value === characterId) {
      selectedCharacterId.value = '';
    }
  };

  const bindLocation = () => {
    if (!connActive.value || !selectedCharacter.value) return;
    bindLocationReducer({ characterId: selectedCharacter.value.id });
  };

  const respawnCharacter = () => {
    if (!connActive.value || !selectedCharacter.value) return;
    respawnCharacterReducer({ characterId: selectedCharacter.value.id });
  };

  return {
    selectedCharacterId,
    myCharacters,
    selectedCharacter,
    currentLocation,
    charactersHere: charactersHereWithStatus,
    currentGroup,
    groupMembers,
    deleteCharacter,
    bindLocation,
    respawnCharacter,
  };
};
