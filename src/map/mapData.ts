import { computed, effectScope, shallowRef, watch } from 'vue';
import type { Ref, ShallowRef } from 'vue';
import type {
  Character,
  Location,
  LocationConnection,
  Npc,
  Region,
  TravelCooldown,
  VisitedLocation,
} from '../module_bindings/types';
import type { ConnectionStatus } from '../net/connection';
import type { BindTableOptions, ConnLike, TableBinding, TableLike } from '../net/bindTable';
import { createKeyed, idListKey, keyedRows, parseIdListKey } from '../game/keyedBinding';
import type { KnownPlacesResult, MapData, MapView } from './mapContext';
import type { MapQueries } from './queries';
import { createSecondsTick } from './secondsTick';
import { knownPlaces } from './knownPlaces';
import { adjacencyOf } from './route';
import { travelTimer } from './travelTimer';
import { createTripGuard } from './tripGuard';

// The Map hub (Phase 51): the session-owned subscriptions of the Map screen and the rail travel
// panel, the shared 1-second timer tick and the selection state the Map's sibling components share.
// It is separate from the Phase 47 game hub and the Phase 50 ledger hub on purpose.
//
// Scope and key of each subscription:
//   my_visited_locations  key: the active character id (the view is scoped by the sender on the
//                         server; the private visited_location table is never subscribed). Swaps
//                         immediately, so a previous character's places never show.
//   location_connection   key: 'all' once a character is active (the whole table, about 48 rows)
//   travel_cooldown       key: ids of you plus your party members (character_id)
//   npc                   key: the selected place id (location_id), swaps immediately
//   character             key: the selected place id (location_id), swaps immediately
//   npc (quest givers)    key: ids of the NPCs who give your active quests; none, no binding
//
// Shared-cache rule: the SDK cache is shared by every subscription of the same table, so each
// keyed binding passes a filter equal to its query. Nothing is optimistic: rows drive every change.
// Timers come only from readyAtMicros and the server clock; the client never computes a reduction.

type Row<T> = TableLike<T>;

export interface MapConn extends ConnLike {
  db: {
    myVisitedLocations: Row<VisitedLocation>;
    locationConnection: Row<LocationConnection>;
    travelCooldown: Row<TravelCooldown>;
    npc: Row<Npc>;
    character: Row<Character>;
  };
}

export interface MapInput<C> {
  conn: Readonly<ShallowRef<C | null>>;
  status: Readonly<Ref<ConnectionStatus>>;
  character: Readonly<Ref<Character | null>>;
  locations: Readonly<Ref<readonly Location[]>>;
  regions: Readonly<Ref<readonly Region[]>>;
  /** Character ids of your party members other than your own. */
  partyCharacterIds: Readonly<Ref<readonly bigint[]>>;
  /** Ids of the NPCs who give your active quests. */
  questGiverIds: Readonly<Ref<readonly bigint[]>>;
  clock: { nowMicros(): number };
}

export interface MapDeps<C> {
  bind: <R>(options: BindTableOptions<C, R>) => TableBinding<C, R>;
  queries: MapQueries;
}

const ALL_KEY = 'all';

