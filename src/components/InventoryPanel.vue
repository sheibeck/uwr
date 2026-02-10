<template>
  <div>
    <div :style="styles.panelSectionTitle">Inventory</div>
    <div v-if="!selectedCharacter" :style="styles.subtle">
      Select a character to manage inventory.
    </div>
    <div v-else :style="styles.panelSplit">
      <div :style="styles.inventoryColumn">
        <div :style="styles.equipmentGrid">
          <div
            v-for="slot in equippedSlots"
            :key="slot.slot"
            :style="styles.equipmentSlotCard"
          >
            <div
              @mouseenter="$emit('show-tooltip', { item: slot, x: $event.clientX, y: $event.clientY })"
              @mousemove="$emit('move-tooltip', { x: $event.clientX, y: $event.clientY })"
              @mouseleave="$emit('hide-tooltip')"
            >
              <div :style="styles.equipmentSlotLabel">{{ formatSlot(slot.slot) }}</div>
              <div :style="styles.equipmentSlotName">{{ slot.name }}</div>
              <span v-if="slot.name !== 'Empty'" :style="styles.subtle">
                ({{ slot.rarity }})
              </span>
            </div>
            <button
              v-if="slot.itemInstanceId"
              :style="styles.ghostButton"
              @click="$emit('unequip', slot.slot)"
            >
              Unequip
            </button>
          </div>
        </div>
      </div>

      <div :style="styles.inventoryColumnWide">
        <div :style="styles.panelSectionTitle">Backpack</div>
        <div :style="styles.subtle">
          Slots: {{ inventoryCount }} / {{ maxInventorySlots }}
        </div>
        <div v-if="inventoryItems.length === 0" :style="styles.subtle">No items.</div>
        <ul v-else :style="styles.list">
          <li v-for="item in inventoryItems" :key="item.id.toString()">
            <div
              @mouseenter="$emit('show-tooltip', { item, x: $event.clientX, y: $event.clientY })"
              @mousemove="$emit('move-tooltip', { x: $event.clientX, y: $event.clientY })"
              @mouseleave="$emit('hide-tooltip')"
            >
              {{ item.name }} ({{ item.rarity }}) - {{ item.slot }}
            </div>
            <div :style="styles.subtle">
              Level {{ item.requiredLevel }} • Allowed: {{ item.allowedClasses || 'any' }}
            </div>
            <button
              v-if="item.equipable"
              :style="styles.primaryButton"
              @click="$emit('equip', item.id)"
            >
              Equip
            </button>
          </li>
        </ul>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import type { CharacterRow } from '../module_bindings';

defineProps<{
  styles: Record<string, Record<string, string | number>>;
  connActive: boolean;
  selectedCharacter: CharacterRow | null;
  equippedSlots: {
    slot: string;
    name: string;
    armorType: string;
    rarity: string;
    tier: bigint;
    isJunk: boolean;
    vendorValue: bigint;
    itemInstanceId: bigint | null;
    stats: { label: string; value: string }[];
    description: string;
  }[];
  inventoryItems: {
    id: bigint;
    name: string;
    slot: string;
    armorType: string;
    rarity: string;
    tier: bigint;
    isJunk: boolean;
    vendorValue: bigint;
    requiredLevel: bigint;
    allowedClasses: string;
    stats: { label: string; value: string }[];
    description: string;
    equipable: boolean;
  }[];
  inventoryCount: number;
  maxInventorySlots: number;
}>();

const formatSlot = (slot: string) =>
  slot
    .replace(/([A-Z])/g, ' $1')
    .replace(/^./, (char) => char.toUpperCase());

defineEmits<{
  (e: 'equip', itemInstanceId: bigint): void;
  (e: 'unequip', slot: string): void;
  (e: 'show-tooltip', value: { item: any; x: number; y: number }): void;
  (e: 'move-tooltip', value: { x: number; y: number }): void;
  (e: 'hide-tooltip'): void;
}>();
</script>
