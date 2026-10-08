<script setup lang="ts">
import { computed, inject, ref } from 'vue';
import { PhFootprints, PhUserPlus, PhWarningCircle } from '@phosphor-icons/vue';
import { MAX_GROUP_SIZE } from '@game-data/group_config';
import { CONSOLE_KEY, GAME_KEY, createInertConsole, createInertGame } from '../game/context';
import { isPartyLeader, partyMembers, partySize } from './party';
import type { PartyMemberView } from './party';
import { partyTravelView } from '../social/follow';
import type { FollowState } from '../social/follow';
import { SOCIAL_KEY, createInertSocial } from '../social/socialContext';
import CombatMemberCard from '../social/CombatMemberCard.vue';
import InviteCard from '../social/InviteCard.vue';
import MemberCard from '../social/MemberCard.vue';
import OutgoingInvites from '../social/OutgoingInvites.vue';
import PetRow from '../social/PetRow.vue';

// Party header, Invite and member cards (47-UI-SPEC "Party block", CON-03), the vitals rail's party
// area. Names and classes come from server rows and are rendered as text nodes only.
//
// Out of a fight this is the 51.1 recipe (51.1-UI-SPEC "Vitals Rail Party Block", out of
// combat, items 3-11): the header with the gated Invite, the follow summary, the stamina warning,
// one MemberCard per other member each followed by its pet row, 'Not in a party.' when solo,
// 'Loot: personal', Invited · waiting and the incoming invite card.
//
// In a fight (game.combat.active) it is the COMBAT3 recipe (51.1-UI-SPEC "Vitals Rail Party Block",
// In combat): no visible header (an .sr-only 'Party · {n}' heading in a party), one CombatMemberCard
// per other member (the ally target button with the ⋯ beside it) each followed by its pet row, and the
// incoming invite card. Invite, the follow summary, the stamina warning, 'Loot: personal' and
// Invited · waiting only matter for travel and hide. Your own target is the vitals rail self block.
const game = inject(GAME_KEY, createInertGame());
const consoleApi = inject(CONSOLE_KEY, createInertConsole());
const social = inject(SOCIAL_KEY, createInertSocial());

const headingEl = ref<HTMLElement | null>(null);
const cardsEl = ref<HTMLElement | null>(null);

const inParty = computed(() => game.group.value !== null);
const size = computed(() => partySize(game.groupMembers.value));
const heading = computed(() => (inParty.value ? `Party · ${size.value}` : 'Party'));
const members = computed(() =>
  partyMembers({
    group: game.group.value,
    members: game.groupMembers.value,
    characters: game.knownCharacters.value,
    selfId: game.characterId.value,
    effects: game.effects.value,
  }),
);

// Every member including you, in partyMembers order (leader first, then joinedAt, then member row
// id). Your own row comes from game.character (listed last so it wins over a stale known row); its
// lowStamina is lowStaminaFor through partyMembers. Without your row you read as unknown, so the
// summary and the warning wait for it.
const everyone = computed<PartyMemberView[]>(() => {
  const self = game.character.value;
  const known = game.knownCharacters.value;
  return partyMembers({
    group: game.group.value,
    members: game.groupMembers.value,
    characters: self === null ? known : [...known, self],
    selfId: null,
    effects: game.effects.value,
  });
});

const travel = computed(() => {
  const group = game.group.value;
  const selfId = game.characterId.value;
  if (group === null || selfId === null) return null;
  const leader = everyone.value.find((member) => member.id === group.leaderCharacterId);
  return partyTravelView({
    selfId,
    leaderId: group.leaderCharacterId,
    leaderName: leader === undefined ? '' : leader.name,
    members: everyone.value,
  });
});

const inCombat = computed(() => game.combat.active.value);
const outOfCombat = computed(() => !inCombat.value);
const summary = computed(() => (outOfCombat.value ? (travel.value?.summary ?? null) : null));
const warning = computed(() => (outOfCombat.value ? (travel.value?.warning ?? null) : null));

// Each member with their pet (one per character), in card order.
const entries = computed(() => members.value.map((member) => ({ member, pet: social.petOf(member.id) })));

function followOf(member:{ id: bigint; known: boolean }): FollowState | null {
  if (!member.known) return null;
  return travel.value?.states.get(member.id) ?? null;
}

// Invite (UI cross-check X4): enabled solo or for the leader with room. The cap counts member rows
// plus the group's live outgoing invites, as the server does (MAX_GROUP_SIZE through @game-data).
const liveInvites = computed(
  () => social.outgoingInvites.value.filter((invite) => social.inviteSecondsLeft(invite) > 0).length,
);
const inviteReason = computed<string | null>(() => {
  const group = game.group.value;
  if (group === null) return null;
  if (!isPartyLeader(group, game.characterId.value)) return 'Only the leader can invite.';
  if (size.value + liveInvites.value >= MAX_GROUP_SIZE) return 'Your party is full.';
  return null;
});

