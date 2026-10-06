import {
  AFFIX_SLOTS_BY_QUALITY,
  CRAFTING_MODIFIER_DEFS,
  ESSENCE_MAGNITUDE,
  ESSENCE_QUALITY_GATE,
  craftQualityForMaterialName,
  craftQualityUpgrade,
  getModifierMagnitude,
  isGearRecipe,
  itemKeyFromName,
  planCraft,
  type CraftPlan,
} from '@game-data/crafting_rules';
import { hasBackpackSpace } from '@game-data/inventory_rules';
import type {
  ItemInstance,
  ItemTemplate,
  RecipeDiscovered,
  RecipeTemplate,
} from '../module_bindings/types';
import { STAT_ROWS } from '../ledger/compare';
import { itemCategory, rarityColor, slotLabel } from '../ledger/itemModel';

// The crafting model (50-UI-SPEC "Crafting Contract" and "Owner decisions after the draft"): recipe
// rows with the true bag counts, the category and craftable filters, Materials on hand, the recipe
// detail with its single deterministic quality line and upgrade hint, the essence and reagent options
// and the Craft availability. Every rule is the server's own shared module: planCraft is the same
// function craft_recipe runs before it mutates, the quality comes from craftQualityForMaterialName,
// the essence gate and the reagent slots from ESSENCE_QUALITY_GATE and AFFIX_SLOTS_BY_QUALITY. There
// is no odds helper because the server's quality is one result. Names stay plain strings (no
// escaping, no HTML): the components render them as text nodes. Pure: no Vue.

const BACKPACK_FULL = 'Your backpack is full.';
const NO_STATION = 'No crafting station here.';

function capitalize(word: string): string {
  return word === '' ? '' : word.charAt(0).toUpperCase() + word.slice(1);
}

function filled(value: string | null | undefined): value is string {
  return value !== null && value !== undefined && value !== '';
}

function isEquipped(instance: ItemInstance): boolean {
  return filled(instance.equippedSlot);
}

/** The own-property lookup the server uses, so a name like 'constructor' never reads a function. */
function ownValue<T>(map: Readonly<Record<string, T>>, key: string): T | undefined {
  return Object.prototype.hasOwnProperty.call(map, key) ? map[key] : undefined;
}

// ---------------------------------------------------------------------------------------------
// Categories and counts

export type RecipeFilterId = 'all' | 'weapon' | 'armor' | 'accessory' | 'consumable';

export const RECIPE_FILTERS: ReadonlyArray<{ id: RecipeFilterId; label: string }> = [
  { id: 'all', label: 'All' },
  { id: 'weapon', label: 'Weapon' },
  { id: 'armor', label: 'Armor' },
  { id: 'accessory', label: 'Accessory' },
  { id: 'consumable', label: 'Consumable' },
];

const CATEGORY_WORDS: Readonly<Record<string, string>> = {
  weapon: 'Weapon',
  armor: 'Armor',
  accessory: 'Accessory',
  consumable: 'Consumable',
};

/** Weapon, Armor, Accessory or Consumable; any other recipeType is null (listed under All only). */
export function recipeCategory(recipeType: string | null | undefined): string | null {
  if (typeof recipeType !== 'string') return null;
  return ownValue(CATEGORY_WORDS, recipeType.toLowerCase()) ?? null;
}

/** The sum of quantities of a template over the non-equipped instances (the server's getItemCount). */
export function bagCount(items: readonly ItemInstance[], templateId: bigint): bigint {
  let total = 0n;
  for (const instance of items) {
    if (instance.templateId !== templateId || isEquipped(instance)) continue;
    total += instance.quantity;
  }
  return total;
}

/** '1 recipe known', '{n} recipes known'. */
export function recipesKnownText(count: number): string {
  return count === 1 ? '1 recipe known' : `${count} recipes known`;
}

// ---------------------------------------------------------------------------------------------
// Recipe rows

