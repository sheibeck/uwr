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

        <!-- Success card -->
        <div v-if="result?.ok && result.result?.account" class="card">
          <div class="card-header">
            <h3>{{ result.result.account.displayName }}</h3>
            <span class="badge" v-if="result.result.isNewAccount">New</span>
            <span class="badge returning" v-else>Welcome back</span>
          </div>
          <div class="card-body">
            <div><strong>Provider:</strong> {{ result.result.account.provider }}</div>
            <div><strong>Provider User ID:</strong> {{ result.result.account.providerUserId }}</div>
            <div><strong>Session Expires:</strong> {{ result.result.session?.expiresAt ? new Date(result.result.session.expiresAt).toLocaleString() : '—' }}</div>
          </div>
          <div class="card-actions">
            <button @click="logout">Logout</button>
          </div>
        </div>
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
  const sessionToken = ref<string | null>(localStorage.getItem('sessionToken'));
  const isAuthenticated = ref(!!sessionToken.value);

    async function sync() {
      const res = await fetch('/api/sessionSync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ provider: provider.value, providerUserId: providerUserId.value, displayName: displayName.value })
      });
      const data = await res.json();
      result.value = data;
      if (data?.ok && data.result?.session?.sessionToken) {
        const token = data.result.session.sessionToken as string;
        sessionToken.value = token;
        localStorage.setItem('sessionToken', token);
        isAuthenticated.value = true;
      }
    }

    function logout() {
      sessionToken.value = null;
      localStorage.removeItem('sessionToken');
      isAuthenticated.value = false;
      result.value = null;
    }

    return { provider, providerUserId, displayName, sync, result, sessionToken, isAuthenticated, logout };
  }
};
</script>

<style>
.container { padding: 2rem; font-family: system-ui; }
.login { display: grid; gap: 0.5rem; max-width: 420px; }
input, select { padding: 0.5rem; }
button { margin-top: 1rem; padding: 0.6rem 1rem; }
</style>
