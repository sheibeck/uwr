import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  BORDER_INSET,
  BORDER_RIGHT,
  COLUMN_PITCH,
  GATE_HEIGHT,
  GATE_WIDTH,
  LABEL_HEIGHT,
  LABEL_OFFSET,
  LABEL_WIDTH,
  OUTER_GAP,
  PLANE_MARGIN,
  ROW_PITCH,
  layoutGraph,
} from './graphLayout';
import type { GraphLayout, LayoutPlace } from './graphLayout';

const place = (id: bigint, name: string, regionId = 1n, over: Partial<LayoutPlace> = {}): LayoutPlace => ({
  id,
  name,
  regionId,
  bindStone: false,
  terrainType: 'woods',
  ...over,
});

const edge = (a: bigint, b: bigint) => ({ a, b });

function node(layout: GraphLayout, id: bigint) {
  const found = layout.nodes.find((n) => n.id === id);
  if (!found) throw new Error(`no node ${id}`);
  return found;
}

/** Every box the plane must hold, as [left, top, right, bottom]. */
function boxes(layout: GraphLayout): [number, number, number, number][] {
  const out: [number, number, number, number][] = [];
  for (const n of layout.nodes) {
    out.push([n.x - 16, n.y - 16, n.x + 16, n.y + 16]);
    const left = n.labelSide === 'left' ? n.x - LABEL_OFFSET - LABEL_WIDTH : n.x + LABEL_OFFSET;
    out.push([left, n.y - 10, left + LABEL_WIDTH, n.y - 10 + LABEL_HEIGHT]);
  }
  for (const g of layout.gates) {
    out.push([g.x - GATE_WIDTH / 2, g.y - GATE_HEIGHT / 2, g.x + GATE_WIDTH / 2, g.y + GATE_HEIGHT / 2]);
  }
  if (layout.border) {
    out.push([layout.border.x, layout.border.y, layout.border.x + layout.border.w, layout.border.y + layout.border.h]);
  }
  return out;
}

describe('constants', () => {
  it('uses the UI-SPEC pitches and sizes', () => {
    expect(COLUMN_PITCH).toBe(192);
    expect(ROW_PITCH).toBe(72);
    expect(PLANE_MARGIN).toBe(48);
    expect(BORDER_INSET).toBe(32);
    expect(BORDER_RIGHT).toBe(176);
    expect(OUTER_GAP).toBe(48);
    expect(LABEL_WIDTH).toBe(144);
    expect(LABEL_HEIGHT).toBe(36);
    expect(LABEL_OFFSET).toBe(20);
    expect(GATE_WIDTH).toBe(176);
    expect(GATE_HEIGHT).toBe(24);
  });
});

describe('start and columns', () => {
  const chain = [place(1n, 'A', 1n, { bindStone: true }), place(2n, 'B'), place(3n, 'C')];
  const chainEdges = [edge(1n, 2n), edge(2n, 3n)];

  it('lays a chain left to right 192 apart on one row, starting at the bind stone place', () => {
    const layout = layoutGraph({ regionId: 1n, places: chain, edges: chainEdges });
    expect(layout.startId).toBe(1n);
    const [a, b, c] = [node(layout, 1n), node(layout, 2n), node(layout, 3n)];
    expect(b.x - a.x).toBe(192);
    expect(c.x - b.x).toBe(192);
    expect(a.y).toBe(b.y);
    expect(b.y).toBe(c.y);
    expect([a.column, b.column, c.column]).toEqual([0, 1, 2]);
  });

  it('starts at the lowest-id bind stone place, else the lowest id', () => {
    const places = [place(1n, 'A'), place(2n, 'B'), place(9n, 'Z', 1n, { bindStone: true })];
    const es = [edge(1n, 2n), edge(2n, 9n)];
    const withStone = layoutGraph({ regionId: 1n, places, edges: es });
    expect(withStone.startId).toBe(9n);
    expect(node(withStone, 9n).column).toBe(0);
    expect(node(withStone, 1n).column).toBe(2);

    const twoStones = layoutGraph({
      regionId: 1n,
      places: [place(5n, 'E', 1n, { bindStone: true }), place(3n, 'C', 1n, { bindStone: true })],
      edges: [edge(3n, 5n)],
    });
    expect(twoStones.startId).toBe(3n);

    const none = layoutGraph({ regionId: 1n, places: [place(4n, 'D'), place(2n, 'B')], edges: [edge(2n, 4n)] });
    expect(none.startId).toBe(2n);
  });
});

