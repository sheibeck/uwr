<script setup lang="ts">
import { PhCaretRight, PhCircleNotch, PhWarningCircle } from '@phosphor-icons/vue';
import type { Character } from '../module_bindings/types';
import { accountLine, avatarInitial } from './frameView';
import PreFrameHeader from './PreFrameHeader.vue';

// characters arrive already sorted oldest first (sortCharacters, 45-09).
defineProps<{ characters: readonly Character[]; pendingId: bigint | null; failed: boolean }>();
const emit = defineEmits<{ select: [characterId: bigint]; logout: [] }>();
</script>

<template>
  <div class="session-ground">
    <PreFrameHeader title="Choose a character" @logout="emit('logout')" />
    <div class="card picker">
      <h4>Choose a character</h4>
      <div v-if="failed" class="error" role="alert">
        <PhWarningCircle class="error-icon" :size="16" aria-hidden="true" />
        <span class="error-text">Couldn't open that character. Try again.</span>
      </div>
      <div class="list">
        <button
          v-for="c in characters"
          :key="String(c.id)"
          type="button"
          class="row"
          :aria-label="`Play as ${c.name}`"
          :disabled="pendingId !== null"
          @click="emit('select', c.id)"
        >
          <span class="avatar" aria-hidden="true">{{ avatarInitial(c.name) }}</span>
          <span class="text">
            <span class="name" :title="c.name">{{ c.name }}</span>
            <span class="account">{{ accountLine(c) }}</span>
          </span>
          <PhCircleNotch v-if="pendingId === c.id" class="spin trail pending" :size="16" aria-hidden="true" />
          <PhCaretRight v-else class="trail" :size="16" aria-hidden="true" />
        </button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.picker {
  width: min(440px, 100% - 32px);
  margin: 48px auto 0;
  padding: 24px;
  border-radius: var(--radius-lg);
  gap: 16px;
}
@media (max-width: 899px) {
  .picker {
    margin-top: 24px;
  }
}
.list {
  display: flex;
  flex-direction: column;
  gap: 8px;
  max-height: calc(100dvh - 160px);
  overflow-y: auto;
}
.row {
  min-height: 56px;
  padding: 8px 16px;
  border-radius: var(--radius-md);
  background: var(--color-bg);
  color: var(--color-text);
  display: flex;
  align-items: center;
  gap: 16px;
  width: 100%;
  text-align: left;
  cursor: pointer;
}
.row:hover:not(:disabled) {
  background: color-mix(in srgb, var(--color-text) 7%, transparent);
}
.row:active:not(:disabled) {
  background: color-mix(in srgb, var(--color-text) 14%, transparent);
}
.row:focus-visible {
  outline: 2px solid var(--color-accent);
  outline-offset: -2px;
}
.row:disabled {
  opacity: 0.45;
  cursor: default;
}
.avatar {
  width: 36px;
  height: 36px;
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: var(--radius-md);
  background: var(--color-accent-900);
  box-shadow: inset 0 0 0 1px var(--color-accent-700);
  color: var(--color-accent-300);
  font-size: 14px;
  font-weight: 500;
}
.text {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
}
.name {
  font-size: 14px;
  font-weight: 500;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.account {
  font-size: 12px;
  color: var(--color-neutral-400);
}
.trail {
  flex-shrink: 0;
  color: var(--color-neutral-500);
}
.pending {
  color: var(--color-accent);
}
.error {
  display: flex;
  gap: 8px;
  align-items: center;
  padding: 8px 16px;
  border-radius: var(--radius-md);
  background: color-mix(in srgb, var(--color-health) 18%, transparent);
}
.error-icon {
  color: var(--color-health);
  flex-shrink: 0;
}
.error-text {
  color: var(--color-neutral-200);
}
</style>