export function createMapData<C extends MapConn>(deps: MapDeps<C>, input: MapInput<C>): MapData {
  const { queries } = deps;
  // Every watcher and keyed binding lives in one child scope, so dispose() can stop them all
  // and the session scope still stops them when it ends.
  const scope = effectScope();

  const selectedId = shallowRef<bigint | null>(null);
  const shownRegionId = shallowRef<bigint | null>(null);
  const view = shallowRef<MapView>('graph');
  const banner = shallowRef<string | null>(null);
  const regionChosen = shallowRef(0);
  // The one travel guard of the session (rail rows, exit chips and the Map all ask it).
  const trip = createTripGuard();

  const connected = computed(() => input.status.value === 'connected' && input.conn.value !== null);
  const characterKey = computed<bigint | null>(() => input.character.value?.id ?? null);
  const connectionsKey = computed<string | null>(() => (characterKey.value === null ? null : ALL_KEY));
  const cooldownKey = computed<string | null>(() => {
    const own = characterKey.value;
    if (own === null) return null;
    return idListKey([own, ...input.partyCharacterIds.value]);
  });
  const giverKey = computed<string | null>(() => idListKey(input.questGiverIds.value));

  const run = scope.run(() => {
    function keyedTable<R, K extends bigint | string>(
      key: Readonly<Ref<K | null>>,
      table: (c: C) => TableLike<R>,
      sql: (k: K) => string,
      matches: (row: R, k: K) => boolean,
      swap: 'onApplied' | 'immediate' = 'onApplied',
    ) {
      return createKeyed<C, K, TableBinding<C, R>>({
        key,
        conn: input.conn,
        swap,
        make: (k) => deps.bind<R>({ table, sql: [sql(k)], filter: (row) => matches(row, k) }),
      });
    }

    function keyedIdList<R>(
      key: Readonly<Ref<string | null>>,
      table: (c: C) => TableLike<R>,
      sql: (ids: bigint[]) => string,
      idOf: (row: R) => bigint,
    ) {
      return createKeyed<C, string, TableBinding<C, R>>({
        key,
        conn: input.conn,
        make: (k) => {
          const ids = parseIdListKey(k);
          const set = new Set(ids);
          return deps.bind<R>({ table, sql: [sql(ids)], filter: (row) => set.has(idOf(row)) });
        },
      });
    }

    // Immediate swap: after a character switch the previous character's places must never stay
    // current until the new subscription applies. The filter by characterId drops them from the
    // shared cache too.
    const visitedKeyed = keyedTable<VisitedLocation, bigint>(
      characterKey,
      (c) => c.db.myVisitedLocations,
      () => queries.myVisitedLocations,
      (row, k) => row.characterId === k,
      'immediate',
    );
    const connectionsKeyed = keyedTable<LocationConnection, string>(
      connectionsKey,
      (c) => c.db.locationConnection,
      () => queries.connections,
      () => true,
    );
    const cooldownsKeyed = keyedIdList<TravelCooldown>(
      cooldownKey,
      (c) => c.db.travelCooldown,
      queries.travelCooldowns,
      (row) => row.characterId,
    );
    // Immediate swap: a new selection must never show the previous place's people.
    const npcsAtKeyed = keyedTable<Npc, bigint>(
      selectedId,
      (c) => c.db.npc,
      queries.npcsAt,
      (row, k) => row.locationId === k,
      'immediate',
    );
    const charactersAtKeyed = keyedTable<Character, bigint>(
      selectedId,
      (c) => c.db.character,
      queries.charactersAt,
      (row, k) => row.locationId === k,
      'immediate',
    );
    const giversKeyed = keyedIdList<Npc>(giverKey, (c) => c.db.npc, queries.npcsById, (row) => row.id);

    const visitedRows = keyedRows(visitedKeyed);
    const connections = keyedRows(connectionsKeyed);
    const cooldowns = keyedRows(cooldownsKeyed);

    const visitedIds = computed<readonly bigint[]>(() => visitedRows.value.map((row) => row.locationId));
    const visitedApplied = computed(() => visitedKeyed.current.value?.applied.value ?? false);
    const connectionsApplied = computed(() => connectionsKeyed.current.value?.applied.value ?? false);
    const cooldownsApplied = computed(() => cooldownsKeyed.current.value?.applied.value ?? false);
    const ready = computed(
      () => visitedApplied.value && connectionsApplied.value && cooldownsApplied.value,
    );

    const known = computed<KnownPlacesResult>(() => {
      const here = input.character.value?.locationId ?? 0n;
      return knownPlaces<Location>({
        visitedIds: visitedIds.value,
        currentLocationId: here === 0n ? null : here,
        connections: connections.value,
        locations: input.locations.value,
      });
    });
    const adjacency = computed(() => adjacencyOf(known.value.edges));

    // The 1-second tick runs only while a travel_cooldown row is in the future. Its own sample
    // decides, so it stops itself when the last row ends. Until the tick exists the clock decides.
    const tickNow = shallowRef(null) as ShallowRef<Readonly<Ref<number>> | null>;
    const latestReady = computed<bigint | null>(() => {
      let latest: bigint | null = null;
      for (const row of cooldowns.value) {
        if (latest === null || row.readyAtMicros > latest) latest = row.readyAtMicros;
      }
      return latest;
    });
    const tickActive = computed(() => {
      const latest = latestReady.value;
      if (latest === null) return false;
      const now = tickNow.value?.value ?? input.clock.nowMicros();
      return Number(latest) > now;
    });
    const tick = createSecondsTick({ clock: input.clock, active: tickActive });
    tickNow.value = tick.nowMicros;
    // New or changed rows sample the clock at once, so a timer never reads a stale second.
    watch(cooldowns, () => tick.refresh(), { flush: 'sync' });

    // An arrival (or a character switch) ends the pending trip.
    watch(
      () => `${input.character.value?.id ?? ''}:${input.character.value?.locationId ?? ''}`,
      () => trip.end(),
      { flush: 'sync' },
    );

    const nowMicros = tick.nowMicros;
    const selfTimer = computed(() => {
      const own = characterKey.value;
      return travelTimer(
        own === null ? [] : cooldowns.value.filter((row) => row.characterId === own),
        nowMicros.value,
      );
    });
    function timerFor(characterId: bigint) {
      return travelTimer(
        cooldowns.value.filter((row) => row.characterId === characterId),
        nowMicros.value,
      );
    }

    const selectedApplied = computed(
      () =>
        selectedId.value !== null &&
        (npcsAtKeyed.current.value?.applied.value ?? false) &&
        (charactersAtKeyed.current.value?.applied.value ?? false),
    );

    return {
      keyed: [
        visitedKeyed,
        connectionsKeyed,
        cooldownsKeyed,
        npcsAtKeyed,
        charactersAtKeyed,
        giversKeyed,
      ],
      visitedIds,
      visitedApplied,
      connections,
      connectionsApplied,
      cooldowns,
      cooldownsApplied,
      ready,
      known,
      adjacency,
      nowMicros,
      selfTimer,
      timerFor,
      npcsAtSelected: keyedRows(npcsAtKeyed),
      charactersAtSelected: keyedRows(charactersAtKeyed),
      selectedApplied,
      giverNpcs: keyedRows(giversKeyed),
    };
  })!;

  function reset(): void {
    selectedId.value = null;
    shownRegionId.value = null;
    view.value = 'graph';
    banner.value = null;
    trip.end();
  }

  function dispose(): void {
    reset();
    scope.stop();
    for (const keyed of run.keyed) keyed.reset();
  }

  return {
    connected,
    visitedIds: run.visitedIds,
    visitedApplied: run.visitedApplied,
    connections: run.connections,
    connectionsApplied: run.connectionsApplied,
    cooldowns: run.cooldowns,
    cooldownsApplied: run.cooldownsApplied,
    ready: run.ready,
    known: run.known,
    adjacency: run.adjacency,
    nowMicros: run.nowMicros,
    selfTimer: run.selfTimer,
    timerFor: run.timerFor,
    selectedId,
    shownRegionId,
    view,
    banner,
    regionChosen,
    select(id) {
      selectedId.value = id;
    },
    showRegion(id) {
      shownRegionId.value = id;
    },
    chooseRegion(id) {
      shownRegionId.value = id;
      regionChosen.value += 1;
    },
    setView(next) {
      view.value = next;
    },
    setBanner(text) {
      banner.value = text;
    },
    npcsAtSelected: run.npcsAtSelected,
    charactersAtSelected: run.charactersAtSelected,
    selectedApplied: run.selectedApplied,
    giverNpcs: run.giverNpcs,
    travelPending: trip.pending,
    beginTrip: trip.begin,
    endTrip: trip.end,
    reset,
    dispose,
  };
}
