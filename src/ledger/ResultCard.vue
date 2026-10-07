<script setup lang="ts">
import { nextTick, onBeforeUnmount, ref, useId, useTemplateRef, watch } from 'vue';
import type { Component } from 'vue';
import { trapTabKey } from '../frame/focusTrap';
import type { ResultCardView } from './resultCard';

// The shared result card for Crafted, Salvaged and Discover recipes (50-CONTEXT "Result card"): a
// centered card over the drawer on desktop, a bottom sheet on mobile. Its content comes from
// resultCardView, which reads the server's action_result row; every server string here is a text
// node and nothing is optimistic. The card is a labelled modal dialog. Focus moves to Done on open,
// Tab wraps inside the card and never reaches the drawer's own document trap, and Esc is caught in
// the capture phase and prevented so only the card closes (the 49 and 50 confirmation pattern).
// A polite live region stays mounted for as long as the screen is, so a new result is announced.
// The host screen root must be position: relative; the scrim covers it.
export interface ResultCardAction {
  id: string;
  label: string;
  icon?: Component;
  tone: 'primary' | 'secondary';
  /** The action's call is in flight: it is aria-disabled and sends nothing. */
  pending?: boolean;
  ariaLabel?: string;
}

const props = withDefaults(
  defineProps<{
    view: ResultCardView | null;
    mobile?: boolean;
    actions?: ReadonlyArray<ResultCardAction>;
  }>(),
  { mobile: false, actions: () => [] },
);
const emit = defineEmits<{ close: []; action: [id: string] }>();

const dialog = useTemplateRef<HTMLElement>('dialog');
const doneButton = useTemplateRef<HTMLButtonElement>('doneButton');
const liveText = ref('');
const titleId = useId();
const subId = useId();

let listening = false;
// The latest announcement: a slower nextTick from an earlier result never overwrites a newer one.
let announceToken = 0;
// A scrim click closes the card only when its pointerdown also landed on the scrim. The second click of
// a double-click on Craft or Salvage can reach the scrim once the card has appeared, but its pointerdown
// came before the scrim existed, so it no longer dismisses the card unseen (WR-05, iteration 3).
let downOnScrim = false;

function onScrimPointerdown(event: PointerEvent): void {
  downOnScrim = event.target === event.currentTarget;
}

function onScrimClick(event: MouseEvent): void {
  const paired = downOnScrim && event.target === event.currentTarget;
  downOnScrim = false;
  if (paired) emit('close');
}

function onDocumentKeydown(event: KeyboardEvent): void {
  if (event.key !== 'Escape') return;
  event.preventDefault();
  emit('close');
}

function listen(on: boolean): void {
  if (on === listening) return;
  listening = on;
  if (on) document.addEventListener('keydown', onDocumentKeydown, true);
  else document.removeEventListener('keydown', onDocumentKeydown, true);
}

// A new result (first one, or a higher seq) is announced and Done takes focus. The region is cleared
// first and set on the next tick, so a result whose text repeats the previous one (Craft again with the
// same count, two empty salvages) is still a real change and is announced again.
watch(
  () => props.view,
  (now, before) => {
    if (now === null) {
      listen(false);
      return;
    }
    listen(true);
    if (!before) downOnScrim = false;
    if (!before || now.seq !== before.seq) {
      announceToken += 1;
      const token = announceToken;
      const text = now.announce;
      liveText.value = '';
      void nextTick(() => {
        if (token === announceToken) liveText.value = text;
        doneButton.value?.focus();
      });
    }
  },
  { immediate: true },
);

onBeforeUnmount(() => listen(false));

// The ring and glow come from the title color (a var() string from the view model), never a literal.
function iconBoxStyle(view: ResultCardView): Record<string, string> {
  return {
    color: view.iconColor,
    boxShadow: `inset 0 0 0 1px ${view.titleColor}, 0 0 36px color-mix(in srgb, ${view.titleColor} 35%, transparent)`,
  };
}

function onCardKeydown(event: KeyboardEvent): void {
  if (event.key !== 'Tab') return;
  if (dialog.value) trapTabKey(event, dialog.value);
  event.stopPropagation();
}

function onAction(action: ResultCardAction): void {
  if (action.pending) return;
  emit('action', action.id);
}
</script>

