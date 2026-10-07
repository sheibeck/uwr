<script setup lang="ts">
import { computed, inject } from 'vue';
import { PhSortAscending } from '@phosphor-icons/vue';
import { FRAME_KEY, GAME_KEY, createInertFrame, createInertGame } from '../game/context';
import { LEDGER_KEY, createInertLedger } from '../ledger/ledgerContext';
import GoldAmount from '../ledger/GoldAmount.vue';
import { bagRunner } from './bagRunner';

// The Inventory header actions (mock 10a title row, after the spacer): the gold, then Organize.
// Organize is the server's consolidate_stacks (merge partial stacks); the bag is always shown in
// type, rarity, name order, so Organize is the merge plus that sorted view. The runner is shared with
// the Inventory screen (bagRunner), so a pending call and a rejection behave like any bag action and
// the screen's notice line shows the rejection. Nothing is optimistic: the merged rows and the
// server's "Inventory organized" line arrive by subscription. Icon-only on mobile, because the
// mobile mock draws none but merging must not be desktop only.
const game = inject(GAME_KEY, createInertGame());
const ledger = inject(LEDGER_KEY, createInertLedger());
const frame = inject(FRAME_KEY, createInertFrame());

const runner = bagRunner(ledger, game);
const mobile = computed(() => !frame.isDesktop.value);
const ready = computed(() => game.character.value !== null && ledger.itemsApplied.value);
const online = computed(() => game.connected.value && ledger.reducers.value !== null);
const pending = computed(() => runner.isPending('bag-organize'));
const inert = computed(() => !online.value || pending.value);

async function onOrganize(): Promise<void> {
  if (inert.value) return;
  const reducers = ledger.reducers.value;
  const character = game.character.value;
  if (!reducers || !character) return;
  const characterId = character.id;
  await runner.run('bag-organize', () => reducers.consolidateStacks({ characterId }));
}
</script>

<template>
  <span v-if="ready" class="inventory-actions" :class="{ mobile }">
    <GoldAmount :amount="game.character.value!.gold" size="body" />
    <button
      type="button"
      class="btn btn-secondary organize"
      :class="{ 'btn-icon': mobile, mobile }"
      :aria-label="mobile ? 'Organize backpack' : undefined"
      :title="mobile ? 'Organize' : undefined"
      :aria-disabled="inert ? 'true' : undefined"
      :aria-busy="pending ? 'true' : undefined"
      @click="onOrganize"
    >
      <PhSortAscending :size="16" aria-hidden="true" />
      <template v-if="!mobile">Organize</template>
    </button>
  </span>
</template>

<style scoped>
.inventory-actions {
  display: inline-flex;
  align-items: center;
  gap: 8px;
}

.organize {
  padding: 4px 8px;
}

.organize.mobile {
  min-width: 44px;
  min-height: 44px;
  padding: 0;
}

.organize[aria-disabled='true'] {
  opacity: 0.45;
  cursor: default;
}
</style>
