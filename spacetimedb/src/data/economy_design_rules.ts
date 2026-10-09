// economy_design_rules.ts
// Phase 51.3 plan 02. The pure design rules of a region economy: what a region gets (the "Small"
// counts), which recipe tiers appear given how many other regions exist, how cross-region
// requirements are composed (rare needs 1 other region, epic 2, legendary 3), how generated names
// stay safe and unique, and how every number of a generated item comes from the shared item rules.
// The model only names and describes; it never supplies a number (SC2, SC3).
//
// Users: the region economy validator (plan 04) and the apply (plan 10).
//
// Pure: imports only other data modules, no clock, no source of chance, never throws. Names of
// Object prototype keys are never looked up through a plain index.

import { CRAFTING_MODIFIER_DEFS, ESSENCE_TIER_THRESHOLDS, MATERIAL_DEFS, MODIFIER_REAGENT_THRESHOLDS } from './crafting_rules';
import { STARTER_ITEM_NAMES } from './combat_constants';
import { BASIC_RESOURCE_DEFS, JUNK_DEFS } from './equipment_rules';
import { serverRoleToPrompt } from './family_rules';
import { QUALITY_TIERS, type QualityTier } from './mechanical_vocabulary';
import {
  ACCESSORY_FORMS,
  ARMOR_FORMS,
  FOOD_DURATION_MICROS,
  FOOD_FORMS,
  PRIMARY_KINDS,
  RECIPE_CATEGORY_ORDER,
  WEAPON_FORMS,
  WEAPON_START,
  armorGrowth,
  levelStep,
  weaponGrowth,
  type GeneratedItemTemplate,
  type RecipeCategory,
} from './recipe_rules';

// ---------------------------------------------------------------------------
// NAMES AND DESCRIPTIONS
// ---------------------------------------------------------------------------

const MAX_NAME_WORDS = 4;
/** The character cap of a cleaned name (cleanItemName); also re-applied after a uniqueness prefix. */
export const MAX_NAME_CHARS = 40;
const MAX_DESCRIPTION_CHARS = 240;

