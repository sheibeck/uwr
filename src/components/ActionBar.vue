<template>
  <div :style="styles.actionBar">
    <button @click="$emit('toggle', 'character')" :style="actionStyle('character')">
      Character
    </button>
    <template v-if="hasActiveCharacter">
      <button @click="$emit('toggle', 'inventory')" :style="actionStyle('inventory')">
        Inventory
      </button>
      <button @click="$emit('toggle', 'friends')" :style="actionStyle('friends')">
        Friends
      </button>
      <button @click="$emit('toggle', 'group')" :style="actionStyle('group')">
        Group
      </button>
      <button @click="$emit('toggle', 'stats')" :style="actionStyle('stats')">
        Stats
      </button>
      <button @click="$emit('toggle', 'travel')" :style="actionStyle('travel')">
        Travel
      </button>
      <button @click="$emit('toggle', 'combat')" :style="actionStyle('combat')">
        Combat
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
}>();

defineEmits<{
  (e: 'toggle', panel: PanelKey): void;
}>();

const actionStyle = (panel: PanelKey) => ({
  ...props.styles.actionButton,
  ...(props.activePanel === panel ? props.styles.actionButtonActive : {}),
});
</script>
