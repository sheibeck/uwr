<template>
  <div>
    <div :style="styles.panelSectionTitle">Stats</div>
    <div v-if="!selectedCharacter" :style="styles.subtle">
      Select a character to view stats.
    </div>
    <div v-else :style="styles.statsGrid">
      <div>Level</div>
      <div>{{ selectedCharacter.level }}</div>
      <div>XP</div>
      <div>{{ selectedCharacter.xp }}</div>
      <div>HP</div>
      <div>{{ selectedCharacter.hp }} / {{ selectedCharacter.maxHp }}</div>
      <div>Mana</div>
      <div>{{ selectedCharacter.mana }} / {{ selectedCharacter.maxMana }}</div>
    </div>
  </div>
</template>

<script setup lang="ts">
import type { CharacterRow } from '../module_bindings';

defineProps<{
  styles: Record<string, Record<string, string | number>>;
  selectedCharacter: CharacterRow | null;
}>();
</script>
