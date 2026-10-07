import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { effectScope, nextTick, ref, shallowRef } from 'vue';
import type { Ref, ShallowRef } from 'vue';
import type { ConnectionStatus } from '../net/connection';
import type { BindTableOptions } from '../net/bindTable';
import { createMapData } from './mapData';
import type { MapConn, MapDeps, MapInput } from './mapData';
import type { MapQueries } from './queries';

interface FakeConn {
  id: number;
}

interface FakeBinding {
  sql: string[];
  filter: ((row: any) => boolean) | undefined;
  rows: ShallowRef<readonly any[]>;
  applied: Ref<boolean>;
  failed: Ref<boolean>;
  attach: ReturnType<typeof vi.fn>;
  dispose: ReturnType<typeof vi.fn>;
  disposed: boolean;
}

const list = (ids: readonly bigint[]) => ids.join(',');
const queries: MapQueries = {
  myVisitedLocations: 'Q_VISITED',
  connections: 'Q_CONNECTIONS',
  travelCooldowns: (ids) => `Q_COOLDOWNS_${list(ids)}`,
  npcsAt: (id) => `Q_NPCS_AT_${id}`,
  charactersAt: (id) => `Q_CHARS_AT_${id}`,
  npcsById: (ids) => `Q_GIVERS_${list(ids)}`,
};

const NOW = 10_000_000_000;
let clockNow = NOW;

function character(id: bigint, locationId: bigint) {
  return { id, locationId } as any;
}
function location(id: bigint, regionId: bigint) {
  return { id, regionId, name: `L${id}` } as any;
}

function harness() {
  const conn = shallowRef<FakeConn | null>(null);
  const status = ref<ConnectionStatus>('idle');
  const activeCharacter = ref<any>(null);
  const locations = ref<any[]>([location(1n, 1n), location(2n, 1n), location(3n, 1n), location(4n, 2n)]);
  const partyCharacterIds = ref<bigint[]>([]);
  const questGiverIds = ref<bigint[]>([]);
  const bindings: FakeBinding[] = [];

  const deps = {
    bind: (options: BindTableOptions<FakeConn, any>) => {
      const binding: FakeBinding = {
        sql: options.sql,
        filter: options.filter,
        rows: shallowRef<readonly any[]>([]),
        applied: ref(false),
        failed: ref(false),
        attach: vi.fn(),
        dispose: vi.fn(),
        disposed: false,
      };
      binding.dispose = vi.fn(() => {
        binding.disposed = true;
        binding.rows.value = [];
        binding.applied.value = false;
      });
      bindings.push(binding);
      return binding;
    },
    queries,
  } as unknown as MapDeps<FakeConn & MapConn>;

  const input = {
    conn,
    status,
    character: activeCharacter,
    locations,
    regions: ref([]),
    partyCharacterIds,
    questGiverIds,
    clock: { nowMicros: () => clockNow },
  } as unknown as MapInput<FakeConn & MapConn>;
  const scope = effectScope();
  const hub = scope.run(() => createMapData(deps, input))!;

  const live = (sql: string): FakeBinding[] => bindings.filter((b) => b.sql[0] === sql && !b.disposed);
  const find = (sql: string): FakeBinding => {
    const found = live(sql);
    if (found.length === 0) throw new Error(`no live binding for ${sql}`);
    return found[found.length - 1];
  };
  const liveSql = (): string[] => bindings.filter((b) => !b.disposed).map((b) => b.sql[0]);

  return {
    hub,
    scope,
    conn,
    status,
    activeCharacter,
    locations,
    partyCharacterIds,
    questGiverIds,
    bindings,
    live,
    find,
    liveSql,
    connect(): FakeConn {
      const c = { id: 1 };
      conn.value = c;
      status.value = 'connected';
      return c;
    },
  };
}

type Harness = ReturnType<typeof harness>;
const made: Harness[] = [];
function make(): Harness {
  const h = harness();
  made.push(h);
  return h;
}

beforeEach(() => {
  vi.useFakeTimers();
  clockNow = NOW;
});
afterEach(() => {
  for (const h of made.splice(0)) h.scope.stop();
  vi.useRealTimers();
});

function applyAll(h: Harness): void {
  for (const b of h.bindings) if (!b.disposed) b.applied.value = true;
}

describe('visited places', () => {
  it('binds the per-sender view for the active character and filters by characterId', () => {
    const h = make();
    h.connect();
    h.activeCharacter.value = character(1n, 1n);
    const binding = h.find('Q_VISITED');
    expect(binding.filter!({ characterId: 1n })).toBe(true);
    expect(binding.filter!({ characterId: 2n })).toBe(false);
    binding.rows.value = [{ id: 1n, characterId: 1n, locationId: 2n }];
    expect(h.hub.visitedIds.value).toEqual([2n]);
  });

  it('swaps at once on a character switch: the old rows are gone before the new binding applies', () => {
    const h = make();
    h.connect();
    h.activeCharacter.value = character(1n, 1n);
    const first = h.find('Q_VISITED');
    first.applied.value = true;
    first.rows.value = [{ id: 1n, characterId: 1n, locationId: 2n }];
    expect(h.hub.visitedIds.value).toEqual([2n]);

    h.activeCharacter.value = character(2n, 1n);
    expect(first.disposed).toBe(true);
    const second = h.find('Q_VISITED');
    expect(second).not.toBe(first);
    expect(second.filter!({ characterId: 1n })).toBe(false);
    expect(second.filter!({ characterId: 2n })).toBe(true);
    expect(h.hub.visitedIds.value).toEqual([]);
    expect(h.hub.visitedApplied.value).toBe(false);
  });

  it('has no bindings without an active character', () => {
    const h = make();
    h.connect();
    expect(h.liveSql()).toEqual([]);
  });
});

