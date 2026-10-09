import { computed, inject, shallowRef } from 'vue';
import type { ComputedRef, ShallowRef } from 'vue';
import { GAME_KEY, createInertGame } from '../game/context';
import { layoutGraph, regionStartId } from './graphLayout';
import type { CanvasSize, GraphLayout, LayoutPlace } from './graphLayout';
import { MAP_KEY, createInertMap } from './mapContext';
import type { KnownPlacesResult } from './mapContext';
import { gateView, nodeViews, routePolylines } from './nodeView';
import type { GateView, MapRatingSource, NodeView } from './nodeView';
import { bossOrNamedAt } from '../rails/rating';
import { useRatingLevel } from '../rails/useExits';
import { regionChips } from './regionChips';
import type { RegionChip } from './regionChips';
import { shortestPath, stepsFrom } from './route';

// What the Map draws, as one set of computeds over the game rows and the map hub: the known places,
// the region on show, the layout, the node views, the route and the region chips and
// gates. The Map screen builds it once and hands the same object to the mobile Map sheet (the graph
// prop), so the two layouts can never disagree and mobile lays the graph out once (review WR-03).
// `mobile` selects the compact layout (112px spacing, 44px targets, no caption) and the gate pill
// text. The canvas is the plane's measured scroll area (setCanvas, from GraphPlane's resize), so the
// region fills it (51-12, MS-02); null lays out at the minimum spacing until the first measurement.
// The layout reads only primitive and stable inputs, so a character row update that keeps the place
// (the regen tick) does not lay the graph out again.
//
// The region rules (which region you stand in, which one is shown, the chips) are useShownRegion,
// which useMapGraph builds on. The header chips (MapMeta, rendered by the frame outside the Map
// screen) read useShownRegion too, so the chips and the graph cannot disagree about the shown region
// (review IN-01). It holds no layout, so the header never lays out a graph.
//
// The places are rated (51.3.1.1 D-08, D-42) from useMapRatingSource: the pool_level rows of the
// loaded regions, game.poolsAppliedFor, the party's lowest level standing with you (D-56) and the
// boss/named step (D-34), the same inputs the exit rows read. useMapGraph and useDestination each
// build it once; useShownRegion stays free of it (MapMeta reads only the chips).

export interface ShownRegion {
  currentId: ComputedRef<bigint | null>;
  playerLevel: ComputedRef<number>;
  placeById: ComputedRef<Map<bigint, KnownPlacesResult['drawn'][number]>>;
  drawnIds: ComputedRef<Set<bigint>>;
  currentRegionId: ComputedRef<bigint | null>;
  /** The region on show: the hub's pick when it is a known region, else the region you stand in. */
  shownId: ComputedRef<bigint | null>;
  chips: ComputedRef<RegionChip[]>;
}

export interface MapGraph extends ShownRegion {
  /** The measured canvas the layout fills; null until the plane has measured its scroll area. */
  canvas: Readonly<ShallowRef<CanvasSize | null>>;
  /** Sets the canvas; a size equal to the current one is ignored, null resets it. */
  setCanvas(size: CanvasSize | null): void;
  /** The region's start place (the start rule of the layout), without laying the region out. */
  startIdFor(regionId: bigint): bigint | null;
  layout: ComputedRef<GraphLayout | null>;
  regionName: ComputedRef<string>;
  regionNameOf(id: bigint | null): string;
  views: ComputedRef<NodeView[]>;
  routes: ComputedRef<string[]>;
  gates: ComputedRef<GateView[]>;
  /** The level the Map rates for (D-56, the party's lowest standing with you); the legend names it. */
  legendLevel: ComputedRef<number>;
}

/**
 * The rating source of the Map's nodes and the destination detail (51.3.1.1-31). useRatingLevel
 * is called once here, at setup; the closures read the reactive rows when nodeViews or buildDetail
 * call them inside their own computeds, so an applied region or a named enemy re-rates the places.
 */
export function useMapRatingSource(): ComputedRef<MapRatingSource> {
  const game = inject(GAME_KEY, createInertGame());
  const ratingLevel = useRatingLevel();
  return computed<MapRatingSource>(() => ({
    pools: game.poolLevels.value,
    poolsApplied: (id) => game.poolsAppliedFor(id),
    ratingLevel: ratingLevel.value,
    bossOrNamed: (id) =>
      bossOrNamedAt(id, game.namedEnemies.value, game.enemiesHere.value, game.enemyTemplatesHere.value),
  }));
}

export function useShownRegion(): ShownRegion {
  const game = inject(GAME_KEY, createInertGame());
  const map = inject(MAP_KEY, createInertMap());

  const currentId = computed<bigint | null>(() => {
    const id = game.character.value?.locationId ?? 0n;
    return id === 0n ? null : id;
  });
  const playerLevel = computed(() => Number(game.character.value?.level ?? 1n));
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

  const chips = computed(() =>
    regionChips({
      drawn: drawn.value,
      regions: game.regions.value,
      currentRegionId: currentRegionId.value,
      shownRegionId: shownId.value,
      playerLevel: playerLevel.value,
    }),
  );

  return { currentId, playerLevel, placeById, drawnIds, currentRegionId, shownId, chips };
}

export function useMapGraph(mobile: () => boolean): MapGraph {
  const game = inject(GAME_KEY, createInertGame());
  const map = inject(MAP_KEY, createInertMap());
  const { currentId, playerLevel, placeById, drawnIds, currentRegionId, shownId, chips } = useShownRegion();
  const rating = useMapRatingSource();
  const legendLevel = computed(() => {
    const level = rating.value.ratingLevel;
    return level === null ? playerLevel.value : Number(level);
  });

  const boundId = computed<bigint | null>(() => {
    const id = game.character.value?.boundLocationId ?? 0n;
    return id === 0n ? null : id;
  });
  const regions = computed(() => game.regions.value);
  const drawn = computed(() => map.known.value.drawn);

  function toLayoutPlace(location: (typeof drawn.value)[number]): LayoutPlace {
    return {
      id: location.id,
      name: location.name,
      regionId: location.regionId,
      bindStone: location.bindStone,
      terrainType: location.terrainType,
    };
  }

  const layoutPlaces = computed(() => drawn.value.map(toLayoutPlace));

  const canvas = shallowRef<CanvasSize | null>(null);
  function setCanvas(size: CanvasSize | null): void {
    const current = canvas.value;
    if (size === null) {
      canvas.value = null;
      return;
    }
    if (current !== null && current.width === size.width && current.height === size.height) return;
    canvas.value = { width: size.width, height: size.height };
  }

  function startIdFor(regionId: bigint): bigint | null {
    return regionStartId(layoutPlaces.value, regionId);
  }

  const layout = computed<GraphLayout | null>(() => {
    const regionId = shownId.value;
    if (regionId === null) return null;
    return layoutGraph({
      regionId,
      places: layoutPlaces.value,
      edges: map.known.value.edges,
      canvas: canvas.value,
      compact: mobile(),
    });
  });
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
      rating: rating.value,
    });
  });

  const routes = computed(() => {
    const current = layout.value;
    const from = currentId.value;
    const to = map.selectedId.value;
    if (current === null || from === null || to === null) return [];
    return routePolylines(current, shortestPath(map.adjacency.value, from, to));
  });

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
    canvas,
    setCanvas,
    startIdFor,
    layout,
    regionName,
    regionNameOf,
    views,
    routes,
    chips,
    gates,
    legendLevel,
  };
}
