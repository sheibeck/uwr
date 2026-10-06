<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, useTemplateRef, watch } from 'vue';
import type { PickerOption } from './craftingModel';

// The inline picker for an essence or a reagent (50-UI-SPEC "Optional reagent", Picker): a listbox of
// the eligible items on hand. Up and Down move the active option, Enter chooses, Esc closes. Esc is
// caught in the capture phase and prevented, so the drawer's own Esc (it checks defaultPrevented)
// stays shut. An ineligible option is listed with its hint but cannot be chosen. The caller restores
// focus to the slot that opened the picker on choose and on close. Item names are server text and
// only reach the page as text nodes.
const props = withDefaults(
  defineProps<{
    kind: 'essence' | 'reagent';
    options: ReadonlyArray<PickerOption>;
    mobile?: boolean;
  }>(),
  { mobile: false },
);
const emit = defineEmits<{ choose: [templateId: bigint]; close: [] }>();

const listbox = useTemplateRef<HTMLElement>('listbox');

const label = computed(() => (props.kind === 'essence' ? 'Choose essence' : 'Choose reagent'));
const emptyText = computed(() => (props.kind === 'essence' ? 'No essences on hand.' : 'No reagents on hand.'));

const active = ref(0);

function firstChoosable(): number {
  const index = props.options.findIndex((option) => option.eligible);
  return index === -1 ? 0 : index;
}
active.value = firstChoosable();

watch(
  () => props.options.length,
  (length) => {
    if (active.value >= length) active.value = Math.max(0, length - 1);
  },
);

const optionId = (index: number): string => `picker-${props.kind}-option-${index}`;

function choose(index: number): void {
  const option = props.options[index];
  if (!option || !option.eligible) return;
  emit('choose', option.templateId);
}

function onKeydown(event: KeyboardEvent): void {
  const count = props.options.length;
  if (count === 0) return;
  if (event.key === 'ArrowDown') {
    event.preventDefault();
    active.value = Math.min(count - 1, active.value + 1);
  } else if (event.key === 'ArrowUp') {
    event.preventDefault();
    active.value = Math.max(0, active.value - 1);
  } else if (event.key === 'Enter') {
    event.preventDefault();
    choose(active.value);
  }
}

function onDocumentKeydown(event: KeyboardEvent): void {
  if (event.key !== 'Escape') return;
  event.preventDefault();
  emit('close');
}

onMounted(() => {
  document.addEventListener('keydown', onDocumentKeydown, true);
  void nextTick(() => listbox.value?.focus());
});

onBeforeUnmount(() => {
  document.removeEventListener('keydown', onDocumentKeydown, true);
});
</script>

<template>
  <div class="reagent-picker" :class="{ mobile: props.mobile }">
    <p v-if="props.options.length === 0" class="empty">{{ emptyText }}</p>
    <div
      v-else
      ref="listbox"
      class="options"
      role="listbox"
      tabindex="0"
      :aria-label="label"
      :aria-activedescendant="optionId(active)"
      @keydown="onKeydown"
    >
      <div
        v-for="(option, index) in props.options"
        :id="optionId(index)"
        :key="String(option.templateId)"
        class="option"
        :class="{ active: index === active }"
        role="option"
        :aria-selected="index === active ? 'true' : 'false'"
        :aria-disabled="option.eligible ? undefined : 'true'"
        @click="choose(index)"
      >
        <span class="name" :style="{ color: option.color }" :title="option.name">{{ option.name }}</span>
        <span class="have">×{{ option.have }}</span>
        <span class="hint">{{ option.hint }}</span>
      </div>
    </div>
  </div>
</template>

<style scoped>
.reagent-picker {
  display: flex;
  flex-direction: column;
  font-variant-numeric: tabular-nums;
}

.empty {
  margin: 0;
  padding: 4px 8px;
  font-size: 12px;
  line-height: 1.5;
  color: var(--color-neutral-500);
}

.options {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.options:focus-visible {
  outline: 2px solid var(--color-accent);
  outline-offset: -2px;
}

.option {
  display: flex;
  align-items: center;
  gap: 8px;
  min-height: 32px;
  padding: 4px 8px;
  border-radius: var(--radius-md);
  font-size: 12px;
  line-height: 1.5;
  cursor: pointer;
}

.mobile .option {
  min-height: 44px;
}

.option:hover {
  background: color-mix(in srgb, var(--color-text) 7%, transparent);
}

.option:active {
  background: color-mix(in srgb, var(--color-text) 14%, transparent);
}

.option.active {
  background: color-mix(in srgb, var(--color-text) 7%, transparent);
  box-shadow: inset 0 0 0 1px var(--color-neutral-600);
}

.option[aria-disabled='true'] {
  opacity: 0.45;
  cursor: default;
}

.name {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.have {
  flex: none;
  color: var(--color-neutral-400);
}

.hint {
  flex: 1;
  min-width: 0;
  text-align: right;
  color: var(--color-neutral-400);
  overflow-wrap: anywhere;
}
</style>
