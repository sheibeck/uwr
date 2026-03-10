<template>
  <div :style="hotbarStyle">
    <!-- Left arrow: previous hotbar -->
    <button
      type="button"
      :style="arrowBtnStyle"
      :title="prevHotbarName ? `Switch to: ${prevHotbarName}` : 'No other hotbars'"
      :disabled="hotbarList.length <= 1"
      @click="$emit('prev-hotbar')"
    >&lt;</button>

    <!-- Hotbar name label -->
    <button
      type="button"
      :style="nameLabelStyle"
      :title="`Hotbar: ${activeHotbarName} — click to list hotbars`"
      @click="$emit('list-hotbars')"
    >{{ activeHotbarName }}</button>

    <!-- 10 ability slots -->
    <button
      v-for="slot in slots"
      :key="slot.slot"
      type="button"
      :style="[slotBtnStyle, slot.abilityTemplateId ? slotAssignedStyle : slotEmptyStyle]"
      :title="slot.abilityTemplateId ? `${slot.name}${slot.cooldownRemaining > 0 ? ` (${slot.cooldownRemaining}s)` : ''}` : `Slot ${slot.slot} — empty`"
      :disabled="slot.cooldownRemaining > 0"
      @click="slot.abilityTemplateId && $emit('use-slot', slot)"
    >
      <!-- Slot number (top-left corner) -->
      <span :style="slotNumStyle">{{ slot.slot }}</span>
      <!-- Cooldown overlay: fills from right to left as cooldown drains -->
      <div
        v-if="slot.cooldownRemaining > 0 && slot.cooldownSeconds > 0"
        :style="[cooldownFillStyle, { width: Math.round((slot.cooldownRemaining / Number(slot.cooldownSeconds)) * 100) + '%' }]"
      />
      <!-- Ability name label -->
      <span :style="slotLabelStyle">{{ slot.abilityTemplateId ? abbreviate(slot.name) : '' }}</span>
      <!-- Cooldown number -->
      <span v-if="slot.cooldownRemaining > 0" :style="cooldownNumStyle">{{ slot.cooldownRemaining }}s</span>
    </button>

    <!-- Right arrow: next hotbar -->
    <button
      type="button"
      :style="arrowBtnStyle"
      :title="nextHotbarName ? `Switch to: ${nextHotbarName}` : 'No other hotbars'"
      :disabled="hotbarList.length <= 1"
      @click="$emit('next-hotbar')"
    >&gt;</button>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';

type HotbarDisplaySlot = {
  slot: number;
  abilityTemplateId: bigint;
  name: string;
  cooldownRemaining: number;
  cooldownSeconds: bigint;
};

type HotbarEntry = {
  id: bigint;
  name: string;
  isActive: boolean;
  sortOrder: number;
};

const props = defineProps<{
  slots: HotbarDisplaySlot[];
  activeHotbarName: string;
  hotbarList: HotbarEntry[];
}>();

defineEmits<{
  (e: 'use-slot', slot: HotbarDisplaySlot): void;
  (e: 'prev-hotbar'): void;
  (e: 'next-hotbar'): void;
  (e: 'list-hotbars'): void;
}>();

const abbreviate = (name: string): string => {
  if (!name || name === 'Empty') return '';
  if (name.length <= 7) return name;
  return name.slice(0, 6) + '…';
};

// Names of the prev/next hotbar for tooltip hints
const activeIdx = computed(() => {
  return props.hotbarList.findIndex((h) => h.name === props.activeHotbarName);
});

const prevHotbarName = computed(() => {
  if (props.hotbarList.length <= 1) return null;
  const idx = activeIdx.value;
  const prevIdx = idx <= 0 ? props.hotbarList.length - 1 : idx - 1;
  return props.hotbarList[prevIdx]?.name ?? null;
});

const nextHotbarName = computed(() => {
  if (props.hotbarList.length <= 1) return null;
  const idx = activeIdx.value;
  const nextIdx = idx >= props.hotbarList.length - 1 ? 0 : idx + 1;
  return props.hotbarList[nextIdx]?.name ?? null;
});

// ── Styles ───────────────────────────────────────────────────────
const hotbarStyle = {
  height: '40px',
  background: '#12121a',
  borderBottom: '1px solid #2a2a3a',
  display: 'flex',
  alignItems: 'center',
  gap: '2px',
  padding: '0 8px',
  overflowX: 'auto' as const,
};

const arrowBtnStyle = {
  background: '#1a1a2e',
  border: '1px solid #2a2a3a',
  color: '#adb5bd',
  width: '24px',
  height: '32px',
  borderRadius: '3px',
  fontSize: '0.8rem',
  cursor: 'pointer',
  flexShrink: 0 as const,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  padding: '0',
};

const nameLabelStyle = {
  background: 'transparent',
  border: '1px solid #3a3a4a',
  color: '#c9a227',
  height: '32px',
  padding: '0 8px',
  borderRadius: '3px',
  fontSize: '0.7rem',
  fontWeight: 600 as const,
  cursor: 'pointer',
  flexShrink: 0 as const,
  whiteSpace: 'nowrap' as const,
  letterSpacing: '0.05em',
  textTransform: 'uppercase' as const,
  minWidth: '48px',
};

const slotBtnStyle = {
  position: 'relative' as const,
  height: '32px',
  width: '44px',
  flexShrink: 0 as const,
  borderRadius: '3px',
  fontSize: '0.65rem',
  cursor: 'pointer',
  overflow: 'hidden' as const,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  padding: '0',
};

const slotAssignedStyle = {
  background: '#1a1a2e',
  border: '1px solid #c9a227',
  color: '#e9ecef',
};

const slotEmptyStyle = {
  background: '#0d0d14',
  border: '1px solid #2a2a3a',
  color: '#3a3a4a',
  cursor: 'default',
};

const slotNumStyle = {
  position: 'absolute' as const,
  top: '1px',
  left: '2px',
  fontSize: '0.55rem',
  color: '#868e96',
  lineHeight: '1',
  zIndex: 2 as const,
};

const slotLabelStyle = {
  position: 'relative' as const,
  zIndex: 1 as const,
  fontSize: '0.6rem',
  textAlign: 'center' as const,
  lineHeight: '1.1',
  paddingTop: '6px',
  maxWidth: '40px',
  wordBreak: 'break-word' as const,
  overflowWrap: 'break-word' as const,
};

const cooldownFillStyle = {
  position: 'absolute' as const,
  top: '0',
  right: '0',
  height: '100%',
  background: 'rgba(0, 0, 0, 0.55)',
  transition: 'width 0.5s linear',
  zIndex: 0 as const,
};

const cooldownNumStyle = {
  position: 'absolute' as const,
  inset: '0',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  fontSize: '0.75rem',
  fontWeight: 700 as const,
  color: '#e9ecef',
  textShadow: '0 0 4px rgba(0,0,0,0.9)',
  zIndex: 2 as const,
};
</script>
