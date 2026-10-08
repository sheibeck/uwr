<script setup lang="ts">
import { ref } from 'vue';
import ActionRow from '../action/ActionRow.vue';
import RoundRow from '../combat/RoundRow.vue';
import FeedView from '../console/FeedView.vue';
import HotbarRow from '../hotbar/HotbarRow.vue';
import Composer from '../input/Composer.vue';
import InviteCard from '../social/InviteCard.vue';

// safeBottom: in combat on mobile the tab bar that normally covers the bottom inset is hidden, so
// the composer keeps clear of it itself. ActionRow (gather and cast progress) never shows together
// with RoundRow: gathering and casting are out of combat and it hides while combat.active.
//
// On mobile (compact) a pending party invite sits at the top of the composer section, in and out of
// combat (51.1-UI-SPEC "Incoming Invite Card"). After the player answers there, focus goes to the
// composer input: the main mobile screen has no Party heading to land on.
const props = defineProps<{ compact?: boolean; safeBottom?: boolean }>();

const composerEl = ref<HTMLElement | null>(null);

function focusInput(): void {
  composerEl.value?.querySelector<HTMLInputElement>('input.composer-input')?.focus();
}
</script>

<template>
  <main class="feed" :class="{ compact: props.compact, 'safe-bottom': props.safeBottom }">
    <FeedView :compact="props.compact" />
    <section ref="composerEl" class="composer">
      <InviteCard v-if="props.compact" variant="mobile" @answered="focusInput" />
      <RoundRow />
      <ActionRow />
      <HotbarRow />
      <Composer />
    </section>
  </main>
</template>

<style scoped>
.feed {
  flex: 1;
  min-width: 0;
  min-height: 0;
  display: flex;
  flex-direction: column;
}

/* The composer fills the center column like the feed lines (owner try-out 2026-10-05, supersedes the
   760px measure), with the same 32px side padding. The hotbar row sits at the top of this section. */
.composer {
  flex: none;
  width: 100%;
  padding: 8px 32px 16px;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.compact .composer {
  padding: 8px 16px;
  background: color-mix(in srgb, var(--color-surface) 40%, transparent);
}

.compact.safe-bottom .composer {
  padding-bottom: calc(8px + env(safe-area-inset-bottom));
}
</style>
