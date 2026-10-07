<script setup lang="ts">
import { computed } from 'vue';
import type { Component } from 'vue';
import { PhHeartbeat } from '@phosphor-icons/vue';
import type { ItemDetails } from '../ledger/itemDetails';

// The item card: what an item is and does (50-CONTEXT "Output details"), shared by the Creates card
// on a recipe (plan 50-36) and the Salvage detail (plan 50-38). Desktop draws the kicker, a 64px icon
// box with a rarity ring and glow, the name in the rarity color, the type line, the stat tiles, the
// effect, the meta line and the italic description (mock 9a). Mobile draws a 56px icon box, the stats
// as chips, and keeps the effect and meta; it has no kicker and no description. The content comes
// from itemDetails (the shared stat order, food labels and sell value); every server string is a
// mustache text node, and the ring and glow are built from the color token passed in, never a literal.
const props = withDefaults(
  defineProps<{
    kicker?: string;
    name: string;
    /** The rarity name color token (a var() string). */
    color: string;
    icon: Component;
    /** 'x2' for an output that makes more than one; empty or absent for none. */
    yieldTag?: string;
    details: ItemDetails;
    mobile?: boolean;
  }>(),
  { kicker: '', yieldTag: '', mobile: false },
);

const iconBoxStyle = computed<Record<string, string>>(() => ({
  color: props.color,
  boxShadow: props.mobile
    ? `inset 0 0 0 1px ${props.color}`
    : `inset 0 0 0 1px ${props.color}, 0 0 18px color-mix(in srgb, ${props.color} 22%, transparent)`,
}));
</script>

<template>
  <div class="item-card" :class="{ mobile: props.mobile }">
    <span v-if="!props.mobile && props.kicker" class="kicker">{{ props.kicker }}</span>
    <div class="card">
      <div class="icon-box" :style="iconBoxStyle">
        <component :is="props.icon" :size="props.mobile ? 26 : 30" aria-hidden="true" />
        <span v-if="props.yieldTag" class="yield-tag">{{ props.yieldTag }}</span>
      </div>
      <div class="body">
        <div class="head">
          <h4 class="name" :style="{ color: props.color }">{{ props.name }}</h4>
          <div class="type-line">
            <template v-for="(part, index) in props.details.typeParts" :key="index">
              <span v-if="index > 0" class="sep" aria-hidden="true">{{ ' · ' }}</span>
              <span class="type-part" :class="{ short: part.tone === 'short' }">{{ part.text }}</span>
            </template>
          </div>
        </div>
        <div v-if="props.details.stats.length > 0 && !props.mobile" class="stat-tiles">
          <div v-for="stat in props.details.stats" :key="stat.key" class="stat-tile">
            <span class="stat-label">{{ stat.label }}</span>
            <span class="stat-value">{{ stat.text }}</span>
          </div>
        </div>
        <div v-else-if="props.details.stats.length > 0" class="stat-chips">
          <span v-for="stat in props.details.stats" :key="stat.key" class="stat-chip tag tag-neutral">
            {{ stat.label }} {{ stat.text }}
          </span>
        </div>
        <div v-if="props.details.effect" class="effect">
          <PhHeartbeat :size="16" aria-hidden="true" />
          <span>{{ props.details.effect }}</span>
        </div>
        <div class="meta">{{ props.details.meta }}</div>
        <div v-if="props.details.description && !props.mobile" class="description">{{ props.details.description }}</div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.item-card {
  display: flex;
  flex-direction: column;
  gap: 8px;
  min-width: 0;
  font-variant-numeric: tabular-nums;
}

.kicker {
  font-size: 10px;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  line-height: 1.5;
  color: var(--color-accent);
}

.card {
  display: flex;
  gap: 16px;
  padding: 16px;
  border-radius: var(--radius-lg);
  background: var(--color-bg);
  box-shadow: inset 0 0 0 1px var(--color-neutral-800);
}

.mobile .card {
  padding: 0;
  border-radius: 0;
  background: transparent;
  box-shadow: none;
}

.icon-box {
  position: relative;
  display: grid;
  flex: none;
  place-items: center;
  width: 64px;
  height: 64px;
  border-radius: var(--radius-md);
  background: var(--color-surface);
}

.mobile .icon-box {
  width: 56px;
  height: 56px;
}

.yield-tag {
  position: absolute;
  top: 4px;
  right: 4px;
  font-size: 10px;
  line-height: 1.5;
  color: var(--color-neutral-200);
}

.body {
  display: flex;
  flex: 1;
  flex-direction: column;
  gap: 8px;
  min-width: 0;
}

.name {
  margin: 0;
  font-size: 20px;
  font-weight: 500;
  line-height: 1.12;
  overflow-wrap: anywhere;
}

.type-line {
  font-size: 12px;
  line-height: 1.5;
  color: var(--color-neutral-400);
  overflow-wrap: anywhere;
}

.type-part.short {
  color: var(--color-con-red);
}

.stat-tiles {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 8px;
}

.stat-tile {
  display: flex;
  flex-direction: column;
  min-width: 0;
  padding: 4px 8px;
  border-radius: var(--radius-md);
  background: var(--color-surface);
}

.stat-label {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 10px;
  line-height: 1.5;
  color: var(--color-neutral-400);
}

.stat-value {
  font-size: 14px;
  line-height: 1.5;
}

.stat-chips {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.effect {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  font-size: 12px;
  line-height: 1.5;
  color: var(--color-con-light-green);
}

.effect svg {
  flex: none;
}

.meta {
  font-size: 12px;
  line-height: 1.5;
  color: var(--color-neutral-400);
  overflow-wrap: anywhere;
}

.description {
  font-size: 12px;
  font-style: italic;
  line-height: 1.5;
  color: var(--color-neutral-500);
  overflow-wrap: anywhere;
}
</style>
