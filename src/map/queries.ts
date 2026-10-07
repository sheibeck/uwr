import { toSql } from 'spacetimedb';
import { tables } from '../module_bindings';

// Typed subscription SQL for the Map hub (Phase 51). What each binding is for:
//   myVisitedLocations  the places the active character has been. The private visited_location
//                       table is never subscribed: the rows come only from the per-sender
//                       my_visited_locations view, which the server scopes to the caller (no WHERE).
//   connections         the whole location_connection table: the graph's edges (about 48 rows; the
//                       session already holds the whole location and region tables).
//   travelCooldowns     travel_cooldown rows of you and your party members, for the travel timers.
//   npcsAt, charactersAt  who is at the selected place (the detail's NPC and player lines).
//   npcsById            the NPCs who give your active quests.

export interface MapQueries {
  /** The sender's own visited places (per-sender view, no WHERE). */
  myVisitedLocations: string;
  /** Every connection between two places. */
  connections: string;
  /** Non-empty list: an OR chain on character_id. */
  travelCooldowns(ids: readonly bigint[]): string;
  npcsAt(locationId: bigint): string;
  charactersAt(locationId: bigint): string;
  /** Non-empty list: an OR chain on id. */
  npcsById(ids: readonly bigint[]): string;
}

function requireIds(ids: readonly bigint[]): void {
  if (ids.length === 0) throw new Error('[map queries] an id list must not be empty');
}

export function mapQueries(): MapQueries {
  return {
    myVisitedLocations: toSql(tables.myVisitedLocations),
    connections: toSql(tables.locationConnection),
    travelCooldowns: (ids) => {
      requireIds(ids);
      return toSql(
        tables.travelCooldown.where((r) =>
          ids.map((id) => r.characterId.eq(id)).reduce((a, b) => a.or(b)),
        ),
      );
    },
    npcsAt: (locationId) => toSql(tables.npc.where((r) => r.locationId.eq(locationId))),
    charactersAt: (locationId) =>
      toSql(tables.character.where((r) => r.locationId.eq(locationId))),
    npcsById: (ids) => {
      requireIds(ids);
      return toSql(
        tables.npc.where((r) => ids.map((id) => r.id.eq(id)).reduce((a, b) => a.or(b))),
      );
    },
  };
}
