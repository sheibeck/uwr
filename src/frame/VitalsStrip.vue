<script setup lang="ts">
import { computed, inject, ref, shallowRef, watch } from 'vue';
import { PhArrowFatUp, PhCrosshairSimple, PhCrownSimple, PhPawPrint } from '@phosphor-icons/vue';
import { STRIP_EFFECT_LIMIT } from '../combat/hostiles';
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
import { isPartyLeader, memberBars, partyMembers, partySize } from '../rails/party';
import { xpProgress } from '../rails/xp';
import CharacterName from '../social/CharacterName.vue';
import PetTag from '../social/PetTag.vue';
import { SOCIAL_KEY, createInertSocial } from '../social/socialContext';
import { keepFocus } from '../ledger/keepFocus';
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
const social = inject(SOCIAL_KEY, createInertSocial());

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

// The self row (51.1-UI-SPEC "Mobile Party in Combat"): in a fight, once your character row exists, the
// avatar, name, crown and class line are one button that targets yourself (client state; the ally
// target defaults to you, so it starts pressed). In a party out of combat you target yourself the same
// way (owner 2026-10-08: tap a party member to target them, everywhere). Solo out of combat, and before
// the row exists, it is the plain Phase 45 markup. Party members are targeted from the grid cards
// below the bars in a fight, and from the member chips out of combat.
const selfTarget = computed(() => (combatActive.value || inParty.value) && game.character.value !== null);
const selfSelected = computed(() => {
  const own = game.character.value;
  return selfTarget.value && own !== null && controller.allyTargetId.value === own.id;
});
const selfLabel = computed(
  () =>
    `Target yourself with your next ability. Health ${props.hp} of ${props.maxHp}, ` +
    `mana ${props.mana} of ${props.maxMana}, stamina ${props.stamina} of ${props.maxStamina}.`,
);

function selectSelf(): void {
  const own = game.character.value;
  if (own !== null) controller.selectAlly(own.id);
}

// Your pet (one per character) rides row 3 in a fight as a tag. It is not a target (owner decision).
const myPet = computed(() => {
  const id = game.characterId.value;
  return id === null ? null : social.petOf(id);
});
const showRow3 = computed(() => effects.value.length > 0 || myPet.value !== null);

// The party grid (51.1-UI-SPEC "Mobile Party in Combat", "Party grid"): one card per other member, in
// partyMembers order. A known member is a button that targets them; an offline member is muted and
// still a target; a member whose character row has not applied is a plain 'Member' card. The label
// carries what the card shows in words: the health percent, then mana (when the member has mana) and
// stamina (the three 3px bars from memberBars, owner 2026-10-08), the pet (the paw), offline and the chips.
// Names, pet names and effect texts are server text: text nodes and attribute bindings only.
const cards = computed(() =>
  members.value.map((member) => {
    const pet = member.known ? social.petOf(member.id) : null;
    const memberEffects = member.known ? effectViews(game.effects.value, member.id, true) : [];
    const offline = member.known && !member.online;
    const bars = memberBars(member);
    let sentence = `Health ${member.healthPercent} percent`;
    for (const bar of bars) if (bar.kind !== 'health') sentence += `, ${bar.phrase}`;
    if (pet !== null) sentence += `, pet ${pet.name} health ${pet.currentHp} of ${pet.maxHp}`;
    if (offline) sentence += ', offline';
    if (memberEffects.length > 0) sentence += `. Effects: ${memberEffects.map((view) => view.text).join(', ')}`;
    return {
      member,
      pet,
      effects: memberEffects,
      muted: !member.known || offline,
      selected: member.known && controller.allyTargetId.value === member.id,
      bars,
      label: `Target ${member.name} with your next ability. ${sentence}.`,
    };
  }),
);

