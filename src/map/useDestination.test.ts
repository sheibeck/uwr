// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { computed, defineComponent, nextTick, ref } from 'vue';
import { mount, type VueWrapper } from '@vue/test-utils';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { CONSOLE_KEY, GAME_KEY, createInertConsole, createInertGame } from '../game/context';
import type { GameData } from '../game/context';
import type { Location } from '../module_bindings/types';
import { knownPlaces } from './knownPlaces';
import { MAP_KEY, createInertMap } from './mapContext';
import type { MapData } from './mapContext';
import { adjacencyOf } from './route';
import { useDestination } from './useDestination';
import type { Destination } from './useDestination';

const SOURCE = readFileSync(resolve(process.cwd(), 'src/map/useDestination.ts'), 'utf8');
const NOW = 1_000_000_000;

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

interface Rig {
  game: GameData;
  map: MapData;
  moveCharacter: ReturnType<typeof vi.fn>;
  select: ReturnType<typeof vi.fn>;
  setBanner: ReturnType<typeof vi.fn>;
  travelSpy: ReturnType<typeof vi.fn>;
  character: ReturnType<typeof ref<Record<string, unknown>>>;
  selectedId: ReturnType<typeof ref<bigint | null>>;
  connected: ReturnType<typeof ref<boolean>>;
  ready: ReturnType<typeof ref<boolean>>;
  gathers: ReturnType<typeof ref<unknown[]>>;
  cooldowns: ReturnType<typeof ref<Array<{ characterId: bigint; readyAtMicros: bigint }>>>;
  resolveMove: () => void;
  result: () => Destination;
}

let wrapper: VueWrapper | null = null;
afterEach(() => {
  wrapper?.unmount();
  wrapper = null;
});

