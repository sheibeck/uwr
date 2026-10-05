<script setup lang="ts">
import { PhHammer } from '@phosphor-icons/vue';
import EmptyState from './EmptyState.vue';
</script>

<template>
  <EmptyState :icon="PhHammer" title="No recipes known yet." body="This screen is still being built." />
</template>
