import { ref, type Ref } from 'vue';
import { reducers } from '../module_bindings';
import type { Character, Npc, Player, Location } from '../module_bindings/types';
import { useReducer } from 'spacetimedb/vue';
import { ADMIN_IDENTITY_HEX } from '../data/worldEventDefs';
import { RENOWN_RANKS } from '../../spacetimedb/src/data/renown_data';
import { FACTION_STANDING_THRESHOLDS } from '../../spacetimedb/src/data/mechanical_vocabulary';

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
  eventObjectives?: Ref<any[]>;
  factions?: Ref<any[]>;
  factionStandings?: Ref<any[]>;
  renownRows?: Ref<any[]>;
  renownPerks?: Ref<any[]>;
  questInstances?: Ref<any[]>;
  questTemplates?: Ref<any[]>;
  regions?: Ref<any[]>;
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
  eventObjectives,
  factions,
  factionStandings,
  renownRows,
  renownPerks,
  questInstances,
  questTemplates,
  regions,
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
    } else if (lower === 'renown' || lower === '/renown') {
      // Display renown status in narrative console
      const charId = selectedCharacter.value.id;
      const renown = (renownRows?.value ?? []).find((r: any) => r.characterId.toString() === charId.toString());
      const points = renown ? BigInt(renown.points) : 0n;
      const rankNum = renown ? Number(renown.currentRank) : 1;
      const rankInfo = RENOWN_RANKS.find(r => r.rank === rankNum);
      const nextRank = RENOWN_RANKS.find(r => r.rank === rankNum + 1);
      const perks = (renownPerks?.value ?? []).filter((p: any) => p.characterId.toString() === charId.toString());

      let msg = `{{color:#fbbf24}}Renown Status{{/color}}\n\nRank ${rankNum}: {{color:#fbbf24}}${rankInfo?.name ?? 'Unknown'}{{/color}} (${points} points)`;
      if (nextRank) {
        const needed = nextRank.threshold - points;
        const progress = nextRank.threshold > 0n ? Number(points) / Number(nextRank.threshold) : 0;
        const filled = Math.round(progress * 10);
        const bar = '\u2588'.repeat(filled) + '\u2591'.repeat(10 - filled);
        msg += `\nNext rank: {{color:#fbbf24}}${nextRank.name}{{/color}} (${needed > 0n ? needed : 0n} points needed)`;
        msg += `\n  [${bar}] ${Math.round(progress * 100)}%`;
      } else {
        msg += `\n{{color:#22c55e}}Max rank achieved!{{/color}}`;
      }
      if (perks.length > 0) {
        msg += '\n\nActive Perks:';
        for (const p of perks) {
          msg += `\n  Rank ${p.rank}: {{color:#da77f2}}${p.perkKey}{{/color}}`;
        }
      }
      addLocalEvent?.('look', msg);
    } else if (lower === 'factions' || lower === '/factions' || lower === 'faction' || lower === '/faction') {
      // Display faction standings in narrative console
      const charId = selectedCharacter.value.id;
      const standings = (factionStandings?.value ?? []).filter((fs: any) => fs.characterId.toString() === charId.toString());
      const factionList = factions?.value ?? [];

      if (standings.length === 0) {
        addLocalEvent?.('look', '{{color:#fbbf24}}Faction Standings{{/color}}\n\nNo faction standings yet.');
      } else {
        const thresholds = Object.entries(FACTION_STANDING_THRESHOLDS).sort((a, b) => Number(b[1]) - Number(a[1]));
        const getLabel = (standing: bigint) => {
          for (const [label, min] of thresholds) {
            if (standing >= min) return label.charAt(0).toUpperCase() + label.slice(1);
          }
          return 'Hated';
        };
        const colorForLabel = (label: string): string => {
          const l = label.toLowerCase();
          if (l === 'exalted' || l === 'revered') return '#22c55e';
          if (l === 'honored' || l === 'friendly') return '#66d9ef';
          if (l === 'neutral') return '#c8ccd0';
          if (l === 'unfriendly' || l === 'hostile') return '#ff8c42';
          return '#ff6b6b'; // hated
        };
        let msg = '{{color:#fbbf24}}Faction Standings{{/color}}\n';
        for (const fs of standings) {
          const faction = factionList.find((f: any) => f.id.toString() === fs.factionId.toString());
          const name = faction?.name ?? `Faction ${fs.factionId}`;
          const standing = BigInt(fs.standing);
          const label = getLabel(standing);
          const labelColor = colorForLabel(label);
          msg += `\n  {{color:#fbbf24}}${name}{{/color}}: {{color:${labelColor}}}${label}{{/color}} (${standing})`;
        }
        addLocalEvent?.('look', msg);
      }
    } else if (lower === 'events' || lower === '/events') {
      // Display world events in narrative console
      const allEvents = worldEventRows?.value ?? [];
      const activeEvents = allEvents.filter((e: any) => e.status === 'active');
      const recentResolved = allEvents
        .filter((e: any) => e.status === 'success' || e.status === 'failure')
        .sort((a: any, b: any) => {
          const aT = a.resolvedAt?.microsSinceUnixEpoch ?? 0n;
          const bT = b.resolvedAt?.microsSinceUnixEpoch ?? 0n;
          return aT > bT ? -1 : aT < bT ? 1 : 0;
        })
        .slice(0, 5);
      const objectives = eventObjectives?.value ?? [];
      const regionList = regions?.value ?? [];

      let msg = '{{color:#fbbf24}}World Events{{/color}}\n';
      if (activeEvents.length === 0) {
        msg += '\nNo active events.';
      } else {
        msg += '\n--- Active ---';
        for (const ev of activeEvents) {
          const region = regionList.find((r: any) => r.id.toString() === ev.regionId?.toString());
          msg += `\n  {{color:#fbbf24}}${ev.name}{{/color}}`;
          if (region) msg += ` ({{color:#da77f2}}${region.name}{{/color}})`;
          const evObjs = objectives.filter((o: any) => o.eventId.toString() === ev.id.toString());
          for (const obj of evObjs) {
            msg += `\n    ${obj.objectiveType}: {{color:#66d9ef}}${obj.currentCount}/${obj.targetCount}{{/color}}`;
          }
        }
      }
      if (recentResolved.length > 0) {
        msg += '\n\n--- Recent History ---';
        for (const ev of recentResolved) {
          const outcome = ev.status === 'success'
            ? '{{color:#22c55e}}SUCCESS{{/color}}'
            : '{{color:#ff6b6b}}FAILURE{{/color}}';
          msg += `\n  {{color:#b197fc}}${ev.name}{{/color}}: ${outcome}`;
          if (ev.consequenceText) msg += ` — {{color:#6b7280}}${ev.consequenceText}{{/color}}`;
        }
      }
      addLocalEvent?.('look', msg);
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
