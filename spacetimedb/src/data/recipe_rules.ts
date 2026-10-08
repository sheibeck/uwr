// recipe_rules.ts
// Rule-based recipe generation (Phase 50 plan 25, owner decision "recipe generation", 2026-10-06).
// Discover recipes at a crafting station builds recipes from the materials a character carries:
// the material kind picks the category, the area level sets the output level, names are composed
// from vocabulary words, and the craft quality of a gear recipe comes later from the primary
// material's tier (craftQualityForMaterialName). Nothing here asks a language model for anything.
// The description of a generated output is built from rules too (generatedDescription): what the
// item is, from its category and form, and what it does, from its stats.
//
// Users: the research_recipes reducer (reducers/items_crafting.ts) and the client crafting model
// test (src/crafting/generatedRecipes.test.ts, through the @game-data alias).
//
// Import-free, ES2020 only, never throws, and a pure function of its arguments: no clock and no
// source of chance. Names of Object prototype keys are never looked up through a plain index.

export type MaterialKind = 'metal' | 'hide' | 'cloth' | 'trinket' | 'wood' | 'edible' | 'base';
export type RecipeCategory = 'weapon' | 'armor' | 'accessory' | 'consumable';

/** Every material kind, in the MaterialKind order (the region economy design rules and the validator iterate it). */
export const MATERIAL_KIND_VALUES: readonly MaterialKind[] = Object.freeze([
  'metal',
  'hide',
  'cloth',
  'trinket',
  'wood',
  'edible',
  'base',
] as MaterialKind[]);

// ---------------------------------------------------------------------------
// MATERIAL KINDS
// ---------------------------------------------------------------------------

/**
 * Material key to kind. Essences and the nine crafting reagents are deliberately absent: planCraft
 * takes them at craft time, so they are never recipe requirements.
 */
export const MATERIAL_KINDS: Readonly<Record<string, MaterialKind>> = {
  // Ores and the jewelry trio follow getMaterialForSalvage and the MATERIAL_DEFS descriptions:
  // weapons and heavy armor salvage to ores, light armor to hides, jewelry to bone, spirit and void.
  copper_ore: 'metal',
  iron_ore: 'metal',
  darksteel_ore: 'metal',
  rough_hide: 'hide',
  tanned_leather: 'hide',
  shadowhide: 'hide',
  moonweave_cloth: 'cloth',
  bone_shard: 'trinket',
  spirit_essence: 'trinket',
  void_crystal: 'trinket',
  // The starter material descriptions (helpers/items.ts BASIC_RESOURCES): "A jagged shard of iron",
  // "Salvaged fabric scraps", "Fibrous plant stalks used in cloth-making".
  iron_shard: 'metal',
  scrap_cloth: 'cloth',
  flax: 'cloth',
  // The Traveler Necklace is "a simple cord with a polished stone" (equipment_rules.ts).
  stone: 'trinket',
  // The deleted seed recipes (git show 9ac55586^:spacetimedb/src/data/crafting_materials.ts:243-258):
  // wood was a haft or a torch shaft; herbs, berries, roots, mushrooms and bitter herbs were food;
  // clear water, murky water and salt were the food bases.
  wood: 'wood',
  herbs: 'edible',
  bitter_herbs: 'edible',
  wild_berries: 'edible',
  mushrooms: 'edible',
  root_vegetable: 'edible',
  clear_water: 'base',
  murky_water: 'base',
  salt: 'base',
};

/**
 * Starter materials with no kind. The old recipes used them only for utility outputs (torch,
 * whetstone, kindling, rope, charcoal, poison) that have no data-driven effect today.
 */
export const UNMAPPED_MATERIAL_KEYS: readonly string[] = [
  'resin',
  'sand',
  'dry_grass',
  'peat',
  'lamp_oil',
  'ancient_dust',
];

/** Template name to material key: lowercase, each whitespace run becomes one underscore. */
export function materialKey(name: string): string {
  return (typeof name === 'string' ? name : '').toLowerCase().replace(/\s+/g, '_');
}

function has<T>(map: Readonly<Record<string, T>>, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(map, key);
}

/** The kind of a material by display name, or null for an unmapped, unknown or prototype name. */
export function materialKind(name: string): MaterialKind | null {
  const key = materialKey(name);
  return key !== '' && has(MATERIAL_KINDS, key) ? MATERIAL_KINDS[key] : null;
}

