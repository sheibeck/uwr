<template>
  <div :style="styles.shell">
    <AppHeader
      :styles="styles"
      :conn-active="conn.isActive"
      :selected-character="selectedCharacter"
      :current-location="currentLocation"
      :email="email"
      :is-logged-in="isLoggedIn"
      :logged-in-email="userEmail"
      :auth-message="authMessage"
      :auth-error="authError"
      @update:email="email = $event"
      @login="login"
      @logout="logout"
    />

    <main :style="[styles.main, showRightPanel ? {} : styles.mainWide]">
      <div :style="styles.logOverlay">
        <LogWindow
          :styles="styles"
          :selected-character="selectedCharacter"
          :characters-here="charactersHere"
          :combined-events="combinedEvents"
          :format-timestamp="formatTimestamp"
          :location-name="currentLocation?.name ?? 'Unknown'"
        />
        <div v-if="showCombatStack" :style="styles.logOverlayPanel">
          <GroupPanel
            :styles="styles"
            :conn-active="conn.isActive"
            :selected-character="selectedCharacter"
            :current-group="currentGroup"
            :group-members="groupCharacterMembers"
            :invite-summaries="inviteSummaries"
            :leader-id="leaderId"
            :is-leader="isLeader"
            :follow-leader="followLeader"
            @leave="leaveGroup"
            @accept="acceptInvite"
            @reject="rejectInvite"
            @kick="kickMember"
            @promote="promoteLeader"
            @toggle-follow="setFollowLeader"
          />
        </div>
      </div>

      <div v-if="showCombatStack">
        <PanelShell :styles="styles" title="Combat" @close="activePanel = 'none'">
          <CombatPanel
            :styles="styles"
            :conn-active="conn.isActive"
            :selected-character="selectedCharacter"
            :active-combat="activeCombat"
            :active-enemy="activeEnemy"
            :active-enemy-spawn="activeEnemySpawn"
            :active-enemy-name="activeEnemyName"
            :active-enemy-level="activeEnemyLevel"
            :round-ends-in-seconds="roundEndsInSeconds"
            :selected-action="selectedAction"
            :enemy-spawns="availableEnemies"
            :active-result="activeResult"
            :can-engage="!!selectedCharacter && (!selectedCharacter.groupId || isLeader)"
            :can-dismiss-results="!!selectedCharacter && (!selectedCharacter.groupId || isLeader)"
            :can-act="canActInCombat"
            @start="startCombat"
            @attack="attack"
            @skip="skip"
            @flee="flee"
            @dismiss-results="dismissResults"
          />
        </PanelShell>
      </div>
      <PanelShell
        v-else-if="activePanel !== 'none'"
        :styles="styles"
        :title="panelTitle"
        @close="activePanel = 'none'"
      >
        <CharacterPanel
          v-if="activePanel === 'character'"
          :styles="styles"
          :conn-active="conn.isActive"
          :new-character="newCharacter"
          :is-character-form-valid="isCharacterFormValid"
          :create-error="createError"
          :my-characters="myCharacters"
          :selected-character-id="selectedCharacterId"
          @update:newCharacter="newCharacter = $event"
          @create="createCharacter"
          @select="
            selectedCharacterId = $event;
            activePanel = 'none';
          "
        />
        <InventoryPanel
          v-else-if="activePanel === 'inventory'"
          :styles="styles"
          :conn-active="conn.isActive"
          :selected-character="selectedCharacter"
          :equipped-slots="equippedSlots"
          :inventory-items="inventoryItems"
          :inventory-count="inventoryCount"
          :max-inventory-slots="maxInventorySlots"
          @equip="equipItem"
          @unequip="unequipItem"
        />
        <FriendsPanel
          v-else-if="activePanel === 'friends'"
          :styles="styles"
          :conn-active="conn.isActive"
          :is-logged-in="isLoggedIn"
          :friend-email="friendEmail"
          :incoming-requests="incomingRequests"
          :outgoing-requests="outgoingRequests"
          :friends="myFriends"
          :email-by-user-id="emailByUserId"
          @update:friendEmail="friendEmail = $event"
          @send-request="sendRequest"
          @accept="acceptRequest"
          @reject="rejectRequest"
          @remove="removeFriend"
        />
        <GroupPanel
          v-else-if="activePanel === 'group'"
          :styles="styles"
          :conn-active="conn.isActive"
          :selected-character="selectedCharacter"
          :current-group="currentGroup"
          :group-members="groupCharacterMembers"
          :invite-summaries="inviteSummaries"
          :leader-id="leaderId"
          :is-leader="isLeader"
          :follow-leader="followLeader"
          @leave="leaveGroup"
          @accept="acceptInvite"
          @reject="rejectInvite"
          @kick="kickMember"
          @promote="promoteLeader"
          @toggle-follow="setFollowLeader"
        />
        <StatsPanel
          v-else-if="activePanel === 'stats'"
          :styles="styles"
          :selected-character="selectedCharacter"
        />
        <CombatPanel
          v-else-if="activePanel === 'combat'"
          :styles="styles"
          :conn-active="conn.isActive"
          :selected-character="selectedCharacter"
          :active-combat="activeCombat"
          :active-enemy="activeEnemy"
          :active-enemy-spawn="activeEnemySpawn"
          :active-enemy-name="activeEnemyName"
          :active-enemy-level="activeEnemyLevel"
          :round-ends-in-seconds="roundEndsInSeconds"
          :selected-action="selectedAction"
          :enemy-spawns="availableEnemies"
          :active-result="activeResult"
          :can-engage="!!selectedCharacter && (!selectedCharacter.groupId || isLeader)"
          :can-dismiss-results="!!selectedCharacter && (!selectedCharacter.groupId || isLeader)"
          :can-act="canActInCombat"
          @start="startCombat"
          @attack="attack"
          @skip="skip"
          @flee="flee"
          @dismiss-results="dismissResults"
        />
        <TravelPanel
          v-else-if="activePanel === 'travel'"
          :styles="styles"
          :conn-active="conn.isActive"
          :selected-character="selectedCharacter"
          :locations="locations"
          @move="moveTo"
        />
      </PanelShell>
    </main>

    <footer :style="styles.footer">
      <CommandBar
        :styles="styles"
        :conn-active="conn.isActive"
        :has-character="hasCharacter"
        :command-text="commandText"
        @update:commandText="commandText = $event"
        @submit="submitCommand"
      />

      <ActionBar
        :styles="styles"
        :active-panel="activePanel"
        :has-active-character="Boolean(selectedCharacter)"
        :combat-locked="combatLocked"
        @toggle="togglePanel"
      />
    </footer>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { styles } from './ui/styles';
