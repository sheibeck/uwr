<script setup lang="ts">
import { PhGlobeHemisphereWest } from '@phosphor-icons/vue';
import EmptyState from './EmptyState.vue';
</script>

<template>
  <EmptyState :icon="PhGlobeHemisphereWest" title="No world events right now." body="This screen is still being built." />
</template>
