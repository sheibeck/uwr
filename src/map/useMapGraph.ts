import { computed, inject } from 'vue';
import type { ComputedRef } from 'vue';
import { GAME_KEY, createInertGame } from '../game/context';
import { layoutGraph } from './graphLayout';
import type { GraphLayout, LayoutPlace } from './graphLayout';
import { MAP_KEY, createInertMap } from './mapContext';
import type { KnownPlacesResult } from './mapContext';
import { gateView, listRows, nodeViews, routePolylines } from './nodeView';
import type { GateView, ListRow, NodeView } from './nodeView';
import { regionChips } from './regionChips';
import type { RegionChip } from './regionChips';
import { shortestPath, stepsFrom } from './route';

// What the Map draws, as one set of computeds over the game rows and the map hub: the known places,
// the region on show, the layout, the node views, the list rows, the route and the region chips and
// gates. The desktop Map screen and the mobile Map sheet (plan 51-11) both read it, so the two
// layouts can never disagree about what is on the map. `mobile` only changes the gate pill text.

export interface MapGraph {
  currentId: ComputedRef<bigint | null>;
  playerLevel: ComputedRef<number>;
  placeById: ComputedRef<Map<bigint, KnownPlacesResult['drawn'][number]>>;
  drawnIds: ComputedRef<Set<bigint>>;
  currentRegionId: ComputedRef<bigint | null>;
  /** The region on show: the hub's pick when it is a known region, else the region you stand in. */
  shownId: ComputedRef<bigint | null>;
  layoutFor(regionId: bigint): GraphLayout;
  layout: ComputedRef<GraphLayout | null>;
  regionName: ComputedRef<string>;
  regionNameOf(id: bigint | null): string;
  views: ComputedRef<NodeView[]>;
  rows: ComputedRef<ListRow[]>;
  routes: ComputedRef<string[]>;
  chips: ComputedRef<RegionChip[]>;
  gates: ComputedRef<GateView[]>;
}

export function useMapGraph(mobile: () => boolean): MapGraph {
  const game = inject(GAME_KEY, createInertGame());
  const map = inject(MAP_KEY, createInertMap());

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
      return gateView(gate, chip, chip?.name ?? 'Unknown region', map.selfTimer.value, mobile());
    });
  });

  return {
    currentId,
    playerLevel,
    placeById,
    drawnIds,
    currentRegionId,
    shownId,
    layoutFor,
    layout,
    regionName,
    regionNameOf,
    views,
    rows,
    routes,
    chips,
    gates,
  };
}
