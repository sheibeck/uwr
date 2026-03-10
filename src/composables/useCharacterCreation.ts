import { computed, ref, watch, type Ref } from 'vue';
import type { DbConnection } from '../module_bindings';
import type { Character } from '../module_bindings/types';

type UseCharacterCreationArgs = {
  connActive: Ref<boolean>;
  selectedCharacter: Ref<Character | null>;
  selectedCharacterId: Ref<string>;
  userId: Ref<bigint | null>;
  characters: Ref<Character[]>;
  characterCreationStates: Ref<any[]>;
  creationEvents: Ref<any[]>;
};

export const useCharacterCreation = ({
  connActive,
  selectedCharacter,
  selectedCharacterId,
  userId,
  characters,
  characterCreationStates,
  creationEvents,
}: UseCharacterCreationArgs) => {
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
  // Also re-triggers if creation state exists but no events arrived (race condition:
  // event subscription wasn't ready when the initial creation event was emitted)
  function autoStartCreation() {
    if (!connActive.value) return;
    if (selectedCharacter.value) return; // Already has character
    if (characters.value.length > 0) return;

    const conn = window.__db_conn as DbConnection | undefined;
    if (!conn) return;

    if (myCreationState.value && myCreationEvents.value.length > 0) return; // Already running with events

    if (creationStarted.value && !myCreationState.value) return; // Already called, waiting for state

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
    isInCreation,
    myCreationState,
    currentStep,
    creationCombinedEvents,
    isCreationLlmProcessing: computed(() => isCreationLlmProcessing.value),
    submitCreationInput,
    autoStartCreation,
  };
};
