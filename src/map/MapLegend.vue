<script setup lang="ts">
import { PhCastleTurret, PhDoorOpen, PhHammer, PhShieldCheck } from '@phosphor-icons/vue';
import { RATING_WORDS } from '@game-data/place_rating';
import { TERRAIN_LEGEND } from './terrain';

// The legend row (51-UI-SPEC "Legend row"): four groups in fixed order (Places, Terrain, Danger,
// Marks) separated by 1px dividers. Ordinary text; swatches and icons are aria-hidden. The mobile
// disclosure wrapper belongs to plan 51-11, so the content is the same on both layouts.
// The Danger group is the safety rating (51.3.1.1 D-42): Safe, then the viewer's level label and the
// three ratings in their colours; the words come from the shared rule (@game-data/place_rating).
const props = defineProps<{ playerLevel: number; mobile: boolean }>();

const RATES = (['quiet', 'risky', 'deadly'] as const).map((key) => ({ key, word: RATING_WORDS[key] }));
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
        <span class="danger-label">Safety for Lv {{ props.playerLevel }}:</span>
        <span v-for="rate in RATES" :key="rate.key" class="rate" :class="`rate-${rate.key}`">{{ rate.word }}</span>
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

.rate-quiet {
  color: var(--color-con-blue);
}

.rate-risky {
  color: var(--color-con-yellow);
}

.rate-deadly {
  color: var(--color-con-red);
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
