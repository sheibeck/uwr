<template>
  <div :style="styles.actionBar">
    <button
      @click="emit('toggle', 'character')"
      :style="actionStyle('character')"
      :disabled="isLocked('character')"
    >
      Character
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
        @click="emit('toggle', 'stats')"
        :style="actionStyle('stats')"
        :disabled="isLocked('stats')"
      >
        Stats
      </button>
      <button
        @click="emit('toggle', 'friends')"
        :style="actionStyle('friends')"
        :disabled="isLocked('friends')"
      >
        Friends
      </button>
      <button
        @click="emit('toggle', 'group')"
        :style="actionStyle('group')"
        :disabled="isLocked('group')"
      >
        Group
      </button>
      <button
        @click="emit('toggle', 'combat')"
        :style="actionStyle('combat')"
        :disabled="isLocked('combat')"
      >
        Combat
      </button>
      <button
        @click="emit('toggle', 'travel')"
        :style="actionStyle('travel')"
        :disabled="isLocked('travel')"
      >
        Travel
      </button>
    </template>
  </div>
</template>

<script setup lang="ts">
type PanelKey = 'none' | 'character' | 'inventory' | 'friends' | 'group' | 'stats' | 'travel' | 'combat';

const props = defineProps<{
  styles: Record<string, Record<string, string | number>>;
  activePanel: PanelKey;
  hasActiveCharacter: boolean;
  combatLocked: boolean;
}>();

const emit = defineEmits<{
  (e: 'toggle', panel: PanelKey): void;
}>();

const actionStyle = (panel: PanelKey) => ({
  ...props.styles.actionButton,
  ...(props.activePanel === panel ? props.styles.actionButtonActive : {}),
  ...(isLocked(panel) ? { opacity: 0.45, cursor: 'not-allowed' } : {}),
});

const isLocked = (panel: PanelKey) => {
  if (!props.combatLocked) return false;
  return panel !== 'combat' && panel !== 'group';
};
</script>
