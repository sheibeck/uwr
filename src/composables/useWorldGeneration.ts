import { computed, type Ref } from 'vue';

type UseWorldGenerationArgs = {
  connActive: Ref<boolean>;
  worldGenStates: Ref<any[]>;
};

// World generation runs on the server-side executor: every trigger (finishing a character,
// travelling to an uncharted location, [explore]) starts it in its own transaction. The client
// only mirrors the world_gen_state rows; it never asks the server to prepare anything.
export const useWorldGeneration = ({
  connActive: _connActive,
  worldGenStates,
}: UseWorldGenerationArgs) => {
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

  return {
    isWorldGenProcessing,
    activeGeneration,
  };
};
