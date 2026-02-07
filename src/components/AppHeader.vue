<template>
  <header :style="styles.header">
    <div>
      <div :style="styles.title">Unwritten Realms</div>
      <div :style="styles.subtle">
        Status:
        <span :style="connActive ? styles.statusOnline : styles.statusOffline">
          {{ connActive ? 'Connected' : 'Disconnected' }}
        </span>
      </div>
    </div>
    <div :style="styles.headerRight">
      <div v-if="selectedCharacter" :style="styles.subtle">
        {{ selectedCharacter.name }} - Lv {{ selectedCharacter.level }} -
        {{ selectedCharacter.race }} {{ selectedCharacter.className }}
      </div>
      <div v-else :style="styles.subtle">No character selected</div>
      <div v-if="currentLocation" :style="styles.subtle">
        Location: {{ currentLocation.name }}
      </div>
    </div>
  </header>
</template>

<script setup lang="ts">
import type { CharacterRow, LocationRow } from '../module_bindings';

defineProps<{
  styles: Record<string, Record<string, string | number>>;
  connActive: boolean;
  selectedCharacter: CharacterRow | null;
  currentLocation: LocationRow | null;
}>();
</script>
