// Deterministic route-graph layout for the Map (51-UI-SPEC "Route graph", one pixel plane).
//
// Pure: plain lists in, one plain object out. No randomness, no time and no measured text, so the
// same places and connections give the same layout in any input order. The SVG layer and the HTML
// nodes of plans 51-08 and 51-09 both read this object, so a line always ends on a dot's centre.
//
// Steps (UI-SPEC numbering), each a small private function below:
//   normalise      places by id, edges deduped by unordered pair
//   pickStart      1  the bind stone place, else the lowest id
//   bfsColumns     2, 4  breadth-first depth columns, rows by parent row, then name, then id
//   regionColumns  5  unreachable places as further breadth-first groups
//   regionGrid     3, 4  column index and centred y of every region place
//   placeBorderNodes  6  other-region neighbours: side, then the nearest free row
//   placeNodes     3, 7  x from the margin, the border box, the outer columns
//   edgesAndGates  edges (typed) and one gate per border crossing
//   shiftToPlane   8  one final shift to a 48 margin, plane width and height

import { compareBigint, compareNames } from './order';

export const COLUMN_PITCH = 192;
export const ROW_PITCH = 72;
export const PLANE_MARGIN = 48;
export const BORDER_INSET = 32;
export const BORDER_RIGHT = 176;
export const OUTER_GAP = 48;
export const LABEL_WIDTH = 144;
export const LABEL_HEIGHT = 36;
export const LABEL_OFFSET = 20;
export const GATE_WIDTH = 176;
export const GATE_HEIGHT = 24;

const NODE_RADIUS = 16;
const LABEL_TOP = 10;
const CAPTION_INSET = 16;
const EMPTY_PLANE = 96;

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
  /** Depth column; -1 for the left outer column, deepest + 1 for the right outer column. */
  column: number;
  outer: 'left' | 'right' | null;
  labelSide: 'left' | 'right';
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
  side: 'left' | 'right';
}

export interface GraphLayout {
  regionId: bigint;
  startId: bigint | null;
  nodes: LayoutNode[];
  edges: LayoutEdge[];
  gates: LayoutGate[];
  border: { x: number; y: number; w: number; h: number } | null;
  caption: { x: number; y: number } | null;
  width: number;
  height: number;
}

export interface LayoutInput {
  regionId: bigint;
  places: readonly LayoutPlace[];
  edges: readonly { a: bigint; b: bigint }[];
}

interface Point {
  x: number;
  y: number;
}

function byNameThenId(a: LayoutPlace, b: LayoutPlace): number {
  return compareNames(a.name, b.name) || compareBigint(a.id, b.id);
}

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

/** Step 1: the lowest-id bind stone place of the region, else its lowest-id place. */
function pickStart(regionPlaces: readonly LayoutPlace[]): LayoutPlace {
  const stone = regionPlaces.find((p) => p.bindStone);
  return stone ?? regionPlaces[0];
}

/**
 * Steps 2 and 4: breadth-first columns from `root` over the `available` places. Inside a column the
 * order is the parent's row (the first neighbour in the previous column), then name, then id.
 */
function bfsColumns(
  root: LayoutPlace,
  available: ReadonlySet<bigint>,
  adjacency: ReadonlyMap<bigint, readonly bigint[]>,
  byId: ReadonlyMap<bigint, LayoutPlace>,
): bigint[][] {
  const columns: bigint[][] = [[root.id]];
  const placed = new Set<bigint>([root.id]);
  for (;;) {
    const previous = columns[columns.length - 1];
    const found = new Map<bigint, number>();
    previous.forEach((id, row) => {
      for (const next of adjacency.get(id) ?? []) {
        if (!available.has(next) || placed.has(next)) continue;
        const known = found.get(next);
        if (known === undefined || row < known) found.set(next, row);
      }
    });
    if (found.size === 0) break;
    const ids = [...found.keys()].sort((x, y) => {
      const rows = (found.get(x) as number) - (found.get(y) as number);
      return rows || byNameThenId(byId.get(x) as LayoutPlace, byId.get(y) as LayoutPlace);
    });
    for (const id of ids) placed.add(id);
    columns.push(ids);
  }
  return columns;
}

