<template>
  <div :style="styles.panelBody">
    <div v-if="!selectedCharacter" :style="styles.subtle">
      Select a character to craft.
    </div>
    <div v-else>
      <div v-if="combatLocked" :style="styles.subtle">
        Crafting is disabled during combat.
      </div>
      <div v-if="!craftingAvailable" :style="styles.subtle">
        Crafting is only available at locations with crafting stations.
      </div>

      <!-- Type filter chips -->
      <div style="display: flex; gap: 4px; margin-bottom: 8px; flex-wrap: wrap;">
        <button
          v-for="type in recipeTypes"
          :key="type"
          @click="$emit('update:activeFilter', type)"
          :style="{
            padding: '2px 8px',
            fontSize: '11px',
            border: '1px solid #555',
            borderRadius: '3px',
            background: activeFilter === type ? '#4a6' : '#333',
            color: activeFilter === type ? '#fff' : '#aaa',
            cursor: 'pointer',
          }"
        >
          {{ type }}
        </button>
      </div>

      <!-- Show only craftable toggle -->
      <label style="display: flex; align-items: center; gap: 4px; font-size: 11px; color: #aaa; margin-bottom: 6px; cursor: pointer;">
        <input type="checkbox" :checked="showOnlyCraftable" @change="$emit('update:showOnlyCraftable', ($event.target as HTMLInputElement).checked)" />
        Show only craftable
      </label>

      <div v-if="recipes.length === 0" :style="styles.subtle">No recipes discovered.</div>
      <ul v-else :style="styles.list">
        <li v-for="recipe in recipes" :key="recipe.id.toString()" :style="styles.recipeCard"
          @mouseenter="recipe.outputItem && $emit('show-tooltip', { item: recipe.outputItem, x: $event.clientX, y: $event.clientY })"
          @mousemove="recipe.outputItem && $emit('move-tooltip', { x: $event.clientX, y: $event.clientY })"
          @mouseleave="recipe.outputItem && $emit('hide-tooltip')"
        >
          <div :style="styles.recipeHeader">
            <div :style="styles.recipeName">{{ recipe.name }}</div>
            <div :style="styles.subtle">Creates {{ recipe.outputName }} x{{ recipe.outputCount }}</div>
          </div>
          <div :style="styles.recipeRequirements">
            <div v-for="req in recipe.requirements" :key="req.name">
              <span :style="{ color: req.hasMaterial ? '#4a6' : '#c44', fontSize: '12px' }">
                {{ req.name }}: {{ req.available }}/{{ req.required }}
              </span>
            </div>
          </div>
          <button
            :style="[styles.primaryButton, (!craftingAvailable || combatLocked) ? styles.disabledButton : {}]"
            :disabled="!craftingAvailable || combatLocked"
            @click="$emit('open-modal', recipe)"
          >
            Craft
          </button>
        </li>
      </ul>
    </div>
  </div>
</template>

<script setup lang="ts">
defineProps<{
  styles: Record<string, Record<string, string | number>>;
  selectedCharacter: { id: bigint } | null;
  craftingAvailable: boolean;
  combatLocked: boolean;
  recipeTypes: string[];
  activeFilter: string;
  showOnlyCraftable: boolean;
  recipes: {
    id: bigint;
    name: string;
    outputName: string;
    outputCount: bigint;
    requirements: { name: string; required: bigint; available: bigint; hasMaterial: boolean }[];
    canCraft: boolean;
    recipeType: string;
    materialType?: string;
    outputItem: {
      name: string;
      rarity: string;
      qualityTier: string;
      slot: string;
      armorType: string;
      allowedClasses: string;
      description: string | null;
      stats: { label: string; value: string }[];
      affixStats: { label: string; value: string; affixName: string }[];
    } | null;
  }[];
}>();

defineEmits<{
  (e: 'update:activeFilter', value: string): void;
  (e: 'update:showOnlyCraftable', value: boolean): void;
  (e: 'open-modal', recipe: any): void;
  (e: 'show-tooltip', value: { item: any; x: number; y: number }): void;
  (e: 'move-tooltip', value: { x: number; y: number }): void;
  (e: 'hide-tooltip'): void;
}>();
</script>
