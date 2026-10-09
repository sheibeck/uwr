<script setup lang="ts">
import { PhCrosshair, PhCrosshairSimple, PhFirstAid, PhHourglassMedium, PhSkull } from '@phosphor-icons/vue';
import EffectChips from '../rails/EffectChips.vue';
import RoleChip from './RoleChip.vue';
import { HOSTILE_EFFECT_LIMIT } from './hostiles';
import type { HostileView } from './hostiles';

// One hostile in the encounter rail and sheet (48-UI-SPEC "Encounter panel", CMB-01, CMB-03; 51.3.1.1
// UI-SPEC "Enemy card" and "Enemy target line", D-40). Order inside the one button: the role row, the
// name row, the HP track ('Down' once defeated), effect chips, wind-ups, then the target line. Every
// child is a phrasing element, so the card stays one button with aria-pressed and the Examine eye is
// its sibling. Names and ability text are server or model text and render as text nodes only. The
// target ring follows the `targeted` flag, which the panel derives from character.combatTargetEnemyId,
// so nothing here is optimistic. A defeated hostile never emits.
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
    <span class="row row-role">
      <RoleChip :role="hostile.role" :variant="variant" />
      <PhCrosshairSimple v-if="hostile.targeted" class="marker" :size="16" aria-hidden="true" />
    </span>
    <span class="row row-name">
      <span class="name" :class="hostile.con.className" :title="hostile.title">{{ hostile.name }}</span>
      <span v-if="hostile.levelText !== null" class="level">{{ hostile.levelText }}</span>
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
    <EffectChips
      v-if="hostile.effects.length > 0"
      class="hostile-effects"
      :effects="hostile.effects"
      :limit="HOSTILE_EFFECT_LIMIT"
      dense
      inline
    />
    <span v-for="(windup, index) in hostile.windups" :key="index" class="windup">
      <PhHourglassMedium class="windup-icon" :size="14" aria-hidden="true" />
      <span class="windup-text">{{ windup.text }}</span>
    </span>
    <span v-if="hostile.defeated" class="target-line out">
      <PhSkull class="target-icon" :size="12" aria-hidden="true" />
      <span class="target-verb">Out of the fight</span>
    </span>
    <span v-else-if="hostile.intent.kind === 'healing'" class="target-line healing">
      <PhFirstAid class="target-icon" :size="12" aria-hidden="true" />
      <span class="target-verb">Healing</span> <span class="target-name">{{ hostile.intent.name }}</span>
    </span>
    <span v-else-if="hostile.intent.kind === 'targeting'" class="target-line">
      <PhCrosshair class="target-icon" :size="12" aria-hidden="true" />
      <span class="target-verb">Targeting</span> <span class="target-name" :class="{ self: hostile.intent.self }">{{ hostile.intent.name }}</span>
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

.row-role,
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

/* The target line (51.3.1.1 D-40): Label 12, a 1px top rule; no line at all for intent none. */
.target-line {
  display: flex;
  align-items: center;
  gap: 4px;
  min-width: 0;
  padding-top: 4px;
  border-top: 1px solid var(--color-neutral-800);
  font-size: 12px;
  font-weight: 400;
  color: var(--color-neutral-400);
}

.target-icon {
  flex-shrink: 0;
}

.target-verb {
  flex-shrink: 0;
  white-space: nowrap;
}

.target-name {
  min-width: 0;
  overflow: hidden;
  font-weight: 500;
  color: var(--color-neutral-100);
  text-overflow: ellipsis;
  white-space: nowrap;
}

.target-name.self {
  color: var(--color-accent-300);
}

.target-line.healing .target-icon {
  color: var(--color-con-light-green);
}

.target-line.healing .target-name {
  color: var(--color-con-light-green);
}

.target-line.out {
  color: var(--color-neutral-500);
}
</style>
