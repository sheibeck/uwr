<script setup lang="ts">
import { computed, inject } from 'vue';
import { PhHammer } from '@phosphor-icons/vue';
import { FRAME_KEY, GAME_KEY, createInertFrame, createInertGame } from '../game/context';
import { LEDGER_KEY, createInertLedger } from '../ledger/ledgerContext';
import { recipesKnownText, stationHere } from './craftingModel';

// The Crafting header meta (50-UI-SPEC "Header"): how many recipes are known and, on desktop, the
// crafting station tag (or that there is none here). The mobile list view carries the station line
// itself, so the sheet meta shows the count only. Rendered by the frame in the drawer and sheet
// #meta slot.
const game = inject(GAME_KEY, createInertGame());
const ledger = inject(LEDGER_KEY, createInertLedger());
const frame = inject(FRAME_KEY, createInertFrame());

const text = computed(() => recipesKnownText(ledger.recipesKnown.value.length));
const station = computed(() => stationHere(game.character.value?.locationId, game.locations.value));
</script>

<template>
  <span v-if="game.character.value" class="crafting-meta">
    <span class="known">{{ text }}</span>
    <template v-if="frame.isDesktop.value">
      <span v-if="station" class="tag tag-accent station">
        <PhHammer :size="12" aria-hidden="true" />
        Crafting station
      </span>
      <span v-else class="no-station">No crafting station here</span>
    </template>
  </span>
</template>

<style scoped>
.crafting-meta {
  display: inline-flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
}

.known {
  font-size: 12px;
  line-height: 1.5;
  color: var(--color-neutral-400);
  font-variant-numeric: tabular-nums;
}

.station {
  gap: 4px;
}

.no-station {
  font-size: 12px;
  line-height: 1.5;
  color: var(--color-neutral-500);
}
</style>
