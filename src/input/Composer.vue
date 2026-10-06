<script setup lang="ts">
import { computed, inject, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { PhCaretRight, PhChatCircleText, PhPaperPlaneRight, PhX } from '@phosphor-icons/vue';
import {
  CONSOLE_KEY,
  FRAME_KEY,
  GAME_KEY,
  createInertConsole,
  createInertFrame,
  createInertGame,
} from '../game/context';
import { INPUT_MAX_CHARS } from './limits';

// The input row and the conversation chip (47-UI-SPEC "Composer controls", "Conversation mode").
// Everything the player types stays an input value; names and chip text are text nodes only.
const consoleApi = inject(CONSOLE_KEY, createInertConsole());
const game = inject(GAME_KEY, createInertGame());
const frame = inject(FRAME_KEY, createInertFrame());

const inputEl = ref<HTMLInputElement | null>(null);

const draft = computed<string>({
  get: () => consoleApi.draft.value,
  set: (value) => {
    consoleApi.draft.value = value;
  },
});

const connected = computed(() => game.connected.value);
const target = computed(() => consoleApi.conversation.value);
const sendDisabled = computed(() => !connected.value || draft.value.trim() === '');
const placeholder = computed(() => {
  if (!connected.value) return 'Reconnecting…';
  if (target.value !== null) return `Say something to ${target.value.name}…`;
  return 'What do you do?';
});

function focusEnd(): void {
  const el = inputEl.value;
  if (el === null) return;
  el.focus();
  const end = el.value.length;
  el.setSelectionRange(end, end);
}

function moveCaretToEnd(): void {
  void nextTick(() => {
    const el = inputEl.value;
    if (el === null) return;
    const end = el.value.length;
    el.setSelectionRange(end, end);
  });
}

function send(): void {
  consoleApi.submit();
  // The input keeps focus after a send; a refused line stays in the input.
  const el = inputEl.value;
  if (el !== null && !el.disabled) el.focus();
}

function onKeydown(event: KeyboardEvent): void {
  if (event.key === 'Escape') {
    inputEl.value?.blur();
    return;
  }
  if (event.isComposing) return;
  if (event.key === 'Enter') {
    event.preventDefault();
    send();
  } else if (event.key === 'ArrowUp') {
    event.preventDefault();
    consoleApi.recallPrevious();
    moveCaretToEnd();
  } else if (event.key === 'ArrowDown') {
    event.preventDefault();
    consoleApi.recallNext();
    moveCaretToEnd();
  }
}

function onFocus(): void {
  consoleApi.inputFocused.value = true;
}

function onBlur(): void {
  consoleApi.inputFocused.value = false;
}

function onDocumentKeydown(event: KeyboardEvent): void {
  if (event.key !== 'Enter' || event.isComposing) return;
  const active = document.activeElement;
  if (active !== null && active !== document.body) return;
  if (frame.activeScreen.value !== null || !connected.value) return;
  event.preventDefault();
  focusEnd();
}

watch(
  () => consoleApi.focusTick.value,
  () => {
    void nextTick(focusEnd);
  },
);

onMounted(() => {
  document.addEventListener('keydown', onDocumentKeydown);
  if (frame.isDesktop.value) inputEl.value?.focus();
});

onBeforeUnmount(() => {
  document.removeEventListener('keydown', onDocumentKeydown);
});
</script>

<template>
  <div class="composer-box" :class="{ mobile: !frame.isDesktop.value }">
    <div v-if="target !== null" class="chip-row">
      <span class="conversation-chip" role="status">
        <PhChatCircleText class="chip-icon" :size="14" aria-hidden="true" />
        <span class="chip-name" :title="target.name">Talking with {{ target.name }}</span>
        <button
          type="button"
          class="chip-end"
          :aria-label="`End conversation with ${target.name}`"
          @click="consoleApi.endConversation()"
        >
          <PhX :size="12" aria-hidden="true" />
        </button>
      </span>
    </div>

    <div class="input-row">
      <div class="input-wrap">
        <PhCaretRight class="lead" :size="16" aria-hidden="true" />
        <input
          ref="inputEl"
          v-model="draft"
          class="input composer-input"
          type="text"
          aria-label="Your action"
          :placeholder="placeholder"
          :maxlength="INPUT_MAX_CHARS"
          :disabled="!connected"
          autocomplete="off"
          autocapitalize="sentences"
          enterkeyhint="send"
          @keydown="onKeydown"
          @focus="onFocus"
          @blur="onBlur"
        />
      </div>
      <button
        v-if="frame.isDesktop.value"
        type="button"
        class="btn btn-primary send"
        aria-label="Send action"
        :disabled="sendDisabled"
        @click="send"
      >
        Send
      </button>
      <button
        v-else
        type="button"
        class="btn btn-primary btn-icon send send-icon"
        aria-label="Send action"
        :disabled="sendDisabled"
        @click="send"
      >
        <PhPaperPlaneRight :size="18" aria-hidden="true" />
      </button>
    </div>
  </div>
</template>

<style scoped>
.composer-box {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.chip-row {
  display: flex;
  align-items: center;
  height: 32px;
}

.conversation-chip {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  height: 32px;
  padding: 0 4px 0 8px;
  font-size: 12px;
  background: var(--color-neutral-800);
  color: var(--color-neutral-100);
  border-radius: var(--radius-md);
}

.chip-icon {
  flex: none;
  color: var(--color-accent);
}

.chip-name {
  max-width: 240px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.chip-end {
  flex: none;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  padding: 0;
  cursor: pointer;
  color: inherit;
  background: transparent;
  border: 0;
  border-radius: var(--radius-md);
}

.chip-end:hover {
  background: color-mix(in srgb, var(--color-text) 14%, transparent);
}

.chip-end:active {
  background: color-mix(in srgb, var(--color-text) 22%, transparent);
}

.mobile .chip-end {
  width: 44px;
  height: 44px;
  margin-block: calc((32px - 44px) / 2);
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
</style>
