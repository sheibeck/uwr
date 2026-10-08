// density_lines.ts
// Every player-facing density string of Phase 51.3.1.1, as rule-based templates and builders (D-06, D-44).
//
// Every string here is PROPOSED (D-58) until the owner's one wording review before the phase closes.
// Plan 27 lists these constants and builders in 51.3.1.1-COPY-REVIEW.md; change wording only here.
//
// Shared copy: the client imports it through `@game-data/density_lines` (Nearby, Here card, exits,
// encounter panel); the server uses it for look text, feed lines, World event names and rumour items.
//
// Pronoun rule (UI-SPEC Shared rules): no density, ambush, feed or World event line uses a pronoun for
// a creature; the lines use nouns (plural, singular, place). Template variables are named plural,
// singular, place and resource so the repository pronoun guard can read them.
//
// Pure module: plain string building only (names are AI text cleaned upstream and rendered as text nodes).

import type { DensityLevel } from './density_rules';
import type { FamilyTemperament } from './mechanical_vocabulary';
import type { RatingKey } from './place_rating';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** A density level as a 0..3 index; anything below 1 is 0, anything above 3 is 3. */
function levelIndex(level: number | bigint): DensityLevel {
  const n = Math.floor(Number(level));
  if (!(n >= 1)) return 0;
  return n >= 3 ? 3 : (n as DensityLevel);
}

