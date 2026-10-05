<script setup lang="ts">
import { PhUserCircle } from '@phosphor-icons/vue';
import EmptyState from './EmptyState.vue';
</script>

<template>
  <EmptyState :icon="PhUserCircle" title="No stats to show yet." body="This screen is still being built." />
</template>
