<script setup lang="ts">
import { computed } from 'vue';
import { ratingClass } from './rating';
import type { RatingKey } from './rating';

// The one safety rating mark (51.3.1.1 UI-SPEC "Rating Marks"): an 8px dot (aria-hidden) and the
// rating word in the rating colour. The host sets the text size and carries the word in its
// accessible text; the colour is never the only cue (the word is always shown when there is one).
// Unknown with no word (pools not applied yet) shows the neutral dot only, never Safe. Hosts whose
// ring already carries the colour (exit rows, chips) drop the dot.
const props = withDefaults(
  defineProps<{
    rating: { key: RatingKey; word: string };
    /** The host's text size: 10 (Micro) or 12 (Label); inherits when absent. */
    size?: 10 | 12 | null;
    dot?: boolean;
  }>(),
  { size: null, dot: true },
);

const classes = computed(() => [ratingClass(props.rating.key), props.size === null ? '' : `size-${props.size}`]);
</script>

<template>
  <span class="rating-mark" :class="classes">
    <span v-if="props.dot" class="dot" aria-hidden="true"></span>
    <span v-if="props.rating.word !== ''" class="word">{{ props.rating.word }}</span>
  </span>
</template>

<style scoped>
.rating-mark {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  min-width: 0;
  white-space: nowrap;
}

.size-10 {
  font-size: 10px;
}

.size-12 {
  font-size: 12px;
}

.dot {
  flex-shrink: 0;
  width: 8px;
  height: 8px;
  border-radius: 999px;
  background: currentColor;
}

.word {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
}

.rate-safe {
  color: var(--color-con-light-green);
}

.rate-quiet {
  color: var(--color-con-blue);
}

.rate-risky {
  color: var(--color-con-yellow);
}

.rate-deadly {
  color: var(--color-con-red);
}

.rate-unknown {
  color: var(--color-neutral-500);
}
</style>
