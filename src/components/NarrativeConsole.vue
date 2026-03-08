<template>
  <div :style="consoleStyle">
    <!-- HUD (hidden during character creation) -->
    <NarrativeHud
      v-if="selectedCharacter"
      :character="selectedCharacter"
      :active-combat="activeCombat"
      :conn-active="connActive"
      :has-pending-skills="hasPendingSkills"
      @open-panel="$emit('open-panel', $event)"
    />

    <!-- Scroll area -->
    <div :style="scrollAreaStyle" ref="scrollEl" @scroll="checkIfAtBottom">
      <div v-if="!selectedCharacter && combinedEvents.length === 0 && !isLlmProcessing" :style="emptyStyle">
        {{ creationMode ? 'The System is awakening...' : 'Select or create a character to begin.' }}
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
          :animation-state="animationStates.get(`${event.scope}-${event.id}`)"
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
      :disabled="animIsAnimating"
      :context-actions="contextActions"
      :placeholder="inputPlaceholder"
      :conn-active="connActive"
      :is-in-combat="isInCombat"
      :combat-abilities="combatAbilities"
      :combat-enemies="combatEnemies"
      :casting-ability-id="castingAbilityId"
      :cast-progress="castProgress"
      @submit="$emit('submit', $event)"
      @skip-animation="onSkipAnimation"
      @flee="$emit('flee')"
      @use-ability="(id: bigint) => $emit('use-ability', id)"
      @target-enemy="(id: bigint) => $emit('target-enemy', id)"
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
import { useNarrativeAnimation } from '../composables/useNarrativeAnimation';

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
  formatTimestamp: (ts: { microsSinceUnixEpoch: bigint }) => string;
  creationMode?: boolean;
  hasPendingSkills?: boolean;
  isInCombat?: boolean;
  combatAbilities?: any[];
  combatEnemies?: any[];
  castingAbilityId?: bigint | null;
  castProgress?: number;
}>();

defineEmits<{
  (e: 'submit', text: string): void;
  (e: 'open-panel', panelId: string): void;
  (e: 'flee'): void;
  (e: 'use-ability', abilityId: bigint): void;
  (e: 'target-enemy', enemyId: bigint): void;
}>();

// Animation composable
const { animationStates, isAnimating: animIsAnimating, startAnimation, skipAll } = useNarrativeAnimation();

// Track seen event keys to detect new narrative events
const seenEventKeys = ref(new Set<string>());

watch(
  () => props.combinedEvents,
  (events) => {
    for (const event of events) {
      const key = `${event.scope}-${event.id}`;
      if (seenEventKeys.value.has(key)) continue;
      seenEventKeys.value.add(key);
      if (event.kind === 'narrative' || event.kind === 'llm' || event.kind === 'creation' || event.kind === 'creation_warning' || event.kind === 'creation_error' || event.kind === 'combat_narration') {
        startAnimation(key, event.message);
      }
    }
  },
  { deep: true, immediate: true }
);

const onSkipAnimation = () => {
  skipAll();
};

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
  if (props.creationMode) return 'Describe, choose, or click a [keyword]...';
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

const scrollAreaStyle = computed(() => ({
  flex: '1',
  overflowY: 'auto' as const,
  paddingTop: '52px',
  paddingBottom: props.isInCombat ? '150px' : '90px',
  paddingLeft: '16px',
  paddingRight: '16px',
}));

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
