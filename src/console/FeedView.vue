<script setup lang="ts">
import { computed, inject, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { PhArrowDown } from '@phosphor-icons/vue';
import { LLM_PROGRESS_ROTATE_MS } from '@game-data/llm_indicator_lines';
import { CONSOLE_KEY, GAME_KEY, createInertConsole, createInertGame } from '../game/context';
import { visibleNodes } from '../rails/nearby';
import FeedLine from './FeedLine.vue';
import KeeperProgress from './KeeperProgress.vue';
import { selectLlmIndicator } from './indicator';
import { buildVocabulary } from './keywords';
import type { KeywordEntry } from './keywords';
import { buildFeedLines } from './lines';
import { isPinned, prefersReducedMotion } from './pinning';

// The scrolling story log (47-UI-SPEC "Feed Contract"). Lines come from the injected feed store,
// keywords from the names the client already holds, the progress line from my_llm_jobs. All text
// reaches the DOM through FeedLine and KeeperProgress text interpolation.
const props = defineProps<{ compact?: boolean }>();

const game = inject(GAME_KEY, null) ?? createInertGame();
const consoleApi = inject(CONSOLE_KEY, null) ?? createInertConsole();

const vocabulary = computed(() => {
  const here = game.character.value;
  const placeNames = new Map(game.locations.value.map((location) => [location.id, location.name]));
  const places: { id: bigint; name: string }[] = [];
  for (const connection of game.connections.value) {
    const name = placeNames.get(connection.toLocationId);
    if (name !== undefined) places.push({ id: connection.toLocationId, name });
  }
  return buildVocabulary({
    npcs: game.npcsHere.value,
    places,
    nodes: visibleNodes(game.nodesHere.value, game.characterId.value),
    players: game.playersHere.value,
    selfName: here ? here.name : null,
  });
});

const partyNames = computed(() => {
  const names = game.knownCharacters.value.map((character) => character.name);
  const self = game.character.value;
  if (self) names.push(self.name);
  return names;
});

const lines = computed(() =>
  buildFeedLines(game.feed.entries.value, {
    vocabulary: vocabulary.value,
    partyNames: partyNames.value,
    npcsHere: game.npcsHere.value,
  }),
);

const lastKey = computed<string | undefined>(() => {
  const all = lines.value;
  return all.length === 0 ? undefined : all[all.length - 1].key;
});

const disabled = computed(() => !game.connected.value);

function onKeyword(entry: KeywordEntry): void {
  consoleApi.actOnKeyword(entry);
}

// Progress line: the route's indicator line, rotating through its pool while a job is active.
// One interval, only while active, cleared when inactive and on unmount (T-47-14).
const rotation = ref(0);
const indicator = computed(() => selectLlmIndicator(game.llmJobs.value, 'game', rotation.value));
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

// The progress line growing the content keeps a pinned feed at the bottom (no pill for it).
watch(
  () => indicator.value.indicatorLine !== null,
  () => {
    if (pinned.value) scrollToBottom(false);
  },
  { flush: 'post' },
);

watch(
  () => consoleApi.sendTick.value,
  () => {
    pinned.value = true;
    showPill.value = false;
    void nextTick(() => scrollToBottom(false));
  },
  { flush: 'post' },
);

onMounted(() => {
  scrollToBottom(false);
});

onBeforeUnmount(stopRotation);
</script>

<template>
  <div class="feed-region">
    <div ref="scroller" class="feed-scroll" :class="{ compact: props.compact }" @scroll="onScroll">
      <div class="feed-lines" role="log" aria-label="Story" aria-live="polite" aria-relevant="additions">
        <p v-if="lines.length === 0" class="empty">Your story will appear here.</p>
        <FeedLine
          v-for="line in lines"
          :key="line.key"
          :line="line"
          :disabled="disabled"
          @keyword="onKeyword"
        />
      </div>
      <div v-if="indicator.indicatorLine !== null" class="feed-tail">
        <KeeperProgress :text="indicator.indicatorLine" />
      </div>
    </div>
    <button v-if="showPill && lines.length > 0" type="button" class="btn btn-secondary new-lines" aria-label="New lines, jump to latest" @click="jumpToLatest">
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

/* margin-top: auto on the lines bottom-anchors a short feed while the top of a long feed stays
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
  max-width: 760px;
  margin-top: auto;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.feed-tail {
  width: 100%;
  max-width: 760px;
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
