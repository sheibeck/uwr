// Node, list row, route and gate views for the Map (51-UI-SPEC "Node states", "Graph keyboard and
// screen-reader equivalent", "Gate pills" and "Route"). The components of plans 51-08, 51-09 and
// 51-11 only render what these functions return: every string is plain text for a text node or a
// bound attribute (no HTML is ever built), and every colour is a CSS token from danger.ts.
//
// Level math is never re-derived here: placeDanger, terrainOf, formatClock and aboutMinutes own it.

import { BAND_WORD, BAND_COLOR, placeDanger } from './danger';
import type { PlaceDanger } from './danger';
import { compareReading } from './graphLayout';
import type { GraphLayout, LabelBox, LayoutGate } from './graphLayout';
import { compareBigint, compareNames } from './order';
import type { RegionChip } from './regionChips';
import { terrainOf } from './terrain';
import type { TerrainInfo } from './terrain';
import { aboutMinutes, formatClock } from './travelTimer';

/** The location fields the Map reads (a subset of the generated Location row). */
export interface NodePlace {
  id: bigint;
  name: string;
  regionId: bigint;
  terrainType: string;
  isSafe: boolean;
  levelOffset: bigint;
  bindStone: boolean;
  craftingAvailable: boolean;
}

export interface NodeRegion {
  id: bigint;
  name: string;
  dangerMultiplier: bigint;
}

export type NodeCircle = 'here' | 'selected' | 'visited' | 'heardOf';
export type StateWord = 'here' | 'visited' | 'heard of';

const SAFE_COLOR = placeDanger({ terrainType: 'town', isSafe: true, regionId: 0n, levelOffset: 0n }, [], 1).color;
const UNKNOWN_COLOR = placeDanger({ terrainType: 'uncharted', isSafe: true, regionId: 0n, levelOffset: 0n }, [], 1).color;

function regionNameOf(regions: readonly NodeRegion[], id: bigint): string {
  const region = regions.find((r) => r.id === id);
  return region ? region.name : 'Unknown region';
}

export interface NodeAriaParts {
  name: string;
  stateWord: StateWord;
  otherRegion: boolean;
  regionName: string;
  uncharted: boolean;
  passage: boolean;
  bindPoint: boolean;
  bindStone: boolean;
  crafting: boolean;
  danger: PlaceDanger;
  /** Steps from your place, or null when no known path exists. */
  steps: number | null;
}

/**
 * '{name}, {here | visited | heard of}{, other region {Region}}{, uncharted}{, passage}{, bind point}
 * {, bind stone}{, crafting}{, safe | , level {a} to {b}, {band}}' then the steps part.
 */
export function nodeAriaLabel(parts: NodeAriaParts): string {
  let label = `${parts.name}, ${parts.stateWord}`;
  if (parts.otherRegion) label += `, other region ${parts.regionName}`;
  if (parts.uncharted) label += ', uncharted';
  if (parts.passage) label += ', passage';
  if (parts.bindPoint) label += ', bind point';
  if (parts.bindStone) label += ', bind stone';
  if (parts.crafting) label += ', crafting';

  const { danger } = parts;
  if (danger.kind === 'safe') {
    label += ', safe';
  } else if (danger.kind === 'band' && danger.lo !== null && danger.hi !== null && danger.band !== null) {
    label += danger.lo === danger.hi ? `, level ${danger.lo}` : `, level ${danger.lo} to ${danger.hi}`;
    label += `, ${BAND_WORD[danger.band]}`;
  }

  if (parts.stateWord === 'here') label += ', you are here';
  else if (parts.steps === null) label += ', no known path';
  else label += parts.steps === 1 ? ', 1 step from here' : `, ${parts.steps} steps from here`;
  return label;
}