import AppHeader from './components/AppHeader.vue';
import LogWindow from './components/LogWindow.vue';
import PanelShell from './components/PanelShell.vue';
import CharacterPanel from './components/CharacterPanel.vue';
import InventoryPanel from './components/InventoryPanel.vue';
import GroupPanel from './components/GroupPanel.vue';
import FriendsPanel from './components/FriendsPanel.vue';
import StatsPanel from './components/StatsPanel.vue';
import CombatPanel from './components/CombatPanel.vue';
import TravelPanel from './components/TravelPanel.vue';
import CommandBar from './components/CommandBar.vue';
import ActionBar from './components/ActionBar.vue';
import { useGameData } from './composables/useGameData';
import { useCharacters } from './composables/useCharacters';
import { useEvents } from './composables/useEvents';
import { useCharacterCreation } from './composables/useCharacterCreation';
import { useCommands } from './composables/useCommands';
import { useCombat } from './composables/useCombat';
import { useGroups } from './composables/useGroups';
import { useMovement } from './composables/useMovement';
import { usePlayer } from './composables/usePlayer';
import { useAuth } from './composables/useAuth';
import { useFriends } from './composables/useFriends';
import { useInventory } from './composables/useInventory';

const {
  conn,
  characters,
  itemTemplates,
  itemInstances,
  locations,
  enemyTemplates,
  enemySpawns,
  combatEncounters,
  combatParticipants,
  combatEnemies,
  combatResults,
  groups,
  worldEvents,
  locationEvents,
  privateEvents,
  groupEvents,
  players,
  myPlayer,
  users,
  friends,
  friendRequests,
  groupInvites,
  groupMembers: groupMemberRows,
} = useGameData();

const { player, userId, userEmail, sessionStartedAt } = usePlayer({ myPlayer, users });

const { email, isLoggedIn, login, logout, authMessage, authError } = useAuth({
  connActive: computed(() => conn.isActive),
  player,
});

const {
  selectedCharacterId,
  myCharacters,
  selectedCharacter,
  currentLocation,
  charactersHere,
  currentGroup,
  groupMembers: groupCharacterMembers,
} = useCharacters({
  connActive: computed(() => conn.isActive),
  characters,
  locations,
  groups,
  userId,
});

