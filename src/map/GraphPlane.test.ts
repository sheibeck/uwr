// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { nextTick } from 'vue';
import { mount, type VueWrapper } from '@vue/test-utils';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import GraphPlane from './GraphPlane.vue';
import { layoutGraph } from './graphLayout';
import type { GraphLayout, LayoutNode, LayoutPlace } from './graphLayout';
import { gateView, nodeViews, routePolylines } from './nodeView';
import type { MapRatingSource, NodePlace } from './nodeView';
import { regionChips } from './regionChips';
import { adjacencyOf, shortestPath, stepsFrom } from './route';

const SOURCE = readFileSync(resolve(process.cwd(), 'src/map/GraphPlane.vue'), 'utf8');
const XSS = '<img src=x onerror=alert(1)>';

const regions = [
  { id: 1n, name: 'Ashfall', dangerMultiplier: 300n },
  { id: 2n, name: 'Saltmarsh', dangerMultiplier: 400n },
];

const loc = (id: bigint, name: string, over: Partial<NodePlace> = {}): NodePlace => ({
  id,
  name,
  regionId: 1n,
  terrainType: 'woods',
  isSafe: false,
  levelOffset: 0n,
  bindStone: false,
  craftingAvailable: false,
  ...over,
});

const basePlaces: NodePlace[] = [
  loc(1n, 'The Crossing', { terrainType: 'town', isSafe: true, bindStone: true, craftingAvailable: true }),
  loc(2n, 'Gloamwood', { levelOffset: 1n }),
  loc(3n, 'Ashgrove'),
  loc(4n, 'Saltmarsh Gate', { regionId: 2n, levelOffset: 1n }),
  loc(5n, 'The Edge Beyond Ashfall', { terrainType: 'uncharted', isSafe: true }),
  loc(6n, 'Narrow Passage', { terrainType: 'passage', isSafe: true }),
];
const baseEdges = [
  { a: 1n, b: 2n },
  { a: 2n, b: 3n },
  { a: 1n, b: 5n },
  { a: 2n, b: 4n },
  { a: 3n, b: 6n },
];

// A level 3 viewer: Gloamwood Risky (Lv 4–5), Ashgrove Quiet (Lv 2–3), Saltmarsh Gate Deadly.
const RATING: MapRatingSource = {
  pools: [
    { locationId: 2n, kind: 'creature', level: 2n, lvLo: 4n, lvHi: 5n },
    { locationId: 3n, kind: 'creature', level: 1n, lvLo: 2n, lvHi: 3n },
    { locationId: 4n, kind: 'creature', level: 3n, lvLo: 6n, lvHi: 7n },
  ],
  poolsApplied: () => true,
  ratingLevel: 3n,
  bossOrNamed: () => false,
};

// No pool row has applied anywhere: every non-safe place is Unknown.
const NO_ROWS: MapRatingSource = { pools: [], poolsApplied: () => false, ratingLevel: null, bossOrNamed: () => false };

interface BuildOptions {
  rating?: MapRatingSource | null;
  places?: NodePlace[];
  edges?: { a: bigint; b: bigint }[];
  selectedId?: bigint | null;
  currentId?: bigint | null;
  timer?: { running: boolean; secondsLeft: number };
  mobile?: boolean;
  regionName?: string;
  routeTo?: bigint | null;
}

function build(options: BuildOptions = {}) {
  const places = options.places ?? basePlaces;
  const edges = options.edges ?? baseEdges;
  const currentId = options.currentId === undefined ? 1n : options.currentId;
  const selectedId = options.selectedId === undefined ? null : options.selectedId;
  const mobile = options.mobile ?? false;
  const timer = options.timer ?? { running: false, secondsLeft: 0 };
  const byId = new Map(places.map((p) => [p.id, p]));
  const layoutPlaces: LayoutPlace[] = places.map((p) => ({
    id: p.id,
    name: p.name,
    regionId: p.regionId,
    bindStone: p.bindStone,
    terrainType: p.terrainType,
  }));
  const layout = layoutGraph({ regionId: 1n, places: layoutPlaces, edges, compact: mobile });
  const adjacency = adjacencyOf(edges);
  const views = nodeViews({
    layout,
    places: byId,
    regions,
    visited: new Set([1n, 2n]),
    heardOf: new Set([3n, 4n, 5n]),
    currentLocationId: currentId,
    selectedId,
    boundLocationId: null,
    steps: currentId === null ? new Map() : stepsFrom(adjacency, currentId),
    rating: options.rating === null ? NO_ROWS : (options.rating ?? RATING),
  });
  const chips = regionChips({
    drawn: places,
    regions,
    currentRegionId: 1n,
    shownRegionId: 1n,
    playerLevel: 3,
  });
  const gates = layout.gates.map((gate) =>
    gateView(
      gate,
      chips.find((chip) => chip.regionId === gate.farRegionId),
      regions.find((r) => r.id === gate.farRegionId)?.name ?? 'Unknown region',
      timer,
      mobile,
    ),
  );
  const path =
    options.routeTo !== undefined && options.routeTo !== null && currentId !== null
      ? shortestPath(adjacency, currentId, options.routeTo)
      : null;
  return {
    layout,
    views,
    gates,
    routes: routePolylines(layout, path),
    regionName: options.regionName ?? 'Ashfall',
    selectedId,
    currentId,
    mobile,
  };
}

let wrapper: VueWrapper | null = null;
afterEach(() => {
  wrapper?.unmount();
  wrapper = null;
  document.body.innerHTML = '';
});

function mountPlane(options: BuildOptions = {}) {
  const props = build(options);
  wrapper = mount(GraphPlane, { props, attachTo: document.body });
  return { wrapper, props };
}

