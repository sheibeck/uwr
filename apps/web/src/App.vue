<template>
  <div class="container">
    <h1>Unwritten Realms</h1>
    <div class="login">
      <label>Provider</label>
      <select v-model="provider">
        <option value="SUPABASE">Supabase</option>
        <option value="AUTH0">Auth0</option>
      </select>

      <label>Provider User ID</label>
      <input v-model="providerUserId" placeholder="external provider user id" />

      <label>Display Name</label>
      <input v-model="displayName" placeholder="Your display name" />

      <button @click="sync">Sign In</button>

      <pre v-if="result">{{ result }}</pre>
    </div>
  </div>
</template>

<script lang="ts">
import { ref } from 'vue';

export default {
  setup() {
    const provider = ref('SUPABASE');
    const providerUserId = ref('user-123');
    const displayName = ref('PlayerOne');
    const result = ref(null as any);

    async function sync() {
      const res = await fetch('/api/sessionSync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ provider: provider.value, providerUserId: providerUserId.value, displayName: displayName.value })
      });
      result.value = await res.json();
    }

    return { provider, providerUserId, displayName, sync, result };
  }
};
</script>

<style>
.container { padding: 2rem; font-family: system-ui; }
.login { display: grid; gap: 0.5rem; max-width: 420px; }
input, select { padding: 0.5rem; }
button { margin-top: 1rem; padding: 0.6rem 1rem; }
</style>
