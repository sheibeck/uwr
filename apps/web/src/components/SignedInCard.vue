<template>
  <div class="card">
    <div class="card-header">
      <h3>{{ accountSafe.displayName }}</h3>
      <span class="badge" v-if="isNew">New</span>
      <span class="badge returning" v-else>Welcome back</span>
    </div>
    <div class="card-body">
      <div><strong>Provider:</strong> {{ accountSafe.provider }}</div>
      <div><strong>Provider User ID:</strong> {{ accountSafe.providerUserId }}</div>
      <div><strong>Session Expires:</strong> {{ expires }}</div>
    </div>
    <div class="card-actions">
      <button @click="$emit('logout')">Logout</button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';

const props = defineProps<{ account?: any; session?: any; isNew?: boolean }>();
const emit = defineEmits<{ (e: 'logout'): void }>();

const expires = computed(() => props.session?.expiresAt ? new Date(props.session.expiresAt).toLocaleString() : '—');
const accountSafe = computed(() => props.account || { displayName: 'Unknown', provider: '—', providerUserId: '—' });
</script>

<style scoped>
.card { padding: 1rem; border: 1px solid #ddd; border-radius: 6px; background: #fafafa; }
.card-header { display:flex; gap:0.5rem; align-items:center }
.badge { background:#2b9; color:#fff; padding:0.15rem .5rem; border-radius:3px }
.badge.returning { background:#48f }
</style>
