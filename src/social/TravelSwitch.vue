<script setup lang="ts">
import { computed, inject, useId } from 'vue';
import { PhFootprints } from '@phosphor-icons/vue';
import { CONSOLE_KEY, GAME_KEY, createInertConsole, createInertGame } from '../game/context';
import { createActionRunner } from '../ledger/actionRunner';
import { createPartyActions } from './partyActions';

// The "Travel with leader" switch (51.1-UI-SPEC "Travel with Leader"). Members only (not the
// leader, not solo), out of combat, and only once your group member row and the leader's character
// row have applied. It is self-contained (it injects the hub and builds its own action runner and
// party actions) because the rail and the mobile Party sheet host it with identical behaviour.
//
// aria-checked follows the subscribed member row: there is no optimistic flip. The switch is inert
// while its call is pending and aria-disabled while offline. The leader name is server text and is
// rendered as a text node only.
const props = withDefaults(defineProps<{ variant?: 'rail' | 'sheet' }>(), { variant: 'rail' });

const game = inject(GAME_KEY, createInertGame());
const consoleApi = inject(CONSOLE_KEY, createInertConsole());
const runner = createActionRunner({ online: game.connected });
const actions = createPartyActions({ game, consoleApi, runner });

const subId = useId();

const myRow = computed(() => {
  const id = game.characterId.value;
  if (id === null) return null;
  return game.groupMembers.value.find((row) => row.characterId === id) ?? null;
});

const leaderName = computed(() => {
  const group = game.group.value;
  if (group === null) return null;
  const leader = game.knownCharacters.value.find((row) => row.id === group.leaderCharacterId);
  return leader === undefined ? null : leader.name;
});

const visible = computed(() => {
  const group = game.group.value;
  const id = game.characterId.value;
  if (group === null || id === null) return false;
  if (group.leaderCharacterId === id) return false;
  if (game.combat.active.value) return false;
  return myRow.value !== null && leaderName.value !== null;
});

const on = computed(() => myRow.value !== null && myRow.value.followLeader === true);
const offline = computed(() => !game.connected.value);
const pending = computed(() => runner.isPending(actions.keyFor('travel', '')));
const inert = computed(() => offline.value || pending.value);

const subLine = computed(() =>
  on.value ? `On · you move when ${leaderName.value} travels` : `Off · you stay put when ${leaderName.value} travels`,
);

function toggle(): void {
  if (inert.value) return;
  void actions.setTravelWithLeader(!on.value);
}
</script>

<template>
  <button
    v-if="visible"
    type="button"
    role="switch"
    class="travel-switch"
    :class="{ on, sheet: props.variant === 'sheet' }"
    :aria-checked="on ? 'true' : 'false'"
    :aria-describedby="subId"
    :aria-disabled="inert ? 'true' : undefined"
    title="Travel with leader"
    @click="toggle"
  >
    <PhFootprints :size="16" aria-hidden="true" class="icon" />
    <span class="text">
      <span class="title">Travel with leader</span>
      <span :id="subId" class="sub">{{ subLine }}</span>
    </span>
    <span class="track" aria-hidden="true"><span class="knob" /></span>
  </button>
</template>

<style scoped>
.travel-switch {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
  box-sizing: border-box;
  padding: 8px;
  border: 0;
  border-radius: var(--radius-md);
  background: var(--color-surface);
  color: inherit;
  font: inherit;
  text-align: left;
  cursor: pointer;
}

.travel-switch.sheet {
  min-height: 44px;
  padding: 8px 16px;
}

.travel-switch:hover {
  background: var(--color-neutral-800);
}

.travel-switch[aria-disabled='true'] {
  cursor: default;
  opacity: 0.6;
}

.travel-switch[aria-disabled='true']:hover {
  background: var(--color-surface);
}

.travel-switch:focus-visible {
  outline: 2px solid var(--color-accent);
  outline-offset: -2px;
}

.icon {
  flex: none;
  color: var(--color-neutral-500);
}

.on .icon {
  color: var(--color-accent);
}

.text {
  display: flex;
  flex: 1;
  flex-direction: column;
  min-width: 0;
}

.title,
.sub {
  font-size: 12px;
}

.sub {
  color: var(--color-neutral-400);
  overflow-wrap: anywhere;
}

.track {
  position: relative;
  flex: none;
  width: 32px;
  height: 16px;
  border-radius: 8px;
  background: var(--color-neutral-900);
  box-shadow: inset 0 0 0 1px var(--color-neutral-700);
}

.on .track {
  background: var(--color-accent-800);
  box-shadow: inset 0 0 0 1px var(--color-accent);
}

.knob {
  position: absolute;
  top: 2px;
  left: 2px;
  width: 12px;
  height: 12px;
  border-radius: 50%;
  background: var(--color-neutral-500);
  transition: left 120ms;
}

.on .knob {
  left: 18px;
  background: var(--color-accent-200);
}

@media (prefers-reduced-motion: reduce) {
  .knob {
    transition: none;
  }
}
</style>
