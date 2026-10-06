<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { PhArrowDown, PhWarning } from '@phosphor-icons/vue';
import { LLM_PROGRESS_ROTATE_MS } from '@game-data/llm_indicator_lines';
import FeedLine from '../console/FeedLine.vue';
import KeeperProgress from '../console/KeeperProgress.vue';
import { selectLlmIndicator } from '../console/indicator';
import type { LlmJobRowLike } from '../console/indicator';
import { isPinned, prefersReducedMotion } from '../console/pinning';
import { creationLines } from './creationLines';
import type { CreationEntry } from './creationFeedStore';

// The interview story log (49-UI-SPEC "Feed Contract"). Lines come from the creation entries,
// classified by kind first; the progress line comes from the player's own jobs, scoped to the
// creation routes; the default slot hosts the choice block after the last line and the progress
// line. Every string reaches the DOM through FeedLine and KeeperProgress text interpolation.
const props = defineProps<{
  entries: readonly CreationEntry[];
  llmJobs: readonly LlmJobRowLike[];
  desktop: boolean;
}>();

const lines = computed(() => creationLines(props.entries));

const lastKey = computed<string | undefined>(() => {
  const all = lines.value;
  return all.length === 0 ? undefined : all[all.length - 1].key;
});

// Progress line: the route's indicator line, rotating through its pool while a job is active.
// One interval, only while active, cleared when inactive and on unmount (T-49-29).
const rotation = ref(0);
const indicator = computed(() => selectLlmIndicator(props.llmJobs, 'creation', rotation.value));
const indicatorActive = computed(() => indicator.value.active);

let rotationTimer: ReturnType<typeof setInterval> | null = null;

function stopRotation(): void {
  if (rotationTimer !== null) {
    clearInterval(rotationTimer);
    rotationTimer = null;
  }
}

watch(
  indicatorActive,
  (active) => {
    stopRotation();
    if (active) {
      rotationTimer = setInterval(() => {
        rotation.value += 1;
      }, LLM_PROGRESS_ROTATE_MS);
    } else {
      rotation.value = 0;
    }
  },
  { immediate: true },
);

// Scrolling: pinned within 48px of the bottom; a pill shows when lines arrive while scrolled up.
const scroller = ref<HTMLElement | null>(null);
const logEl = ref<HTMLElement | null>(null);
const pinned = ref(true);
const showPill = ref(false);
// A smooth scroll to the bottom fires scroll events on the way; they must not unpin.
let holdPinUntil = 0;

function scrollToBottom(smooth: boolean): void {
  const el = scroller.value;
  if (!el) return;
  const top = el.scrollHeight;
  const useSmooth = smooth && !prefersReducedMotion();
  if (useSmooth) holdPinUntil = Date.now() + 600;
  if (typeof el.scrollTo === 'function') {
    el.scrollTo({ top, behavior: useSmooth ? 'smooth' : 'auto' });
  } else {
    el.scrollTop = top;
  }
}

function onScroll(): void {
  const el = scroller.value;
  if (!el) return;
  const near = isPinned(el.scrollTop, el.scrollHeight, el.clientHeight);
  pinned.value = near || Date.now() < holdPinUntil;
  if (near) {
    holdPinUntil = 0;
    showPill.value = false;
  }
}

function jumpToLatest(): void {
  pinned.value = true;
  showPill.value = false;
  scrollToBottom(true);
}

watch(
  lastKey,
  (key) => {
    if (key === undefined) {
      pinned.value = true;
      showPill.value = false;
      return;
    }
    if (pinned.value) scrollToBottom(false);
    else showPill.value = true;
  },
  { flush: 'post' },
);

// The progress line (and the choice block that follows it) growing the content keeps a pinned
// feed at the bottom, with no pill.
watch(
  () => indicator.value.indicatorLine !== null,
  () => {
    if (pinned.value) scrollToBottom(false);
  },
  { flush: 'post' },
);

onMounted(() => {
  scrollToBottom(false);
});

// A focus target that is always present (the composer input is disabled while the Keeper works).
// The view moves focus here when it has nowhere better to put it (review IN-12).
function focusLog(): void {
  logEl.value?.focus({ preventScroll: true });
}

defineExpose({ focusLog });

onBeforeUnmount(stopRotation);
</script>

<template>
  <div class="feed-region">
    <div ref="scroller" class="feed-scroll" :class="{ compact: !props.desktop }" @scroll="onScroll">
      <div
        ref="logEl"
        class="feed-lines"
        role="log"
        tabindex="-1"
        aria-label="Story"
        aria-live="polite"
        aria-relevant="additions"
      >
        <p v-if="lines.length === 0" class="empty">Your story will appear here.</p>
        <template v-for="item in lines" :key="item.key">
          <div v-if="item.warning" class="warn-row">
            <PhWarning class="icon-warn" :size="14" aria-hidden="true" />
            <FeedLine :line="item.line" :disabled="false" />
          </div>
          <FeedLine v-else :line="item.line" :disabled="false" />
        </template>
        <div v-if="indicator.indicatorLine !== null" class="feed-tail">
          <KeeperProgress :text="indicator.indicatorLine" />
        </div>
      </div>
      <!-- Outside the polite live log: the cards are controls, not new log content to read out. -->
      <div v-if="$slots.default" class="feed-choice">
        <slot />
      </div>
    </div>
    <button
      v-if="showPill && lines.length > 0"
      type="button"
      class="btn btn-secondary new-lines"
      aria-label="New lines, jump to latest"
      @click="jumpToLatest"
    >
      <span>New lines</span>
      <PhArrowDown :size="14" aria-hidden="true" />
    </button>
  </div>
</template>

<style scoped>
.feed-region {
  position: relative;
  flex: 1;
  min-width: 0;
  min-height: 0;
  display: flex;
}

/* margin-top: auto on the log bottom-anchors a short feed while the top of a long feed stays
   reachable by scrolling (justify-content: flex-end would clip it). */
.feed-scroll {
  flex: 1;
  min-width: 0;
  min-height: 0;
  overflow-y: auto;
  overflow-anchor: auto;
  display: flex;
  flex-direction: column;
  padding: 16px 32px;
}

.feed-scroll.compact {
  padding: 4px 16px 8px;
}

.feed-lines {
  width: 100%;
  margin-top: auto;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

/* The server's blank lines and Race: / Class: summary lines keep their breaks. */
.feed-lines :deep(.line-keeper .body) {
  white-space: pre-line;
}

.warn-row {
  display: flex;
  align-items: flex-start;
  gap: 4px;
  min-width: 0;
}

.warn-row > :last-child {
  flex: 1;
  min-width: 0;
}

.icon-warn {
  flex: none;
  margin-top: 4px;
  color: var(--color-con-orange);
}

.feed-tail {
  width: 100%;
}

.feed-choice {
  width: 100%;
  min-width: 0;
  margin-top: 8px;
}

.empty {
  margin: 0;
  font-size: 12px;
  color: var(--color-neutral-500);
}

.new-lines {
  position: absolute;
  bottom: 8px;
  left: 50%;
  transform: translateX(-50%);
  height: 32px;
  display: inline-flex;
  align-items: center;
  gap: 4px;
  border-radius: var(--radius-lg);
  background: var(--color-surface);
  box-shadow: var(--shadow-md);
  font-size: 12px;
}
</style>
