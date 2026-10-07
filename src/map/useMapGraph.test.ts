// @vitest-environment happy-dom
import { afterEach, describe, expect, it } from 'vitest';
import { computed, defineComponent, h, nextTick, ref } from 'vue';
import { mount, type VueWrapper } from '@vue/test-utils';
import { GAME_KEY, createInertGame } from '../game/context';
import type { GameData } from '../game/context';
import type { Location } from '../module_bindings/types';
import { regionStartId } from './graphLayout';
import { knownPlaces } from './knownPlaces';
import { MAP_KEY, createInertMap } from './mapContext';
import type { MapData } from './mapContext';
import { adjacencyOf } from './route';
import { useMapGraph } from './useMapGraph';
import type { MapGraph } from './useMapGraph';

const place = (id: bigint, name: string, regionId: bigint, over: Record<string, unknown> = {}): Location =>
  ({
    id,
    name,
    description: '',
    zone: '',
    regionId,
    levelOffset: 0n,
    isSafe: false,
    terrainType: 'woods',
    bindStone: false,
    craftingAvailable: false,
    ...over,
  }) as unknown as Location;

const links = (pairs: Array<[bigint, bigint]>) =>
  pairs.flatMap(([a, b]) => [
    { fromLocationId: a, toLocationId: b },
    { fromLocationId: b, toLocationId: a },
  ]);

let wrapper: VueWrapper | null = null;
afterEach(() => {
  wrapper?.unmount();
  wrapper = null;
});

function build(options: { mobile?: boolean } = {}) {
  const mobile = ref(options.mobile ?? false);
  const character = ref<Record<string, unknown>>({ id: 1n, locationId: 10n, level: 4n, stamina: 40n, boundLocationId: 0n });
  const locations = [
    place(10n, 'Ember Gate', 1n, { terrainType: 'town', isSafe: true }),
    place(11n, 'Gloamwood', 1n),
    place(12n, 'Ridge Walk', 1n),
    place(13n, 'Far Hollow', 1n),
    place(20n, 'Saltmarsh Gate', 2n, { bindStone: true }),
    place(21n, 'Reed Flats', 2n),
  ];
  // The hub's known places depend on the place id only (mapData, review WR-03); this fake never
  // reads the character row, so the test isolates the graph model's own inputs.
  const known = computed(() =>
    knownPlaces<Location>({
      visitedIds: [10n, 11n, 12n, 20n],
      currentLocationId: 10n,
      connections: links([
        [10n, 11n],
        [11n, 12n],
        [12n, 13n],
        [11n, 20n],
        [20n, 21n],
      ]),
      locations,
    }),
  );
  const map = {
    ...createInertMap(),
    ready: ref(true),
    known,
    adjacency: computed(() => adjacencyOf(known.value.edges)),
  } as unknown as MapData;
  const game = {
    ...createInertGame(),
    character,
    locations: ref(locations),
    regions: ref([
      { id: 1n, name: 'Ashfall Wilds', dangerMultiplier: 300n },
      { id: 2n, name: 'Saltmarsh', dangerMultiplier: 400n },
    ]),
  } as unknown as GameData;

  let graph: MapGraph | null = null;
  const Host = defineComponent({
    setup() {
      graph = useMapGraph(() => mobile.value);
      return () => h('div');
    },
  });
  wrapper = mount(Host, {
    global: { provide: { [GAME_KEY as symbol]: game, [MAP_KEY as symbol]: map } },
  });
  return { graph: graph as unknown as MapGraph, character, mobile, locations };
}

describe('useMapGraph (51-12)', () => {
  it('keeps the same layout object when the character row changes but the place does not (WR-03)', async () => {
    const { graph, character } = build();
    const before = graph.layout.value;
    expect(before).not.toBeNull();
    character.value = { ...character.value, stamina: 48n };
    await nextTick();
    expect(graph.layout.value).toBe(before);
  });

  it('lays the region out to fill the canvas, and ignores an equal size', async () => {
    const { graph } = build();
    expect(graph.canvas.value).toBeNull();
    graph.setCanvas({ width: 652, height: 600 });
    const filled = graph.layout.value;
    expect(filled).not.toBeNull();
    expect(filled!.width).toBeGreaterThanOrEqual(652);
    expect(filled!.height).toBeGreaterThanOrEqual(600);
    const canvasBefore = graph.canvas.value;
    graph.setCanvas({ width: 652, height: 600 });
    expect(graph.canvas.value).toBe(canvasBefore);
    expect(graph.layout.value).toBe(filled);
    graph.setCanvas(null);
    expect(graph.canvas.value).toBeNull();
    expect(graph.layout.value).not.toBe(filled);
  });

  it('uses the compact layout on mobile: no caption', () => {
    const desktop = build();
    expect(desktop.graph.layout.value?.caption).not.toBeNull();
    wrapper?.unmount();
    wrapper = null;
    const phone = build({ mobile: true });
    expect(phone.graph.layout.value?.caption).toBeNull();
  });

  it('startIdFor follows the start rule without a layout of that region', () => {
    const { graph, locations } = build();
    const asLayout = locations.map((l) => ({
      id: l.id,
      name: l.name,
      regionId: l.regionId,
      bindStone: l.bindStone,
      terrainType: l.terrainType,
    }));
    // region 2: the bind stone place (20) is drawn; region 1: the lowest id (10)
    expect(graph.startIdFor(2n)).toBe(20n);
    expect(graph.startIdFor(2n)).toBe(regionStartId(asLayout.filter((p) => p.id !== 21n), 2n));
    expect(graph.startIdFor(1n)).toBe(10n);
    expect(graph.startIdFor(9n)).toBeNull();
    expect(graph.layout.value?.regionId).toBe(1n);
  });
});
