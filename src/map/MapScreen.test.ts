// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { computed, nextTick, ref } from 'vue';
import { mount, type VueWrapper } from '@vue/test-utils';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { FRAME_KEY, GAME_KEY, createInertFrame, createInertGame } from '../game/context';
import type { FrameControls, GameData, ScreenArgs } from '../game/context';
import type { Location } from '../module_bindings/types';
import GraphList from './GraphList.vue';
import GraphPlane from './GraphPlane.vue';
import { knownPlaces } from './knownPlaces';
import { MAP_KEY, createInertMap } from './mapContext';
import type { MapData, MapView } from './mapContext';
import MapScreen from './MapScreen.vue';
import MapSheet from './MapSheet.vue';
import { adjacencyOf } from './route';
import type { TravelTimer } from './travelTimer';

const XSS = '<img src=x onerror=alert(1)>';
const SOURCE = readFileSync(resolve(process.cwd(), 'src/map/MapScreen.vue'), 'utf8');

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

const LOCATIONS = (): Location[] => [
  place(10n, 'Ember Gate', 1n, { terrainType: 'town', isSafe: true, bindStone: true }),
  place(11n, 'Gloamwood', 1n),
  place(12n, 'Ridge Walk', 1n, { terrainType: 'mountains' }),
  place(20n, 'Saltmarsh Gate', 2n),
];
const REGIONS = [
  { id: 1n, name: 'Ashfall Wilds', dangerMultiplier: 300n },
  { id: 2n, name: 'Saltmarsh', dangerMultiplier: 400n },
];
const links = (pairs: Array<[bigint, bigint]>) =>
  pairs.flatMap(([a, b]) => [
    { fromLocationId: a, toLocationId: b },
    { fromLocationId: b, toLocationId: a },
  ]);

interface Harness {
  map: MapData;
  game: GameData;
  frame: FrameControls;
  select: ReturnType<typeof vi.fn>;
  showRegion: ReturnType<typeof vi.fn>;
  setView: ReturnType<typeof vi.fn>;
  setBanner: ReturnType<typeof vi.fn>;
  banner: ReturnType<typeof ref<string | null>>;
  character: ReturnType<typeof ref<Record<string, unknown> | null>>;
  ready: ReturnType<typeof ref<boolean>>;
  view: ReturnType<typeof ref<MapView>>;
  selectedId: ReturnType<typeof ref<bigint | null>>;
  shownRegionId: ReturnType<typeof ref<bigint | null>>;
  timer: ReturnType<typeof ref<TravelTimer>>;
  screenArgs: ReturnType<typeof ref<ScreenArgs | null>>;
  isDesktop: ReturnType<typeof ref<boolean>>;
  locations: ReturnType<typeof ref<Location[]>>;
}

function harness(over: { args?: ScreenArgs | null; locationId?: bigint; locations?: Location[]; desktop?: boolean } = {}): Harness {
  const character = ref<Record<string, unknown> | null>({
    id: 1n,
    name: 'Brannoch',
    locationId: over.locationId ?? 10n,
    level: 6n,
    boundLocationId: 0n,
  });
  const locations = ref<Location[]>(over.locations ?? LOCATIONS());
  const visitedIds = ref<bigint[]>([10n, 11n]);
  const connections = ref(links([[10n, 11n], [11n, 12n], [11n, 20n]]));
  const ready = ref(true);
  const view = ref<MapView>('graph');
  const selectedId = ref<bigint | null>(null);
  const shownRegionId = ref<bigint | null>(null);
  const timer = ref<TravelTimer>({ running: false, secondsLeft: 0 });
  const screenArgs = ref<ScreenArgs | null>(over.args ?? null);
  const isDesktop = ref(over.desktop ?? true);
  const banner = ref<string | null>(null);

  const known = computed(() => {
    const here = (character.value?.locationId as bigint | undefined) ?? 0n;
    return knownPlaces<Location>({
      visitedIds: visitedIds.value,
      currentLocationId: here === 0n ? null : here,
      connections: connections.value,
      locations: locations.value,
    });
  });
  const adjacency = computed(() => adjacencyOf(known.value.edges));
  const select = vi.fn((id: bigint | null) => {
    selectedId.value = id;
  });
  const showRegion = vi.fn((id: bigint | null) => {
    shownRegionId.value = id;
  });
  const setView = vi.fn((next: MapView) => {
    view.value = next;
  });
  const setBanner = vi.fn((text: string | null) => {
    banner.value = text;
  });
  const regionChosen = ref(0);
  const chooseRegion = vi.fn((id: bigint) => {
    shownRegionId.value = id;
    regionChosen.value += 1;
  });

  const map = {
    ...createInertMap(),
    ready,
    known,
    adjacency,
    selfTimer: timer,
    selectedId,
    shownRegionId,
    view,
    banner,
    select,
    showRegion,
    chooseRegion,
    regionChosen,
    setView,
    setBanner,
  } as unknown as MapData;

  const game = {
    ...createInertGame(),
    character,
    locations,
    regions: ref(REGIONS),
  } as unknown as GameData;
  const frame = { ...createInertFrame(), isDesktop, screenArgs } as unknown as FrameControls;
  return { map, game, frame, select, showRegion, setView, setBanner, banner, character, ready, view, selectedId, shownRegionId, timer, screenArgs, isDesktop, locations };
}

