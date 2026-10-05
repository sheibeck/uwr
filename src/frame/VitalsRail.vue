<script setup lang="ts">
import { computed } from 'vue';
import { barFraction, vitalText } from './vitals';

const props = defineProps<{
  name: string;
  avatarInitial: string;
  classLine: string;
  hp: bigint;
  maxHp: bigint;
  mana: bigint;
  maxMana: bigint;
  stamina: bigint;
  maxStamina: bigint;
}>();

const bars = computed(() => [
  { key: 'health', label: 'Health', value: props.hp, max: props.maxHp },
  { key: 'mana', label: 'Mana', value: props.mana, max: props.maxMana },
  { key: 'stamina', label: 'Stamina', value: props.stamina, max: props.maxStamina },
]);
</script>

<template>
  <aside class="vitals-rail" aria-label="Vitals">
    <div class="identity">
      <div class="avatar" aria-hidden="true">{{ props.avatarInitial }}</div>
      <div class="identity-text">
        <div class="name" :title="props.name">{{ props.name }}</div>
        <div class="class-line">{{ props.classLine }}</div>
      </div>
    </div>

    <div class="bars">
      <div v-for="bar in bars" :key="bar.key" class="bar">
        <div class="bar-row">
          <span class="label">{{ bar.label }}</span>
          <span class="value">{{ vitalText(bar.value, bar.max) }}</span>
        </div>
        <div
          class="track"
          role="progressbar"
          :aria-label="bar.label"
          aria-valuemin="0"
          :aria-valuenow="Number(bar.value)"
          :aria-valuemax="Number(bar.max)"
        >
          <div class="fill" :class="`fill-${bar.key}`" :style="{ width: `${barFraction(bar.value, bar.max) * 100}%` }"></div>
        </div>
      </div>
    </div>

    <div class="hr" role="separator"></div>

    <section class="party">
      <h6>Party</h6>
      <p class="empty">Not in a party.</p>
    </section>
  </aside>
</template>

<style scoped>
.vitals-rail {
  width: 252px;
  flex-shrink: 0;
  display: flex;
  flex-direction: column;
  gap: 16px;
  padding: 16px;
  min-height: 0;
  overflow-y: auto;
  background: color-mix(in srgb, var(--color-surface) 30%, transparent);
}

.identity {
  display: flex;
  align-items: center;
  gap: 8px;
}

.avatar {
  width: 44px;
  height: 44px;
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: var(--radius-md);
  background: var(--color-accent-900);
  box-shadow: inset 0 0 0 1px var(--color-accent-700);
  color: var(--color-accent-300);
  font-size: 20px;
  font-weight: 500;
}

.identity-text {
  min-width: 0;
  flex: 1;
}

.name {
  font-size: 14px;
  font-weight: 500;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  min-width: 0;
}

.class-line {
  font-size: 12px;
  color: var(--color-neutral-400);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.bars {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.bar-row {
  display: flex;
  justify-content: space-between;
  gap: 8px;
  font-size: 12px;
}

.label {
  color: var(--color-neutral-400);
}

.value {
  color: var(--color-neutral-200);
  font-variant-numeric: tabular-nums;
}

.track {
  height: 6px;
  border-radius: var(--radius-sm);
  background: var(--color-neutral-900);
  overflow: hidden;
}

.fill {
  height: 100%;
}

.fill-health {
  background: var(--color-health);
}

.fill-mana {
  background: var(--color-mana);
}

.fill-stamina {
  background: var(--color-stamina);
}

.hr {
  margin: 0;
}

.party h6 {
  color: var(--color-neutral-400);
}

.empty {
  margin: 0;
  font-size: 12px;
  color: var(--color-neutral-500);
}
</style>
