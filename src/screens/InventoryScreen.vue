<script setup lang="ts">
import { PhBackpack } from '@phosphor-icons/vue';
import EmptyState from './EmptyState.vue';
</script>

<template>
  <EmptyState :icon="PhBackpack" title="Your bag is empty." body="This screen is still being built." />
</template>