// ---------------------------------------------------------------------------
// CATEGORY RULES
// ---------------------------------------------------------------------------

/** The client RECIPE_FILTERS order. */
export const RECIPE_CATEGORY_ORDER: readonly RecipeCategory[] = ['weapon', 'armor', 'accessory', 'consumable'];

export const PRIMARY_KINDS: Readonly<Record<RecipeCategory, readonly MaterialKind[]>> = {
  weapon: ['metal'],
  armor: ['hide', 'cloth'],
  accessory: ['trinket'],
  consumable: ['edible'],
};

/**
 * The secondary kinds in preference order: a weapon takes a grip wrap or a haft (the old seed gear
 * always took Rough Hide second), armor a lining or a plate, an accessory a cord, a thong or a
 * setting, and food a base or a second edible.
 */
export const SECONDARY_KINDS: Readonly<Record<RecipeCategory, readonly MaterialKind[]>> = {
  weapon: ['hide', 'cloth', 'wood'],
  armor: ['hide', 'cloth', 'metal'],
  accessory: ['cloth', 'hide', 'metal'],
  consumable: ['base', 'edible'],
};

/** Counts from the old seed recipes: weapon 3/1, armor 3/1, accessory 2/1, food 2/1. */
export const REQUIRED_COUNTS: Readonly<Record<RecipeCategory, { primary: bigint; secondary: bigint }>> = {
  weapon: { primary: 3n, secondary: 1n },
  armor: { primary: 3n, secondary: 1n },
  accessory: { primary: 2n, secondary: 1n },
  consumable: { primary: 2n, secondary: 1n },
};

export const MAX_NEW_RECIPES_PER_DISCOVER = 3;

// ---------------------------------------------------------------------------
// FORMS (the item a recipe makes), in the order the name walk visits them
// ---------------------------------------------------------------------------

/**
 * Weapon forms in WEAPON_TYPES order. Level 1 damage and dps are the starter table of
 * ensureStarterItemTemplates (helpers/items.ts); a wand takes the starter fallback 3/5.
 */
export const WEAPON_FORMS: readonly { weaponType: string; word: string; baseDamage: bigint; dps: bigint }[] = [
  { weaponType: 'dagger', word: 'Dagger', baseDamage: 4n, dps: 5n },
  { weaponType: 'rapier', word: 'Rapier', baseDamage: 4n, dps: 5n },
  { weaponType: 'sword', word: 'Sword', baseDamage: 6n, dps: 7n },
  { weaponType: 'blade', word: 'Blade', baseDamage: 6n, dps: 7n },
  { weaponType: 'mace', word: 'Mace', baseDamage: 6n, dps: 7n },
  { weaponType: 'axe', word: 'Axe', baseDamage: 7n, dps: 8n },
  { weaponType: 'bow', word: 'Bow', baseDamage: 8n, dps: 9n },
  { weaponType: 'staff', word: 'Staff', baseDamage: 8n, dps: 9n },
  { weaponType: 'greatsword', word: 'Greatsword', baseDamage: 10n, dps: 11n },
  { weaponType: 'wand', word: 'Wand', baseDamage: 3n, dps: 5n },
];

/** The start form of a weapon by secondary kind: a cloth wrap suits a dagger, a hide grip a sword, a haft a staff. */
const WEAPON_START: Readonly<Record<string, string>> = {
  cloth: 'dagger',
  hide: 'sword',
  wood: 'staff',
};

/** Armor forms from STARTER_ARMOR (the Apprentice and Scout sets). Armor always starts at the chest. */
export const ARMOR_FORMS: readonly {
  slot: string;
  words: { cloth: string; leather: string };
  baseAc: { cloth: bigint; leather: bigint };
}[] = [
  { slot: 'chest', words: { cloth: 'Robe', leather: 'Jerkin' }, baseAc: { cloth: 2n, leather: 3n } },
  { slot: 'legs', words: { cloth: 'Trousers', leather: 'Pants' }, baseAc: { cloth: 1n, leather: 2n } },
  { slot: 'boots', words: { cloth: 'Boots', leather: 'Boots' }, baseAc: { cloth: 1n, leather: 2n } },
];

/** Accessory forms. A cloth or hide secondary starts at the neck; a metal setting starts at the earrings. */
export const ACCESSORY_FORMS: readonly { slot: string; word: string }[] = [
  { slot: 'neck', word: 'Pendant' },
  { slot: 'earrings', word: 'Ring' },
];

