// @vitest-environment happy-dom
import type { Mock } from 'vitest';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  createConnectionController,
  defaultControllerDeps,
  MAX_TOKEN_FAILURES,
  toHttpBase,
} from './connection';
import type { ConnectionHandlers, ControllerDeps } from './connection';

interface FakeConn {
  id: number;
  disconnect: Mock<() => void>;
}

interface Harness {
  deps: ControllerDeps<FakeConn>;
  builds: { token: string; handlers: ConnectionHandlers<FakeConn>; conn: FakeConn }[];
  state: { token: string | null; expired: boolean; probe: boolean };
  clearSession: ReturnType<typeof vi.fn>;
}

function harness(overrides: Partial<ControllerDeps<FakeConn>> = {}): Harness {
  const state = { token: 'tok' as string | null, expired: false, probe: false };
  const builds: Harness['builds'] = [];
  const clearSession = vi.fn(() => {
    state.token = null;
    state.expired = false;
  });
  const deps: ControllerDeps<FakeConn> = {
    build(token, handlers) {
      const conn: FakeConn = { id: builds.length, disconnect: vi.fn<() => void>() };
      builds.push({ token, handlers, conn });
      return conn;
    },
    getToken: () => state.token,
    hasExpiredToken: () => state.expired,
    clearSession,
    probe: async () => state.probe,
    ...overrides,
  };
  return { deps, builds, state, clearSession };
}

const tokenError = () => new Error('Failed to verify token: Unauthorized');
const networkError = () => new TypeError('Failed to fetch');

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(0);
});

afterEach(() => {
  vi.useRealTimers();
});

describe('connect', () => {
  it('stays idle without a token and never builds', () => {
    const h = harness();
    h.state.token = null;
    const c = createConnectionController(h.deps);
    c.connect();
    expect(c.status.value).toBe('idle');
    expect(h.builds).toHaveLength(0);
  });

  it('reports an expired token and clears the session without building', () => {
    const h = harness();
    h.state.token = null;
    h.state.expired = true;
    const c = createConnectionController(h.deps);
    c.connect();
    expect(c.status.value).toBe('expired');
    expect(h.clearSession).toHaveBeenCalledTimes(1);
    expect(h.builds).toHaveLength(0);
  });

  it('builds with the stored token and reaches connected on onConnect', () => {
    const h = harness();
    const c = createConnectionController(h.deps);
    c.connect();
    expect(c.status.value).toBe('connecting');
    expect(h.builds).toHaveLength(1);
    expect(h.builds[0].token).toBe('tok');
    h.builds[0].handlers.onConnect(h.builds[0].conn);
    expect(c.status.value).toBe('connected');
    expect(c.conn.value).toBe(h.builds[0].conn);
    expect(c.nextRetryAt.value).toBeNull();
  });
});

describe('retry backoff', () => {
  it('rebuilds after 1, 2, 5, 10, 20, 30 and 30 s of failed first connections', async () => {
    const h = harness();
    const c = createConnectionController(h.deps);
    c.connect();
    const delays = [1000, 2000, 5000, 10000, 20000, 30000, 30000];
    for (let i = 0; i < delays.length; i += 1) {
      h.builds[i].handlers.onConnectError(networkError());
      expect(c.status.value).toBe('unreachable');
      expect(c.nextRetryAt.value).toBe(Date.now() + delays[i]);
      await vi.advanceTimersByTimeAsync(delays[i] - 1);
      expect(h.builds).toHaveLength(i + 1);
      await vi.advanceTimersByTimeAsync(1);
      expect(h.builds).toHaveLength(i + 2);
    }
  });

  it('restarts the delay at 1 s after a success, reporting reconnecting', async () => {
    const h = harness();
    const c = createConnectionController(h.deps);
    c.connect();
    h.builds[0].handlers.onConnectError(networkError());
    await vi.advanceTimersByTimeAsync(1000);
    h.builds[1].handlers.onConnectError(networkError());
    await vi.advanceTimersByTimeAsync(2000);
    h.builds[2].handlers.onConnect(h.builds[2].conn);
    expect(c.status.value).toBe('connected');

    h.builds[2].handlers.onDisconnect(new Error('socket closed'));
    expect(c.status.value).toBe('reconnecting');
    expect(c.nextRetryAt.value).toBe(Date.now() + 1000);
    expect(c.conn.value).toBe(h.builds[2].conn);
    await vi.advanceTimersByTimeAsync(1000);
    expect(h.builds).toHaveLength(4);
  });

  it('schedules exactly one retry when both error callbacks fire', async () => {
    const h = harness();
    const c = createConnectionController(h.deps);
    c.connect();
    h.builds[0].handlers.onConnectError(networkError());
    h.builds[0].handlers.onDisconnect(networkError());
    await vi.advanceTimersByTimeAsync(60_000);
    expect(h.builds).toHaveLength(2);
  });

  it('reports expired when the token has expired by retry time, without building', async () => {
    const h = harness();
    const c = createConnectionController(h.deps);
    c.connect();
    h.builds[0].handlers.onConnectError(networkError());
    h.state.token = null;
    h.state.expired = true;
    await vi.advanceTimersByTimeAsync(1000);
    expect(c.status.value).toBe('expired');
    expect(h.clearSession).toHaveBeenCalledTimes(1);
    expect(h.builds).toHaveLength(1);
  });

  it('retryNow rebuilds at once and the old timer never fires a second build', async () => {
    const h = harness();
    const c = createConnectionController(h.deps);
    c.connect();
    h.builds[0].handlers.onConnectError(networkError());
    c.retryNow();
    expect(h.builds).toHaveLength(2);
    expect(c.nextRetryAt.value).toBeNull();
    await vi.advanceTimersByTimeAsync(60_000);
    expect(h.builds).toHaveLength(2);
  });

  it('retryNow does nothing while connected or idle', () => {
    const h = harness();
    const c = createConnectionController(h.deps);
    c.retryNow();
    expect(h.builds).toHaveLength(0);
    c.connect();
    h.builds[0].handlers.onConnect(h.builds[0].conn);
    c.retryNow();
    expect(h.builds).toHaveLength(1);
  });

  it('ignores a superseded connection late onConnect and disconnects it', async () => {
    const h = harness();
    const c = createConnectionController(h.deps);
    c.connect();
    h.builds[0].handlers.onConnectError(networkError());
    await vi.advanceTimersByTimeAsync(1000);
    expect(h.builds).toHaveLength(2);
    h.builds[0].handlers.onConnect(h.builds[0].conn);
    expect(h.builds[0].conn.disconnect).toHaveBeenCalledTimes(1);
    expect(c.status.value).toBe('unreachable');
    expect(c.conn.value).toBeNull();
  });
});

