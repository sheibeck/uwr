// Node, route and gate views for the Map (51-UI-SPEC "Node states", "Graph keyboard and
// screen-reader equivalent", "Gate pills" and "Route"). The components of plans 51-08, 51-09 and
// 51-11 only render what these functions return: every string is plain text for a text node or a
// bound attribute (no HTML is ever built), and every colour is a CSS token or a scoped class.
//
// Level math is never re-derived here: ratingForPlace (the rails' one rating model, 51.3.1.1 D-42),
// placeDanger (region chips and gate pills keep the band, B9), terrainOf, formatClock and
// aboutMinutes own it.

import { ratingLevelRange } from '@game-data/place_rating';
import { BAND_WORD, BAND_COLOR, placeDanger } from './danger';
import { ratingClass, ratingForPlace } from '../rails/rating';
import type { PlaceRatingView, RatingKey, RatingPool } from '../rails/rating';
import type { GraphLayout, LabelBox, LayoutGate } from './graphLayout';
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

/** The rating tokens (UI-SPEC "Rating colours"); the scoped rate-* classes map to the same five. */
export const RATE_COLOR: Record<RatingKey, string> = {
  safe: 'var(--color-con-light-green)',
  quiet: 'var(--color-con-blue)',
  risky: 'var(--color-con-yellow)',
  deadly: 'var(--color-con-red)',
  unknown: 'var(--color-neutral-500)',
};

/** A pool_level row the Map reads: the public density of one family or resource at one place. */
export interface MapPool extends RatingPool {
  locationId: bigint;
}

/**
 * What the Map rates places from (the exits' inputs, Plan 20): the pool_level rows of the loaded
 * regions, game.poolsAppliedFor, the viewer's rating level (useRatingLevel, the party's lowest) and
 * the D-34 step (bossOrNamedAt). Required on every caller (review C IN-01): a place whose rows have
 * not applied is Unknown (never guessed) and a safe place still reads Safe.
 */
export interface MapRatingSource {
  pools: readonly MapPool[];
  poolsApplied: (locationId: bigint) => boolean;
  ratingLevel: bigint | null;
  bossOrNamed: (locationId: bigint) => boolean;
}

export interface MapPlaceRating {
  view: PlaceRatingView;
  /** The creature level range of the place (wiped families included), null with no family. */
  range: { lo: bigint; hi: bigint } | null;
}

function poolsByPlace(source: MapRatingSource): Map<bigint, MapPool[]> {
  const byPlace = new Map<bigint, MapPool[]>();
  for (const pool of source.pools) {
    const list = byPlace.get(pool.locationId);
    if (list === undefined) byPlace.set(pool.locationId, [pool]);
    else list.push(pool);
  }
  return byPlace;
}

function ratePlace(
  place: { id: bigint; isSafe: boolean; terrainType: string },
  source: MapRatingSource,
  poolsHere: readonly MapPool[],
): MapPlaceRating {
  const view = ratingForPlace({
    location: { isSafe: place.isSafe, terrainType: place.terrainType },
    poolsHere,
    ready: source.poolsApplied(place.id),
    playerLevel: source.ratingLevel,
    bossOrNamedHere: source.bossOrNamed(place.id),
  });
  const families = poolsHere.filter((pool) => pool.kind === 'creature');
  const range = view.key === 'safe' || view.levelLabel === '' ? null : ratingLevelRange(families);
  return { view, range };
}

/** The rating of one place for the Map and the destination detail (the same rule as the rails). */
export function mapPlaceRating(
  place: { id: bigint; isSafe: boolean; terrainType: string },
  source: MapRatingSource,
): MapPlaceRating {
  return ratePlace(place, source, poolsByPlace(source).get(place.id) ?? []);
}

