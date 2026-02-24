<template>
  <header :style="styles.header">
    <div :style="styles.headerLeft">
      <div :style="styles.title">Unwritten Realms</div>
      <div :style="styles.subtle">
        Status:
        <span :style="connActive ? styles.statusOnline : styles.statusOffline">
          {{ connActive ? 'Connected' : 'Disconnected' }}
        </span>
        <span :style="{ fontSize: '0.7rem', opacity: 0.45, marginLeft: '6px', letterSpacing: '0.02em' }">
          v{{ clientVersion }}
        </span>
      </div>
    </div>
    <div :style="styles.headerCenter">
      <div v-if="selectedCharacter" :style="styles.subtle">
        {{ selectedCharacter.name }} - Lv {{ selectedCharacter.level }} -
        {{ selectedCharacter.race }} {{ selectedCharacter.className }}
      </div>
      <div v-if="selectedCharacter" :style="styles.xpRow">
        <div :style="styles.xpBar">
          <div :style="[styles.xpFill, { width: xpPercent + '%' }]"></div>
        </div>
        <div :style="styles.xpText">{{ xpLabel }}</div>
      </div>
      <div v-else :style="styles.subtle">No character selected</div>
    </div>
    <div :style="styles.headerRight">
      <div :style="styles.authRow">
        <div v-if="!isLoggedIn" :style="styles.authForm">
          <button
            type="button"
            :disabled="!connActive"
            :style="styles.ghostButton"
            @click="$emit('login')"
          >
            Login with SpacetimeAuth
          </button>
        </div>
        <div v-else :style="styles.authLoggedIn">
          <span :style="styles.authEmail">
            {{ loggedInEmail ?? 'Logged in' }}
          </span>
          <button
            type="button"
            :disabled="!connActive"
            :style="styles.ghostButton"
            @click="$emit('logout')"
          >
            Logout
          </button>
        </div>
        <div v-if="authMessage" :style="styles.authMessage">{{ authMessage }}</div>
        <div v-if="authError" :style="styles.authError">{{ authError }}</div>
      </div>
    </div>
  </header>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import type { Character, Location } from '../module_bindings/types';

const clientVersion = computed(() => (window as any).__client_version ?? 'dev');

const props = defineProps<{
  styles: Record<string, Record<string, string | number>>;
  connActive: boolean;
  selectedCharacter: Character | null;
  currentLocation: Location | null;
  isLoggedIn: boolean;
  loggedInEmail: string | null;
  authMessage: string;
  authError: string;
}>();

const emit = defineEmits<{
  (e: 'login'): void;
  (e: 'logout'): void;
}>();

const XP_TOTAL_BY_LEVEL = [0, 100, 260, 480, 760, 1100, 1500, 1960, 2480, 3060];
const MAX_LEVEL = 10;

const xpRequiredForLevel = (level: number) => {
  if (level <= 1) return 0;
  const idx = level - 1;
  return XP_TOTAL_BY_LEVEL[Math.min(idx, XP_TOTAL_BY_LEVEL.length - 1)];
};

const xpPercent = computed(() => {
  if (!props.selectedCharacter) return 0;
  const level = Number(props.selectedCharacter.level ?? 1);
  if (level >= MAX_LEVEL) return 100;
  const currentXp = Number(props.selectedCharacter.xp ?? 0);
  const floor = xpRequiredForLevel(level);
  const next = xpRequiredForLevel(level + 1);
  const span = Math.max(next - floor, 1);
  const progress = Math.min(Math.max(currentXp - floor, 0), span);
  return Math.round((progress / span) * 100);
});

const xpLabel = computed(() => {
  if (!props.selectedCharacter) return '';
  const level = Number(props.selectedCharacter.level ?? 1);
  const currentXp = Number(props.selectedCharacter.xp ?? 0);
  if (level >= MAX_LEVEL) return 'XP: Max';
  const floor = xpRequiredForLevel(level);
  const next = xpRequiredForLevel(level + 1);
  const progress = Math.max(currentXp - floor, 0);
  const span = Math.max(next - floor, 1);
  return `XP: ${progress} / ${span}`;
});

</script>
