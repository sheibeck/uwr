<script setup lang="ts">
import { computed, onMounted, onUnmounted } from 'vue';
import { PhCircleNotch, PhSignIn, PhWarningCircle } from '@phosphor-icons/vue';
import type { SplashState } from './deriveScreen';

const props = defineProps<{ state: SplashState }>();
const emit = defineEmits<{ 'sign-in': [] }>();

// A root-absolute path would 404 under the production base (/uwr/).
const logoSrc = `${import.meta.env.BASE_URL}assets/logo.png`;

const STATUS_COPY: Partial<Record<SplashState, string>> = {
  redirecting: 'Redirecting to SpacetimeAuth…',
  connecting: 'Connecting…',
  signingIn: 'Signing in…',
  unreachable: "Can't reach the server. Retrying…",
};

const ERROR_COPY: Partial<Record<SplashState, string>> = {
  sessionExpired: 'Your session expired. Sign in again.',
  signInFailed: 'Sign-in failed. Try again.',
};

const showButton = computed(() => props.state !== 'connecting' && props.state !== 'signingIn');
const buttonDisabled = computed(() => props.state === 'redirecting');
const statusText = computed(() => STATUS_COPY[props.state] ?? '');
const errorText = computed(() => ERROR_COPY[props.state] ?? '');

function onKeydown(e: KeyboardEvent) {
  if (e.key === 'Enter' && showButton.value && !buttonDisabled.value) {
    emit('sign-in');
  }
}

onMounted(() => {
  window.addEventListener('keydown', onKeydown);
});

onUnmounted(() => {
  window.removeEventListener('keydown', onKeydown);
});
</script>

<template>
  <div class="splash session-ground">
    <img
      class="lighten splash-logo"
      :src="logoSrc"
      alt="Unwritten Realms"
      width="1672"
      height="941"
      fetchpriority="high"
      draggable="false"
    />
    <button
      v-if="showButton"
      type="button"
      class="btn btn-primary sign-in"
      :disabled="buttonDisabled"
      @click="emit('sign-in')"
    >
      <PhSignIn :size="18" aria-hidden="true" />
      Sign in
    </button>
    <div class="status" aria-live="polite">
      <template v-if="statusText">
        <PhCircleNotch class="spin status-spinner" :size="14" aria-hidden="true" />
        <span>{{ statusText }}</span>
      </template>
    </div>
    <div v-if="errorText" class="error" role="alert">
      <PhWarningCircle class="error-icon" :size="16" aria-hidden="true" />
      <span class="error-text">{{ errorText }}</span>
    </div>
  </div>
</template>

<style scoped>
.splash {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 24px;
  padding: 48px 24px;
}
@media (max-width: 899px) {
  .splash {
    padding: 24px 16px;
  }
}
.splash-logo {
  width: min(960px, 100%);
  max-height: calc(100dvh - 176px);
  aspect-ratio: 16 / 9;
  object-fit: contain;
  height: auto;
  flex-shrink: 0;
  border-radius: var(--radius-lg);
  user-select: none;
}
.sign-in {
  min-height: 44px;
  padding: 0 24px;
}
@media (max-width: 899px) {
  .sign-in {
    width: min(342px, 100%);
  }
}
.status {
  min-height: 24px;
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 12px;
  color: var(--color-neutral-300);
}
.status-spinner {
  color: var(--color-accent);
  flex-shrink: 0;
}
.error {
  display: flex;
  gap: 8px;
  align-items: center;
  padding: 8px 16px;
  border-radius: var(--radius-md);
  max-width: 440px;
  background: color-mix(in srgb, var(--color-health) 18%, transparent);
}
.error-icon {
  color: var(--color-health);
  flex-shrink: 0;
}
.error-text {
  color: var(--color-neutral-200);
}
</style>
