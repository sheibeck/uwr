<script setup lang="ts">
import { computed, inject, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import type { AbilityCooldown } from '../module_bindings/types';
import { prefersReducedMotion } from '../console/pinning';
import { COMBAT_KEY, FRAME_KEY, GAME_KEY, createInertCombat, createInertFrame, createInertGame } from '../game/context';
import { roundCooldownView } from '../combat/roundCooldown';
import HotbarSelector from './HotbarSelector.vue';
import {
  abilityIcon,
  activeHotbar,
  cooldownFraction,
  cooldownLabel,
  cooldownRemainingMicros,
  hotbarSlots,
  isUnaffordable,
  orderedHotbars,
  slotAriaLabel,
  slotForKey,
  slotTitle,
} from './hotbar';
import { useCooldownTicker } from './useCooldownTicker';

// The hotbar at the top of the composer (47-UI-SPEC "Hotbar Contract (CON-05)"): ten slots of the
// active hotbar, cooldown sweeps from ability_cooldown, number keys, and the hotbar selector.
// Ability names and kinds render as text nodes and title attributes only.
const game = inject(GAME_KEY, createInertGame());
const frame = inject(FRAME_KEY, createInertFrame());
const controller = inject(COMBAT_KEY, createInertCombat());

const FLASH_MS = 240;

const ordered = computed(() => orderedHotbars(game.hotbars.value));
const active = computed(() => activeHotbar(game.hotbars.value));
const activeIndex = computed(() => {
  const current = active.value;
  if (current === null) return 0;
  const index = ordered.value.findIndex((hotbar) => hotbar.id === current.id);
  return index < 0 ? 0 : index;
});
const names = computed(() => ordered.value.map((hotbar) => hotbar.name));
const slots = computed(() => hotbarSlots(active.value, game.hotbarSlots.value, game.abilities.value));
const offline = computed(() => !game.connected.value);
// In combat cooldowns count rounds (CMB-04) and the wall-clock fields are ignored.
const inCombat = computed(() => game.combat.active.value);
// Inert while the round resolves or the player is down (UI-SPEC A25, A21); never out of combat.
const inertNow = computed(() => inCombat.value && (controller.resolving.value || controller.down.value));

// The latest row per ability (the one ending last), for this character's rows only.
const cooldownRows = computed(() => {
  const characterId = game.characterId.value;
  const byAbility = new Map<bigint, AbilityCooldown>();
  for (const row of game.abilityCooldowns.value) {
    if (characterId !== null && row.characterId !== characterId) continue;
    const known = byAbility.get(row.abilityTemplateId);
    if (known === undefined || known.startedAtMicros + known.durationMicros < row.startedAtMicros + row.durationMicros) {
      byAbility.set(row.abilityTemplateId, row);
    }
  }
  return byAbility;
});

// One shared ticker, running only while a slot is cooling. tickNow follows the ticker; anyCooling
// reads tickNow, and a stale value only over-reports cooling (remaining clamps to the duration),
// which starts the ticker and refreshes the value at once.
const tickNow = ref(game.clock.nowMicros());
const anyCooling = computed(() => {
  if (inCombat.value) return false;
  for (const row of cooldownRows.value.values()) {
    if (cooldownRemainingMicros(row, tickNow.value) > 0) return true;
  }
  return false;
});
const ticker = useCooldownTicker({ clock: game.clock, active: anyCooling });
watch(
  ticker.nowMicros,
  (value) => {
    tickNow.value = value;
  },
  { flush: 'sync' },
);

function remainingFor(abilityId: bigint): number {
  return cooldownRemainingMicros(cooldownRows.value.get(abilityId), tickNow.value);
}

const pendingId = ref<bigint | null>(null);
const flashing = ref<ReadonlySet<bigint>>(new Set());
const flashTimers = new Set<ReturnType<typeof setTimeout>>();

interface SlotState {
  slot: number;
  key: string;
  ability: (typeof slots.value)[number]['ability'];
  remaining: number;
  label: string;
  percent: string;
  cooling: boolean;
  unaffordable: boolean;
  pressed: boolean;
  flash: boolean;
  /** The server recorded this ability as the player's choice for the open round. */
  chosen: boolean;
  /** Round resolving or the player down (combat only). */
  inert: boolean;
  /** In-combat rounds text ('2 rounds'); empty out of combat. */
  rounds: string;
  /** The aria-label suffix for the cooldown in combat; empty otherwise. */
  ariaSuffix: string;
}

const slotStates = computed<SlotState[]>(() => {
  const character = game.character.value;
  const combat = inCombat.value;
  const inert = inertNow.value;
  const own = combat ? game.combat.ownAction.value : null;
  return slots.value.map((view) => {
    const ability = view.ability;
    const row = ability === null ? undefined : cooldownRows.value.get(ability.id);
    const common = {
      slot: view.slot,
      key: view.key,
      ability,
      unaffordable: ability !== null && character !== null && isUnaffordable(ability, character),
      pressed: ability !== null && pendingId.value === ability.id,
      flash: ability !== null && flashing.value.has(ability.id),
      // Only the server row marks a choice; the pressed state covers the wait (CMB-06).
      chosen:
        ability !== null &&
        own !== null &&
        own.actionType === 'ability' &&
        own.abilityTemplateId === ability.id,
      inert,
    };
    if (combat && ability !== null) {
      const rounds = roundCooldownView(row, ability);
      return {
        ...common,
        // The rounds count drives the ready flash (rounds reaching 0).
        remaining: Number(rounds.rounds),
        label: rounds.text,
        percent: `${Math.round(rounds.fraction * 1000) / 10}%`,
        cooling: rounds.cooling,
        rounds: rounds.text,
        ariaSuffix: rounds.ariaSuffix,
      };
    }
    const remaining = ability === null ? 0 : remainingFor(ability.id);
    const fraction = row === undefined ? 0 : cooldownFraction(remaining, row.durationMicros);
    return {
      ...common,
      remaining,
      label: cooldownLabel(remaining),
      percent: `${Math.round(fraction * 1000) / 10}%`,
      cooling: remaining > 0,
      rounds: '',
      ariaSuffix: '',
    };
  });
});

// Ready flash: a slot whose remaining time moves from above 0 to 0 gets one 240 ms ring.
// Not added under reduced motion (the stylesheet also drops the animation).
watch(
  () => slotStates.value.map((state) => (state.ability === null ? null : [state.ability.id, state.remaining] as const)),
  (next, previous) => {
    const before = new Map<bigint, number>();
    for (const entry of previous ?? []) {
      if (entry !== null) before.set(entry[0], entry[1]);
    }
    for (const entry of next) {
      if (entry === null) continue;
      const [id, remaining] = entry;
      if (!((before.get(id) ?? 0) > 0 && remaining <= 0)) continue;
      if (prefersReducedMotion()) continue;
      flashing.value = new Set(flashing.value).add(id);
      const timer = setTimeout(() => {
        flashTimers.delete(timer);
        const rest = new Set(flashing.value);
        rest.delete(id);
        flashing.value = rest;
      }, FLASH_MS);
      flashTimers.add(timer);
    }
  },
);

function useSlot(state: SlotState): void {
  const ability = state.ability;
  const reducers = game.reducers.value;
  const characterId = game.characterId.value;
  if (offline.value || ability === null || state.cooling || state.inert) return;
  if (reducers === null || characterId === null) return;
  if (pendingId.value === ability.id) return;
  // In combat a single-ally ability carries the selected ally, only when the server will accept it
  // (allyArgFor omits dead or departed allies). Out of combat the call is unchanged.
  const allyId = inCombat.value ? controller.allyArgFor(ability) : undefined;
  pendingId.value = ability.id;
  void (async () => {
    try {
      await reducers.useAbility({
        characterId,
        abilityTemplateId: ability.id,
        ...(allyId === undefined ? {} : { targetCharacterId: allyId }),
      });
    } catch (error) {
      // The server writes refusals into the feed; nothing is added here.
      console.warn('[hotbar] use_ability failed', error);
    } finally {
      if (pendingId.value === ability.id) pendingId.value = null;
    }
  })();
}

function onSelect(index: number): void {
  const reducers = game.reducers.value;
  const characterId = game.characterId.value;
  const target = ordered.value[index];
  if (offline.value || reducers === null || characterId === null || target === undefined) return;
  void (async () => {
    try {
      await reducers.switchHotbar({ characterId, hotbarName: target.name });
    } catch (error) {
      console.warn('[hotbar] switch_hotbar failed', error);
    }
  })();
}

function isTextField(element: Element | null): boolean {
  if (element === null) return false;
  const tag = element.tagName;
  if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return true;
  if ((element as HTMLElement).isContentEditable === true) return true;
  const editable = element.closest('[contenteditable]');
  return editable !== null && editable.getAttribute('contenteditable') !== 'false';
}

function onDocumentKeydown(event: KeyboardEvent): void {
  if (event.repeat || event.ctrlKey || event.metaKey || event.altKey || event.isComposing) return;
  const slot = slotForKey(event.key);
  if (slot === null) return;
  if (offline.value || frame.activeScreen.value !== null) return;
  if (isTextField(document.activeElement)) return;
  if (event.target instanceof Element && isTextField(event.target)) return;
  const state = slotStates.value[slot - 1];
  if (state === undefined) return;
  useSlot(state);
}

onMounted(() => {
  document.addEventListener('keydown', onDocumentKeydown);
});

onBeforeUnmount(() => {
  document.removeEventListener('keydown', onDocumentKeydown);
  for (const timer of flashTimers) clearTimeout(timer);
  flashTimers.clear();
});

// The sweep: the remaining share shrinks clockwise from full to 0. A custom property is not used
// here because the var() guard only accepts tokens defined by Nocturne or the client tokens.
function sweepBackground(percent: string): string {
  return `conic-gradient(color-mix(in srgb, var(--color-bg) 80%, transparent) ${percent}, transparent 0)`;
}

function blocked(state: SlotState): boolean {
  return offline.value || state.ability === null || state.cooling || state.inert;
}

function label(state: SlotState): string {
  if (state.ability === null) return `Empty slot ${state.slot}`;
  if (!inCombat.value) return slotAriaLabel(state.ability.name, state.slot, state.remaining);
  return `${slotAriaLabel(state.ability.name, state.slot, 0)}${state.ariaSuffix}${state.chosen ? ', chosen' : ''}`;
}
</script>

<template>
  <div class="hotbar-row" :class="{ disconnected: offline }">
    <p v-if="active === null" class="no-hotbar">No hotbar yet.</p>
    <template v-else>
      <HotbarSelector
        :names="names"
        :active-index="activeIndex"
        :desktop="frame.isDesktop.value"
        :disabled="offline"
        @select="onSelect"
      />
      <div class="slot-strip">
        <button
          v-for="state in slotStates"
          :key="state.slot"
          type="button"
          class="slot"
          :class="{
            empty: state.ability === null,
            cooling: state.cooling,
            pressed: state.pressed,
            chosen: state.chosen,
            inert: state.inert,
            'ready-flash': state.flash,
          }"
          :aria-disabled="blocked(state) ? 'true' : undefined"
          :aria-pressed="state.chosen ? 'true' : undefined"
          :aria-label="label(state)"
          :title="state.ability === null ? undefined : slotTitle(state.ability)"
          @click="useSlot(state)"
        >
          <span class="slot-key" aria-hidden="true">{{ state.key }}</span>
          <template v-if="state.ability !== null">
            <component
              :is="abilityIcon(state.ability.kind)"
              class="slot-icon"
              :class="{ unaffordable: state.unaffordable, dim: state.cooling }"
              :size="20"
              aria-hidden="true"
            />
            <span class="slot-name" :class="{ dim: state.cooling }">{{ state.ability.name }}</span>
          </template>
          <span v-if="state.cooling" class="sweep" :data-percent="state.percent" :style="{ background: sweepBackground(state.percent) }" aria-hidden="true"></span>
          <span v-if="state.cooling && inCombat" class="slot-rounds" aria-hidden="true">{{ state.rounds }}</span>
          <span v-else-if="state.cooling" class="slot-seconds" aria-hidden="true">{{ state.label }}</span>
        </button>
      </div>
    </template>
  </div>
