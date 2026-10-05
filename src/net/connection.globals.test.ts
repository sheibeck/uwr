// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

interface Captured {
  onConnect?: (conn: unknown, identity: unknown) => void;
  onDisconnect?: (ctx: unknown, err?: Error) => void;
  built: object;
}

const captured: Captured[] = [];

vi.mock('../module_bindings', () => {
  const builder = () => {
    const record: Captured = { built: {} };
    const api = {
      withUri: () => api,
      withDatabaseName: () => api,
      withToken: () => api,
      onConnect(cb: Captured['onConnect']) {
        record.onConnect = cb;
        return api;
      },
      onDisconnect(cb: Captured['onDisconnect']) {
        record.onDisconnect = cb;
        return api;
      },
      onConnectError: () => api,
      build() {
        captured.push(record);
        return record.built;
      },
    };
    return api;
  };
  return { DbConnection: { builder } };
});

import { buildDbConnection } from './connection';

const handlersReturning = (accepted: boolean) => ({
  onConnect: vi.fn(() => accepted),
  onDisconnect: vi.fn(),
  onConnectError: vi.fn(),
});

describe('buildDbConnection debug globals', () => {
  beforeEach(() => {
    captured.length = 0;
    window.__db_conn = null;
    window.__my_identity = null;
    vi.spyOn(console, 'warn').mockImplementation(() => {});
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('publishes the connection and identity once the controller accepts it', () => {
    buildDbConnection('tok', handlersReturning(true));
    captured[0].onConnect!('conn-a', 'id-a');
    expect(window.__db_conn).toBe('conn-a');
    expect(window.__my_identity).toBe('id-a');
  });

  it('a superseded attempt late onConnect does not clobber the live connection or null it on disconnect', () => {
    const first = buildDbConnection('tok', handlersReturning(false));
    const second = buildDbConnection('tok', handlersReturning(true));

    captured[1].onConnect!(second, 'id-live');
    captured[0].onConnect!(first, 'id-stale');
    expect(window.__db_conn).toBe(second);
    expect(window.__my_identity).toBe('id-live');

    // The controller disconnects the rejected stale connection; that must not null the globals.
    captured[0].onDisconnect!({}, undefined);
    expect(window.__db_conn).toBe(second);
    expect(window.__my_identity).toBe('id-live');
  });
});
