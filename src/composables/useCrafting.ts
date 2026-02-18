import { computed, ref, type Ref } from 'vue';
import { reducers, type CharacterRow, type ItemInstanceRow, type ItemTemplateRow, type RecipeTemplateRow, type RecipeDiscoveredRow } from '../module_bindings';
import { useReducer } from 'spacetimedb/vue';

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
        return {
          id: recipe.id,
          name: recipe.name,
          outputName: output?.name ?? 'Unknown',
          outputCount: recipe.outputCount,
          requirements,
          canCraft,
          recipeType,
          materialType,
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

  const research = () => {
    if (!connActive.value || !selectedCharacter.value) return;
    researchReducer({ characterId: selectedCharacter.value.id });
  };

  const craft = (recipeTemplateId: bigint) => {
    if (!connActive.value || !selectedCharacter.value) return;
    craftReducer({ characterId: selectedCharacter.value.id, recipeTemplateId });
  };

  return {
    recipes,
    filteredRecipes,
    recipeTypes,
    activeFilter,
    showOnlyCraftable,
    research,
    craft,
  };
};
