import { toSql } from 'spacetimedb';
import type { Identity } from 'spacetimedb';
import { tables } from '../module_bindings';

// Typed, filtered subscription SQL for the creation interview (Phase 49). character_creation_state,
// event_creation and world_gen_state are public tables, so the client scopes each one to the
// player's own identity and never subscribes them unfiltered (the filter scopes, it does not
// protect: T-49-21). race_definition is already public and holds the stored races; it is
// subscribed whole, and only while the creation view is mounted.

export interface CreationQueries {
  creationState(identity: Identity): string;
  eventCreation(identity: Identity): string;
  worldGenState(identity: Identity): string;
  raceDefinitions: string;
}

export function creationQueries(): CreationQueries {
  return {
    creationState: (identity) =>
      toSql(tables.characterCreationState.where((r) => r.playerId.eq(identity))),
    eventCreation: (identity) => toSql(tables.eventCreation.where((r) => r.playerId.eq(identity))),
    worldGenState: (identity) => toSql(tables.worldGenState.where((r) => r.playerId.eq(identity))),
    raceDefinitions: toSql(tables.raceDefinition),
  };
}
