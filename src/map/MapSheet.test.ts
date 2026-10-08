// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { computed, defineComponent, h, nextTick, ref } from 'vue';
import { mount, type VueWrapper } from '@vue/test-utils';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createFeedStore } from '../console/feedStore';
import { CONSOLE_KEY, GAME_KEY, createInertConsole, createInertGame } from '../game/context';
import type { GameData } from '../game/context';
import type { Location } from '../module_bindings/types';
import MapSheet from './MapSheet.vue';
import { knownPlaces } from './knownPlaces';
import { MAP_KEY, createInertMap } from './mapContext';
import type { MapData } from './mapContext';
import { adjacencyOf } from './route';
import { useDestination } from './useDestination';
import { useMapGraph } from './useMapGraph';
import type { MapGraph } from './useMapGraph';
import GraphPlane from './GraphPlane.vue';

const SOURCE = readFileSync(resolve(process.cwd(), 'src/map/MapSheet.vue'), 'utf8');
const XSS = '<img src=x onerror=alert(1)>';
const NOW = 1_000_000_000;
const CHARACTER = 1n;

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

interface Options {
  at?: bigint;
  selected?: bigint | null;
  stamina?: bigint;
  moveImpl?: () => Promise<void>;
  locations?: Location[];
  quests?: boolean;
  npcs?: Array<{ npcType: string; locationId: bigint }>;
  visited?: bigint[];
  /** The selected place's people subscriptions have applied (default true). */
  peopleApplied?: boolean;
}

let wrapper: VueWrapper | null = null;
afterEach(() => {
  wrapper?.unmount();
  wrapper = null;
  document.body.innerHTML = '';
});

