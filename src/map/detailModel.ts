// The one model behind the Map's destination detail (desktop), the mobile dock and the rail notes
// (51-UI-SPEC "Destination detail", "Checklist" and "Travel button"). The components render what
// buildDetail and travelAction return and never decide on their own. Every string is plain text for
// a text node or a bound attribute (no HTML is built) and every colour is a CSS token.
//
// Rules are composed, never re-derived: travelChecks owns who travels, the cost and the blocking
// order; shortestPath and routeNote own the far-place route; placeDanger, regionChips, terrainOf,
// formatClock, aboutMinutes and trackedQuests own the rest. The button is a prediction; the server
// re-checks every trip and its refusal line is the truth.

import { BAND_COLOR, placeDanger } from './danger';
import type { PlaceDanger } from './danger';
import { regionChips } from './regionChips';
import type { RegionChip } from './regionChips';
import { routeNote, shortestPath } from './route';
import { terrainOf } from './terrain';
import type { TerrainInfo } from './terrain';
import { aboutMinutes, formatClock } from './travelTimer';
import type { TravelCheck, TravelChecks } from './travelChecks';
import { trackedQuests } from '../rails/quests';

export interface DetailLocation {
  id: bigint;
  name: string;
  description: string;
  regionId: bigint;
  terrainType: string;
  isSafe: boolean;
  levelOffset: bigint;
  bindStone: boolean;
  craftingAvailable: boolean;
}

export interface DetailRegion {
  id: bigint;
  name: string;
  dangerMultiplier: bigint;
}

export interface DetailQuestRow {
  id: bigint;
  characterId: bigint;
  questTemplateId: bigint;
  progress: bigint;
  completed: boolean;
  acceptedAt: { microsSinceUnixEpoch: bigint };
  completedAt?: { microsSinceUnixEpoch: bigint } | null;
}

export interface DetailQuestTemplate {
  id: bigint;
  name: string;
  requiredCount: bigint;
  description?: string | null;
  npcId: bigint;
  targetLocationId?: bigint | null;
  sourceLocationId?: bigint | null;
}

export type DetailKind = 'here' | 'neighbour' | 'far' | 'noPath';

export interface TravelAction {
  kind: 'travel' | 'cross' | 'firstStop' | 'none';
  /** The visible label; for a timer block the clock follows in timeText. */
  label: string;
  timeText: string | null;
  ariaLabel: string;
  title: string;
  icon: 'signpost' | 'door' | 'hourglass' | 'firstStop' | null;
  primary: boolean;
  disabled: boolean;
  describedBy: 'region' | 'stamina' | 'activity' | null;
  note: string;
  firstStopId: bigint | null;
}

export interface DetailTag {
  key: string;
  icon: 'terrain' | 'sword' | 'shield' | 'question' | 'castle' | 'hammer';
  text: string;
  color: string | null;
}

export interface DetailView {
  kind: DetailKind;
  kicker: string;
  title: string;
  regionLine: string;
  tags: DetailTag[];
  terrain: TerrainInfo;
  crossing: { from: string; to: string; levelText: string; levelColor: string } | null;
  description: string | null;
  descriptionExtra: string | null;
  trip: {
    stamina: string | null;
    regionTravel: {
      text: string;
      tone: 'neutral' | 'text' | 'wait';
      timeText: string | null;
      srText: string | null;
    } | null;
    services: { items: Array<'Vendor' | 'Banker'>; text: string | null };
    players: string;
  };
  quests: { key: string; name: string; progress: string; role: string }[];
  route: { steps: { id: bigint; name: string; crossingInto: string | null }[]; note: string } | null;
  checks: TravelCheck[] | null;
  action: TravelAction;
}

export interface BuildDetailInput {
  selected: bigint | null;
  current: bigint | null;
  locations: ReadonlyMap<bigint, DetailLocation>;
  regions: readonly DetailRegion[];
  visited: ReadonlySet<bigint>;
  heardOf: ReadonlySet<bigint>;
  adjacency: ReadonlyMap<bigint, readonly bigint[]>;
  playerLevel: number;
  selfId: bigint | null;
  boundLocationId: bigint | null;
  npcsAtSelected: readonly { npcType: string; locationId: bigint }[];
  charactersAtSelected: readonly { id: bigint; locationId: bigint }[];
  quests: readonly DetailQuestRow[];
  questTemplates: readonly DetailQuestTemplate[];
  giverNpcs: readonly { id: bigint; locationId: bigint }[];
  checks: TravelChecks | null;
  connected: boolean;
}