const nodeButton = (w: VueWrapper, id: bigint) => w.get<HTMLButtonElement>(`button.node[data-node-id="${id}"]`);

describe('GraphPlane: one pixel plane and svg', () => {
  it('is a div.graph-plane sized to the layout holding one svg of the same size', () => {
    const { wrapper: w, props } = mountPlane();
    const plane = w.get('.graph-plane');
    const style = plane.attributes('style') ?? '';
    expect(style).toContain(`width: ${props.layout.width}px`);
    expect(style).toContain(`height: ${props.layout.height}px`);
    const svgs = plane.findAll('svg.plane-svg');
    expect(svgs).toHaveLength(1);
    const svg = svgs[0];
    expect(svg.attributes('width')).toBe(String(props.layout.width));
    expect(svg.attributes('height')).toBe(String(props.layout.height));
    expect(svg.attributes('viewBox')).toBe(`0 0 ${props.layout.width} ${props.layout.height}`);
    expect(svg.attributes('aria-hidden')).toBe('true');
    expect(svg.attributes('preserveAspectRatio')).toBeUndefined();
  });

  it('layers the svg, then the caption, then the node group, then the gate pills', () => {
    const { wrapper: w } = mountPlane();
    const kids = Array.from(w.get('.graph-plane').element.children);
    const kinds = kids.map((el) => {
      if (el.tagName.toLowerCase() === 'svg') return 'svg';
      if (el.classList.contains('caption')) return 'caption';
      if (el.getAttribute('role') === 'group') return 'group';
      if (el.classList.contains('gate')) return 'gate';
      return el.tagName.toLowerCase();
    });
    expect(kinds[0]).toBe('svg');
    expect(kinds[1]).toBe('caption');
    expect(kinds[2]).toBe('group');
    expect(kinds.slice(3).every((kind) => kind === 'gate')).toBe(true);
    expect(kinds.filter((kind) => kind === 'gate').length).toBeGreaterThan(0);
  });

  it('draws the border rect, one line per edge with its kind class, and the route polylines', () => {
    const { wrapper: w, props } = mountPlane({ routeTo: 3n });
    const border = w.get('rect.border');
    expect(border.attributes('x')).toBe(String(props.layout.border?.x));
    expect(border.attributes('y')).toBe(String(props.layout.border?.y));
    expect(border.attributes('width')).toBe(String(props.layout.border?.w));
    expect(border.attributes('height')).toBe(String(props.layout.border?.h));
    expect(border.attributes('rx')).toBe('24');

    const lines = w.findAll('svg line.edge');
    expect(lines).toHaveLength(props.layout.edges.length);
    props.layout.edges.forEach((edge, index) => {
      const line = lines[index];
      expect(line.attributes('x1')).toBe(String(edge.x1));
      expect(line.attributes('y1')).toBe(String(edge.y1));
      expect(line.attributes('x2')).toBe(String(edge.x2));
      expect(line.attributes('y2')).toBe(String(edge.y2));
      expect(line.classes()).toContain('edge');
      if (edge.kind === 'cross') expect(line.classes()).toContain('cross');
      if (edge.kind === 'uncharted') expect(line.classes()).toContain('uncharted');
      if (edge.kind === 'in') {
        expect(line.classes()).not.toContain('cross');
        expect(line.classes()).not.toContain('uncharted');
      }
    });
    expect(props.layout.edges.some((edge) => edge.kind === 'cross')).toBe(true);
    expect(props.layout.edges.some((edge) => edge.kind === 'uncharted')).toBe(true);

    const routes = w.findAll('svg polyline.route');
    expect(routes.map((r) => r.attributes('points'))).toEqual(props.routes);
    expect(routes.length).toBeGreaterThan(0);
  });

  it('draws the edges and route before the HTML node layer (svg is first in the plane)', () => {
    const { wrapper: w } = mountPlane({ routeTo: 3n });
    const plane = w.get('.graph-plane').element;
    const svg = plane.querySelector('svg') as Element;
    const firstButton = plane.querySelector('button') as Element;
    expect(svg.compareDocumentPosition(firstButton) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('draws no border rect for an empty layout and no route when there is none', () => {
    const { wrapper: w } = mountPlane({ places: [], edges: [], currentId: null });
    expect(w.find('rect.border').exists()).toBe(false);
    expect(w.findAll('button.node')).toHaveLength(0);
    expect(w.findAll('polyline.route')).toHaveLength(0);
  });
});

describe('GraphPlane: nodes and labels', () => {
  it('centres each node button on its view point with a 32px hit box (44px on mobile)', () => {
    const { wrapper: w, props } = mountPlane();
    for (const view of props.views) {
      const style = nodeButton(w, view.id).attributes('style') ?? '';
      expect(style).toContain(`left: ${view.x - 16}px`);
      expect(style).toContain(`top: ${view.y - 16}px`);
      expect(style).toContain('width: 32px');
    }
    w.unmount();
    wrapper = null;
    const mobile = mountPlane({ mobile: true });
    for (const view of mobile.props.views) {
      const style = nodeButton(mobile.wrapper, view.id).attributes('style') ?? '';
      expect(style).toContain(`left: ${view.x - 22}px`);
      expect(style).toContain(`top: ${view.y - 22}px`);
      expect(style).toContain('width: 44px');
    }
  });

  it('uses the view aria-label, an aria-hidden circle and icon, and aria-pressed true only on the selected node (false on the rest, review IN-03)', () => {
    const { wrapper: w, props } = mountPlane({ selectedId: 2n });
    for (const view of props.views) {
      const button = nodeButton(w, view.id);
      expect(button.attributes('aria-label')).toBe(view.ariaLabel);
      expect(button.get('.circle').attributes('aria-hidden')).toBe('true');
      expect(button.get('.circle svg').attributes('aria-hidden')).toBe('true');
      if (view.id === 2n) expect(button.attributes('aria-pressed')).toBe('true');
      else expect(button.attributes('aria-pressed')).toBe('false');
    }
  });

  it('sizes the here circle 32 with a 16px icon and the others 24 with a 12px icon', () => {
    const { wrapper: w } = mountPlane();
    const here = nodeButton(w, 1n).get('.circle');
    expect(here.classes()).toContain('size-32');
    expect(here.get('svg').attributes('width')).toBe('16');
    const other = nodeButton(w, 2n).get('.circle');
    expect(other.classes()).toContain('size-24');
    expect(other.get('svg').attributes('width')).toBe('12');
  });

  it('puts the label next to the node: name with title, sub-line parts and the marks', () => {
    const { wrapper: w, props } = mountPlane();
    const labels = w.findAll('.label');
    expect(labels).toHaveLength(props.views.length);
    const here = w.get('.label[data-node-id="1"]');
    expect(here.get('.name').text()).toBe('The Crossing');
    expect(here.get('.name').attributes('title')).toBe('The Crossing');
    expect(here.get('.sub').text()).toContain('Town');
    expect(here.get('.sub').text()).toContain('you');
    // bind stone and crafting marks sit after the name
    expect(here.findAll('.mark').length).toBe(2);

    const wood = w.get('.label[data-node-id="2"]');
    expect(wood.get('.sub').text()).toContain('Woods');
    expect(wood.get('.sub').text()).toContain('Risky · Lv 4–5');

    const far = w.get('.label[data-node-id="4"]');
    expect(far.get('.sub').text()).toContain('Saltmarsh · ');
    expect(far.get('.sub').text()).toContain('heard of');
    expect(far.classes()).toContain('other');
    expect(nodeButton(w, 4n).classes()).toContain('other');
  });

  it('places each label at the box the layout gave it, aligned by label.align', () => {
    const { wrapper: w, props } = mountPlane();
    for (const view of props.views) {
      const label = w.get(`.label[data-node-id="${view.id}"]`);
      const style = label.attributes('style') ?? '';
      expect(style).toContain(`left: ${view.label.x}px`);
      expect(style).toContain(`top: ${view.label.y}px`);
      expect(style).toContain(`width: ${view.label.w}px`);
      expect(label.classes()).toContain(`align-${view.label.align}`);
      for (const other of ['left', 'right', 'center'].filter((a) => a !== view.label.align)) {
        expect(label.classes()).not.toContain(`align-${other}`);
      }
    }
  });

  it('turns a hand-placed label right-aligned, centred or left-aligned', () => {
    const layout = handLayout();
    const aligns: LayoutNode['label']['align'][] = ['right', 'center', 'left'];
    const nodes = layout.nodes.map((n, i) => ({ ...n, label: { ...n.label, align: aligns[i % 3] } }));
    const { wrapper: w } = mountHand({ ...layout, nodes });
    for (const n of nodes) {
      expect(w.get(`.label[data-node-id="${n.id}"]`).classes()).toContain(`align-${n.label.align}`);
    }
  });

  it('places the caption from the layout with its max-width, and none without a caption', () => {
    const { wrapper: w, props } = mountPlane();
    const caption = props.layout.caption as NonNullable<GraphLayout['caption']>;
    expect(caption).not.toBeNull();
    const style = w.get('.caption').attributes('style') ?? '';
    expect(style).toContain(`left: ${caption.x}px`);
    expect(style).toContain(`top: ${caption.y}px`);
    expect(style).toContain(`max-width: ${caption.w}px`);
    wrapper?.unmount();
    wrapper = null;
    const mobile = mountPlane({ mobile: true });
    expect(mobile.props.layout.caption).toBeNull();
    expect(mobile.wrapper.find('.caption').exists()).toBe(false);
  });

  it('clicking a node or its label emits select with the id', async () => {
    const { wrapper: w } = mountPlane();
    await nodeButton(w, 3n).trigger('click');
    await w.get('.label[data-node-id="2"]').trigger('click');
    expect(w.emitted('select')).toEqual([[3n], [2n]]);
  });

  it('is a labelled group and the caption is aria-hidden text', () => {
    const { wrapper: w } = mountPlane({ regionName: 'Ashfall' });
    const group = w.get('[role="group"]');
    expect(group.attributes('aria-label')).toBe('Ashfall route graph');
    const caption = w.get('.caption');
    expect(caption.text()).toBe('Ashfall');
    expect(caption.attributes('aria-hidden')).toBe('true');
  });

  it('renders a hostile place name as text, never as an element', () => {
    const places = basePlaces.map((p) => (p.id === 2n ? { ...p, name: XSS } : p));
    const { wrapper: w } = mountPlane({ places, regionName: XSS });
    expect(w.find('img').exists()).toBe(false);
    expect(w.get('.label[data-node-id="2"] .name').text()).toBe(XSS);
    expect(w.get('.caption').text()).toBe(XSS);
    expect(w.get('[role="group"]').attributes('aria-label')).toBe(`${XSS} route graph`);
  });
});

describe('GraphPlane: gate pills', () => {
  it('draws one gate button per layout gate with To {Region} and the level in its band colour', () => {
    const { wrapper: w, props } = mountPlane();
    const gates = w.findAll('button.gate');
    expect(gates).toHaveLength(props.layout.gates.length);
    expect(gates).toHaveLength(1);
    const gate = gates[0];
    expect(gate.text()).toContain('To Saltmarsh');
    expect(gate.text()).toContain('Lv 4–6');
    expect(gate.attributes('aria-label')).toBe(props.gates[0].ariaLabel);
    expect(gate.get('.gate-level').attributes('style')).toContain('var(--color-con-');
    expect(gate.classes()).not.toContain('locked');
    expect(gate.find('.gate-lock').exists()).toBe(false);
    const layoutGate = props.layout.gates[0];
    expect(gate.attributes('style')).toContain(`left: ${layoutGate.x}px`);
    expect(gate.attributes('style')).toContain(`top: ${layoutGate.y}px`);
  });

  it('choosing a gate emits select with the far node id', async () => {
    const { wrapper: w, props } = mountPlane();
    await w.get('button.gate').trigger('click');
    expect(w.emitted('select')).toEqual([[props.layout.gates[0].farId]]);
  });

  it('while the timer runs shows the lock, the region and m:ss, no level, and stays operable', async () => {
    const { wrapper: w, props } = mountPlane({ timer: { running: true, secondsLeft: 192 } });
    const gate = w.get('button.gate');
    expect(gate.classes()).toContain('locked');
    expect(gate.find('.gate-lock').exists()).toBe(true);
    expect(gate.get('.gate-time').text()).toContain('3:12');
    expect(gate.get('.gate-time').attributes('aria-hidden')).toBe('true');
    expect(gate.text()).toContain('Saltmarsh');
    expect(gate.text()).not.toContain('Lv');
    expect(gate.text()).not.toContain('To Saltmarsh');
    expect(gate.attributes('disabled')).toBeUndefined();
    expect(gate.attributes('aria-disabled')).toBeUndefined();
    expect(gate.attributes('aria-label')).toContain('region travel locked for about');
    await gate.trigger('click');
    expect(w.emitted('select')).toEqual([[props.layout.gates[0].farId]]);
  });

  it('the pill whose far node is selected carries the selected class', () => {
    const { wrapper: w } = mountPlane({ selectedId: 4n });
    expect(w.get('button.gate').classes()).toContain('selected');
    wrapper?.unmount();
    wrapper = null;
    const other = mountPlane({ selectedId: 2n });
    expect(other.wrapper.get('button.gate').classes()).not.toContain('selected');
  });

  it('shows only the region name on mobile (no To, no level)', () => {
    const { wrapper: w } = mountPlane({ mobile: true });
    const gate = w.get('button.gate');
    expect(gate.text()).toContain('Saltmarsh');
    expect(gate.text()).not.toContain('To ');
    expect(gate.text()).not.toContain('Lv');
    expect(gate.classes()).toContain('mobile');
  });

  it('renders the gate pills in the layout gate order, which is the reading order (IN-07)', () => {
    const places = [...basePlaces, loc(7n, 'Duskmere Steps', { regionId: 2n }), loc(8n, 'Far Reach', { regionId: 3n })];
    const edges = [...baseEdges, { a: 3n, b: 7n }, { a: 6n, b: 8n }];
    const { wrapper: w, props } = mountPlane({ places, edges });
    expect(props.layout.gates.length).toBeGreaterThanOrEqual(3);
    const keys = w.findAll('button.gate').map((g) => g.attributes('data-gate-key'));
    expect(keys).toEqual(props.layout.gates.map((g) => g.key));
    for (let i = 1; i < props.layout.gates.length; i += 1) {
      const p = props.layout.gates[i - 1];
      const q = props.layout.gates[i];
      expect(p.y < q.y || (p.y === q.y && (p.x < q.x || (p.x === q.x && p.key < q.key)))).toBe(true);
    }
  });

  it('draws no gate pill when no edge crosses a region', () => {
    const places = basePlaces.filter((p) => p.id !== 4n);
    const edges = baseEdges.filter((e) => e.b !== 4n);
    const { wrapper: w } = mountPlane({ places, edges });
    expect(w.findAll('button.gate')).toHaveLength(0);
  });
});

describe('GraphPlane: keyboard', () => {
  const tabStops = (w: VueWrapper): string[] =>
    w
      .findAll('button.node')
      .filter((b) => b.attributes('tabindex') === '0')
      .map((b) => b.attributes('data-node-id') as string);
  const activeId = (): string | undefined => (document.activeElement as HTMLElement | null)?.dataset.nodeId;

  it('has one tab stop: the selected node, else your place, else the start', async () => {
    const selected = mountPlane({ selectedId: 3n });
    expect(tabStops(selected.wrapper)).toEqual(['3']);
    selected.wrapper.unmount();
    wrapper = null;

    const here = mountPlane();
    expect(tabStops(here.wrapper)).toEqual(['1']);
    here.wrapper.unmount();
    wrapper = null;

    // you are elsewhere (not drawn in this region): the start node
    const away = mountPlane({ currentId: null });
    expect(tabStops(away.wrapper)).toEqual([String(away.props.layout.startId)]);
  });

  it('arrow keys move to the nearest place in their direction (MS-05)', async () => {
    const { wrapper: w } = mountHand(handLayout());
    const press = async (from: bigint, key: string): Promise<void> => {
      nodeButton(w, from).element.focus();
      await nodeButton(w, from).trigger('keydown', { key });
      await nextTick();
    };
    await press(HAND.centre, 'ArrowRight');
    expect(activeId()).toBe(String(HAND.right));
    expect(tabStops(w)).toEqual([String(HAND.right)]);
    await press(HAND.centre, 'ArrowLeft');
    expect(activeId()).toBe(String(HAND.left));
    await press(HAND.centre, 'ArrowUp');
    expect(activeId()).toBe(String(HAND.up));
    await press(HAND.centre, 'ArrowDown');
    expect(activeId()).toBe(String(HAND.down));
    await press(HAND.right, 'ArrowLeft');
    expect(activeId()).toBe(String(HAND.centre));
  });

  it('keeps the focus when no place lies in the pressed direction', async () => {
    const { wrapper: w } = mountHand(handLayout());
    nodeButton(w, HAND.up).element.focus();
    await nodeButton(w, HAND.up).trigger('keydown', { key: 'ArrowUp' });
    await nextTick();
    expect(activeId()).toBe(String(HAND.up));
    nodeButton(w, HAND.corner).element.focus();
    await nodeButton(w, HAND.corner).trigger('keydown', { key: 'ArrowRight' });
    await nextTick();
    expect(activeId()).toBe(String(HAND.corner));
  });

  it('Home goes to your place and End to the last place in reading order', async () => {
    const { wrapper: w, props } = mountHand(handLayout(), HAND.down);
    nodeButton(w, HAND.left).element.focus();
    await nodeButton(w, HAND.left).trigger('keydown', { key: 'Home' });
    await nextTick();
    expect(activeId()).toBe(String(HAND.down));
    await nodeButton(w, HAND.down).trigger('keydown', { key: 'End' });
    await nextTick();
    expect(activeId()).toBe(String(HAND.corner));
    expect(props.views[props.views.length - 1].id).toBe(HAND.corner);
  });

  it('Home and End work on a real layout too', async () => {
    const { wrapper: w, props } = mountPlane();
    nodeButton(w, 3n).element.focus();
    await nodeButton(w, 3n).trigger('keydown', { key: 'Home' });
    await nextTick();
    expect(activeId()).toBe('1');
    await nodeButton(w, 1n).trigger('keydown', { key: 'End' });
    await nextTick();
    const last = props.views[props.views.length - 1];
    expect(activeId()).toBe(String(last.id));
  });

  it('Home goes to the start node when you are not in the drawn region', async () => {
    const { wrapper: w, props } = mountPlane({ currentId: null });
    const last = props.views[props.views.length - 1];
    nodeButton(w, last.id).element.focus();
    await nodeButton(w, last.id).trigger('keydown', { key: 'Home' });
    await nextTick();
    expect(activeId()).toBe(String(props.layout.startId));
  });

  it('reaches every drawn place by keyboard alone, each with its full aria-label (the graph is the only view of the places)', async () => {
    const { wrapper: w, props } = mountPlane({ selectedId: 2n });
    const drawn = props.views.map((view) => String(view.id));
    expect(drawn.length).toBeGreaterThan(3);
    // one tab stop enters the group; arrows (and Home, End) walk from it to every other place
    expect(tabStops(w)).toHaveLength(1);
    const reached = new Set<string>(tabStops(w));
    const queue = [...reached];
    while (queue.length > 0) {
      const from = queue.shift() as string;
      for (const key of ['ArrowRight', 'ArrowLeft', 'ArrowUp', 'ArrowDown', 'Home', 'End']) {
        nodeButton(w, BigInt(from)).element.focus();
        await nodeButton(w, BigInt(from)).trigger('keydown', { key });
        await nextTick();
        const landed = activeId();
        if (landed !== undefined && !reached.has(landed)) {
          reached.add(landed);
          queue.push(landed);
        }
      }
    }
    expect([...reached].sort()).toEqual([...drawn].sort());
    // every one of them is a real button whose spoken label is the full node label
    for (const view of props.views) {
      const button = nodeButton(w, view.id);
      expect(button.element.tagName).toBe('BUTTON');
      expect(view.ariaLabel.startsWith(`${view.name}, `)).toBe(true);
      expect(button.attributes('aria-label')).toBe(view.ariaLabel);
    }
  });

  it('Enter and Space emit select for the focused node', async () => {
    const { wrapper: w } = mountPlane();
    await nodeButton(w, 3n).trigger('keydown', { key: 'Enter' });
    await nodeButton(w, 2n).trigger('keydown', { key: ' ' });
    expect(w.emitted('select')).toEqual([[3n], [2n]]);
  });

  it('arrow keys do not emit select and are default-prevented, and there is one tab stop', async () => {
    const { wrapper: w } = mountHand(handLayout());
    for (const key of ['ArrowRight', 'ArrowLeft', 'ArrowUp', 'ArrowDown']) {
      const event = new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true });
      nodeButton(w, HAND.centre).element.dispatchEvent(event);
      expect(event.defaultPrevented).toBe(true);
    }
    expect(w.emitted('select')).toBeUndefined();
    expect(tabStops(w)).toHaveLength(1);
    await nodeButton(w, HAND.right).trigger('keydown', { key: 'Enter' });
    await nodeButton(w, HAND.up).trigger('keydown', { key: ' ' });
    expect(w.emitted('select')).toEqual([[HAND.right], [HAND.up]]);
  });

  it('puts the gate pills after the group in tab order (DOM order) and gives them no negative tabindex', () => {
    const { wrapper: w } = mountPlane();
    const group = w.get('[role="group"]').element;
    const gate = w.get('button.gate').element;
    expect(group.compareDocumentPosition(gate) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(w.get('button.gate').attributes('tabindex')).toBeUndefined();
  });

  it('focusCurrent focuses the roving stop and scrollToNode scrolls a node into view', async () => {
    const { wrapper: w } = mountPlane({ selectedId: 3n });
    const vm = w.vm as unknown as { focusCurrent(): void; scrollToNode(id: bigint): void };
    vm.focusCurrent();
    await nextTick();
    expect(activeId()).toBe('3');

    const scrolled: Element[] = [];
    const original = Element.prototype.scrollIntoView;
    Element.prototype.scrollIntoView = function (this: Element) {
      scrolled.push(this);
    };
    try {
      vm.scrollToNode(2n);
      expect(scrolled.map((el) => (el as HTMLElement).dataset.nodeId)).toEqual(['2']);
      // an unknown id is a no-op
      vm.scrollToNode(999n);
      expect(scrolled).toHaveLength(1);
    } finally {
      Element.prototype.scrollIntoView = original;
    }
  });

  it('keeps one tab stop when the focused node disappears', async () => {
    const { wrapper: w, props } = mountPlane();
    nodeButton(w, 3n).element.focus();
    await nodeButton(w, 3n).trigger('keydown', { key: 'ArrowLeft' });
    await nextTick();
    const next = build({
      places: basePlaces.filter((p) => p.id !== 6n && p.id !== 3n),
      edges: baseEdges.filter((e) => e.a !== 3n && e.b !== 3n && e.b !== 6n),
    });
    await w.setProps({ ...next });
    expect(tabStops(w)).toHaveLength(1);
    expect(props.views.length).toBeGreaterThan(next.views.length);
  });
});

describe('GraphPlane: the safety rating on the ring and caption (D-42)', () => {
  it('puts the rating class on the node: rate-safe, rate-risky, rate-quiet, rate-deadly, rate-unknown', () => {
    const { wrapper: w } = mountPlane();
    expect(nodeButton(w, 1n).classes()).toContain('rate-safe');
    expect(nodeButton(w, 2n).classes()).toContain('rate-risky');
    expect(nodeButton(w, 3n).classes()).toContain('rate-quiet');
    expect(nodeButton(w, 4n).classes()).toContain('rate-deadly');
    expect(nodeButton(w, 5n).classes()).toContain('rate-unknown');
    for (const button of w.findAll('button.node')) {
      expect(button.classes().some((c) => c.startsWith('band-'))).toBe(false);
    }
  });

  it('paints the caption in the rating class with its word, and the aria label ends with the word', () => {
    const { wrapper: w } = mountPlane();
    const caption = w.get('.label[data-node-id="2"] .sub .level');
    expect(caption.classes()).toContain('rate-risky');
    expect(caption.text()).toBe('Risky · Lv 4–5');
    expect(caption.attributes('style')).toBeUndefined();
    expect(nodeLabel(w, 2n)).toContain(', level 4 to 5, risky');
    expect(nodeLabel(w, 1n)).toContain(', safe');
  });

  it('a place whose pool rows have not applied keeps the dashed neutral ring, no word, never Safe', () => {
    const { wrapper: w } = mountPlane({ rating: { ...RATING, poolsApplied: (id) => id !== 2n } });
    const button = nodeButton(w, 2n);
    expect(button.classes()).toContain('rate-unknown');
    expect(button.classes()).not.toContain('rate-safe');
    const caption = w.get('.label[data-node-id="2"] .sub .level');
    expect(caption.classes()).toContain('rate-unknown');
    expect(caption.text()).toBe('Lv 4–5');
    expect(w.get('.label[data-node-id="2"]').find('.sub-safe').exists()).toBe(false);
    expect(nodeLabel(w, 2n)).not.toMatch(/risky|safe/);
    expect(SOURCE).toMatch(
      /\.rate-unknown\.state-visited \.circle,\s*\.rate-unknown\.state-heard \.circle \{\s*border: 1px dashed var\(--color-neutral-500\);/,
    );
  });

  it('with no applied pool rows a non-safe place is Unknown and a safe place stays Safe', () => {
    const { wrapper: w } = mountPlane({ rating: null });
    expect(nodeButton(w, 1n).classes()).toContain('rate-safe');
    expect(nodeButton(w, 2n).classes()).toContain('rate-unknown');
    expect(w.get('.label[data-node-id="2"]').find('.level').exists()).toBe(false);
  });

  it('maps the rate-* classes to the five tokens for the ring and the caption', () => {
    const tokens: Record<string, string> = {
      safe: '--color-con-light-green',
      quiet: '--color-con-blue',
      risky: '--color-con-yellow',
      deadly: '--color-con-red',
      unknown: '--color-neutral-500',
    };
    for (const [key, token] of Object.entries(tokens)) {
      expect(SOURCE).toMatch(new RegExp(`\\.level\\.rate-${key} \\{\\s*color: var\\(${token}\\);`));
      if (key === 'unknown') continue;
      expect(SOURCE).toMatch(new RegExp(`\\.rate-${key}\\.state-visited \\.circle \\{\\s*border-color: var\\(${token}\\);`));
      expect(SOURCE).toMatch(
        new RegExp(
          `\\.rate-${key}\\.state-heard \\.circle \\{\\s*border-color: color-mix\\(in srgb, var\\(${token}\\) 45%, transparent\\);`,
        ),
      );
    }
    expect(SOURCE).not.toMatch(/band-(safe|easy|even|tough|deadly|unknown)/);
  });

  it('draws no Overrun mark (B6) and keeps the gate pills on the band range (B9)', () => {
    expect(SOURCE).not.toMatch(/[Oo]verrun/);
    const { wrapper: w } = mountPlane();
    expect(w.get('button.gate .gate-level').attributes('style')).toContain('var(--color-con-');
  });

  it('renders a hostile name in a rated place as text, the caption beside it', () => {
    const places = basePlaces.map((p) => (p.id === 2n ? { ...p, name: XSS } : p));
    const { wrapper: w } = mountPlane({ places });
    expect(w.find('img').exists()).toBe(false);
    expect(w.get('.label[data-node-id="2"] .name').text()).toBe(XSS);
    expect(w.get('.label[data-node-id="2"] .level').text()).toBe('Risky · Lv 4–5');
  });

  // UI Q10 overflow backstop: the densest region, every node rated, long names. Every caption keeps
  // its rating class and its word, its label box is at most 144px wide and overlaps no other label,
  // and the caption is a flex: none part of its line, so the name or the terrain text ellipsizes first.
  it('backstop: at the densest region every caption keeps its class, its word and its room', () => {
    const KEYS = ['quiet', 'risky', 'deadly'] as const;
    const dense: NodePlace[] = [loc(1n, 'The Crossing', { terrainType: 'town', isSafe: true })];
    const edges: { a: bigint; b: bigint }[] = [];
    const pools: MapRatingSource['pools'][number][] = [];
    for (let i = 2; i <= 16; i += 1) {
      const id = BigInt(i);
      dense.push(loc(id, `The Long Drowned Orchard of ${i}`));
      edges.push({ a: BigInt(Math.max(1, Math.floor(i / 2))), b: id });
      const key = KEYS[i % 3];
      // Quiet: one Scarce family at your level; Risky: Stable two above; Deadly: Overrun far above.
      if (key === 'quiet') pools.push({ locationId: id, kind: 'creature', level: 1n, lvLo: 2n, lvHi: 3n });
      if (key === 'risky') pools.push({ locationId: id, kind: 'creature', level: 2n, lvLo: 4n, lvHi: 5n });
      if (key === 'deadly') pools.push({ locationId: id, kind: 'creature', level: 3n, lvLo: 12n, lvHi: 14n });
    }
    for (const mobile of [false, true]) {
      const { wrapper: w, props } = mountPlane({ places: dense, edges, mobile, rating: { ...RATING, pools } });
      expect(props.views.length).toBe(16);
      for (const view of props.views) {
        if (view.id === 1n) continue;
        const key = KEYS[Number(view.id) % 3];
        const word = key.charAt(0).toUpperCase() + key.slice(1);
        expect(view.levelColor).toBe(`rate-${key}`);
        const caption = w.get(`.label[data-node-id="${view.id}"] ${mobile ? '.level-inline' : '.sub .level'}`);
        expect(caption.classes()).toContain(`rate-${key}`);
        expect(caption.text().startsWith(`${word} · Lv `)).toBe(true);
        expect(nodeButton(w, view.id).classes()).toContain(`rate-${key}`);
        expect(view.label.w).toBeLessThanOrEqual(144);
      }
      const boxes = props.views.map((v) => v.label);
      for (let i = 0; i < boxes.length; i += 1) {
        for (let j = i + 1; j < boxes.length; j += 1) {
          const a = boxes[i];
          const b = boxes[j];
          const apart = a.x + a.w <= b.x || b.x + b.w <= a.x || a.y + a.h <= b.y || b.y + b.h <= a.y;
          expect(apart).toBe(true);
        }
      }
      wrapper?.unmount();
      wrapper = null;
    }
    expect(SOURCE).toMatch(/\.level-inline,\s*\.sub \.level \{\s*flex: none;/);
    expect(SOURCE).toMatch(/\.sub-text \{[^}]*text-overflow: ellipsis;/);
  });
});

describe('GraphPlane: source rules', () => {
  it('draws one svg with a viewBox and no preserveAspectRatio', () => {
    expect((SOURCE.match(/<svg/g) ?? []).length).toBe(1);
    expect((SOURCE.match(/viewBox/g) ?? []).length).toBe(1);
    expect(SOURCE).not.toContain('preserveAspectRatio');
  });

  it('strokes are non-scaling and painted only through var() tokens', () => {
    expect(SOURCE).toContain('non-scaling-stroke');
    expect(SOURCE).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
    expect(SOURCE).not.toMatch(/\b(?:rgb|rgba|hsl|hsla|oklch|oklab|lab|lch)\(/i);
    expect(SOURCE).not.toMatch(/\b(?:fill|stroke)="/);
    const paints = SOURCE.match(/\b(?:fill|stroke):\s*[^;]+;/g) ?? [];
    expect(paints.length).toBeGreaterThan(0);
    for (const paint of paints) expect(paint).toMatch(/none|var\(--|color-mix/);
  });

  it('has 44px mobile hit boxes, a route graph group label and no v-html', () => {
    expect(SOURCE).toContain('44');
    expect(SOURCE).toContain('route graph');
    expect(SOURCE).not.toContain('v-html');
  });

  it('shows no level lock and no fixed timer duration', () => {
    expect(SOURCE).not.toMatch(/level lock|requiredLevel|COOLDOWN|Date\.now/);
  });
});

describe('GraphPlane: mobile labels and gate pills (plan 51-11)', () => {
  it('shows the name and the rating caption in its rating class on one line, with no sub-line', () => {
    const { wrapper: w, props } = mountPlane({ mobile: true });
    const label = w.get('.label[data-node-id="2"]');
    expect(label.classes()).toContain('mobile');
    expect(label.find('.sub').exists()).toBe(false);
    expect(label.get('.line .name').text()).toBe('Gloamwood');
    const level = label.get('.line .level-inline');
    const view = props.views.find((v) => v.id === 2n)!;
    expect(level.text()).toBe('Risky · Lv 4–5');
    expect(level.text()).toBe(view.caption);
    expect(level.classes()).toContain('rate-risky');
    expect(level.attributes('style')).toBeUndefined();
    expect(label.text()).not.toContain('woods');
    expect(label.text()).not.toContain('heard of');
  });

  it('shows no level for a safe place and keeps the full sub-line in the node aria-label', () => {
    const mobile = mountPlane({ mobile: true });
    expect(mobile.wrapper.get('.label[data-node-id="1"]').find('.level-inline').exists()).toBe(false);
    const mobileLabel = nodeLabel(mobile.wrapper, 2n);
    wrapper?.unmount();
    wrapper = null;
    const desktop = mountPlane({ mobile: false });
    expect(nodeLabel(desktop.wrapper, 2n)).toBe(mobileLabel);
    expect(mobileLabel).toContain('Gloamwood');
  });

  it('keeps the desktop label as it was: a sub-line and no inline level', () => {
    const { wrapper: w } = mountPlane({ mobile: false });
    const label = w.get('.label[data-node-id="2"]');
    expect(label.find('.sub').exists()).toBe(true);
    expect(label.find('.level-inline').exists()).toBe(false);
    expect(label.classes()).not.toContain('mobile');
  });

  it('puts the lock and the time on a mobile gate pill only while the timer runs', () => {
    const idle = mountPlane({ mobile: true });
    expect(idle.wrapper.get('button.gate').find('.gate-lock').exists()).toBe(false);
    expect(idle.wrapper.get('button.gate').text()).toBe('Saltmarsh');
    wrapper?.unmount();
    wrapper = null;
    const running = mountPlane({ mobile: true, timer: { running: true, secondsLeft: 192 } });
    const gate = running.wrapper.get('button.gate');
    expect(gate.find('.gate-lock').exists()).toBe(true);
    expect(gate.get('.gate-time').attributes('aria-hidden')).toBe('true');
    expect(gate.text()).toBe('Saltmarsh · 3:12');
    expect(gate.attributes('aria-label')).toContain('region travel locked for about');
  });

  it('source: the mobile label is Micro 10 and the gate reaches 44px through its slop', () => {
    expect(SOURCE).toMatch(/\.label\.mobile \.line \{\s*font-size: 10px;/);
    expect(SOURCE).toMatch(/\.gate\.mobile::after \{[^}]*inset: -10px 0;/);
  });
});

function nodeLabel(w: VueWrapper, id: bigint): string {
  return w.get(`button.node[data-node-id="${id}"]`).attributes('aria-label') as string;
}

describe('GraphPlane: measured canvas (MS-02)', () => {
  type Entries = Array<{ contentRect: { width: number; height: number } }>;
  function fakeObserver() {
    const state: { callback: ((entries: Entries) => void) | null; observed: Element[] } = { callback: null, observed: [] };
    const disconnect = vi.fn();
    class FakeObserver {
      constructor(cb: (entries: Entries) => void) {
        state.callback = cb;
      }
      observe = (el: Element): void => {
        state.observed.push(el);
      };
      disconnect = disconnect;
      unobserve = vi.fn();
    }
    vi.stubGlobal('ResizeObserver', FakeObserver);
    return { state, disconnect };
  }

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  function mountInScrollArea() {
    const area = document.createElement('div');
    area.className = 'scroll-area';
    document.body.appendChild(area);
    const props = build();
    wrapper = mount(GraphPlane, { props, attachTo: area });
    return { area, w: wrapper };
  }

  it('watches the scroll area (the parent element) and emits whole-pixel sizes once per change', async () => {
    const { state, disconnect } = fakeObserver();
    const { w } = mountInScrollArea();
    await nextTick();
    expect(state.observed).toHaveLength(1);
    expect(state.observed[0]).toBe(w.get('.graph-plane').element.parentElement);
    state.callback!([{ contentRect: { width: 652.7, height: 600.2 } }]);
    expect(w.emitted('resize')).toEqual([[{ width: 652, height: 600 }]]);
    state.callback!([{ contentRect: { width: 652.1, height: 600.9 } }]);
    expect(w.emitted('resize')).toHaveLength(1);
    state.callback!([{ contentRect: { width: 0, height: 0 } }]);
    expect(w.emitted('resize')).toHaveLength(1);
    state.callback!([]);
    expect(w.emitted('resize')).toHaveLength(1);
    state.callback!([{ contentRect: { width: 390.4, height: 320 } }]);
    expect(w.emitted('resize')).toEqual([[{ width: 652, height: 600 }], [{ width: 390, height: 320 }]]);
    w.unmount();
    wrapper = null;
    expect(disconnect).toHaveBeenCalled();
  });

  it('mounts and emits nothing without ResizeObserver', async () => {
    vi.stubGlobal('ResizeObserver', undefined);
    const { w } = mountInScrollArea();
    await nextTick();
    expect(w.find('.graph-plane').exists()).toBe(true);
    expect(w.emitted('resize')).toBeUndefined();
  });
});

// A hand-made layout with known positions: a centre, places right, left, up and down of it, and a
// far corner (keyboard tests, MS-05). Nodes come in reading order, as layoutGraph returns them.
const HAND = { centre: 11n, right: 12n, left: 13n, up: 14n, down: 15n, corner: 16n };

function handLayout(): GraphLayout {
  const at = (id: bigint, x: number, y: number): LayoutNode => ({
    id,
    x,
    y,
    side: null,
    label: { x: x + 20, y: y - 10, w: 144, h: 36, align: 'left' },
  });
  const nodes = [
    at(HAND.centre, 300, 300),
    at(HAND.right, 500, 310),
    at(HAND.left, 100, 290),
    at(HAND.up, 300, 100),
    at(HAND.down, 310, 500),
    at(HAND.corner, 520, 520),
  ].sort((a, b) => a.y - b.y || a.x - b.x || (a.id < b.id ? -1 : 1));
  return {
    regionId: 1n,
    startId: HAND.centre,
    nodes,
    edges: [],
    gates: [],
    border: { x: 48, y: 48, w: 640, h: 560 },
    caption: { x: 64, y: 64, w: 160, h: 16 },
    width: 760,
    height: 660,
  };
}

function mountHand(layout: GraphLayout, currentId: bigint | null = HAND.centre) {
  const places = new Map<bigint, NodePlace>(layout.nodes.map((n) => [n.id, loc(n.id, `Place ${n.id}`)]));
  const views = nodeViews({
    layout,
    places,
    regions,
    visited: new Set(places.keys()),
    heardOf: new Set(),
    currentLocationId: currentId,
    selectedId: null,
    boundLocationId: null,
    steps: new Map(),
    rating: RATING,
  });
  const props = { layout, views, gates: [], routes: [], regionName: 'Ashfall', selectedId: null, currentId, mobile: false };
  wrapper = mount(GraphPlane, { props, attachTo: document.body });
  return { wrapper, props };
}