</template>

<style scoped>
.hotbar-row {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  min-height: 52px;
  min-width: 0;
}

.no-hotbar {
  margin: 0;
  display: flex;
  align-items: center;
  height: 52px;
  font-size: 12px;
  color: var(--color-neutral-500);
}

.slot-strip {
  flex: 1;
  min-width: 0;
  display: flex;
  gap: 4px;
  overflow-x: auto;
  overflow-y: hidden;
}

.slot {
  position: relative;
  flex: none;
  width: 52px;
  height: 52px;
  padding: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 4px;
  overflow: hidden;
  cursor: pointer;
  font: inherit;
  color: inherit;
  background: var(--color-surface);
  border: 0;
  border-radius: var(--radius-md);
  box-shadow: inset 0 0 0 1px var(--color-neutral-800);
}

.slot:hover {
  box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--color-accent) 40%, transparent);
}

.slot.pressed,
.slot:active:not([aria-disabled='true']) {
  background: color-mix(in srgb, var(--color-accent) 18%, var(--color-surface));
  box-shadow: inset 0 0 0 1px var(--color-accent);
}

.slot.chosen,
.slot.chosen:hover {
  background: color-mix(in srgb, var(--color-accent) 16%, var(--color-surface));
  box-shadow:
    inset 0 0 0 1px var(--color-accent),
    0 0 12px color-mix(in srgb, var(--color-accent) 35%, transparent);
}

