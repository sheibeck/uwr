<script setup lang="ts">
import { computed, inject, ref, watch } from 'vue';
import { GAME_KEY, createInertGame } from '../game/context';
import { LEDGER_KEY, createInertLedger } from '../ledger/ledgerContext';
import type { ActionRunner } from '../ledger/actionRunner';
import FilterChips from '../ledger/FilterChips.vue';
import GoldAmount from '../ledger/GoldAmount.vue';
import { FOR_SALE_FILTERS, forSaleEmptyText, forSaleRows } from './vendorModel';
import type { ForSaleFilterId, ForSaleInput, ForSaleRow, VendorSnapshot } from './vendorModel';

// The For sale side of the vendor screen (50-UI-SPEC "For sale", "Mobile vendor > Buy panel"): the
// open vendor's stock with the server's final prices, the All and Usable by you filters and Buy.
// Prices, usability and the Not enough gold and Backpack full reasons come from the vendor model
// (the server's own shared rules). A level-short or class-unusable row keeps an enabled Buy under
// All; Usable by you hides class-unusable rows only. Item names are server text and only reach the
// page as text nodes. Nothing is optimistic: the subscribed rows drive every change. Stock is
// finite: each name carries its '×n' as a text node, and a listing at 0 keeps its place and reads
// 'Sold out' as the model reason, so the existing aria-disabled and aria-describedby rules apply.
const props = defineProps<{
  vendor: VendorSnapshot;
  vendorNearby: boolean;
  runner: ActionRunner;
  mobile: boolean;
  /** The screen bumps this on a new vendor target; the filter returns to All. */
  resetKey?: number;
}>();

const game = inject(GAME_KEY, createInertGame());
const ledger = inject(LEDGER_KEY, createInertLedger());

const filter = ref<ForSaleFilterId>('all');
watch(
  () => props.resetKey,
  () => {
    filter.value = 'all';
  },
);

const offline = computed(() => !game.connected.value || ledger.reducers.value === null);

const input = computed<ForSaleInput | null>(() => {
  const character = game.character.value;
  if (character === null) return null;
  return {
    stock: ledger.vendorStock.value.filter((row) => row.npcId === props.vendor.id),
    templates: ledger.templates.value,
    items: ledger.items.value,
    character,
    perkKeys: game.renownPerks.value.map((perk) => perk.perkKey),
    filter: filter.value,
  };
});

// Nothing renders until the stock subscription applies: a vendor's stock is always empty for a
// moment after the vendor target changes, and that must not read as "nothing for sale".
const stockApplied = computed(() => ledger.vendorStockApplied.value);
const rows = computed<ForSaleRow[]>(() => (input.value && stockApplied.value ? forSaleRows(input.value) : []));
const emptyText = computed(() =>
  input.value && stockApplied.value ? forSaleEmptyText(input.value, props.vendor.name) : null,
);

const goneReason = computed(() => `${props.vendor.name} is no longer nearby.`);

function reasonOf(row: ForSaleRow): string | null {
  if (!props.vendorNearby) return goneReason.value;
  return row.reason;
}

function reasonId(row: ForSaleRow): string {
  return `buy-reason-${row.key}`;
}

function inert(row: ForSaleRow): boolean {
  return offline.value || reasonOf(row) !== null || props.runner.isPending(`buy:${row.key}`);
}

function onBuy(row: ForSaleRow): void {
  const reducers = ledger.reducers.value;
  const character = game.character.value;
  if (!reducers || !character || inert(row)) return;
  const characterId = character.id;
  // The row key is the listing id: the server takes the unit from exactly that listing (its quality
  // tier, its stock), never from another row of the same template.
  const listingId = row.key;
  void props.runner.run(`buy:${listingId}`, () => reducers.buyListing({ characterId, listingId }));
}

function setFilter(id: string): void {
  filter.value = id as ForSaleFilterId;
}
</script>