function build(over: Options = {}) {
  const selectedApplied = ref(over.peopleApplied ?? true);
  const character = ref<Record<string, unknown>>({
    id: CHARACTER,
    name: 'Brannoch',
    locationId: over.at ?? 10n,
    level: 6n,
    stamina: over.stamina ?? 20n,
    boundLocationId: 0n,
    racialTravelCostIncrease: null,
    racialTravelCostDiscount: null,
  });
  const locations = ref<Location[]>(
    over.locations ?? [
      place(10n, 'Ember Gate', 1n, { terrainType: 'town', isSafe: true, bindStone: true }),
      place(11n, 'Gloamwood', 1n, { description: 'Pines lean over a narrow trail.', craftingAvailable: true }),
      place(12n, 'Ridge Walk', 1n, { terrainType: 'mountains' }),
      place(20n, 'Saltmarsh Gate', 2n, { description: 'Reeds hiss in the wind.' }),
      place(13n, 'Far Hollow', 1n),
    ],
  );
  const visitedIds = ref<bigint[]>(over.visited ?? [10n, 11n, 12n]);
  const connections = ref(links([[10n, 11n], [11n, 12n], [11n, 20n], [12n, 13n]]));
  const known = computed(() =>
    knownPlaces<Location>({
      visitedIds: visitedIds.value,
      currentLocationId: character.value.locationId as bigint,
      connections: connections.value,
      locations: locations.value,
    }),
  );
  const selectedId = ref<bigint | null>(over.selected === undefined ? null : over.selected);
  const select = vi.fn((id: bigint | null) => {
    selectedId.value = id;
  });
  const shownRegionId = ref<bigint | null>(null);
  const showRegion = vi.fn((id: bigint | null) => {
    shownRegionId.value = id;
  });
  const banner = ref<string | null>(null);
  const setBanner = vi.fn((text: string | null) => {
    banner.value = text;
  });
  const nowMicros = ref(NOW);
  const cooldowns = ref<Array<{ characterId: bigint; readyAtMicros: bigint }>>([]);
  const connected = ref(true);
  const gathers = ref<unknown[]>([]);
  const feed = createFeedStore();
  feed.setCharacter(CHARACTER);

  let release: () => void = () => {};
  const moveCharacter = vi.fn(
    over.moveImpl ??
      (() =>
        new Promise<void>((done) => {
          release = done;
        })),
  );
  const travelSpy = vi.fn();

  const questRows = over.quests
    ? [
        {
          id: 1n,
          characterId: CHARACTER,
          questTemplateId: 5n,
          progress: 1n,
          completed: false,
          acceptedAt: { microsSinceUnixEpoch: 1n },
          completedAt: null,
        },
      ]
    : [];
  const questTemplates = over.quests
    ? [{ id: 5n, name: XSS, requiredCount: 3n, description: '', npcId: 99n, targetLocationId: 11n, sourceLocationId: null }]
    : [];

  const map = {
    ...createInertMap(),
    ready: ref(true),
    known,
    adjacency: computed(() => adjacencyOf(known.value.edges)),
    cooldowns,
    nowMicros,
    selfTimer: computed(() => {
      const row = cooldowns.value.find((c) => c.characterId === CHARACTER);
      const left = row ? Number(row.readyAtMicros) - nowMicros.value : 0;
      return left > 0 ? { running: true, secondsLeft: Math.ceil(left / 1_000_000) } : { running: false, secondsLeft: 0 };
    }),
    selectedId,
    select,
    shownRegionId,
    showRegion,
    banner,
    setBanner,
    npcsAtSelected: ref(over.npcs ?? []),
    selectedApplied,
  } as unknown as MapData;

  const game = {
    ...createInertGame(),
    connected,
    character,
    locations,
    regions: ref([
      { id: 1n, name: 'Ashfall Wilds', dangerMultiplier: 300n },
      { id: 2n, name: 'Saltmarsh', dangerMultiplier: 400n },
    ]),
    gathers,
    quests: ref(questRows),
    questTemplates: ref(questTemplates),
    feed,
    reducers: computed(() => (connected.value ? { moveCharacter } : null)),
  } as unknown as GameData;

  // The Map screen builds the one graph model and passes it to the sheet with the destination.
  let graph: MapGraph | null = null;
  const Host = defineComponent({
    setup(_, { expose }) {
      const destination = useDestination();
      graph = useMapGraph(() => true);
      const sheet = ref<InstanceType<typeof MapSheet> | null>(null);
      expose({ sheet });
      return () => h(MapSheet, { ref: sheet, destination, graph: graph as MapGraph });
    },
  });

  wrapper = mount(Host, {
    attachTo: document.body,
    global: {
      provide: {
        [GAME_KEY as symbol]: game,
        [MAP_KEY as symbol]: map,
        [CONSOLE_KEY as symbol]: { ...createInertConsole(), travel: travelSpy },
      },
    },
  });

  let nextFeed = 1n;
  function systemLine(message: string): void {
    feed.ingest('private', {
      id: nextFeed,
      kind: 'system',
      message,
      createdAt: { microsSinceUnixEpoch: nextFeed * 10n },
      characterId: CHARACTER,
    } as never);
    nextFeed += 1n;
    feed.flush();
  }

  return {
    w: wrapper,
    graph: graph as unknown as MapGraph,
    game,
    map,
    character,
    select,
    showRegion,
    shownRegionId,
    banner,
    selectedId,
    nowMicros,
    cooldowns,
    connected,
    gathers,
    moveCharacter,
    travelSpy,
    systemLine,
    resolveMove: () => release(),
  };
}



const regionsButton = (w: VueWrapper) => w.get('button.regions-button');
const legendButton = (w: VueWrapper) => w.get('button.legend-toggle');

describe('MapSheet: the arrival banner', () => {
  it('has a 44px Dismiss button that clears the banner', async () => {
    const h = build();
    h.map.setBanner('Arrived at Ember Gate.');
    await nextTick();
    const close = h.w.get('.arrival-banner button.banner-close');
    expect(close.attributes('aria-label')).toBe('Dismiss');
    await close.trigger('click');
    expect(h.banner.value).toBeNull();
  });
});

describe('MapSheet: the region row', () => {
  it('shows the region name, its level in the band colour, a Regions button and the compact pill', () => {
    const { w } = build({ selected: 11n });
    const row = w.get('.region-row');
    expect(row.get('.region-name').text()).toBe('Ashfall Wilds');
    const level = row.get('.region-level');
    expect(level.text()).toMatch(/^Lv \d/);
    expect(level.attributes('style')).toContain('var(--color-');
    expect(regionsButton(w).text()).toBe('Regions');
    expect(regionsButton(w).attributes('aria-expanded')).toBe('false');
    expect(regionsButton(w).attributes('aria-haspopup')).toBe('listbox');
    expect(row.get('.pill').text()).toBe('Ready');
  });

  it('shows the time in the pill while the region timer runs', async () => {
    const { w, cooldowns } = build({ selected: 11n });
    cooldowns.value = [{ characterId: CHARACTER, readyAtMicros: BigInt(NOW + 192_000_000) }];
    await nextTick();
    expect(w.get('.region-row .pill .pill-text').text()).toBe('3:12');
  });
});

