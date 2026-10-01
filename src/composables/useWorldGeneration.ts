import { computed, type Ref } from 'vue';
import { LLM_INPUT_LOCKING_WORLD_GEN_STEPS } from '../../spacetimedb/src/data/llm_indicator_lines';

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
  // The current player's input-locking generation state. The step list comes from server data
  // (LLM_INPUT_LOCKING_WORLD_GEN_STEPS: PENDING and GENERATING). FILLING and FILL_ERROR are not
  // in it on purpose: the player can play in the stage-1 region while the rest fills in, and
  // after a failed fill.
  const activeGeneration = computed(() => {
    const identity = window.__my_identity;
    if (!identity) return null;
    const hex = identity.toHexString();
    return worldGenStates.value.find(
      (s: any) =>
        s.playerId?.toHexString?.() === hex &&
        LLM_INPUT_LOCKING_WORLD_GEN_STEPS.includes(s.step)
    ) ?? null;
  });

  const isWorldGenProcessing = computed(() => activeGeneration.value !== null);

  return {
    isWorldGenProcessing,
    activeGeneration,
  };
};
