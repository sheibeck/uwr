<script setup lang="ts">
import { computed, inject, onBeforeUnmount, ref, watch } from 'vue';
import type { Component } from 'vue';
import { PhCheck, PhCircleNotch, PhPersonSimpleRun, PhSword } from '@phosphor-icons/vue';
import {
  COMBAT_KEY,
  FRAME_KEY,
  GAME_KEY,
  createInertCombat,
  createInertFrame,
  createInertGame,
} from '../game/context';
import type { GameReducers } from '../game/context';
import { abilityIcon } from '../hotbar/hotbar';
import { choiceChip, livingTargetId, roundControls } from './choice';

// The round row above the hotbar slots in combat (48-UI-SPEC "Composer in combat", "Round Contract"):
// the choice chip, the round timer, Ready and Flee. The chip, Ready and Flee states derive from the
// combat_action row only (no optimistic state, CLAUDE.md); the pending flags only block double
// clicks. Ability and enemy names render as text nodes.
const game = inject(GAME_KEY, createInertGame());
const frame = inject(FRAME_KEY, createInertFrame());
const controller = inject(COMBAT_KEY, createInertCombat());

// A container query is pinned to HeaderBar by frameContract.test.ts, so the two-row form is
// decided here from the measured width (UI-SPEC: container narrower than 520px).
const ROUND_ROW_STACK_PX = 520;

const combat = game.combat;
const rowEl = ref<HTMLElement | null>(null);
const narrow = ref(false);

const stacked = computed(() => !frame.isDesktop.value || narrow.value);
const mobile = computed(() => !frame.isDesktop.value);

const down = computed(() => controller.down.value);
const resolving = computed(() => controller.resolving.value || controller.timer.value.resolving);
const timer = computed(() => controller.timer.value);

const action = computed(() => combat.ownAction.value);
const currentTargetId = computed(() => game.character.value?.combatTargetEnemyId ?? null);

const chip = computed(() =>
  choiceChip({
    action: action.value,
    abilities: game.abilities.value,
    enemies: combat.enemies.value,
    currentTargetId: currentTargetId.value,
    selfId: game.characterId.value,
    characterNames: combat.characterNames.value,
    down: down.value,
  }),
);

const controls = computed(() =>
  roundControls({
    actionType: action.value === null ? null : action.value.actionType,
    resolving: resolving.value,
    down: down.value,
    connected: game.connected.value,
  }),
);

const chipIcon = computed<Component | null>(() => {
  const value = chip.value;
  if (value.icon === 'sword') return PhSword;
  if (value.icon === 'check') return PhCheck;
  if (value.icon === 'run') return PhPersonSimpleRun;
  if (value.icon === 'ability' && value.abilityKind !== null) return abilityIcon(value.abilityKind);
  return null;
});

const chipTone = computed(() => (chip.value.tone === 'danger' ? 'tone-danger' : `tag-${chip.value.tone}`));
const fillWidth = computed(() => (resolving.value ? '0%' : `${Math.round(timer.value.fraction * 1000) / 10}%`));
const secondsLeft = computed(() => (resolving.value ? 0 : timer.value.seconds));

const readyPending = ref(false);
const fleePending = ref(false);

function ready(): void {
  const reducers = game.reducers.value;
  const characterId = game.characterId.value;
  if (controls.value.readyDisabled || readyPending.value) return;
  if (reducers === null || characterId === null) return;
  const args: Parameters<GameReducers['submitCombatAction']>[0] = { characterId };
  const targetId = livingTargetId(combat.enemies.value, currentTargetId.value);
  if (targetId !== undefined) args.targetEnemyId = targetId;
  readyPending.value = true;
  void (async () => {
    try {
      await reducers.submitCombatAction(args);
    } catch (error) {
      // The server writes refusals into the feed; nothing is added here.
      console.warn('[combat] submit_combat_action failed', error);
    } finally {
      readyPending.value = false;
    }
  })();
}

function flee(): void {
  const reducers = game.reducers.value;
  const characterId = game.characterId.value;
  if (controls.value.fleeDisabled || controls.value.fleeChosen || fleePending.value) return;
  if (reducers === null || characterId === null) return;
  fleePending.value = true;
  void (async () => {
    try {
      await reducers.fleeCombat({ characterId });
    } catch (error) {
      console.warn('[combat] flee_combat failed', error);
    } finally {
      fleePending.value = false;
    }
  })();
}

// One observer per mounted row, feature-detected, disconnected on unmount. Without it the row
// stacks only in the mobile layout.
let observer: ResizeObserver | null = null;

function stopObserving(): void {
  if (observer !== null) observer.disconnect();
  observer = null;
}

watch(
  rowEl,
  (el) => {
    stopObserving();
    if (el === null || typeof ResizeObserver === 'undefined') return;
    observer = new ResizeObserver((entries) => {
      const entry = entries[entries.length - 1];
      if (entry === undefined) return;
      narrow.value = entry.contentRect.width < ROUND_ROW_STACK_PX;
    });
    observer.observe(el);
  },
  { flush: 'post', immediate: true },
);

