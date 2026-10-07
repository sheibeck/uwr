<script setup lang="ts">
import { computed, inject, nextTick, onBeforeUnmount, ref, useTemplateRef, watch } from 'vue';
import { PhCrosshair, PhFootprints, PhMapTrifold } from '@phosphor-icons/vue';
import { FRAME_KEY, GAME_KEY, createInertFrame, createInertGame } from '../game/context';
import type { ScreenArgs } from '../game/context';
import SegTabs from '../ledger/SegTabs.vue';
import NoticeLine from '../ledger/NoticeLine.vue';
import ContextContent from '../rails/ContextContent.vue';
import EmptyState from '../screens/EmptyState.vue';
import DetailPanel from './DetailPanel.vue';
import GraphPlane from './GraphPlane.vue';
import MapLegend from './MapLegend.vue';
import { MAP_KEY, createInertMap } from './mapContext';
import MapSheet from './MapSheet.vue';
import { useDestination } from './useDestination';
import { useMapGraph } from './useMapGraph';

// The Map screen body (51-UI-SPEC "Layout Contract: Map"): the legend row, then the canvas that
// holds the route graph and Center on you, and beside it the destination detail column. The header chips and the Region travel pill are MapMeta and MapActions
// (registered in screens.ts). On mobile the screen is two tabs, Map (MapSheet: region row, canvas and
// dock) and Here (the rail content), with one notice line at the bottom under both.
//
// The Map follows the character row: after any arrival while it is open (a Map travel, a typed go, a
// respawn) the selection moves to the new place, the graph switches region when it changed, the
// arrival banner shows and focus moves to the detail heading. Nothing is optimistic.
//
// The screen builds the graph model once (useMapGraph) and hands the same object to MapSheet on
// mobile, so the layout runs once per real change. The plane reports its measured scroll area
// (resize), which the graph lays the region out to fill (51-12, MS-02); a switch between desktop and
// mobile measures again from scratch, and the first measurement after open scrolls the selection
// into view once more, onto the final layout.
//
// Nothing renders until the visited view, connections and travel cooldowns have applied. Screen
// arguments only ever select among known places and regions (T-51-33); an unknown id falls back to
// your place and region. Every name is a text node or a bound attribute (T-51-32).
const game = inject(GAME_KEY, createInertGame());
const frame = inject(FRAME_KEY, createInertFrame());
const map = inject(MAP_KEY, createInertMap());

const root = useTemplateRef<HTMLElement>('root');
const plane = useTemplateRef<InstanceType<typeof GraphPlane>>('plane');
const detailPanel = useTemplateRef<InstanceType<typeof DetailPanel>>('detailPanel');
const sheet = useTemplateRef<InstanceType<typeof MapSheet>>('sheet');

// One destination model for the screen: the detail column on desktop and the dock on mobile read it,
// so they share one action runner and one notice line.
const destination = useDestination();

const SHEET_TABS = [
  { id: 'map', label: 'Map' },
  { id: 'here', label: 'Here' },
];
const sheetTab = ref('map');

/** The canvas that scrolls and takes focus: the plane on desktop, the sheet's plane on mobile. */
interface Surface {
  focusCurrent(): void;
  scrollToNode(id: bigint, block?: 'center' | 'nearest'): void;
}
function surface(): Surface | null {
  return frame.isDesktop.value ? plane.value : sheet.value;
}

// ---------------------------------------------------------------------------
// what is known and shown
// ---------------------------------------------------------------------------

const graph = useMapGraph(() => !frame.isDesktop.value);
const { currentId, playerLevel, placeById, drawnIds, currentRegionId, shownId, startIdFor, layout, regionName, regionNameOf } = graph;
const { views, routes, gates } = graph;

// ---------------------------------------------------------------------------
// screen arguments, selection rules, scrolling
// ---------------------------------------------------------------------------

/** A place and its region loaded, and the hub applied (desktop and mobile alike). */
const canShow = computed(() => currentRegionId.value !== null && map.ready.value);

let pendingScroll = false;

function flushScroll(): void {
  const target = surface();
  if (!pendingScroll || target === null) return;
  pendingScroll = false;
  const id = map.selectedId.value ?? currentId.value;
  if (id !== null) target.scrollToNode(id);
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
  // An opening (or a new request) is not an arrival: an older banner never carries over.
  map.setBanner(null);

  const place = args?.locationId === undefined ? undefined : placeById.value.get(args.locationId);
  if (place !== undefined) {
    map.showRegion(place.regionId);
    map.select(place.id);
  } else if (args?.regionId !== undefined && map.known.value.knownRegionIds.includes(args.regionId)) {
    map.showRegion(args.regionId);
    const start = args.regionId === homeRegion ? here : startIdFor(args.regionId);
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

// A switch between desktop and mobile shows another plane in another scroll area: measure again.
watch(
  () => frame.isDesktop.value,
  () => graph.setCanvas(null),
);

// The first measured canvas after open (or after a reset) lays the region out again to fill it, so
// the open-scroll is repeated onto the final layout (UI-SPEC "On open, the canvas scrolls so the
// selected node is visible").
watch(
  () => graph.canvas.value,
  (next, previous) => {
    if (previous === null && next !== null && canShow.value) scrollSelectedIntoView();
  },
);

// The Map tab opens again after the Here tab: the selected place scrolls into view.
watch(
  sheet,
  (opened) => {
    if (opened) scrollSelectedIntoView();
  },
  { flush: 'post' },
);

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
    if (hadFocus) surface()?.focusCurrent();
  },
  { flush: 'pre' },
);

