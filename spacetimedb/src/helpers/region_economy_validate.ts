/**
 * Pure validation and repair of a region_economy reply (Phase 51.3 plan 04). No table access and no
 * SpacetimeDB runtime import, so tests and offline harnesses run the server's own repair.
 *
 * The model supplies only names, kinds, descriptions and which materials go into which recipe (SC2).
 * This module never reads a number from the reply: every count comes from regionalRequirementPlan
 * and every id from the stored RegionEconomyInput, so extra keys such as price, level or weight in a
 * reply change nothing (CUT-01). Handles are resolved against the input only, enums are repaired,
 * every name and description is cleaned, and every name is unique within the reply and against the
 * caller's isTaken. The cross-region rule holds whatever the model says (SC3): common and uncommon
 * recipes keep no foreign material, rare, epic and legendary keep exactly one per required region.
 *
 * Users: the region_economy apply (plan 10), which writes the plan to the database.
 *
 * Phase 51.3.1.1 (Plan 24, D-47): the family reply (draft B3) goes through validateFamilyEconomyReply
 * and validateLateFamily. Counts come from the stored input (its gatherSlots and recipeSlots, set from
 * the economy size), and family and member handles resolve against input.families only. The 51.3
 * functions (validateRegionEconomyReply, validateLateCreature) stay for replies in flight at publish.
 */
import {
  categoryForKind,
  cleanDescription,
  cleanItemName,
  dropRef,
  economyFamilies,
  gatherRef,
  GATHER_SLOTS,
  REGION_ECONOMY_SIZES,
  MAX_RECIPE_REQUIREMENTS,
  nameKey,
  regionalRequirementPlan,
  repairGear,
  uniqueItemName,
  type FallbackRole,
  type RegionEconomyFamily,
  type RegionEconomyInput,
} from '../data/economy_design_rules';
import {
  MATERIAL_KIND_VALUES,
  PRIMARY_KINDS,
  SECONDARY_KINDS,
  type MaterialKind,
  type RecipeCategory,
} from '../data/recipe_rules';

export interface ValidatedGatherable {
  /** 'common' | 'uncommon' | 'rare' (GATHER_SLOTS). */
  slot: string;
  /** G1, G2 or G3. */
  ref: string;
  name: string;
  kind: MaterialKind;
  terrain: string;
  description: string;
}

export interface ValidatedCreature {
  /** The input enemy handle (E1..). */
  enemyRef: string;
  /** From the input, never from the reply. */
  enemyTemplateId: bigint;
  drop: { name: string; kind: MaterialKind; description: string };
  trophy: { name: string; description: string };
  gear: { name: string; slot: string; weaponType: string; armorType: string; description: string };
}

export interface ValidatedRecipe {
  /** 0, 1 or 2: the position of the recipe slot (first, second, third) in input.recipeSlots. */
  index: number;
  /** From input.recipeSlots[index], never from the reply. */
  tier: string;
  name: string;
  category: RecipeCategory;
  description: string;
  /**
   * Primary first, then the local secondary (when the tier has one), then one foreign material per
   * required region in region-index order. Refs are G1..G3, D:E<n> or F<n>; counts come from
   * regionalRequirementPlan(tier). At most MAX_RECIPE_REQUIREMENTS entries.
   */
  requirements: { ref: string; count: bigint }[];
}

export interface ValidatedRegionEconomy {
  /** Always three, in GATHER_SLOTS order (G1, G2, G3). */
  gatherables: ValidatedGatherable[];
  /** In reply order, at most one per input enemy; an enemy the reply left out is absent. */
  creatures: ValidatedCreature[];
  /** In slot order; a recipe that could not be repaired is absent. */
  recipes: ValidatedRecipe[];
}

/** One piece of gear of a family member, for the member handle the stored input lists. */
export interface ValidatedFamilyGear {
  /** The input member handle (E1.tank). */
  member: string;
  /** From the input, never from the reply. */
  templateId: bigint;
  name: string;
  slot: string;
  weaponType: string;
  armorType: string;
  description: string;
}