describe('connections', () => {
  it('binds the whole table once a character is active, passing every row', () => {
    const h = make();
    h.connect();
    h.activeCharacter.value = character(1n, 1n);
    const binding = h.find('Q_CONNECTIONS');
    expect(binding.filter!({ fromLocationId: 9n, toLocationId: 8n })).toBe(true);
  });
});

describe('travel cooldowns', () => {
  it('keys on you plus your party, sorted and deduped, and filters those character ids', () => {
    const h = make();
    h.connect();
    h.activeCharacter.value = character(5n, 1n);
    h.partyCharacterIds.value = [9n, 3n, 5n, 3n];
    const binding = h.find('Q_COOLDOWNS_3,5,9');
    expect(binding.filter!({ characterId: 3n })).toBe(true);
    expect(binding.filter!({ characterId: 9n })).toBe(true);
    expect(binding.filter!({ characterId: 4n })).toBe(false);
  });

  it('covers only you with no party', () => {
    const h = make();
    h.connect();
    h.activeCharacter.value = character(5n, 1n);
    expect(h.live('Q_COOLDOWNS_5')).toHaveLength(1);
  });
});

describe('selected place', () => {
  it('select creates the npcs and characters bindings and select(null) disposes them', () => {
    const h = make();
    h.connect();
    h.activeCharacter.value = character(1n, 1n);
    expect(h.live('Q_NPCS_AT_5')).toHaveLength(0);
    h.hub.select(5n);
    const npcs = h.find('Q_NPCS_AT_5');
    const chars = h.find('Q_CHARS_AT_5');
    expect(npcs.filter!({ locationId: 5n })).toBe(true);
    expect(npcs.filter!({ locationId: 6n })).toBe(false);
    expect(chars.filter!({ locationId: 5n })).toBe(true);
    expect(h.hub.selectedId.value).toBe(5n);
    expect(h.hub.selectedApplied.value).toBe(false);
    npcs.applied.value = true;
    expect(h.hub.selectedApplied.value).toBe(false);
    chars.applied.value = true;
    expect(h.hub.selectedApplied.value).toBe(true);

    h.hub.select(null);
    expect(npcs.disposed).toBe(true);
    expect(chars.disposed).toBe(true);
    expect(h.hub.selectedApplied.value).toBe(false);
    expect(h.hub.npcsAtSelected.value).toEqual([]);
  });

  it('a new selection drops the previous place at once', () => {
    const h = make();
    h.connect();
    h.activeCharacter.value = character(1n, 1n);
    h.hub.select(5n);
    const old = h.find('Q_NPCS_AT_5');
    old.rows.value = [{ id: 1n, locationId: 5n }];
    expect(h.hub.npcsAtSelected.value).toHaveLength(1);
    h.hub.select(6n);
    expect(old.disposed).toBe(true);
    expect(h.hub.npcsAtSelected.value).toEqual([]);
  });
});

describe('quest givers', () => {
  it('binds npcsById for the giver ids; an empty list means no binding', () => {
    const h = make();
    h.connect();
    h.activeCharacter.value = character(1n, 1n);
    expect(h.liveSql().some((sql) => sql.startsWith('Q_GIVERS_'))).toBe(false);
    h.questGiverIds.value = [8n, 7n];
    const binding = h.find('Q_GIVERS_7,8');
    expect(binding.filter!({ id: 7n })).toBe(true);
    expect(binding.filter!({ id: 9n })).toBe(false);
    h.questGiverIds.value = [];
    expect(binding.disposed).toBe(true);
  });
});

describe('ready', () => {
  it('is false until visited, connections and cooldowns have all applied', () => {
    const h = make();
    h.connect();
    h.activeCharacter.value = character(1n, 1n);
    expect(h.hub.ready.value).toBe(false);
    h.find('Q_VISITED').applied.value = true;
    expect(h.hub.ready.value).toBe(false);
    h.find('Q_CONNECTIONS').applied.value = true;
    expect(h.hub.ready.value).toBe(false);
    h.find('Q_COOLDOWNS_1').applied.value = true;
    expect(h.hub.ready.value).toBe(true);
  });
});

