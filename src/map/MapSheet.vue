<script setup lang="ts">
import { computed, inject, nextTick, ref, useTemplateRef } from 'vue';
import { PhCaretDown, PhCrosshair, PhFootprints, PhGraph, PhListBullets } from '@phosphor-icons/vue';
import SegTabs from '../ledger/SegTabs.vue';
import { BAND_COLOR } from './danger';
import GraphList from './GraphList.vue';
import GraphPlane from './GraphPlane.vue';
import MapDock from './MapDock.vue';
import MapLegend from './MapLegend.vue';
import { MAP_KEY, createInertMap } from './mapContext';
import type { MapView } from './mapContext';
import RegionsListbox from './RegionsListbox.vue';
import TravelPill from './TravelPill.vue';
import { aboutMinutes, formatClock } from './travelTimer';
import type { Destination } from './useDestination';
import type { MapGraph } from './useMapGraph';

// The mobile Map tab (51-UI-SPEC "Mobile map (sheet)"): the region row with the Regions button and the
// compact travel pill, the Legend disclosure, the Graph | List switch, the canvas and the dock. It
// renders from the graph model the Map screen built (the graph prop: one useMapGraph per screen, so
// the layout runs once) and the same destination model as the desktop detail (the destination prop,
// shared with the dock), so nothing here decides a rule. Its plane's measured scroll area goes to
// the graph's setCanvas, so the region fills the mobile canvas too.
// The Map screen owns arrival, region and selection watchers and reaches the canvas and the dock
// through the three methods exposed below. Every server string is a text node or a bound attribute.
const props = defineProps<{ destination: Destination; graph: MapGraph }>();

const map = inject(MAP_KEY, createInertMap());

const plane = useTemplateRef<InstanceType<typeof GraphPlane>>('plane');
const dock = useTemplateRef<InstanceType<typeof MapDock>>('dock');
const regionsButton = useTemplateRef<HTMLButtonElement>('regionsButton');

const VIEW_TABS = [
  { id: 'graph', label: 'Graph', icon: PhGraph },
  { id: 'list', label: 'List', icon: PhListBullets },
];

const regionsOpen = ref(false);
const legendOpen = ref(false);

const shownChip = computed(() => props.graph.chips.value.find((chip) => chip.isShown));
const levelText = computed(() => shownChip.value?.levelLabel ?? '');
const levelColor = computed(() => {
  const chip = shownChip.value;
  if (!chip) return 'var(--color-neutral-500)';
  if (chip.band !== null) return BAND_COLOR[chip.band];
  return chip.range === null ? 'var(--color-con-light-green)' : 'var(--color-neutral-500)';
});

const timer = computed(() => map.selfTimer.value);
const timeText = computed(() => formatClock(timer.value.secondsLeft));
const aboutText = computed(() => aboutMinutes(timer.value.secondsLeft));

function chooseRegion(regionId: bigint): void {
  map.setBanner(null);
  map.showRegion(regionId);
  closeRegions();
}

function closeRegions(): void {
  regionsOpen.value = false;
  void nextTick(() => regionsButton.value?.focus());
}

function onSelect(id: bigint): void {
  map.setBanner(null);
  map.select(id);
}

function onView(id: string): void {
  const next: MapView = id === 'list' ? 'list' : 'graph';
  map.setView(next);
}

/** Your place, or the start node when you are elsewhere, to the middle of the canvas. */
function centerOnYou(): void {
  const current = props.graph.layout.value;
  if (current === null) return;
  const here = props.graph.currentId.value;
  const target = here !== null && current.nodes.some((node) => node.id === here) ? here : current.startId;
  if (target !== null) plane.value?.scrollToNode(target);
}

function focusCurrent(): void {
  plane.value?.focusCurrent();
}

function scrollToNode(id: bigint, block: 'center' | 'nearest' = 'center'): void {
  plane.value?.scrollToNode(id, block);
}

function focusName(): void {
  dock.value?.focusName();
}

defineExpose({ focusCurrent, scrollToNode, focusName });
</script>

