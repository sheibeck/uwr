<script setup lang="ts">
import type { StatBar } from './statsModel';

// The five base stat rows (50-UI-SPEC "Base stats"): name, abbreviation (desktop only), total, the
// base in parentheses, and a thin bar with a base segment and an accent gear segment. The bar is
// decoration; the screen-reader text carries the numbers.
const props = withDefaults(defineProps<{ bars: readonly StatBar[]; mobile?: boolean }>(), { mobile: false });

const percent = (fraction: number): string => `${Math.round(Math.max(0, Math.min(1, fraction)) * 1000) / 10}%`;
</script>

<template>
  <ul class="stat-bars">
    <li v-for="bar in props.bars" :key="bar.key" class="stat-row">
      <div class="line">
        <span class="stat-name">{{ bar.name }}</span>
        <span v-if="!props.mobile" class="stat-abbr">{{ bar.abbr }}</span>
        <span class="stat-total">{{ bar.total }}</span>
        <span class="stat-base">({{ bar.base }})</span>
      </div>
      <div class="bar" aria-hidden="true">
        <div class="base-seg" :style="{ width: percent(bar.baseWidth) }"></div>
        <div class="gear-seg" :style="{ width: percent(bar.gearWidth) }"></div>
      </div>
      <span class="sr-only">{{ bar.srText }}</span>
    </li>
  </ul>
</template>

<style scoped>
.stat-bars {
  display: flex;
  flex-direction: column;
  gap: 16px;
  margin: 0;
  padding: 0;
  list-style: none;
  font-variant-numeric: tabular-nums;
}

.stat-row {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.line {
  display: flex;
  align-items: baseline;
  gap: 8px;
}

.stat-name {
  font-size: 14px;
  line-height: 1.5;
}

.stat-abbr {
  font-size: 10px;
  line-height: 1.5;
  color: var(--color-neutral-500);
}

.stat-total {
  margin-left: auto;
  font-size: 14px;
  font-weight: 500;
  line-height: 1.5;
}

.stat-base {
  width: 48px;
  font-size: 12px;
  line-height: 1.5;
  text-align: right;
  color: var(--color-neutral-500);
}

.bar {
  display: flex;
  height: 4px;
  border-radius: var(--radius-sm);
  background: var(--color-neutral-900);
  overflow: hidden;
}

.base-seg {
  background: var(--color-neutral-400);
}

.gear-seg {
  background: var(--color-accent);
}

.sr-only {
  position: absolute;
  width: 1px;
  height: 1px;
  overflow: hidden;
  clip-path: inset(50%);
  white-space: nowrap;
}
</style>
