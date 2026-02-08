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
  const createCharacterReducer = useReducer(reducers.createCharacter);
  const newCharacter = ref({ name: '', race: '', className: '' });
  const createError = ref('');

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
  };
};
