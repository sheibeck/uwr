<script setup lang="ts">
import { computed, inject, ref } from 'vue';
import { PhCrownSimple, PhFootprints, PhUserPlus, PhWarningCircle } from '@phosphor-icons/vue';
import { MAX_GROUP_SIZE } from '@game-data/group_config';
import {
  COMBAT_KEY,
  CONSOLE_KEY,
  GAME_KEY,
  createInertCombat,
  createInertConsole,
  createInertGame,
} from '../game/context';
import { barFraction } from '../frame/vitals';
import { isPartyLeader, partyMembers, partySize, selfCardView } from './party';
import type { PartyMemberView } from './party';
import { partyTravelView } from '../social/follow';
import type { FollowState } from '../social/follow';
import { SOCIAL_KEY, createInertSocial } from '../social/socialContext';
import InviteCard from '../social/InviteCard.vue';
import MemberCard from '../social/MemberCard.vue';
import OutgoingInvites from '../social/OutgoingInvites.vue';
import PetRow from '../social/PetRow.vue';

// Party header, Invite and member cards (47-UI-SPEC "Party block", CON-03), the vitals rail's party
// area. Names and classes come from server rows and are rendered as text nodes only.
//
// Out of a party fight this is the 51.1 recipe (51.1-UI-SPEC "Vitals Rail Party Block", out of
// combat, items 3-11): the header with the gated Invite, the follow summary, the stamina warning,
// one MemberCard per other member each followed by its pet row, 'Not in a party.' when solo,
// 'Loot: personal', Invited · waiting and the incoming invite card.
//
// In a fight (game.combat.active) and in a party the cards become ally-target buttons and a 'You'
// card comes first (48-UI-SPEC "Ally targeting", CMB-05). Plan 51.1-14 replaces that branch.
const game = inject(GAME_KEY, createInertGame());
const consoleApi = inject(CONSOLE_KEY, createInertConsole());
const controller = inject(COMBAT_KEY, createInertCombat());
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

const outOfCombat = computed(() => !game.combat.active.value);
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

const combatParty = computed(() => game.combat.active.value && inParty.value);
const cards = computed(() => {
  if (!combatParty.value) return members.value;
  const self = game.character.value;
  if (self === null) return members.value;
  return [selfCardView(self, isPartyLeader(game.group.value, self.id)), ...members.value];
});

function interactive(member: { known: boolean }): boolean {
  return combatParty.value && member.known;
}

function selected(member: { id: bigint }): boolean {
  return controller.allyTargetId.value === member.id;
}

// Stamina text for a known member out of combat (51-UI-SPEC "Party Stamina in the Vitals Rail").
// The low mark means the member cannot afford even a within-region trip; the rule lives in
// @game-data/travel_config and party.ts applies it.
function staminaText(member: { stamina: bigint; maxStamina: bigint }): string {
  return `Stamina ${member.stamina} of ${member.maxStamina}`;
}

function staminaScreenText(member: { stamina: bigint; maxStamina: bigint; lowStamina: boolean }): string {
  return member.lowStamina ? `${staminaText(member)}, too low to travel` : staminaText(member);
}

