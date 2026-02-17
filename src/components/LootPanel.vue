<template>
  <div>
    <div v-if="lootItems.length === 0" :style="styles.subtle">
      No unclaimed loot.
    </div>
    <div v-else :style="{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }">
      <div
        v-for="item in lootItems"
        :key="item.id.toString()"
        :style="{
          ...styles.rosterClickable,
          ...qualityBorderStyle(item.qualityTier),
          border: '1px solid',
          borderRadius: '10px',
          ...flashStyle(item.qualityTier),
        }"
        @mouseenter="
          $emit('show-tooltip', {
            item,
            x: $event.clientX,
            y: $event.clientY,
          })
        "
        @mousemove="$emit('move-tooltip', { x: $event.clientX, y: $event.clientY })"
        @mouseleave="$emit('hide-tooltip')"
      >
        <div :style="rarityStyle(item.qualityTier)">{{ item.name }}</div>
        <div :style="styles.subtleSmall">
          {{ item.qualityTier }} · Tier {{ item.tier }}
        </div>
        <div
          v-for="(affix, idx) in item.affixStats"
          :key="idx"
          :style="{ ...rarityStyle(item.qualityTier), fontSize: '0.72rem', opacity: 0.9 }"
        >
          {{ affix.value }} {{ affix.label }} <span :style="{ opacity: 0.7 }">({{ affix.affixName }})</span>
        </div>
        <button
          type="button"
          :style="styles.ghostButton"
          :disabled="!connActive"
          @click="
            $emit('hide-tooltip');
            $emit('take-loot', item.id);
          "
        >
          Take
        </button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
const props = defineProps<{
  styles: Record<string, Record<string, string | number>>;
  lootItems: Array<{
    id: bigint;
    name: string;
    rarity: string;
    qualityTier: string;
    tier: bigint;
    allowedClasses: string;
    armorType: string;
    description: string;
    stats: { label: string; value: string }[];
    affixStats: { label: string; value: string; affixName: string }[];
    isNamed: boolean;
  }>;
  connActive: boolean;
}>();

const rarityStyle = (quality: string) => {
  const key = (quality ?? 'common').toLowerCase();
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
  return (props.styles as any)[map[key] ?? 'qualityBorderCommon'] ?? {};
};

const flashStyle = (quality: string) => {
  const key = (quality ?? 'common').toLowerCase();
  if (key === 'epic') return (props.styles as any)['lootFlashEpic'] ?? {};
  if (key === 'legendary') return (props.styles as any)['lootFlashLegendary'] ?? {};
  return {};
};

defineEmits<{
  (e: 'take-loot', lootId: bigint): void;
  (e: 'show-tooltip', value: { item: any; x: number; y: number }): void;
  (e: 'move-tooltip', value: { x: number; y: number }): void;
  (e: 'hide-tooltip'): void;
}>();
</script>

<style>
@keyframes lootFlash {
  0%, 100% { background-color: transparent; }
  50% { background-color: rgba(170, 68, 255, 0.3); }
}
@keyframes lootFlashLegendary {
  0%, 100% { background-color: transparent; }
  50% { background-color: rgba(255, 136, 0, 0.3); }
}
</style>
