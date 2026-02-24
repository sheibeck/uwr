import { type Ref } from 'vue';
import { reducers } from '../module_bindings';
import type { Character } from '../module_bindings/types';
import { useReducer } from 'spacetimedb/vue';

type UseMovementArgs = {
  connActive: Ref<boolean>;
  selectedCharacter: Ref<Character | null>;
};

export const useMovement = ({ connActive, selectedCharacter }: UseMovementArgs) => {
  const moveCharacterReducer = useReducer(reducers.moveCharacter);

  const moveTo = (locationId: bigint) => {
    if (!connActive.value || !selectedCharacter.value) return;
    moveCharacterReducer({ characterId: selectedCharacter.value.id, locationId });
  };

  return { moveTo };
};
