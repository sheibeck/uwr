<script setup lang="ts">
import { computed, inject } from 'vue';
import { PhArrowFatUp } from '@phosphor-icons/vue';
import { GAME_KEY, createInertGame } from '../game/context';
import { statsMetaText } from './statsModel';

// The Stats header meta (50-UI-SPEC Stats "Header"): name, level, XP and the bind point, followed by
// a non-interactive tag while levels are pending (assumption A17: the level-up flow is not part of
// this phase, so there is no button). Rendered by the frame in the drawer and sheet #meta slot.
const game = inject(GAME_KEY, createInertGame());

const text = computed(() => {
  const character = game.character.value;
  return character ? statsMetaText(character, game.locations.value) : '';
});
const levelUp = computed(() => (game.character.value?.pendingLevels ?? 0n) > 0n);
</script>

<template>
  <span v-if="game.character.value" class="stats-meta">
    <span class="meta-text">{{ text }}</span>
    <span v-if="levelUp" class="tag tag-outline level-up">
      <PhArrowFatUp :size="12" aria-hidden="true" />
      Level up available
    </span>
  </span>
</template>

<style scoped>
.stats-meta {
  display: inline-flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
}

.meta-text {
  font-size: 12px;
  line-height: 1.5;
  color: var(--color-neutral-400);
  font-variant-numeric: tabular-nums;
}

.level-up {
  display: inline-flex;
  align-items: center;
  gap: 4px;
}
</style>
