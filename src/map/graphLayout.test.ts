import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  BEND,
  CAPTION_HEIGHT,
  CAPTION_INSET,
  CAPTION_WIDTH,
  COMPACT_GATE_HEIGHT,
  COMPACT_LABEL_HEIGHT,
  COMPACT_MIN_NODE_GAP,
  COMPACT_NODE_HIT,
  GATE_CLEAR,
  GATE_HEIGHT,
  GATE_WIDTH,
  LABEL_CLEAR,
  LABEL_HEIGHT,
  LABEL_WIDTH,
  MAX_EDGE,
  MAX_STRETCH,
  MIN_NODE_GAP,
  NODE_HIT,
  OUTER_GAP,
  PLANE_MARGIN,
  REGION_PAD,
  REGION_PAD_TOP,
  compareReading,
  layoutGraph,
  regionStartId,
} from './graphLayout';
import type { CanvasSize, GraphLayout, LayoutInput, LayoutNode, LayoutPlace } from './graphLayout';

const place = (id: bigint, name: string, regionId = 1n, over: Partial<LayoutPlace> = {}): LayoutPlace => ({
  id,
  name,
  regionId,
  bindStone: false,
  terrainType: 'woods',
  ...over,
});

const edge = (a: bigint, b: bigint) => ({ a, b });

// ---- live fixtures (owner's local DB, 2026-10-07) ----

const SENNET: LayoutInput = {
  regionId: 4099n,
  places: [
    place(4108n, 'Kettlewick Landing', 4099n, { terrainType: 'town' }),
    place(4109n, 'Crake Wharf Market', 4099n, { terrainType: 'town' }),
    place(4110n, 'Brinewalk Flats', 4099n, { terrainType: 'plains' }),
    place(4111n, 'The Drowned Weir', 4099n, { terrainType: 'dungeon' }),
    place(4112n, 'The Edge Beyond Sennet Basin', 4099n, { terrainType: 'uncharted' }),
    place(4106n, 'Wend Marsh', 4098n, { terrainType: 'swamp' }),
  ],
  edges: [edge(4108n, 4109n), edge(4109n, 4110n), edge(4110n, 4111n), edge(4111n, 4112n), edge(4108n, 4106n)],
};

const TESSARINE: LayoutInput = {
  regionId: 4097n,
  places: [
    place(4097n, 'Cormorant Stair', 4097n, { terrainType: 'town' }),
    place(4098n, 'Violet Cut', 4097n),
    place(4099n, 'Drowned Crane Flats', 4097n),
    place(4100n, "Saltwidow's Rest", 4097n),
    place(5n, 'Mother Pan Undercroft', 1n),
    place(4102n, 'Pellwick Landing', 4098n),
  ],
  edges: [
    edge(4097n, 4098n),
    edge(4097n, 4100n),
    edge(4097n, 5n),
    edge(4098n, 4099n),
    edge(4099n, 4100n),
    edge(4099n, 4102n),
  ],
};

const KESTERLANE: LayoutInput = {
  regionId: 1n,
  places: [
    place(1n, 'Kester One', 1n),
    place(2n, 'Kester Two', 1n),
    place(3n, 'Kester Three', 1n),
    place(4n, 'Kester Four', 1n),
    place(5n, 'Mother Pan Undercroft', 1n),
    place(4097n, 'Cormorant Stair', 4097n, { terrainType: 'town' }),
  ],
  edges: [edge(1n, 2n), edge(1n, 3n), edge(2n, 4n), edge(3n, 5n), edge(4n, 5n), edge(5n, 4097n)],
};

const ORROWMERE: LayoutInput = {
  regionId: 4098n,
  places: [
    place(4102n, 'Pellwick Landing', 4098n),
    place(4103n, 'Orro Two', 4098n),
    place(4104n, 'Orro Three', 4098n),
    place(4105n, 'Orro Four', 4098n),
    place(4106n, 'Wend Marsh', 4098n, { terrainType: 'swamp' }),
    place(4099n, 'Drowned Crane Flats', 4097n),
    place(4108n, 'Kettlewick Landing', 4099n, { terrainType: 'town' }),
  ],
  edges: [
    edge(4102n, 4103n),
    edge(4103n, 4104n),
    edge(4104n, 4105n),
    edge(4105n, 4102n),
    edge(4105n, 4106n),
    edge(4102n, 4099n),
    edge(4106n, 4108n),
  ],
};

