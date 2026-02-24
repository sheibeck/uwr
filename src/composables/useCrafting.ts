import { computed, ref, type Ref } from 'vue';
import { reducers } from '../module_bindings';
import type { CharacterRow, ItemInstanceRow, ItemTemplateRow, RecipeTemplateRow, RecipeDiscoveredRow } from '../stdb-types';
import { useReducer } from 'spacetimedb/vue';
import { buildItemTooltipData } from './useItemTooltip';

// Modifier item names that correspond to crafting affixes
const MODIFIER_ITEM_NAMES = new Set([
  'Glowing Stone', 'Clear Crystal', 'Ancient Rune', 'Wisdom Herb',
  'Silver Token', 'Life Stone', 'Mana Pearl', 'Iron Ward', 'Spirit Ward',
]);

const MODIFIER_STAT_KEYS: Record<string, string> = {
  'Glowing Stone': 'strBonus',
  'Clear Crystal': 'dexBonus',
  'Ancient Rune': 'intBonus',
  'Wisdom Herb': 'wisBonus',
  'Silver Token': 'chaBonus',
  'Life Stone': 'hpBonus',
  'Mana Pearl': 'manaBonus',
  'Iron Ward': 'armorClassBonus',
  'Spirit Ward': 'magicResistanceBonus',
};

const MODIFIER_DESCRIPTIONS: Record<string, string> = {
  'Glowing Stone': 'Adds Strength to the crafted item.',
  'Clear Crystal': 'Adds Dexterity to the crafted item.',
  'Ancient Rune': 'Adds Intelligence to the crafted item.',
  'Wisdom Herb': 'Adds Wisdom to the crafted item.',
  'Silver Token': 'Adds Charisma to the crafted item.',
  'Life Stone': 'Adds max HP to the crafted item.',
  'Mana Pearl': 'Adds max Mana to the crafted item.',
  'Iron Ward': 'Adds Armor Class to the crafted item.',
  'Spirit Ward': 'Adds Magic Resistance to the crafted item.',
};

const ESSENCE_MAGNITUDES: Record<string, number> = {
  'Lesser Essence': 1,
  'Essence': 2,
  'Greater Essence': 3,
};

// Mirrors server-side MODIFIER_MAGNITUDE_BY_ESSENCE + ESSENCE_MAGNITUDE in
// spacetimedb/src/data/crafting_materials.ts — client copy for display purposes only.
const MODIFIER_MAGNITUDE_BY_ESSENCE: Record<string, Record<string, number>> = {
  'Lesser Essence': { hpBonus: 5, manaBonus: 5, armorClassBonus: 2 },
  'Essence': { hpBonus: 8, manaBonus: 8, armorClassBonus: 4 },
  'Greater Essence': { hpBonus: 15, manaBonus: 15, armorClassBonus: 8 },
};

/**
 * Returns the magnitude for a modifier stat + essence combination.
 * Checks MODIFIER_MAGNITUDE_BY_ESSENCE for stat-specific overrides (HP/mana)
 * first, then falls back to ESSENCE_MAGNITUDES.
 *
 * Mirrors server-side getModifierMagnitude() in crafting_materials.ts
 */
export function getModifierMagnitude(essenceName: string, statKey: string): number {
  return MODIFIER_MAGNITUDE_BY_ESSENCE[essenceName]?.[statKey] ?? ESSENCE_MAGNITUDES[essenceName] ?? 1;
}

const tierToCraftQuality = (tier: bigint): string => {
  if (tier === 3n) return 'exquisite';
  if (tier === 2n) return 'reinforced';
  return 'standard';
};

type CraftingOutputItem = {
  name: string;
  rarity: string;
  qualityTier: string;
  slot: string;
  armorType: string;
  allowedClasses: string;
  description: string;
  stats: { label: string; value: string }[];
  affixStats: { label: string; value: string; affixName: string }[];
  requiredLevel?: bigint;
  tier?: bigint;
  isNamed?: boolean;
  craftQuality?: string;
};

export type CraftingRecipe = {
  id: bigint;
  name: string;
  outputName: string;
  outputCount: bigint;
  craftQuality: string;
  requirements: { name: string; required: bigint; available: bigint; hasMaterial: boolean }[];
  canCraft: boolean;
  recipeType: string;
  materialType?: string;
  outputItem: CraftingOutputItem | null;
};