export interface NodeView {
  id: bigint;
  x: number;
  y: number;
  name: string;
  /** The full name for the title attribute (the label ellipsizes at 144px). */
  title: string;
  circle: NodeCircle;
  size: 32 | 24;
  hit: { desktop: 32; mobile: 44 };
  uncharted: boolean;
  passage: boolean;
  otherRegion: boolean;
  regionName: string;
  bindPoint: boolean;
  bindStone: boolean;
  crafting: boolean;
  safe: boolean;
  danger: PlaceDanger;
  terrain: TerrainInfo;
  stateWord: StateWord;
  /** '{Region} · ' for another region's place, else ''. */
  subPrefix: string;
  /** ' · you', ' · heard of' or ''. */
  subState: string;
  /** 'Lv a–b', 'Safe' or '' (uncharted). */
  levelLabel: string;
  levelColor: string;
  /** The label box the layout placed for this node (top-left, size, text alignment). */
  label: LabelBox;
  /** Steps from your place; null when no known path exists. */
  steps: number | null;
  ariaLabel: string;
  pressed: boolean;
}

export interface NodeViewsInput {
  layout: GraphLayout;
  places: ReadonlyMap<bigint, NodePlace>;
  regions: readonly NodeRegion[];
  visited: ReadonlySet<bigint>;
  /** Accepted for the callers' convenience: anything that is not visited reads 'heard of'. */
  heardOf: ReadonlySet<bigint>;
  currentLocationId: bigint | null;
  selectedId: bigint | null;
  boundLocationId: bigint | null;
  playerLevel: number;
  steps: ReadonlyMap<bigint, number>;
}

export function nodeViews(input: NodeViewsInput): NodeView[] {
  const views: NodeView[] = [];
  for (const node of input.layout.nodes) {
    const place = input.places.get(node.id);
    if (!place) continue;

    const isHere = input.currentLocationId !== null && node.id === input.currentLocationId;
    const isSelected = input.selectedId !== null && node.id === input.selectedId;
    const isVisited = input.visited.has(node.id);
    const stateWord: StateWord = isHere ? 'here' : isVisited ? 'visited' : 'heard of';
    const circle: NodeCircle = isHere ? 'here' : isSelected ? 'selected' : isVisited ? 'visited' : 'heardOf';

    const danger = placeDanger(place, input.regions, input.playerLevel);
    const otherRegion = place.regionId !== input.layout.regionId;
    const regionName = regionNameOf(input.regions, place.regionId);
    const bindPoint = input.boundLocationId !== null && input.boundLocationId === node.id;
    const bindStone = place.bindStone && !bindPoint;
    const uncharted = place.terrainType === 'uncharted';
    const passage = place.terrainType === 'passage';
    const steps = isHere ? 0 : (input.steps.get(node.id) ?? null);

    views.push({
      id: node.id,
      x: node.x,
      y: node.y,
      name: place.name,
      title: place.name,
      circle,
      size: isHere ? 32 : 24,
      hit: { desktop: 32, mobile: 44 },
      uncharted,
      passage,
      otherRegion,
      regionName,
      bindPoint,
      bindStone,
      crafting: place.craftingAvailable,
      safe: danger.kind === 'safe',
      danger,
      terrain: terrainOf(place.terrainType),
      stateWord,
      subPrefix: otherRegion ? `${regionName} · ` : '',
      subState: isHere ? ' · you' : stateWord === 'heard of' ? ' · heard of' : '',
      levelLabel: danger.levelLabel,
      levelColor: danger.color,
      label: node.label,
      steps,
      ariaLabel: nodeAriaLabel({
        name: place.name,
        stateWord,
        otherRegion,
        regionName,
        uncharted,
        passage,
        bindPoint,
        bindStone,
        crafting: place.craftingAvailable,
        danger,
        steps,
      }),
      pressed: isSelected,
    });
  }
  return views;
}

export interface ListRow {
  id: bigint;
  name: string;
  stateWord: StateWord;
  /** 'Lv a–b', 'Safe', 'Danger unknown'. */
  levelText: string;
  /** easy, even, tough or deadly; '' for safe and unknown places. */
  bandWord: string;
  /** 'Here', '1 step', '{n} steps' or 'No known path'. */
  stepsText: string;
  /** 'Connects to {A}, {B}' with crossings as '{place} ({Region})'; null with no known connection. */
  connectsTo: string | null;
  selected: boolean;
}

