/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_SPACETIMEDB_HOST: string;
  readonly VITE_SPACETIMEDB_DB_NAME: string;
  readonly VITE_SPACETIMEAUTH_ISSUER?: string;
  readonly VITE_SPACETIMEAUTH_CLIENT_ID?: string;
  readonly VITE_SPACETIMEAUTH_REDIRECT_URI?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

declare const __BUILD_VERSION__: string;
