<template>
  <!-- Tab bar — matches NpcDialogPanel / Journal pattern -->
  <div :style="{ display: 'flex', gap: '0', borderBottom: '1px solid rgba(255,255,255,0.1)', marginBottom: '8px' }">
    <button
      type="button"
      @click="setTab('inventory')"
      :style="{
        background: activeTab === 'inventory' ? 'rgba(255,255,255,0.08)' : 'transparent',
        borderBottom: activeTab === 'inventory' ? '2px solid #60a5fa' : '2px solid transparent',
        padding: '8px 16px',
        cursor: 'pointer',
        color: props.onboarding ? '#ffa500' : (activeTab === 'inventory' ? '#fff' : '#d1d5db'),
        fontSize: '0.85rem',
        fontWeight: 600,
        border: 'none',
        outline: 'none',
        ...(props.onboarding ? { boxShadow: '0 0 0 2px rgba(255,165,0,0.7)', borderBottom: '2px solid rgba(255,165,0,0.9)' } : {}),
      }"
    >Inventory</button>
    <button
      type="button"
      @click="setTab('stats')"
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
      @click="setTab('race')"
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
      @click="setTab('abilities')"
      :style="{
        background: activeTab === 'abilities' ? 'rgba(255,255,255,0.08)' : 'transparent',
        borderBottom: activeTab === 'abilities' ? '2px solid #60a5fa' : '2px solid transparent',
        padding: '8px 16px',
        cursor: 'pointer',
        color: props.onboarding ? '#ffa500' : (activeTab === 'abilities' ? '#fff' : '#d1d5db'),
        fontSize: '0.85rem',
        fontWeight: 600,
        border: 'none',
        outline: 'none',
        ...(props.onboarding ? { boxShadow: '0 0 0 2px rgba(255,165,0,0.7)', borderBottom: '2px solid rgba(255,165,0,0.9)' } : {}),
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
    :bank-open="bankOpen"
    @deposit-to-bank="$emit('deposit-to-bank', $event)"
    @equip="$emit('equip', $event)"
    @unequip="$emit('unequip', $event)"
    @use-item="$emit('use-item', $event)"
    @eat-food="$emit('eat-food', $event)"
    @delete-item="$emit('delete-item', $event)"
    @split-stack="(id, qty) => $emit('split-stack', id, qty)"
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
      @contextmenu.prevent="showContextMenu($event, ability)"
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
      @contextmenu.prevent="showContextMenu($event, { key: perk.perkKey, name: perk.perkKey, description: '', resource: '', resourceCost: 0n, castSeconds: 0n, cooldownSeconds: 0n, kind: '', level: 0n })"
    >
      <span :style="{ fontWeight: 600, fontSize: '0.85rem' }">{{ perk.perkKey }}</span>
    </div>

    <div v-if="availableAbilities.length === 0" :style="{ color: '#6b7280', fontSize: '0.85rem' }">
      No abilities unlocked yet.
    </div>
  </div>

  <!-- Ability context menu using shared ContextMenu component -->
  <ContextMenu
    :visible="contextMenu.visible"
    :x="contextMenu.x"
    :y="contextMenu.y"
    :title="contextMenu.name"
    :items="[{ label: 'Add to Hotbar', action: onAddToHotbar }]"
    :styles="styles"
    @close="hideContextMenu"
  >
    <!-- Description (only if present) -->
    <div
      v-if="contextMenu.description"
      :style="{
        padding: '0.3rem 0.75rem',
        fontSize: '0.75rem',
        color: 'rgba(230,232,239,0.55)',
        lineHeight: '1.5',
        maxWidth: '220px',
        whiteSpace: 'normal',
        borderBottom: '1px solid rgba(255,255,255,0.08)',
      }"
    >{{ contextMenu.description }}</div>
    <!-- Stats: cost / cast / cooldown -->
    <div :style="{
      padding: '0.3rem 0.75rem',
      fontSize: '0.75rem',
      color: 'rgba(230,232,239,0.55)',
      lineHeight: '1.5',
      borderBottom: '1px solid rgba(255,255,255,0.08)',
    }">
      <div>Cost:
        <span :style="{ color: 'rgba(230,232,239,0.9)' }">{{
          contextMenu.resource === 'mana'
            ? `${contextMenu.resourceCost} mana`
            : contextMenu.resource === 'stamina'
              ? `${contextMenu.resourceCost} stamina`
              : 'Free'
        }}</span>
      </div>
      <div>Cast: <span :style="{ color: 'rgba(230,232,239,0.9)' }">{{ contextMenu.castSeconds > 0n ? `${Number(contextMenu.castSeconds)}s` : 'Instant' }}</span></div>
      <div>Cooldown: <span :style="{ color: 'rgba(230,232,239,0.9)' }">{{ contextMenu.cooldownSeconds > 0n ? `${Number(contextMenu.cooldownSeconds)}s` : 'None' }}</span></div>
    </div>
  </ContextMenu>
