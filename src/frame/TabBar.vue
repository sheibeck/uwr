<script setup lang="ts">
import { TABS, type TabId } from './tabs';

const props = defineProps<{ activeTab: TabId; sheetOpen: boolean }>();
const emit = defineEmits<{ select: [tab: TabId, opener: HTMLElement] }>();

function onSelect(tab: TabId, event: MouseEvent) {
  emit('select', tab, event.currentTarget as HTMLElement);
}
</script>

<template>
  <nav class="tab-bar" :class="{ 'sheet-open': props.sheetOpen }" aria-label="Main">
    <button
      v-for="tab in TABS"
      :key="tab.id"
      type="button"
      class="tab"
      :class="{ active: props.activeTab === tab.id }"
      :data-tab="tab.id"
      :aria-pressed="props.activeTab === tab.id ? 'true' : 'false'"
      @click="onSelect(tab.id, $event)"
    >
      <component :is="tab.icon" :size="22" aria-hidden="true" />
      <span class="tab-label">{{ tab.label }}</span>
    </button>
  </nav>
</template>

<style scoped>
.tab-bar {
  display: grid;
  grid-template-columns: repeat(5, 1fr);
  height: calc(64px + env(safe-area-inset-bottom));
  padding-bottom: env(safe-area-inset-bottom);
  flex-shrink: 0;
  background: transparent;
}
.tab-bar.sheet-open {
  background: var(--color-surface);
}
.tab {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 4px;
  border: 0;
  background: transparent;
  color: var(--color-neutral-500);
  cursor: pointer;
  padding: 0;
}
.tab.active {
  color: var(--color-accent);
}
.tab-label {
  font-size: 10px;
  font-weight: 400;
}
.tab:active {
  background: color-mix(in srgb, var(--color-text) 14%, transparent);
}
.tab:focus-visible {
  outline: 2px solid var(--color-accent);
  outline-offset: -2px;
}
@media (hover: hover) {
  .tab:hover {
    background: color-mix(in srgb, var(--color-text) 7%, transparent);
  }
}
</style>
