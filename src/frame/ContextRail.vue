<script setup lang="ts">
import { computed, inject } from 'vue';
import ContextContent from '../rails/ContextContent.vue';
import EncounterPanel from '../combat/EncounterPanel.vue';
import { GAME_KEY, createInertGame } from '../game/context';

// While game.combat.active the rail is the Encounter panel (48-UI-SPEC, CMB-01); the context
// content comes back the moment the fight ends. ContextContent itself is untouched because the
// mobile Map sheet reuses it.
const game = inject(GAME_KEY, createInertGame());
const inCombat = computed(() => game.combat.active.value);
</script>

<template>
  <aside class="context-rail" aria-label="Context">
    <EncounterPanel v-if="inCombat" />
    <ContextContent v-else />
  </aside>
</template>

<style scoped>
.context-rail {
  width: 288px;
  flex-shrink: 0;
  display: flex;
  flex-direction: column;
  gap: 16px;
  padding: 16px;
  min-height: 0;
  overflow-y: auto;
  background: color-mix(in srgb, var(--color-surface) 30%, transparent);
}
</style>
