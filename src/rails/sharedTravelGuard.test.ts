// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { defineComponent, h, nextTick, ref } from 'vue';
import { mount, type VueWrapper } from '@vue/test-utils';
import ExitChips from './ExitChips.vue';
import HereCard from './HereCard.vue';
import { CONSOLE_KEY, GAME_KEY, createInertConsole, createInertGame } from '../game/context';
import type { ConsoleApi, GameData } from '../game/context';
import { MAP_KEY, createInertMap } from '../map/mapContext';
import type { MapData } from '../map/mapContext';

// Review WR-04 (client rest): the rail's Here card, the mobile exit chips and the Map share one travel
// guard in the map hub, so a quick tap on a second surface cannot send a second move before the
// first one's character row arrives.

let wrapper: VueWrapper | null = null;
afterEach(() => {
  wrapper?.unmount();
  wrapper = null;
  document.body.innerHTML = '';
  vi.useRealTimers();
});

const place = (over: Record<string, unknown>) => ({
  description: '',
  zone: '',
  regionId: 1n,
  levelOffset: 0n,
  isSafe: false,
  terrainType: 'woods',
  bindStone: false,
  craftingAvailable: false,
  ...over,
});

function build() {
  const character = ref({ id: 1n, name: 'Hero', level: 4n, stamina: 50n, locationId: 10n });
  const game = {
    ...createInertGame(),
    connected: ref(true),
    character,
    characterId: ref(1n),
    locations: ref([
      place({ id: 10n, name: 'The Crossing', terrainType: 'town' }),
      place({ id: 11n, name: 'Gloamwood' }),
      place({ id: 13n, name: 'Harbour', terrainType: 'town', isSafe: true }),
    ]),
    regions: ref([{ id: 1n, name: 'Ashfall Wilds', dangerMultiplier: 300n }]),
    connections: ref([
      { id: 1n, fromLocationId: 10n, toLocationId: 11n },
      { id: 2n, fromLocationId: 10n, toLocationId: 13n },
      { id: 3n, fromLocationId: 11n, toLocationId: 13n },
    ]),
  } as unknown as GameData;
  const map = { ...createInertMap(), ready: ref(true), nowMicros: ref(0) } as unknown as MapData;
  const consoleApi = { ...createInertConsole(), travel: vi.fn() } as unknown as ConsoleApi;
  const Both = defineComponent({ setup: () => () => [h(HereCard), h(ExitChips)] });
  wrapper = mount(Both, {
    attachTo: document.body,
    global: { provide: { [GAME_KEY as symbol]: game, [MAP_KEY as symbol]: map, [CONSOLE_KEY as symbol]: consoleApi } },
  });
  return { w: wrapper, map, consoleApi, character };
}

describe('one travel guard across the rail, the exit chips and the Map', () => {
  it('a Here card trip blocks a chip trip until the place changes', async () => {
    const { w, map, consoleApi } = build();
    await w.findAll('button.exit-row').find((b) => b.text().includes('Gloamwood'))!.trigger('click');
    await w.get('.exit-panel button.btn-primary').trigger('click');
    expect(consoleApi.travel).toHaveBeenCalledTimes(1);
    expect(map.travelPending.value).toBe(true);

    await w.findAll('button.chip').find((b) => b.text().includes('Harbour'))!.trigger('click');
    await w.get('.exit-card button.card-button').trigger('click');
    expect(consoleApi.travel).toHaveBeenCalledTimes(1);
  });

  it('a trip pending from the Map blocks both rail surfaces', async () => {
    const { w, map, consoleApi } = build();
    expect(map.beginTrip()).toBe(true);
    await nextTick();
    await w.findAll('button.exit-row').find((b) => b.text().includes('Gloamwood'))!.trigger('click');
    await w.get('.exit-panel button.btn-primary').trigger('click');
    await w.findAll('button.chip').find((b) => b.text().includes('Harbour'))!.trigger('click');
    await w.get('.exit-card button.card-button').trigger('click');
    expect(consoleApi.travel).not.toHaveBeenCalled();
    map.endTrip();
    await nextTick();
    await w.get('.exit-card button.card-button').trigger('click');
    expect(consoleApi.travel).toHaveBeenCalledTimes(1);
  });

  it('the guard lapses after a refusal, which leaves the place unchanged', async () => {
    vi.useFakeTimers();
    const { w, consoleApi } = build();
    await w.findAll('button.exit-row').find((b) => b.text().includes('Gloamwood'))!.trigger('click');
    await w.get('.exit-panel button.btn-primary').trigger('click');
    vi.advanceTimersByTime(2000);
    await nextTick();
    await w.get('.exit-panel button.btn-primary').trigger('click');
    expect(consoleApi.travel).toHaveBeenCalledTimes(2);
  });
});
