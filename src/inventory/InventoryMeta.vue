<script setup lang="ts">
import { computed, inject } from 'vue';
import { FRAME_KEY, GAME_KEY, createInertFrame, createInertGame } from '../game/context';
import { LEDGER_KEY, createInertLedger } from '../ledger/ledgerContext';
import { slotMetaText, slotUsage } from './backpack';

// The Inventory header meta (50-UI-SPEC "Header"): the slot count against the server's capacity
// ("{used} / 50 slots", mock 10a), rendered by the frame in the drawer and sheet #meta slot. Full
// turns the count orange. The gold and Organize are InventoryActions, after the header spacer.
// Nothing renders until the items subscription has applied, so a count never flashes.
const game = inject(GAME_KEY, createInertGame());
const ledger = inject(LEDGER_KEY, createInertLedger());
const frame = inject(FRAME_KEY, createInertFrame());

const usage = computed(() => slotUsage(ledger.items.value));
const text = computed(() => slotMetaText(usage.value, !frame.isDesktop.value));
const ready = computed(() => game.character.value !== null && ledger.itemsApplied.value);
</script>

<template>
  <span v-if="ready" class="inventory-meta">
    <span class="slots" :class="{ full: usage.full }">{{ text }}</span>
  </span>
</template>

<style scoped>
.inventory-meta {
  display: inline-flex;
  align-items: center;
}

.slots {
  font-size: 12px;
  line-height: 1.5;
  color: var(--color-neutral-400);
  font-variant-numeric: tabular-nums;
}

.slots.full {
  color: var(--color-con-orange);
}
</style>
