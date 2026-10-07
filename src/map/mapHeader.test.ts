// @vitest-environment happy-dom
import { afterEach, describe, expect, it } from 'vitest';
import { computed, h, ref } from 'vue';
import { mount, type VueWrapper } from '@vue/test-utils';
import { FRAME_KEY, GAME_KEY, createInertFrame, createInertGame } from '../game/context';
import type { FrameControls, GameData } from '../game/context';
import Drawer from '../frame/Drawer.vue';
import type { Location } from '../module_bindings/types';
import { knownPlaces } from './knownPlaces';
import { MAP_KEY, createInertMap } from './mapContext';
import type { MapData } from './mapContext';
import MapActions from './MapActions.vue';
import MapMeta from './MapMeta.vue';
import type { TravelTimer } from './travelTimer';

// The Map header (51-UI-SPEC "Region chips and the Region travel pill"): h4 Map, the region chips in
// the meta slot, the spacer, the Region travel pill in the actions slot, then the close button. The
// pill is not focusable, so the close button stays the first focusable control after the chips.

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

let wrapper: VueWrapper | null = null;
afterEach(() => {
  wrapper?.unmount();
  wrapper = null;
  document.body.innerHTML = '';
});

function mountHeader(timer: TravelTimer): VueWrapper {
  const character = ref<Record<string, unknown> | null>({ id: 1n, locationId: 10n, level: 6n, boundLocationId: 0n });
  const locations = ref<Location[]>([place(10n, 'Ember Gate', 1n, { terrainType: 'town', isSafe: true }), place(20n, 'Saltmarsh Gate', 2n)]);
  const known = computed(() =>
    knownPlaces<Location>({
      visitedIds: [10n],
      currentLocationId: 10n,
      connections: [
        { fromLocationId: 10n, toLocationId: 20n },
        { fromLocationId: 20n, toLocationId: 10n },
      ],
      locations: locations.value,
    }),
  );
  const map = { ...createInertMap(), ready: ref(true), known, selfTimer: ref(timer) } as unknown as MapData;
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
  wrapper = mount(Drawer, {
    props: { title: 'Map' },
    attachTo: document.body,
    slots: {
      meta: () => h(MapMeta),
      actions: () => h(MapActions),
      default: () => h('p', 'body'),
    },
    global: { provide: { [GAME_KEY as symbol]: game, [FRAME_KEY as symbol]: frame, [MAP_KEY as symbol]: map } },
  });
  return wrapper;
}

const FOCUSABLE = 'button, a[href], input, select, textarea, [tabindex]:not([tabindex="-1"])';

describe('Map header in the Drawer', () => {
  it('orders h4 Map, the chips, the spacer, the actions wrapper with the pill, then the close button', () => {
    const w = mountHeader({ running: true, secondsLeft: 192 });
    const header = w.get('.drawer-header').element;
    const kinds = Array.from(header.children).map((child) => child.tagName.toLowerCase() + '.' + child.className.split(' ')[0]);
    expect(kinds).toEqual(['h4.', 'span.drawer-meta', 'span.drawer-spacer', 'span.drawer-actions', 'button.btn']);
    expect(w.get('h4').text()).toBe('Map');
    expect(w.get('.drawer-meta').findAll('button.region-chip')).toHaveLength(2);
    expect(w.get('.drawer-actions').text()).toContain('Region travel: 3:12 left');
  });

  it('Tab from the last chip reaches the close button because the pill takes no focus', () => {
    const w = mountHeader({ running: true, secondsLeft: 192 });
    const stops = Array.from(w.get('.drawer-header').element.querySelectorAll(FOCUSABLE));
    const names = stops.map((el) => (el as HTMLElement).className.split(' ')[0] + ':' + (el.getAttribute('aria-label') ?? el.textContent));
    expect(stops).toHaveLength(3);
    expect(stops[0].classList.contains('region-chip')).toBe(true);
    expect(stops[1].classList.contains('region-chip')).toBe(true);
    expect(stops[2]).toBe(w.get('button[aria-label="Close Map"]').element);
    expect(names[2]).toContain('Close Map');
    expect(w.get('.drawer-actions').element.querySelector(FOCUSABLE)).toBeNull();
  });

  it('focuses the close button on mount as before', () => {
    const w = mountHeader({ running: false, secondsLeft: 0 });
    expect(document.activeElement).toBe(w.get('button[aria-label="Close Map"]').element);
  });

  it('shows Ready in the pill while no timer runs', () => {
    const w = mountHeader({ running: false, secondsLeft: 0 });
    expect(w.get('.drawer-actions').text()).toContain('Region travel: Ready');
  });
});