/** Steps 2 to 5: the start's columns, then one breadth-first group per unreachable place cluster. */
function regionColumns(
  regionPlaces: readonly LayoutPlace[],
  start: LayoutPlace,
  adjacency: ReadonlyMap<bigint, readonly bigint[]>,
  byId: ReadonlyMap<bigint, LayoutPlace>,
): bigint[][] {
  const unplaced = new Set<bigint>(regionPlaces.map((p) => p.id));
  const columns: bigint[][] = [];
  const addGroup = (root: LayoutPlace): void => {
    const group = bfsColumns(root, unplaced, adjacency, byId);
    for (const column of group) for (const id of column) unplaced.delete(id);
    columns.push(...group);
  };
  addGroup(start);
  while (unplaced.size > 0) {
    const rest = regionPlaces.filter((p) => unplaced.has(p.id)).sort(byNameThenId);
    addGroup(rest[0]);
  }
  return columns;
}

interface Box {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

function nodeBoxes(node: Point, labelSide: 'left' | 'right'): Box[] {
  const labelLeft = labelSide === 'left' ? node.x - LABEL_OFFSET - LABEL_WIDTH : node.x + LABEL_OFFSET;
  return [
    { left: node.x - NODE_RADIUS, top: node.y - NODE_RADIUS, right: node.x + NODE_RADIUS, bottom: node.y + NODE_RADIUS },
    { left: labelLeft, top: node.y - LABEL_TOP, right: labelLeft + LABEL_WIDTH, bottom: node.y - LABEL_TOP + LABEL_HEIGHT },
  ];
}

/** Step 6 y rule: the neighbour's y, then 72 up, 72 down, 144 up, 144 down and so on. */
function freeY(wanted: number, taken: readonly number[]): number {
  const free = (y: number): boolean => taken.every((other) => Math.abs(y - other) >= ROW_PITCH);
  for (let step = 0; ; step += 1) {
    if (step === 0) {
      if (free(wanted)) return wanted;
      continue;
    }
    const up = wanted - step * ROW_PITCH;
    if (free(up)) return up;
    const down = wanted + step * ROW_PITCH;
    if (free(down)) return down;
  }
}

function emptyLayout(regionId: bigint): GraphLayout {
  return {
    regionId,
    startId: null,
    nodes: [],
    edges: [],
    gates: [],
    border: null,
    caption: null,
    width: EMPTY_PLANE,
    height: EMPTY_PLANE,
  };
}

interface Grid {
  columns: bigint[][];
  columnOf: Map<bigint, number>;
  /** Plane y per region place, before the final shift (shorter columns centred on the tallest). */
  yOf: Map<bigint, number>;
}

/** Steps 1 to 5 without x: the columns, each place's column, and its centred y. */
function regionGrid(
  regionPlaces: readonly LayoutPlace[],
  edges: readonly { a: bigint; b: bigint }[],
  byId: ReadonlyMap<bigint, LayoutPlace>,
): { grid: Grid; start: LayoutPlace } {
  const inRegion = new Set<bigint>(regionPlaces.map((p) => p.id));
  const adjacency = new Map<bigint, bigint[]>();
  const link = (from: bigint, to: bigint): void => {
    const list = adjacency.get(from);
    if (list) list.push(to);
    else adjacency.set(from, [to]);
  };
  for (const edge of edges) {
    if (inRegion.has(edge.a) && inRegion.has(edge.b)) {
      link(edge.a, edge.b);
      link(edge.b, edge.a);
    }
  }
  const start = pickStart(regionPlaces);
  const columns = regionColumns(regionPlaces, start, adjacency, byId);
  const tallest = Math.max(...columns.map((c) => c.length));
  const columnOf = new Map<bigint, number>();
  const yOf = new Map<bigint, number>();
  columns.forEach((ids, column) => {
    const centring = ((tallest - ids.length) * ROW_PITCH) / 2;
    ids.forEach((id, row) => {
      columnOf.set(id, column);
      yOf.set(id, PLANE_MARGIN + row * ROW_PITCH + centring);
    });
  });
  return { grid: { columns, columnOf, yOf }, start };
}

interface BorderNode {
  id: bigint;
  side: 'left' | 'right';
  y: number;
}

/** Step 6: the places of other regions that touch the region, with their side and free row. */
function placeBorderNodes(
  regionIds: ReadonlySet<bigint>,
  edges: readonly { a: bigint; b: bigint }[],
  grid: Grid,
  byId: ReadonlyMap<bigint, LayoutPlace>,
): BorderNode[] {
  const neighboursOf = new Map<bigint, bigint[]>();
  for (const edge of edges) {
    const aIn = regionIds.has(edge.a);
    if (aIn === regionIds.has(edge.b)) continue;
    const far = aIn ? edge.b : edge.a;
    const near = aIn ? edge.a : edge.b;
    const list = neighboursOf.get(far);
    if (list) list.push(near);
    else neighboursOf.set(far, [near]);
  }

  const deepest = grid.columns.length - 1;
  const candidates = [...neighboursOf.entries()].map(([id, nears]) => {
    const near = [...nears].sort(
      (x, y) =>
        (grid.columnOf.get(x) as number) - (grid.columnOf.get(y) as number) ||
        (grid.yOf.get(x) as number) - (grid.yOf.get(y) as number) ||
        compareBigint(x, y),
    )[0];
    const column = grid.columnOf.get(near) as number;
    return {
      id,
      column,
      wantedY: grid.yOf.get(near) as number,
      side: column <= Math.floor(deepest / 2) ? ('left' as const) : ('right' as const),
    };
  });
  candidates.sort(
    (x, y) =>
      x.column - y.column ||
      x.wantedY - y.wantedY ||
      byNameThenId(byId.get(x.id) as LayoutPlace, byId.get(y.id) as LayoutPlace),
  );

  const taken = { left: [] as number[], right: [] as number[] };
  return candidates.map((c) => {
    const y = freeY(c.wantedY, taken[c.side]);
    taken[c.side].push(y);
    return { id: c.id, side: c.side, y };
  });
}

type Border = { x: number; y: number; w: number; h: number };

/** Step 3 with the margin known, step 7 and the nodes: x from columns, the box, the outer columns. */
function placeNodes(
  grid: Grid,
  borderNodes: readonly BorderNode[],
): { nodes: Map<bigint, LayoutNode>; border: Border } {
  const hasLeft = borderNodes.some((n) => n.side === 'left');
  const leftMargin = PLANE_MARGIN + (hasLeft ? COLUMN_PITCH : 0);
  const nodes = new Map<bigint, LayoutNode>();
  for (const [id, y] of grid.yOf) {
    const column = grid.columnOf.get(id) as number;
    nodes.set(id, { id, x: leftMargin + column * COLUMN_PITCH, y, column, outer: null, labelSide: 'right' });
  }
  const region = [...nodes.values()];
  const minX = Math.min(...region.map((p) => p.x));
  const maxX = Math.max(...region.map((p) => p.x));
  const minY = Math.min(...region.map((p) => p.y));
  const maxY = Math.max(...region.map((p) => p.y));
  const border = {
    x: minX - BORDER_INSET,
    y: minY - BORDER_INSET,
    w: maxX + BORDER_RIGHT - (minX - BORDER_INSET),
    h: maxY + BORDER_INSET - (minY - BORDER_INSET),
  };
  const deepest = grid.columns.length - 1;
  for (const node of borderNodes) {
    const left = node.side === 'left';
    nodes.set(node.id, {
      id: node.id,
      x: left ? border.x - OUTER_GAP : border.x + border.w + OUTER_GAP,
      y: node.y,
      column: left ? -1 : deepest + 1,
      outer: node.side,
      labelSide: left ? 'left' : 'right',
    });
  }
  return { nodes, border };
}

/** Edges (never between two border nodes) and one gate per edge that crosses the border. */
function edgesAndGates(
  edges: readonly { key: string; a: bigint; b: bigint }[],
  nodes: ReadonlyMap<bigint, LayoutNode>,
  border: Border,
  byId: ReadonlyMap<bigint, LayoutPlace>,
): { edges: LayoutEdge[]; gates: LayoutGate[] } {
  const layoutEdges: LayoutEdge[] = [];
  const gates: LayoutGate[] = [];
  for (const edge of edges) {
    const a = nodes.get(edge.a);
    const b = nodes.get(edge.b);
    if (!a || !b || (a.outer !== null && b.outer !== null)) continue;
    const pa = byId.get(edge.a) as LayoutPlace;
    const pb = byId.get(edge.b) as LayoutPlace;
    const kind =
      pa.terrainType === 'uncharted' || pb.terrainType === 'uncharted'
        ? 'uncharted'
        : pa.regionId !== pb.regionId
          ? 'cross'
          : 'in';
    layoutEdges.push({ key: edge.key, a: edge.a, b: edge.b, x1: a.x, y1: a.y, x2: b.x, y2: b.y, kind });
    if (pa.regionId === pb.regionId) continue;

    const near = a.outer === null ? a : b;
    const far = a.outer === null ? b : a;
    const side = far.outer as 'left' | 'right';
    const x = side === 'left' ? border.x : border.x + border.w;
    const t = (x - near.x) / (far.x - near.x);
    gates.push({
      key: edge.key,
      nearId: near.id,
      farId: far.id,
      farRegionId: (byId.get(far.id) as LayoutPlace).regionId,
      x,
      y: near.y + t * (far.y - near.y),
      side,
    });
  }
  return { edges: layoutEdges, gates };
}

/** Step 8: one shift so the smallest x and y of every circle, label, pill and the box is 48. */
function shiftToPlane(
  regionId: bigint,
  startId: bigint,
  nodes: ReadonlyMap<bigint, LayoutNode>,
  parts: { edges: LayoutEdge[]; gates: LayoutGate[] },
  border: Border,
): GraphLayout {
  const boxes: Box[] = [{ left: border.x, top: border.y, right: border.x + border.w, bottom: border.y + border.h }];
  for (const node of nodes.values()) boxes.push(...nodeBoxes(node, node.labelSide));
  for (const gate of parts.gates) {
    boxes.push({
      left: gate.x - GATE_WIDTH / 2,
      top: gate.y - GATE_HEIGHT / 2,
      right: gate.x + GATE_WIDTH / 2,
      bottom: gate.y + GATE_HEIGHT / 2,
    });
  }
  const dx = PLANE_MARGIN - Math.min(...boxes.map((b) => b.left));
  const dy = PLANE_MARGIN - Math.min(...boxes.map((b) => b.top));

  return {
    regionId,
    startId,
    nodes: [...nodes.values()]
      .map((n) => ({ ...n, x: n.x + dx, y: n.y + dy }))
      .sort((p, q) => p.x - q.x || p.y - q.y || compareBigint(p.id, q.id)),
    edges: parts.edges.map((e) => ({ ...e, x1: e.x1 + dx, y1: e.y1 + dy, x2: e.x2 + dx, y2: e.y2 + dy })),
    gates: parts.gates.map((g) => ({ ...g, x: g.x + dx, y: g.y + dy })),
    border: { x: border.x + dx, y: border.y + dy, w: border.w, h: border.h },
    caption: { x: border.x + dx + CAPTION_INSET, y: border.y + dy + CAPTION_INSET },
    width: Math.max(...boxes.map((b) => b.right)) + dx + PLANE_MARGIN,
    height: Math.max(...boxes.map((b) => b.bottom)) + dy + PLANE_MARGIN,
  };
}

export function layoutGraph(input: LayoutInput): GraphLayout {
  const { byId, edges } = normalise(input);
  const regionPlaces = [...byId.values()].filter((p) => p.regionId === input.regionId);
  if (regionPlaces.length === 0) return emptyLayout(input.regionId);

  const { grid, start } = regionGrid(regionPlaces, edges, byId);
  const borderNodes = placeBorderNodes(new Set(regionPlaces.map((p) => p.id)), edges, grid, byId);
  const { nodes, border } = placeNodes(grid, borderNodes);
  const parts = edgesAndGates(edges, nodes, border, byId);
  return shiftToPlane(input.regionId, start.id, nodes, parts, border);
}