/**
 * The stat of an accessory by trinket key, at level 1. The jewelry trio uses the first MATERIAL_DEFS
 * affinity stat of each; stone follows the Traveler Necklace (wisdom).
 */
export const ACCESSORY_STATS: Readonly<Record<string, { stat: string; base: bigint }>> = {
  bone_shard: { stat: 'hpBonus', base: 3n },
  spirit_essence: { stat: 'intBonus', base: 1n },
  void_crystal: { stat: 'magicResistanceBonus', base: 1n },
  stone: { stat: 'wisBonus', base: 1n },
};

/** Food forms: the five buffs eat_food maps (hunger.ts), in the name-walk order. */
export const FOOD_FORMS: readonly { buffType: string; word: string }[] = [
  { buffType: 'health_regen', word: 'Draught' },
  { buffType: 'mana_regen', word: 'Broth' },
  { buffType: 'stamina_regen', word: 'Stew' },
  { buffType: 'str', word: 'Roast' },
  { buffType: 'dex', word: 'Salad' },
];

/** The name word and starting buff of each edible, from the old seed food recipes. */
export const EDIBLE_WORDS: Readonly<Record<string, { word: string; buffType: string }>> = {
  herbs: { word: 'Herbal', buffType: 'health_regen' },
  bitter_herbs: { word: 'Bitter', buffType: 'health_regen' },
  wild_berries: { word: 'Berry', buffType: 'mana_regen' },
  root_vegetable: { word: 'Root', buffType: 'str' },
  mushrooms: { word: 'Mushroom', buffType: 'stamina_regen' },
};

export const FOOD_DURATION_MICROS = 2_700_000_000n;

// ---------------------------------------------------------------------------
// LEVEL
// ---------------------------------------------------------------------------

/** The area level of a location: max(1, floor(dangerMultiplier / 100) + levelOffset). */
export function areaLevel(dangerMultiplier: bigint, levelOffset: bigint): bigint {
  const level = dangerMultiplier / 100n + levelOffset;
  return level < 1n ? 1n : level;
}

/**
 * The per-level step of a secondary stat, 1 at levels 1 to 4, 2 at 5 to 9, 3 at 10. Growth follows the
 * quest reward budget slope (2L + 5, of which a tenth goes to the secondary stat; reducers/quests.ts),
 * and level 1 equals the starter gear.
 */
export function levelStep(level: bigint): bigint {
  const l = level < 1n ? 1n : level;
  return l / 5n + 1n;
}

export function weaponGrowth(level: bigint): bigint {
  const l = level < 1n ? 1n : level;
  return (6n * (l - 1n)) / 5n;
}

export function armorGrowth(level: bigint): bigint {
  const l = level < 1n ? 1n : level;
  return (4n * (l - 1n)) / 5n;
}

// ---------------------------------------------------------------------------
// CANDIDATES
// ---------------------------------------------------------------------------

export function recipeKey(category: RecipeCategory, primaryKey: string, secondaryKey: string, level: bigint): string {
  return `gen:${category}:${primaryKey}+${secondaryKey}:L${level}`;
}

export interface BagMaterial {
  templateId: bigint;
  name: string;
  tier: bigint;
  vendorValue: bigint;
  count: bigint;
}

export interface CandidatePart {
  templateId: bigint;
  name: string;
  key: string;
  tier: bigint;
  vendorValue: bigint;
  count: bigint;
}

export interface RecipeCandidate {
  key: string;
  category: RecipeCategory;
  level: bigint;
  primary: CandidatePart;
  secondary: CandidatePart;
}

interface KindedPart extends CandidatePart {
  kind: MaterialKind;
}

function compareText(a: string, b: string): number {
  const x = a.toLowerCase();
  const y = b.toLowerCase();
  return x < y ? -1 : x > y ? 1 : 0;
}

function compareBig(a: bigint, b: bigint): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

/** Tier descending, then name ascending (case-insensitive), then template id ascending. */
function compareParts(a: KindedPart, b: KindedPart): number {
  return compareBig(b.tier, a.tier) || compareText(a.name, b.name) || compareBig(a.templateId, b.templateId);
}

function isBagMaterial(value: unknown): value is BagMaterial {
  if (value === null || typeof value !== 'object') return false;
  const m = value as BagMaterial;
  return (
    typeof m.templateId === 'bigint' &&
    typeof m.name === 'string' &&
    typeof m.count === 'bigint' &&
    typeof m.tier === 'bigint' &&
    typeof m.vendorValue === 'bigint'
  );
}

