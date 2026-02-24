import { computed, ref, watch, type Ref } from 'vue';
import { reducers } from '../module_bindings';
import { useReducer } from 'spacetimedb/vue';
import type { CharacterRow, RaceRow } from '../stdb-types';

type UseCharacterCreationArgs = {
  connActive: Ref<boolean>;
  selectedCharacter: Ref<CharacterRow | null>;
  selectedCharacterId: Ref<string>;
  userId: Ref<bigint | null>;
  characters: Ref<CharacterRow[]>;
  races: Ref<RaceRow[]>;
};

export const useCharacterCreation = ({
  connActive,
  selectedCharacter,
  selectedCharacterId,
  userId,
  characters,
  races,
}: UseCharacterCreationArgs) => {
  const createCharacterReducer = useReducer(reducers.createCharacter);
  const newCharacter = ref({ name: '', raceId: '', className: '' });
  const createError = ref('');
  const creationToken = ref(0);
  const pendingSelectName = ref('');

  const isCharacterFormValid = computed(() =>
    Boolean(
      newCharacter.value.name.trim().length >= 4 &&
        newCharacter.value.raceId &&
        newCharacter.value.className.trim()
    )
  );

  const selectedRaceRow = computed(() => {
    if (!newCharacter.value.raceId) return null;
    const id = BigInt(newCharacter.value.raceId);
    return races.value.find((r) => r.id === id) ?? null;
  });

  const filteredClassOptions = computed(() => {
    const race = selectedRaceRow.value;
    if (!race) return [];
    const allowed = race.availableClasses;
    if (!allowed || allowed.trim() === '') {
      return null; // null means all classes allowed (Human race uses empty string)
    }
    const list = allowed.split(',').map((c: string) => c.trim().toLowerCase()).filter(Boolean);
    return list;
  });

  const createCharacter = () => {
    if (!connActive.value || userId.value == null) return;
    const errors: string[] = [];
    if (newCharacter.value.name.trim().length < 4) errors.push('Character name must be at least 4 characters.');
    if (!newCharacter.value.raceId) errors.push('You must select a race.');
    if (!newCharacter.value.className.trim()) errors.push('You must select a class.');
    if (errors.length > 0) {
      createError.value = errors.join(' ');
      return;
    }
    createError.value = '';
    const desired = newCharacter.value.name.trim().toLowerCase();
    if (characters.value.some((row) => row.name.toLowerCase() === desired)) {
      createError.value = 'That name is already taken.';
      newCharacter.value = { ...newCharacter.value, name: '' };
      return;
    }
    try {
      pendingSelectName.value = newCharacter.value.name.trim();
      createCharacterReducer({
        name: newCharacter.value.name.trim(),
        raceId: BigInt(newCharacter.value.raceId),
        className: newCharacter.value.className.trim(),
      });
      newCharacter.value = { name: '', raceId: '', className: '' };
      creationToken.value = Date.now();
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unable to create character';
      createError.value = message;
      newCharacter.value = { ...newCharacter.value, name: '' };
    }
  };

  watch(
    () => characters.value.map((row) => row.name).join(','),
    () => {
      if (!pendingSelectName.value) return;
      const match = characters.value.find((row) => row.name === pendingSelectName.value);
      if (!match) return;
      selectedCharacterId.value = match.id.toString();
      pendingSelectName.value = '';
    }
  );

  return {
    newCharacter,
    isCharacterFormValid,
    createCharacter,
    hasCharacter: computed(() => Boolean(selectedCharacter.value)),
    createError,
    creationToken,
    selectedRaceRow,
    filteredClassOptions,
  };
};
