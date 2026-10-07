// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { computed, nextTick, ref } from 'vue';
import { mount, type VueWrapper } from '@vue/test-utils';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { PhLockSimple, PhMapPin } from '@phosphor-icons/vue';
import { FRAME_KEY, GAME_KEY, createInertFrame, createInertGame } from '../game/context';
import type { FrameControls, GameData } from '../game/context';
import type { Location } from '../module_bindings/types';
import { knownPlaces } from './knownPlaces';
import { MAP_KEY, createInertMap } from './mapContext';
import type { MapData } from './mapContext';
import MapMeta from './MapMeta.vue';
import type { TravelTimer } from './travelTimer';

const SOURCE = readFileSync(resolve(process.cwd(), 'src/map/MapMeta.vue'), 'utf8');
const XSS = '<img src=x onerror=alert(1)>';

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
  desktop?: boolean;
  regionNames?: [string, string];
  at?: bigint;
  shown?: bigint | null;
  third?: boolean;
}

let wrapper: VueWrapper | null = null;
afterEach(() => {
  wrapper?.unmount();
  wrapper = null;
  document.body.innerHTML = '';
});

function build(over: Options = {}) {
  const [nameOne, nameTwo] = over.regionNames ?? ['Ashfall Wilds', 'Saltmarsh'];
  const character = ref<Record<string, unknown> | null>({ id: 1n, locationId: over.at ?? 10n, level: 6n, boundLocationId: 0n });
  const locations = ref<Location[]>([
    place(10n, 'Ember Gate', 1n, { terrainType: 'town', isSafe: true }),
    place(11n, 'Gloamwood', 1n),
    place(20n, 'Saltmarsh Gate', 2n),
    ...(over.third ? [place(30n, 'Cairn Rest', 3n, { terrainType: 'town', isSafe: true })] : []),
  ]);
  const connections = ref(links([[10n, 11n], [11n, 20n], ...(over.third ? ([[20n, 30n]] as Array<[bigint, bigint]>) : [])]));
  const visited = ref<bigint[]>([10n, 11n, 20n, ...(over.third ? [30n] : [])]);
  const known = computed(() =>
    knownPlaces<Location>({
      visitedIds: visited.value,
      currentLocationId: character.value?.locationId as bigint,
      connections: connections.value,
      locations: locations.value,
    }),
  );
  const timer = ref<TravelTimer>({ running: false, secondsLeft: 0 });
  const ready = ref(true);
  const shownRegionId = ref<bigint | null>(over.shown === undefined ? null : over.shown);
  const showRegion = vi.fn((id: bigint | null) => {
    shownRegionId.value = id;
  });
  const chooseRegion = vi.fn((id: bigint) => {
    shownRegionId.value = id;
  });
  const map = {
    ...createInertMap(),
    ready,
    known,
    selfTimer: timer,
    shownRegionId,
    showRegion,
    chooseRegion,
  } as unknown as MapData;
  const game = {
    ...createInertGame(),
    character,
    locations,
    regions: ref([
      { id: 1n, name: nameOne, dangerMultiplier: 300n },
      { id: 2n, name: nameTwo, dangerMultiplier: 400n },
      { id: 3n, name: 'Cairn Vale', dangerMultiplier: 500n },
    ]),
  } as unknown as GameData;
  const desktop = ref(over.desktop ?? true);
  const frame = { ...createInertFrame(), isDesktop: desktop } as unknown as FrameControls;
  wrapper = mount(MapMeta, {
    attachTo: document.body,
    global: { provide: { [GAME_KEY as symbol]: game, [FRAME_KEY as symbol]: frame, [MAP_KEY as symbol]: map } },
  });
  return { w: wrapper, timer, ready, showRegion, chooseRegion, shownRegionId, character, desktop };
}

const chips = (w: VueWrapper) => w.findAll('button.region-chip');