/** The held materials of a mapped kind: merged by template, then one template per key (the lowest id). */
function heldParts(materials: readonly BagMaterial[]): KindedPart[] {
  const valid = (Array.isArray(materials) ? materials : []).filter(isBagMaterial);
  valid.sort(
    (a, b) =>
      compareBig(a.templateId, b.templateId) ||
      compareText(a.name, b.name) ||
      compareBig(a.tier, b.tier) ||
      compareBig(a.vendorValue, b.vendorValue) ||
      compareBig(a.count, b.count),
  );
  const merged: KindedPart[] = [];
  for (const entry of valid) {
    const last = merged[merged.length - 1];
    if (last && last.templateId === entry.templateId) {
      last.count += entry.count;
      continue;
    }
    const kind = materialKind(entry.name);
    if (kind === null) continue;
    merged.push({
      templateId: entry.templateId,
      name: entry.name,
      key: materialKey(entry.name),
      tier: entry.tier,
      vendorValue: entry.vendorValue,
      count: entry.count,
      kind,
    });
  }
  const byKey = new Map<string, KindedPart>();
  for (const part of merged) {
    if (part.count <= 0n) continue;
    const seen = byKey.get(part.key);
    if (!seen || part.templateId < seen.templateId) byKey.set(part.key, part);
  }
  return [...byKey.values()];
}

/** A candidate part carries the count the recipe consumes, never the count held. */
function plain(part: KindedPart, count: bigint): CandidatePart {
  return {
    templateId: part.templateId,
    name: part.name,
    key: part.key,
    tier: part.tier,
    vendorValue: part.vendorValue,
    count,
  };
}

/**
 * The recipes a bag supports at an area level. Per category, each primary (a material of a primary
 * kind held in the required count) takes its single best secondary: a different material of a
 * secondary kind in the required count, by kind preference, then tier, then name. A primary with no
 * secondary gives nothing. The four category lists are interleaved by rank, rank 0 first, so a
 * capped Discover spreads over the categories.
 */
export function recipeCandidates(materials: readonly BagMaterial[], level: bigint): RecipeCandidate[] {
  const held = heldParts(materials);
  const lists: RecipeCandidate[][] = [];
  for (const category of RECIPE_CATEGORY_ORDER) {
    const need = REQUIRED_COUNTS[category];
    const primaries = held
      .filter((p) => PRIMARY_KINDS[category].indexOf(p.kind) !== -1 && p.count >= need.primary)
      .sort(compareParts);
    const list: RecipeCandidate[] = [];
    for (const primary of primaries) {
      const secondaries = held
        .filter(
          (s) =>
            s.key !== primary.key && SECONDARY_KINDS[category].indexOf(s.kind) !== -1 && s.count >= need.secondary,
        )
        .sort(
          (a, b) =>
            SECONDARY_KINDS[category].indexOf(a.kind) - SECONDARY_KINDS[category].indexOf(b.kind) ||
            compareParts(a, b),
        );
      const secondary = secondaries[0];
      if (!secondary) continue;
      list.push({
        key: recipeKey(category, primary.key, secondary.key, level),
        category,
        level,
        primary: plain(primary, need.primary),
        secondary: plain(secondary, need.secondary),
      });
    }
    lists.push(list);
  }
  const out: RecipeCandidate[] = [];
  let longest = 0;
  for (const list of lists) if (list.length > longest) longest = list.length;
  for (let rank = 0; rank < longest; rank++) {
    for (const list of lists) if (rank < list.length) out.push(list[rank]);
  }
  return out;
}

// ---------------------------------------------------------------------------
// OUTPUT
// ---------------------------------------------------------------------------

/** The material word of a gear name: the display name without a trailing " Ore" word. */
function materialWord(name: string): string {
  const trimmed = name.trim();
  return /\sOre$/i.test(trimmed) ? trimmed.replace(/\s+Ore$/i, '') : trimmed;
}

interface Chosen {
  name: string;
  slot: string;
  armorType: string;
  weaponType: string;
  baseDamage: bigint;
  dps: bigint;
  armorClass: bigint;
  buffType: string;
  /** The form word as the name uses it. */
  formWord: string;
}

