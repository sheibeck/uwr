// @vitest-environment happy-dom
import type { Mock } from 'vitest';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ref, shallowRef } from 'vue';
import type { ConnectionController, ConnectionStatus } from '../net/connection';
import type { BindTableOptions, TableBinding } from '../net/bindTable';
import { createSession } from './useSession';
import type { Session, SessionConn, SessionDeps } from './useSession';

interface FakeConn extends SessionConn {
  reducers: {
    loginEmail: Mock<(args: { email: string }) => Promise<void>>;
    logout: Mock<(args: {}) => Promise<void>>;
    setActiveCharacter: Mock<(args: { characterId: bigint }) => Promise<void>>;
  };
}

interface Rig {
  session: Session;
  status: ReturnType<typeof ref<ConnectionStatus>>;
  conn: FakeConn;
  order: string[];
  bindingDisposals: Mock<() => void>[];
}

function rig(connected: boolean): Rig {
  const order: string[] = [];
  const status = ref<ConnectionStatus>(connected ? 'connected' : 'reconnecting');
  const conn = {
    db: {},
    subscriptionBuilder: vi.fn(),
    reducers: {
      loginEmail: vi.fn(async () => {}),
      logout: vi.fn(async () => {
        order.push('reducer');
      }),
      setActiveCharacter: vi.fn(async () => {}),
    },
  } as unknown as FakeConn;
  const connRef = shallowRef<FakeConn | null>(conn);
  const controller = {
    status,
    conn: connRef,
    nextRetryAt: ref<number | null>(null),
    connect: vi.fn(),
    disconnect: vi.fn(() => {
      order.push('disconnect');
      connRef.value = null;
      status.value = 'idle';
    }),
    retryNow: vi.fn(),
    dispose: vi.fn(),
  };
  const token = { value: 'tok' as string | null };
  const bindingDisposals: Mock<() => void>[] = [];
  const deps: SessionDeps<FakeConn> = {
    controller: controller as unknown as ConnectionController<FakeConn>,
    auth: {
      getStoredIdToken: () => token.value,
      getStoredEmail: () => 'a@b.co',
      clearAuthSession: vi.fn(() => {
        order.push('clear');
        token.value = null;
      }),
      beginSpacetimeAuthLogin: vi.fn(async () => {}),
    },
    bind: (<Row>(_options: BindTableOptions<FakeConn, Row>) => {
      const dispose = vi.fn<() => void>();
      bindingDisposals.push(dispose);
      return {
        rows: shallowRef<readonly Row[]>([]),
        applied: ref(false),
        failed: ref(false),
        attach: vi.fn(),
        dispose,
      } as unknown as TableBinding<FakeConn, Row>;
    }) as SessionDeps<FakeConn>['bind'],
    queries: {
      myPlayer: 'p',
      worldState: 'w',
      appVersion: 'v',
      region: 'r',
      location: 'l',
      characters: (id) => `c${id}`,
      pendingSkills: (id) => `s${id}`,
    },
    buildVersion: 'v1',
    isDev: false,
    reloadPage: vi.fn(),
  };
  return {
    session: createSession(deps, { callbackError: null }),
    status,
    conn,
    order,
    bindingDisposals,
  };
}

describe('logout', () => {
  let r: Rig;
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    r?.session.dispose();
    vi.useRealTimers();
  });

  it('calls the reducer, then clears the stored session, then disconnects', async () => {
    r = rig(true);
    await r.session.logout();
    expect(r.conn.reducers.logout).toHaveBeenCalledWith({});
    expect(r.order).toEqual(['reducer', 'clear', 'disconnect']);
    expect(r.session.screen.value).toEqual({ kind: 'splash', state: 'idle' });
  });

  it('does not wait for a reducer that never settles beyond 2 s', async () => {
    r = rig(true);
    r.conn.reducers.logout.mockImplementation(() => new Promise<void>(() => {}));
    let done = false;
    const pending = r.session.logout().then(() => {
      done = true;
    });
    await vi.advanceTimersByTimeAsync(1999);
    expect(done).toBe(false);
    expect(r.order).toEqual([]);
    await vi.advanceTimersByTimeAsync(1);
    await pending;
    expect(done).toBe(true);
    expect(r.order).toEqual(['clear', 'disconnect']);
    expect(r.session.screen.value).toEqual({ kind: 'splash', state: 'idle' });
  });

  it('still clears and disconnects when the reducer rejects', async () => {
    r = rig(true);
    r.conn.reducers.logout.mockRejectedValueOnce(new Error('boom'));
    await r.session.logout();
    expect(r.order).toEqual(['clear', 'disconnect']);
  });

  it('skips the reducer while not connected but still clears and disconnects', async () => {
    r = rig(false);
    await r.session.logout();
    expect(r.conn.reducers.logout).not.toHaveBeenCalled();
    expect(r.order).toEqual(['clear', 'disconnect']);
    expect(r.session.screen.value).toEqual({ kind: 'splash', state: 'idle' });
  });

  it('drops the cached rows of every binding', async () => {
    r = rig(true);
    await r.session.logout();
    expect(r.bindingDisposals.length).toBeGreaterThanOrEqual(5);
    for (const dispose of r.bindingDisposals) expect(dispose).toHaveBeenCalled();
  });
});
