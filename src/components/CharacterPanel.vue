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
      <div v-if="createError" :style="styles.errorText">{{ createError }}</div>
      <input
        type="text"
        placeholder="Race"
        :value="newCharacter.race"
        :disabled="!connActive"
        :style="styles.input"
        @input="onRaceInput"
      />
      <select
        :value="newCharacter.className"
        :disabled="!connActive"
        :style="styles.input"
        @change="onClassChange"
      >
        <option value="">Select Class</option>
        <option v-for="option in CLASS_OPTIONS" :key="option.name" :value="option.name">
          {{ option.name }}
        </option>
      </select>
      <div v-if="selectedClass" :style="styles.roster">
        <div :style="styles.rosterTitle">{{ selectedClass.role }}</div>
        <div>{{ selectedClass.description }}</div>
        <div :style="styles.subtle">Primary stats: {{ selectedClass.stats }}</div>
        <div :style="styles.subtle">Abilities: {{ selectedClass.abilities }}</div>
      </div>
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
        <div :style="styles.listRow">
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
          <button
            type="button"
            :style="styles.dangerButton"
            @click="confirmDelete(character)"
          >
            Delete
          </button>
        </div>
      </li>
    </ul>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import type { CharacterRow } from '../module_bindings';

const props = defineProps<{
  styles: Record<string, Record<string, string | number>>;
  connActive: boolean;
  newCharacter: { name: string; race: string; className: string };
  isCharacterFormValid: boolean;
  createError: string;
  myCharacters: CharacterRow[];
  selectedCharacterId: string;
}>();

const emit = defineEmits<{
  (e: 'update:newCharacter', value: { name: string; race: string; className: string }): void;
  (e: 'create'): void;
  (e: 'select', value: string): void;
  (e: 'delete', value: string): void;
}>();

const onNameInput = (event: Event) => {
  const value = (event.target as HTMLInputElement).value;
  emit('update:newCharacter', { ...props.newCharacter, name: value });
};

const onRaceInput = (event: Event) => {
  const value = (event.target as HTMLInputElement).value;
  emit('update:newCharacter', { ...props.newCharacter, race: value });
};

const confirmDelete = (character: CharacterRow) => {
  const ok = window.confirm(`Delete ${character.name}? This cannot be undone.`);
  if (!ok) return;
  emit('delete', character.id.toString());
};

const CLASS_OPTIONS = [
  {
    name: 'Bard',
    role: 'Support • Control',
    stats: 'Charisma, Intelligence',
    abilities: 'Songs, charm, tempo-based buffs',
    description: 'Versatile performers who weave magic into melody.',
  },
  {
    name: 'Beastmaster',
    role: 'Hybrid • Melee',
    stats: 'Strength, Dexterity',
    abilities: 'Companions, coordinated strikes',
    description: 'Ferocious fighters bonded to loyal beasts.',
  },
  {
    name: 'Cleric',
    role: 'Healer • Support',
    stats: 'Wisdom',
    abilities: 'Healing, protection, divine strikes',
    description: 'Faithful guardians who heal and shield allies.',
  },
  {
    name: 'Druid',
    role: 'Caster • Support',
    stats: 'Wisdom',
    abilities: 'Nature magic, healing, shapeshift',
    description: 'Nature guardians who heal and unleash storms.',
  },
  {
    name: 'Enchanter',
    role: 'Control • Support',
    stats: 'Charisma',
    abilities: 'Charm, mesmerize, crowd control',
    description: 'Masters of influence who bend enemies to their will.',
  },
  {
    name: 'Monk',
    role: 'Brawler • Melee',
    stats: 'Dexterity, Strength',
    abilities: 'Stances, rapid strikes, self-healing',
    description: 'Disciplined martial artists with swift strikes.',
  },
  {
    name: 'Necromancer',
    role: 'Summoner • Caster',
    stats: 'Intelligence',
    abilities: 'Curses, undead minions, life drain',
    description: 'Dark casters who command the dead.',
  },
  {
    name: 'Paladin',
    role: 'Tank • Support',
    stats: 'Wisdom',
    abilities: 'Holy aura, healing, radiant smite',
    description: 'Holy champions who defend and heal.',
  },
  {
    name: 'Ranger',
    role: 'Ranged • Hybrid',
    stats: 'Dexterity, Wisdom',
    abilities: 'Precision shots, tracking, nature tricks',
    description: 'Hunters who combine agility and nature magic.',
  },
  {
    name: 'Reaver',
    role: 'Hybrid • Melee',
    stats: 'Strength, Intelligence',
    abilities: 'Dark melee magic, siphon, burst damage',
    description: 'Relentless hybrids who blend brutality and magic.',
  },
  {
    name: 'Rogue',
    role: 'Assassin • Melee',
    stats: 'Dexterity',
    abilities: 'Stealth, backstab, evasion',
    description: 'Agile killers who strike from the shadows.',
  },
  {
    name: 'Shaman',
    role: 'Support • Caster',
    stats: 'Wisdom',
    abilities: 'Totems, elemental healing, spirit wards',
    description: 'Spiritual guides who call on elemental forces.',
  },
  {
    name: 'Spellblade',
    role: 'Hybrid • Melee',
    stats: 'Intelligence, Strength',
    abilities: 'Arcane strikes, weapon enchantments',
    description: 'Warriors who channel arcane power through steel.',
  },
  {
    name: 'Summoner',
    role: 'Summoner • Caster',
    stats: 'Intelligence',
    abilities: 'Summon constructs, arcane support',
    description: 'Arcane commanders who fight through summoned allies.',
  },
  {
    name: 'Warrior',
    role: 'Tank • Melee',
    stats: 'Strength',
    abilities: 'Taunt, heavy strikes, durability',
    description: 'Frontline fighters built to absorb punishment.',
  },
];

const selectedClass = computed(() =>
  CLASS_OPTIONS.find((option) => option.name === props.newCharacter.className)
);

const onClassChange = (event: Event) => {
  const value = (event.target as HTMLSelectElement).value;
  emit('update:newCharacter', { ...props.newCharacter, className: value });
};
</script>
