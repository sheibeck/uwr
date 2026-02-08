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
  const whisperReducer = useReducer(reducers.whisper);
  const inviteReducer = useReducer(reducers.inviteToGroup);
  const acceptInviteReducer = useReducer(reducers.acceptGroupInvite);
  const rejectInviteReducer = useReducer(reducers.rejectGroupInvite);
  const commandText = ref('');

  const submitCommand = () => {
    if (!connActive.value || !selectedCharacter.value || !commandText.value.trim()) return;
    const raw = commandText.value.trim();
    const lower = raw.toLowerCase();
    if (lower.startsWith('/invite ')) {
      const targetName = raw.slice(8).trim();
      if (!targetName) return;
      inviteReducer({
        characterId: selectedCharacter.value.id,
        targetName,
      });
    } else if (lower.startsWith('/accept ')) {
      const fromName = raw.slice(8).trim();
      if (!fromName) return;
      acceptInviteReducer({
        characterId: selectedCharacter.value.id,
        fromName,
      });
    } else if (lower.startsWith('/decline ')) {
      const fromName = raw.slice(9).trim();
      if (!fromName) return;
      rejectInviteReducer({
        characterId: selectedCharacter.value.id,
        fromName,
      });
    } else if (lower.startsWith('/w ') || lower.startsWith('/whisper ')) {
      const withoutCmd = raw.replace(/^\/w(hisper)?\s+/i, '');
      const match = withoutCmd.match(/^(\S+)\s+(.+)$/);
      if (!match) return;
      const targetName = match[1];
      let message = match[2].trim();
      if (
        (message.startsWith('"') && message.endsWith('"')) ||
        (message.startsWith("'") && message.endsWith("'"))
      ) {
        message = message.slice(1, -1).trim();
      }
      if (!message) return;
      whisperReducer({
        characterId: selectedCharacter.value.id,
        targetName,
        message,
      });
    } else if (lower.startsWith('/say ')) {
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
