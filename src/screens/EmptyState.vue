<script setup lang="ts">
import type { Component } from 'vue';

defineProps<{ icon: Component; title: string; body: string }>();
</script>

<template>
  <div class="empty-state">
    <component :is="icon" :size="32" aria-hidden="true" class="empty-state-icon" />
    <p class="empty-state-title">{{ title }}</p>
    <p class="empty-state-body">{{ body }}</p>
  </div>
</template>

<style scoped>
.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 8px;
  padding: 48px 24px;
  text-align: center;
}

.empty-state-icon {
  color: var(--color-neutral-600);
}

.empty-state-title {
  margin: 0;
  font-size: 14px;
  font-weight: 500;
  color: var(--color-neutral-200);
}

.empty-state-body {
  margin: 0;
  font-size: 12px;
  color: var(--color-neutral-400);
  max-width: 280px;
}
</style>
