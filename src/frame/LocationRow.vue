<script setup lang="ts">
import { computed, inject } from 'vue';
import { PhHourglassMedium, PhMapPin } from '@phosphor-icons/vue';
import { MAP_KEY, createInertMap } from '../map/mapContext';
import { aboutMinutes, formatClock } from '../map/travelTimer';
import { dangerClass } from '../rails/exits';
import { usePlaceView } from '../rails/useExits';

// The mobile location line (51-UI-SPEC "Mobile (Story screen, 12a A.6)"): the pin, the place, its
// terrain and its level in the Map's band colour, and the region travel timer while it runs. The
// time of day is not here (the Console 12a mock puts terrain and level in its place); the desktop
// header keeps it. The place name comes from the frame view; the terrain and level read the character's
// place. All names are server text, rendered as text nodes only.
const props = defineProps<{ locationName: string }>();

const map = inject(MAP_KEY, createInertMap());
const here = usePlaceView();

const timer = computed(() => map.selfTimer.value);
const clock = computed(() => formatClock(timer.value.secondsLeft));
const minutes = computed(() => `Region travel ready in ${aboutMinutes(timer.value.secondsLeft)}`);

const levelText = computed(() => {
  const danger = here.value?.danger;
  if (!danger) return '';
  return danger.levelLabel !== '' ? danger.levelLabel : danger.word;
});
</script>

<template>
  <div class="location-row">
    <PhMapPin class="pin" :size="14" aria-hidden="true" />
    <span class="name" :title="props.locationName">{{ props.locationName }}</span>
    <template v-if="here">
      <!-- The separators are visual only: screen readers hear 'Woods', not 'dot Woods dot'. -->
      <span class="terrain"><span aria-hidden="true">· </span>{{ here.terrain.word }}<span aria-hidden="true"> ·</span></span>
      <span class="level" :class="dangerClass(here.danger)">{{ levelText }}</span>
    </template>
    <template v-if="timer.running">
      <span class="timer">
        <PhHourglassMedium :size="12" aria-hidden="true" />
        <span aria-hidden="true">{{ clock }}</span>
      </span>
      <span class="sr-only">{{ minutes }}</span>
    </template>
  </div>
</template>

<style scoped>
.location-row {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 8px 16px 4px;
  font-size: 12px;
  font-weight: 400;
}

.pin {
  flex-shrink: 0;
  color: var(--color-accent);
}

/* The place name gives way first: terrain and level keep their width. */
.name {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: var(--color-neutral-300);
}

.terrain,
.level {
  flex-shrink: 0;
  white-space: nowrap;
}

.terrain {
  color: var(--color-neutral-500);
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

.timer {
  flex-shrink: 0;
  margin-left: auto;
  display: inline-flex;
  align-items: center;
  gap: 4px;
  font-size: 10px;
  font-variant-numeric: tabular-nums;
  color: var(--color-stamina);
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