describe('disconnect', () => {
  it('is intentional: idle, no conn, and a later onDisconnect schedules nothing', async () => {
    const h = harness();
    const c = createConnectionController(h.deps);
    c.connect();
    h.builds[0].handlers.onConnect(h.builds[0].conn);
    c.disconnect();
    expect(h.builds[0].conn.disconnect).toHaveBeenCalledTimes(1);
    expect(c.status.value).toBe('idle');
    expect(c.conn.value).toBeNull();
    h.builds[0].handlers.onDisconnect(undefined);
    await vi.advanceTimersByTimeAsync(120_000);
    expect(h.builds).toHaveLength(1);
    expect(c.status.value).toBe('idle');
  });

  it('cancels a pending retry', async () => {
    const h = harness();
    const c = createConnectionController(h.deps);
    c.connect();
    h.builds[0].handlers.onConnectError(networkError());
    c.disconnect();
    await vi.advanceTimersByTimeAsync(120_000);
    expect(h.builds).toHaveLength(1);
    expect(c.nextRetryAt.value).toBeNull();
  });
});

describe('token rejection', () => {
  it('does not wipe the session on a single token failure against a reachable host', async () => {
    const h = harness();
    h.state.probe = true;
    const c = createConnectionController(h.deps);
    c.connect();
    h.builds[0].handlers.onConnect(h.builds[0].conn);
    h.builds[0].handlers.onDisconnect(tokenError());
    await vi.advanceTimersByTimeAsync(0);
    expect(c.status.value).toBe('reconnecting');
    expect(h.clearSession).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1000);
    expect(h.builds).toHaveLength(2);
  });

  it('rejects, clears the session and stops retrying after the third consecutive failure against a reachable host', async () => {
    const h = harness();
    h.state.probe = true;
    expect(MAX_TOKEN_FAILURES).toBe(3);
    const c = createConnectionController(h.deps);
    c.connect();
    h.builds[0].handlers.onConnectError(tokenError());
    await vi.advanceTimersByTimeAsync(0);
    expect(c.status.value).toBe('unreachable');
    await vi.advanceTimersByTimeAsync(1000);
    h.builds[1].handlers.onConnectError(tokenError());
    await vi.advanceTimersByTimeAsync(0);
    expect(c.status.value).toBe('unreachable');
    expect(h.clearSession).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(2000);
    h.builds[2].handlers.onConnectError(tokenError());
    await vi.advanceTimersByTimeAsync(0);
    expect(c.status.value).toBe('rejected');
    expect(h.clearSession).toHaveBeenCalledTimes(1);
    expect(c.conn.value).toBeNull();
    await vi.advanceTimersByTimeAsync(120_000);
    expect(h.builds).toHaveLength(3);
  });

  it('retries when the probe says the host is unreachable', async () => {
    const h = harness();
    h.state.probe = false;
    const c = createConnectionController(h.deps);
    c.connect();
    h.builds[0].handlers.onConnectError(tokenError());
    await vi.advanceTimersByTimeAsync(0);
    expect(c.status.value).toBe('unreachable');
    expect(h.clearSession).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1000);
    expect(h.builds).toHaveLength(2);
  });

  it('never rejects while the host is unreachable, however many token failures arrive', async () => {
    const h = harness();
    h.state.probe = false;
    const c = createConnectionController(h.deps);
    c.connect();
    const delays = [1000, 2000, 5000, 10000];
    for (let i = 0; i < delays.length; i += 1) {
      h.builds[i].handlers.onConnectError(tokenError());
      await vi.advanceTimersByTimeAsync(0);
      expect(c.status.value).toBe('unreachable');
      await vi.advanceTimersByTimeAsync(delays[i]);
    }
    expect(h.clearSession).not.toHaveBeenCalled();
    expect(h.builds).toHaveLength(5);
  });

  it('a non-token failure resets the consecutive token failure count', async () => {
    const h = harness();
    h.state.probe = true;
    const c = createConnectionController(h.deps);
    c.connect();
    h.builds[0].handlers.onConnectError(tokenError());
    await vi.advanceTimersByTimeAsync(1000);
    h.builds[1].handlers.onConnectError(tokenError());
    await vi.advanceTimersByTimeAsync(2000);
    h.builds[2].handlers.onConnectError(networkError());
    await vi.advanceTimersByTimeAsync(5000);
    h.builds[3].handlers.onConnectError(tokenError());
    await vi.advanceTimersByTimeAsync(0);
    expect(c.status.value).not.toBe('rejected');
    expect(h.clearSession).not.toHaveBeenCalled();
  });
});

