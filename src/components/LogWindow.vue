<template>
  <section :style="styles.log">
    <div :style="styles.logList" ref="logListEl">
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
        <span :style="styles.logKind">[{{ event.scope }} {{ event.kind }}]</span>
        <span
          :style="[
            styles.logText,
            event.kind === 'whisper' ? styles.logWhisper : {},
            event.scope === 'private' ? styles.logPrivate : {},
            event.kind === 'presence' ? styles.logPresence : {},
            event.kind === 'command' ? styles.logCommand : {},
          ]"
        >
          {{ event.message }}
        </span>
      </div>
    </div>
  </section>
</template>

<script setup lang="ts">
import { nextTick, ref, watch } from 'vue';
import type { CharacterRow } from '../module_bindings';

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

const scrollToBottom = async () => {
  await nextTick();
  const el = logListEl.value;
  if (el) {
    el.scrollTop = el.scrollHeight;
  }
};

watch(
  () => props.combinedEvents,
  () => {
    void scrollToBottom();
  },
  { deep: true, immediate: true }
);
</script>