function asText(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

/**
 * A model-written item or recipe name made safe: only ASCII letters, spaces, apostrophes and hyphens
 * survive (every other character becomes a space), whitespace collapses, a leading "scroll" word is
 * dropped (no generated name can pass the "Scroll:" scroll check), at most 4 words and 40 characters
 * are kept, and '' comes back when fewer than 2 letters remain. Case is kept.
 */
export function cleanItemName(raw: string): string {
  const spaced = asText(raw).replace(/[^A-Za-z' -]/g, ' ');
  let words = spaced.split(/\s+/).filter((w) => /[A-Za-z]/.test(w));
  while (words.length > 0 && words[0].toLowerCase() === 'scroll') words = words.slice(1);
  words = words.slice(0, MAX_NAME_WORDS);
  while (words.length > 1 && words.join(' ').length > MAX_NAME_CHARS) words = words.slice(0, -1);
  let name = words.join(' ');
  if (name.length > MAX_NAME_CHARS) name = name.slice(0, MAX_NAME_CHARS);
  const letters = name.replace(/[^A-Za-z]/g, '').length;
  return letters < 2 ? '' : name;
}

/**
 * A model-written description made safe: the characters [ ] { } < > and control characters are
 * removed, whitespace collapses, and the text is capped at 240 characters at the last word boundary.
 */
export function cleanDescription(raw: string): string {
  // eslint-disable-next-line no-control-regex
  const flat = asText(raw).replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/[[\]{}<>]/g, '').replace(/\s+/g, ' ').trim();
  if (flat.length <= MAX_DESCRIPTION_CHARS) return flat;
  const head = flat.slice(0, MAX_DESCRIPTION_CHARS + 1);
  const cut = head.lastIndexOf(' ');
  return (cut > 0 ? head.slice(0, cut) : flat.slice(0, MAX_DESCRIPTION_CHARS)).trim();
}

/** The comparison key of a name: lowercase, whitespace collapsed. */
export function nameKey(name: string): string {
  return asText(name).toLowerCase().replace(/\s+/g, ' ').trim();
}

/**
 * Names a generated item may never take: junk, crafting materials, modifiers and reagents,
 * essences, starter gear and the basic resources. The starter upsert overwrites templates by name,
 * so a generated item sharing one of these would be overwritten or handed out in its place.
 */
export const RESERVED_ITEM_NAMES: ReadonlySet<string> = (() => {
  const set = new Set<string>();
  const add = (name: string) => set.add(nameKey(name));
  for (const def of JUNK_DEFS) add(def.name);
  for (const def of MATERIAL_DEFS) add(def.name);
  for (const def of CRAFTING_MODIFIER_DEFS) add(def.name);
  for (const row of MODIFIER_REAGENT_THRESHOLDS) for (const name of row.reagentNames) add(name);
  for (const row of ESSENCE_TIER_THRESHOLDS) add(row.essenceName);
  for (const name of STARTER_ITEM_NAMES) add(name);
  for (const def of BASIC_RESOURCE_DEFS) add(def.name);
  return set;
})();

export type FallbackRole = 'gather' | 'trophy' | 'gear' | 'output';

const KIND_NOUNS: Readonly<Record<string, string>> = {
  metal: 'Ore',
  hide: 'Hide',
  cloth: 'Fiber',
  trinket: 'Stone',
  wood: 'Timber',
  edible: 'Herb',
  base: 'Salt',
};

const GEAR_NOUNS: Readonly<Record<string, string>> = {
  weapon: 'Blade',
  chest: 'Jerkin',
  legs: 'Pants',
  boots: 'Boots',
};

const OUTPUT_NOUNS: Readonly<Record<string, string>> = {
  weapon: 'Blade',
  armor: 'Jerkin',
  accessory: 'Pendant',
  consumable: 'Stew',
};

function lookup(map: Readonly<Record<string, string>>, key: string, otherwise: string): string {
  return Object.prototype.hasOwnProperty.call(map, key) ? map[key] : otherwise;
}

/**
 * The rule name of an item whose model name was empty or unusable: "<Region> <noun>". Gatherables
 * use a noun by material kind, a trophy "Trophy", gear a noun by slot, a recipe output a noun by
 * category.
 */
export function fallbackItemName(role: FallbackRole | string, kindOrSlot: string, regionName: string): string {
  const key = asText(kindOrSlot);
  let noun: string;
  if (role === 'gather') noun = lookup(KIND_NOUNS, key, 'Goods');
  else if (role === 'trophy') noun = 'Trophy';
  else if (role === 'gear') noun = lookup(GEAR_NOUNS, key, 'Gear');
  else if (role === 'output') noun = lookup(OUTPUT_NOUNS, key, 'Goods');
  else noun = 'Goods';
  const region = cleanItemName(regionName);
  return region === '' ? noun : `${region} ${noun}`;
}

/**
 * A stored name that is never equal (case-insensitive) to a reserved name or to anything isTaken
 * reports (the caller covers item_template names, recipe_template names and names already chosen
 * in this reply). A clash becomes "<Region> <name>", then "<Region> <name> 2", "... 3", and so on
 * (the questRewardItemName stem plus numeral). An empty cleaned name falls back to the rule name
 * for the role and kind, which on a clash is numbered only (the region is already in it).
 */
export function uniqueItemName(
  cleaned: string,
  regionName: string,
  isTaken: (name: string) => boolean,
  fallback?: { role: FallbackRole | string; kindOrSlot: string },
): string {
  const taken = (name: string): boolean => RESERVED_ITEM_NAMES.has(nameKey(name)) || isTaken(name);
  let base = cleanItemName(cleaned);
  let regional = false;
  if (base === '') {
    base = fallbackItemName(fallback ? fallback.role : 'gather', fallback ? fallback.kindOrSlot : '', regionName);
    regional = true;
  }
  if (!taken(base)) return base;
  const region = cleanItemName(regionName);
  const stem = regional || region === '' ? base : `${region} ${base}`;
  if (!taken(stem)) return stem;
  // The bound only guards an isTaken that answers true for everything.
  for (let n = 2; n < 10000; n++) {
    const name = `${stem} ${n}`;
    if (!taken(name)) return name;
  }
  return `${stem} 10000`;
}

// ---------------------------------------------------------------------------
// INPUT SHAPE AND COUNTS
// ---------------------------------------------------------------------------

/** One creature of the region, as the model sees it. The model refers to it by ref (E1..). */
export interface RegionEconomyEnemy {
  ref: string;
  templateId: bigint;
  name: string;
  creatureType: string;
  level: number;
}

/**
 * One member of a creature family, as the model sees it (Phase 51.3.1.1, D-47). The model refers to
 * it by ref (E1.tank, E1.damage, E1.support, E1.caster; a second member of one role is E1.damage2).
 * role is the prompt role word (tank, damage, support, caster), never the server word healer.
 */
export interface RegionEconomyMember {
  ref: string;
  templateId: bigint;
  role: string;
  name: string;
}

/**
 * One creature family of the region, as the model sees it (D-47). The model refers to it by ref
 * (E1..), and to its drop as D:E1. level is the family's base level (its lowest member level).
 */
export interface RegionEconomyFamily {
  ref: string;
  /** creature_family.id; 0n for a family of one read from a 51.3 enemy entry. */
  familyId: bigint;
  name: string;
  creatureType: string;
  level: number;
  /** In the order tank, damage, support, caster. */
  members: RegionEconomyMember[];
}

/** Another region with a complete economy that may supply a foreign material. */
export interface RegionEconomyForeignRegion {
  regionId: bigint;
  name: string;
}

/** A foreign material the model may name in a recipe requirement, by ref (F1..). */
export interface RegionEconomyForeign {
  ref: string;
  templateId: bigint;
  /** Position in RegionEconomyInput.foreignRegions. */
  regionIndex: number;
  name: string;
  kind: string;
}

/**
 * What the region_economy route sends the model. Ids the model must never see as numbers are kept
 * to the bigint paths in REGION_ECONOMY_BIGINT_PATHS; the model writes handles (G1.. for its
 * gatherables, E1.. for families, E1.tank.. for members, D:E1 for a family's drop, F1.. for foreign
 * materials).
 *
 * Modes: 'region' designs the whole region; 'family' designs one family added after the region was
 * designed (Phase 51.3.1.1). 'enemy' is kept only to read jobs stored before the family economy (51.3
 * late creatures). An input stored before Phase 51.3.1.1 has no families and no gatherSlots: read it
 * through economyFamilies, and treat missing gatherSlots as the small size.
 */
export interface RegionEconomyInput {
  mode: 'region' | 'family' | 'enemy';
  regionId: bigint;
  regionName: string;
  biome: string;
  areaLevel: number;
  dominantFaction: string;
  landmarks: string[];
  threats: string[];
  terrains: string[];
  /** The 51.3 per-template list; region mode keeps it for the 51.3 apply until the family apply ships (Plan 25). */
  enemies: RegionEconomyEnemy[];
  /** The region's creature families (Phase 51.3.1.1); absent in an input stored before it. */
  families?: RegionEconomyFamily[];
  /** The rarity of each gatherable slot G1, G2, ... from the economy size; [] in family mode. */
  gatherSlots?: string[];
  recipeSlots: { tier: string; foreignRegionIndexes: number[] }[];
  foreignRegions: RegionEconomyForeignRegion[];
  foreign: RegionEconomyForeign[];
  existingMaterials: { name: string; kind: string }[];
}

/** The paths of a RegionEconomyInput whose values are bigint (the route copies this list). */
export const REGION_ECONOMY_BIGINT_PATHS: readonly string[] = Object.freeze([
  'regionId',
  'enemies[].templateId',
  'families[].familyId',
  'families[].members[].templateId',
  'foreignRegions[].regionId',
  'foreign[].templateId',
]);

/**
 * The economy sizes (D-50): the rarity of each gatherable slot and the number of recipes. The server
 * fills the counts into the region_economy user message; the approved route block states none.
 */
export const REGION_ECONOMY_SIZES = Object.freeze({
  small: Object.freeze({ gatherSlots: Object.freeze(['common', 'uncommon', 'rare']), recipes: 3 }),
  medium: Object.freeze({
    gatherSlots: Object.freeze(['common', 'common', 'uncommon', 'uncommon', 'rare']),
    recipes: 5,
  }),
  large: Object.freeze({
    gatherSlots: Object.freeze(['common', 'common', 'common', 'uncommon', 'uncommon', 'rare', 'rare']),
    recipes: 7,
  }),
});

export type RegionEconomySize = keyof typeof REGION_ECONOMY_SIZES;

/**
 * The economy size (D-50) is a named constant (D-57); Phase 52.5 adds the admin setting. 'small' gives
 * today's counts: three gatherables and three recipes.
 */
export const REGION_ECONOMY_SIZE: keyof typeof REGION_ECONOMY_SIZES = 'small';

function sizeOf(size: string): (typeof REGION_ECONOMY_SIZES)[RegionEconomySize] {
  return Object.prototype.hasOwnProperty.call(REGION_ECONOMY_SIZES, size)
    ? REGION_ECONOMY_SIZES[size as RegionEconomySize]
    : REGION_ECONOMY_SIZES.small;
}

/** The rarity of each gatherable slot of a size (a fresh array); an unknown size reads as small. */
export function gatherSlotsForSize(size: string): string[] {
  return [...sizeOf(size).gatherSlots];
}

/** The number of recipes of a size; an unknown size reads as small. */
export function recipeCountForSize(size: string): number {
  return sizeOf(size).recipes;
}

/** The counts of a region economy: gatherables and recipes from REGION_ECONOMY_SIZE, the rest fixed. */
export const REGION_ECONOMY_COUNTS = Object.freeze({
  gatherables: REGION_ECONOMY_SIZES[REGION_ECONOMY_SIZE].gatherSlots.length,
  recipes: REGION_ECONOMY_SIZES[REGION_ECONOMY_SIZE].recipes,
  lootEntriesMin: 4,
  lootEntriesMax: 6,
  maxForeignRegions: 3,
  maxOfferPerRegion: 4,
});

/** The rarity of each gatherable slot of the 51.3 "Small" economy (G1, G2, G3); see gatherSlotsForSize. */
export const GATHER_SLOTS: readonly string[] = Object.freeze(['common', 'uncommon', 'rare']);

/** The gather pool weight of each slot rarity, next to the terrain pool weights (RESEARCH A6). */
export const GATHER_WEIGHTS: Readonly<Record<string, bigint>> = Object.freeze({
  common: 15n,
  uncommon: 8n,
  rare: 3n,
});

/** Handles. All take a zero-based position: gatherRef(0) is G1, enemyRef(0) is E1, foreignRef(0) is F1. */
export function gatherRef(index: number): string {
  return `G${index + 1}`;
}
export function enemyRef(index: number): string {
  return `E${index + 1}`;
}
/** The drop handle of an enemy: dropRef('E1') is 'D:E1'. */
export function dropRef(enemy: string): string {
  return `D:${enemy}`;
}
export function foreignRef(index: number): string {
  return `F${index + 1}`;
}
/** The handle of a family: familyRef(0) is E1 (a family's drop is dropRef('E1'), D:E1). */
export function familyRef(index: number): string {
  return `E${index + 1}`;
}
/**
 * The handle of a family member: the family handle, a dot and the prompt role word, so
 * memberRef('E1', 'healer') is 'E1.support'. The second member of one role is numbered from 2
 * (occurrence is zero-based): memberRef('E1', 'damage', 1) is 'E1.damage2'.
 */
export function memberRef(family: string, serverRole: string, occurrence = 0): string {
  const n = typeof occurrence === 'number' && Number.isInteger(occurrence) && occurrence > 0 ? String(occurrence + 1) : '';
  return `${family}.${serverRoleToPrompt(serverRole)}${n}`;
}

function isRecord(value: unknown): value is Record<string, any> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

/**
 * The families of a stored input. An input built since Phase 51.3.1.1 carries them; a 51.3 input
 * (no families key) reads each enemy entry as a family of one with a single damage member, named
 * after the enemy, handle <ref>.damage. Entries that are not objects are skipped. Never throws.
 */
export function economyFamilies(input: RegionEconomyInput): RegionEconomyFamily[] {
  if (!isRecord(input)) return [];
  if (Array.isArray(input.families)) return input.families.filter(isRecord) as RegionEconomyFamily[];
  const enemies: unknown[] = Array.isArray(input.enemies) ? input.enemies : [];
  return enemies.filter(isRecord).map((e) => {
    const ref = asText(e.ref);
    const name = asText(e.name);
    return {
      ref,
      familyId: 0n,
      name,
      creatureType: asText(e.creatureType),
      level: typeof e.level === 'number' ? e.level : 1,
      members: [{ ref: memberRef(ref, 'damage'), templateId: e.templateId, role: 'damage', name }],
    };
  });
}

// ---------------------------------------------------------------------------
// RECIPE TIERS AND CROSS-REGION REQUIREMENTS
// ---------------------------------------------------------------------------

/**
 * The tier of each of the three recipe slots, by k, the number of OTHER regions with a complete
 * economy (RESEARCH A3; the legendary slot needs three other regions, owner decision 2026-10-08).
 * At least one research-learnable tier (common or uncommon) is always present.
 */
export function recipeTierSlots(k: bigint): string[] {
  const n = typeof k === 'bigint' ? k : 0n;
  if (n >= 3n) return ['uncommon', 'epic', 'legendary'];
  if (n === 2n) return ['uncommon', 'rare', 'epic'];
  if (n === 1n) return ['common', 'uncommon', 'rare'];
  return ['common', 'common', 'uncommon'];
}

/**
 * The tier of each recipe of a size: the first three follow recipeTierSlots(k); a fourth and later
 * recipe alternates common and uncommon. A count below three keeps the first tiers; a count that is
 * not an integer reads as three.
 */
export function recipeTierSlotsForSize(k: bigint, count: number): string[] {
  const n = typeof count === 'number' && Number.isInteger(count) ? Math.max(0, count) : 3;
  const out = recipeTierSlots(k).slice(0, n);
  for (let i = out.length; i < n; i++) out.push(i % 2 === 1 ? 'common' : 'uncommon');
  return out;
}

/** How many distinct OTHER regions a recipe of each tier must draw a material from. */
export const FOREIGN_REGIONS_BY_TIER: Readonly<Record<QualityTier, number>> = Object.freeze({
  common: 0,
  uncommon: 0,
  rare: 1,
  epic: 2,
  legendary: 3,
});

/** A recipe never has more than this many requirements (legendary: 1 primary + 3 foreign). */
export const MAX_RECIPE_REQUIREMENTS = 4;

export interface RegionalRequirementPlan {
  /** Count of the local primary material. */
  primaryCount: bigint;
  /** Count of the local secondary material, or null when the tier has none. */
  localSecondaryCount: bigint | null;
  /** How many foreign-region materials, each from a distinct other region. */
  foreignCount: number;
  /** Count of each foreign material (0n when foreignCount is 0). */
  foreignEach: bigint;
}

const REQUIREMENT_PLANS: Readonly<Record<QualityTier, RegionalRequirementPlan>> = Object.freeze({
  common: { primaryCount: 3n, localSecondaryCount: 1n, foreignCount: 0, foreignEach: 0n },
  uncommon: { primaryCount: 3n, localSecondaryCount: 2n, foreignCount: 0, foreignEach: 0n },
  rare: { primaryCount: 3n, localSecondaryCount: 1n, foreignCount: 1, foreignEach: 1n },
  epic: { primaryCount: 3n, localSecondaryCount: null, foreignCount: 2, foreignEach: 2n },
  legendary: { primaryCount: 4n, localSecondaryCount: null, foreignCount: 3, foreignEach: 2n },
});

function isQualityTier(value: unknown): value is QualityTier {
  return typeof value === 'string' && (QUALITY_TIERS as readonly string[]).indexOf(value) !== -1;
}

/**
 * The requirements of a recipe by tier: 2 for common and uncommon (local only), 3 for rare
 * (1 foreign region), 3 for epic (2 foreign regions) and 4 for legendary (3 foreign regions).
 * An unknown tier is treated as common.
 */
export function regionalRequirementPlan(tier: string): RegionalRequirementPlan {
  return REQUIREMENT_PLANS[isQualityTier(tier) ? tier : 'common'];
}

/**
 * For each recipe slot, the positions in RegionEconomyInput.foreignRegions its foreign requirements
 * come from: rare [0], epic [0, 1], legendary [0, 1, 2], everything else [].
 */
export function slotForeignIndexes(tiers: readonly string[]): number[][] {
  return (Array.isArray(tiers) ? tiers : []).map((tier) => {
    const count = regionalRequirementPlan(tier).foreignCount;
    const out: number[] = [];
    for (let i = 0; i < count; i++) out.push(i);
    return out;
  });
}

// ---------------------------------------------------------------------------
// FOREIGN PICK
// ---------------------------------------------------------------------------

function compareBig(a: bigint, b: bigint): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

/**
 * The other regions in the order the foreign picks are taken: the region itself is excluded, its
 * neighbors come first by ascending id, then the rest rotated so the first one is at index
 * (regionId mod count) of their ascending list. Duplicates collapse (a repeated id is a neighbor
 * if any copy is). The result does not depend on the input order.
 */
export function orderForeignRegions(
  regionId: bigint,
  candidates: readonly { regionId: bigint; neighbor: boolean }[],
): bigint[] {
  const flags = new Map<bigint, boolean>();
  for (const c of Array.isArray(candidates) ? candidates : []) {
    if (c === null || typeof c !== 'object' || typeof c.regionId !== 'bigint') continue;
    if (c.regionId === regionId) continue;
    flags.set(c.regionId, flags.get(c.regionId) === true || c.neighbor === true);
  }
  const neighbors = [...flags.keys()].filter((id) => flags.get(id) === true).sort(compareBig);
  const rest = [...flags.keys()].filter((id) => flags.get(id) !== true).sort(compareBig);
  if (rest.length === 0) return neighbors;
  const count = BigInt(rest.length);
  const base = typeof regionId === 'bigint' ? regionId : 0n;
  const start = Number(((base % count) + count) % count);
  return neighbors.concat(rest.slice(start), rest.slice(0, start));
}

export interface ForeignMaterial {
  templateId: bigint;
  regionId: bigint;
  rarity: string;
  name: string;
  kind: string;
}

/** Higher is rarer; an unknown rarity ranks below common. */
function rarityRank(rarity: string): number {
  return (QUALITY_TIERS as readonly string[]).indexOf(rarity);
}

/**
 * The foreign materials offered to the model: at most 4 per region, the rarest first (rare,
 * uncommon, common), then by ascending template id. Regions come out in ascending id order; a
 * repeated template id collapses. The result does not depend on the input order.
 */
export function foreignOffer<T extends ForeignMaterial>(materials: readonly T[]): T[] {
  const seen = new Set<bigint>();
  const valid: T[] = [];
  for (const m of Array.isArray(materials) ? materials : []) {
    if (m === null || typeof m !== 'object') continue;
    if (typeof m.templateId !== 'bigint' || typeof m.regionId !== 'bigint') continue;
    if (seen.has(m.templateId)) continue;
    seen.add(m.templateId);
    valid.push(m);
  }
  valid.sort(
    (a, b) =>
      compareBig(a.regionId, b.regionId) ||
      rarityRank(b.rarity) - rarityRank(a.rarity) ||
      compareBig(a.templateId, b.templateId),
  );
  const taken = new Map<bigint, number>();
  const out: T[] = [];
  for (const m of valid) {
    const n = taken.get(m.regionId) ?? 0;
    if (n >= REGION_ECONOMY_COUNTS.maxOfferPerRegion) continue;
    taken.set(m.regionId, n + 1);
    out.push(m);
  }
  return out;
}

// ---------------------------------------------------------------------------
// KINDS
// ---------------------------------------------------------------------------

/**
 * The recipe category a primary material kind makes (metal weapon, hide and cloth armor, trinket
 * accessory, edible consumable), or null for wood and base (secondary only) and anything unknown.
 */
export function categoryForKind(kind: string): RecipeCategory | null {
  for (const category of RECIPE_CATEGORY_ORDER) {
    if ((PRIMARY_KINDS[category] as readonly string[]).indexOf(asText(kind)) !== -1) return category;
  }
  return null;
}

// ---------------------------------------------------------------------------
// ITEM NUMBERS (every number of a generated item comes from here and recipe_rules; none from model text)
// ---------------------------------------------------------------------------

/**
 * The stat factor of each rarity, in percent (RESEARCH A4; ties to backlog 999.12). A generated
 * recipe output's stats are the shared form-and-growth numbers times this factor, floored.
 */
export const RARITY_STAT_PCT: Readonly<Record<QualityTier, bigint>> = Object.freeze({
  common: 100n,
  uncommon: 110n,
  rare: 125n,
  epic: 145n,
  legendary: 170n,
});

/** value * (the rarity's percent) / 100, floored. An unknown rarity is common. */
export function scaleStat(value: bigint, rarity: string): bigint {
  const pct = isQualityTier(rarity) ? RARITY_STAT_PCT[rarity] : 100n;
  return (value * pct) / 100n;
}

function atLeastOne(level: bigint): bigint {
  return typeof level === 'bigint' && level > 1n ? level : 1n;
}

/** The item tier of a generated template, max(1, level / 3). It keeps the vendor level bands working. */
export function materialItemTier(level: bigint): bigint {
  const tier = atLeastOne(level) / 3n;
  return tier < 1n ? 1n : tier;
}

function rarityOf(rarity: string): QualityTier {
  return isQualityTier(rarity) ? rarity : 'common';
}

const MATERIAL_VALUE_BY_RARITY: Readonly<Record<QualityTier, bigint>> = Object.freeze({
  common: 2n,
  uncommon: 4n,
  rare: 8n,
  epic: 16n,
  legendary: 32n,
});

const OUTPUT_VALUE_BY_RARITY: Readonly<Record<QualityTier, bigint>> = Object.freeze({
  common: 10n,
  uncommon: 20n,
  rare: 40n,
  epic: 80n,
  legendary: 160n,
});

const SCROLL_VALUE_BY_RARITY: Readonly<Record<QualityTier, bigint>> = Object.freeze({
  common: 10n,
  uncommon: 10n,
  rare: 25n,
  epic: 50n,
  legendary: 100n,
});

/** The item_template columns except id, with the plain-material defaults. */
function blankTemplate(name: string, description: string, over: Partial<GeneratedItemTemplate>): GeneratedItemTemplate {
  return {
    name: asText(name),
    slot: 'material',
    armorType: 'none',
    rarity: 'common',
    tier: 1n,
    isJunk: false,
    vendorValue: 1n,
    requiredLevel: 1n,
    allowedClasses: 'any',
    strBonus: 0n,
    dexBonus: 0n,
    chaBonus: 0n,
    wisBonus: 0n,
    intBonus: 0n,
    hpBonus: 0n,
    manaBonus: 0n,
    armorClassBonus: 0n,
    magicResistanceBonus: 0n,
    weaponBaseDamage: 0n,
    weaponDps: 0n,
    weaponType: '',
    stackable: false,
    wellFedDurationMicros: 0n,
    wellFedBuffType: '',
    wellFedBuffMagnitude: 0n,
    description,
    ...over,
  };
}

/** The cleaned model text, or the rule text when nothing usable is left. */
function textOrRule(raw: string, rule: string): string {
  const cleaned = cleanDescription(raw);
  return cleaned === '' ? rule : cleaned;
}

function withArticle(word: string): string {
  const lower = word.toLowerCase();
  if (/s$/.test(lower)) return `A pair of ${lower}`;
  return `${/^[aeiou]/.test(lower) ? 'An' : 'A'} ${lower}`;
}

// ---------------------------------------------------------------------------
// MATERIALS AND TROPHIES
// ---------------------------------------------------------------------------

/**
 * A regional gatherable or drop material: slot material (so the research bag filter admits it),
 * stackable, tier from the area level, value from the rarity plus a third of the area level.
 */
export function materialTemplate(input: {
  name: string;
  description: string;
  rarity: string;
  areaLevel: bigint;
  kind?: string;
}): GeneratedItemTemplate {
  const rarity = rarityOf(input.rarity);
  const level = atLeastOne(input.areaLevel);
  const kind = asText(input.kind);
  return blankTemplate(
    input.name,
    textOrRule(input.description, kind === '' ? 'A material found in this region.' : `A ${kind} material found in this region.`),
    {
      slot: 'material',
      rarity,
      tier: materialItemTier(level),
      vendorValue: MATERIAL_VALUE_BY_RARITY[rarity] + level / 3n,
      stackable: true,
    },
  );
}

/** A trophy a creature drops: a junk item that only a vendor wants. */
export function trophyTemplate(input: { name: string; description: string; level: bigint }): GeneratedItemTemplate {
  const level = atLeastOne(input.level);
  return blankTemplate(input.name, textOrRule(input.description, 'A keepsake taken from a fallen foe.'), {
    slot: 'junk',
    isJunk: true,
    vendorValue: 2n + level / 2n,
    stackable: true,
  });
}

// ---------------------------------------------------------------------------
// GEAR
// ---------------------------------------------------------------------------

const ARMOR_SLOTS: readonly string[] = ['chest', 'legs', 'boots'];
const ARMOR_TYPES: readonly string[] = ['cloth', 'leather', 'chain', 'plate'];

/**
 * A model gear choice made valid. Slots are weapon, chest, legs and boots, armor types cloth,
 * leather, chain and plate. A weapon keeps a known weapon type (else sword) and has armor type
 * 'none'; armor keeps a valid armor type (else leather) and has weapon type 'none'; an unknown
 * slot becomes a sword.
 */
export function repairGear(input: { slot: string; weaponType: string; armorType: string }): {
  slot: string;
  weaponType: string;
  armorType: string;
} {
  const slot = input !== null && typeof input === 'object' ? asText(input.slot) : '';
  if (ARMOR_SLOTS.indexOf(slot) !== -1) {
    const armorType = asText(input.armorType);
    return { slot, weaponType: 'none', armorType: ARMOR_TYPES.indexOf(armorType) !== -1 ? armorType : 'leather' };
  }
  const weaponType = slot === 'weapon' ? asText(input.weaponType) : '';
  const known = WEAPON_FORMS.some((f) => f.weaponType === weaponType);
  return { slot: 'weapon', weaponType: known ? weaponType : 'sword', armorType: 'none' };
}

/** The extra armor class of chain and plate over leather, per slot. */
const ARMOR_TYPE_STEP: Readonly<Record<string, bigint>> = { cloth: 0n, leather: 0n, chain: 1n, plate: 2n };

/**
 * A creature's gear drop: the weapon or armor form numbers plus the shared growth, rarity common
 * (the loot roll sets the dropped quality).
 * [ASSUMED] chain and plate step by one over leather per slot, since only cloth and leather forms exist.
 */
export function gearTemplate(input: {
  name: string;
  description: string;
  slot: string;
  weaponType: string;
  armorType: string;
  level: bigint;
  regionName?: string;
}): GeneratedItemTemplate {
  const level = atLeastOne(input.level);
  const gear = repairGear(input);
  const region = cleanItemName(asText(input.regionName));
  const place = region === '' ? 'this region' : region;
  const common = {
    tier: materialItemTier(level),
    requiredLevel: level,
    vendorValue: 5n + 2n * level,
  };
  if (gear.slot === 'weapon') {
    const form = WEAPON_FORMS.find((f) => f.weaponType === gear.weaponType) ?? WEAPON_FORMS[2];
    const growth = weaponGrowth(level);
    return blankTemplate(
      input.name,
      textOrRule(input.description, `${withArticle(form.word)} carried in ${place}.`),
      {
        ...common,
        slot: 'mainHand',
        weaponType: form.weaponType,
        weaponBaseDamage: form.baseDamage + growth,
        weaponDps: form.dps + growth,
      },
    );
  }
  const form = ARMOR_FORMS.find((f) => f.slot === gear.slot) ?? ARMOR_FORMS[0];
  const cloth = gear.armorType === 'cloth';
  const baseAc = (cloth ? form.baseAc.cloth : form.baseAc.leather) + ARMOR_TYPE_STEP[gear.armorType];
  return blankTemplate(
    input.name,
    textOrRule(input.description, `${withArticle(cloth ? form.words.cloth : form.words.leather)} carried in ${place}.`),
    {
      ...common,
      slot: form.slot,
      armorType: gear.armorType,
      armorClassBonus: baseAc + armorGrowth(level),
    },
  );
}

// ---------------------------------------------------------------------------
// RECIPE OUTPUTS AND SCROLLS
// ---------------------------------------------------------------------------

/** The accessory stat a regional output picks by (regionId + index) mod 4, and its level 1 amount. */
const OUTPUT_ACCESSORY_STATS: readonly { stat: 'hpBonus' | 'wisBonus' | 'intBonus' | 'magicResistanceBonus'; base: bigint }[] = [
  { stat: 'hpBonus', base: 3n },
  { stat: 'wisBonus', base: 1n },
  { stat: 'intBonus', base: 1n },
  { stat: 'magicResistanceBonus', base: 1n },
];

/**
 * The armor slot an item name implies, by word (review B WR-02): chest, legs or boots (the feet slot of
 * this codebase). Only the slots of ARMOR_FORMS appear.
 */
const ARMOR_SLOT_WORDS: Readonly<Record<string, string>> = Object.freeze({
  robe: 'chest',
  vest: 'chest',
  jerkin: 'chest',
  tunic: 'chest',
  cuirass: 'chest',
  coat: 'chest',
  mantle: 'chest',
  sash: 'chest',
  shirt: 'chest',
  hauberk: 'chest',
  breastplate: 'chest',
  doublet: 'chest',
  trousers: 'legs',
  pants: 'legs',
  leggings: 'legs',
  greaves: 'legs',
  breeches: 'legs',
  kilt: 'legs',
  boots: 'boots',
  boot: 'boots',
  shoes: 'boots',
  shoe: 'boots',
  sandals: 'boots',
  sandal: 'boots',
  slippers: 'boots',
  slipper: 'boots',
  treads: 'boots',
});

/**
 * The armor slot of a cleaned item name: the last word that names a piece of armor wins (so "Sash of
 * Boots" is boots), case-insensitive, with a plural or singular form; null when no word does. The
 * recipe output then takes that slot instead of the index rule, so the name cannot contradict it.
 */
export function armorSlotFromName(name: string): string | null {
  const words = asText(name).toLowerCase().split(/[^a-z]+/).filter((w) => w !== '');
  for (let i = words.length - 1; i >= 0; i--) {
    const word = words[i];
    for (const form of [word, word.replace(/s$/, ''), `${word}s`]) {
      if (Object.prototype.hasOwnProperty.call(ARMOR_SLOT_WORDS, form)) return ARMOR_SLOT_WORDS[form];
    }
  }
  return null;
}

/**
 * The item a regional recipe makes. tier is the recipe's rarity. The form comes from the secondary
 * kind (weapon), the primary kind and the slot the name implies, else the index (armor, review B
 * WR-02), the secondary kind and a region-and-index pick (accessory) or the index (food); the numbers
 * are the shared forms and growth times the rarity factor. An unknown category is treated as a weapon.
 */
export function regionalOutputTemplate(input: {
  name: string;
  description: string;
  category: RecipeCategory;
  tier: string;
  primaryKind: string;
  secondaryKind: string;
  level: bigint;
  index: number;
  regionId: bigint;
}): GeneratedItemTemplate {
  const rarity = rarityOf(input.tier);
  const level = atLeastOne(input.level);
  const index = Number.isInteger(input.index) && input.index >= 0 ? input.index : 0;
  const regionId = typeof input.regionId === 'bigint' ? input.regionId : 0n;
  const secondaryKind = asText(input.secondaryKind);
  const common = {
    rarity,
    tier: materialItemTier(level),
    requiredLevel: level,
    vendorValue: OUTPUT_VALUE_BY_RARITY[rarity] + level,
  };
  const made = (rule: string): string => `${rule} made from regional materials.`;

  if (input.category === 'armor') {
    const type: 'cloth' | 'leather' = asText(input.primaryKind) === 'hide' ? 'leather' : 'cloth';
    const named = armorSlotFromName(input.name);
    const form = (named !== null ? ARMOR_FORMS.find((f) => f.slot === named) : undefined) ?? ARMOR_FORMS[index % ARMOR_FORMS.length];
    return blankTemplate(input.name, textOrRule(input.description, made(withArticle(form.words[type]))), {
      ...common,
      slot: form.slot,
      armorType: type,
      armorClassBonus: scaleStat(form.baseAc[type] + armorGrowth(level), rarity),
    });
  }
  if (input.category === 'accessory') {
    const form = ACCESSORY_FORMS.find((f) => f.slot === (secondaryKind === 'metal' ? 'earrings' : 'neck')) ?? ACCESSORY_FORMS[0];
    const pick = OUTPUT_ACCESSORY_STATS[Number((regionId + BigInt(index)) % BigInt(OUTPUT_ACCESSORY_STATS.length))];
    return blankTemplate(input.name, textOrRule(input.description, made(withArticle(form.word))), {
      ...common,
      slot: form.slot,
      [pick.stat]: scaleStat(pick.base * levelStep(level), rarity),
    });
  }
  if (input.category === 'consumable') {
    const form = FOOD_FORMS[index % FOOD_FORMS.length];
    return blankTemplate(input.name, textOrRule(input.description, made(withArticle(form.word))), {
      ...common,
      slot: 'food',
      stackable: true,
      wellFedDurationMicros: FOOD_DURATION_MICROS,
      wellFedBuffType: form.buffType,
      wellFedBuffMagnitude: scaleStat(levelStep(level), rarity),
    });
  }
  const startType = Object.prototype.hasOwnProperty.call(WEAPON_START, secondaryKind) ? WEAPON_START[secondaryKind] : 'dagger';
  const form = WEAPON_FORMS.find((f) => f.weaponType === startType) ?? WEAPON_FORMS[0];
  const growth = weaponGrowth(level);
  return blankTemplate(input.name, textOrRule(input.description, made(withArticle(form.word))), {
    ...common,
    slot: 'mainHand',
    weaponType: form.weaponType,
    weaponBaseDamage: scaleStat(form.baseDamage + growth, rarity),
    weaponDps: scaleStat(form.dps + growth, rarity),
  });
}

/**
 * The scroll that teaches a rare-or-better recipe, in the old convention: "Scroll: <recipe>", slot
 * resource, rarity = the recipe tier, stackable.
 */
export function scrollTemplate(recipeName: string, tier: string): GeneratedItemTemplate {
  const rarity = rarityOf(tier);
  const recipe = asText(recipeName);
  return blankTemplate(`Scroll: ${recipe}`, `Teaches the ${recipe} crafting recipe when used.`, {
    slot: 'resource',
    rarity,
    vendorValue: SCROLL_VALUE_BY_RARITY[rarity],
    stackable: true,
  });
}
