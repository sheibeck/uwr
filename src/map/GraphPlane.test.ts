// @vitest-environment happy-dom
import { afterEach, describe, expect, it } from 'vitest';
import { nextTick } from 'vue';
import { mount, type VueWrapper } from '@vue/test-utils';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import GraphPlane from './GraphPlane.vue';
import { layoutGraph } from './graphLayout';
import type { LayoutPlace } from './graphLayout';
import { gateView, nodeViews, routePolylines } from './nodeView';
import type { NodePlace } from './nodeView';
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

interface BuildOptions {
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
  const layout = layoutGraph({ regionId: 1n, places: layoutPlaces, edges });
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
    playerLevel: 3,
    steps: currentId === null ? new Map() : stepsFrom(adjacency, currentId),
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
    expect(wood.get('.sub').text()).toContain('Lv 3–5');

    const far = w.get('.label[data-node-id="4"]');
    expect(far.get('.sub').text()).toContain('Saltmarsh · ');
    expect(far.get('.sub').text()).toContain('heard of');
    expect(far.classes()).toContain('other');
    expect(nodeButton(w, 4n).classes()).toContain('other');
  });

  it('places right labels 20px right of the node and left-outer labels 20px (plus 144px) left', () => {
    const { wrapper: w, props } = mountPlane();
    const right = props.views.find((v) => v.labelSide === 'right') as (typeof props.views)[number];
    expect(w.get(`.label[data-node-id="${right.id}"]`).attributes('style')).toContain(`left: ${right.x + 20}px`);
    const left = props.views.find((v) => v.labelSide === 'left') as (typeof props.views)[number];
    expect(left).toBeDefined();
    const leftLabel = w.get(`.label[data-node-id="${left.id}"]`);
    expect(leftLabel.attributes('style')).toContain(`left: ${left.x - 20 - 144}px`);
    expect(leftLabel.classes()).toContain('left');
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

  it('ArrowDown and ArrowUp move within a column and move focus', async () => {
    const { wrapper: w } = mountPlane();
    nodeButton(w, 2n).element.focus();
    await nodeButton(w, 2n).trigger('keydown', { key: 'ArrowDown' });
    await nextTick();
    expect(activeId()).toBe('5');
    expect(tabStops(w)).toEqual(['5']);
    await nodeButton(w, 5n).trigger('keydown', { key: 'ArrowUp' });
    await nextTick();
    expect(activeId()).toBe('2');
    // at the edge of the column nothing moves
    await nodeButton(w, 2n).trigger('keydown', { key: 'ArrowUp' });
    await nextTick();
    expect(activeId()).toBe('2');
  });

  it('ArrowRight and ArrowLeft go to the next and previous column, outer columns included', async () => {
    const { wrapper: w } = mountPlane();
    nodeButton(w, 1n).element.focus();
    await nodeButton(w, 1n).trigger('keydown', { key: 'ArrowRight' });
    await nextTick();
    expect(['2', '5']).toContain(activeId());
    const first = activeId() as string;
    await nodeButton(w, BigInt(first)).trigger('keydown', { key: 'ArrowLeft' });
    await nextTick();
    expect(activeId()).toBe('1');
    // the left outer column holds the other-region node
    await nodeButton(w, 1n).trigger('keydown', { key: 'ArrowLeft' });
    await nextTick();
    expect(activeId()).toBe('4');
    // and nothing lies further left
    await nodeButton(w, 4n).trigger('keydown', { key: 'ArrowLeft' });
    await nextTick();
    expect(activeId()).toBe('4');
  });

  it('Home goes to your place and End to the last node in layout order', async () => {
    const { wrapper: w, props } = mountPlane();
    nodeButton(w, 3n).element.focus();
    await nodeButton(w, 3n).trigger('keydown', { key: 'Home' });
    await nextTick();
    expect(activeId()).toBe('1');
    await nodeButton(w, 1n).trigger('keydown', { key: 'End' });
    await nextTick();
    const last = props.views[props.views.length - 1];
    expect(activeId()).toBe(String(last.id));
    expect(last.id).toBe(6n);
  });

  it('Home goes to the start node when you are not in the drawn region', async () => {
    const { wrapper: w, props } = mountPlane({ currentId: null });
    const last = props.views[props.views.length - 1];
    nodeButton(w, last.id).element.focus();
    await nodeButton(w, last.id).trigger('keydown', { key: 'Home' });
    await nextTick();
    expect(activeId()).toBe(String(props.layout.startId));
  });

  it('Enter and Space emit select for the focused node', async () => {
    const { wrapper: w } = mountPlane();
    await nodeButton(w, 3n).trigger('keydown', { key: 'Enter' });
    await nodeButton(w, 2n).trigger('keydown', { key: ' ' });
    expect(w.emitted('select')).toEqual([[3n], [2n]]);
  });

  it('arrow keys do not emit select and are default-prevented', async () => {
    const { wrapper: w } = mountPlane();
    const event = new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true, cancelable: true });
    nodeButton(w, 1n).element.dispatchEvent(event);
    expect(event.defaultPrevented).toBe(true);
    expect(w.emitted('select')).toBeUndefined();
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
  it('shows the name and the level in its band colour on one line, with no sub-line', () => {
    const { wrapper: w, props } = mountPlane({ mobile: true });
    const label = w.get('.label[data-node-id="2"]');
    expect(label.classes()).toContain('mobile');
    expect(label.find('.sub').exists()).toBe(false);
    expect(label.get('.line .name').text()).toBe('Gloamwood');
    const level = label.get('.line .level-inline');
    const view = props.views.find((v) => v.id === 2n)!;
    expect(level.text()).toBe(view.levelLabel);
    expect(level.attributes('style')).toContain(view.levelColor);
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
