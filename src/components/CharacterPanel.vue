<template>
  <div>
    <div :style="styles.panelSectionTitle">Create Character</div>
    <form @submit.prevent="$emit('create')" :style="styles.panelForm">
      <input
        type="text"
        placeholder="Name"
        :value="newCharacter.name"
        :disabled="!connActive"
        :style="styles.input"
        @input="onNameInput"
      />
      <input
        type="text"
        placeholder="Race"
        :value="newCharacter.race"
        :disabled="!connActive"
        :style="styles.input"
        @input="onRaceInput"
      />
      <input
        type="text"
        placeholder="Class"
        :value="newCharacter.className"
        :disabled="!connActive"
        :style="styles.input"
        @input="onClassInput"
      />
      <button
        type="submit"
        :disabled="!connActive || !isCharacterFormValid"
        :style="styles.primaryButton"
      >
        Create
      </button>
    </form>

    <div :style="styles.panelSectionTitle">Characters</div>
    <div v-if="myCharacters.length === 0" :style="styles.subtle">No characters yet.</div>
    <ul v-else :style="styles.list">
      <li v-for="character in myCharacters" :key="character.id.toString()">
        <label :style="styles.radioRow">
          <input
            type="radio"
            name="character"
            :value="character.id.toString()"
            :checked="selectedCharacterId === character.id.toString()"
            @change="$emit('select', character.id.toString())"
          />
          <span>
            {{ character.name }} (Lv {{ character.level }}) -
            {{ character.race }} {{ character.className }}
          </span>
        </label>
      </li>
    </ul>
  </div>
</template>

<script setup lang="ts">
import type { CharacterRow } from '../module_bindings';

const props = defineProps<{
  styles: Record<string, Record<string, string | number>>;
  connActive: boolean;
  newCharacter: { name: string; race: string; className: string };
  isCharacterFormValid: boolean;
  myCharacters: CharacterRow[];
  selectedCharacterId: string;
}>();

const emit = defineEmits<{
  (e: 'update:newCharacter', value: { name: string; race: string; className: string }): void;
  (e: 'create'): void;
  (e: 'select', value: string): void;
}>();

const onNameInput = (event: Event) => {
  const value = (event.target as HTMLInputElement).value;
  emit('update:newCharacter', { ...props.newCharacter, name: value });
};

const onRaceInput = (event: Event) => {
  const value = (event.target as HTMLInputElement).value;
  emit('update:newCharacter', { ...props.newCharacter, race: value });
};

const onClassInput = (event: Event) => {
  const value = (event.target as HTMLInputElement).value;
  emit('update:newCharacter', { ...props.newCharacter, className: value });
};
</script>
