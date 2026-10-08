<script setup lang="ts">
import { computed } from 'vue';
import { PhPawPrint } from '@phosphor-icons/vue';
import { healthPercent } from '../rails/party';
import { aboutMinutes, formatClock } from '../map/travelTimer';

// Your pet in the mobile header during a fight (51.1-UI-SPEC "Mobile Party in Combat"; owner): a
// small non-button tag with the paw, the name, the health percent and, only for a pet with an
// expiry, the countdown. The visible text is aria-hidden and the .sr-only sentence is the
// accessible name, so the countdown is never announced. Names are server text, text nodes only.
const props = defineProps<{
  pet: { name: string; currentHp: bigint; maxHp: bigint; expiresAtMicros?: bigint | null };
  secondsLeft: number | null;
}>();

const pct = computed(() => healthPercent(props.pet.currentHp, props.pet.maxHp));
// At 0 the pet has faded and the server is about to delete the row (51.1 review client-social IN-04):
// no 0:00 clock and no "fades in about 1 minute" sentence for it.
const timed = computed(
  () =>
    props.secondsLeft !== null &&
    props.secondsLeft > 0 &&
    props.pet.expiresAtMicros !== null &&
    props.pet.expiresAtMicros !== undefined,
);
const clock = computed(() => formatClock(props.secondsLeft ?? 0));
const sentence = computed(() => {
  const base = `Your pet ${props.pet.name}, health ${pct.value} percent`;
  return timed.value ? `${base}, fades in ${aboutMinutes(props.secondsLeft ?? 0)}` : base;
});
</script>

<template>
  <span class="tag tag-neutral pet-tag">
    <PhPawPrint :size="12" aria-hidden="true" class="paw" />
    <span class="pet-text" aria-hidden="true">
      <span class="pet-name">{{ pet.name }}</span>
      <span class="pet-pct">{{ ` ${pct}%` }}</span>
    </span>
    <span v-if="timed" class="pet-timer" aria-hidden="true">{{ clock }}</span>
    <span class="sr-only">{{ sentence }}</span>
  </span>
</template>

<style scoped>
.pet-tag {
  flex: none;
  gap: 4px;
  padding: 0 8px;
  margin-left: auto;
  max-width: 50%;
  min-width: 0;
  font-size: 10px;
}

.paw {
  flex: none;
  color: var(--color-accent-300);
}

.pet-text {
  display: inline-flex;
  gap: 4px;
  min-width: 0;
  white-space: nowrap;
  font-variant-numeric: tabular-nums;
}

.pet-name {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.pet-pct {
  flex: none;
}

.pet-timer {
  flex: none;
  color: var(--color-stamina);
  font-variant-numeric: tabular-nums;
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
