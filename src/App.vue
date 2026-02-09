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
    <div :style="styles.logStage">
      <div :style="styles.logOverlay">
      <div v-if="onboardingHint" :style="styles.onboardingHint">
        <div>{{ onboardingHint }}</div>
        <button type="button" :style="styles.onboardingDismiss" @click="dismissOnboarding">
          Dismiss tour
        </button>
      </div>
      <LogWindow
        :styles="styles"
        :selected-character="selectedCharacter"
        :combined-events="combinedEvents"
        :format-timestamp="formatTimestamp"
      />
      </div>
    </div>

    <div
      v-if="activePanel !== 'none'"
      :style="{
        ...styles.floatingPanel,
        left: `${panelPos.x}px`,
        top: `${panelPos.y}px`,
      }"
    >
        <div :style="styles.floatingPanelHeader" @mousedown="startPanelDrag">
          <div>{{ panelTitle }}</div>
          <button type="button" :style="styles.panelClose" @click="activePanel = 'none'">
            ×
          </button>
        </div>
        <div :style="styles.floatingPanelBody">
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
          @delete="deleteCharacter"
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
          @show-tooltip="showTooltip"
          @move-tooltip="moveTooltip"
          @hide-tooltip="hideTooltip"
        />
        <HotbarPanel
          v-else-if="activePanel === 'hotbar'"
          :styles="styles"
          :selected-character="selectedCharacter"
          :available-abilities="availableAbilities"
          :hotbar="hotbarAssignments"
          @set-hotbar="setHotbarSlot"
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
          :active-enemy-con-class="activeEnemyConClass"
          :round-ends-in-seconds="roundEndsInSeconds"
          :selected-action="selectedAction"
          :enemy-spawns="availableEnemies"
          :active-result="activeResult"
          :can-engage="!!selectedCharacter && (!selectedCharacter.groupId || isLeader)"
          :can-dismiss-results="!!selectedCharacter && (!selectedCharacter.groupId || isLeader)"
          :can-act="canActInCombat"
          :hotbar="hotbarAssignments"
          :can-use-ability="canActInCombat"
          @start="startCombat"
          @attack="attack"
          @skip="skip"
          @flee="flee"
          @use-ability="chooseAbility"
          @dismiss-results="dismissResults"
        />
        </div>
    </div>

    <div
      :style="{
        ...styles.floatingPanel,
        ...styles.floatingPanelCompact,
        left: `${travelPanelPos.x}px`,
        top: `${travelPanelPos.y}px`,
      }"
    >
      <div :style="styles.floatingPanelHeader" @mousedown="startTravelDrag">
        {{ currentRegionName }} · {{ currentLocation?.name ?? 'Unknown' }}
      </div>
      <div :style="styles.floatingPanelBody">
        <TravelPanel
          :styles="styles"
          :conn-active="conn.isActive"
          :selected-character="selectedCharacter"
          :locations="connectedLocations"
          :regions="regions"
          @move="moveTo"
        />
        <div :style="{ ...styles.panelSectionTitle, marginTop: '0.8rem', marginBottom: '0.4rem' }">
          Inhabitants
        </div>
        <CombatPanel
          :styles="styles"
          :conn-active="conn.isActive"
          :selected-character="selectedCharacter"
          :characters-here="charactersHere"
          :active-combat="activeCombat"
          :active-enemy="activeEnemy"
          :active-enemy-spawn="activeEnemySpawn"
          :active-enemy-name="activeEnemyName"
          :active-enemy-level="activeEnemyLevel"
          :active-enemy-con-class="activeEnemyConClass"
          :round-ends-in-seconds="roundEndsInSeconds"
          :selected-action="selectedAction"
          :enemy-spawns="availableEnemies"
          :active-result="activeResult"
          :can-engage="!!selectedCharacter && (!selectedCharacter.groupId || isLeader)"
          :can-dismiss-results="!!selectedCharacter && (!selectedCharacter.groupId || isLeader)"
          :can-act="canActInCombat"
          :hotbar="hotbarAssignments"
          :can-use-ability="canActInCombat"
          @start="startCombat"
          @attack="attack"
          @skip="skip"
          @flee="flee"
          @use-ability="chooseAbility"
          @dismiss-results="dismissResults"
        />
      </div>
    </div>

    <div
      :style="{
        ...styles.floatingPanel,
        ...styles.floatingPanelCompact,
        left: `${groupPanelPos.x}px`,
        top: `${groupPanelPos.y}px`,
      }"
    >
      <div
        :style="styles.floatingPanelHeader"
        @mousedown="startGroupDrag"
      >
        Group
      </div>
      <div :style="styles.floatingPanelBody">
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
      :highlight-inventory="highlightInventory"
      :highlight-hotbar="highlightHotbar"
      @toggle="togglePanel"
    />
    </footer>
    <div
      v-if="tooltip.visible"
      :style="{
        ...styles.tooltip,
        left: `${tooltip.x}px`,
        top: `${tooltip.y}px`,
      }"
    >
      <div :style="styles.tooltipTitle">{{ tooltip.item?.name ?? 'Item' }}</div>
      <div v-if="tooltip.item?.description" :style="styles.tooltipLine">
        {{ tooltip.item.description }}
      </div>
      <div v-if="tooltip.item?.stats?.length" :style="styles.tooltipLine">
        <div v-for="stat in tooltip.item.stats" :key="stat.label">
          {{ stat.label }}: {{ stat.value }}
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { styles } from './ui/styles';
import AppHeader from './components/AppHeader.vue';
import LogWindow from './components/LogWindow.vue';
import CharacterPanel from './components/CharacterPanel.vue';
import InventoryPanel from './components/InventoryPanel.vue';
import GroupPanel from './components/GroupPanel.vue';
import FriendsPanel from './components/FriendsPanel.vue';
import StatsPanel from './components/StatsPanel.vue';
import HotbarPanel from './components/HotbarPanel.vue';
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
import { useHotbar } from './composables/useHotbar';

