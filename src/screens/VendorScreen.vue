<script setup lang="ts">
import { PhStorefront } from '@phosphor-icons/vue';
import EmptyState from './EmptyState.vue';
</script>

<template>
  <EmptyState :icon="PhStorefront" title="No vendor nearby." body="Visit a vendor in the world to trade." />
</template>
