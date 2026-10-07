import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { PhMapPin } from '@phosphor-icons/vue';
import { layoutGraph } from './graphLayout';
import type { GraphLayout, LayoutPlace } from './graphLayout';
import { gateView, nodeAriaLabel, nodeViews, routePolylines } from './nodeView';
import type { NodePlace } from './nodeView';
import { adjacencyOf, stepsFrom } from './route';
import { placeDanger } from './danger';
import { regionChips } from './regionChips';

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

const places: NodePlace[] = [
  loc(1n, 'The Crossing', { terrainType: 'town', isSafe: true, bindStone: true, craftingAvailable: true }),
  loc(2n, 'Gloamwood', { levelOffset: 1n }), // base 3 + 1 = level 4, range 3-5
  loc(3n, 'Ashgrove'),
  loc(4n, 'Saltmarsh Gate', { regionId: 2n, levelOffset: 1n }), // base 4 + 1 = 5, range 4-6
  loc(5n, 'The Edge Beyond Ashfall', { terrainType: 'uncharted', isSafe: true }),
  loc(6n, 'Narrow Passage', { terrainType: 'passage', isSafe: true }),
  loc(7n, 'Lost Hollow'),
];
const placeMap = new Map(places.map((p) => [p.id, p]));
const edges = [
  { a: 1n, b: 2n },
  { a: 2n, b: 3n },
  { a: 1n, b: 5n },
  { a: 2n, b: 4n },
  { a: 3n, b: 6n },
];
const adjacency = adjacencyOf(edges);

function build(over: Partial<Parameters<typeof nodeViews>[0]> = {}) {
  const layoutPlaces: LayoutPlace[] = places.map((p) => ({
    id: p.id,
    name: p.name,
    regionId: p.regionId,
    bindStone: p.bindStone,
    terrainType: p.terrainType,
  }));
  const layout = layoutGraph({ regionId: 1n, places: layoutPlaces, edges });
  const views = nodeViews({
    layout,
    places: placeMap,
    regions,
    visited: new Set([1n, 2n]),
    heardOf: new Set([3n, 4n, 5n]),
    currentLocationId: 1n,
    selectedId: null,
    boundLocationId: null,
    playerLevel: 3,
    steps: stepsFrom(adjacency, 1n),
    ...over,
  });
  return { layout, views, byId: (id: bigint) => views.find((v) => v.id === id) };
}