const fallbackCombatRoster = computed(() => {
  if (currentGroup.value) return groupCharacterMembers.value;
  return selectedCharacter.value ? [selectedCharacter.value] : [];
});

const { combinedEvents } = useEvents({
  worldEvents,
  locationEvents,
  privateEvents,
  groupEvents,
  sessionStartedAt,
});

const { newCharacter, isCharacterFormValid, createCharacter, hasCharacter, createError } =
  useCharacterCreation({
    connActive: computed(() => conn.isActive),
    selectedCharacter,
    userId,
    characters,
  });

const {
  activeCombat,
  activeEnemy,
  activeEnemySpawn,
  activeEnemyName,
  activeEnemyLevel,
  availableEnemies,
  combatRoster,
  activeResult,
  roundEndsInSeconds,
  selectedAction,
  startCombat,
  attack,
  skip,
  flee,
  dismissResults,
} = useCombat({
  connActive: computed(() => conn.isActive),
  selectedCharacter,
  combatEncounters,
  combatParticipants,
  combatEnemies,
  combatResults,
  fallbackRoster: fallbackCombatRoster,
  enemySpawns,
  enemyTemplates,
  characters,
});

const {
  leaveGroup,
  inviteSummaries,
  acceptInvite,
  rejectInvite,
  leaderId,
  isLeader,
  kickMember,
  promoteLeader,
  followLeader,
  setFollowLeader,
} = useGroups({
  connActive: computed(() => conn.isActive),
  selectedCharacter,
  groups,
  groupInvites,
  characters,
  groupMembers: groupMemberRows,
});

const { commandText, submitCommand } = useCommands({
  connActive: computed(() => conn.isActive),
  selectedCharacter,
  inviteSummaries,
});

const {
  friendEmail,
  incomingRequests,
  outgoingRequests,
  myFriends,
  emailByUserId,
  sendRequest,
  acceptRequest,
  rejectRequest,
  removeFriend,
} = useFriends({
  connActive: computed(() => conn.isActive),
  userId,
  friends,
  friendRequests,
  users,
});

const { moveTo } = useMovement({
  connActive: computed(() => conn.isActive),
  selectedCharacter,
});

const { equippedSlots, inventoryItems, inventoryCount, maxInventorySlots, equipItem, unequipItem } =
  useInventory({
    connActive: computed(() => conn.isActive),
    selectedCharacter,
    itemInstances,
    itemTemplates,
  });

const activePanel = ref<
  'none' | 'character' | 'inventory' | 'friends' | 'group' | 'stats' | 'travel' | 'combat'
>('none');

const canActInCombat = computed(() => {
  if (!selectedCharacter.value || !activeCombat.value) return false;
  if (selectedCharacter.value.hp === 0n) return false;
  const participant = combatRoster.value.find(
    (row) => row.id.toString() === selectedCharacter.value?.id.toString()
  );
  return participant?.status === 'active';
});

const combatLocked = computed(() => Boolean(activeCombat.value || activeResult.value));
const showCombatStack = computed(() => combatLocked.value);
const showRightPanel = computed(() => showCombatStack.value || activePanel.value !== 'none');

const panelTitle = computed(() => {
  switch (activePanel.value) {
    case 'character':
      return 'Character';
    case 'inventory':
      return 'Inventory';
    case 'friends':
      return 'Friends';
    case 'group':
      return 'Group';
    case 'stats':
      return 'Stats';
    case 'travel':
      return 'Travel';
    case 'combat':
      return 'Combat';
    default:
      return '';
  }
});

const togglePanel = (panel: typeof activePanel.value) => {
  activePanel.value = activePanel.value === panel ? 'none' : panel;
};

watch(
  () => isLoggedIn.value,
  (loggedIn) => {
    if (loggedIn) {
      activePanel.value = 'character';
      selectedCharacterId.value = '';
    } else {
      selectedCharacterId.value = '';
      activePanel.value = 'none';
    }
  }
);

watch(
  () => activeCombat.value?.id,
  (combatId) => {
    if (combatId) {
      activePanel.value = 'combat';
    }
  }
);

const formatTimestamp = (ts: { microsSinceUnixEpoch: bigint }) => {
  const millis = Number(ts.microsSinceUnixEpoch / 1000n);
  return new Date(millis).toLocaleTimeString();
};
</script>
