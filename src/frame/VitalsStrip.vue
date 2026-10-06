<script setup lang="ts">
import { computed, inject, shallowRef, watch } from 'vue';
import { PhArrowFatUp, PhCrownSimple } from '@phosphor-icons/vue';
import InCombatTag from '../combat/InCombatTag.vue';
import { useDamageFlash } from '../combat/useDamageFlash';
import {
  COMBAT_KEY,
  FRAME_KEY,
  GAME_KEY,
  createInertCombat,
  createInertFrame,
  createInertGame,
} from '../game/context';
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
const controller = inject(COMBAT_KEY, createInertCombat());

// Combat is gated on game.combat.active, never on game.inCombat (Phase 47 pins the inCombat case).
const combatActive = computed(() => game.combat.active.value);

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

// In a fight and in a party the chips become ally targets (48-UI-SPEC "Strip chip row"). Not in a
// party the ally is the player, so there is no You chip and no targeting.
const allyMode = computed(() => combatActive.value && inParty.value);
const selfId = computed(() => game.characterId.value);

function isSelected(id: bigint): boolean {
  return controller.allyTargetId.value === id;
}

function allyLabel(name: string): string {
  return `Target ${name} with your next ability`;
}

// HP damage flash (48-UI-SPEC "Damage flash", CMB-05): the active character's HP only. The key is
// latched so it only moves together with the hp prop (props lag the game refs by a render); a
// character switch then reads as a switch, never as a drop. Same pattern as VitalsRail.
const flashKey = shallowRef<bigint | null>(game.characterId.value);
watch(() => props.hp, () => { flashKey.value = game.characterId.value; }, { flush: 'sync' });
watch(() => game.characterId.value, (id) => { flashKey.value = id; }, { flush: 'pre' });
const { active: flashActive, reduced: flashReduced, delta: flashDelta, ghost: flashGhost } = useDamageFlash({
  hp: () => props.hp,
  maxHp: () => props.maxHp,
  key: () => flashKey.value,
});
const flashClass = computed(() => {
  if (!flashActive.value) return null;
  return flashReduced.value ? 'flash-reduced' : 'flash-motion';
});

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
        <div class="compact-bar" :class="flashClass">
          <div class="track" role="progressbar" aria-label="Health" aria-valuemin="0" :aria-valuenow="Number(props.hp)" :aria-valuemax="Number(props.maxHp)">
            <div class="fill fill-health" :style="{ width: `${barFraction(props.hp, props.maxHp) * 100}%` }"></div>
            <div v-if="flashGhost" class="ghost" aria-hidden="true" :style="{ left: flashGhost.left, width: flashGhost.width }"></div>
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
          <InCombatTag v-if="combatActive" :round-number="game.combat.roundNumber.value" />
          <span v-if="props.levelUp" class="tag tag-outline"><PhArrowFatUp :size="12" aria-hidden="true" />Level up</span>
          <span v-if="props.newSkill" class="tag tag-accent">New skill</span>
        </div>
      </div>
      <div class="bars-block">
        <div class="bars-row">
          <div class="cell" :class="flashClass">
            <span class="readout">
              <span class="micro-label">HP {{ Number(props.hp) }}</span>
              <span v-if="flashDelta !== null" class="delta" aria-hidden="true">−{{ flashDelta }}</span>
            </span>
            <div class="track" role="progressbar" aria-label="Health" aria-valuemin="0" :aria-valuenow="Number(props.hp)" :aria-valuemax="Number(props.maxHp)">
              <div class="fill fill-health" :style="{ width: `${barFraction(props.hp, props.maxHp) * 100}%` }"></div>
              <div v-if="flashGhost" class="ghost" aria-hidden="true" :style="{ left: flashGhost.left, width: flashGhost.width }"></div>
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
      <div v-if="showChipRow" class="chip-row" :class="{ 'ally-row': allyMode }">
        <template v-if="allyMode">
          <span class="tag tag-neutral party-chip party-count">
            <PhCrownSimple v-if="leader" class="crown" weight="fill" :size="12" aria-hidden="true" />Party {{ size }}
          </span>
          <button
            v-if="selfId !== null"
            type="button"
            class="tag tag-neutral ally-chip"
            :class="{ selected: isSelected(selfId) }"
            :aria-pressed="isSelected(selfId) ? 'true' : 'false'"
            :aria-label="allyLabel('You')"
            @click="controller.selectAlly(selfId)"
          >
            <span class="chip-label">You</span>
          </button>
          <template v-for="member in members" :key="String(member.id)">
            <button
              v-if="member.known"
              type="button"
              class="tag tag-neutral ally-chip"
              :class="{ selected: isSelected(member.id) }"
              :title="member.name"
              :aria-pressed="isSelected(member.id) ? 'true' : 'false'"
              :aria-label="allyLabel(member.name)"
              @click="controller.selectAlly(member.id)"
            >
              <span class="chip-label">{{ memberChipText(member) }}</span>
            </button>
            <span v-else class="tag tag-neutral member-chip unknown">
              <span class="chip-label">{{ memberChipText(member) }}</span>
            </span>
          </template>
        </template>
        <template v-else>
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
        </template>
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