const FIXTURES: [string, LayoutInput][] = [
  ['Sennet Basin', SENNET],
  ['Tessarine Shelf', TESSARINE],
  ['Kesterlane Basin', KESTERLANE],
  ['Orrowmere Teeth', ORROWMERE],
];

const DESK: CanvasSize = { width: 652, height: 600 };
const MOBILE: CanvasSize = { width: 358, height: 320 };

const MODES: { name: string; canvas: CanvasSize | null; compact: boolean }[] = [
  { name: 'desktop 652 x 600', canvas: DESK, compact: false },
  { name: 'mobile 358 x 320', canvas: MOBILE, compact: true },
  { name: 'no canvas', canvas: null, compact: false },
];

// ---- box helpers ----

interface Box {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

/** True when the two boxes keep at least `clear` px between them on some axis. */
function keeps(a: Box, b: Box, clear: number): boolean {
  return a.x1 + clear <= b.x0 || b.x1 + clear <= a.x0 || a.y1 + clear <= b.y0 || b.y1 + clear <= a.y0;
}

function intersects(a: Box, b: Box): boolean {
  return a.x0 < b.x1 && b.x0 < a.x1 && a.y0 < b.y1 && b.y0 < a.y1;
}

function inside(a: Box, outer: Box): boolean {
  return a.x0 >= outer.x0 && a.x1 <= outer.x1 && a.y0 >= outer.y0 && a.y1 <= outer.y1;
}

function hitBox(n: LayoutNode, compact: boolean): Box {
  const half = (compact ? COMPACT_NODE_HIT : NODE_HIT) / 2;
  return { x0: n.x - half, y0: n.y - half, x1: n.x + half, y1: n.y + half };
}

function labelBox(n: LayoutNode): Box {
  return { x0: n.label.x, y0: n.label.y, x1: n.label.x + n.label.w, y1: n.label.y + n.label.h };
}

function gateBox(g: { x: number; y: number }, compact: boolean): Box {
  const h = compact ? COMPACT_GATE_HEIGHT : GATE_HEIGHT;
  return { x0: g.x - GATE_WIDTH / 2, y0: g.y - h / 2, x1: g.x + GATE_WIDTH / 2, y1: g.y + h / 2 };
}

function rect(r: { x: number; y: number; w: number; h: number }): Box {
  return { x0: r.x, y0: r.y, x1: r.x + r.w, y1: r.y + r.h };
}

function boxesOf(layout: GraphLayout, compact: boolean) {
  return {
    hits: layout.nodes.map((n) => ({ id: n.id, box: hitBox(n, compact) })),
    labels: layout.nodes.map((n) => ({ id: n.id, box: labelBox(n) })),
    gates: layout.gates.map((g) => ({ key: g.key, box: gateBox(g, compact) })),
    caption: layout.caption ? rect(layout.caption) : null,
  };
}

function node(layout: GraphLayout, id: bigint): LayoutNode {
  const found = layout.nodes.find((n) => n.id === id);
  if (!found) throw new Error(`no node ${id}`);
  return found;
}

function regionOf(input: LayoutInput, id: bigint): bigint {
  const found = input.places.find((p) => p.id === id);
  if (!found) throw new Error(`no place ${id}`);
  return found.regionId;
}

function distanceToSegment(p: { x: number; y: number }, e: { x1: number; y1: number; x2: number; y2: number }): number {
  const vx = e.x2 - e.x1;
  const vy = e.y2 - e.y1;
  const len2 = vx * vx + vy * vy;
  const t = len2 === 0 ? 0 : Math.max(0, Math.min(1, ((p.x - e.x1) * vx + (p.y - e.y1) * vy) / len2));
  return Math.hypot(e.x1 + vx * t - p.x, e.y1 + vy * t - p.y);
}

function regionBounds(layout: GraphLayout, input: LayoutInput) {
  const region = layout.nodes.filter((n) => regionOf(input, n.id) === input.regionId);
  const xs = region.map((n) => n.x);
  const ys = region.map((n) => n.y);
  const x0 = Math.min(...xs);
  const x1 = Math.max(...xs);
  const y0 = Math.min(...ys);
  const y1 = Math.max(...ys);
  return { region, x0, x1, y0, y1, cx: (x0 + x1) / 2, cy: (y0 + y1) / 2 };
}

function minPairDistance(nodes: readonly LayoutNode[]): number {
  let min = Infinity;
  for (let i = 0; i < nodes.length; i += 1) {
    for (let j = i + 1; j < nodes.length; j += 1) {
      min = Math.min(min, Math.hypot(nodes[i].x - nodes[j].x, nodes[i].y - nodes[j].y));
    }
  }
  return min;
}

// ---- tests ----

describe('constants', () => {
  it('pins the spacing, box and fill constants', () => {
    expect(MIN_NODE_GAP).toBe(160);
    expect(COMPACT_MIN_NODE_GAP).toBe(112);
    expect(PLANE_MARGIN).toBe(48);
    expect(NODE_HIT).toBe(32);
    expect(COMPACT_NODE_HIT).toBe(44);
    expect(LABEL_WIDTH).toBe(144);
    expect(LABEL_HEIGHT).toBe(36);
    expect(COMPACT_LABEL_HEIGHT).toBe(16);
    expect(GATE_WIDTH).toBe(176);
    expect(GATE_HEIGHT).toBe(24);
    expect(COMPACT_GATE_HEIGHT).toBe(44);
    expect(GATE_CLEAR).toBe(16);
    expect(LABEL_CLEAR).toBe(4);
    expect(CAPTION_WIDTH).toBe(160);
    expect(CAPTION_HEIGHT).toBe(16);
    expect(CAPTION_INSET).toBe(16);
    expect(REGION_PAD).toBe(48);
    expect(REGION_PAD_TOP).toBe(56);
    expect(OUTER_GAP).toBe(64);
    expect(MAX_EDGE).toBe(360);
    expect(MAX_STRETCH).toBe(1.6);
    expect(BEND).toBe(0.6);
  });
});

for (const [name, input] of FIXTURES) {
  for (const mode of MODES) {
    describe(`${name}, ${mode.name}`, () => {
      const layout = layoutGraph({ ...input, canvas: mode.canvas, compact: mode.compact });
      const b = boxesOf(layout, mode.compact);
      const minGap = mode.compact ? COMPACT_MIN_NODE_GAP : MIN_NODE_GAP;
      const border = layout.border ? rect(layout.border) : null;

      it('(a) keeps labels, hit boxes, gates and the caption apart', () => {
        const solid = [...b.hits, ...b.labels];
        for (let i = 0; i < solid.length; i += 1) {
          for (let j = i + 1; j < solid.length; j += 1) {
            const sameNode = solid[i].id === solid[j].id;
            // a node's own hit box and label still keep LABEL_CLEAR (slots start hit-half + 4 out)
            if (!keeps(solid[i].box, solid[j].box, LABEL_CLEAR)) {
              throw new Error(`overlap ${solid[i].id} / ${solid[j].id}${sameNode ? ' (same node)' : ''}`);
            }
          }
        }
        for (let i = 0; i < b.gates.length; i += 1) {
          const g = b.gates[i];
          for (const s of solid) {
            if (!keeps(g.box, s.box, GATE_CLEAR)) throw new Error(`gate ${g.key} too close to ${s.id}`);
          }
          if (b.caption) expect(keeps(g.box, b.caption, GATE_CLEAR)).toBe(true);
          for (let j = i + 1; j < b.gates.length; j += 1) expect(keeps(g.box, b.gates[j].box, GATE_CLEAR)).toBe(true);
        }
        if (b.caption) {
          for (const h of b.hits) expect(keeps(b.caption, h.box, 8)).toBe(true);
          for (const l of b.labels) expect(keeps(b.caption, l.box, LABEL_CLEAR)).toBe(true);
        }
      });

      it('(b) keeps every two places of the region the minimum gap apart', () => {
        const { region } = regionBounds(layout, input);
        expect(minPairDistance(region)).toBeGreaterThanOrEqual(minGap);
      });

      it('(c) keeps region places inside the outline and other regions outside, on their side', () => {
        expect(border).not.toBeNull();
        const outline = border as Box;
        for (const n of layout.nodes) {
          const own = regionOf(input, n.id) === input.regionId;
          if (own) {
            expect(n.side).toBeNull();
            expect(inside(hitBox(n, mode.compact), outline)).toBe(true);
            expect(inside(labelBox(n), outline)).toBe(true);
          } else {
            expect(n.side).not.toBeNull();
            expect(intersects(hitBox(n, mode.compact), outline)).toBe(false);
            expect(intersects(labelBox(n), outline)).toBe(false);
            if (n.side === 'top') expect(n.y).toBeLessThan(outline.y0);
            if (n.side === 'bottom') expect(n.y).toBeGreaterThan(outline.y1);
            if (n.side === 'left') expect(n.x).toBeLessThan(outline.x0);
            if (n.side === 'right') expect(n.x).toBeGreaterThan(outline.x1);
          }
        }
      });

      it('(d) ends every edge on its two node centres, with the kinds kept', () => {
        for (const e of layout.edges) {
          const a = node(layout, e.a);
          const z = node(layout, e.b);
          expect([e.x1, e.y1, e.x2, e.y2]).toEqual([a.x, a.y, z.x, z.y]);
          expect(e.key).toBe(`${e.a}-${e.b}`);
          expect(e.a < e.b).toBe(true);
          const ra = regionOf(input, e.a);
          const rb = regionOf(input, e.b);
          expect(ra === input.regionId || rb === input.regionId).toBe(true);
          const uncharted = [e.a, e.b].some((id) => input.places.find((p) => p.id === id)?.terrainType === 'uncharted');
          expect(e.kind).toBe(uncharted ? 'uncharted' : ra === rb ? 'in' : 'cross');
        }
      });

      it('(e) keeps every box PLANE_MARGIN inside the plane, and the plane at least the canvas', () => {
        const all: Box[] = [...b.hits.map((h) => h.box), ...b.labels.map((l) => l.box), ...b.gates.map((g) => g.box)];
        if (b.caption) all.push(b.caption);
        if (border) all.push(border);
        for (const box of all) {
          expect(box.x0).toBeGreaterThanOrEqual(PLANE_MARGIN);
          expect(box.y0).toBeGreaterThanOrEqual(PLANE_MARGIN);
          expect(box.x1).toBeLessThanOrEqual(layout.width - PLANE_MARGIN);
          expect(box.y1).toBeLessThanOrEqual(layout.height - PLANE_MARGIN);
        }
        if (mode.canvas) {
          expect(layout.width).toBeGreaterThanOrEqual(mode.canvas.width);
          expect(layout.height).toBeGreaterThanOrEqual(mode.canvas.height);
        }
      });

      it('(f) passes no edge within 24px of a place it does not connect', () => {
        for (const e of layout.edges) {
          for (const n of layout.nodes) {
            if (n.id === e.a || n.id === e.b) continue;
            expect(distanceToSegment(n, e)).toBeGreaterThanOrEqual(24);
          }
        }
      });

      it('(g) gives each gate its far node side, and sorts nodes and gates in reading order', () => {
        for (const g of layout.gates) expect(g.side).toBe(node(layout, g.farId).side);
        for (let i = 1; i < layout.nodes.length; i += 1) {
          expect(compareReading(layout.nodes[i - 1], layout.nodes[i])).toBeLessThan(0);
        }
        for (let i = 1; i < layout.gates.length; i += 1) {
          const p = layout.gates[i - 1];
          const q = layout.gates[i];
          expect(p.y < q.y || (p.y === q.y && (p.x < q.x || (p.x === q.x && p.key < q.key)))).toBe(true);
        }
      });

      it('(h) has a caption on desktop only', () => {
        if (mode.compact) expect(layout.caption).toBeNull();
        else expect(layout.caption).not.toBeNull();
      });

      it('uses whole pixels everywhere', () => {
        for (const n of layout.nodes) {
          for (const v of [n.x, n.y, n.label.x, n.label.y]) expect(Number.isInteger(v)).toBe(true);
        }
        for (const g of layout.gates) expect(Number.isInteger(g.x) && Number.isInteger(g.y)).toBe(true);
        expect(Number.isInteger(layout.width) && Number.isInteger(layout.height)).toBe(true);
      });

      it('puts each other region on the side its neighbour faces', () => {
        const bounds = regionBounds(layout, input);
        for (const n of layout.nodes) {
          if (n.side === null) continue;
          const nears = layout.edges
            .filter((e) => e.a === n.id || e.b === n.id)
            .map((e) => node(layout, e.a === n.id ? e.b : e.a));
          const mx = nears.reduce((s, m) => s + m.x, 0) / nears.length;
          const my = nears.reduce((s, m) => s + m.y, 0) / nears.length;
          if (n.side === 'top') expect(my).toBeLessThanOrEqual(bounds.cy);
          if (n.side === 'bottom') expect(my).toBeGreaterThanOrEqual(bounds.cy);
          if (n.side === 'left') expect(mx).toBeLessThanOrEqual(bounds.cx);
          if (n.side === 'right') expect(mx).toBeGreaterThanOrEqual(bounds.cx);
        }
      });
    });
  }
}

describe('Sennet Basin (owner: "essentially just a straight line")', () => {
  const chainIds = [4108n, 4109n, 4110n, 4111n, 4112n];

  it('fills the 652 x 600 canvas exactly', () => {
    const layout = layoutGraph({ ...SENNET, canvas: DESK });
    expect([layout.width, layout.height]).toEqual([652, 600]);
  });

  it('bends the chain into two dimensions', () => {
    for (const canvas of [DESK, null]) {
      const layout = layoutGraph({ ...SENNET, canvas });
      const { x0, x1, y0, y1 } = regionBounds(layout, SENNET);
      const aspect = (x1 - x0) / (y1 - y0);
      expect(aspect).toBeGreaterThanOrEqual(0.5);
      expect(aspect).toBeLessThanOrEqual(2);
      const chain = chainIds.map((id) => node(layout, id));
      for (let i = 0; i + 2 < chain.length; i += 1) {
        const [a, m, c] = [chain[i], chain[i + 1], chain[i + 2]];
        const cross = (c.x - a.x) * (m.y - a.y) - (c.y - a.y) * (m.x - a.x);
        const offLine = Math.abs(cross) / Math.hypot(c.x - a.x, c.y - a.y);
        expect(offLine).toBeGreaterThanOrEqual(24);
      }
    }
  });

  it('puts Wend Marsh outside the outline on the side facing Kettlewick Landing', () => {
    const layout = layoutGraph({ ...SENNET, canvas: DESK });
    const wend = node(layout, 4106n);
    const kettlewick = node(layout, 4108n);
    const outline = rect(layout.border as NonNullable<GraphLayout['border']>);
    const { cx, cy } = regionBounds(layout, SENNET);
    expect(wend.side).not.toBeNull();
    if (wend.side === 'top') {
      expect(wend.y).toBeLessThan(outline.y0);
      expect(kettlewick.y).toBeLessThanOrEqual(cy);
    }
    if (wend.side === 'bottom') {
      expect(wend.y).toBeGreaterThan(outline.y1);
      expect(kettlewick.y).toBeGreaterThanOrEqual(cy);
    }
    if (wend.side === 'left') {
      expect(wend.x).toBeLessThan(outline.x0);
      expect(kettlewick.x).toBeLessThanOrEqual(cx);
    }
    if (wend.side === 'right') {
      expect(wend.x).toBeGreaterThan(outline.x1);
      expect(kettlewick.x).toBeGreaterThanOrEqual(cx);
    }
  });

  it('gives more breathing room on a bigger canvas, with no edge longer than MAX_EDGE', () => {
    const small = layoutGraph({ ...SENNET, canvas: DESK });
    const big = layoutGraph({ ...SENNET, canvas: { width: 1100, height: 760 } });
    expect(minPairDistance(regionBounds(big, SENNET).region)).toBeGreaterThan(
      minPairDistance(regionBounds(small, SENNET).region),
    );
    for (const e of big.edges) {
      if (e.kind === 'cross') continue;
      expect(Math.hypot(e.x2 - e.x1, e.y2 - e.y1)).toBeLessThanOrEqual(MAX_EDGE + 1);
    }
  });
});

describe('Tessarine Shelf (owner: "To Kesterlane Basin sits right on top of Cormorant Stair")', () => {
  it('fills the 652 x 600 canvas exactly', () => {
    const layout = layoutGraph({ ...TESSARINE, canvas: DESK });
    expect([layout.width, layout.height]).toEqual([652, 600]);
  });

  it('keeps the Kesterlane gate clear of Cormorant Stair, on desktop and mobile', () => {
    for (const mode of MODES) {
      const layout = layoutGraph({ ...TESSARINE, canvas: mode.canvas, compact: mode.compact });
      const gate = layout.gates.find((g) => g.farId === 5n);
      expect(gate).toBeDefined();
      const stair = node(layout, 4097n);
      const box = gateBox(gate as { x: number; y: number }, mode.compact);
      expect(keeps(box, hitBox(stair, mode.compact), GATE_CLEAR)).toBe(true);
      expect(keeps(box, labelBox(stair), GATE_CLEAR)).toBe(true);
    }
  });

  it('has the two gates of the live data', () => {
    const layout = layoutGraph({ ...TESSARINE, canvas: DESK });
    const byKey = new Map(layout.gates.map((g) => [g.key, g]));
    expect([...byKey.keys()].sort()).toEqual(['4099-4102', '5-4097']);
    expect(byKey.get('5-4097')?.nearId).toBe(4097n);
    expect(byKey.get('5-4097')?.farRegionId).toBe(1n);
    expect(byKey.get('4099-4102')?.nearId).toBe(4099n);
    expect(byKey.get('4099-4102')?.farRegionId).toBe(4098n);
  });
});

describe('start', () => {
  it('starts at the lowest-id bind stone place, else the lowest id', () => {
    const places = [place(1n, 'A'), place(2n, 'B'), place(9n, 'Z', 1n, { bindStone: true })];
    const es = [edge(1n, 2n), edge(2n, 9n)];
    expect(layoutGraph({ regionId: 1n, places, edges: es }).startId).toBe(9n);
    expect(regionStartId(places, 1n)).toBe(9n);

    const twoStones = [place(5n, 'E', 1n, { bindStone: true }), place(3n, 'C', 1n, { bindStone: true })];
    expect(layoutGraph({ regionId: 1n, places: twoStones, edges: [edge(3n, 5n)] }).startId).toBe(3n);
    expect(regionStartId(twoStones, 1n)).toBe(3n);

    const none = [place(4n, 'D'), place(2n, 'B')];
    expect(layoutGraph({ regionId: 1n, places: none, edges: [edge(2n, 4n)] }).startId).toBe(2n);
    expect(regionStartId(none, 1n)).toBe(2n);
  });

  it('ignores places of other regions and returns null for an empty region', () => {
    const places = [place(1n, 'A', 2n, { bindStone: true }), place(4n, 'D', 1n), place(3n, 'C', 1n)];
    expect(regionStartId(places, 1n)).toBe(3n);
    expect(regionStartId(places, 7n)).toBeNull();
  });

  it('puts the start place in the top-left quadrant of the region', () => {
    const layout = layoutGraph({ ...KESTERLANE, canvas: DESK });
    const { cx, cy } = regionBounds(layout, KESTERLANE);
    const start = node(layout, layout.startId as bigint);
    expect(start.x).toBeLessThanOrEqual(cx);
    expect(start.y).toBeLessThanOrEqual(cy);
  });
});

describe('edges', () => {
  it('dedupes a connection given in both directions under the key min-max', () => {
    const layout = layoutGraph({
      regionId: 1n,
      places: [place(1n, 'A'), place(2n, 'B')],
      edges: [edge(2n, 1n), edge(1n, 2n), edge(1n, 2n)],
    });
    expect(layout.edges).toHaveLength(1);
    expect(layout.edges[0].key).toBe('1-2');
    expect(layout.edges[0].a).toBe(1n);
    expect(layout.edges[0].b).toBe(2n);
    expect(layout.edges[0].kind).toBe('in');
  });

  it('types in-region, cross-region and uncharted edges', () => {
    const layout = layoutGraph({
      regionId: 1n,
      places: [
        place(1n, 'A'),
        place(2n, 'B'),
        place(3n, 'Beyond', 1n, { terrainType: 'uncharted' }),
        place(20n, 'Across', 2n),
      ],
      edges: [edge(1n, 2n), edge(2n, 3n), edge(1n, 20n)],
    });
    const kind = (key: string) => layout.edges.find((e) => e.key === key)?.kind;
    expect(kind('1-2')).toBe('in');
    expect(kind('2-3')).toBe('uncharted');
    expect(kind('1-20')).toBe('cross');
  });

  it('does not draw an edge between two border nodes, or to a place that is not there', () => {
    const layout = layoutGraph({
      regionId: 1n,
      places: [place(1n, 'A'), place(20n, 'X', 2n), place(21n, 'Y', 3n)],
      edges: [edge(1n, 20n), edge(1n, 21n), edge(20n, 21n), edge(1n, 99n)],
    });
    expect(layout.edges.map((e) => e.key).sort()).toEqual(['1-20', '1-21']);
  });
});

describe('other regions', () => {
  it('does not draw a place of another region that touches no place of this region', () => {
    const layout = layoutGraph({
      regionId: 1n,
      places: [place(1n, 'A'), place(30n, 'Elsewhere', 2n), place(31n, 'Also', 2n)],
      edges: [edge(30n, 31n)],
    });
    expect(layout.nodes.map((n) => n.id)).toEqual([1n]);
    expect(layout.gates).toEqual([]);
  });

  it('gives a place touching two region places two gates', () => {
    const layout = layoutGraph({
      regionId: 1n,
      places: [place(1n, 'A'), place(2n, 'B'), place(20n, 'Far', 2n)],
      edges: [edge(1n, 2n), edge(1n, 20n), edge(2n, 20n)],
    });
    expect(layout.gates).toHaveLength(2);
    expect(new Set(layout.gates.map((g) => g.key)).size).toBe(2);
    expect(layout.gates.every((g) => g.farId === 20n && g.farRegionId === 2n)).toBe(true);
  });

  it('keeps the uncharted kind on a cross edge and still gives it a gate', () => {
    const layout = layoutGraph({
      regionId: 1n,
      places: [place(1n, 'A'), place(2n, 'B'), place(20n, 'Edge Beyond', 2n, { terrainType: 'uncharted' })],
      edges: [edge(1n, 2n), edge(2n, 20n)],
    });
    expect(layout.edges.find((e) => e.key === '2-20')?.kind).toBe('uncharted');
    expect(layout.gates.map((g) => g.key)).toEqual(['2-20']);
  });
});

describe('determinism', () => {
  const places: LayoutPlace[] = [];
  for (let i = 1; i <= 20; i += 1) {
    places.push(place(BigInt(i), `Place ${(i * 7) % 11}`, 1n, { bindStone: i === 3 }));
  }
  places.push(place(40n, 'Out A', 2n), place(41n, 'Out B', 3n), place(42n, 'Out C', 2n));
  const es = [
    edge(1n, 2n),
    edge(2n, 3n),
    edge(3n, 4n),
    edge(3n, 5n),
    edge(5n, 6n),
    edge(6n, 7n),
    edge(4n, 8n),
    edge(8n, 9n),
    edge(9n, 10n),
    edge(11n, 12n),
    edge(12n, 13n),
    edge(14n, 15n),
    edge(16n, 17n),
    edge(17n, 18n),
    edge(18n, 16n),
    edge(3n, 40n),
    edge(9n, 41n),
    edge(7n, 42n),
    edge(10n, 41n),
  ];

  for (const canvas of [DESK, null]) {
    it(`gives a deeply equal layout for any input order (${canvas ? 'canvas' : 'no canvas'})`, () => {
      const base = layoutGraph({ regionId: 1n, places, edges: es, canvas });
      const reversed = layoutGraph({ regionId: 1n, places: [...places].reverse(), edges: [...es].reverse(), canvas });
      const rotated = layoutGraph({
        regionId: 1n,
        places: [...places.slice(7), ...places.slice(0, 7)],
        edges: [...es.slice(5), ...es.slice(0, 5)],
        canvas,
      });
      const interleaved = layoutGraph({
        regionId: 1n,
        places: [...places.filter((_, i) => i % 2 === 0), ...places.filter((_, i) => i % 2 === 1)],
        edges: [...es.filter((_, i) => i % 3 === 0), ...es.filter((_, i) => i % 3 !== 0)],
        canvas,
      });
      const swapped = layoutGraph({ regionId: 1n, places, edges: es.map((e) => ({ a: e.b, b: e.a })), canvas });
      expect(reversed).toEqual(base);
      expect(rotated).toEqual(base);
      expect(interleaved).toEqual(base);
      expect(swapped).toEqual(base);
      expect(base.nodes).toHaveLength(23);
    });
  }

  it('lays the same input out identically twice', () => {
    expect(layoutGraph({ regionId: 1n, places, edges: es, canvas: DESK })).toEqual(
      layoutGraph({ regionId: 1n, places, edges: es, canvas: DESK }),
    );
  });
});

describe('empty and single', () => {
  it('gives a 96 x 96 plane with no nodes for an empty region, or the canvas size', () => {
    const layout = layoutGraph({ regionId: 1n, places: [place(5n, 'Elsewhere', 2n)], edges: [] });
    expect(layout.nodes).toEqual([]);
    expect(layout.edges).toEqual([]);
    expect(layout.gates).toEqual([]);
    expect(layout.border).toBeNull();
    expect(layout.caption).toBeNull();
    expect(layout.startId).toBeNull();
    expect([layout.width, layout.height]).toEqual([96, 96]);
    expect(layoutGraph({ regionId: 1n, places: [], edges: [] }).width).toBe(96);
    const sized = layoutGraph({ regionId: 1n, places: [], edges: [], canvas: DESK });
    expect([sized.width, sized.height]).toEqual([652, 600]);
  });

  it('puts one place inside a border that fills the canvas', () => {
    const layout = layoutGraph({ regionId: 1n, places: [place(1n, 'Only')], edges: [], canvas: DESK });
    expect(layout.nodes).toHaveLength(1);
    expect(layout.startId).toBe(1n);
    expect([layout.width, layout.height]).toEqual([652, 600]);
    const border = layout.border as NonNullable<GraphLayout['border']>;
    expect(border.x).toBe(PLANE_MARGIN);
    expect(border.y).toBe(PLANE_MARGIN);
    expect(border.w).toBe(652 - 2 * PLANE_MARGIN);
    expect(border.h).toBe(600 - 2 * PLANE_MARGIN);
    expect(inside(hitBox(layout.nodes[0], false), rect(border))).toBe(true);
  });

  it('keeps a lone place label inside its border with no canvas', () => {
    const layout = layoutGraph({ regionId: 1n, places: [place(1n, 'Only')], edges: [] });
    const border = rect(layout.border as NonNullable<GraphLayout['border']>);
    expect(inside(labelBox(layout.nodes[0]), border)).toBe(true);
    expect(inside(hitBox(layout.nodes[0], false), border)).toBe(true);
    expect(border.x0).toBe(PLANE_MARGIN);
    expect(border.y0).toBe(PLANE_MARGIN);
  });
});

describe('compareReading', () => {
  it('orders by y, then x, then id', () => {
    expect(compareReading({ x: 500, y: 10, id: 9n }, { x: 10, y: 20, id: 1n })).toBeLessThan(0);
    expect(compareReading({ x: 10, y: 20, id: 9n }, { x: 30, y: 20, id: 1n })).toBeLessThan(0);
    expect(compareReading({ x: 10, y: 20, id: 1n }, { x: 10, y: 20, id: 2n })).toBeLessThan(0);
    expect(compareReading({ x: 10, y: 20, id: 2n }, { x: 10, y: 20, id: 2n })).toBe(0);
  });
});

describe('performance', () => {
  function bigRegion(): LayoutInput {
    let s = 42;
    const rnd = (): number => {
      s = (s * 1103515245 + 12345) % 2147483648;
      return s / 2147483648;
    };
    const places: LayoutPlace[] = [];
    const es: { a: bigint; b: bigint }[] = [];
    for (let i = 1; i <= 30; i += 1) places.push(place(BigInt(i), `Place ${i}`, 1n, { bindStone: i === 3 }));
    for (let i = 2; i <= 30; i += 1) es.push(edge(BigInt(1 + Math.floor(rnd() * (i - 1))), BigInt(i)));
    for (let k = 0; k < 8; k += 1) es.push(edge(BigInt(1 + Math.floor(rnd() * 30)), BigInt(1 + Math.floor(rnd() * 30))));
    for (let k = 0; k < 4; k += 1) {
      const id = BigInt(100 + k);
      places.push(place(id, `Out ${k}`, 2n + BigInt(k % 2)));
      es.push(edge(BigInt(1 + Math.floor(rnd() * 30)), id));
    }
    return { regionId: 1n, places, edges: es, canvas: DESK };
  }

  it('lays out a 30-place region in under 20ms (median of five after warm-up)', () => {
    const input = bigRegion();
    layoutGraph(input);
    layoutGraph(input);
    const times: number[] = [];
    for (let i = 0; i < 5; i += 1) {
      const t0 = performance.now();
      layoutGraph(input);
      times.push(performance.now() - t0);
    }
    times.sort((a, b) => a - b);
    expect(times[2]).toBeLessThan(20);
    const layout = layoutGraph(input);
    expect(layout.nodes).toHaveLength(34);
    expect(minPairDistance(layout.nodes.filter((n) => n.side === null))).toBeGreaterThanOrEqual(MIN_NODE_GAP);
  });
});

describe('source rules', () => {
  const source = readFileSync(resolve(process.cwd(), 'src/map/graphLayout.ts'), 'utf8');

  it('uses no randomness, time or measured text', () => {
    expect(source).not.toMatch(/Math\.random|Date\b|performance\.now|measureText|getBoundingClientRect|offsetWidth|crypto/);
  });

  it('imports no library, only its siblings', () => {
    const imports = [...source.matchAll(/^import .* from '([^']+)'/gm)].map((m) => m[1]);
    for (const spec of imports) expect(spec.startsWith('./')).toBe(true);
  });

  it('drops the 51-04 column constants', () => {
    expect(source).not.toMatch(/COLUMN_PITCH|ROW_PITCH|BORDER_RIGHT/);
  });
});
