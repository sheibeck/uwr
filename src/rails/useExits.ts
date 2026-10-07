import { computed, inject, onBeforeUnmount, ref, watch } from 'vue';
import type { ComputedRef, Ref } from 'vue';
import { GAME_KEY, createInertGame } from '../game/context';
import { placeDanger } from '../map/danger';
import type { PlaceDanger } from '../map/danger';
import { MAP_KEY, createInertMap } from '../map/mapContext';
import { terrainOf } from '../map/terrain';
import type { TerrainInfo } from '../map/terrain';
import { travelChecks } from '../map/travelChecks';
import type { TravellerLike } from '../map/travelChecks';
import { UNKNOWN_PLACE, describePlace } from '../session/frameView';
import { exitRows } from './exits';
import type { ExitLocation, ExitRow } from './exits';
import { routesFrom } from './levelRange';

// The rail travel panel's data, shared by the Here card (desktop rail and the mobile Map sheet) and
// the mobile exit chips (plan 51-10). One source for the exit rows so the two surfaces never
// disagree. The components send travel through the console (consoleApi.travel): it echoes the request
// and calls the move reducer, and the server's arrival lines are the feed. Nothing optimistic is shown.

export interface HereView {
  /** 'Here · {Region}', or 'Here' when the place is unknown. */
  kicker: string;
  title: string;
  regionName: string;
  terrain: TerrainInfo;
  danger: PlaceDanger;
}

export interface ExitsPanel {
  readonly character: ComputedRef<{ id: bigint; locationId: bigint } | null>;
  readonly connected: ComputedRef<boolean>;
  /** The map hub has applied: the exits render only then. */
  readonly ready: ComputedRef<boolean>;
  readonly here: ComputedRef<HereView | null>;
  readonly rows: ComputedRef<ExitRow[]>;
  readonly timer: ComputedRef<{ running: boolean; secondsLeft: number }>;
  /** A trip was requested and the character row has not changed yet. */
  readonly pending: Ref<boolean>;
  /** True when a trip may start now (online, not blocked, none pending); marks it pending. */
  beginTravel(row: ExitRow): boolean;
}

// A refused trip leaves the character where it was, so the guard also lapses by itself.
const PENDING_MS = 2000;

export function usePlaceView(): ComputedRef<HereView | null> {
  const game = inject(GAME_KEY, createInertGame());
  return computed<HereView | null>(() => {
    const character = game.character.value;
    if (!character) return null;
    const locations = game.locations.value;
    const described = describePlace(character.locationId, locations, game.regions.value);
    const location = locations.find((l) => l.id === character.locationId);
    if (described.locationName === UNKNOWN_PLACE || !location) return null;
    const region = game.regions.value.find((r) => r.id === location.regionId);
    return {
      kicker: `Here · ${region ? region.name : UNKNOWN_PLACE}`,
      title: described.locationName,
      regionName: region ? region.name : UNKNOWN_PLACE,
      terrain: terrainOf(location.terrainType ?? ''),
      danger: placeDanger(location, game.regions.value, Number(character.level)),
    };
  });
}

export function useExits(): ExitsPanel {
  const game = inject(GAME_KEY, createInertGame());
  const map = inject(MAP_KEY, createInertMap());

  const character = computed(() => game.character.value);
  const connected = computed(() => game.connected.value);
  const ready = computed(() => map.ready.value);
  const here = usePlaceView();
  const timer = computed(() => map.selfTimer.value);

  const locationsById = computed(() => {
    const out = new Map<bigint, ExitLocation>();
    for (const location of game.locations.value) out.set(location.id, location);
    return out;
  });

  const rows = computed<ExitRow[]>(() => {
    const me = character.value;
    if (!me || !map.ready.value) return [];
    const origin = locationsById.value.get(me.locationId) ?? null;
    const regions = game.regions.value;
    const regionName = (id: bigint): string => regions.find((r) => r.id === id)?.name ?? 'Unknown region';
    const traveller = (row: TravellerLike): TravellerLike => ({
      id: row.id,
      name: row.name,
      locationId: row.locationId,
      stamina: row.stamina,
      racialTravelCostIncrease: row.racialTravelCostIncrease,
      racialTravelCostDiscount: row.racialTravelCostDiscount,
    });
    const group = game.group.value;
    const members = game.groupMembers.value;
    const characters = game.knownCharacters.value.map(traveller);
    const self = traveller(me);
    const gathering = game.gathers.value.length > 0;
    return exitRows({
      routes: routesFrom(game.connections.value, me.locationId, game.locations.value, regions),
      here: origin,
      locations: locationsById.value,
      regions,
      heardOf: map.known.value.heardOf,
      playerLevel: Number(me.level),
      connected: connected.value,
      checksFor: (destination) =>
        travelChecks({
          self,
          origin: origin ? { id: origin.id, regionId: origin.regionId } : null,
          destination: { id: destination.id, regionId: destination.regionId },
          regionName,
          group: group ? { leaderCharacterId: group.leaderCharacterId } : null,
          members,
          characters,
          effects: game.effects.value,
          cooldowns: map.cooldowns.value,
          nowMicros: map.nowMicros.value,
          gathering,
        }),
    });
  });

  const pending = ref(false);
  let release: ReturnType<typeof setTimeout> | null = null;
  function clearRelease(): void {
    if (release !== null) clearTimeout(release);
    release = null;
  }
  watch(
    () => character.value?.locationId,
    () => {
      clearRelease();
      pending.value = false;
    },
  );
  onBeforeUnmount(clearRelease);

  function beginTravel(row: ExitRow): boolean {
    if (!connected.value || row.button.disabled || pending.value) return false;
    pending.value = true;
    clearRelease();
    release = setTimeout(() => {
      pending.value = false;
      release = null;
    }, PENDING_MS);
    return true;
  }

  return { character, connected, ready, here, rows, timer, pending, beginTravel };
}
