<script setup lang="ts">
import { DENSITY_SR_PREFIX } from '@game-data/density_lines';

// The density word badge of the Nearby cards (51.3.1.1 UI-SPEC "DensityBadge.vue", Color table).
// The word is always shown, with an .sr-only 'Population: ' or 'Supply: ' prefix, so colour is never
// the only cue. Colours are existing tokens or color-mix() recipes of them (no new token, D-45).
defineProps<{
  kind: 'creature' | 'resource';
  level: 0 | 1 | 2 | 3;
  word: string;
}>();
</script>

<template>
  <span class="density-badge" :class="[`level-${level}`, `kind-${kind}`]"
    ><span class="sr-only">{{ DENSITY_SR_PREFIX[kind] }}</span>{{ word }}</span
  >
</template>

<style scoped>
.sr-only {
  position: absolute;
  width: 1px;
  height: 1px;
  overflow: hidden;
  clip-path: inset(50%);
  white-space: nowrap;
}

.density-badge {
  flex: none;
  padding: 0 8px;
  border-radius: 999px;
  font-size: 10px;
  font-weight: 400;
  line-height: 1.5;
  white-space: nowrap;
}

.level-3.kind-creature {
  background: color-mix(in srgb, var(--color-health) 24%, var(--color-surface));
  color: color-mix(in srgb, var(--color-health) 28%, var(--color-text));
}

.level-3.kind-resource {
  background: color-mix(in srgb, var(--color-con-light-green) 20%, var(--color-surface));
  color: color-mix(in srgb, var(--color-con-light-green) 28%, var(--color-text));
}

.level-2 {
  background: var(--color-neutral-800);
  color: var(--color-neutral-200);
}

.level-1 {
  background: var(--color-neutral-900);
  color: var(--color-neutral-400);
}

.level-0 {
  background: transparent;
  color: var(--color-neutral-500);
  box-shadow: inset 0 0 0 1px var(--color-neutral-700);
}
</style>
