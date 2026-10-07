// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { computed, nextTick, ref } from 'vue';
import { mount, type VueWrapper } from '@vue/test-utils';
import { PhDoorOpen } from '@phosphor-icons/vue';
import { FRAME_KEY, GAME_KEY, createInertFrame, createInertGame } from '../game/context';
import type { FrameControls, GameData } from '../game/context';
import type { Location } from '../module_bindings/types';
import { knownPlaces } from './knownPlaces';
import { MAP_KEY, createInertMap } from './mapContext';
import type { MapData } from './mapContext';
import MapScreen from './MapScreen.vue';
import { adjacencyOf } from './route';

// A passage (terrainType 'passage') is an explored edge with someone standing in it. When the server
// collapses it, the row and its connections go away and a direct cross-region connection appears.
// The map only redraws: no client logic depends on the collapse (51-CONTEXT).

const place = (id: bigint, name: string, regionId: bigint, over: Record<string, unknown> = {}): Location =>
  ({
    id,
    name,
    description: '',
    zone: '',
    regionId,
    levelOffset: 0n,
    isSafe: true,
    terrainType: 'town',
    bindStone: false,
    craftingAvailable: false,
    ...over,
  }) as unknown as Location;

const link = (a: bigint, b: bigint) => [
  { fromLocationId: a, toLocationId: b },
  { fromLocationId: b, toLocationId: a },
];

function harness() {
  const character = ref<Record<string, unknown> | null>({ id: 1n, locationId: 5n, level: 4n, boundLocationId: 0n });
  const locations = ref<Location[]>([
    place(5n, 'Ashfall Road', 1n),
    place(6n, 'Narrow Passage', 1n, { terrainType: 'passage' }),
    place(4097n, 'Saltmarsh Gate', 2n),
  ]);
  const visitedIds = ref<bigint[]>([5n, 6n]);
  const connections = ref([...link(5n, 6n), ...link(6n, 4097n)]);
  const selectedId = ref<bigint | null>(null);
  const shownRegionId = ref<bigint | null>(null);

  const known = computed(() =>
    knownPlaces<Location>({
      visitedIds: visitedIds.value,
      currentLocationId: 5n,
      connections: connections.value,
      locations: locations.value,
    }),
  );
  const select = vi.fn((id: bigint | null) => {
    selectedId.value = id;
  });
  const map = {
    ...createInertMap(),
    ready: ref(true),
    known,
    adjacency: computed(() => adjacencyOf(known.value.edges)),
    selectedId,
    shownRegionId,
    select,
    showRegion: (id: bigint | null) => {
      shownRegionId.value = id;
    },
  } as unknown as MapData;
  const game = {
    ...createInertGame(),
    character,
    locations,
    regions: ref([
      { id: 1n, name: 'Ashfall Wilds', dangerMultiplier: 300n },
      { id: 2n, name: 'Saltmarsh', dangerMultiplier: 400n },
    ]),
  } as unknown as GameData;
  const frame = { ...createInertFrame(), isDesktop: ref(true) } as unknown as FrameControls;

  return {
    map,
    game,
    frame,
    select,
    selectedId,
    /** The server collapses the passage: row and connections go, a direct link appears. */
    collapse() {
      locations.value = locations.value.filter((l) => l.id !== 6n);
      connections.value = link(5n, 4097n);
    },
  };
}

let wrapper: VueWrapper | null = null;
beforeEach(() => {
  Element.prototype.scrollIntoView = function () {};
});
afterEach(() => {
  wrapper?.unmount();
  wrapper = null;
  document.body.innerHTML = '';
});

async function mountScreen(h: ReturnType<typeof harness>): Promise<VueWrapper> {
  wrapper = mount(MapScreen, {
    attachTo: document.body,
    global: { provide: { [GAME_KEY as symbol]: h.game, [FRAME_KEY as symbol]: h.frame, [MAP_KEY as symbol]: h.map } },
  });
  await nextTick();
  await nextTick();
  return wrapper;
}

const ids = (w: VueWrapper): string[] => w.findAll('button.node').map((b) => b.attributes('data-node-id') as string);
const gateKeys = (w: VueWrapper): string[] => w.findAll('button.gate').map((b) => b.attributes('data-gate-key') as string);
const pathOf = (w: VueWrapper): string | undefined => w.find('path').attributes('d');
const doorPath = mount(PhDoorOpen, { props: { size: 12 } }).get('path').attributes('d');

describe('passage redraw rules', () => {
  it('draws a passage as one node with the open-door icon', async () => {
    const h = harness();
    const w = await mountScreen(h);
    expect(ids(w).sort()).toEqual(['4097', '5', '6']);
    const passage = w.get('button.node[data-node-id="6"]');
    expect(passage.classes()).toContain('passage');
    expect(passage.attributes('aria-label')).toContain('passage');
    expect(passage.get('path').attributes('d')).toBe(doorPath);
    expect(pathOf(w)).toBeDefined();
  });

  it('draws no passage node when no passage row exists', async () => {
    const h = harness();
    h.collapse();
    const w = await mountScreen(h);
    expect(ids(w)).not.toContain('6');
    expect(w.findAll('button.node.passage')).toHaveLength(0);
  });

  it('after the collapse the node is gone and the direct link is a gate pill', async () => {
    const h = harness();
    const w = await mountScreen(h);
    expect(gateKeys(w)).toEqual(['6-4097']);

    h.collapse();
    await nextTick();
    await nextTick();
    expect(ids(w).sort()).toEqual(['4097', '5']);
    expect(w.findAll('button.node.passage')).toHaveLength(0);
    expect(gateKeys(w)).toEqual(['5-4097']);
    expect(w.get('button.gate').text()).toContain('To Saltmarsh');
    // the crossing is drawn as a cross-region edge
    expect(w.findAll('line.edge.cross')).toHaveLength(1);
  });

  it('a selection that was on the passage moves to your place', async () => {
    const h = harness();
    const w = await mountScreen(h);
    await w.get('button.node[data-node-id="6"]').trigger('click');
    expect(h.selectedId.value).toBe(6n);

    h.select.mockClear();
    h.collapse();
    await nextTick();
    await nextTick();
    expect(h.select).toHaveBeenCalledWith(5n);
    expect(h.selectedId.value).toBe(5n);
    expect(w.get('button.node[data-node-id="5"]').attributes('aria-pressed')).toBe('true');
  });

  it('focus that was on the removed node moves to the groups current node', async () => {
    const h = harness();
    const w = await mountScreen(h);
    const node = w.get('button.node[data-node-id="6"]');
    await node.trigger('click');
    (node.element as HTMLElement).focus();
    expect((document.activeElement as HTMLElement).dataset.nodeId).toBe('6');

    h.collapse();
    await nextTick();
    await nextTick();
    await nextTick();
    const active = document.activeElement as HTMLElement;
    expect(active.dataset.nodeId).toBe('5');
    expect(active.getAttribute('tabindex')).toBe('0');
  });

  it('focus elsewhere is left alone when the selected place disappears', async () => {
    const h = harness();
    const w = await mountScreen(h);
    await w.get('button.node[data-node-id="6"]').trigger('click');
    const other = document.createElement('button');
    document.body.appendChild(other);
    other.focus();

    h.collapse();
    await nextTick();
    await nextTick();
    await nextTick();
    expect(document.activeElement).toBe(other);
  });
});
