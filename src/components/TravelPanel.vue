<template>
  <div>
    <div :style="styles.panelSectionTitle">Travel</div>
    <div v-if="!selectedCharacter" :style="styles.subtle">
      Select a character to travel.
    </div>
    <div v-else>
      <div :style="styles.subtle">
        Connected locations are sorted from safer to more dangerous.
      </div>
      <div :style="styles.list">
        <div
          v-for="entry in sortedLocations"
          :key="entry.location.id.toString()"
          :style="styles.roster"
        >
          <div :style="styles.rosterTitle">
            <span :style="entry.conStyle">{{ entry.location.name }}</span>
          </div>
          <div :style="styles.subtle">{{ entry.location.description }}</div>
          <div :style="styles.panelFormInline">
            <span :style="[styles.regionBadge, entry.regionStyle]">{{ entry.regionName }}</span>
            <span :style="entry.conStyle">Target L{{ entry.targetLevel }}</span>
          </div>
          <div :style="styles.buttonWrap">
            <button
              @click="$emit('move', entry.location.id)"
              :disabled="!connActive || entry.location.id === selectedCharacter.locationId"
              :style="styles.ghostButton"
            >
              Travel
            </button>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import type { CharacterRow, LocationRow, RegionRow } from '../module_bindings';

const props = defineProps<{
  styles: Record<string, Record<string, string | number>>;
  connActive: boolean;
  selectedCharacter: CharacterRow | null;
  locations: LocationRow[];
  regions: RegionRow[];
}>();

defineEmits<{
  (e: 'move', locationId: bigint): void;
}>();

const conStyleForDiff = (diff: number) => {
  if (diff <= -5) return props.styles.conGray;
  if (diff <= -3) return props.styles.conLightGreen;
  if (diff <= -1) return props.styles.conBlue;
  if (diff === 0) return props.styles.conWhite;
  if (diff <= 2) return props.styles.conYellow;
  if (diff <= 4) return props.styles.conOrange;
  return props.styles.conRed;
};

const regionStyleForDiff = (diff: number) => conStyleForDiff(diff);

const targetLevelForLocation = (location: LocationRow, level: number, regions: RegionRow[]) => {
  const region = regions.find((r) => r.id.toString() === location.regionId.toString());
  const multiplier = region ? Number(region.dangerMultiplier) : 100;
  const offset = Number(location.levelOffset ?? 0n);
  const scaled = Math.floor((level * multiplier) / 100);
  return Math.max(1, scaled + offset);
};

const sortedLocations = computed(() => {
  if (!props.selectedCharacter) return [];
  const playerLevel = Number(props.selectedCharacter.level);
  return props.locations
    .map((location) => {
      const region = props.regions.find((r) => r.id.toString() === location.regionId.toString());
      const targetLevel = targetLevelForLocation(location, playerLevel, props.regions);
      const diff = targetLevel - playerLevel;
      return {
        location,
        targetLevel,
        conStyle: conStyleForDiff(diff),
        regionStyle: regionStyleForDiff(diff),
        regionName: region?.name ?? 'Unknown',
      };
    })
    .sort((a, b) => a.targetLevel - b.targetLevel);
});
</script>