function stepsText(view: NodeView): string {
  if (view.stateWord === 'here') return 'Here';
  if (view.steps === null) return 'No known path';
  return view.steps === 1 ? '1 step' : `${view.steps} steps`;
}

export function listRows(input: {
  views: readonly NodeView[];
  adjacency: ReadonlyMap<bigint, readonly bigint[]>;
  places: ReadonlyMap<bigint, NodePlace>;
  regions: readonly NodeRegion[];
  shownRegionId: bigint;
}): ListRow[] {
  // the layout's reading order (top to bottom, then left to right), shared with the graph and End
  const ordered = [...input.views].sort(compareReading);
  return ordered.map((view) => {
    const neighbours: NodePlace[] = [];
    for (const id of input.adjacency.get(view.id) ?? []) {
      const place = input.places.get(id);
      if (place && !neighbours.some((n) => n.id === id)) neighbours.push(place);
    }
    neighbours.sort((a, b) => compareNames(a.name, b.name) || compareBigint(a.id, b.id));
    const names = neighbours.map((n) =>
      n.regionId === input.shownRegionId ? n.name : `${n.name} (${regionNameOf(input.regions, n.regionId)})`,
    );
    return {
      id: view.id,
      name: view.name,
      stateWord: view.stateWord,
      levelText: view.danger.kind === 'unknown' ? view.danger.word : view.levelLabel,
      bandWord: view.danger.kind === 'band' && view.danger.band !== null ? BAND_WORD[view.danger.band] : '',
      stepsText: stepsText(view),
      connectsTo: names.length === 0 ? null : `Connects to ${names.join(', ')}`,
      selected: view.pressed,
    };
  });
}

/**
 * One SVG points string per run of consecutive path places that are both nodes of the layout. A
 * place that is not a node (another region that is not shown) breaks the run, so a route into the
 * shown region starts at the border node where the path enters.
 */
export function routePolylines(layout: GraphLayout, path: readonly bigint[] | null): string[] {
  if (path === null) return [];
  const centre = new Map<bigint, string>();
  for (const node of layout.nodes) centre.set(node.id, `${node.x},${node.y}`);

  const lines: string[] = [];
  let run: string[] = [];
  const flush = (): void => {
    if (run.length >= 2) lines.push(run.join(' '));
    run = [];
  };
  for (const id of path) {
    const point = centre.get(id);
    if (point === undefined) flush();
    else run.push(point);
  }
  flush();
  return lines;
}

export interface GateView {
  key: string;
  farId: bigint;
  /** 'To {Region}' on desktop while open, else the region name. */
  text: string;
  /** 'Lv a–b' or 'Safe' (a warning colour only, never a lock); '' without a region chip. */
  levelText: string;
  levelColor: string;
  locked: boolean;
  /** 'm:ss' while the region timer runs, else ''. */
  timeText: string;
  ariaLabel: string;
}

export function gateView(
  gate: LayoutGate,
  chip: RegionChip | undefined,
  regionName: string,
  timer: { running: boolean; secondsLeft: number },
  mobile: boolean,
): GateView {
  const levelText = chip ? chip.levelLabel : '';
  const levelColor = !chip
    ? UNKNOWN_COLOR
    : chip.range === null
      ? SAFE_COLOR
      : chip.band !== null
        ? BAND_COLOR[chip.band]
        : UNKNOWN_COLOR;

  let ariaLabel = `To ${regionName}`;
  if (levelText !== '') ariaLabel += `, ${levelText}`;
  if (chip && chip.band !== null && chip.range !== null) ariaLabel += `, ${BAND_WORD[chip.band]}`;
  // ', region travel locked for about {n} minutes' (aboutMinutes supplies 'about {n} minutes')
  if (timer.running) ariaLabel += `, region travel locked for ${aboutMinutes(timer.secondsLeft)}`;

  return {
    key: gate.key,
    farId: gate.farId,
    text: mobile || timer.running ? regionName : `To ${regionName}`,
    levelText,
    levelColor,
    locked: timer.running,
    timeText: timer.running ? formatClock(timer.secondsLeft) : '',
    ariaLabel,
  };
}
