<script setup lang="ts">
import { computed } from 'vue';
import { PhCaretLeft, PhCaretRight } from '@phosphor-icons/vue';
import { nextHotbarIndex, selectorAriaLabel } from './hotbar';

// Switches between existing hotbars only (47-UI-SPEC "Selector"). Desktop: two carets around a
// two-line label; mobile: one button that cycles. Names are text nodes and title attributes.
const props = defineProps<{
  names: readonly string[];
  activeIndex: number;
  desktop: boolean;
  disabled: boolean;
}>();

const emit = defineEmits<{ select: [index: number] }>();

const count = computed(() => props.names.length);
const name = computed(() => props.names[props.activeIndex] ?? '');
const position = computed(() => `${props.activeIndex + 1}/${count.value}`);
const inactive = computed(() => props.disabled || count.value <= 1);
const mobileLabel = computed(() => selectorAriaLabel(name.value, props.activeIndex, count.value));

function step(direction: 1 | -1): void {
  if (inactive.value) return;
  emit('select', nextHotbarIndex(props.activeIndex, count.value, direction));
}
</script>

<template>
  <div v-if="desktop" class="selector selector-desktop">
    <button
      type="button"
      class="btn btn-secondary btn-icon caret"
      aria-label="Previous hotbar"
      :disabled="inactive"
      @click="step(-1)"
    >
      <PhCaretLeft :size="14" aria-hidden="true" />
    </button>
    <div class="label-cell">
      <span class="label-name" :title="name">{{ name }}</span>
      <span class="label-position">{{ position }}</span>
    </div>
    <button
      type="button"
      class="btn btn-secondary btn-icon caret"
      aria-label="Next hotbar"
      :disabled="inactive"
      @click="step(1)"
    >
      <PhCaretRight :size="14" aria-hidden="true" />
    </button>
  </div>
  <div v-else class="selector selector-mobile-wrap">
    <button
      type="button"
      class="btn btn-secondary selector-mobile"
      :aria-label="mobileLabel"
      :title="name"
      :disabled="inactive"
      @click="step(1)"
    >
      <span class="label-cell label-cell-mobile">
        <span class="label-name">{{ name }}</span>
        <span class="label-position">{{ position }}</span>
      </span>
    </button>
  </div>
</template>

<style scoped>
.selector {
  flex: none;
  display: flex;
  align-items: center;
  height: 52px;
}

.caret {
  flex: none;
  width: 28px;
  height: 52px;
}

.label-cell {
  width: 44px;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  min-width: 0;
}

.label-name {
  max-width: 100%;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 10px;
  text-transform: uppercase;
  color: var(--color-accent);
}

.label-position {
  font-size: 10px;
  font-variant-numeric: tabular-nums;
  color: var(--color-neutral-500);
}

.selector-mobile {
  width: 52px;
  height: 52px;
  padding: 0;
}

.label-cell-mobile {
  width: 100%;
  padding: 0 4px;
}
</style>