// The member chips out of combat (owner 2026-10-08): each known member is a button that targets them,
// '{name} {pct}%' over 3px health, mana (members with mana) and stamina bars from memberBars. A member
// who cannot be selected out of combat (offline, not here) is muted and aria-disabled. The label
// carries the values; the selected state is aria-pressed, as on every other target button.
const chips = computed(() => {
  const ownLocation = game.character.value?.locationId ?? null;
  return members.value.map((member) => {
    if (!member.known) {
      return { member, known: false, bars: [], selectable: false, selected: false, muted: true, label: '' };
    }
    const bars = memberBars(member);
    const selectable = controller.canSelectAlly(member.id);
    let label = `Target ${member.name} with your next ability. Health ${member.healthPercent} percent`;
    for (const bar of bars) if (bar.kind !== 'health') label += `, ${bar.phrase}`;
    if (!member.online) label += ', offline';
    else if (ownLocation !== null && member.locationId !== null && member.locationId !== ownLocation) {
      label += ', not here';
    }
    return {
      member,
      known: true,
      bars,
      selectable,
      selected: controller.allyTargetId.value === member.id,
      muted: !selectable,
      label: `${label}.`,
    };
  });
});

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

// Focus after the strip re-renders (51.1 review client-rest WR-03, the shared keepFocus rule): the
// self target and the grid cards exist only in a fight, and a member can leave mid-fight. A grid card
// that held focus hands it to the card now at its index, else (out of combat) that member's chip;
// otherwise the self target, the Party chip, or the strip itself (tabindex -1, never body).
const stripEl = ref<HTMLElement | null>(null);
keepFocus<number>({
  source: () =>
    [
      combatActive.value ? 'fight' : 'out',
      selfTarget.value ? 'self' : '',
      ...cards.value.map((card) => `${card.member.id}:${card.member.known ? 1 : 0}`),
    ].join(','),
  area: () => stripEl.value,
  capture: (active) => {
    const item = active.closest('.party-grid > li');
    return item === null || item.parentElement === null ? -1 : Array.from(item.parentElement.children).indexOf(item);
  },
  restore: (index) => {
    const strip = stripEl.value;
    if (strip === null) return null;
    if (index >= 0) {
      const items = Array.from(strip.querySelectorAll<HTMLElement>('.party-grid > li')).slice(index);
      const next = items.map((item) => item.querySelector<HTMLElement>('button.ally-card')).find((b) => b !== null);
      if (next) return next;
      const chip = strip.querySelectorAll<HTMLElement>('.chip-row > .member-chip')[index];
      if (chip && chip.tagName === 'BUTTON') return chip;
    }
    return (
      strip.querySelector<HTMLElement>('button.self-target') ??
      strip.querySelector<HTMLElement>('button.party-chip') ??
      strip
    );
  },
});

function memberChipText(member: { known: boolean; name: string; healthPercent: number }): string {
  return member.known ? `${member.name} ${member.healthPercent}%` : 'Member';
}

function openSocial(): void {
  frame.openScreen('social');
}
</script>

