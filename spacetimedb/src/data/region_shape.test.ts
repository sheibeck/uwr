/**
 * Phase 51.3.1.2 Plan 02: the rules that size and shape a bigger region (D-03, D-04, D-05, D-10).
 * Pure functions only; the property cases use a small seeded generator (an LCG), never Math.random.
 */
import { describe, it, expect } from 'vitest';
import { economyRoll } from './economy_rules';
import { DENSITY_RULES, POOL_ROLL, hubSeed } from './density_rules';
import {
  placeCountFor,
  acceptedNewPlaces,
  shapeRegionEdges,
  hopsFrom,
  levelOffsetForHops,
  hostFloorFlips,
  boundaryAnchorFor,
} from './region_shape';

const R = DENSITY_RULES;

// ============================================================================
// Task 1: the place count (D-03)
// ============================================================================

describe('placeCountFor (D-03)', () => {
  it('always rolls a whole number in REGION_PLACES_MIN..REGION_PLACES_MAX and hits every value', () => {
    const seen = new Set<number>();
    for (let id = 1n; id <= 2000n; id += 1n) {
      const n = placeCountFor(id);
      expect(Number.isInteger(n)).toBe(true);
      expect(n).toBeGreaterThanOrEqual(R.REGION_PLACES_MIN);
      expect(n).toBeLessThanOrEqual(R.REGION_PLACES_MAX);
      seen.add(n);
    }
    expect([...seen].sort((a, b) => a - b)).toEqual([8, 9, 10]);
  });

  it('gives the same count on a second call (no timestamp)', () => {
    for (let id = 1n; id <= 200n; id += 1n) expect(placeCountFor(id)).toBe(placeCountFor(id));
  });

  it('rolls hubSeed(regionId) at POOL_ROLL.PLACE_COUNT', () => {
    const span = BigInt(R.REGION_PLACES_MAX - R.REGION_PLACES_MIN + 1);
    for (const id of [1n, 2n, 17n, 999n]) {
      expect(placeCountFor(id)).toBe(R.REGION_PLACES_MIN + Number(economyRoll(hubSeed(id), POOL_ROLL.PLACE_COUNT) % span));
    }
  });
});

describe('acceptedNewPlaces (D-03)', () => {
  it('keeps at most placeCount - 1 new places and accepts down to the floor', () => {
    expect(acceptedNewPlaces(12, 9)).toEqual({ keep: 8, ok: true });
    expect(acceptedNewPlaces(8, 9)).toEqual({ keep: 8, ok: true });
    expect(acceptedNewPlaces(5, 9)).toEqual({ keep: 5, ok: true }); // 6 in all: the floor
    expect(acceptedNewPlaces(4, 9)).toEqual({ keep: 4, ok: false }); // 5 in all: below the floor
    expect(acceptedNewPlaces(0, 9)).toEqual({ keep: 0, ok: false });
    expect(acceptedNewPlaces(20, 10)).toEqual({ keep: 9, ok: true });
    expect(acceptedNewPlaces(20, 8)).toEqual({ keep: 7, ok: true });
  });

  it('keeps at most REGION_PLACES_MAX - 1 and never fails when the job asked without a count', () => {
    expect(acceptedNewPlaces(12, null)).toEqual({ keep: 9, ok: true });
    expect(acceptedNewPlaces(9, null)).toEqual({ keep: 9, ok: true });
    expect(acceptedNewPlaces(3, null)).toEqual({ keep: 3, ok: true });
    expect(acceptedNewPlaces(0, null)).toEqual({ keep: 0, ok: true });
  });

  it('treats a negative or fractional usable count as whole and never keeps below 0', () => {
    expect(acceptedNewPlaces(-3, 9)).toEqual({ keep: 0, ok: false });
    expect(acceptedNewPlaces(6.7, 9)).toEqual({ keep: 6, ok: true });
    expect(acceptedNewPlaces(Number.NaN, null)).toEqual({ keep: 0, ok: true });
  });
});

// ============================================================================
// Task 2: graph shape (D-05), hop gradient (D-04), host floor and boundary anchor (D-05)
// ============================================================================

type Edge = [number, number];

