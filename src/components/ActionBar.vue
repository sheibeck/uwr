<template>
  <div :style="styles.actionBar">
    <button
      @click="emit('toggle', 'log')"
      :style="actionStyle('log')"
    >
      Log
    </button>
    <button
      @click="emit('toggle', 'character')"
      :style="actionStyle('character')"
      :disabled="isLocked('character')"
    >
      Characters
    </button>
    <template v-if="hasActiveCharacter">
      <button
        @click="emit('toggle', 'inventory')"
        :style="actionStyle('inventory')"
        :disabled="isLocked('inventory')"
      >
        Inventory
      </button>
      <button
        @click="emit('toggle', 'hotbarPanel')"
        :style="actionStyle('hotbarPanel')"
        :disabled="isLocked('hotbarPanel')"
      >
        Hotbar
      </button>
      <button
        @click="emit('toggle', 'stats')"
        :style="actionStyle('stats')"
        :disabled="isLocked('stats')"
      >
        Stats
      </button>
      <button
        @click="emit('toggle', 'crafting')"
        :style="actionStyle('crafting')"
        :disabled="isLocked('crafting')"
      >
        Crafting
      </button>
      <button
        @click="emit('toggle', 'journal')"
        :style="actionStyle('journal')"
        :disabled="isLocked('journal')"
      >
        Journal
      </button>
      <button
        @click="emit('toggle', 'quests')"
        :style="actionStyle('quests')"
        :disabled="isLocked('quests')"
      >
        Quests
      </button>
      <button
        @click="emit('toggle', 'renown')"
        :style="actionStyle('renown')"
        :disabled="isLocked('renown')"
      >
        Renown
      </button>
      <button
        @click="emit('toggle', 'friends')"
        :style="actionStyle('friends')"
        :disabled="isLocked('friends')"
      >
        Friends
      </button>
    </template>
  </div>
</template>

<script setup lang="ts">
type PanelKey =
  | 'character'
  | 'inventory'
  | 'hotbar'
  | 'friends'
  | 'group'
  | 'log'
  | 'stats'
  | 'crafting'
  | 'journal'
  | 'quests'
  | 'renown'
  | 'travel'
  | 'combat';

const props = defineProps<{
  styles: Record<string, Record<string, string | number>>;
  openPanels: Set<string>;
  hasActiveCharacter: boolean;
  combatLocked: boolean;
  highlightInventory: boolean;
  highlightHotbar: boolean;
}>();

const emit = defineEmits<{
  (e: 'toggle', panel: string): void;
}>();

const actionStyle = (panel: string) => {
  const highlight =
    (panel === 'inventory' && props.highlightInventory) ||
    (panel === 'hotbarPanel' && props.highlightHotbar);
  return {
    ...props.styles.actionButton,
    ...(props.openPanels.has(panel) ? props.styles.actionButtonActive : {}),
    ...(highlight ? props.styles.actionButtonAttention : {}),
    ...(isLocked(panel) ? { opacity: 0.45, cursor: 'not-allowed' } : {}),
  };
};

const isLocked = (panel: string) => {
  // Character switching is blocked while the current character is in combat.
  if (panel === 'character' && props.hasActiveCharacter && props.combatLocked) {
    return true;
  }
  return false;
};
</script>