<template>
  <section ref="stripEl" class="vitals-strip" aria-label="Vitals" tabindex="-1">
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
        <button
          v-if="selfTarget"
          type="button"
          class="self-target"
          :class="{ selected: selfSelected }"
          :aria-pressed="selfSelected ? 'true' : 'false'"
          :aria-label="selfLabel"
          @click="selectSelf"
        >
          <span class="avatar" aria-hidden="true">{{ props.avatarInitial }}</span>
          <span class="identity-text">
            <span class="name-row">
              <CharacterName class="self-name" :name="props.name" />
              <PhCrownSimple v-if="leader" class="crown" weight="fill" :size="12" aria-hidden="true" />
            </span>
            <span class="class-line">{{ props.classLine }}</span>
          </span>
          <PhCrosshairSimple v-if="selfSelected" class="self-marker" weight="fill" :size="16" aria-hidden="true" />
        </button>
        <template v-else>
          <div class="avatar" aria-hidden="true">{{ props.avatarInitial }}</div>
          <div class="identity-text">
            <div class="name-row">
              <div class="name" :title="props.name">{{ props.name }}</div>
              <PhCrownSimple v-if="leader" class="crown" weight="fill" :size="12" role="img" aria-label="Party leader" />
            </div>
            <div class="class-line">{{ props.classLine }}</div>
          </div>
        </template>
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
          v-if="!combatActive"
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
      <div v-if="combatActive && showRow3" class="row3">
        <div v-if="effects.length > 0" class="row3-chips">
          <EffectChips :effects="effects" nowrap compact />
        </div>
        <PetTag v-if="myPet !== null" :pet="myPet" :seconds-left="social.petSecondsLeft(myPet)" />
      </div>
      <div v-else-if="!combatActive && showChipRow" class="chip-row">
        <button v-if="inParty" type="button" class="tag tag-neutral party-chip" @click="openSocial">
          <PhCrownSimple v-if="leader" class="crown" weight="fill" :size="12" aria-hidden="true" />Party {{ size }}
        </button>
        <template
          v-for="{ member, known, bars, selectable, selected, muted, label } in chips"
          :key="String(member.id)"
        >
          <button
            v-if="known"
            type="button"
            class="tag tag-neutral member-chip"
            :class="{ selected, muted }"
            :aria-pressed="selected ? 'true' : 'false'"
            :aria-label="label"
            :aria-disabled="selectable ? undefined : 'true'"
            :title="member.name"
            @click="controller.selectAlly(member.id)"
          >
            <span class="chip-label">{{ memberChipText(member) }}</span>
            <span
              v-for="bar in bars"
              :key="bar.kind"
              class="track"
              :class="`${bar.kind}-track`"
              :title="bar.title"
              aria-hidden="true"
            >
              <span class="fill" :class="`fill-${bar.kind}`" :style="{ width: bar.width }"></span>
            </span>
          </button>
          <span v-else class="tag tag-neutral member-chip unknown muted">
            <span class="chip-label">{{ memberChipText(member) }}</span>
          </span>
        </template>
        <EffectChips :effects="effects" nowrap />
      </div>
      <ul v-if="combatActive && cards.length > 0" class="party-grid" aria-label="Party">
        <li v-for="card in cards" :key="String(card.member.id)">
          <button
            v-if="card.member.known"
            type="button"
            class="ally-card"
            :class="{ selected: card.selected, muted: card.muted }"
            :aria-pressed="card.selected ? 'true' : 'false'"
            :aria-label="card.label"
            @click="controller.selectAlly(card.member.id)"
          >
            <span class="card-top">
              <span class="card-name">
                <CharacterName class="card-name-text" :name="card.member.name" />
                <!-- The title sits on a span: browsers show no tooltip for a title attribute on an svg
                     (51.1 review client-rest IN-04). The card's aria-label carries the pet. -->
                <span
                  v-if="card.pet !== null"
                  class="paw"
                  :title="`${card.pet.name} ${card.pet.currentHp}/${card.pet.maxHp}`"
                  aria-hidden="true"
                  ><PhPawPrint :size="10"
                /></span>
              </span>
              <span class="pct">{{ card.member.healthPercent }}%</span>
            </span>
            <span
              v-for="bar in card.bars"
              :key="bar.kind"
              class="track"
              :class="`${bar.kind}-track`"
              :title="bar.title"
              aria-hidden="true"
            >
              <span class="fill" :class="`fill-${bar.kind}`" :style="{ width: bar.width }"></span>
            </span>
            <EffectChips
              v-if="card.effects.length > 0"
              :effects="card.effects"
              compact
              nowrap
              inline
              :limit="STRIP_EFFECT_LIMIT"
            />
          </button>
          <div v-else class="ally-card unknown muted">
            <CharacterName class="card-name-text" name="Member" />
          </div>
        </li>
      </ul>
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

.party-chip,
.member-chip {
  min-height: 44px;
  box-sizing: border-box;
  gap: 4px;
  border: 0;
  font-family: inherit;
  white-space: nowrap;
  cursor: pointer;
}

@media (hover: hover) {
  .party-chip:hover,
  button.member-chip:hover {
    background: color-mix(in srgb, var(--color-text) 7%, var(--color-neutral-800));
  }
}

.party-chip:active,
button.member-chip:active {
  background: color-mix(in srgb, var(--color-text) 14%, var(--color-neutral-800));
}

/* A member chip (out of combat, owner 2026-10-08): '{name} {pct}%' over 3px health, mana and stamina
   bars, one 44px target. */
.member-chip {
  flex-direction: column;
  align-items: stretch;
  justify-content: center;
  gap: 4px;
  padding: 4px 8px;
}

.member-chip.unknown {
  cursor: default;
}

.member-chip .track {
  display: block;
  height: 3px;
}

.member-chip .fill {
  display: block;
}

.member-chip.selected {
  box-shadow:
    inset 0 0 0 1px var(--color-accent),
    0 0 12px color-mix(in srgb, var(--color-accent) 30%, transparent);
}

.member-chip.muted .chip-label {
  color: var(--color-neutral-500);
}