const NO_ACTION: TravelAction = {
  kind: 'none',
  label: '',
  timeText: null,
  ariaLabel: '',
  title: '',
  icon: null,
  primary: false,
  disabled: false,
  describedBy: null,
  note: '',
  firstStopId: null,
};

const FAR_NOTE = 'Not next to you. Walk there step by step, or use a teleport ability.';
const NO_PATH_NOTE = 'No known path from here.';
const PASSAGE_NOTE = 'This passage closes once nobody stands in it.';
const UNCHARTED_NOTE = 'Travelling here opens a new region.';

export interface TravelActionInput {
  kind: DetailKind;
  destination: { id: bigint; name: string; regionId: bigint; terrainType: string } | null;
  /** The neighbour is in another region (and is not an uncharted edge). */
  crossing: boolean;
  /** The destination's region name, for 'Cross into {Region}'. */
  regionName: string;
  checks: TravelChecks | null;
  /** The known path from your place, inclusive of both ends, or null. */
  path: readonly bigint[] | null;
  names: ReadonlyMap<bigint, string>;
  /** The live connection to the server; offline disables the button and drops the reason. */
  connected: boolean;
}

function followerPart(checks: TravelChecks | null): { count: number; member: boolean } {
  return { count: checks && checks.leading ? checks.followers.length : 0, member: checks !== null && checks.member };
}

function neighbourNote(input: TravelActionInput, terrainType: string): string {
  const { count, member } = followerPart(input.checks);
  if (terrainType === 'passage') return PASSAGE_NOTE;
  if (terrainType === 'uncharted') {
    if (count > 0) return `${UNCHARTED_NOTE} ${count} following.`;
    return member ? `${UNCHARTED_NOTE} Only you travel.` : UNCHARTED_NOTE;
  }
  if (count > 0) return `Arrive instantly · ${count} following`;
  return member ? 'Arrive instantly · only you travel' : 'Arrive instantly';
}

function neighbourAction(input: TravelActionInput): TravelAction {
  const destination = input.destination;
  if (destination === null) return NO_ACTION;
  const uncharted = destination.terrainType === 'uncharted';
  const cross = input.crossing && !uncharted;
  const baseLabel = cross ? `Cross into ${input.regionName}` : `Travel to ${destination.name}`;
  const baseIcon = cross ? 'door' : 'signpost';
  const base: TravelAction = {
    kind: cross ? 'cross' : 'travel',
    label: baseLabel,
    timeText: null,
    ariaLabel: baseLabel,
    title: baseLabel,
    icon: baseIcon,
    primary: true,
    disabled: !input.connected,
    describedBy: null,
    note: input.connected ? neighbourNote(input, destination.terrainType) : '',
    firstStopId: null,
  };

  const block = input.checks === null ? null : input.checks.block;
  if (block === null) return base;

  const blocked: TravelAction = { ...base, disabled: true, note: '' };
  switch (block.reason) {
    case 'gathering':
      return finishBlocked(blocked, 'Finish gathering first', 'activity', input.connected);
    case 'selfStamina':
    case 'followerStamina':
      return finishBlocked(blocked, 'Not enough stamina', 'stamina', input.connected);
    default: {
      const seconds = block.secondsLeft ?? 0;
      const clock = formatClock(seconds);
      return {
        ...finishBlocked(blocked, 'Region travel in', 'region', input.connected),
        timeText: clock,
        icon: 'hourglass',
        ariaLabel: `Region travel locked for ${aboutMinutes(seconds)}`,
        title: `Region travel in ${clock}`,
      };
    }
  }
}

function finishBlocked(
  action: TravelAction,
  label: string,
  describedBy: 'region' | 'stamina' | 'activity',
  connected: boolean,
): TravelAction {
  return { ...action, label, ariaLabel: label, title: label, describedBy: connected ? describedBy : null };
}

export function travelAction(input: TravelActionInput): TravelAction {
  if (input.kind === 'neighbour') return neighbourAction(input);
  if (input.kind === 'far' && input.path !== null && input.path.length >= 2) {
    const firstStopId = input.path[1];
    const label = `Select first stop: ${input.names.get(firstStopId) ?? 'Unknown place'}`;
    return {
      ...NO_ACTION,
      kind: 'firstStop',
      label,
      ariaLabel: label,
      title: label,
      icon: 'firstStop',
      note: FAR_NOTE,
      firstStopId,
    };
  }
  if (input.kind === 'here') return NO_ACTION;
  return { ...NO_ACTION, note: NO_PATH_NOTE };
}

