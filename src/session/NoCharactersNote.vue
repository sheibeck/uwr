<script setup lang="ts">
import PreFrameHeader from './PreFrameHeader.vue';

const emit = defineEmits<{ logout: [] }>();
</script>

<template>
  <div class="session-ground">
    <PreFrameHeader title="Characters" @logout="emit('logout')" />
    <div class="card note">
      <span class="card-kicker">No characters yet</span>
      <div class="card-title">Character creation is not ready yet</div>
      <p class="card-body">Check back soon. Until then, sign in with an account that already has a character.</p>
      <button type="button" class="btn btn-secondary" @click="emit('logout')">Log out</button>
    </div>
  </div>
</template>

<style scoped>
.note {
  width: min(440px, 100% - 32px);
  margin: 48px auto 0;
  padding: 24px;
  border-radius: var(--radius-lg);
  gap: 16px;
  align-items: flex-start;
}
@media (max-width: 899px) {
  .note {
    margin-top: 24px;
  }
}
</style>