<template>
  <div class="for-sale" :class="{ mobile: props.mobile }">
    <div class="head-row">
      <h6 :class="{ 'sr-only': props.mobile }">For sale</h6>
      <span class="spacer"></span>
      <FilterChips
        :options="FOR_SALE_FILTERS"
        :model-value="filter"
        group-label="For sale filter"
        :mobile="props.mobile"
        :disabled="offline"
        @update:model-value="setFilter"
      />
    </div>

    <div class="rows-region" :aria-busy="stockApplied ? undefined : 'true'">
      <p v-if="emptyText" class="empty">{{ emptyText }}</p>

      <table v-else-if="!props.mobile && rows.length > 0" class="table sale-table">
        <caption class="sr-only">For sale</caption>
        <thead>
          <tr>
            <th scope="col">Item</th>
            <th scope="col" class="slot-col">Slot</th>
            <th scope="col" class="num">Price</th>
            <th scope="col"><span class="sr-only">Action</span></th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="row in rows" :key="String(row.key)">
            <td class="item-cell">
              <span class="item-line">
                <span class="item-name" :style="{ color: row.color }" :title="row.name">{{ row.name }}</span>
                <span v-if="row.quantityText !== ''" class="qty">{{ row.quantityText }}</span>
              </span>
              <span class="sub">
                {{ row.subLine }}
                <span v-if="reasonOf(row)" :id="reasonId(row)" class="reason"> · {{ reasonOf(row) }}</span>
              </span>
            </td>
            <td class="slot-col slot-cell">{{ row.slotText }}</td>
            <td class="num"><GoldAmount :amount="row.price" :tone="row.priceTone" /></td>
            <td class="action-cell">
              <button
                type="button"
                class="btn btn-primary row-btn buy-btn"
                :aria-label="row.ariaLabel"
                :aria-disabled="inert(row) ? 'true' : undefined"
                :aria-describedby="reasonOf(row) ? reasonId(row) : undefined"
                @click="onBuy(row)"
              >
                Buy
              </button>
            </td>
          </tr>
        </tbody>
      </table>

      <ul v-else-if="props.mobile && rows.length > 0" class="sale-list">
        <li v-for="row in rows" :key="String(row.key)" class="sale-row">
          <div class="info">
            <span class="item-line">
              <span class="item-name" :style="{ color: row.color }" :title="row.name">{{ row.name }}</span>
              <span v-if="row.quantityText !== ''" class="qty">{{ row.quantityText }}</span>
            </span>
            <span class="sub">
              {{ row.subLine }}
              <span v-if="reasonOf(row)" :id="reasonId(row)" class="reason"> · {{ reasonOf(row) }}</span>
            </span>
          </div>
          <span class="price"><GoldAmount :amount="row.price" :tone="row.priceTone" /></span>
          <button
            type="button"
            class="btn btn-primary buy-btn"
            :aria-label="row.ariaLabel"
            :aria-disabled="inert(row) ? 'true' : undefined"
            :aria-describedby="reasonOf(row) ? reasonId(row) : undefined"
            @click="onBuy(row)"
          >
            Buy
          </button>
        </li>
      </ul>
    </div>
  </div>
</template>

<style scoped>
.for-sale {
  display: flex;
  flex-direction: column;
  min-height: 0;
  font-variant-numeric: tabular-nums;
}

.for-sale:not(.mobile) {
  height: 100%;
}

.head-row {
  flex: none;
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 8px;
}

.mobile .head-row {
  margin-bottom: 0;
}

h6 {
  margin: 0;
  color: var(--color-neutral-400);
}

.spacer {
  flex: 1;
}

.mobile .spacer {
  display: none;
}

.rows-region {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
}

.mobile .rows-region {
  overflow-y: visible;
}

.empty {
  margin: 0;
  font-size: 12px;
  line-height: 1.5;
  color: var(--color-neutral-500);
}

.sale-table {
  font-size: 12px;
  line-height: 1.5;
}

.sale-table th {
  font-size: 10px;
  letter-spacing: 0.1em;
}

.sale-table th.num,
.sale-table td.num {
  text-align: right;
}

.sale-table td.action-cell {
  width: 1%;
  text-align: right;
  white-space: nowrap;
}

/* The Slot column shows from 1200px; the sub-line already carries the type below that. */
.slot-col {
  display: none;
}

@media (min-width: 1200px) {
  .slot-col {
    display: table-cell;
    width: 88px;
  }
}

.slot-cell {
  color: var(--color-neutral-400);
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

.sub {
  display: block;
  font-size: 12px;
  color: var(--color-neutral-500);
  overflow-wrap: anywhere;
}

.reason {
  color: var(--color-neutral-400);
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

.btn[aria-disabled='true'] {
  opacity: 0.45;
  cursor: default;
}

.sale-list {
  display: flex;
  flex-direction: column;
  gap: 16px;
  margin: 0;
  padding: 0;
  list-style: none;
}

.sale-row {
  display: flex;
  align-items: center;
  gap: 16px;
  min-height: 56px;
}

.info {
  flex: 1;
  min-width: 0;
  font-size: 12px;
  line-height: 1.5;
}

.price {
  flex: none;
  font-size: 12px;
}

.mobile .buy-btn {
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