.member-chip.muted .track {
  opacity: 0.45;
}

.member-chip[aria-disabled='true'] {
  cursor: default;
}

.member-chip:focus-visible {
  outline: 2px solid var(--color-accent);
  outline-offset: 2px;
}

/* The self row (mobile, in a fight): the avatar, name and class line are one 44px target (36px
   avatar + 4 + 4). The ring and the tints sit on a pseudo-element 4px wider each side, so the
   avatar keeps its left edge and no negative margin is needed. */
.self-target {
  position: relative;
  isolation: isolate;
  flex: 1 1 auto;
  min-width: 0;
  min-height: 44px;
  display: flex;
  align-items: center;
  gap: 8px;
  box-sizing: border-box;
  padding: 4px 0;
  border: 0;
  border-radius: var(--radius-md);
  background: transparent;
  color: inherit;
  font: inherit;
  text-align: left;
  cursor: pointer;
}

.self-target::before {
  content: '';
  position: absolute;
  inset: 0 -4px;
  z-index: -1;
  border-radius: var(--radius-md);
  pointer-events: none;
}

@media (hover: hover) {
  .self-target:hover::before {
    background: color-mix(in srgb, var(--color-text) 7%, transparent);
  }
}

.self-target:active::before {
  background: color-mix(in srgb, var(--color-text) 14%, transparent);
}

.self-target.selected::before {
  box-shadow:
    inset 0 0 0 1px var(--color-accent),
    0 0 12px color-mix(in srgb, var(--color-accent) 30%, transparent);
}

.self-target:focus-visible {
  outline: 2px solid var(--color-accent);
  outline-offset: 2px;
}

.self-target .class-line {
  display: block;
}

.self-name {
  font-size: 14px;
  font-weight: 500;
}

.self-marker {
  flex: none;
  color: var(--color-accent);
}

/* Row 3 (mobile, in a fight): your effect chips on the left, scrolling sideways, and your pet tag
   on the right. The pet tag is a span, never a button (owner). */
.row3 {
  display: flex;
  align-items: center;
  gap: 8px;
  min-height: 28px;
}

.row3-chips {
  flex: 1 1 auto;
  min-width: 0;
  overflow-x: auto;
  scrollbar-width: none;
}

.row3-chips::-webkit-scrollbar {
  display: none;
}

.row3-chips > :deep(.effect-chips) {
  width: max-content;
}

/* The party grid (mobile, in a fight): three columns of 44px target cards that wrap. */
.party-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 8px;
  margin: 0;
  padding: 0;
  list-style: none;
}

.party-grid > li {
  display: flex;
  min-width: 0;
}

.ally-card {
  flex: 1 1 auto;
  min-width: 0;
  min-height: 44px;
  display: flex;
  flex-direction: column;
  justify-content: center;
  gap: 4px;
  box-sizing: border-box;
  padding: 4px 8px;
  border: 0;
  border-radius: var(--radius-md);
  background: var(--color-surface);
  color: inherit;
  font: inherit;
  text-align: left;
}

button.ally-card {
  cursor: pointer;
}

@media (hover: hover) {
  button.ally-card:hover {
    background: color-mix(in srgb, var(--color-text) 7%, var(--color-surface));
  }
}

button.ally-card:active {
  background: color-mix(in srgb, var(--color-text) 14%, var(--color-surface));
}

button.ally-card:focus-visible {
  outline: 2px solid var(--color-accent);
  outline-offset: 2px;
}

.ally-card.selected {
  box-shadow:
    inset 0 0 0 1px var(--color-accent),
    0 0 12px color-mix(in srgb, var(--color-accent) 30%, transparent);
}

.card-top {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 4px;
  min-width: 0;
}

.card-name {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  min-width: 0;
}

.card-name-text {
  font-size: 12px;
  font-weight: 500;
}

.ally-card.muted .card-name-text {
  color: var(--color-neutral-500);
}

.paw {
  display: inline-flex;
  flex: none;
  color: var(--color-accent-300);
}

.pct {
  flex: none;
  font-size: 10px;
  color: var(--color-neutral-400);
  font-variant-numeric: tabular-nums;
}

.ally-card .track {
  display: block;
  height: 3px;
}

.ally-card .fill {
  display: block;
}

.ally-card.muted .track {
  opacity: 0.45;
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
