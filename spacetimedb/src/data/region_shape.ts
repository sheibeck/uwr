// region_shape.ts
// The rules that size and shape a bigger region (Phase 51.3.1.2: D-03, D-04, D-05). Every number is a
// named constant in DENSITY_RULES (dials arrive in Phase 52.5).
//
// Pure, deterministic module: no table access, no ctx, no timestamp, no Math.random. Every roll is
// seeded by hubSeed(regionId) at a fixed POOL_ROLL index, so the fill request and the reply write agree.
//
// Graph indices: node 0 is the arrival point and nodes 1..count-1 are the new places in reply order.
// The arrival point's passage back to the source region and the Edge Beyond edge are never passed in,
// so they never count toward EXIT_DEGREE_CAP.

import { rollBelow } from './economy_rules';
import { DENSITY_RULES, POOL_ROLL, hubSeed } from './density_rules';

/** A whole, non-negative count: NaN and negatives are 0, fractions are floored. */
function whole(n: number): number {
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : 0;
}

// ---------------------------------------------------------------------------
// Place count (D-03)
// ---------------------------------------------------------------------------

/**
 * A region's place count (D-03): REGION_PLACES_MIN..REGION_PLACES_MAX, the arrival point included and
 * the Edge Beyond doorway not counted. Seeded by hubSeed(regionId) at POOL_ROLL.PLACE_COUNT (no
 * timestamp), so the fill request and the reply write roll the same number.
 */
export function placeCountFor(regionId: bigint): number {
  const span = BigInt(DENSITY_RULES.REGION_PLACES_MAX - DENSITY_RULES.REGION_PLACES_MIN + 1);
  return DENSITY_RULES.REGION_PLACES_MIN + Number(rollBelow(hubSeed(regionId), POOL_ROLL.PLACE_COUNT, span));
}

/**
 * How many of a reply's usable new places the server keeps (D-03). With a place count it keeps at most
 * placeCount - 1 (the arrival point is the other one) and fails below REGION_PLACES_FLOOR places in all.
 * With placeCount null (a job asked without a count, in flight at publish) it keeps at most
 * REGION_PLACES_MAX - 1 and never fails.
 */
export function acceptedNewPlaces(usable: number, placeCount: number | null): { keep: number; ok: boolean } {
  const have = whole(usable);
  if (placeCount === null) {
    return { keep: Math.min(have, DENSITY_RULES.REGION_PLACES_MAX - 1), ok: true };
  }
  const keep = Math.min(have, Math.max(0, whole(placeCount) - 1));
  return { keep, ok: keep + 1 >= DENSITY_RULES.REGION_PLACES_FLOOR };
}

// ---------------------------------------------------------------------------
// Graph shape (D-05)
// ---------------------------------------------------------------------------

/** An undirected in-region edge between two node indices, smaller index first. */
export type RegionEdge = [number, number];

function degreesOf(count: number, edges: readonly RegionEdge[]): number[] {
  const deg = new Array<number>(count).fill(0);
  for (const [a, b] of edges) {
    deg[a]! += 1;
    deg[b]! += 1;
  }
  return deg;
}

/**
 * BFS hop counts from `start` over undirected edges (D-04, D-05): 0 for the start node, -1 for a node
 * the edges never reach. Edges with an index outside 0..count-1 are ignored.
 */
export function hopsFrom(count: number, edges: readonly (readonly [number, number])[], start: number): number[] {
  const n = whole(count);
  const hops = new Array<number>(n).fill(-1);
  if (!(Number.isInteger(start) && start >= 0 && start < n)) return hops;
  const neighbours: number[][] = Array.from({ length: n }, () => []);
  for (const [a, b] of edges) {
    if (!(Number.isInteger(a) && Number.isInteger(b) && a >= 0 && b >= 0 && a < n && b < n)) continue;
    neighbours[a]!.push(b);
    neighbours[b]!.push(a);
  }
  hops[start] = 0;
  const queue = [start];
  for (let head = 0; head < queue.length; head += 1) {
    const at = queue[head]!;
    for (const next of neighbours[at]!) {
      if (hops[next] !== -1) continue;
      hops[next] = hops[at]! + 1;
      queue.push(next);
    }
  }
  return hops;
}

/** Whether removing the edge at `skip` leaves some node unreached from node 0 (count is at most ~10). */
function isBridge(count: number, edges: readonly RegionEdge[], skip: number): boolean {
  const rest = edges.filter((_, i) => i !== skip);
  return hopsFrom(count, rest, 0).some((h) => h < 0);
}

/**
 * The in-region edges of a new region, shaped by the server (D-05). Node 0 is the arrival point and
 * 1..count-1 are the new places in reply order; `edges` are the AI's connectsTo pairs as indices.
 *
 * 1. Clean: drop self loops, non-integer or out-of-range indices and duplicate undirected pairs.
 * 2. Repair reachability: while a place is unreached from the arrival point, link the lowest-index
 *    unreached place (the lowest of its component) to the reached place with the fewest edges, ties by
 *    hop distance from the arrival point, then by index (not always the arrival point, so no star).
 * 3. Trim: while a node has more than EXIT_DEGREE_CAP edges, take the over-cap node with the most edges
 *    (ties lowest index) that still has a non-bridge edge, and remove that edge whose other end has the
 *    most edges (ties highest index). A node whose remaining edges are all bridges keeps them.
 *
 * Returns pairs [a, b] with a < b, sorted. Every loop is bounded by count and the edge count
 * (T-51.3.1.2-04).
 */
