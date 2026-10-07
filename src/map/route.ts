// Routes over the known places (51-UI-SPEC "Destination detail" block 9). Breadth-first search
// visits neighbours in ascending id order, so ties go to the lower id deterministically. A gap in
// knowledge is no path: only the edges the caller passes (the revealed edges) are walked.

import { compareBigint } from './order';

export function adjacencyOf(edges: readonly { a: bigint; b: bigint }[]): Map<bigint, bigint[]> {
  const adjacency = new Map<bigint, bigint[]>();
  const link = (from: bigint, to: bigint): void => {
    const list = adjacency.get(from);
    if (list) {
      if (!list.includes(to)) list.push(to);
    } else {
      adjacency.set(from, [to]);
    }
  };
  for (const edge of edges) {
    link(edge.a, edge.b);
    link(edge.b, edge.a);
  }
  for (const list of adjacency.values()) list.sort(compareBigint);
  return adjacency;
}

/** Shortest path inclusive of both ends, or null when no known path exists. */
export function shortestPath(
  adjacency: ReadonlyMap<bigint, readonly bigint[]>,
  fromId: bigint,
  toId: bigint,
): bigint[] | null {
  if (fromId === toId) return [fromId];
  const previous = new Map<bigint, bigint>();
  const seen = new Set<bigint>([fromId]);
  let frontier: bigint[] = [fromId];
  while (frontier.length > 0) {
    const next: bigint[] = [];
    for (const id of frontier) {
      for (const neighbour of adjacency.get(id) ?? []) {
        if (seen.has(neighbour)) continue;
        seen.add(neighbour);
        previous.set(neighbour, id);
        if (neighbour === toId) {
          const path: bigint[] = [toId];
          let cursor = toId;
          while (cursor !== fromId) {
            cursor = previous.get(cursor) as bigint;
            path.push(cursor);
          }
          return path.reverse();
        }
        next.push(neighbour);
      }
    }
    frontier = next;
  }
  return null;
}

/** Step count from `fromId` to every reachable known place (0 for itself). */
export function stepsFrom(
  adjacency: ReadonlyMap<bigint, readonly bigint[]>,
  fromId: bigint,
): Map<bigint, number> {
  const steps = new Map<bigint, number>([[fromId, 0]]);
  let frontier: bigint[] = [fromId];
  let depth = 0;
  while (frontier.length > 0) {
    depth += 1;
    const next: bigint[] = [];
    for (const id of frontier) {
      for (const neighbour of adjacency.get(id) ?? []) {
        if (steps.has(neighbour)) continue;
        steps.set(neighbour, depth);
        next.push(neighbour);
      }
    }
    frontier = next;
  }
  return steps;
}

/**
 * The route note: '{n} stops' then the start region when no border is crossed, else the number of
 * region crossings (1 or k). Stops are the path length minus one ('1 stop' for a single step).
 */
export function routeNote(
  path: readonly bigint[],
  locations: readonly { id: bigint; regionId: bigint }[],
  regions: readonly { id: bigint; name: string }[],
): string {
  const regionOf = new Map<bigint, bigint>();
  for (const location of locations) regionOf.set(location.id, location.regionId);

  let crossings = 0;
  for (let i = 1; i < path.length; i += 1) {
    if (regionOf.get(path[i]) !== regionOf.get(path[i - 1])) crossings += 1;
  }

  const stops = Math.max(0, path.length - 1);
  const stopWord = stops === 1 ? '1 stop' : `${stops} stops`;
  if (crossings === 0) {
    const startRegionId = path.length > 0 ? regionOf.get(path[0]) : undefined;
    const region = regions.find((r) => r.id === startRegionId);
    return `${stopWord} · all within ${region ? region.name : 'this region'}`;
  }
  return `${stopWord} · ${crossings === 1 ? '1 region crossing' : `${crossings} region crossings`}`;
}
