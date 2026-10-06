<script setup lang="ts">
import { computed, inject, nextTick, ref, useTemplateRef, watch } from 'vue';
import { PhBroom } from '@phosphor-icons/vue';
import { GAME_KEY, createInertGame } from '../game/context';
import { LEDGER_KEY, createInertLedger } from '../ledger/ledgerContext';
import type { ActionRunner } from '../ledger/actionRunner';
import GoldAmount from '../ledger/GoldAmount.vue';
import InlineConfirm from '../ledger/InlineConfirm.vue';
import JustSold from './JustSold.vue';
import SellQuantity from './SellQuantity.vue';
import { clampSellQuantity, junkSummary, needsQuantity, quantitySale, sellRows } from './vendorModel';
import type { SellRow } from './vendorModel';

// The sell side of the vendor screen (50-UI-SPEC "Your backpack", "Sell all junk confirmation",
// "Mobile vendor > Sell panel"): the backpack table on desktop and list on mobile, Sell on every
// sellable row, Sell all junk behind an inline confirmation that states the count and the gold, and
// the Just sold card. A stack asks how many first, in an inline picker under its row (1, minus, a
// number, plus, All, built on the inline confirmation); a single item sells at once. Every sale
// calls sellItemQuantity. Quest items show a dash and no Sell button. Item names are server text and
// only reach the page as text nodes. Nothing is optimistic: the subscribed rows drive every change.
const props = defineProps<{
  openVendorId: bigint | null;
  vendorNearby: boolean;
  vendorName: string;
  runner: ActionRunner;
  mobile: boolean;
}>();

const game = inject(GAME_KEY, createInertGame());
const ledger = inject(LEDGER_KEY, createInertLedger());

const sellInput = computed(() => {
  const character = game.character.value;
  if (character === null) return null;
  return {
    items: ledger.items.value,
    templates: ledger.templates.value,
    character: { level: character.level, vendorSellMod: character.vendorSellMod },
    perkKeys: game.renownPerks.value.map((perk) => perk.perkKey),
  };
});

const rows = computed<SellRow[]>(() => (sellInput.value ? sellRows(sellInput.value) : []));
const junk = computed(() =>
  sellInput.value ? junkSummary(sellInput.value) : { count: 0, gold: 0n, prompt: '' },
);

// Until the item subscription applies the bag is unknown, so no empty line shows (50-UI-SPEC: empty
// states never flash).
const itemsApplied = computed(() => ledger.itemsApplied.value);
const offline = computed(() => !game.connected.value || ledger.reducers.value === null);
const vendorGone = computed(() => !props.vendorNearby || props.openVendorId === null);
const goneReason = computed(() => `${props.vendorName} is no longer nearby.`);
const REASON_ID = 'sell-reason';

function sellInert(row: SellRow): boolean {
  return offline.value || vendorGone.value || props.runner.isPending(`sell:${row.instanceId}`);
}

const junkPending = computed(() => props.runner.isPending('junk'));
const junkInert = computed(() => offline.value || vendorGone.value || junkPending.value);

const root = useTemplateRef<HTMLElement>('root');
const heading = useTemplateRef<HTMLElement>('heading');
const junkButton = useTemplateRef<HTMLButtonElement>('junkButton');
const confirming = ref(false);

// The quantity picker: at most one is open, exclusive with the Sell all junk confirmation.
const picking = ref<bigint | null>(null);
const pickQty = ref(1n);
const pickOpener = ref<HTMLElement | null>(null);
const pickRow = computed(() => (picking.value === null ? null : rows.value.find((row) => row.instanceId === picking.value) ?? null));
const pickSale = computed(() =>
  sellInput.value && pickRow.value ? quantitySale(sellInput.value, pickRow.value, pickQty.value) : null,
);

function focusLost(): boolean {
  const active = document.activeElement;
  return active === null || active === document.body || !active.isConnected;
}

function focusHeading(): void {
  heading.value?.focus();
}

// A Sell removes its row. Focus goes to the next row's Sell button, else the heading, but only when
// the removal cost the focus its element (the player may have moved on already).
let lastSold: { id: bigint; before: bigint[] } | null = null;

