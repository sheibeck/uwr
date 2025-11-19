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

      <MockActionForm v-if="isAuthenticated" :actorId="(result?.result?.account?.id) ?? userAccount?.id" />
      <CharacterList v-if="isAuthenticated && ((result?.result?.account?.id) || userAccount?.id)" :ownerId="(result?.result?.account?.id) ?? userAccount?.id" />
      
      <!-- Debug panel for troubleshooting auth/session state -->
      <div class="debug" aria-hidden="false">
        <h3>Debug</h3>
        <div><strong>sessionToken:</strong> {{ sessionToken }}</div>
        <div><strong>userAccount:</strong> {{ userAccount }}</div>
        <div><strong>last result:</strong> <pre>{{ result }}</pre></div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue';
import SignInCard from './components/SignInCard.vue';
import SignedInCard from './components/SignedInCard.vue';
import MockActionForm from './components/MockActionForm.vue';
import CharacterList from './components/CharacterList.vue';

const provider = ref('SUPABASE');
const providerUserId = ref('user-123');
const displayName = ref('PlayerOne');
const result = ref(null as any);
const sessionToken = ref<string | null>(localStorage.getItem('sessionToken'));
const userAccount = ref<any | null>(null);
const isAuthenticated = computed(() => {
  return !!sessionToken.value || !!userAccount.value;
});

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
      } else {
        // If no token field, still consider the user authenticated if account exists
        if (data.result.account) {
          userAccount.value = data.result.account;
        }
    }
  }
}

function onSign(payload: { provider: string; displayName: string }) {
  console.debug('App: onSign got payload', payload);
  // ensure providerUserId/displayName are set if provided
  if (payload.provider) provider.value = payload.provider;
  if (payload.displayName) displayName.value = payload.displayName;
  sync(payload).catch((err) => console.error('sync failed', err));
}

// If a session token exists in localStorage, validate it on mount so
// the UI can hydrate `result` and `userAccount` and show SignedInCard.
onMounted(() => {
  if (sessionToken.value) {
    console.debug('App: found sessionToken on mount, validating...');
    // server expects provider/displayName; if not available, send minimal payload
    sync({ provider: provider.value, displayName: displayName.value }).catch((err) => console.error('auto-sync failed', err));
  }
});

function logout() {
  sessionToken.value = null;
  localStorage.removeItem('sessionToken');
  result.value = null;
  userAccount.value = null;
}
</script>

<style>
.container { padding: 2rem; font-family: system-ui; }
.login { display: grid; gap: 0.5rem; max-width: 420px; }
input, select { padding: 0.5rem; }
button { margin-top: 1rem; padding: 0.6rem 1rem; }
</style>