const {
  conn,
  characters,
  regions,
  locationConnections,
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
  hotbarSlots,
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
  deleteCharacter,
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

const {
  newCharacter,
  isCharacterFormValid,
  createCharacter,
  hasCharacter,
  createError,
  creationToken,
} = useCharacterCreation({
    connActive: computed(() => conn.isActive),
    selectedCharacter,
    userId,
    characters,
  });

const onboardingStep = ref<'inventory' | 'hotbar' | null>(null);
const onboardingHint = computed(() => {
  if (onboardingStep.value === 'inventory') {
    return 'New character created! Open Inventory to equip your starter gear.';
  }
  if (onboardingStep.value === 'hotbar') {
    return 'Next, open Hotbar to assign your abilities.';
  }
  return '';
});
const highlightInventory = computed(() => onboardingStep.value === 'inventory');
const highlightHotbar = computed(() => onboardingStep.value === 'hotbar');
const dismissOnboarding = () => {
  onboardingStep.value = null;
};

watch(
  () => creationToken.value,
  (token, prev) => {
    if (token && token !== prev) {
      onboardingStep.value = 'inventory';
    }
  }
);

const {
  activeCombat,
  activeEnemy,
  activeEnemySpawn,
  activeEnemyName,
  activeEnemyLevel,
  activeEnemyConClass,
  availableEnemies,
  combatRoster,
  activeResult,
  roundEndsInSeconds,
  selectedAction,
  startCombat,
  attack,
  skip,
  flee,
  chooseAbility,
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

const connectedLocations = computed(() => {
  if (!selectedCharacter.value) return [];
  const currentId = selectedCharacter.value.locationId.toString();
  const connectedIds = new Set(
    locationConnections.value
      .filter((row) => row.fromLocationId.toString() === currentId)
      .map((row) => row.toLocationId.toString())
  );
  return locations.value.filter((loc) => connectedIds.has(loc.id.toString()));
});

const currentRegionName = computed(() => {
  if (!currentLocation.value) return 'Unknown Region';
  const region = regions.value.find(
    (row) => row.id.toString() === currentLocation.value?.regionId.toString()
  );
  return region?.name ?? 'Unknown Region';
});

const { equippedSlots, inventoryItems, inventoryCount, maxInventorySlots, equipItem, unequipItem } =
  useInventory({
    connActive: computed(() => conn.isActive),
    selectedCharacter,
    itemInstances,
    itemTemplates,
  });

const { hotbarAssignments, availableAbilities, setHotbarSlot, useAbility } = useHotbar({
  connActive: computed(() => conn.isActive),
  selectedCharacter,
  hotbarSlots,
});

const activePanel = ref<
  | 'none'
  | 'character'
  | 'inventory'
  | 'hotbar'
  | 'friends'
  | 'group'
  | 'stats'
  | 'travel'
  | 'combat'
>('none');

watch(
  () => activePanel.value,
  (panel) => {
    if (onboardingStep.value === 'inventory' && panel === 'inventory') {
      onboardingStep.value = 'hotbar';
    } else if (onboardingStep.value === 'hotbar' && panel === 'hotbar') {
      onboardingStep.value = null;
    }
  }
);

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
const showRightPanel = computed(() => false);

const tooltip = ref<{ visible: boolean; x: number; y: number; item: any | null }>({
  visible: false,
  x: 0,
  y: 0,
  item: null,
});

const groupPanelPos = ref({ x: 40, y: 140 });
const panelPos = ref({ x: 980, y: 140 });
const travelPanelPos = ref({ x: 1040, y: 110 });

const groupDrag = ref<{ active: boolean; offsetX: number; offsetY: number }>({
  active: false,
  offsetX: 0,
  offsetY: 0,
});
const panelDrag = ref<{ active: boolean; offsetX: number; offsetY: number }>({
  active: false,
  offsetX: 0,
  offsetY: 0,
});
const travelDrag = ref<{ active: boolean; offsetX: number; offsetY: number }>({
  active: false,
  offsetX: 0,
  offsetY: 0,
});
const startGroupDrag = (event: MouseEvent) => {
  groupDrag.value = {
    active: true,
    offsetX: event.clientX - groupPanelPos.value.x,
    offsetY: event.clientY - groupPanelPos.value.y,
  };
};
const startPanelDrag = (event: MouseEvent) => {
  panelDrag.value = {
    active: true,
    offsetX: event.clientX - panelPos.value.x,
    offsetY: event.clientY - panelPos.value.y,
  };
};
const startTravelDrag = (event: MouseEvent) => {
  travelDrag.value = {
    active: true,
    offsetX: event.clientX - travelPanelPos.value.x,
    offsetY: event.clientY - travelPanelPos.value.y,
  };
};

const onGroupDrag = (event: MouseEvent) => {
  if (!groupDrag.value.active) return;
  groupPanelPos.value = {
    x: Math.max(16, event.clientX - groupDrag.value.offsetX),
    y: Math.max(16, event.clientY - groupDrag.value.offsetY),
  };
};
const onPanelDrag = (event: MouseEvent) => {
  if (!panelDrag.value.active) return;
  panelPos.value = {
    x: Math.max(16, event.clientX - panelDrag.value.offsetX),
    y: Math.max(16, event.clientY - panelDrag.value.offsetY),
  };
};
const onTravelDrag = (event: MouseEvent) => {
  if (!travelDrag.value.active) return;
  travelPanelPos.value = {
    x: Math.max(16, event.clientX - travelDrag.value.offsetX),
    y: Math.max(16, event.clientY - travelDrag.value.offsetY),
  };
};

const stopGroupDrag = () => {
  if (!groupDrag.value.active) return;
  groupDrag.value.active = false;
};
const stopPanelDrag = () => {
  if (!panelDrag.value.active) return;
  panelDrag.value.active = false;
};
const stopTravelDrag = () => {
  if (!travelDrag.value.active) return;
  travelDrag.value.active = false;
};

onMounted(() => {
  const saved = window.localStorage.getItem('uwr.windowPositions');
  if (saved) {
    try {
      const parsed = JSON.parse(saved) as {
        group?: { x: number; y: number };
        panel?: { x: number; y: number };
        travel?: { x: number; y: number };
      };
      if (parsed.group) groupPanelPos.value = parsed.group;
      if (parsed.panel) panelPos.value = parsed.panel;
      if (parsed.travel) travelPanelPos.value = parsed.travel;
    } catch {
      // ignore invalid storage
    }
  }
  window.addEventListener('mousemove', onGroupDrag);
  window.addEventListener('mousemove', onPanelDrag);
  window.addEventListener('mousemove', onTravelDrag);
  window.addEventListener('mouseup', stopGroupDrag);
  window.addEventListener('mouseup', stopPanelDrag);
  window.addEventListener('mouseup', stopTravelDrag);
});

onBeforeUnmount(() => {
  window.removeEventListener('mousemove', onGroupDrag);
  window.removeEventListener('mousemove', onPanelDrag);
  window.removeEventListener('mousemove', onTravelDrag);
  window.removeEventListener('mouseup', stopGroupDrag);
  window.removeEventListener('mouseup', stopPanelDrag);
  window.removeEventListener('mouseup', stopTravelDrag);
});

watch(
  [groupPanelPos, panelPos, travelPanelPos],
  () => {
    window.localStorage.setItem(
      'uwr.windowPositions',
      JSON.stringify({
        group: groupPanelPos.value,
        panel: panelPos.value,
        travel: travelPanelPos.value,
      })
    );
  },
  { deep: true }
);

const showTooltip = (payload: { item: any; x: number; y: number }) => {
  tooltip.value = { visible: true, x: payload.x + 12, y: payload.y + 12, item: payload.item };
};

const moveTooltip = (payload: { x: number; y: number }) => {
  if (!tooltip.value.visible) return;
  tooltip.value = { ...tooltip.value, x: payload.x + 12, y: payload.y + 12 };
};

const hideTooltip = () => {
  tooltip.value = { visible: false, x: 0, y: 0, item: null };
};

const panelTitle = computed(() => {
  switch (activePanel.value) {
    case 'character':
      return 'Characters';
    case 'inventory':
      return 'Inventory';
    case 'hotbar':
      return 'Hotbar';
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
  [() => isLoggedIn.value, () => player.value?.activeCharacterId],
  ([loggedIn, activeId]) => {
    if (!loggedIn) {
      selectedCharacterId.value = '';
      activePanel.value = 'none';
      return;
    }
    if (activeId && !selectedCharacterId.value) {
      selectedCharacterId.value = activeId.toString();
      activePanel.value = 'none';
      return;
    }
    if (!activeId) {
      activePanel.value = 'character';
    }
  }
);

const formatTimestamp = (ts: { microsSinceUnixEpoch: bigint }) => {
  const millis = Number(ts.microsSinceUnixEpoch / 1000n);
  return new Date(millis).toLocaleTimeString();
};
</script>
