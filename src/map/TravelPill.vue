<script setup lang="ts">
import { computed, inject, ref, watch } from 'vue';
import { PhCheckCircle, PhHourglassMedium } from '@phosphor-icons/vue';
import { MAP_KEY, createInertMap } from './mapContext';
import { aboutMinutes, formatClock } from './travelTimer';

// The Region travel pill (51-UI-SPEC "Region chips and the Region travel pill"): Ready, or the
// server's time left while your own timer runs. It is plain text with no focusable element, so the
// close button stays the first focusable control after the chips. The visible clock is aria-hidden;
// screen readers get a minute-level sentence that is not a live region. Only the state change is
// announced: the polite status below says once that you can cross again when a running timer ends.
const props = defineProps<{ compact: boolean }>();

const UNLOCK_TEXT = 'You can cross into another region again.';

const map = inject(MAP_KEY, createInertMap());

const timer = computed(() => map.selfTimer.value);
const running = computed(() => timer.value.running);
const clock = computed(() => formatClock(timer.value.secondsLeft));
const minutes = computed(() => `Region travel ready in ${aboutMinutes(timer.value.secondsLeft)}`);

const announcement = ref('');
watch(running, (now, before) => {
  if (before && !now) announcement.value = UNLOCK_TEXT;
  else if (now) announcement.value = '';
});
</script>

<template>
  <span class="pill" :class="running ? 'running' : 'ready'">
    <PhHourglassMedium v-if="running" class="pill-icon" :size="12" aria-hidden="true" />
    <PhCheckCircle v-else class="pill-icon" :size="12" aria-hidden="true" />
    <span class="pill-text">
      <template v-if="props.compact"
        ><span v-if="running" class="pill-clock" aria-hidden="true">{{ clock }}</span
        ><template v-else>Ready</template></template
      >
      <template v-else
        >Region travel: <template v-if="running"
          ><span class="pill-clock" aria-hidden="true">{{ clock }}</span> left</template
        ><template v-else>Ready</template></template
      >
    </span>
    <span v-if="running" class="sr-only">{{ minutes }}</span>
    <span class="sr-only" role="status">{{ announcement }}</span>
  </span>
</template>

<style scoped>
.pill {
  flex: none;
  display: inline-flex;
  align-items: center;
  box-sizing: border-box;
  height: 24px;
  gap: 4px;
  padding: 4px 8px;
  border-radius: 999px;
  font-size: 12px;
  line-height: 1.5;
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
}

.pill.ready {
  color: var(--color-con-light-green);
  box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--color-con-light-green) 45%, transparent);
}

.pill.running {
  color: var(--color-stamina);
  box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--color-stamina) 50%, transparent);
}

.pill-icon {
  flex: none;
}

.sr-only {
  position: absolute;
  width: 1px;
  height: 1px;
  overflow: hidden;
  clip-path: inset(50%);
  white-space: nowrap;
}
</style>
