<template>
  <div>
    <div :style="styles.panelSectionTitle">Trade</div>
    <div v-if="!trade" :style="styles.subtle">No active trade.</div>
    <div v-else :style="styles.tradeGrid">
      <div :style="[styles.tradeSection, myOfferLocked ? styles.tradeSectionLocked : {}]">
        <div :style="styles.subtle">Your Offer</div>
        <div v-if="myOffer.length === 0" :style="styles.subtleSmall">No items offered.</div>
        <ul v-else :style="styles.list">
          <li v-for="row in myOffer" :key="row.id.toString()" :style="styles.tradeRow">
            <span>{{ row.item.name }}<span v-if="row.item.stackable && row.item.quantity > 1n"> x{{ row.item.quantity }}</span></span>
            <button :style="styles.ghostButton" @click="$emit('remove-item', row.id)">Remove</button>
          </li>
        </ul>
        <div v-if="myOfferLocked" :style="styles.subtleSmall">You have offered.</div>
      </div>
      <div :style="[styles.tradeSection, otherOfferLocked ? styles.tradeSectionLocked : {}]">
        <div :style="styles.subtle">Their Offer</div>
        <div v-if="otherOffer.length === 0" :style="styles.subtleSmall">No items offered.</div>
        <ul v-else :style="styles.list">
          <li v-for="row in otherOffer" :key="row.id.toString()" :style="styles.tradeRow">
            <span>{{ row.item.name }}<span v-if="row.item.stackable && row.item.quantity > 1n"> x{{ row.item.quantity }}</span></span>
          </li>
        </ul>
        <div v-if="otherOfferLocked" :style="styles.subtleSmall">They have offered.</div>
      </div>
      <div :style="styles.tradeSection">
        <div :style="styles.subtle">Your Inventory</div>
        <div v-if="inventory.length === 0" :style="styles.subtleSmall">No items to trade.</div>
        <ul v-else :style="styles.list">
          <li v-for="item in inventory" :key="item.id.toString()" :style="styles.tradeRow">
            <span>{{ item.name }}<span v-if="item.stackable && item.quantity > 1n"> x{{ item.quantity }}</span></span>
            <button :style="styles.primaryButton" @click="$emit('add-item', item.id)">Add</button>
          </li>
        </ul>
      </div>
    </div>
    <div v-if="trade" :style="styles.panelFormInline">
      <button :style="styles.primaryButton" @click="$emit('offer')">Offer Trade</button>
      <button :style="styles.ghostButton" @click="$emit('cancel')">Cancel Trade</button>
    </div>
  </div>
</template>

<script setup lang="ts">
import type { TradeSessionRow } from '../module_bindings';

defineProps<{
  styles: Record<string, Record<string, string | number>>;
  trade: TradeSessionRow | null;
  inventory: { id: bigint; name: string; quantity: bigint; stackable: boolean }[];
  myOffer: { id: bigint; item: { name: string; quantity: bigint; stackable: boolean } }[];
  otherOffer: { id: bigint; item: { name: string; quantity: bigint; stackable: boolean } }[];
  myOfferLocked: boolean;
  otherOfferLocked: boolean;
}>();

defineEmits<{
  (e: 'add-item', itemInstanceId: bigint): void;
  (e: 'remove-item', itemInstanceId: bigint): void;
  (e: 'offer'): void;
  (e: 'cancel'): void;
}>();
</script>
