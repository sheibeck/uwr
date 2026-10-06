<script setup lang="ts">
import { computed } from 'vue';
import { splitOverflow } from './effects';
import type { EffectView } from './effects';

// Active effect chips (47-UI-SPEC "Vitals Rail Contract" Effects). Chips are display-only spans.
// Names come from server rows and are rendered as text nodes only.
const props = defineProps<{ effects: readonly EffectView[]; nowrap?: boolean }>();

const split = computed(() => splitOverflow(props.effects));
</script>

<template>
  <div v-if="props.effects.length > 0" class="effect-chips" :class="{ nowrap: props.nowrap }">
    <span
      v-for="view in split.shown"
      :key="String(view.id)"
      class="tag"
      :class="view.polarity === 'buff' ? 'tag-accent' : 'effect-debuff'"
      :title="view.title"
    >
      <component :is="view.icon" :size="12" aria-hidden="true" class="chip-icon" />
      <span class="chip-text">{{ view.text }}</span>
    </span>
    <span v-if="split.overflow > 0" class="tag tag-neutral" :title="`${split.overflow} more effects`">+{{ split.overflow }}</span>
  </div>
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
