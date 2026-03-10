<template>
  <div :style="hudStyle">
    <template v-if="character">
      <!-- Left: Name + Level + Race + Class -->
      <div :style="{ color: '#e9ecef', fontSize: '0.85rem', fontWeight: 600, whiteSpace: 'nowrap', display: 'flex', alignItems: 'center', gap: '4px' }">
        <span>{{ character.name }} Lv {{ character.level }} - {{ character.race }} {{ character.className }}</span>
        <span
          v-if="(pendingLevels ?? 0) > 0"
          :style="levelUpLinkStyle"
          @click="$emit('level-up-click')"
        >[level up{{ (pendingLevels ?? 0) > 1 ? ` x${pendingLevels}` : '' }}]</span>
      </div>

      <!-- Right: Combat + Panel buttons -->
      <div :style="{ display: 'flex', alignItems: 'center', gap: '8px', marginLeft: 'auto' }">
        <!-- Combat indicator -->
        <div v-if="activeCombat" :style="{ display: 'flex', alignItems: 'center', gap: '4px' }">
          <span :style="combatDotStyle" />
          <span :style="{ color: '#ff6b6b', fontSize: '0.7rem', fontWeight: 600, whiteSpace: 'nowrap' }">IN COMBAT</span>
        </div>

        <!-- Level up indicator -->
        <span
          v-if="(pendingLevels ?? 0) > 0"
          :style="levelUpIndicatorStyle"
          title="You have levels pending! Click to level up."
          @click="$emit('level-up-click')"
        >LEVEL UP{{ (pendingLevels ?? 0) > 1 ? ` (${pendingLevels})` : '' }}</span>

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
import type { Character } from '../module_bindings/types';

defineProps<{
  character: Character | null;
  activeCombat: any | null;
  connActive: boolean;
  hasPendingSkills?: boolean;
  pendingLevels?: number;
}>();

defineEmits<{
  (e: 'open-panel', panelId: string): void;
  (e: 'level-up-click'): void;
}>();

const panelButtons = [
  { id: 'map', label: 'Map' },
  { id: 'friends', label: 'Social' },
];

const hudStyle = {
  position: 'fixed' as const,
  top: '0',
  left: '0',
  right: '0',
  height: '36px',
  zIndex: 10000,
  background: '#12121a',
  borderBottom: '1px solid #2a2a3a',
  display: 'flex',
  alignItems: 'center',
  padding: '0 12px',
  gap: '16px',
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

const levelUpLinkStyle = {
  color: '#ffa500',
  fontSize: '0.8rem',
  fontWeight: 600,
  cursor: 'pointer',
  marginLeft: '8px',
};

const levelUpIndicatorStyle = {
  color: '#ffa500',
  fontSize: '0.65rem',
  fontWeight: 700,
  whiteSpace: 'nowrap' as const,
  animation: 'skillPulse 2s ease-in-out infinite',
  cursor: 'pointer',
  letterSpacing: '0.05em',
};
</script>

<style>
@keyframes skillPulse {
  0%, 100% { opacity: 0.5; }
  50% { opacity: 1; }
}
</style>
