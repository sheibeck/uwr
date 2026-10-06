<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue';
import { PhArrowClockwise, PhArrowLeft, PhCaretRight, PhPaperPlaneRight, PhSparkle } from '@phosphor-icons/vue';
import { createInputHistory } from '../input/history';
import { INPUT_MAX_CHARS } from '../input/limits';
import { START_OVER_CONFIRMATION } from './creationControls';
import type { CreationControls, DecisionButton } from './creationControls';

// The creation input (49-UI-SPEC "Input and Composer"): the quick row, the decision row, the
// Start over confirmation, the input row and the name hint. Every send goes through one `send`
// function (the hub's), never routeInput: creation text is never a console command. A refused
// send keeps the draft. All button text is a text node.
const props = defineProps<{
  controls: CreationControls;
  inert: boolean;
  desktop: boolean;
  send: (text: string) => Promise<boolean>;
  start: () => void;
}>();
const emit = defineEmits<{ focusChange: [focused: boolean] }>();

const draft = ref('');
const history = createInputHistory();
const inputEl = ref<HTMLInputElement | null>(null);
const confirmingStartOver = ref(false);

const locked = computed(() => props.controls.locked);
const buttonsDisabled = computed(() => props.controls.disabled || props.inert);
const placeholder = computed(() =>
  props.desktop ? props.controls.placeholder : props.controls.mobilePlaceholder,
);
const sendDisabled = computed(() => locked.value || draft.value.trim() === '');
const showDecisions = computed(() => confirmingStartOver.value || props.controls.decisions.length > 0);

// The confirmation belongs to one step: it closes when the decision set changes.
const decisionKey = computed(() => props.controls.decisions.map((d) => d.id).join('|'));
watch(decisionKey, () => {
  confirmingStartOver.value = false;
});

function moveCaretToEnd(): void {
  void nextTick(() => {
    const el = inputEl.value;
    if (el === null) return;
    const end = el.value.length;
    el.setSelectionRange(end, end);
  });
}

/** Focuses the input when it can take focus; false when it is missing or disabled. */
function focusInput(): boolean {
  const el = inputEl.value;
  if (el === null || el.disabled) return false;
  el.focus();
  return true;
}

function keepFocus(): void {
  focusInput();
}

async function submit(): Promise<void> {
  const text = draft.value.trim();
  if (text === '' || locked.value) return;
  const ok = await props.send(text);
  if (ok) {
    history.record(text);
    draft.value = '';
  }
  keepFocus();
}

function onKeydown(event: KeyboardEvent): void {
  if (event.key === 'Escape') {
    inputEl.value?.blur();
    return;
  }
  if (event.isComposing) return;
  if (event.key === 'Enter') {
    event.preventDefault();
    void submit();
  } else if (event.key === 'ArrowUp') {
    event.preventDefault();
    const previous = history.up(draft.value);
    if (previous !== null) draft.value = previous;
    moveCaretToEnd();
  } else if (event.key === 'ArrowDown') {
    event.preventDefault();
    const next = history.down();
    if (next !== null) draft.value = next;
    moveCaretToEnd();
  }
}

function sendQuick(): void {
  const quick = props.controls.quick;
  if (quick === null || buttonsDisabled.value) return;
  void props.send(quick.sends);
}

function runDecision(button: DecisionButton): void {
  if (buttonsDisabled.value) return;
  const action = button.action;
  if (action.type === 'send') {
    confirmingStartOver.value = false;
    void props.send(action.text);
  } else if (action.type === 'start') {
    props.start();
  } else if (action.type === 'askStartOver') {
    confirmingStartOver.value = true;
  } else {
    // dismiss: a local close of the confirmation, nothing is sent.
    confirmingStartOver.value = false;
  }
}

// The view moves focus here when the mobile sheet closes on a breakpoint change. It reports
// whether the input took focus, so the view can fall back while the input is disabled.
defineExpose({ focusInput });
</script>

