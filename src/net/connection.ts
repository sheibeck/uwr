import { ref, shallowRef } from 'vue';
import type { Ref, ShallowRef } from 'vue';
import type { Identity } from 'spacetimedb';
import { DbConnection } from '../module_bindings';
import { clearAuthSession, getStoredIdToken, hasExpiredToken } from '../auth/spacetimeAuth';
import { logConnectError, logDisconnect } from '../connectionLogging';
import { backoffDelayMs } from './backoff';

declare global {
  interface Window {
    __db_conn?: DbConnection | null;
    __my_identity?: Identity | null;
  }
}

export const SPACETIMEDB_HOST = import.meta.env.VITE_SPACETIMEDB_HOST ?? 'ws://localhost:3000';
export const SPACETIMEDB_DB_NAME = import.meta.env.VITE_SPACETIMEDB_DB_NAME ?? 'uwr';

export type ConnectionStatus =
  | 'idle'
  | 'connecting'
  | 'connected'
  | 'reconnecting'
  | 'unreachable'
  | 'rejected'
  | 'expired';

export interface ConnectionHandlers<C> {
  onConnect(conn: C): void;
  onDisconnect(err?: Error): void;
  onConnectError(err: Error): void;
}

type EventTargetLike = Pick<EventTarget, 'addEventListener' | 'removeEventListener'>;

export interface ControllerDeps<C extends { disconnect(): void }> {
  build(token: string, handlers: ConnectionHandlers<C>): C;
  getToken(): string | null;
  hasExpiredToken(): boolean;
  clearSession(): void;
  probe(): Promise<boolean>;
  windowTarget?: EventTargetLike | null;
  documentTarget?: EventTargetLike | null;
  isVisible?: () => boolean;
}

export interface ConnectionController<C> {
  readonly status: Readonly<Ref<ConnectionStatus>>;
  readonly conn: Readonly<ShallowRef<C | null>>;
  readonly nextRetryAt: Readonly<Ref<number | null>>;
  connect(): void;
  disconnect(): void;
  retryNow(): void;
  dispose(): void;
}

export const MAX_TOKEN_FAILURES = 3 as const;

const TOKEN_REJECTED_PREFIX = 'Failed to verify token';

interface Attempt<C> {
  conn: C | null;
  handled: boolean;
  intentional: boolean;
}

