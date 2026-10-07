// Deterministic route-graph layout for the Map (51-UI-SPEC "Route graph", one pixel plane;
// 51-CONTEXT "Owner play-test: map spacing", MS-01 to MS-07).
//
// Pure: plain lists and an optional canvas size in, one plain object out. No randomness, no time and
// no measured text, so the same places, connections, canvas and mode give the same layout in any
// input order. The SVG layer and the HTML nodes of GraphPlane both read this object, so a line
// always ends on a dot's centre.
//
// Steps, each a small private function below:
//   normalise        places by id (first wins), edges deduped by unordered pair, a < b, sorted
//   collect      1, 2  the shown-region places, the border places (other regions touching it), the
//                     drawn edges, all in breadth-first seed order from the start
//   solve        3   golden-angle seeds; stress majorization on softened graph distances (d ^ BEND);
//                    then a symmetric 1-unit spread
//   orient       4   principal axis along the canvas's longer side; the start in the top-left quadrant
//   sidesOf      5   each border place's side: the side its in-region neighbours face (MS-04)
//   stretchFor   6   ky / kx from the room the canvas leaves for the centres, within MAX_STRETCH
//   scaleRange   6   the smallest scale that keeps MIN_NODE_GAP, the largest that keeps MAX_EDGE
//   attempt      7-11 one placement at a scale:
//     placeRegionLabels 7  greedy label slots, the start first, then reading order; slots that stay
//                          inside the region's centre box first, so edge labels turn inward
//     outlineOf         8  the padded box around the region's hit boxes and labels, long enough for
//                          each side's border places, grown on every retry, then to fill the canvas
//     placeBorderNodes 10  border places OUTER_GAP outside their side, spread along it
//     placeCaption      9  the first clear corner of the outline (desktop only, MS-07)
//     placeBorderLabels 10 their labels, outside the outline
//     placeGates       11  where the edge meets the outline, else sliding along the edge, then the outline
//   layoutGraph  6, 12  bisect the scale for the largest filled placement that fits the canvas; while a
//                    label or gate found no room, grow the scale and the outline by 1.2 (at most 8 times)
//   finish       13  shift to the plane margin, centre in the canvas, reading order (IN-07)
//
// Every centre is rounded to whole pixels before anything is placed around it, so the clearances
// the tests check hold exactly on the returned numbers.

import { compareBigint, compareNames } from './order';

export const MIN_NODE_GAP = 160;
export const COMPACT_MIN_NODE_GAP = 112;
export const PLANE_MARGIN = 48;
export const NODE_HIT = 32;
export const COMPACT_NODE_HIT = 44;
export const LABEL_WIDTH = 144;
export const LABEL_HEIGHT = 36;
export const COMPACT_LABEL_HEIGHT = 16;
export const GATE_WIDTH = 176;
export const GATE_HEIGHT = 24;
export const COMPACT_GATE_HEIGHT = 44;
export const GATE_CLEAR = 16;
export const LABEL_CLEAR = 4;
export const CAPTION_WIDTH = 160;
export const CAPTION_HEIGHT = 16;
export const CAPTION_INSET = 16;
export const REGION_PAD = 48;
export const REGION_PAD_TOP = 56;
export const OUTER_GAP = 64;
export const MAX_EDGE = 360;
export const MAX_STRETCH = 1.6;
export const BEND = 0.6;

const SOLVE_SWEEPS = 200;
const SPREAD_SWEEPS = 60;
const FIT_STEPS = 12;
const GROW = 1.2;
const GROW_TRIES = 8;
const EMPTY_PLANE = 96;
const CAPTION_HIT_CLEAR = 8;
const EDGE_SAMPLES = 15;
const SLIDE_STEP = 8;
const SIDE_BIAS = 1.25;
const SIDE_FALLBACK = 0.35;
const DIAGONAL_OFFSET = 8;
const LABEL_CORE_PAD = 48;
const LABEL_CORE_PAD_TOP = 56;
const GOLDEN = Math.PI * (3 - Math.sqrt(5));

export type Side = 'top' | 'right' | 'bottom' | 'left';

export interface CanvasSize {
  width: number;
  height: number;
}

/** Top-left corner, size, and the text alignment inside the box. */
export interface LabelBox {
  x: number;
  y: number;
  w: number;
  h: number;
  align: 'left' | 'right' | 'center';
}

export interface LayoutPlace {
  id: bigint;
  name: string;
  regionId: bigint;
  bindStone: boolean;
  terrainType: string;
}

export interface LayoutNode {
  id: bigint;
  x: number;
  y: number;
  /** null for places of the shown region; the outline side for places of other regions. */
  side: Side | null;
  label: LabelBox;
}

export interface LayoutEdge {
  /** `${a}-${b}` with a the lower id. */
  key: string;
  a: bigint;
  b: bigint;
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  kind: 'in' | 'cross' | 'uncharted';
}

export interface LayoutGate {
  key: string;
  nearId: bigint;
  farId: bigint;
  farRegionId: bigint;
  x: number;
  y: number;
  side: Side;
}

export interface GraphLayout {
  regionId: bigint;
  startId: bigint | null;
  /** In reading order: top to bottom, then left to right, then id. */
  nodes: LayoutNode[];
  edges: LayoutEdge[];
  /** In reading order: y, then x, then key. */
  gates: LayoutGate[];
  border: { x: number; y: number; w: number; h: number } | null;
  /** null on mobile (compact) and for an empty region. */
  caption: { x: number; y: number; w: number; h: number } | null;
  width: number;
  height: number;
}

export interface LayoutInput {
  regionId: bigint;
  places: readonly LayoutPlace[];
  edges: readonly { a: bigint; b: bigint }[];
  /** The measured scroll area; the region fills it. null or absent lays out at the minimum spacing. */
  canvas?: CanvasSize | null;
  /** Mobile: 112px spacing, 44px hit boxes and gate pills, one-line labels, no caption. */
  compact?: boolean;
}

/** Reading order: y, then x, then id. */
export function compareReading(
  a: { x: number; y: number; id: bigint },
  b: { x: number; y: number; id: bigint },
): number {
  return a.y - b.y || a.x - b.x || compareBigint(a.id, b.id);
}