let wrapper: VueWrapper | null = null;
const scrolled: HTMLElement[] = [];
const originalScroll = Element.prototype.scrollIntoView;

beforeEach(() => {
  scrolled.length = 0;
  Element.prototype.scrollIntoView = function (this: Element) {
    scrolled.push(this as HTMLElement);
  };
});

afterEach(() => {
  wrapper?.unmount();
  wrapper = null;
  document.body.innerHTML = '';
  Element.prototype.scrollIntoView = originalScroll;
});

async function mountScreen(h: Harness): Promise<VueWrapper> {
  wrapper = mount(MapScreen, {
    attachTo: document.body,
    global: { provide: { [GAME_KEY as symbol]: h.game, [FRAME_KEY as symbol]: h.frame, [MAP_KEY as symbol]: h.map } },
  });
  await nextTick();
  await nextTick();
  return wrapper;
}

const nodeIds = (w: VueWrapper): string[] => w.findAll('button.node').map((b) => b.attributes('data-node-id') as string);

describe('MapScreen: loading and empty', () => {
  it('renders nothing but an empty root until the map data has applied', async () => {
    const h = harness();
    h.ready.value = false;
    const w = await mountScreen(h);
    expect(w.element.children).toHaveLength(0);
    expect(w.text()).toBe('');
    expect(h.select).not.toHaveBeenCalled();
    h.ready.value = true;
    await nextTick();
    await nextTick();
    expect(w.find('.legend').exists()).toBe(true);
    expect(h.select).toHaveBeenCalledWith(10n);
  });

  it('shows the empty state for a character with no location', async () => {
    const h = harness({ locationId: 0n });
    const w = await mountScreen(h);
    expect(w.text()).toContain('No places discovered yet.');
    expect(w.text()).toContain('Travel to a new place and it appears here.');
    expect(w.find('.legend').exists()).toBe(false);
    expect(w.find('svg[aria-hidden="true"]').exists()).toBe(true);
  });

  it('shows the empty state with no character even while the hub is not ready', async () => {
    const h = harness();
    h.character.value = null;
    h.ready.value = false;
    const w = await mountScreen(h);
    expect(w.text()).toContain('No places discovered yet.');
  });

  it('mounts bare against the inert providers with the empty state', () => {
    wrapper = mount(MapScreen);
    expect(wrapper.text()).toContain('No places discovered yet.');
  });
});

