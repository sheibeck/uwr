/**
 * Party presence lines through the real handlers (quick 261008-d2k): logout, clientDisconnected,
 * disconnect_logout, clientConnected, set_active_character and clear_active_character on the strict
 * mock db. Armond (character 1, player alice) and Elfansworth (character 2, player bob) are in
 * group 5. The party hears one kind 'group' line per real presence transition of a grouped
 * character, and nothing else. Scheduled handlers run as the module identity.
 */
import { describe, it, expect, vi, beforeAll } from 'vitest';
import { capturedReducer } from '../helpers/schema_recorder';
import { createMockCtx } from '../helpers/test-utils';
import { MODULE } from '../helpers/combat_fight_fixture';

vi.mock('spacetimedb/server', async () =>
  (await import('../helpers/schema_recorder')).createRecordingServerMock(),
);

const T0 = 1_700_000_000_000_000n;
const NOW = T0 + 1_000_000_000n;
const WINDOW = 30_000_000n;
const alice = { toHexString: () => 'a'.repeat(64) };
const bob = { toHexString: () => 'b'.repeat(64) };
const carol = { toHexString: () => 'c'.repeat(64) };

const handlers: Record<string, (...args: any[]) => any> = {};

beforeAll(async () => {
  await import('../index');
  for (const name of [
    'logout',
    'disconnect_logout',
    'set_active_character',
    'clear_active_character',
    '__client_connected__',
    '__client_disconnected__',
  ]) {
    const h = capturedReducer(name);
    if (typeof h !== 'function') {
      throw new Error(`capturedReducer('${name}') is not a function: STOP and report; never edit production code to fix this.`);
    }
    handlers[name] = h;
  }
}, 120_000);

const at = (micros: bigint) => ({ microsSinceUnixEpoch: micros });

const character = (id: bigint, name: string, over: Record<string, unknown> = {}) => ({
  id,
  ownerUserId: 7n,
  name,
  level: 3n,
  locationId: 10n,
  boundLocationId: 10n,
  stamina: 50n,
  maxStamina: 50n,
  hp: 20n,
  maxHp: 20n,
  mana: 0n,
  maxMana: 0n,
  perception: 100n,
  str: 10n,
  dex: 10n,
  cha: 10n,
  wis: 10n,
  int: 10n,
  online: false,
  lastOnlineAtMicros: 0n,
  ...over,
});

const place = (id: bigint, name: string) => ({
  id,
  name,
  description: `${name} lies here.`,
  regionId: 1n,
  isSafe: true,
  bindStone: false,
  craftingAvailable: false,
  terrainType: 'plains',
  levelOffset: 0n,
});

const playerRow = (id: any, activeCharacterId: bigint | undefined, over: Record<string, unknown> = {}) => ({
  id,
  userId: 7n,
  activeCharacterId,
  createdAt: at(T0),
  sessionStartedAt: at(T0),
  lastSeenAt: at(NOW),
  lastActivityAt: at(NOW),
  ...over,
});

const member = (id: bigint, characterId: bigint, ownerUserId: bigint, role: string) => ({
  id,
  groupId: 5n,
  characterId,
  ownerUserId,
  role,
  followLeader: true,
  joinedAt: at(T0),
});

type Seed = {
  players?: any[];
  characters?: any[];
  grouped?: boolean;
  friends?: boolean;
};

/** Armond and Elfansworth in group 5, both online, alice holding Armond and bob holding Elfansworth. */
function newCtx(s: Seed = {}) {
  const grouped = s.grouped !== false;
  return createMockCtx({
    seed: {
      region: [{ id: 1n, name: 'Ashfall Wilds', dangerMultiplier: 100n }],
      location: [place(10n, 'The Crossing')],
      location_connection: [],
      world_state: [{ id: 1n, isNight: false, nextTransitionAtMicros: NOW + 3_600_000_000n }],
      player: s.players ?? [playerRow(alice, 1n), playerRow(bob, 2n, { userId: 8n })],
      character: s.characters ?? [
        character(1n, 'Armond', { online: true, lastOnlineAtMicros: 5n, groupId: grouped ? 5n : undefined }),
        character(2n, 'Elfansworth', { ownerUserId: 8n, online: true, lastOnlineAtMicros: 5n, groupId: 5n }),
      ],
      group: grouped
        ? [{ id: 5n, name: "Armond's group", leaderCharacterId: 1n, pullerCharacterId: 1n, createdAt: at(T0) }]
        : [],
      group_member: grouped ? [member(1n, 1n, 7n, 'leader'), member(2n, 2n, 8n, 'member')] : [],
      friend: s.friends === false ? [] : [{ id: 1n, userId: 7n, friendUserId: 9n, createdAt: at(T0) }],
    },
    sender: alice,
    timestampMicros: NOW,
    databaseIdentity: MODULE,
    strict: true,
  });
}