// Closing the Map drops the selected-place subscriptions and ends the arrival banner, which lives in
// the session hub: a trip made while the Map is closed must never reopen it on an old 'Arrived at'.
onBeforeUnmount(() => {
  map.select(null);
  map.setBanner(null);
});

/** A user selection (a node or a gate) ends the arrival banner. */
function onSelect(id: bigint): void {
  map.setBanner(null);
  map.select(id);
}

/** Focus is somewhere in the Map: its body, or the drawer or sheet around it (header chips, close). */
function focusInMap(): boolean {
  const body = root.value;
  const active = document.activeElement;
  if (body === null || active === null) return false;
  const shell = body.closest('[role="dialog"]') ?? body;
  return shell.contains(active);
}

// Arrival: any change of the character's place while the Map is open and showing. Focus follows only
// when the player was working in the Map or the trip came from the Map's own Travel (review IN-08): a
// leader's move or a respawn never pulls focus away from the vitals rail or the console.
watch(
  () => game.character.value?.locationId,
  (next, previous) => {
    const ownTrip = next !== undefined && destination.isOwnArrival(next);
    if (!canShow.value || next === undefined || next === 0n || next === previous) return;
    const arrived = placeById.value.get(next);
    if (arrived === undefined) return;
    const moveFocus = ownTrip || focusInMap();
    const before = previous === undefined || previous === 0n ? undefined : game.locations.value.find((l) => l.id === previous);
    const crossed = before !== undefined && before.regionId !== arrived.regionId;
    map.select(arrived.id);
    if (shownId.value !== arrived.regionId) map.showRegion(arrived.regionId);
    map.setBanner(
      crossed ? `Crossed into ${regionNameOf(arrived.regionId)}. Arrived at ${arrived.name}.` : `Arrived at ${arrived.name}.`,
    );
    scrollSelectedIntoView();
    if (!moveFocus) return;
    // Desktop: the detail heading. Mobile: the dock's place name (the Here tab has none to focus).
    void nextTick(() => (frame.isDesktop.value ? detailPanel.value?.focusTitle() : sheet.value?.focusName()));
  },
);

// A change of the shown region (a header chip, the mobile Regions list, an argument) that does not
// hold the selection selects your place when you stand in that region, else the region's start node.
watch(shownId, (region) => {
  if (region === null) return;
  const selected = map.selectedId.value;
  if (selected !== null && placeById.value.get(selected)?.regionId === region) return;
  const here = currentId.value;
  const start = here !== null && currentRegionId.value === region ? here : startIdFor(region);
  if (start === null) return;
  map.setBanner(null);
  map.select(start);
  scrollSelectedIntoView();
});

// A region chip chosen in the header (UI-SPEC Accessibility "Region chip chosen -> the graph group"):
// the selection scrolls into view and focus moves into the graph, also when the chosen region already
// held the selection or was already shown (review WR-05). Runs after the shownId watcher above, which
// is queued first by the same choice, so the new selection is in place.
watch(
  () => map.regionChosen.value,
  () => {
    if (!canShow.value) return;
    scrollSelectedIntoView();
    surface()?.focusCurrent();
  },
);

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
  <div v-if="frame.isDesktop.value" ref="root" class="map-screen">
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
          <div class="canvas-scroll">
            <GraphPlane
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
              @resize="graph.setCanvas"
            />
          </div>
          <div v-if="map.banner.value" class="arrival-banner" role="status">
            <PhFootprints class="banner-icon" :size="14" aria-hidden="true" />
            <span>{{ map.banner.value }}</span>
          </div>
          <button
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
  <div v-else ref="root" class="map-sheet-root">
    <SegTabs
      class="sheet-tabs"
      :tabs="SHEET_TABS"
      :model-value="sheetTab"
      label="Map sheet view"
      id-prefix="map-sheet"
      @update:model-value="sheetTab = $event"
    >
      <template v-if="sheetTab === 'map'">
        <EmptyState
          v-if="currentId === null"
          :icon="PhMapTrifold"
          title="No places discovered yet."
          body="Travel to a new place and it appears here."
        />
        <MapSheet
          v-else-if="map.ready.value && layout !== null"
          ref="sheet"
          :destination="destination"
          :graph="graph"
        />
      </template>
      <div v-else class="here-column">
        <ContextContent />
      </div>
    </SegTabs>
    <NoticeLine :rejection="destination.runner.rejection.value" />
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

/* The canvas: the radial accent glow over the page ground, tokens only. The plane scrolls inside it
   (the canvas-scroll area the plane measures); Center on you stays put. */
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

.canvas-scroll {
  position: absolute;
  inset: 0;
  overflow: auto;
}

@media (prefers-reduced-motion: no-preference) {
  .canvas-scroll {
    scroll-behavior: smooth;
  }
}

/* Top centre of the canvas. */
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

/* Mobile: the Map and Here tabs fill the sheet body; the notice line sits at the bottom. */
.map-sheet-root {
  height: 100%;
  min-height: 0;
  min-width: 0;
  display: flex;
  flex-direction: column;
}

.sheet-tabs :deep(.tablist) {
  margin-bottom: 8px;
}

.sheet-tabs :deep(.panel) {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.here-column {
  flex: none;
  display: flex;
  flex-direction: column;
  gap: 16px;
  min-width: 0;
}
</style>