describe('MapSheet: the Regions listbox', () => {
  it('opens inline with one option per known region and closes when one is chosen', async () => {
    const { w, showRegion, shownRegionId } = build({ selected: 11n });
    expect(w.find('[role="listbox"]').exists()).toBe(false);
    await regionsButton(w).trigger('click');
    expect(regionsButton(w).attributes('aria-expanded')).toBe('true');
    const options = w.findAll('[role="option"]');
    expect(options.map((o) => o.get('.option-name').text())).toEqual(['Ashfall Wilds', 'Saltmarsh']);
    await options[1].trigger('click');
    await nextTick();
    expect(showRegion).toHaveBeenCalledWith(2n);
    expect(shownRegionId.value).toBe(2n);
    expect(w.find('[role="listbox"]').exists()).toBe(false);
    expect(regionsButton(w).attributes('aria-expanded')).toBe('false');
    expect(document.activeElement).toBe(regionsButton(w).element);
    expect(w.get('.region-name').text()).toBe('Saltmarsh');
  });

  it('Escape closes the listbox and returns focus to the Regions button', async () => {
    const { w } = build({ selected: 11n });
    await regionsButton(w).trigger('click');
    await nextTick();
    const shown = w.get('[role="option"][aria-selected="true"]');
    expect(document.activeElement).toBe(shown.element);
    await shown.trigger('keydown', { key: 'Escape' });
    await nextTick();
    expect(w.find('[role="listbox"]').exists()).toBe(false);
    expect(document.activeElement).toBe(regionsButton(w).element);
  });

  it('shows the lock and the time on the other regions while the timer runs', async () => {
    const { w, cooldowns } = build({ selected: 11n });
    cooldowns.value = [{ characterId: CHARACTER, readyAtMicros: BigInt(NOW + 192_000_000) }];
    await nextTick();
    await regionsButton(w).trigger('click');
    const options = w.findAll('[role="option"]');
    expect(options[0].find('.option-clock').exists()).toBe(false);
    expect(options[1].get('.option-clock').text()).toBe('3:12');
  });
});

