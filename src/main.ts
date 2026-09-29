import { createApp, h } from 'vue';
import App from './App.vue';
import { Identity } from 'spacetimedb';
import { SpacetimeDBProvider } from 'spacetimedb/vue';
import { DbConnection } from './module_bindings/index.ts';
import { logConnectError, logDisconnect } from './connectionLogging';
import { getStoredIdToken, handleSpacetimeAuthCallback } from './auth/spacetimeAuth';

const HOST = import.meta.env.VITE_SPACETIMEDB_HOST ?? 'ws://localhost:3000';
const DB_NAME = import.meta.env.VITE_SPACETIMEDB_DB_NAME ?? 'uwr';

const onConnect = (conn: DbConnection, identity: Identity, _token: string) => {
  window.__db_conn = conn;
  window.__my_identity = identity;
  console.log(
    'Connected to SpacetimeDB with identity:',
    identity.toHexString()
  );
};

const bootstrap = async () => {
  try {
    await handleSpacetimeAuthCallback();
  } catch (err) {
    console.error('SpacetimeAuth callback failed:', err);
  }

  const connectionBuilder = DbConnection.builder()
    .withUri(HOST)
    .withDatabaseName(DB_NAME)
    .withToken(getStoredIdToken() || undefined)
    .onConnect(onConnect)
    .onDisconnect((_ctx, err) => logDisconnect(err))
    .onConnectError((_ctx, err) => logConnectError(err));

  createApp({
    render: () => h(SpacetimeDBProvider, { connectionBuilder }, () => h(App)),
  }).mount('#app');
};

void bootstrap();

declare const __BUILD_VERSION__: string;

const CLIENT_VERSION = typeof __BUILD_VERSION__ !== 'undefined' ? __BUILD_VERSION__ : 'dev';

window.__client_version = CLIENT_VERSION;

declare global {
  interface Window {
    __db_conn?: DbConnection;
    __my_identity?: Identity;
    __client_version?: string;
  }
}
