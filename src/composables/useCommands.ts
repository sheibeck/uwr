import { ref, type Ref } from 'vue';
import { reducers, type CharacterRow, type NpcRow } from '../module_bindings';
import { useReducer } from 'spacetimedb/vue';

type UseCommandsArgs = {
  connActive: Ref<boolean>;
  selectedCharacter: Ref<CharacterRow | null>;
  inviteSummaries?: Ref<{ fromName: string }[]>;
  npcsHere?: Ref<NpcRow[]>;
  onNpcHail?: (npc: NpcRow) => void;
};

export const useCommands = ({
  connActive,
  selectedCharacter,
  inviteSummaries,
  npcsHere,
  onNpcHail,
}: UseCommandsArgs) => {
  const submitCommandReducer = useReducer(reducers.submitCommand);
  const sayReducer = useReducer(reducers.say);
  const groupMessageReducer = useReducer(reducers.groupMessage);
  const whisperReducer = useReducer(reducers.whisper);
  const hailReducer = useReducer(reducers.hailNpc);
  const inviteReducer = useReducer(reducers.inviteToGroup);
  const acceptInviteReducer = useReducer(reducers.acceptGroupInvite);
  const rejectInviteReducer = useReducer(reducers.rejectGroupInvite);
  const promoteReducer = useReducer(reducers.promoteGroupLeader);
  const kickReducer = useReducer(reducers.kickGroupMember);
  const leaveReducer = useReducer(reducers.leaveGroup);
  const endCombatReducer = useReducer(reducers.endCombat);
  const friendReducer = useReducer(reducers.sendFriendRequestToCharacter);
  const levelReducer = useReducer(reducers.levelCharacter);
  const commandText = ref('');

  const submitCommand = () => {
    if (!connActive.value || !selectedCharacter.value || !commandText.value.trim()) return;
    const raw = commandText.value.trim();
    const lower = raw.toLowerCase();
    if (lower.startsWith('/friend ')) {
      const targetName = raw.slice(8).trim();
      if (!targetName) return;
      friendReducer({
        characterId: selectedCharacter.value.id,
        targetName,
      });
    } else if (
      lower === '/endcombat' ||
      lower.startsWith('/endcombat ') ||
      lower === '/end' ||
      lower === '/endc'
    ) {
      endCombatReducer({ characterId: selectedCharacter.value.id });
    } else if (lower === '/leave') {
      leaveReducer({ characterId: selectedCharacter.value.id });
    } else if (lower.startsWith('/promote ')) {
      const targetName = raw.slice(9).trim();
      if (!targetName) return;
      promoteReducer({
        characterId: selectedCharacter.value.id,
        targetName,
      });
    } else if (lower.startsWith('/kick ')) {
      const targetName = raw.slice(6).trim();
      if (!targetName) return;
      kickReducer({
        characterId: selectedCharacter.value.id,
        targetName,
      });
    } else if (lower.startsWith('/invite ')) {
      const targetName = raw.slice(8).trim();
      if (!targetName) return;
      inviteReducer({
        characterId: selectedCharacter.value.id,
        targetName,
      });
    } else if (lower.startsWith('/accept')) {
      let fromName = raw.slice(7).trim();
      if (!fromName && inviteSummaries?.value?.length === 1) {
        fromName = inviteSummaries.value[0].fromName;
      }
      if (!fromName) return;
      acceptInviteReducer({
        characterId: selectedCharacter.value.id,
        fromName,
      });
    } else if (lower.startsWith('/decline')) {
      let fromName = raw.slice(8).trim();
      if (!fromName && inviteSummaries?.value?.length === 1) {
        fromName = inviteSummaries.value[0].fromName;
      }
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
    } else if (lower.startsWith('/hail ')) {
      const npcName = raw.slice(6).trim();
      if (!npcName) return;
      const npc = npcsHere?.value?.find(
        (row) => row.name.toLowerCase() === npcName.toLowerCase()
      );
      if (npc && onNpcHail) {
        onNpcHail(npc);
      }
      hailReducer({
        characterId: selectedCharacter.value.id,
        npcName,
      });
    } else if (lower.startsWith('say ')) {
      sayReducer({
        characterId: selectedCharacter.value.id,
        message: raw.slice(4).trim(),
      });
    } else if (lower.startsWith('/group ')) {
      groupMessageReducer({
        characterId: selectedCharacter.value.id,
        message: raw.slice(7).trim(),
      });
    } else if (lower.startsWith('/level ')) {
      const value = Number(raw.slice(7).trim());
      if (!Number.isFinite(value) || value < 1) return;
      levelReducer({
        characterId: selectedCharacter.value.id,
        level: BigInt(Math.floor(value)),
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
