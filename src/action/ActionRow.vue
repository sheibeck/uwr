<script setup lang="ts">
import { computed, inject } from 'vue';
import type { Component } from 'vue';
import { PhCube } from '@phosphor-icons/vue';
import { GAME_KEY, createInertGame } from '../game/context';
import { abilityIcon } from '../hotbar/hotbar';
import { actionSummary, actionTimeText } from './actionProgress';
import { useActionProgress } from './useActionProgress';

// The action row above the hotbar (quick task 261006-a13): while the character gathers or casts out
// of combat it shows what is happening, a progress bar and the seconds left. It reads the
// resource_gather and character_cast rows only (no optimistic state, CLAUDE.md), hides during the
// character's own fight (the round row owns that slot) and has no Cancel control: the server has no
// cancel reducer for either action. Node and ability names render as text nodes. Screen readers hear
// the label once (the progressbar's aria-label): the visible label is aria-hidden and the value text is
// only the time.
const game = inject(GAME_KEY, createInertGame());

const { action, progress } = useActionProgress({
  characterId: game.characterId,
  gathers: game.gathers,
  casts: game.characterCasts,
  nodes: game.nodesHere,
  abilities: game.abilities,
  inCombat: game.combat.active,
  clock: game.clock,
  firstSeen: game.actionFirstSeen,
});

const icon = computed<Component>(() => {
  const view = action.value;
  if (view === null || view.kind === 'gather') return PhCube;
  return abilityIcon(view.abilityKind === null ? '' : view.abilityKind);
});

const label = computed(() => (action.value === null ? '' : action.value.label));
const timeText = computed(() => (progress.value === null ? '' : actionTimeText(progress.value)));
const summary = computed(() => (progress.value === null ? '' : actionSummary(label.value, progress.value)));
const percent = computed(() => (progress.value === null ? 0 : progress.value.percent));
const finishing = computed(() => progress.value !== null && progress.value.finishing);
const fillWidth = computed(() =>
  progress.value === null ? '0%' : `${Math.round(progress.value.fraction * 1000) / 10}%`,
);
</script>

<template>
  <div v-if="action !== null && progress !== null" class="action-row" :title="summary">
    <component :is="icon" class="action-icon" :size="14" aria-hidden="true" />
    <span class="action-label" aria-hidden="true">{{ label }}</span>
    <div
      class="track"
      role="progressbar"
      :aria-label="label"
      aria-valuemin="0"
      aria-valuemax="100"
      :aria-valuenow="percent"
      :aria-valuetext="timeText"
    >
      <span class="fill" :style="{ width: fillWidth }"></span>
    </div>
    <span class="action-time" :class="{ finishing }" aria-hidden="true">{{ timeText }}</span>
  </div>
</template>

<style scoped>
.action-row {
  display: flex;
  align-items: center;
  gap: 8px;
  min-height: 32px;
  min-width: 0;
}

.action-icon {
  flex: none;
  color: var(--color-neutral-400);
}

.action-label {
  flex: 0 1 auto;
  min-width: 0;
  max-width: 45%;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 12px;
  color: var(--color-text);
}

.track {
  flex: 1;
  min-width: 64px;
  height: 3px;
  overflow: hidden;
  border-radius: var(--radius-sm);
  background: var(--color-neutral-900);
}

.fill {
  display: block;
  height: 100%;
  background: var(--color-accent);
  transition: width 250ms linear;
}

.action-time {
  flex: none;
  min-width: 32px;
  text-align: right;
  font-size: 12px;
  font-variant-numeric: tabular-nums;
  color: var(--color-accent-300);
}

.action-time.finishing {
  color: var(--color-neutral-300);
}

@media (prefers-reduced-motion: reduce) {
  .fill {
    transition: none;
  }
}
</style>
