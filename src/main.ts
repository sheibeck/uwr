import { createApp, h } from 'vue';
import App from './App.vue';
import { Identity } from 'spacetimedb';
import { SpacetimeDBProvider } from 'spacetimedb/vue';
import { DbConnection, ErrorContext } from './module_bindings/index.ts';
import { getStoredIdToken, handleSpacetimeAuthCallback } from './auth/spacetimeAuth';

const HOST = import.meta.env.VITE_SPACETIMEDB_HOST ?? 'ws://localhost:3000';
const DB_NAME = import.meta.env.VITE_SPACETIMEDB_DB_NAME ?? 'uwr';

const onConnect = (_conn: DbConnection, identity: Identity) => {
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

declare global {
  interface Window {
    __my_identity?: Identity;
  }
}
