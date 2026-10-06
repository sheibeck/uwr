<script setup lang="ts">
import { PhCrosshairSimple, PhHourglassMedium } from '@phosphor-icons/vue';
import type { HostileView } from './hostiles';

// One hostile in the encounter rail and sheet (48-UI-SPEC "Encounter panel", CMB-01, CMB-03).
// Names and ability text are server or model text and render as text nodes only. The target ring
// follows the `targeted` flag, which the panel derives from character.combatTargetEnemyId, so
// nothing here is optimistic. A defeated hostile never emits.
const props = defineProps<{ hostile: HostileView; variant: 'rail' | 'sheet' }>();
const emit = defineEmits<{ select: [id: bigint] }>();

function onClick(): void {
  if (props.hostile.defeated) return;
  emit('select', props.hostile.id);
}
</script>

<template>
  <button
    type="button"
    class="hostile-card"
    :class="{ targeted: hostile.targeted, defeated: hostile.defeated, sheet: variant === 'sheet' }"
    :aria-pressed="hostile.targeted"
    :aria-disabled="hostile.defeated ? 'true' : undefined"
    :aria-label="hostile.ariaLabel"
    @click="onClick"
  >
    <span class="row row-name">
      <span v-if="hostile.isBoss" class="tag boss-tag">Boss</span>
      <span class="name" :class="hostile.con.className" :title="hostile.title">{{ hostile.name }}</span>
      <span v-if="hostile.levelText !== null" class="level">{{ hostile.levelText }}</span>
      <PhCrosshairSimple v-if="hostile.targeted" class="marker" :size="16" aria-hidden="true" />
    </span>
    <span
      class="hp-track"
      role="progressbar"
      :aria-label="`${hostile.name} health`"
      aria-valuemin="0"
      :aria-valuenow="Number(hostile.hp)"
      :aria-valuemax="Number(hostile.maxHp)"
    >
      <span class="hp-fill" :style="{ width: hostile.widthPercent }"></span>
      <span class="hp-value">{{ hostile.hpText }}</span>
    </span>
    <span v-for="(windup, index) in hostile.windups" :key="index" class="windup">
      <PhHourglassMedium class="windup-icon" :size="14" aria-hidden="true" />
      <span class="windup-text">{{ windup.text }}</span>
    </span>
  </button>
</template>

<style scoped>
.hostile-card {
  display: flex;
  flex-direction: column;
  gap: 4px;
  box-sizing: border-box;
  width: 100%;
  min-width: 0;
  padding: 8px;
  border: 0;
  border-radius: var(--radius-md);
  background: var(--color-surface);
  box-shadow: none;
  color: var(--color-text);
  font: inherit;
  text-align: left;
  cursor: pointer;
}

.hostile-card.sheet {
  min-height: 44px;
}

.hostile-card:hover:not(.defeated) {
  background: color-mix(in srgb, var(--color-text) 7%, var(--color-surface));
}

.hostile-card:active:not(.defeated) {
  background: color-mix(in srgb, var(--color-text) 14%, var(--color-surface));
}

.hostile-card:focus-visible {
  outline: 2px solid var(--color-accent);
  outline-offset: -2px;
}

.hostile-card.targeted {
  box-shadow:
    inset 0 0 0 1px var(--color-accent),
    0 0 12px color-mix(in srgb, var(--color-accent) 30%, transparent);
}

.hostile-card.defeated {
  opacity: 0.45;
  cursor: default;
}

.row {
  display: flex;
  min-width: 0;
}

.row-name {
  align-items: center;
  gap: 4px;
}

.name {
  min-width: 0;
  overflow: hidden;
  font-size: 14px;
  font-weight: 500;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.con-gray {
  color: var(--color-con-gray);
}

.con-light-green {
  color: var(--color-con-light-green);
}

.con-blue {
  color: var(--color-con-blue);
}

.con-white {
  color: var(--color-con-white);
}

.con-yellow {
  color: var(--color-con-yellow);
}

.con-orange {
  color: var(--color-con-orange);
}

.con-red {
  color: var(--color-con-red);
}

.level {
  flex-shrink: 0;
  font-size: 12px;
  color: var(--color-neutral-500);
  white-space: nowrap;
}

.boss-tag {
  flex-shrink: 0;
  padding: 0 4px;
  font-size: 10px;
  font-weight: 500;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  background: color-mix(in srgb, var(--color-health) 24%, var(--color-surface));
  color: color-mix(in srgb, var(--color-health) 28%, var(--color-text));
}

.marker {
  flex-shrink: 0;
  margin-left: auto;
  color: var(--color-accent);
}

.hp-track {
  position: relative;
  display: block;
  height: 14px;
  overflow: hidden;
  border-radius: var(--radius-sm);
  background: var(--color-neutral-900);
}

.hp-fill {
  display: block;
  height: 100%;
  background: color-mix(in srgb, var(--color-health) 80%, var(--color-neutral-900));
}

.hp-value {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 10px;
  font-weight: 500;
  color: var(--color-neutral-100);
  font-variant-numeric: tabular-nums;
}

.windup {
  display: flex;
  align-items: flex-start;
  gap: 4px;
  font-size: 12px;
  color: var(--color-neutral-200);
}

.windup-icon {
  flex-shrink: 0;
  color: var(--color-con-orange);
}

.windup-text {
  min-width: 0;
  overflow-wrap: anywhere;
}
</style>
