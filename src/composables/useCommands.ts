import { ref, type Ref } from 'vue';
import { reducers } from '../module_bindings';
import type { Character, Npc, Player, Location } from '../module_bindings/types';
import { useReducer } from 'spacetimedb/vue';
import { ADMIN_IDENTITY_HEX } from '../data/worldEventDefs';

type UseCommandsArgs = {
  connActive: Ref<boolean>;
  selectedCharacter: Ref<Character | null>;
  inviteSummaries?: Ref<{ fromName: string }[]>;
  npcsHere?: Ref<Npc[]>;
  onNpcHail?: (npc: Npc) => void;
  selectedNpcTarget?: Ref<bigint | null>;
  selectedCharacterId?: Ref<bigint | null>;
  resetPanels?: () => void;
  addLocalEvent?: (kind: string, message: string) => void;
  players?: Ref<Player[]>;
  characters?: Ref<Character[]>;
  locations?: Ref<Location[]>;
  worldEventRows?: Ref<any[]>;
};

export const useCommands = ({
  connActive,
  selectedCharacter,
  inviteSummaries,
  npcsHere,
  onNpcHail,
  selectedNpcTarget,
  selectedCharacterId,
  resetPanels,
  addLocalEvent,
  players,
  characters,
  locations,
  worldEventRows,
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
  const grantTestRenownReducer = useReducer(reducers.grantTestRenown);
  const spawnCorpseReducer = useReducer(reducers.spawnCorpse);
  const createTestItemReducer = useReducer(reducers.createTestItem);
  const createRecipeScrollReducer = useReducer(reducers.createRecipeScroll);
  const resolveWorldEventReducer = useReducer(reducers.resolveWorldEvent);
  const setAppVersionReducer = useReducer(reducers.setAppVersion);
  const recomputeRacialAllReducer = useReducer(reducers.recomputeRacialAll);
  const commandText = ref('');

  const submitCommand = () => {
    if (!connActive.value || !selectedCharacter.value || !commandText.value.trim()) return;
    const raw = commandText.value.trim();
    const lower = raw.toLowerCase();
    if (lower.startsWith('/friend ') || lower.startsWith('friend ')) {
      const targetName = raw.replace(/^\/?friend\s+/i, '').trim();
      if (!targetName) return;
      friendReducer({
        characterId: selectedCharacter.value.id,
        targetName,
      });
    } else if (
      lower === '/endcombat' || lower === 'endcombat' ||
      lower.startsWith('/endcombat ') || lower.startsWith('endcombat ') ||
      lower === '/end' || lower === 'end' ||
      lower === '/endc' || lower === 'endc'
    ) {
      endCombatReducer({ characterId: selectedCharacter.value.id });
    } else if (lower === '/leave' || lower === 'leave') {
      leaveReducer({ characterId: selectedCharacter.value.id });
    } else if (lower.startsWith('/promote ') || lower.startsWith('promote ')) {
      const targetName = raw.replace(/^\/?promote\s+/i, '').trim();
      if (!targetName) return;
      promoteReducer({
        characterId: selectedCharacter.value.id,
        targetName,
      });
    } else if (lower.startsWith('/kick ') || lower.startsWith('kick ')) {
      const targetName = raw.replace(/^\/?kick\s+/i, '').trim();
      if (!targetName) return;
      kickReducer({
        characterId: selectedCharacter.value.id,
        targetName,
      });
    } else if (lower.startsWith('/invite ') || lower.startsWith('invite ')) {
      const targetName = raw.replace(/^\/?invite\s+/i, '').trim();
      if (!targetName) return;
      inviteReducer({
        characterId: selectedCharacter.value.id,
        targetName,
      });
    } else if (lower.startsWith('/accept') || lower.startsWith('accept')) {
      let fromName = raw.replace(/^\/?accept\s*/i, '').trim();
      if (!fromName && inviteSummaries?.value?.length === 1) {
        fromName = inviteSummaries.value[0].fromName;
      }
      if (!fromName) return;
      acceptInviteReducer({
        characterId: selectedCharacter.value.id,
        fromName,
      });
    } else if (lower.startsWith('/decline') || lower.startsWith('decline')) {
      let fromName = raw.replace(/^\/?decline\s*/i, '').trim();
      if (!fromName && inviteSummaries?.value?.length === 1) {
        fromName = inviteSummaries.value[0].fromName;
      }
      if (!fromName) return;
      rejectInviteReducer({
        characterId: selectedCharacter.value.id,
        fromName,
      });
    } else if (lower.startsWith('/w ') || lower.startsWith('/whisper ') || lower.startsWith('w ') || lower.startsWith('whisper ')) {
      const withoutCmd = raw.replace(/^\/?w(hisper)?\s+/i, '');
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
      const message = raw.slice(5).trim();
      sayReducer({
        characterId: selectedCharacter.value.id,
        message,
      });
    } else if (lower.startsWith('/hail ') || lower.startsWith('hail ')) {
      const npcName = raw.replace(/^\/?hail\s+/i, '').trim();
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
      const message = raw.slice(4).trim();
      sayReducer({
        characterId: selectedCharacter.value.id,
        message,
      });
    } else if (lower.startsWith('/group ') || lower.startsWith('group ')) {
      groupMessageReducer({
        characterId: selectedCharacter.value.id,
        message: raw.replace(/^\/?group\s+/i, '').trim(),
      });
    } else if (lower.startsWith('/level ')) {
      const value = Number(raw.slice(7).trim());
      if (!Number.isFinite(value) || value < 1) return;
      levelReducer({
        characterId: selectedCharacter.value.id,
        level: BigInt(Math.floor(value)),
      });
    } else if (lower.startsWith('/grantrenown ')) {
      const value = Number(raw.slice(13).trim());
      if (!Number.isFinite(value) || value < 1) return;
      grantTestRenownReducer({
        characterId: selectedCharacter.value.id,
        points: BigInt(Math.floor(value)),
      });
    } else if (lower === '/spawncorpse') {
      spawnCorpseReducer({
        characterId: selectedCharacter.value.id,
      });
    } else if (lower.startsWith('/createitem ')) {
      const tier = raw.slice(12).trim().toLowerCase();
      const validTiers = ['common', 'uncommon', 'rare', 'epic', 'legendary'];
      if (!validTiers.includes(tier)) return;
      createTestItemReducer({
        characterId: selectedCharacter.value.id,
        qualityTier: tier,
      });
    } else if (lower.startsWith('/createscroll')) {
      const recipeName = raw.slice(13).trim();
      createRecipeScrollReducer({
        characterId: selectedCharacter.value.id,
        recipeName,
      });
    } else if (lower === '/resetwindows') {
      if (resetPanels) {
        resetPanels();
      }
      if (addLocalEvent) {
        addLocalEvent('command', 'All windows reset to center.');
      }
    } else if (lower.startsWith('/endevent')) {
      const parts = raw.trim().split(/\s+/);
      const outcome = parts[1]?.toLowerCase() === 'fail' ? 'failure' : 'success';
      const activeEvents = (worldEventRows?.value ?? []).filter((e: any) => e.status === 'active');
      if (activeEvents.length === 0) {
        addLocalEvent?.('command', 'No active world events.');
      } else if (activeEvents.length === 1) {
        resolveWorldEventReducer({ worldEventId: activeEvents[0].id, outcome });
        addLocalEvent?.('command', `Ending event "${activeEvents[0].name}" as ${outcome}.`);
      } else {
        const list = activeEvents.map((e: any) => `  ${e.name} (id: ${e.id})`).join('\n');
        addLocalEvent?.('command', `Multiple active events — use console:\n${list}\nwindow.__db_conn.reducers.resolveWorldEvent({ worldEventId: <id>n, outcome: '${outcome}' })`);
      }
    } else if (lower === '/who' || lower === 'who') {
      // Find all active character IDs from players with an activeCharacterId
      const activeCharIds = new Set<string>();
      for (const p of players?.value ?? []) {
        if (p.activeCharacterId) {
          activeCharIds.add(p.activeCharacterId.toString());
        }
      }
      // Build character list
      const activeChars = (characters?.value ?? [])
        .filter(c => activeCharIds.has(c.id.toString()))
        .sort((a, b) => a.name.localeCompare(b.name));

      if (activeChars.length === 0) {
        addLocalEvent?.('command', 'No characters are currently online.');
      } else {
        const locationMap = new Map<string, string>();
        for (const loc of locations?.value ?? []) {
          locationMap.set(loc.id.toString(), loc.name);
        }
        const lines = activeChars.map(c => {
          const locName = locationMap.get(c.locationId.toString()) ?? 'Unknown';
          return `  ${c.name} — Level ${c.level} ${c.className} — ${locName}`;
        });
        addLocalEvent?.('command', `Online characters (${activeChars.length}):\n${lines.join('\n')}`);
      }
    } else if (lower === '/setappversion') {
      const isAdmin = window.__my_identity?.toHexString() === ADMIN_IDENTITY_HEX;
      if (!isAdmin) {
        addLocalEvent?.('command', 'Permission denied.');
        commandText.value = '';
        return;
      }
      const version = window.__client_version ?? 'dev';
      setAppVersionReducer({ version });
      addLocalEvent?.('command', `App version set to "${version}".`);
    } else if (lower === '/recomputeracial') {
      const isAdmin = window.__my_identity?.toHexString() === ADMIN_IDENTITY_HEX;
      if (!isAdmin) {
        addLocalEvent?.('command', 'Permission denied.');
        commandText.value = '';
        return;
      }
      recomputeRacialAllReducer();
      addLocalEvent?.('command', 'Recomputing racial bonuses for all characters...');
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