export type CraftingEssenceItem = {
  templateId: bigint;
  name: string;
  magnitude: number;
  available: bigint;
};

export type CraftingModifierItem = {
  templateId: bigint;
  name: string;
  description: string;
  statKey: string;
  available: bigint;
};

type UseCraftingArgs = {
  connActive: Ref<boolean>;
  selectedCharacter: Ref<CharacterRow | null>;
  itemInstances: Ref<ItemInstanceRow[]>;
  itemTemplates: Ref<ItemTemplateRow[]>;
  recipeTemplates: Ref<RecipeTemplateRow[]>;
  recipeDiscovered: Ref<RecipeDiscoveredRow[]>;
};

export const useCrafting = ({
  connActive,
  selectedCharacter,
  itemInstances,
  itemTemplates,
  recipeTemplates,
  recipeDiscovered,
}: UseCraftingArgs) => {
  const researchReducer = useReducer(reducers.researchRecipes);
  const craftReducer = useReducer(reducers.craftRecipe);

  const activeFilter = ref<string>('All');
  const showOnlyCraftable = ref(false);

  // Modal state
  const craftingModalRecipe = ref<CraftingRecipe | null>(null);
  const openCraftModal = (recipe: CraftingRecipe) => { craftingModalRecipe.value = recipe; };
  const closeCraftModal = () => { craftingModalRecipe.value = null; };

  const ownedInstances = computed(() => {
    if (!selectedCharacter.value) return [];
    return itemInstances.value.filter(
      (instance) => instance.ownerCharacterId.toString() === selectedCharacter.value?.id.toString()
    );
  });

  const countForTemplate = (templateId: bigint) => {
    let count = 0n;
    for (const instance of ownedInstances.value) {
      if (instance.equippedSlot) continue;
      if (instance.templateId.toString() !== templateId.toString()) continue;
      count += instance.quantity ?? 1n;
    }
    return count;
  };

  const discoveredRecipeIds = computed(() => {
    const charId = selectedCharacter.value?.id;
    if (!charId) return new Set<string>();
    return new Set(
      recipeDiscovered.value
        .filter((row) => row.characterId.toString() === charId.toString())
        .map((row) => row.recipeTemplateId.toString())
    );
  });

  const recipes = computed(() =>
    recipeTemplates.value
      .filter((recipe) => discoveredRecipeIds.value.has(recipe.id.toString()))
      .map((recipe) => {
        const req1 = itemTemplates.value.find((row) => row.id.toString() === recipe.req1TemplateId.toString());
        const req2 = itemTemplates.value.find((row) => row.id.toString() === recipe.req2TemplateId.toString());
        const output = itemTemplates.value.find((row) => row.id.toString() === recipe.outputTemplateId.toString());
        const req1Owned = countForTemplate(recipe.req1TemplateId);
        const req2Owned = countForTemplate(recipe.req2TemplateId);
        const req3Owned =
          recipe.req3TemplateId != null ? countForTemplate(recipe.req3TemplateId) : 0n;
        const meetsReq3 =
          recipe.req3TemplateId == null || req3Owned >= (recipe.req3Count ?? 0n);
        const canCraft = req1Owned >= recipe.req1Count && req2Owned >= recipe.req2Count && meetsReq3;
        const requirements: { name: string; required: bigint; available: bigint; hasMaterial: boolean }[] = [
          {
            name: req1?.name ?? 'Unknown',
            required: recipe.req1Count,
            available: req1Owned,
            hasMaterial: req1Owned >= recipe.req1Count,
          },
          {
            name: req2?.name ?? 'Unknown',
            required: recipe.req2Count,
            available: req2Owned,
            hasMaterial: req2Owned >= recipe.req2Count,
          },
        ];
        if (recipe.req3TemplateId != null) {
          const req3 = itemTemplates.value.find(
            (row) => row.id.toString() === recipe.req3TemplateId?.toString()
          );
          requirements.push({
            name: req3?.name ?? 'Unknown',
            required: recipe.req3Count ?? 0n,
            available: req3Owned,
            hasMaterial: req3Owned >= (recipe.req3Count ?? 0n),
          });
        }
        const recipeType: string = (recipe as any).recipeType ?? 'consumable';
        const materialType: string | undefined = (recipe as any).materialType ?? undefined;
        const outputItem = output
          ? {
              ...buildItemTooltipData({ template: output }),
              requiredLevel: output.requiredLevel,
            }
          : null;
        // Determine craft quality from req1 material tier
        const craftQuality = tierToCraftQuality(req1?.tier ?? 1n);
        return {
          id: recipe.id,
          name: recipe.name,
          outputName: output?.name ?? 'Unknown',
          outputCount: recipe.outputCount,
          craftQuality,
          requirements,
          canCraft,
          recipeType,
          materialType,
          outputItem,
        };
      })
      .sort((a, b) => a.name.localeCompare(b.name))
  );

  const recipeTypes = computed(() => {
    const types = new Set(recipes.value.map((r) => r.recipeType));
    return ['All', ...Array.from(types).sort()];
  });

  const filteredRecipes = computed(() =>
    recipes.value
      .filter((r) => activeFilter.value === 'All' || r.recipeType === activeFilter.value)
      .filter((r) => !showOnlyCraftable.value || r.canCraft)
  );

  // Modifier items in player inventory (items matching crafting modifier names)
  const modifierItems = computed((): CraftingModifierItem[] => {
    const result: CraftingModifierItem[] = [];
    for (const instance of ownedInstances.value) {
      if (instance.equippedSlot) continue;
      const template = itemTemplates.value.find(t => t.id.toString() === instance.templateId.toString());
      if (!template || !MODIFIER_ITEM_NAMES.has(template.name)) continue;
      const count = countForTemplate(instance.templateId);
      if (count <= 0n) continue;
      if (result.some(r => r.templateId.toString() === instance.templateId.toString())) continue;
      result.push({
        templateId: template.id,
        name: template.name,
        description: MODIFIER_DESCRIPTIONS[template.name] ?? '',
        statKey: MODIFIER_STAT_KEYS[template.name] ?? '',
        available: count,
      });
    }
    return result;
  });

  // Essence items in player inventory
  const essenceItems = computed((): CraftingEssenceItem[] => {
    const result: CraftingEssenceItem[] = [];
    const essenceNames = Object.keys(ESSENCE_MAGNITUDES);
    for (const instance of ownedInstances.value) {
      if (instance.equippedSlot) continue;
      const template = itemTemplates.value.find(t => t.id.toString() === instance.templateId.toString());
      if (!template || !essenceNames.includes(template.name)) continue;
      const count = countForTemplate(instance.templateId);
      if (count <= 0n) continue;
      if (result.some(r => r.templateId.toString() === instance.templateId.toString())) continue;
      result.push({
        templateId: template.id,
        name: template.name,
        magnitude: ESSENCE_MAGNITUDES[template.name] ?? 1,
        available: count,
      });
    }
    return result;
  });

  const research = () => {
    if (!connActive.value || !selectedCharacter.value) return;
    researchReducer({ characterId: selectedCharacter.value.id });
  };

  const craft = (recipeTemplateId: bigint) => {
    if (!connActive.value || !selectedCharacter.value) return;
    craftReducer({ characterId: selectedCharacter.value.id, recipeTemplateId, catalystTemplateId: undefined, modifier1TemplateId: undefined, modifier2TemplateId: undefined, modifier3TemplateId: undefined });
  };

  const craftWithEnhancements = (args: {
    recipeTemplateId: bigint;
    catalystTemplateId?: bigint;
    modifier1TemplateId?: bigint;
    modifier2TemplateId?: bigint;
    modifier3TemplateId?: bigint;
  }) => {
    if (!connActive.value || !selectedCharacter.value) return;
    craftReducer({
      characterId: selectedCharacter.value.id,
      recipeTemplateId: args.recipeTemplateId,
      catalystTemplateId: args.catalystTemplateId,
      modifier1TemplateId: args.modifier1TemplateId,
      modifier2TemplateId: args.modifier2TemplateId,
      modifier3TemplateId: args.modifier3TemplateId,
    });
    closeCraftModal();
  };

  return {
    recipes,
    filteredRecipes,
    recipeTypes,
    activeFilter,
    showOnlyCraftable,
    craftingModalRecipe,
    openCraftModal,
    closeCraftModal,
    modifierItems,
    essenceItems,
    research,
    craft,
    craftWithEnhancements,
  };
};