<template>
  <div class="creation-composer" :class="{ mobile: !props.desktop }">
    <div v-if="props.controls.quick !== null" class="quick-row">
      <button
        type="button"
        class="tag tag-outline quick-chip"
        :disabled="buttonsDisabled"
        @click="sendQuick"
      >
        <PhSparkle class="quick-icon" :size="14" aria-hidden="true" />
        {{ props.controls.quick.label }}
      </button>
    </div>

    <div v-if="showDecisions" class="decision-row">
      <template v-if="confirmingStartOver">
        <span class="confirm-prompt">{{ START_OVER_CONFIRMATION.prompt }}</span>
        <button
          type="button"
          class="btn btn-secondary decision-btn danger"
          :disabled="buttonsDisabled"
          @click="runDecision(START_OVER_CONFIRMATION.yes)"
        >
          {{ START_OVER_CONFIRMATION.yes.label }}
        </button>
        <button
          type="button"
          class="btn btn-primary decision-btn"
          @click="runDecision(START_OVER_CONFIRMATION.keep)"
        >
          {{ START_OVER_CONFIRMATION.keep.label }}
        </button>
      </template>
      <template v-else>
        <button
          v-for="button in props.controls.decisions"
          :key="button.id"
          type="button"
          class="btn decision-btn"
          :class="[`btn-${button.variant}`, { danger: button.danger }]"
          :disabled="buttonsDisabled"
          @click="runDecision(button)"
        >
          <PhArrowClockwise v-if="button.icon === 'retry'" class="icon-retry" :size="14" aria-hidden="true" />
          <PhArrowLeft v-else-if="button.icon === 'back'" class="icon-back" :size="14" aria-hidden="true" />
          {{ button.label }}
        </button>
      </template>
    </div>

    <div class="input-row">
      <div class="input-wrap">
        <PhCaretRight class="lead" :size="16" aria-hidden="true" />
        <input
          ref="inputEl"
          v-model="draft"
          class="input composer-input"
          :class="{ locked }"
          type="text"
          aria-label="Your answer"
          :placeholder="placeholder"
          :maxlength="INPUT_MAX_CHARS"
          :disabled="locked"
          :aria-disabled="locked ? 'true' : undefined"
          autocomplete="off"
          autocapitalize="sentences"
          enterkeyhint="send"
          @keydown="onKeydown"
          @focus="emit('focusChange', true)"
          @blur="emit('focusChange', false)"
        />
      </div>
      <button
        v-if="props.desktop"
        type="button"
        class="btn btn-primary send"
        :disabled="sendDisabled"
        @click="submit"
      >
        Send
      </button>
      <button
        v-else
        type="button"
        class="btn btn-primary btn-icon send send-icon"
        aria-label="Send"
        :disabled="sendDisabled"
        @click="submit"
      >
        <PhPaperPlaneRight :size="18" aria-hidden="true" />
      </button>
    </div>

    <p v-if="props.controls.nameHint" class="name-hint">{{ props.controls.nameHint }}</p>
  </div>
</template>

<style scoped>
.creation-composer {
  flex: none;
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 8px 32px 16px;
  min-width: 0;
}

.creation-composer.mobile {
  padding: 8px 16px calc(8px + env(safe-area-inset-bottom));
  background: color-mix(in srgb, var(--color-surface) 40%, transparent);
}

.quick-row {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  min-height: 32px;
  align-items: center;
}

.mobile .quick-row {
  min-height: 44px;
}

.quick-chip {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  cursor: pointer;
  background: transparent;
}

.quick-chip:disabled {
  opacity: 0.45;
  cursor: default;
}

.quick-icon {
  flex: none;
}

.decision-row {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
  min-height: 32px;
}

.mobile .decision-row {
  min-height: 44px;
}

.confirm-prompt {
  font-size: 12px;
  line-height: 1.5;
  color: var(--color-neutral-200);
}

.decision-btn {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  min-height: 32px;
  padding: 4px 16px;
  font-size: 12px;
  font-weight: 500;
}

.mobile .decision-btn {
  min-height: 44px;
}

.decision-btn:disabled {
  opacity: 0.45;
  cursor: default;
}

.decision-btn.danger {
  color: var(--color-health);
}

.input-row {
  display: flex;
  align-items: center;
  gap: 8px;
}

.input-wrap {
  position: relative;
  flex: 1;
  min-width: 0;
}

.lead {
  position: absolute;
  left: 16px;
  top: 50%;
  transform: translateY(-50%);
  color: var(--color-accent);
  pointer-events: none;
}

.composer-input {
  min-height: 40px;
  padding-left: 32px;
  font-size: 14px;
}

.mobile .composer-input {
  min-height: 44px;
}

.composer-input.locked {
  opacity: 0.45;
}

.send {
  flex: none;
  min-height: 40px;
  padding: 0 16px;
}

.send-icon {
  width: 44px;
  height: 44px;
  min-height: 44px;
  padding: 0;
}

.name-hint {
  margin: 0;
  font-size: 12px;
  line-height: 1.5;
  color: var(--color-neutral-500);
}
</style>
