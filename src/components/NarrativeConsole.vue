<template>
  <div :style="consoleStyle">
    <!-- HUD -->
    <NarrativeHud
      :character="selectedCharacter"
      :active-combat="activeCombat"
      :conn-active="connActive"
      @open-panel="$emit('open-panel', $event)"
    />

    <!-- Scroll area -->
    <div :style="scrollAreaStyle" ref="scrollEl" @scroll="checkIfAtBottom">
      <div v-if="!selectedCharacter" :style="emptyStyle">
        Select or create a character to begin.
      </div>
      <div v-else-if="combinedEvents.length === 0" :style="emptyStyle">
        The world awaits. Try exploring or speaking to someone nearby.
      </div>
      <template v-else>
        <NarrativeMessage
          v-for="event in combinedEvents"
          :key="`${event.scope}-${event.id}`"
          :event="event"
          :format-timestamp="formatTimestamp"
          @keyword-click="(kw: string) => {}"
        />
      </template>

      <!-- LLM processing indicator -->
      <div v-if="isLlmProcessing" :style="consideringStyle">
        The System is considering your fate...
      </div>
    </div>

    <!-- Jump to bottom button -->
    <button
      v-if="!isAtBottom && combinedEvents.length > 0"
      :style="jumpBtnStyle"
      @click="jumpToBottom"
    >New messages</button>

    <!-- Input -->
    <NarrativeInput
      :disabled="isAnimating"
      :context-actions="contextActions"
      :placeholder="inputPlaceholder"
      :conn-active="connActive"
      @submit="$emit('submit', $event)"
      @skip-animation="$emit('skip-animation')"
    />
  </div>
</template>

<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue';
import type { Character } from '../module_bindings/types';
import NarrativeHud from './NarrativeHud.vue';
import NarrativeInput from './NarrativeInput.vue';
import NarrativeMessage from './NarrativeMessage.vue';
import type { ContextAction } from './NarrativeInput.vue';

type EventItem = {
  id: bigint;
  createdAt: { microsSinceUnixEpoch: bigint };
  kind: string;
  message: string;
  scope: string;
};

const props = defineProps<{
  combinedEvents: EventItem[];
  selectedCharacter: Character | null;
  activeCombat: any | null;
  connActive: boolean;
  contextActions: ContextAction[];
  isLlmProcessing: boolean;
  isAnimating: boolean;
  formatTimestamp: (ts: { microsSinceUnixEpoch: bigint }) => string;
}>();

defineEmits<{
  (e: 'submit', text: string): void;
  (e: 'skip-animation'): void;
  (e: 'open-panel', panelId: string): void;
}>();

// Scroll management
const scrollEl = ref<HTMLElement | null>(null);
const isAtBottom = ref(true);

const checkIfAtBottom = () => {
  const el = scrollEl.value;
  if (!el) return;
  const threshold = 30;
  isAtBottom.value = el.scrollTop + el.clientHeight >= el.scrollHeight - threshold;
};

const scrollToBottom = async () => {
  await nextTick();
  const el = scrollEl.value;
  if (el) {
    el.scrollTop = el.scrollHeight;
  }
};

const jumpToBottom = () => {
  isAtBottom.value = true;
  void scrollToBottom();
};

watch(
  () => props.combinedEvents,
  () => {
    if (isAtBottom.value) {
      void scrollToBottom();
    }
  },
  { deep: true, immediate: true }
);

// Context-aware placeholder
const inputPlaceholder = computed(() => {
  if (!props.selectedCharacter) return 'Select a character to begin';
  if (props.activeCombat) return 'Choose your action...';
  return 'What do you do?';
});

// Styles
const consoleStyle = {
  position: 'fixed' as const,
  inset: '0',
  display: 'flex',
  flexDirection: 'column' as const,
  background: '#0a0a0f',
  zIndex: 1,
  fontFamily: "'Courier New', monospace",
};

const scrollAreaStyle = {
  flex: '1',
  overflowY: 'auto' as const,
  paddingTop: '52px',
  paddingBottom: '90px',
  paddingLeft: '16px',
  paddingRight: '16px',
};

const emptyStyle = {
  color: '#868e96',
  fontStyle: 'italic',
  padding: '24px 0',
  textAlign: 'center' as const,
};

const consideringStyle = {
  color: '#ffd43b',
  fontStyle: 'italic',
  padding: '4px 0',
  animation: 'narrativePulse 1.5s ease-in-out infinite',
};

const jumpBtnStyle = {
  position: 'fixed' as const,
  bottom: '80px',
  left: '50%',
  transform: 'translateX(-50%)',
  background: 'rgba(24, 100, 171, 0.9)',
  color: '#e9ecef',
  border: 'none',
  padding: '6px 16px',
  borderRadius: '16px',
  fontSize: '0.8rem',
  cursor: 'pointer',
  zIndex: 10001,
  boxShadow: '0 2px 8px rgba(0,0,0,0.4)',
};
</script>

<style>
@keyframes narrativePulse {
  0%, 100% { opacity: 0.4; }
  50% { opacity: 1; }
}
</style>