function runSale(row: SellRow, quantity: bigint): Promise<boolean> {
  const reducers = ledger.reducers.value;
  const character = game.character.value;
  if (!reducers || !character || props.openVendorId === null || sellInert(row)) return Promise.resolve(false);
  const characterId = character.id;
  const itemInstanceId = row.instanceId;
  const npcId = props.openVendorId;
  // Only a whole sale removes the row; a partial sale keeps it, so it must not arm the next-row focus.
  if (quantity === row.quantity) {
    lastSold = { id: itemInstanceId, before: rows.value.map((entry) => entry.instanceId) };
  }
  return props.runner.run(`sell:${itemInstanceId}`, () =>
    reducers.sellItemQuantity({ characterId, itemInstanceId, npcId, quantity }),
  );
}

function onSell(row: SellRow, event: MouseEvent): void {
  if (sellInert(row)) return;
  if (needsQuantity(row)) {
    confirming.value = false;
    picking.value = row.instanceId;
    pickQty.value = 1n;
    pickOpener.value = event.currentTarget instanceof HTMLElement ? event.currentTarget : null;
    return;
  }
  void runSale(row, 1n);
}

async function confirmPick(): Promise<void> {
  const row = pickRow.value;
  const sale = pickSale.value;
  if (!row || !sale) return;
  const id = row.instanceId;
  const ok = await runSale(row, sale.quantity);
  if (!ok) return;
  picking.value = null;
  await nextTick();
  if (!focusLost()) return;
  const button = root.value?.querySelector<HTMLElement>(`[data-sell-id="${id}"]`);
  if (button) button.focus();
}

function closePick(): void {
  picking.value = null;
}

function setPickQty(value: bigint): void {
  pickQty.value = value;
}

// The picker follows its row: it closes when the row goes, and the picked quantity follows the stack
// when it shrinks.
watch(rows, (next) => {
  if (picking.value === null) return;
  const row = next.find((entry) => entry.instanceId === picking.value);
  if (!row) {
    picking.value = null;
    return;
  }
  pickQty.value = clampSellQuantity(pickQty.value, row.quantity);
});

watch(
  rows,
  (next) => {
    const sold = lastSold;
    if (sold === null) return;
    if (next.some((entry) => entry.instanceId === sold.id)) return;
    lastSold = null;
    if (!focusLost()) return;
    const index = sold.before.indexOf(sold.id);
    for (const id of sold.before.slice(index + 1)) {
      const row = next.find((entry) => entry.instanceId === id);
      if (!row || !row.canSell) continue;
      const button = root.value?.querySelector<HTMLElement>(`[data-sell-id="${row.instanceId}"]`);
      if (button) {
        button.focus();
        return;
      }
    }
    focusHeading();
  },
  { flush: 'post' },
);

function onJunk(): void {
  if (junk.value.count === 0 || junkInert.value) return;
  picking.value = null;
  confirming.value = true;
}

async function runJunk(): Promise<void> {
  const reducers = ledger.reducers.value;
  const character = game.character.value;
  if (!reducers || !character || junkInert.value) return;
  const characterId = character.id;
  await props.runner.run('junk', () => reducers.sellAllJunk({ characterId }));
  confirming.value = false;
  await nextTick();
  if (focusLost()) focusHeading();
}

// The confirmation closes by itself when there is nothing left to confirm (the junk was sold or
// the vendor went away).
watch(
  () => junk.value.count,
  (count) => {
    if (count === 0) confirming.value = false;
  },
);
watch(vendorGone, (gone) => {
  if (gone) {
    confirming.value = false;
    picking.value = null;
  }
});
</script>

