<script setup lang="ts">
import { computed, inject, watch } from 'vue';
import { PhArrowCounterClockwise } from '@phosphor-icons/vue';
import { GAME_KEY, createInertGame } from '../game/context';
import { LEDGER_KEY, createInertLedger } from '../ledger/ledgerContext';
import type { ActionRunner } from '../ledger/actionRunner';
import GoldAmount from '../ledger/GoldAmount.vue';
import { buybackCard } from './vendorModel';

// The Just sold card (50-UI-SPEC "Buy-back"): the character's last single sale with a Buy back
// button. The card comes only from the per-sender last-sale row (ledger.lastSale), so a second sale
// shows the newer item and a cleared row removes the card. Buy back sends only the character id: the
// server reads the price, the item and the place from its own row. Item names are server text and
// only reach the page as text nodes. Nothing is optimistic.
const props = withDefaults(
  defineProps<{
    /** The vendor the screen shows; the sale must have happened with that vendor, at this place. */
    openVendorId: bigint | null;
    runner: ActionRunner;
    mobile?: boolean;
  }>(),
  { mobile: false },
);
const emit = defineEmits<{ cleared: [] }>();

const game = inject(GAME_KEY, createInertGame());
const ledger = inject(LEDGER_KEY, createInertLedger());

const card = computed(() =>
  buybackCard(
    ledger.lastSale.value,
    game.character.value,
    props.openVendorId,
    ledger.items.value,
    ledger.templates.value,
    // Until the stock subscription applies, no sold state can flash: the card stays as the server order allows.
    ledger.vendorStockApplied.value ? ledger.vendorStock.value : null,
  ),
);

const offline = computed(() => !game.connected.value || ledger.reducers.value === null);
const pending = computed(() => props.runner.isPending('buyback'));
const inert = computed(() => offline.value || pending.value || card.value === null || card.value.state !== 'ready');

const REASON_ID = 'just-sold-reason';

// 'idle' | 'inflight' | 'ok': what this component's own Buy back call has done. The row can clear
// before or after the call's promise settles, so both orders end in one 'cleared' event.
let attempt: 'idle' | 'inflight' | 'ok' = 'idle';
let clearedDuringCall = false;

async function onBuyBack(): Promise<void> {
  const reducers = ledger.reducers.value;
  const character = game.character.value;
  if (!reducers || !character || inert.value) return;
  const characterId = character.id;
  attempt = 'inflight';
  clearedDuringCall = false;
  const ok = await props.runner.run('buyback', () => reducers.buybackLastSale({ characterId }));
  if (!ok) {
    attempt = 'idle';
    return;
  }
  if (clearedDuringCall) {
    attempt = 'idle';
    emit('cleared');
    return;
  }
  attempt = 'ok';
}

watch(
  () => ledger.lastSale.value,
  (next, previous) => {
    if (previous === null || next !== null) return;
    if (attempt === 'ok') {
      attempt = 'idle';
      emit('cleared');
    } else if (attempt === 'inflight') {
      clearedDuringCall = true;
    }
  },
);
</script>

<template>
  <div v-if="card" class="card just-sold" :class="{ mobile: props.mobile }">
    <span class="card-kicker">Just sold</span>
    <div class="line">
      <span class="name" :style="{ color: card.color }" :title="card.name">{{ card.name }}</span>
      <GoldAmount :amount="card.price" delta />
      <span class="spacer"></span>
      <button
        type="button"
        class="btn btn-secondary buyback"
        :aria-label="card.ariaLabel"
        :aria-disabled="inert ? 'true' : undefined"
        :aria-describedby="card.reason ? REASON_ID : undefined"
        @click="onBuyBack"
      >
        <PhArrowCounterClockwise :size="14" aria-hidden="true" />
        Buy back
      </button>
    </div>
    <p v-if="card.reason" :id="REASON_ID" class="reason">{{ card.reason }}</p>
  </div>
</template>

<style scoped>
.just-sold {
  gap: 4px;
  background: var(--color-bg);
  font-variant-numeric: tabular-nums;
}

.line {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
  font-size: 12px;
  line-height: 1.5;
  color: var(--color-neutral-300);
}

.name {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.spacer {
  flex: 1;
}

.buyback {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  min-height: 32px;
  padding: 4px 8px;
  font-size: 12px;
  font-weight: 500;
}

.mobile .buyback {
  min-height: 44px;
}

.buyback[aria-disabled='true'] {
  opacity: 0.45;
  cursor: default;
}

.reason {
  margin: 0;
  font-size: 12px;
  line-height: 1.5;
  color: var(--color-neutral-400);
  overflow-wrap: anywhere;
}
</style>