/** Call a captured handler as `sender` at time `now`. The db object is shared, so state carries over. */
const call = (ctx: any, name: string, sender: any, now: bigint, args?: unknown) =>
  handlers[name]({ ...ctx, sender, timestamp: at(now) }, args);

const logout = (ctx: any, now: bigint, sender: any = alice) => call(ctx, 'logout', sender, now);
const disconnect = (ctx: any, now: bigint, sender: any = alice) => call(ctx, '__client_disconnected__', sender, now);
const connect = (ctx: any, now: bigint, sender: any = alice) => call(ctx, '__client_connected__', sender, now);

const tickRows = (ctx: any): any[] => ctx.db._tables.disconnect_logout_tick ?? [];

/** Run one disconnect_logout tick row as the module at its due time. */
const runTick = (ctx: any, tick: any) =>
  call(ctx, 'disconnect_logout', MODULE, tick.disconnectAtMicros + WINDOW, { arg: tick });

/** Run every tick row that exists now, in order of disconnectAtMicros. */
const runAllTicks = (ctx: any) => {
  const rows = [...tickRows(ctx)].sort((a, b) => (a.disconnectAtMicros < b.disconnectAtMicros ? -1 : 1));
  for (const row of rows) runTick(ctx, row);
};

const rows = (ctx: any, name: string): any[] => ctx.db._tables[name] ?? [];
const charRow = (ctx: any, id: bigint) => rows(ctx, 'character').find((c: any) => c.id === id);
const playerOf = (ctx: any, id: any) => rows(ctx, 'player').find((p: any) => p.id === id);
const groupRows = (ctx: any) => rows(ctx, 'event_group');
const groupLines = (ctx: any) => groupRows(ctx).map((e: any) => e.message);
const friendLines = (ctx: any) =>
  rows(ctx, 'event_private')
    .filter((e: any) => e.kind === 'presence' && e.ownerUserId === 9n)
    .map((e: any) => e.message);

describe('logout through the Logout button', () => {
  it("owner's case: the party hears 'Armond has logged out.' once, when the window ends", () => {
    const ctx = newCtx();
    const L = NOW;
    logout(ctx, L);
    // Right after the click: no line, Armond still online, the session already over.
    expect(groupRows(ctx)).toHaveLength(0);
    expect(charRow(ctx, 1n).online).toBe(true);
    expect(playerOf(ctx, alice).sessionStartedAt).toBeUndefined();

    disconnect(ctx, L + 1_000n);
    runAllTicks(ctx);

    expect(charRow(ctx, 1n).online).toBe(false);
    expect(groupRows(ctx)).toHaveLength(1);
    expect(groupRows(ctx)[0]).toMatchObject({
      groupId: 5n,
      characterId: 1n,
      kind: 'group',
      message: 'Armond has logged out.',
    });
    expect(friendLines(ctx)).toEqual(['Armond went offline.']);
    // The offline member stays in the party.
    expect(rows(ctx, 'group_member').some((m: any) => m.characterId === 1n)).toBe(true);
    expect(charRow(ctx, 1n).groupId).toBe(5n);
  });

  it('a logout whose client never disconnects still gives one line when the window ends', () => {
    const ctx = newCtx();
    logout(ctx, NOW);
    runAllTicks(ctx);
    expect(groupLines(ctx)).toEqual(['Armond has logged out.']);
  });
});

describe('a dropped connection', () => {
  it("not back inside the window: one 'has gone link-dead.' line, still a member", () => {
    const ctx = newCtx();
    disconnect(ctx, NOW);
    expect(groupRows(ctx)).toHaveLength(0);
    runAllTicks(ctx);
    expect(groupLines(ctx)).toEqual(['Armond has gone link-dead.']);
    expect(charRow(ctx, 1n).online).toBe(false);
    expect(rows(ctx, 'group_member').some((m: any) => m.characterId === 1n)).toBe(true);
  });

  it('back inside the window: no line and Armond stays online', () => {
    const ctx = newCtx();
    const D = NOW;
    disconnect(ctx, D);
    connect(ctx, D + 5_000_000n);
    runAllTicks(ctx);
    expect(groupRows(ctx)).toHaveLength(0);
    expect(charRow(ctx, 1n).online).toBe(true);
  });

  it("logout, sign back in inside the window, later drop: reads 'has gone link-dead.'", () => {
    const ctx = newCtx();
    const L = NOW;
    logout(ctx, L);
    disconnect(ctx, L + 1_000n);
    connect(ctx, L + 10_000_000n);
    expect(playerOf(ctx, alice).sessionStartedAt).toBeDefined();
    runAllTicks(ctx); // both ticks are no-ops
    expect(groupRows(ctx)).toHaveLength(0);
    expect(charRow(ctx, 1n).online).toBe(true);

    const before = new Set(tickRows(ctx));
    disconnect(ctx, L + 60_000_000n);
    const fresh = tickRows(ctx).filter((r) => !before.has(r));
    expect(fresh).toHaveLength(1);
    runTick(ctx, fresh[0]);
    expect(groupLines(ctx)).toEqual(['Armond has gone link-dead.']);
  });
});

