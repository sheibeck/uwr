import { computed, ref, type Ref } from 'vue';
import { reducers } from '../module_bindings';
import { useReducer } from 'spacetimedb/vue';
import type { CharacterRow } from '../module_bindings';

type UseCharacterCreationArgs = {
  connActive: Ref<boolean>;
  selectedCharacter: Ref<CharacterRow | null>;
};

export const useCharacterCreation = ({ connActive, selectedCharacter }: UseCharacterCreationArgs) => {
  const createCharacterReducer = useReducer(reducers.createCharacter);
  const newCharacter = ref({ name: '', race: '', className: '' });

  const isCharacterFormValid = computed(() =>
    Boolean(
      newCharacter.value.name.trim() &&
        newCharacter.value.race.trim() &&
        newCharacter.value.className.trim()
    )
  );

  const createCharacter = () => {
    if (!connActive.value || !isCharacterFormValid.value) return;
    createCharacterReducer({
      name: newCharacter.value.name.trim(),
      race: newCharacter.value.race.trim(),
      className: newCharacter.value.className.trim(),
    });
    newCharacter.value = { name: '', race: '', className: '' };
  };

  return {
    newCharacter,
    isCharacterFormValid,
    createCharacter,
    hasCharacter: computed(() => Boolean(selectedCharacter.value)),
  };
};