<template>
  <p class="sr-only" role="status" aria-live="polite" aria-atomic="true">{{ liveText }}</p>
  <div
    v-if="props.view"
    class="result-scrim"
    :class="{ mobile: props.mobile }"
    @pointerdown="onScrimPointerdown"
    @click="onScrimClick"
  >
    <section
      ref="dialog"
      class="result-card"
      :class="{ mobile: props.mobile }"
      role="dialog"
      aria-modal="true"
      :aria-labelledby="titleId"
      :aria-describedby="subId"
      @keydown="onCardKeydown"
    >
      <header class="head">
        <span class="kicker">{{ props.view.kicker }}</span>
        <div class="icon-box" :style="iconBoxStyle(props.view)">
          <component :is="props.view.icon" :size="props.mobile ? 32 : 40" aria-hidden="true" />
          <span v-if="props.view.qtyTag" class="qty-tag">{{ props.view.qtyTag }}</span>
        </div>
        <div class="titles">
          <h4 :id="titleId" class="title" :style="{ color: props.view.titleColor }">{{ props.view.title }}</h4>
          <div :id="subId" class="sub">{{ props.view.sub }}</div>
        </div>
      </header>

      <div v-if="!props.mobile && props.view.stats.length > 0" class="chips">
        <span v-for="stat in props.view.stats" :key="stat.key" class="chip tag tag-neutral">
          {{ stat.abbr }} {{ stat.text }}
        </span>
      </div>
      <div v-if="props.view.effect" class="effect">{{ props.view.effect }}</div>

      <div class="list">
        <h6 class="list-title">{{ props.view.listTitle }}</h6>
        <ul v-if="props.view.lines.length > 0" class="rows">
          <li v-for="line in props.view.lines" :key="line.key" class="result-row" :class="{ ring: line.ring }">
            <component :is="line.icon" :size="16" class="row-icon" :style="{ color: line.iconColor }" aria-hidden="true" />
            <span class="name">{{ line.name }}</span>
            <span v-if="line.tag" class="tag tag-accent row-tag">{{ line.tag }}</span>
            <span v-if="line.totalText" class="total">{{ line.totalText }}</span>
            <span v-if="line.qtyText" class="qty" :class="`tone-${line.tone}`">{{ line.qtyText }}</span>
          </li>
        </ul>
        <div v-else class="empty">{{ props.view.emptyText }}</div>
      </div>

      <div class="buttons">
        <button
          ref="doneButton"
          type="button"
          class="btn card-btn"
          :class="[props.mobile ? 'btn-secondary full' : 'btn-ghost done']"
          @click="emit('close')"
        >
          Done
        </button>
        <div v-if="!props.mobile" class="spacer" />
        <button
          v-for="action in props.actions"
          :key="action.id"
          type="button"
          class="btn card-btn"
          :class="[action.tone === 'primary' ? 'btn-primary' : 'btn-secondary', { full: props.mobile }]"
          :aria-disabled="action.pending ? 'true' : undefined"
          :aria-label="action.ariaLabel"
          @click="onAction(action)"
        >
          <component :is="action.icon" v-if="action.icon" :size="16" aria-hidden="true" />
          {{ action.label }}
        </button>
      </div>

      <div class="footer">{{ props.view.footer }}</div>
    </section>
  </div>
</template>

<style scoped>
.sr-only {
  position: absolute;
  width: 1px;
  height: 1px;
  overflow: hidden;
  clip-path: inset(50%);
  white-space: nowrap;
}

.result-scrim {
  position: absolute;
  inset: 0;
  z-index: 5;
  display: grid;
  place-items: center;
  padding: 16px;
  background: color-mix(in srgb, var(--color-bg) 72%, transparent);
}

.result-scrim.mobile {
  display: flex;
  align-items: flex-end;
  padding: 0;
}

.result-card {
  box-sizing: border-box;
  width: 440px;
  max-width: 100%;
  max-height: 100%;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 16px;
  padding: 24px;
  border-radius: var(--radius-lg);
  background: var(--color-surface);
  box-shadow: inset 0 0 0 1px var(--color-neutral-700), var(--shadow-lg);
}

.result-card.mobile {
  width: 100%;
  padding: 24px 16px;
  border-radius: 20px 20px 0 0;
}

.head {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  text-align: center;
}

.kicker {
  font-size: 10px;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  color: var(--color-accent);
}

.icon-box {
  position: relative;
  display: grid;
  place-items: center;
  width: 84px;
  height: 84px;
  border-radius: var(--radius-lg);
  background: var(--color-bg);
}

.mobile .icon-box {
  width: 72px;
  height: 72px;
}

.qty-tag {
  position: absolute;
  top: 4px;
  right: 8px;
  font-size: 12px;
  color: var(--color-neutral-100);
}

.title {
  margin: 0;
  font-size: 20px;
  font-weight: 500;
  overflow-wrap: anywhere;
}

.sub {
  font-size: 12px;
  color: var(--color-neutral-400);
  overflow-wrap: anywhere;
}

.chips {
  display: flex;
  flex-wrap: wrap;
  justify-content: center;
  gap: 8px;
}

.chip {
  padding: 4px 8px;
}

.effect {
  text-align: center;
  font-size: 12px;
  color: var(--color-con-light-green);
  overflow-wrap: anywhere;
}

.list {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.list-title {
  margin: 0;
  color: var(--color-neutral-400);
}

.rows {
  display: flex;
  flex-direction: column;
  gap: 4px;
  margin: 0;
  padding: 0;
  list-style: none;
}

.result-row {
  display: flex;
  align-items: center;
  gap: 8px;
  min-height: 32px;
  padding: 8px;
  border-radius: var(--radius-md);
  background: var(--color-bg);
  font-size: 14px;
}

.mobile .result-row {
  min-height: 44px;
}

.result-row.ring {
  box-shadow: inset 0 0 0 1px var(--color-accent-700);
}

.row-icon {
  flex: none;
}

.name {
  flex: 1;
  min-width: 0;
  overflow-wrap: anywhere;
}

.row-tag {
  flex: none;
  padding: 4px 8px;
}

.total {
  flex: none;
  font-size: 12px;
  color: var(--color-neutral-500);
}

.qty {
  flex: none;
  font-variant-numeric: tabular-nums;
}

.tone-gain {
  color: var(--color-con-light-green);
}

.tone-used {
  color: var(--color-neutral-400);
}

.empty {
  padding: 8px;
  border-radius: var(--radius-md);
  background: var(--color-bg);
  font-size: 12px;
  color: var(--color-neutral-400);
}

.buttons {
  display: flex;
  align-items: center;
  gap: 8px;
}

.spacer {
  flex: 1;
}

.card-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 4px;
  font-size: 14px;
  font-weight: 500;
}

.done {
  color: var(--color-neutral-300);
}

.mobile .card-btn {
  min-height: 44px;
}

.card-btn.full {
  flex: 1;
}

.card-btn[aria-disabled='true'] {
  opacity: 0.45;
  cursor: default;
}

.footer {
  text-align: center;
  font-size: 12px;
  color: var(--color-neutral-500);
}
</style>