describe('boundaries: no party line', () => {
  it('a solo character gives no group line, while the friend line is still written', () => {
    const ctx = newCtx({
      grouped: false,
      characters: [character(1n, 'Armond', { online: true, lastOnlineAtMicros: 5n })],
      players: [playerRow(alice, 1n)],
    });
    logout(ctx, NOW);
    disconnect(ctx, NOW + 1_000n);
    runAllTicks(ctx);
    expect(charRow(ctx, 1n).online).toBe(false);
    expect(groupRows(ctx)).toHaveLength(0);
    expect(friendLines(ctx)).toEqual(['Armond went offline.']);
  });

  it('another session still holding the character gives no line and Armond stays online', () => {
    const ctx = newCtx({
      players: [
        playerRow(alice, 1n),
        playerRow(bob, 2n, { userId: 8n }),
        playerRow(carol, 1n),
      ],
    });
    disconnect(ctx, NOW);
    runAllTicks(ctx);
    expect(playerOf(ctx, alice).activeCharacterId).toBeUndefined();
    expect(charRow(ctx, 1n).online).toBe(true);
    expect(groupRows(ctx)).toHaveLength(0);
  });

  it('a second tick after the release adds no line', () => {
    const ctx = newCtx();
    disconnect(ctx, NOW);
    const tick = tickRows(ctx)[0];
    runTick(ctx, tick);
    expect(groupLines(ctx)).toEqual(['Armond has gone link-dead.']);
    runTick(ctx, tick);
    expect(groupLines(ctx)).toEqual(['Armond has gone link-dead.']);
  });

  it("camp keeps its own line: 'Armond headed to camp.' and none of the new texts", () => {
    const ctx = newCtx();
    call(ctx, 'clear_active_character', alice, NOW, {});
    const lines = groupLines(ctx);
    expect(lines).toContain('Armond headed to camp.');
    expect(lines.filter((m) => /logged out|link-dead|is back/.test(m))).toEqual([]);
  });
});

describe("'is back'", () => {
  const offlineArmond = () =>
    newCtx({
      players: [playerRow(alice, undefined), playerRow(bob, 2n, { userId: 8n })],
      characters: [
        character(1n, 'Armond', { online: false, groupId: 5n }),
        character(2n, 'Elfansworth', { ownerUserId: 8n, online: true, lastOnlineAtMicros: 5n, groupId: 5n }),
        character(3n, 'Solo'),
      ],
    });

  it('set_active_character on an offline member gives exactly one back line', () => {
    const ctx = offlineArmond();
    call(ctx, 'set_active_character', alice, NOW, { characterId: 1n });
    expect(charRow(ctx, 1n).online).toBe(true);
    expect(groupLines(ctx)).toEqual(['Armond is back.']);
  });

  it('re-selecting an already online Armond gives no line', () => {
    const ctx = newCtx();
    call(ctx, 'set_active_character', alice, NOW, { characterId: 1n });
    expect(groupRows(ctx)).toHaveLength(0);
  });

  it('selecting an offline character that is not in a group gives no line', () => {
    const ctx = offlineArmond();
    call(ctx, 'set_active_character', alice, NOW, { characterId: 3n });
    expect(charRow(ctx, 3n).online).toBe(true);
    expect(groupRows(ctx)).toHaveLength(0);
  });

  it('the clientConnected re-sync of a drifted flag gives exactly one back line', () => {
    const ctx = newCtx({
      characters: [
        character(1n, 'Armond', { online: false, groupId: 5n }),
        character(2n, 'Elfansworth', { ownerUserId: 8n, online: true, lastOnlineAtMicros: 5n, groupId: 5n }),
      ],
    });
    connect(ctx, NOW);
    expect(charRow(ctx, 1n).online).toBe(true);
    expect(groupLines(ctx)).toEqual(['Armond is back.']);
  });

  it('a connect with the flag already right gives no line', () => {
    const ctx = newCtx();
    connect(ctx, NOW);
    expect(groupRows(ctx)).toHaveLength(0);
  });
});

describe('switching characters', () => {
  it("the character left behind gets one 'has logged out.' line and the solo one none", () => {
    const ctx = newCtx({
      characters: [
        character(1n, 'Armond', { online: true, lastOnlineAtMicros: 5n, groupId: 5n }),
        character(2n, 'Elfansworth', { ownerUserId: 8n, online: true, lastOnlineAtMicros: 5n, groupId: 5n }),
        character(3n, 'Solo'),
      ],
    });
    call(ctx, 'set_active_character', alice, NOW, { characterId: 3n });
    expect(charRow(ctx, 1n).online).toBe(false);
    expect(charRow(ctx, 3n).online).toBe(true);
    expect(groupRows(ctx)).toHaveLength(1);
    expect(groupRows(ctx)[0]).toMatchObject({ groupId: 5n, characterId: 1n, message: 'Armond has logged out.' });
  });
});
