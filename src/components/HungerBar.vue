<template>
  <div>
    <div :style="{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '4px' }">
      <span :style="styles.panelSectionTitle">Hunger</span>
      <span :style="styles.subtle">{{ hungerPercent }}/100</span>
    </div>
    <div :style="styles.hungerBar">
      <div
        :style="{
          ...styles.hungerFill,
          width: `${hungerPercent}%`,
          backgroundColor: hungerColor,
        }"
      ></div>
    </div>
    <div v-if="isWellFed" :style="{ marginTop: '6px' }">
      <span :style="styles.wellFedBadge">
        Well Fed &mdash; {{ buffLabel }} &mdash; {{ timeRemainingMinutes }}m remaining
      </span>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';

const props = defineProps<{
  hunger: {
    currentHunger: bigint;
    wellFedUntil: { microsSinceUnixEpoch: bigint };
    wellFedBuffType: string;
    wellFedBuffMagnitude: bigint;
  } | null;
  styles: any;
}>();

const hungerPercent = computed(() => Number(props.hunger?.currentHunger ?? 0n));

const hungerColor = computed(() => {
  const pct = hungerPercent.value;
  if (pct > 50) return '#4caf7a';
  if (pct > 20) return '#d4a017';
  return '#c0392b';
});

const wellFedUntilDate = computed(() => {
  if (!props.hunger) return new Date(0);
  return new Date(Number(props.hunger.wellFedUntil.microsSinceUnixEpoch / 1000n));
});

const isWellFed = computed(() => wellFedUntilDate.value > new Date());

const timeRemainingMinutes = computed(() =>
  Math.max(0, Math.floor((wellFedUntilDate.value.getTime() - Date.now()) / 60000))
);

const buffLabel = computed(() => {
  if (!props.hunger) return '';
  const mag = Number(props.hunger.wellFedBuffMagnitude);
  switch (props.hunger.wellFedBuffType) {
    case 'str': return `+${mag} STR`;
    case 'dex': return `+${mag} DEX`;
    case 'mana_regen': return `+${mag} Mana Regen`;
    case 'stamina_regen': return `+${mag} Stamina Regen`;
    default: return '';
  }
});
</script>