const SAFE_COLOR = placeDanger({ terrainType: 'town', isSafe: true, regionId: 0n, levelOffset: 0n }, [], 1).color;

function emptyDetail(): DetailView {
  return {
    kind: 'here',
    kicker: '',
    title: '',
    regionLine: '',
    tags: [],
    terrain: terrainOf(''),
    crossing: null,
    description: null,
    descriptionExtra: null,
    trip: { stamina: null, regionTravel: null, services: { items: [], text: 'None' }, players: 'None' },
    quests: [],
    route: null,
    checks: null,
    action: NO_ACTION,
  };
}

function dangerTag(danger: PlaceDanger): DetailTag {
  if (danger.kind === 'safe') return { key: 'danger', icon: 'shield', text: 'Safe', color: danger.color };
  if (danger.kind === 'unknown') return { key: 'danger', icon: 'question', text: danger.word, color: danger.color };
  return { key: 'danger', icon: 'sword', text: `${danger.levelLabel} · ${danger.word}`, color: danger.color };
}

function tagsFor(place: DetailLocation, terrain: TerrainInfo, danger: PlaceDanger, bound: boolean): DetailTag[] {
  const tags: DetailTag[] = [{ key: 'terrain', icon: 'terrain', text: terrain.word, color: null }, dangerTag(danger)];
  if (bound) tags.push({ key: 'bind', icon: 'castle', text: 'Your bind point', color: 'var(--color-accent-300)' });
  else if (place.bindStone) tags.push({ key: 'bind', icon: 'castle', text: 'Bind stone', color: null });
  if (place.craftingAvailable) tags.push({ key: 'crafting', icon: 'hammer', text: 'Crafting', color: null });
  return tags;
}

function servicesFor(input: BuildDetailInput, placeId: bigint, unknown: boolean): DetailView['trip']['services'] {
  if (unknown) return { items: [], text: 'Unknown until you visit' };
  const here = input.npcsAtSelected.filter((n) => n.locationId === placeId);
  const items: Array<'Vendor' | 'Banker'> = [];
  if (here.some((n) => n.npcType === 'vendor')) items.push('Vendor');
  if (here.some((n) => n.npcType === 'banker')) items.push('Banker');
  return items.length > 0 ? { items, text: null } : { items, text: 'None' };
}

function playersFor(input: BuildDetailInput, placeId: bigint): string {
  // Offline characters count until the online status of Phase 51.1 exists.
  const count = input.charactersAtSelected.filter((c) => c.locationId === placeId && c.id !== input.selfId).length;
  return count === 0 ? 'None' : String(count);
}

function questsFor(input: BuildDetailInput, placeId: bigint): DetailView['quests'] {
  const templates = new Map<bigint, DetailQuestTemplate>();
  for (const template of input.questTemplates) templates.set(template.id, template);
  const templateOf = new Map<bigint, bigint>();
  for (const quest of input.quests) templateOf.set(quest.id, quest.questTemplateId);

  const out: DetailView['quests'] = [];
  for (const tracked of trackedQuests(input.quests, input.questTemplates, input.selfId)) {
    const template = templates.get(templateOf.get(tracked.id) as bigint);
    if (!template) continue;
    const roles: string[] = [];
    if (input.giverNpcs.some((n) => n.id === template.npcId && n.locationId === placeId)) roles.push('Giver here');
    if (template.targetLocationId != null && template.targetLocationId === placeId) roles.push('Goal here');
    if (template.sourceLocationId != null && template.sourceLocationId === placeId) roles.push('Pick up here');
    if (roles.length === 0) continue;
    out.push({ key: `quest-${tracked.id}`, name: tracked.name, progress: tracked.countText, role: roles.join(' · ') });
  }
  return out;
}

function kindOf(input: BuildDetailInput, placeId: bigint): { kind: DetailKind; path: bigint[] | null } {
  if (placeId === input.current) return { kind: 'here', path: null };
  if (input.current === null) return { kind: 'noPath', path: null };
  if ((input.adjacency.get(input.current) ?? []).includes(placeId)) return { kind: 'neighbour', path: null };
  const path = shortestPath(input.adjacency, input.current, placeId);
  return path === null ? { kind: 'noPath', path: null } : { kind: 'far', path };
}

