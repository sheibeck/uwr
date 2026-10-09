/**
 * Pure validation and repair of the AI family reply (Phase 51.3.1.1 Plan 07; the reply shape is
 * PROMPT-DRAFT section A3: `families[]` with name, singularNoun, pluralNoun, creatureType, iconKey,
 * temperament, ambushVerb, ambushRest, members[{ role, name }], fitLocations[] and
 * relations[{ family, kind }]; plus per place `shortName` and `placeNoun`). No table access and no
 * SpacetimeDB runtime import.
 *
 * This module never reads a number from the reply (D-46): levels, group sizes, home densities, stats
 * and abilities are all set by the server, so extra keys such as level or groupMin change nothing
 * (T-51.3.1.1-22). Names are cleaned to 1-3 plain words with the economy cleaners and made unique
 * within the reply and against the caller's isTaken; enums are clamped with fallbacks; fit places and
 * relations are resolved against the given data only; at most 4 members per family and a 6-word
 * ambush rest (T-51.3.1.1-21, T-51.3.1.1-23).
 *
 * Plan 28 (D-66, D-68, D-70):
 * - count: at most the server's familyCount families are kept (3 when the caller gives none, Plan 23's
 *   call), never more than DENSITY_RULES.FAMILY_COUNT_MAX; at most SCAN_FAMILIES entries are read;
 * - history: each family's history is cleaned by cleanFamilyHistory (two plain sentences, 240
 *   characters, no digit, markup, code symbol, first person, Keeper or instruction word; else '');
 * - feud: a family's inFeud mark is read only as a boolean true;
 * - rule fill: completeRegionFamilies keeps at most the count, fills the rest from RULE_FAMILY_BANK,
 *   picks the region's feud (marks first, then seeded) and gives every family without a usable history
 *   the rule history line.
 *
 * Users: the region fill (Plan 23; Plan 29 wires the count, the rule fill and the feud) feeds each
 * ValidatedFamily to createFamily (helpers/families.ts).
 */
import type { FamilyDefinition, FamilyMemberDefinition } from './families';
import { cleanItemName, nameKey } from '../data/economy_design_rules';
import { ambushVerbForms } from '../data/density_lines';
import { DENSITY_RULES, POOL_ROLL, pickFeud } from '../data/density_rules';
import { economyRoll, rollBelow } from '../data/economy_rules';
import {
  ROLE_ORDER,
  RULE_FAMILY_BANK,
  fillerMemberName,
  pluralize,
  promptRoleToServer,
  ruleFamilyHistory,
  type RuleFamilyEntry,
} from '../data/family_rules';
import {
  ENEMY_ROLES,
  FAMILY_ICON_KEYS,
  FAMILY_PROMPT_ROLES,
  FAMILY_RELATIONS,
  FAMILY_TEMPERAMENTS,
  type EnemyRole,
  type FamilyRelation,
} from '../data/mechanical_vocabulary';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** One place of the region as the validator sees it: the new locations and the arrival point (D-61). */
export interface FamilyPlace {
  name: string;
  isSafe: boolean;
  isHub: boolean;
  terrainType: string;
}

export interface ValidateFamiliesInput {
  regionId: bigint;
  /** The region's new locations and its arrival point, each with its final isSafe and isHub. */
  places: readonly FamilyPlace[];
  /** True when a name is already used (existing enemy templates and families). */
  isTaken: (name: string) => boolean;
  /**
   * The server's family count for the region (D-66, keptFamilyCount), clamped to
   * 1..DENSITY_RULES.FAMILY_COUNT_MAX; MAX_FAMILIES (3) when absent.
   */
  familyCount?: number;
}

/** A family definition ready for createFamily, plus where it lives and its relations by key. */
export interface ValidatedFamily extends FamilyDefinition {
  /** Exact names of the places the family lives at (never safe, a hub or uncharted). */
  fitLocationNames: string[];
  /** The eligible places the reply itself named, before the terrain fallback; [] when it named none (D-67). */
  aiFitNames: string[];
  relations: { otherKey: string; kind: FamilyRelation }[];
  /** One or two clean sentences of the family's past in the region, or '' (D-68). */
  history: string;
  /** In the region's feud: the reply's mark until completeRegionFamilies sets the server's pick (D-70). */
  inFeud: boolean;
  /** True for a family the server made from RULE_FAMILY_BANK (D-66). */
  ruleMade: boolean;
}

