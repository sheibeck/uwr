import { ref, watch, computed, type Ref } from 'vue';
import type { DbConnection } from '../module_bindings';

type UseWorldGenerationArgs = {
  connActive: Ref<boolean>;
  worldGenStates: Ref<any[]>;
};

export const useWorldGeneration = ({
  connActive,
  worldGenStates,
}: UseWorldGenerationArgs) => {
  // Track whether LLM procedure is currently being called
  const isWorldGenProcessing = ref(false);

  // Get the current player's active generation state (PENDING or GENERATING)
  const activeGeneration = computed(() => {
    const identity = window.__my_identity;
    if (!identity) return null;
    const hex = identity.toHexString();
    return worldGenStates.value.find(
      (s: any) =>
        s.playerId?.toHexString?.() === hex &&
        (s.step === 'PENDING' || s.step === 'GENERATING')
    ) ?? null;
  });

  // Auto-trigger LLM procedure when WorldGenState step is PENDING
  // Uses direct watch on raw worldGenStates (same pattern as useCharacterCreation)
  watch(worldGenStates, (states) => {
    if (isWorldGenProcessing.value) return; // Already processing, don't double-trigger

    const identity = window.__my_identity;
    if (!identity || !connActive.value) return;

    const hex = identity.toHexString();
    const myState = states.find(
      (s: any) => s.playerId?.toHexString?.() === hex
    );
    if (!myState) return;

    if (myState.step === 'PENDING') {
      isWorldGenProcessing.value = true;
      const conn = window.__db_conn as DbConnection | undefined;
      if (!conn) {
        isWorldGenProcessing.value = false;
        return;
      }

      // Safety timeout: if procedure hangs for >120s, reset so retry can fire
      const safetyTimer = setTimeout(() => { isWorldGenProcessing.value = false; }, 120_000);
      conn.procedures.generateWorldRegion({ genStateId: myState.id })
        .then(() => {
          clearTimeout(safetyTimer);
          isWorldGenProcessing.value = false;
        })
        .catch((err: any) => {
          clearTimeout(safetyTimer);
          console.error('[WorldGen] Generation procedure failed:', err);
          isWorldGenProcessing.value = false;
        });
    }
  }, { deep: true });

  return {
    isWorldGenProcessing: computed(() => isWorldGenProcessing.value),
    activeGeneration,
  };
};