describe('nodeViews states', () => {
  it('the current place is the here circle at 32 with the you ending', () => {
    const v = build().byId(1n);
    expect(v?.circle).toBe('here');
    expect(v?.size).toBe(32);
    expect(v?.stateWord).toBe('here');
    expect(v?.subState).toBe(' · you');
    expect(v?.pressed).toBe(false);
    expect(v?.hit).toEqual({ desktop: 32, mobile: 44 });
  });

  it('a selected place that is not here is the selected circle, pressed, at 24', () => {
    const v = build({ selectedId: 2n }).byId(2n);
    expect(v?.circle).toBe('selected');
    expect(v?.size).toBe(24);
    expect(v?.pressed).toBe(true);
    expect(v?.stateWord).toBe('visited');
  });

  it('here wins over selected, and the pressed state still follows the selection', () => {
    const v = build({ selectedId: 1n }).byId(1n);
    expect(v?.circle).toBe('here');
    expect(v?.pressed).toBe(true);
  });

  it('a visited place is the visited circle at 24 with no ending', () => {
    const v = build().byId(2n);
    expect(v?.circle).toBe('visited');
    expect(v?.size).toBe(24);
    expect(v?.subState).toBe('');
  });

  it('a heard-of place is the heard-of circle with its ending', () => {
    const v = build().byId(3n);
    expect(v?.circle).toBe('heardOf');
    expect(v?.stateWord).toBe('heard of');
    expect(v?.subState).toBe(' · heard of');
    expect(build({ selectedId: 3n }).byId(3n)?.subState).toBe(' · heard of');
  });

  it('flags uncharted and passage places, with their terrain words', () => {
    const { byId } = build();
    expect(byId(5n)?.uncharted).toBe(true);
    expect(byId(5n)?.terrain.word).toBe('Uncharted');
    expect(byId(5n)?.danger.kind).toBe('unknown');
    expect(byId(5n)?.levelLabel).toBe('');
    expect(byId(6n)?.passage).toBe(true);
    expect(byId(6n)?.terrain.word).toBe('Passage');
    expect(byId(2n)?.uncharted).toBe(false);
    expect(byId(2n)?.passage).toBe(false);
  });

  it('marks another region place with the region prefix', () => {
    const { byId } = build();
    const v = byId(4n);
    expect(v?.otherRegion).toBe(true);
    expect(v?.regionName).toBe('Saltmarsh');
    expect(v?.subPrefix).toBe('Saltmarsh · ');
    expect(byId(2n)?.otherRegion).toBe(false);
    expect(byId(2n)?.subPrefix).toBe('');
  });

  it('bind point comes from the bound location, and the bind stone only where it is not the bind point', () => {
    const bound = build({ boundLocationId: 1n }).byId(1n);
    expect(bound?.bindPoint).toBe(true);
    expect(bound?.bindStone).toBe(false);
    const other = build({ boundLocationId: 3n }).byId(1n);
    expect(other?.bindPoint).toBe(false);
    expect(other?.bindStone).toBe(true);
    expect(build().byId(2n)?.bindStone).toBe(false);
  });

  it('shows crafting from craftingAvailable', () => {
    expect(build().byId(1n)?.crafting).toBe(true);
    expect(build().byId(2n)?.crafting).toBe(false);
  });

  it('reads Safe as the shield and other levels as Lv a-b in the band colour', () => {
    const { byId } = build();
    expect(byId(1n)?.safe).toBe(true);
    expect(byId(1n)?.levelLabel).toBe('Safe');
    expect(byId(2n)?.safe).toBe(false);
    expect(byId(2n)?.levelLabel).toBe('Lv 3–5');
    expect(byId(2n)?.levelColor).toBe('var(--color-con-yellow)');
    expect(byId(4n)?.levelColor).toBe('var(--color-con-red)');
  });

  it('falls back to the map pin for an unknown terrain', () => {
    const odd = [...places, loc(8n, 'Odd Place', { terrainType: 'marsh' })];
    const layout = layoutGraph({
      regionId: 1n,
      places: odd.map((p) => ({ id: p.id, name: p.name, regionId: p.regionId, bindStone: p.bindStone, terrainType: p.terrainType })),
      edges,
    });
    const views = nodeViews({
      layout,
      places: new Map(odd.map((p) => [p.id, p])),
      regions,
      visited: new Set([1n]),
      heardOf: new Set(),
      currentLocationId: 1n,
      selectedId: null,
      boundLocationId: null,
      playerLevel: 3,
      steps: new Map(),
    });
    const v = views.find((x) => x.id === 8n);
    expect(v?.terrain.icon).toBe(PhMapPin);
    expect(v?.terrain.word).toBe('Marsh');
  });

  it('copies each layout node label box into its view', () => {
    const { layout, views } = build();
    expect(views).toHaveLength(layout.nodes.length);
    for (const v of views) {
      const n = layout.nodes.find((x) => x.id === v.id);
      expect(v.label).toEqual(n?.label);
    }
  });

  it('keeps the full name in title and the position of the layout node', () => {
    const { layout, byId } = build();
    const v = byId(5n);
    const n = layout.nodes.find((x) => x.id === 5n);
    expect(v?.title).toBe('The Edge Beyond Ashfall');
    expect(v?.name).toBe('The Edge Beyond Ashfall');
    expect([v?.x, v?.y]).toEqual([n?.x, n?.y]);
  });

  it('leaves out a layout node that has no place row', () => {
    const { layout } = build();
    const views = nodeViews({
      layout,
      places: new Map([...placeMap].filter(([id]) => id !== 3n)),
      regions,
      visited: new Set([1n]),
      heardOf: new Set(),
      currentLocationId: 1n,
      selectedId: null,
      boundLocationId: null,
      playerLevel: 3,
      steps: new Map(),
    });
    expect(views.find((v) => v.id === 3n)).toBeUndefined();
  });

  it('keeps a markup payload as plain text in the name and the label', () => {
    const payload = '<img src=x onerror=alert(1)>';
    const evil = [loc(1n, payload)];
    const layout = layoutGraph({
      regionId: 1n,
      places: evil.map((p) => ({ id: p.id, name: p.name, regionId: p.regionId, bindStone: false, terrainType: 'woods' })),
      edges: [],
    });
    const [v] = nodeViews({
      layout,
      places: new Map(evil.map((p) => [p.id, p])),
      regions,
      visited: new Set([1n]),
      heardOf: new Set(),
      currentLocationId: 1n,
      selectedId: null,
      boundLocationId: null,
      playerLevel: 3,
      steps: new Map([[1n, 0]]),
    });
    expect(v.name).toBe(payload);
    expect(v.ariaLabel.startsWith(`${payload}, here`)).toBe(true);
  });
});