describe('MapMeta desktop chips', () => {
  it('renders nothing until the map data has applied', async () => {
    const { w, ready } = build();
    expect(chips(w)).toHaveLength(2);
    ready.value = false;
    await nextTick();
    expect(w.findAll('button')).toHaveLength(0);
    expect(w.text()).toBe('');
  });

  it('renders nothing without a character', async () => {
    const { w, character } = build();
    character.value = null;
    await nextTick();
    expect(w.findAll('button')).toHaveLength(0);
  });

  it('has one button chip per known region, yours first then by name, with the level range', () => {
    const { w } = build({ regionNames: ['Zephyr Wilds', 'Alder Marsh'] });
    const list = chips(w);
    expect(list.map((c) => c.get('.chip-name').text())).toEqual(['Zephyr Wilds', 'Alder Marsh']);
    expect(list.map((c) => c.get('.chip-level').text())).toEqual(['Lv 3', 'Lv 4']);
    for (const chip of list) {
      expect(chip.classes()).toContain('tag');
      expect(chip.attributes('type')).toBe('button');
      expect(chip.attributes('data-region-chip')).toBeDefined();
    }
  });

  it('the second region comes alphabetically when yours is elsewhere, then the next by id', () => {
    const { w } = build({ third: true, at: 20n });
    expect(chips(w).map((c) => c.get('.chip-name').text())).toEqual(['Saltmarsh', 'Ashfall Wilds', 'Cairn Vale']);
    expect(chips(w)[2].get('.chip-level').text()).toBe('Safe');
  });

  it('the shown region is the accent tag with aria-pressed true, the rest neutral and false', () => {
    const { w } = build();
    const [yours, other] = chips(w);
    expect(yours.classes()).toContain('tag-accent');
    expect(yours.attributes('aria-pressed')).toBe('true');
    expect(other.classes()).toContain('tag-neutral');
    expect(other.attributes('aria-pressed')).toBe('false');
  });

  it('your region shows the pin and ", you are here" only while another is shown', async () => {
    const { w, shownRegionId } = build();
    expect(w.findComponent(PhMapPin).exists()).toBe(false);
    expect(chips(w)[0].attributes('aria-label')).toBe('Ashfall Wilds, Lv 3');
    shownRegionId.value = 2n;
    await nextTick();
    const yours = chips(w)[0];
    expect(yours.findComponent(PhMapPin).exists()).toBe(true);
    expect(yours.attributes('aria-label')).toBe('Ashfall Wilds, Lv 3, you are here');
    expect(yours.attributes('aria-pressed')).toBe('false');
    expect(chips(w)[1].attributes('aria-pressed')).toBe('true');
  });

  it('choosing a chip shows that region and nothing else', async () => {
    const { w, chooseRegion, showRegion } = build();
    await chips(w)[1].trigger('click');
    expect(chooseRegion).toHaveBeenCalledWith(2n);
    expect(showRegion).not.toHaveBeenCalled();
  });

  it('choosing the chip of the region already shown is still a choice (review WR-05)', async () => {
    const { w, chooseRegion } = build({ shown: 2n });
    await chips(w)[1].trigger('click');
    expect(chooseRegion).toHaveBeenCalledWith(2n);
  });

  it('with no timer running nothing is locked, whatever the level difference', () => {
    const { w } = build();
    expect(w.findComponent(PhLockSimple).exists()).toBe(false);
    expect(chips(w)[1].get('.chip-level').text()).toBe('Lv 4');
    expect(chips(w)[1].attributes('aria-label')).toBe('Saltmarsh, Lv 4');
  });

  it('while the timer runs every region but your current one shows the lock and the clock, and stays operable', async () => {
    const { w, timer, chooseRegion } = build({ third: true });
    timer.value = { running: true, secondsLeft: 192 };
    await nextTick();
    const list = chips(w);
    expect(list[0].findComponent(PhLockSimple).exists()).toBe(false);
    expect(list[0].get('.chip-level').text()).toBe('Lv 3');
    for (const chip of list.slice(1)) {
      expect(chip.findComponent(PhLockSimple).exists()).toBe(true);
      const clock = chip.get('.chip-clock');
      expect(clock.text()).toBe('3:12');
      expect(clock.attributes('aria-hidden')).toBe('true');
      expect(chip.find('.chip-level').exists()).toBe(false);
      expect(chip.attributes('aria-label')).toContain('region travel locked for about 4 minutes');
      expect(chip.attributes('aria-disabled')).toBeUndefined();
      expect(chip.attributes('disabled')).toBeUndefined();
    }
    const salt = list.find((c) => c.get('.chip-name').text() === 'Saltmarsh')!;
    expect(salt.attributes('aria-label')).toBe('Saltmarsh, Lv 4, region travel locked for about 4 minutes');
    await salt.trigger('click');
    expect(chooseRegion).toHaveBeenCalledWith(2n);
  });

  it('the timer ending unlocks every chip at once', async () => {
    const { w, timer } = build();
    timer.value = { running: true, secondsLeft: 3 };
    await nextTick();
    expect(w.findComponent(PhLockSimple).exists()).toBe(true);
    timer.value = { running: false, secondsLeft: 0 };
    await nextTick();
    expect(w.findComponent(PhLockSimple).exists()).toBe(false);
  });

  it('names ellipsize with the full name in title and aria-label, and hostile names are text', () => {
    const { w } = build({ regionNames: [XSS, 'Saltmarsh'] });
    const chip = chips(w)[0];
    expect(chip.get('.chip-name').text()).toBe(XSS);
    expect(chip.get('.chip-name').attributes('title')).toBe(XSS);
    expect(chip.attributes('aria-label')).toBe(`${XSS}, Lv 3`);
    expect(w.find('img').exists()).toBe(false);
  });

  it('source: wrap at gap 4, 144px names, chip size and tokens', () => {
    expect(SOURCE).toContain('aria-pressed');
    expect(SOURCE).toContain('region travel locked for about');
    expect(SOURCE).toMatch(/flex-wrap:\s*wrap/);
    expect(SOURCE).toMatch(/gap:\s*4px/);
    expect(SOURCE).toMatch(/max-width:\s*144px/);
    expect(SOURCE).toMatch(/min-height:\s*32px/);
    expect(SOURCE).toMatch(/min-height:\s*44px|height:\s*44px/);
    expect(SOURCE).toMatch(/min-width:\s*0/);
    expect(SOURCE).not.toContain('v-html');
    expect(SOURCE).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
  });
});

describe('MapMeta mobile', () => {
  it('is the shown region name as text and nothing else', () => {
    const { w } = build({ desktop: false });
    expect(w.findAll('button')).toHaveLength(0);
    expect(w.text()).toBe('Ashfall Wilds');
  });

  it('follows the shown region and renders hostile names as text', async () => {
    const { w, shownRegionId } = build({ desktop: false, regionNames: ['Ashfall Wilds', XSS] });
    shownRegionId.value = 2n;
    await nextTick();
    expect(w.text()).toBe(XSS);
    expect(w.find('img').exists()).toBe(false);
  });
});

describe('MapMeta bare', () => {
  it('mounts against the inert providers and renders nothing', () => {
    wrapper = mount(MapMeta);
    expect(wrapper.text()).toBe('');
  });
});
