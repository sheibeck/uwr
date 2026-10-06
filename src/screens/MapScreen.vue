<script setup lang="ts">
import { inject } from 'vue';
import { PhMapTrifold } from '@phosphor-icons/vue';
import { FRAME_KEY, createInertFrame } from '../game/context';
import ContextContent from '../rails/ContextContent.vue';
import EmptyState from './EmptyState.vue';

// Desktop keeps the Phase 45 empty state (the context rail is already on screen). On mobile the
// sheet body is the context rail content: Here, Nearby, Tracking and the world event (CON-04).
// ContextContent is a fragment, so this column gives it the rail's 16px rhythm.
const frame = inject(FRAME_KEY, createInertFrame());
</script>

<template>
  <EmptyState v-if="frame.isDesktop.value" :icon="PhMapTrifold" title="No places discovered yet." body="This screen is still being built." />
  <div v-else class="map-sheet">
    <ContextContent />
  </div>
</template>

<style scoped>
.map-sheet {
  display: flex;
  flex-direction: column;
  gap: 16px;
  min-width: 0;
}
</style>
