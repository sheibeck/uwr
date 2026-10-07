import { PhCube } from '@phosphor-icons/vue';
import {
  MATERIAL_DEFS,
  SALVAGE_COMPONENT_CHANCE_PCT,
  SALVAGE_REAGENT_CHANCE_PCT,
  getMaterialForSalvage,
  itemKeyFromName,
  salvageComponents,
  salvageReagentDefs,
} from '@game-data/crafting_rules';
import type { SalvageComponent, SalvagePart } from '@game-data/crafting_rules';
import { isSalvageableTemplate } from '@game-data/item_rules';
import type { ItemAffix, ItemInstance, ItemTemplate, RecipeTemplate } from '../module_bindings/types';
import { affixesFor } from './compare';
import { nameColor } from './itemModel';

// What a salvage might give back, for the Inventory confirm and the Crafting salvage detail. Salvage is
// a chance at a smaller return, never a sure one (owner, 2026-10-07: "Salvage should never be a
// guaranteed return. Just a chance for some lesser amount of some components. Rare components have
// rarer chance to be returned."), so the confirm never promises a count and speaks in chances. It calls
// the very rule the server rolls (crafting_rules salvageComponents, salvageReagentDefs), so the
// components, amounts and chances here are the ones salvage_item rolls for. The material values come
// from MATERIAL_DEFS, the values the server upserts into each material template; the recipe parts come
// from the hub's outputRecipes. The hub keeps one recipe per output, the lowest id, which is the recipe
// the server takes the components from. A scroll is never promised, because the client cannot see
// scroll templates and generated recipes have none; the result card reports one when the server grants
// it. Names stay plain strings. Pure: no Vue.

export interface SalvagePreviewInput {
  instance: Pick<ItemInstance, 'id'>;
  template: ItemTemplate;
  /** Every loaded affix; only this instance's own are read. */
  affixes: readonly ItemAffix[];
  characterId: bigint;
  /** The recipe that makes this item: null when none exists, undefined while the hub has not applied. */
  outputRecipe: RecipeTemplate | null | undefined;
  /** Loaded templates by id; the recipe parts are read from here. */
  templates: ReadonlyMap<bigint, ItemTemplate>;
}

export interface SalvageYieldView {
  key: string;
  icon: typeof PhCube;
  iconColor: string;
  name: string;
  /** 'unlikely' on a component under 25%, 'from “of Intelligence”' on the reagent line, else empty. */
  note: string;
  /** '×1 · 50% chance' on a component, '12% chance' on the reagent: every line is a chance. */
  text: string;
}

export interface SalvagePreview {
  /** What might come back, each with its own chance (the server's salvageComponents). Empty while not knowable. */
  components: SalvageComponent[];
  /** False while the recipe parts cannot be read yet: no component can be named then. */
  knowable: boolean;
  reagentPossible: boolean;
  yields: SalvageYieldView[];
  /** The Inventory confirm text in chance wording, with no digit and no promised count. */
  confirmText: string;
}

/**
 * A component at or above this chance is "likely" in the confirm wording; below it is rare. It is the
 * server's tier 2 chance, so tiers 1 and 2 read as likely and tier 3 as rare even if the owner retunes
 * the chances (no client copy of the number).
 */
const LIKELY_PCT = SALVAGE_COMPONENT_CHANCE_PCT[2];

function requirementsOf(recipe: RecipeTemplate): { templateId: bigint; count: bigint }[] {
  const parts = [
    { templateId: recipe.req1TemplateId, count: recipe.req1Count },
    { templateId: recipe.req2TemplateId, count: recipe.req2Count },
  ];
  if (recipe.req3TemplateId !== undefined && recipe.req3TemplateId !== null) {
    parts.push({ templateId: recipe.req3TemplateId, count: recipe.req3Count ?? 0n });
  }
  return parts;
}

/** 'A', 'A and B', 'A, B and C'. */
function listOf(names: readonly string[]): string {
  if (names.length <= 1) return names.join('');
  return `${names.slice(0, names.length - 1).join(', ')} and ${names[names.length - 1]}`;
}