describe('MapSheet: the Legend disclosure', () => {
  it('is closed to start and expands the legend inline', async () => {
    const { w } = build({ selected: 11n });
    expect(legendButton(w).text()).toBe('Legend');
    expect(legendButton(w).attributes('aria-expanded')).toBe('false');
    expect(w.find('.legend').exists()).toBe(false);
    await legendButton(w).trigger('click');
    expect(legendButton(w).attributes('aria-expanded')).toBe('true');
    expect(w.get('.legend').text()).toContain('Danger vs Lv 6:');
    const disclosure = legendButton(w).element;
    expect(disclosure.compareDocumentPosition(w.get('.legend').element) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    await legendButton(w).trigger('click');
    expect(w.find('.legend').exists()).toBe(false);
  });
});

describe('MapSheet: the canvas and the dock', () => {
  it('stacks region row, Legend, canvas and dock in order', () => {
    const { w } = build({ selected: 11n });
    const order = [
      w.get('.region-row').element,
      legendButton(w).element,
      w.get('.graph-plane').element,
      w.get('.dock').element,
    ];
    for (let i = 1; i < order.length; i += 1) {
      expect(order[i - 1].compareDocumentPosition(order[i]) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    }
  });

  it('draws the plane with 44px mobile hit boxes and mobile labels', () => {
    const { w } = build({ selected: 11n });
    const node = w.get('button.node[data-node-id="11"]');
    expect(node.attributes('style')).toContain('width: 44px');
    expect(node.attributes('style')).toContain('height: 44px');
    expect(w.get('.label[data-node-id="11"]').classes()).toContain('mobile');
    expect(w.get('button.center-button').attributes('aria-label')).toBe('Center on you');
  });

  it('choosing a node selects it and the dock follows', async () => {
    const { w, select } = build({ selected: 11n });
    await w.get('button.node[data-node-id="12"]').trigger('click');
    await nextTick();
    expect(select).toHaveBeenCalledWith(12n);
    expect(w.get('.dock-name').text()).toBe('Ridge Walk');
  });

  it('the canvas is the graph only: no view switch, no list, Center on you always there', () => {
    const { w } = build({ selected: 11n });
    expect(w.find('[role="tablist"]').exists()).toBe(false);
    expect(w.find('[role="tab"]').exists()).toBe(false);
    expect(w.find('[aria-label="Map view"]').exists()).toBe(false);
    expect(w.find('.graph-list').exists()).toBe(false);
    expect(w.find('.graph-plane').exists()).toBe(true);
    expect(w.find('button.center-button').exists()).toBe(true);
  });

  it('every drawn place is a keyboard-reachable button with its full spoken label', () => {
    const { w } = build({ selected: 11n });
    const nodes = w.findAll('button.node');
    expect(nodes.length).toBeGreaterThan(0);
    expect(nodes.filter((n) => n.attributes('tabindex') === '0')).toHaveLength(1);
    for (const node of nodes) {
      expect(node.attributes('aria-label') ?? '').toMatch(/, (here|visited|heard of)/);
    }
  });

  it('the dock Travel runs the shared runner once', async () => {
    const { w, moveCharacter } = build({ selected: 11n });
    await w.get('button.travel-button').trigger('click');
    expect(moveCharacter).toHaveBeenCalledWith({ characterId: 1n, locationId: 11n });
  });

  it('exposes focusName for the arrival focus', () => {
    const { w } = build({ selected: 11n });
    const sheet = (w.vm as unknown as { sheet: { focusName(): void } }).sheet;
    sheet.focusName();
    expect(document.activeElement).toBe(w.get('.dock-name').element);
  });
});

describe('MapSheet: safety and layout', () => {
  it('renders a hostile region name as text', () => {
    const { w, game } = build({ selected: 11n });
    (game.regions as unknown as { value: unknown[] }).value = [
      { id: 1n, name: XSS, dangerMultiplier: 300n },
      { id: 2n, name: 'Saltmarsh', dangerMultiplier: 400n },
    ];
    return nextTick().then(() => {
      expect(w.find('img').exists()).toBe(false);
      expect(w.get('.region-name').text()).toBe(XSS);
    });
  });

  it('source: the canvas keeps 240px, the row and buttons reach 44px, and the guards hold', () => {
    expect(SOURCE).toMatch(/min-height: 240px/);
    expect(SOURCE).toMatch(/\.regions-button,\s*\.legend-toggle \{[^}]*min-height: 44px;/);
    expect(SOURCE).toMatch(/\.center-button \{[^}]*width: 44px;[^}]*height: 44px;/);
    expect(SOURCE).toMatch(/\.region-row \{[^}]*padding: 0 0 8px;/);
    expect(SOURCE).toContain('Legend');
    expect(SOURCE).toContain('destination');
    expect(SOURCE).not.toContain('v-html');
    expect(SOURCE).not.toMatch(/<svg/);
    expect(SOURCE).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
  });
});

describe('MapSheet: the shared graph (plan 51-12)', () => {
  it('renders from the graph prop and feeds its plane size to graph.setCanvas', async () => {
    const { w, graph } = build({ selected: 11n });
    expect(w.findComponent(MapSheet).props('graph')).toBe(graph);
    expect(graph.canvas.value).toBeNull();
    w.findComponent(GraphPlane).vm.$emit('resize', { width: 700, height: 500 });
    await nextTick();
    expect(graph.canvas.value).toEqual({ width: 700, height: 500 });
    expect(w.get('.graph-plane').attributes('style')).toContain('width: 700px');
    expect(graph.layout.value?.caption).toBeNull();
  });

  it('source: takes the graph as a prop and never builds its own', () => {
    expect(SOURCE).not.toContain('useMapGraph(');
    expect(SOURCE).toContain('graph: MapGraph');
    expect(SOURCE).toContain('@resize="props.graph.setCanvas"');
  });
});
