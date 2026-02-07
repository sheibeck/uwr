<template>
  <div>
    <div :style="styles.panelSectionTitle">Inventory</div>
    <div :style="styles.subtle">Inventory system coming soon.</div>
  </div>
</template>

<script setup lang="ts">
defineProps<{
  styles: Record<string, Record<string, string | number>>;
}>();
</script>