describe('rows', () => {
  it('orders a column by name and centres the shorter column on the tallest', () => {
    const places = [place(1n, 'Root'), place(2n, 'Cedar'), place(3n, 'Ash'), place(4n, 'Birch')];
    const layout = layoutGraph({ regionId: 1n, places, edges: [edge(1n, 2n), edge(1n, 3n), edge(1n, 4n)] });
    const [ash, birch, cedar, root] = [node(layout, 3n), node(layout, 4n), node(layout, 2n), node(layout, 1n)];
    expect(birch.y - ash.y).toBe(72);
    expect(cedar.y - birch.y).toBe(72);
    expect(root.y).toBe(birch.y);
    expect(ash.column).toBe(1);
  });

  it('orders by parent row first, whatever the names are', () => {
    const places = [
      place(1n, 'Root'),
      place(2n, 'Zed'),
      place(3n, 'Abe'),
      place(4n, 'Aaa'), // child of Zed (row 1)
      place(5n, 'Zzz'), // child of Abe (row 0)
    ];
    const es = [edge(1n, 2n), edge(1n, 3n), edge(2n, 4n), edge(3n, 5n)];
    const layout = layoutGraph({ regionId: 1n, places, edges: es });
    expect(node(layout, 3n).y).toBeLessThan(node(layout, 2n).y);
    expect(node(layout, 5n).y).toBeLessThan(node(layout, 4n).y);
    expect(node(layout, 4n).y - node(layout, 5n).y).toBe(72);
  });

  it('breaks name ties with the id', () => {
    const places = [place(1n, 'Root'), place(9n, 'same'), place(4n, 'SAME')];
    const layout = layoutGraph({ regionId: 1n, places, edges: [edge(1n, 9n), edge(1n, 4n)] });
    expect(node(layout, 4n).y).toBeLessThan(node(layout, 9n).y);
  });

  it('gives a joined child to the parent that comes first', () => {
    // 4 touches both 2 (row 0) and 3 (row 1); it counts under row 0, so it sorts before 5 (child of 3)
    const places = [place(1n, 'Root'), place(2n, 'A'), place(3n, 'B'), place(4n, 'Zz'), place(5n, 'Aa')];
    const es = [edge(1n, 2n), edge(1n, 3n), edge(2n, 4n), edge(3n, 4n), edge(3n, 5n)];
    const layout = layoutGraph({ regionId: 1n, places, edges: es });
    expect(node(layout, 4n).y).toBeLessThan(node(layout, 5n).y);
  });
});

describe('unreachable places', () => {
  it('lays each unreachable group out in extra columns after the last, rooted by name then id', () => {
    const places = [
      place(1n, 'Start'),
      place(2n, 'Next'),
      place(10n, 'Cedar'),
      place(11n, 'Dune'),
      place(7n, 'Alder'),
      place(8n, 'Birch'),
    ];
    const es = [edge(1n, 2n), edge(7n, 8n), edge(10n, 11n)];
    const layout = layoutGraph({ regionId: 1n, places, edges: es });
    expect(node(layout, 2n).column).toBe(1);
    expect(node(layout, 7n).column).toBe(2);
    expect(node(layout, 8n).column).toBe(3);
    expect(node(layout, 10n).column).toBe(4);
    expect(node(layout, 11n).column).toBe(5);
    expect(node(layout, 7n).x - node(layout, 2n).x).toBe(192);
  });

  it('puts a lone unreachable place in its own column', () => {
    const layout = layoutGraph({ regionId: 1n, places: [place(1n, 'A'), place(2n, 'B')], edges: [] });
    expect(node(layout, 1n).column).toBe(0);
    expect(node(layout, 2n).column).toBe(1);
  });
});

