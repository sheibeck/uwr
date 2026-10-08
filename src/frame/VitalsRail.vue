<script setup lang="ts">
import { computed, inject, ref, shallowRef, watch } from 'vue';
import type { FunctionalComponent } from 'vue';
import { PhCrosshairSimple, PhCrownSimple } from '@phosphor-icons/vue';
import { useDamageFlash } from '../combat/useDamageFlash';
import { COMBAT_KEY, GAME_KEY, createInertCombat, createInertGame } from '../game/context';
import EffectChips from '../rails/EffectChips.vue';
import PartyBlock from '../rails/PartyBlock.vue';
import { effectViews } from '../rails/effects';
import { isPartyLeader } from '../rails/party';
import { xpProgress } from '../rails/xp';
import PetRow from '../social/PetRow.vue';
import PlayerMenu from '../social/PlayerMenu.vue';
import TravelSwitch from '../social/TravelSwitch.vue';
import { SOCIAL_KEY, createInertSocial } from '../social/socialContext';
import { keepFocus } from '../ledger/keepFocus';
import { barFraction, vitalText } from './vitals';

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
}>();

const game = inject(GAME_KEY, createInertGame());

// Experience: progress into the current level. No character row yet reads '0 / 0' with an empty track.
const xp = computed(() => {
  const c = game.character.value;
  if (c === null) return { value: 0, need: 0, fraction: 0, text: '0 / 0' };
  return xpProgress(c);
});
const effects = computed(() => effectViews(game.effects.value, game.characterId.value, game.inCombat.value));
const leader = computed(() => isPartyLeader(game.group.value, game.characterId.value));

const social = inject(SOCIAL_KEY, createInertSocial());
const railEl = ref<HTMLElement | null>(null);
const selfMenu = ref<InstanceType<typeof PlayerMenu> | null>(null);

// The self block (51.1-UI-SPEC "Vitals Rail Self Block", out of combat): in a party with at least one
// other member a ⋯ 'Actions for yourself' sits at the block's top right and the identity row reserves
// 32px for it. Solo (or alone in a group waiting on its invites) your menu is empty, so there is none.
const selfId = computed(() => game.characterId.value);
const selfMenuShown = computed(() => {
  const group = game.group.value;
  if (group === null || selfId.value === null) return false;
  return game.groupMembers.value.filter((row) => row.groupId === group.id).length > 1;
});

// Your pet (one per character), inside the self block after your chips, solo too.
const myPet = computed(() => (selfId.value === null ? null : social.petOf(selfId.value)));

// The self target (51.1-UI-SPEC "Vitals Rail Self Block", in combat; it replaces the Phase 48 'You'
// card). In a fight (game.combat.active) and once your character row exists, the identity row, the
// Health, Mana and Stamina bars and your chips sit inside one button, built from spans only (phrasing
// content, as HostileCard does). Clicking it makes you the ally target (client state; the ally target
// defaults to you, so it starts pressed). The ⋯ and your pet row stay its siblings, never inside it.
// Out of combat, and before the row exists, the block is plain markup with no wrapper.
const controller = inject(COMBAT_KEY, createInertCombat());
const inFight = computed(() => game.combat.active.value);
const selfTarget = computed(() => inFight.value && game.character.value !== null);
const selfSelected = computed(() => {
  const own = game.character.value;
  return selfTarget.value && own !== null && controller.allyTargetId.value === own.id;
});
const tag = computed(() => (selfTarget.value ? 'span' : 'div'));

function selectSelf(): void {
  const own = game.character.value;
  if (own !== null) controller.selectAlly(own.id);
}

// Renders its children with no element of its own, so out of combat the identity row and the bars
// stay direct children of the self block.
const Unwrapped: FunctionalComponent = (_props, { slots }) => slots.default?.();
const targetWrapper = computed(() => (selfTarget.value ? 'button' : Unwrapped));
const targetAttrs = computed(() => {
  if (!selfTarget.value) return {};
  return {
    type: 'button',
    class: 'self-target',
    title: 'Click to target yourself',
    'aria-pressed': selfSelected.value ? 'true' : 'false',
    'aria-label':
      `Target yourself with your next ability. Health ${props.hp} of ${props.maxHp}, ` +
      `mana ${props.mana} of ${props.maxMana}, stamina ${props.stamina} of ${props.maxStamina}.`,
    onClick: selectSelf,
  };
});

// Right-click opens the self menu (the rail is desktop only): on the identity row out of combat, on
// the whole block in a fight. Left click targets; right-click never changes the target.
function onSelfContextMenu(event: MouseEvent): void {
  if (!selfMenuShown.value || selfMenu.value === null) return;
  const onIdentity = event.target instanceof Element && event.target.closest('.identity') !== null;
  if (!selfTarget.value && !onIdentity) return;
  event.preventDefault();
  selfMenu.value.open('first');
}

