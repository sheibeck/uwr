import { createApp, h } from 'vue';
import App from './App.vue';
import { Identity } from 'spacetimedb';
import { SpacetimeDBProvider } from 'spacetimedb/vue';
import { DbConnection, ErrorContext } from './module_bindings/index.ts';
import { getStoredIdToken, handleSpacetimeAuthCallback } from './auth/spacetimeAuth';

const HOST = import.meta.env.VITE_SPACETIMEDB_HOST ?? 'ws://localhost:3000';
const DB_NAME = import.meta.env.VITE_SPACETIMEDB_DB_NAME ?? 'uwr';

const onConnect = (conn: DbConnection, identity: Identity) => {
  window.__db_conn = conn;
  window.__my_identity = identity;
  console.log(
    'Connected to SpacetimeDB with identity:',
    identity.toHexString()
  );
};

const onDisconnect = () => {
  console.log('Disconnected from SpacetimeDB');
};

const onConnectError = (_ctx: ErrorContext, err: Error) => {
  console.log('Error connecting to SpacetimeDB:', err);
};

const bootstrap = async () => {
  try {
    await handleSpacetimeAuthCallback();
  } catch (err) {
    console.error('SpacetimeAuth callback failed:', err);
  }

  const connectionBuilder = DbConnection.builder()
    .withUri(HOST)
    .withModuleName(DB_NAME)
    .withToken(getStoredIdToken() || undefined)
    .onConnect(onConnect)
    .onDisconnect(onDisconnect)
    .onConnectError(onConnectError);

  createApp({
    render: () => h(SpacetimeDBProvider, { connectionBuilder }, () => h(App)),
  }).mount('#app');
};

void bootstrap();

declare const __BUILD_VERSION__: string;

const CLIENT_VERSION = typeof __BUILD_VERSION__ !== 'undefined' ? __BUILD_VERSION__ : 'dev';

const checkForUpdates = async () => {
  try {
    const resp = await fetch('/version.json?_=' + Date.now(), {
      cache: 'no-store',
    });
    if (!resp.ok) return;
    const data = await resp.json();
    if (data.version && data.version !== CLIENT_VERSION && CLIENT_VERSION !== 'dev') {
      console.log('[Version] New client version detected, reloading...');
      window.location.reload();
    }
  } catch {
    // Network error or dev mode — skip silently
  }
};

// Check for updates every 60 seconds, but only in production builds
if (import.meta.env.PROD) {
  setInterval(checkForUpdates, 60_000);
}

declare global {
  interface Window {
    __db_conn?: DbConnection;
    __my_identity?: Identity;
  }
}