// ---------------------------------------------------------------------------
// Limits and rule tables
// ---------------------------------------------------------------------------

const MAX_FAMILIES = 3;
const MAX_MEMBERS = 4;
const MAX_NAME_WORDS = 3;
const MAX_NOUN_WORDS = 3;
const MAX_REST_WORDS = 6;
const MAX_SHORT_NAME_WORDS = 2;
/** How many reply entries are looked at, at most (a huge reply costs nothing more). */
const SCAN_FAMILIES = 20;
const SCAN_MEMBERS = 12;
const SCAN_FIT = 20;
const SCAN_RELATIONS = 10;

/** The creature types of the region-fill schema (llm_schemas.ts CREATURE_TYPE); anything else is beast. */
const CREATURE_TYPES: readonly string[] = ['beast', 'undead', 'humanoid', 'elemental', 'construct', 'aberration'];
const DEFAULT_CREATURE_TYPE = 'beast';
const DEFAULT_TEMPERAMENT = 'wary';

/** The terrains a creature type usually lives on, for a family the reply gave no usable place. */
const USUAL_TERRAINS: Readonly<Record<string, readonly string[]>> = {
  beast: ['woods', 'plains', 'swamp', 'mountains'],
  undead: ['swamp', 'dungeon'],
  humanoid: ['plains', 'woods', 'mountains'],
  elemental: ['mountains', 'dungeon'],
  construct: ['dungeon'],
  aberration: ['swamp', 'dungeon'],
};

/**
 * Words that tell a repeated name apart ('Grey Goblins'), tried after the family's own place words.
 * PROPOSED copy (D-58): listed for the owner's wording review.
 */
export const FAMILY_NAME_MARKS: readonly string[] = ['Grey', 'Pale', 'Wild', 'Dark', 'Old', 'Red', 'Black', 'Lesser'];

