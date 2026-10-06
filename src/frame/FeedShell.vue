<script setup lang="ts">
import FeedView from '../console/FeedView.vue';

const props = defineProps<{ compact?: boolean }>();
</script>

<template>
  <main class="feed" :class="{ compact: props.compact }">
    <FeedView :compact="props.compact" />
  </main>
</template>

<style scoped>
.feed {
  flex: 1;
  min-width: 0;
  min-height: 0;
  display: flex;
  flex-direction: column;
}
</style>
