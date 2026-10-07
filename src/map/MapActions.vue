<script setup lang="ts">
import { inject } from 'vue';
import { FRAME_KEY, createInertFrame } from '../game/context';
import TravelPill from './TravelPill.vue';

// The Map header actions (50-39 actions slot, after the spacer and before the close button; it
// serves the UI-SPEC's "end" slot): the Region travel pill on desktop. Mobile renders nothing,
// because the pill lives in the mobile region row (plan 51-11).
const frame = inject(FRAME_KEY, createInertFrame());
</script>

<template>
  <TravelPill v-if="frame.isDesktop.value" :compact="false" />
</template>
