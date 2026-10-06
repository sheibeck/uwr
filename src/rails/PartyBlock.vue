<script setup lang="ts">
import { computed, inject } from 'vue';
import { PhCrownSimple, PhUserPlus } from '@phosphor-icons/vue';
import { CONSOLE_KEY, GAME_KEY, createInertConsole, createInertGame } from '../game/context';
import { barFraction } from '../frame/vitals';
import { partyMembers, partySize } from './party';

// Party header, Invite pre-fill and member cards (47-UI-SPEC "Party block", CON-03).
// Shared by the vitals rail and the Social sheet. Names and classes come from server rows and are
// rendered as text nodes only.
const game = inject(GAME_KEY, createInertGame());
const consoleApi = inject(CONSOLE_KEY, createInertConsole());

const inParty = computed(() => game.group.value !== null);
const size = computed(() => partySize(game.groupMembers.value));
const heading = computed(() => (inParty.value ? `Party · ${size.value}` : 'Party'));
const members = computed(() =>
  partyMembers({
    group: game.group.value,
    members: game.groupMembers.value,
    characters: game.knownCharacters.value,
    selfId: game.characterId.value,
  }),
);

function pct(value: bigint, max: bigint): string {
  return `${barFraction(value, max) * 100}%`;
}

function memberLabel(member: { known: boolean; name: string }): string {
  return member.known ? member.name : 'Member';
}

function invite(): void {
  consoleApi.prefill('invite ');
}
</script>

<template>
  <section class="party" aria-label="Party">
    <div class="party-head">
      <h6>{{ heading }}</h6>
      <button type="button" class="btn btn-ghost invite" @click="invite">
        <PhUserPlus :size="14" aria-hidden="true" />Invite
      </button>
    </div>

    <p v-if="!inParty" class="empty">Not in a party.</p>

    <div v-else class="cards">
      <div v-for="member in members" :key="String(member.id)" class="member" :class="{ unknown: !member.known }">
        <div class="member-row">
          <span class="member-name" :title="memberLabel(member)">{{ memberLabel(member) }}</span>
          <PhCrownSimple v-if="member.isLeader" class="crown" weight="fill" :size="12" aria-label="Party leader" />
          <span class="member-class">{{ member.className }}</span>
          <span v-if="member.known" class="member-level">Lv {{ member.level }}</span>
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
      </div>
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

.member {
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 8px;
  border-radius: var(--radius-md);
  background: var(--color-surface);
  min-width: 0;
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
