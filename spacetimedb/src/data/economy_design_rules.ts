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
import { QUALITY_TIERS, type QualityTier } from './mechanical_vocabulary';
import { PRIMARY_KINDS, RECIPE_CATEGORY_ORDER, type RecipeCategory } from './recipe_rules';

// ---------------------------------------------------------------------------
// NAMES AND DESCRIPTIONS
// ---------------------------------------------------------------------------

const MAX_NAME_WORDS = 4;
const MAX_NAME_CHARS = 40;
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
 * to the bigint paths in REGION_ECONOMY_BIGINT_PATHS; the model writes handles (G1..G3 for its
 * gatherables, E1.. for enemies, D:E1 for an enemy's drop, F1.. for foreign materials).
 */
export interface RegionEconomyInput {
  mode: 'region' | 'enemy';
  regionId: bigint;
  regionName: string;
  biome: string;
  areaLevel: number;
  dominantFaction: string;
  landmarks: string[];
  threats: string[];
  terrains: string[];
  enemies: RegionEconomyEnemy[];
  recipeSlots: { tier: string; foreignRegionIndexes: number[] }[];
  foreignRegions: RegionEconomyForeignRegion[];
  foreign: RegionEconomyForeign[];
  existingMaterials: { name: string; kind: string }[];
}

/** The paths of a RegionEconomyInput whose values are bigint (the route copies this list). */
export const REGION_ECONOMY_BIGINT_PATHS: readonly string[] = Object.freeze([
  'regionId',
  'enemies[].templateId',
  'foreignRegions[].regionId',
  'foreign[].templateId',
]);

/** The "Small" size of a region economy. */
export const REGION_ECONOMY_COUNTS = Object.freeze({
  gatherables: 3,
  recipes: 3,
  lootEntriesMin: 4,
  lootEntriesMax: 6,
  maxForeignRegions: 3,
  maxOfferPerRegion: 4,
});

/** The rarity of each gatherable slot (G1, G2, G3). */
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
