<template>
  <div>
    <div v-if="!selectedCharacter" :style="styles.subtle">Select a character to trade.</div>
    <div v-else-if="!vendor" :style="styles.subtle">Select a vendor to trade.</div>
    <div v-else :style="styles.panelSplit">
      <div :style="styles.inventoryColumnWide">
        <div :style="styles.panelSectionTitle">Inventory</div>
        <div v-if="vendorItems.length === 0" :style="styles.subtle">No items for sale.</div>
        <ul v-else :style="styles.list">
          <li v-for="item in vendorItems" :key="item.id.toString()">
            <div :style="styles.listRow">
              <div
                @mouseenter="$emit('show-tooltip', { item, x: $event.clientX, y: $event.clientY })"
                @mousemove="$emit('move-tooltip', { x: $event.clientX, y: $event.clientY })"
                @mouseleave="$emit('hide-tooltip')"
              >
                <div>
                  <span :style="rarityStyle(item.rarity)">{{ item.name }}</span>
                </div>
                <div :style="styles.subtleSmall">
                  {{ item.slot }} • Tier {{ item.tier }}
                </div>
              </div>
              <div :style="styles.listRow">
                <div :style="styles.goldRow">
                  <span :style="styles.goldDot"></span>
                  {{ item.price }}
                </div>
                <button
                  type="button"
                  :style="styles.primaryButton"
                  @click="$emit('buy', item.templateId)"
                >
                  Buy
                </button>
              </div>
            </div>
          </li>
        </ul>
      </div>
      <div :style="styles.inventoryColumnWide">
        <div :style="styles.inventoryHeaderRow">
          <div :style="styles.panelSectionTitle">Backpack</div>
          <div :style="styles.goldRow">
            <span :style="styles.goldDot"></span>
            {{ selectedCharacter.gold }}
          </div>
        </div>
        <div :style="styles.panelFormInline">
          <button type="button" :style="styles.ghostButton" @click="$emit('sell-all-junk')">
            Sell All Junk
          </button>
        </div>
        <div v-if="inventoryItems.length === 0" :style="styles.subtle">No items to sell.</div>
        <ul v-else :style="styles.list">
          <li v-for="item in inventoryItems" :key="item.id.toString()">
            <div :style="styles.listRow">
              <div
                @mouseenter="$emit('show-tooltip', { item, x: $event.clientX, y: $event.clientY })"
                @mousemove="$emit('move-tooltip', { x: $event.clientX, y: $event.clientY })"
                @mouseleave="$emit('hide-tooltip')"
              >
                <div>
                  <span :style="rarityStyle(item.qualityTier)">{{ item.name }}</span>
                </div>
                <div :style="styles.subtleSmall">
                  {{ item.slot }} • Value {{ item.vendorValue }}
                </div>
              </div>
              <button
                type="button"
                :style="styles.ghostButton"
                @click="$emit('sell', item.id)"
              >
                Sell
              </button>
            </div>
          </li>
        </ul>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import type { CharacterRow, NpcRow } from '../stdb-types';

const props = defineProps<{
  styles: Record<string, Record<string, string | number>>;
  selectedCharacter: CharacterRow | null;
  vendor: NpcRow | null;
  vendorItems: {
    id: bigint;
    templateId: bigint;
    price: bigint;
    name: string;
    rarity: string;
    tier: bigint;
    slot: string;
    armorType: string;
    allowedClasses: string;
    description: string;
    stats: { label: string; value: string }[];
  }[];
  inventoryItems: {
    id: bigint;
    name: string;
    slot: string;
    armorType: string;
    rarity: string;
    qualityTier: string;
    tier: bigint;
    isJunk: boolean;
    vendorValue: bigint;
    requiredLevel: bigint;
    allowedClasses: string;
    stats: { label: string; value: string }[];
    description: string;
    equipable: boolean;
  }[];
}>();

const rarityStyle = (rarity: string) => {
  const key = (rarity ?? 'common').toLowerCase();
  const map: Record<string, string> = {
    common: 'rarityCommon',
    uncommon: 'rarityUncommon',
    rare: 'rarityRare',
    epic: 'rarityEpic',
    legendary: 'rarityLegendary',
  };
  return (props.styles as any)[map[key] ?? 'rarityCommon'] ?? {};
};

defineEmits<{
  (e: 'buy', itemTemplateId: bigint): void;
  (e: 'sell', itemInstanceId: bigint): void;
  (e: 'sell-all-junk'): void;
  (e: 'show-tooltip', value: { item: any; x: number; y: number }): void;
  (e: 'move-tooltip', value: { x: number; y: number }): void;
  (e: 'hide-tooltip'): void;
}>();
</script>
