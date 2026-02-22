<template>
  <div :style="styles.panelBody">
    <div :style="styles.panelSectionTitle">
      Bank Vault — {{ usedSlots }} / 40 slots
    </div>
    <div :style="styles.bagGrid">
      <div
        v-for="(slot, idx) in resolvedSlots"
        :key="idx"
        :style="slot ? { ...styles.bagSlot, ...styles.bagSlotFilled, ...qualityBorderStyle(slot.qualityTier) } : styles.bagSlot"
        @dblclick="slot && $emit('withdraw', slot.bankSlotId)"
        @contextmenu.prevent="slot && openContextMenu($event, slot)"
        @mouseenter="slot && $emit('show-tooltip', { item: slot, x: $event.clientX, y: $event.clientY })"
        @mousemove="slot && $emit('move-tooltip', { x: $event.clientX, y: $event.clientY })"
        @mouseleave="slot && $emit('hide-tooltip')"
      >
        <template v-if="slot">
          <div :style="styles.bagSlotSlotLabel">{{ slot.templateSlot }}</div>
          <div :style="[styles.bagSlotName, rarityStyle(slot.qualityTier)]">{{ slot.name }}</div>
          <span v-if="slot.stackable && slot.quantity > 1n" :style="styles.bagSlotQuantity">
            x{{ slot.quantity }}
          </span>
        </template>
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
      @close="contextMenu.visible = false"
    />
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue';
import ContextMenu from './ContextMenu.vue';

interface BankSlotRow {
  id: bigint;
  ownerUserId: bigint;
  slot: bigint;
  itemInstanceId: bigint;
}

interface ItemInstanceRow {
  id: bigint;
  templateId: bigint;
  ownerCharacterId: bigint;
  equippedSlot: string | null | undefined;
  quantity: bigint;
  qualityTier: string | null | undefined;
  craftQuality: string | null | undefined;
  displayName: string | null | undefined;
  isNamed: boolean | null | undefined;
}

interface ItemTemplateRow {
  id: bigint;
  name: string;
  slot: string;
  rarity: string;
  stackable: boolean;
}

const props = defineProps<{
  styles: Record<string, Record<string, string | number>>;
  bankSlots: BankSlotRow[];
  itemTemplates: ItemTemplateRow[];
  itemInstances: ItemInstanceRow[];
  selectedCharacter: { id: bigint } | null;
}>();

const emit = defineEmits<{
  (e: 'withdraw', bankSlotId: bigint): void;
  (e: 'show-tooltip', value: { item: any; x: number; y: number }): void;
  (e: 'move-tooltip', value: { x: number; y: number }): void;
  (e: 'hide-tooltip'): void;
}>();

const rarityStyle = (rarity: string | null | undefined) => {
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

const qualityBorderStyle = (quality: string | null | undefined) => {
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

interface ResolvedSlot {
  bankSlotId: bigint;
  slotIndex: number;
  itemInstanceId: bigint;
  name: string;
  templateSlot: string;
  qualityTier: string | null | undefined;
  stackable: boolean;
  quantity: bigint;
}

const resolvedSlots = computed<(ResolvedSlot | null)[]>(() => {
  const instanceMap = new Map<string, ItemInstanceRow>();
  for (const inst of props.itemInstances) {
    instanceMap.set(inst.id.toString(), inst);
  }
  const templateMap = new Map<string, ItemTemplateRow>();
  for (const tmpl of props.itemTemplates) {
    templateMap.set(tmpl.id.toString(), tmpl);
  }
  // Build slot index → bank slot row mapping
  const slotMap = new Map<number, BankSlotRow>();
  for (const bs of props.bankSlots) {
    slotMap.set(Number(bs.slot), bs);
  }

  const result: (ResolvedSlot | null)[] = [];
  for (let i = 0; i < 40; i++) {
    const bs = slotMap.get(i);
    if (!bs) {
      result.push(null);
      continue;
    }
    const instance = instanceMap.get(bs.itemInstanceId.toString());
    if (!instance) {
      result.push(null);
      continue;
    }
    const template = templateMap.get(instance.templateId.toString());
    if (!template) {
      result.push(null);
      continue;
    }
    result.push({
      bankSlotId: bs.id,
      slotIndex: i,
      itemInstanceId: bs.itemInstanceId,
      name: instance.displayName ?? template.name,
      templateSlot: template.slot,
      qualityTier: instance.qualityTier ?? template.rarity,
      stackable: template.stackable,
      quantity: instance.quantity,
    });
  }
  return result;
});

const usedSlots = computed(() => props.bankSlots.length);

const openContextMenu = (event: MouseEvent, slot: ResolvedSlot) => {
  contextMenu.value = {
    visible: true,
    x: event.clientX,
    y: event.clientY,
    title: slot.name,
    subtitle: slot.templateSlot,
    items: [
      {
        label: 'Withdraw',
        action: () => {
          emit('withdraw', slot.bankSlotId);
          contextMenu.value.visible = false;
        },
      },
    ],
  };
};
</script>
