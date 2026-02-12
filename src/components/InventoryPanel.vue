<template>
  <div :style="styles.panelBody">
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
              <div :style="[styles.equipmentSlotName, rarityStyle(slot.rarity)]">
                {{ slot.name }}
              </div>
              <span v-if="slot.name !== 'Empty'" :style="styles.subtle">
                ({{ slot.rarity }})
              </span>
            </div>
            <button
              v-if="slot.itemInstanceId"
              :style="[styles.ghostButton, combatLocked ? styles.disabledButton : {}]"
              :disabled="combatLocked"
              @click="$emit('unequip', slot.slot)"
            >
              Unequip
            </button>
          </div>
        </div>
      </div>

      <div :style="styles.inventoryColumnWide">
        <div :style="styles.inventoryHeaderRow">
          <div :style="styles.panelSectionTitle">Backpack</div>
          <div v-if="selectedCharacter" :style="styles.goldRow">
            <span :style="styles.goldDot"></span>
            {{ selectedCharacter.gold }}
          </div>
        </div>
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
              <span :style="rarityStyle(item.rarity)">{{ item.name }}</span>
              <span v-if="item.stackable && item.quantity > 1n" :style="styles.subtle">
                x{{ item.quantity }}
              </span>
              ({{ item.rarity }}) - {{ item.slot }}
            </div>
            <div :style="styles.subtle">
              Level {{ item.requiredLevel }} • Allowed: {{ item.allowedClasses || 'any' }}
            </div>
            <button
              v-if="item.usable"
              :style="styles.primaryButton"
              @click="$emit('use-item', item.id)"
            >
              Use
            </button>
            <button
              v-if="item.eatable"
              :style="styles.primaryButton"
              @click="$emit('eat-food', item.id)"
            >
              Eat
            </button>
            <button
              v-if="item.equipable"
              :style="[styles.primaryButton, combatLocked ? styles.disabledButton : {}]"
              :disabled="combatLocked"
              @click="$emit('equip', item.id)"
            >
              Equip
            </button>
            <button
              :style="styles.ghostButton"
              @click="$emit('delete-item', item.id)"
            >
              Delete
            </button>
          </li>
        </ul>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import type { CharacterRow } from '../module_bindings';

const props = defineProps<{
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
    usable: boolean;
    eatable: boolean;
    quantity: bigint;
    stackable: boolean;
  }[];
  inventoryCount: number;
  maxInventorySlots: number;
  combatLocked: boolean;
}>();

const formatSlot = (slot: string) =>
  slot
    .replace(/([A-Z])/g, ' $1')
    .replace(/^./, (char) => char.toUpperCase());

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
  (e: 'equip', itemInstanceId: bigint): void;
  (e: 'unequip', slot: string): void;
  (e: 'use-item', itemInstanceId: bigint): void;
  (e: 'eat-food', itemInstanceId: bigint): void;
  (e: 'delete-item', itemInstanceId: bigint): void;
  (e: 'show-tooltip', value: { item: any; x: number; y: number }): void;
  (e: 'move-tooltip', value: { x: number; y: number }): void;
  (e: 'hide-tooltip'): void;
}>();
</script>