/** One family entry of a family reply (D-47): a drop and a trophy for the family, gear per member. */
export interface ValidatedFamilyEntry {
  /** The input family handle (E1..). */
  familyRef: string;
  /** From the input (creature_family.id; 0n for a 51.3 enemy read as a family of one). */
  familyId: bigint;
  drop: { name: string; kind: MaterialKind; description: string };
  trophy: { name: string; description: string };
  /** In the input's member order (tank, damage, support, caster), one per member the reply covered. */
  gear: ValidatedFamilyGear[];
  /** Template ids of the members the reply gave no gear (the apply writes rule gear for them). */
  missingGearFor: bigint[];
}

/** The validated family reply of region mode. */
export interface ValidatedFamilyEconomy {
  /**
   * One per input gather slot (the economy size), in G order, with the slot rarity from the input. A
   * slot the reply left out is filled by rule (rule name, base, the first terrain) and listed in
   * missingGatherables.
   */
  gatherables: ValidatedGatherable[];
  /** The G handles filled by rule. */
  missingGatherables: string[];
  /** In reply order, at most one per input family; a family the reply left out is absent. */
  families: ValidatedFamilyEntry[];
  /** The familyIds of the input families the reply left out (the apply falls back by rule). */
  missingFamilies: bigint[];
  /** In slot order; at most one per input recipe slot. */
  recipes: ValidatedRecipe[];
  /** The recipe slot indexes with no usable recipe (left out or not repairable). */
  missingRecipes: number[];
}

const RECIPE_KEYS: readonly string[] = ['first', 'second', 'third'];
const RECIPE_CATEGORIES: readonly string[] = ['weapon', 'armor', 'accessory', 'consumable'];

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

function materialKind(value: unknown, otherwise: MaterialKind): MaterialKind {
  const kind = asText(value);
  return (MATERIAL_KIND_VALUES as readonly string[]).indexOf(kind) !== -1 ? (kind as MaterialKind) : otherwise;
}

/** Trim, drop inner whitespace and upper-case a handle: ' d:e1 ' becomes 'D:E1'. */
function normaliseHandle(value: unknown): string {
  return asText(value).replace(/\s+/g, '').toUpperCase();
}

/** One name set for a whole reply: a name is taken when the caller says so or it was chosen earlier in this reply. */
class NameBook {
  private readonly used = new Set<string>();
  constructor(
    private readonly regionName: string,
    private readonly isTaken: (name: string) => boolean,
  ) {}

  take(raw: unknown, role: FallbackRole, kindOrSlot: string): string {
    const taken = (name: string): boolean => this.isTaken(name) === true || this.used.has(nameKey(name));
    const name = uniqueItemName(cleanItemName(asText(raw)), this.regionName, taken, { role, kindOrSlot });
    this.used.add(nameKey(name));
    return name;
  }
}

function gatherRule(terrain: string, regionName: string): string {
  const region = cleanItemName(regionName);
  return region === '' ? `Gathered from the ${terrain}.` : `Gathered from the ${terrain} of ${region}.`;
}

/** One gatherable slot: the reply entry cleaned, or the rule gatherable when the entry is not an object. */
function gatherableAt(input: RegionEconomyInput, slot: string, i: number, entry: unknown, names: NameBook): ValidatedGatherable {
  const terrains = Array.isArray(input.terrains) ? input.terrains.filter((t) => typeof t === 'string' && t !== '') : [];
  const firstTerrain = terrains.length > 0 ? terrains[0] : 'plains';
  const kind = materialKind(field(entry, 'kind'), 'base');
  const modelTerrain = asText(field(entry, 'terrain'));
  const terrain = terrains.indexOf(modelTerrain) !== -1 ? modelTerrain : firstTerrain;
  const name = names.take(field(entry, 'name'), 'gather', kind);
  const cleaned = cleanDescription(asText(field(entry, 'description')));
  return {
    slot,
    ref: gatherRef(i),
    name,
    kind,
    terrain,
    description: cleaned === '' ? gatherRule(terrain, input.regionName) : cleaned,
  };
}

function validateGatherables(
  input: RegionEconomyInput,
  gatherables: unknown,
  names: NameBook,
): { list: ValidatedGatherable[]; supplied: number } {
  const list: ValidatedGatherable[] = [];
  let supplied = 0;
  GATHER_SLOTS.forEach((slot, i) => {
    const entry = field(gatherables, slot);
    if (isPlainObject(entry)) supplied++;
    list.push(gatherableAt(input, slot, i, entry, names));
  });
  return { list, supplied };
}