/** A small seeded generator (an LCG), so the property cases never use Math.random. */
function lcg(seed: number): (n: number) => number {
  let s = seed >>> 0;
  return (n: number) => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return n <= 0 ? 0 : s % n;
  };
}

function degrees(count: number, edges: readonly Edge[]): number[] {
  const deg = new Array<number>(count).fill(0);
  for (const [a, b] of edges) {
    deg[a]! += 1;
    deg[b]! += 1;
  }
  return deg;
}

/** Nodes reached from node 0 (a test-side BFS, independent of hopsFrom). */
function reachedFromZero(count: number, edges: readonly Edge[]): Set<number> {
  const seen = new Set<number>(count > 0 ? [0] : []);
  const queue = count > 0 ? [0] : [];
  while (queue.length > 0) {
    const at = queue.shift()!;
    for (const [a, b] of edges) {
      const next = a === at ? b : b === at ? a : -1;
      if (next >= 0 && !seen.has(next)) {
        seen.add(next);
        queue.push(next);
      }
    }
  }
  return seen;
}

function isBridgeIn(count: number, edges: readonly Edge[], edge: Edge): boolean {
  const without = edges.filter((e) => !(e[0] === edge[0] && e[1] === edge[1]));
  return reachedFromZero(count, without).size < count;
}

function star(count: number): Edge[] {
  return Array.from({ length: Math.max(0, count - 1) }, (_, i) => [0, i + 1] as Edge);
}

function chain(from: number, to: number): Edge[] {
  const out: Edge[] = [];
  for (let i = from; i < to; i += 1) out.push([i, i + 1]);
  return out;
}

describe('shapeRegionEdges: cleaning (D-05)', () => {
  it('drops self loops, out-of-range and fractional indices and duplicate pairs, and orders each pair', () => {
    const edges: Edge[] = [[1, 0], [0, 1], [2, 2], [2, 1], [1, 2], [0, 7], [-1, 2], [1.5, 2], [3, 0]];
    expect(shapeRegionEdges({ count: 4, edges })).toEqual([[0, 1], [0, 3], [1, 2]]);
  });

  it('returns pairs a < b in a stable (sorted) order whatever the input order', () => {
    const a = shapeRegionEdges({ count: 5, edges: [[3, 4], [0, 1], [2, 1], [0, 3]] });
    const b = shapeRegionEdges({ count: 5, edges: [[0, 3], [1, 2], [4, 3], [1, 0]] });
    expect(a).toEqual(b);
    expect(a).toEqual([[0, 1], [0, 3], [1, 2], [3, 4]]);
  });

  it('gives an empty list for an empty or single-place region', () => {
    expect(shapeRegionEdges({ count: 0, edges: [[0, 1]] })).toEqual([]);
    expect(shapeRegionEdges({ count: 1, edges: [[0, 0], [0, 1]] })).toEqual([]);
  });
});

describe('shapeRegionEdges: reachability repair (D-05)', () => {
  it('links an orphan component from its lowest-index place to the least-connected reached place', () => {
    // Reached 0..4; node 3 has the fewest edges (1). Orphan component {5, 6}.
    const edges: Edge[] = [[0, 1], [0, 2], [1, 2], [0, 4], [1, 4], [2, 3], [5, 6]];
    const out = shapeRegionEdges({ count: 7, edges });
    expect(out).toContainEqual([3, 5]);
    expect(out).toHaveLength(edges.length + 1);
  });

  it('breaks a tie in edge count by the smaller hop distance', () => {
    // 0-1-2 and 0-3: nodes 2 (2 hops) and 3 (1 hop) both have one edge; 3 wins over the lower index 2.
    const out = shapeRegionEdges({ count: 6, edges: [[0, 1], [1, 2], [0, 3], [4, 5]] });
    expect(out).toContainEqual([3, 4]);
  });

  it('breaks a tie in edge count and hops by the lower index', () => {
    const out = shapeRegionEdges({ count: 4, edges: [[0, 1], [0, 2]] });
    expect(out).toEqual([[0, 1], [0, 2], [1, 3]]);
  });

  it('spreads an empty list into a tree instead of a star on the arrival point', () => {
    const out = shapeRegionEdges({ count: 10, edges: [] });
    expect(out).toHaveLength(9);
    expect(reachedFromZero(10, out).size).toBe(10);
    expect(Math.max(...degrees(10, out))).toBeLessThanOrEqual(R.EXIT_DEGREE_CAP);
  });
});

