<script setup lang="ts">
// Filter chips (50-UI-SPEC "Filter chips"): single-select toggle buttons in a labelled group. They
// filter one list, so they are not tabs. The selected chip is the accent tag, the rest neutral.
const props = withDefaults(
  defineProps<{
    options: ReadonlyArray<{ id: string; label: string }>;
    modelValue: string;
    groupLabel: string;
    mobile?: boolean;
    /** Offline: every chip reads as disabled and does nothing. */
    disabled?: boolean;
  }>(),
  { mobile: false, disabled: false },
);
const emit = defineEmits<{ 'update:modelValue': [id: string] }>();

function pick(id: string): void {
  if (props.disabled) return;
  emit('update:modelValue', id);
}
</script>

<template>
  <div class="filter-chips" :class="{ mobile: props.mobile }" role="group" :aria-label="props.groupLabel">
    <button
      v-for="option in props.options"
      :key="option.id"
      type="button"
      class="tag chip"
      :class="option.id === props.modelValue ? 'tag-accent' : 'tag-neutral'"
      :aria-pressed="option.id === props.modelValue ? 'true' : 'false'"
      :aria-disabled="props.disabled ? 'true' : undefined"
      @click="pick(option.id)"
    >
      {{ option.label }}
    </button>
  </div>
</template>

<style scoped>
.filter-chips {
  display: flex;
  align-items: center;
  gap: 4px;
}

.filter-chips.mobile {
  min-height: 44px;
  overflow-x: auto;
  scrollbar-width: none;
}

.filter-chips.mobile::-webkit-scrollbar {
  display: none;
}

.chip {
  position: relative;
  flex: none;
  padding: 4px 8px;
  border: 0;
  font-family: inherit;
  cursor: pointer;
  white-space: nowrap;
}

.chip[aria-disabled='true'] {
  opacity: 0.45;
  cursor: default;
}

/* A 44px by 44px hit area on mobile without growing the chip: a short chip such as All is centred
   in a slop that is never narrower than 44px. */
.mobile .chip::after {
  content: '';
  position: absolute;
  top: 50%;
  left: 50%;
  width: max(100%, 44px);
  height: 44px;
  transform: translate(-50%, -50%);
}

.chip:hover {
  background-image: linear-gradient(
    color-mix(in srgb, var(--color-text) 7%, transparent),
    color-mix(in srgb, var(--color-text) 7%, transparent)
  );
}

.chip:active {
  background-image: linear-gradient(
    color-mix(in srgb, var(--color-text) 14%, transparent),
    color-mix(in srgb, var(--color-text) 14%, transparent)
  );
}

.chip:focus-visible {
  outline: 2px solid var(--color-accent);
  outline-offset: 2px;
}
</style>
