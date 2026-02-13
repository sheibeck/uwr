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

      <!-- Race tiles -->
      <div :style="styles.gridWrap">
        <div
          v-for="race in unlockedRaces"
          :key="race.id.toString()"
          :style="{
            ...styles.raceTile,
            ...(newCharacter.raceId === race.id.toString() ? styles.raceTileSelected : {})
          }"
          @click="onRaceTileClick(race.id.toString())"
        >
          {{ race.name }}
        </div>
      </div>

      <!-- Race info panel -->
      <div v-if="selectedRaceRow" :style="styles.roster">
        <div>{{ selectedRaceRow.description }}</div>
        <div :style="styles.subtle">
          <span v-if="selectedRaceRow.strBonus > 0n">STR +{{ selectedRaceRow.strBonus }} </span>
          <span v-if="selectedRaceRow.dexBonus > 0n">DEX +{{ selectedRaceRow.dexBonus }} </span>
          <span v-if="selectedRaceRow.chaBonus > 0n">CHA +{{ selectedRaceRow.chaBonus }} </span>
          <span v-if="selectedRaceRow.wisBonus > 0n">WIS +{{ selectedRaceRow.wisBonus }} </span>
          <span v-if="selectedRaceRow.intBonus > 0n">INT +{{ selectedRaceRow.intBonus }} </span>
        </div>
        <div v-if="selectedRaceRow.availableClasses && selectedRaceRow.availableClasses.trim() !== ''" :style="styles.subtle">
          Classes: {{ formatAvailableClasses(selectedRaceRow.availableClasses) }}
        </div>
      </div>

      <!-- Class tiles -->
      <div :style="styles.gridWrap">
        <div
          v-for="option in displayedClassOptions"
          :key="option.name"
          :style="{
            ...styles.classTile,
            ...(newCharacter.className === option.name ? styles.classTileSelected : {})
          }"
          @click="onClassTileClick(option.name)"
        >
          {{ option.name }}
        </div>
      </div>

      <!-- Class info panel -->
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
    <div v-else :style="styles.list">
      <div
        v-for="character in myCharacters"
        :key="character.id.toString()"
        :style="{
          ...styles.charCard,
          ...(selectedCharacterId === character.id.toString() ? styles.charCardSelected : {})
        }"
        @click="$emit('select', character.id.toString())"
      >
        <div :style="styles.charCardInfo">
          <div :style="styles.charCardName">{{ character.name }}</div>
          <div :style="styles.charCardMeta">
            <span :style="styles.charCardLevel">Lv {{ character.level }}</span>
            {{ character.race }} {{ character.className }}
          </div>
        </div>
        <button
          type="button"
          :style="styles.charCardDelete"
          @click.stop="confirmDelete(character)"
          @mouseenter="(e) => e.target.style.color = 'rgba(255,110,110,0.9)'"
          @mouseleave="(e) => e.target.style.color = 'rgba(255,110,110,0.5)'"
        >
          ✕
        </button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import type { CharacterRow } from '../module_bindings';

const props = defineProps<{
  styles: Record<string, Record<string, string | number>>;
  connActive: boolean;
  newCharacter: { name: string; raceId: string; className: string };
  isCharacterFormValid: boolean;
  createError: string;
  myCharacters: CharacterRow[];
  selectedCharacterId: string;
  races: any[];
  selectedRaceRow: any | null;
  filteredClassOptions: string[] | null;
}>();

const emit = defineEmits<{
  (e: 'update:newCharacter', value: { name: string; raceId: string; className: string }): void;
  (e: 'create'): void;
  (e: 'select', value: string): void;
  (e: 'delete', value: string): void;
}>();

const onNameInput = (event: Event) => {
  const value = (event.target as HTMLInputElement).value;
  emit('update:newCharacter', { ...props.newCharacter, name: value });
};

const onRaceTileClick = (raceId: string) => {
  const updated = { ...props.newCharacter, raceId };
  // If the currently selected class is no longer valid for the new race, clear it
  if (updated.className && props.filteredClassOptions) {
    const newRace = props.races.find((r: any) => r.id.toString() === raceId);
    if (newRace) {
      const allowed = newRace.availableClasses;
      if (allowed && allowed.trim() !== '') {
        const list = allowed.split(',').map((c: string) => c.trim().toLowerCase());
        if (!list.includes(updated.className.toLowerCase())) {
          updated.className = '';
        }
      }
    }
  }
  emit('update:newCharacter', updated);
};

const onClassTileClick = (className: string) => {
  emit('update:newCharacter', { ...props.newCharacter, className });
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
  {
    name: 'Wizard',
    role: 'Caster • Damage',
    stats: 'Intelligence',
    abilities: 'Arcane bolts, mana shields, lightning surges',
    description: 'Arcane scholars who unleash devastating spells.',
  },
];

const unlockedRaces = computed(() =>
  props.races.filter((r: any) => r.unlocked)
);

const displayedClassOptions = computed(() => {
  if (!props.filteredClassOptions) return CLASS_OPTIONS; // null = all allowed
  return CLASS_OPTIONS.filter((opt) =>
    props.filteredClassOptions!.includes(opt.name.toLowerCase())
  );
});

const selectedClass = computed(() =>
  CLASS_OPTIONS.find((option) => option.name === props.newCharacter.className)
);

const formatAvailableClasses = (classes: string) =>
  classes.split(',')
    .map((c) => c.trim())
    .filter(Boolean)
    .map((c) => c.charAt(0).toUpperCase() + c.slice(1))
    .join(', ');
</script>
