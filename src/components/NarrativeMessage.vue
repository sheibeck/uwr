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
    v-html="renderedMessage"
  />
</template>

<script setup lang="ts">
import { computed } from 'vue';

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
};

const kindColor = computed(() => KIND_COLORS[props.event.kind] ?? '#ced4da');

const isNarrative = computed(
  () => props.event.kind === 'narrative' || props.event.kind === 'llm'
);

// Parse message text and make [bracketed keywords] clickable
const renderedMessage = computed(() => {
  return props.event.message
    .replace(/\n/g, '<br>')
    .replace(/\[([^\]]+)\]/g, (match, keyword) => {
      return `<span style="color: #60a5fa; cursor: pointer; text-decoration: underline; font-weight: 600;" onclick="window.clickNpcKeyword('${keyword.replace(/'/g, "\\'")}')">${match}</span>`;
    });
});
</script>