describe('aria-labels', () => {
  it('reads a visited place one step away', () => {
    expect(build().byId(2n)?.ariaLabel).toBe('Gloamwood, visited, level 3 to 5, tough, 1 step from here');
  });

  it('reads here with the bind point, crafting and safe in order', () => {
    expect(build({ boundLocationId: 1n }).byId(1n)?.ariaLabel).toBe(
      'The Crossing, here, bind point, crafting, safe, you are here',
    );
  });

  it('reads the bind stone when the place is not the bind point', () => {
    expect(build().byId(1n)?.ariaLabel).toBe('The Crossing, here, bind stone, crafting, safe, you are here');
  });

  it('reads another region place two steps away', () => {
    expect(build().byId(4n)?.ariaLabel).toBe(
      'Saltmarsh Gate, heard of, other region Saltmarsh, level 4 to 6, deadly, 2 steps from here',
    );
  });

  it('reads an uncharted place without a level part', () => {
    expect(build().byId(5n)?.ariaLabel).toBe('The Edge Beyond Ashfall, heard of, uncharted, 1 step from here');
  });

  it('reads a passage', () => {
    expect(build().byId(6n)?.ariaLabel).toBe('Narrow Passage, heard of, passage, safe, 3 steps from here');
  });

  it('ends with no known path for an unreachable place', () => {
    expect(build().byId(7n)?.ariaLabel).toBe('Lost Hollow, heard of, level 3, even, no known path');
  });

  it('reads a one-level range as level n', () => {
    const danger = placeDanger({ terrainType: 'woods', isSafe: false, regionId: 2n, levelOffset: 0n }, regions, 4);
    expect(
      nodeAriaLabel({
        name: 'Plain',
        stateWord: 'visited',
        otherRegion: false,
        regionName: 'Ashfall',
        uncharted: false,
        passage: false,
        bindPoint: false,
        bindStone: false,
        crafting: false,
        danger,
        steps: 1,
      }),
    ).toBe('Plain, visited, level 4, even, 1 step from here');
  });

  it('reads no known path when the steps are null', () => {
    const danger = placeDanger({ terrainType: 'woods', isSafe: false, regionId: 1n, levelOffset: 0n }, regions, 3);
    const label = nodeAriaLabel({
      name: 'Far',
      stateWord: 'heard of',
      otherRegion: false,
      regionName: 'Ashfall',
      uncharted: false,
      passage: false,
      bindPoint: false,
      bindStone: false,
      crafting: false,
      danger,
      steps: null,
    });
    expect(label.endsWith(', no known path')).toBe(true);
  });
});

describe('nodeViews: the graph is the only way to the places (no List view)', () => {
  it('gives every drawn place a view in the layout reading order (y, then x, then id)', () => {
    const { views, layout } = build();
    const expected = [...views].sort((a, b) => a.y - b.y || a.x - b.x || (a.id < b.id ? -1 : 1)).map((v) => v.id);
    expect(views.map((v) => v.id)).toEqual(expected);
    expect(views.map((v) => v.id)).toEqual(layout.nodes.map((n) => n.id));
  });

  it('gives every place a spoken label with its name, state, danger and distance', () => {
    const { views } = build();
    expect(views.length).toBeGreaterThan(0);
    for (const v of views) {
      expect(v.ariaLabel.startsWith(`${v.name}, `)).toBe(true);
      expect(v.ariaLabel).toContain(v.stateWord);
      expect(v.ariaLabel).toMatch(/you are here|step[s]? from here|no known path/);
    }
    expect(build().byId(7n)?.ariaLabel).toContain('no known path');
    expect(build().byId(3n)?.ariaLabel).toContain('2 steps from here');
  });

  it('marks only the selected place as pressed', () => {
    expect(build({ selectedId: 3n }).views.filter((v) => v.pressed).map((v) => v.id)).toEqual([3n]);
    expect(build().views.some((v) => v.pressed)).toBe(false);
  });
});