describe('border nodes', () => {
  const chain = [1n, 2n, 3n, 4n, 5n].map((id) => place(id, `P${id}`));
  const chainEdges = [edge(1n, 2n), edge(2n, 3n), edge(3n, 4n), edge(4n, 5n)];

  it('puts a border node next to the start in the left outer column with its label on the left', () => {
    const layout = layoutGraph({
      regionId: 1n,
      places: [...chain, place(20n, 'Gate', 2n)],
      edges: [...chainEdges, edge(1n, 20n)],
    });
    const far = node(layout, 20n);
    expect(far.outer).toBe('left');
    expect(far.column).toBe(-1);
    expect(far.labelSide).toBe('left');
    expect(layout.border).not.toBeNull();
    expect(far.x).toBe((layout.border?.x ?? 0) - 48);
    expect(far.y).toBe(node(layout, 1n).y);
    expect(node(layout, 1n).outer).toBeNull();
  });

  it('puts one on the deepest node in the right outer column', () => {
    const layout = layoutGraph({
      regionId: 1n,
      places: [...chain, place(21n, 'East', 2n)],
      edges: [...chainEdges, edge(5n, 21n)],
    });
    const far = node(layout, 21n);
    const box = layout.border as NonNullable<GraphLayout['border']>;
    expect(far.outer).toBe('right');
    expect(far.column).toBe(5);
    expect(far.labelSide).toBe('right');
    expect(far.x).toBe(box.x + box.w + 48);
  });

  it('splits at half the deepest column, rounded down', () => {
    const layout = layoutGraph({
      regionId: 1n,
      places: [...chain, place(20n, 'Mid', 2n), place(21n, 'Late', 2n)],
      edges: [...chainEdges, edge(3n, 20n), edge(4n, 21n)], // columns 2 and 3 of 4
    });
    expect(node(layout, 20n).outer).toBe('left');
    expect(node(layout, 21n).outer).toBe('right');
  });

  it('moves a second border node wanting the same row up, then the third down', () => {
    const layout = layoutGraph({
      regionId: 1n,
      places: [...chain, place(20n, 'Zed', 2n), place(22n, 'Abe', 2n), place(23n, 'Mmm', 2n)],
      edges: [...chainEdges, edge(1n, 20n), edge(1n, 22n), edge(1n, 23n)],
    });
    const y = node(layout, 1n).y;
    expect(node(layout, 22n).y).toBe(y);
    expect(node(layout, 23n).y).toBe(y - 72);
    expect(node(layout, 20n).y).toBe(y + 72);
  });

  it('never lets two border nodes of one outer column sit closer than a row', () => {
    const places = [...chain];
    const es = [...chainEdges];
    for (let i = 0; i < 5; i += 1) {
      const id = BigInt(30 + i);
      places.push(place(id, `Far ${i}`, 2n));
      es.push(edge(i % 2 === 0 ? 1n : 2n, id)); // columns 0 and 1, both on the left
    }
    const layout = layoutGraph({ regionId: 1n, places, edges: es });
    const left = layout.nodes.filter((n) => n.outer === 'left');
    expect(left).toHaveLength(5);
    for (let i = 0; i < left.length; i += 1) {
      for (let j = i + 1; j < left.length; j += 1) {
        expect(Math.abs(left[i].y - left[j].y)).toBeGreaterThanOrEqual(72);
      }
    }
  });

  it('does not draw a place of another region that touches no place of this region', () => {
    const layout = layoutGraph({
      regionId: 1n,
      places: [place(1n, 'A'), place(30n, 'Elsewhere', 2n), place(31n, 'Also', 2n)],
      edges: [edge(30n, 31n)],
    });
    expect(layout.nodes.map((n) => n.id)).toEqual([1n]);
    expect(layout.gates).toEqual([]);
  });
});