export interface CraftingInput {
  /** The recipe_discovered rows of the active character. */
  known: readonly RecipeDiscovered[];
  recipes: ReadonlyMap<bigint, RecipeTemplate>;
  templates: ReadonlyMap<bigint, ItemTemplate>;
  items: readonly ItemInstance[];
}

export interface RequirementEntry {
  templateId: bigint;
  name: string;
  have: bigint;
  need: bigint;
  met: boolean;
  /** '{name} {have}/{need}'. */
  text: string;
}

export interface RecipeRow {
  id: bigint;
  name: string;
  /** Weapon, Armor, Accessory or Consumable; null for an unknown recipe type. */
  category: string | null;
  /** The output template's tier, or null while that template has not arrived. */
  tier: bigint | null;
  /** '{Category} · T{tier}'. */
  meta: string;
  requirements: RequirementEntry[];
  craftable: boolean;
  ariaLabel: string;
}

const UNKNOWN_MATERIAL = 'Unknown material';

function requirementsOf(
  recipe: RecipeTemplate,
  templates: ReadonlyMap<bigint, ItemTemplate>,
  items: readonly ItemInstance[],
): RequirementEntry[] {
  const parts: Array<{ templateId: bigint; need: bigint }> = [
    { templateId: recipe.req1TemplateId, need: recipe.req1Count },
    { templateId: recipe.req2TemplateId, need: recipe.req2Count },
  ];
  if (recipe.req3TemplateId !== undefined && recipe.req3TemplateId !== null) {
    parts.push({ templateId: recipe.req3TemplateId, need: recipe.req3Count ?? 0n });
  }
  return parts.map((part) => {
    const have = bagCount(items, part.templateId);
    const template = templates.get(part.templateId);
    const name = template ? template.name : UNKNOWN_MATERIAL;
    return {
      templateId: part.templateId,
      name,
      have,
      need: part.need,
      met: have >= part.need,
      text: `${name} ${have}/${part.need}`,
    };
  });
}

/**
 * The known recipes as list rows: craftable first, then by name. The category filter and the
 * only-craftable filter (default off) apply; an unknown recipeType shows under All only. A recipe
 * whose definition has not arrived yet is left out until it does.
 */
export function recipeRows(
  input: CraftingInput,
  options: { filter: RecipeFilterId; onlyCraftable: boolean },
): RecipeRow[] {
  const rows: RecipeRow[] = [];
  for (const entry of input.known) {
    const recipe = input.recipes.get(entry.recipeTemplateId);
    if (!recipe) continue;
    const category = recipeCategory(recipe.recipeType);
    if (options.filter !== 'all' && category !== CATEGORY_WORDS[options.filter]) continue;

    const requirements = requirementsOf(recipe, input.templates, input.items);
    const craftable = requirements.every((req) => req.met);
    if (options.onlyCraftable && !craftable) continue;

    const output = input.templates.get(recipe.outputTemplateId);
    const tier = output && typeof output.tier === 'bigint' ? output.tier : null;
    const categoryWord = category ?? 'Other';
    const firstMissing = requirements.find((req) => !req.met);
    rows.push({
      id: recipe.id,
      name: recipe.name,
      category,
      tier,
      meta: tier === null ? categoryWord : `${categoryWord} · T${tier}`,
      requirements,
      craftable,
      ariaLabel: `${recipe.name}, ${categoryWord}${tier === null ? '' : ` tier ${tier}`}, ${
        craftable ? 'craftable' : `missing ${firstMissing ? firstMissing.name : UNKNOWN_MATERIAL}`
      }`,
    });
  }
  rows.sort((a, b) => {
    if (a.craftable !== b.craftable) return a.craftable ? -1 : 1;
    const nameA = a.name.toLowerCase();
    const nameB = b.name.toLowerCase();
    if (nameA !== nameB) return nameA < nameB ? -1 : 1;
    return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
  });
  return rows;
}