<template>
  <div v-if="props.graph.layout.value !== null" class="sheet-map">
    <div class="region-row">
      <span class="region-name">{{ props.graph.regionName.value }}</span>
      <span v-if="levelText !== ''" class="region-level" :style="{ color: levelColor }">{{ levelText }}</span>
      <span class="region-spacer"></span>
      <button
        ref="regionsButton"
        type="button"
        class="btn btn-secondary regions-button"
        aria-haspopup="listbox"
        :aria-expanded="regionsOpen ? 'true' : 'false'"
        @click="regionsOpen = !regionsOpen"
      >
        <span>Regions</span>
        <PhCaretDown class="caret" :class="{ open: regionsOpen }" :size="16" aria-hidden="true" />
      </button>
      <TravelPill :compact="true" />
    </div>
    <RegionsListbox
      v-if="regionsOpen"
      :chips="props.graph.chips.value"
      :locked="timer.running"
      :time-text="timeText"
      :about-text="aboutText"
      @choose="chooseRegion"
      @close="closeRegions"
    />

    <button
      type="button"
      class="btn btn-ghost legend-toggle"
      :aria-expanded="legendOpen ? 'true' : 'false'"
      @click="legendOpen = !legendOpen"
    >
      <span>Legend</span>
      <PhCaretDown class="caret" :class="{ open: legendOpen }" :size="16" aria-hidden="true" />
    </button>
    <MapLegend v-if="legendOpen" :player-level="props.graph.playerLevel.value" :mobile="true" />

    <div class="canvas-block">
      <SegTabs
        class="view-tabs"
        :tabs="VIEW_TABS"
        :model-value="map.view.value"
        label="Map view"
        id-prefix="map-sheet-view"
        @update:model-value="onView"
      >
        <GraphPlane
          v-if="map.view.value === 'graph'"
          ref="plane"
          :layout="props.graph.layout.value"
          :views="props.graph.views.value"
          :gates="props.graph.gates.value"
          :routes="props.graph.routes.value"
          :region-name="props.graph.regionName.value"
          :selected-id="map.selectedId.value"
          :current-id="props.graph.currentId.value"
          :mobile="true"
          @select="onSelect"
          @resize="props.graph.setCanvas"
        />
        <GraphList v-else :rows="props.graph.rows.value" @select="onSelect" />
      </SegTabs>
      <div v-if="map.banner.value" class="arrival-banner" role="status">
        <PhFootprints class="banner-icon" :size="14" aria-hidden="true" />
        <span>{{ map.banner.value }}</span>
      </div>
      <button
        v-if="map.view.value === 'graph'"
        type="button"
        class="btn btn-secondary btn-icon center-button"
        aria-label="Center on you"
        title="Center on you"
        @click="centerOnYou"
      >
        <PhCrosshair :size="16" aria-hidden="true" />
      </button>
    </div>

    <MapDock ref="dock" :destination="props.destination" />
  </div>
</template>

<style scoped>
.sheet-map {
  flex: 1;
  min-height: 0;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.region-row {
  flex: none;
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 0 0 8px;
  min-width: 0;
}

.region-name {
  min-width: 0;
  font-size: 14px;
  font-weight: 500;
  color: var(--color-text);
  overflow-wrap: anywhere;
}

.region-level {
  flex: none;
  font-size: 12px;
  font-variant-numeric: tabular-nums;
}

.region-spacer {
  flex: 1;
}

.regions-button,
.legend-toggle {
  flex: none;
  min-height: 44px;
}

.legend-toggle {
  justify-content: space-between;
  color: var(--color-neutral-300);
}

.caret {
  flex: none;
}

.caret.open {
  transform: rotate(180deg);
}

/* The view switch sits above the canvas; the canvas keeps 240px however long the dock is. */
.canvas-block {
  position: relative;
  flex: 1;
  /* the 240px canvas plus the 44px view switch above it */
  min-height: calc(240px + 44px + 4px);
  min-width: 0;
  display: flex;
  flex-direction: column;
}

.view-tabs {
  flex: 1;
  min-height: 0;
}

.canvas-block :deep(.panel) {
  min-height: 240px;
  overflow: auto;
  border-radius: var(--radius-md);
  background:
    radial-gradient(520px 360px at 50% 40%, color-mix(in srgb, var(--color-accent-900) 60%, transparent), transparent 70%),
    var(--color-bg);
}

.canvas-block :deep(.tablist) {
  margin-bottom: 4px;
}

.arrival-banner {
  position: absolute;
  top: 48px;
  left: 50%;
  z-index: 3;
  display: flex;
  align-items: center;
  gap: 8px;
  max-width: 80%;
  padding: 8px 16px;
  transform: translateX(-50%);
  border-radius: var(--radius-md);
  background: var(--color-surface);
  box-shadow: inset 0 0 0 1px var(--color-accent-700), var(--shadow-md);
  font-size: 12px;
  line-height: 1.5;
  color: var(--color-text);
  pointer-events: none;
}

.banner-icon {
  flex: none;
  color: var(--color-accent);
}

.center-button {
  position: absolute;
  right: 8px;
  bottom: 8px;
  z-index: 2;
  width: 44px;
  height: 44px;
  min-height: 44px;
}
</style>
