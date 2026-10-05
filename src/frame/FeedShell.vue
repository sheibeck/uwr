<script setup lang="ts">
const props = defineProps<{ compact?: boolean }>();
</script>

<template>
  <main class="feed" :class="{ compact: props.compact }">
    <div class="feed-line">
      <p class="empty">Your story will appear here.</p>
    </div>
  </main>
</template>

<style scoped>
.feed {
  flex: 1;
  min-width: 0;
  min-height: 0;
  display: flex;
  flex-direction: column;
  justify-content: flex-end;
  overflow-y: auto;
  padding: 16px 32px;
}

.feed.compact {
  padding: 4px 16px 8px;
}

.feed-line {
  max-width: 760px;
}

.empty {
  margin: 0;
  font-size: 12px;
  color: var(--color-neutral-500);
}
</style>
