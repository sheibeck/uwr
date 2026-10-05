// @vitest-environment happy-dom
import type { Mock } from 'vitest';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ref, shallowRef } from 'vue';
import type { ConnectionController, ConnectionStatus } from '../net/connection';
import type { BindTableOptions, TableBinding } from '../net/bindTable';
import type { Character } from '../module_bindings/types';
import { createSession, defaultQueries } from './useSession';
import type { Session, SessionAuth, SessionConn, SessionDeps, SessionQueries } from './useSession';

interface FakeConn extends SessionConn {
  id: number;
  reducers: {
    loginEmail: Mock<(args: { email: string }) => Promise<void>>;
    logout: Mock<(args: {}) => Promise<void>>;
    setActiveCharacter: Mock<(args: { characterId: bigint }) => Promise<void>>;
  };
}

interface FakeBinding {
  sql: string[];
  options: BindTableOptions<FakeConn, any>;
  rows: ReturnType<typeof shallowRef<readonly any[]>>;
  applied: ReturnType<typeof ref<boolean>>;
  failed: ReturnType<typeof ref<boolean>>;
  attach: Mock<(conn: FakeConn | null) => void>;
  dispose: Mock<() => void>;
}

const queries: SessionQueries = {
  myPlayer: 'Q_MY_PLAYER',
  worldState: 'Q_WORLD_STATE',
  appVersion: 'Q_APP_VERSION',
  region: 'Q_REGION',
  location: 'Q_LOCATION',
  characters: (userId) => `Q_CHARACTERS_${userId}`,
  pendingSkills: (characterId) => `Q_PENDING_${characterId}`,
};

let connCounter = 0;
function makeConn(): FakeConn {
  connCounter += 1;
  return {
    id: connCounter,
    db: {},
    subscriptionBuilder: vi.fn(),
    reducers: {
      loginEmail: vi.fn(async () => {}),
      logout: vi.fn(async () => {}),
      setActiveCharacter: vi.fn(async () => {}),
    },
  } as unknown as FakeConn;
}

function makeCharacter(id: bigint, createdAt: bigint, overrides: Record<string, unknown> = {}): Character {
  return {
    id,
    ownerUserId: 7n,
    name: `Hero${id}`,
    race: 'Elf',
    className: 'Wizard',
    level: 3n,
    locationId: 10n,
    hp: 10n,
    maxHp: 10n,
    mana: 5n,
    maxMana: 5n,
    stamina: 4n,
    maxStamina: 4n,
    pendingLevels: 0n,
    createdAt: { microsSinceUnixEpoch: createdAt },
    ...overrides,
  } as unknown as Character;
}

interface Harness {
  session: Session;
  status: ReturnType<typeof ref<ConnectionStatus>>;
  conn: ReturnType<typeof shallowRef<FakeConn | null>>;
  nextRetryAt: ReturnType<typeof ref<number | null>>;
  controller: {
    connect: Mock<() => void>;
    disconnect: Mock<() => void>;
    retryNow: Mock<() => void>;
    dispose: Mock<() => void>;
  };
  auth: { [K in keyof SessionAuth]: Mock<SessionAuth[K]> };
  bindings: FakeBinding[];
  binding(sql: string): FakeBinding;
  hasBinding(sql: string): boolean;
  reloadPage: Mock<() => void>;
  connect(): FakeConn;
  setPlayer(player: { userId?: bigint; activeCharacterId?: bigint } | null): void;
}

interface HarnessOptions {
  token?: string | null;
  email?: string | null;
  callbackError?: unknown;
  buildVersion?: string;
  isDev?: boolean;
}