onBeforeUnmount(stopObserving);
</script>

<template>
  <div
    v-if="combat.active.value"
    ref="rowEl"
    class="round-row"
    :class="{ stacked, mobile }"
  >
    <span class="tag choice-chip" :class="chipTone" :title="chip.text">
      <component :is="chipIcon" v-if="chipIcon !== null" class="chip-icon" :size="12" aria-hidden="true" />
      <span class="chip-text">{{ chip.text }}</span>
    </span>

    <div class="timer">
      <div
        class="track"
        role="progressbar"
        aria-label="Round timer"
        aria-valuemin="0"
        :aria-valuenow="secondsLeft"
        :aria-valuemax="timer.totalSeconds"
      >
        <span class="fill" :style="{ width: fillWidth }"></span>
      </div>
      <span v-if="resolving" class="resolving" role="status">
        <PhCircleNotch class="spinner" :size="14" aria-hidden="true" />
        <span>Resolving…</span>
      </span>
      <span v-else class="seconds" aria-hidden="true">{{ timer.seconds }}s</span>
    </div>

    <button
      type="button"
      class="btn btn-primary ready"
      :aria-disabled="controls.readyDisabled ? 'true' : undefined"
      @click="ready"
    >
      <PhCheck :size="14" aria-hidden="true" />
      <span>Ready</span>
    </button>
    <button
      type="button"
      class="btn btn-secondary flee"
      :class="{ chosen: controls.fleeChosen }"
      :aria-pressed="controls.fleeChosen ? 'true' : 'false'"
      :aria-disabled="controls.fleeDisabled ? 'true' : undefined"
      @click="flee"
    >
      <PhCheck v-if="controls.fleeChosen" :size="14" aria-hidden="true" />
      <PhPersonSimpleRun v-else :size="14" aria-hidden="true" />
      <span>{{ controls.fleeChosen ? 'Flee chosen' : 'Flee' }}</span>
    </button>
  </div>
</template>

<style scoped>
.round-row {
  display: flex;
  align-items: center;
  gap: 8px;
  min-height: 32px;
  min-width: 0;
}

.choice-chip {
  flex: 0 1 auto;
  min-width: 0;
  max-width: 45%;
  gap: 4px;
  overflow: hidden;
  font-size: 12px;
}

.chip-icon {
  flex: none;
}

.chip-text {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.choice-chip.tone-danger {
  background: color-mix(in srgb, var(--color-health) 24%, var(--color-surface));
  color: color-mix(in srgb, var(--color-health) 28%, var(--color-text));
}

.timer {
  flex: 1;
  min-width: 64px;
  display: flex;
  align-items: center;
  gap: 8px;
}

.track {
  flex: 1;
  min-width: 0;
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

.seconds {
  flex: none;
  width: 32px;
  text-align: right;
  font-size: 12px;
  font-variant-numeric: tabular-nums;
  color: var(--color-accent-300);
}

.resolving {
  flex: none;
  display: inline-flex;
  align-items: center;
  gap: 4px;
  font-size: 12px;
  color: var(--color-neutral-300);
}

.spinner {
  flex: none;
  color: var(--color-accent);
  animation: round-spin 1s linear infinite;
}

@keyframes round-spin {
  from {
    transform: rotate(0deg);
  }
  to {
    transform: rotate(360deg);
  }
}

.ready,
.flee {
  flex: none;
  min-height: 32px;
  padding: 4px 16px;
  gap: 4px;
  font-size: 12px;
}

.flee.chosen {
  border-color: transparent;
  background: color-mix(in srgb, var(--color-health) 24%, var(--color-surface));
  color: color-mix(in srgb, var(--color-health) 28%, var(--color-text));
}

.flee.chosen:hover,
.flee.chosen:active {
  background: color-mix(in srgb, var(--color-health) 24%, var(--color-surface));
}

.btn[aria-disabled='true'] {
  opacity: 0.45;
  cursor: default;
}

.btn[aria-disabled='true']:hover,
.btn[aria-disabled='true']:active {
  background: transparent;
}

.flee.chosen[aria-disabled='true']:hover,
.flee.chosen[aria-disabled='true']:active {
  background: color-mix(in srgb, var(--color-health) 24%, var(--color-surface));
}

/* The two-row form: chip, Ready and Flee, then the timer across the full width. DOM order is
   unchanged; the grid areas place it. */
.round-row.stacked {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto auto;
  grid-template-areas:
    'chip ready flee'
    'timer timer timer';
  align-items: center;
}

.stacked .choice-chip {
  grid-area: chip;
  justify-self: start;
  max-width: 100%;
}

.stacked .timer {
  grid-area: timer;
}

.stacked .ready {
  grid-area: ready;
}

.stacked .flee {
  grid-area: flee;
}

.round-row.mobile .ready,
.round-row.mobile .flee {
  min-height: 44px;
}

@media (prefers-reduced-motion: reduce) {
  .fill {
    transition: none;
  }

  .spinner {
    animation: none;
  }
}
</style>
