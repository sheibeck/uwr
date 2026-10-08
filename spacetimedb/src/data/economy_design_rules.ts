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
