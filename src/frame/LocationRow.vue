<script setup lang="ts">
import { PhMapPin } from '@phosphor-icons/vue';

const props = defineProps<{ locationName: string; timeOfDay: 'day' | 'night' | null }>();
</script>

<template>
  <div class="location-row">
    <PhMapPin class="pin" :size="14" aria-hidden="true" />
    <span class="name" :title="props.locationName">{{ props.locationName }}</span>
    <template v-if="props.timeOfDay !== null">
      <span class="sep" aria-hidden="true">·</span>
      <span class="time">{{ props.timeOfDay === 'day' ? 'Day' : 'Night' }}</span>
    </template>
  </div>
</template>

<style scoped>
.location-row {
  min-height: 36px;
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 8px 16px;
  font-size: 12px;
  font-weight: 400;
}
.pin {
  flex-shrink: 0;
  color: var(--color-accent);
}
.name {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: var(--color-neutral-300);
}
.sep {
  flex-shrink: 0;
  color: var(--color-neutral-600);
}
.time {
  flex-shrink: 0;
  color: var(--color-neutral-500);
}
</style>