/**
 * What a salvage of this instance might give, by the server's rule; null unless the template is
 * salvageable (a non-junk template in an equipment slot).
 */
export function salvagePreview(input: SalvagePreviewInput): SalvagePreview | null {
  const { instance, template, characterId, outputRecipe, templates } = input;
  if (!isSalvageableTemplate(template)) return null;

  // The recipe parts, unknown while the hub has not applied or a part template is not loaded, so a
  // component is never named from half the recipe.
  let knowable = outputRecipe !== undefined;
  const parts: SalvagePart[] = [];
  if (outputRecipe) {
    for (const part of requirementsOf(outputRecipe)) {
      const partTemplate = templates.get(part.templateId);
      if (partTemplate === undefined) {
        knowable = false;
        continue;
      }
      parts.push({
        templateId: part.templateId,
        name: partTemplate.name,
        count: part.count,
        vendorValue: partTemplate.vendorValue ?? null,
      });
    }
  }

  let components: SalvageComponent[] = [];
  if (knowable) {
    // No recipe: the slot material, valued from MATERIAL_DEFS by name key as the server upserts it.
    let slotMaterial: { name: string; vendorValue: bigint } | null = null;
    if (!outputRecipe) {
      const name = getMaterialForSalvage(template.slot, template.armorType, template.tier ?? 1n);
      const key = name === undefined ? '' : itemKeyFromName(name);
      const def = key === '' ? undefined : MATERIAL_DEFS.find((m) => m.key === key);
      slotMaterial = def ? { name: def.name, vendorValue: def.vendorValue ?? 0n } : null;
    }
    components = salvageComponents({
      slot: template.slot,
      armorType: template.armorType,
      tier: template.tier ?? 1n,
      itemValue: template.vendorValue ?? 0n,
      recipes: outputRecipe
        ? [{ id: outputRecipe.id, outputCount: outputRecipe.outputCount, parts }]
        : [],
      slotMaterial,
    });
  }

  const yields: SalvageYieldView[] = components.map((c) => ({
    key: `component:${itemKeyFromName(c.name)}`,
    icon: PhCube,
    iconColor: nameColor('common', false),
    name: c.name,
    note: c.chancePct < LIKELY_PCT ? 'unlikely' : '',
    text: `×${c.amount} · ${c.chancePct}% chance`,
  }));

  // The reagent the server would pick when its chance hits: deterministic from the ids.
  const own = affixesFor(instance.id, input.affixes);
  const defs = salvageReagentDefs(own);
  const reagentPossible = defs.length > 0;
  if (reagentPossible) {
    const pick = defs[Number((instance.id + characterId) % BigInt(defs.length))];
    const source = own.find((a) => a.affixType !== 'implicit' && a.statKey === pick.statKey);
    yields.push({
      key: 'reagent',
      icon: PhCube,
      iconColor: nameColor('common', false),
      name: pick.name,
      note: source ? `from “${source.affixName}”` : '',
      text: `${SALVAGE_REAGENT_CHANCE_PCT}% chance`,
    });
  }

  const lead = 'Salvage destroys this item.';
  const sentences: string[] = [lead];
  if (!knowable) {
    sentences.push('It may return some materials.');
    if (reagentPossible) sentences.push('It may also give a reagent.');
  } else {
    const likely = components.filter((c) => c.chancePct >= LIKELY_PCT).map((c) => c.name);
    const rare = components.filter((c) => c.chancePct < LIKELY_PCT).map((c) => c.name);
    if (likely.length > 0) sentences.push(`It may return some ${listOf(likely)}.`);
    if (rare.length > 0) {
      if (likely.length === 0) sentences.push(`It may rarely return ${listOf(rare)}.`);
      else if (rare.length === 1) sentences.push(`${rare[0]} rarely comes back.`);
      else sentences.push(`${listOf(rare)} rarely come back.`);
    }
    if (reagentPossible) {
      sentences.push(components.length > 0 ? 'It may also give a reagent.' : 'It may give a reagent.');
    }
    if (components.length === 0 && !reagentPossible) sentences.push('Nothing usable will come of it.');
  }

  return { components, knowable, reagentPossible, yields, confirmText: sentences.join(' ') };
}
