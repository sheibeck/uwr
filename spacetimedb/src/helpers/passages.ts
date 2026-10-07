// ============================================================================
// Passages: an explored region edge is a stop only while someone stands in it
// ============================================================================
//
// When a player crosses an uncharted edge, the edge place is renamed in place into a passage
// (terrainType 'passage', helpers/llm_apply.ts applyWorldStartResult), so its regionId is the
// region it ends: the "own side". The owner's rule: the passage stays while anyone stands in it;
// the last to leave, in either direction, collapses it into a direct border crossing. Collapse
// links every own-side neighbour to every far-side neighbour (both directed rows), moves or
// deletes every row that points at the passage, and deletes the passage and its connections, all
// in the same transaction. The map later draws that link as a border crossing.
//
// The departure check (collapsePassageIfEmpty) runs ONCE, after every traveller of a trip (the
// leader and its followers) has moved. Checking per traveller would delete the passage while a
// follower still has to move out of it and target a deleted place.
//
// Rows that point at the passage are classified by PASSAGE_LOCATION_COLUMNS: re-homed to the
// lowest-id own-side neighbour (they are still meaningful there), deleted (they only make sense
// at the passage), kept (history), handled by the collapse itself, or ignored (transient).
//
// Offline characters would hold a passage open forever, so a guarded periodic sweep (the
// sweep_passages scheduled reducer) returns each offline character standing in a passage to its
// own side and then collapses the passage if it is empty. The first tick is also the one-time
// cleanup of passages that existed before collapse did.
// ============================================================================

import { activeCombatIdForCharacter } from './events';
import { areLocationsConnected } from './location';
import { onlineCharacterIds } from './online';
import { markLocationVisited, visitedRowFor } from './visited';

/** The passage sweep runs every 5 minutes (the sweep_inactivity interval). */
export const PASSAGE_SWEEP_INTERVAL_MICROS = 300_000_000n;

/**
 * Every location-id column in schema/tables.ts (`locationId` or any `*LocationId`), classified as
 * '<table>.<column>' exactly once. A NEW location-id column must be added here; the schema
 * coverage test in passages.test.ts fails until it is.
 */
export const PASSAGE_LOCATION_COLUMNS: {
  rehome: string[];
  remove: string[];
  keep: string[];
  collapse: string[];
  ignore: string[];
} = {
  // Moved to the lowest-id own-side neighbour.
  rehome: [
    'character.boundLocationId',
    'quest_template.targetLocationId',
    'quest_template.sourceLocationId',
    'quest_item.locationId',
    'named_enemy.locationId',
    'corpse.locationId',
    'event_objective.locationId',
    // A live world event's collectibles: collect_event_item needs them reachable and counts each
    // pickup as event contribution, so they are re-homed, not deleted.
    'event_spawn_item.locationId',
    // A live world event's enemy links: re-homed with their enemy_spawn (see enemy_spawn below), so
    // a kill objective at the passage stays achievable at the same place as its enemies.
    'event_spawn_enemy.locationId',
    'npc.locationId',
    'vendor_buyback.locationId',
    'combat_encounter.locationId',
    // Only on the passage's neighbours' rows (an arrival from the passage lands on a neighbour): a
    // far-side row now comes from the own-side home, which the collapse links to it; an own-side
    // row loses its origin (undefined), since the crossing does not run between own-side places.
    'visited_location.fromLocationId',
  ],
  // Deleted: they only make sense at the passage.
  remove: [
    'search_result.locationId',
    'resource_node.locationId',
    // Except a world event's spawn (it has an event_spawn_enemy link): that one is re-homed with
    // its members, like the event's objectives and items.
    'enemy_spawn.locationId',
    'location_enemy_template.locationId',
    'enemy_respawn_tick.locationId',
    'pull_state.locationId',
    'visited_location.locationId',
  ],
  // History: a deleted id stays on rows at other places and matches no place later.
  keep: [
    'world_gen_state.sourceLocationId',
    'world_state.startingLocationId',
  ],
  // Handled by the collapse itself.
  collapse: [
    'location_connection.fromLocationId',
    'location_connection.toLocationId',
    'character.locationId',
  ],
  // `event: true` transient table: its rows never persist past the transaction.
  ignore: ['event_location.locationId'],
};

