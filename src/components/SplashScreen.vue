<template>
  <div :style="styles.splashOverlay">
    <img src="/assets/logo.png" alt="Unwritten Realms" :style="styles.splashLogo" />

    <button
      type="button"
      :style="styles.splashLogin"
      :disabled="!connActive"
      @click="$emit('login')"
    >
      Login &gt;
    </button>

    <div v-if="authMessage" :style="styles.authMessage">{{ authMessage }}</div>
    <div v-if="authError" :style="styles.authError">{{ authError }}</div>
  </div>
</template>

<script setup lang="ts">
import { onMounted, onUnmounted } from 'vue';

const props = defineProps<{
  styles: Record<string, any>;
  connActive: boolean;
  authMessage: string;
  authError: string;
}>();

const emit = defineEmits<{
  login: [];
}>();

function handleKeydown(e: KeyboardEvent) {
  if (e.key === 'Enter' && props.connActive) {
    emit('login');
  }
}

onMounted(() => {
  window.addEventListener('keydown', handleKeydown);
});

onUnmounted(() => {
  window.removeEventListener('keydown', handleKeydown);
});
</script>
