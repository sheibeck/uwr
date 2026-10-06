<script setup lang="ts">
import FeedView from '../console/FeedView.vue';
import HotbarRow from '../hotbar/HotbarRow.vue';
import Composer from '../input/Composer.vue';

const props = defineProps<{ compact?: boolean }>();
</script>

<template>
  <main class="feed" :class="{ compact: props.compact }">
    <FeedView :compact="props.compact" />
    <section class="composer">
      <HotbarRow />
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

/* The composer fills the center column like the feed lines (owner try-out 2026-10-05, supersedes the
   760px measure), with the same 32px side padding. The hotbar row sits at the top of this section. */
.composer {
  flex: none;
  width: 100%;
  padding: 8px 32px 16px;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.compact .composer {
  padding: 8px 16px;
  background: color-mix(in srgb, var(--color-surface) 40%, transparent);
}
</style>