// ---------------------------------------------------------------------------------------------
// Materials on hand

export interface MaterialEntry {
  templateId: bigint;
  name: string;
  count: bigint;
  color: string;
}

function isEssenceName(name: string): boolean {
  return ownValue(ESSENCE_MAGNITUDE, itemKeyFromName(name)) !== undefined;
}

function reagentDefFor(name: string): (typeof CRAFTING_MODIFIER_DEFS)[number] | undefined {
  const key = itemKeyFromName(name);
  return CRAFTING_MODIFIER_DEFS.find((def) => def.key === key);
}

function nameColorOf(template: ItemTemplate): string {
  const rarity = typeof template.rarity === 'string' ? template.rarity.toLowerCase() : 'common';
  return rarity === 'common' || rarity === '' ? 'var(--color-text)' : rarityColor(rarity);
}

/** Totals per template of the non-equipped instances of one template group, by template name. */
function totalsByTemplate(
  items: readonly ItemInstance[],
  templates: ReadonlyMap<bigint, ItemTemplate>,
  keep: (template: ItemTemplate) => boolean,
): MaterialEntry[] {
  const totals = new Map<bigint, bigint>();
  for (const instance of items) {
    if (isEquipped(instance)) continue;
    const template = templates.get(instance.templateId);
    if (!template || !keep(template)) continue;
    totals.set(instance.templateId, (totals.get(instance.templateId) ?? 0n) + instance.quantity);
  }
  const entries: MaterialEntry[] = [];
  for (const [templateId, count] of totals) {
    const template = templates.get(templateId)!;
    entries.push({ templateId, name: template.name, count, color: nameColorOf(template) });
  }
  entries.sort((a, b) => {
    const nameA = a.name.toLowerCase();
    const nameB = b.name.toLowerCase();
    if (nameA !== nameB) return nameA < nameB ? -1 : 1;
    return a.templateId < b.templateId ? -1 : a.templateId > b.templateId ? 1 : 0;
  });
  return entries;
}

/**
 * Materials on hand: bag items in the Material category plus essences and reagents, with their
 * counts, sorted by name. Common names use the plain text color.
 */
export function materialsOnHand(
  items: readonly ItemInstance[],
  templates: ReadonlyMap<bigint, ItemTemplate>,
): MaterialEntry[] {
  return totalsByTemplate(
    items,
    templates,
    (template) =>
      itemCategory(template) === 'material' ||
      isEssenceName(template.name) ||
      reagentDefFor(template.name) !== undefined,
  );
}

// ---------------------------------------------------------------------------------------------
// Recipe detail

export interface DetailMetaPart {
  text: string;
  tone: 'normal' | 'short';
}

export interface DetailTile {
  templateId: bigint;
  name: string;
  have: bigint;
  need: bigint;
  short: boolean;
  /** '{have} of {need}' (desktop tile). */
  text: string;
  /** '{have} / {need}' (mobile material row). */
  mobileText: string;
}

export interface RecipeDetail {
  id: bigint;
  name: string;
  gear: boolean;
  metaParts: DetailMetaPart[];
  tiles: DetailTile[];
  /** The lowercase craft token key ('standard'); null for a consumable recipe. */
  qualityKey: string | null;
  /** 'Standard'; null for a consumable recipe. */
  quality: string | null;
  /** 'A recipe with a tier 2 primary material would make it Reinforced.'; null at the top tier. */
  qualityHint: string | null;
  /** The number of reagent slots the quality allows (0 for a consumable). */
  slots: number;
  /** '{Quality} quality takes up to {n} reagents.'; null for a consumable. */
  slotsLine: string | null;
  /** The recipe's output count and template, for Craft availability. */
  outputTemplateId: bigint;
}

/**
 * The selected recipe's detail: meta line, have-of-need tiles, and for a gear recipe the one
 * deterministic quality (from the first requirement's material, the same rule the reducer stores)
 * with the hint that names what would raise it. Null until the recipe's definition has arrived.
 */
