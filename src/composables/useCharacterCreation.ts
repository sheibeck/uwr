import { computed, ref, watch, type Ref } from 'vue';
import { reducers, type DbConnection } from '../module_bindings';
import { useReducer } from 'spacetimedb/vue';
import type { Character, Race } from '../module_bindings/types';

type UseCharacterCreationArgs = {
  connActive: Ref<boolean>;
  selectedCharacter: Ref<Character | null>;
  selectedCharacterId: Ref<string>;
  userId: Ref<bigint | null>;
  characters: Ref<Character[]>;
  races: Ref<Race[]>;
  characterCreationStates: Ref<any[]>;
  creationEvents: Ref<any[]>;
};

export const useCharacterCreation = ({
  connActive,
  selectedCharacter,
  selectedCharacterId,
  userId,
  characters,
  races,
  characterCreationStates,
  creationEvents,
}: UseCharacterCreationArgs) => {
  // ── Old form-based creation (kept for CharacterPanel backward compat) ──
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

  const selectedRace = computed(() => {
    if (!newCharacter.value.raceId) return null;
    const id = BigInt(newCharacter.value.raceId);
    return races.value.find((r) => r.id === id) ?? null;
  });

  const filteredClassOptions = computed(() => {
    const race = selectedRace.value;
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

  // ── Narrative creation flow ──

  // Track whether we've already called startCreation to avoid double-firing
  const creationStarted = ref(false);
  // Track whether LLM procedure is currently being called
  const isCreationLlmProcessing = ref(false);

  // Get the current player's creation state
  const myCreationState = computed(() => {
    const identity = window.__my_identity;
    if (!identity) return null;
    const hex = identity.toHexString();
    return characterCreationStates.value.find(
      (s: any) => s.playerId?.toHexString?.() === hex
    ) ?? null;
  });

  // Whether the player is actively in narrative creation (has creation state, not complete)
  const isInCreation = computed(() => {
    const state = myCreationState.value;
    return state != null && state.step !== 'COMPLETE';
  });

  const currentStep = computed(() => myCreationState.value?.step ?? null);

  // Filter creation events for the current player
  const myCreationEvents = computed(() => {
    const identity = window.__my_identity;
    if (!identity) return [];
    const hex = identity.toHexString();
    return creationEvents.value
      .filter((e: any) => e.playerId?.toHexString?.() === hex)
      .sort((a: any, b: any) => {
        const aTime = a.createdAt?.microsSinceUnixEpoch ?? 0n;
        const bTime = b.createdAt?.microsSinceUnixEpoch ?? 0n;
        if (aTime < bTime) return -1;
        if (aTime > bTime) return 1;
        return 0;
      });
  });

  // Map creation events to the same shape as combined game events
  const creationCombinedEvents = computed(() => {
    return myCreationEvents.value.map((e: any) => ({
      id: e.id,
      createdAt: e.createdAt,
      kind: e.kind ?? 'narrative',
      message: e.message,
      scope: 'creation',
    }));
  });

  // Auto-trigger start_creation when player has no character and no creation state
  function autoStartCreation() {
    if (!connActive.value) return;
    if (creationStarted.value) return;
    if (myCreationState.value) return; // Already has creation state
    if (selectedCharacter.value) return; // Already has character
    // Check if player has any characters at all
    if (characters.value.length > 0) return;

    const conn = window.__db_conn as DbConnection | undefined;
    if (!conn) return;

    creationStarted.value = true;
    try {
      conn.reducers.startCreation({});
    } catch (err) {
      console.error('[Creation] Failed to start creation:', err);
      creationStarted.value = false;
    }
  }

  // Auto-trigger LLM task preparation when creation state step changes to GENERATING_*
  // Track which step we've already prepared to avoid double-fire
  const preparedForStep = ref<string | null>(null);

  watch(characterCreationStates, (states) => {
    const identity = window.__my_identity;
    if (!identity || !connActive.value) return;

    const hex = identity.toHexString();
    const myState = states.find((s: any) => s.playerId?.toHexString?.() === hex);
    if (!myState) return;

    const step = myState.step;

    // Set processing flag while in a GENERATING step
    if (step === 'GENERATING_RACE' || step === 'GENERATING_CLASS') {
      isCreationLlmProcessing.value = true;

      // Only fire the prepare reducer once per generating step
      if (preparedForStep.value === step) return;
      preparedForStep.value = step;

      const conn = window.__db_conn as DbConnection | undefined;
      if (!conn) return;

      const genType = step === 'GENERATING_RACE' ? 'race' : 'class';
      try {
        conn.reducers.prepareCreationLlm({ generationType: genType });
      } catch (err: any) {
        console.error(`[Creation] ${genType} prepare failed:`, err);
      }
    } else {
      // Step changed away from GENERATING — clear processing flag
      isCreationLlmProcessing.value = false;
      preparedForStep.value = null;
    }
  }, { deep: true });

  // Submit text input for creation
  function submitCreationInput(text: string) {
    if (!connActive.value) return;
    const conn = window.__db_conn as DbConnection | undefined;
    if (!conn) return;
    conn.reducers.submitCreationInput({ text });
  }

  // When creation completes (COMPLETE step + character appears), auto-select the new character
  watch(currentStep, (newStep) => {
    if (newStep === 'COMPLETE') {
      // Character should appear in the characters list soon via subscription
      // Watch for it and auto-select
      let unwatchFn: (() => void) | null = null;
      const trySelect = () => {
        const identity = window.__my_identity;
        if (!identity) return false;
        const myChars = characters.value.filter(
          (c: any) => c.ownerUserId === userId.value
        );
        if (myChars.length > 0) {
          const newest = myChars.reduce((a: any, b: any) =>
            (a.createdAt?.microsSinceUnixEpoch ?? 0n) > (b.createdAt?.microsSinceUnixEpoch ?? 0n) ? a : b
          );
          selectedCharacterId.value = newest.id.toString();
          return true;
        }
        return false;
      };
      // Try immediately, otherwise watch for character to appear
      if (!trySelect()) {
        unwatchFn = watch(
          () => characters.value.length,
          () => { if (trySelect() && unwatchFn) unwatchFn(); }
        );
        setTimeout(() => { if (unwatchFn) unwatchFn(); }, 10000);
      }
    }
  });

  return {
    // Old form-based creation
    newCharacter,
    isCharacterFormValid,
    createCharacter,
    hasCharacter: computed(() => Boolean(selectedCharacter.value)),
    createError,
    creationToken,
    selectedRace,
    filteredClassOptions,
    // Narrative creation flow
    isInCreation,
    myCreationState,
    currentStep,
    creationCombinedEvents,
    isCreationLlmProcessing: computed(() => isCreationLlmProcessing.value),
    submitCreationInput,
    autoStartCreation,
  };
};