describe('border box and gates', () => {
  const places = [
    place(1n, 'A'),
    place(2n, 'B'),
    place(3n, 'C'),
    place(20n, 'West', 2n),
    place(21n, 'East', 3n),
  ];
  const es = [edge(1n, 2n), edge(2n, 3n), edge(1n, 20n), edge(3n, 21n)];

  it('spans the region node centres inset 32 and 176 on the right', () => {
    const layout = layoutGraph({ regionId: 1n, places, edges: es });
    const region = layout.nodes.filter((n) => n.outer === null);
    const minX = Math.min(...region.map((n) => n.x));
    const maxX = Math.max(...region.map((n) => n.x));
    const minY = Math.min(...region.map((n) => n.y));
    const maxY = Math.max(...region.map((n) => n.y));
    expect(layout.border).toEqual({ x: minX - 32, y: minY - 32, w: maxX + 176 - (minX - 32), h: maxY + 32 - (minY - 32) });
    expect(layout.caption).toEqual({ x: minX - 32 + 16, y: minY - 32 + 16 });
  });

  it('has one gate per cross edge, on the box side, on the segment between the two centres', () => {
    const layout = layoutGraph({ regionId: 1n, places, edges: es });
    const box = layout.border as NonNullable<GraphLayout['border']>;
    expect(layout.gates).toHaveLength(2);
    for (const gate of layout.gates) {
      const near = node(layout, gate.nearId);
      const far = node(layout, gate.farId);
      expect(gate.x).toBe(gate.side === 'left' ? box.x : box.x + box.w);
      const t = (gate.x - near.x) / (far.x - near.x);
      expect(t).toBeGreaterThan(0);
      expect(t).toBeLessThan(1);
      expect(Math.abs(gate.y - (near.y + t * (far.y - near.y)))).toBeLessThan(0.001);
    }
    const west = layout.gates.find((g) => g.farId === 20n);
    const east = layout.gates.find((g) => g.farId === 21n);
    expect(west?.side).toBe('left');
    expect(west?.farRegionId).toBe(2n);
    expect(east?.side).toBe('right');
    expect(east?.farRegionId).toBe(3n);
  });

  it('gives a border node touching two region places two gates', () => {
    const layout = layoutGraph({
      regionId: 1n,
      places: [place(1n, 'A'), place(2n, 'B'), place(20n, 'Far', 2n)],
      edges: [edge(1n, 2n), edge(1n, 20n), edge(2n, 20n)],
    });
    expect(layout.gates).toHaveLength(2);
    expect(new Set(layout.gates.map((g) => g.key)).size).toBe(2);
  });
});