</template>

<script setup lang="ts">
import { ref, watch } from 'vue';
import InventoryPanel from './InventoryPanel.vue';
import StatsPanel from './StatsPanel.vue';
import RacialProfilePanel from './RacialProfilePanel.vue';
import ContextMenu from './ContextMenu.vue';

const props = defineProps<{
  styles: Record<string, Record<string, string | number>>;
  connActive: boolean;
  selectedCharacter: any;
  equippedSlots: any[];
  inventoryItems: any[];
  inventoryCount: number;
  maxInventorySlots: number;
  combatLocked: boolean;
  bankOpen?: boolean;
  statBonuses: any;
  locations: any[];
  regions: any[];
  races: any[];
  availableAbilities: { key: string; name: string; description: string; resource: string; kind: string; level: bigint; castSeconds: bigint; cooldownSeconds: bigint; resourceCost: bigint; damageType?: string | null }[];
  renownPerks: { id: bigint; characterId: bigint; rank: bigint; perkKey: string }[];
  onboarding?: boolean;
  requestedTab?: string | null;
}>();

const emit = defineEmits<{
  (e: 'equip', payload: any): void;
  (e: 'unequip', payload: any): void;
  (e: 'use-item', payload: any): void;
  (e: 'eat-food', payload: any): void;
  (e: 'delete-item', payload: any): void;
  (e: 'split-stack', id: bigint, qty: bigint): void;
  (e: 'organize'): void;
  (e: 'salvage-item', payload: any): void;
  (e: 'add-to-hotbar', templateId: bigint, name: string): void;
  (e: 'show-tooltip', payload: any): void;
  (e: 'move-tooltip', payload: any): void;
  (e: 'hide-tooltip'): void;
  (e: 'add-ability-to-hotbar', abilityKey: string, name: string): void;
  (e: 'tab-change', tab: string): void;
  (e: 'deposit-to-bank', itemInstanceId: bigint): void;
}>();

type CharacterTab = 'inventory' | 'stats' | 'race' | 'abilities';
const activeTab = ref<CharacterTab>((props.requestedTab as CharacterTab) ?? 'inventory');

watch(() => props.requestedTab, (tab) => {
  if (tab) activeTab.value = tab as CharacterTab;
});

const setTab = (tab: CharacterTab) => {
  activeTab.value = tab;
  emit('tab-change', tab);
};

const contextMenu = ref<{
  visible: boolean; x: number; y: number;
  abilityKey: string; name: string; description: string;
  resource: string; resourceCost: bigint;
  castSeconds: bigint; cooldownSeconds: bigint;
}>({
  visible: false, x: 0, y: 0, abilityKey: '', name: '', description: '',
  resource: '', resourceCost: 0n, castSeconds: 0n, cooldownSeconds: 0n,
});

const showContextMenu = (event: MouseEvent, ability: { key: string; name: string; description: string; resource: string; resourceCost: bigint; castSeconds: bigint; cooldownSeconds: bigint; kind: string; level: bigint }) => {
  contextMenu.value = {
    visible: true, x: event.clientX, y: event.clientY,
    abilityKey: ability.key, name: ability.name, description: ability.description,
    resource: ability.resource, resourceCost: ability.resourceCost,
    castSeconds: ability.castSeconds, cooldownSeconds: ability.cooldownSeconds,
  };
};

const hideContextMenu = () => {
  contextMenu.value.visible = false;
};

const onAddToHotbar = () => {
  emit('add-ability-to-hotbar', contextMenu.value.abilityKey, contextMenu.value.name);
  hideContextMenu();
};
</script>
