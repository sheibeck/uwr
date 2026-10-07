import { PhCube } from '@phosphor-icons/vue';
import {
  MATERIAL_DEFS,
  SALVAGE_REAGENT_CHANCE_PCT,
  getMaterialForSalvage,
  itemKeyFromName,
  salvageMaterialYield,
  salvageReagentDefs,
} from '@game-data/crafting_rules';
import { isSalvageableTemplate } from '@game-data/item_rules';
import type { ItemAffix, ItemInstance, ItemTemplate, RecipeTemplate } from '../module_bindings/types';
import { affixesFor } from './compare';
import { nameColor } from './itemModel';

// The salvage yield the Inventory confirm and the Crafting "You'll receive" list name. It uses the
// server's own rule (crafting_rules salvageMaterialYield and salvageReagentDefs, which salvage_item
// calls since plan 50-30). The material value comes from MATERIAL_DEFS, the value the server upserts
// into each material template. The recipe cap comes from the hub's outputRecipes. A scroll is never
// promised, because the client cannot see scroll templates and generated recipes have none; the
// result card reports one when the server grants it. Names stay plain strings. Pure: no Vue.

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
  /** 'from “of Intelligence”' on the reagent line, else empty. */
  note: string;
  /** '×2' for a known count, '12% chance' for the reagent, empty when the count is unknown. */
  text: string;
  /** The line is a chance, not a guarantee. */
  chance: boolean;
}

export interface SalvagePreview {
  /** The guaranteed material, or null when this slot and tier give none. count is exact only when countKnown. */
  material: { name: string; count: bigint } | null;
  /** False while the recipe cap cannot be read yet: the count must not be shown then. */
  countKnown: boolean;
  reagentPossible: boolean;
  yields: SalvageYieldView[];
  /** The Inventory confirm text naming the yield. */
  confirmText: string;
}

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

/**
 * What a salvage of this instance gives, by the server's rule; null unless the template is
 * salvageable (a non-junk template in an equipment slot).
 */
export function salvagePreview(input: SalvagePreviewInput): SalvagePreview | null {
  const { instance, template, characterId, outputRecipe, templates } = input;
  if (!isSalvageableTemplate(template)) return null;

  const tier = template.tier ?? 1n;
  const materialName = getMaterialForSalvage(template.slot, template.armorType, tier);
  const materialKey = materialName === undefined ? '' : itemKeyFromName(materialName);
  const def = materialKey === '' ? undefined : MATERIAL_DEFS.find((m) => m.key === materialKey);

  // The recipe cap: how much of the material the recipe consumed. Unknown while a part template is
  // missing or the hub has not applied, so the count is never overstated.
  let countKnown = outputRecipe !== undefined;
  let recipeConsumed = 0n;
  if (outputRecipe) {
    for (const part of requirementsOf(outputRecipe)) {
      const partTemplate = templates.get(part.templateId);
      if (partTemplate === undefined) {
        countKnown = false;
        continue;
      }
      if (itemKeyFromName(partTemplate.name) === materialKey) recipeConsumed += part.count;
    }
  }

  const yielded = salvageMaterialYield({
    slot: template.slot,
    armorType: template.armorType,
    tier,
    itemValue: template.vendorValue ?? 0n,
    material: def ? { name: def.name, vendorValue: def.vendorValue } : null,
    recipeConsumed: countKnown ? recipeConsumed : 0n,
  });
  const material = yielded ? { name: yielded.name, count: yielded.count } : null;

  const yields: SalvageYieldView[] = [];
  if (material !== null && (!countKnown || material.count > 0n)) {
    yields.push({
      key: 'material',
      icon: PhCube,
      iconColor: nameColor('common', false),
      name: material.name,
      note: '',
      text: countKnown ? `×${material.count}` : '',
      chance: false,
    });
  }

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
      chance: true,
    });
  }

  const lead = 'Salvage destroys this item.';
  const maybe = reagentPossible ? ', and maybe a reagent' : '';
  let confirmText: string;
  if (material !== null && !countKnown) {
    confirmText = `${lead} You'll get ${material.name}${maybe}.`;
  } else if (material !== null && material.count > 0n) {
    confirmText = `${lead} You'll get ${material.count} ${material.name}${maybe}.`;
  } else if (reagentPossible) {
    confirmText = `${lead} You'll get no materials, but maybe a reagent.`;
  } else {
    confirmText = `${lead} Nothing usable will be left.`;
  }

  return { material, countKnown, reagentPossible, yields, confirmText };
}