describe('routePolylines', () => {
  const layout: GraphLayout = layoutGraph({
    regionId: 1n,
    places: [1n, 2n, 3n, 4n, 5n].map((id) => ({ id, name: `P${id}`, regionId: 1n, bindStone: false, terrainType: 'woods' })),
    edges: [
      { a: 1n, b: 2n },
      { a: 2n, b: 3n },
      { a: 3n, b: 4n },
      { a: 4n, b: 5n },
    ],
  });
  const at = (id: bigint) => {
    const n = layout.nodes.find((x) => x.id === id);
    return `${n?.x},${n?.y}`;
  };

  it('draws a path inside the layout through the node centres', () => {
    expect(routePolylines(layout, [1n, 2n, 3n])).toEqual([`${at(1n)} ${at(2n)} ${at(3n)}`]);
  });

  it('starts at the first path place that is a node (the border node where the path enters)', () => {
    expect(routePolylines(layout, [9n, 2n, 3n, 4n])).toEqual([`${at(2n)} ${at(3n)} ${at(4n)}`]);
  });

  it('gives nothing for no path, a lone node, or a path with no node', () => {
    expect(routePolylines(layout, null)).toEqual([]);
    expect(routePolylines(layout, [])).toEqual([]);
    expect(routePolylines(layout, [3n])).toEqual([]);
    expect(routePolylines(layout, [8n, 9n])).toEqual([]);
  });

  it('gives two strings for a path with a gap', () => {
    expect(routePolylines(layout, [1n, 2n, 9n, 4n, 5n])).toEqual([`${at(1n)} ${at(2n)}`, `${at(4n)} ${at(5n)}`]);
  });
});

describe('gateView', () => {
  const gate = { key: '2-4', nearId: 2n, farId: 4n, farRegionId: 2n, x: 100, y: 100, side: 'right' as const };
  const chips = regionChips({
    drawn: places,
    regions,
    currentRegionId: 1n,
    shownRegionId: 1n,
    playerLevel: 3,
  });
  const chip = chips.find((c) => c.regionId === 2n);
  const open = { running: false, secondsLeft: 0 };

  it('reads the open gate with the level in its band colour', () => {
    const v = gateView(gate, chip, 'Saltmarsh', open, false);
    expect(v.text).toBe('To Saltmarsh');
    expect(v.levelText).toBe('Lv 4–6');
    expect(v.levelColor).toBe('var(--color-con-red)');
    expect(v.locked).toBe(false);
    expect(v.timeText).toBe('');
    expect(v.ariaLabel).toBe('To Saltmarsh, Lv 4–6, deadly');
    expect(v.farId).toBe(4n);
    expect(v.key).toBe('2-4');
  });

  it('shows a lock and the clock while the region timer runs', () => {
    const v = gateView(gate, chip, 'Saltmarsh', { running: true, secondsLeft: 192 }, false);
    expect(v.locked).toBe(true);
    expect(v.text).toBe('Saltmarsh');
    expect(v.timeText).toBe('3:12');
    expect(v.ariaLabel).toBe('To Saltmarsh, Lv 4–6, deadly, region travel locked for about 4 minutes');
  });

  it('shows only the region name on mobile, and still the lock and time while running', () => {
    expect(gateView(gate, chip, 'Saltmarsh', open, true).text).toBe('Saltmarsh');
    const locked = gateView(gate, chip, 'Saltmarsh', { running: true, secondsLeft: 61 }, true);
    expect(locked.text).toBe('Saltmarsh');
    expect(locked.locked).toBe(true);
    expect(locked.timeText).toBe('1:01');
  });

  it('reads Safe in the safe colour for a region of safe places', () => {
    const safeChips = regionChips({
      drawn: [loc(9n, 'Haven', { regionId: 2n, terrainType: 'town', isSafe: true })],
      regions,
      currentRegionId: 1n,
      shownRegionId: 1n,
      playerLevel: 3,
    });
    const v = gateView(gate, safeChips[0], 'Saltmarsh', open, false);
    expect(v.levelText).toBe('Safe');
    expect(v.levelColor).toBe('var(--color-con-light-green)');
    expect(v.ariaLabel).toBe('To Saltmarsh, Safe');
  });

  it('has no level lock: a missing chip still gives a plain view', () => {
    const v = gateView(gate, undefined, 'Saltmarsh', open, false);
    expect(v.locked).toBe(false);
    expect(v.text).toBe('To Saltmarsh');
    expect(v.levelText).toBe('');
    expect(v.ariaLabel).toBe('To Saltmarsh');
  });
});

describe('source rules', () => {
  const source = readFileSync(resolve(process.cwd(), 'src/map/nodeView.ts'), 'utf8');

  it('builds no HTML and no literal colours', () => {
    expect(source).not.toMatch(/innerHTML|v-html|<\/?(div|span|img|script|svg|b|i|p|a)\b/);
    expect(source).not.toMatch(/#[0-9a-fA-F]{3,8}\b|rgb\(|rgba\(|oklch\(|hsl\(/);
  });
});
