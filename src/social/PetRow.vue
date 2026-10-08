<script setup lang="ts">
import { computed } from 'vue';
import { PhHourglassMedium, PhPawPrint } from '@phosphor-icons/vue';
import { barFraction } from '../frame/vitals';
import { aboutMinutes, formatClock } from '../map/travelTimer';

// A pet under its owner's card or block (51.1-UI-SPEC "Pets"). Owner decision: the row shows the
// name, level, HP and expiry only, never a kind, ability, cooldown or buff (the server has none),
// and it is never interactive: a div, not a button, not focusable, no menu. Pet and owner names are
// server text and are rendered as text nodes only.
//
// Presentational: the host passes the pet and its seconds left (SocialData.petSecondsLeft, null
// without an expiry). The countdown is aria-hidden and never announced.
const props = defineProps<{
  pet: {
    name: string;
    level: bigint;
    currentHp: bigint;
    maxHp: bigint;
    expiresAtMicros?: bigint | null;
  };
  /** The owner's name; null means your own pet. */
  ownerName: string | null;
  secondsLeft: number | null;
}>();

const prefix = computed(() => (props.ownerName === null ? 'Your pet' : `${props.ownerName}'s pet`));
const hpText = computed(() => `${props.pet.currentHp}/${props.pet.maxHp}`);
const fill = computed(() => `${Math.round(barFraction(props.pet.currentHp, props.pet.maxHp) * 100)}%`);
const label = computed(() => `${props.pet.name} health ${props.pet.currentHp} of ${props.pet.maxHp}`);
// A timer only for a pet that has an expiry on the server.
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
const fades = computed(() => `fades in ${aboutMinutes(props.secondsLeft ?? 0)}`);
</script>

<template>
  <div class="pet-row">
    <span class="sr-only">{{ prefix }}</span>
    <PhPawPrint :size="12" aria-hidden="true" class="paw" />
    <div class="body">
      <div class="line">
        <span class="pet-name" :title="pet.name">{{ pet.name }}</span>
        <span class="pet-level">Lv {{ pet.level }}</span>
        <span class="pet-hp">{{ hpText }}</span>
      </div>
      <div class="line">
        <div
          class="bar"
          role="progressbar"
          :aria-label="label"
          aria-valuemin="0"
          :aria-valuemax="Number(pet.maxHp)"
          :aria-valuenow="Number(pet.currentHp)"
        >
          <span class="fill" :style="{ width: fill }" />
        </div>
        <template v-if="timed">
          <PhHourglassMedium :size="10" aria-hidden="true" class="hourglass" />
          <span class="pet-timer" aria-hidden="true">{{ clock }}</span>
          <span class="sr-only">{{ fades }}</span>
        </template>
      </div>
    </div>
  </div>
</template>

<style scoped>
.pet-row {
  position: relative;
  display: flex;
  align-items: flex-start;
  gap: 8px;
  margin: 4px 0 0 16px;
  padding: 4px 8px;
  border-radius: var(--radius-sm);
  background: color-mix(in srgb, var(--color-surface) 60%, transparent);
  box-shadow: inset 0 0 0 1px var(--color-neutral-800);
  min-width: 0;
}

/* The elbow joins the row to its owner's card or block. */
.pet-row::before {
  content: '';
  position: absolute;
  left: -12px;
  top: -4px;
  width: 8px;
  height: 16px;
  box-sizing: border-box;
  border-left: 1px solid var(--color-neutral-700);
  border-bottom: 1px solid var(--color-neutral-700);
  border-bottom-left-radius: var(--radius-sm);
}

.paw {
  flex: none;
  color: var(--color-accent-300);
}

.body {
  display: flex;
  flex: 1;
  flex-direction: column;
  gap: 4px;
  min-width: 0;
}

.line {
  display: flex;
  align-items: center;
  gap: 4px;
  min-width: 0;
}

.pet-name {
  min-width: 0;
  overflow: hidden;
  font-size: 12px;
  font-weight: 500;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.pet-level,
.pet-hp {
  flex: none;
  font-size: 10px;
  color: var(--color-neutral-500);
  white-space: nowrap;
}

.pet-hp {
  margin-left: auto;
  font-variant-numeric: tabular-nums;
}

.bar {
  flex: 1;
  min-width: 24px;
  height: 4px;
  overflow: hidden;
  border-radius: var(--radius-sm);
  background: var(--color-neutral-900);
}

.fill {
  display: block;
  height: 100%;
  background: var(--color-health);
}

.hourglass {
  flex: none;
  color: var(--color-stamina);
}

.pet-timer {
  flex: none;
  font-size: 10px;
  color: var(--color-stamina);
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
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