function rig(over: { at?: bigint; stamina?: bigint; moveImpl?: () => Promise<void>; selected?: bigint | null } = {}): Rig {
  const character = ref<Record<string, unknown>>({
    id: 1n,
    name: 'Brannoch',
    locationId: over.at ?? 10n,
    level: 6n,
    stamina: over.stamina ?? 20n,
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
  const setBanner = vi.fn();
  const ready = ref(true);
  const gathers = ref<unknown[]>([]);
  const cooldowns = ref<Array<{ characterId: bigint; readyAtMicros: bigint }>>([]);
  const connected = ref(true);

  let release: () => void = () => {};
  const moveCharacter = vi.fn(
    over.moveImpl ??
      (() =>
        new Promise<void>((done) => {
          release = done;
        })),
  );

  const map = {
    ...createInertMap(),
    ready,
    known,
    adjacency: computed(() => adjacencyOf(known.value.edges)),
    cooldowns,
    nowMicros: ref(NOW),
    selectedId,
    select,
    setBanner,
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
    reducers: computed(() => (connected.value ? { moveCharacter } : null)),
  } as unknown as GameData;

  const travelSpy = vi.fn();
  let captured: Destination | null = null;
  const host = defineComponent({
    setup() {
      captured = useDestination();
      return () => null;
    },
  });
  wrapper = mount(host, {
    global: {
      provide: {
        [GAME_KEY as symbol]: game,
        [MAP_KEY as symbol]: map,
        [CONSOLE_KEY as symbol]: { ...createInertConsole(), travel: travelSpy },
      },
    },
  });
  return {
    game,
    map,
    moveCharacter,
    select,
    setBanner,
    travelSpy,
    character,
    selectedId,
    connected,
    ready,
    gathers,
    cooldowns,
    resolveMove: () => release(),
    result: () => captured as Destination,
  };
}

describe('useDestination: the detail model', () => {
  it('has no detail until the map data has applied', async () => {
    const r = rig({ selected: 11n });
    expect(r.result().detail.value?.title).toBe('Gloamwood');
    r.ready.value = false;
    await nextTick();
    expect(r.result().detail.value).toBeNull();
    expect(r.result().checks.value).toBeNull();
  });

  it('has no detail without a place', async () => {
    const r = rig({ selected: 11n });
    r.character.value = { ...r.character.value, locationId: 0n };
    await nextTick();
    expect(r.result().detail.value).toBeNull();
  });

  it('a neighbour gets checks, the stamina cost and a Travel action', () => {
    const r = rig({ selected: 11n });
    const detail = r.result().detail.value!;
    expect(detail.kind).toBe('neighbour');
    expect(detail.action.kind).toBe('travel');
    expect(detail.action.label).toBe('Travel to Gloamwood');
    expect(detail.trip.stamina).toBe('5 stamina');
    expect(r.result().checks.value?.block).toBeNull();
    expect(detail.checks?.map((c) => c.key)).toEqual(['stamina', 'activity']);
  });

  it('a neighbour in another region says Cross into and costs the cross-region stamina', () => {
    const r = rig({ at: 11n, selected: 20n });
    const detail = r.result().detail.value!;
    expect(detail.action.kind).toBe('cross');
    expect(detail.action.label).toBe('Cross into Saltmarsh');
    expect(detail.trip.stamina).toBe('10 stamina');
    expect(detail.checks?.map((c) => c.key)).toEqual(['region', 'stamina', 'activity']);
  });

  it('a far place and your own place have no checks', () => {
    const far = rig({ selected: 12n });
    expect(far.result().detail.value?.kind).toBe('far');
    expect(far.result().checks.value).toBeNull();
    expect(far.result().detail.value?.checks).toBeNull();
    wrapper?.unmount();
    const here = rig({ selected: 10n });
    expect(here.result().detail.value?.kind).toBe('here');
    expect(here.result().checks.value).toBeNull();
  });

  it('with nothing selected the detail is your place', () => {
    const r = rig({ selected: null });
    expect(r.result().detail.value?.kind).toBe('here');
    expect(r.result().detail.value?.title).toBe('Ember Gate');
  });

  it('a running cross-region timer blocks the crossing with the server time and not within a region', async () => {
    const r = rig({ at: 11n, selected: 20n });
    r.cooldowns.value = [{ characterId: 1n, readyAtMicros: BigInt(NOW + 192_000_000) }];
    await nextTick();
    const crossing = r.result().detail.value!;
    expect(crossing.action.disabled).toBe(true);
    expect(crossing.action.label).toBe('Region travel in');
    expect(crossing.action.timeText).toBe('3:12');
    r.map.select(12n);
    await nextTick();
    expect(r.result().detail.value?.action.disabled).toBe(false);
  });

  it('short stamina and gathering block with their own labels', async () => {
    const r = rig({ stamina: 3n, selected: 11n });
    expect(r.result().detail.value?.action.label).toBe('Not enough stamina');
    expect(r.result().detail.value?.action.disabled).toBe(true);
    r.character.value = { ...r.character.value, stamina: 20n };
    r.gathers.value = [{ id: 1n }];
    await nextTick();
    expect(r.result().detail.value?.action.label).toBe('Finish gathering first');
  });

  it('offline keeps the label and disables the button', async () => {
    const r = rig({ selected: 11n });
    r.connected.value = false;
    await nextTick();
    const action = r.result().detail.value!.action;
    expect(action.label).toBe('Travel to Gloamwood');
    expect(action.disabled).toBe(true);
    expect(action.describedBy).toBeNull();
  });
});

describe('useDestination: travel()', () => {
  it('calls the move reducer once with object arguments and never the console travel path', async () => {
    const r = rig({ selected: 11n, moveImpl: () => Promise.resolve() });
    const sent = await r.result().travel();
    expect(sent).toBe(true);
    expect(r.moveCharacter).toHaveBeenCalledTimes(1);
    expect(r.moveCharacter).toHaveBeenCalledWith({ characterId: 1n, locationId: 11n });
    expect(r.travelSpy).not.toHaveBeenCalled();
  });

  it('clears the arrival banner when a travel starts, not when it is ignored', async () => {
    const r = rig({ selected: 11n, moveImpl: () => Promise.resolve() });
    r.connected.value = false;
    await nextTick();
    await r.result().travel();
    expect(r.setBanner).not.toHaveBeenCalled();
    r.connected.value = true;
    await nextTick();
    await r.result().travel();
    expect(r.setBanner).toHaveBeenCalledWith(null);
  });

  it('a second call while the first is pending sends nothing', async () => {
    const r = rig({ selected: 11n });
    const first = r.result().travel();
    await nextTick();
    expect(r.result().runner.isPending('travel')).toBe(true);
    const second = await r.result().travel();
    expect(second).toBe(false);
    expect(r.moveCharacter).toHaveBeenCalledTimes(1);
    r.resolveMove();
    expect(await first).toBe(true);
    expect(r.result().runner.isPending('travel')).toBe(false);
  });

  it('remembers its own trip for one arrival only (review IN-08)', async () => {
    const r = rig({ selected: 11n, moveImpl: () => Promise.resolve() });
    expect(r.result().isOwnArrival(11n)).toBe(false);
    expect(await r.result().travel()).toBe(true);
    expect(r.result().isOwnArrival(12n)).toBe(false);
    // the mark was spent by the arrival elsewhere
    expect(r.result().isOwnArrival(11n)).toBe(false);
    expect(await r.result().travel()).toBe(true);
    expect(r.result().isOwnArrival(11n)).toBe(true);
    expect(r.result().isOwnArrival(11n)).toBe(false);
  });

  it('a rejected trip is not an own trip', async () => {
    const r = rig({ selected: 11n, moveImpl: () => Promise.reject(new Error('socket')) });
    expect(await r.result().travel()).toBe(false);
    expect(r.result().isOwnArrival(11n)).toBe(false);
  });

  it('sends nothing offline, when blocked, for your own place or a far place', async () => {
    const offline = rig({ selected: 11n, moveImpl: () => Promise.resolve() });
    offline.connected.value = false;
    await nextTick();
    expect(await offline.result().travel()).toBe(false);
    expect(offline.moveCharacter).not.toHaveBeenCalled();
    wrapper?.unmount();

    const blocked = rig({ selected: 11n, stamina: 1n, moveImpl: () => Promise.resolve() });
    expect(await blocked.result().travel()).toBe(false);
    expect(blocked.moveCharacter).not.toHaveBeenCalled();
    wrapper?.unmount();

    const here = rig({ selected: 10n, moveImpl: () => Promise.resolve() });
    expect(await here.result().travel()).toBe(false);
    wrapper?.unmount();

    const far = rig({ selected: 12n, moveImpl: () => Promise.resolve() });
    expect(await far.result().travel()).toBe(false);
    expect(far.moveCharacter).not.toHaveBeenCalled();
  });

  it('a rejected call counts as a client rejection and reports false', async () => {
    const r = rig({ selected: 11n, moveImpl: () => Promise.reject(new Error('socket')) });
    expect(await r.result().travel()).toBe(false);
    expect(r.result().runner.rejection.value).toBe(1);
  });
});

describe('useDestination: selectFirstStop()', () => {
  it('selects the first stop of a far place and never calls a reducer', () => {
    const r = rig({ selected: 12n });
    const id = r.result().selectFirstStop();
    expect(id).toBe(11n);
    expect(r.select).toHaveBeenCalledWith(11n);
    expect(r.selectedId.value).toBe(11n);
    expect(r.moveCharacter).not.toHaveBeenCalled();
    expect(r.setBanner).toHaveBeenCalledWith(null);
  });

  it('works while offline (it is local)', async () => {
    const r = rig({ selected: 12n });
    r.connected.value = false;
    await nextTick();
    expect(r.result().selectFirstStop()).toBe(11n);
  });

  it('does nothing for a neighbour, your place or no selection', () => {
    const r = rig({ selected: 11n });
    expect(r.result().selectFirstStop()).toBeNull();
    r.map.select(10n);
    expect(r.result().selectFirstStop()).toBeNull();
    expect(r.select).toHaveBeenCalledTimes(1);
  });
});

describe('useDestination: source', () => {
  it('calls the reducer in one place through one action runner', () => {
    expect(SOURCE.match(/moveCharacter\(/g)).toHaveLength(1);
    expect(SOURCE.match(/createActionRunner/g)).toHaveLength(1);
    expect(SOURCE).toContain("run('travel'");
    expect(SOURCE).not.toMatch(/consoleApi|CONSOLE_KEY|\.travel\(/);
  });
});