function harness(options: HarnessOptions = {}): Harness {
  const status = ref<ConnectionStatus>('idle');
  const conn = shallowRef<FakeConn | null>(null);
  const nextRetryAt = ref<number | null>(null);
  const controller = {
    status,
    conn,
    nextRetryAt,
    connect: vi.fn<() => void>(),
    disconnect: vi.fn<() => void>(() => {
      conn.value = null;
      status.value = 'idle';
    }),
    retryNow: vi.fn<() => void>(),
    dispose: vi.fn<() => void>(),
  };
  const storedToken = { value: options.token === undefined ? 'tok' : options.token };
  const auth = {
    getStoredIdToken: vi.fn<SessionAuth['getStoredIdToken']>(() => storedToken.value),
    getStoredEmail: vi.fn<SessionAuth['getStoredEmail']>(() =>
      options.email === undefined ? 'a@b.co' : options.email,
    ),
    clearAuthSession: vi.fn<SessionAuth['clearAuthSession']>(() => {
      storedToken.value = null;
    }),
    beginSpacetimeAuthLogin: vi.fn<SessionAuth['beginSpacetimeAuthLogin']>(async () => {}),
  };
  const bindings: FakeBinding[] = [];
  const reloadPage = vi.fn<() => void>();

  const deps: SessionDeps<FakeConn> = {
    controller: controller as unknown as ConnectionController<FakeConn>,
    auth,
    bind: (<Row>(bindOptions: BindTableOptions<FakeConn, Row>) => {
      const fake: FakeBinding = {
        sql: bindOptions.sql,
        options: bindOptions,
        rows: shallowRef<readonly any[]>([]),
        applied: ref(false),
        failed: ref(false),
        attach: vi.fn<(c: FakeConn | null) => void>(),
        dispose: vi.fn<() => void>(() => {
          fake.rows.value = [];
          fake.applied.value = false;
        }),
      };
      bindings.push(fake);
      return fake as unknown as TableBinding<FakeConn, Row>;
    }) as SessionDeps<FakeConn>['bind'],
    queries,
    buildVersion: options.buildVersion ?? 'v1',
    isDev: options.isDev ?? false,
    reloadPage,
  };
  const session = createSession(deps, { callbackError: options.callbackError ?? null });

  const find = (sql: string) => {
    const matches = bindings.filter((b) => b.sql[0] === sql && !b.dispose.mock.calls.length);
    return matches[matches.length - 1];
  };
  const h: Harness = {
    session,
    status,
    conn,
    nextRetryAt,
    controller,
    auth,
    bindings,
    binding(sql) {
      const found = find(sql);
      if (!found) throw new Error(`no live binding for ${sql}`);
      return found;
    },
    hasBinding: (sql) => find(sql) !== undefined,
    reloadPage,
    connect() {
      const c = makeConn();
      conn.value = c;
      status.value = 'connected';
      return c;
    },
    setPlayer(player) {
      const b = h.binding(queries.myPlayer);
      b.rows.value = player ? [{ id: 'me', ...player }] : [];
      b.applied.value = true;
    },
  };
  return h;
}

const flush = async () => {
  for (let i = 0; i < 6; i += 1) await Promise.resolve();
};

