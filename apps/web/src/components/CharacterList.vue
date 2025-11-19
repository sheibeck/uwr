<template>
  <div class="card">
    <h3>Your Characters</h3>
    <div v-if="loading">Loading...</div>
    <SpacetimeSubscription :sql="`SELECT * FROM characters WHERE owner_id = '${ownerId ?? ''}'`">
      <template #default="{ rows, status }">
        <div v-if="status !== 'connected'">Connecting...</div>
        <ul v-else>
          <li v-for="c in rows" :key="c.id">
            <strong>{{ c.name }}</strong> <small>({{ c.race }} {{ c.archetype }})</small>
            <div class="row-actions">
              <button @click="activate(c.id)">Set Active</button>
              <button @click="remove(c.id)">Delete</button>
            </div>
          </li>
        </ul>
      </template>
    </SpacetimeSubscription>
    <CharacterForm :ownerId="ownerId ?? undefined" @created="refresh" />
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue';
import CharacterForm from './CharacterForm.vue';
import SpacetimeSubscription from './SpacetimeSubscription.vue';
const props = defineProps<{ ownerId?: string }>();
const loading = ref(false);

onMounted(() => { loading.value = false; });

function refresh() { /* no-op: subscription updates live */ }

async function activate(id: string) {
  try {
    await fetch(`/api/characters/${encodeURIComponent(id)}/activate`, { method: 'POST' });
    alert('Set active');
  } catch (e) { console.error(e); }
}

async function remove(id: string) {
  if (!confirm('Delete character?')) return;
  try {
    await fetch(`/api/characters/${encodeURIComponent(id)}`, { method: 'DELETE' });
  } catch (e) { console.error(e); }
}
</script>

<style scoped>
.card { padding: 0.75rem; border:1px solid #ddd; border-radius:6px; background:#fff }
li { margin-bottom:0.5rem }
.row-actions { display:inline-flex; gap:0.5rem; margin-left:0.75rem }
button { padding:0.3rem 0.6rem }
</style>
