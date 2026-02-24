<template>
  <div :style="styles.panelBody">
    <div v-if="!target" :style="styles.subtle">Select a character.</div>
    <div v-else>
      <div :style="{ display: 'flex', flexDirection: 'column', gap: '0.45rem' }">
        <button :style="styles.ghostButton" @click="$emit('trade', target.name)">
          Trade
        </button>
        <button
          v-if="!isInGroup"
          :style="styles.ghostButton"
          @click="$emit('invite', target.name)"
        >
          Invite to Group
        </button>
        <button
          v-if="isLeader && isInGroup && !targetIsLeader"
          :style="styles.ghostButton"
          @click="$emit('promote', target.name)"
        >
          Promote to Leader
        </button>
        <button
          v-if="!isFriend"
          :style="styles.ghostButton"
          @click="$emit('friend', target.name)"
        >
          Friend Request
        </button>
        <button :style="styles.ghostButton" @click="$emit('message', target.name)">
          Send a Message
        </button>
        <button
          v-if="isLeader && isInGroup && !targetIsLeader"
          :style="styles.ghostButton"
          @click="$emit('kick', target.name)"
        >
          Kick
        </button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import type { CharacterRow } from '../stdb-types';

defineProps<{
  styles: Record<string, Record<string, string | number>>;
  target: CharacterRow | null;
  isFriend: boolean;
  isInGroup: boolean;
  isLeader: boolean;
  targetIsLeader: boolean;
}>();

defineEmits<{
  (e: 'invite', targetName: string): void;
  (e: 'kick', targetName: string): void;
  (e: 'friend', targetName: string): void;
  (e: 'trade', targetName: string): void;
  (e: 'message', targetName: string): void;
  (e: 'promote', targetName: string): void;
}>();
</script>