/** The drop, trophy and gear of one creature entry, for an enemy already resolved against the input. */
function validateCreatureBody(
  entry: unknown,
  enemyRef: string,
  enemyTemplateId: bigint,
  names: NameBook,
): ValidatedCreature {
  const drop = field(entry, 'drop');
  const trophy = field(entry, 'trophy');
  const gear = field(entry, 'gear');
  const dropKind = materialKind(field(drop, 'kind'), 'hide');
  const repaired = repairGear({
    slot: asText(field(gear, 'slot')),
    weaponType: asText(field(gear, 'weaponType')),
    armorType: asText(field(gear, 'armorType')),
  });
  return {
    enemyRef,
    enemyTemplateId,
    drop: {
      name: names.take(field(drop, 'name'), 'gather', dropKind),
      kind: dropKind,
      description: cleanDescription(asText(field(drop, 'description'))),
    },
    trophy: {
      name: names.take(field(trophy, 'name'), 'trophy', ''),
      description: cleanDescription(asText(field(trophy, 'description'))),
    },
    gear: {
      name: names.take(field(gear, 'name'), 'gear', repaired.slot),
      slot: repaired.slot,
      weaponType: repaired.weaponType,
      armorType: repaired.armorType,
      description: cleanDescription(asText(field(gear, 'description'))),
    },
  };
}

function validateCreatures(input: RegionEconomyInput, creatures: unknown, names: NameBook): ValidatedCreature[] {
  const enemies = Array.isArray(input.enemies) ? input.enemies : [];
  const out: ValidatedCreature[] = [];
  if (!Array.isArray(creatures)) return out;
  const seen = new Set<string>();
  for (const entry of creatures) {
    if (!isPlainObject(entry)) continue;
    const ref = normaliseHandle(field(entry, 'enemy'));
    if (seen.has(ref)) continue;
    const enemy = enemies.find((e) => e.ref === ref);
    if (!enemy) continue;
    seen.add(ref);
    out.push(validateCreatureBody(entry, enemy.ref, enemy.templateId, names));
  }
  return out;
}

interface LocalMaterial {
  ref: string;
  kind: MaterialKind;
}

function isPrimaryFor(category: RecipeCategory, kind: string): boolean {
  return (PRIMARY_KINDS[category] as readonly string[]).indexOf(kind) !== -1;
}