/** 'Risky · Lv 4–5', the word alone with no family, the range alone while Unknown, '' for safe. */
export function ratingCaption(view: PlaceRatingView): string {
  if (view.key === 'safe') return '';
  if (view.key === 'unknown') return view.levelLabel;
  return view.levelLabel === '' ? view.word : `${view.word} · ${view.levelLabel}`;
}

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
  /** The place's rating for the viewer (only the key and word are spoken). */
  rating: { key: RatingKey; word: string };
  /** The creature level range, spoken unless the place is safe; null with no family known. */
  range: { lo: bigint; hi: bigint } | null;
  /** Steps from your place, or null when no known path exists. */
  steps: number | null;
}

/**
 * '{name}, {here | visited | heard of}{, other region {Region}}{, uncharted}{, passage}{, bind point}
 * {, bind stone}{, crafting}{, safe | , level {a} to {b}, {rating word}}' then the steps part. An
 * Unknown place (rows not applied) speaks its range with no word; an uncharted one speaks neither.
 */
export function nodeAriaLabel(parts: NodeAriaParts): string {
  let label = `${parts.name}, ${parts.stateWord}`;
  if (parts.otherRegion) label += `, other region ${parts.regionName}`;
  if (parts.uncharted) label += ', uncharted';
  if (parts.passage) label += ', passage';
  if (parts.bindPoint) label += ', bind point';
  if (parts.bindStone) label += ', bind stone';
  if (parts.crafting) label += ', crafting';

  const { rating, range } = parts;
  if (rating.key === 'safe') {
    label += ', safe';
  } else if (!parts.uncharted) {
    if (range !== null) label += range.lo === range.hi ? `, level ${range.lo}` : `, level ${range.lo} to ${range.hi}`;
    if (rating.key !== 'unknown' && rating.word !== '') label += `, ${rating.word.toLowerCase()}`;
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
  /** The safety rating for the viewer (ratingForPlace; Unknown until the place's rows apply). */
  rating: PlaceRatingView;
  terrain: TerrainInfo;
  stateWord: StateWord;
  /** '{Region} · ' for another region's place, else ''. */
  subPrefix: string;
  /** ' · you', ' · heard of' or ''. */
  subState: string;
  /** 'Lv a–b', 'Lv n', 'Safe', or '' (uncharted, no family, or no rows known). */
  levelLabel: string;
  /** The scoped rating class for the ring and the caption: 'rate-safe' ... 'rate-unknown'. */
  levelColor: string;
  /** The caption beside the name: 'Risky · Lv 4–5', the range alone while Unknown, '' for safe. */
  caption: string;
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
  steps: ReadonlyMap<bigint, number>;
  /** The pool rows the places are rated from (the rating level is `rating.ratingLevel`). */
  rating: MapRatingSource;
}

export function nodeViews(input: NodeViewsInput): NodeView[] {
  const views: NodeView[] = [];
  const pools = poolsByPlace(input.rating);
  for (const node of input.layout.nodes) {
    const place = input.places.get(node.id);
    if (!place) continue;

    const isHere = input.currentLocationId !== null && node.id === input.currentLocationId;
    const isSelected = input.selectedId !== null && node.id === input.selectedId;
    const isVisited = input.visited.has(node.id);
    const stateWord: StateWord = isHere ? 'here' : isVisited ? 'visited' : 'heard of';
    const circle: NodeCircle = isHere ? 'here' : isSelected ? 'selected' : isVisited ? 'visited' : 'heardOf';

    const { view: rating, range } = ratePlace(place, input.rating, pools.get(place.id) ?? []);
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
      safe: rating.key === 'safe',
      rating,
      terrain: terrainOf(place.terrainType),
      stateWord,
      subPrefix: otherRegion ? `${regionName} · ` : '',
      subState: isHere ? ' · you' : stateWord === 'heard of' ? ' · heard of' : '',
      levelLabel: rating.key === 'safe' ? 'Safe' : rating.levelLabel,
      levelColor: ratingClass(rating.key),
      caption: ratingCaption(rating),
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
        rating,
        range,
        steps,
      }),
      pressed: isSelected,
    });
  }
  return views;
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
