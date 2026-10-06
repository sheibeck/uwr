<script setup lang="ts">
import { computed } from 'vue';

// Gold (50-UI-SPEC "Gold"): an 8px coin and the amount with en-US grouping, never the word gold on
// screen. The coin is decoration; the root carries the spoken amount.
const props = withDefaults(
  defineProps<{
    amount: bigint;
    size?: 'label' | 'body';
    /** A leading sign, for a change such as '+3' on a sale. */
    delta?: boolean;
    tone?: 'default' | 'muted' | 'short';
  }>(),
  { size: 'label', delta: false, tone: 'default' },
);

const text = computed(() => `${props.delta ? '+' : ''}${props.amount.toLocaleString('en-US')}`);
const spoken = computed(() => `${props.delta ? '+' : ''}${props.amount} gold`);
</script>

<template>
  <span
    class="gold"
    :class="[`size-${props.size}`, `tone-${props.tone}`]"
    role="img"
    :aria-label="spoken"
  >
    <span class="coin" aria-hidden="true"></span>
    <span class="amount" aria-hidden="true">{{ text }}</span>
  </span>
</template>

<style scoped>
.gold {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
}

.coin {
  flex: none;
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: var(--color-line-quest);
}

.size-label {
  font-size: 12px;
}

.size-body {
  font-size: 14px;
}

.tone-muted {
  color: var(--color-neutral-500);
}

.tone-short {
  color: var(--color-con-red);
}
</style>