/** The first free name walking the forms cyclically from the start form; a numeral when all are taken. */
function walk<F>(
  forms: readonly F[],
  start: number,
  nameOf: (form: F) => string,
  isNameTaken: (name: string) => boolean,
): { form: F; name: string } {
  const count = forms.length;
  for (let step = 0; step < count; step++) {
    const form = forms[(start + step) % count];
    const name = nameOf(form);
    if (!isNameTaken(name)) return { form, name };
  }
  const form = forms[start % count];
  const stem = nameOf(form);
  let n = 2;
  while (isNameTaken(`${stem} ${n}`)) n += 1;
  return { form, name: `${stem} ${n}` };
}

function indexOfForm<F>(forms: readonly F[], match: (form: F) => boolean): number {
  for (let i = 0; i < forms.length; i++) if (match(forms[i])) return i;
  return 0;
}

function choose(candidate: RecipeCandidate, isNameTaken: (name: string) => boolean): Chosen {
  const { category, primary, secondary, level } = candidate;
  const base: Chosen = {
    name: '',
    slot: '',
    armorType: 'none',
    weaponType: '',
    baseDamage: 0n,
    dps: 0n,
    armorClass: 0n,
    buffType: '',
    formWord: '',
  };
  const secondaryKind = materialKind(secondary.name);
  const primaryKind = materialKind(primary.name);
  const word = materialWord(primary.name);

  if (category === 'weapon') {
    const startType = (secondaryKind !== null && has(WEAPON_START, secondaryKind) ? WEAPON_START[secondaryKind] : 'dagger');
    const start = indexOfForm(WEAPON_FORMS, (f) => f.weaponType === startType);
    const { form, name } = walk(WEAPON_FORMS, start, (f) => `${word} ${f.word}`, isNameTaken);
    const growth = weaponGrowth(level);
    return {
      ...base,
      name,
      slot: 'mainHand',
      formWord: form.word,
      weaponType: form.weaponType,
      baseDamage: form.baseDamage + growth,
      dps: form.dps + growth,
    };
  }
  if (category === 'armor') {
    const type: 'cloth' | 'leather' = primaryKind === 'hide' ? 'leather' : 'cloth';
    const { form, name } = walk(ARMOR_FORMS, 0, (f) => `${word} ${f.words[type]}`, isNameTaken);
    return {
      ...base,
      name,
      slot: form.slot,
      formWord: form.words[type],
      armorType: type,
      armorClass: form.baseAc[type] + armorGrowth(level),
    };
  }
  if (category === 'accessory') {
    const start = secondaryKind === 'metal' ? indexOfForm(ACCESSORY_FORMS, (f) => f.slot === 'earrings') : 0;
    const { form, name } = walk(ACCESSORY_FORMS, start, (f) => `${word} ${f.word}`, isNameTaken);
    return { ...base, name, slot: form.slot, formWord: form.word };
  }
  // consumable
  const edible = has(EDIBLE_WORDS, primary.key) ? EDIBLE_WORDS[primary.key] : { word, buffType: 'health_regen' };
  const startBuff = secondaryKind === 'edible' ? 'dex' : edible.buffType;
  const start = indexOfForm(FOOD_FORMS, (f) => f.buffType === startBuff);
  const { form, name } = walk(FOOD_FORMS, start, (f) => `${edible.word} ${f.word}`, isNameTaken);
  return { ...base, name, slot: 'food', formWord: form.word, buffType: form.buffType };
}

// ---------------------------------------------------------------------------
// DESCRIPTIONS (rule-based: what the item is and what it does; no language model, no prompt)
// ---------------------------------------------------------------------------

/**
 * The eat_food line words and the client effect line words for each food buff type. One map, so the
 * server's "You eat the ... (+1 strength)" line and the client text can never disagree.
 */
export const FOOD_BUFF_LABELS: Readonly<Record<string, string>> = {
  str: 'strength',
  dex: 'dexterity',
  mana_regen: 'mana regeneration',
  stamina_regen: 'stamina regeneration',
  health_regen: 'health regeneration',
};

/** The words of the accessory stat columns, as the player reads them. */
const STAT_WORDS: Readonly<Record<string, string>> = {
  hpBonus: 'health',
  intBonus: 'intelligence',
  wisBonus: 'wisdom',
  magicResistanceBonus: 'magic resistance',
  strBonus: 'strength',
  dexBonus: 'dexterity',
  chaBonus: 'charisma',
  manaBonus: 'mana',
};