// After Leave party (or being removed) the self ⋯ goes away: focus moves to the Party heading.
function partyHeading(): HTMLElement | null {
  return railEl.value?.querySelector<HTMLElement>('.party h6') ?? null;
}

// The self target button goes when the fight ends (51.1 review client-rest WR-03, the shared
// keepFocus rule): focus held there moves to the self ⋯ when shown, else the Party heading.
const blockEl = ref<HTMLElement | null>(null);
keepFocus({
  source: selfTarget,
  area: () => blockEl.value,
  capture: () => true,
  restore: () =>
    blockEl.value?.querySelector<HTMLElement>('.self-menu .menu-opener') ??
    blockEl.value?.querySelector<HTMLElement>('.self-target') ??
    partyHeading(),
});

// HP damage flash (48-UI-SPEC "Damage flash", CMB-05, A19): the active character's own HP bar only,
// in or out of combat. The flash key is the character id, latched so it only moves together with the
// hp prop (this component is fed through props, which lag the game refs by a render): a character
// switch then reads as a switch, never as a drop.
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

const bars = computed(() => [
  { key: 'health', label: 'Health', value: props.hp, max: props.maxHp },
  { key: 'mana', label: 'Mana', value: props.mana, max: props.maxMana },
  { key: 'stamina', label: 'Stamina', value: props.stamina, max: props.maxStamina },
]);
</script>

<template>
  <aside ref="railEl" class="vitals-rail" aria-label="Vitals">
    <div
      ref="blockEl"
      class="self-block"
      :class="{ targetable: selfTarget, selected: selfSelected }"
      @contextmenu="onSelfContextMenu"
    >
      <component :is="targetWrapper" v-bind="targetAttrs">
        <component :is="tag" class="identity" :class="{ reserve: selfMenuShown }">
          <component :is="tag" class="avatar" aria-hidden="true">{{ props.avatarInitial }}</component>
          <component :is="tag" class="identity-text">
            <component :is="tag" class="name-row">
              <component :is="tag" class="name" :title="props.name">{{ props.name }}</component>
              <PhCrownSimple v-if="leader" class="crown" weight="fill" :size="12" aria-label="Party leader" />
            </component>
            <component :is="tag" class="class-line">{{ props.classLine }}</component>
          </component>
          <PhCrosshairSimple v-if="selfSelected" class="self-marker" weight="fill" :size="16" aria-hidden="true" />
        </component>

        <component :is="tag" class="bars">
          <component
            :is="tag"
            v-for="bar in bars"
            :key="bar.key"
            class="bar"
            :class="bar.key === 'health' ? flashClass : null"
          >
            <component :is="tag" class="bar-row">
              <span class="label">{{ bar.label }}</span>
              <span class="readout">
                <span class="value">{{ vitalText(bar.value, bar.max) }}</span>
                <span v-if="bar.key === 'health' && flashDelta !== null" class="delta" aria-hidden="true">−{{ flashDelta }}</span>
              </span>
            </component>
            <component
              :is="tag"
              class="track"
              role="progressbar"
              :aria-label="bar.label"
              aria-valuemin="0"
              :aria-valuenow="Number(bar.value)"
              :aria-valuemax="Number(bar.max)"
            >
              <component
                :is="tag"
                class="fill"
                :class="`fill-${bar.key}`"
                :style="{ width: `${barFraction(bar.value, bar.max) * 100}%` }"
              ></component>
              <component
                :is="tag"
                v-if="bar.key === 'health' && flashGhost"
                class="ghost"
                aria-hidden="true"
                :style="{ left: flashGhost.left, width: flashGhost.width }"
              ></component>
            </component>
          </component>

          <div v-if="!inFight" class="xp-row">
            <div class="bar-row">
              <span class="xp-label">XP</span>
              <span class="xp-value">{{ xp.text }}</span>
            </div>
            <div
              class="xp-track"
              role="progressbar"
              aria-label="Experience"
              aria-valuemin="0"
              :aria-valuenow="xp.value"
              :aria-valuemax="xp.need"
            >
              <div class="xp-fill" :style="{ width: `${xp.fraction * 100}%` }"></div>
            </div>
          </div>

          <EffectChips :effects="effects" :inline="selfTarget" />
        </component>
      </component>

      <PlayerMenu
        v-if="selfMenuShown && selfId !== null"
        ref="selfMenu"
        class="self-menu"
        :target-id="selfId"
        side="right"
        size="rail"
        :fallback-focus="partyHeading"
      />
      <PetRow v-if="myPet !== null" :pet="myPet" :owner-name="null" :seconds-left="social.petSecondsLeft(myPet)" />
    </div>

    <TravelSwitch variant="rail" />

    <div class="hr" role="separator"></div>

    <PartyBlock />
  </aside>