function validateRecipe(
  input: RegionEconomyInput,
  index: number,
  entry: Record<string, unknown>,
  locals: LocalMaterial[],
  names: NameBook,
): ValidatedRecipe | null {
  const slot = Array.isArray(input.recipeSlots) ? input.recipeSlots[index] : undefined;
  if (!isPlainObject(slot)) return null;
  const tier = asText(slot.tier);
  const plan = regionalRequirementPlan(tier);
  const foreign = Array.isArray(input.foreign) ? input.foreign : [];

  // Resolve the model's handles: unknown and duplicate handles are dropped.
  const listed: string[] = [];
  const materials = field(entry, 'materials');
  for (const raw of Array.isArray(materials) ? materials : []) {
    const ref = normaliseHandle(raw);
    if (ref === '' || listed.indexOf(ref) !== -1) continue;
    if (locals.some((l) => l.ref === ref) || foreign.some((f) => f.ref === ref)) listed.push(ref);
  }
  const listedLocals = listed
    .map((ref) => locals.find((l) => l.ref === ref))
    .filter((l): l is LocalMaterial => l !== undefined);

  // Primary and category (review B WR-01). The model's category wins whenever any local can serve it:
  // its primary is the first listed local of a primary kind for that category, else the first such
  // local anywhere in the region. Only when no local can serve it does the category change, to the
  // category of the first listed local that has one (else of any local).
  const modelCategory = asText(field(entry, 'category'));
  const wanted: RecipeCategory | null =
    RECIPE_CATEGORIES.indexOf(modelCategory) !== -1 ? (modelCategory as RecipeCategory) : null;
  let primary: LocalMaterial | undefined =
    wanted !== null
      ? listedLocals.find((l) => isPrimaryFor(wanted, l.kind)) ?? locals.find((l) => isPrimaryFor(wanted, l.kind))
      : undefined;
  let category: RecipeCategory | null = primary ? wanted : null;
  if (!primary) {
    primary =
      listedLocals.find((l) => categoryForKind(l.kind) !== null) ?? locals.find((l) => categoryForKind(l.kind) !== null);
    category = primary ? categoryForKind(primary.kind) : null;
  }
  if (!primary || category === null) return null;
  const cat: RecipeCategory = category;
  const primaryRef = primary.ref;
  // A changed category means the model's name and description describe another item ("Salted Wayfarer
  // Jerky" as chest armor): both give way to the rule name and the rule description.
  const repaired = wanted !== null && cat !== wanted;

  const requirements: { ref: string; count: bigint }[] = [{ ref: primaryRef, count: plan.primaryCount }];

  // Local secondary.
  if (plan.localSecondaryCount !== null) {
    const others = locals.filter((l) => l.ref !== primaryRef);
    let secondary = listedLocals.find((l) => l.ref !== primaryRef);
    if (!secondary) {
      for (const kind of SECONDARY_KINDS[cat]) {
        secondary = others.find((l) => l.kind === kind);
        if (secondary) break;
      }
    }
    if (!secondary) secondary = others[0];
    if (secondary) requirements.push({ ref: secondary.ref, count: plan.localSecondaryCount });
  }

  // Foreign: exactly one material per required region (none for common and uncommon).
  if (plan.foreignCount > 0) {
    const required: number[] = [];
    for (const i of Array.isArray(slot.foreignRegionIndexes) ? slot.foreignRegionIndexes : []) {
      if (typeof i === 'number' && required.indexOf(i) === -1) required.push(i);
    }
    if (required.length < plan.foreignCount) return null;
    const regions = required.slice(0, plan.foreignCount).sort((a, b) => a - b);
    for (const regionIndex of regions) {
      const fromModel = listed.find((ref) => foreign.some((f) => f.ref === ref && f.regionIndex === regionIndex));
      const pick = fromModel ?? foreign.find((f) => f.regionIndex === regionIndex)?.ref;
      if (pick === undefined) return null;
      requirements.push({ ref: pick, count: plan.foreignEach });
    }
  }

  return {
    index,
    tier,
    name: names.take(repaired ? '' : field(entry, 'name'), 'output', cat),
    category: cat,
    description: repaired ? '' : cleanDescription(asText(field(entry, 'description'))),
    requirements: requirements.slice(0, MAX_RECIPE_REQUIREMENTS),
  };
}

function safeIsTaken(isTaken: unknown): (name: string) => boolean {
  return typeof isTaken === 'function' ? (name: string) => (isTaken as (n: string) => unknown)(name) === true : () => false;
}

/**
 * Region mode: turns a parsed reply into a fully repaired plan, or null when the reply is unusable
 * (not an object, no region object, or a region from which no gatherable, creature or recipe was
 * supplied). The lateCreature field is ignored. isTaken must be case-insensitive and cover the
 * existing item_template and recipe_template names; reserved names are checked inside.
 */
export function validateRegionEconomyReply(
  input: RegionEconomyInput,
  reply: unknown,
  isTaken: (name: string) => boolean,
): ValidatedRegionEconomy | null {
  const region = field(reply, 'region');
  if (!isPlainObject(region)) return null;
  const names = new NameBook(asText(input.regionName), safeIsTaken(isTaken));

  const gather = validateGatherables(input, field(region, 'gatherables'), names);
  const creatures = validateCreatures(input, field(region, 'creatures'), names);

  const locals: LocalMaterial[] = [
    ...gather.list.map((g) => ({ ref: g.ref, kind: g.kind })),
    ...creatures.map((c) => ({ ref: dropRef(c.enemyRef), kind: c.drop.kind })),
  ];
  const recipesNode = field(region, 'recipes');
  const recipes: ValidatedRecipe[] = [];
  RECIPE_KEYS.forEach((key, index) => {
    const entry = field(recipesNode, key);
    if (!isPlainObject(entry)) return;
    const recipe = validateRecipe(input, index, entry, locals, names);
    if (recipe) recipes.push(recipe);
  });

  if (gather.supplied === 0 && creatures.length === 0 && recipes.length === 0) return null;
  return { gatherables: gather.list, creatures, recipes };
}

/**
 * Late-creature mode (an enemy type added after the region was designed): the drop, trophy and gear
 * of one creature, or null when reply.lateCreature is not an object. The enemy is resolved against
 * input.enemies; in enemy mode the input lists exactly one enemy, so a missing or unknown enemy
 * field is repaired to it (with several listed enemies an unknown handle returns null). The region
 * field is ignored. Names share one set and are checked against isTaken like region mode.
 */
