// @vitest-environment happy-dom
// Quick 261006-hbk: an UPDATE of the active character row's hp must reach the health bar. The chain
// under test is the real one: SDK-shaped table -> bindTable (useSession's characters binding) ->
// session.frame -> App -> AppFrame -> VitalsRail / VitalsStrip. Only the connection and the table
// are fakes, shaped like the SDK cache (rows keyed by primary key, insert / delete / update events).
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { nextTick, ref, shallowRef } from 'vue';
import { mount, type VueWrapper } from '@vue/test-utils';
import App from '../App.vue';
import { bindTable } from '../net/bindTable';
import type { ConnectionController, ConnectionStatus } from '../net/connection';
import { barFraction } from '../frame/vitals';
import { createSession } from './useSession';
import type { Session, SessionConn, SessionQueries } from './useSession';

type Listener = (...args: any[]) => void;

/** A table of the SDK client cache: one row per key; events after the cache changed. */
function fakeTable<R>(keyOf: (row: R) => unknown, withUpdate = true) {
  const rows = new Map<unknown, R>();
  const listeners = { insert: new Set<Listener>(), delete: new Set<Listener>(), update: new Set<Listener>() };
  const table = {
    iter: () => rows.values(),
    onInsert: (cb: Listener) => void listeners.insert.add(cb),
    removeOnInsert: (cb: Listener) => void listeners.insert.delete(cb),
    onDelete: (cb: Listener) => void listeners.delete.add(cb),
    removeOnDelete: (cb: Listener) => void listeners.delete.delete(cb),
    ...(withUpdate
      ? {
          onUpdate: (cb: Listener) => void listeners.update.add(cb),
          removeOnUpdate: (cb: Listener) => void listeners.update.delete(cb),
        }
      : {}),
  };
  return {
    table,
    /** Rows present before the subscription applies (the snapshot). */
    seed(row: R) {
      rows.set(keyOf(row), row);
    },
    /** A transaction that changed the row: the cache swaps it, then 'update' fires (oldRow, newRow). */
    update(row: R) {
      const old = rows.get(keyOf(row));
      rows.set(keyOf(row), row);
      for (const cb of [...listeners.update]) cb({}, old, row);
    },
  };
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

function elfansworth(hp: bigint) {
  return {
    id: 1n,
    ownerUserId: 7n,
    name: 'Elfansworth',
    race: 'Dark-Elf',
    className: 'Gloamweaver',
    level: 3n,
    locationId: 10n,
    hp,
    maxHp: 122n,
    mana: 118n,
    maxMana: 118n,
    stamina: 21n,
    maxStamina: 22n,
    pendingLevels: 0n,
    createdAt: { microsSinceUnixEpoch: 1n },
  };
}

interface World {
  session: Session;
  character: ReturnType<typeof fakeTable<ReturnType<typeof elfansworth>>>;
}

function world(): World {
  const pending: (() => void)[] = [];
  const builder = () => {
    let applied: Listener = () => {};
    const b = {
      onApplied(cb: Listener) {
        applied = cb;
        return b;
      },
      onError() {
        return b;
      },
      subscribe() {
        pending.push(() => applied({}));
        return { unsubscribe: vi.fn(), isActive: () => true, isEnded: () => false };
      },
    };
    return b;
  };

  const player = fakeTable<any>((row) => row.id, false); // a view: no onUpdate
  player.seed({ id: 'me', userId: 7n, activeCharacterId: 1n });
  const character = fakeTable<ReturnType<typeof elfansworth>>((row) => row.id);
  character.seed(elfansworth(122n));
  const region = fakeTable<any>((row) => row.id);
  region.seed({ id: 1n, name: 'Ashen Reach' });
  const location = fakeTable<any>((row) => row.id);
  location.seed({ id: 10n, name: 'The Undercroft', regionId: 1n });

  const conn = {
    db: {
      myPlayer: player.table,
      worldState: fakeTable<any>((row) => row.id).table,
      appVersion: fakeTable<any>((row) => row.id).table,
      region: region.table,
      location: location.table,
      character: character.table,
      pendingSkill: fakeTable<any>((row) => row.id).table,
    },
    subscriptionBuilder: builder,
    reducers: {
      loginEmail: vi.fn(async () => {}),
      logout: vi.fn(async () => {}),
      setActiveCharacter: vi.fn(async () => {}),
    },
  } as unknown as SessionConn;

  const controller = {
    status: ref<ConnectionStatus>('idle'),
    conn: shallowRef<SessionConn | null>(null),
    nextRetryAt: ref<number | null>(null),
    connect: vi.fn(),
    disconnect: vi.fn(),
    retryNow: vi.fn(),
    dispose: vi.fn(),
  };
  const session = createSession<SessionConn>(
    {
      controller: controller as unknown as ConnectionController<SessionConn>,
      auth: {
        getStoredIdToken: () => 'tok',
        getStoredEmail: () => 'a@b.co',
        clearAuthSession: vi.fn(),
        beginSpacetimeAuthLogin: vi.fn(async () => {}),
      },
      bind: bindTable,
      queries,
      buildVersion: 'v1',
      isDev: true,
      reloadPage: vi.fn(),
    },
    { callbackError: null },
  );

  controller.conn.value = conn;
  controller.status.value = 'connected';
  // Apply every subscription, including the ones the first applies create (characters by user).
  while (pending.length > 0) pending.shift()!();
  return { session, character };
}

function installMatchMedia(isDesktop: boolean): void {
  vi.stubGlobal('matchMedia', (query: string) => ({
    matches: isDesktop,
    media: query,
    addEventListener: () => {},
    removeEventListener: () => {},
  }));
  window.matchMedia = globalThis.matchMedia;
}

const width = (hp: bigint) => `width: ${barFraction(hp, 122n) * 100}%;`;

let wrapper: VueWrapper | null = null;

beforeEach(() => {
  document.body.innerHTML = '';
});

afterEach(() => {
  wrapper?.unmount();
  wrapper = null;
  vi.unstubAllGlobals();
});

describe('an hp update on the active character row reaches the health bar (261006-hbk)', () => {
  it('desktop rail: readout, bar width and the damage delta follow the row', async () => {
    installMatchMedia(true);
    const { session, character } = world();
    expect(session.screen.value).toEqual({ kind: 'frame' });
    wrapper = mount(App, { attachTo: document.body, props: { session } });
    await nextTick();

    const health = () => wrapper!.find('.vitals-rail .bar');
    expect(health().find('.value').text()).toBe('122 / 122');
    expect(health().find('.fill-health').attributes('style')).toBe(width(122n));

    character.update(elfansworth(111n)); // "Brine Sentinel's Shoot hits you for 11 damage."
    await nextTick();
    expect(session.frame.value?.hp).toBe(111n);
    expect(health().find('.value').text()).toBe('111 / 122');
    expect(health().find('.fill-health').attributes('style')).toBe(width(111n));
    expect(health().find('.delta').text()).toBe('−11');

    character.update(elfansworth(104n)); // a second hit in the same fight
    await nextTick();
    expect(health().find('.value').text()).toBe('104 / 122');
    expect(health().find('.fill-health').attributes('style')).toBe(width(104n));
    expect(health().find('.delta').text()).toBe('−18'); // drops inside the delta window add up
  });

  it('mobile strip: the HP readout and bar follow the row', async () => {
    installMatchMedia(false);
    const { session, character } = world();
    wrapper = mount(App, { attachTo: document.body, props: { session } });
    await nextTick();

    const cell = () => wrapper!.find('.vitals-strip .cell');
    expect(cell().find('.micro-label').text()).toBe('HP 122');

    character.update(elfansworth(115n));
    await nextTick();
    expect(cell().find('.micro-label').text()).toBe('HP 115');
    expect(cell().find('.fill-health').attributes('style')).toBe(width(115n));
    expect(cell().find('.delta').text()).toBe('−7');
  });
});
