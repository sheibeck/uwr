<template>
  <section :style="styles.log">
    <div :style="styles.logList" ref="logListEl" @scroll="checkIfAtBottom">
      <div v-if="!selectedCharacter" :style="styles.logEmpty">
        Select or create a character to begin.
      </div>
      <div v-else-if="combinedEvents.length === 0" :style="styles.logEmpty">
        No events yet. Try a command like "look" or "travel".
      </div>
      <div
        v-else
        v-for="event in combinedEvents"
        :key="`${event.scope}-${event.id}`"
        :style="styles.logItem"
      >
        <span :style="styles.logTime">{{ formatTimestamp(event.createdAt) }}</span>
        <span :style="styles.logKind">{{
          event.scope === 'group' ? '[Group]' :
          event.scope === 'client' ? '' :
          `[${event.scope} ${event.kind}]`
        }}</span>
        <span
          :style="[
            styles.logText,
            event.scope === 'private' ? styles.logPrivate : {},
            event.scope === 'group' ? styles.logGroup : {},
            event.kind === 'whisper' ? styles.logWhisper : {},
            event.kind === 'presence' ? styles.logPresence : {},
            event.kind === 'command' ? styles.logCommand : {},
            event.kind === 'damage' ? styles.logDamage : {},
            event.kind === 'heal' ? styles.logHeal : {},
            event.kind === 'reward' ? styles.logReward : {},
            event.kind === 'avoid' ? styles.logAvoid : {},
            event.kind === 'faction' ? styles.logFaction : {},
            event.kind === 'blocked' ? styles.logBlocked : {},
          ]"
          v-html="renderClickableKeywords(event.message)"
        >
        </span>
      </div>
    </div>
    <button
      v-if="!isAtBottom && combinedEvents.length > 0"
      :style="styles.logJumpBtn"
      @click="jumpToBottom"
    >
      ↓ New messages
    </button>
  </section>
</template>

<script setup lang="ts">
import { nextTick, ref, watch } from 'vue';
import type { CharacterRow } from '../stdb-types';

type EventItem = {
  id: bigint;
  createdAt: { microsSinceUnixEpoch: bigint };
  kind: string;
  message: string;
  scope: string;
};

const props = defineProps<{
  styles: Record<string, Record<string, string | number>>;
  selectedCharacter: CharacterRow | null;
  combinedEvents: EventItem[];
  formatTimestamp: (ts: { microsSinceUnixEpoch: bigint }) => string;
}>();

const logListEl = ref<HTMLElement | null>(null);
const isAtBottom = ref(true);

const checkIfAtBottom = () => {
  const el = logListEl.value;
  if (!el) return;

  const threshold = 30;
  const atBottom = el.scrollTop + el.clientHeight >= el.scrollHeight - threshold;
  isAtBottom.value = atBottom;
};

const scrollToBottom = async () => {
  await nextTick();
  const el = logListEl.value;
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

// Parse message text and make [bracketed keywords] clickable
const renderClickableKeywords = (text: string): string => {
  return text
    .replace(/\n/g, '<br>')
    .replace(/\[([^\]]+)\]/g, (match, keyword) => {
      return `<span style="color: #60a5fa; cursor: pointer; text-decoration: underline; font-weight: 600;" onclick="window.clickNpcKeyword('${keyword.replace(/'/g, "\\'")}')">${match}</span>`;
    });
};

// Handle clicking on a [keyword] - trigger dialogue advancement
if (typeof window !== 'undefined') {
  (window as any).clickNpcKeyword = (keyword: string) => {
    if (!props.selectedCharacter) return;
    // Trigger /say with the keyword to advance dialogue
    window.__db_conn?.reducers.say({
      characterId: props.selectedCharacter.id,
      message: keyword,
    });
  };
}
</script>