/** Capitalizes the first letter only. */
export function sentenceCase(s: string): string {
  if (!s) return '';
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/** Fills {Token} placeholders in one pass; a value is never re-expanded. */
function fill(template: string, tokens: Record<string, string>): string {
  return template.replace(/\{(\w+)\}/g, (whole, key: string) => (key in tokens ? tokens[key]! : whole));
}

// ---------------------------------------------------------------------------
// Level words (PROPOSED, D-58)
// ---------------------------------------------------------------------------

/** Creature density words by level 0..3. */
export const CREATURE_DENSITY_WORDS = ['Wiped out', 'Scarce', 'Stable', 'Overrun'] as const;
/** Resource density words by level 0..3. */
export const RESOURCE_DENSITY_WORDS = ['Exhausted', 'Sparse', 'Plentiful', 'Abundant'] as const;
/** Screen-reader prefixes for the density badge. */
export const DENSITY_SR_PREFIX = { creature: 'Population: ', resource: 'Supply: ' } as const;

/** The density word of a pool kind at a level. */
export function densityWord(kind: 'creature' | 'resource', level: number | bigint): string {
  const i = levelIndex(level);
  return kind === 'creature' ? CREATURE_DENSITY_WORDS[i] : RESOURCE_DENSITY_WORDS[i];
}

// ---------------------------------------------------------------------------
// Number words (feed lines show one to four, never digits; D-05)
// ---------------------------------------------------------------------------

export const NUMBER_WORDS = ['one', 'two', 'three', 'four'] as const;

/** 'one'..'four'; a group larger than four reads 'several'. */
export function numberWord(n: number | bigint): string {
  const v = Math.floor(Number(n));
  if (!(v >= 1)) return NUMBER_WORDS[0];
  return NUMBER_WORDS[v - 1] ?? 'several';
}

export function capitalNumberWord(n: number | bigint): string {
  return sentenceCase(numberWord(n));
}

function isOne(n: number | bigint): boolean {
  return Math.floor(Number(n)) <= 1;
}

// ---------------------------------------------------------------------------
// Place nouns (PROPOSED, D-58)
// ---------------------------------------------------------------------------

export const PLACE_NOUN_BY_TERRAIN: Record<string, string> = {
  mountains: 'the slopes',
  woods: 'the woods',
  plains: 'the fields',
  swamp: 'the marsh',
  dungeon: 'the depths',
  town: 'the streets',
  city: 'the streets',
  coastal: 'the shore',
};

export const DEFAULT_PLACE_NOUN = 'the area';

/** The place noun phrase: a non-empty placeNoun wins, then the terrain noun, then 'the area'. */
export function placeNounFor(location: { placeNoun?: string; terrainType?: string }): string {
  const own = (location.placeNoun ?? '').trim();
  if (own) return own;
  const terrain = (location.terrainType ?? '').trim().toLowerCase();
  return PLACE_NOUN_BY_TERRAIN[terrain] ?? DEFAULT_PLACE_NOUN;
}

function placeOrDefault(place: string): string {
  return place.trim() || DEFAULT_PLACE_NOUN;
}

// ---------------------------------------------------------------------------
// Density line templates (UI-SPEC Density Line Templates; PROPOSED, D-58)
// ---------------------------------------------------------------------------

/**
 * Creature lines by temperament, index = level 0..3. One deliberate change from the UI-SPEC table, to keep
 * its own pronoun rule: the Overrun aggressive line ends "every last {singular} has noticed you."
 */
export const CREATURE_LINES: Record<FamilyTemperament, readonly [string, string, string, string]> = {
  aggressive: [
    'No {plural} are left in {place}. The quiet feels borrowed.',
    'A few {plural} still prowl {place}, thinned out and short-tempered.',
    '{Plural} patrol {place}, in no hurry to be anywhere else.',
    '{Plural} swarm {place}, and every last {singular} has noticed you.',
  ],
  wary: [
    'The {plural} are gone from {place}.',
    'A few {plural} linger in {place}, watching you nervously.',
    '{Plural} keep to {place}, watching you from a distance.',
    '{Plural} crowd {place}, watching every way in and out.',
  ],
  skittish: [
    'Not one {singular} stirs in {place}.',
    "You catch sight of one {singular} in {place}. Then you don't.",
    '{Plural} dart about {place}, never still for long.',
    '{Plural} boil out of every crack in {place}, jumpy and everywhere.',
  ],
};

/** Resource lines, index = level 0..3. */
export const RESOURCE_LINES = [
  'There is no {resource} left in {place}, for now.',
  'Only scraps of {resource} are left in {place}.',
  '{Resource} turns up readily in {place}.',
  '{Resource} lies thick across {place}.',
] as const;

/** The rating lines (Here card, exits); an unknown rating has none. */
export const RATING_LINES: Record<RatingKey, string> = {
  safe: 'Nothing here will hurt you.',
  quiet: 'Something lives here, but it keeps to itself.',
  risky: 'Watch the edges. Things here will come for you.',
  deadly: 'You should not be here alone. You are not alone.',
  unknown: '',
};

/** Group-size hints by creature level (D-31); a wiped-out family shows none. */
export const GROUP_HINTS = ['', 'Expect one, alone', 'Expect one or two', 'Expect a crowd'] as const;

export function creatureLine(args: {
  plural: string;
  singular: string;
  temperament: string;
  level: number | bigint;
  place: string;
}): string {
  const row =
    args.temperament in CREATURE_LINES ? CREATURE_LINES[args.temperament as FamilyTemperament] : CREATURE_LINES.wary;
  const plural = args.plural.toLowerCase();
  return fill(row[levelIndex(args.level)], {
    Plural: sentenceCase(plural),
    plural,
    singular: args.singular.toLowerCase(),
    place: placeOrDefault(args.place),
  });
}

export function resourceLine(args: { resource: string; level: number | bigint; place: string }): string {
  return fill(RESOURCE_LINES[levelIndex(args.level)], {
    Resource: sentenceCase(args.resource),
    resource: args.resource.toLowerCase(),
    place: placeOrDefault(args.place),
  });
}

export function ratingLine(key: RatingKey): string {
  return RATING_LINES[key] ?? '';
}

export function groupHint(level: number | bigint): string {
  return GROUP_HINTS[levelIndex(level)];
}

// ---------------------------------------------------------------------------
// Feed lines (UI-SPEC Copywriting Contract and Feed Contract; PROPOSED, D-58)
// ---------------------------------------------------------------------------

const FALLBACK_AMBUSH = { one: 'bursts', many: 'burst', rest: 'out of the dark' } as const;

/**
 * The family's ambush verb, inflected (UI-SPEC ambush grammar). A plain regular verb (3-12 lowercase
 * letters, not ending in s, x, z, ch, sh, o or y) adds s for one creature; anything else falls back to
 * burst / bursts out of the dark.
 */
export function ambushVerbForms(verb: string, rest: string): { one: string; many: string; rest: string } {
  const v = verb.trim();
  const regular = /^[a-z]{3,12}$/.test(v) && !/(s|x|z|ch|sh|o|y)$/.test(v);
  if (!regular) return { ...FALLBACK_AMBUSH };
  return { one: `${v}s`, many: v, rest: rest.trim() };
}

export type AmbushLinePhase = 'enter' | 'leave' | 'gather' | 'other';

function ambushLeadIn(phase: AmbushLinePhase, party: boolean, placeName: string, resource: string): string {
  switch (phase) {
    case 'enter':
      return party ? `As your party crosses into ${placeName}, ` : `As you cross into ${placeName}, `;
    case 'leave':
      return party ? `As your party tries to leave ${placeName}, ` : `As you try to leave ${placeName}, `;
    case 'gather':
      return resource ? `While you gather ${resource.toLowerCase()}, ` : 'While you gather, ';
    default:
      return 'Before you can move on, ';
  }
}

/** The ambush block line: lead-in, then `{count} {noun} {verb} {rest}!` (the only lines with "!"). */
export function ambushLine(args: {
  phase: AmbushLinePhase;
  party: boolean;
  placeName: string;
  resource?: string;
  count: number | bigint;
  singular: string;
  plural: string;
  verb: string;
  rest: string;
}): string {
  const forms = ambushVerbForms(args.verb, args.rest);
  const one = isOne(args.count);
  const noun = (one ? args.singular : args.plural).toLowerCase();
  const tail = [numberWord(args.count), noun, one ? forms.one : forms.many, forms.rest].filter((p) => p).join(' ');
  return `${ambushLeadIn(args.phase, args.party, args.placeName, args.resource ?? '')}${tail}!`;
}

/** The pull lead-in (feed `combat` kind). */
export function pullLeadIn(count: number | bigint, singular: string, plural: string): string {
  const one = isOne(count);
  const noun = (one ? singular : plural).toLowerCase();
  return `You make some noise. ${capitalNumberWord(count)} ${noun} ${one ? 'answers' : 'answer'}.`;
}

/** Feed `travel_quiet`: a travel roll found nothing. */
export function travelQuiet(placeName: string, party: boolean): string {
  return party
    ? `Your party travels to ${placeName}. Nothing follows you. This time.`
    : `You travel to ${placeName}. Nothing follows you. This time.`;
}

/** Feed `density_down`: a family reads one level lower at your place. */
export function densityDownLine(plural: string, placeName: string, levelWord: string): string {
  const Plural = sentenceCase(plural.toLowerCase());
  return `${Plural} thin out around ${placeName}. ${Plural} read ${levelWord.toLowerCase()} now.`;
}

/** Feed `density_gone`: a family is wiped out at your place. */
export function densityGoneLine(plural: string, placeName: string): string {
  return `The ${plural.toLowerCase()} are gone from ${placeName}.`;
}

/** Feed `density_down`: an Overrun family settles back to its home level. */
export function overrunSettleLine(plural: string, placeName: string): string {
  return `${sentenceCase(plural.toLowerCase())} around ${placeName} settle back down to stable.`;
}

/** Keeper narrative line: a rival family moves into a vacuum (D-36). */
export function vacuumLine(oldPlural: string, newPlural: string, placeName: string): string {
  return `With the ${oldPlural.toLowerCase()} gone, ${newPlural.toLowerCase()} move into ${placeName}. Fast.`;
}

/** Server gather result. */
export function gatherResult(resource: string, n: number | bigint): string {
  return `You gather ${resource} ×${String(n)}.`;
}

/** Server line on the gather that empties a pool (UI-SPEC override 1: no "for you"). */
export function lastGatherLine(resource: string): string {
  return `That is the last of the ${resource.toLowerCase()} here, for a while.`;
}

/** Private refusal and the disabled Gather reason at the per-player harvest cap (D-27). */
export function harvestCapRefusal(): string {
  return 'You have taken what you can carry from here for now.';
}

/** Private refusal: the family to pull is gone. */
export function pullRefusal(plural: string): string {
  return `There are no ${plural.toLowerCase()} here to pull.`;
}

/**
 * Private refusal (new, PROPOSED): a resource outside its time of day (D-55). `nightOnly` is true for a
 * resource that appears only at night (so it is day now: "until nightfall"), false for a day-only one.
 */
export function outOfTimeRefusal(resource: string, nightOnly: boolean): string {
  return `You will not find ${resource.toLowerCase()} here until ${nightOnly ? 'nightfall' : 'morning'}.`;
}

/** Private refusal (new, PROPOSED): the resource pool is Exhausted. */
export function exhaustedRefusal(resource: string, place: string): string {
  return `There is no ${resource.toLowerCase()} left in ${placeOrDefault(place)}, for now.`;
}

/** Nearby empty state: no families. */
export const NOTHING_HUNTS = 'Nothing hunts here now.';

/** Nearby empty state: every resource is Exhausted. */
export function allExhaustedLine(place: string): string {
  return `Everything worth taking has been picked from ${placeOrDefault(place)}.`;
}

/** Named card sub-line for a slain named enemy. */
export const SLAIN_NAMED_LINE = 'Slain · back after a long rest';

// ---------------------------------------------------------------------------
// Encounter panel (UI-SPEC Heading and source, D-32; PROPOSED, D-58)
// ---------------------------------------------------------------------------

export function encounterHeading(title: string, livingCount: number | bigint): string {
  const t = title.trim();
  return t ? `Encounter · ${t} · ${String(livingCount)} left` : `Encounter · ${String(livingCount)} left`;
}

/**
 * The source line by combat origin. A pull names the family and its density word at pull time;
 * a pull with no recorded family, and a fight with no recorded origin, show no line.
 */
export function encounterSource(origin: string, plural = '', densityWordAtPull = ''): string {
  switch (origin) {
    case 'pull': {
      const p = plural.trim();
      if (!p) return '';
      const word = densityWordAtPull.trim().toLowerCase();
      return word ? `Pulled from ${p} that read ${word} here.` : `Pulled from ${p} here.`;
    }
    case 'ambush_enter':
      return 'Ambushed on the way in.';
    case 'ambush_leave':
      return 'Ambushed on the way out.';
    case 'ambush_gather':
      return 'Ambushed while you gather.';
    case 'ambush_other':
      return 'Ambushed.';
    case 'named':
      return 'A named fight. No one else comes.';
    default:
      return '';
  }
}

// ---------------------------------------------------------------------------
// World event names and rumour items (UI-SPEC World event hooks, PROMPT-DRAFT C; PROPOSED, D-58)
// ---------------------------------------------------------------------------

export type DensityShiftKind = 'overrun_surge' | 'family_wiped' | 'vacuum_takeover' | 'region_trend';

export interface DensityShift {
  kind: DensityShiftKind;
  /** The family's plural noun (any case). */
  plural?: string;
  /** Sentence-case plural; when given it wins over `plural` in World event names. */
  Plural?: string;
  /** The family name as written, e.g. 'Salt-Crust Skitterers'. */
  familyName?: string;
  oldPlural?: string;
  newPlural?: string;
  placeName?: string;
  regionName?: string;
  trend?: 'wilder' | 'quieter';
}

/** The World event name of a density shift (52.4 owns the cards). */
export function worldEventName(shift: DensityShift): string {
  const plural = (shift.plural ?? '').toLowerCase();
  const placeName = shift.placeName ?? '';
  switch (shift.kind) {
    case 'overrun_surge':
      return `${shift.Plural || sentenceCase(plural)} swarm ${placeName}`;
    case 'family_wiped':
      return `The ${shift.familyName || plural} are gone from ${placeName}`;
    case 'vacuum_takeover':
      return `With the ${(shift.oldPlural ?? '').toLowerCase()} gone, ${(shift.newPlural ?? '').toLowerCase()} move into ${placeName}`;
    case 'region_trend':
      return `${shift.regionName ?? ''} grows ${shift.trend === 'quieter' ? 'quieter' : 'wilder'}`;
  }
}

/** One rumour item for the npc_conversation "Recent word" line: a short lowercase clause (D-22). */
export function rumorItem(shift: DensityShift): string {
  const plural = (shift.plural ?? shift.Plural ?? '').toLowerCase();
  const placeName = shift.placeName ?? '';
  switch (shift.kind) {
    case 'overrun_surge':
      return `${plural} swarm ${placeName}`;
    case 'family_wiped':
      return `the ${plural} are gone from ${placeName}`;
    case 'vacuum_takeover':
      return `with the ${(shift.oldPlural ?? '').toLowerCase()} gone, ${(shift.newPlural ?? '').toLowerCase()} have moved into ${placeName}`;
    case 'region_trend':
      return `${shift.regionName ?? ''} grows ${shift.trend === 'quieter' ? 'quieter' : 'wilder'}`;
  }
}
