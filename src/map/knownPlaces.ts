// Known places, derived on the client (51-CONTEXT "Known places are recorded on the server",
// 51-RESEARCH "Pattern 4"). The server records visited places; heard-of places come from the
// connection rows: a place is heard of when it connects to a visited place.
//
// Only visited and heard-of places are drawn. An edge is revealed only when its source is a
// visited place, so an edge between two heard-of places stays hidden. Pure: plain lists in,
// plain values out.

import { compareBigint } from './order';

export interface KnownPlacesInput<L extends { id: bigint; regionId: bigint }> {
  visitedIds: readonly bigint[];
  currentLocationId: bigint | null;
  connections: readonly { fromLocationId: bigint; toLocationId: bigint }[];
  locations: readonly L[];
}

export interface KnownPlaces<L extends { id: bigint; regionId: bigint }> {
  visited: ReadonlySet<bigint>;
  heardOf: ReadonlySet<bigint>;
  /** Location rows of the visited and heard-of places, ordered by id. */
  drawn: L[];
  /** Distinct regions of the drawn places, ascending. */
  knownRegionIds: bigint[];
  /** Revealed edges, deduped by unordered pair (a < b), sorted. */
  edges: { a: bigint; b: bigint }[];
}

export function knownPlaces<L extends { id: bigint; regionId: bigint }>(
  input: KnownPlacesInput<L>,
): KnownPlaces<L> {
  const byId = new Map<bigint, L>();
  for (const location of input.locations) byId.set(location.id, location);

  const visited = new Set<bigint>(input.visitedIds);
  if (input.currentLocationId !== null) visited.add(input.currentLocationId);

  const heardOf = new Set<bigint>();
  for (const connection of input.connections) {
    if (!visited.has(connection.fromLocationId)) continue;
    if (visited.has(connection.toLocationId)) continue;
    if (!byId.has(connection.toLocationId)) continue;
    heardOf.add(connection.toLocationId);
  }

  const drawn: L[] = [];
  for (const id of [...visited, ...heardOf]) {
    const location = byId.get(id);
    if (location) drawn.push(location);
  }
  drawn.sort((x, y) => compareBigint(x.id, y.id));
  const drawnIds = new Set(drawn.map((l) => l.id));

  const seen = new Set<string>();
  const edges: { a: bigint; b: bigint }[] = [];
  for (const connection of input.connections) {
    if (!visited.has(connection.fromLocationId)) continue;
    if (!drawnIds.has(connection.fromLocationId) || !drawnIds.has(connection.toLocationId)) continue;
    if (connection.fromLocationId === connection.toLocationId) continue;
    const a = connection.fromLocationId < connection.toLocationId ? connection.fromLocationId : connection.toLocationId;
    const b = connection.fromLocationId < connection.toLocationId ? connection.toLocationId : connection.fromLocationId;
    const key = `${a}:${b}`;
    if (seen.has(key)) continue;
    seen.add(key);
    edges.push({ a, b });
  }
  edges.sort((x, y) => compareBigint(x.a, y.a) || compareBigint(x.b, y.b));

  const regionIds = new Set<bigint>();
  for (const location of drawn) regionIds.add(location.regionId);
  const knownRegionIds = [...regionIds].sort(compareBigint);

  return { visited, heardOf, drawn, knownRegionIds, edges };
}
