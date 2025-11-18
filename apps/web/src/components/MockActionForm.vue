<template>
  <div class="card">
    <h3>Mock Action</h3>
    <label>Actor ID</label>
    <input v-model="actorId" />
    <label>Action</label>
    <select v-model="action">
      <option>LOOK</option>
      <option>TALK</option>
      <option>MOVE</option>
    </select>
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
  </div>
</template>

<script setup lang="ts">
import { ref, toRef, watch } from 'vue';
import { defineProps } from 'vue';

const props = defineProps<{ actorId?: string }>();

// If parent provides actorId, use it as initial value and keep input editable.
const actorId = ref(props.actorId ?? '11111111-1111-4111-8111-111111111111');
// Keep prop updates in sync if parent changes actorId later
watch(() => props.actorId, (v) => {
  if (v) actorId.value = v;
});

const action = ref('LOOK');
const narrativeGoal = ref('Inspect the clearing');
const result = ref<any | null>(null);

async function send() {
  const payload = {
    intent: { actorId: actorId.value, action: action.value, target: null, narrativeGoal: narrativeGoal.value, clientTs: Date.now() },
    context: { region: { id: 'r1', name: 'Ashen Vale', dangerLevel: 1, factionControl: null }, timeOfDay: 'DAY', weather: { condition: 'CLEAR', intensity: 0 }, activeEvents: [], playerStatuses: [] },
    nearbyNPCs: [],
    recentActions: [],
    loreShards: []
  };
  const res = await fetch('/api/orchestrator/action', { method: 'POST', body: JSON.stringify(payload), headers: { 'Content-Type': 'application/json' } });
  result.value = await res.json();
}
</script>

<style scoped>
.card { padding:1rem; border:1px solid #ddd; border-radius:6px }
label { display:block; margin-top:0.5rem }
input, select { width:100%; padding:0.4rem }
button { margin-top:0.6rem }
</style>
