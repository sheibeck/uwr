<script setup lang="ts">
import { computed } from 'vue';
import { PhFlagBanner, PhFootprints, PhPersonSimple } from '@phosphor-icons/vue';
import { FOLLOW_TEXT } from './follow';
import type { FollowState } from './follow';

// The follow state of one party member (51.1-UI-SPEC "Travel with Leader", Follow states): four
// states, a 12px icon, the FOLLOW_TEXT title and an .sr-only twin. Inside a target button the
// icon is `decorative`: aria-hidden with no twin (the button's own accessible name carries the
// phrase), the title kept for hover.
const props = defineProps<{ state: FollowState; decorative?: boolean }>();

const icon = computed(() => {
  if (props.state === 'leader') return PhFlagBanner;
  if (props.state === 'not_following') return PhPersonSimple;
  return PhFootprints;
});

const tone = computed(() => {
  if (props.state === 'leader') return 'leader';
  if (props.state === 'comes_along') return 'comes';
  if (props.state === 'following_elsewhere') return 'elsewhere';
  return 'none';
});

const text = computed(() => FOLLOW_TEXT[props.state]);
</script>

<template>
  <span class="follow-icon" :class="tone" :title="text" :aria-hidden="decorative ? 'true' : undefined">
    <component :is="icon" :size="12" aria-hidden="true" />
    <span v-if="!decorative" class="sr-only">{{ text }}</span>
  </span>
</template>

<style scoped>
.follow-icon {
  display: inline-flex;
  flex: none;
  align-items: center;
}

.leader {
  color: var(--color-accent);
}

.comes {
  color: var(--color-accent-300);
}

.elsewhere {
  color: var(--color-neutral-500);
}

.none {
  color: var(--color-neutral-500);
}

.sr-only {
  position: absolute;
  width: 1px;
  height: 1px;
  overflow: hidden;
  clip-path: inset(50%);
  white-space: nowrap;
}
</style>
