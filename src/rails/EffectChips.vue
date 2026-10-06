<script setup lang="ts">
import { computed } from 'vue';
import { splitOverflow } from './effects';
import type { EffectView } from './effects';

// Active effect chips (47-UI-SPEC "Vitals Rail Contract" Effects). Chips are display-only spans.
// Names come from server rows and are rendered as text nodes only.
//
// Enemy effect chips (quick 261006-hpp) reuse it: `limit` sets how many chips show before the "+N"
// chip, `compact` swaps in each view's compactText and tightens the padding and size, `dense` only tightens the padding, and `inline`
// makes the root a span so the chips can sit inside a button (a div there is not valid HTML).
const props = defineProps<{
  effects: readonly EffectView[];
  nowrap?: boolean;
  limit?: number;
  compact?: boolean;
  dense?: boolean;
  inline?: boolean;
}>();

const split = computed(() => splitOverflow(props.effects, props.limit));
</script>

<template>
  <component
    :is="props.inline ? 'span' : 'div'"
    v-if="props.effects.length > 0"
    class="effect-chips"
    :class="{ nowrap: props.nowrap, compact: props.compact, dense: props.dense }"
  >
    <span
      v-for="view in split.shown"
      :key="String(view.id)"
      class="tag"
      :class="view.polarity === 'buff' ? 'tag-accent' : 'effect-debuff'"
      :title="view.title"
    >
      <component :is="view.icon" :size="12" aria-hidden="true" class="chip-icon" />
      <span class="chip-text">{{ props.compact ? (view.compactText ?? view.text) : view.text }}</span>
    </span>
    <span v-if="split.overflow > 0" class="tag tag-neutral" :title="`${split.overflow} more effects`">+{{ split.overflow }}</span>
  </component>
</template>

<style scoped>
.effect-chips {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
  min-width: 0;
}

.effect-chips.nowrap {
  flex-wrap: nowrap;
}

.effect-chips .tag {
  gap: 4px;
  max-width: 100%;
  min-width: 0;
  white-space: nowrap;
}

.effect-chips.nowrap .tag {
  flex-shrink: 0;
}

/* Dense chips (a hostile row) take tighter padding; compact chips (the mobile strip) also the smallest text. */
.effect-chips.dense .tag,
.effect-chips.compact .tag {
  padding: 0 4px;
}

.effect-chips.compact .tag {
  font-size: 10px;
}

.chip-icon {
  flex-shrink: 0;
}

.chip-text {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.effect-debuff {
  background: color-mix(in srgb, var(--color-health) 24%, var(--color-surface));
  color: color-mix(in srgb, var(--color-health) 28%, var(--color-text));
}
</style>
