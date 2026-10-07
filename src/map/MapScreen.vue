<script setup lang="ts">
import { computed, inject, nextTick, onBeforeUnmount, useTemplateRef, watch } from 'vue';
import { PhCrosshair, PhFootprints, PhGraph, PhListBullets, PhMapTrifold } from '@phosphor-icons/vue';
import { FRAME_KEY, GAME_KEY, createInertFrame, createInertGame } from '../game/context';
import type { ScreenArgs } from '../game/context';
import SegTabs from '../ledger/SegTabs.vue';
import ContextContent from '../rails/ContextContent.vue';
import EmptyState from '../screens/EmptyState.vue';
import DetailPanel from './DetailPanel.vue';
import GraphList from './GraphList.vue';
import GraphPlane from './GraphPlane.vue';
import { layoutGraph } from './graphLayout';
import type { GraphLayout, LayoutPlace } from './graphLayout';
import MapLegend from './MapLegend.vue';
import { MAP_KEY, createInertMap } from './mapContext';
import type { MapView } from './mapContext';
import { gateView, listRows, nodeViews, routePolylines } from './nodeView';
import { regionChips } from './regionChips';
import { shortestPath, stepsFrom } from './route';
import { useDestination } from './useDestination';

// The Map screen body (51-UI-SPEC "Layout Contract: Map"): the legend row, then the canvas that
// holds the route graph or the list, the Graph | List switch and Center on you, and beside it the
// destination detail column. The header chips and the Region travel pill are MapMeta and MapActions
// (registered in screens.ts). The mobile Map and Here tabs come in plan 51-11, so mobile keeps the
// Here view for now.
//
// The Map follows the character row: after any arrival while it is open (a Map travel, a typed go, a
// respawn) the selection moves to the new place, the graph switches region when it changed, the
// arrival banner shows and focus moves to the detail heading. Nothing is optimistic.
//
// Nothing renders until the visited view, connections and travel cooldowns have applied. Screen
// arguments only ever select among known places and regions (T-51-33); an unknown id falls back to
// your place and region. Every name is a text node or a bound attribute (T-51-32).
const game = inject(GAME_KEY, createInertGame());
const frame = inject(FRAME_KEY, createInertFrame());
const map = inject(MAP_KEY, createInertMap());

const plane = useTemplateRef<InstanceType<typeof GraphPlane>>('plane');
const detailPanel = useTemplateRef<InstanceType<typeof DetailPanel>>('detailPanel');

// One destination model for the screen: the detail column here and, in plan 51-11, the mobile dock.
const destination = useDestination();

const VIEW_TABS = [
  { id: 'graph', label: 'Graph', icon: PhGraph },
  { id: 'list', label: 'List', icon: PhListBullets },
];

// ---------------------------------------------------------------------------
// what is known and shown
// ---------------------------------------------------------------------------

const currentId = computed<bigint | null>(() => {
  const id = game.character.value?.locationId ?? 0n;
  return id === 0n ? null : id;
});
const boundId = computed<bigint | null>(() => {
  const id = game.character.value?.boundLocationId ?? 0n;
  return id === 0n ? null : id;
});
const playerLevel = computed(() => Number(game.character.value?.level ?? 1n));
const regions = computed(() => game.regions.value);
const drawn = computed(() => map.known.value.drawn);
const placeById = computed(() => new Map(drawn.value.map((location) => [location.id, location])));
const drawnIds = computed(() => new Set(drawn.value.map((location) => location.id)));

const currentRegionId = computed<bigint | null>(() => {
  const here = currentId.value;
  return here === null ? null : (placeById.value.get(here)?.regionId ?? null);
});

/** The region on show: the hub's pick when it is a known region, else the region you stand in. */
const shownId = computed<bigint | null>(() => {
  const picked = map.shownRegionId.value;
  if (picked !== null && map.known.value.knownRegionIds.includes(picked)) return picked;
  return currentRegionId.value;
});

function toLayoutPlace(location: (typeof drawn.value)[number]): LayoutPlace {
  return {
    id: location.id,
    name: location.name,
    regionId: location.regionId,
    bindStone: location.bindStone,
    terrainType: location.terrainType,
  };
}

function layoutFor(regionId: bigint): GraphLayout {
  return layoutGraph({
    regionId,
    places: drawn.value.map(toLayoutPlace),
    edges: map.known.value.edges,
  });
}

const layout = computed<GraphLayout | null>(() => (shownId.value === null ? null : layoutFor(shownId.value)));
function regionNameOf(id: bigint | null): string {
  return regions.value.find((region) => region.id === id)?.name ?? 'Unknown region';
}
const regionName = computed(() => regionNameOf(shownId.value));

const steps = computed(() =>
  currentId.value === null ? new Map<bigint, number>() : stepsFrom(map.adjacency.value, currentId.value),
);

const views = computed(() => {
  const current = layout.value;
  if (current === null) return [];
  return nodeViews({
    layout: current,
    places: placeById.value,
    regions: regions.value,
    visited: map.known.value.visited,
    heardOf: map.known.value.heardOf,
    currentLocationId: currentId.value,
    selectedId: map.selectedId.value,
    boundLocationId: boundId.value,
    playerLevel: playerLevel.value,
    steps: steps.value,
  });
});

