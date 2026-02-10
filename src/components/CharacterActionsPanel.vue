<template>
  <div>
    <div :style="styles.panelSectionTitle">Actions</div>
    <div v-if="!target" :style="styles.subtle">Select a character.</div>
    <div v-else>
      <div :style="styles.subtle">{{ target.name }} (Lv {{ target.level }})</div>
      <div :style="styles.buttonWrap">
        <button :style="styles.primaryButton" @click="$emit('invite', target.name)">
          Invite to Group
        </button>
        <button
          v-if="!isFriend"
          :style="styles.ghostButton"
          @click="$emit('friend', target.name)"
        >
          Friend Request
        </button>
        <button :style="styles.ghostButton" @click="$emit('trade', target.name)">
          Trade
        </button>
        <button :style="styles.ghostButton" @click="$emit('message', target.name)">
          Send a Message
        </button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import type { CharacterRow } from '../module_bindings';

defineProps<{
  styles: Record<string, Record<string, string | number>>;
  target: CharacterRow | null;
  isFriend: boolean;
}>();

defineEmits<{
  (e: 'invite', targetName: string): void;
  (e: 'friend', targetName: string): void;
  (e: 'trade', targetName: string): void;
  (e: 'message', targetName: string): void;
}>();
</script>
