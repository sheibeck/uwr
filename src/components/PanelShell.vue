<template>
  <aside :style="styles.panel">
    <div :style="styles.panelHeader">
      <div>{{ title }}</div>
      <button @click="$emit('close')" :style="styles.panelClose">Close</button>
    </div>
    <div :style="styles.panelBody">
      <slot />
    </div>
  </aside>
</template>

<script setup lang="ts">
defineProps<{
  styles: Record<string, Record<string, string | number>>;
  title: string;
}>();

defineEmits<{
  (e: 'close'): void;
}>();
</script>
