<template>
  <div
    :style="{
      marginBottom: '2px',
      marginTop: isRipple ? '4px' : '0',
      lineHeight: '1.5',
      fontSize: '0.9rem',
      color: kindColor,
      fontStyle: (isNarrative || isRipple) ? 'italic' : 'normal',
      borderLeft: isRipple ? '3px solid #b197fc88' : isNarrative ? '2px solid #ffd43b33' : 'none',
      paddingLeft: isRipple ? '10px' : isNarrative ? '8px' : '0',
      paddingTop: isRipple ? '4px' : '0',
      paddingBottom: isRipple ? '4px' : '0',
      background: isRipple ? 'linear-gradient(90deg, rgba(177, 151, 252, 0.08) 0%, transparent 70%)' : 'none',
      letterSpacing: isRipple ? '0.3px' : 'normal',
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
  world: '#b197fc',
};

const kindColor = computed(() => KIND_COLORS[props.event.kind] ?? '#ced4da');

const isRipple = computed(() => props.event.kind === 'world');

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

// Render text with color-aware clickable brackets.
// Processing order:
// 1. Newlines -> <br>
// 2. Color-tagged brackets: {{color:HEX}}[text]{{/color}} -> clickable span with custom color
// 3. Remaining color tags: {{color:HEX}}text{{/color}} -> colored span (non-clickable)
// 4. Remaining bare brackets: [text] -> clickable span with default blue
function renderLinks(text: string): string {
  let result = text.replace(/\n/g, '<br>');

  // Step 2: Color-tagged brackets -> clickable with custom color
  result = result.replace(
    /\{\{color:(#[0-9a-fA-F]{6})\}\}\[([^\]]+)\]\{\{\/color\}\}/g,
    (_match, color, keyword) => {
      return `<span style="color: ${color}; cursor: pointer; text-decoration: underline; font-weight: 600;" onclick="window.clickNpcKeyword('${keyword.replace(/'/g, "\\'")}')">[${keyword}]</span>`;
    }
  );

  // Step 3: Remaining color tags (non-bracket content)
  result = result.replace(
    /\{\{color:(#[0-9a-fA-F]{6})\}\}(.+?)\{\{\/color\}\}/g,
    (_match, color, content) => {
      return `<span style="color: ${color}; font-weight: 600;">${content}</span>`;
    }
  );

  // Step 4: Remaining bare brackets -> clickable with default blue
  result = result.replace(/\[([^\]]+)\]/g, (_match, keyword) => {
    return `<span style="color: #60a5fa; cursor: pointer; text-decoration: underline; font-weight: 600;" onclick="window.clickNpcKeyword('${keyword.replace(/'/g, "\\'")}')">[${keyword}]</span>`;
  });

  return result;
}

// Process a single sentence for keyword highlighting
function processSentence(sentence: string): string {
  return renderLinks(sentence);
}

// Parse message text and make [bracketed keywords] clickable
const renderedMessage = computed(() => {
  return renderLinks(props.event.message);
});
</script>
