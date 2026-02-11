<template>
  <div :style="styles.trackPanel">
    <div v-if="options.length === 0" :style="styles.subtle">No tracks found in this area.</div>
    <div v-else :style="styles.trackList">
      <button
        v-for="option in options"
        :key="option.id.toString()"
        type="button"
        :style="styles.trackItem"
        @click="$emit('select', option.id)"
      >
        <span>{{ option.name }}</span>
        <span :style="styles.trackLevel">L{{ option.level }}</span>
      </button>
    </div>
  </div>
</template>

<script setup lang="ts">
import type { EnemyTemplateRow } from '../module_bindings';

defineProps<{
  styles: Record<string, any>;
  options: EnemyTemplateRow[];
}>();

defineEmits<{
  (e: 'select', value: bigint): void;
}>();
</script>
