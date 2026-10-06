<script setup lang="ts">
import { computed } from 'vue';
import { inCombatLabel } from './roundClock';

// Header tag for the fight and its round (48-UI-SPEC "Header", CMB-05). Display only:
// static, no focus stop. The round number is the only dynamic part and renders as text.
const props = defineProps<{ roundNumber: bigint | null }>();

const label = computed(() => inCombatLabel(props.roundNumber));
</script>

<template>
  <span class="tag in-combat-tag" :aria-label="label.ariaLabel">
    <span class="dot" aria-hidden="true"></span>{{ label.text }}
  </span>
</template>

<style scoped>
.in-combat-tag {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  font-size: 12px;
  font-weight: 400;
  white-space: nowrap;
  background: color-mix(in srgb, var(--color-health) 24%, var(--color-surface));
  color: color-mix(in srgb, var(--color-health) 28%, var(--color-text));
}

.dot {
  width: 6px;
  height: 6px;
  flex-shrink: 0;
  border-radius: 50%;
  background: var(--color-health);
}
</style>
