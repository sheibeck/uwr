<template>
  <!-- Tab bar — matches NpcDialogPanel / Journal pattern -->
  <div :style="{ display: 'flex', gap: '0', borderBottom: '1px solid rgba(255,255,255,0.1)', marginBottom: '8px' }">
    <button
      type="button"
      @click="activeTab = 'inventory'"
      :style="{
        background: activeTab === 'inventory' ? 'rgba(255,255,255,0.08)' : 'transparent',
        borderBottom: activeTab === 'inventory' ? '2px solid #60a5fa' : '2px solid transparent',
        padding: '8px 16px',
        cursor: 'pointer',
        color: activeTab === 'inventory' ? '#fff' : '#d1d5db',
        fontSize: '0.85rem',
        fontWeight: 600,
        border: 'none',
        outline: 'none',
      }"
    >Inventory</button>
    <button
      type="button"
      @click="activeTab = 'stats'"
      :style="{
        background: activeTab === 'stats' ? 'rgba(255,255,255,0.08)' : 'transparent',
        borderBottom: activeTab === 'stats' ? '2px solid #60a5fa' : '2px solid transparent',
        padding: '8px 16px',
        cursor: 'pointer',
        color: activeTab === 'stats' ? '#fff' : '#d1d5db',
        fontSize: '0.85rem',
        fontWeight: 600,
        border: 'none',
        outline: 'none',
      }"
    >Stats</button>
  </div>

  <!-- Inventory tab -->
  <InventoryPanel
    v-if="activeTab === 'inventory'"
    :styles="styles"
    :conn-active="connActive"
    :selected-character="selectedCharacter"
    :equipped-slots="equippedSlots"
    :inventory-items="inventoryItems"
    :inventory-count="inventoryCount"
    :max-inventory-slots="maxInventorySlots"
    :combat-locked="combatLocked"
    @equip="$emit('equip', $event)"
    @unequip="$emit('unequip', $event)"
    @use-item="$emit('use-item', $event)"
    @eat-food="$emit('eat-food', $event)"
    @delete-item="$emit('delete-item', $event)"
    @split-stack="$emit('split-stack', $event)"
    @organize="$emit('organize')"
    @salvage-item="$emit('salvage-item', $event)"
    @show-tooltip="$emit('show-tooltip', $event)"
    @move-tooltip="$emit('move-tooltip', $event)"
    @hide-tooltip="$emit('hide-tooltip')"
  />

  <!-- Stats tab -->
  <StatsPanel
    v-else-if="activeTab === 'stats'"
    :styles="styles"
    :selected-character="selectedCharacter"
    :stat-bonuses="statBonuses"
    :locations="locations"
    :regions="regions"
  />
</template>

<script setup lang="ts">
import { ref } from 'vue';
import InventoryPanel from './InventoryPanel.vue';
import StatsPanel from './StatsPanel.vue';

const props = defineProps<{
  styles: Record<string, Record<string, string | number>>;
  connActive: boolean;
  selectedCharacter: any;
  equippedSlots: any[];
  inventoryItems: any[];
  inventoryCount: number;
  maxInventorySlots: number;
  combatLocked: boolean;
  statBonuses: any;
  locations: any[];
  regions: any[];
}>();

const emit = defineEmits<{
  (e: 'equip', payload: any): void;
  (e: 'unequip', payload: any): void;
  (e: 'use-item', payload: any): void;
  (e: 'eat-food', payload: any): void;
  (e: 'delete-item', payload: any): void;
  (e: 'split-stack', payload: any): void;
  (e: 'organize'): void;
  (e: 'salvage-item', payload: any): void;
  (e: 'show-tooltip', payload: any): void;
  (e: 'move-tooltip', payload: any): void;
  (e: 'hide-tooltip'): void;
}>();

const activeTab = ref<'inventory' | 'stats'>('inventory');
</script>
