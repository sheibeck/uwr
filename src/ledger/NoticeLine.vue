<script lang="ts">
// The private feed kinds a ledger screen mirrors (RESEARCH Q8, pinned against the server's event
// kinds): results and refusals the server writes with system, reward or heal. Never chat,
// narration, combat, quest, faction or presence lines. This is the default set; a screen with
// other private lines of its own passes a `kinds` prop (the Party sheet passes system and group).
export const MIRRORED_KINDS: ReadonlySet<string> = new Set(['system', 'reward', 'heal']);
</script>

<script setup lang="ts">
import { inject, shallowRef, watch } from 'vue';
import { PhCheckCircle, PhInfo, PhWarningCircle } from '@phosphor-icons/vue';
import { cleanServerText } from '../console/cleanServerText';
import type { FeedEntry } from '../console/feedStore';
import { GAME_KEY, createInertGame } from '../game/context';
import { SEND_ERROR_TEXT } from './actionRunner';

// The notice line (50-UI-SPEC "Notice line"): an open drawer or sheet covers the feed, so each
// screen shows the newest private system, reward or heal line that arrived after it opened, plus
// the client-rejection line. Entries present at mount are never shown, nothing renders until a
// line arrives, and a remount starts empty. One line, as a text node, in a polite status region.
//
// The kinds prop (51.1 Plan 16, research Pitfall 4): the set of private line kinds this notice line
// mirrors. The default is MIRRORED_KINDS, so every existing screen is unchanged. The mobile Party sheet
// passes system and group, because failGroup writes party refusals as private kind 'group' and the
// sheet covers the feed; Phase 52.2 adds 'friend'.
//
// Icon deviation (RESEARCH Open Question 7, resolved): the warning icon marks only a client
// rejection, because the server writes refusals and info lines with the same kind, so a refusal
// cannot be told apart from information. Reward and heal lines use the check, system and group the info icon.
const props = withDefaults(defineProps<{ rejection?: number; kinds?: ReadonlySet<string> }>(), {
  rejection: 0,
  kinds: () => MIRRORED_KINDS,
});

const game = inject(GAME_KEY, createInertGame());

type Current = { kind: 'server'; entry: FeedEntry } | { kind: 'rejection' } | null;
const current = shallowRef<Current>(null);

const atOpen = new Set<string>();
for (const entry of game.feed.entries.value) atOpen.add(entry.key);
// The key of the last server line shown, so an older line is not shown again after a rejection.
let shownKey: string | null = null;

watch(
  () => game.feed.entries.value,
  (entries) => {
    for (let i = entries.length - 1; i >= 0; i -= 1) {
      const entry = entries[i];
      if (entry.source !== 'private' || !props.kinds.has(entry.kind) || atOpen.has(entry.key)) {
        continue;
      }
      if (entry.key === shownKey) return;
      shownKey = entry.key;
      current.value = { kind: 'server', entry };
      return;
    }
  },
);

watch(
  () => props.rejection,
  (next, previous) => {
    if (next > previous) current.value = { kind: 'rejection' };
  },
);
</script>

<template>
  <div v-if="current" class="notice-line" role="status" aria-live="polite">
    <PhWarningCircle
      v-if="current.kind === 'rejection'"
      class="notice-icon rejection"
      :size="14"
      aria-hidden="true"
    />
    <PhInfo
      v-else-if="current.entry.kind === 'system' || current.entry.kind === 'group'"
      class="notice-icon info"
      :size="14"
      aria-hidden="true"
    />
    <PhCheckCircle v-else class="notice-icon ok" :size="14" aria-hidden="true" />
    <span class="notice-text">{{
      current.kind === 'rejection' ? SEND_ERROR_TEXT : cleanServerText(current.entry.message)
    }}</span>
  </div>
</template>

<style scoped>
.notice-line {
  flex: none;
  display: flex;
  align-items: flex-start;
  gap: 4px;
  padding-top: 8px;
  font-size: 12px;
  line-height: 1.5;
  color: var(--color-neutral-200);
}

.notice-icon {
  flex: none;
  margin-top: 4px;
}

.notice-icon.ok {
  color: var(--color-con-light-green);
}

.notice-icon.info {
  color: var(--color-neutral-400);
}

.notice-icon.rejection {
  color: var(--color-health);
}

.notice-text {
  min-width: 0;
  overflow-wrap: anywhere;
}
</style>
