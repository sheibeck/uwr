import { ref, type Ref } from 'vue';
import { reducers, type CharacterRow } from '../module_bindings';
import { useReducer } from 'spacetimedb/vue';

type UseCommandsArgs = {
  connActive: Ref<boolean>;
  selectedCharacter: Ref<CharacterRow | null>;
};

export const useCommands = ({ connActive, selectedCharacter }: UseCommandsArgs) => {
  const submitCommandReducer = useReducer(reducers.submitCommand);
  const sayReducer = useReducer(reducers.say);
  const commandText = ref('');

  const submitCommand = () => {
    if (!connActive.value || !selectedCharacter.value || !commandText.value.trim()) return;
    const raw = commandText.value.trim();
    const lower = raw.toLowerCase();
    if (lower.startsWith('/say ')) {
      sayReducer({
        characterId: selectedCharacter.value.id,
        message: raw.slice(5).trim(),
      });
    } else if (lower.startsWith('say ')) {
      sayReducer({
        characterId: selectedCharacter.value.id,
        message: raw.slice(4).trim(),
      });
    } else {
      submitCommandReducer({
        characterId: selectedCharacter.value.id,
        text: raw,
      });
    }
    commandText.value = '';
  };

  return { commandText, submitCommand };
};