export function validateLateCreature(
  input: RegionEconomyInput,
  reply: unknown,
  isTaken: (name: string) => boolean,
): ValidatedCreature | null {
  const entry = field(reply, 'lateCreature');
  if (!isPlainObject(entry)) return null;
  const enemies = Array.isArray(input.enemies) ? input.enemies : [];
  const ref = normaliseHandle(field(entry, 'enemy'));
  const enemy = enemies.find((e) => e.ref === ref) ?? (enemies.length === 1 ? enemies[0] : undefined);
  if (!enemy) return null;
  const names = new NameBook(asText(input.regionName), safeIsTaken(isTaken));
  return validateCreatureBody(entry, enemy.ref, enemy.templateId, names);
}

// ---------------------------------------------------------------------------
// Family reply (Phase 51.3.1.1 Plan 24, draft B3, D-47)
// ---------------------------------------------------------------------------

/** The rarity of each gather slot of an input: its stored gatherSlots, or the small size for an input stored before them. */
function inputGatherSlots(input: RegionEconomyInput): string[] {
  const stored = Array.isArray(input.gatherSlots)
    ? input.gatherSlots.filter((x): x is string => typeof x === 'string' && x !== '')
    : [];
  return stored.length > 0 ? stored : [...REGION_ECONOMY_SIZES.small.gatherSlots];
}

/** The input family a reply handle names (compared normalised), or undefined. Only a string handle is read. */
function findFamily(families: readonly RegionEconomyFamily[], raw: unknown): RegionEconomyFamily | undefined {
  if (typeof raw !== 'string') return undefined;
  const ref = normaliseHandle(raw);
  if (ref === '') return undefined;
  return families.find((f) => normaliseHandle(f.ref) === ref);
}

/**
 * One family entry: drop and trophy as the 51.3 creature body; gear resolved per member handle of
 * this family only (an unknown or foreign handle is dropped, the first entry for a member wins), with
 * the 51.3 gear repair. Names are taken in the input's member order, so the result does not depend on
 * the reply's gear order.
 */
function validateFamilyEntry(entry: unknown, family: RegionEconomyFamily, names: NameBook): ValidatedFamilyEntry {
  const drop = field(entry, 'drop');
  const trophy = field(entry, 'trophy');
  const dropKind = materialKind(field(drop, 'kind'), 'hide');
  const members = Array.isArray(family.members) ? family.members.filter(isPlainObject) : [];
  const byMember = new Map<string, unknown>();
  const gearList = field(entry, 'gear');
  for (const item of Array.isArray(gearList) ? gearList : []) {
    if (!isPlainObject(item)) continue;
    const raw = field(item, 'member');
    if (typeof raw !== 'string') continue;
    const ref = normaliseHandle(raw);
    const member = members.find((m) => normaliseHandle(m.ref) === ref);
    if (!member || byMember.has(member.ref)) continue;
    byMember.set(member.ref, item);
  }
  const result: ValidatedFamilyEntry = {
    familyRef: family.ref,
    familyId: family.familyId,
    drop: {
      name: names.take(field(drop, 'name'), 'gather', dropKind),
      kind: dropKind,
      description: cleanDescription(asText(field(drop, 'description'))),
    },
    trophy: {
      name: names.take(field(trophy, 'name'), 'trophy', ''),
      description: cleanDescription(asText(field(trophy, 'description'))),
    },
    gear: [],
    missingGearFor: [],
  };
  for (const member of members) {
    const item = byMember.get(member.ref);
    if (item === undefined) {
      result.missingGearFor.push(member.templateId);
      continue;
    }
    const repaired = repairGear({
      slot: asText(field(item, 'slot')),
      weaponType: asText(field(item, 'weaponType')),
      armorType: asText(field(item, 'armorType')),
    });
    result.gear.push({
      member: member.ref,
      templateId: member.templateId,
      name: names.take(field(item, 'name'), 'gear', repaired.slot),
      slot: repaired.slot,
      weaponType: repaired.weaponType,
      armorType: repaired.armorType,
      description: cleanDescription(asText(field(item, 'description'))),
    });
  }
  return result;
}