describe('shapeRegionEdges: the exit cap (D-05)', () => {
  it('trims a nine-spoke star on node 0 with a chain 1..9 to four exits at node 0, everything reachable', () => {
    const edges = [...star(10), ...chain(1, 9)];
    const out = shapeRegionEdges({ count: 10, edges });
    expect(reachedFromZero(10, out).size).toBe(10);
    expect(degrees(10, out)[0]).toBe(R.EXIT_DEGREE_CAP);
    for (const d of degrees(10, out)) expect(d).toBeLessThanOrEqual(R.EXIT_DEGREE_CAP);
  });

  it('keeps every edge of a bare star: each one is a bridge', () => {
    expect(shapeRegionEdges({ count: 10, edges: star(10) })).toEqual(star(10));
  });

  it('removes the over-cap edge whose other end has the most edges', () => {
    // Node 0 has five edges (to 1..5) and a ring 1-2-3-4-5-1 makes none a bridge. Node 2 also links
    // to 6, so among node 0's neighbours it has the most edges: the edge 0-2 goes.
    const edges: Edge[] = [...star(6), [1, 2], [2, 3], [3, 4], [4, 5], [1, 5], [2, 6]];
    const out = shapeRegionEdges({ count: 7, edges });
    expect(out).not.toContainEqual([0, 2]);
    expect(degrees(7, out)[0]).toBe(R.EXIT_DEGREE_CAP);
    expect(out).toHaveLength(edges.length - 1);
  });

  it('breaks a tie between the other ends by the highest index', () => {
    const edges: Edge[] = [...star(6), [1, 2], [2, 3], [3, 4], [4, 5], [1, 5]];
    const out = shapeRegionEdges({ count: 6, edges });
    expect(out).not.toContainEqual([0, 5]);
    expect(out).toHaveLength(edges.length - 1);
  });
});

describe('shapeRegionEdges: 500 seeded random AI graphs (D-05, T-51.3.1.2-04)', () => {
  it('always reaches every place, caps exits unless only bridges are left, and is deterministic', () => {
    for (let c = 0; c < 500; c += 1) {
      const rnd = lcg(c * 7919 + 1);
      const count = 1 + (c % 10);
      const kind = c % 6;
      let edges: Edge[] = [];
      if (kind === 1) edges = [];
      else if (kind === 2) edges = chain(0, count - 1);
      else if (kind === 3) edges = [...star(count), ...chain(1, count - 1).filter(() => rnd(2) === 0)];
      else if (kind === 4) {
        const half = Math.max(1, Math.floor(count / 2));
        edges = [...chain(0, half - 1), ...chain(half, count - 1)];
      } else {
        const n = rnd(21);
        for (let i = 0; i < n; i += 1) edges.push([rnd(count), rnd(count)]);
      }
      // Noise the AI might send: self loops, out-of-range names and reversed duplicates.
      if (kind === 5) edges.push([rnd(count), count + rnd(3)], [-1, rnd(count)]);
      if (rnd(3) === 0) edges.push([rnd(count), rnd(count)]);
      for (const [a, b] of edges.slice(0, rnd(3))) edges.push([b, a]);

      const out = shapeRegionEdges({ count, edges });
      expect(shapeRegionEdges({ count, edges })).toEqual(out);

      const keys = new Set<string>();
      for (const [a, b] of out) {
        expect(Number.isInteger(a) && Number.isInteger(b)).toBe(true);
        expect(a).toBeGreaterThanOrEqual(0);
        expect(a).toBeLessThan(b);
        expect(b).toBeLessThan(count);
        keys.add(`${a}-${b}`);
      }
      expect(keys.size).toBe(out.length);
      expect(reachedFromZero(count, out).size).toBe(count);

      const deg = degrees(count, out);
      for (let v = 0; v < count; v += 1) {
        if (deg[v]! <= R.EXIT_DEGREE_CAP) continue;
        for (const e of out.filter(([a, b]) => a === v || b === v)) expect(isBridgeIn(count, out, e)).toBe(true);
      }
      expect(hopsFrom(count, out, 0).every((h) => h >= 0)).toBe(true);
    }
  });
});