</template>

<style scoped>
.vitals-rail {
  width: 252px;
  flex-shrink: 0;
  display: flex;
  flex-direction: column;
  gap: 16px;
  padding: 16px;
  min-height: 0;
  overflow-y: auto;
  background: color-mix(in srgb, var(--color-surface) 30%, transparent);
}

/* The self block: identity, bars, XP, chips and your pet. The 51.1 contract draws it 8px outside its
   content (padding 8 with margin -8); the design contract bans negative spacing, so the outset is
   this positioned pseudo-element (the StepBar pattern) and carries the block's background states. */
.self-block {
  position: relative;
  display: flex;
  flex-direction: column;
  gap: 16px;
  border-radius: var(--radius-md);
}

.self-block::before {
  content: '';
  position: absolute;
  inset: -8px;
  border-radius: var(--radius-md);
  pointer-events: none;
}

/* In a fight (UI-SPEC Color): the target ring and the hover and pressed tints on the block's outset. */
.self-block.targetable:has(> .self-target:hover)::before {
  background: color-mix(in srgb, var(--color-text) 7%, transparent);
}

.self-block.targetable:has(> .self-target:active)::before {
  background: color-mix(in srgb, var(--color-text) 14%, transparent);
}

.self-block.selected::before {
  box-shadow:
    inset 0 0 0 1px var(--color-accent),
    0 0 12px color-mix(in srgb, var(--color-accent) 30%, transparent);
}

/* The self target: the block's column of identity and bars. Positioned so it paints above the
   pseudo-element's tint (the ⋯ and the pet row already are). */
.self-target {
  position: relative;
  display: flex;
  flex-direction: column;
  gap: 16px;
  box-sizing: border-box;
  width: 100%;
  padding: 0;
  border: 0;
  border-radius: var(--radius-md);
  background: transparent;
  color: inherit;
  font: inherit;
  text-align: left;
  cursor: pointer;
}

.self-target:focus-visible {
  outline: 2px solid var(--color-accent);
  outline-offset: -2px;
}

/* The crosshair keeps its size at the right end of the identity row, left of the ⋯ reserve. */
.self-marker {
  flex: none;
  color: var(--color-accent);
}

/* Self ⋯ (UI-SPEC Exceptions): the top right of the block, a sibling of the identity row. */
.self-menu {
  position: absolute;
  top: 0;
  right: 0;
}

.identity {
  display: flex;
  align-items: center;
  gap: 8px;
}

.identity.reserve {
  padding-right: 32px;
}

.avatar {
  width: 44px;
  height: 44px;
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
  display: block;
  min-width: 0;
  flex: 1;
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
  display: block;
  font-size: 14px;
  font-weight: 500;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  min-width: 0;
}

.class-line {
  display: block;
  font-size: 12px;
  color: var(--color-neutral-400);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.bars {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.bar-row {
  display: flex;
  justify-content: space-between;
  gap: 8px;
  font-size: 12px;
}

.label {
  color: var(--color-neutral-400);
}

.value {
  color: var(--color-neutral-200);
  font-variant-numeric: tabular-nums;
}

.readout {
  display: inline-flex;
  align-items: baseline;
}

.track {
  display: block;
  position: relative;
  height: 6px;
  border-radius: var(--radius-sm);
  background: var(--color-neutral-900);
  overflow: hidden;
}

.fill {
  display: block;
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

.ghost {
  position: absolute;
  top: 0;
  bottom: 0;
  background: color-mix(in srgb, var(--color-health) 35%, transparent);
}

.delta {
  margin-left: 4px;
  font-size: 12px;
  color: var(--color-con-red);
  font-variant-numeric: tabular-nums;
}

.flash-motion .ghost {
  animation: ghost-fade 600ms ease-out forwards;
}

.flash-motion .fill-health {
  animation: flash-fill 400ms ease-out;
}

.flash-motion .value {
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
    color: var(--color-neutral-200);
  }
}

.flash-reduced .fill-health {
  background: var(--color-con-red);
}

.flash-reduced .value {
  color: var(--color-con-red);
}

@media (prefers-reduced-motion: reduce) {
  .flash-motion .ghost,
  .flash-motion .fill-health,
  .flash-motion .value {
    animation: none;
  }
}

.xp-row {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.xp-label {
  color: var(--color-neutral-500);
}

.xp-value {
  color: var(--color-neutral-500);
  font-variant-numeric: tabular-nums;
}

.xp-track {
  height: 2px;
  border-radius: var(--radius-sm);
  background: var(--color-neutral-900);
  overflow: hidden;
}

.xp-fill {
  height: 100%;
  background: var(--color-accent);
}

.hr {
  margin: 0;
}
</style>