describe('MapScreen: screen arguments', () => {
  it('with no arguments shows your region with your place selected', async () => {
    const h = harness();
    await mountScreen(h);
    expect(h.showRegion).toHaveBeenCalledWith(1n);
    expect(h.select).toHaveBeenCalledWith(10n);
    expect(h.selectedId.value).toBe(10n);
  });

  it('locationId selects that place and shows its region', async () => {
    const h = harness({ args: { locationId: 20n } });
    await mountScreen(h);
    expect(h.select).toHaveBeenCalledWith(20n);
    expect(h.showRegion).toHaveBeenCalledWith(2n);
    expect(h.select).not.toHaveBeenCalledWith(10n);
  });

  it('locationId of a place in your own region keeps that region', async () => {
    const h = harness({ args: { locationId: 12n } });
    await mountScreen(h);
    expect(h.showRegion).toHaveBeenCalledWith(1n);
    expect(h.select).toHaveBeenCalledWith(12n);
  });

  it("regionId shows that region with its start node selected", async () => {
    const h = harness({ args: { regionId: 2n } });
    await mountScreen(h);
    expect(h.showRegion).toHaveBeenCalledWith(2n);
    expect(h.select).toHaveBeenCalledWith(20n);
  });

  it('regionId of the region you stand in selects your place', async () => {
    const h = harness({ args: { regionId: 1n } });
    await mountScreen(h);
    expect(h.showRegion).toHaveBeenCalledWith(1n);
    expect(h.select).toHaveBeenCalledWith(10n);
  });

  it('an unknown location or region falls back to your place and region', async () => {
    const a = harness({ args: { locationId: 999n } });
    await mountScreen(a);
    expect(a.showRegion).toHaveBeenCalledWith(1n);
    expect(a.select).toHaveBeenCalledWith(10n);
    wrapper?.unmount();
    wrapper = null;

    const b = harness({ args: { regionId: 77n } });
    await mountScreen(b);
    expect(b.showRegion).toHaveBeenCalledWith(1n);
    expect(b.select).toHaveBeenCalledWith(10n);
  });

  it('a place that is known only as a row but not drawn is not selectable through arguments', async () => {
    // 21 exists as a location but nothing connects it to a visited place
    const h = harness({ args: { locationId: 21n }, locations: [...LOCATIONS(), place(21n, 'Unseen', 2n)] });
    await mountScreen(h);
    expect(h.select).toHaveBeenCalledWith(10n);
    expect(h.select).not.toHaveBeenCalledWith(21n);
  });

  it('arguments that arrive while the Map is open are applied', async () => {
    const h = harness();
    await mountScreen(h);
    h.screenArgs.value = { locationId: 20n };
    await nextTick();
    await nextTick();
    expect(h.selectedId.value).toBe(20n);
    expect(h.shownRegionId.value).toBe(2n);
  });

  it('scrolls the selected node into view once on open', async () => {
    const h = harness({ args: { locationId: 12n } });
    await mountScreen(h);
    expect(scrolled.map((el) => el.dataset.nodeId)).toEqual(['12']);
  });

  it('clears the selection on unmount so the place subscriptions stop', async () => {
    const h = harness();
    await mountScreen(h);
    h.select.mockClear();
    wrapper?.unmount();
    wrapper = null;
    expect(h.select).toHaveBeenCalledWith(null);
  });
});

