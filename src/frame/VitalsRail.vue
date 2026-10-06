<script setup lang="ts">
import { computed, inject, shallowRef, watch } from 'vue';
import { PhCrownSimple } from '@phosphor-icons/vue';
import { useDamageFlash } from '../combat/useDamageFlash';
import { GAME_KEY, createInertGame } from '../game/context';
import EffectChips from '../rails/EffectChips.vue';
import PartyBlock from '../rails/PartyBlock.vue';
import { effectViews } from '../rails/effects';
import { isPartyLeader } from '../rails/party';
import { xpProgress } from '../rails/xp';
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
  <aside class="vitals-rail" aria-label="Vitals">
    <div class="identity">
      <div class="avatar" aria-hidden="true">{{ props.avatarInitial }}</div>
      <div class="identity-text">
        <div class="name-row">
          <div class="name" :title="props.name">{{ props.name }}</div>
          <PhCrownSimple v-if="leader" class="crown" weight="fill" :size="12" aria-label="Party leader" />
        </div>
        <div class="class-line">{{ props.classLine }}</div>
      </div>
    </div>

    <div class="bars">
      <div v-for="bar in bars" :key="bar.key" class="bar" :class="bar.key === 'health' ? flashClass : null">
        <div class="bar-row">
          <span class="label">{{ bar.label }}</span>
          <span class="readout">
            <span class="value">{{ vitalText(bar.value, bar.max) }}</span>
            <span v-if="bar.key === 'health' && flashDelta !== null" class="delta" aria-hidden="true">−{{ flashDelta }}</span>
          </span>
        </div>
        <div
          class="track"
          role="progressbar"
          :aria-label="bar.label"
          aria-valuemin="0"
          :aria-valuenow="Number(bar.value)"
          :aria-valuemax="Number(bar.max)"
        >
          <div class="fill" :class="`fill-${bar.key}`" :style="{ width: `${barFraction(bar.value, bar.max) * 100}%` }"></div>
          <div
            v-if="bar.key === 'health' && flashGhost"
            class="ghost"
            aria-hidden="true"
            :style="{ left: flashGhost.left, width: flashGhost.width }"
          ></div>
        </div>
      </div>

      <div class="xp-row">
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

      <EffectChips :effects="effects" />
    </div>

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

.identity {
  display: flex;
  align-items: center;
  gap: 8px;
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
  position: relative;
  height: 6px;
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
