<template>
  <div :style="styles.panelSplit">
    <div :style="[styles.panelColumn, styles.panelColumnNarrow]">
      <div :style="styles.rosterTitle">NPCs</div>
      <div :style="styles.filterList">
        <div
          v-for="npc in npcFilters"
          :key="npc.id"
          :style="[
            styles.filterItem,
            selectedNpcId === npc.id ? styles.filterItemActive : {}
          ]"
          @click="selectedNpcId = npc.id"
        >
          {{ npc.name }}
        </div>
      </div>
    </div>

    <div :style="[styles.panelColumn, styles.panelColumnWide]">
      <div v-if="selectedNpcHeader" :style="styles.logItem">
        <span :style="styles.logTime">{{ selectedNpcHeader.name }}</span>
        <span :style="styles.logMessage">{{ selectedNpcHeader.location }}</span>
      </div>
      <div v-else :style="styles.subtle">Select an NPC to view dialog.</div>
      <div v-if="dialogEntries.length === 0" :style="styles.subtle">
        No conversations yet.
      </div>
      <div v-else :style="styles.logList">
        <div v-for="entry in dialogEntries" :key="entry.key" :style="styles.logItem">
          <span :style="styles.logMessage">{{ entry.text }}</span>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue';
import type { NpcDialogRow, NpcRow, LocationRow, RegionRow } from '../module_bindings';

const props = defineProps<{
  styles: Record<string, Record<string, string | number>>;
  npcDialogs: NpcDialogRow[];
  npcs: NpcRow[];
  locations: LocationRow[];
  regions: RegionRow[];
}>();

const selectedNpcId = ref<string | null>(null);

const npcFilters = computed(() => {
  const seen = new Map<string, string>();
  for (const entry of props.npcDialogs) {
    const npc = props.npcs.find((row) => row.id.toString() === entry.npcId.toString());
    if (npc) seen.set(npc.id.toString(), npc.name);
  }
  return Array.from(seen.entries()).map(([id, name]) => ({ id, name }));
});

const dialogEntries = computed(() => {
  const selected = selectedNpcId.value;
  if (!selected) return [];
  return [...props.npcDialogs]
    .filter((entry) => entry.npcId.toString() === selected)
    .sort((a, b) => Number(a.createdAt.microsSinceUnixEpoch - b.createdAt.microsSinceUnixEpoch))
    .map((entry) => {
      const npc = props.npcs.find((row) => row.id.toString() === entry.npcId.toString());
      return {
        key: entry.id.toString(),
        npc: npc ? npc.name : 'NPC',
        text: entry.text,
      };
    });
});

const selectedNpcHeader = computed(() => {
  if (!selectedNpcId.value) return null;
  const npc = props.npcs.find((row) => row.id.toString() === selectedNpcId.value);
  if (!npc) return null;
  const location = props.locations.find((row) => row.id.toString() === npc.locationId.toString());
  const region = location
    ? props.regions.find((row) => row.id.toString() === location.regionId.toString())
    : null;
  const label = location
    ? `${location.name}${region ? ` · ${region.name}` : ''}`
    : 'Unknown location';
  return {
    name: npc.name,
    location: label,
  };
});
</script>
