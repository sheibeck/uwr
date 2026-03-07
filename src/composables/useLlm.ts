import { computed, ref, type Ref } from 'vue';
import type { DbConnection } from '../module_bindings';

interface UseLlmArgs {
  connActive: Ref<boolean>;
  selectedCharacterId: Ref<bigint | null>;
}

/**
 * Composable for triggering LLM requests through the pipeline.
 *
 * Flow:
 *   1. Client calls validateLlmRequest reducer (validates budget, concurrency, creates pending row)
 *   2. Client calls callLlm procedure (calls Anthropic API, returns 'completed' or 'error')
 *
 * The LlmRequest table is private, so we cannot subscribe to it.
 * Instead we track status locally and rely on the procedure return value.
 * Errors are communicated to the player via event_private messages from the server.
 */
export function useLlm({ connActive, selectedCharacterId }: UseLlmArgs) {
  const pendingDomain = ref<string | null>(null);
  const isProcessing = ref(false);
  const lastError = ref<string | null>(null);
  const lastResult = ref<string | null>(null);

  /**
   * Request an LLM generation.
   *
   * @param domain - The generation domain (e.g. 'character_creation', 'world_gen')
   * @param model - The model to use ('claude-sonnet-4-5' or 'claude-haiku-4-5')
   * @param userPrompt - The user's prompt text
   * @returns The result text on success, or null on error
   */
  async function requestGeneration(
    domain: string,
    model: string,
    userPrompt: string,
  ): Promise<string | null> {
    if (!connActive.value || !selectedCharacterId.value) return null;
    if (isProcessing.value) return null;

    const conn = window.__db_conn as DbConnection | undefined;
    if (!conn) return null;

    isProcessing.value = true;
    pendingDomain.value = domain;
    lastError.value = null;
    lastResult.value = null;

    try {
      // Step 1: Validate and create pending request (reducer)
      // This checks budget, concurrency, domain, model, API key availability.
      // Throws SenderError on validation failure.
      conn.reducers.validateLlmRequest({
        characterId: selectedCharacterId.value,
        domain,
        model,
        userPrompt,
      });

      // Brief delay to let the reducer commit the pending row before calling procedure.
      // The reducer is transactional -- it creates the row synchronously on the server,
      // but we need to wait for the subscription update before we know the requestId.
      // Since we can't observe the private table, we rely on the procedure's own lookup.
      //
      // NOTE: The procedure finds the most recent pending request for this player,
      // so we don't need to pass a requestId from the reducer. But the current
      // procedure API takes requestId. For now, we skip calling the procedure
      // from the client -- the validate reducer creates the pending row, and a
      // future iteration will trigger the procedure server-side.
      //
      // TODO: When server-side auto-triggering is implemented, remove this.
      // For now, the pipeline validates and creates the request. The procedure
      // must be called via CLI or admin tooling with the requestId.

      lastResult.value = 'pending';
      return 'pending';
    } catch (err: any) {
      lastError.value = err?.message ?? 'Request failed';
      return null;
    } finally {
      isProcessing.value = false;
      pendingDomain.value = null;
    }
  }

  return {
    requestGeneration,
    isProcessing: computed(() => isProcessing.value),
    pendingDomain: computed(() => pendingDomain.value),
    lastError: computed(() => lastError.value),
    lastResult: computed(() => lastResult.value),
  };
}