describe('MapScreen: graph and list', () => {
  it('draws the shown region nodes plus its border node, and the legend above the canvas', async () => {
    const h = harness();
    const w = await mountScreen(h);
    expect(nodeIds(w).sort()).toEqual(['10', '11', '12', '20']);
    expect(w.get('[role="group"]').attributes('aria-label')).toBe('Ashfall Wilds route graph');
    expect(w.get('.caption').text()).toBe('Ashfall Wilds');
    expect(w.get('.danger-label').text()).toBe('Danger vs Lv 6:');
    const legend = w.get('.legend').element;
    const canvas = w.get('.canvas').element;
    expect(legend.compareDocumentPosition(canvas) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(canvas.contains(legend)).toBe(false);
  });

  it('marks the selected place and your place', async () => {
    const h = harness({ args: { locationId: 12n } });
    const w = await mountScreen(h);
    expect(w.get('button.node[data-node-id="12"]').attributes('aria-pressed')).toBe('true');
    expect(w.get('button.node[data-node-id="10"]').attributes('aria-label')).toContain('you are here');
  });

  it("draws another region's graph when it is shown", async () => {
    const h = harness({ args: { regionId: 2n } });
    const w = await mountScreen(h);
    expect(w.get('[role="group"]').attributes('aria-label')).toBe('Saltmarsh route graph');
    expect(nodeIds(w).sort()).toEqual(['11', '20']);
  });

  it('draws the route to the selected place', async () => {
    const h = harness({ args: { locationId: 12n } });
    const w = await mountScreen(h);
    expect(w.findAll('polyline.route').length).toBe(1);
    expect(w.get('polyline.route').attributes('points')?.split(' ').length).toBe(3);
  });

  it('the canvas holds the Map view tablist and Center on you', async () => {
    const h = harness();
    const w = await mountScreen(h);
    const canvas = w.get('.canvas');
    const tablist = canvas.get('[role="tablist"]');
    expect(tablist.attributes('aria-label')).toBe('Map view');
    expect(tablist.findAll('[role="tab"]').map((t) => t.text())).toEqual(['Graph', 'List']);
    expect(tablist.get('[aria-selected="true"]').text()).toBe('Graph');
    expect(canvas.find('button[aria-label="Center on you"]').exists()).toBe(true);
  });

  it('switching to List renders GraphList with the same nodes and selecting a row calls select', async () => {
    const h = harness();
    const w = await mountScreen(h);
    const listTab = w.findAll('[role="tab"]').find((t) => t.text() === 'List');
    await listTab!.trigger('click');
    await nextTick();
    expect(h.setView).toHaveBeenCalledWith('list');
    const list = w.findComponent(GraphList);
    expect(list.exists()).toBe(true);
    expect(w.find('.graph-plane').exists()).toBe(false);
    expect(w.find('button[aria-label="Center on you"]').exists()).toBe(false);
    const rows = list.findAll('li button');
    expect(rows.map((r) => r.get('.name').text()).sort()).toEqual(
      ['Ember Gate', 'Gloamwood', 'Ridge Walk', 'Saltmarsh Gate'].sort(),
    );
    h.select.mockClear();
    await rows.find((r) => r.get('.name').text() === 'Ridge Walk')!.trigger('click');
    expect(h.select).toHaveBeenCalledWith(12n);
    // the same node is selected in the graph and in the list
    await nextTick();
    const selectedRow = list.findAll('li button').find((r) => r.attributes('aria-pressed') === 'true');
    expect(selectedRow?.get('.name').text()).toBe('Ridge Walk');
  });

  it('the list rows name the steps and the connections of each place', async () => {
    const h = harness();
    h.view.value = 'list';
    const w = await mountScreen(h);
    const here = w.findAll('li button').find((r) => r.get('.name').text() === 'Ember Gate');
    expect(here?.get('.steps').text()).toBe('Here');
    expect(here?.get('.connects').text()).toBe('Connects to Gloamwood');
    const wood = w.findAll('li button').find((r) => r.get('.name').text() === 'Gloamwood');
    expect(wood?.get('.connects').text()).toBe('Connects to Ember Gate, Ridge Walk, Saltmarsh Gate (Saltmarsh)');
  });

  it('selecting a node in the graph calls select', async () => {
    const h = harness();
    const w = await mountScreen(h);
    h.select.mockClear();
    await w.get('button.node[data-node-id="11"]').trigger('click');
    expect(h.select).toHaveBeenCalledWith(11n);
  });
});

describe('MapScreen: gates', () => {
  it('the gate pill of a crossing selects the far node', async () => {
    const h = harness();
    const w = await mountScreen(h);
    const gate = w.get('button.gate');
    expect(gate.text()).toContain('To Saltmarsh');
    h.select.mockClear();
    await gate.trigger('click');
    expect(h.select).toHaveBeenCalledWith(20n);
    await nextTick();
    expect(w.get('button.gate').classes()).toContain('selected');
  });

  it('while the region timer runs (192 s) the gate shows a lock and 3:12 and no Lv', async () => {
    const h = harness();
    h.timer.value = { running: true, secondsLeft: 192 };
    const w = await mountScreen(h);
    const gate = w.get('button.gate');
    expect(gate.classes()).toContain('locked');
    expect(gate.find('.gate-lock').exists()).toBe(true);
    expect(gate.text()).toContain('3:12');
    expect(gate.text()).not.toContain('Lv');
    h.select.mockClear();
    await gate.trigger('click');
    expect(h.select).toHaveBeenCalledWith(20n);
  });
});

describe('MapScreen: Center on you', () => {
  it('scrolls your place to the middle and leaves the selection alone', async () => {
    const h = harness({ args: { locationId: 12n } });
    const w = await mountScreen(h);
    scrolled.length = 0;
    h.select.mockClear();
    await w.get('button[aria-label="Center on you"]').trigger('click');
    expect(scrolled.map((el) => el.dataset.nodeId)).toEqual(['10']);
    expect(h.select).not.toHaveBeenCalled();
    expect(h.selectedId.value).toBe(12n);
  });

  it('scrolls the start node when you are in another region than the one shown', async () => {
    const h = harness({ args: { regionId: 2n } });
    const w = await mountScreen(h);
    scrolled.length = 0;
    await w.get('button[aria-label="Center on you"]').trigger('click');
    expect(scrolled.map((el) => el.dataset.nodeId)).toEqual(['20']);
  });
});

describe('MapScreen: detail column', () => {
  it('shows the detail of the selection beside the canvas, with the docked Travel button', async () => {
    const h = harness({ args: { locationId: 11n } });
    const w = await mountScreen(h);
    const column = w.get('.detail-column');
    expect(column.get('h4').text()).toBe('Gloamwood');
    expect(column.get('button.travel-button').text()).toBe('Travel to Gloamwood');
    expect(column.element.contains(w.get('.canvas').element)).toBe(false);
    const body = w.get('.map-body').element;
    expect(body.contains(w.get('.legend').element)).toBe(true);
    expect(body.contains(column.element)).toBe(true);
  });

  it('the detail follows the selection and falls back to your place', async () => {
    const h = harness();
    const w = await mountScreen(h);
    expect(w.get('.detail-column h4').text()).toBe('Ember Gate');
    expect(w.get('.detail-column .kicker').text()).toBe('You are here');
    await w.get('button.node[data-node-id="12"]').trigger('click');
    await nextTick();
    expect(w.get('.detail-column h4').text()).toBe('Ridge Walk');
    expect(w.get('.detail-column .kicker').text()).toBe('Destination');
  });

  it('a gate selection shows the far place detail with the Region crossing block', async () => {
    const h = harness({ locationId: 11n });
    const w = await mountScreen(h);
    await w.get('button.gate').trigger('click');
    await nextTick();
    expect(w.get('.detail-column h4').text()).toBe('Saltmarsh Gate');
    expect(w.get('.detail-column .crossing').text()).toContain('Region crossing');
    expect(w.get('.detail-column button.travel-button').text()).toBe('Cross into Saltmarsh');
  });

  it('source: 304px beside the canvas from 1200px, 256px from 900 to 1199px', () => {
    expect(SOURCE).toMatch(/grid-template-columns:\s*minmax\(0,\s*1fr\)\s*256px/);
    expect(SOURCE).toMatch(/@media\s*\(min-width:\s*1200px\)\s*\{\s*\.map-body\s*\{\s*grid-template-columns:\s*minmax\(0,\s*1fr\)\s*304px/);
    expect(SOURCE).toMatch(/column-gap:\s*24px/);
    expect(SOURCE).toContain('useDestination()');
    expect(SOURCE).toContain('Crossed into');
    expect(SOURCE).toContain('Arrived at');
  });
});

describe('MapScreen: the arrival banner box', () => {
  it('sits at the canvas top centre as a status with tokens only', () => {
    expect(SOURCE).toMatch(/\.arrival-banner\s*\{[^}]*position:\s*absolute/);
    expect(SOURCE).toMatch(/\.arrival-banner\s*\{[^}]*top:\s*16px/);
    expect(SOURCE).toMatch(/\.arrival-banner\s*\{[^}]*padding:\s*8px 16px/);
    expect(SOURCE).toMatch(/\.arrival-banner\s*\{[^}]*var\(--shadow-md\)/);
    expect(SOURCE).toContain('PhFootprints');
  });
});

describe('MapScreen: region chips choose the selection', () => {
  it('a chosen region that does not hold the selection selects its start node', async () => {
    const h = harness();
    await mountScreen(h);
    expect(h.selectedId.value).toBe(10n);
    h.select.mockClear();
    h.map.showRegion(2n);
    await nextTick();
    await nextTick();
    expect(h.select).toHaveBeenCalledWith(20n);
    expect(h.selectedId.value).toBe(20n);
  });

  it('choosing your own region again selects your place', async () => {
    const h = harness({ args: { regionId: 2n } });
    await mountScreen(h);
    expect(h.selectedId.value).toBe(20n);
    h.map.showRegion(1n);
    await nextTick();
    await nextTick();
    expect(h.selectedId.value).toBe(10n);
  });

  it('a selection already in the chosen region stays', async () => {
    const h = harness({ args: { locationId: 12n } });
    await mountScreen(h);
    h.select.mockClear();
    h.map.showRegion(1n);
    await nextTick();
    await nextTick();
    expect(h.select).not.toHaveBeenCalled();
    expect(h.selectedId.value).toBe(12n);
  });

  it('a gate selection of a far-region place keeps the shown region and the selection', async () => {
    const h = harness({ locationId: 11n });
    const w = await mountScreen(h);
    await w.get('button.gate').trigger('click');
    await nextTick();
    await nextTick();
    expect(h.selectedId.value).toBe(20n);
    expect(h.shownRegionId.value).toBe(1n);
  });

  it('choosing a chip clears the arrival banner', async () => {
    const h = harness();
    await mountScreen(h);
    h.map.setBanner('Arrived at Ember Gate.');
    h.map.showRegion(2n);
    await nextTick();
    await nextTick();
    expect(h.banner.value).toBeNull();
  });

  it('a chip choice moves focus to the graph group current node', async () => {
    const h = harness();
    const chip = document.createElement('button');
    chip.setAttribute('data-region-chip', '');
    document.body.appendChild(chip);
    await mountScreen(h);
    chip.focus();
    expect(document.activeElement).toBe(chip);
    h.map.chooseRegion(2n);
    await nextTick();
    await nextTick();
    await nextTick();
    const active = document.activeElement as HTMLElement;
    expect(active.tagName).toBe('BUTTON');
    expect(active.classList.contains('node')).toBe(true);
    expect(active.closest('[role="group"]')).not.toBeNull();
    expect(active.dataset.nodeId).toBe('20');
  });

  it('a chip whose region already holds the selection still moves focus and scrolls (review WR-05)', async () => {
    const h = harness({ locationId: 11n });
    const w = await mountScreen(h);
    // the gate selects the far place in region 2 while region 1 is shown
    await w.get('button.gate').trigger('click');
    await nextTick();
    expect(h.selectedId.value).toBe(20n);
    const chip = document.createElement('button');
    document.body.appendChild(chip);
    chip.focus();
    scrolled.length = 0;
    h.map.chooseRegion(2n);
    await nextTick();
    await nextTick();
    await nextTick();
    expect(h.selectedId.value).toBe(20n);
    const active = document.activeElement as HTMLElement;
    expect(active.classList.contains('node')).toBe(true);
    expect(active.dataset.nodeId).toBe('20');
    expect(scrolled.some((element) => element.dataset.nodeId === '20')).toBe(true);
  });

  it('choosing the chip of the region already shown moves focus into the graph (review WR-05)', async () => {
    const h = harness();
    await mountScreen(h);
    const chip = document.createElement('button');
    document.body.appendChild(chip);
    chip.focus();
    h.map.chooseRegion(1n);
    await nextTick();
    await nextTick();
    await nextTick();
    const active = document.activeElement as HTMLElement;
    expect(active.classList.contains('node')).toBe(true);
    expect(active.dataset.nodeId).toBe('10');
  });

  it('leaves focus alone when it was not on a chip', async () => {
    const h = harness();
    const other = document.createElement('button');
    document.body.appendChild(other);
    await mountScreen(h);
    other.focus();
    h.map.showRegion(2n);
    await nextTick();
    await nextTick();
    await nextTick();
    expect(document.activeElement).toBe(other);
  });
});

describe('MapScreen: safety and layout', () => {
  it('renders hostile place and region names as text', async () => {
    const locations = LOCATIONS().map((l) => (l.id === 11n ? { ...l, name: XSS } : l));
    const h = harness({ locations });
    const w = await mountScreen(h);
    expect(w.find('img').exists()).toBe(false);
    expect(w.get('.label[data-node-id="11"] .name').text()).toBe(XSS);
  });

  it('source: canvas minimum height, the tokens-only glow and the guards', () => {
    expect(SOURCE).toContain('MAP_KEY');
    expect(SOURCE).toContain('Travel to a new place and it appears here.');
    expect(SOURCE).toContain('useMapGraph(');
    expect(SOURCE).toMatch(/min-height:\s*320px/);
    expect(SOURCE).toContain('radial-gradient');
    expect(SOURCE).toContain('var(--color-accent-900)');
    expect(SOURCE).not.toContain('v-html');
    expect(SOURCE).not.toMatch(/<svg/);
    expect(SOURCE).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
  });
});

const tab = (w: VueWrapper, name: string) => w.findAll('[role="tab"]').find((t) => t.text() === name)!;

describe('MapScreen: mobile Map and Here tabs (plan 51-11)', () => {
  it('shows the Map sheet view tabs with Map selected, the sheet, and a notice line under it', async () => {
    const h = harness({ desktop: false });
    const w = await mountScreen(h);
    const tablist = w.get('[role="tablist"][aria-label="Map sheet view"]');
    expect(tablist.findAll('[role="tab"]').map((t) => t.text())).toEqual(['Map', 'Here']);
    expect(tab(w, 'Map').attributes('aria-selected')).toBe('true');
    expect(tab(w, 'Here').attributes('aria-selected')).toBe('false');
    expect(w.find('.sheet-map').exists()).toBe(true);
    expect(w.find('.dock').exists()).toBe(true);
    expect(w.find('.map-body').exists()).toBe(false);
    // The shared startup rule: your place is selected on open.
    expect(h.select).toHaveBeenCalledWith(10n);
    expect(w.get('.map-sheet-root').element.lastElementChild?.className ?? '').not.toContain('sheet-map');
  });

  it('the Here tab renders the rail content: Here, Nearby and Tracking', async () => {
    const h = harness({ desktop: false });
    const w = await mountScreen(h);
    await tab(w, 'Here').trigger('click');
    await nextTick();
    // The Here card shows its place kicker once the character is placed; Nearby and Tracking follow.
    expect(w.find('.here-column .card-kicker').exists()).toBe(true);
    expect(w.findAll('h6').map((x) => x.text())).toEqual(['Nearby', 'Tracking']);
    expect(w.find('.sheet-map').exists()).toBe(false);
    await tab(w, 'Map').trigger('click');
    await nextTick();
    expect(w.find('.sheet-map').exists()).toBe(true);
  });

  it('draws nothing on the Map tab before the map data has applied, but keeps the tabs', async () => {
    const h = harness({ desktop: false });
    h.ready.value = false;
    const w = await mountScreen(h);
    expect(w.find('.sheet-map').exists()).toBe(false);
    expect(w.find('.dock').exists()).toBe(false);
    expect(w.findAll('[role="tab"]')).toHaveLength(2);
    expect(h.select).not.toHaveBeenCalled();
    h.ready.value = true;
    await nextTick();
    await nextTick();
    expect(w.find('.sheet-map').exists()).toBe(true);
  });

  it('shows the empty state on the Map tab when the character has no location', async () => {
    const h = harness({ desktop: false, locationId: 0n });
    const w = await mountScreen(h);
    expect(w.text()).toContain('No places discovered yet.');
    expect(w.find('.sheet-map').exists()).toBe(false);
    await tab(w, 'Here').trigger('click');
    await nextTick();
    expect(w.text()).not.toContain('No places discovered yet.');
  });

  it('the dock and the canvas read the same selection', async () => {
    const h = harness({ desktop: false });
    const w = await mountScreen(h);
    await w.get('button.node[data-node-id="11"]').trigger('click');
    await nextTick();
    expect(w.get('.dock-name').text()).toBe('Gloamwood');
  });

  it('renders hostile place names as text in the dock', async () => {
    const locations = LOCATIONS().map((l) => (l.id === 11n ? { ...l, name: XSS } : l));
    const h = harness({ desktop: false, locations });
    const w = await mountScreen(h);
    await w.get('button.node[data-node-id="11"]').trigger('click');
    await nextTick();
    expect(w.find('img').exists()).toBe(false);
    expect(w.get('.dock-name').text()).toBe(XSS);
  });

  it('source: the tabs, the notice line and the shared destination', () => {
    expect(SOURCE).toContain('Map sheet view');
    expect(SOURCE).toContain('<MapSheet');
    expect(SOURCE).toContain('<NoticeLine');
    expect(SOURCE).toContain('useDestination()');
  });
});

describe('MapScreen: one shared graph and the measured canvas (plan 51-12)', () => {
  const graphOf = (w: VueWrapper) =>
    (w.vm as unknown as { graph: { canvas: { value: unknown }; setCanvas(size: unknown): void } }).graph;
  const planeWidth = (w: VueWrapper): string => (w.get('.graph-plane').attributes('style') ?? '').split(';')[0];

  it('source: MapScreen builds the graph once and hands it to MapSheet', () => {
    const sheetSource = readFileSync(resolve(process.cwd(), 'src/map/MapSheet.vue'), 'utf8');
    expect(SOURCE.split('useMapGraph(').length - 1).toBe(1);
    expect(sheetSource).not.toContain('useMapGraph(');
    expect(SOURCE).toContain(':graph="graph"');
    expect(SOURCE).toContain('startIdFor(');
    expect(SOURCE).not.toContain('layoutFor(');
  });

  it('passes its own graph to MapSheet on mobile', async () => {
    const h = harness({ desktop: false });
    const w = await mountScreen(h);
    const sheet = w.findComponent(MapSheet);
    expect(sheet.exists()).toBe(true);
    expect(sheet.props('graph')).toBe(graphOf(w));
  });

  it('feeds the GraphPlane resize to graph.setCanvas on desktop', async () => {
    const h = harness();
    const w = await mountScreen(h);
    expect(graphOf(w).canvas.value).toBeNull();
    w.findComponent(GraphPlane).vm.$emit('resize', { width: 652, height: 600 });
    await nextTick();
    expect(graphOf(w).canvas.value).toEqual({ width: 652, height: 600 });
    expect(planeWidth(w)).toBe('width: 652px');
  });

  it('feeds the GraphPlane resize to graph.setCanvas on mobile', async () => {
    const h = harness({ desktop: false });
    const w = await mountScreen(h);
    w.findComponent(GraphPlane).vm.$emit('resize', { width: 700, height: 500 });
    await nextTick();
    expect(graphOf(w).canvas.value).toEqual({ width: 700, height: 500 });
    expect(planeWidth(w)).toBe('width: 700px');
  });

  it('scrolls the selected place into view again after the first measured size only', async () => {
    const h = harness({ args: { locationId: 12n } });
    const w = await mountScreen(h);
    scrolled.length = 0;
    w.findComponent(GraphPlane).vm.$emit('resize', { width: 652, height: 600 });
    await nextTick();
    await nextTick();
    expect(scrolled.map((el) => el.dataset.nodeId)).toEqual(['12']);
    w.findComponent(GraphPlane).vm.$emit('resize', { width: 900, height: 600 });
    await nextTick();
    await nextTick();
    expect(scrolled).toHaveLength(1);
  });

  it('resets the canvas when the frame switches between desktop and mobile', async () => {
    const h = harness();
    const w = await mountScreen(h);
    w.findComponent(GraphPlane).vm.$emit('resize', { width: 652, height: 600 });
    await nextTick();
    expect(graphOf(w).canvas.value).not.toBeNull();
    h.isDesktop.value = false;
    await nextTick();
    expect(graphOf(w).canvas.value).toBeNull();
  });
});