describe('recovery from terminal states', () => {
  it('connect() starts again after a rejection once a new token is stored', async () => {
    const h = harness();
    h.state.probe = true;
    const c = createConnectionController(h.deps);
    c.connect();
    h.builds[0].handlers.onConnectError(tokenError());
    await vi.advanceTimersByTimeAsync(1000);
    h.builds[1].handlers.onConnectError(tokenError());
    await vi.advanceTimersByTimeAsync(2000);
    h.builds[2].handlers.onConnectError(tokenError());
    await vi.advanceTimersByTimeAsync(0);
    expect(c.status.value).toBe('rejected');
    h.state.token = 'fresh';
    c.connect();
    expect(h.builds).toHaveLength(4);
    expect(h.builds[3].token).toBe('fresh');
    expect(c.status.value).toBe('connecting');
  });

  it('connect() is a no-op while an attempt is already underway', () => {
    const h = harness();
    const c = createConnectionController(h.deps);
    c.connect();
    c.connect();
    expect(h.builds).toHaveLength(1);
  });
});

describe('toHttpBase', () => {
  it('maps websocket schemes to http and drops a trailing slash', () => {
    expect(toHttpBase('ws://localhost:3000')).toBe('http://localhost:3000');
    expect(toHttpBase('wss://maincloud.spacetimedb.com/')).toBe('https://maincloud.spacetimedb.com');
    expect(toHttpBase('https://example.com/')).toBe('https://example.com');
    expect(toHttpBase('http://example.com')).toBe('http://example.com');
  });
});

describe('resume listeners', () => {
  const setup = (visible = true) => {
    const windowTarget = new EventTarget();
    const documentTarget = new EventTarget();
    const isVisible = vi.fn(() => visible);
    const h = harness({ windowTarget, documentTarget, isVisible });
    const c = createConnectionController(h.deps);
    c.connect();
    h.builds[0].handlers.onConnectError(networkError());
    return { h, c, windowTarget, documentTarget, isVisible };
  };

  it('rebuilds at once on online while waiting', () => {
    const { h, windowTarget } = setup();
    windowTarget.dispatchEvent(new Event('online'));
    expect(h.builds).toHaveLength(2);
  });

  it('rebuilds on visibilitychange when the tab is visible', () => {
    const { h, documentTarget } = setup(true);
    documentTarget.dispatchEvent(new Event('visibilitychange'));
    expect(h.builds).toHaveLength(2);
  });

  it('does nothing on visibilitychange when the tab is hidden', () => {
    const { h, documentTarget } = setup(false);
    documentTarget.dispatchEvent(new Event('visibilitychange'));
    expect(h.builds).toHaveLength(1);
  });

  it('stops reacting after dispose', () => {
    const { h, c, windowTarget, documentTarget } = setup();
    c.dispose();
    windowTarget.dispatchEvent(new Event('online'));
    documentTarget.dispatchEvent(new Event('visibilitychange'));
    expect(h.builds).toHaveLength(1);
    expect(c.status.value).toBe('idle');
  });
});

describe('defaultControllerDeps', () => {
  it('wires the real session functions', () => {
    const deps = defaultControllerDeps();
    expect(typeof deps.build).toBe('function');
    expect(typeof deps.getToken).toBe('function');
    expect(typeof deps.hasExpiredToken).toBe('function');
    expect(typeof deps.clearSession).toBe('function');
    expect(typeof deps.probe).toBe('function');
  });
});
