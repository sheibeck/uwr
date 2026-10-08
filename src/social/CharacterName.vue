<script setup lang="ts">
// The one name component for every member and player name (51.1-UI-SPEC "Shared Components"):
// the name as a text node on one ellipsizing line, the full name in title, an optional " (you)"
// suffix, and a trailing default slot. 51.1 passes nothing to the slot; Phase 52.2 puts the guild
// tag there, in one place. Size and weight come from the host. Names are server text and are
// rendered as text nodes only.
defineProps<{ name: string; you?: boolean }>();
</script>

<template>
  <span class="character-name" :title="name">
    <span class="name">{{ name }}</span>
    <span v-if="you" class="you">{{ ' (you)' }}</span>
    <slot />
  </span>
</template>

<style scoped>
.character-name {
  display: inline-flex;
  align-items: baseline;
  gap: 4px;
  min-width: 0;
  max-width: 100%;
  white-space: nowrap;
}

.name {
  flex: 0 1 auto;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.you {
  flex: none;
  color: var(--color-neutral-500);
}
</style>