<template>
  <div ref="root" class="sell-panel" :class="{ mobile: props.mobile }">
    <template v-if="!props.mobile">
      <div class="head-row">
        <h6 ref="heading" tabindex="-1">Your backpack</h6>
        <span class="spacer"></span>
        <button
          v-show="!confirming"
          ref="junkButton"
          type="button"
          class="btn btn-secondary row-btn junk-btn"
          :disabled="junk.count === 0"
          :title="junk.count === 0 ? 'No junk to sell' : undefined"
          :aria-disabled="junk.count > 0 && junkInert ? 'true' : undefined"
          :aria-describedby="junk.count > 0 && vendorGone ? REASON_ID : undefined"
          @click="onJunk"
        >
          <PhBroom :size="14" aria-hidden="true" />
          Sell all junk ({{ junk.count }})
        </button>
      </div>
      <InlineConfirm
        v-if="confirming"
        :prompt="junk.prompt"
        confirm-label="Sell junk"
        :pending="junkPending"
        :opener="junkButton"
        @confirm="runJunk"
        @keep="confirming = false"
      />
      <p v-if="vendorGone" :id="REASON_ID" class="reason">{{ goneReason }}</p>

      <div class="table-region">
        <p v-if="itemsApplied && rows.length === 0" class="empty">Nothing in your backpack to sell.</p>
        <table v-else-if="rows.length > 0" class="table sell-table">
          <caption class="sr-only">Your backpack</caption>
          <thead>
            <tr>
              <th scope="col">Item</th>
              <th scope="col" class="num">Value</th>
              <th scope="col"><span class="sr-only">Action</span></th>
            </tr>
          </thead>
          <tbody>
            <template v-for="row in rows" :key="String(row.instanceId)">
            <tr>
              <td class="item-cell">
                <span class="item-line">
                  <span class="item-name" :style="{ color: row.color }" :title="row.name">{{ row.name }}</span>
                  <span v-if="row.quantityText !== ''" class="qty">{{ row.quantityText }}</span>
                  <span v-if="row.junk" class="tag tag-neutral junk-tag">junk</span>
                </span>
                <span v-if="row.subLine !== ''" class="sub">{{ row.subLine }}</span>
              </td>
              <td class="num">
                <GoldAmount v-if="row.value !== null" :amount="row.value" />
                <span v-else class="dash">{{ row.valueText }}</span>
              </td>
              <td class="action-cell">
                <button
                  v-if="row.canSell"
                  type="button"
                  class="btn btn-secondary row-btn sell-btn"
                  :data-sell-id="String(row.instanceId)"
                  :aria-label="row.ariaLabel"
                  :aria-disabled="sellInert(row) ? 'true' : undefined"
                  :aria-describedby="vendorGone ? REASON_ID : undefined"
                  :aria-expanded="needsQuantity(row) ? (picking === row.instanceId ? 'true' : 'false') : undefined"
                  @click="onSell(row, $event)"
                >
                  Sell
                </button>
              </td>
            </tr>
            <tr v-if="picking === row.instanceId && pickSale" class="picker-row">
              <td colspan="3">
                <SellQuantity
                  :max="row.quantity"
                  :model-value="pickSale.quantity"
                  :prompt="pickSale.prompt"
                  :confirm-label="pickSale.confirmLabel"
                  :pending="offline || props.runner.isPending(`sell:${row.instanceId}`)"
                  :opener="pickOpener"
                  @update:model-value="setPickQty"
                  @confirm="confirmPick"
                  @keep="closePick"
                />
              </td>
            </tr>
            </template>
          </tbody>
        </table>
      </div>

      <div class="card-slot">
        <JustSold :open-vendor-id="props.openVendorId" :runner="props.runner" @cleared="focusHeading" />
      </div>
    </template>

    <template v-else>
      <h6 ref="heading" tabindex="-1" class="sr-only">Your backpack</h6>
      <button
        v-show="!confirming"
        ref="junkButton"
        type="button"
        class="btn btn-secondary junk-btn full"
        :disabled="junk.count === 0"
        :title="junk.count === 0 ? 'No junk to sell' : undefined"
        :aria-disabled="junk.count > 0 && junkInert ? 'true' : undefined"
        :aria-describedby="junk.count > 0 && vendorGone ? REASON_ID : undefined"
        @click="onJunk"
      >
        <PhBroom :size="14" aria-hidden="true" />
        Sell all junk ({{ junk.count }})
      </button>
      <InlineConfirm
        v-if="confirming"
        :prompt="junk.prompt"
        confirm-label="Sell junk"
        :pending="junkPending"
        mobile
        :opener="junkButton"
        @confirm="runJunk"
        @keep="confirming = false"
      />
      <p v-if="vendorGone" :id="REASON_ID" class="reason">{{ goneReason }}</p>

      <JustSold mobile :open-vendor-id="props.openVendorId" :runner="props.runner" @cleared="focusHeading" />

      <p v-if="itemsApplied && rows.length === 0" class="empty">Nothing in your backpack to sell.</p>
      <ul v-else-if="rows.length > 0" class="sell-list">
        <template v-for="row in rows" :key="String(row.instanceId)">
        <li class="sell-row">
          <div class="info">
            <span class="item-line">
              <span class="item-name" :style="{ color: row.color }" :title="row.name">{{ row.name }}</span>
              <span v-if="row.quantityText !== ''" class="qty">{{ row.quantityText }}</span>
              <span v-if="row.junk" class="tag tag-neutral junk-tag">junk</span>
            </span>
            <span v-if="row.subLine !== ''" class="sub">{{ row.subLine }}</span>
          </div>
          <span class="value">
            <GoldAmount v-if="row.value !== null" :amount="row.value" />
            <span v-else class="dash">{{ row.valueText }}</span>
          </span>
          <button
            v-if="row.canSell"
            type="button"
            class="btn btn-secondary sell-btn"
            :data-sell-id="String(row.instanceId)"
            :aria-label="row.ariaLabel"
            :aria-disabled="sellInert(row) ? 'true' : undefined"
            :aria-describedby="vendorGone ? REASON_ID : undefined"
            :aria-expanded="needsQuantity(row) ? (picking === row.instanceId ? 'true' : 'false') : undefined"
            @click="onSell(row, $event)"
          >
            Sell
          </button>
        </li>
        <li v-if="picking === row.instanceId && pickSale" class="picker-item">
          <SellQuantity
            mobile
            :max="row.quantity"
            :model-value="pickSale.quantity"
            :prompt="pickSale.prompt"
            :confirm-label="pickSale.confirmLabel"
            :pending="offline || props.runner.isPending(`sell:${row.instanceId}`)"
            :opener="pickOpener"
            @update:model-value="setPickQty"
            @confirm="confirmPick"
            @keep="closePick"
          />
        </li>
        </template>
      </ul>
    </template>
  </div>
