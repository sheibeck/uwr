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
      <div :style="styles.logStack">
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
    </div>

    <div
      v-if="selectedCharacter"
      :style="{
        ...styles.hotbarFloating,
        left: `${hotbarPos.x}px`,
        top: `${hotbarPos.y}px`,
      }"
    >
      <div :style="styles.hotbarHandle" @mousedown="startHotbarDrag">Hotbar</div>
      <div :style="styles.hotbarDock">
        <button
          v-for="slot in hotbarDisplay"
          :key="slot.slot"
          type="button"
          :disabled="
            !conn.isActive ||
            !slot.abilityKey ||
            isCasting ||
            slot.cooldownRemaining > 0 ||
            (activeCombat && !canActInCombat && slot.kind !== 'utility')
          "
          :style="[
            styles.hotbarSlot,
            slot.abilityKey === castingState?.castingAbilityKey ? styles.hotbarSlotActive : {},
            hotbarPulseKey === slot.abilityKey ? styles.hotbarSlotActive : {},
            !slot.abilityKey ? styles.hotbarSlotEmpty : {},
          ]"
          @click="slot.abilityKey && onHotbarClick(slot)"
          @mouseenter="
            slot.abilityKey &&
            showTooltip({
              item: hotbarTooltipItem(slot),
              x: $event.currentTarget?.getBoundingClientRect().right ?? $event.clientX,
              y: $event.currentTarget?.getBoundingClientRect().top ?? $event.clientY,
              anchor: 'right',
            })
          "
          @mousemove="slot.abilityKey && moveTooltip({ x: $event.clientX, y: $event.clientY })"
          @mouseleave="slot.abilityKey && hideTooltip()"
        >
          <div
            v-if="isCasting && slot.abilityKey === activeCastKey"
            :style="{
              ...styles.hotbarCastFill,
              width: `${Math.round(castProgress * 100)}%`,
            }"
          ></div>
          <div
            v-if="slot.cooldownRemaining > 0"
            :style="{
              ...styles.hotbarCooldownFill,
              width: `${Math.round((slot.cooldownRemaining / slot.cooldownSeconds) * 100)}%`,
            }"
          ></div>
          <span v-if="slot.cooldownRemaining > 0" :style="styles.hotbarCooldown">
            {{ slot.cooldownRemaining }}
          </span>
          <span :style="styles.hotbarSlotText">{{ slot.slot }}</span>
          <span :style="styles.hotbarSlotText">{{ slot.name }}</span>
        </button>
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
          :active-enemy-effects="activeEnemyEffects"
          :enemy-target-name="activeEnemyTargetName"
          :enemy-action-text="activeEnemyActionText"
          :enemy-cast-progress="activeEnemyCastProgress"
          :enemy-cast-label="activeEnemyCastLabel"
          :enemy-spawns="availableEnemies"
          :active-result="activeResult"
          :can-engage="!!selectedCharacter && (!selectedCharacter.groupId || isLeader)"
          :can-dismiss-results="!!selectedCharacter && (!selectedCharacter.groupId || isLeader)"
          :can-act="canActInCombat"
          @start="startCombat"
          @flee="flee"
           @dismiss-results="dismissResults"
        />
        </div>
    </div>

    <div
      :style="{
        ...styles.floatingPanel,
        ...styles.floatingPanelWide,
        left: `${travelPanelPos.x}px`,
        top: `${travelPanelPos.y}px`,
      }"
    >
      <div :style="styles.floatingPanelHeader" @mousedown="startTravelDrag">
        <div :style="styles.panelHeaderStack">
          <div :style="styles.panelHeaderLocation">{{ currentLocation?.name ?? 'Unknown' }}</div>
          <div :style="styles.panelHeaderRegion">{{ currentRegionName }}</div>
        </div>
        <div
          :style="[styles.timeIndicator, isNight ? styles.timeIndicatorNight : null]"
          :title="timeTooltip"
        />
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
          :active-enemy-effects="activeEnemyEffects"
          :enemy-target-name="activeEnemyTargetName"
          :enemy-action-text="activeEnemyActionText"
          :enemy-cast-progress="activeEnemyCastProgress"
          :enemy-cast-label="activeEnemyCastLabel"
          :enemy-spawns="availableEnemies"
          :active-result="activeResult"
          :can-engage="!!selectedCharacter && (!selectedCharacter.groupId || isLeader)"
          :can-dismiss-results="!!selectedCharacter && (!selectedCharacter.groupId || isLeader)"
          :can-act="canActInCombat"
          @start="startCombat"
          @flee="flee"
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
          :character-effects="characterEffects"
          :invite-summaries="inviteSummaries"
          :leader-id="leaderId"
          :is-leader="isLeader"
          :follow-leader="followLeader"
          :selected-target-id="defensiveTargetId"
          @leave="leaveGroup"
          @accept="acceptInvite"
          @reject="rejectInvite"
          @kick="kickMember"
          @promote="promoteLeader"
          @toggle-follow="setFollowLeader"
          @target="setDefensiveTarget"
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
  enemyAbilities,
  enemySpawns,
  combatEncounters,
  combatParticipants,
  combatEnemies,
  combatEnemyEffects,
  combatEnemyCasts,
  aggroEntries,
  combatResults,
  groups,
  characterEffects,
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
  abilityCooldowns,
  characterCasts,
  worldState,
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
    selectedCharacterId,
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

