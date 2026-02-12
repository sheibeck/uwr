<template>
  <div>
    <div v-if="!selectedCharacter" :style="styles.subtle">
      Select a character to travel.
    </div>
    <div v-else>
      <div :style="styles.gridSectionLabel">TRAVEL</div>
      <div :style="styles.gridWrap">
        <div
          v-for="entry in sortedLocations"
          :key="entry.location.id.toString()"
          :style="styles.gridTileTravel"
        >
          <div style="display: flex; align-items: baseline; gap: 0.4rem; min-width: 0;">
            <span :style="entry.conStyle">{{ entry.location.name }}</span>
            <span :style="{ fontSize: '0.65rem', opacity: 0.6 }">{{ entry.regionName }}</span>
            <span :style="[{ fontSize: '0.65rem' }, entry.conStyle]">L{{ entry.targetLevel }}</span>
          </div>
          <button
            :style="styles.gridTileGoButton"
            @click="$emit('move', entry.location.id)"
            :disabled="!connActive || entry.location.id === selectedCharacter.locationId"
          >
            Go
          </button>
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