describe('hopsFrom (D-04, D-05)', () => {
  it('gives BFS hop counts with 0 for the start node', () => {
    expect(hopsFrom(5, chain(0, 4), 0)).toEqual([0, 1, 2, 3, 4]);
    expect(hopsFrom(5, [[0, 1], [0, 2], [2, 3], [1, 3], [3, 4]], 0)).toEqual([0, 1, 1, 2, 3]);
  });

  it('marks an unreached node -1', () => {
    expect(hopsFrom(4, [[0, 1]], 0)).toEqual([0, 1, -1, -1]);
    expect(hopsFrom(1, [], 0)).toEqual([0]);
  });
});

describe('levelOffsetForHops (D-04)', () => {
  it('rises by one per LEVEL_HOPS_PER_STEP hops and at most LEVEL_OFFSET_MAX', () => {
    expect(levelOffsetForHops(0n, 0)).toBe(0n);
    expect(levelOffsetForHops(0n, 1)).toBe(0n);
    expect(levelOffsetForHops(0n, 2)).toBe(1n);
    expect(levelOffsetForHops(0n, 3)).toBe(1n);
    expect(levelOffsetForHops(0n, 4)).toBe(2n);
    expect(levelOffsetForHops(0n, 9)).toBe(2n);
    expect(levelOffsetForHops(1n, 9)).toBe(3n);
  });

  it('treats a negative or missing hop count as the arrival point', () => {
    expect(levelOffsetForHops(2n, -1)).toBe(2n);
    expect(levelOffsetForHops(0n, Number.NaN)).toBe(0n);
  });
});

describe('hostFloorFlips (D-05, SC3)', () => {
  const node = (index: number, isSafe: boolean, isHub: boolean) => ({ index, isSafe, isHub });

  it('flips the farthest non-hub safe places until MIN_HOST_PLACES can host creatures', () => {
    const nodes = [
      node(0, true, true),
      ...[1, 2, 3, 4, 5, 6].map((i) => node(i, true, false)),
      node(7, false, false),
      node(8, false, false),
    ];
    const hops = [0, 1, 2, 3, 3, 2, 1, 4, 1];
    expect(hostFloorFlips({ nodes, hops })).toEqual([3, 4]);
  });

  it('never flips a hub, however far it is', () => {
    const nodes = [node(0, true, false), node(1, true, true), node(2, true, false), node(3, false, false), node(4, false, false)];
    expect(hostFloorFlips({ nodes, hops: [0, 9, 1, 1, 2] })).toEqual([2, 0]);
  });

  it('flips nothing when enough places already host creatures', () => {
    const nodes = [node(0, true, true), node(1, false, false), node(2, false, false), node(3, false, false), node(4, false, false), node(5, true, false)];
    expect(hostFloorFlips({ nodes, hops: [0, 1, 1, 2, 2, 3] })).toEqual([]);
  });

  it('flips every non-hub safe place and stops when there are too few', () => {
    const nodes = [node(0, true, true), node(1, true, true), node(2, true, false), node(3, false, false)];
    expect(hostFloorFlips({ nodes, hops: [0, 1, 2, 1] })).toEqual([2]);
  });
});

describe('boundaryAnchorFor (D-05)', () => {
  const node = (index: number, isSafe: boolean, isHub: boolean) => ({ index, isSafe, isHub });

  it('picks the farthest non-safe non-hub place, ties by lowest index', () => {
    const nodes = [node(0, true, true), node(1, false, false), node(2, false, false), node(3, true, false), node(4, false, false)];
    expect(boundaryAnchorFor({ nodes, hops: [0, 1, 3, 4, 3] })).toBe(2);
  });

  it('falls back to the farthest place of any kind when none is non-safe and non-hub', () => {
    const nodes = [node(0, false, true), node(1, true, false), node(2, true, true), node(3, true, false)];
    expect(boundaryAnchorFor({ nodes, hops: [0, 2, 2, 1] })).toBe(1);
  });

  it('anchors a single-place region on the arrival point', () => {
    expect(boundaryAnchorFor({ nodes: [node(0, true, false)], hops: [0] })).toBe(0);
    expect(boundaryAnchorFor({ nodes: [], hops: [] })).toBe(0);
  });
});
