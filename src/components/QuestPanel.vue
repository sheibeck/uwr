<template>
  <div :style="styles.panelBody">
    <div v-if="questRows.length === 0" :style="styles.subtle">No active quests.</div>
    <div v-else :style="styles.rosterList">
      <div v-for="quest in questRows" :key="quest.id" :style="styles.rosterClickable">
        <div>{{ quest.name }}</div>
        <div :style="styles.subtleSmall">
          {{ quest.giver }} · {{ quest.location }}
        </div>
        <div :style="styles.subtleSmall">
          Progress: {{ quest.progress }}/{{ quest.requiredCount }}
          <span v-if="quest.completed"> (Complete)</span>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import type {
  QuestInstanceRow,
  QuestTemplateRow,
  NpcRow,
  LocationRow,
  RegionRow,
} from '../module_bindings';

const props = defineProps<{
  styles: Record<string, Record<string, string | number>>;
  questInstances: QuestInstanceRow[];
  questTemplates: QuestTemplateRow[];
  npcs: NpcRow[];
  locations: LocationRow[];
  regions: RegionRow[];
}>();

const questRows = computed(() => {
  return props.questInstances.map((instance) => {
    const template = props.questTemplates.find(
      (row) => row.id.toString() === instance.questTemplateId.toString()
    );
    const npc = template
      ? props.npcs.find((row) => row.id.toString() === template.npcId.toString())
      : null;
    const location = npc
      ? props.locations.find((row) => row.id.toString() === npc.locationId.toString())
      : null;
    const region = location
      ? props.regions.find((row) => row.id.toString() === location.regionId.toString())
      : null;
    const locationLabel = location
      ? `${location.name}${region ? `, ${region.name}` : ''}`
      : 'Unknown';
    return {
      id: instance.id.toString(),
      name: template?.name ?? 'Unknown Quest',
      giver: npc?.name ?? 'Unknown',
      location: locationLabel,
      progress: instance.progress,
      requiredCount: template?.requiredCount ?? 0n,
      completed: instance.completed,
    };
  });
});
</script>
