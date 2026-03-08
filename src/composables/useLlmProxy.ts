import { ref, watch, computed, type Ref } from 'vue';
import type { DbConnection } from '../module_bindings';

const LLM_PROXY_URL = import.meta.env.VITE_LLM_PROXY_URL || 'http://localhost:8787';

export type LlmTask = {
  id: bigint;
  playerId: any;
  domain: string;
  model: string;
  systemPrompt: string;
  userPrompt: string;
  maxTokens: bigint;
  status: string;
  contextJson?: string;
  createdAt: any;
};

/**
 * Watches for pending LlmTask rows and automatically calls the proxy,
 * then submits results back to SpacetimeDB via the submit_llm_result reducer.
 */
export const useLlmProxy = ({
  connActive,
  llmTasks,
}: {
  connActive: Ref<boolean>;
  llmTasks: Ref<LlmTask[]>;
}) => {
  const isProcessing = ref(false);
  const processingTaskId = ref<bigint | null>(null);

  watch(llmTasks, async (tasks) => {
    if (isProcessing.value || !connActive.value) return;

    const identity = window.__my_identity;
    if (!identity) return;
    const hex = identity.toHexString();

    // Find pending task for this player
    const pendingTask = tasks.find(
      (t) => t.playerId?.toHexString?.() === hex && t.status === 'pending'
    );
    if (!pendingTask) return;

    const conn = window.__db_conn as DbConnection | undefined;
    if (!conn) return;

    // Read proxy secret from llm_config (stored via set_api_key reducer)
    const config = (conn as any).db?.llm_config?.id?.find?.(1n);
    // Config is private — we get the secret from the task's auth context
    // The proxy secret is stored in the browser and sent as bearer token
    const proxySecret = localStorage.getItem('llm_proxy_secret') || import.meta.env.VITE_LLM_PROXY_SECRET || '';

    isProcessing.value = true;
    processingTaskId.value = pendingTask.id;

    try {
      const response = await fetch(`${LLM_PROXY_URL}/api/llm`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${proxySecret}`,
        },
        body: JSON.stringify({
          model: pendingTask.model,
          systemPrompt: pendingTask.systemPrompt,
          userPrompt: pendingTask.userPrompt,
          maxTokens: Number(pendingTask.maxTokens),
        }),
      });

      const data = await response.json();

      if (data.ok) {
        conn.reducers.submitLlmResult({
          taskId: pendingTask.id,
          resultText: data.text,
          success: true,
          errorMessage: undefined,
        });
      } else {
        console.error('[LLM Proxy] Error:', data.error);
        conn.reducers.submitLlmResult({
          taskId: pendingTask.id,
          resultText: '',
          success: false,
          errorMessage: data.error || 'Proxy error',
        });
      }
    } catch (err: any) {
      console.error('[LLM Proxy] Fetch failed:', err);
      conn.reducers.submitLlmResult({
        taskId: pendingTask.id,
        resultText: '',
        success: false,
        errorMessage: err?.message || 'Network error calling LLM proxy',
      });
    } finally {
      isProcessing.value = false;
      processingTaskId.value = null;
    }
  }, { deep: true });

  return {
    isProcessing: computed(() => isProcessing.value),
    processingTaskId: computed(() => processingTaskId.value),
  };
};
