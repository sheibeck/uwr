<script setup lang="ts">
import type { ListRow } from './nodeView';

// The List view (51-UI-SPEC "Graph keyboard and screen-reader equivalent"): every drawn node as a
// button, in layout order, so keyboard and screen-reader users never need the graph. Selecting a
// row selects the node exactly as the graph does. Text nodes only.
const props = defineProps<{ rows: ListRow[] }>();
const emit = defineEmits<{ select: [id: bigint] }>();

/** The scoped class that colours the level text: a band, safe, or unknown. */
function levelClass(row: ListRow): string {
  if (row.bandWord !== '') return `lv-${row.bandWord}`;
  return row.levelText === 'Safe' ? 'lv-safe' : 'lv-unknown';
}
</script>

<template>
  <ul class="graph-list">
    <li v-for="row in props.rows" :key="String(row.id)">
      <button
        type="button"
        class="row"
        :class="{ selected: row.selected }"
        :aria-pressed="row.selected ? 'true' : undefined"
        @click="emit('select', row.id)"
      >
        <span class="main">
          <span class="name" :title="row.name">{{ row.name }}</span>
          <span class="state">{{ row.stateWord }}</span>
          <span class="level" :class="levelClass(row)"
            >{{ row.levelText }}<template v-if="row.bandWord !== ''"> · {{ row.bandWord }}</template></span
          >
          <span class="steps">{{ row.stepsText }}</span>
        </span>
        <span v-if="row.connectsTo !== null" class="connects">{{ row.connectsTo }}</span>
      </button>
    </li>
  </ul>
</template>

<style scoped>
.graph-list {
  margin: 0;
  padding: 8px;
  list-style: none;
  display: flex;
  flex-direction: column;
  gap: 4px;
  font-variant-numeric: tabular-nums;
}

.row {
  display: flex;
  flex-direction: column;
  gap: 0;
  width: 100%;
  min-height: 32px;
  box-sizing: border-box;
  padding: 4px 8px;
  border: 0;
  border-radius: var(--radius-md);
  background: transparent;
  color: var(--color-neutral-200);
  font: inherit;
  font-size: 12px;
  text-align: left;
  cursor: pointer;
  justify-content: center;
}

.row:hover {
  background: color-mix(in srgb, var(--color-text) 7%, transparent);
}

.row:active {
  background: color-mix(in srgb, var(--color-text) 14%, transparent);
}

.row.selected {
  background: var(--color-bg);
  box-shadow: inset 0 0 0 1px var(--color-accent);
}

.row:focus-visible {
  outline: 2px solid var(--color-accent);
  outline-offset: -2px;
}

.main {
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  column-gap: 8px;
  row-gap: 0;
  min-width: 0;
}

.name {
  flex: 1 1 96px;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-weight: 500;
  color: var(--color-text);
}

.state,
.steps {
  flex: none;
  color: var(--color-neutral-400);
}

.level {
  flex: none;
}

.lv-easy,
.lv-safe {
  color: var(--color-con-light-green);
}

.lv-even {
  color: var(--color-con-blue);
}

.lv-tough {
  color: var(--color-con-yellow);
}

.lv-deadly {
  color: var(--color-con-red);
}

.lv-unknown {
  color: var(--color-neutral-500);
}

.connects {
  font-size: 12px;
  color: var(--color-neutral-500);
  overflow-wrap: anywhere;
}

@media (max-width: 899px) {
  .row {
    min-height: 44px;
  }
}
</style>
