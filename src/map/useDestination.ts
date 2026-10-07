import { computed, inject } from 'vue';
import type { Ref } from 'vue';
import { GAME_KEY, createInertGame } from '../game/context';
import { createActionRunner as makeRunner } from '../ledger/actionRunner';
import type { ActionRunner } from '../ledger/actionRunner';
import { buildDetail } from './detailModel';
import type { DetailLocation, DetailView } from './detailModel';
import { MAP_KEY, createInertMap } from './mapContext';
import { travelChecks } from './travelChecks';
import type { TravelChecks, TravellerLike } from './travelChecks';

// The selected destination as one model (51-UI-SPEC "Destination detail", "Checklist" and "Travel
// button"). The desktop detail column and, in plan 51-11, the mobile dock both read this, so the two
// surfaces can never disagree and they share one action runner and one notice line.
//
// The Map never uses the console travel path: that one closes the screen and echoes a feed line. The
// Map calls the move reducer itself through the shared action runner (inert while a call is pending,
// nothing optimistic) and the server's refusal shows in the notice line. Arrival is detected from the
// character row by the Map screen, never from this call.
//
// The checks and the button are a prediction. The server re-checks every trip.

export interface Destination {
  /** Travel checks for a neighbour selection; null for your place, far places and no selection. */
  readonly checks: Readonly<Ref<TravelChecks | null>>;
  /** The detail model; null until the map data has applied and your place is known. */
  readonly detail: Readonly<Ref<DetailView | null>>;
  readonly runner: ActionRunner;
  /** A trip is in flight: this Map's own call, or one sent from the rail or the exit chips. */
  readonly pending: Readonly<Ref<boolean>>;
  /** Runs the move for a Travel or Cross button that is not blocked. True when the call resolved. */
  travel(): Promise<boolean>;
  /** Selects the first stop of a far place's route (local; never travels). Its id, or null. */
  selectFirstStop(): bigint | null;
  /**
   * True when the character arrived where this Map's own Travel last sent it. Call it on every
   * arrival: it answers once and forgets the trip, so a later arrival (a leader's move, a respawn)
   * is never taken for one the player started here.
   */
  isOwnArrival(locationId: bigint): boolean;
}

function asId(value: bigint | undefined): bigint | null {
  return value === undefined || value === 0n ? null : value;
}

export function useDestination(): Destination {
  const game = inject(GAME_KEY, createInertGame());
  const map = inject(MAP_KEY, createInertMap());

  const runner = makeRunner({ online: game.connected });
  // Where this Map's own Travel last sent the character; cleared by the next arrival or a rejection.
  let sentTo: bigint | null = null;

  const currentId = computed(() => asId(game.character.value?.locationId));
  const placeById = computed(() => {
    const out = new Map<bigint, DetailLocation>();
    for (const location of map.known.value.drawn) out.set(location.id, location);
    return out;
  });
  const regionName = (id: bigint): string => game.regions.value.find((r) => r.id === id)?.name ?? 'Unknown region';

  /** The selected place when it is next to yours, else null. */
  const neighbourId = computed<bigint | null>(() => {
    const here = currentId.value;
    const picked = map.selectedId.value;
    if (here === null || picked === null || picked === here) return null;
    if (!placeById.value.has(picked)) return null;
    return (map.adjacency.value.get(here) ?? []).includes(picked) ? picked : null;
  });

  const checks = computed<TravelChecks | null>(() => {
    const character = game.character.value;
    const here = currentId.value;
    const there = neighbourId.value;
    if (!map.ready.value || !character || here === null || there === null) return null;
    const origin = placeById.value.get(here);
    const destination = placeById.value.get(there);
    if (!origin || !destination) return null;
    const traveller = (row: TravellerLike): TravellerLike => ({
      id: row.id,
      name: row.name,
      locationId: row.locationId,
      stamina: row.stamina,
      racialTravelCostIncrease: row.racialTravelCostIncrease,
      racialTravelCostDiscount: row.racialTravelCostDiscount,
    });
    const group = game.group.value;
    return travelChecks({
      self: traveller(character),
      origin: { id: origin.id, regionId: origin.regionId },
      destination: { id: destination.id, regionId: destination.regionId },
      regionName,
      group: group ? { leaderCharacterId: group.leaderCharacterId } : null,
      members: game.groupMembers.value,
      characters: game.knownCharacters.value.map(traveller),
      effects: game.effects.value,
      cooldowns: map.cooldowns.value,
      nowMicros: map.nowMicros.value,
      gathering: game.gathers.value.length > 0,
    });
  });

  const detail = computed<DetailView | null>(() => {
    const character = game.character.value;
    if (!map.ready.value || !character || currentId.value === null) return null;
    const bound = asId(character.boundLocationId);
    return buildDetail({
      selected: map.selectedId.value,
      current: currentId.value,
      locations: placeById.value,
      regions: game.regions.value,
      visited: map.known.value.visited,
      heardOf: map.known.value.heardOf,
      adjacency: map.adjacency.value,
      playerLevel: Number(character.level),
      selfId: character.id,
      boundLocationId: bound,
      npcsAtSelected: map.npcsAtSelected.value,
      charactersAtSelected: map.charactersAtSelected.value,
      peopleApplied: map.selectedApplied.value,
      quests: game.quests.value,
      questTemplates: game.questTemplates.value,
      giverNpcs: map.giverNpcs.value,
      checks: checks.value,
      connected: game.connected.value,
    });
  });

  async function travel(): Promise<boolean> {
    const action = detail.value?.action;
    const character = game.character.value;
    const reducers = game.reducers.value;
    const locationId = neighbourId.value;
    if (!action || !character || !reducers || locationId === null) return false;
    if ((action.kind !== 'travel' && action.kind !== 'cross') || action.disabled) return false;
    if (runner.isPending('travel') || !game.connected.value) return false;
    // The session's one travel guard: a trip sent from the rail or the chips blocks this one too.
    if (!map.beginTrip()) return false;
    // A new trip ends the previous arrival banner; the arrival of this one shows its own.
    map.setBanner(null);
    const characterId = character.id;
    sentTo = locationId;
    const ok = await runner.run('travel', () => reducers.moveCharacter({ characterId, locationId }));
    if (!ok) {
      // Nothing is in flight after a rejected send: release the guard so Try again works.
      map.endTrip();
      if (sentTo === locationId) sentTo = null;
    }
    return ok;
  }

  function isOwnArrival(locationId: bigint): boolean {
    const own = sentTo !== null && sentTo === locationId;
    sentTo = null;
    return own;
  }

  function selectFirstStop(): bigint | null {
    const action = detail.value?.action;
    if (!action || action.kind !== 'firstStop' || action.firstStopId === null) return null;
    map.setBanner(null);
    map.select(action.firstStopId);
    return action.firstStopId;
  }

  const pending = computed(() => runner.pending.value.has('travel') || map.travelPending.value);

  return { checks, detail, runner, pending, travel, selectFirstStop, isOwnArrival };
}
