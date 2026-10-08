<script setup lang="ts">
// The presence dot (51.1-UI-SPEC "Shared Components"). An 8 x 8 circle that is never the only
// signal: the host always carries the status word ('online', 'offline', 'in combat') in its own
// accessible text, so the dot is aria-hidden and holds no text.
// 51.1 feeds 'online' and 'offline' (from character.online); 'busy' is supported and tested, not fed.
defineProps<{ status: 'online' | 'busy' | 'offline' }>();
</script>

<template>
  <span class="status-dot" :class="status" aria-hidden="true" />
</template>

<style scoped>
.status-dot {
  display: inline-block;
  flex: none;
  width: 8px;
  height: 8px;
  border-radius: 50%;
  box-sizing: border-box;
}

.online {
  background: var(--color-con-light-green);
}

.offline {
  background: transparent;
  box-shadow: inset 0 0 0 1px var(--color-neutral-600);
}

/* Provisional: the busy colour is confirmed (and the state fed) by Phase 52.2. */
.busy {
  background: var(--color-con-yellow);
}
</style>