const nowMicros = ref(Date.now() * 1000);
let uiTimer: number | undefined;

const worldStateRow = computed(() => worldState.value[0] ?? null);
const isNight = computed(() => worldStateRow.value?.isNight ?? false);
const timeIconLabel = computed(() => (isNight.value ? 'Moon' : 'Sun'));
const timeTooltip = computed(() => {
  const nextAt = worldStateRow.value?.nextTransitionAtMicros ?? 0n;
  const remainingMicros = Number(nextAt) - nowMicros.value;
  const remainingSeconds = Math.max(0, Math.floor(remainingMicros / 1_000_000));
  const minutes = Math.floor(remainingSeconds / 60)
    .toString()
    .padStart(2, '0');
  const seconds = (remainingSeconds % 60).toString().padStart(2, '0');
  return `${isNight.value ? 'Nighttime' : 'Daytime'} · ${minutes}:${seconds} remaining`;
});

const {
  activeCombat,
  activeEnemy,
  activeEnemySpawn,
  activeEnemyName,
  activeEnemyLevel,
  activeEnemyConClass,
  activeEnemyEffects,
  activeEnemyActionText,
  activeEnemyCastProgress,
  activeEnemyCastLabel,
  availableEnemies,
  combatRoster,
  activeResult,
  startCombat,
  flee,
  dismissResults,
} = useCombat({
  connActive: computed(() => conn.isActive),
  selectedCharacter,
  combatEncounters,
  combatParticipants,
  combatEnemies,
  combatEnemyEffects,
  combatEnemyCasts,
  combatResults,
  fallbackRoster: fallbackCombatRoster,
  enemySpawns,
  enemyTemplates,
  enemyAbilities,
  nowMicros,
  characters,
});

const lastResultId = ref<string | null>(null);
const lastLevelUpEventId = ref<string | null>(null);
const audioCtxRef = ref<AudioContext | null>(null);

const getAudioContext = () => {
  if (!audioCtxRef.value) {
    audioCtxRef.value = new (window.AudioContext || (window as any).webkitAudioContext)();
  }
  return audioCtxRef.value;
};

const playTone = (
  frequency: number,
  durationMs: number,
  startAt: number,
  envelope: { start: number; end: number }
) => {
  const ctx = getAudioContext();
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = 'sine';
  osc.frequency.value = frequency;
  const now = ctx.currentTime;
  gain.gain.setValueAtTime(envelope.start, now + startAt);
  gain.gain.exponentialRampToValueAtTime(
    Math.max(0.0001, envelope.end),
    now + startAt + durationMs / 1000
  );
  osc.connect(gain);
  gain.connect(ctx.destination);
  osc.start(now + startAt);
  osc.stop(now + startAt + durationMs / 1000);
};

const playVictorySound = () => {
  playTone(392, 160, 0, { start: 0.18, end: 0.03 });
  playTone(494, 160, 0.18, { start: 0.18, end: 0.03 });
  playTone(587, 520, 0.36, { start: 0.2, end: 0.008 });
};

