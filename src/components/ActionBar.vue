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
        @click="onCampClick"
        :style="campButtonStyle"
        :disabled="isLocked('camp')"
      >
        {{ campCountdown !== null ? `Camp (${campCountdown}s)` : 'Camp' }}
      </button>
      <button
        @click="emit('toggle', 'characterInfo')"
        :style="actionStyle('characterInfo')"
        :class="{ 'onboarding-pulse': props.highlightInventory }"
        :disabled="isLocked('characterInfo')"
      >
        Character (C)
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
        Journal (J)
      </button>
      <button
        @click="emit('toggle', 'renown')"
        :style="actionStyle('renown')"
        :disabled="isLocked('renown')"
      >
        Renown (R)
      </button>
      <button
        @click="emit('toggle', 'worldEvents')"
        :style="{ ...actionStyle('worldEvents'), position: 'relative' }"
      >
        Events (E)
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
        Travel (T)
      </button>
      <button
        @click="emit('toggle', 'loot')"
        :style="actionStyle('loot')"
      >
        Loot (L)
      </button>
      <button
        @click="emit('toggle', 'map')"
        :style="actionStyle('map')"
      >
        Map (M)
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
import { ref, computed, watch, onUnmounted } from 'vue';

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
  | 'worldEvents'
  | 'map';

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

const campCountdown = ref<number | null>(null);
let campTimer: ReturnType<typeof setInterval> | null = null;

const clearCampTimer = () => {
  if (campTimer !== null) { clearInterval(campTimer); campTimer = null; }
  campCountdown.value = null;
};

const onCampClick = () => {
  if (campCountdown.value !== null) {
    clearCampTimer();
    return;
  }
  campCountdown.value = 10;
  campTimer = setInterval(() => {
    if (campCountdown.value === null) return;
    campCountdown.value--;
    if (campCountdown.value <= 0) {
      clearCampTimer();
      emit('camp');
    }
  }, 1000);
};

// Cancel countdown if combat starts
watch(() => props.combatLocked, (locked) => { if (locked) clearCampTimer(); });
onUnmounted(clearCampTimer);

const campButtonStyle = computed(() => ({
  ...actionStyle('camp'),
  ...(campCountdown.value !== null ? { color: '#f97316', borderColor: '#f97316' } : {}),
}));

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
