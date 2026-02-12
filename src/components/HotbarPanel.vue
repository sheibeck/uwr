<template>
  <div :style="styles.panelBody">
    <div v-if="!selectedCharacter" :style="styles.subtle">
      Select a character to manage hotbar.
    </div>
    <div v-else>
      <div :style="styles.subtleSmall">
        Assign abilities to slots 1-10 for quick combat access.
      </div>
      <div v-if="combatLocked" :style="styles.subtle">
        Hotbar changes are disabled during combat.
      </div>
      <div v-if="hotbar.length === 0" :style="styles.subtle">
        No hotbar slots available.
      </div>
      <div v-else :style="{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }">
        <div
          v-for="slot in hotbar"
          :key="slot.slot"
          :style="{
            display: 'flex',
            alignItems: 'center',
            gap: '0.5rem',
            padding: '0.35rem 0.5rem',
            background: 'rgba(255,255,255,0.03)',
            borderRadius: '8px',
            border: '1px solid rgba(255,255,255,0.06)'
          }"
        >
          <span :style="{
            fontWeight: 600,
            fontSize: '0.75rem',
            color: 'rgba(230,232,239,0.5)',
            minWidth: '1.5rem',
            textAlign: 'center'
          }">
            {{ slot.slot }}
          </span>
          <select
            :style="{ ...styles.input, flex: 1 }"
            :value="slot.abilityKey"
            :disabled="combatLocked"
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
  combatLocked: boolean;
}>();

const emit = defineEmits<{
  (e: 'set-hotbar', slot: number, abilityKey: string): void;
}>();

const onHotbarChange = (slot: number, event: Event) => {
  if (props.combatLocked) return;
  const value = (event.target as HTMLSelectElement).value;
  emit('set-hotbar', slot, value);
};
</script>
