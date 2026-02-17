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
              <div :style="[styles.equipmentSlotName, slot.name !== 'Empty' ? rarityStyle(slot.qualityTier) : {}]">
                {{ slot.name }}
              </div>
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
          <button
            :style="[styles.ghostButton, combatLocked ? styles.disabledButton : {}]"
            :disabled="combatLocked"
            @click="$emit('organize')"
          >
            Organize
          </button>
          <div v-if="selectedCharacter" :style="styles.goldRow">
            <span :style="styles.goldDot"></span>
            {{ selectedCharacter.gold }}
          </div>
        </div>
        <div :style="styles.subtle">
          Slots: {{ inventoryCount }} / {{ maxInventorySlots }}
        </div>
        <div :style="styles.bagGrid">
          <div
            v-for="(slot, idx) in bagSlots"
            :key="idx"
            :style="slot ? { ...styles.bagSlot, ...styles.bagSlotFilled, ...qualityBorderStyle(slot.qualityTier) } : styles.bagSlot"
            @contextmenu.prevent="slot && openItemContextMenu($event, slot)"
            @mouseenter="slot && $emit('show-tooltip', { item: slot, x: $event.clientX, y: $event.clientY })"
            @mousemove="slot && $emit('move-tooltip', { x: $event.clientX, y: $event.clientY })"
            @mouseleave="slot && $emit('hide-tooltip')"
          >
            <template v-if="slot">
              <div :style="styles.bagSlotSlotLabel">{{ slot.slot }}</div>
              <div :style="[styles.bagSlotName, rarityStyle(slot.qualityTier)]">{{ slot.name }}</div>
              <span v-if="slot.stackable && slot.quantity > 1n" :style="styles.bagSlotQuantity">
                x{{ slot.quantity }}
              </span>
            </template>
          </div>
        </div>
      </div>
    </div>
    <ContextMenu
      :visible="contextMenu.visible"
      :x="contextMenu.x"
      :y="contextMenu.y"
      :title="contextMenu.title"
      :subtitle="contextMenu.subtitle"
      :items="contextMenu.items"
      :styles="styles"
      @close="closeContextMenu"
    />
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue';
import type { CharacterRow } from '../module_bindings';
import ContextMenu from './ContextMenu.vue';

const GEAR_SLOTS = new Set([
  'head', 'chest', 'wrists', 'hands', 'belt', 'legs', 'boots',
  'earrings', 'neck', 'cloak', 'mainHand', 'offHand',
]);

const props = defineProps<{
  styles: Record<string, Record<string, string | number>>;
  connActive: boolean;
  selectedCharacter: CharacterRow | null;
  equippedSlots: {
    slot: string;
    name: string;
    armorType: string;
    rarity: string;
    qualityTier: string;
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
    qualityTier: string;
    tier: bigint;
    isJunk: boolean;
    vendorValue: bigint;
    requiredLevel: bigint;
    allowedClasses: string;
    stats: { label: string; value: string }[];
    affixStats: { label: string; value: string; affixName: string }[];
    description: string;
    equipable: boolean;
    usable: boolean;
    eatable: boolean;
    quantity: bigint;
    stackable: boolean;
    isNamed: boolean;
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

const qualityBorderStyle = (quality: string) => {
  const key = (quality ?? 'common').toLowerCase();
  const map: Record<string, string> = {
    common: 'qualityBorderCommon',
    uncommon: 'qualityBorderUncommon',
    rare: 'qualityBorderRare',
    epic: 'qualityBorderEpic',
    legendary: 'qualityBorderLegendary',
  };
  const borderColor = ((props.styles as any)[map[key] ?? 'qualityBorderCommon'] ?? {}).borderColor;
  if (!borderColor) return {};
  return { border: `2px solid ${borderColor}` };
};

const emit = defineEmits<{
  (e: 'equip', itemInstanceId: bigint): void;
  (e: 'unequip', slot: string): void;
  (e: 'use-item', itemInstanceId: bigint): void;
  (e: 'eat-food', itemInstanceId: bigint): void;
  (e: 'delete-item', itemInstanceId: bigint): void;
  (e: 'split-stack', itemInstanceId: bigint, quantity: bigint): void;
  (e: 'salvage-item', itemInstanceId: bigint): void;
  (e: 'organize'): void;
  (e: 'show-tooltip', value: { item: any; x: number; y: number }): void;
  (e: 'move-tooltip', value: { x: number; y: number }): void;
  (e: 'hide-tooltip'): void;
}>();

const contextMenu = ref<{
  visible: boolean;
  x: number;
  y: number;
  title: string;
  subtitle: string;
  items: Array<{ label: string; disabled?: boolean; action: () => void }>;
}>({
  visible: false,
  x: 0,
  y: 0,
  title: '',
  subtitle: '',
  items: [],
});

const closeContextMenu = () => {
  contextMenu.value.visible = false;
};

const openItemContextMenu = (event: MouseEvent, item: typeof props.inventoryItems[0]) => {
  const items: Array<{ label: string; disabled?: boolean; action: () => void }> = [];
  if (item.equipable) {
    items.push({ label: 'Equip', disabled: props.combatLocked, action: () => emit('equip', item.id) });
  }
  if (item.usable) {
    items.push({ label: 'Use', action: () => emit('use-item', item.id) });
  }
  if (item.eatable) {
    items.push({ label: 'Eat', action: () => emit('eat-food', item.id) });
  }
  if (item.stackable && item.quantity > 1n) {
    items.push({
      label: 'Split',
      action: () => {
        const max = Number(item.quantity) - 1;
        const input = window.prompt(`Split how many? (1-${max})`, String(Math.floor(max / 2) || 1));
        if (input === null) return;
        const qty = parseInt(input, 10);
        if (isNaN(qty) || qty < 1 || qty > max) return;
        emit('split-stack', item.id, BigInt(qty));
      },
    });
  }
  // Salvage option for unequipped gear items only
  if (GEAR_SLOTS.has(item.slot) && !item.isJunk) {
    items.push({
      label: 'Salvage',
      action: () => {
        if (window.confirm(`Salvage ${item.name}? You will receive gold. This cannot be undone.`)) {
          emit('salvage-item', item.id);
        }
      },
    });
  }
  items.push({
    label: 'Delete',
    action: () => {
      const desc = item.stackable && item.quantity > 1n
        ? `${item.name} x${item.quantity}`
        : item.name;
      if (window.confirm(`Delete ${desc}? This cannot be undone.`)) {
        emit('delete-item', item.id);
      }
    },
  });
  contextMenu.value = {
    visible: true,
    x: event.clientX,
    y: event.clientY,
    title: item.name,
    subtitle: `${item.qualityTier} ${item.slot}`,
    items,
  };
};

const bagSlots = computed(() => {
  const slots: Array<typeof props.inventoryItems[0] | null> = [];
  for (const item of props.inventoryItems) {
    slots.push(item);
  }
  while (slots.length < props.maxInventorySlots) {
    slots.push(null);
  }
  return slots;
});
</script>