</template>

<style scoped>
.sell-panel {
  display: flex;
  flex-direction: column;
  min-height: 0;
  font-variant-numeric: tabular-nums;
}

.sell-panel:not(.mobile) {
  height: 100%;
}

.head-row {
  flex: none;
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 8px;
}

h6 {
  margin: 0;
  color: var(--color-neutral-400);
}

h6:focus-visible {
  outline: 2px solid var(--color-accent);
  outline-offset: 2px;
}

.spacer {
  flex: 1;
}

.row-btn {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  min-height: 32px;
  padding: 4px 8px;
  font-size: 12px;
  font-weight: 500;
}

.btn[aria-disabled='true'],
.btn:disabled {
  opacity: 0.45;
  cursor: default;
}

.reason {
  flex: none;
  margin: 0 0 8px;
  font-size: 12px;
  line-height: 1.5;
  color: var(--color-neutral-400);
  overflow-wrap: anywhere;
}

.empty {
  margin: 0;
  font-size: 12px;
  line-height: 1.5;
  color: var(--color-neutral-500);
}

.table-region {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
}

.sell-table {
  font-size: 12px;
  line-height: 1.5;
}

.sell-table th {
  font-size: 10px;
  letter-spacing: 0.1em;
}

.sell-table th.num,
.sell-table td.num {
  text-align: right;
}

.sell-table td.action-cell {
  width: 1%;
  text-align: right;
  white-space: nowrap;
}

.item-cell {
  min-width: 0;
}

.item-line {
  display: flex;
  align-items: center;
  min-width: 0;
}

.item-name {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.qty {
  flex: none;
  margin-left: 4px;
  color: var(--color-neutral-400);
}

.junk-tag {
  flex: none;
  margin-left: 4px;
  padding: 0 4px;
  font-size: 10px;
}

.sub {
  display: block;
  font-size: 12px;
  color: var(--color-neutral-500);
  overflow-wrap: anywhere;
}

.dash {
  color: var(--color-neutral-600);
}

.card-slot {
  flex: none;
  margin-top: 16px;
}

.sell-panel.mobile {
  gap: 16px;
}

.mobile .junk-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 4px;
  width: 100%;
  min-height: 44px;
  font-size: 12px;
  font-weight: 500;
}

.sell-list {
  display: flex;
  flex-direction: column;
  gap: 16px;
  margin: 0;
  padding: 0;
  list-style: none;
}

.sell-row {
  display: flex;
  align-items: center;
  gap: 16px;
  min-height: 56px;
}

.picker-row td {
  padding: 8px 0;
}

.picker-item {
  padding: 8px 0;
}

.info {
  flex: 1;
  min-width: 0;
  font-size: 12px;
  line-height: 1.5;
}

.value {
  flex: none;
  font-size: 12px;
}

.mobile .sell-btn {
  flex: none;
  min-height: 44px;
  padding: 4px 16px;
  font-size: 12px;
  font-weight: 500;
}

.sr-only {
  position: absolute;
  width: 1px;
  height: 1px;
  overflow: hidden;
  clip-path: inset(50%);
  white-space: nowrap;
}
</style>