const rows = computed(() => {
  if (shownId.value === null) return [];
  return listRows({
    views: views.value,
    adjacency: map.adjacency.value,
    places: placeById.value,
    regions: regions.value,
    shownRegionId: shownId.value,
  });
});

const routes = computed(() => {
  const current = layout.value;
  const from = currentId.value;
  const to = map.selectedId.value;
  if (current === null || from === null || to === null) return [];
  return routePolylines(current, shortestPath(map.adjacency.value, from, to));
});

const chips = computed(() =>
  regionChips({
    drawn: drawn.value,
    regions: regions.value,
    currentRegionId: currentRegionId.value,
    shownRegionId: shownId.value,
    playerLevel: playerLevel.value,
  }),
);

const gates = computed(() => {
  const current = layout.value;
  if (current === null) return [];
  return current.gates.map((gate) => {
    const chip = chips.value.find((candidate) => candidate.regionId === gate.farRegionId);
    return gateView(gate, chip, chip?.name ?? 'Unknown region', map.selfTimer.value, false);
  });
});

// ---------------------------------------------------------------------------
// screen arguments, selection rules, scrolling
// ---------------------------------------------------------------------------

/** Desktop only (mobile keeps the Here view), with a place and its region loaded, and the hub applied. */
const canShow = computed(() => frame.isDesktop.value && currentRegionId.value !== null && map.ready.value);

let pendingScroll = false;

function flushScroll(): void {
  if (!pendingScroll || plane.value === null) return;
  pendingScroll = false;
  const id = map.selectedId.value ?? currentId.value;
  if (id !== null) plane.value.scrollToNode(id);
}

function scrollSelectedIntoView(): void {
  pendingScroll = true;
  void nextTick(flushScroll);
}

/** UI-SPEC "Screen arguments": a place, a region, or your own place and region. */
function applyArgs(args: ScreenArgs | null): void {
  const here = currentId.value;
  const homeRegion = currentRegionId.value;
  if (here === null || homeRegion === null) return;

  const place = args?.locationId === undefined ? undefined : placeById.value.get(args.locationId);
  if (place !== undefined) {
    map.showRegion(place.regionId);
    map.select(place.id);
  } else if (args?.regionId !== undefined && map.known.value.knownRegionIds.includes(args.regionId)) {
    map.showRegion(args.regionId);
    const start = args.regionId === homeRegion ? here : layoutFor(args.regionId).startId;
    map.select(start ?? here);
  } else {
    map.showRegion(homeRegion);
    map.select(here);
  }
  scrollSelectedIntoView();
}

watch(
  canShow,
  (show) => {
    if (show) applyArgs(frame.screenArgs.value);
  },
  { immediate: true },
);

// Arguments that arrive while the Map is already open (another screen asks for a place).
watch(
  () => frame.screenArgs.value,
  (args) => {
    if (args !== null && canShow.value) applyArgs(args);
  },
);

watch(plane, flushScroll, { flush: 'post' });

function focusIsOnNode(id: bigint): boolean {
  const active = document.activeElement;
  return active instanceof HTMLElement && active.dataset.nodeId === String(id) && active.closest('.graph-plane') !== null;
}

// The selected place disappears (a passage collapsed, or it is no longer known): the selection moves
// to your place, and focus that was on the removed node moves to the group's current node. Runs
// before the redraw so the old node still holds the focus when it is checked.
watch(
  drawnIds,
  (ids) => {
    const selected = map.selectedId.value;
    const here = currentId.value;
    if (selected === null || ids.has(selected)) return;
    // Your own place is not loaded either: the data is still arriving, so keep the selection.
    if (here === null || !ids.has(here)) return;
    const hadFocus = focusIsOnNode(selected);
    map.select(here);
    if (hadFocus) plane.value?.focusCurrent();
  },
  { flush: 'pre' },
);

// Closing the Map drops the selected-place subscriptions.
onBeforeUnmount(() => {
  if (frame.isDesktop.value) map.select(null);
});

/** A user selection (a node, a gate, a list row) ends the arrival banner. */
function onSelect(id: bigint): void {
  map.setBanner(null);
  map.select(id);
}

// Arrival: any change of the character's place while the Map is open and showing.
watch(
  () => game.character.value?.locationId,
  (next, previous) => {
    if (!canShow.value || next === undefined || next === 0n || next === previous) return;
    const arrived = placeById.value.get(next);
    if (arrived === undefined) return;
    const before = previous === undefined || previous === 0n ? undefined : game.locations.value.find((l) => l.id === previous);
    const crossed = before !== undefined && before.regionId !== arrived.regionId;
    map.select(arrived.id);
    if (shownId.value !== arrived.regionId) map.showRegion(arrived.regionId);
    map.setBanner(
      crossed ? `Crossed into ${regionNameOf(arrived.regionId)}. Arrived at ${arrived.name}.` : `Arrived at ${arrived.name}.`,
    );
    scrollSelectedIntoView();
    void nextTick(() => detailPanel.value?.focusTitle());
  },
);

