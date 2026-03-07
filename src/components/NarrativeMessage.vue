<template>
  <div
    :style="{
      marginBottom: '2px',
      lineHeight: '1.5',
      fontSize: '0.9rem',
      color: kindColor,
      fontStyle: isNarrative ? 'italic' : 'normal',
      borderLeft: isNarrative ? '2px solid #ffd43b33' : 'none',
      paddingLeft: isNarrative ? '8px' : '0',
    }"
  >
    <template v-if="isAnimatingMessage">
      <span
        v-for="(sentence, idx) in animatedSentences"
        :key="idx"
        :style="{
          opacity: idx < (animationState?.revealed ?? 0) ? '1' : '0',
          transition: 'opacity 0.4s ease-in',
          display: 'inline',
        }"
        v-html="processSentence(sentence)"
      />
    </template>
    <span v-else v-html="renderedMessage" />
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import type { AnimationState } from '../composables/useNarrativeAnimation';

type EventItem = {
  id: bigint;
  createdAt: { microsSinceUnixEpoch: bigint };
  kind: string;
  message: string;
  scope: string;
};

const props = defineProps<{
  event: EventItem;
  formatTimestamp: (ts: { microsSinceUnixEpoch: bigint }) => string;
  animationState?: AnimationState;
}>();

const emit = defineEmits<{
  (e: 'keyword-click', keyword: string): void;
}>();

const KIND_COLORS: Record<string, string> = {
  damage: '#ff6b6b',
  heal: '#69db7c',
  whisper: '#74c0fc',
  narrative: '#ffd43b',
  llm: '#ffd43b',
  system: '#adb5bd',
  command: '#adb5bd',
  say: '#e9ecef',
  presence: '#868e96',
  reward: '#ffd43b',
  npc: '#da77f2',
  faction: '#ffd43b',
  avoid: '#adb5bd',
  blocked: '#ff6b6b',
  creation: '#ffd43b',
  creation_error: '#ff6b6b',
  creation_warning: '#ffa94d',
  look: '#c8ccd0',
  move: '#adb5bd',
};

const kindColor = computed(() => KIND_COLORS[props.event.kind] ?? '#ced4da');

const isNarrative = computed(
  () => props.event.kind === 'narrative' || props.event.kind === 'llm' || props.event.kind === 'creation'
);

const isAnimatingMessage = computed(
  () => props.animationState != null && !props.animationState.complete
);

const animatedSentences = computed(() => {
  if (!props.animationState) return [];
  return props.animationState.sentences;
});

// Render {{color:HEX}}text{{/color}} tags as colored spans
function renderColorTags(text: string): string {
  return text.replace(
    /\{\{color:(#[0-9a-fA-F]{6})\}\}(.+?)\{\{\/color\}\}/g,
    (_match, color, content) => {
      return `<span style="color: ${color}; font-weight: 600;">${content}</span>`;
    }
  );
}

// Process a single sentence for keyword highlighting
function processSentence(sentence: string): string {
  return renderColorTags(
    sentence.replace(/\n/g, '<br>')
  ).replace(/\[([^\]]+)\]/g, (_match, keyword) => {
    return `<span style="color: #60a5fa; cursor: pointer; text-decoration: underline; font-weight: 600;" onclick="window.clickNpcKeyword('${keyword.replace(/'/g, "\\'")}')">[${keyword}]</span>`;
  });
}

// Parse message text and make [bracketed keywords] clickable
const renderedMessage = computed(() => {
  return renderColorTags(
    props.event.message.replace(/\n/g, '<br>')
  ).replace(/\[([^\]]+)\]/g, (match, keyword) => {
    return `<span style="color: #60a5fa; cursor: pointer; text-decoration: underline; font-weight: 600;" onclick="window.clickNpcKeyword('${keyword.replace(/'/g, "\\'")}')">${match}</span>`;
  });
});
</script>