describe('createSession core', () => {
  let h: Harness;
  afterEach(() => {
    h?.session.dispose();
  });

  describe('initial screen', () => {
    it('shows connecting with a stored token', () => {
      h = harness();
      expect(h.session.screen.value).toEqual({ kind: 'splash', state: 'connecting' });
    });

    it('shows idle without a stored token', () => {
      h = harness({ token: null });
      expect(h.session.screen.value).toEqual({ kind: 'splash', state: 'idle' });
    });

    it('shows signInFailed when the auth callback failed', () => {
      h = harness({ callbackError: new Error('state mismatch') });
      expect(h.session.screen.value).toEqual({ kind: 'splash', state: 'signInFailed' });
    });

    it('start() calls controller.connect once', () => {
      h = harness();
      h.session.start();
      expect(h.controller.connect).toHaveBeenCalledTimes(1);
    });
  });

  describe('bindings', () => {
    it('creates the five static bindings and attaches them when a connection appears', () => {
      h = harness();
      for (const sql of [
        queries.myPlayer,
        queries.worldState,
        queries.appVersion,
        queries.region,
        queries.location,
      ]) {
        expect(h.hasBinding(sql)).toBe(true);
        expect(h.binding(sql).attach).not.toHaveBeenCalledWith(expect.objectContaining({ id: expect.any(Number) }));
      }
      const conn = h.connect();
      for (const sql of [
        queries.myPlayer,
        queries.worldState,
        queries.appVersion,
        queries.region,
        queries.location,
      ]) {
        expect(h.binding(sql).attach).toHaveBeenLastCalledWith(conn);
      }
    });

    it('never subscribes to whole public tables', () => {
      h = harness();
      const all = h.bindings.flatMap((b) => b.sql);
      expect(all).not.toContain('SELECT * FROM player');
      expect(all).not.toContain('SELECT * FROM character');
    });
  });

  describe('login_email', () => {
    it('calls loginEmail once per connection when the player has no user', async () => {
      h = harness();
      const conn = h.connect();
      h.setPlayer({});
      await flush();
      expect(conn.reducers.loginEmail).toHaveBeenCalledTimes(1);
      expect(conn.reducers.loginEmail).toHaveBeenCalledWith({ email: 'a@b.co' });
      // Further reactive changes on the same connection do not repeat it.
      h.setPlayer({});
      h.binding(queries.myPlayer).rows.value = [{ id: 'me', displayName: 'x' }];
      await flush();
      expect(conn.reducers.loginEmail).toHaveBeenCalledTimes(1);
    });

    it('does not call loginEmail before the player row is applied', async () => {
      h = harness();
      const conn = h.connect();
      await flush();
      expect(conn.reducers.loginEmail).not.toHaveBeenCalled();
    });

    it('does not call loginEmail while the player already has a user', async () => {
      h = harness();
      const conn = h.connect();
      h.setPlayer({ userId: 7n });
      await flush();
      expect(conn.reducers.loginEmail).not.toHaveBeenCalled();
    });

    it('calls loginEmail once more on a new connection', async () => {
      h = harness();
      const first = h.connect();
      h.setPlayer({});
      await flush();
      const second = h.connect();
      await flush();
      expect(first.reducers.loginEmail).toHaveBeenCalledTimes(1);
      expect(second.reducers.loginEmail).toHaveBeenCalledTimes(1);
    });

    it('fails sign-in when there is no stored email', async () => {
      h = harness({ email: null });
      const conn = h.connect();
      h.setPlayer({});
      await flush();
      expect(conn.reducers.loginEmail).not.toHaveBeenCalled();
      expect(h.auth.clearAuthSession).toHaveBeenCalled();
      expect(h.controller.disconnect).toHaveBeenCalled();
      expect(h.session.screen.value).toEqual({ kind: 'splash', state: 'signInFailed' });
    });

    it('fails sign-in when loginEmail rejects', async () => {
      h = harness();
      const conn = makeConn();
      conn.reducers.loginEmail.mockRejectedValueOnce(new Error('nope'));
      h.conn.value = conn;
      h.status.value = 'connected';
      h.setPlayer({});
      await flush();
      expect(h.auth.clearAuthSession).toHaveBeenCalled();
      expect(h.controller.disconnect).toHaveBeenCalled();
      expect(h.session.screen.value).toEqual({ kind: 'splash', state: 'signInFailed' });
    });
  });

  describe('login_email rejection while the link is unstable', () => {
    let warn: ReturnType<typeof vi.spyOn>;
    beforeEach(() => {
      warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    });
    afterEach(() => {
      warn.mockRestore();
    });

    function rejectingConn(): { conn: FakeConn; reject: (error: Error) => void } {
      const conn = makeConn();
      let reject!: (error: Error) => void;
      conn.reducers.loginEmail.mockImplementationOnce(
        () => new Promise<void>((_resolve, rej) => (reject = rej)),
      );
      return { conn, reject: (error) => reject(error) };
    }

    it('keeps the stored credentials when the socket drops mid-call', async () => {
      h = harness();
      const { conn, reject } = rejectingConn();
      h.conn.value = conn;
      h.status.value = 'connected';
      h.setPlayer({});
      await flush();
      expect(conn.reducers.loginEmail).toHaveBeenCalledTimes(1);

      // The controller already moved to reconnecting when the pending call is rejected.
      h.status.value = 'reconnecting';
      reject(new Error('connection closed'));
      await flush();
      expect(h.auth.clearAuthSession).not.toHaveBeenCalled();
      expect(h.controller.disconnect).not.toHaveBeenCalled();
      expect(h.session.screen.value).not.toEqual({ kind: 'splash', state: 'signInFailed' });
    });

    it('ignores a late rejection from a connection that has been replaced', async () => {
      h = harness();
      const { conn: stale, reject } = rejectingConn();
      h.conn.value = stale;
      h.status.value = 'connected';
      h.setPlayer({});
      await flush();

      const fresh = h.connect();
      await flush();
      expect(fresh.reducers.loginEmail).toHaveBeenCalledTimes(1);

      reject(new Error('late'));
      await flush();
      expect(h.auth.clearAuthSession).not.toHaveBeenCalled();
      expect(h.controller.disconnect).not.toHaveBeenCalled();
      expect(h.conn.value).toBe(fresh);
      expect(h.session.screen.value).not.toEqual({ kind: 'splash', state: 'signInFailed' });
    });
  });

  describe('characters and the picker', () => {
    async function signedIn(): Promise<void> {
      h = harness();
      h.connect();
      h.setPlayer({ userId: 7n });
      await flush();
    }

    it('creates the character binding for the user and attaches it to the current connection', async () => {
      await signedIn();
      const b = h.binding(queries.characters(7n));
      expect(b.attach).toHaveBeenLastCalledWith(h.conn.value);
      expect(b.options.filter?.(makeCharacter(1n, 1n))).toBe(true);
      expect(b.options.filter?.(makeCharacter(2n, 1n, { ownerUserId: 8n }))).toBe(false);
    });

    it('shows signingIn until the characters are applied', async () => {
      await signedIn();
      expect(h.session.screen.value).toEqual({ kind: 'splash', state: 'signingIn' });
    });

    it('shows the no-characters note with zero rows', async () => {
      await signedIn();
      h.binding(queries.characters(7n)).applied.value = true;
      expect(h.session.screen.value).toEqual({ kind: 'noCharacters' });
    });

    it('lists characters oldest first in the picker', async () => {
      await signedIn();
      const b = h.binding(queries.characters(7n));
      b.rows.value = [makeCharacter(2n, 20n), makeCharacter(1n, 10n)];
      b.applied.value = true;
      expect(h.session.screen.value).toEqual({ kind: 'picker' });
      expect(h.session.characters.value.map((c) => c.id)).toEqual([1n, 2n]);
      expect(h.session.frame.value).toBeNull();
    });
  });

  describe('frame', () => {
    async function inFrame(): Promise<void> {
      h = harness();
      h.connect();
      h.setPlayer({ userId: 7n, activeCharacterId: 1n });
      await flush();
      const chars = h.binding(queries.characters(7n));
      chars.rows.value = [makeCharacter(1n, 10n, { name: 'Aria' })];
      chars.applied.value = true;
      h.binding(queries.location).rows.value = [{ id: 10n, name: 'Ember Gate', regionId: 100n }];
      h.binding(queries.region).rows.value = [{ id: 100n, name: 'Ashfall Wilds' }];
      h.binding(queries.worldState).rows.value = [{ isNight: true }];
    }

    it('opens the frame directly with an active character', async () => {
      await inFrame();
      expect(h.session.screen.value).toEqual({ kind: 'frame' });
      expect(h.session.frame.value?.characterName).toBe('Aria');
      expect(h.session.frame.value?.placeLabel).toBe('Ashfall Wilds · Ember Gate');
      expect(h.session.frame.value?.timeOfDay).toBe('night');
    });

    it('subscribes to the active character pending skills and reflects them in newSkill', async () => {
      await inFrame();
      expect(h.session.frame.value?.newSkill).toBe(false);
      const pending = h.binding(queries.pendingSkills(1n));
      expect(pending.attach).toHaveBeenLastCalledWith(h.conn.value);
      expect(pending.options.filter?.({ characterId: 1n })).toBe(true);
      expect(pending.options.filter?.({ characterId: 2n })).toBe(false);
      pending.rows.value = [{ characterId: 1n }];
      expect(h.session.frame.value?.newSkill).toBe(true);
    });

    it('keeps the frame while reconnecting and reports it', async () => {
      await inFrame();
      h.status.value = 'reconnecting';
      h.nextRetryAt.value = 12345;
      expect(h.session.screen.value).toEqual({ kind: 'frame' });
      expect(h.session.frame.value?.characterName).toBe('Aria');
      expect(h.session.reconnecting.value).toBe(true);
      expect(h.session.nextRetryAt.value).toBe(12345);
    });

    it('reconnecting is false while connected', async () => {
      await inFrame();
      expect(h.session.reconnecting.value).toBe(false);
    });

    it('returns to signingIn then the picker after an outage cleared the session', async () => {
      await inFrame();
      const chars = h.binding(queries.characters(7n));
      h.status.value = 'reconnecting';
      const next = h.connect();
      // The server cleared userId and activeCharacterId during the outage.
      h.setPlayer({});
      await flush();
      expect(chars.dispose).toHaveBeenCalled();
      expect(h.session.screen.value).toEqual({ kind: 'splash', state: 'signingIn' });
      expect(next.reducers.loginEmail).toHaveBeenCalledTimes(1);
      expect(next.reducers.setActiveCharacter).not.toHaveBeenCalled();
      // Login completes and the characters arrive again.
      h.setPlayer({ userId: 7n });
      await flush();
      const again = h.binding(queries.characters(7n));
      expect(again).not.toBe(chars);
      again.rows.value = [makeCharacter(1n, 10n)];
      again.applied.value = true;
      expect(h.session.screen.value).toEqual({ kind: 'picker' });
    });

    it('disposes the pending-skill binding when the active character clears', async () => {
      await inFrame();
      const pending = h.binding(queries.pendingSkills(1n));
      h.setPlayer({ userId: 7n });
      expect(pending.dispose).toHaveBeenCalled();
    });
  });

  describe('rejected and expired tokens', () => {
    it.each(['rejected', 'expired'] as const)('maps %s to the session-expired splash', (state) => {
      h = harness();
      h.status.value = state;
      expect(h.session.screen.value).toEqual({ kind: 'splash', state: 'sessionExpired' });
    });
  });

  describe('version prompt', () => {
    it('prompts when the server version differs from the build', () => {
      h = harness({ buildVersion: 'v1' });
      h.binding(queries.appVersion).rows.value = [{ version: 'v2' }];
      expect(h.session.versionPrompt.value).toBe(true);
    });

    it('does not prompt when the versions match or there is no row', () => {
      h = harness({ buildVersion: 'v1' });
      expect(h.session.versionPrompt.value).toBe(false);
      h.binding(queries.appVersion).rows.value = [{ version: 'v1' }];
      expect(h.session.versionPrompt.value).toBe(false);
    });

    it('never prompts in dev', () => {
      h = harness({ buildVersion: 'v1', isDev: true });
      h.binding(queries.appVersion).rows.value = [{ version: 'v2' }];
      expect(h.session.versionPrompt.value).toBe(false);
    });
  });

  describe('dispose', () => {
    it('disposes the controller and every binding', async () => {
      h = harness();
      h.connect();
      h.setPlayer({ userId: 7n, activeCharacterId: 1n });
      await flush();
      const created = [...h.bindings];
      h.session.dispose();
      expect(h.controller.dispose).toHaveBeenCalledTimes(1);
      for (const b of created) expect(b.dispose).toHaveBeenCalled();
    });
  });
});

