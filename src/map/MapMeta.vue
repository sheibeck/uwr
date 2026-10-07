<script setup lang="ts">
import { computed, inject } from 'vue';
import { PhLockSimple, PhMapPin } from '@phosphor-icons/vue';
import { GAME_KEY, FRAME_KEY, createInertFrame, createInertGame } from '../game/context';
import { MAP_KEY, createInertMap } from './mapContext';
import type { RegionChip } from './regionChips';
import { aboutMinutes, formatClock } from './travelTimer';
import { useShownRegion } from './useMapGraph';

// The Map header meta (51-UI-SPEC "Region chips and the Region travel pill"), rendered by the frame
// in the drawer and sheet #meta slot. Desktop: one button chip per known region (yours first, then by
// name, then id) with its level range; choosing one only asks the hub to show that region
// (chooseRegion, which also counts the choice), and the Map screen picks the selection and the focus.
// Mobile: the shown region's name as text (the chips become the Regions listbox of plan 51-11), so
// the chips need no mobile hit-area rule.
//
// There is no level lock anywhere. While your own region travel timer runs, every region but the one
// you stand in shows a lock and the server's time left; the chip stays operable because the lock
// limits travel, not viewing. Nothing renders until the map data has applied.
const game = inject(GAME_KEY, createInertGame());
const frame = inject(FRAME_KEY, createInertFrame());
const map = inject(MAP_KEY, createInertMap());

const ready = computed(() => map.ready.value && game.character.value !== null);

// The shown region and the chips come from the same rules the graph uses (useShownRegion).
const { chips } = useShownRegion();

const shownName = computed(() => chips.value.find((chip) => chip.isShown)?.name ?? '');

const timer = computed(() => map.selfTimer.value);
const clock = computed(() => formatClock(timer.value.secondsLeft));

function locked(chip: RegionChip): boolean {
  return timer.value.running && !chip.isYours;
}

// The label reads '{Region}, {level}[, you are here][, region travel locked for about {n} minutes]'.
function ariaLabel(chip: RegionChip): string {
  let label = `${chip.name}, ${chip.levelLabel}`;
  if (chip.isYours && !chip.isShown) label += ', you are here';
  if (locked(chip)) label += `, region travel locked for ${aboutMinutes(timer.value.secondsLeft)}`;
  return label;
}
</script>

<template>
  <template v-if="ready">
    <span v-if="frame.isDesktop.value" class="map-meta">
      <button
        v-for="chip in chips"
        :key="String(chip.regionId)"
        type="button"
        class="tag region-chip"
        :class="[chip.isShown ? 'tag-accent' : 'tag-neutral', { locked: locked(chip) }]"
        :aria-pressed="chip.isShown ? 'true' : 'false'"
        :aria-label="ariaLabel(chip)"
        data-region-chip
        @click="map.chooseRegion(chip.regionId)"
      >
        <PhMapPin v-if="chip.isYours && !chip.isShown" class="chip-icon" :size="12" aria-hidden="true" />
        <PhLockSimple v-if="locked(chip)" class="chip-icon" :size="12" aria-hidden="true" />
        <span class="chip-name" :title="chip.name">{{ chip.name }}</span>
        <span v-if="locked(chip)" class="chip-clock" aria-hidden="true">{{ clock }}</span>
        <span v-else class="chip-level">{{ chip.levelLabel }}</span>
      </button>
    </span>
    <span v-else class="region-name">{{ shownName }}</span>
  </template>
</template>

<style scoped>
.map-meta {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 4px;
  min-width: 0;
}

.region-chip {
  box-sizing: border-box;
  min-height: 32px;
  gap: 4px;
  padding: 4px 8px;
  border: 0;
  font-family: inherit;
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
  cursor: pointer;
}

.region-chip:hover {
  background-image: linear-gradient(
    color-mix(in srgb, var(--color-text) 7%, transparent),
    color-mix(in srgb, var(--color-text) 7%, transparent)
  );
}

.region-chip:active {
  background-image: linear-gradient(
    color-mix(in srgb, var(--color-text) 14%, transparent),
    color-mix(in srgb, var(--color-text) 14%, transparent)
  );
}

.region-chip:focus-visible {
  outline: 2px solid var(--color-accent);
  outline-offset: -2px;
}

/* Dimmed without opacity: the chip stays operable while region travel is locked. */
.region-chip.locked {
  color: var(--color-neutral-500);
}

.chip-icon {
  flex: none;
}

.chip-name {
  min-width: 0;
  max-width: 144px;
  overflow: hidden;
  text-overflow: ellipsis;
}

.chip-level,
.chip-clock {
  flex: none;
  margin-left: 4px;
}

.chip-level {
  color: var(--color-neutral-300);
}

.region-chip.tag-accent .chip-level {
  color: var(--color-accent-200);
}

.chip-clock {
  color: var(--color-neutral-500);
}

.region-name {
  font-size: 12px;
  color: var(--color-neutral-400);
  overflow-wrap: anywhere;
}
</style>
