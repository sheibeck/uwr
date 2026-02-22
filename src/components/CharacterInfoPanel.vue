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
    <button
      type="button"
      @click="activeTab = 'race'"
      :style="{
        background: activeTab === 'race' ? 'rgba(255,255,255,0.08)' : 'transparent',
        borderBottom: activeTab === 'race' ? '2px solid #60a5fa' : '2px solid transparent',
        padding: '8px 16px',
        cursor: 'pointer',
        color: activeTab === 'race' ? '#fff' : '#d1d5db',
        fontSize: '0.85rem',
        fontWeight: 600,
        border: 'none',
        outline: 'none',
      }"
    >Race</button>
    <button
      type="button"
      @click="activeTab = 'abilities'"
      :style="{
        background: activeTab === 'abilities' ? 'rgba(255,255,255,0.08)' : 'transparent',
        borderBottom: activeTab === 'abilities' ? '2px solid #60a5fa' : '2px solid transparent',
        padding: '8px 16px',
        cursor: 'pointer',
        color: activeTab === 'abilities' ? '#fff' : '#d1d5db',
        fontSize: '0.85rem',
        fontWeight: 600,
        border: 'none',
        outline: 'none',
      }"
    >Abilities</button>
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
    @add-to-hotbar="(templateId: bigint, name: string) => $emit('add-to-hotbar', templateId, name)"
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
    :races="races"
  />

  <!-- Race tab -->
  <RacialProfilePanel
    v-else-if="activeTab === 'race'"
    :styles="styles"
    :selected-character="selectedCharacter"
    :races="races"
  />

  <!-- Abilities tab -->
  <div v-else-if="activeTab === 'abilities'" :style="{ display: 'flex', flexDirection: 'column', gap: '6px', padding: '4px 0' }">
    <!-- Class abilities section -->
    <div :style="{ fontSize: '0.8rem', color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '2px' }">
      Class Abilities
    </div>
    <div
      v-for="ability in availableAbilities"
      :key="ability.key"
      :style="{ background: 'rgba(255,255,255,0.05)', borderRadius: '4px', padding: '6px 10px', cursor: 'context-menu' }"
      @contextmenu.prevent="showContextMenu($event, ability.key, ability.name, ability.description)"
    >
      <div :style="{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }">
        <span :style="{ fontWeight: 600, fontSize: '0.85rem' }">{{ ability.name }}</span>
        <span :style="{ fontSize: '0.75rem', color: '#9ca3af' }">Lv{{ ability.level }}</span>
      </div>
      <div :style="{ fontSize: '0.75rem', color: '#6b7280', marginTop: '2px' }">{{ ability.resource }} &bull; {{ ability.kind }}</div>
    </div>

    <!-- Renown perks section -->
    <div v-if="renownPerks.length > 0" :style="{ fontSize: '0.8rem', color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.05em', marginTop: '8px', marginBottom: '2px' }">
      Active Renown Perks
    </div>
    <div
      v-for="perk in renownPerks"
      :key="String(perk.id)"
      :style="{ background: 'rgba(255,255,255,0.05)', borderRadius: '4px', padding: '6px 10px', cursor: 'context-menu' }"
      @contextmenu.prevent="showContextMenu($event, perk.perkKey, perk.perkKey, '')"
    >
      <span :style="{ fontWeight: 600, fontSize: '0.85rem' }">{{ perk.perkKey }}</span>
    </div>

    <div v-if="availableAbilities.length === 0" :style="{ color: '#6b7280', fontSize: '0.85rem' }">
      No abilities unlocked yet.
    </div>
  </div>

  <!-- Context menu overlay -->
  <div
    v-if="contextMenu.visible"
    :style="{
      position: 'fixed', left: contextMenu.x + 'px', top: contextMenu.y + 'px',
      background: '#1f2937', border: '1px solid rgba(255,255,255,0.15)', borderRadius: '6px',
      zIndex: 9999, minWidth: '160px', boxShadow: '0 4px 12px rgba(0,0,0,0.5)',
    }"
    @mouseleave="hideContextMenu"
  >
    <button
      type="button"
      :style="{ display: 'block', width: '100%', padding: '8px 14px', background: 'transparent', border: 'none', color: '#e5e7eb', fontSize: '0.85rem', cursor: 'pointer', textAlign: 'left' }"
      @click="onShowDescription"
    >What does this do?</button>
    <button
      type="button"
      :style="{ display: 'block', width: '100%', padding: '8px 14px', background: 'transparent', border: 'none', color: '#e5e7eb', fontSize: '0.85rem', cursor: 'pointer', textAlign: 'left' }"
      @click="onAddToHotbar"
    >Add to Hotbar</button>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue';
import InventoryPanel from './InventoryPanel.vue';
import StatsPanel from './StatsPanel.vue';
import RacialProfilePanel from './RacialProfilePanel.vue';

defineProps<{
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
  races: any[];
  availableAbilities: { key: string; name: string; description: string; resource: string; kind: string; level: bigint }[];
  renownPerks: { id: bigint; characterId: bigint; rank: bigint; perkKey: string }[];
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
  (e: 'add-to-hotbar', templateId: bigint, name: string): void;
  (e: 'show-tooltip', payload: any): void;
  (e: 'move-tooltip', payload: any): void;
  (e: 'hide-tooltip'): void;
  (e: 'add-ability-to-hotbar', abilityKey: string, name: string): void;
  (e: 'show-ability-popup', payload: { name: string; description: string; x: number; y: number }): void;
}>();

const activeTab = ref<'inventory' | 'stats' | 'race' | 'abilities'>('inventory');

const contextMenu = ref<{ visible: boolean; x: number; y: number; abilityKey: string; name: string; description: string }>({
  visible: false, x: 0, y: 0, abilityKey: '', name: '', description: '',
});

const showContextMenu = (event: MouseEvent, abilityKey: string, name: string, description: string) => {
  contextMenu.value = { visible: true, x: event.clientX, y: event.clientY, abilityKey, name, description };
};

const hideContextMenu = () => {
  contextMenu.value.visible = false;
};

const onShowDescription = () => {
  emit('show-ability-popup', {
    name: contextMenu.value.name,
    description: contextMenu.value.description || '(No description available)',
    x: contextMenu.value.x + 12,
    y: contextMenu.value.y,
  });
  hideContextMenu();
};

const onAddToHotbar = () => {
  emit('add-ability-to-hotbar', contextMenu.value.abilityKey, contextMenu.value.name);
  hideContextMenu();
};
</script>
