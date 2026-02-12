<template>
  <div>
    <div v-if="lootItems.length === 0" :style="styles.subtle">
      No unclaimed loot.
    </div>
    <div v-else :style="{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }">
      <div
        v-for="item in lootItems"
        :key="item.id.toString()"
        :style="styles.rosterClickable"
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
        <div :style="rarityStyle(item.rarity)">{{ item.name }}</div>
        <div :style="styles.subtleSmall">
          {{ item.rarity }} · Tier {{ item.tier }}
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
    tier: bigint;
    allowedClasses: string;
    armorType: string;
    description: string;
    stats: { label: string; value: string }[];
  }>;
  connActive: boolean;
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
  (e: 'take-loot', lootId: bigint): void;
  (e: 'show-tooltip', value: { item: any; x: number; y: number }): void;
  (e: 'move-tooltip', value: { x: number; y: number }): void;
  (e: 'hide-tooltip'): void;
}>();
</script>
