<script setup lang="ts">
import { computed, inject, ref, watch } from 'vue';
import { PhHourglassMedium } from '@phosphor-icons/vue';
import { CONSOLE_KEY, GAME_KEY, createInertConsole, createInertGame } from '../game/context';
import { createActionRunner } from '../ledger/actionRunner';
import { aboutMinutes, formatClock } from '../map/travelTimer';
import CharacterName from './CharacterName.vue';
import { createPartyActions } from './partyActions';
import { SOCIAL_KEY, createInertSocial } from './socialContext';

// The outgoing invite list (51.1-UI-SPEC "Outgoing Invites"). The group's leader sees every pending invite
// of the group; an inviter who is not the leader sees only the invites they sent. Hidden in combat
// and when there are none. Each row counts down (display only: the social hub's seconds-left on the
// server clock) and has a visible Cancel invite button. A row leaves only when the server row does;
// at 0:00 it reads Expired and its Cancel invite is aria-disabled.
//
// Focus after a cancel: the cancelled invite is remembered with its index; when the row is gone,
// focus goes to the Cancel invite now at that index (the next row), else focusHeading is emitted
// so the host focuses its Party heading. Names are server text, text nodes only.
const props = withDefaults(defineProps<{ variant?: 'rail' | 'sheet' }>(), { variant: 'rail' });
const emit = defineEmits<{ focusHeading: [] }>();

const game = inject(GAME_KEY, createInertGame());
const social = inject(SOCIAL_KEY, createInertSocial());
const consoleApi = inject(CONSOLE_KEY, createInertConsole());
const runner = createActionRunner({ online: game.connected });
const actions = createPartyActions({ game, consoleApi, runner });

const sectionEl = ref<HTMLElement | null>(null);

const rows = computed(() => {
  const id = game.characterId.value;
  const group = game.group.value;
  const leads = group !== null && id !== null && group.leaderCharacterId === id;
  return social.outgoingInvites.value
    .filter((row) => leads || (id !== null && row.fromCharacterId === id))
    .sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
});

const visible = computed(() => !game.combat.active.value && rows.value.length > 0);

const views = computed(() =>
  rows.value.map((row) => {
    const character = social.characterById(row.toCharacterId);
    const seconds = social.inviteSecondsLeft(row);
    return {
      id: row.id,
      key: String(row.id),
      name: character === null ? null : character.name,
      shown: character === null ? 'Player' : character.name,
      expired: seconds <= 0,
      clock: formatClock(seconds),
      sr: `Expires in ${aboutMinutes(seconds)}`,
    };
  }),
);

const offline = computed(() => !game.connected.value);

function inert(view: { name: string | null; expired: boolean }): boolean {
  if (offline.value || view.name === null || view.expired) return true;
  return runner.isPending(actions.keyFor('cancelInvite', view.name));
}

let cancelled: { id: bigint; index: number } | null = null;

async function cancel(view: { id: bigint; name: string | null; expired: boolean }, index: number): Promise<void> {
  if (view.name === null || inert(view)) return;
  // Remembered before the call: the server row can go before the reducer promise settles.
  cancelled = { id: view.id, index };
  const ok = await actions.cancelInvite(view.name);
  if (!ok && cancelled !== null && cancelled.id === view.id) cancelled = null;
}

watch(
  rows,
  (list) => {
    const mark = cancelled;
    if (mark === null || list.some((row) => row.id === mark.id)) return;
    cancelled = null;
    // Do not take focus from something else the player moved to meanwhile.
    const active = document.activeElement;
    const section = sectionEl.value;
    const free = active === null || active === document.body || (section !== null && section.contains(active));
    if (!free) return;
    const buttons = section === null ? [] : section.querySelectorAll<HTMLElement>('button.cancel');
    const next = buttons[mark.index];
    if (next !== undefined) next.focus();
    else emit('focusHeading');
  },
  { flush: 'post' },
);
</script>

<template>
  <section v-if="visible" ref="sectionEl" class="outgoing">
    <h6>Invited · waiting</h6>
    <ul class="rows" :class="{ sheet: props.variant === 'sheet' }">
      <li v-for="(view, index) in views" :key="view.key" class="row">
        <PhHourglassMedium :size="12" class="hourglass" aria-hidden="true" />
        <CharacterName :name="view.shown" class="who" />
        <span v-if="view.expired" class="timer expired">Expired</span>
        <template v-else>
          <span class="timer" aria-hidden="true">{{ view.clock }}</span>
          <span class="sr-only">{{ view.sr }}</span>
        </template>
        <button
          type="button"
          class="btn btn-ghost cancel"
          :aria-label="`Cancel invite to ${view.shown}`"
          :aria-disabled="inert(view) ? 'true' : undefined"
          @click="cancel(view, index)"
        >
          Cancel invite
        </button>
      </li>
    </ul>
  </section>
</template>

<style scoped>
.outgoing {
  display: flex;
  flex-direction: column;
  gap: 8px;
  min-width: 0;
}

.outgoing h6 {
  margin: 0;
  color: var(--color-neutral-400);
}

.rows {
  display: flex;
  flex-direction: column;
  gap: 4px;
  margin: 0;
  padding: 0;
  list-style: none;
}

.row {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
  padding: 4px 8px;
  border-radius: var(--radius-md);
  box-shadow: inset 0 0 0 1px var(--color-neutral-800);
  overflow-wrap: anywhere;
}

.sheet .row {
  min-height: 44px;
  padding: 8px 16px;
}

.hourglass {
  flex: none;
  color: var(--color-accent-300);
}

.who {
  flex: 1;
  min-width: 0;
  font-size: 12px;
}

.timer {
  flex: none;
  font-size: 10px;
  color: var(--color-neutral-500);
  font-variant-numeric: tabular-nums;
}

.cancel {
  flex: none;
  min-height: 28px;
  padding: 4px 8px;
  font-size: 12px;
}

.sheet .cancel {
  min-height: 44px;
}

.cancel[aria-disabled='true'] {
  opacity: 0.45;
  cursor: default;
}

.cancel[aria-disabled='true']:hover,
.cancel[aria-disabled='true']:active {
  background: transparent;
}

.cancel:focus-visible {
  outline: 2px solid var(--color-accent);
  outline-offset: 2px;
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
