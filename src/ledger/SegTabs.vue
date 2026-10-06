<script setup lang="ts">
import { nextTick, useTemplateRef } from 'vue';

// Segmented tabs (50-UI-SPEC "Segmented tabs"): real ARIA tabs styled with the Nocturne .seg and
// .seg-opt classes. Roving tabindex, arrows wrap, Home and End jump, selection follows focus. Only
// the selected panel renders; it is the screen's scroll region and gets the active id from the slot.
const props = defineProps<{
  tabs: ReadonlyArray<{ id: string; label: string }>;
  modelValue: string;
  /** The tablist label (for example 'Inventory view'). */
  label: string;
  /** Makes the tab and panel ids unique per screen. */
  idPrefix: string;
}>();
const emit = defineEmits<{ 'update:modelValue': [id: string] }>();

const tablist = useTemplateRef<HTMLElement>('tablist');

const tabId = (id: string): string => `${props.idPrefix}-tab-${id}`;
const panelId = (id: string): string => `${props.idPrefix}-panel-${id}`;

function select(index: number, focus: boolean): void {
  const tab = props.tabs[index];
  if (tab === undefined) return;
  emit('update:modelValue', tab.id);
  if (!focus) return;
  void nextTick(() => {
    const buttons = tablist.value?.querySelectorAll<HTMLElement>('[role="tab"]');
    buttons?.[index]?.focus();
  });
}

function onKeydown(event: KeyboardEvent): void {
  const count = props.tabs.length;
  if (count === 0) return;
  let current = 0;
  for (let i = 0; i < count; i += 1) {
    if (props.tabs[i].id === props.modelValue) current = i;
  }
  let next = -1;
  if (event.key === 'ArrowRight') next = (current + 1) % count;
  else if (event.key === 'ArrowLeft') next = (current - 1 + count) % count;
  else if (event.key === 'Home') next = 0;
  else if (event.key === 'End') next = count - 1;
  if (next === -1) return;
  event.preventDefault();
  select(next, true);
}
</script>

<template>
  <div class="seg-tabs">
    <div ref="tablist" class="seg tablist" role="tablist" :aria-label="props.label" @keydown="onKeydown">
      <button
        v-for="(tab, index) in props.tabs"
        :id="tabId(tab.id)"
        :key="tab.id"
        type="button"
        class="seg-opt"
        role="tab"
        :aria-selected="tab.id === props.modelValue ? 'true' : 'false'"
        :aria-controls="panelId(tab.id)"
        :tabindex="tab.id === props.modelValue ? 0 : -1"
        @click="select(index, false)"
      >
        {{ tab.label }}
      </button>
    </div>
    <template v-for="tab in props.tabs" :key="tab.id">
      <div
        v-if="tab.id === props.modelValue"
        :id="panelId(tab.id)"
        class="panel"
        role="tabpanel"
        :aria-labelledby="tabId(tab.id)"
        tabindex="0"
      >
        <slot :active="tab.id" />
      </div>
    </template>
  </div>
</template>

<style scoped>
.seg-tabs {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
}

.tablist {
  flex: none;
  display: flex;
  width: 100%;
}

.seg-opt {
  flex: 1;
  justify-content: center;
  min-height: 44px;
  padding: 8px;
  border: 0;
  background: transparent;
  color: inherit;
  font-family: inherit;
  font-size: 14px;
}

/* The Nocturne checked look keys on a radio input; this is the same look for aria-selected. */
.seg-opt[aria-selected='true'] {
  color: var(--color-accent);
  box-shadow: inset 0 0 0 1px var(--color-accent);
}

.seg-opt:focus-visible {
  outline: 2px solid var(--color-accent);
  outline-offset: -2px;
}

.panel {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
}

.panel:focus-visible {
  outline: 2px solid var(--color-accent);
  outline-offset: -2px;
}
</style>
