<template>
  <div :style="styles.actionBar">
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
        @click="emit('toggle', 'hotbar')"
        :style="actionStyle('hotbar')"
        :disabled="isLocked('hotbar')"
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
  | 'none'
  | 'character'
  | 'inventory'
  | 'hotbar'
  | 'friends'
  | 'group'
  | 'stats'
  | 'crafting'
  | 'journal'
  | 'quests'
  | 'renown'
  | 'travel'
  | 'combat';

const props = defineProps<{
  styles: Record<string, Record<string, string | number>>;
  activePanel: PanelKey;
  hasActiveCharacter: boolean;
  combatLocked: boolean;
  highlightInventory: boolean;
  highlightHotbar: boolean;
}>();

const emit = defineEmits<{
  (e: 'toggle', panel: PanelKey): void;
}>();

const actionStyle = (panel: PanelKey) => {
  const highlight =
    (panel === 'inventory' && props.highlightInventory) ||
    (panel === 'hotbar' && props.highlightHotbar);
  return {
    ...props.styles.actionButton,
    ...(props.activePanel === panel ? props.styles.actionButtonActive : {}),
    ...(highlight ? props.styles.actionButtonAttention : {}),
    ...(isLocked(panel) ? { opacity: 0.45, cursor: 'not-allowed' } : {}),
  };
};

const isLocked = (panel: PanelKey) => {
  // Character switching is blocked while the current character is in combat.
  if (panel === 'character' && props.hasActiveCharacter && props.combatLocked) {
    return true;
  }
  return false;
};
</script>