.slot:focus-visible {
  outline: 2px solid var(--color-accent);
  outline-offset: -2px;
}

.slot[aria-disabled='true'] {
  cursor: default;
}

.slot.empty {
  background: color-mix(in srgb, var(--color-surface) 50%, transparent);
}

.slot-key {
  position: absolute;
  top: 4px;
  left: 8px;
  font-size: 10px;
  color: var(--color-neutral-500);
}

.slot-icon {
  flex: none;
  color: var(--color-accent-300);
}

.slot-name {
  max-width: 48px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 10px;
  color: var(--color-neutral-400);
}

.slot-icon.dim,
.slot-icon.unaffordable,
.slot-name.dim {
  color: var(--color-neutral-600);
}

.sweep {
  position: absolute;
  inset: 0;
  pointer-events: none;
}

.slot-seconds {
  position: absolute;
  top: 4px;
  right: 4px;
  font-size: 10px;
  font-weight: 500;
  font-variant-numeric: tabular-nums;
  color: var(--color-neutral-200);
}

.slot-rounds {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 10px;
  font-weight: 500;
  font-variant-numeric: tabular-nums;
  color: var(--color-neutral-200);
  pointer-events: none;
}

.slot.inert {
  opacity: 0.45;
}

.slot.ready-flash {
  animation: ready-ring 240ms ease-out;
}

@keyframes ready-ring {
  from {
    box-shadow: inset 0 0 0 2px var(--color-accent);
  }
  to {
    box-shadow: inset 0 0 0 1px var(--color-neutral-800);
  }
}

.disconnected .slot {
  opacity: 0.45;
}

@media (max-width: 899px) {
  .slot-strip {
    scrollbar-width: none;
    scroll-snap-type: x proximity;
  }

  .slot {
    scroll-snap-align: start;
  }
}

@media (prefers-reduced-motion: reduce) {
  .slot.ready-flash {
    animation: none;
  }
}
</style>