/** The facts a generated output's description is built from. */
export interface GeneratedDescriptionInput {
  category: RecipeCategory;
  /** The form word as the name uses it (Dagger, Jerkin, Pendant, Broth). */
  formWord: string;
  slot: string;
  armorType: string;
  weaponType: string;
  primaryName: string;
  secondaryName: string;
  secondaryKind: MaterialKind | null;
  baseDamage: bigint;
  dps: bigint;
  armorClass: bigint;
  /** The accessory stat column key and its amount, or null. */
  stat: { key: string; amount: bigint } | null;
  buffType: string;
  buffMagnitude: bigint;
}

function article(firstWord: string): string {
  return /^[aeiou]/i.test(firstWord) ? 'An' : 'A';
}

function text(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

/**
 * What a generated output is and what it does, from its category, form and stats. Fixed sentence
 * shapes only: never a language model, never player data. Never throws.
 */
export function generatedDescription(input: GeneratedDescriptionInput): string {
  if (input === null || typeof input !== 'object') return '';
  const form = text(input.formWord).toLowerCase();
  const primary = text(input.primaryName);
  const secondary = text(input.secondaryName);
  const kind = input.secondaryKind;

  if (input.category === 'weapon') {
    const tail =
      kind === 'cloth'
        ? `wrapped in ${secondary}`
        : kind === 'hide'
          ? `with a ${secondary} grip`
          : kind === 'wood'
            ? `on a ${secondary} haft`
            : `with ${secondary}`;
    return `${article(form)} ${form} forged from ${primary}, ${tail}. It deals ${input.baseDamage} base damage at ${input.dps} DPS.`;
  }

  if (input.category === 'armor') {
    const type = text(input.armorType);
    const noun = type === '' || type === 'none' ? form : `${type} ${form}`;
    const lead = /s$/.test(form) ? `A pair of ${noun}` : `${article(noun)} ${noun}`;
    const source = type === 'leather' ? 'cut from' : 'woven from';
    const lining = kind === 'metal' ? 'reinforced with' : kind === 'cloth' || kind === 'hide' ? 'lined with' : 'with';
    return `${lead} ${source} ${primary}, ${lining} ${secondary}. It adds ${input.armorClass} armor.`;
  }

  if (input.category === 'accessory') {
    const tail =
      kind === 'metal'
        ? `in a ${secondary} setting`
        : kind === 'cloth' || kind === 'hide'
          ? `on a ${secondary} cord`
          : `with ${secondary}`;
    const stat = input.stat;
    const word = stat && Object.prototype.hasOwnProperty.call(STAT_WORDS, stat.key) ? STAT_WORDS[stat.key] : '';
    const slot = input.slot;
    const end = word
      ? `It adds ${stat ? stat.amount : 0n} ${word}.`
      : slot === 'neck'
        ? 'It is worn at the neck.'
        : slot === 'earrings'
          ? 'It is worn at the ears.'
          : 'It is worn as jewelry.';
    return `${article(form)} ${form} set with ${primary}, ${tail}. ${end}`;
  }

  if (input.category === 'consumable') {
    const label = Object.prototype.hasOwnProperty.call(FOOD_BUFF_LABELS, input.buffType)
      ? FOOD_BUFF_LABELS[input.buffType]
      : text(input.buffType);
    return `${article(form)} ${form} cooked from ${primary} and ${secondary}. Eating it makes you well fed: +${input.buffMagnitude} ${label}.`;
  }

  return `Made from ${primary} and ${secondary}.`;
}

export interface GeneratedItemTemplate {
  name: string;
  slot: string;
  armorType: string;
  rarity: string;
  tier: bigint;
  isJunk: boolean;
  vendorValue: bigint;
  requiredLevel: bigint;
  allowedClasses: string;
  strBonus: bigint;
  dexBonus: bigint;
  chaBonus: bigint;
  wisBonus: bigint;
  intBonus: bigint;
  hpBonus: bigint;
  manaBonus: bigint;
  armorClassBonus: bigint;
  magicResistanceBonus: bigint;
  weaponBaseDamage: bigint;
  weaponDps: bigint;
  weaponType: string;
  stackable: boolean;
  wellFedDurationMicros: bigint;
  wellFedBuffType: string;
  wellFedBuffMagnitude: bigint;
  description: string;
}

export interface GeneratedRecipe {
  key: string;
  name: string;
  outputCount: bigint;
  req1TemplateId: bigint;
  req1Count: bigint;
  req2TemplateId: bigint;
  req2Count: bigint;
  req3TemplateId: bigint | undefined;
  req3Count: bigint | undefined;
  recipeType: RecipeCategory;
  materialType: string | undefined;
}

/**
 * The item_template columns (all but id) and recipe_template columns (all but id and outputTemplateId)
 * of a candidate. isNameTaken tells whether a name is already an item or recipe name; the name walk
 * keeps generated names off every existing row. vendorValue is the summed input value less 2 (at least
 * 1): the vendor rounds each payout down once per stack, so selling the output (one rounding) could
 * pay up to 2 gold more than selling the two input stacks (two roundings) with a sell bonus. Taking 2
 * off keeps the output's payout at or below the inputs' for every perk and Charisma rate (checked in
 * recipe_rules.test.ts); only inputs worth nothing at all can still gain the 1 gold minimum.
 */
export function generatedOutput(
  candidate: RecipeCandidate,
  isNameTaken: (name: string) => boolean,
): { itemTemplate: GeneratedItemTemplate; recipe: GeneratedRecipe } {
  const { category, primary, secondary, level } = candidate;
  const chosen = choose(candidate, isNameTaken);
  const need = REQUIRED_COUNTS[category];
  const summed = primary.vendorValue * need.primary + secondary.vendorValue * need.secondary;
  const outputValue = summed > 2n ? summed - 2n : 1n;
  const food = category === 'consumable';

  const stats = {
    strBonus: 0n,
    dexBonus: 0n,
    chaBonus: 0n,
    wisBonus: 0n,
    intBonus: 0n,
    hpBonus: 0n,
    manaBonus: 0n,
    magicResistanceBonus: 0n,
  };
  let accessoryStat: { key: string; amount: bigint } | null = null;
  if (category === 'accessory' && has(ACCESSORY_STATS, primary.key)) {
    const entry = ACCESSORY_STATS[primary.key];
    if (has(stats, entry.stat)) {
      const amount = entry.base * levelStep(level);
      (stats as Record<string, bigint>)[entry.stat] = amount;
      accessoryStat = { key: entry.stat, amount };
    }
  }

  const itemTemplate: GeneratedItemTemplate = {
    name: chosen.name,
    slot: chosen.slot,
    armorType: chosen.armorType,
    rarity: 'common',
    tier: primary.tier > 1n ? primary.tier : 1n,
    isJunk: false,
    vendorValue: outputValue,
    requiredLevel: level,
    allowedClasses: 'any',
    strBonus: stats.strBonus,
    dexBonus: stats.dexBonus,
    chaBonus: stats.chaBonus,
    wisBonus: stats.wisBonus,
    intBonus: stats.intBonus,
    hpBonus: stats.hpBonus,
    manaBonus: stats.manaBonus,
    armorClassBonus: chosen.armorClass,
    magicResistanceBonus: stats.magicResistanceBonus,
    weaponBaseDamage: chosen.baseDamage,
    weaponDps: chosen.dps,
    weaponType: chosen.weaponType,
    stackable: food,
    wellFedDurationMicros: food ? FOOD_DURATION_MICROS : 0n,
    wellFedBuffType: food ? chosen.buffType : '',
    wellFedBuffMagnitude: food ? levelStep(level) : 0n,
    description: generatedDescription({
      category,
      formWord: chosen.formWord,
      slot: chosen.slot,
      armorType: chosen.armorType,
      weaponType: chosen.weaponType,
      primaryName: primary.name,
      secondaryName: secondary.name,
      secondaryKind: materialKind(secondary.name),
      baseDamage: chosen.baseDamage,
      dps: chosen.dps,
      armorClass: chosen.armorClass,
      stat: accessoryStat,
      buffType: chosen.buffType,
      buffMagnitude: food ? levelStep(level) : 0n,
    }),
  };

  const recipe: GeneratedRecipe = {
    key: candidate.key,
    name: chosen.name,
    outputCount: 1n,
    req1TemplateId: primary.templateId,
    req1Count: need.primary,
    req2TemplateId: secondary.templateId,
    req2Count: need.secondary,
    req3TemplateId: undefined,
    req3Count: undefined,
    recipeType: category,
    materialType: food ? undefined : primary.key,
  };

  return { itemTemplate, recipe };
}
