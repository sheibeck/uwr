import { computed, ref, type Ref } from 'vue';
import { reducers } from '../module_bindings';
import { useReducer } from 'spacetimedb/vue';
import type { CharacterRow } from '../module_bindings';

type UseCharacterCreationArgs = {
  connActive: Ref<boolean>;
  selectedCharacter: Ref<CharacterRow | null>;
  userId: Ref<bigint | null>;
  characters: Ref<CharacterRow[]>;
};

export const useCharacterCreation = ({
  connActive,
  selectedCharacter,
  userId,
  characters,
}: UseCharacterCreationArgs) => {
  const MAX_CHARACTER_SLOTS = 3;
  const createCharacterReducer = useReducer(reducers.createCharacter);
  const newCharacter = ref({ name: '', race: '', className: '' });
  const createError = ref('');
  const creationToken = ref(0);

  const isCharacterFormValid = computed(() =>
    Boolean(
      newCharacter.value.name.trim() &&
        newCharacter.value.race.trim() &&
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
      createCharacterReducer({
        name: newCharacter.value.name.trim(),
        race: newCharacter.value.race.trim(),
        className: newCharacter.value.className.trim(),
      });
      newCharacter.value = { name: '', race: '', className: '' };
      creationToken.value = Date.now();
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unable to create character';
      createError.value = message;
      newCharacter.value = { ...newCharacter.value, name: '' };
    }
  };

  return {
    newCharacter,
    isCharacterFormValid,
    createCharacter,
    hasCharacter: computed(() => Boolean(selectedCharacter.value)),
    createError,
    creationToken,
  };
};