function pct(value: bigint, max: bigint): string {
  return `${barFraction(value, max) * 100}%`;
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
    <div class="party-head">
      <h6 ref="headingEl" tabindex="-1">{{ heading }}</h6>
      <span v-if="combatParty" class="hint">Click to target</span>
      <button
        v-else
        type="button"
        class="btn btn-ghost invite"
        :aria-disabled="inviteReason !== null ? 'true' : undefined"
        :title="inviteReason ?? undefined"
        @click="invite"
      >
        <PhUserPlus :size="14" aria-hidden="true" />Invite<span v-if="inviteReason !== null" class="sr-only">{{
          inviteReason
        }}</span>
      </button>
    </div>

    <template v-if="!combatParty">
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
      <InviteCard variant="rail" @answered="focusHeading" />
    </template>

    <div v-else class="cards">
      <component
        :is="interactive(member) ? 'button' : 'div'"
        v-for="member in cards"
        :key="String(member.id)"
        class="member"
        :class="{ unknown: !member.known, ally: interactive(member), selected: interactive(member) && selected(member) }"
        :type="interactive(member) ? 'button' : undefined"
        :aria-pressed="interactive(member) ? (selected(member) ? 'true' : 'false') : undefined"
        :aria-label="interactive(member) ? `Target ${member.name} with your next ability` : undefined"
        @click="interactive(member) ? controller.selectAlly(member.id) : undefined"
      >
        <div class="member-row">
          <span class="member-name" :title="memberLabel(member)">{{ memberLabel(member) }}</span>
          <PhCrownSimple v-if="member.isLeader" class="crown" weight="fill" :size="12" aria-label="Party leader" />
          <span class="member-class">{{ member.className }}</span>
          <span v-if="interactive(member)" class="member-hp">{{ member.hp }}/{{ member.maxHp }}</span>
          <span v-else-if="member.known" class="member-level" :title="staminaText(member)"
            >Lv {{ member.level }}<span class="member-stamina" :class="{ low: member.lowStamina }" aria-hidden="true"
              >{{ ' · ' }}<PhWarningCircle v-if="member.lowStamina" class="low-icon" :size="12" />{{
                `${member.stamina} st`
              }}</span
            ></span
          >
          <span v-if="!interactive(member) && member.known" class="sr-only">{{ staminaScreenText(member) }}</span>
        </div>
        <div
          class="track health-track"
          role="progressbar"
          :aria-label="`${memberLabel(member)} health ${member.hp} of ${member.maxHp}`"
          aria-valuemin="0"
          :aria-valuenow="Number(member.hp)"
          :aria-valuemax="Number(member.maxHp)"
        >
          <div class="fill fill-health" :style="{ width: pct(member.hp, member.maxHp) }"></div>
        </div>
        <div
          class="track resource-track"
          role="progressbar"
          :aria-label="`${memberLabel(member)} ${member.resourceKind} ${member.resource} of ${member.maxResource}`"
          aria-valuemin="0"
          :aria-valuenow="Number(member.resource)"
          :aria-valuemax="Number(member.maxResource)"
        >
          <div
            class="fill"
            :class="member.resourceKind === 'mana' ? 'fill-mana' : 'fill-stamina'"
            :style="{ width: pct(member.resource, member.maxResource) }"
          ></div>
        </div>
      </component>
    </div>
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

.hint {
  font-size: 10px;
  color: var(--color-neutral-500);
  white-space: nowrap;
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

.member {
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 8px;
  border-radius: var(--radius-md);
  background: var(--color-surface);
  min-width: 0;
}

.member.ally {
  width: 100%;
  box-sizing: border-box;
  border: 0;
  font: inherit;
  color: inherit;
  text-align: left;
  cursor: pointer;
}

.member.ally:hover {
  background: color-mix(in srgb, var(--color-text) 7%, var(--color-surface));
}

.member.ally:active {
  background: color-mix(in srgb, var(--color-text) 14%, var(--color-surface));
}

.member.ally:focus-visible {
  outline: 2px solid var(--color-accent);
  outline-offset: -2px;
}

.member.ally.selected {
  box-shadow:
    inset 0 0 0 1px var(--color-accent),
    0 0 12px color-mix(in srgb, var(--color-accent) 30%, transparent);
}

.member.unknown {
  opacity: 0.6;
}

.member-row {
  display: flex;
  align-items: center;
  gap: 4px;
  min-width: 0;
}

.member-name {
  min-width: 0;
  font-size: 12px;
  font-weight: 500;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.crown {
  flex-shrink: 0;
  color: var(--color-accent);
}

.member-class {
  flex-shrink: 0;
  font-size: 10px;
  color: var(--color-neutral-500);
  white-space: nowrap;
}

.member-level {
  flex-shrink: 0;
  margin-left: auto;
  font-size: 10px;
  color: var(--color-neutral-400);
  white-space: nowrap;
}

.member-stamina {
  font-variant-numeric: tabular-nums;
}

.member-stamina.low {
  color: var(--color-con-red);
}

.low-icon {
  margin-right: 4px;
  vertical-align: text-bottom;
}

.sr-only {
  position: absolute;
  width: 1px;
  height: 1px;
  overflow: hidden;
  clip-path: inset(50%);
  white-space: nowrap;
}

.member-hp {
  flex-shrink: 0;
  margin-left: auto;
  font-size: 12px;
  color: var(--color-neutral-400);
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
}

.track {
  border-radius: var(--radius-sm);
  background: var(--color-neutral-900);
  overflow: hidden;
}

.health-track {
  height: 4px;
}

.resource-track {
  height: 3px;
}

.fill {
  height: 100%;
}

.fill-health {
  background: var(--color-health);
}

.fill-mana {
  background: var(--color-mana);
}

.fill-stamina {
  background: var(--color-stamina);
}
</style>
