<script setup lang="ts">
import type { FactionRow } from './statsModel';

// Faction standing rows (50-UI-SPEC "Faction standing"): the faction name, the tier word in its tier
// color and a thin bar from -100 to 100. Faction names are server (LLM) text and only reach the page
// as text nodes, an attribute or a title.
const props = defineProps<{ rows: readonly FactionRow[] }>();

const percent = (fraction: number): string => `${Math.round(Math.max(0, Math.min(1, fraction)) * 1000) / 10}%`;
</script>

<template>
  <ul v-if="props.rows.length > 0" class="factions">
    <li v-for="row in props.rows" :key="row.id.toString()" class="faction-row" :aria-label="row.ariaLabel">
      <div class="line">
        <span class="faction-name" :title="row.name">{{ row.name }}</span>
        <span class="faction-tier" :class="`tier-${row.group}`">{{ row.tier }}</span>
      </div>
      <div class="bar" aria-hidden="true">
        <div class="fill" :class="`fill-${row.group}`" :style="{ width: percent(row.width) }"></div>
      </div>
    </li>
  </ul>
  <p v-else class="empty">No standing with any faction yet.</p>
</template>

<style scoped>
.factions {
  display: flex;
  flex-direction: column;
  gap: 16px;
  margin: 0;
  padding: 0;
  list-style: none;
  font-variant-numeric: tabular-nums;
}

.faction-row {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.line {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 8px;
  font-size: 12px;
  line-height: 1.5;
}

.faction-name {
  min-width: 0;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.faction-tier {
  flex: none;
}

.tier-hostile {
  color: var(--color-con-red);
}

.tier-unfriendly {
  color: var(--color-con-orange);
}

.tier-neutral {
  color: var(--color-neutral-400);
}

.tier-friendly {
  color: var(--color-accent-300);
}

.bar {
  height: 4px;
  border-radius: var(--radius-sm);
  background: var(--color-neutral-900);
  overflow: hidden;
}

.fill {
  height: 100%;
}

.fill-hostile {
  background: var(--color-health);
}

.fill-unfriendly {
  background: color-mix(in srgb, var(--color-health) 60%, var(--color-neutral-400));
}

.fill-neutral {
  background: var(--color-neutral-400);
}

.fill-friendly {
  background: var(--color-accent);
}

.empty {
  margin: 0;
  font-size: 12px;
  line-height: 1.5;
  color: var(--color-neutral-500);
}
</style>
