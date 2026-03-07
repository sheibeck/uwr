import { ref, computed } from 'vue';
import type { DbConnection } from '../module_bindings';

/**
 * Manages NPC conversation state and actions.
 * Conversation flow: player types "talk to [NPC]" -> intent service shows greeting ->
 * player sends messages via sendMessage() -> talk_to_npc reducer creates LlmTask ->
 * useLlmProxy picks up task and calls proxy -> submit_llm_result processes response.
 */
export function useNpcConversation() {
  const activeNpcId = ref<bigint | null>(null);
  const isConversing = ref(false);
  const isWaitingForResponse = ref(false);

  /**
   * Start a conversation with an NPC (called when player clicks NPC or uses talk command).
   */
  function startConversation(npcId: bigint) {
    activeNpcId.value = npcId;
    isConversing.value = true;
  }

  /**
   * Send a message to the active NPC via the talk_to_npc reducer.
   * The reducer creates an LlmTask which the client proxy picks up automatically.
   */
  function sendMessage(characterId: bigint, message: string) {
    const conn = window.__db_conn as DbConnection | undefined;
    if (!conn || !activeNpcId.value) return;
    isWaitingForResponse.value = true;
    conn.reducers.talkToNpc({
      characterId,
      npcId: activeNpcId.value,
      message,
    });
  }

  /**
   * End the current conversation.
   */
  function endConversation() {
    activeNpcId.value = null;
    isConversing.value = false;
    isWaitingForResponse.value = false;
  }

  /**
   * Turn in a completed quest for rewards.
   */
  function turnInQuest(characterId: bigint, questInstanceId: bigint) {
    const conn = window.__db_conn as DbConnection | undefined;
    if (!conn) return;
    conn.reducers.turnInQuest({ characterId, questInstanceId });
  }

  /**
   * Abandon a quest (frees quest slot, costs affinity).
   */
  function abandonQuest(characterId: bigint, questInstanceId: bigint) {
    const conn = window.__db_conn as DbConnection | undefined;
    if (!conn) return;
    conn.reducers.abandonQuest({ characterId, questInstanceId });
  }

  return {
    activeNpcId: computed(() => activeNpcId.value),
    isConversing: computed(() => isConversing.value),
    isWaitingForResponse: computed(() => isWaitingForResponse.value),
    startConversation,
    sendMessage,
    endConversation,
    turnInQuest,
    abandonQuest,
  };
}
