import { computed } from 'vue';
import type { InjectionKey, Ref } from 'vue';
import type {
  Character,
  Location,
  LocationConnection,
  Npc,
  TravelCooldown,
} from '../module_bindings/types';
import type { KnownPlaces } from './knownPlaces';
import { createTripGuard } from './tripGuard';
import type { TravelTimer } from './travelTimer';

// The Map data contract (Phase 51): what the Map screen, its header chips and the rail travel
// panel read. The session owns the hub; components inject it through MAP_KEY and mount bare
// against the inert default (tests and the Phase 45 shell).

type List<T> = Readonly<Ref<readonly T[]>>;

/** Known places over the session's whole location list (the shape knownPlaces returns). */
export type KnownPlacesResult = KnownPlaces<Location>;

export type MapView = 'graph' | 'list';

export interface MapData {
  /** The socket is connected and a connection object exists. */
  readonly connected: Readonly<Ref<boolean>>;
  /** Location ids the active character has visited (my_visited_locations, this character only). */
  readonly visitedIds: List<bigint>;
  readonly visitedApplied: Readonly<Ref<boolean>>;
  /** Every location_connection row. */
  readonly connections: List<LocationConnection>;
  readonly connectionsApplied: Readonly<Ref<boolean>>;
  /** travel_cooldown rows of you and your party members. */
  readonly cooldowns: List<TravelCooldown>;
  readonly cooldownsApplied: Readonly<Ref<boolean>>;
  /** Visited, connections and cooldowns have all applied: nothing renders before. */
  readonly ready: Readonly<Ref<boolean>>;
  /** Visited and heard-of places, and the revealed edges. */
  readonly known: Readonly<Ref<KnownPlacesResult>>;
  /** Adjacency over the revealed edges of every region. */
  readonly adjacency: Readonly<Ref<ReadonlyMap<bigint, bigint[]>>>;
  /** Server-clock microseconds, refreshed each second while a timer runs. */
  readonly nowMicros: Readonly<Ref<number>>;
  /** Your region travel timer. */
  readonly selfTimer: Readonly<Ref<TravelTimer>>;
  /** The region travel timer of a character (you or a party member). */
  timerFor(characterId: bigint): TravelTimer;
  readonly selectedId: Readonly<Ref<bigint | null>>;
  readonly shownRegionId: Readonly<Ref<bigint | null>>;
  readonly view: Readonly<Ref<MapView>>;
  readonly banner: Readonly<Ref<string | null>>;
  /** Counts region chip choices, including a chip of the region already shown. */
  readonly regionChosen: Readonly<Ref<number>>;
  select(id: bigint | null): void;
  showRegion(id: bigint | null): void;
  /**
   * A region chip was chosen: shows that region and counts the choice, so the Map screen moves
   * focus into the graph even when the region (or the selection in it) does not change.
   */
  chooseRegion(id: bigint): void;
  setView(view: MapView): void;
  setBanner(text: string | null): void;
  /** NPCs at the selected place; empty while nothing is selected. */
  readonly npcsAtSelected: List<Npc>;
  /** Characters at the selected place; empty while nothing is selected. */
  readonly charactersAtSelected: List<Character>;
  /** The selected place's subscriptions have applied (false with no selection). */
  readonly selectedApplied: Readonly<Ref<boolean>>;
  /** The NPCs who give your active quests. */
  readonly giverNpcs: List<Npc>;
  /**
   * A trip was sent (from a rail row, an exit chip or the Map) and the character's place has not
   * changed yet. One flag for every travel surface, so two surfaces cannot send two moves.
   */
  readonly travelPending: Readonly<Ref<boolean>>;
  /** Marks a trip pending and returns true; false (send nothing) while one already is. */
  beginTrip(): boolean;
  /** Ends the pending trip now (a rejected send). An arrival ends it by itself. */
  endTrip(): void;
  /** Forget the selection, view, banner and shown region (logout). */
  reset(): void;
  /** Dispose every binding and watcher. */
  dispose(): void;
}

export const MAP_KEY: InjectionKey<MapData> = Symbol('uwr.map');

// A constant, read-only ref. computed() keeps rows out of deep reactivity.
function constant<T>(value: T): Readonly<Ref<T>> {
  return computed(() => value);
}

function empty<T>(): List<T> {
  return constant<readonly T[]>([]);
}

const IDLE_TIMER: TravelTimer = { running: false, secondsLeft: 0 };

export function createInertMap(): MapData {
  // A working guard even without a session: a bare surface still sends one move at a time. With no
  // character row to watch it lapses only by time.
  const trip = createTripGuard();
  return {
    connected: constant(false),
    visitedIds: empty<bigint>(),
    visitedApplied: constant(false),
    connections: empty<LocationConnection>(),
    connectionsApplied: constant(false),
    cooldowns: empty<TravelCooldown>(),
    cooldownsApplied: constant(false),
    ready: constant(false),
    known: constant<KnownPlacesResult>({
      visited: new Set(),
      heardOf: new Set(),
      drawn: [],
      knownRegionIds: [],
      edges: [],
    }),
    adjacency: constant<ReadonlyMap<bigint, bigint[]>>(new Map()),
    nowMicros: constant(0),
    selfTimer: constant<TravelTimer>(IDLE_TIMER),
    timerFor: () => IDLE_TIMER,
    selectedId: constant<bigint | null>(null),
    shownRegionId: constant<bigint | null>(null),
    view: constant<MapView>('graph'),
    banner: constant<string | null>(null),
    regionChosen: constant(0),
    select() {},
    showRegion() {},
    chooseRegion() {},
    setView() {},
    setBanner() {},
    npcsAtSelected: empty<Npc>(),
    charactersAtSelected: empty<Character>(),
    selectedApplied: constant(false),
    giverNpcs: empty<Npc>(),
    travelPending: trip.pending,
    beginTrip: trip.begin,
    endTrip: trip.end,
    reset() {},
    dispose() {},
  };
}
