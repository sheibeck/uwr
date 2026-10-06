<script setup lang="ts">
import { computed, inject } from 'vue';
import { PhArrowFatUp, PhCrownSimple } from '@phosphor-icons/vue';
import { FRAME_KEY, GAME_KEY, createInertFrame, createInertGame } from '../game/context';
import EffectChips from '../rails/EffectChips.vue';
import { effectViews } from '../rails/effects';
import { isPartyLeader, partyMembers, partySize } from '../rails/party';
import { xpProgress } from '../rails/xp';
import { barFraction } from './vitals';

const props = defineProps<{
  name: string;
  avatarInitial: string;
  classLine: string;
  hp: bigint;
  maxHp: bigint;
  mana: bigint;
  maxMana: bigint;
  stamina: bigint;
  maxStamina: bigint;
  levelUp: boolean;
  newSkill: boolean;
  compact?: boolean;
}>();

const game = inject(GAME_KEY, createInertGame());
const frame = inject(FRAME_KEY, createInertFrame());

const xp = computed(() => {
  const c = game.character.value;
  if (c === null) return { value: 0, need: 0, fraction: 0, text: '0 / 0' };
  return xpProgress(c);
});
const xpTitle = computed(() => (xp.value.text === 'Max level' ? 'XP Max level' : `XP ${xp.value.text}`));
const effects = computed(() => effectViews(game.effects.value, game.characterId.value, game.inCombat.value));
const leader = computed(() => isPartyLeader(game.group.value, game.characterId.value));
const inParty = computed(() => game.group.value !== null);
const size = computed(() => partySize(game.groupMembers.value));
const members = computed(() =>
  partyMembers({
    group: game.group.value,
    members: game.groupMembers.value,
    characters: game.knownCharacters.value,
    selfId: game.characterId.value,
  }),
);
const showChipRow = computed(() => inParty.value || effects.value.length > 0);

function memberChipText(member: { known: boolean; name: string; healthPercent: number }): string {
  return member.known ? `${member.name} ${member.healthPercent}%` : 'Member';
}

function openSocial(): void {
  frame.openScreen('social');
}
</script>

<template>
  <section class="vitals-strip" aria-label="Vitals">
    <template v-if="props.compact">
      <div class="compact-row">
        <div class="name" :title="props.name">{{ props.name }}</div>
        <div class="compact-bar">
          <div class="track" role="progressbar" aria-label="Health" aria-valuemin="0" :aria-valuenow="Number(props.hp)" :aria-valuemax="Number(props.maxHp)">
            <div class="fill fill-health" :style="{ width: `${barFraction(props.hp, props.maxHp) * 100}%` }"></div>
          </div>
        </div>
        <div class="compact-bar">
          <div class="track" role="progressbar" aria-label="Mana" aria-valuemin="0" :aria-valuenow="Number(props.mana)" :aria-valuemax="Number(props.maxMana)">
            <div class="fill fill-mana" :style="{ width: `${barFraction(props.mana, props.maxMana) * 100}%` }"></div>
          </div>
        </div>
      </div>
    </template>
    <template v-else>
      <div class="identity-row">
        <div class="avatar" aria-hidden="true">{{ props.avatarInitial }}</div>
        <div class="identity-text">
          <div class="name-row">
            <div class="name" :title="props.name">{{ props.name }}</div>
            <PhCrownSimple v-if="leader" class="crown" weight="fill" :size="12" aria-label="Party leader" />
          </div>
          <div class="class-line">{{ props.classLine }}</div>
        </div>
        <div class="tags">
          <span v-if="props.levelUp" class="tag tag-outline"><PhArrowFatUp :size="12" aria-hidden="true" />Level up</span>
          <span v-if="props.newSkill" class="tag tag-accent">New skill</span>
        </div>
      </div>
      <div class="bars-block">
        <div class="bars-row">
          <div class="cell">
            <span class="micro-label">HP {{ Number(props.hp) }}</span>
            <div class="track" role="progressbar" aria-label="Health" aria-valuemin="0" :aria-valuenow="Number(props.hp)" :aria-valuemax="Number(props.maxHp)">
              <div class="fill fill-health" :style="{ width: `${barFraction(props.hp, props.maxHp) * 100}%` }"></div>
            </div>
          </div>
          <div class="cell">
            <span class="micro-label">MP {{ Number(props.mana) }}</span>
            <div class="track" role="progressbar" aria-label="Mana" aria-valuemin="0" :aria-valuenow="Number(props.mana)" :aria-valuemax="Number(props.maxMana)">
              <div class="fill fill-mana" :style="{ width: `${barFraction(props.mana, props.maxMana) * 100}%` }"></div>
            </div>
          </div>
          <div class="cell">
            <span class="micro-label">SP {{ Number(props.stamina) }}</span>
            <div class="track" role="progressbar" aria-label="Stamina" aria-valuemin="0" :aria-valuenow="Number(props.stamina)" :aria-valuemax="Number(props.maxStamina)">
              <div class="fill fill-stamina" :style="{ width: `${barFraction(props.stamina, props.maxStamina) * 100}%` }"></div>
            </div>
          </div>
        </div>
        <div
          class="xp-line"
          role="progressbar"
          aria-label="Experience"
          :title="xpTitle"
          aria-valuemin="0"
          :aria-valuenow="xp.value"
          :aria-valuemax="xp.need"
        >
          <div class="xp-fill" :style="{ width: `${xp.fraction * 100}%` }"></div>
        </div>
      </div>
      <div v-if="showChipRow" class="chip-row">
        <button v-if="inParty" type="button" class="tag tag-neutral party-chip" @click="openSocial">
          <PhCrownSimple v-if="leader" class="crown" weight="fill" :size="12" aria-hidden="true" />Party {{ size }}
        </button>
        <button
          v-for="member in members"
          :key="String(member.id)"
          type="button"
          class="tag tag-neutral member-chip"
          :title="member.name"
          @click="openSocial"
        >
          <span class="chip-label">{{ memberChipText(member) }}</span>
        </button>
        <EffectChips :effects="effects" nowrap />
      </div>
    </template>
  </section>