const byIdAsc = (a: any, b: any): number => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);

/**
 * The neighbours of a passage through both location_connection.by_from and by_to, deduped, split
 * into the own side (same regionId as the passage) and the far side (another region), each ordered
 * by id. A place linked only one way (X -> passage, or passage -> X) still counts, so the collapse
 * gives it a crossing instead of deleting its only link and stranding it.
 */
export function passageSides(ctx: any, passage: any): { own: any[]; far: any[] } {
  const own: any[] = [];
  const far: any[] = [];
  const seen = new Set<bigint>();
  const neighbourIds: bigint[] = [
    ...[...ctx.db.location_connection.by_from.filter(passage.id)].map((row: any) => row.toLocationId),
    ...[...ctx.db.location_connection.by_to.filter(passage.id)].map((row: any) => row.fromLocationId),
  ];
  for (const neighbourId of neighbourIds) {
    if (seen.has(neighbourId)) continue;
    seen.add(neighbourId);
    const neighbour = ctx.db.location.id.find(neighbourId);
    if (!neighbour || neighbour.id === passage.id) continue;
    (neighbour.regionId === passage.regionId ? own : far).push(neighbour);
  }
  own.sort(byIdAsc);
  far.sort(byIdAsc);
  return { own, far };
}

/**
 * Rows of a table whose `column` equals the passage id (collected first, so writes are safe).
 * `indexed` uses the table's by_location index. The others (character.boundLocationId,
 * quest_template, event_objective, vendor_buyback, search_result, event_spawn_enemy,
 * enemy_respawn_tick) have no index on the column, so they are scanned. That cost is accepted
 * (review IN-02): a collapse happens once per explored edge. Adding an index to an existing table
 * was left out until a local publish confirms it migrates without a clear.
 */
function rowsAt(ctx: any, tableName: string, column: string, passageId: bigint, indexed: boolean): any[] {
  if (indexed) return [...ctx.db[tableName].by_location.filter(passageId)];
  return [...ctx.db[tableName].iter()].filter((row: any) => row[column] === passageId);
}

/**
 * Point every row that references the passage at `home`, or delete it, per PASSAGE_LOCATION_COLUMNS.
 * Collect first, then write. An enemy_spawn row takes its enemy_spawn_member rows with it.
 */