export function recipeDetail(
  input: Omit<CraftingInput, 'known'>,
  recipeId: bigint,
  characterLevel: bigint,
): RecipeDetail | null {
  const recipe = input.recipes.get(recipeId);
  if (!recipe) return null;
  const output = input.templates.get(recipe.outputTemplateId);
  const gear = isGearRecipe(recipe);

  const metaParts: DetailMetaPart[] = [];
  if (output) {
    const slot = slotLabel(output.slot);
    if (slot !== '') metaParts.push({ text: slot, tone: 'normal' });
    const type = filled(output.weaponType) ? output.weaponType : filled(output.armorType) ? output.armorType : '';
    if (type !== '') metaParts.push({ text: capitalize(type), tone: 'normal' });
    if (typeof output.tier === 'bigint' && output.tier > 0n) {
      metaParts.push({ text: `Tier ${output.tier}`, tone: 'normal' });
    }
    const required = typeof output.requiredLevel === 'bigint' ? output.requiredLevel : 0n;
    if (required > 1n) {
      metaParts.push({
        text: `Requires Lv ${required}`,
        tone: required > characterLevel ? 'short' : 'normal',
      });
    }
  }
  if (recipe.outputCount > 1n) metaParts.push({ text: `Makes ${recipe.outputCount}`, tone: 'normal' });

  const tiles: DetailTile[] = requirementsOf(recipe, input.templates, input.items).map((req) => ({
    templateId: req.templateId,
    name: req.name,
    have: req.have,
    need: req.need,
    short: !req.met,
    text: `${req.have} of ${req.need}`,
    mobileText: `${req.have} / ${req.need}`,
  }));

  let qualityKey: string | null = null;
  let quality: string | null = null;
  let qualityHint: string | null = null;
  let slots = 0;
  let slotsLine: string | null = null;
  if (gear) {
    const primary = input.templates.get(recipe.req1TemplateId);
    qualityKey = craftQualityForMaterialName(primary ? primary.name : null);
    quality = capitalize(qualityKey);
    const upgrade = craftQualityUpgrade(qualityKey);
    if (upgrade) {
      qualityHint = `A recipe with a tier ${upgrade.materialTier} primary material would make it ${capitalize(
        upgrade.quality,
      )}.`;
    }
    slots = ownValue(AFFIX_SLOTS_BY_QUALITY, qualityKey) ?? 0;
    slotsLine = `${quality} quality takes up to ${slots} ${slots === 1 ? 'reagent' : 'reagents'}.`;
  }

  return {
    id: recipe.id,
    name: recipe.name,
    gear,
    metaParts,
    tiles,
    qualityKey,
    quality,
    qualityHint,
    slots,
    slotsLine,
    outputTemplateId: recipe.outputTemplateId,
  };
}

// ---------------------------------------------------------------------------------------------
// Essence and reagent options

export interface PickerOption {
  templateId: bigint;
  name: string;
  color: string;
  have: bigint;
  hint: string;
  /** False: listed but not choosable (aria-disabled). */
  eligible: boolean;
}

/**
 * The essences on hand. One is eligible only when the quality gate allows the recipe's quality;
 * the hint is '+{n} per reagent' or 'Too weak for {Quality} quality'.
 */
export function essenceOptions(
  items: readonly ItemInstance[],
  templates: ReadonlyMap<bigint, ItemTemplate>,
  qualityKey: string,
): PickerOption[] {
  const entries = totalsByTemplate(items, templates, (template) => isEssenceName(template.name));
  return entries.map((entry) => {
    const key = itemKeyFromName(entry.name);
    const allowed = ownValue(ESSENCE_QUALITY_GATE, key) ?? [];
    const eligible = allowed.indexOf(qualityKey) !== -1;
    const magnitude = ownValue(ESSENCE_MAGNITUDE, key) ?? 0n;
    return {
      templateId: entry.templateId,
      name: entry.name,
      color: entry.color,
      have: entry.count,
      hint: eligible ? `+${magnitude} per reagent` : `Too weak for ${capitalize(qualityKey)} quality`,
      eligible,
    };
  });
}

