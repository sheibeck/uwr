<template>
  <aside :style="styles.floatingPanel">
    <div :style="styles.floatingPanelHeader">
      <div>{{ title }}</div>
      <button @click="$emit('close')" :style="styles.panelClose">Close</button>
    </div>
    <div :style="styles.floatingPanelBody">
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