describe('known places and adjacency', () => {
  it('reads visited ids plus the current place, heard-of from the connections, edges from visited sources', () => {
    const h = make();
    h.connect();
    h.activeCharacter.value = character(1n, 1n);
    applyAll(h);
    h.find('Q_VISITED').rows.value = [{ id: 1n, characterId: 1n, locationId: 2n }];
    h.find('Q_CONNECTIONS').rows.value = [
      { id: 1n, fromLocationId: 1n, toLocationId: 2n },
      { id: 2n, fromLocationId: 2n, toLocationId: 3n },
      { id: 3n, fromLocationId: 3n, toLocationId: 4n },
    ];
    const known = h.hub.known.value;
    expect([...known.visited].sort()).toEqual([1n, 2n]);
    expect([...known.heardOf]).toEqual([3n]);
    expect(known.drawn.map((l) => l.id)).toEqual([1n, 2n, 3n]);
    expect(known.edges).toEqual([
      { a: 1n, b: 2n },
      { a: 2n, b: 3n },
    ]);
    expect(h.hub.adjacency.value.get(2n)).toEqual([1n, 3n]);
  });
});

describe('timers', () => {
  const SECOND = 1_000_000;

  function row(id: bigint, characterId: bigint, readyAtMicros: number) {
    return { id, characterId, readyAtMicros: BigInt(readyAtMicros) };
  }

  it('selfTimer reads your rows only and timerFor reads another character', () => {
    const h = make();
    h.connect();
    h.activeCharacter.value = character(1n, 1n);
    h.partyCharacterIds.value = [2n];
    applyAll(h);
    h.find('Q_COOLDOWNS_1,2').rows.value = [
      row(1n, 1n, NOW + 30 * SECOND),
      row(2n, 2n, NOW + 90 * SECOND),
    ];
    expect(h.hub.selfTimer.value).toEqual({ running: true, secondsLeft: 30 });
    expect(h.hub.timerFor(2n)).toEqual({ running: true, secondsLeft: 90 });
    expect(h.hub.timerFor(3n)).toEqual({ running: false, secondsLeft: 0 });
  });

  it('ticks each second while a row is ahead and stops after the last one ends', async () => {
    const h = make();
    h.connect();
    h.activeCharacter.value = character(1n, 1n);
    applyAll(h);
    expect(vi.getTimerCount()).toBe(0);
    h.find('Q_COOLDOWNS_1').rows.value = [row(1n, 1n, NOW + 90 * SECOND)];
    await nextTick();
    expect(vi.getTimerCount()).toBe(1);

    clockNow = NOW + 30 * SECOND;
    vi.advanceTimersByTime(1000);
    expect(h.hub.nowMicros.value).toBe(NOW + 30 * SECOND);
    expect(h.hub.selfTimer.value).toEqual({ running: true, secondsLeft: 60 });

    clockNow = NOW + 91 * SECOND;
    vi.advanceTimersByTime(1000);
    await nextTick();
    expect(h.hub.selfTimer.value.running).toBe(false);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('never starts the tick for a stale, expired row', async () => {
    const h = make();
    h.connect();
    h.activeCharacter.value = character(1n, 1n);
    applyAll(h);
    h.find('Q_COOLDOWNS_1').rows.value = [row(1n, 1n, NOW - 5 * SECOND)];
    await nextTick();
    expect(vi.getTimerCount()).toBe(0);
    expect(h.hub.selfTimer.value.running).toBe(false);
  });
});

describe('selection state', () => {
  it('setters update their refs and reset clears them', () => {
    const h = make();
    h.hub.showRegion(2n);
    h.hub.setView('list');
    h.hub.setBanner('Hello');
    h.hub.select(4n);
    expect(h.hub.shownRegionId.value).toBe(2n);
    expect(h.hub.view.value).toBe('list');
    expect(h.hub.banner.value).toBe('Hello');
    expect(h.hub.selectedId.value).toBe(4n);
    h.hub.reset();
    expect(h.hub.shownRegionId.value).toBeNull();
    expect(h.hub.view.value).toBe('graph');
    expect(h.hub.banner.value).toBeNull();
    expect(h.hub.selectedId.value).toBeNull();
  });

  it('chooseRegion shows the region and counts every choice, also of the region already shown', () => {
    const h = make();
    expect(h.hub.regionChosen.value).toBe(0);
    h.hub.chooseRegion(2n);
    expect(h.hub.shownRegionId.value).toBe(2n);
    expect(h.hub.regionChosen.value).toBe(1);
    h.hub.chooseRegion(2n);
    expect(h.hub.shownRegionId.value).toBe(2n);
    expect(h.hub.regionChosen.value).toBe(2);
    h.hub.showRegion(1n);
    expect(h.hub.regionChosen.value).toBe(2);
  });

  it('dispose stops the scope and resets every keyed binding', () => {
    const h = make();
    h.connect();
    h.activeCharacter.value = character(1n, 1n);
    h.hub.select(5n);
    expect(h.liveSql().length).toBeGreaterThan(0);
    h.hub.dispose();
    expect(h.liveSql()).toEqual([]);
    expect(h.hub.selectedId.value).toBeNull();
    h.activeCharacter.value = character(2n, 1n);
    expect(h.liveSql()).toEqual([]);
  });
});
