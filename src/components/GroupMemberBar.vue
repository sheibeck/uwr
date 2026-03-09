<template>
  <div v-if="character" :style="barStyle">
    <!-- Self card (always shown) -->
    <div
      :style="[cardStyle, selfBorderStyle, isTargeted(character.id) ? targetedStyle : {}]"
      @click="$emit('target', character.id)"
    >
      <div :style="nameRowStyle">
        <span v-if="leaderId != null && character.id === leaderId" :style="starStyle">★ </span>
        <span :style="nameStyle">{{ character.name }}</span>
        <span :style="levelStyle">Lv{{ character.level }}</span>
      </div>
      <div :style="barsContainerStyle">
        <!-- HP -->
        <div :style="thinBarContainer">
          <div :style="{ ...thinBarFill, background: '#c92a2a', width: pct(character.hp, character.maxHp) + '%' }" />
          <span :style="thinBarLabel">{{ character.hp }}/{{ character.maxHp }}</span>
        </div>
        <!-- Mana -->
        <div v-if="character.maxMana > 0n" :style="thinBarContainer">
          <div :style="{ ...thinBarFill, background: '#1864ab', width: pct(character.mana, character.maxMana) + '%' }" />
          <span :style="thinBarLabel">{{ character.mana }}/{{ character.maxMana }}</span>
        </div>
        <!-- Stamina -->
        <div v-if="character.maxStamina > 0n" :style="thinBarContainer">
          <div :style="{ ...thinBarFill, background: '#e67700', width: pct(character.stamina, character.maxStamina) + '%' }" />
          <span :style="thinBarLabel">{{ character.stamina }}/{{ character.maxStamina }}</span>
        </div>
      </div>
      <!-- Effects -->
      <div v-if="effectsFor(character.id).length" :style="effectsRowStyle">
        <span
          v-for="eff in effectsFor(character.id)"
          :key="eff.id.toString()"
          :style="effectBadgeStyle(eff)"
        >{{ abbreviate(effectLabel(eff)) }} {{ effectDuration(eff) }}</span>
      </div>
    </div>

    <!-- Other group members -->
    <template v-if="otherMembers.length">
      <div
        v-for="member in otherMembers"
        :key="member.id.toString()"
        :style="[cardStyle, neutralBorderStyle, isTargeted(member.id) ? targetedStyle : {}]"
        @click="$emit('target', member.id)"
      >
        <div :style="nameRowStyle">
          <span v-if="leaderId != null && member.id === leaderId" :style="starStyle">★ </span>
          <span :style="nameStyle">{{ member.name }}</span>
          <span :style="levelStyle">Lv{{ member.level }}</span>
        </div>
        <div :style="barsContainerStyle">
          <div :style="thinBarContainer">
            <div :style="{ ...thinBarFill, background: '#c92a2a', width: pct(member.hp, member.maxHp) + '%' }" />
            <span :style="thinBarLabel">{{ member.hp }}/{{ member.maxHp }}</span>
          </div>
          <div v-if="member.maxMana > 0n" :style="thinBarContainer">
            <div :style="{ ...thinBarFill, background: '#1864ab', width: pct(member.mana, member.maxMana) + '%' }" />
            <span :style="thinBarLabel">{{ member.mana }}/{{ member.maxMana }}</span>
          </div>
          <div v-if="member.maxStamina > 0n" :style="thinBarContainer">
            <div :style="{ ...thinBarFill, background: '#e67700', width: pct(member.stamina, member.maxStamina) + '%' }" />
            <span :style="thinBarLabel">{{ member.stamina }}/{{ member.maxStamina }}</span>
          </div>
        </div>
        <div v-if="effectsFor(member.id).length" :style="effectsRowStyle">
          <span
            v-for="eff in effectsFor(member.id)"
            :key="eff.id.toString()"
            :style="effectBadgeStyle(eff)"
          >{{ abbreviate(effectLabel(eff)) }} {{ effectDuration(eff) }}</span>
        </div>
      </div>
    </template>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import type { Character } from '../module_bindings/types';
import {
  effectLabel as rawEffectLabel,
  effectIsNegative,
  effectRemainingSeconds,
  formatEffectDuration,
  type EffectTimerEntry,
} from '../ui/effectTimers';

type CharEffect = {
  id: bigint;
  characterId: bigint;
  effectType: string;
  magnitude: bigint;
  roundsRemaining: bigint;
  sourceAbility?: string;
};

