<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import {
  PhCheckCircle,
  PhCircle,
  PhCircleNotch,
  PhIdentificationCard,
  PhWarningCircle,
} from '@phosphor-icons/vue';
import { mobileStepText, stepAnnouncement, stepMarkers } from './creationSteps';
import type { CreationStepView } from './creationSteps';

// The creation step indicator (49-UI-SPEC "Step Bar Contract"): five steps, a desktop band with
// labels, a mobile band with segments, a text row and the Sheet chip. Derived only from the view
// the server row produced; every string is a text node.
const props = defineProps<{ view: CreationStepView; desktop: boolean; keyboardOpen: boolean }>();
const emit = defineEmits<{ openSheet: [] }>();

const markers = computed(() => stepMarkers(props.view));
const stepText = computed(() => mobileStepText(props.view));

const ICONS = {
  done: PhCheckCircle,
  current: PhCircleNotch,
  error: PhWarningCircle,
  todo: PhCircle,
};

// Announced when the position changes, never on first mount.
const announcement = ref('');
watch(
  () => props.view.position,
  () => {
    announcement.value = stepAnnouncement(props.view);
  },
);

const chip = ref<HTMLButtonElement | null>(null);

function focusChip(): void {
  chip.value?.focus();
}

defineExpose({ focusChip });
</script>

<template>
  <div class="stepbar" :class="props.desktop ? 'desktop' : 'mobile'">
    <ol class="steps" aria-label="Character creation steps">
      <li
        v-for="(marker, index) in markers"
        :key="marker.label"
        class="step"
        :class="`state-${marker.state}`"
        :aria-label="marker.ariaLabel"
        :aria-current="index + 1 === props.view.position ? 'step' : undefined"
      >
        <span class="segment" aria-hidden="true"></span>
        <span v-if="props.desktop" class="row">
          <component
            :is="ICONS[marker.state]"
            class="icon"
            :class="[
              `icon-${marker.state}`,
              { spinning: marker.state === 'current' && props.view.working },
            ]"
            :size="14"
            aria-hidden="true"
          />
          <span class="label" :title="marker.label">{{ marker.label }}</span>
        </span>
      </li>
    </ol>
    <div v-if="!props.desktop && !props.keyboardOpen" class="text-row">
      <span class="step-text">{{ stepText }}</span>
      <button
        ref="chip"
        type="button"
        class="tag tag-neutral sheet-chip"
        aria-label="Open character sheet"
        @click="emit('openSheet')"
      >
        <PhIdentificationCard class="chip-icon" :size="14" aria-hidden="true" />
        Sheet
      </button>
    </div>
    <div class="sr-only" role="status">{{ announcement }}</div>
  </div>
</template>

<style scoped>
.stepbar {
  flex: none;
  position: relative;
  min-width: 0;
}

.stepbar.desktop {
  padding: 16px 32px 8px;
  background: color-mix(in srgb, var(--color-surface) 30%, transparent);
}

.stepbar.mobile {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 8px 16px;
  background: color-mix(in srgb, var(--color-surface) 55%, transparent);
}

.steps {
  list-style: none;
  margin: 0;
  padding: 0;
  display: grid;
  grid-template-columns: repeat(5, minmax(0, 1fr));
  gap: 8px;
}

.mobile .steps {
  gap: 4px;
}

.step {
  display: flex;
  flex-direction: column;
  gap: 4px;
  min-width: 0;
}

.segment {
  display: block;
  height: 3px;
  border-radius: var(--radius-sm);
  background: var(--color-neutral-800);
}

.state-done .segment {
  background: var(--color-accent);
}

.state-current .segment,
.state-error .segment {
  background: var(--color-accent-600);
}

.row {
  display: flex;
  align-items: center;
  gap: 4px;
  min-width: 0;
}

.icon {
  flex: none;
}

.icon-done,
.icon-current {
  color: var(--color-accent);
}

.icon-error {
  color: var(--color-health);
}

.icon-todo {
  color: var(--color-neutral-600);
}

.spinning {
  animation: step-spin 1s linear infinite;
}

@keyframes step-spin {
  to {
    transform: rotate(360deg);
  }
}

@media (prefers-reduced-motion: reduce) {
  .spinning {
    animation: none;
  }
}

.label {
  min-width: 0;
  font-size: 12px;
  line-height: 1.5;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.state-done .label {
  color: var(--color-neutral-300);
}

.state-current .label,
.state-error .label {
  color: var(--color-accent-200);
  font-weight: 500;
}

.state-todo .label {
  color: var(--color-neutral-500);
}

.text-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  min-height: 32px;
}

.step-text {
  min-width: 0;
  font-size: 12px;
  line-height: 1.5;
  color: var(--color-neutral-400);
  font-variant-numeric: tabular-nums;
}

.sheet-chip {
  position: relative;
  flex: none;
  display: inline-flex;
  align-items: center;
  gap: 4px;
  min-height: 32px;
  cursor: pointer;
}

.sheet-chip::after {
  content: '';
  position: absolute;
  inset: -6px;
}

.chip-icon {
  color: var(--color-neutral-300);
}

@media (hover: hover) {
  .sheet-chip:hover {
    background: color-mix(in srgb, var(--color-text) 7%, var(--color-neutral-800));
  }
}

.sheet-chip:active {
  background: color-mix(in srgb, var(--color-text) 14%, var(--color-neutral-800));
}

.sr-only {
  position: absolute;
  width: 1px;
  height: 1px;
  overflow: hidden;
  clip-path: inset(50%);
  white-space: nowrap;
}
</style>