function statAbbr(statKey: string): string {
  const row = STAT_ROWS.find((def) => def.key === statKey);
  return row ? row.abbr : statKey;
}

/**
 * The reagents on hand, with the stat each adds for the chosen essence ('+2 INT'). An option is
 * unavailable once the other slots already hold as many of it as are on hand; exceptSlot leaves the
 * slot being changed out of that count.
 */
export function reagentOptions(
  items: readonly ItemInstance[],
  templates: ReadonlyMap<bigint, ItemTemplate>,
  essenceKey: string,
  chosen: ReadonlyArray<bigint | null>,
  exceptSlot?: number,
): PickerOption[] {
  const entries = totalsByTemplate(items, templates, (template) => reagentDefFor(template.name) !== undefined);
  return entries.map((entry) => {
    const def = reagentDefFor(entry.name)!;
    let taken = 0n;
    chosen.forEach((id, index) => {
      if (id !== null && id === entry.templateId && index !== exceptSlot) taken += 1n;
    });
    const eligible = entry.count - taken > 0n;
    const magnitude = getModifierMagnitude(essenceKey, def.statKey);
    return {
      templateId: entry.templateId,
      name: entry.name,
      color: entry.color,
      have: entry.count,
      hint: eligible ? `+${magnitude} ${statAbbr(def.statKey)}` : 'All chosen',
      eligible,
    };
  });
}

/** The essence key (template name lowercased with underscores) of an item template. */
export function essenceKeyOf(template: Pick<ItemTemplate, 'name'> | undefined): string {
  return template ? itemKeyFromName(template.name) : '';
}

/** The magnitude line of a chosen essence: '+2 per reagent'. */
export function essenceMagnitudeText(essenceKey: string): string {
  return `+${ownValue(ESSENCE_MAGNITUDE, essenceKey) ?? 0n} per reagent`;
}

/** The effect of a chosen reagent for the chosen essence: '+2 INT'. */
export function reagentEffectText(essenceKey: string, reagentName: string): string {
  const def = reagentDefFor(reagentName);
  if (!def) return '';
  return `+${getModifierMagnitude(essenceKey, def.statKey)} ${statAbbr(def.statKey)}`;
}

// ---------------------------------------------------------------------------------------------
// Craft availability and arguments

export interface CraftChoice {
  /** The chosen essence template id, or null. */
  essenceId: bigint | null;
  /** The chosen reagent template ids in slot order; null is an empty slot. */
  reagentIds: ReadonlyArray<bigint | null>;
}

export interface CraftAvailabilityInput {
  recipe: RecipeTemplate;
  /** location.craftingAvailable for the character's location. */
  station: boolean;
  templates: ReadonlyMap<bigint, ItemTemplate>;
  items: readonly ItemInstance[];
  choice: CraftChoice;
}

export interface CraftAvailability {
  available: boolean;
  reason: string | null;
  /** The shared planCraft result (null when there is no station). */
  plan: CraftPlan | null;
}

/** The planCraft input the reducer builds, from the same facts the client holds. */
function planInputOf(input: CraftAvailabilityInput) {
  const { recipe, templates, items, choice } = input;
  const primary = templates.get(recipe.req1TemplateId);
  const essence = choice.essenceId === null ? null : choice.essenceId;
  return {
    recipe,
    primaryMaterialName: primary ? primary.name : null,
    catalyst:
      essence === null
        ? null
        : { templateId: essence, name: templates.get(essence)?.name ?? '' },
    modifiers: choice.reagentIds
      .filter((id): id is bigint => id !== null)
      .map((id) => ({ templateId: id, name: templates.get(id)?.name ?? null })),
    countOf: (templateId: bigint) => bagCount(items, templateId),
  };
}

