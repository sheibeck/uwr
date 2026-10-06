<script setup lang="ts">
import { PhCircleNotch } from '@phosphor-icons/vue';

// The transient "Keeper is working" line after the last feed line (47-UI-SPEC "Keeper progress
// line"). The text comes from the server's indicator pools through selectLlmIndicator; it is
// rendered as a text node. The spinner uses the global `spin` class (it stops under
// prefers-reduced-motion).
const props = defineProps<{ text: string }>();
</script>

<template>
  <div class="progress" role="status" aria-live="polite">
    <PhCircleNotch class="spin spinner" :size="14" aria-hidden="true" />
    <span class="progress-text">{{ props.text }}</span>
  </div>
</template>

<style scoped>
.progress {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
}

.spinner {
  flex: none;
  color: var(--color-accent);
}

.progress-text {
  min-width: 0;
  font-size: 14px;
  font-style: italic;
  line-height: 1.6;
  overflow-wrap: anywhere;
  color: var(--color-neutral-400);
}
</style>
