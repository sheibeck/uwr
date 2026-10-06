<script setup lang="ts">
import { computed, inject } from 'vue';
import { GAME_KEY, createInertGame } from '../game/context';
import { LEDGER_KEY, createInertLedger } from '../ledger/ledgerContext';
import GoldAmount from '../ledger/GoldAmount.vue';

// The Trade header meta (50-UI-SPEC "Vendor out of reach" and "Mobile vendor"): the gold, and a
// warning when the vendor the screen shows is no longer among the NPCs here. The frame renders it in
// the drawer and sheet #meta slot without props, so it reads the vendor the screen registered with
// ledger.setVendor. On mobile this is the only gold display of the screen.
const game = inject(GAME_KEY, createInertGame());
const ledger = inject(LEDGER_KEY, createInertLedger());

const target = computed(() => ledger.vendorTarget.value);
const gone = computed(() => {
  const current = target.value;
  if (current === null) return false;
  return !game.npcsHere.value.some((npc) => npc.id === current.npcId);
});
const warning = computed(() => (target.value ? `${target.value.npcName} is no longer nearby.` : ''));
</script>

<template>
  <span v-if="game.character.value" class="vendor-meta">
    <GoldAmount :amount="game.character.value.gold" size="body" />
    <span v-if="gone" class="gone">{{ warning }}</span>
  </span>
</template>

<style scoped>
.vendor-meta {
  display: inline-flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 16px;
}

.gone {
  font-size: 12px;
  line-height: 1.5;
  color: var(--color-con-orange);
  overflow-wrap: anywhere;
}
</style>
