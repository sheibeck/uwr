import { ref, type Ref } from 'vue';
import { reducers, type CharacterRow, type NpcRow, type NpcDialogueOptionRow, type NpcAffinityRow, type FactionStandingRow, type PlayerRow, type LocationRow } from '../module_bindings';
import { useReducer } from 'spacetimedb/vue';

type UseCommandsArgs = {
  connActive: Ref<boolean>;
  selectedCharacter: Ref<CharacterRow | null>;
  inviteSummaries?: Ref<{ fromName: string }[]>;
  npcsHere?: Ref<NpcRow[]>;
  onNpcHail?: (npc: NpcRow) => void;
  selectedNpcTarget?: Ref<bigint | null>;
  npcDialogueOptions?: Ref<NpcDialogueOptionRow[]>;
  npcAffinities?: Ref<NpcAffinityRow[]>;
  factionStandings?: Ref<FactionStandingRow[]>;
  selectedCharacterId?: Ref<bigint | null>;
  resetPanels?: () => void;
  addLocalEvent?: (kind: string, message: string) => void;
  players?: Ref<PlayerRow[]>;
  characters?: Ref<CharacterRow[]>;
  locations?: Ref<LocationRow[]>;
  worldEventRows?: Ref<any[]>;
};

export const useCommands = ({
  connActive,
  selectedCharacter,
  inviteSummaries,
  npcsHere,
  onNpcHail,
  selectedNpcTarget,
  npcDialogueOptions,
  npcAffinities,
  factionStandings,
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
  const chooseDialogueOptionReducer = useReducer(reducers.chooseDialogueOption);
  const commandText = ref('');

  // Helper to check if dialogue option is unlocked for character
  const isDialogueOptionUnlocked = (option: NpcDialogueOptionRow, characterId: bigint): boolean => {
    // Check affinity requirement
    const currentAffinity = npcAffinities?.value?.find(
      (a) => a.characterId.toString() === characterId.toString() && a.npcId.toString() === option.npcId.toString()
    );
    const affinityValue = currentAffinity ? Number(currentAffinity.affinity) : 0;
    if (affinityValue < Number(option.requiredAffinity)) return false;

    // Check faction requirement
    if (option.requiredFactionId !== null && option.requiredFactionId !== undefined) {
      const requiredStanding = option.requiredFactionStanding !== null && option.requiredFactionStanding !== undefined
        ? Number(option.requiredFactionStanding)
        : 0;
      const factionRow = factionStandings?.value?.find(
        (f) => f.characterId.toString() === characterId.toString() &&
               f.factionId.toString() === option.requiredFactionId!.toString()
      );
      const standing = factionRow ? Number(factionRow.standing) : 0;
      if (standing < requiredStanding) return false;
    }

    // Check renown requirement
    if (option.requiredRenownRank !== null && option.requiredRenownRank !== undefined) {
      // For simplicity, we'll skip renown check here since it requires renown table access
      // The server will validate this anyway
    }

    return true;
  };

  // Helper to find matching dialogue option
  const findMatchingDialogueOption = (npcId: bigint, userText: string, characterId: bigint): NpcDialogueOptionRow | null => {
    if (!npcDialogueOptions?.value) return null;

    const normalizedUserText = userText.toLowerCase().trim();

    // Get root options for this NPC (no parent)
    const rootOptions = npcDialogueOptions.value.filter(
      (opt) => opt.npcId.toString() === npcId.toString() &&
               (opt.parentOptionId === null || opt.parentOptionId === undefined)
    );

    // Filter to unlocked options only
    const unlockedOptions = rootOptions.filter((opt) => isDialogueOptionUnlocked(opt, characterId));

    // Try exact match first
    for (const opt of unlockedOptions) {
      if (opt.playerText.toLowerCase().trim() === normalizedUserText) {
        return opt;
      }
    }

    // Try starts with
    for (const opt of unlockedOptions) {
      const optText = opt.playerText.toLowerCase().trim();
      if (normalizedUserText.startsWith(optText) || optText.startsWith(normalizedUserText)) {
        return opt;
      }
    }

    // Try contains
    for (const opt of unlockedOptions) {
      const optText = opt.playerText.toLowerCase().trim();
      if (normalizedUserText.includes(optText) || optText.includes(normalizedUserText)) {
        return opt;
      }
    }

    return null;
  };

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
      const message = raw.slice(5).trim();

      // Check if NPC is targeted and try to match dialogue
      if (selectedNpcTarget?.value && selectedCharacter.value && npcDialogueOptions?.value) {
        const matchedOption = findMatchingDialogueOption(
          selectedNpcTarget.value,
          message,
          selectedCharacter.value.id
        );

        if (matchedOption) {
          // Trigger dialogue option
          chooseDialogueOptionReducer({
            characterId: selectedCharacter.value.id,
            npcId: selectedNpcTarget.value,
            optionId: matchedOption.id,
          });
          commandText.value = '';
          return;
        }
      }

      // Fall through to normal say if no match
      sayReducer({
        characterId: selectedCharacter.value.id,
        message,
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
      const message = raw.slice(4).trim();

      // Check if NPC is targeted and try to match dialogue
      if (selectedNpcTarget?.value && selectedCharacter.value && npcDialogueOptions?.value) {
        const matchedOption = findMatchingDialogueOption(
          selectedNpcTarget.value,
          message,
          selectedCharacter.value.id
        );

        if (matchedOption) {
          // Trigger dialogue option
          chooseDialogueOptionReducer({
            characterId: selectedCharacter.value.id,
            npcId: selectedNpcTarget.value,
            optionId: matchedOption.id,
          });
          commandText.value = '';
          return;
        }
      }

      // Fall through to normal say if no match
      sayReducer({
        characterId: selectedCharacter.value.id,
        message,
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
    } else if (lower === '/who') {
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