/**
 * Region mode of the family reply (draft B3): gatherables[], families[] and recipes[], or null when
 * the reply is unusable (not an object, no region object, or a region from which no gatherable,
 * family or recipe was supplied). Counts come from the stored input, never the reply: the first
 * gatherSlots.length gatherables (slot rarities from the input; the rest of the reply is dropped, a
 * missing slot is filled by rule and reported), one entry per input family (resolved against
 * input.families only; a 51.3 input reads its enemies as families of one) and the first
 * recipeSlots.length recipes, each validated by the 51.3 recipe rules over the gatherables and the
 * family drops (D:E1). lateFamily is ignored. isTaken must be case-insensitive and cover the existing
 * item_template and recipe_template names; reserved names are checked inside. Numbers are never read.
 */
export function validateFamilyEconomyReply(
  input: RegionEconomyInput,
  reply: unknown,
  isTaken: (name: string) => boolean,
): ValidatedFamilyEconomy | null {
  const region = field(reply, 'region');
  if (!isPlainObject(region)) return null;
  const names = new NameBook(asText(input.regionName), safeIsTaken(isTaken));

  // Gatherables: one per input slot.
  const slots = inputGatherSlots(input);
  const gatherNode = field(region, 'gatherables');
  const gatherList = Array.isArray(gatherNode) ? gatherNode : [];
  const gatherables: ValidatedGatherable[] = [];
  const missingGatherables: string[] = [];
  let supplied = 0;
  slots.forEach((slot, i) => {
    const entry = gatherList[i];
    if (isPlainObject(entry)) supplied++;
    else missingGatherables.push(gatherRef(i));
    gatherables.push(gatherableAt(input, slot, i, entry, names));
  });

  // Families: one entry per input family, first entry wins.
  const inputFamilies = economyFamilies(input);
  const familyNode = field(region, 'families');
  const families: ValidatedFamilyEntry[] = [];
  const seen = new Set<string>();
  for (const entry of Array.isArray(familyNode) ? familyNode : []) {
    if (!isPlainObject(entry)) continue;
    const family = findFamily(inputFamilies, field(entry, 'family'));
    if (!family || seen.has(family.ref)) continue;
    seen.add(family.ref);
    families.push(validateFamilyEntry(entry, family, names));
  }
  const missingFamilies = inputFamilies.filter((f) => !seen.has(f.ref)).map((f) => f.familyId);

  // Recipes: the first recipeSlots.length, by the 51.3 rules.
  const locals: LocalMaterial[] = [
    ...gatherables.map((g) => ({ ref: g.ref, kind: g.kind })),
    ...families.map((f) => ({ ref: dropRef(f.familyRef), kind: f.drop.kind })),
  ];
  const recipeSlots = Array.isArray(input.recipeSlots) ? input.recipeSlots : [];
  const recipeNode = field(region, 'recipes');
  const recipeList = Array.isArray(recipeNode) ? recipeNode : [];
  const recipes: ValidatedRecipe[] = [];
  const missingRecipes: number[] = [];
  recipeSlots.forEach((_slot, index) => {
    const entry = recipeList[index];
    const recipe = isPlainObject(entry) ? validateRecipe(input, index, entry, locals, names) : null;
    if (recipe) recipes.push(recipe);
    else missingRecipes.push(index);
  });

  if (supplied === 0 && families.length === 0 && recipes.length === 0) return null;
  return { gatherables, missingGatherables, families, missingFamilies, recipes, missingRecipes };
}

/**
 * Late-family mode (a family added after the region was designed, draft B2b): the drop, trophy and
 * gear of reply.lateFamily, or null when it is not an object. The family is resolved against the
 * input's families (a stored 51.3 late-creature input reads as a family of one); with exactly one
 * listed family a missing or unknown handle is repaired to it, with several an unknown handle returns
 * null. The region field is ignored. Names share one set and are checked against isTaken.
 */
export function validateLateFamily(
  input: RegionEconomyInput,
  reply: unknown,
  isTaken: (name: string) => boolean,
): ValidatedFamilyEntry | null {
  const entry = field(reply, 'lateFamily');
  if (!isPlainObject(entry)) return null;
  const families = economyFamilies(input);
  const family = findFamily(families, field(entry, 'family')) ?? (families.length === 1 ? families[0] : undefined);
  if (!family) return null;
  const names = new NameBook(asText(input.regionName), safeIsTaken(isTaken));
  return validateFamilyEntry(entry, family, names);
}
