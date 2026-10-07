// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { computed, nextTick, ref } from 'vue';
import { mount, type VueWrapper } from '@vue/test-utils';
import { PhFootprints } from '@phosphor-icons/vue';
import { FRAME_KEY, GAME_KEY, createInertFrame, createInertGame } from '../game/context';
import type { FrameControls, GameData } from '../game/context';
import type { Location } from '../module_bindings/types';
import { knownPlaces } from './knownPlaces';
import { MAP_KEY, createInertMap } from './mapContext';
import type { MapData } from './mapContext';
import MapScreen from './MapScreen.vue';
import { adjacencyOf } from './route';

// Arrival (51-CONTEXT "After travelling, the detail panel shows the new current place, not a blank";
// UI-SPEC Mock overrides 13 and 14): the Map follows the character row, whatever moved it.

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

function harness() {
  const character = ref<Record<string, unknown> | null>({
    id: 1n,
    name: 'Brannoch',
    locationId: 10n,
    level: 6n,
    stamina: 20n,
    boundLocationId: 0n,
    racialTravelCostIncrease: null,
    racialTravelCostDiscount: null,
  });
  const locations = ref<Location[]>([
    place(10n, 'Ember Gate', 1n, { terrainType: 'town', isSafe: true }),
    place(11n, 'Gloamwood', 1n),
    place(12n, 'Ridge Walk', 1n, { terrainType: 'mountains' }),
    place(20n, 'Saltmarsh Gate', 2n),
  ]);
  const visitedIds = ref<bigint[]>([10n, 11n]);
  const connections = ref(links([[10n, 11n], [11n, 12n], [11n, 20n]]));
  const selectedId = ref<bigint | null>(null);
  const shownRegionId = ref<bigint | null>(null);
  const banner = ref<string | null>(null);
  const isDesktop = ref(true);
  const view = ref<'graph' | 'list'>('graph');
  const known = computed(() => {
    const here = (character.value?.locationId as bigint | undefined) ?? 0n;
    return knownPlaces<Location>({
      visitedIds: visitedIds.value,
      currentLocationId: here === 0n ? null : here,
      connections: connections.value,
      locations: locations.value,
    });
  });
  const select = vi.fn((id: bigint | null) => {
    selectedId.value = id;
  });
  const showRegion = vi.fn((id: bigint | null) => {
    shownRegionId.value = id;
  });
  const setBanner = vi.fn((text: string | null) => {
    banner.value = text;
  });
  const map = {
    ...createInertMap(),
    ready: ref(true),
    known,
    adjacency: computed(() => adjacencyOf(known.value.edges)),
    selectedId,
    shownRegionId,
    banner,
    view,
    select,
    showRegion,
    setBanner,
    setView: (next: 'graph' | 'list') => {
      view.value = next;
    },
  } as unknown as MapData;
  const moveCharacter = vi.fn(() => Promise.resolve());
  const connected = ref(true);
  const game = {
    ...createInertGame(),
    connected,
    character,
    locations,
    regions: ref([
      { id: 1n, name: 'Ashfall Wilds', dangerMultiplier: 300n },
      { id: 2n, name: 'Saltmarsh', dangerMultiplier: 400n },
    ]),
    reducers: computed(() => (connected.value ? { moveCharacter } : null)),
  } as unknown as GameData;
  const frame = { ...createInertFrame(), isDesktop } as unknown as FrameControls;
  return { map, game, frame, character, select, showRegion, setBanner, banner, selectedId, shownRegionId, moveCharacter, isDesktop };
}

type Rig = ReturnType<typeof harness>;

let wrapper: VueWrapper | null = null;
beforeEach(() => {
  Element.prototype.scrollIntoView = function () {};
});
afterEach(() => {
  wrapper?.unmount();
  wrapper = null;
  document.body.innerHTML = '';
});

async function settle(): Promise<void> {
  for (let i = 0; i < 4; i += 1) await nextTick();
}

async function open(h: Rig): Promise<VueWrapper> {
  wrapper = mount(MapScreen, {
    attachTo: document.body,
    global: { provide: { [GAME_KEY as symbol]: h.game, [FRAME_KEY as symbol]: h.frame, [MAP_KEY as symbol]: h.map } },
  });
  await settle();
  return wrapper;
}

/** The player works in the Map: focus on a node of the graph. */
function focusInMap(w: VueWrapper): void {
  (w.get('button.node').element as HTMLElement).focus();
}

async function moveTo(h: Rig, id: bigint): Promise<void> {
  h.character.value = { ...h.character.value, locationId: id };
  await settle();
}

