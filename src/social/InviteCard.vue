<script setup lang="ts">
import { computed, inject, ref, watch } from 'vue';
import { PhCrownSimple, PhFootprints, PhUsersThree } from '@phosphor-icons/vue';
import { CONSOLE_KEY, GAME_KEY, createInertConsole, createInertGame } from '../game/context';
import { keepFocus } from '../ledger/keepFocus';
import { aboutMinutes, formatClock } from '../map/travelTimer';
import CharacterName from './CharacterName.vue';
import { SOCIAL_KEY, createInertSocial } from './socialContext';
import { usePartyActions } from './usePartyActions';

// The incoming invite card (51.1-UI-SPEC "Incoming Invite Card"). While an invite to the active
// character is pending it shows who invited you, who is in that party, how long the invite lasts,
// and Accept / Decline. Accepting is the only way into a party: the client never calls the join
// reducer. The timer is display only (the social hub's seconds-left on the server clock); the
// server removes the row, and at 0:00 the card reads Expired with both buttons aria-disabled.
//
// The polite status region stays mounted (the root is always rendered) so the arrival is heard:
// its text changes only when a new invite id arrives, and it never holds the countdown. Names are
// server text and are rendered as text nodes only.
//
// answered (51.1 reviews client-social WR-03 and IN-02): emitted when the card goes away while focus
// is inside it, whatever removed the row (your Accept or Decline, the expiry tick, the inviter's
// cancel, the group dissolving), so the host moves focus to its Party heading or the composer and it
// never falls to body. A refused answer leaves the card, and focus, where they are.
const props = withDefaults(defineProps<{ variant?: 'rail' | 'mobile' | 'sheet' }>(), { variant: 'rail' });
const emit = defineEmits<{ answered: [] }>();

const game = inject(GAME_KEY, createInertGame());
const social = inject(SOCIAL_KEY, createInertSocial());
const consoleApi = inject(CONSOLE_KEY, createInertConsole());
const { runner, actions } = usePartyActions(game, consoleApi);

const invite = computed(() => social.incomingInvite.value);

const inviterName = computed<string | null>(() => {
  const row = invite.value;
  if (row === null) return null;
  const character = social.characterById(row.fromCharacterId);
  return character === null ? null : character.name;
});

// The card body needs the inviter's name: Accept sends it as fromName.
const shown = computed(() => invite.value !== null && inviterName.value !== null);

const secondsLeft = computed(() => (invite.value === null ? 0 : social.inviteSecondsLeft(invite.value)));
const expired = computed(() => secondsLeft.value <= 0);
const clock = computed(() => formatClock(secondsLeft.value));
const srTimer = computed(() => `Expires in ${aboutMinutes(secondsLeft.value)}`);

function nameOf(characterId: bigint): string {
  const character = social.characterById(characterId);
  return character === null ? 'Player' : character.name;
}

// Chips: the leader (with the crown) first, then the others in join order. Omitted until the
// inviting group's group and member rows have both applied.
const chips = computed(() => {
  const group = social.inviteGroup.value;
  if (!social.inviteGroupApplied.value || group === null) return [];
  const rows = [...social.inviteGroupMembers.value].sort((a, b) => {
    const aLeader = a.characterId === group.leaderCharacterId;
    const bLeader = b.characterId === group.leaderCharacterId;
    if (aLeader !== bLeader) return aLeader ? -1 : 1;
    const joined = a.joinedAt.microsSinceUnixEpoch - b.joinedAt.microsSinceUnixEpoch;
    if (joined !== 0n) return joined < 0n ? -1 : 1;
    return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
  });
  return rows.map((row) => ({
    key: String(row.id),
    name: nameOf(row.characterId),
    leader: row.characterId === group.leaderCharacterId,
  }));
});

// The leader named in the follow line: the inviting group's leader, else the inviter.
const leaderName = computed(() => {
  const group = social.inviteGroup.value;
  if (group !== null && social.inviteGroupApplied.value) {
    const leader = social.characterById(group.leaderCharacterId);
    if (leader !== null) return leader.name;
  }
  return inviterName.value ?? '';
});
const followLine = computed(
  () => `You'll travel with ${leaderName.value} by default. You can turn this off.`,
);

const cardEl = ref<HTMLElement | null>(null);
keepFocus({
  source: shown,
  area: () => cardEl.value,
  capture: () => true,
  restore: () => {
    emit('answered');
    return null;
  },
});

const offline = computed(() => !game.connected.value);
const pending = computed(() => {
  const name = inviterName.value;
  if (name === null) return false;
  return runner.isPending(actions.keyFor('accept', name)) || runner.isPending(actions.keyFor('decline', name));
});
const inert = computed(() => expired.value || offline.value || pending.value);

async function answer(kind: 'accept' | 'decline'): Promise<void> {
  const name = inviterName.value;
  if (name === null || inert.value) return;
  // No emit here: the card leaving (keepFocus above) is what answers, not the promise.
  await (kind === 'accept' ? actions.acceptInvite(name) : actions.declineInvite(name));
}