const props = defineProps<{
  character: Character | null;
  groupMembers: Character[];
  characterEffects: CharEffect[];
  defensiveTargetId: bigint | null;
  nowMicros: number;
  leaderId: bigint | null;
}>();

defineEmits<{
  (e: 'target', characterId: bigint): void;
}>();

const effectTimers = new Map<string, EffectTimerEntry>();

const otherMembers = computed(() => {
  if (!props.character) return [];
  const selfId = props.character.id.toString();
  return [...props.groupMembers]
    .filter(m => m.id.toString() !== selfId)
    .sort((a, b) => a.name.localeCompare(b.name));
});

const isTargeted = (id: bigint) => {
  if (props.defensiveTargetId == null) return false;
  return id.toString() === props.defensiveTargetId.toString();
};

const pct = (current: bigint, max: bigint) => {
  if (!max || max === 0n) return 0;
  return Math.max(0, Math.min(100, Math.round(Number(current * 100n / max))));
};

const effectsFor = (characterId: bigint) =>
  props.characterEffects.filter(e => e.characterId === characterId);

const effectLabel = (eff: CharEffect) => rawEffectLabel(eff);

const effectDuration = (eff: CharEffect) => {
  const secs = effectRemainingSeconds(eff, props.nowMicros, effectTimers);
  return formatEffectDuration(secs);
};

const effectBadgeStyle = (eff: CharEffect) => ({
  fontSize: '0.55rem',
  padding: '0 3px',
  borderRadius: '2px',
  whiteSpace: 'nowrap' as const,
  color: effectIsNegative(eff) ? '#ff6b6b' : '#51cf66',
  background: effectIsNegative(eff) ? 'rgba(255,107,107,0.12)' : 'rgba(81,207,102,0.12)',
});

const abbreviate = (label: string) => {
  if (label.length <= 8) return label;
  return label.slice(0, 7) + '.';
};

// Styles
const barStyle = {
  position: 'fixed' as const,
  top: '44px',
  left: '0',
  right: '0',
  zIndex: 9999,
  background: '#12121a',
  borderBottom: '1px solid #2a2a3a',
  display: 'flex',
  alignItems: 'flex-start',
  gap: '6px',
  padding: '4px 10px',
  overflowX: 'auto' as const,
  minHeight: '50px',
};

const cardStyle = {
  display: 'flex',
  flexDirection: 'column' as const,
  padding: '3px 6px',
  borderRadius: '4px',
  background: 'rgba(42,42,58,0.5)',
  cursor: 'pointer',
  minWidth: '110px',
  maxWidth: '150px',
  flexShrink: 0,
  transition: 'box-shadow 0.2s ease',
};

const selfBorderStyle = {
  borderLeft: '3px solid rgba(217,171,72,0.7)',
};

const neutralBorderStyle = {
  borderLeft: '3px solid rgba(134,142,150,0.3)',
};

const targetedStyle = {
  boxShadow: '0 0 6px rgba(0,200,200,0.5)',
  background: 'rgba(0,200,200,0.08)',
};

const nameRowStyle = {
  display: 'flex',
  alignItems: 'center',
  gap: '3px',
  marginBottom: '2px',
};

const nameStyle = {
  color: '#e9ecef',
  fontSize: '0.7rem',
  fontWeight: 600,
  whiteSpace: 'nowrap' as const,
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  maxWidth: '80px',
};

const levelStyle = {
  color: '#868e96',
  fontSize: '0.6rem',
  whiteSpace: 'nowrap' as const,
  marginLeft: 'auto',
};

const starStyle = {
  color: '#ffd43b',
  fontSize: '0.6rem',
};

const barsContainerStyle = {
  display: 'flex',
  flexDirection: 'column' as const,
  gap: '2px',
};

const thinBarContainer = {
  position: 'relative' as const,
  width: '100px',
  height: '10px',
  background: '#2a2a3a',
  borderRadius: '2px',
  overflow: 'hidden',
};

const thinBarFill = {
  position: 'absolute' as const,
  top: '0',
  left: '0',
  height: '100%',
  transition: 'width 0.3s ease',
  borderRadius: '2px',
};

const thinBarLabel = {
  position: 'absolute' as const,
  inset: '0',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  color: '#fff',
  fontSize: '0.5rem',
  fontWeight: 600,
  textShadow: '0 1px 2px rgba(0,0,0,0.8)',
};

const effectsRowStyle = {
  display: 'flex',
  flexWrap: 'wrap' as const,
  gap: '2px',
  marginTop: '2px',
};
</script>
