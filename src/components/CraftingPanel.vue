<template>
  <div>
    <div :style="styles.panelSectionTitle">Crafting</div>
    <div v-if="!selectedCharacter" :style="styles.subtle">
      Select a character to craft.
    </div>
    <div v-else>
      <div :style="styles.rowGap">
        <button :style="styles.ghostButton" @click="$emit('research')">Research Recipes</button>
        <div v-if="!craftingAvailable" :style="styles.subtle">
          Crafting is only available at locations with crafting stations.
        </div>
      </div>
      <div v-if="recipes.length === 0" :style="styles.subtle">No recipes discovered.</div>
      <ul v-else :style="styles.list">
        <li v-for="recipe in recipes" :key="recipe.id.toString()" :style="styles.recipeCard">
          <div :style="styles.recipeHeader">
            <div :style="styles.recipeName">{{ recipe.name }}</div>
            <div :style="styles.subtle">Creates {{ recipe.outputName }} x{{ recipe.outputCount }}</div>
          </div>
          <div :style="styles.recipeRequirements">
            <div v-for="req in recipe.requirements" :key="req.name" :style="styles.subtle">
              {{ req.name }}: {{ req.available }} / {{ req.required }}
            </div>
          </div>
          <button
            :style="[styles.primaryButton, !recipe.canCraft ? styles.disabledButton : {}]"
            :disabled="!recipe.canCraft || !craftingAvailable"
            @click="$emit('craft', recipe.id)"
          >
            Craft
          </button>
        </li>
      </ul>
    </div>
  </div>
</template>

<script setup lang="ts">
import type { CharacterRow } from '../module_bindings';

defineProps<{
  styles: Record<string, Record<string, string | number>>;
  selectedCharacter: CharacterRow | null;
  craftingAvailable: boolean;
  recipes: {
    id: bigint;
    name: string;
    outputName: string;
    outputCount: bigint;
    requirements: { name: string; required: bigint; available: bigint }[];
    canCraft: boolean;
  }[];
}>();

defineEmits<{
  (e: 'research'): void;
  (e: 'craft', recipeId: bigint): void;
}>();
</script>
