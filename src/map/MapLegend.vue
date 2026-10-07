<script setup lang="ts">
import { PhCastleTurret, PhDoorOpen, PhHammer, PhShieldCheck } from '@phosphor-icons/vue';
import { BAND_COLOR, BAND_WORD } from './danger';
import type { Band } from './danger';
import { TERRAIN_LEGEND } from './terrain';

// The legend row (51-UI-SPEC "Legend row"): four groups in fixed order (Places, Terrain, Danger,
// Marks) separated by 1px dividers. Ordinary text; swatches and icons are aria-hidden. The mobile
// disclosure wrapper belongs to plan 51-11, so the content is the same on both layouts.
const props = defineProps<{ playerLevel: number; mobile: boolean }>();

const BANDS: readonly Band[] = ['easy', 'even', 'tough', 'deadly'];
</script>

<template>
  <div class="legend" :class="{ mobile: props.mobile }">
    <div class="group" data-group="places">
      <span class="item"><span class="swatch swatch-you" aria-hidden="true"></span>You</span>
      <span class="item"><span class="swatch swatch-visited" aria-hidden="true"></span>Visited</span>
      <span class="item"><span class="swatch swatch-heard" aria-hidden="true"></span>Heard of</span>
    </div>
    <span class="divider" aria-hidden="true"></span>
    <div class="group" data-group="terrain">
      <span v-for="terrain in TERRAIN_LEGEND" :key="terrain.key" class="item item-terrain">
        <component :is="terrain.icon" :size="12" aria-hidden="true" />{{ terrain.word }}
      </span>
    </div>
    <span class="divider" aria-hidden="true"></span>
    <div class="group" data-group="danger">
      <span class="item item-safe"><PhShieldCheck :size="12" aria-hidden="true" />Safe</span>
      <span class="item">
        <span class="danger-label">Danger vs Lv {{ props.playerLevel }}:</span>
        <span v-for="band in BANDS" :key="band" class="band" :style="{ color: BAND_COLOR[band] }">{{
          BAND_WORD[band]
        }}</span>
      </span>
    </div>
    <span class="divider" aria-hidden="true"></span>
    <div class="group" data-group="marks">
      <span class="item"><PhDoorOpen class="mark-entrance" :size="12" aria-hidden="true" />Region entrance</span>
      <span class="item"><PhCastleTurret class="mark-accent" :size="12" aria-hidden="true" />Bind</span>
      <span class="item"><PhHammer class="mark-accent" :size="12" aria-hidden="true" />Crafting</span>
    </div>
  </div>
</template>

<style scoped>
.legend {
  flex: none;
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  column-gap: 16px;
  row-gap: 4px;
  padding: 0 0 8px;
  font-size: 12px;
  color: var(--color-neutral-400);
}

.group {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  column-gap: 16px;
  row-gap: 4px;
}

.item {
  display: inline-flex;
  align-items: center;
  gap: 4px;
}

.item-terrain svg {
  color: var(--color-neutral-200);
}

.item-safe svg {
  color: var(--color-con-light-green);
}

.divider {
  flex: none;
  width: 1px;
  height: 12px;
  background: var(--color-divider);
}

.swatch {
  flex: none;
  box-sizing: border-box;
  width: 12px;
  height: 12px;
  border-radius: 50%;
}

.swatch-you {
  border: 2px solid var(--color-accent);
}

.swatch-visited {
  border: 2px solid var(--color-neutral-400);
}

.swatch-heard {
  border: 1px solid color-mix(in srgb, var(--color-neutral-400) 45%, transparent);
}

.mark-entrance {
  color: var(--color-accent);
}

.mark-accent {
  color: var(--color-accent-300);
}
</style>