// A region chosen in the header (or any other change of the shown region) that does not hold the
// selection selects your place when you stand in that region, else the region's start node. Focus
// that was on a chip moves into the graph, whose group shows the new region.
watch(shownId, (region) => {
  if (region === null) return;
  const selected = map.selectedId.value;
  if (selected !== null && placeById.value.get(selected)?.regionId === region) return;
  const here = currentId.value;
  const start = here !== null && currentRegionId.value === region ? here : layoutFor(region).startId;
  if (start === null) return;
  const active = document.activeElement;
  const fromChip = active instanceof HTMLElement && active.hasAttribute('data-region-chip');
  map.setBanner(null);
  map.select(start);
  scrollSelectedIntoView();
  if (fromChip) plane.value?.focusCurrent();
});

function onView(id: string): void {
  const next: MapView = id === 'list' ? 'list' : 'graph';
  map.setView(next);
}

/** Your place, or the start node when you are elsewhere, to the middle of the canvas. */
function centerOnYou(): void {
  const current = layout.value;
  if (current === null) return;
  const here = currentId.value;
  const target = here !== null && current.nodes.some((node) => node.id === here) ? here : current.startId;
  if (target !== null) plane.value?.scrollToNode(target);
}
</script>

<template>
  <div v-if="frame.isDesktop.value" class="map-screen">
    <EmptyState
      v-if="currentId === null"
      :icon="PhMapTrifold"
      title="No places discovered yet."
      body="Travel to a new place and it appears here."
    />
    <div v-else-if="map.ready.value && layout !== null" class="map-body">
      <div class="map-main">
        <MapLegend :player-level="playerLevel" :mobile="false" />
        <div class="canvas">
          <SegTabs
            class="canvas-tabs"
            :tabs="VIEW_TABS"
            :model-value="map.view.value"
            label="Map view"
            id-prefix="map-view"
            @update:model-value="onView"
          >
            <GraphPlane
              v-if="map.view.value === 'graph'"
              ref="plane"
              :layout="layout"
              :views="views"
              :gates="gates"
              :routes="routes"
              :region-name="regionName"
              :selected-id="map.selectedId.value"
              :current-id="currentId"
              :mobile="false"
              @select="onSelect"
            />
            <GraphList v-else :rows="rows" @select="onSelect" />
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
      </div>
      <aside class="detail-column">
        <DetailPanel ref="detailPanel" :destination="destination" />
      </aside>
    </div>
  </div>
  <div v-else class="map-sheet">
    <ContextContent />
  </div>
</template>

<style scoped>
.map-screen {
  height: 100%;
  min-height: 0;
  display: flex;
  flex-direction: column;
}

/* The canvas beside the detail column: narrower from 900 to 1199px, wider from the 1200px tier (the
   drawer content box is 600px at 900, so the canvas keeps about 320px). */
.map-body {
  flex: 1;
  min-height: 0;
  display: grid;
  grid-template-columns: minmax(0, 1fr) 256px;
  column-gap: 24px;
}

@media (min-width: 1200px) {
  .map-body {
    grid-template-columns: minmax(0, 1fr) 304px;
  }
}

.map-main {
  display: flex;
  flex-direction: column;
  min-width: 0;
  min-height: 0;
}

.detail-column {
  min-width: 0;
  min-height: 0;
}

/* The canvas: the radial accent glow over the page ground, tokens only. The plane or list scrolls
   inside it (the SegTabs panel); the view switch and Center on you stay put. */
.canvas {
  position: relative;
  flex: 1;
  min-height: 320px;
  overflow: hidden;
  border-radius: var(--radius-md);
  background:
    radial-gradient(520px 360px at 50% 40%, color-mix(in srgb, var(--color-accent-900) 60%, transparent), transparent 70%),
    var(--color-bg);
}

.canvas-tabs {
  position: absolute;
  inset: 0;
}

.canvas :deep(.tablist) {
  position: absolute;
  top: 8px;
  right: 8px;
  z-index: 2;
  width: auto;
  border-radius: var(--radius-md);
  background: var(--color-surface);
}

.canvas :deep(.seg-opt) {
  flex: none;
  min-height: 32px;
  padding: 4px 8px;
  font-size: 12px;
}

.canvas :deep(.panel) {
  overflow: auto;
}

@media (prefers-reduced-motion: no-preference) {
  .canvas :deep(.panel) {
    scroll-behavior: smooth;
  }
}

/* Top centre of the canvas; the view switch sits top right and stays clear of it. */
.arrival-banner {
  position: absolute;
  top: 16px;
  left: 50%;
  z-index: 3;
  display: flex;
  align-items: center;
  gap: 8px;
  max-width: 60%;
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
  width: 32px;
  height: 32px;
}

.map-sheet {
  display: flex;
  flex-direction: column;
  gap: 16px;
  min-width: 0;
}
</style>