function regionTravelRow(checks: TravelChecks | null, crossing: boolean): NonNullable<DetailView['trip']['regionTravel']> {
  if (!crossing) return { text: 'None within a region', tone: 'neutral', timeText: null, srText: null };
  const wait = checks === null ? undefined : checks.checks.find((c) => c.key === 'region' && c.status === 'wait');
  if (wait === undefined || wait.secondsLeft === null) {
    return { text: 'Starts the region travel timer', tone: 'text', timeText: null, srText: null };
  }
  const clock = formatClock(wait.secondsLeft);
  return {
    text: `Blocked · ${clock} left`,
    tone: 'wait',
    timeText: clock,
    srText: `Region travel ready in ${aboutMinutes(wait.secondsLeft)}`,
  };
}

function routeFor(input: BuildDetailInput, path: readonly bigint[]): NonNullable<DetailView['route']> {
  const regionName = (id: bigint): string => input.regions.find((r) => r.id === id)?.name ?? 'Unknown region';
  const steps = path.map((id, index) => {
    const here = input.locations.get(id);
    const before = index === 0 ? undefined : input.locations.get(path[index - 1]);
    const crossingInto = here && before && here.regionId !== before.regionId ? regionName(here.regionId) : null;
    return { id, name: here ? here.name : 'Unknown place', crossingInto };
  });
  return { steps, note: routeNote(path, [...input.locations.values()], input.regions) };
}

/** The region's chip (level label and band) over the places you know; Safe when it has no range. */
function regionChipOf(
  known: readonly DetailLocation[],
  regions: readonly DetailRegion[],
  regionId: bigint,
  playerLevel: number,
): Pick<RegionChip, 'levelLabel' | 'band'> {
  const chips = regionChips({ drawn: known, regions, currentRegionId: regionId, shownRegionId: regionId, playerLevel });
  const chip = chips.find((c) => c.regionId === regionId);
  return chip ? { levelLabel: chip.levelLabel, band: chip.band } : { levelLabel: 'Safe', band: null };
}

export function buildDetail(input: BuildDetailInput): DetailView {
  const placeId = input.selected !== null && input.locations.has(input.selected) ? input.selected : input.current;
  const place = placeId === null ? undefined : input.locations.get(placeId);
  if (place === undefined) return emptyDetail();

  const { kind, path } = kindOf(input, place.id);
  const current = input.current === null ? undefined : input.locations.get(input.current);
  const regionName = (id: bigint): string => input.regions.find((r) => r.id === id)?.name ?? 'Unknown region';
  const isVisited = kind === 'here' || input.visited.has(place.id);
  const terrain = terrainOf(place.terrainType);
  const danger = placeDanger(place, input.regions, input.playerLevel);
  const uncharted = place.terrainType === 'uncharted';

  const known = [...input.locations.values()].filter(
    (l) => input.visited.has(l.id) || input.heardOf.has(l.id) || l.id === place.id || l.id === input.current,
  );
  const chip = regionChipOf(known, input.regions, place.regionId, input.playerLevel);
  const levelColor = chip.band === null ? SAFE_COLOR : BAND_COLOR[chip.band];

  const crossing = kind === 'neighbour' && !uncharted && current !== undefined && current.regionId !== place.regionId;

  const description = place.description.trim().length > 0 ? place.description.trim() : null;
  let descriptionExtra: string | null = null;
  if (uncharted && description === null) descriptionExtra = 'Nobody has been here yet.';
  else if (!isVisited) descriptionExtra = "You've heard of this place but haven't been there.";

  const neighbour = kind === 'neighbour';
  const names = new Map<bigint, string>();
  for (const [id, location] of input.locations) names.set(id, location.name);

  return {
    kind,
    kicker: kind === 'here' ? 'You are here' : 'Destination',
    title: place.name,
    regionLine: `${regionName(place.regionId)} · ${chip.levelLabel} · ${isVisited ? 'visited' : 'heard of'}`,
    tags: tagsFor(place, terrain, danger, input.boundLocationId === place.id),
    terrain,
    crossing:
      crossing && current !== undefined
        ? { from: regionName(current.regionId), to: regionName(place.regionId), levelText: chip.levelLabel, levelColor }
        : null,
    description,
    descriptionExtra,
    trip: {
      stamina: neighbour && input.checks !== null ? input.checks.costText : null,
      regionTravel: neighbour ? regionTravelRow(input.checks, crossing) : null,
      services: servicesFor(input, place.id, !isVisited),
      players: playersFor(input, place.id),
    },
    quests: questsFor(input, place.id),
    route: kind === 'far' && path !== null ? routeFor(input, path) : null,
    checks: neighbour && input.checks !== null ? input.checks.checks : null,
    action: travelAction({
      kind,
      destination: place,
      crossing,
      regionName: regionName(place.regionId),
      checks: neighbour ? input.checks : null,
      path,
      names,
      connected: input.connected,
    }),
  };
}
