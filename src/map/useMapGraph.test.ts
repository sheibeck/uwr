// @vitest-environment happy-dom
import { afterEach, describe, expect, it } from 'vitest';
import { computed, defineComponent, h, nextTick, ref } from 'vue';
import { mount, type VueWrapper } from '@vue/test-utils';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { GAME_KEY, createInertGame } from '../game/context';
import type { GameData } from '../game/context';
import type { Location } from '../module_bindings/types';
import { regionStartId } from './graphLayout';
import { knownPlaces } from './knownPlaces';
import { MAP_KEY, createInertMap } from './mapContext';
import type { MapData } from './mapContext';
import { adjacencyOf } from './route';
import { useMapGraph } from './useMapGraph';
import type { MapGraph } from './useMapGraph';

const place = (id: bigint, name: string, regionId: bigint, over: Record<string, unknown> = {}): Location =>
  ({
    id,
    name,
    description: '',
    zone: '',
    regionId,
    levelOffset: 0n,
    isSafe: false,
    terrainType: 'woods',
    bindStone: false,
    craftingAvailable: false,
    ...over,
  }) as unknown as Location;

const links = (pairs: Array<[bigint, bigint]>) =>
  pairs.flatMap(([a, b]) => [
    { fromLocationId: a, toLocationId: b },
    { fromLocationId: b, toLocationId: a },
  ]);

let wrapper: VueWrapper | null = null;
afterEach(() => {
  wrapper?.unmount();
  wrapper = null;
});

function build(options: { mobile?: boolean; game?: Record<string, unknown> } = {}) {
  const mobile = ref(options.mobile ?? false);
  const character = ref<Record<string, unknown>>({ id: 1n, locationId: 10n, level: 4n, stamina: 40n, boundLocationId: 0n });
  const locations = [
    place(10n, 'Ember Gate', 1n, { terrainType: 'town', isSafe: true }),
    place(11n, 'Gloamwood', 1n),
    place(12n, 'Ridge Walk', 1n),
    place(13n, 'Far Hollow', 1n),
    place(20n, 'Saltmarsh Gate', 2n, { bindStone: true }),
    place(21n, 'Reed Flats', 2n),
  ];
  // The hub's known places depend on the place id only (mapData, review WR-03); this fake never
  // reads the character row, so the test isolates the graph model's own inputs.
  const known = computed(() =>
    knownPlaces<Location>({
      visitedIds: [10n, 11n, 12n, 20n],
      currentLocationId: 10n,
      connections: links([
        [10n, 11n],
        [11n, 12n],
        [12n, 13n],
        [11n, 20n],
        [20n, 21n],
      ]),
      locations,
    }),
  );
  const map = {
    ...createInertMap(),
    ready: ref(true),
    known,
    adjacency: computed(() => adjacencyOf(known.value.edges)),
  } as unknown as MapData;
  const game = {
    ...createInertGame(),
    character,
    locations: ref(locations),
    regions: ref([
      { id: 1n, name: 'Ashfall Wilds', dangerMultiplier: 300n },
      { id: 2n, name: 'Saltmarsh', dangerMultiplier: 400n },
    ]),
    ...options.game,
  } as unknown as GameData;

  let graph: MapGraph | null = null;
  const Host = defineComponent({
    setup() {
      graph = useMapGraph(() => mobile.value);
      return () => h('div');
    },
  });
  wrapper = mount(Host, {
    global: { provide: { [GAME_KEY as symbol]: game, [MAP_KEY as symbol]: map } },
  });
  return { graph: graph as unknown as MapGraph, character, mobile, locations };
}

describe('useMapGraph (51-12)', () => {
  it('keeps the same layout object when the character row changes but the place does not (WR-03)', async () => {
    const { graph, character } = build();
    const before = graph.layout.value;
    expect(before).not.toBeNull();
    character.value = { ...character.value, stamina: 48n };
    await nextTick();
    expect(graph.layout.value).toBe(before);
  });

  it('lays the region out to fill the canvas, and ignores an equal size', async () => {
    const { graph } = build();
    expect(graph.canvas.value).toBeNull();
    graph.setCanvas({ width: 652, height: 600 });
    const filled = graph.layout.value;
    expect(filled).not.toBeNull();
    expect(filled!.width).toBeGreaterThanOrEqual(652);
    expect(filled!.height).toBeGreaterThanOrEqual(600);
    const canvasBefore = graph.canvas.value;
    graph.setCanvas({ width: 652, height: 600 });
    expect(graph.canvas.value).toBe(canvasBefore);
    expect(graph.layout.value).toBe(filled);
    graph.setCanvas(null);
    expect(graph.canvas.value).toBeNull();
    expect(graph.layout.value).not.toBe(filled);
  });

  it('uses the compact layout on mobile: no caption', () => {
    const desktop = build();
    expect(desktop.graph.layout.value?.caption).not.toBeNull();
    wrapper?.unmount();
    wrapper = null;
    const phone = build({ mobile: true });
    expect(phone.graph.layout.value?.caption).toBeNull();
  });

  it('startIdFor follows the start rule without a layout of that region', () => {
    const { graph, locations } = build();
    const asLayout = locations.map((l) => ({
      id: l.id,
      name: l.name,
      regionId: l.regionId,
      bindStone: l.bindStone,
      terrainType: l.terrainType,
    }));
    // region 2: the bind stone place (20) is drawn; region 1: the lowest id (10)
    expect(graph.startIdFor(2n)).toBe(20n);
    expect(graph.startIdFor(2n)).toBe(regionStartId(asLayout.filter((p) => p.id !== 21n), 2n));
    expect(graph.startIdFor(1n)).toBe(10n);
    expect(graph.startIdFor(9n)).toBeNull();
    expect(graph.layout.value?.regionId).toBe(1n);
  });
});