function focusHeading(): void {
  headingEl.value?.focus();
}

// Focus after a member's card goes (UI-SPEC Accessibility "Remove a member"): the next card's ⋯,
// else the Party heading. Runs while the leaving card is still in the DOM and holds focus, so the
// opener now at that index is the one after it.
function menuFallback(): HTMLElement | null {
  const openers = Array.from(cardsEl.value?.querySelectorAll<HTMLElement>('.menu-opener') ?? []);
  const active = document.activeElement;
  const index = openers.findIndex((opener) => opener === active);
  const rest = openers.filter((opener) => opener !== active);
  if (index >= 0 && index < rest.length) return rest[index];
  return headingEl.value;
}

function memberLabel(member: { known: boolean; name: string }): string {
  return member.known ? member.name : 'Member';
}

function invite(): void {
  if (inviteReason.value !== null) return;
  consoleApi.prefill('invite ');
}
</script>

<template>
  <section class="party" aria-label="Party">
    <div v-if="outOfCombat" class="party-head">
      <h6 ref="headingEl" tabindex="-1">{{ heading }}</h6>
      <button
        type="button"
        class="btn btn-ghost invite"
        :aria-disabled="inviteReason !== null ? 'true' : undefined"
        :title="inviteReason ?? undefined"
        @click="invite"
      >
        <PhUserPlus :size="14" aria-hidden="true" />Invite<span v-if="inviteReason !== null" class="sr-only">{{
          ` ${inviteReason}`
        }}</span>
      </button>
    </div>
    <h6 v-else-if="inParty" ref="headingEl" class="sr-only" tabindex="-1">{{ heading }}</h6>

    <template v-if="outOfCombat">
      <p v-if="summary !== null" class="summary">
        <PhFootprints class="line-icon summary-icon" :size="12" aria-hidden="true" /><span>{{ summary }}</span>
      </p>
      <p v-if="warning !== null" class="warning">
        <PhWarningCircle class="line-icon" :size="12" aria-hidden="true" /><span>{{ warning }}</span>
      </p>

      <div v-if="inParty" ref="cardsEl" class="cards">
        <div v-for="entry in entries" :key="String(entry.member.id)" class="member-entry">
          <MemberCard :member="entry.member" :state="followOf(entry.member)" :fallback-focus="menuFallback" />
          <PetRow
            v-if="entry.pet !== null"
            :pet="entry.pet"
            :owner-name="memberLabel(entry.member)"
            :seconds-left="social.petSecondsLeft(entry.pet)"
          />
        </div>
      </div>
      <p v-else class="empty">Not in a party.</p>

      <p v-if="inParty" class="loot" title="Each fighter rolls their own loot.">
        Loot: personal<span class="sr-only">{{ ' ' }}Each fighter rolls their own loot.</span>
      </p>

      <OutgoingInvites variant="rail" @focus-heading="focusHeading" />
    </template>

    <div v-else-if="inParty" ref="cardsEl" class="cards">
      <div v-for="entry in entries" :key="String(entry.member.id)" class="member-entry">
        <CombatMemberCard :member="entry.member" :state="followOf(entry.member)" :fallback-focus="menuFallback" />
        <PetRow
          v-if="entry.pet !== null"
          :pet="entry.pet"
          :owner-name="memberLabel(entry.member)"
          :seconds-left="social.petSecondsLeft(entry.pet)"
        />
      </div>
    </div>

    <InviteCard variant="rail" @answered="focusHeading" />
  </section>
</template>

<style scoped>
.party {
  display: flex;
  flex-direction: column;
  gap: 8px;
  min-width: 0;
}

.party-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}

.party h6 {
  margin: 0;
  color: var(--color-neutral-400);
}

.invite {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 4px 8px;
  font-size: 12px;
}

.empty {
  margin: 0;
  font-size: 12px;
  color: var(--color-neutral-500);
}

.cards {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

/* A card and its pet row: the pet row brings its own 4px top margin and elbow. */
.member-entry {
  display: flex;
  flex-direction: column;
  min-width: 0;
}

/* The follow summary and the stamina warning wrap inside the 252px rail. */
.summary,
.warning {
  display: flex;
  align-items: flex-start;
  gap: 4px;
  margin: 0;
  min-width: 0;
  font-size: 12px;
  overflow-wrap: anywhere;
}

.summary {
  color: var(--color-neutral-400);
}

.summary-icon {
  color: var(--color-accent-300);
}

.warning {
  color: var(--color-con-red);
}

.line-icon {
  flex: none;
  margin-top: 4px;
}

.loot {
  margin: 0;
  font-size: 12px;
  color: var(--color-neutral-500);
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