describe('createSession actions', () => {
  let h: Harness;
  afterEach(() => {
    h?.session.dispose();
    vi.useRealTimers();
  });

  describe('signIn', () => {
    it('shows redirecting and starts the PKCE login', async () => {
      h = harness({ token: null });
      h.session.signIn();
      expect(h.auth.beginSpacetimeAuthLogin).toHaveBeenCalledTimes(1);
      expect(h.session.screen.value).toEqual({ kind: 'splash', state: 'redirecting' });
    });

    it('shows signInFailed when the login start rejects', async () => {
      const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
      h = harness({ token: null });
      h.auth.beginSpacetimeAuthLogin.mockRejectedValueOnce(new Error('discovery failed'));
      h.session.signIn();
      await flush();
      expect(h.session.screen.value).toEqual({ kind: 'splash', state: 'signInFailed' });
      warn.mockRestore();
    });
  });

  describe('selectCharacter', () => {
    async function inPicker(): Promise<FakeConn> {
      vi.useFakeTimers();
      h = harness();
      const conn = h.connect();
      h.setPlayer({ userId: 7n });
      await flush();
      const chars = h.binding(queries.characters(7n));
      chars.rows.value = [makeCharacter(5n, 10n), makeCharacter(6n, 20n)];
      chars.applied.value = true;
      return conn;
    }

    it('calls setActiveCharacter with the id and marks it pending', async () => {
      const conn = await inPicker();
      h.session.selectCharacter(5n);
      expect(conn.reducers.setActiveCharacter).toHaveBeenCalledWith({ characterId: 5n });
      expect(h.session.pickerPendingId.value).toBe(5n);
      expect(h.session.pickerFailed.value).toBe(false);
    });

    it('ignores a second selection while one is pending', async () => {
      const conn = await inPicker();
      h.session.selectCharacter(5n);
      h.session.selectCharacter(6n);
      expect(conn.reducers.setActiveCharacter).toHaveBeenCalledTimes(1);
      expect(h.session.pickerPendingId.value).toBe(5n);
    });

    it('clears the pending state and timer when the active character arrives', async () => {
      await inPicker();
      h.session.selectCharacter(5n);
      h.setPlayer({ userId: 7n, activeCharacterId: 5n });
      expect(h.session.pickerPendingId.value).toBeNull();
      vi.advanceTimersByTime(8000);
      expect(h.session.pickerFailed.value).toBe(false);
    });

    it('fails after 8 s without a change', async () => {
      await inPicker();
      h.session.selectCharacter(5n);
      vi.advanceTimersByTime(7999);
      expect(h.session.pickerFailed.value).toBe(false);
      vi.advanceTimersByTime(1);
      expect(h.session.pickerFailed.value).toBe(true);
      expect(h.session.pickerPendingId.value).toBeNull();
      // The rows are usable again.
      h.session.selectCharacter(6n);
      expect(h.session.pickerPendingId.value).toBe(6n);
      expect(h.session.pickerFailed.value).toBe(false);
    });

    it('fails immediately when the reducer rejects', async () => {
      const conn = await inPicker();
      conn.reducers.setActiveCharacter.mockRejectedValueOnce(new Error('not yours'));
      h.session.selectCharacter(5n);
      await flush();
      expect(h.session.pickerFailed.value).toBe(true);
      expect(h.session.pickerPendingId.value).toBeNull();
    });

    it('fails without a reducer call while not connected', async () => {
      const conn = await inPicker();
      h.status.value = 'reconnecting';
      h.session.selectCharacter(5n);
      expect(conn.reducers.setActiveCharacter).not.toHaveBeenCalled();
      expect(h.session.pickerFailed.value).toBe(true);
      expect(h.session.pickerPendingId.value).toBeNull();
    });
  });

  describe('reload', () => {
    it('calls the injected reloadPage', () => {
      h = harness();
      h.session.reload();
      expect(h.reloadPage).toHaveBeenCalledTimes(1);
    });
  });
});

describe('defaultQueries', () => {
  it('builds scoped subscription SQL', () => {
    const q = defaultQueries();
    expect(q.myPlayer).toContain('my_player');
    expect(q.worldState).toContain('world_state');
    expect(q.appVersion).toContain('app_version');
    expect(q.region).toContain('region');
    expect(q.location).toContain('location');
    expect(q.characters(7n)).toContain('owner_user_id');
    expect(q.characters(7n)).toContain('7');
    expect(q.pendingSkills(9n)).toContain('character_id');
    expect(q.pendingSkills(9n)).toContain('9');
  });
});

beforeEach(() => {
  connCounter = 0;
});