// One level-2 family at Lv 3 (place_rating: weight = level x band; Quiet up to 22, Risky up to 44):
// a Lv 4 viewer (gap -1, band 10) reads Quiet (20); a Lv 1 viewer (gap 2, band 16) reads Risky (32).
const GOBLINS_AT_11 = {
  id: 1n,
  regionId: 1n,
  locationId: 11n,
  kind: 'creature',
  refId: 1n,
  level: 2n,
  lvLo: 3n,
  lvHi: 3n,
  name: 'Goblins',
  iconKey: 'goblin',
  temperament: 'aggressive',
  singularNoun: 'goblin',
  pluralNoun: 'goblins',
  timeOfDay: 'any',
};

const rated = (over: Record<string, unknown> = {}) => ({
  poolLevels: ref([GOBLINS_AT_11]),
  poolsAppliedFor: (id: bigint) => id === 11n,
  ...over,
});

const nodeOf = (graph: MapGraph, id: bigint) => graph.views.value.find((view) => view.id === id)!;

describe('useMapGraph: the Map rates places from the pool rows (51.3.1.1-31)', () => {
  it('rates a place whose pool rows applied, for the character level', () => {
    const { graph } = build({ game: rated() });
    const node = nodeOf(graph, 11n);
    expect(node.rating.key).toBe('quiet');
    expect(node.rating.word).toBe('Quiet');
    expect(node.caption).toBe('Quiet · Lv 3');
    expect(node.levelColor).toBe('rate-quiet');
    expect(node.ariaLabel).toContain('level 3, quiet');
  });

  it('reads Unknown (no word) until the place rows apply, and the safe gate still reads Safe', () => {
    const { graph } = build({ game: rated({ poolsAppliedFor: () => false }) });
    expect(nodeOf(graph, 11n).rating.key).toBe('unknown');
    expect(nodeOf(graph, 11n).rating.word).toBe('');
    expect(nodeOf(graph, 10n).rating.word).toBe('Safe');
  });

  it('a living named enemy of yours at the place steps it up (D-34)', () => {
    const named = [{ id: 4n, characterId: 1n, locationId: 11n, enemyTemplateId: 9n, isAlive: true, name: 'Old Brannoc' }];
    const { graph } = build({ game: rated({ namedEnemies: ref(named) }) });
    expect(nodeOf(graph, 11n).rating.word).toBe('Risky');
  });

  it('rates for the lowest level of the party standing with you (D-56), and the legend names it', () => {
    const { graph } = build({
      game: rated({
        groupMembers: ref([{ id: 1n, groupId: 1n, characterId: 1n }, { id: 2n, groupId: 1n, characterId: 2n }]),
        knownCharacters: ref([
          { id: 1n, level: 4n, locationId: 10n, online: true },
          { id: 2n, level: 1n, locationId: 10n, online: true },
        ]),
      }),
    });
    expect(nodeOf(graph, 11n).rating.word).toBe('Risky');
    expect(graph.legendLevel.value).toBe(1);
  });

  it('an offline party member at your place does not lower the Map rating level (fightRoster, WR-02)', () => {
    const { graph } = build({
      game: rated({
        groupMembers: ref([{ id: 1n, groupId: 1n, characterId: 1n }, { id: 2n, groupId: 1n, characterId: 2n }]),
        knownCharacters: ref([
          { id: 1n, level: 4n, locationId: 10n, online: true },
          { id: 2n, level: 1n, locationId: 10n, online: false },
        ]),
      }),
    });
    expect(graph.legendLevel.value).toBe(4);
    expect(nodeOf(graph, 11n).rating.word).not.toBe('Risky');
  });

  it('the legend level is the character level solo, and the player level with no character', async () => {
    const { graph, character } = build({ game: rated() });
    expect(graph.legendLevel.value).toBe(4);
    character.value = null as unknown as Record<string, unknown>;
    await nextTick();
    expect(graph.legendLevel.value).toBe(graph.playerLevel.value);
    expect(graph.legendLevel.value).toBe(1);
  });

  it('re-rates when a place applies, without a new layout', async () => {
    const applied = ref(false);
    const { graph } = build({ game: rated({ poolsAppliedFor: (id: bigint) => applied.value && id === 11n }) });
    const layout = graph.layout.value;
    expect(nodeOf(graph, 11n).rating.key).toBe('unknown');
    applied.value = true;
    await nextTick();
    expect(nodeOf(graph, 11n).rating.word).toBe('Quiet');
    expect(graph.layout.value).toBe(layout);
  });

  it('calls useRatingLevel once at setup, outside the computeds, and leaves useShownRegion light', () => {
    const source = readFileSync(resolve(process.cwd(), 'src/map/useMapGraph.ts'), 'utf8');
    expect(source.split('useRatingLevel()').length - 1).toBe(1);
    const shown = source.slice(source.indexOf('export function useShownRegion'), source.indexOf('export function useMapGraph'));
    expect(shown).not.toContain('useMapRatingSource');
    expect(shown).not.toContain('poolLevels');
    expect(source).toMatch(/rating: rating\.value/);
  });
});
