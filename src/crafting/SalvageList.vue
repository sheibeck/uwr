<script setup lang="ts">
import { computed, inject, useTemplateRef, watch } from 'vue';
import { LEDGER_KEY, createInertLedger } from '../ledger/ledgerContext';
import { SALVAGE_EMPTY, SALVAGE_INTRO, salvageRows } from './salvageModel';

// The Salvage tab's list (50-UI-SPEC and mock 9a, EXTRACT C.4): the intro, then one row per
// non-equipped salvageable item in the bag (an icon tile, the name in its rarity color and the
// '{Slot} · {Type} · Tier {n}' line), or 'Nothing left to salvage.'. Equipped gear never appears because
// it cannot be salvaged. On desktop the list keeps a visible selection, as the recipe list does: the
// first row when nothing (or a vanished row) is selected, and null when empty. On mobile it never
// auto-selects. Names are server text and only reach the page as text nodes.
const props = withDefaults(
  defineProps<{
    selectedId: bigint | null;
    mobile?: boolean;
  }>(),
  { mobile: false },
);
const emit = defineEmits<{ select: [instanceId: bigint | null] }>();

const ledger = inject(LEDGER_KEY, createInertLedger());

const rows = computed(() => salvageRows(ledger.items.value, ledger.templates.value));

watch(
  () => `${rows.value.map((row) => String(row.instanceId)).join(',')}|${String(props.selectedId)}`,
  () => {
    if (props.mobile) return;
    const list = rows.value;
    if (list.length === 0) {
      if (props.selectedId !== null) emit('select', null);
      return;
    }
    if (props.selectedId === null || !list.some((row) => row.instanceId === props.selectedId)) {
      emit('select', list[0].instanceId);
    }
  },
  { immediate: true },
);

const root = useTemplateRef<HTMLElement>('root');

/** Puts focus on a row (the mobile back button returns to the row it came from). */
function focusRow(id: bigint): void {
  root.value?.querySelector<HTMLElement>(`[data-instance-id="${id}"]`)?.focus();
}
/** Puts focus on the first row (after a salvage on mobile, when the detail has closed). */
function focusFirst(): void {
  root.value?.querySelector<HTMLElement>('.salvage-row')?.focus();
}
defineExpose({ focusRow, focusFirst });
</script>

<template>
  <div ref="root" class="salvage-list" :class="{ mobile: props.mobile }">
    <p class="intro">{{ SALVAGE_INTRO }}</p>
    <p v-if="rows.length === 0" class="empty">{{ SALVAGE_EMPTY }}</p>
    <ul v-else class="rows" aria-label="Gear that can be salvaged">
      <li v-for="row in rows" :key="String(row.instanceId)">
        <button
          type="button"
          class="salvage-row"
          :class="{ selected: row.instanceId === props.selectedId }"
          :data-instance-id="String(row.instanceId)"
          :aria-pressed="row.instanceId === props.selectedId ? 'true' : 'false'"
          :aria-label="`${row.name}, ${row.typeLine}`"
          @click="emit('select', row.instanceId)"
        >
          <span class="row-icon" :style="{ color: row.color }">
            <component :is="row.icon" :size="20" aria-hidden="true" />
          </span>
          <span class="row-text">
            <span class="row-name" :style="{ color: row.color }" :title="row.name">{{ row.name }}</span>
            <span class="row-meta">{{ row.typeLine }}</span>
          </span>
        </button>
      </li>
    </ul>
  </div>
</template>

<style scoped>
.salvage-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
  min-height: 0;
  font-variant-numeric: tabular-nums;
}

p {
  margin: 0;
}

.intro {
  font-size: 12px;
  line-height: 1.5;
  color: var(--color-neutral-400);
}

.empty {
  font-size: 12px;
  line-height: 1.5;
  color: var(--color-neutral-500);
}

.rows {
  display: flex;
  flex-direction: column;
  gap: 4px;
  margin: 0;
  padding: 0;
  list-style: none;
}

.salvage-row {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
  padding: 8px 16px;
  border: 0;
  border-radius: var(--radius-md);
  background: transparent;
  color: var(--color-text);
  font: inherit;
  text-align: left;
  cursor: pointer;
}

.mobile .salvage-row {
  min-height: 56px;
}

.salvage-row:hover {
  background: color-mix(in srgb, var(--color-text) 7%, transparent);
}

.salvage-row:active {
  background: color-mix(in srgb, var(--color-text) 14%, transparent);
}

.salvage-row:focus-visible {
  outline-offset: -2px;
}

.salvage-row.selected {
  background: var(--color-bg);
  box-shadow: inset 0 0 0 1px var(--color-accent);
}

.row-icon {
  display: grid;
  flex: none;
  place-items: center;
  width: 32px;
  height: 32px;
  border-radius: var(--radius-md);
  background: var(--color-bg);
  box-shadow: inset 0 0 0 1px var(--color-neutral-700);
}

.row-text {
  display: flex;
  flex: 1;
  flex-direction: column;
  min-width: 0;
}

.row-name {
  min-width: 0;
  overflow-wrap: anywhere;
  font-size: 14px;
  font-weight: 500;
  line-height: 1.5;
}

.row-meta {
  font-size: 12px;
  line-height: 1.5;
  color: var(--color-neutral-400);
  overflow-wrap: anywhere;
}
</style>
