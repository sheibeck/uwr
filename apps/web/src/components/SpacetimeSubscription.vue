<template>
  <div>
    <slot :rows="rows" :status="status"></slot>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { useSpacetimeSubscription } from '../composables/useSpacetimeSubscription';
const props = defineProps<{ sql: string; token?: string; sessionToken?: string }>();
const { rows, status } = useSpacetimeSubscription(props.sql, props.token, props.sessionToken);
</script>

<style scoped>
</style>
