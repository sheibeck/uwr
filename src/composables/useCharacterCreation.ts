import { computed, ref, watch, type Ref } from 'vue';
import { reducers } from '../module_bindings';
import { useReducer } from 'spacetimedb/vue';
import type { CharacterRow } from '../module_bindings';

type UseCharacterCreationArgs = {
  connActive: Ref<boolean>;
  selectedCharacter: Ref<CharacterRow | null>;
  selectedCharacterId: Ref<string>;
  userId: Ref<bigint | null>;
  characters: Ref<CharacterRow[]>;
};

export const useCharacterCreation = ({
  connActive,
  selectedCharacter,
  selectedCharacterId,
  userId,
  characters,
}: UseCharacterCreationArgs) => {
  const MAX_CHARACTER_SLOTS = 3;
  const createCharacterReducer = useReducer(reducers.createCharacter);
  const newCharacter = ref({ name: '', raceId: 0n as bigint, className: '' });
  const createError = ref('');
  const creationToken = ref(0);
  const pendingSelectName = ref('');

  const isCharacterFormValid = computed(() =>
    Boolean(
      newCharacter.value.name.trim() &&
        newCharacter.value.raceId > 0n &&
        newCharacter.value.className.trim()
    )
  );

  const createCharacter = () => {
    if (!connActive.value || userId.value == null || !isCharacterFormValid.value) return;
    createError.value = '';
    const ownedCount = characters.value.filter((row) => row.ownerUserId === userId.value).length;
    if (ownedCount >= MAX_CHARACTER_SLOTS) {
      createError.value = `You can only have ${MAX_CHARACTER_SLOTS} characters for now.`;
      return;
    }
    const desired = newCharacter.value.name.trim().toLowerCase();
    if (characters.value.some((row) => row.name.toLowerCase() === desired)) {
      createError.value = 'That name is already taken.';
      newCharacter.value = { ...newCharacter.value, name: '' };
      return;
    }
    try {
      pendingSelectName.value = newCharacter.value.name.trim();
      createCharacterReducer({
        name: newCharacter.value.name.trim(),
        raceId: newCharacter.value.raceId,
        className: newCharacter.value.className.trim(),
      });
      newCharacter.value = { name: '', raceId: 0n, className: '' };
      creationToken.value = Date.now();
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unable to create character';
      createError.value = message;
      newCharacter.value = { ...newCharacter.value, name: '' };
    }
  };

  watch(
    () => characters.value.map((row) => row.name).join(','),
    () => {
      if (!pendingSelectName.value) return;
      const match = characters.value.find((row) => row.name === pendingSelectName.value);
      if (!match) return;
      selectedCharacterId.value = match.id.toString();
      pendingSelectName.value = '';
    }
  );

  return {
    newCharacter,
    isCharacterFormValid,
    createCharacter,
    hasCharacter: computed(() => Boolean(selectedCharacter.value)),
    createError,
    creationToken,
  };
};