// The announcement: set once per invite id (once the inviter is known), cleared when the invite goes.
const announcement = ref('');
let announcedId: bigint | null = null;
watch(
  [() => (invite.value === null ? null : invite.value.id), inviterName],
  ([id, name]) => {
    if (id === null) {
      announcedId = null;
      announcement.value = '';
      return;
    }
    if (name === null || announcedId === id) return;
    announcedId = id;
    announcement.value = `Party invite from ${name}.`;
  },
  { immediate: true },
);
</script>

<template>
  <div class="invite-root">
    <span class="sr-only" role="status" aria-live="polite">{{ announcement }}</span>
    <section
      v-if="shown"
      ref="cardEl"
      class="invite-card"
      :class="{ touch: props.variant !== 'rail' }"
      aria-label="Party invite"
    >
      <div class="kicker">
        <PhUsersThree :size="14" class="kicker-icon" aria-hidden="true" />
        <span class="kicker-label">Party invite</span>
        <span v-if="expired" class="timer expired">Expired</span>
        <template v-else>
          <span class="timer" aria-hidden="true">Expires in {{ clock }}</span>
          <span class="sr-only timer-sr">{{ srTimer }}</span>
        </template>
      </div>

      <div class="inviter-line">
        <CharacterName :name="inviterName ?? ''" class="inviter-name" />
        <span class="inviter-rest">{{ ' invites you to join their party.' }}</span>
      </div>

      <div v-if="chips.length > 0" class="chips">
        <span v-for="chip in chips" :key="chip.key" class="tag tag-neutral chip">
          <PhCrownSimple v-if="chip.leader" class="crown" weight="fill" :size="10" role="img" aria-label="Party leader" />
          <CharacterName :name="chip.name" />
        </span>
      </div>

      <div class="follow">
        <PhFootprints :size="12" class="follow-icon" aria-hidden="true" />
        <span class="follow-line">{{ followLine }}</span>
      </div>

      <div class="answers">
        <button
          type="button"
          class="btn btn-primary answer"
          :aria-disabled="inert ? 'true' : undefined"
          @click="answer('accept')"
        >
          Accept
        </button>
        <button
          type="button"
          class="btn btn-secondary answer"
          :aria-disabled="inert ? 'true' : undefined"
          @click="answer('decline')"
        >
          Decline
        </button>
      </div>

      <p class="note">Other players can't invite you until you answer.</p>
    </section>
  </div>
</template>

<style scoped>
/* The root is always mounted for the status region but draws no box, so an absent card leaves no gap. */
.invite-root {
  display: contents;
}

.sr-only {
  position: absolute;
  width: 1px;
  height: 1px;
  overflow: hidden;
  clip-path: inset(50%);
  white-space: nowrap;
}

.invite-card {
  display: flex;
  flex-direction: column;
  gap: 8px;
  box-sizing: border-box;
  min-width: 0;
  padding: 16px;
  border-radius: var(--radius-md);
  background: var(--color-surface);
  box-shadow:
    inset 0 0 0 1px var(--color-accent),
    0 0 16px color-mix(in srgb, var(--color-accent) 22%, transparent);
  overflow-wrap: anywhere;
}

.kicker {
  display: flex;
  align-items: center;
  gap: 8px;
}

.kicker-icon {
  flex: none;
  color: var(--color-accent);
}

.kicker-label {
  flex: 1;
  min-width: 0;
  font-size: 10px;
  font-weight: 500;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  color: var(--color-accent);
}

.timer {
  flex: none;
  font-size: 10px;
  color: var(--color-neutral-500);
  font-variant-numeric: tabular-nums;
}

.inviter-line {
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  min-width: 0;
  font-size: 14px;
  color: var(--color-neutral-400);
}

.inviter-name {
  font-weight: 500;
  color: var(--color-line-whisper);
}

.inviter-rest {
  min-width: 0;
  overflow-wrap: anywhere;
}

.chips {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
}

.chip {
  gap: 4px;
  min-width: 0;
  max-width: 100%;
  padding: 0 4px;
  font-size: 10px;
}

.crown {
  flex: none;
  color: var(--color-accent);
}

.follow {
  display: flex;
  align-items: flex-start;
  gap: 4px;
}

.follow-icon {
  flex: none;
  margin-top: 4px;
  color: var(--color-accent-300);
}

.follow-line {
  min-width: 0;
  font-size: 12px;
  color: var(--color-neutral-400);
  overflow-wrap: anywhere;
}

.answers {
  display: flex;
  gap: 8px;
}

.answer {
  flex: 1;
  min-width: 0;
  min-height: 32px;
}

.touch .answer {
  min-height: 44px;
}

.answer[aria-disabled='true'] {
  opacity: 0.45;
  cursor: default;
}

.answer[aria-disabled='true']:hover,
.answer[aria-disabled='true']:active {
  background: transparent;
}

.answer:focus-visible {
  outline: 2px solid var(--color-accent);
  outline-offset: 2px;
}

.note {
  margin: 0;
  font-size: 10px;
  color: var(--color-neutral-500);
}
</style>