</template>

<style scoped>
.vitals-strip {
  padding: 16px 16px 8px;
  display: flex;
  flex-direction: column;
  gap: 8px;
  background: color-mix(in srgb, var(--color-surface) 55%, transparent);
}

.identity-row {
  display: flex;
  align-items: center;
  gap: 8px;
}

.avatar {
  width: 36px;
  height: 36px;
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: var(--radius-md);
  background: var(--color-accent-900);
  box-shadow: inset 0 0 0 1px var(--color-accent-700);
  color: var(--color-accent-300);
  font-size: 20px;
  font-weight: 500;
}

.identity-text {
  min-width: 0;
  flex: 1 1 auto;
}

.name-row {
  display: flex;
  align-items: center;
  gap: 4px;
  min-width: 0;
}

.crown {
  flex-shrink: 0;
  color: var(--color-accent);
}

.name {
  font-size: 14px;
  font-weight: 500;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  min-width: 0;
}

.class-line {
  font-size: 12px;
  color: var(--color-neutral-400);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

/* One tag row high: when space runs out the New skill tag wraps away first (clipped), the name never wraps. */
.tags {
  margin-left: auto;
  flex: 0 1 auto;
  display: flex;
  flex-wrap: wrap;
  justify-content: flex-end;
  align-items: center;
  gap: 4px;
  overflow: hidden;
  max-height: 24px;
}

.tags .tag {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  white-space: nowrap;
}

.bars-row {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 8px;
}

.cell {
  display: flex;
  flex-direction: column;
  gap: 4px;
  min-width: 0;
}

.micro-label {
  font-size: 10px;
  color: var(--color-neutral-400);
  font-variant-numeric: tabular-nums;
}

.track {
  height: 4px;
  border-radius: var(--radius-sm);
  background: var(--color-neutral-900);
  overflow: hidden;
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

.bars-block {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.xp-line {
  height: 2px;
  border-radius: var(--radius-sm);
  background: var(--color-neutral-900);
  overflow: hidden;
}

.xp-fill {
  height: 100%;
  background: var(--color-accent);
}

/* One line that scrolls sideways; chips never wrap. */
.chip-row {
  display: flex;
  align-items: center;
  gap: 8px;
  overflow-x: auto;
  scrollbar-width: none;
}

.chip-row::-webkit-scrollbar {
  display: none;
}

.chip-row > .tag,
.chip-row > :deep(.effect-chips) {
  flex-shrink: 0;
}

.party-chip,
.member-chip {
  gap: 4px;
  border: 0;
  font-family: inherit;
  white-space: nowrap;
  cursor: pointer;
}

@media (hover: hover) {
  .party-chip:hover,
  .member-chip:hover {
    background: color-mix(in srgb, var(--color-text) 7%, var(--color-neutral-800));
  }
}

.party-chip:active,
.member-chip:active {
  background: color-mix(in srgb, var(--color-text) 14%, var(--color-neutral-800));
}

.compact-row {
  display: flex;
  align-items: center;
  gap: 8px;
}

.compact-row .name {
  flex: 0 1 auto;
  max-width: 50%;
}

.compact-bar {
  flex: 1;
  min-width: 0;
}
</style>
