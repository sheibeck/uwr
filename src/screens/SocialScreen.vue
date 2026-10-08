<script setup lang="ts">
import { inject } from 'vue';
import { PhUsersThree } from '@phosphor-icons/vue';
import { FRAME_KEY, createInertFrame } from '../game/context';
import NoticeLine from '../ledger/NoticeLine.vue';
import PartyBlock from '../rails/PartyBlock.vue';
import EmptyState from './EmptyState.vue';

// Desktop keeps the Phase 45 empty state until Phase 52.2 builds the Social screen (the vitals rail
// already shows the party). On mobile the Party tab opens this sheet, which is the party's mobile
// home (51.1-UI-SPEC "Mobile Party Sheet"): the Party block in its sheet variant, and at the foot a
// NoticeLine that mirrors system and group lines, so party refusals (written by failGroup as private
// kind 'group') are visible while the sheet covers the feed. 52.2 adds the friend kind.
const SHEET_KINDS: ReadonlySet<string> = new Set(['system', 'group']);

const frame = inject(FRAME_KEY, createInertFrame());
</script>

<template>
  <EmptyState v-if="frame.isDesktop.value" :icon="PhUsersThree" title="No friends or party yet." body="This screen is still being built." />
  <div v-else class="social-sheet">
    <PartyBlock variant="sheet" />
    <NoticeLine :kinds="SHEET_KINDS" />
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
