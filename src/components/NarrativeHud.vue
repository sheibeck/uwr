<template>
  <div :style="hudStyle">
    <template v-if="character">
      <!-- Left: Name + Level -->
      <div :style="{ color: '#e9ecef', fontSize: '0.85rem', fontWeight: 600, whiteSpace: 'nowrap' }">
        {{ character.name }} Lv {{ character.level }}
      </div>

      <!-- Center: HP + Mana bars -->
      <div :style="{ display: 'flex', gap: '8px', alignItems: 'center' }">
        <!-- HP Bar -->
        <div :style="barContainer">
          <div :style="{ ...barFill, background: '#c92a2a', width: hpPercent + '%' }" />
          <span :style="barLabel">{{ character.hp }}/{{ character.maxHp }}</span>
        </div>
        <!-- Mana Bar -->
        <div :style="barContainer">
          <div :style="{ ...barFill, background: '#1864ab', width: manaPercent + '%' }" />
          <span :style="barLabel">{{ character.mana }}/{{ character.maxMana }}</span>
        </div>
      </div>

      <!-- Right: Combat + Panel buttons -->
      <div :style="{ display: 'flex', alignItems: 'center', gap: '8px', marginLeft: 'auto' }">
        <!-- Combat indicator -->
        <div v-if="activeCombat" :style="{ display: 'flex', alignItems: 'center', gap: '4px' }">
          <span :style="combatDotStyle" />
          <span :style="{ color: '#ff6b6b', fontSize: '0.7rem', fontWeight: 600, whiteSpace: 'nowrap' }">IN COMBAT</span>
        </div>

        <!-- Pending skill indicator -->
        <span
          v-if="hasPendingSkills"
          :style="skillIndicatorStyle"
          title="New skill available! Check the console."
        >NEW SKILL</span>

        <!-- Panel buttons -->
        <div :style="{ display: 'flex', gap: '3px' }">
          <button
            v-for="btn in panelButtons"
            :key="btn.id"
            type="button"
            :style="panelBtnStyle"
            @click="$emit('open-panel', btn.id)"
            @mouseenter="($event.currentTarget as HTMLElement).style.color = '#e9ecef'"
            @mouseleave="($event.currentTarget as HTMLElement).style.color = '#868e96'"
          >{{ btn.label }}</button>
        </div>
      </div>
    </template>
    <template v-else>
      <div :style="{ color: '#868e96', fontSize: '0.85rem', margin: '0 auto' }">No character</div>
    </template>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import type { Character } from '../module_bindings/types';

const props = defineProps<{
  character: Character | null;
  activeCombat: any | null;
  connActive: boolean;
  hasPendingSkills?: boolean;
}>();

defineEmits<{
  (e: 'open-panel', panelId: string): void;
}>();

const hpPercent = computed(() => {
  if (!props.character || props.character.maxHp === 0n) return 0;
  return Number((props.character.hp * 100n) / props.character.maxHp);
});

const manaPercent = computed(() => {
  if (!props.character || props.character.maxMana === 0n) return 0;
  return Number((props.character.mana * 100n) / props.character.maxMana);
});

const panelButtons = [
  { id: 'characterInfo', label: 'Inv' },
  { id: 'map', label: 'Map' },
  { id: 'journal', label: 'Quests' },
  { id: 'friends', label: 'Social' },
  { id: 'travel', label: 'Travel' },
];

const hudStyle = {
  position: 'fixed' as const,
  top: '0',
  left: '0',
  right: '0',
  height: '44px',
  zIndex: 10000,
  background: '#12121a',
  borderBottom: '1px solid #2a2a3a',
  display: 'flex',
  alignItems: 'center',
  padding: '0 12px',
  gap: '16px',
};

const barContainer = {
  position: 'relative' as const,
  width: '120px',
  height: '14px',
  background: '#2a2a3a',
  borderRadius: '3px',
  overflow: 'hidden',
};

const barFill = {
  position: 'absolute' as const,
  top: '0',
  left: '0',
  height: '100%',
  transition: 'width 0.3s ease',
  borderRadius: '3px',
};

const barLabel = {
  position: 'absolute' as const,
  inset: '0',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  color: '#fff',
  fontSize: '0.6rem',
  fontWeight: 600,
  textShadow: '0 1px 2px rgba(0,0,0,0.8)',
};

const panelBtnStyle = {
  background: 'transparent',
  border: '1px solid #3a3a4a',
  color: '#868e96',
  padding: '2px 6px',
  borderRadius: '3px',
  fontSize: '0.7rem',
  cursor: 'pointer',
  whiteSpace: 'nowrap' as const,
};

const combatDotStyle = {
  width: '6px',
  height: '6px',
  borderRadius: '50%',
  background: '#ff6b6b',
  animation: 'combatPulse 1.5s ease-in-out infinite',
};

const skillIndicatorStyle = {
  color: '#ffd43b',
  fontSize: '0.65rem',
  fontWeight: 700,
  whiteSpace: 'nowrap' as const,
  animation: 'skillPulse 2s ease-in-out infinite',
  cursor: 'default',
  letterSpacing: '0.05em',
};
</script>

<style>
@keyframes skillPulse {
  0%, 100% { opacity: 0.5; }
  50% { opacity: 1; }
}
</style>
