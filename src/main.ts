import './styles/nocturne.css';
import './styles/tokens.client.css';
import './styles/frame.css';
import { createApp } from 'vue';
import App from './App.vue';
import { clearLegacyLlmCredential } from './legacyCredentials';
import { handleSpacetimeAuthCallback } from './auth/spacetimeAuth';

declare global {
  interface Window {
    __client_version?: string;
  }
}

window.__client_version = __BUILD_VERSION__;

const bootstrap = async () => {
  clearLegacyLlmCredential();

  let callbackError: unknown = null;
  try {
    await handleSpacetimeAuthCallback();
  } catch (error) {
    callbackError = error;
    console.warn('SpacetimeAuth callback failed', error);
  }

  createApp(App, { callbackError }).mount('#app');
};

void bootstrap();
