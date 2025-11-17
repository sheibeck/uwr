<template>
  <div class="container">
    <h1>Unwritten Realms</h1>
    <div class="login">
      <SignInCard v-if="!isAuthenticated" @sign="onSign" />

      <SignedInCard v-if="isAuthenticated && result?.ok && result.result?.account"
        :account="result.result.account"
        :session="result.result.session"
        :isNew="result.result.isNewAccount"
        @logout="logout"
      />
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue';
import SignInCard from './components/SignInCard.vue';
import SignedInCard from './components/SignedInCard.vue';

const provider = ref('SUPABASE');
const providerUserId = ref('user-123');
const displayName = ref('PlayerOne');
const result = ref(null as any);
const sessionToken = ref<string | null>(localStorage.getItem('sessionToken'));
const isAuthenticated = ref(!!sessionToken.value);

async function sync(payload: { provider: string; displayName: string }) {
  console.debug('App: sync called with', payload);
  const res = await fetch('/api/sessionSync', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });
  const data = await res.json();
  console.debug('App: /api/sessionSync response', data);
  result.value = data;
  if (data?.ok && data.result?.session) {
    // session token might be named `sessionToken` or `id` depending on backend shape
    const token = (data.result.session.sessionToken ?? data.result.session.id) as string | undefined;
    if (token) {
      sessionToken.value = token;
      localStorage.setItem('sessionToken', token);
      isAuthenticated.value = true;
    } else {
      // If no token field, still consider the user authenticated if account exists
      if (data.result.account) {
        isAuthenticated.value = true;
      }
    }
  }
}

function onSign(payload: { provider: string; displayName: string }) {
  console.debug('App: onSign got payload', payload);
  sync(payload).catch((err) => console.error('sync failed', err));
}

function logout() {
  sessionToken.value = null;
  localStorage.removeItem('sessionToken');
  isAuthenticated.value = false;
  result.value = null;
}
</script>

<style>
.container { padding: 2rem; font-family: system-ui; }
.login { display: grid; gap: 0.5rem; max-width: 420px; }
input, select { padding: 0.5rem; }
button { margin-top: 1rem; padding: 0.6rem 1rem; }
</style>
