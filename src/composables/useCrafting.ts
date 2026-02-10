import { computed, type Ref } from 'vue';
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
  const gatherReducer = useReducer(reducers.gatherResources);
  const researchReducer = useReducer(reducers.researchRecipes);
  const craftReducer = useReducer(reducers.craftRecipe);

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

  const discoveredRecipeIds = computed(() =>
    new Set(recipeDiscovered.value.map((row) => row.recipeTemplateId.toString()))
  );

  const recipes = computed(() =>
    recipeTemplates.value
      .filter((recipe) => discoveredRecipeIds.value.has(recipe.id.toString()))
      .map((recipe) => {
        const req1 = itemTemplates.value.find((row) => row.id.toString() === recipe.req1TemplateId.toString());
        const req2 = itemTemplates.value.find((row) => row.id.toString() === recipe.req2TemplateId.toString());
        const output = itemTemplates.value.find((row) => row.id.toString() === recipe.outputTemplateId.toString());
        const req1Count = countForTemplate(recipe.req1TemplateId);
        const req2Count = countForTemplate(recipe.req2TemplateId);
        const canCraft = req1Count >= recipe.req1Count && req2Count >= recipe.req2Count;
        return {
          id: recipe.id,
          name: recipe.name,
          outputName: output?.name ?? 'Unknown',
          outputCount: recipe.outputCount,
          requirements: [
            {
              name: req1?.name ?? 'Unknown',
              required: recipe.req1Count,
              available: req1Count,
            },
            {
              name: req2?.name ?? 'Unknown',
              required: recipe.req2Count,
              available: req2Count,
            },
          ],
          canCraft,
        };
      })
      .sort((a, b) => a.name.localeCompare(b.name))
  );

  const gather = () => {
    if (!connActive.value || !selectedCharacter.value) return;
    gatherReducer({ characterId: selectedCharacter.value.id });
  };

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
    gather,
    research,
    craft,
  };
};
