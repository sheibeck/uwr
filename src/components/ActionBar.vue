<template>
  <div :style="styles.actionBar">
    <button
      @click="emit('toggle', 'help')"
      :style="actionStyle('help')"
    >
      Help
    </button>
    <button
      @click="emit('toggle', 'bugReport')"
      :style="actionStyle('bugReport')"
    >
      Bug Report
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
        @click="emit('toggle', 'crafting')"
        :style="actionStyle('crafting')"
        :disabled="isLocked('crafting')"
      >
        Crafting
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
  | 'friends'
  | 'group'
  | 'crafting'
  | 'loot'
  | 'combat'
  | 'help'
  | 'map'
  | 'bugReport';

const props = defineProps<{
  styles: Record<string, Record<string, string | number>>;
  openPanels: Set<string>;
  hasActiveCharacter: boolean;
  combatLocked: boolean;
  highlightInventory: boolean;
}>();

const emit = defineEmits<{
  (e: 'toggle', panel: string): void;
  (e: 'camp'): void;
  (e: 'camp-start'): void;
  (e: 'camp-cancel'): void;
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
    emit('camp-cancel');
    return;
  }
  campCountdown.value = 10;
  emit('camp-start');
  campTimer = setInterval(() => {
    if (campCountdown.value === null) return;
    campCountdown.value--;
    if (campCountdown.value <= 0) {
      clearCampTimer();
      emit('camp');
    }
  }, 1000);
};

// Cancel countdown if combat starts (no message — combat interrupt is self-explanatory)
watch(() => props.combatLocked, (locked) => { if (locked) clearCampTimer(); });
onUnmounted(clearCampTimer);

const campButtonStyle = computed(() => ({
  ...actionStyle('camp'),
  ...(campCountdown.value !== null ? { color: '#f97316', borderColor: '#f97316' } : {}),
}));

const actionStyle = (panel: string) => {
  const highlight = false;
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