/* One tag row high: the In combat tag comes first, so when space runs out Level up and New skill
   wrap away first (clipped); the name never wraps. */
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
  position: relative;
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

/* HP damage flash (48-UI-SPEC "Damage flash"), mirrors the vitals rail. The reduced-motion path is
   a timed static class that declares no motion in these rules. */
.readout {
  display: inline-flex;
  align-items: baseline;
}

.ghost {
  position: absolute;
  top: 0;
  bottom: 0;
  background: color-mix(in srgb, var(--color-health) 35%, transparent);
}

.delta {
  margin-left: 4px;
  font-size: 10px;
  color: var(--color-con-red);
  font-variant-numeric: tabular-nums;
}

.flash-motion .ghost {
  animation: ghost-fade 600ms ease-out forwards;
}

.flash-motion .fill-health {
  animation: flash-fill 400ms ease-out;
}

.flash-motion .micro-label {
  animation: flash-text 400ms ease-out;
}

@keyframes ghost-fade {
  from {
    opacity: 1;
  }
  to {
    opacity: 0;
  }
}

@keyframes flash-fill {
  from {
    background: var(--color-con-red);
  }
  to {
    background: var(--color-health);
  }
}

@keyframes flash-text {
  from {
    color: var(--color-con-red);
  }
  to {
    color: var(--color-neutral-400);
  }
}

.flash-reduced .fill-health {
  background: var(--color-con-red);
}

.flash-reduced .micro-label {
  color: var(--color-con-red);
}

@media (prefers-reduced-motion: reduce) {
  .flash-motion .ghost,
  .flash-motion .fill-health,
  .flash-motion .micro-label {
    animation: none;
  }
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

/* Ally targeting: the chips need a 44px tall hit area without moving layout. The scroller clips, so
   the row gets equal padding and negative margin to hold the slop; it never scrolls vertically. */
.chip-row.ally-row {
  padding: 8px 0;
  margin: calc(-1 * 8px) 0;
  overflow-y: hidden;
}

.party-chip,
.member-chip,
.ally-chip {
  gap: 4px;
  border: 0;
  font-family: inherit;
  white-space: nowrap;
  cursor: pointer;
}

/* Plain text in combat: the Social sheet is unreachable and an unknown member is not a target. */
.party-count,
.member-chip.unknown {
  cursor: default;
}

@media (hover: hover) {
  .party-chip:not(.party-count):hover,
  .member-chip:not(.unknown):hover,
  .ally-chip:hover {
    background: color-mix(in srgb, var(--color-text) 7%, var(--color-neutral-800));
  }
}

.party-chip:not(.party-count):active,
.member-chip:not(.unknown):active,
.ally-chip:active {
  background: color-mix(in srgb, var(--color-text) 14%, var(--color-neutral-800));
}

.ally-chip {
  position: relative;
}

.ally-chip::after {
  content: '';
  position: absolute;
  left: 0;
  right: 0;
  top: 50%;
  height: 44px;
  transform: translateY(-50%);
}

.ally-chip.selected {
  box-shadow: inset 0 0 0 1px var(--color-accent);
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
