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
  <!-- Non-modal: the rail and header stay visible and operable beside the drawer (inset 252px). -->
  <section ref="root" class="drawer" role="dialog" aria-modal="false" :aria-labelledby="titleId">
    <div class="drawer-header">
      <h4 :id="titleId">{{ props.title }}</h4>
      <span class="drawer-meta"><slot name="meta" /></span>
      <span class="drawer-spacer"></span>
      <button
        ref="closeButton"
        type="button"
        class="btn btn-ghost btn-icon drawer-close"
        :aria-label="`Close ${props.title}`"
        :title="`Close ${props.title}`"
        @click="emit('close')"
      >
        <PhX :size="17" />
      </button>
    </div>
    <div class="drawer-body"><slot /></div>
  </section>
</template>

<style scoped>
.drawer {
  position: absolute;
  inset: 0 0 0 252px;
  display: flex;
  flex-direction: column;
  background: var(--color-surface);
  box-shadow: var(--shadow-md);
  z-index: 10;
  animation: drawer-in 160ms ease-out;
}

.drawer-header {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 16px 24px 8px;
}

.drawer-header h4 {
  margin: 0;
}

.drawer-meta {
  font-size: 12px;
  color: var(--color-neutral-400);
}

.drawer-spacer {
  flex: 1;
}

.drawer-close {
  color: var(--color-neutral-300);
}

.drawer-body {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  padding: 4px 24px 24px;
}

@keyframes drawer-in {
  from {
    transform: translateX(16px);
    opacity: 0;
  }
  to {
    transform: none;
    opacity: 1;
  }
}

@media (prefers-reduced-motion: reduce) {
  .drawer {
    animation: none;
  }
}
</style>
