<template>
  <div :style="styles.actionBar">
    <button
      @click="emit('toggle', 'help')"
      :style="actionStyle('help')"
    >
      Help
    </button>
    <template v-if="hasActiveCharacter">
      <button
        @click="emit('camp')"
        :style="actionStyle('camp')"
        :disabled="isLocked('camp')"
      >
        Camp
      </button>
      <button
        @click="emit('toggle', 'characterInfo')"
        :style="actionStyle('characterInfo')"
        :disabled="isLocked('characterInfo')"
      >
        Character
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
        @click="emit('toggle', 'renown')"
        :style="actionStyle('renown')"
        :disabled="isLocked('renown')"
      >
        Renown
      </button>
      <button
        @click="emit('toggle', 'worldEvents')"
        :style="{ ...actionStyle('worldEvents'), position: 'relative' }"
      >
        Events
        <span
          v-if="hasActiveEvents"
          :style="{ position: 'absolute', top: '2px', right: '2px', width: '8px', height: '8px',
                    background: '#facc15', borderRadius: '50%', display: 'block' }"
        ></span>
      </button>
      <button
        @click="emit('toggle', 'travelPanel')"
        :style="actionStyle('travelPanel')"
        :disabled="isLocked('travelPanel')"
      >
        Travel
      </button>
      <button
        @click="emit('toggle', 'loot')"
        :style="actionStyle('loot')"
      >
        Loot
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
  | 'characterInfo'
  | 'friends'
  | 'group'
  | 'crafting'
  | 'journal'
  | 'renown'
  | 'loot'
  | 'travel'
  | 'travelPanel'
  | 'combat'
  | 'help'
  | 'worldEvents';

const props = defineProps<{
  styles: Record<string, Record<string, string | number>>;
  openPanels: Set<string>;
  hasActiveCharacter: boolean;
  combatLocked: boolean;
  highlightInventory: boolean;
  hasActiveEvents: boolean;
}>();

const emit = defineEmits<{
  (e: 'toggle', panel: string): void;
  (e: 'camp'): void;
}>();

const actionStyle = (panel: string) => {
  const highlight = panel === 'characterInfo' && props.highlightInventory;
  const isActive = props.openPanels.has(panel);
  return {
    ...props.styles.actionButton,
    ...(isActive ? props.styles.actionButtonActive : {}),
    ...(highlight ? props.styles.actionButtonAttention : {}),
    ...(isLocked(panel) ? { opacity: 0.45, cursor: 'not-allowed' } : {}),
  };
};

const isLocked = (panel: string) => {
  // Camp is blocked during combat.
  if (panel === 'camp' && props.combatLocked) {
    return true;
  }
  return false;
};
</script>
