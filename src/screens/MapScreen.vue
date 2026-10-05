<script setup lang="ts">
import { PhMapTrifold } from '@phosphor-icons/vue';
import EmptyState from './EmptyState.vue';
</script>

<template>
  <EmptyState :icon="PhMapTrifold" title="No places discovered yet." body="This screen is still being built." />
</template>
