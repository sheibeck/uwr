<script setup lang="ts">
import FeedView from '../console/FeedView.vue';
import Composer from '../input/Composer.vue';

const props = defineProps<{ compact?: boolean }>();
</script>

<template>
  <main class="feed" :class="{ compact: props.compact }">
    <FeedView :compact="props.compact" />
    <section class="composer">
      <Composer />
    </section>
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

/* 760px is the content width: with the global border-box the 64px of side padding is added so the
   input lines up with the feed lines. 47-11 inserts the hotbar at the top of this section. */
.composer {
  flex: none;
  width: 100%;
  max-width: calc(760px + 64px);
  padding: 8px 32px 16px;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.compact .composer {
  max-width: none;
  padding: 8px 16px;
  background: color-mix(in srgb, var(--color-surface) 40%, transparent);
}
</style>
