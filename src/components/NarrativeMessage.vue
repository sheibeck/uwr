<template>
  <div
    :style="{
      marginBottom: isLook ? '8px' : '2px',
      marginTop: isCombatHeader ? '12px' : isRipple ? '4px' : isLook ? '8px' : '0',
      lineHeight: '1.5',
      fontSize: isCombatHeader ? '1rem' : '0.9rem',
      color: kindColor,
      fontStyle: (isNarrative || isRipple || isCombatResolving) ? 'italic' : 'normal',
      fontWeight: isCombatHeader ? 'bold' : 'normal',
      fontFamily: isCombatStatus ? '&quot;Courier New&quot;, monospace' : 'inherit',
      borderLeft: isRipple ? '3px solid #b197fc88' : isLook ? '2px solid #c8ccd044' : isNarrative ? '2px solid #ffd43b33' : 'none',
      paddingLeft: isRipple ? '10px' : isLook ? '10px' : isNarrative ? '8px' : '0',
      paddingTop: isRipple ? '4px' : isLook ? '4px' : '0',
      paddingBottom: isCombatHeader ? '6px' : isRipple ? '4px' : isLook ? '4px' : '0',
      background: isRipple ? 'linear-gradient(90deg, rgba(177, 151, 252, 0.08) 0%, transparent 70%)' : isLook ? 'linear-gradient(90deg, rgba(200, 204, 208, 0.06) 0%, transparent 70%)' : 'none',
      letterSpacing: isCombatHeader ? '2px' : isRipple ? '0.3px' : 'normal',
      textAlign: isCombatHeader ? 'center' : 'left',
      animation: isCombatResolving ? 'narrativePulse 1.5s ease-in-out infinite' : 'none',
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

import { KIND_COLORS } from './NarrativeMessage.colors';

const kindColor = computed(() => KIND_COLORS[props.event.kind] ?? '#ced4da');

const isRipple = computed(() => props.event.kind === 'world');

const isLook = computed(() => props.event.kind === 'look');

const isNarrative = computed(
  () => props.event.kind === 'narrative' || props.event.kind === 'llm' || props.event.kind === 'creation' || props.event.kind === 'combat_narration'
);

const isCombatStatus = computed(() => props.event.kind === 'combat_status');

const isCombatHeader = computed(() => props.event.kind === 'combat_round_header');

const isCombatResolving = computed(() => props.event.kind === 'combat_resolving');

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
      return `<span style="color: ${color}; cursor: pointer; text-decoration: underline; font-weight: 600;" onclick="window.clickNpcKeyword('${keyword.replace(/'/g, "\\'")}')">&lsqb;${keyword}&rsqb;</span>`;
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
