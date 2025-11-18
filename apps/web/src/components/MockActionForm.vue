<template>
  <div class="card">
    <h3>Mock Action</h3>
  <!-- Action is inferred from narrativeGoal; UI no longer exposes explicit action selection -->
    <label>Narrative goal</label>
    <input v-model="narrativeGoal" />
    <button @click="send">Send</button>

      <div v-if="result">
      <h4>Prompt</h4>
      <pre>{{ result.prompt }}</pre>
      <h4>Response</h4>
      <pre>{{ result.response.narration }}</pre>
      <h5>Resolution</h5>
      <pre>{{ result.response.resolution }}</pre>
      <div v-if="result.validationErrors">
        <h5>Validation Errors</h5>
        <pre>{{ result.validationErrors }}</pre>
      </div>
    </div>

      <div v-if="suggestion" class="suggestion">
        <h4>Suggested Action</h4>
        <p>{{ suggestion.message }}</p>
        <button @click="acceptSuggestion">Accept</button>
        <button @click="declineSuggestion">Decline</button>
      </div>
  </div>
</template>

<script setup lang="ts">
import { ref, toRef, watch } from 'vue';

const props = defineProps<{ actorId?: string }>();

// If parent provides actorId, use it as initial value and keep input editable.
const actorId = ref(props.actorId ?? '11111111-1111-4111-8111-111111111111');
// Keep prop updates in sync if parent changes actorId later
watch(() => props.actorId, (v) => {
  if (v) actorId.value = v;
});

const action = ref('');
const narrativeGoal = ref('Inspect the clearing');
const result = ref<any | null>(null);
const sending = ref(false);
const suggestionAccepted = ref(false);
const suggestion = ref<any | null>(null);
let pendingPayload: any = null;

async function send() {
  if (sending.value) return;
  sending.value = true;
  suggestion.value = null;
  pendingPayload = null;
  try {
    const intentObj: any = { actorId: actorId.value, target: null, narrativeGoal: narrativeGoal.value, clientTs: Date.now() };
    if (action.value) intentObj.action = action.value;
    const payload = {
      intent: intentObj,
      // Use a UUID for region.id to satisfy schema validation
      context: { region: { id: '11111111-1111-4111-8111-111111111111', name: 'Ashen Vale', dangerLevel: 1, factionControl: null }, timeOfDay: 'DAY', weather: { condition: 'CLEAR', intensity: 0 }, activeEvents: [], playerStatuses: [] },
      nearbyNPCs: [],
      recentActions: [],
      loreShards: []
    };

    const doPost = async (body: any) => {
      const res = await fetch('/api/orchestrator/action', { method: 'POST', body: JSON.stringify(body), headers: { 'Content-Type': 'application/json' } });
      return await res.json();
    };

  const data = await doPost(payload);
  console.debug('MockActionForm: POST result', data);

    // Server may return suggestionNeeded with inference metadata
    if (data && data.suggestionNeeded) {
      const inf = data.inference || {};
      const inferred = data.inferredAction || inf.action;
      const confidence = typeof inf.confidence === 'number' ? inf.confidence : 0;

      // Auto-accept high-confidence suggestions
      if (inferred && confidence >= 0.8) {
        if (!suggestionAccepted.value) {
          suggestionAccepted.value = true;
          action.value = inferred;
          const retry = await doPost({ ...payload, intent: { ...payload.intent, action: inferred } });
          result.value = retry;
        } else {
          // already accepted once, avoid infinite loop
          result.value = data;
        }
      } else if (inferred) {
        // Store suggestion and show inline UI to accept/decline
  suggestion.value = { message: `Suggested action: ${inferred} (confidence ${(confidence * 100).toFixed(0)}%)`, action: inferred, confidence };
  console.debug('MockActionForm: received suggestion', suggestion.value, data);
        pendingPayload = payload;
        // Do not set result yet; wait for user response
      } else {
        // no inferred action - show suggestion narration
        result.value = data;
      }
    } else {
      result.value = data;
    }
  } catch (e: any) {
    result.value = { ok: false, error: e?.message ?? String(e) };
  } finally {
    sending.value = false;
  }
}

async function acceptSuggestion() {
  if (!suggestion.value || !pendingPayload) return;
  const inferred = suggestion.value.action;
  action.value = inferred;
  const body = { ...pendingPayload, intent: { ...pendingPayload.intent, action: inferred } };
  const res = await fetch('/api/orchestrator/action', { method: 'POST', body: JSON.stringify(body), headers: { 'Content-Type': 'application/json' } });
  result.value = await res.json();
  console.debug('MockActionForm: accepted suggestion and resent, response=', result.value);
  suggestion.value = null;
  pendingPayload = null;
}

function declineSuggestion() {
  // show a short message and clear suggestion
  result.value = { ok: false, error: 'Suggestion declined by user' };
  console.debug('MockActionForm: suggestion declined');
  suggestion.value = null;
  pendingPayload = null;
}
</script>

<style scoped>
.card { padding:1rem; border:1px solid #ddd; border-radius:6px }
label { display:block; margin-top:0.5rem }
input, select { width:100%; padding:0.4rem }
button { margin-top:0.6rem }
</style>
