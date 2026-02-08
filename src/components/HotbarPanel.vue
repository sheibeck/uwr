<template>
  <div>
    <div :style="styles.panelSectionTitle">Hotbar</div>
    <div v-if="!selectedCharacter" :style="styles.subtle">
      Select a character to manage hotbar.
    </div>
    <div v-else>
      <div :style="styles.subtle">
        Assign abilities to slots 1–10 for quick combat access.
      </div>
      <div v-if="hotbar.length === 0" :style="styles.subtle">
        No hotbar slots available.
      </div>
      <div v-else :style="styles.list">
        <div v-for="slot in hotbar" :key="slot.slot" :style="styles.panelFormInline">
          <div :style="styles.subtle">#{{ slot.slot }}</div>
          <select
            :style="styles.input"
            :value="slot.abilityKey"
            @change="onHotbarChange(slot.slot, $event)"
          >
            <option value="">Empty</option>
            <option
              v-for="ability in availableAbilities"
              :key="ability.key"
              :value="ability.key"
            >
              {{ ability.name }}
            </option>
          </select>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import type { CharacterRow } from '../module_bindings';

const props = defineProps<{
  styles: Record<string, Record<string, string | number>>;
  selectedCharacter: CharacterRow | null;
  availableAbilities: { key: string; name: string }[];
  hotbar: { slot: number; abilityKey: string; name: string }[];
}>();

const emit = defineEmits<{
  (e: 'set-hotbar', slot: number, abilityKey: string): void;
}>();

const onHotbarChange = (slot: number, event: Event) => {
  const value = (event.target as HTMLSelectElement).value;
  emit('set-hotbar', slot, value);
};
</script>
