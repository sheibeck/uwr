<script setup lang="ts">
import { onBeforeUnmount, onMounted, useId, useTemplateRef } from 'vue';
import { PhX } from '@phosphor-icons/vue';
import { trapTabKeyAtDocument } from './focusTrap';

const props = defineProps<{ title: string }>();
const emit = defineEmits<{ close: [] }>();

const titleId = useId();
const closeButton = useTemplateRef<HTMLButtonElement>('closeButton');
const root = useTemplateRef<HTMLElement>('root');

function onDocumentKeydown(event: KeyboardEvent): void {
  // Tab is handled at the document, not on the dialog: with focus lost on <body> a
  // dialog-level handler never sees the event and Tab would walk out. Focus that is on the
  // header or tab bar beside the dialog is left alone so those controls stay reachable.
  if (event.key === 'Tab') {
    if (root.value) trapTabKeyAtDocument(event, root.value);
    return;
  }
  if (event.key !== 'Escape' || event.defaultPrevented) return;
  emit('close');
}

onMounted(() => {
  closeButton.value?.focus();
  document.addEventListener('keydown', onDocumentKeydown);
});

onBeforeUnmount(() => {
  document.removeEventListener('keydown', onDocumentKeydown);
});
</script>

<template>
  <!-- Modal per 45-UI-SPEC: on mobile the sheet is a full-height overlay that replaces the story. -->
  <section ref="root" class="sheet" role="dialog" aria-modal="true" :aria-labelledby="titleId">
    <div class="grabber-wrap"><div class="grabber" aria-hidden="true"></div></div>
    <div class="sheet-header">
      <h4 :id="titleId">{{ props.title }}</h4>
      <slot name="meta" />
      <span class="sheet-spacer"></span>
      <button
        ref="closeButton"
        type="button"
        class="btn btn-ghost btn-icon sheet-close"
        :aria-label="`Close ${props.title}`"
        :title="`Close ${props.title}`"
        @click="emit('close')"
      >
        <PhX :size="18" />
      </button>
    </div>
    <div class="sheet-body"><slot /></div>
  </section>
</template>

<style scoped>
.sheet {
  flex: 1;
  min-height: 0;
  margin-top: 8px;
  border-radius: 20px 20px 0 0;
  background: var(--color-surface);
  overflow: hidden;
  display: flex;
  flex-direction: column;
  animation: sheet-in 200ms ease-out;
}

.grabber-wrap {
  padding: 8px 0 4px;
}

.grabber {
  width: 36px;
  height: 4px;
  border-radius: var(--radius-sm);
  background: var(--color-neutral-700);
  margin: 0 auto;
}

.sheet-header {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 4px 16px 8px;
}

.sheet-header h4 {
  margin: 0;
}

.sheet-spacer {
  flex: 1;
}

.sheet-close {
  width: 44px;
  height: 44px;
  color: var(--color-neutral-300);
}

.sheet-body {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  padding: 0 16px 16px;
}

@keyframes sheet-in {
  from {
    transform: translateY(100%);
  }
  to {
    transform: none;
  }
}

@media (prefers-reduced-motion: reduce) {
  .sheet {
    animation: none;
  }
}
</style>