export function rehomePassageDependents(ctx: any, passage: any, home: any): void {
  const pid: bigint = passage.id;
  const hid: bigint = home.id;

  // Re-home: copy the row and change only the location field.
  for (const row of rowsAt(ctx, 'character', 'boundLocationId', pid, false)) {
    ctx.db.character.id.update({ ...row, boundLocationId: hid });
  }
  for (const row of [...ctx.db.quest_template.iter()]) {
    if (row.targetLocationId !== pid && row.sourceLocationId !== pid) continue;
    ctx.db.quest_template.id.update({
      ...row,
      targetLocationId: row.targetLocationId === pid ? hid : row.targetLocationId,
      sourceLocationId: row.sourceLocationId === pid ? hid : row.sourceLocationId,
    });
  }
  for (const row of rowsAt(ctx, 'quest_item', 'locationId', pid, true)) {
    ctx.db.quest_item.id.update({ ...row, locationId: hid });
  }
  for (const row of rowsAt(ctx, 'named_enemy', 'locationId', pid, true)) {
    ctx.db.named_enemy.id.update({ ...row, locationId: hid });
  }
  for (const row of rowsAt(ctx, 'corpse', 'locationId', pid, true)) {
    ctx.db.corpse.id.update({ ...row, locationId: hid });
  }
  for (const row of rowsAt(ctx, 'event_objective', 'locationId', pid, false)) {
    ctx.db.event_objective.id.update({ ...row, locationId: hid });
  }
  for (const row of rowsAt(ctx, 'event_spawn_item', 'locationId', pid, true)) {
    ctx.db.event_spawn_item.id.update({ ...row, locationId: hid });
  }
  for (const row of rowsAt(ctx, 'npc', 'locationId', pid, true)) {
    ctx.db.npc.id.update({ ...row, locationId: hid });
  }
  for (const row of rowsAt(ctx, 'vendor_buyback', 'locationId', pid, false)) {
    ctx.db.vendor_buyback.characterId.update({ ...row, locationId: hid });
  }
  for (const row of rowsAt(ctx, 'combat_encounter', 'locationId', pid, true)) {
    ctx.db.combat_encounter.id.update({ ...row, locationId: hid });
  }
  // visited_location.fromLocationId: read through by_location on the neighbours (see the list).
  const { far: farSide, own: ownSide } = passageSides(ctx, passage);
  const farIds = new Set<bigint>(farSide.map((l: any) => l.id));
  for (const neighbour of [...ownSide, ...farSide]) {
    for (const row of [...ctx.db.visited_location.by_location.filter(neighbour.id)]) {
      if (row.fromLocationId !== pid) continue;
      ctx.db.visited_location.id.update({ ...row, fromLocationId: farIds.has(neighbour.id) ? hid : undefined });
    }
  }

  // Delete: rows that only make sense at the passage.
  for (const row of rowsAt(ctx, 'search_result', 'locationId', pid, false)) {
    ctx.db.search_result.id.delete(row.id);
  }
  for (const row of rowsAt(ctx, 'resource_node', 'locationId', pid, true)) {
    ctx.db.resource_node.id.delete(row.id);
  }
  for (const spawn of rowsAt(ctx, 'enemy_spawn', 'locationId', pid, true)) {
    if ([...ctx.db.event_spawn_enemy.by_spawn.filter(spawn.id)].length > 0) {
      ctx.db.enemy_spawn.id.update({ ...spawn, locationId: hid });
      continue;
    }
    for (const member of [...ctx.db.enemy_spawn_member.by_spawn.filter(spawn.id)]) {
      ctx.db.enemy_spawn_member.id.delete(member.id);
    }
    ctx.db.enemy_spawn.id.delete(spawn.id);
  }
  // Every event link at the passage, including one whose enemy was already killed (the event's
  // despawn still walks it by event). No location index: the table holds live event enemies only.
  for (const row of rowsAt(ctx, 'event_spawn_enemy', 'locationId', pid, false)) {
    ctx.db.event_spawn_enemy.id.update({ ...row, locationId: hid });
  }
  for (const row of rowsAt(ctx, 'location_enemy_template', 'locationId', pid, true)) {
    ctx.db.location_enemy_template.id.delete(row.id);
  }
  for (const row of rowsAt(ctx, 'enemy_respawn_tick', 'locationId', pid, false)) {
    ctx.db.enemy_respawn_tick.scheduledId.delete(row.scheduledId);
  }
  for (const row of rowsAt(ctx, 'pull_state', 'locationId', pid, true)) {
    ctx.db.pull_state.id.delete(row.id);
  }
  for (const row of rowsAt(ctx, 'visited_location', 'locationId', pid, true)) {
    ctx.db.visited_location.id.delete(row.id);
  }
}

/** Insert one directed link unless it already exists. */
function ensureLink(ctx: any, fromId: bigint, toId: bigint): void {
  if (areLocationsConnected(ctx, fromId, toId)) return;
  ctx.db.location_connection.insert({ id: 0n, fromLocationId: fromId, toLocationId: toId });
}

/** True when a combat encounter at the place is still being fought. */
function hasActiveEncounterAt(ctx: any, locationId: bigint): boolean {
  for (const combat of ctx.db.combat_encounter.by_location.filter(locationId)) {
    if (combat.state === 'active') return true;
  }
  return false;
}

/**
 * Collapse the passage into direct border crossings when nobody stands in it. Returns true when it
 * collapsed. Returns false, changing nothing, when the place does not exist, is not a passage,
 * has a character in it, has a fight still going on at it (the encounter and its locked enemy
 * spawn must stay where the fight is; the sweep collapses it after the fight ends), or has no
 * own-side or no far-side neighbour (nothing to link).
 */