describe('one pixel plane', () => {
  const places = [
    place(1n, 'Start', 1n, { bindStone: true }),
    place(2n, 'B'),
    place(3n, 'C'),
    place(4n, 'D'),
    place(5n, 'E'),
    place(6n, 'F'),
    place(9n, 'Stray'),
    place(20n, 'West', 2n),
    place(21n, 'East', 3n),
    place(22n, 'Edge Beyond', 2n, { terrainType: 'uncharted' }),
  ];
  const es = [
    edge(1n, 2n),
    edge(1n, 3n),
    edge(2n, 4n),
    edge(3n, 5n),
    edge(5n, 6n),
    edge(1n, 20n),
    edge(6n, 21n),
    edge(4n, 22n),
  ];

  it('draws every edge between the centres of its two nodes', () => {
    const layout = layoutGraph({ regionId: 1n, places, edges: es });
    expect(layout.edges.length).toBeGreaterThan(0);
    for (const e of layout.edges) {
      const a = node(layout, e.a);
      const b = node(layout, e.b);
      expect([e.x1, e.y1, e.x2, e.y2]).toEqual([a.x, a.y, b.x, b.y]);
    }
  });

  it('keeps every circle, label, pill and the border 48 inside the plane, touching 48 exactly', () => {
    const layout = layoutGraph({ regionId: 1n, places, edges: es });
    const all = boxes(layout);
    expect(Math.min(...all.map((b) => b[0]))).toBe(48);
    expect(Math.min(...all.map((b) => b[1]))).toBe(48);
    expect(Math.max(...all.map((b) => b[2])) + 48).toBe(layout.width);
    expect(Math.max(...all.map((b) => b[3])) + 48).toBe(layout.height);
  });

  it('holds for a lone place too', () => {
    const layout = layoutGraph({ regionId: 1n, places: [place(1n, 'Only')], edges: [] });
    const all = boxes(layout);
    expect(Math.min(...all.map((b) => b[0]))).toBe(48);
    expect(Math.min(...all.map((b) => b[1]))).toBe(48);
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

  it('gives a deeply equal layout for any input order', () => {
    const base = layoutGraph({ regionId: 1n, places, edges: es });
    const reversed = layoutGraph({ regionId: 1n, places: [...places].reverse(), edges: [...es].reverse() });
    const rotated = layoutGraph({
      regionId: 1n,
      places: [...places.slice(7), ...places.slice(0, 7)],
      edges: [...es.slice(5), ...es.slice(0, 5)].map((e) => ({ a: e.b, b: e.a })),
    });
    const interleaved = layoutGraph({
      regionId: 1n,
      places: [...places.filter((_, i) => i % 2 === 0), ...places.filter((_, i) => i % 2 === 1)],
      edges: [...es.filter((_, i) => i % 3 === 0), ...es.filter((_, i) => i % 3 !== 0)],
    });
    expect(reversed).toEqual(base);
    expect(rotated).toEqual(base);
    expect(interleaved).toEqual(base);
    expect(base.nodes).toHaveLength(23);
  });

  it('lays the same input out identically twice', () => {
    expect(layoutGraph({ regionId: 1n, places, edges: es })).toEqual(layoutGraph({ regionId: 1n, places, edges: es }));
  });
});

describe('empty and single', () => {
  it('gives a 96 x 96 plane with no nodes for an empty region', () => {
    const layout = layoutGraph({ regionId: 1n, places: [place(5n, 'Elsewhere', 2n)], edges: [] });
    expect(layout.nodes).toEqual([]);
    expect(layout.edges).toEqual([]);
    expect(layout.gates).toEqual([]);
    expect(layout.border).toBeNull();
    expect(layout.caption).toBeNull();
    expect(layout.startId).toBeNull();
    expect([layout.width, layout.height]).toEqual([96, 96]);
    expect(layoutGraph({ regionId: 1n, places: [], edges: [] }).width).toBe(96);
  });

  it('puts one place at 80, 80 inside a border box', () => {
    const layout = layoutGraph({ regionId: 1n, places: [place(1n, 'Only')], edges: [] });
    expect(layout.nodes).toHaveLength(1);
    expect([layout.nodes[0].x, layout.nodes[0].y]).toEqual([80, 80]);
    expect(layout.border).toEqual({ x: 48, y: 48, w: 32 + 176, h: 64 });
    expect(layout.startId).toBe(1n);
  });
});

describe('source rules', () => {
  const source = readFileSync(resolve(process.cwd(), 'src/map/graphLayout.ts'), 'utf8');

  it('uses no randomness, time or measured text', () => {
    expect(source).not.toMatch(/Math\.random|Date\b|performance\.now|measureText|getBoundingClientRect|offsetWidth|crypto/);
  });

  it('imports no library, only the sibling order helpers', () => {
    const imports = [...source.matchAll(/^import .* from '([^']+)'/gm)].map((m) => m[1]);
    for (const spec of imports) expect(spec.startsWith('./')).toBe(true);
  });
});