const playDefeatSound = () => {
  playTone(330, 220, 0, { start: 0.12, end: 0.02 });
  playTone(262, 240, 0.25, { start: 0.12, end: 0.02 });
  playTone(196, 260, 0.55, { start: 0.12, end: 0.02 });
};

const playLevelUpSound = () => {
  playTone(880, 900, 0, { start: 0.16, end: 0.005 });
  playTone(1100, 700, 0.08, { start: 0.12, end: 0.004 });
};

watch(
  () => activeResult.value,
  (result) => {
    if (!result) return;
    const id = result.id.toString();
    if (lastResultId.value === id) return;
    lastResultId.value = id;
    const summary = result.summary.toLowerCase();
    if (summary.startsWith('victory')) {
      playVictorySound();
    } else if (summary.startsWith('defeat')) {
      playDefeatSound();
    }
  }
);

watch(
  () => combinedEvents.value,
  (events) => {
    if (!events || events.length === 0) return;
    const last = events[events.length - 1];
    const id = last.id.toString();
    if (lastLevelUpEventId.value === id) return;
    if (last.kind === 'system' && /you reached level/i.test(last.message)) {
      lastLevelUpEventId.value = id;
      playLevelUpSound();
    }
  },
  { deep: true }
);

onBeforeUnmount(() => {
  if (audioCtxRef.value) {
    audioCtxRef.value.close();
  }
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

const activeEnemyTargetName = computed(() => {
  if (!activeCombat.value) return '';
  const combatId = activeCombat.value.id.toString();
  const activeIds = new Set(
    combatParticipants.value
      .filter((row) => row.combatId.toString() === combatId && row.status === 'active')
      .map((row) => row.characterId.toString())
  );
  if (!activeIds.size) return '';
  let topEntry: (typeof aggroEntries.value)[number] | null = null;
  for (const entry of aggroEntries.value) {
    if (entry.combatId.toString() !== combatId) continue;
    if (!activeIds.has(entry.characterId.toString())) continue;
    if (!topEntry || entry.value > topEntry.value) topEntry = entry;
  }
  if (topEntry) {
    const target = characters.value.find(
      (row) => row.id.toString() === topEntry!.characterId.toString()
    );
    return target?.name ?? '';
  }
  const fallback = combatParticipants.value.find(
    (row) => row.combatId.toString() === combatId && row.status === 'active'
  );
  if (!fallback) return '';
  const target = characters.value.find((row) => row.id.toString() === fallback.characterId.toString());
  return target?.name ?? '';
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

const { hotbarAssignments, availableAbilities, abilityLookup, setHotbarSlot, useAbility } = useHotbar({
  connActive: computed(() => conn.isActive),
  selectedCharacter,
  hotbarSlots,
});

const cooldownByAbility = computed(() => {
  if (!selectedCharacter.value) return new Map<string, bigint>();
  const map = new Map<string, bigint>();
  for (const row of abilityCooldowns.value) {
    if (row.characterId.toString() !== selectedCharacter.value.id.toString()) continue;
    map.set(row.abilityKey, row.readyAtMicros);
  }
  return map;
});

const hotbarDisplay = computed(() => {
  const slots = new Map(hotbarAssignments.value.map((slot) => [slot.slot, slot]));
  return Array.from({ length: 10 }, (_, index) => {
    const slotIndex = index + 1;
    const assignment =
      slots.get(slotIndex) ?? {
        slot: slotIndex,
        abilityKey: '',
        name: 'Empty',
      };
    const ability = assignment.abilityKey
      ? abilityLookup.value.get(assignment.abilityKey)
      : undefined;
    const readyAt = assignment.abilityKey
      ? cooldownByAbility.value.get(assignment.abilityKey)
      : undefined;
    const remainingMicros = readyAt ? Number(readyAt) - nowMicros.value : 0;
    const cooldownRemaining =
      remainingMicros > 0 ? Math.ceil(remainingMicros / 1_000_000) : 0;
    return {
      ...assignment,
      description: ability?.description ?? (assignment.abilityKey ? 'Ability not defined yet.' : ''),
      resource: ability?.resource ?? '',
      kind: ability?.kind ?? '',
      level: ability?.level ?? 0,
      cooldownSeconds: (() => {
        const raw =
          ability?.castSeconds && ability.castSeconds > 0
            ? ability.castSeconds
            : ability?.cooldownSeconds ?? 1;
        return raw > 0 ? raw : 1;
      })(),
      cooldownRemaining,
    };
  });
});

const hotbarTooltipItem = (slot: any) => {
  if (!slot?.abilityKey) return null;
  return {
    name: slot.name || slot.abilityKey,
    description: slot.description,
    stats: [
      { label: 'Level', value: slot.level || '-' },
      { label: 'Type', value: slot.kind || '-' },
      { label: 'Resource', value: slot.resource || '-' },
    ],
  };
};

const defensiveTargetId = ref<bigint | null>(null);
const hotbarPulseKey = ref<string | null>(null);
const setDefensiveTarget = (characterId: bigint) => {
  defensiveTargetId.value = characterId;
};

watch(
  () => selectedCharacter.value?.id,
  (id) => {
    if (id) defensiveTargetId.value = id;
  },
  { immediate: true }
);

const tryUseAbility = (slot: any) => {
  if (!selectedCharacter.value || !slot?.abilityKey) return;
  if (slot.kind !== 'utility') return;
  const targetId = defensiveTargetId.value ?? selectedCharacter.value.id;
  hotbarPulseKey.value = slot.abilityKey;
  window.setTimeout(() => {
    if (hotbarPulseKey.value === slot.abilityKey) hotbarPulseKey.value = null;
  }, 800);
  useAbility(slot.abilityKey, targetId);
};

const onHotbarClick = (slot: any) => {
  if (!selectedCharacter.value || !slot?.abilityKey) return;
  if (isCasting.value) return;
  hotbarPulseKey.value = slot.abilityKey;
  window.setTimeout(() => {
    if (hotbarPulseKey.value === slot.abilityKey) hotbarPulseKey.value = null;
  }, 800);

  if (activeCombat.value) {
    const targetId =
      slot.kind === 'utility' ? defensiveTargetId.value ?? selectedCharacter.value.id : undefined;
    useAbility(slot.abilityKey, targetId);
    return;
  }

  tryUseAbility(slot);
};

const offensiveTargetEnemyId = ref<bigint | null>(null);
watch(
  () => activeEnemy.value?.id,
  (id) => {
    if (id != null) offensiveTargetEnemyId.value = id;
  },
  { immediate: true }
);

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

const castingState = computed(() => {
  if (!selectedCharacter.value) return null;
  return characterCasts.value.find(
    (row) => row.characterId.toString() === selectedCharacter.value?.id.toString()
  ) ?? null;
});

const activeCastKey = computed(() => castingState.value?.abilityKey ?? '');
const activeCastEndsAt = computed(() =>
  castingState.value?.endsAtMicros ? Number(castingState.value.endsAtMicros) : 0
);
const isCasting = computed(() => Boolean(activeCastKey.value));
const castingAbilityName = computed(() => {
  const key = activeCastKey.value;
  if (!key) return '';
  const ability = abilityLookup.value.get(key);
  return ability?.name ?? key;
});
const castProgress = computed(() => {
  if (!isCasting.value || !activeCastEndsAt.value) return 0;
  const ability = abilityLookup.value.get(activeCastKey.value ?? '');
  const duration = ability?.castSeconds ? ability.castSeconds * 1_000_000 : 0;
  if (!duration) return 1;
  const remaining = activeCastEndsAt.value - nowMicros.value;
  const clamped = Math.max(0, Math.min(duration, duration - remaining));
  return clamped / duration;
});

const tooltip = ref<{
  visible: boolean;
  x: number;
  y: number;
  item: any | null;
  anchor: 'cursor' | 'right';
}>({
  visible: false,
  x: 0,
  y: 0,
  item: null,
  anchor: 'cursor',
});

const groupPanelPos = ref({ x: 40, y: 140 });
const panelPos = ref({ x: 980, y: 140 });
const travelPanelPos = ref({ x: 1040, y: 110 });
const hotbarPos = ref({ x: 120, y: 260 });

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
const hotbarDrag = ref<{ active: boolean; offsetX: number; offsetY: number }>({
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
const startHotbarDrag = (event: MouseEvent) => {
  hotbarDrag.value = {
    active: true,
    offsetX: event.clientX - hotbarPos.value.x,
    offsetY: event.clientY - hotbarPos.value.y,
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
const onHotbarDrag = (event: MouseEvent) => {
  if (!hotbarDrag.value.active) return;
  hotbarPos.value = {
    x: Math.max(16, event.clientX - hotbarDrag.value.offsetX),
    y: Math.max(16, event.clientY - hotbarDrag.value.offsetY),
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
const stopHotbarDrag = () => {
  if (!hotbarDrag.value.active) return;
  hotbarDrag.value.active = false;
};

onMounted(() => {
  const saved = window.localStorage.getItem('uwr.windowPositions');
  if (saved) {
    try {
      const parsed = JSON.parse(saved) as {
        group?: { x: number; y: number };
        panel?: { x: number; y: number };
        travel?: { x: number; y: number };
        hotbar?: { x: number; y: number };
      };
      if (parsed.group) groupPanelPos.value = parsed.group;
      if (parsed.panel) panelPos.value = parsed.panel;
      if (parsed.travel) travelPanelPos.value = parsed.travel;
      if (parsed.hotbar) hotbarPos.value = parsed.hotbar;
    } catch {
      // ignore invalid storage
    }
  }
  window.addEventListener('mousemove', onGroupDrag);
  window.addEventListener('mousemove', onPanelDrag);
  window.addEventListener('mousemove', onTravelDrag);
  window.addEventListener('mousemove', onHotbarDrag);
  window.addEventListener('mouseup', stopGroupDrag);
  window.addEventListener('mouseup', stopPanelDrag);
  window.addEventListener('mouseup', stopTravelDrag);
  window.addEventListener('mouseup', stopHotbarDrag);
  uiTimer = window.setInterval(() => {
    nowMicros.value = Date.now() * 1000;
  }, 200);
});

onBeforeUnmount(() => {
  window.removeEventListener('mousemove', onGroupDrag);
  window.removeEventListener('mousemove', onPanelDrag);
  window.removeEventListener('mousemove', onTravelDrag);
  window.removeEventListener('mousemove', onHotbarDrag);
  window.removeEventListener('mouseup', stopGroupDrag);
  window.removeEventListener('mouseup', stopPanelDrag);
  window.removeEventListener('mouseup', stopTravelDrag);
  window.removeEventListener('mouseup', stopHotbarDrag);
  if (uiTimer) clearInterval(uiTimer);
});

watch(
  [groupPanelPos, panelPos, travelPanelPos, hotbarPos],
  () => {
    window.localStorage.setItem(
      'uwr.windowPositions',
      JSON.stringify({
        group: groupPanelPos.value,
        panel: panelPos.value,
        travel: travelPanelPos.value,
        hotbar: hotbarPos.value,
      })
    );
  },
  { deep: true }
);

const showTooltip = (payload: {
  item: any;
  x: number;
  y: number;
  anchor?: 'cursor' | 'right';
}) => {
  const anchor = payload.anchor ?? 'cursor';
  const offsetX = 12;
  const offsetY = anchor === 'right' ? 0 : 12;
  tooltip.value = {
    visible: true,
    x: payload.x + offsetX,
    y: payload.y + offsetY,
    item: payload.item,
    anchor,
  };
};

const moveTooltip = (payload: { x: number; y: number }) => {
  if (!tooltip.value.visible || tooltip.value.anchor === 'right') return;
  tooltip.value = { ...tooltip.value, x: payload.x + 12, y: payload.y + 12 };
};

const hideTooltip = () => {
  tooltip.value = { visible: false, x: 0, y: 0, item: null, anchor: 'cursor' };
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

<style>
@keyframes combatPulse {
  0% {
    box-shadow: 0 0 0 0 rgba(255, 80, 80, 0.35);
  }
  50% {
    box-shadow: 0 0 0 6px rgba(255, 80, 80, 0.18);
  }
  100% {
    box-shadow: 0 0 0 0 rgba(255, 80, 80, 0.35);
  }
}
</style>

