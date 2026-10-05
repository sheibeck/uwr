<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue';
import { PhArrowClockwise, PhCircleNotch } from '@phosphor-icons/vue';

const props = defineProps<{ reconnecting: boolean; nextRetryAt: number | null; versionPrompt: boolean }>();
const emit = defineEmits<{ reload: [] }>();

const now = ref(Date.now());
let timer: ReturnType<typeof setInterval> | null = null;

const secondsLeft = computed(() =>
  props.nextRetryAt === null ? null : Math.max(0, Math.ceil((props.nextRetryAt - now.value) / 1000)),
);

function stopTimer() {
  if (timer !== null) {
    clearInterval(timer);
    timer = null;
  }
}

watch(
  () => [props.reconnecting, props.nextRetryAt] as const,
  ([reconnecting, nextRetryAt]) => {
    stopTimer();
    if (reconnecting && nextRetryAt !== null) {
      now.value = Date.now();
      timer = setInterval(() => {
        now.value = Date.now();
      }, 1000);
    }
  },
  { immediate: true },
);

onBeforeUnmount(stopTimer);
</script>

<template>
  <div class="notice-bars">
    <div v-if="props.reconnecting" class="notice-bar reconnecting" role="status" aria-live="polite">
      <PhCircleNotch class="spin notice-spinner" :size="14" aria-hidden="true" />
      <span class="notice-text">Reconnecting…</span>
      <span v-if="secondsLeft !== null" class="notice-countdown">Next try in {{ secondsLeft }}s</span>
    </div>
    <div v-if="props.versionPrompt" class="notice-bar version">
      <PhArrowClockwise class="notice-refresh" :size="14" aria-hidden="true" />
      <span class="version-text">A new version is ready.</span>
      <span class="spacer"></span>
      <button type="button" class="btn btn-primary reload-btn" @click="emit('reload')">Reload</button>
    </div>
  </div>
</template>

<style scoped>
.notice-bars {
  display: flex;
  flex-direction: column;
  flex-shrink: 0;
}
.notice-bar {
  height: 32px;
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 0 16px;
  font-size: 12px;
  font-weight: 400;
  flex-shrink: 0;
}
.reconnecting {
  background: var(--color-surface);
}
.notice-spinner {
  color: var(--color-accent);
  flex-shrink: 0;
}
.notice-text {
  color: var(--color-neutral-200);
}
.notice-countdown {
  color: var(--color-neutral-500);
  font-variant-numeric: tabular-nums;
}
.version {
  background: color-mix(in srgb, var(--color-accent-800) 55%, transparent);
}
.notice-refresh {
  color: var(--color-accent-300);
  flex-shrink: 0;
}
.version-text {
  color: var(--color-accent-300);
}
.spacer {
  flex: 1;
}
.reload-btn {
  padding: 4px 16px;
  font-size: 12px;
}
</style>
