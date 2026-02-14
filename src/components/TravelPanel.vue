<template>
  <div>
    <div v-if="!selectedCharacter" :style="styles.subtle">
      Select a character to travel.
    </div>
    <div v-else>
      <div :style="[styles.gridSectionLabel, { marginTop: 0 }]">TRAVEL</div>

      <!-- Cooldown countdown display -->
      <div v-if="cooldownRemainingText" :style="{ fontSize: '0.75rem', color: '#d4a574', marginBottom: '0.3rem', marginLeft: '0.3rem' }">
        Region travel cooldown: {{ cooldownRemainingText }}
      </div>

      <div :style="styles.gridWrap">
        <div
          v-for="(entry, index) in sortedLocations"
          :key="entry.location.id.toString()"
          :style="styles.gridTileTravel"
        >
          <div style="display: flex; align-items: flex-start; gap: 0.4rem; min-width: 0; flex: 1;">
            <span :style="[entry.conStyle, { fontSize: '1rem' }]">{{ directionArrows[index % directionArrows.length] }}</span>
            <div style="display: flex; flex-direction: column; min-width: 0;">
              <div style="display: flex; align-items: baseline; gap: 0.35rem;">
                <span :style="[entry.conStyle, { fontSize: '0.95rem' }]">{{ entry.location.name }}</span>
                <span :style="[{ fontSize: '0.75rem' }, entry.conStyle]">L{{ entry.targetLevel }}</span>
              </div>
              <!-- Region name with visual differentiation for cross-region -->
              <span :style="{ fontSize: '0.75rem', opacity: 0.5, color: entry.isCrossRegion ? '#d4a574' : undefined }">
                {{ entry.regionName }}
              </span>
            </div>
          </div>
          <button
            :style="[
              styles.gridTileGoButton,
              (!canAffordTravel(entry) || (entry.isCrossRegion && !!activeCooldown)) ? { opacity: 0.5 } : {}
            ]"
            @click="$emit('move', entry.location.id)"
            :disabled="!connActive || entry.location.id === selectedCharacter.locationId || !canAffordTravel(entry) || (entry.isCrossRegion && !!activeCooldown)"
          >
            {{ entry.staminaCost }} sta
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, onMounted, onUnmounted } from 'vue';
import type { CharacterRow, LocationRow, RegionRow, TravelCooldownRow, LocationConnectionRow } from '../module_bindings';

const props = defineProps<{
  styles: Record<string, Record<string, string | number>>;
  connActive: boolean;
  selectedCharacter: CharacterRow | null;
  locations: LocationRow[];
  regions: RegionRow[];
  travelCooldowns: TravelCooldownRow[];
  allLocations: LocationRow[];
  locationConnections: LocationConnectionRow[];
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

const directionArrows = ['\u2191', '\u2192', '\u2193', '\u2190', '\u2197', '\u2198', '\u2199', '\u2196'];

// Determine current character's region
const currentRegionId = computed(() => {
  if (!props.selectedCharacter) return null;
  const currentLoc = props.allLocations.find(
    l => l.id.toString() === props.selectedCharacter!.locationId.toString()
  );
  return currentLoc?.regionId ?? null;
});

// Check for active cooldown
const now = ref(Date.now());
let cooldownInterval: number | undefined;

onMounted(() => {
  cooldownInterval = window.setInterval(() => {
    now.value = Date.now();
  }, 1000);
});

onUnmounted(() => {
  if (cooldownInterval !== undefined) {
    clearInterval(cooldownInterval);
  }
});

const activeCooldown = computed(() => {
  if (!props.selectedCharacter) return null;
  const charId = props.selectedCharacter.id.toString();
  const cd = props.travelCooldowns.find(
    c => c.characterId.toString() === charId
  );
  if (!cd) return null;

  // Use server clock offset if available (from quick-55)
  const offsetMs = (window as any).__server_clock_offset ?? 0;
  const nowMicros = BigInt(Math.round((now.value + offsetMs) * 1000));

  if (cd.readyAtMicros > nowMicros) return cd;
  return null; // Expired
});

const cooldownRemainingText = computed(() => {
  if (!activeCooldown.value) return null;

  const offsetMs = (window as any).__server_clock_offset ?? 0;
  const nowMicros = BigInt(Math.round((now.value + offsetMs) * 1000));
  const remainingMicros = activeCooldown.value.readyAtMicros - nowMicros;
  const remainingMs = Number(remainingMicros / 1000n);

  if (remainingMs <= 0) return null;

  const totalSeconds = Math.ceil(remainingMs / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;

  return `${minutes}m ${seconds}s`;
});

const sortedLocations = computed(() => {
  if (!props.selectedCharacter) return [];
  const playerLevel = Number(props.selectedCharacter.level);
  const currentRegion = currentRegionId.value;

  return props.locations
    .map((location) => {
      const region = props.regions.find((r) => r.id.toString() === location.regionId.toString());
      const targetLevel = targetLevelForLocation(location, playerLevel, props.regions);
      const diff = targetLevel - playerLevel;

      // Determine if cross-region
      const isCrossRegion = currentRegion !== null &&
        location.regionId.toString() !== currentRegion.toString();
      const staminaCost = isCrossRegion ? 10 : 5;

      return {
        location,
        targetLevel,
        conStyle: conStyleForDiff(diff),
        regionStyle: regionStyleForDiff(diff),
        regionName: region?.name ?? 'Unknown',
        isCrossRegion,
        staminaCost,
      };
    })
    .sort((a, b) => a.targetLevel - b.targetLevel);
});

const canAffordTravel = (entry: { staminaCost: number }) => {
  if (!props.selectedCharacter) return false;
  return Number(props.selectedCharacter.stamina) >= entry.staminaCost;
};
</script>
