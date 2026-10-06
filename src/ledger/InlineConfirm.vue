<script setup lang="ts">
import { nextTick, onBeforeUnmount, onMounted, useTemplateRef } from 'vue';

// Inline confirmation (50-UI-SPEC "Inline confirmation", the 49 Start over pattern): it replaces
// an action row in place. Focus starts on Keep it (the safe default). Keep it and Esc hand back
// to the caller and refocus the element that opened the confirmation. Esc is caught in the
// capture phase and prevented, so the drawer's own Esc (it checks defaultPrevented) stays shut.
const props = withDefaults(
  defineProps<{
    prompt: string;
    confirmLabel: string;
    keepLabel?: string;
    /** The confirmed call is in flight: the confirm button is inert. */
    pending?: boolean;
    mobile?: boolean;
    /** The element that opened the confirmation; it takes focus back on Keep it or Esc. */
    opener?: HTMLElement | null;
  }>(),
  { keepLabel: 'Keep it', pending: false, mobile: false, opener: null },
);
const emit = defineEmits<{ confirm: []; keep: [] }>();

const keepButton = useTemplateRef<HTMLButtonElement>('keepButton');

function keep(): void {
  emit('keep');
  const opener = props.opener;
  void nextTick(() => {
    if (opener && opener.isConnected) opener.focus();
  });
}

function onConfirm(): void {
  if (props.pending) return;
  emit('confirm');
}

function onDocumentKeydown(event: KeyboardEvent): void {
  if (event.key !== 'Escape') return;
  event.preventDefault();
  keep();
}

onMounted(() => {
  keepButton.value?.focus();
  document.addEventListener('keydown', onDocumentKeydown, true);
});

onBeforeUnmount(() => {
  document.removeEventListener('keydown', onDocumentKeydown, true);
});
</script>

<template>
  <div class="inline-confirm" :class="{ mobile: props.mobile }">
    <!-- Live region: a prompt that changes (the Sell quantity total) is announced, atomically. -->
    <span class="confirm-prompt" aria-live="polite" aria-atomic="true">{{ props.prompt }}</span>
    <!-- Optional controls between the prompt and the decisions, used by the Sell quantity picker. -->
    <slot />
    <button
      type="button"
      class="btn btn-secondary decision-btn danger"
      :aria-disabled="props.pending ? 'true' : undefined"
      @click="onConfirm"
    >
      {{ props.confirmLabel }}
    </button>
    <button ref="keepButton" type="button" class="btn btn-primary decision-btn" @click="keep">
      {{ props.keepLabel }}
    </button>
  </div>
</template>

<style scoped>
.inline-confirm {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
  min-height: 32px;
}

.inline-confirm.mobile {
  min-height: 44px;
}

.confirm-prompt {
  font-size: 12px;
  line-height: 1.5;
  color: var(--color-neutral-200);
  overflow-wrap: anywhere;
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

.decision-btn[aria-disabled='true'] {
  opacity: 0.45;
  cursor: default;
}

.decision-btn.danger {
  color: var(--color-health);
}
</style>