export function collapsePassageIfEmpty(ctx: any, passageId: bigint): boolean {
  const passage = ctx.db.location.id.find(passageId);
  if (!passage || passage.terrainType !== 'passage') return false;
  if ([...ctx.db.character.by_location.filter(passageId)].length > 0) return false;
  if (hasActiveEncounterAt(ctx, passageId)) return false;
  const { own, far } = passageSides(ctx, passage);
  if (own.length === 0 || far.length === 0) return false;

  rehomePassageDependents(ctx, passage, own[0]);

  const connections = [
    ...ctx.db.location_connection.by_from.filter(passageId),
    ...ctx.db.location_connection.by_to.filter(passageId),
  ];
  const deleted = new Set<bigint>();
  for (const row of connections) {
    if (deleted.has(row.id)) continue;
    deleted.add(row.id);
    ctx.db.location_connection.id.delete(row.id);
  }

  // Both directed rows per pair, each written only when missing (what connectLocations writes when
  // neither exists, without duplicating a row that already does).
  for (const ownPlace of own) {
    for (const farPlace of far) {
      ensureLink(ctx, ownPlace.id, farPlace.id);
      ensureLink(ctx, farPlace.id, ownPlace.id);
    }
  }

  ctx.db.location.id.delete(passageId);
  return true;
}

/**
 * The one hook for a character that left a place by any way other than travel: a respawn at the
 * bind point, a resurrection at the corpse, or deletion. When the place it left is a passage that
 * is now empty, the passage collapses at once (the owner's rule), instead of waiting for the next
 * sweep. Each of these is a single-character move, so the travel rule "check once after every
 * traveller has moved" does not apply. `newLocationId` equal to the old place (respawning where it
 * already stands) does nothing. Returns true when a passage collapsed.
 */
export function collapsePassageAfterLeaving(
  ctx: any,
  previousLocationId: bigint | undefined | null,
  newLocationId?: bigint,
): boolean {
  if (previousLocationId === undefined || previousLocationId === null || previousLocationId === 0n) return false;
  if (newLocationId !== undefined && newLocationId === previousLocationId) return false;
  return collapsePassageIfEmpty(ctx, previousLocationId);
}

/**
 * One sweep pass. For each passage in id order that has an own side and a far side (so it can
 * collapse): every offline character in it
 * (no player row has it as activeCharacterId) is moved silently, to the place it arrived from when
 * that place is an own-side neighbour of the passage, else to the lowest-id own-side neighbour,
 * never across the border; the new place is marked visited with no origin. Then the passage
 * collapses if it is empty. Online characters are never moved and keep the passage open. An offline
 * character in an active fight is never moved either: combat outlives a disconnect, and travel is
 * refused in combat, so the fight pins the character (and the passage) until it ends.
 */
export function sweepPassages(ctx: any): { moved: number; collapsed: number } {
  const online = onlineCharacterIds(ctx);
  // location has no index on terrainType, so this reads the whole table once per 5-minute tick
  // (review IN-01, accepted; see rowsAt for why no index was added to an existing table).
  const found = [...ctx.db.location.iter()].filter((l: any) => l.terrainType === 'passage');
  found.sort(byIdAsc);
  let moved = 0;
  let collapsed = 0;
  for (const passage of found) {
    // A passage that cannot collapse (no own side or no far side to link) is left alone: moving its
    // offline occupants would displace them for nothing.
    const { own, far } = passageSides(ctx, passage);
    if (own.length === 0 || far.length === 0) continue;
    const occupants = [...ctx.db.character.by_location.filter(passage.id)].sort(byIdAsc);
    for (const occupant of occupants) {
      if (online.has(occupant.id)) continue;
      if (activeCombatIdForCharacter(ctx, occupant.id)) continue;
      const cameFrom = visitedRowFor(ctx, occupant.id, passage.id)?.fromLocationId;
      const target = own.find((l: any) => l.id === cameFrom) ?? own[0];
      ctx.db.character.id.update({ ...occupant, locationId: target.id });
      markLocationVisited(ctx, occupant.id, target.id);
      moved += 1;
    }
    if (collapsePassageIfEmpty(ctx, passage.id)) collapsed += 1;
  }
  return { moved, collapsed };
}