/** The start rule: the lowest-id bind stone place of the region, else its lowest id. */
export function regionStartId(places: readonly LayoutPlace[], regionId: bigint): bigint | null {
  let stone: bigint | null = null;
  let lowest: bigint | null = null;
  for (const p of places) {
    if (p.regionId !== regionId) continue;
    if (lowest === null || p.id < lowest) lowest = p.id;
    if (p.bindStone && (stone === null || p.id < stone)) stone = p.id;
  }
  return stone ?? lowest;
}

// ---------------------------------------------------------------------------------------------
// shared private shapes

interface Box {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

type Slot = 'right' | 'left' | 'below' | 'above' | 'downRight' | 'upRight' | 'downLeft' | 'upLeft';

interface Label extends Box {
  slot: Slot;
}

const REGION_SLOTS: readonly Slot[] = ['right', 'left', 'below', 'above', 'downRight', 'upRight', 'downLeft', 'upLeft'];
const SIDE_SLOTS: Readonly<Record<Side, readonly Slot[]>> = {
  top: ['right', 'left', 'above', 'upRight', 'upLeft'],
  bottom: ['right', 'left', 'below', 'downRight', 'downLeft'],
  left: ['above', 'below', 'left', 'upLeft', 'downLeft'],
  right: ['above', 'below', 'right', 'upRight', 'downRight'],
};
const SIDES: readonly Side[] = ['top', 'right', 'bottom', 'left'];

interface Sizes {
  gap: number;
  half: number;
  labelH: number;
  labelTop: number;
  gateH: number;
  caption: boolean;
}

function sizesFor(compact: boolean): Sizes {
  return compact
    ? { gap: COMPACT_MIN_NODE_GAP, half: COMPACT_NODE_HIT / 2, labelH: COMPACT_LABEL_HEIGHT, labelTop: 8, gateH: COMPACT_GATE_HEIGHT, caption: false }
    : { gap: MIN_NODE_GAP, half: NODE_HIT / 2, labelH: LABEL_HEIGHT, labelTop: 10, gateH: GATE_HEIGHT, caption: true };
}

/** True when a and b come closer than `clear` (touching at exactly `clear` is fine). */
function hits(a: Box, b: Box, clear: number): boolean {
  return a.x0 < b.x1 + clear && b.x0 < a.x1 + clear && a.y0 < b.y1 + clear && b.y0 < a.y1 + clear;
}

interface DrawnEdge {
  key: string;
  a: bigint;
  b: bigint;
  /** Seed indexes of the two ends. */
  ia: number;
  ib: number;
  kind: LayoutEdge['kind'];
  cross: boolean;
}

interface Graph {
  regionId: bigint;
  byId: Map<bigint, LayoutPlace>;
  startId: bigint;
  /** Place ids in seed (breadth-first) order; index 0 is the start. */
  ids: bigint[];
  own: boolean[];
  regionIdx: number[];
  /** Seed indexes of the border places, by id. */
  borderIdx: number[];
  adj: number[][];
  edges: DrawnEdge[];
}

// ---------------------------------------------------------------------------------------------
// steps

/** Places by id (first wins) and edges deduped by unordered pair, both sorted. */
function normalise(input: LayoutInput): {
  byId: Map<bigint, LayoutPlace>;
  edges: { key: string; a: bigint; b: bigint }[];
} {
  const byId = new Map<bigint, LayoutPlace>();
  for (const place of [...input.places].sort((x, y) => compareBigint(x.id, y.id))) {
    if (!byId.has(place.id)) byId.set(place.id, place);
  }
  const seen = new Set<string>();
  const edges: { key: string; a: bigint; b: bigint }[] = [];
  for (const raw of input.edges) {
    if (raw.a === raw.b || !byId.has(raw.a) || !byId.has(raw.b)) continue;
    const a = raw.a < raw.b ? raw.a : raw.b;
    const b = raw.a < raw.b ? raw.b : raw.a;
    const key = `${a}-${b}`;
    if (seen.has(key)) continue;
    seen.add(key);
    edges.push({ key, a, b });
  }
  edges.sort((x, y) => compareBigint(x.a, y.a) || compareBigint(x.b, y.b));
  return { byId, edges };
}

function edgeKind(pa: LayoutPlace, pb: LayoutPlace): LayoutEdge['kind'] {
  if (pa.terrainType === 'uncharted' || pb.terrainType === 'uncharted') return 'uncharted';
  return pa.regionId !== pb.regionId ? 'cross' : 'in';
}

/** Steps 1 and 2: the drawn places and edges, in breadth-first seed order. null for an empty region. */
function collect(input: LayoutInput): Graph | null {
  const { byId, edges } = normalise(input);
  const startId = regionStartId([...byId.values()], input.regionId);
  if (startId === null) return null;

  const own = (id: bigint): boolean => (byId.get(id) as LayoutPlace).regionId === input.regionId;
  const drawn: { key: string; a: bigint; b: bigint }[] = [];
  const neighbours = new Map<bigint, bigint[]>();
  for (const p of byId.values()) if (p.regionId === input.regionId) neighbours.set(p.id, []);
  for (const e of edges) {
    const aOwn = own(e.a);
    const bOwn = own(e.b);
    if (!aOwn && !bOwn) continue;
    drawn.push(e);
    for (const [from, to] of [
      [e.a, e.b],
      [e.b, e.a],
    ]) {
      const list = neighbours.get(from);
      if (list) list.push(to);
      else neighbours.set(from, [to]);
    }
  }
  const byNameThenId = (x: bigint, y: bigint): number =>
    compareNames((byId.get(x) as LayoutPlace).name, (byId.get(y) as LayoutPlace).name) || compareBigint(x, y);
  for (const list of neighbours.values()) list.sort(byNameThenId);

  const ids: bigint[] = [];
  const index = new Map<bigint, number>();
  const visit = (root: bigint): void => {
    index.set(root, ids.length);
    ids.push(root);
    for (let head = ids.length - 1; head < ids.length; head += 1) {
      for (const next of neighbours.get(ids[head]) ?? []) {
        if (index.has(next)) continue;
        index.set(next, ids.length);
        ids.push(next);
      }
    }
  };
  visit(startId);
  const rest = [...neighbours.keys()].filter((id) => own(id)).sort(byNameThenId);
  for (const id of rest) if (!index.has(id)) visit(id);

  const n = ids.length;
  const adj: number[][] = [];
  for (let i = 0; i < n; i += 1) adj.push((neighbours.get(ids[i]) ?? []).map((id) => index.get(id) as number));
  const ownFlags = ids.map(own);
  const regionIdx: number[] = [];
  const borderIdx: number[] = [];
  for (let i = 0; i < n; i += 1) (ownFlags[i] ? regionIdx : borderIdx).push(i);
  borderIdx.sort((x, y) => compareBigint(ids[x], ids[y]));

  return {
    regionId: input.regionId,
    byId,
    startId,
    ids,
    own: ownFlags,
    regionIdx,
    borderIdx,
    adj,
    edges: drawn.map((e) => {
      const pa = byId.get(e.a) as LayoutPlace;
      const pb = byId.get(e.b) as LayoutPlace;
      return {
        ...e,
        ia: index.get(e.a) as number,
        ib: index.get(e.b) as number,
        kind: edgeKind(pa, pb),
        cross: pa.regionId !== pb.regionId,
      };
    }),
  };
}

/** Step 3: stress majorization on d ^ BEND from golden-angle seeds, then a 1-unit spread. */
function solve(g: Graph): { X: Float64Array; Y: Float64Array } {
  const n = g.ids.length;
  const dist = new Int32Array(n * n).fill(-1);
  const queue = new Int32Array(n);
  let longest = 1;
  for (let s = 0; s < n; s += 1) {
    const row = s * n;
    dist[row + s] = 0;
    queue[0] = s;
    let tail = 1;
    for (let head = 0; head < tail; head += 1) {
      const c = queue[head];
      for (const m of g.adj[c]) {
        if (dist[row + m] !== -1) continue;
        dist[row + m] = dist[row + c] + 1;
        if (dist[row + m] > longest) longest = dist[row + m];
        queue[tail] = m;
        tail += 1;
      }
    }
  }
  const target = new Float64Array(n * n);
  const weight = new Float64Array(n * n);
  for (let k = 0; k < n * n; k += 1) {
    const d = dist[k] === -1 ? longest + 1 : dist[k];
    if (d === 0) continue;
    const t = Math.pow(d, BEND);
    target[k] = t;
    weight[k] = 1 / (t * t);
  }

  const X = new Float64Array(n);
  const Y = new Float64Array(n);
  for (let k = 0; k < n; k += 1) {
    const r = Math.sqrt(k);
    X[k] = r * Math.cos(k * GOLDEN);
    Y[k] = r * Math.sin(k * GOLDEN);
  }
  for (let sweep = 0; sweep < SOLVE_SWEEPS; sweep += 1) {
    for (let i = 0; i < n; i += 1) {
      let sx = 0;
      let sy = 0;
      let sw = 0;
      const row = i * n;
      for (let j = 0; j < n; j += 1) {
        if (j === i) continue;
        let dx = X[i] - X[j];
        let dy = Y[i] - Y[j];
        let d = Math.sqrt(dx * dx + dy * dy);
        if (d < 1e-9) {
          const a = (i + 1) * GOLDEN;
          dx = Math.cos(a) * 1e-3;
          dy = Math.sin(a) * 1e-3;
          d = 1e-3;
        }
        const w = weight[row + j];
        const t = target[row + j];
        sx += w * (X[j] + (t * dx) / d);
        sy += w * (Y[j] + (t * dy) / d);
        sw += w;
      }
      if (sw > 0) {
        X[i] = sx / sw;
        Y[i] = sy / sw;
      }
    }
  }
  for (let sweep = 0; sweep < SPREAD_SWEEPS; sweep += 1) {
    let moved = false;
    for (let i = 0; i < n; i += 1) {
      for (let j = i + 1; j < n; j += 1) {
        let dx = X[j] - X[i];
        let dy = Y[j] - Y[i];
        let d = Math.sqrt(dx * dx + dy * dy);
        if (d >= 1) continue;
        if (d < 1e-9) {
          const a = (i + j + 1) * GOLDEN;
          dx = Math.cos(a);
          dy = Math.sin(a);
          d = 0;
        } else {
          dx /= d;
          dy /= d;
        }
        const push = (1 - d) / 2 + 1e-6;
        X[i] -= dx * push;
        Y[i] -= dy * push;
        X[j] += dx * push;
        Y[j] += dy * push;
        moved = true;
      }
    }
    if (!moved) break;
  }
  return { X, Y };
}

/** Step 4: principal axis along the canvas's longer side, then the start into the top-left quadrant. */
function orient(g: Graph, X: Float64Array, Y: Float64Array, canvas: CanvasSize | null): void {
  let mx = 0;
  let my = 0;
  for (const i of g.regionIdx) {
    mx += X[i];
    my += Y[i];
  }
  mx /= g.regionIdx.length;
  my /= g.regionIdx.length;
  let sxx = 0;
  let syy = 0;
  let sxy = 0;
  for (const i of g.regionIdx) {
    const dx = X[i] - mx;
    const dy = Y[i] - my;
    sxx += dx * dx;
    syy += dy * dy;
    sxy += dx * dy;
  }
  let theta = 0.5 * Math.atan2(2 * sxy, sxx - syy);
  if (canvas && canvas.height > canvas.width) theta += Math.PI / 2;
  const c = Math.cos(-theta);
  const s = Math.sin(-theta);
  for (let i = 0; i < X.length; i += 1) {
    const x = X[i] - mx;
    const y = Y[i] - my;
    X[i] = x * c - y * s;
    Y[i] = x * s + y * c;
  }
  // index 0 is the start
  if (X[0] > 1e-9) for (let i = 0; i < X.length; i += 1) X[i] = -X[i];
  if (Y[0] > 1e-9) for (let i = 0; i < Y.length; i += 1) Y[i] = -Y[i];
}

interface UnitBox {
  cx: number;
  cy: number;
  w: number;
  h: number;
}

function unitBox(g: Graph, X: Float64Array, Y: Float64Array): UnitBox {
  let x0 = Infinity;
  let x1 = -Infinity;
  let y0 = Infinity;
  let y1 = -Infinity;
  for (const i of g.regionIdx) {
    if (X[i] < x0) x0 = X[i];
    if (X[i] > x1) x1 = X[i];
    if (Y[i] < y0) y0 = Y[i];
    if (Y[i] > y1) y1 = Y[i];
  }
  return { cx: (x0 + x1) / 2, cy: (y0 + y1) / 2, w: x1 - x0, h: y1 - y0 };
}

/** Step 5 (MS-04): the side each border place sits on, facing its in-region neighbours. */
function sidesOf(g: Graph, X: Float64Array, Y: Float64Array, unit: UnitBox): (Side | null)[] {
  const sides: (Side | null)[] = g.ids.map(() => null);
  const hw = Math.max(unit.w / 2, 0.5);
  const hh = Math.max(unit.h / 2, 0.5);
  for (const i of g.borderIdx) {
    let nx = 0;
    let ny = 0;
    let count = 0;
    for (const m of g.adj[i]) {
      if (!g.own[m]) continue;
      nx += X[m];
      ny += Y[m];
      count += 1;
    }
    nx /= count;
    ny /= count;
    let vx = (nx - unit.cx) / hw;
    let vy = (ny - unit.cy) / hh;
    if (Math.sqrt(vx * vx + vy * vy) < SIDE_FALLBACK) {
      vx = (X[i] - nx) / hw;
      vy = (Y[i] - ny) / hh;
    }
    sides[i] = Math.abs(vx) > SIDE_BIAS * Math.abs(vy) ? (vx < 0 ? 'left' : 'right') : vy < 0 ? 'top' : 'bottom';
  }
  return sides;
}

/** The room outside the outline that the sides in use need (top or bottom, left or right). */
function bandsOf(sides: readonly (Side | null)[], sizes: Sizes): Record<Side, number> {
  // a top or bottom border place's label sits beside it, reaching labelTop above and the rest below
  const top = OUTER_GAP + Math.max(sizes.half, sizes.labelTop) + 8;
  const bottom = OUTER_GAP + Math.max(sizes.half, sizes.labelH - sizes.labelTop) + 8;
  const lr = OUTER_GAP + LABEL_WIDTH / 2 + 4;
  return {
    top: sides.includes('top') ? top : 0,
    bottom: sides.includes('bottom') ? bottom : 0,
    left: sides.includes('left') ? lr : 0,
    right: sides.includes('right') ? lr : 0,
  };
}

/**
 * Step 6, stretch: ky / kx from the aspect of the room the centres can use (the canvas minus the
 * margins, the outer bands, the outline padding and the hit boxes) relative to the region's unit box,
 * clamped to MAX_STRETCH. 1 with no canvas.
 */
function stretchFor(unit: UnitBox, sides: readonly (Side | null)[], canvas: CanvasSize | null, sizes: Sizes): number {
  if (!canvas) return 1;
  const band = bandsOf(sides, sizes);
  const roomW = canvas.width - 2 * PLANE_MARGIN - band.left - band.right - 2 * REGION_PAD - 2 * sizes.half;
  const roomH =
    canvas.height - 2 * PLANE_MARGIN - band.top - band.bottom - REGION_PAD - REGION_PAD_TOP - 2 * sizes.half;
  const ratio = Math.max(roomH, 1) / Math.max(unit.h, 1) / (Math.max(roomW, 1) / Math.max(unit.w, 1));
  return Math.min(Math.max(ratio, 1 / MAX_STRETCH), MAX_STRETCH);
}

/** Step 6, range: the smallest scale that keeps the minimum gap, the largest that keeps MAX_EDGE. */
function scaleRange(g: Graph, X: Float64Array, Y: Float64Array, ratio: number, sizes: Sizes): { kMin: number; kMax: number } {
  // two extra pixels, so rounding the centres to whole pixels never breaks the gap
  const gap = sizes.gap + 2;
  let kMin = g.regionIdx.length === 1 ? gap : 0;
  for (let a = 0; a < g.regionIdx.length; a += 1) {
    for (let b = a + 1; b < g.regionIdx.length; b += 1) {
      const i = g.regionIdx[a];
      const j = g.regionIdx[b];
      const d = Math.hypot(X[i] - X[j], (Y[i] - Y[j]) * ratio);
      kMin = Math.max(kMin, gap / Math.max(d, 1e-9));
    }
  }
  let longest = 0;
  for (const e of g.edges) {
    if (e.cross) continue;
    longest = Math.max(longest, Math.hypot(X[e.ia] - X[e.ib], (Y[e.ia] - Y[e.ib]) * ratio));
  }
  const kEdge = longest > 0 ? MAX_EDGE / longest : MAX_EDGE;
  return { kMin, kMax: Math.max(kMin, kEdge) };
}

// ---------------------------------------------------------------------------------------------
// one placement at a scale (steps 7 to 11)

interface PlacedGate {
  edge: DrawnEdge;
  near: number;
  far: number;
  x: number;
  y: number;
  box: Box;
}

interface Attempt {
  ok: boolean;
  px: Float64Array;
  py: Float64Array;
  hitBoxes: Box[];
  labels: Label[];
  outline: Box;
  caption: Box | null;
  gates: PlacedGate[];
}

interface Context {
  g: Graph;
  X: Float64Array;
  Y: Float64Array;
  unit: UnitBox;
  sides: (Side | null)[];
  sizes: Sizes;
  canvas: CanvasSize | null;
  ratio: number;
}

function slotBox(x: number, y: number, slot: Slot, s: Sizes, out: Label): Label {
  const h = s.half;
  const lw = LABEL_WIDTH;
  const lh = s.labelH;
  let x0 = 0;
  let y0 = 0;
  switch (slot) {
    case 'right':
      x0 = x + h + LABEL_CLEAR;
      y0 = y - s.labelTop;
      break;
    case 'left':
      x0 = x - h - LABEL_CLEAR - lw;
      y0 = y - s.labelTop;
      break;
    case 'below':
      x0 = x - lw / 2;
      y0 = y + h + LABEL_CLEAR;
      break;
    case 'above':
      x0 = x - lw / 2;
      y0 = y - h - LABEL_CLEAR - lh;
      break;
    case 'downRight':
      x0 = x + DIAGONAL_OFFSET;
      y0 = y + h + LABEL_CLEAR;
      break;
    case 'upRight':
      x0 = x + DIAGONAL_OFFSET;
      y0 = y - h - LABEL_CLEAR - lh;
      break;
    case 'downLeft':
      x0 = x - DIAGONAL_OFFSET - lw;
      y0 = y + h + LABEL_CLEAR;
      break;
    case 'upLeft':
      x0 = x - DIAGONAL_OFFSET - lw;
      y0 = y - h - LABEL_CLEAR - lh;
      break;
  }
  out.x0 = x0;
  out.y0 = y0;
  out.x1 = x0 + lw;
  out.y1 = y0 + lh;
  out.slot = slot;
  return out;
}

/** Edge sample points (EDGE_SAMPLES per edge) for the label score, for edges with both ends placed. */
function sampleEdges(ctx: Context, a: Attempt, placed: Uint8Array, samples: Float64Array, ready: Uint8Array): void {
  ctx.g.edges.forEach((e, k) => {
    if (ready[k] || !placed[e.ia] || !placed[e.ib]) return;
    ready[k] = 1;
    const base = k * EDGE_SAMPLES * 2;
    for (let q = 0; q < EDGE_SAMPLES; q += 1) {
      const t = (q + 1) / (EDGE_SAMPLES + 1);
      samples[base + q * 2] = a.px[e.ia] + (a.px[e.ib] - a.px[e.ia]) * t;
      samples[base + q * 2 + 1] = a.py[e.ia] + (a.py[e.ib] - a.py[e.ia]) * t;
    }
  });
}

function edgePenalty(ctx: Context, idx: number, box: Box, samples: Float64Array, ready: Uint8Array): number {
  let count = 0;
  const edges = ctx.g.edges;
  for (let k = 0; k < edges.length; k += 1) {
    if (!ready[k] || edges[k].ia === idx || edges[k].ib === idx) continue;
    const base = k * EDGE_SAMPLES * 2;
    for (let q = 0; q < EDGE_SAMPLES; q += 1) {
      const x = samples[base + q * 2];
      const y = samples[base + q * 2 + 1];
      if (x > box.x0 && x < box.x1 && y > box.y0 && y < box.y1) count += 1;
    }
  }
  return count;
}

/** The best slot for one label, or null when no slot is valid. */
function bestLabel(
  ctx: Context,
  a: Attempt,
  idx: number,
  slots: readonly Slot[],
  valid: (box: Box) => boolean,
  samples: Float64Array,
  ready: Uint8Array,
): Label | null {
  const probe: Label = { x0: 0, y0: 0, x1: 0, y1: 0, slot: 'right' };
  let best: Label | null = null;
  let bestScore = Infinity;
  for (let k = 0; k < slots.length; k += 1) {
    if (k >= bestScore) break;
    slotBox(a.px[idx], a.py[idx], slots[k], ctx.sizes, probe);
    if (!valid(probe)) continue;
    const score = edgePenalty(ctx, idx, probe, samples, ready) * 10 + k;
    if (score < bestScore) {
      bestScore = score;
      best = { ...probe };
    }
  }
  return best;
}

function labelClear(box: Box, a: Attempt, placed: Uint8Array): boolean {
  for (let i = 0; i < a.hitBoxes.length; i += 1) {
    if (placed[i] && hits(box, a.hitBoxes[i], LABEL_CLEAR)) return false;
  }
  for (let i = 0; i < a.labels.length; i += 1) {
    if (a.labels[i] && hits(box, a.labels[i], LABEL_CLEAR)) return false;
  }
  return true;
}

function setHitBox(a: Attempt, i: number, half: number): void {
  a.hitBoxes[i] = { x0: a.px[i] - half, y0: a.py[i] - half, x1: a.px[i] + half, y1: a.py[i] + half };
}

/** Step 7: region labels, the start first, then the rest in reading order. */
function placeRegionLabels(
  ctx: Context,
  a: Attempt,
  placed: Uint8Array,
  samples: Float64Array,
  ready: Uint8Array,
): void {
  const { g } = ctx;
  const order = g.regionIdx.slice(1).sort((i, j) => a.py[i] - a.py[j] || a.px[i] - a.px[j] || compareBigint(g.ids[i], g.ids[j]));
  order.unshift(0);
  // first choice: slots inside the box of the region's centres padded by LABEL_CORE_PAD, so labels
  // turn inward at the region's edges; otherwise any clear slot (the outline then grows around it)
  let cx0 = Infinity;
  let cy0 = Infinity;
  let cx1 = -Infinity;
  let cy1 = -Infinity;
  for (const i of g.regionIdx) {
    if (a.px[i] < cx0) cx0 = a.px[i];
    if (a.py[i] < cy0) cy0 = a.py[i];
    if (a.px[i] > cx1) cx1 = a.px[i];
    if (a.py[i] > cy1) cy1 = a.py[i];
  }
  const core = { x0: cx0 - LABEL_CORE_PAD, y0: cy0 - LABEL_CORE_PAD_TOP, x1: cx1 + LABEL_CORE_PAD, y1: cy1 + LABEL_CORE_PAD };
  const inCore = (box: Box): boolean =>
    box.x0 >= core.x0 && box.x1 <= core.x1 && box.y0 >= core.y0 && box.y1 <= core.y1 && labelClear(box, a, placed);
  for (const i of order) {
    const label =
      bestLabel(ctx, a, i, REGION_SLOTS, inCore, samples, ready) ??
      bestLabel(ctx, a, i, REGION_SLOTS, (box) => labelClear(box, a, placed), samples, ready);
    if (label) a.labels[i] = label;
    else {
      a.ok = false;
      a.labels[i] = slotBox(a.px[i], a.py[i], REGION_SLOTS[0], ctx.sizes, { x0: 0, y0: 0, x1: 0, y1: 0, slot: 'right' });
    }
  }
}

/** Step 8: the padded outline around the region's hit boxes and labels, grown to fill the canvas. */
function outlineOf(ctx: Context, a: Attempt, fill: boolean, growth: number): Box {
  let x0 = Infinity;
  let y0 = Infinity;
  let x1 = -Infinity;
  let y1 = -Infinity;
  for (const i of ctx.g.regionIdx) {
    for (const b of [a.hitBoxes[i], a.labels[i]]) {
      if (b.x0 < x0) x0 = b.x0;
      if (b.y0 < y0) y0 = b.y0;
      if (b.x1 > x1) x1 = b.x1;
      if (b.y1 > y1) y1 = b.y1;
    }
  }
  const o = { x0: x0 - REGION_PAD, y0: y0 - REGION_PAD_TOP, x1: x1 + REGION_PAD, y1: y1 + REGION_PAD };
  // room along each side for its border places, and more room on every grow (step 12)
  let wantW = (o.x1 - o.x0) * growth;
  let wantH = (o.y1 - o.y0) * growth;
  const h = ctx.sizes.half;
  for (const side of SIDES) {
    const count = ctx.sides.filter((s) => s === side).length;
    if (count === 0) continue;
    const horizontal = side === 'top' || side === 'bottom';
    const need = (count - 1) * borderSpacing(horizontal, ctx.sizes) + 2 * (h + 8) + GATE_WIDTH;
    if (horizontal) wantW = Math.max(wantW, need);
    else wantH = Math.max(wantH, need);
  }
  growBox(o, Math.ceil(wantW), Math.ceil(wantH));
  if (fill && ctx.canvas) {
    const band = bandsOf(ctx.sides, ctx.sizes);
    const availW = ctx.canvas.width - 2 * PLANE_MARGIN - band.left - band.right;
    const availH = ctx.canvas.height - 2 * PLANE_MARGIN - band.top - band.bottom;
    growBox(o, availW, availH);
  }
  return o;
}

/** Grows a box symmetrically to at least w x h (whole pixels). */
function growBox(o: Box, w: number, h: number): void {
  const ew = w - (o.x1 - o.x0);
  const eh = h - (o.y1 - o.y0);
  if (ew > 0) {
    o.x0 -= Math.floor(ew / 2);
    o.x1 += ew - Math.floor(ew / 2);
  }
  if (eh > 0) {
    o.y0 -= Math.floor(eh / 2);
    o.y1 += eh - Math.floor(eh / 2);
  }
}

/** The spacing of border places along a side: top and bottom fit a label beside each node. */
function borderSpacing(horizontal: boolean, s: Sizes): number {
  return horizontal ? s.half + 20 + LABEL_WIDTH + 16 : 2 * s.half + 2 * s.labelH + 24;
}

/** Step 10, positions: each border place OUTER_GAP outside its side, spread along it. */
function placeBorderNodes(ctx: Context, a: Attempt, kx: number, ky: number, placed: Uint8Array): void {
  const { g, X, Y, unit, sides, sizes } = ctx;
  const o = a.outline;
  const h = sizes.half;
  for (const side of SIDES) {
    const horizontal = side === 'top' || side === 'bottom';
    const list: { i: number; along: number }[] = [];
    for (const i of g.borderIdx) {
      if (sides[i] !== side) continue;
      list.push({ i, along: horizontal ? (X[i] - unit.cx) * kx : (Y[i] - unit.cy) * ky });
    }
    if (list.length === 0) continue;
    const lo = (horizontal ? o.x0 : o.y0) + h + 8;
    const hi = (horizontal ? o.x1 : o.y1) - h - 8;
    const gap = borderSpacing(horizontal, sizes);
    for (const b of list) b.along = Math.min(Math.max(b.along, lo), hi);
    list.sort((p, q) => p.along - q.along || compareBigint(g.ids[p.i], g.ids[q.i]));
    for (let q = 1; q < list.length; q += 1) {
      if (list[q].along < list[q - 1].along + gap) list[q].along = list[q - 1].along + gap;
    }
    const over = list[list.length - 1].along - hi;
    if (over > 0) {
      for (const b of list) b.along -= over;
      for (let q = list.length - 2; q >= 0; q -= 1) {
        if (list[q].along > list[q + 1].along - gap) list[q].along = list[q + 1].along - gap;
      }
    }
    for (const b of list) {
      const along = Math.round(b.along);
      if (side === 'top') {
        a.px[b.i] = along;
        a.py[b.i] = o.y0 - OUTER_GAP;
      } else if (side === 'bottom') {
        a.px[b.i] = along;
        a.py[b.i] = o.y1 + OUTER_GAP;
      } else if (side === 'left') {
        a.px[b.i] = o.x0 - OUTER_GAP;
        a.py[b.i] = along;
      } else {
        a.px[b.i] = o.x1 + OUTER_GAP;
        a.py[b.i] = along;
      }
      setHitBox(a, b.i, h);
      placed[b.i] = 1;
    }
  }
}

/** Where a cross edge meets its side of the outline (the gate's first candidate), unrounded. */
function crossing(ctx: Context, a: Attempt, near: number, far: number): { x: number; y: number; t: number } {
  const o = a.outline;
  const side = ctx.sides[far] as Side;
  const alongX = side === 'left' || side === 'right';
  const line = side === 'left' ? o.x0 : side === 'right' ? o.x1 : side === 'top' ? o.y0 : o.y1;
  const n0 = alongX ? a.px[near] : a.py[near];
  const f0 = alongX ? a.px[far] : a.py[far];
  const t = Math.abs(f0 - n0) > 1e-9 ? (line - n0) / (f0 - n0) : 0.5;
  return { x: a.px[near] + (a.px[far] - a.px[near]) * t, y: a.py[near] + (a.py[far] - a.py[near]) * t, t };
}

function gateBoxAt(x: number, y: number, s: Sizes): Box {
  return { x0: x - GATE_WIDTH / 2, y0: y - s.gateH / 2, x1: x + GATE_WIDTH / 2, y1: y + s.gateH / 2 };
}

function crossEnds(ctx: Context, e: DrawnEdge): { near: number; far: number } {
  return ctx.g.own[e.ia] ? { near: e.ia, far: e.ib } : { near: e.ib, far: e.ia };
}

/** Step 9 (desktop only): the first outline corner clear of hit boxes, labels and first gate spots. */
function placeCaption(ctx: Context, a: Attempt, kx: number, ky: number, placed: Uint8Array): void {
  if (!ctx.sizes.caption) return;
  const firstGates: Box[] = [];
  for (const e of ctx.g.edges) {
    if (!e.cross) continue;
    const { near, far } = crossEnds(ctx, e);
    const c = crossing(ctx, a, near, far);
    firstGates.push(gateBoxAt(Math.round(c.x), Math.round(c.y), ctx.sizes));
  }
  const corner = (o: Box, k: number): Box => {
    const x = k % 2 === 0 ? o.x0 + CAPTION_INSET : o.x1 - CAPTION_INSET - CAPTION_WIDTH;
    const y = k < 2 ? o.y0 + CAPTION_INSET : o.y1 - CAPTION_INSET - CAPTION_HEIGHT;
    return { x0: x, y0: y, x1: x + CAPTION_WIDTH, y1: y + CAPTION_HEIGHT };
  };
  const clear = (box: Box): boolean => {
    for (let i = 0; i < a.hitBoxes.length; i += 1) {
      if (placed[i] && hits(box, a.hitBoxes[i], CAPTION_HIT_CLEAR)) return false;
    }
    for (const label of a.labels) if (label && hits(box, label, LABEL_CLEAR)) return false;
    for (const gate of firstGates) if (hits(box, gate, GATE_CLEAR)) return false;
    return true;
  };
  for (let k = 0; k < 4; k += 1) {
    const box = corner(a.outline, k);
    if (clear(box)) {
      a.caption = box;
      return;
    }
  }
  // no corner is clear: a caption strip on top of the outline, and the border places move with it
  a.outline.y0 -= CAPTION_INSET + CAPTION_HEIGHT;
  placeBorderNodes(ctx, a, kx, ky, placed);
  a.caption = corner(a.outline, 0);
}

/** Step 10, labels: the border places' labels, outside the outline. */
function placeBorderLabels(
  ctx: Context,
  a: Attempt,
  placed: Uint8Array,
  samples: Float64Array,
  ready: Uint8Array,
): void {
  const { g } = ctx;
  const order = g.borderIdx
    .slice()
    .sort((i, j) => a.py[i] - a.py[j] || a.px[i] - a.px[j] || compareBigint(g.ids[i], g.ids[j]));
  const valid = (box: Box): boolean =>
    !hits(box, a.outline, 0) && labelClear(box, a, placed) && !(a.caption && hits(box, a.caption, LABEL_CLEAR));
  for (const i of order) {
    const slots = SIDE_SLOTS[ctx.sides[i] as Side];
    const label = bestLabel(ctx, a, i, slots, valid, samples, ready);
    if (label) a.labels[i] = label;
    else {
      a.ok = false;
      a.labels[i] = slotBox(a.px[i], a.py[i], slots[0], ctx.sizes, { x0: 0, y0: 0, x1: 0, y1: 0, slot: 'right' });
    }
  }
}

/** Step 11 (CR-01): one gate per cross edge, GATE_CLEAR from everything. */
function placeGates(ctx: Context, a: Attempt): void {
  const s = ctx.sizes;
  const o = a.outline;
  const clear = (box: Box): boolean => {
    for (const h of a.hitBoxes) if (hits(box, h, GATE_CLEAR)) return false;
    for (const l of a.labels) if (hits(box, l, GATE_CLEAR)) return false;
    if (a.caption && hits(box, a.caption, GATE_CLEAR)) return false;
    for (const gate of a.gates) if (hits(box, gate.box, GATE_CLEAR)) return false;
    return true;
  };
  for (const e of ctx.g.edges) {
    if (!e.cross) continue;
    const { near, far } = crossEnds(ctx, e);
    const c = crossing(ctx, a, near, far);
    const pick = { x: 0, y: 0, box: null as Box | null };
    const attemptAt = (x: number, y: number): boolean => {
      const rx = Math.round(x);
      const ry = Math.round(y);
      const box = gateBoxAt(rx, ry, s);
      if (!clear(box)) return false;
      pick.x = rx;
      pick.y = ry;
      pick.box = box;
      return true;
    };
    let found = attemptAt(c.x, c.y);
    // along the edge, alternating toward the far and the near node, strictly between them
    const dx = a.px[far] - a.px[near];
    const dy = a.py[far] - a.py[near];
    const len = Math.sqrt(dx * dx + dy * dy);
    for (let q = 1; !found && q * SLIDE_STEP < len; q += 1) {
      for (const sign of [1, -1]) {
        const t = c.t + (sign * q * SLIDE_STEP) / len;
        if (t <= 0 || t >= 1) continue;
        if (attemptAt(a.px[near] + dx * t, a.py[near] + dy * t)) {
          found = true;
          break;
        }
      }
    }
    // along the outline side, alternating directions
    const side = ctx.sides[far] as Side;
    const horizontal = side === 'top' || side === 'bottom';
    const lo = horizontal ? o.x0 : o.y0;
    const hi = horizontal ? o.x1 : o.y1;
    const base = horizontal ? c.x : c.y;
    for (let q = 1; !found; q += 1) {
      const up = base + q * SLIDE_STEP;
      const down = base - q * SLIDE_STEP;
      if (up > hi && down < lo) break;
      for (const v of [up, down]) {
        if (v < lo || v > hi) continue;
        if (horizontal ? attemptAt(v, c.y) : attemptAt(c.x, v)) {
          found = true;
          break;
        }
      }
    }
    if (!found || !pick.box) {
      a.ok = false;
      pick.x = Math.round(c.x);
      pick.y = Math.round(c.y);
      pick.box = gateBoxAt(pick.x, pick.y, s);
    }
    a.gates.push({ edge: e, near, far, x: pick.x, y: pick.y, box: pick.box });
  }
}

/** Steps 7 to 11 at scale k. */
function attempt(ctx: Context, k: number, fill: boolean, growth = 1): Attempt {
  const { g, X, Y, unit, sizes } = ctx;
  const n = g.ids.length;
  const kx = k;
  const ky = k * ctx.ratio;
  const a: Attempt = {
    ok: true,
    px: new Float64Array(n),
    py: new Float64Array(n),
    hitBoxes: new Array<Box>(n),
    labels: new Array<Label>(n),
    outline: { x0: 0, y0: 0, x1: 0, y1: 0 },
    caption: null,
    gates: [],
  };
  const placed = new Uint8Array(n);
  for (const i of g.regionIdx) {
    a.px[i] = Math.round((X[i] - unit.cx) * kx);
    a.py[i] = Math.round((Y[i] - unit.cy) * ky);
    setHitBox(a, i, sizes.half);
    placed[i] = 1;
  }
  const samples = new Float64Array(g.edges.length * EDGE_SAMPLES * 2);
  const ready = new Uint8Array(g.edges.length);
  sampleEdges(ctx, a, placed, samples, ready);
  placeRegionLabels(ctx, a, placed, samples, ready);
  a.outline = outlineOf(ctx, a, fill, growth);
  placeBorderNodes(ctx, a, kx, ky, placed);
  placeCaption(ctx, a, kx, ky, placed);
  sampleEdges(ctx, a, placed, samples, ready);
  placeBorderLabels(ctx, a, placed, samples, ready);
  placeGates(ctx, a);
  return a;
}

function extentOf(a: Attempt): Box {
  const ext = { x0: a.outline.x0, y0: a.outline.y0, x1: a.outline.x1, y1: a.outline.y1 };
  const grow = (b: Box): void => {
    if (b.x0 < ext.x0) ext.x0 = b.x0;
    if (b.y0 < ext.y0) ext.y0 = b.y0;
    if (b.x1 > ext.x1) ext.x1 = b.x1;
    if (b.y1 > ext.y1) ext.y1 = b.y1;
  };
  for (const b of a.hitBoxes) grow(b);
  for (const b of a.labels) grow(b);
  for (const gate of a.gates) grow(gate.box);
  if (a.caption) grow(a.caption);
  return ext;
}

function emptyLayout(regionId: bigint, canvas: CanvasSize | null): GraphLayout {
  return {
    regionId,
    startId: null,
    nodes: [],
    edges: [],
    gates: [],
    border: null,
    caption: null,
    width: canvas ? canvas.width : EMPTY_PLANE,
    height: canvas ? canvas.height : EMPTY_PLANE,
  };
}

function alignOf(slot: Slot): LabelBox['align'] {
  if (slot === 'left' || slot === 'upLeft' || slot === 'downLeft') return 'right';
  if (slot === 'above' || slot === 'below') return 'center';
  return 'left';
}

/** Step 13: shift to the plane margin, centre in the canvas, reading order. */
function finish(ctx: Context, a: Attempt): GraphLayout {
  const { g, canvas } = ctx;
  const ext = extentOf(a);
  let dx = PLANE_MARGIN - ext.x0;
  let dy = PLANE_MARGIN - ext.y0;
  let width = ext.x1 - ext.x0 + 2 * PLANE_MARGIN;
  let height = ext.y1 - ext.y0 + 2 * PLANE_MARGIN;
  if (canvas && width < canvas.width) {
    dx += Math.floor((canvas.width - width) / 2);
    width = canvas.width;
  }
  if (canvas && height < canvas.height) {
    dy += Math.floor((canvas.height - height) / 2);
    height = canvas.height;
  }
  const nodes: LayoutNode[] = g.ids.map((id, i) => {
    const l = a.labels[i];
    return {
      id,
      x: a.px[i] + dx,
      y: a.py[i] + dy,
      side: ctx.sides[i],
      label: { x: l.x0 + dx, y: l.y0 + dy, w: l.x1 - l.x0, h: l.y1 - l.y0, align: alignOf(l.slot) },
    };
  });
  const edges: LayoutEdge[] = g.edges.map((e) => ({
    key: e.key,
    a: e.a,
    b: e.b,
    x1: nodes[e.ia].x,
    y1: nodes[e.ia].y,
    x2: nodes[e.ib].x,
    y2: nodes[e.ib].y,
    kind: e.kind,
  }));
  const gates: LayoutGate[] = a.gates.map((gate) => ({
    key: gate.edge.key,
    nearId: g.ids[gate.near],
    farId: g.ids[gate.far],
    farRegionId: (g.byId.get(g.ids[gate.far]) as LayoutPlace).regionId,
    x: gate.x + dx,
    y: gate.y + dy,
    side: ctx.sides[gate.far] as Side,
  }));
  nodes.sort(compareReading);
  gates.sort((p, q) => p.y - q.y || p.x - q.x || (p.key < q.key ? -1 : p.key > q.key ? 1 : 0));
  const o = a.outline;
  return {
    regionId: g.regionId,
    startId: g.startId,
    nodes,
    edges,
    gates,
    border: { x: o.x0 + dx, y: o.y0 + dy, w: o.x1 - o.x0, h: o.y1 - o.y0 },
    caption: a.caption
      ? { x: a.caption.x0 + dx, y: a.caption.y0 + dy, w: CAPTION_WIDTH, h: CAPTION_HEIGHT }
      : null,
    width,
    height,
  };
}

export function layoutGraph(input: LayoutInput): GraphLayout {
  const canvas = input.canvas && input.canvas.width > 0 && input.canvas.height > 0 ? input.canvas : null;
  const g = collect(input);
  if (!g) return emptyLayout(input.regionId, canvas);

  const sizes = sizesFor(input.compact === true);
  const { X, Y } = solve(g);
  orient(g, X, Y, canvas);
  const unit = unitBox(g, X, Y);
  const sides = sidesOf(g, X, Y, unit);
  const stretch = stretchFor(unit, sides, canvas, sizes);
  let ctx: Context = { g, X, Y, unit, sides, sizes, canvas, ratio: stretch };
  let range = scaleRange(g, X, Y, stretch, sizes);
  let k = range.kMin;
  if (canvas) {
    const fits = (scale: number): boolean => {
      const a = attempt(ctx, scale, true);
      if (!a.ok) return false;
      const ext = extentOf(a);
      return ext.x1 - ext.x0 + 2 * PLANE_MARGIN <= canvas.width && ext.y1 - ext.y0 + 2 * PLANE_MARGIN <= canvas.height;
    };
    let fitsAtMin = fits(range.kMin);
    if (!fitsAtMin && stretch !== 1) {
      // the region scrolls anyway: no stretch, so it scrolls no further than it must
      ctx = { ...ctx, ratio: 1 };
      range = scaleRange(g, X, Y, 1, sizes);
      k = range.kMin;
      fitsAtMin = fits(range.kMin);
    }
    if (fitsAtMin) {
      let lo = range.kMin;
      let hi = range.kMax;
      for (let step = 0; step < FIT_STEPS; step += 1) {
        const mid = (lo + hi) / 2;
        if (fits(mid)) lo = mid;
        else hi = mid;
      }
      k = lo;
    }
  }
  let result = attempt(ctx, k, true);
  let growth = 1;
  for (let tries = 0; tries < GROW_TRIES && !result.ok; tries += 1) {
    growth *= GROW;
    result = attempt(ctx, k * growth, true, growth);
  }
  return finish(ctx, result);
}
