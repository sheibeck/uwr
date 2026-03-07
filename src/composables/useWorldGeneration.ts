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
  // Track which genStateId we've already sent a prepare for (to avoid double-fire)
  const preparedGenStateId = ref<bigint | null>(null);

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

  const isWorldGenProcessing = computed(() => activeGeneration.value !== null);

  // Auto-trigger LLM task preparation when WorldGenState step is PENDING
  watch(worldGenStates, (states) => {
    const identity = window.__my_identity;
    if (!identity || !connActive.value) return;

    const hex = identity.toHexString();
    const myState = states.find(
      (s: any) => s.playerId?.toHexString?.() === hex && s.step === 'PENDING'
    );
    if (!myState) return;

    // Don't re-prepare the same genState
    if (preparedGenStateId.value === myState.id) return;
    preparedGenStateId.value = myState.id;

    const conn = window.__db_conn as DbConnection | undefined;
    if (!conn) return;

    try {
      conn.reducers.prepareWorldGenLlm({ genStateId: myState.id });
    } catch (err: any) {
      console.error('[WorldGen] Prepare LLM task failed:', err);
      preparedGenStateId.value = null; // Allow retry
    }
  }, { deep: true });

  // Reset prepared ID when generation completes or errors
  watch(activeGeneration, (gen) => {
    if (!gen) preparedGenStateId.value = null;
  });

  return {
    isWorldGenProcessing,
    activeGeneration,
  };
};