export function createConnectionController<C extends { disconnect(): void }>(
  deps: ControllerDeps<C>,
): ConnectionController<C> {
  const status = ref<ConnectionStatus>('idle');
  const conn = shallowRef<C | null>(null) as ShallowRef<C | null>;
  const nextRetryAt = ref<number | null>(null);

  let attempt = 0;
  let tokenFailures = 0;
  let hasConnected = false;
  let retryTimer: ReturnType<typeof setTimeout> | null = null;
  let current: Attempt<C> | null = null;

  const clearTimer = () => {
    if (retryTimer !== null) {
      clearTimeout(retryTimer);
      retryTimer = null;
    }
    nextRetryAt.value = null;
  };

  const resetCounters = () => {
    attempt = 0;
    tokenFailures = 0;
    hasConnected = false;
  };

  const scheduleRetry = () => {
    status.value = hasConnected ? 'reconnecting' : 'unreachable';
    const delay = backoffDelayMs(attempt);
    attempt += 1;
    clearTimer();
    nextRetryAt.value = Date.now() + delay;
    retryTimer = setTimeout(() => {
      retryTimer = null;
      nextRetryAt.value = null;
      attemptConnect();
    }, delay);
  };

  const reject = () => {
    clearTimer();
    current = null;
    conn.value = null;
    status.value = 'rejected';
    deps.clearSession();
  };

  const handleFailure = (record: Attempt<C>, err: Error | undefined) => {
    if (record !== current || record.intentional || record.handled) return;
    record.handled = true;

    const message = err?.message ?? '';
    if (!message.startsWith(TOKEN_REJECTED_PREFIX)) {
      tokenFailures = 0;
      scheduleRetry();
      return;
    }

    // The probe only separates "network down" from "token bad". A reachable host
    // proves nothing about the token on its own, so credentials are wiped only after
    // MAX_TOKEN_FAILURES consecutive failures against a reachable host, with backoff
    // retries in between. While the host is unreachable nothing is counted or wiped.
    void deps
      .probe()
      .catch(() => false)
      .then((reachable) => {
        if (record !== current || record.intentional) return;
        if (!reachable) {
          scheduleRetry();
          return;
        }
        tokenFailures += 1;
        if (tokenFailures >= MAX_TOKEN_FAILURES) reject();
        else scheduleRetry();
      });
  };

  const attemptConnect = () => {
    clearTimer();
    const token = deps.getToken();
    if (!token) {
      current = null;
      conn.value = null;
      if (deps.hasExpiredToken()) {
        status.value = 'expired';
        deps.clearSession();
      } else {
        status.value = 'idle';
      }
      return;
    }

    if (status.value !== 'reconnecting' && status.value !== 'unreachable') {
      status.value = 'connecting';
    }

    const record: Attempt<C> = { conn: null, handled: false, intentional: false };
    current = record;

    const handlers: ConnectionHandlers<C> = {
      onConnect(c) {
        if (record !== current || record.intentional) {
          c.disconnect();
          return;
        }
        record.conn = c;
        attempt = 0;
        tokenFailures = 0;
        hasConnected = true;
        conn.value = c;
        status.value = 'connected';
        clearTimer();
      },
      onDisconnect(err) {
        handleFailure(record, err);
      },
      onConnectError(err) {
        handleFailure(record, err);
      },
    };

    try {
      const built = deps.build(token, handlers);
      if (!record.conn) record.conn = built;
    } catch (error) {
      handleFailure(record, error instanceof Error ? error : new Error(String(error)));
    }
  };

  const connect = () => {
    if (status.value !== 'idle' && status.value !== 'rejected' && status.value !== 'expired') {
      return;
    }
    resetCounters();
    attemptConnect();
  };

  const disconnect = () => {
    clearTimer();
    const record = current;
    current = null;
    if (record) {
      record.intentional = true;
      try {
        record.conn?.disconnect();
      } catch {
        // The socket may already be closed; the session is ending anyway.
      }
    }
    conn.value = null;
    status.value = 'idle';
    resetCounters();
  };

  const retryNow = () => {
    if (status.value !== 'reconnecting' && status.value !== 'unreachable') return;
    if (retryTimer === null) return;
    attemptConnect();
  };

  const onOnline = () => retryNow();
  const onVisibilityChange = () => {
    if (deps.isVisible && !deps.isVisible()) return;
    retryNow();
  };
  deps.windowTarget?.addEventListener('online', onOnline);
  deps.documentTarget?.addEventListener('visibilitychange', onVisibilityChange);

  const dispose = () => {
    disconnect();
    deps.windowTarget?.removeEventListener('online', onOnline);
    deps.documentTarget?.removeEventListener('visibilitychange', onVisibilityChange);
  };

  return {
    status,
    conn,
    nextRetryAt,
    connect,
    disconnect,
    retryNow,
    dispose,
  };
}

export function toHttpBase(wsHost: string): string {
  const base = wsHost.replace(/^ws(s?):\/\//i, 'http$1://');
  return base.replace(/\/+$/, '');
}

export function buildDbConnection(
  token: string,
  handlers: ConnectionHandlers<DbConnection>,
): DbConnection {
  // Handler context parameters stay unannotated: the generated context types
  // make TS 5.6 report TS2589 against the 2.10.1 bindings.
  let built: DbConnection | undefined;
  built = DbConnection.builder()
    .withUri(SPACETIMEDB_HOST)
    .withDatabaseName(SPACETIMEDB_DB_NAME)
    .withToken(token)
    .onConnect((conn, identity) => {
      window.__db_conn = conn;
      window.__my_identity = identity;
      handlers.onConnect(conn);
    })
    .onDisconnect((_ctx, err) => {
      logDisconnect(err);
      if (window.__db_conn === built) {
        window.__db_conn = null;
        window.__my_identity = null;
      }
      handlers.onDisconnect(err);
    })
    .onConnectError((_ctx, err) => {
      logConnectError(err);
      handlers.onConnectError(err);
    })
    .build();
  return built;
}

async function probeReachable(): Promise<boolean> {
  try {
    const response = await fetch(`${toHttpBase(SPACETIMEDB_HOST)}/v1/ping`, {
      method: 'GET',
      signal: AbortSignal.timeout(3000),
    });
    return response.ok;
  } catch {
    return false;
  }
}

export function defaultControllerDeps(): ControllerDeps<DbConnection> {
  const hasWindow = typeof window !== 'undefined';
  const hasDocument = typeof document !== 'undefined';
  return {
    build: buildDbConnection,
    getToken: getStoredIdToken,
    hasExpiredToken,
    clearSession: clearAuthSession,
    probe: probeReachable,
    windowTarget: hasWindow ? window : null,
    documentTarget: hasDocument ? document : null,
    isVisible: () => hasDocument && document.visibilityState === 'visible',
  };
}