// ---------------------------------------------------------------------------
// Small readers
// ---------------------------------------------------------------------------

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function asText(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

/** Reads an own property only (a reply key such as "__proto__" or "constructor" is never followed). */
function field(obj: unknown, key: string): unknown {
  return isPlainObject(obj) && Object.prototype.hasOwnProperty.call(obj, key) ? obj[key] : undefined;
}

function list(value: unknown, max: number): unknown[] {
  return Array.isArray(value) ? value.slice(0, max) : [];
}

function enumWord(value: unknown): string {
  return asText(value).trim().toLowerCase();
}

/** Markup tags and character entities become spaces. */
function stripMarkup(text: string): string {
  return text.replace(/<[^>]*>?/g, ' ').replace(/&[#a-z0-9]+;/gi, ' ');
}

function splitWords(text: string): string[] {
  return text.split(/\s+/).filter((w) => w);
}

/** A model-written name as at most `maxWords` plain words (economy cleaner, markup removed); '' when unusable. */
function cleanName(raw: unknown, maxWords: number): string {
  const cleaned = cleanItemName(stripMarkup(asText(raw)));
  const name = splitWords(cleaned).slice(0, maxWords).join(' ');
  return name.replace(/[^A-Za-z]/g, '').length < 2 ? '' : name;
}

/** A model-written noun as plain lowercase words; '' when unusable. */
function cleanNoun(raw: unknown): string {
  const flat = stripMarkup(asText(raw)).toLowerCase().replace(/[^a-z' -]/g, ' ');
  const noun = splitWords(flat)
    .filter((w) => /[a-z]/.test(w))
    .slice(0, MAX_NOUN_WORDS)
    .join(' ');
  return noun.replace(/[^a-z]/g, '').length < 2 ? '' : noun;
}

function titleCase(text: string): string {
  return splitWords(text)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
}

function lastWord(text: string): string {
  const words = splitWords(text);
  return words.length > 0 ? words[words.length - 1]! : '';
}

/** `prefix` in front of `base`, kept to MAX_NAME_WORDS words (the base loses its first words). */
function withPrefix(prefix: string, base: string): string {
  const baseWords = splitWords(base).slice(-(MAX_NAME_WORDS - 1));
  return [prefix, ...baseWords].join(' ');
}

/** One name set for a whole reply: a name is taken when the caller says so or it was chosen earlier here. */
class NameBook {
  private readonly used = new Set<string>();
  constructor(private readonly isTaken: (name: string) => boolean) {}

  private taken(name: string): boolean {
    return this.used.has(nameKey(name)) || this.isTaken(name) === true;
  }

  /**
   * The first free name of: the base, the base behind each place word, the base behind each mark, then
   * two marks before the base's last word. Plain words only, never a numeral. The last candidate is
   * kept if every one is taken (only an isTaken that answers true for everything gets there).
   */
  take(base: string, placeWords: readonly string[]): string {
    const candidates: string[] = [base];
    for (const word of [...placeWords, ...FAMILY_NAME_MARKS]) {
      if (word && nameKey(word) !== nameKey(splitWords(base)[0] ?? '')) candidates.push(withPrefix(word, base));
    }
    const last = lastWord(base);
    for (const a of FAMILY_NAME_MARKS) for (const b of FAMILY_NAME_MARKS) if (a !== b) candidates.push(`${a} ${b} ${last}`);
    const chosen = candidates.find((name) => !this.taken(name)) ?? candidates[candidates.length - 1]!;
    this.used.add(nameKey(chosen));
    return chosen;
  }
}

// ---------------------------------------------------------------------------
// Parts of one family
// ---------------------------------------------------------------------------

/** The member role of the reply as a server role, or null for an unknown word (dropped). */
function memberRole(value: unknown): EnemyRole | null {
  const word = enumWord(value);
  const known = (FAMILY_PROMPT_ROLES as readonly string[]).includes(word) || (ENEMY_ROLES as readonly string[]).includes(word);
  return known ? promptRoleToServer(word) : null;
}

/** The ambush verb when it is a plain regular verb (the ambushVerbForms rule), else ''. */
function ambushVerb(value: unknown): string {
  const verb = asText(value).trim().toLowerCase();
  if (!verb) return '';
  const forms = ambushVerbForms(verb, '');
  return forms.many === verb && forms.one === `${verb}s` ? verb : '';
}

/** The rest of the ambush phrase: markup stripped, plain words only, at most 6 words. */
function ambushRest(value: unknown): string {
  const flat = stripMarkup(asText(value)).replace(/[^A-Za-z' -]/g, ' ');
  return splitWords(flat)
    .filter((w) => /[A-Za-z]/.test(w))
    .slice(0, MAX_REST_WORDS)
    .join(' ');
}

function eligible(place: FamilyPlace): boolean {
  return !place.isSafe && !place.isHub && enumWord(place.terrainType) !== 'uncharted';
}

/** The eligible places the reply named: known, never safe, a hub or uncharted (D-61). */
function namedPlaces(raw: unknown, places: readonly FamilyPlace[]): FamilyPlace[] {
  const out: FamilyPlace[] = [];
  for (const entry of list(raw, SCAN_FIT)) {
    const name = asText(entry);
    if (!name.trim()) continue;
    const place = places.find((p) => p.name === name) ?? places.find((p) => nameKey(p.name) === nameKey(name));
    if (place && eligible(place) && !out.includes(place)) out.push(place);
  }
  return out;
}

/** The places a family lives at (D-61): the places the reply named; else by usual terrain; else all eligible. */
function fitPlaces(named: readonly FamilyPlace[], places: readonly FamilyPlace[], creatureType: string): FamilyPlace[] {
  if (named.length > 0) return [...named];
  const open = places.filter(eligible);
  const usual = USUAL_TERRAINS[creatureType] ?? [];
  const byTerrain = open.filter((p) => usual.includes(enumWord(p.terrainType)));
  return byTerrain.length > 0 ? byTerrain : open;
}

interface DraftFamily {
  family: ValidatedFamily;
  rawNameKeys: string[];
  rawRelations: unknown[];
}

function draftFamily(raw: Record<string, unknown>, input: ValidateFamiliesInput, book: NameBook): DraftFamily {
  const creatureTypeWord = enumWord(field(raw, 'creatureType'));
  const creatureType = CREATURE_TYPES.includes(creatureTypeWord) ? creatureTypeWord : DEFAULT_CREATURE_TYPE;
  const temperamentWord = enumWord(field(raw, 'temperament'));
  const temperament = (FAMILY_TEMPERAMENTS as readonly string[]).includes(temperamentWord) ? temperamentWord : DEFAULT_TEMPERAMENT;
  const iconWord = enumWord(field(raw, 'iconKey'));
  const iconKey = (FAMILY_ICON_KEYS as readonly string[]).includes(iconWord) ? iconWord : '';

  const singularNoun = cleanNoun(field(raw, 'singularNoun')) || creatureType;
  const pluralNoun = cleanNoun(field(raw, 'pluralNoun')) || pluralize(singularNoun);

  const named = namedPlaces(field(raw, 'fitLocations'), input.places);
  const fit = fitPlaces(named, input.places, creatureType);
  const fitTerrains: string[] = [];
  for (const place of fit) {
    const terrain = enumWord(place.terrainType);
    if (terrain && !fitTerrains.includes(terrain)) fitTerrains.push(terrain);
  }
  const placeWords = fit.map((p) => lastWord(cleanName(p.name, MAX_NAME_WORDS))).filter((w) => w);

  const rawName = asText(field(raw, 'name'));
  const name = book.take(cleanName(rawName, MAX_NAME_WORDS) || titleCase(pluralNoun), placeWords);
  const nameWords = splitWords(name);

  const memberBase = titleCase(singularNoun);
  const members: FamilyMemberDefinition[] = [];
  for (const entry of list(field(raw, 'members'), SCAN_MEMBERS)) {
    if (members.length >= MAX_MEMBERS) break;
    const role = memberRole(field(entry, 'role'));
    if (!role || members.some((m) => m.role === role)) continue;
    const cleaned = cleanName(field(entry, 'name'), MAX_NAME_WORDS) || fillerMemberName(memberBase, role);
    members.push({ role, name: book.take(cleaned, nameWords.slice(0, 1)), filler: false });
  }
  if (!members.some((m) => m.role === 'tank' || m.role === 'damage')) {
    members.unshift({ role: 'damage', name: book.take(fillerMemberName(memberBase, 'damage'), nameWords.slice(0, 1)), filler: true });
    if (members.length > MAX_MEMBERS) members.length = MAX_MEMBERS;
  }

  const rawNameKeys = [nameKey(rawName), nameKey(cleanName(rawName, MAX_NAME_WORDS)), nameKey(name)].filter((k) => k);
  return {
    family: {
      key: `ai:${input.regionId.toString()}:${nameKey(name)}`,
      name,
      singularNoun,
      pluralNoun,
      creatureType,
      temperament,
      iconKey,
      ambushVerb: ambushVerb(field(raw, 'ambushVerb')),
      ambushRest: ambushRest(field(raw, 'ambushRest')),
      fitTerrains,
      fitLocationNames: fit.map((p) => p.name),
      aiFitNames: named.map((p) => p.name),
      members,
      relations: [],
      history: cleanFamilyHistory(field(raw, 'history')),
      inFeud: field(raw, 'inFeud') === true,
      ruleMade: false,
    },
    rawNameKeys,
    rawRelations: list(field(raw, 'relations'), SCAN_RELATIONS),
  };
}

// ---------------------------------------------------------------------------
// The validators
// ---------------------------------------------------------------------------

/** The kept family count: the caller's count clamped to 1..FAMILY_COUNT_MAX, else MAX_FAMILIES (D-66). */
function keptCount(familyCount: number | undefined): number {
  if (familyCount === undefined || !Number.isFinite(familyCount)) return MAX_FAMILIES;
  return Math.max(1, Math.min(DENSITY_RULES.FAMILY_COUNT_MAX, Math.floor(familyCount)));
}

/**
 * The AI family reply (the whole region-fill reply, or any object with a `families` array) as at most
 * input.familyCount validated families (3 when absent). Returns `{ families: null }` when there is no
 * families array or no family survives, so the caller takes the rule path (familiesFromTemplates, or
 * completeRegionFamilies with no validated families once Plan 29 wires it). Members are deduplicated by
 * role (the first wins), at most 4, with a filler damage member put first when there is no tank and
 * no damage member; other missing roles are left missing. Relations name kept families only (by the
 * name the reply used), never the family itself, one per other family.
 */
export function validateFamilies(reply: unknown, input: ValidateFamiliesInput): { families: ValidatedFamily[] | null } {
  const rawFamilies = field(reply, 'families');
  if (!Array.isArray(rawFamilies)) return { families: null };

  const book = new NameBook(input.isTaken);
  const keep = keptCount(input.familyCount);
  const drafts: DraftFamily[] = [];
  for (const entry of rawFamilies.slice(0, SCAN_FAMILIES)) {
    if (drafts.length >= keep) break;
    if (!isPlainObject(entry)) continue;
    drafts.push(draftFamily(entry, input, book));
  }
  if (drafts.length === 0) return { families: null };

  const keyByName = new Map<string, string>();
  for (const draft of drafts) {
    for (const k of draft.rawNameKeys) if (!keyByName.has(k)) keyByName.set(k, draft.family.key);
  }
  for (const draft of drafts) {
    for (const entry of draft.rawRelations) {
      const kind = enumWord(field(entry, 'kind'));
      if (!(FAMILY_RELATIONS as readonly string[]).includes(kind)) continue;
      const otherName = asText(field(entry, 'family'));
      const otherKey = keyByName.get(nameKey(otherName)) ?? keyByName.get(nameKey(cleanName(otherName, MAX_NAME_WORDS)));
      if (!otherKey || otherKey === draft.family.key) continue;
      if (draft.family.relations.some((r) => r.otherKey === otherKey)) continue;
      draft.family.relations.push({ otherKey, kind: kind as FamilyRelation });
    }
  }
  return { families: drafts.map((d) => d.family) };
}

/**
 * A place's words from the reply: the short name cleaned to at most 2 plain words (else ''), and the
 * place noun kept only when it is lowercase words starting with "the ", at most 4 words (else '').
 */
export function validatePlaceWords(raw: unknown): { shortName: string; placeNoun: string } {
  const shortName = cleanName(field(raw, 'shortName'), MAX_SHORT_NAME_WORDS);
  const noun = asText(field(raw, 'placeNoun')).replace(/\s+/g, ' ').trim();
  const placeNoun = /^the( [a-z][a-z'-]*){1,3}$/.test(noun) ? noun : '';
  return { shortName, placeNoun };
}

// ---------------------------------------------------------------------------
// Family histories (D-68, T-51.3.1.1-93)
// ---------------------------------------------------------------------------

/** Validator limits of one family history (not balance dials). */
export const FAMILY_HISTORY_MAX_SENTENCES = 2;
export const FAMILY_HISTORY_MAX_CHARS = 240;
const FAMILY_HISTORY_MIN_WORDS = 3;

/** Markup: a tag or a character entity. */
const HISTORY_MARKUP = /<[^>]*>|&[#a-z0-9]+;/i;
/** Letters, spaces and plain punctuation only: no digit, markup or code symbol. */
const HISTORY_ALLOWED = /^[A-Za-z .,;:'!?()-]*$/;
/**
 * Words a history may never hold: first person, the Keeper (the narrator never appears in world text),
 * reflexive pronouns (gendered pronouns only, D-58 pronoun rule), instruction words, and the banned
 * World-event word (spelled with a repeat count so the no-word guard stays clean).
 */
const HISTORY_BANNED = [
  /\b(i|me|my|mine|myself|we|us|our|ours|ourselves)\b/i,
  /\bkeeper\b/i,
  /\b(themselves|themself)\b/i,
  /\b(ignore|instructions?|assistant|prompt|json)\b/i,
  /rip{2}le/i,
];

/**
 * An AI-written family history as one or two plain sentences, or '' (D-68). Whitespace is collapsed and
 * curly quotes and dashes are made plain; markup, a digit or any character outside letters, spaces and
 * . , ; : ' - ! ? ( ) gives ''; so do first person, the Keeper, a reflexive pronoun, an instruction word
 * or the banned World-event word. Semicolons become commas (the NPC line joins items with
 * semicolons). At most FAMILY_HISTORY_MAX_SENTENCES sentences, each ending in a stop (a missing final
 * stop gets a full stop); over FAMILY_HISTORY_MAX_CHARS only the first sentence, and '' when that is
 * still too long or the text has fewer than 3 words.
 */
export function cleanFamilyHistory(raw: unknown): string {
  const text = asText(raw)
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/\s*[\u2013\u2014]\s*/g, ', ')
    .replace(/\s+/g, ' ')
    .trim();
  if (!text || HISTORY_MARKUP.test(text) || !HISTORY_ALLOWED.test(text)) return '';
  if (HISTORY_BANNED.some((pattern) => pattern.test(text))) return '';

  const plain = text.replace(/;/g, ',');
  const sentences: string[] = [];
  for (const match of plain.matchAll(/[^.!?]+[.!?]*/g)) {
    let sentence = match[0].trim();
    if (!/[A-Za-z]/.test(sentence)) continue;
    if (!/[.!?]$/.test(sentence)) sentence = `${sentence.replace(/[,:(-]+$/, '').trim()}.`;
    sentences.push(sentence);
    if (sentences.length >= FAMILY_HISTORY_MAX_SENTENCES) break;
  }
  if (sentences.length === 0) return '';

  let history = sentences.join(' ');
  if (history.length > FAMILY_HISTORY_MAX_CHARS) history = sentences[0]!;
  if (history.length > FAMILY_HISTORY_MAX_CHARS) return '';
  return splitWords(history).length < FAMILY_HISTORY_MIN_WORDS ? '' : history;
}

// ---------------------------------------------------------------------------
// The rule fill, the feud and the rule histories (D-66, D-68, D-70)
// ---------------------------------------------------------------------------

export interface CompleteRegionFamiliesInput {
  regionId: bigint;
  regionName: string;
  /** The same places validateFamilies saw (final isSafe and isHub). */
  places: readonly FamilyPlace[];
  /** True when a name is already used (existing enemy templates and families). */
  isTaken: (name: string) => boolean;
  /** The server's family count (keptFamilyCount), clamped to 1..FAMILY_COUNT_MAX. */
  familyCount: number;
  /** The feud size (feudCountFor); never more than the families. */
  feudCount: number;
  /** familySeed(regionId): no timestamp, so the request and the write agree. */
  seed: bigint;
}

/** RULE_FAMILY_BANK in a seeded order (one RULE_FAMILY_ORDER roll seeds the shuffle), fitting entries first. */
function ruleFamilyOrder(terrains: readonly string[], seed: bigint): RuleFamilyEntry[] {
  const order = RULE_FAMILY_BANK.map((_, i) => i);
  const shuffleSeed = economyRoll(seed, POOL_ROLL.RULE_FAMILY_ORDER);
  for (let i = order.length - 1; i > 0; i -= 1) {
    const j = Number(rollBelow(shuffleSeed, BigInt(i), BigInt(i + 1)));
    const tmp = order[i]!;
    order[i] = order[j]!;
    order[j] = tmp;
  }
  const entries = order.map((i) => RULE_FAMILY_BANK[i]!);
  const fits = (entry: RuleFamilyEntry): boolean => entry.fitTerrains.some((t) => terrains.includes(t));
  return [...entries.filter(fits), ...entries.filter((entry) => !fits(entry))];
}

function copyFamily(family: ValidatedFamily): ValidatedFamily {
  return {
    ...family,
    fitTerrains: [...family.fitTerrains],
    fitLocationNames: [...family.fitLocationNames],
    aiFitNames: [...family.aiFitNames],
    members: family.members.map((member) => ({ ...member })),
    relations: family.relations.map((relation) => ({ ...relation })),
  };
}

function ruleFamily(entry: RuleFamilyEntry, input: CompleteRegionFamiliesInput, open: readonly FamilyPlace[], book: NameBook): ValidatedFamily {
  const name = book.take(entry.name, []);
  const nameWords = splitWords(name);
  const fitting = open.filter((place) => entry.fitTerrains.includes(enumWord(place.terrainType)));
  const memberBase = titleCase(entry.singularNoun);
  const members: FamilyMemberDefinition[] = ROLE_ORDER.map((role) => ({
    role,
    name: book.take(fillerMemberName(memberBase, role), nameWords.slice(0, 1)),
    filler: true,
  }));
  return {
    key: `rule:${input.regionId.toString()}:${nameKey(name)}`,
    name,
    singularNoun: entry.singularNoun,
    pluralNoun: entry.pluralNoun,
    creatureType: entry.creatureType,
    temperament: entry.temperament,
    iconKey: entry.iconKey,
    ambushVerb: entry.ambushVerb,
    ambushRest: entry.ambushRest,
    fitTerrains: [...entry.fitTerrains],
    fitLocationNames: (fitting.length > 0 ? fitting : open).map((place) => place.name),
    aiFitNames: [],
    members,
    relations: [],
    history: '',
    inFeud: false,
    ruleMade: true,
  };
}

/**
 * The region's full family list (D-66, D-68, D-70):
 * a. the first familyCount (clamped 1..FAMILY_COUNT_MAX) validated families, copied;
 * b. one name book that also treats every kept family and member name as taken;
 * c. rule families up to the count from RULE_FAMILY_BANK (entries fitting an eligible place first, each
 *    group in a seeded order; the list is reused with name marks when more are needed), each with four
 *    filler members (tank, damage, healer, caster) and a rival relation to every other rule family;
 * d. the feud: pickFeud over every key (the reply's marks first), at most feudCount;
 * e. inFeud set from the feud, and the rule history line for every family whose history is '' (naming
 *    the other feud families for a family in the feud).
 * Pure and seeded: the same input gives the same output.
 */
export function completeRegionFamilies(
  validated: readonly ValidatedFamily[],
  input: CompleteRegionFamiliesInput,
): { families: ValidatedFamily[]; feudKeys: string[] } {
  const count = keptCount(input.familyCount);
  const families = validated.slice(0, count).map(copyFamily);

  const keptNames = new Set<string>();
  for (const family of families) {
    keptNames.add(nameKey(family.name));
    for (const member of family.members) keptNames.add(nameKey(member.name));
  }
  const book = new NameBook((name) => keptNames.has(nameKey(name)) || input.isTaken(name) === true);

  const open = input.places.filter(eligible);
  const terrains = open.map((place) => enumWord(place.terrainType));
  const order = ruleFamilyOrder(terrains, input.seed);
  const ruleMade: ValidatedFamily[] = [];
  const attempts = order.length * DENSITY_RULES.FAMILY_COUNT_MAX * 2;
  for (let i = 0; families.length < count && i < attempts; i += 1) {
    const family = ruleFamily(order[i % order.length]!, input, open, book);
    if (families.some((other) => other.key === family.key)) continue;
    families.push(family);
    ruleMade.push(family);
  }
  for (const family of ruleMade) {
    for (const other of ruleMade) if (other !== family) family.relations.push({ otherKey: other.key, kind: 'rival' });
  }

  const feudKeys = pickFeud({
    keys: families.map((family) => family.key),
    markedKeys: families.filter((family) => family.inFeud).map((family) => family.key),
    count: Math.min(Math.max(0, Math.floor(Number(input.feudCount) || 0)), families.length),
    seed: input.seed,
  });
  const feudNames = families.filter((family) => feudKeys.includes(family.key)).map((family) => family.name);
  for (const family of families) {
    family.inFeud = feudKeys.includes(family.key);
    if (family.history === '') {
      family.history = ruleFamilyHistory({
        familyName: family.name,
        regionName: input.regionName,
        feudNames: family.inFeud ? feudNames.filter((name) => name !== family.name) : [],
      });
    }
  }
  return { families, feudKeys };
}
