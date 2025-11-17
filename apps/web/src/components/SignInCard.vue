<template>
  <div class="card">
    <label>Provider</label>
    <select v-model="provider">
      <option value="SUPABASE">Supabase</option>
      <option value="AUTH0">Auth0</option>
    </select>

    <label>Display Name</label>
    <input v-model="displayName" placeholder="Your display name" />

  <button type="button" @click="onSign">Sign In</button>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue';
const emit = defineEmits<{ (e: 'sign', payload: { provider: string; displayName: string }): void }>();

const provider = ref('SUPABASE');
const displayName = ref('PlayerOne');

function onSign() {
  console.debug('SignInCard: onSign clicked', provider.value, displayName.value);
  emit('sign', { provider: provider.value, displayName: displayName.value });
}
</script>

<style scoped>
.card { padding: 1rem; border: 1px solid #ddd; border-radius: 6px; background: #fafafa; }
label { display:block; margin-top: 0.5rem; }
input, select { width:100%; padding:0.4rem; margin-top:0.25rem }
button { margin-top: 0.75rem; }
</style>
