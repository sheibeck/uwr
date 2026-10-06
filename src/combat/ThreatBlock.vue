<script setup lang="ts">
import type { ThreatView } from './threat';

// Threat order on the current target (48-UI-SPEC "Encounter panel" item 4, CMB-02).
// The panel mounts this only when the view is visible. Names are text nodes only.
defineProps<{ view: ThreatView }>();
</script>

<template>
  <section class="threat" aria-label="Threat">
    <h6 class="threat-heading" :title="view.heading">{{ view.heading }}</h6>
    <p v-if="view.emptyText !== null" class="empty">{{ view.emptyText }}</p>
    <div v-else class="rows">
      <div v-for="row in view.rows" :key="String(row.characterId)" class="threat-row" :class="{ self: row.isSelf }">
        <span class="threat-name" :title="row.name">{{ row.name }}</span>
        <span class="threat-track"><span class="threat-fill" :style="{ width: row.widthPercent }"></span></span>
        <span class="threat-percent">{{ row.percentText }}</span>
      </div>
    </div>
  </section>
</template>

<style scoped>
.threat {
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin-top: auto;
  min-width: 0;
}

.threat-heading {
  margin: 0;
  overflow: hidden;
  color: var(--color-neutral-400);
  text-overflow: ellipsis;
  white-space: nowrap;
}

.rows {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.threat-row {
  display: grid;
  grid-template-columns: 64px minmax(0, 1fr) 32px;
  align-items: center;
  gap: 8px;
}

.threat-name {
  min-width: 0;
  overflow: hidden;
  font-size: 12px;
  color: var(--color-text);
  text-overflow: ellipsis;
  white-space: nowrap;
}

.threat-track {
  display: block;
  height: 3px;
  overflow: hidden;
  border-radius: var(--radius-sm);
  background: var(--color-neutral-900);
}

.threat-fill {
  display: block;
  height: 100%;
  background: var(--color-neutral-400);
}

.threat-percent {
  font-size: 10px;
  color: var(--color-neutral-500);
  text-align: right;
  font-variant-numeric: tabular-nums;
}

.threat-row.self .threat-name {
  color: var(--color-accent-300);
}

.threat-row.self .threat-fill {
  background: var(--color-accent);
}

.empty {
  margin: 0;
  font-size: 12px;
  color: var(--color-neutral-500);
}
</style>
