<script setup lang="ts">
import ContextContent from '../rails/ContextContent.vue';
</script>

<template>
  <aside class="context-rail" aria-label="Context">
    <ContextContent />
  </aside>
</template>

<style scoped>
.context-rail {
  width: 288px;
  flex-shrink: 0;
  display: flex;
  flex-direction: column;
  gap: 16px;
  padding: 16px;
  min-height: 0;
  overflow-y: auto;
  background: color-mix(in srgb, var(--color-surface) 30%, transparent);
}
</style>