/** The instances left after the plan's consumption, in the order the server removes them. */
function itemsAfter(items: readonly ItemInstance[], consumes: ReadonlyArray<{ templateId: bigint; count: bigint }>): ItemInstance[] {
  const left = items.map((instance) => ({ ...instance }));
  for (const need of consumes) {
    let remaining = need.count;
    for (const instance of left) {
      if (remaining <= 0n) break;
      if (instance.templateId !== need.templateId || isEquipped(instance)) continue;
      const take = instance.quantity < remaining ? instance.quantity : remaining;
      instance.quantity -= take;
      remaining -= take;
    }
  }
  return left.filter((instance) => instance.quantity > 0n);
}

/**
 * Whether Craft can run, and the first reason it cannot, in the UI-SPEC order: no station, a short
 * material, an essence without a reagent (or too weak, or missing), a missing reagent, then a full
 * bag. The materials, essence and reagent verdicts are the shared planCraft, so they match what
 * craft_recipe will decide. The bag check counts the room the consumed materials free up, because
 * the server removes the inputs before it adds the output.
 */
export function craftAvailability(input: CraftAvailabilityInput): CraftAvailability {
  if (!input.station) return { available: false, reason: NO_STATION, plan: null };

  const planInput = planInputOf(input);
  const plan = planCraft(planInput);
  if (!plan.ok) {
    let reason: string;
    switch (plan.reason) {
      case 'materials': {
        const template = plan.templateId === undefined ? undefined : input.templates.get(plan.templateId);
        const missing = (plan.need ?? 0n) - (plan.have ?? 0n);
        reason = `Missing ${missing} ${template ? template.name : UNKNOWN_MATERIAL}.`;
        break;
      }
      case 'no_reagent':
        reason = 'Add a reagent to use the essence, or remove it.';
        break;
      case 'essence_tier':
        reason = `Too weak for ${capitalize(craftQualityForMaterialName(planInput.primaryMaterialName))} quality`;
        break;
      case 'catalyst_missing':
        reason = `Missing 1 ${planInput.catalyst && planInput.catalyst.name !== '' ? planInput.catalyst.name : 'essence'}.`;
        break;
      default:
        reason = `Missing 1 ${plan.message.replace('Missing modifier: ', '')}.`;
        break;
    }
    return { available: false, reason, plan };
  }

  const output = input.templates.get(input.recipe.outputTemplateId);
  const remaining = itemsAfter(input.items, plan.consumes);
  if (!hasBackpackSpace(remaining, input.recipe.outputTemplateId, output ? output.stackable : false)) {
    return { available: false, reason: BACKPACK_FULL, plan };
  }
  return { available: true, reason: null, plan };
}

export interface CraftArgs {
  characterId: bigint;
  recipeTemplateId: bigint;
  catalystTemplateId?: bigint;
  modifier1TemplateId?: bigint;
  modifier2TemplateId?: bigint;
  modifier3TemplateId?: bigint;
}

/**
 * The craft_recipe arguments: only the chosen ids (unset ones are omitted). The chosen reagents
 * fill modifier1 to modifier3 in slot order. Reagents are sent only with an essence, because the
 * server ignores them without one.
 */
export function craftArgs(
  characterId: bigint,
  recipeTemplateId: bigint,
  choice: CraftChoice,
): CraftArgs {
  const args: CraftArgs = { characterId, recipeTemplateId };
  if (choice.essenceId === null) return args;
  args.catalystTemplateId = choice.essenceId;
  const reagents = choice.reagentIds.filter((id): id is bigint => id !== null);
  if (reagents[0] !== undefined) args.modifier1TemplateId = reagents[0];
  if (reagents[1] !== undefined) args.modifier2TemplateId = reagents[1];
  if (reagents[2] !== undefined) args.modifier3TemplateId = reagents[2];
  return args;
}