export function shapeRegionEdges(input: {
  count: number;
  edges: readonly (readonly [number, number])[];
}): RegionEdge[] {
  const count = whole(input.count);
  if (count <= 1) return [];

  // 1. Clean.
  const seen = new Set<number>();
  const edges: RegionEdge[] = [];
  for (const pair of input.edges) {
    if (!Array.isArray(pair) || pair.length < 2) continue;
    const [x, y] = pair;
    if (!(Number.isInteger(x) && Number.isInteger(y))) continue;
    if (x < 0 || y < 0 || x >= count || y >= count || x === y) continue;
    const a = Math.min(x, y);
    const b = Math.max(x, y);
    const key = a * count + b;
    if (seen.has(key)) continue;
    seen.add(key);
    edges.push([a, b]);
  }

  // 2. Repair reachability (at most count - 1 links).
  for (let link = 0; link < count; link += 1) {
    const hops = hopsFrom(count, edges, 0);
    const orphan = hops.findIndex((h) => h < 0);
    if (orphan < 0) break;
    const deg = degreesOf(count, edges);
    let target = 0;
    for (let v = 1; v < count; v += 1) {
      if (hops[v]! < 0) continue;
      if (deg[v]! < deg[target]! || (deg[v] === deg[target] && hops[v]! < hops[target]!)) target = v;
    }
    edges.push([Math.min(orphan, target), Math.max(orphan, target)]);
  }

  // 3. Trim over-cap nodes, never by a bridge (each pass removes one edge, so it ends).
  const cap = DENSITY_RULES.EXIT_DEGREE_CAP;
  for (let pass = edges.length; pass > 0; pass -= 1) {
    const deg = degreesOf(count, edges);
    const over = deg
      .map((d, v) => ({ v, d }))
      .filter(({ d }) => d > cap)
      .sort((x, y) => y.d - x.d || x.v - y.v);
    let removed = false;
    for (const { v } of over) {
      let pick = -1;
      let pickOther = -1;
      edges.forEach(([a, b], i) => {
        if (a !== v && b !== v) return;
        const other = a === v ? b : a;
        const wins = pick < 0 || deg[other]! > deg[pickOther]! || (deg[other] === deg[pickOther] && other > pickOther);
        if (wins && !isBridge(count, edges, i)) {
          pick = i;
          pickOther = other;
        }
      });
      if (pick >= 0) {
        edges.splice(pick, 1);
        removed = true;
        break;
      }
    }
    if (!removed) break;
  }

  return edges.sort((x, y) => x[0] - y[0] || x[1] - y[1]);
}

// ---------------------------------------------------------------------------
// Hop gradient (D-04)
// ---------------------------------------------------------------------------

/**
 * A new place's level offset from its hop distance to the arrival point (D-04): the arrival point's
 * offset plus one per LEVEL_HOPS_PER_STEP hops, at most LEVEL_OFFSET_MAX more. A negative or missing
 * hop count counts as the arrival point.
 */
export function levelOffsetForHops(arrivalOffset: bigint, hops: number): bigint {
  const h = Number.isNaN(hops) || hops < 0 ? 0 : Math.floor(hops);
  const steps = Math.min(DENSITY_RULES.LEVEL_OFFSET_MAX, Math.floor(h / DENSITY_RULES.LEVEL_HOPS_PER_STEP));
  return arrivalOffset + BigInt(steps);
}

// ---------------------------------------------------------------------------
// Host floor and boundary anchor (D-05)
// ---------------------------------------------------------------------------

/** One place of a region for the host floor and boundary anchor rules. */
export interface ShapeNode {
  index: number;
  isSafe: boolean;
  isHub: boolean;
}

function hopOf(hops: readonly number[], index: number): number {
  const h = hops[index];
  return typeof h === 'number' && !Number.isNaN(h) ? h : -1;
}

/** Farthest first, ties by lowest index. */
function byFarthest(hops: readonly number[]): (x: ShapeNode, y: ShapeNode) => number {
  return (x, y) => hopOf(hops, y.index) - hopOf(hops, x.index) || x.index - y.index;
}

/**
 * The places to flip from safe to unsafe so at least MIN_HOST_PLACES places can host creatures (D-05,
 * SC3): a host is non-safe and non-hub. Flips the farthest non-hub safe places first (ties by lowest
 * index) and never a hub; with too few candidates it flips them all and stops. Returns their indices in
 * pick order, [] when the region already has enough hosts.
 */
export function hostFloorFlips(input: { nodes: readonly ShapeNode[]; hops: readonly number[] }): number[] {
  const hosts = input.nodes.filter((n) => !n.isSafe && !n.isHub).length;
  const needed = DENSITY_RULES.MIN_HOST_PLACES - hosts;
  if (needed <= 0) return [];
  return input.nodes
    .filter((n) => n.isSafe && !n.isHub)
    .sort(byFarthest(input.hops))
    .slice(0, needed)
    .map((n) => n.index);
}

/**
 * The place the onward Edge Beyond doorway hangs off (D-05): the farthest place from the arrival point
 * by hops, preferring non-safe non-hub places, ties by lowest index; else the farthest place of any
 * kind; 0 (the arrival point) for a region with no other place.
 */
export function boundaryAnchorFor(input: { nodes: readonly ShapeNode[]; hops: readonly number[] }): number {
  const order = byFarthest(input.hops);
  const preferred = input.nodes.filter((n) => !n.isSafe && !n.isHub).sort(order);
  if (preferred.length > 0) return preferred[0]!.index;
  const any = [...input.nodes].sort(order);
  return any.length > 0 ? any[0]!.index : 0;
}
