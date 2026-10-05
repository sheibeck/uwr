<script setup lang="ts">
import { PhSignOut } from '@phosphor-icons/vue';
import { getScreen, type ScreenId } from '../screens/screens';
import Sheet from './Sheet.vue';

const emit = defineEmits<{ select: [screen: ScreenId]; logout: []; close: [] }>();

const rows: ReadonlyArray<{ id: ScreenId; label: string }> = [
  { id: 'stats', label: 'Stats' },
  { id: 'craft', label: 'Crafting' },
  { id: 'events', label: 'Events' },
  { id: 'vendor', label: 'Vendor' },
];
</script>

<template>
  <Sheet title="More" @close="emit('close')">
    <button v-for="row in rows" :key="row.id" type="button" class="more-row" @click="emit('select', row.id)">
      <component :is="getScreen(row.id).icon" :size="20" />
      <span>{{ row.label }}</span>
    </button>
    <div class="hr" role="separator"></div>
    <button type="button" class="more-row" @click="emit('logout')">
      <PhSignOut :size="20" />
      <span>Log out</span>
    </button>
  </Sheet>
</template>

<style scoped>
.more-row {
  display: flex;
  align-items: center;
  gap: 16px;
  width: 100%;
  min-height: 48px;
  padding: 0 16px;
  border: 0;
  background: transparent;
  color: var(--color-text);
  font-size: 14px;
  text-align: left;
  cursor: pointer;
}

.more-row:hover {
  background: color-mix(in srgb, var(--color-text) 7%, transparent);
}

.more-row:active {
  background: color-mix(in srgb, var(--color-text) 14%, transparent);
}

.more-row:focus-visible {
  outline: 2px solid var(--color-accent);
  outline-offset: -2px;
}
</style>
