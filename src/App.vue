<template>
  <div :style="styles.shell">
    <AppHeader
      :styles="styles"
      :conn-active="conn.isActive"
      :selected-character="selectedCharacter"
      :current-location="currentLocation"
    />

    <main :style="[styles.main, activePanel === 'none' ? styles.mainWide : {}]">
      <LogWindow
        :styles="styles"
        :selected-character="selectedCharacter"
        :characters-here="charactersHere"
        :combined-events="combinedEvents"
        :format-timestamp="formatTimestamp"
      />

      <PanelShell
        v-if="activePanel !== 'none'"
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
          :my-characters="myCharacters"
          :selected-character-id="selectedCharacterId"
          @update:newCharacter="newCharacter = $event"
          @create="createCharacter"
          @select="selectedCharacterId = $event"
        />
        <InventoryPanel v-else-if="activePanel === 'inventory'" :styles="styles" />
        <GroupPanel
          v-else-if="activePanel === 'group'"
          :styles="styles"
          :conn-active="conn.isActive"
          :selected-character="selectedCharacter"
          :current-group="currentGroup"
          :group-members="groupMembers"
          :groups="groups"
          :group-name="groupName"
          @update:groupName="groupName = $event"
          @create="createGroup"
          @join="joinGroup"
          @leave="leaveGroup"
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
          :enemy-templates="enemyTemplates"
          :attack-damage="attackDamage"
          @update:attackDamage="attackDamage = $event"
          @start="startCombat"
          @attack="attack"
          @end="endCombat"
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
        @toggle="togglePanel"
      />
    </footer>
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue';
import { styles } from './ui/styles';
import AppHeader from './components/AppHeader.vue';
import LogWindow from './components/LogWindow.vue';
import PanelShell from './components/PanelShell.vue';
import CharacterPanel from './components/CharacterPanel.vue';
import InventoryPanel from './components/InventoryPanel.vue';
import GroupPanel from './components/GroupPanel.vue';
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

const {
  conn,
  characters,
  locations,
  enemyTemplates,
  combats,
  groups,
  worldEvents,
  locationEvents,
  privateEvents,
  groupEvents,
} = useGameData();

const {
  selectedCharacterId,
  myCharacters,
  selectedCharacter,
  currentLocation,
  charactersHere,
  currentGroup,
  groupMembers,
} = useCharacters({
  connActive: computed(() => conn.isActive),
  characters,
  locations,
  groups,
});

const { combinedEvents } = useEvents({
  worldEvents,
  locationEvents,
  privateEvents,
  groupEvents,
});

const { newCharacter, isCharacterFormValid, createCharacter, hasCharacter } =
  useCharacterCreation({
    connActive: computed(() => conn.isActive),
    selectedCharacter,
  });

const { commandText, submitCommand } = useCommands({
  connActive: computed(() => conn.isActive),
  selectedCharacter,
});

const { attackDamage, activeCombat, startCombat, attack, endCombat } = useCombat({
  connActive: computed(() => conn.isActive),
  selectedCharacter,
  combats,
});

const { groupName, createGroup, joinGroup, leaveGroup } = useGroups({
  connActive: computed(() => conn.isActive),
  selectedCharacter,
});

const { moveTo } = useMovement({
  connActive: computed(() => conn.isActive),
  selectedCharacter,
});

const activePanel = ref<
  'none' | 'character' | 'inventory' | 'group' | 'stats' | 'travel' | 'combat'
>('none');

const panelTitle = computed(() => {
  switch (activePanel.value) {
    case 'character':
      return 'Character';
    case 'inventory':
      return 'Inventory';
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

const formatTimestamp = (ts: { microsSinceUnixEpoch: bigint }) => {
  const millis = Number(ts.microsSinceUnixEpoch / 1000n);
  return new Date(millis).toLocaleTimeString();
};
</script>
