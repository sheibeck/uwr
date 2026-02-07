<template>
  <div>
    <div :style="styles.panelSectionTitle">Travel</div>
    <div v-if="!selectedCharacter" :style="styles.subtle">
      Select a character to travel.
    </div>
    <div v-else :style="styles.buttonWrap">
      <button
        v-for="location in locations"
        :key="location.id.toString()"
        @click="$emit('move', location.id)"
        :disabled="!connActive || location.id === selectedCharacter.locationId"
        :style="styles.ghostButton"
      >
        {{ location.name }}
      </button>
    </div>
  </div>
</template>

<script setup lang="ts">
import type { CharacterRow, LocationRow } from '../module_bindings';

defineProps<{
  styles: Record<string, Record<string, string | number>>;
  connActive: boolean;
  selectedCharacter: CharacterRow | null;
  locations: LocationRow[];
}>();

defineEmits<{
  (e: 'move', locationId: bigint): void;
}>();
</script>
