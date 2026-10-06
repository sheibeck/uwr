<script setup lang="ts">
import { inject } from 'vue';
import { PhUsersThree } from '@phosphor-icons/vue';
import { FRAME_KEY, GAME_KEY, createInertFrame, createInertGame } from '../game/context';
import PartyBlock from '../rails/PartyBlock.vue';
import EmptyState from './EmptyState.vue';

// Desktop keeps the Phase 45 empty state (the vitals rail already shows the party). On mobile the
// sheet opens with the Party block, and the empty state stays under it only outside a party (CON-03).
const frame = inject(FRAME_KEY, createInertFrame());
const game = inject(GAME_KEY, createInertGame());
</script>

<template>
  <EmptyState v-if="frame.isDesktop.value" :icon="PhUsersThree" title="No friends or party yet." body="This screen is still being built." />
  <div v-else class="social-sheet">
    <PartyBlock />
    <EmptyState v-if="game.group.value === null" :icon="PhUsersThree" title="No friends or party yet." body="This screen is still being built." />
  </div>
</template>

<style scoped>
.social-sheet {
  display: flex;
  flex-direction: column;
  gap: 16px;
  min-width: 0;
}
</style>
