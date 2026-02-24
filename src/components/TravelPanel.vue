<template>
  <div>
    <!-- Cross-region confirmation dialog overlay -->
    <div v-if="pendingCrossRegionMove" :style="overlayStyle">
      <div :style="dialogStyle">
        <div :style="dialogTitleStyle">Cross-Region Expedition</div>
        <div :style="dialogBodyStyle">
          <p :style="dialogTextStyle">
            You are about to embark on a long journey to
            <span :style="{ color: '#d4a574', fontWeight: 'bold' }">{{ pendingCrossRegionMove.locationName }}</span>
            in the
            <span :style="{ color: '#d4a574', fontWeight: 'bold' }">{{ pendingCrossRegionMove.regionName }}</span>
            region.
          </p>
          <p :style="dialogNarrativeStyle">
            The road ahead is arduous. Such an expedition will exhaust your character,
            and they must rest before undertaking another journey of this magnitude.
          </p>
          <p :style="dialogCostStyle">
            Cost: {{ pendingCrossRegionMove.staminaCost }} stamina + 5 minute cooldown
          </p>
        </div>
        <div :style="dialogButtonRowStyle">
          <button :style="dialogCancelButtonStyle" @click="cancelCrossRegionTravel">Turn Back</button>
          <button :style="dialogConfirmButtonStyle" @click="confirmCrossRegionTravel">Set Forth</button>
        </div>
      </div>
    </div>

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
            @click="handleTravelClick(entry)"
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
import type { CharacterRow, LocationRow, RegionRow, TravelCooldownRow, LocationConnectionRow } from '../stdb-types';

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

const emit = defineEmits<{
  (e: 'move', locationId: bigint): void;
}>();

// Pending cross-region move state
const pendingCrossRegionMove = ref<null | {
  locationId: bigint;
  locationName: string;
  regionName: string;
  staminaCost: number;
}>(null);

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

const targetLevelForLocation = (location: LocationRow, _level: number, regions: RegionRow[]) => {
  const region = regions.find((r) => r.id.toString() === location.regionId.toString());
  const multiplier = region ? Number(region.dangerMultiplier) : 100;
  const offset = Number(location.levelOffset ?? 0n);
  const scaled = Math.floor((1 * multiplier) / 100);
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

// Handle travel button click
const handleTravelClick = (entry: {
  location: LocationRow;
  isCrossRegion: boolean;
  regionName: string;
  staminaCost: number;
}) => {
  if (entry.isCrossRegion) {
    // Show confirmation dialog for cross-region travel
    pendingCrossRegionMove.value = {
      locationId: entry.location.id,
      locationName: entry.location.name,
      regionName: entry.regionName,
      staminaCost: entry.staminaCost,
    };
  } else {
    // Within-region travel - emit move directly
    emit('move', entry.location.id);
  }
};

// Confirm cross-region travel
const confirmCrossRegionTravel = () => {
  if (pendingCrossRegionMove.value) {
    emit('move', pendingCrossRegionMove.value.locationId);
    pendingCrossRegionMove.value = null;
  }
};

// Cancel cross-region travel
const cancelCrossRegionTravel = () => {
  pendingCrossRegionMove.value = null;
};

// Dialog styles
const overlayStyle = {
  position: 'fixed' as const,
  inset: '0',
  background: 'rgba(0,0,0,0.6)',
  display: 'flex',
  justifyContent: 'center',
  alignItems: 'center',
  zIndex: 9000,
};

const dialogStyle = {
  background: '#141821',
  border: '1px solid rgba(255,255,255,0.15)',
  borderRadius: '14px',
  padding: '1.5rem',
  maxWidth: '420px',
  width: '90vw',
  boxShadow: '0 14px 32px rgba(0,0,0,0.6)',
};

const dialogTitleStyle = {
  fontSize: '1.1rem',
  fontWeight: 'bold' as const,
  color: '#e6e8ef',
  marginBottom: '1rem',
  textAlign: 'center' as const,
  letterSpacing: '0.05em',
  textTransform: 'uppercase' as const,
};

const dialogBodyStyle = {
  marginBottom: '1.2rem',
};

const dialogTextStyle = {
  fontSize: '0.9rem',
  color: '#c8cad0',
  lineHeight: '1.5',
  marginBottom: '0.6rem',
};

const dialogNarrativeStyle = {
  fontSize: '0.85rem',
  color: 'rgba(212, 165, 116, 0.85)',
  lineHeight: '1.5',
  fontStyle: 'italic' as const,
  marginBottom: '0.8rem',
};

const dialogCostStyle = {
  fontSize: '0.8rem',
  color: 'rgba(255,255,255,0.5)',
  textAlign: 'center' as const,
};

const dialogButtonRowStyle = {
  display: 'flex',
  gap: '0.75rem',
  justifyContent: 'center',
};

const dialogCancelButtonStyle = {
  padding: '0.5rem 1.2rem',
  background: 'transparent',
  border: '1px solid rgba(255,255,255,0.2)',
  borderRadius: '8px',
  color: '#a0a3ab',
  cursor: 'pointer',
  fontSize: '0.85rem',
};

const dialogConfirmButtonStyle = {
  padding: '0.5rem 1.2rem',
  background: 'rgba(212, 165, 116, 0.15)',
  border: '1px solid rgba(212, 165, 116, 0.4)',
  borderRadius: '8px',
  color: '#d4a574',
  cursor: 'pointer',
  fontSize: '0.85rem',
  fontWeight: 'bold' as const,
};
</script>