describe('Map arrival', () => {
  it('opens with no banner and your place selected', async () => {
    const h = harness();
    const w = await open(h);
    expect(h.banner.value).toBeNull();
    expect(w.find('.arrival-banner').exists()).toBe(false);
    expect(h.selectedId.value).toBe(10n);
  });

  it('a same-region arrival selects the new place, shows the banner and focuses the detail heading', async () => {
    const h = harness();
    const w = await open(h);
    h.select(12n);
    focusInMap(w);
    await moveTo(h, 11n);
    expect(h.selectedId.value).toBe(11n);
    expect(h.banner.value).toBe('Arrived at Gloamwood.');
    const banner = w.get('.arrival-banner');
    expect(banner.text()).toBe('Arrived at Gloamwood.');
    expect(w.get('h4').text()).toBe('Gloamwood');
    expect(w.get('.kicker').text()).toBe('You are here');
    expect(document.activeElement).toBe(w.get('h4').element);
    expect(h.shownRegionId.value).toBe(1n);
  });

  it('crossing into another region switches the shown region and says so', async () => {
    const h = harness();
    const w = await open(h);
    focusInMap(w);
    await moveTo(h, 11n);
    await moveTo(h, 20n);
    expect(h.selectedId.value).toBe(20n);
    expect(h.shownRegionId.value).toBe(2n);
    expect(h.banner.value).toBe('Crossed into Saltmarsh. Arrived at Saltmarsh Gate.');
    expect(w.get('.arrival-banner').text()).toBe('Crossed into Saltmarsh. Arrived at Saltmarsh Gate.');
    expect(w.get('[role="group"]').attributes('aria-label')).toBe('Saltmarsh route graph');
    expect(document.activeElement).toBe(w.get('h4').element);
  });

  it('the banner is a status with the footprints icon and no stamina numbers', async () => {
    const h = harness();
    const w = await open(h);
    await moveTo(h, 11n);
    const banner = w.get('.arrival-banner');
    expect(banner.attributes('role')).toBe('status');
    expect(banner.findComponent(PhFootprints).exists()).toBe(true);
    expect(banner.text()).not.toMatch(/\d/);
    expect(banner.text()).not.toContain('stamina');
  });

  it('the banner stays until the next selection (no timed removal)', async () => {
    vi.useFakeTimers();
    try {
      const h = harness();
      const w = await open(h);
      await moveTo(h, 11n);
      vi.advanceTimersByTime(60_000);
      await settle();
      expect(w.find('.arrival-banner').exists()).toBe(true);
    } finally {
      vi.useRealTimers();
    }
  });

  it('selecting another node clears the banner', async () => {
    const h = harness();
    const w = await open(h);
    await moveTo(h, 11n);
    expect(w.find('.arrival-banner').exists()).toBe(true);
    await w.get('button.node[data-node-id="12"]').trigger('click');
    await settle();
    expect(h.selectedId.value).toBe(12n);
    expect(w.find('.arrival-banner').exists()).toBe(false);
  });

  it('choosing a list row clears the banner too', async () => {
    const h = harness();
    const w = await open(h);
    await moveTo(h, 11n);
    expect(w.find('.arrival-banner').exists()).toBe(true);
    await w.findAll('[role="tab"]').find((t) => t.text() === 'List')!.trigger('click');
    await settle();
    expect(w.find('.arrival-banner').exists()).toBe(true);
    const row = w.findAll('li button').find((r) => r.get('.name').text() === 'Ridge Walk');
    await row!.trigger('click');
    await settle();
    expect(h.selectedId.value).toBe(12n);
    expect(w.find('.arrival-banner').exists()).toBe(false);
  });

  it('a travel started from the detail clears the banner', async () => {
    const h = harness();
    const w = await open(h);
    await moveTo(h, 11n);
    expect(h.banner.value).not.toBeNull();
    // the selection moves without the screen's own handler (another surface selected it)
    h.map.select(12n);
    await settle();
    expect(h.banner.value).not.toBeNull();
    await w.get('button.travel-button').trigger('click');
    await settle();
    expect(h.moveCharacter).toHaveBeenCalledWith({ characterId: 1n, locationId: 12n });
    expect(h.banner.value).toBeNull();
    expect(w.find('.arrival-banner').exists()).toBe(false);
  });

  it('a respawn or a typed go (a character row change with no click) is an arrival too', async () => {
    const h = harness();
    await open(h);
    await moveTo(h, 11n);
    await moveTo(h, 10n);
    expect(h.selectedId.value).toBe(10n);
    expect(h.banner.value).toBe('Arrived at Ember Gate.');
  });

  it('an unchanged place or an unknown place does nothing', async () => {
    const h = harness();
    await open(h);
    h.setBanner.mockClear();
    h.character.value = { ...h.character.value, stamina: 5n };
    await settle();
    expect(h.setBanner).not.toHaveBeenCalled();
    h.character.value = { ...h.character.value, locationId: 999n };
    await settle();
    expect(h.setBanner).not.toHaveBeenCalled();
  });

  it('a location change while the Map is not mounted does nothing', async () => {
    const h = harness();
    await open(h);
    wrapper?.unmount();
    wrapper = null;
    h.select.mockClear();
    h.showRegion.mockClear();
    h.setBanner.mockClear();
    await moveTo(h, 11n);
    expect(h.select).not.toHaveBeenCalled();
    expect(h.showRegion).not.toHaveBeenCalled();
    expect(h.setBanner).not.toHaveBeenCalled();
  });

  it('focus outside the Map stays where it is on an arrival the Map did not start (review IN-08)', async () => {
    const h = harness();
    const w = await open(h);
    const rail = document.createElement('button');
    document.body.appendChild(rail);
    rail.focus();
    await moveTo(h, 11n);
    expect(h.selectedId.value).toBe(11n);
    expect(w.get('.arrival-banner').text()).toBe('Arrived at Gloamwood.');
    expect(document.activeElement).toBe(rail);
  });

  it('no focus at all (the body) is not pulled into the Map either', async () => {
    const h = harness();
    await open(h);
    (document.activeElement as HTMLElement | null)?.blur();
    await moveTo(h, 11n);
    expect(document.activeElement).toBe(document.body);
  });

  it("an arrival from the Map's own Travel moves focus to the heading, wherever focus went meanwhile", async () => {
    const h = harness();
    const w = await open(h);
    h.map.select(11n);
    await settle();
    await w.get('button.travel-button').trigger('click');
    expect(h.moveCharacter).toHaveBeenCalledWith({ characterId: 1n, locationId: 11n });
    const rail = document.createElement('button');
    document.body.appendChild(rail);
    rail.focus();
    await moveTo(h, 11n);
    expect(document.activeElement).toBe(w.get('h4').element);
  });

  it('the own-trip mark is used once: a later arrival with focus outside leaves it alone', async () => {
    const h = harness();
    const w = await open(h);
    h.map.select(11n);
    await settle();
    await w.get('button.travel-button').trigger('click');
    await moveTo(h, 11n);
    const rail = document.createElement('button');
    document.body.appendChild(rail);
    rail.focus();
    await moveTo(h, 12n);
    expect(h.selectedId.value).toBe(12n);
    expect(document.activeElement).toBe(rail);
  });

  it('closing the Map ends the banner, so a reopen after more trips shows none (review WR-01)', async () => {
    const h = harness();
    await open(h);
    await moveTo(h, 11n);
    expect(h.banner.value).toBe('Arrived at Gloamwood.');
    wrapper?.unmount();
    wrapper = null;
    expect(h.banner.value).toBeNull();
    await moveTo(h, 12n);
    const w = await open(h);
    expect(h.banner.value).toBeNull();
    expect(w.find('.arrival-banner').exists()).toBe(false);
    expect(h.selectedId.value).toBe(12n);
  });

  it('opening the Map never shows a banner left in the hub from before (review WR-01)', async () => {
    const h = harness();
    h.banner.value = 'Arrived at Gloamwood.';
    const w = await open(h);
    expect(h.banner.value).toBeNull();
    expect(w.find('.arrival-banner').exists()).toBe(false);
  });

  it('on mobile the Map tab follows the character row and focus moves to the dock place name', async () => {
    const h = harness();
    h.isDesktop.value = false;
    const w = await open(h);
    focusInMap(w);
    await moveTo(h, 11n);
    expect(h.select).toHaveBeenCalledWith(11n);
    expect(h.setBanner).toHaveBeenCalledWith('Arrived at Gloamwood.');
    expect(w.get('.arrival-banner').text()).toBe('Arrived at Gloamwood.');
    expect(document.activeElement).toBe(w.get('.dock-name').element);
  });

  it('on mobile with the Here tab open the selection follows but there is no dock to focus', async () => {
    const h = harness();
    h.isDesktop.value = false;
    const w = await open(h);
    await w.get('[role="tab"]:nth-child(2)').trigger('click');
    await settle();
    expect(w.find('.dock-name').exists()).toBe(false);
    await moveTo(h, 11n);
    expect(h.select).toHaveBeenCalledWith(11n);
  });
});
