/**
 * Stored online status through the real handlers (plan 51.1-01): set_active_character,
 * clear_active_character, disconnect_logout, clientConnected and sweep_inactivity on the strict
 * mock db. The rule: a character is online exactly when some player row has it as
 * activeCharacterId. Every flip stamps lastOnlineAtMicros with the reducer timestamp; a reducer
 * that does not flip leaves it alone. Scheduled handlers run as the module identity.
 */
import { describe, it, expect, vi, beforeAll } from 'vitest';
import { capturedReducer } from '../helpers/schema_recorder';
import { createMockCtx } from '../helpers/test-utils';
import { MODULE } from '../helpers/combat_fight_fixture';

vi.mock('spacetimedb/server', async () =>
  (await import('../helpers/schema_recorder')).createRecordingServerMock(),
);

const T0 = 1_700_000_000_000_000n;
const NOW = T0 + 1_000_000_000n; // the reducer clock in every test
const alice = { toHexString: () => 'a'.repeat(64) };
const bob = { toHexString: () => 'b'.repeat(64) };

let setActiveCharacter: (...args: any[]) => any;
let clearActiveCharacter: (...args: any[]) => any;
let disconnectLogout: (...args: any[]) => any;
let onConnect: (...args: any[]) => any;
let sweepInactivity: (...args: any[]) => any;

beforeAll(async () => {
  await import('../index');
  const grab = (name: string) => {
    const h = capturedReducer(name);
    if (typeof h !== 'function') {
      throw new Error(`capturedReducer('${name}') is not a function: STOP and report; never edit production code to fix this.`);
    }
    return h;
  };
  setActiveCharacter = grab('set_active_character');
  clearActiveCharacter = grab('clear_active_character');
  disconnectLogout = grab('disconnect_logout');
  onConnect = grab('__client_connected__');
  sweepInactivity = grab('sweep_inactivity');
}, 120_000);

const character = (id: bigint, over: Record<string, unknown> = {}) => ({
  id,
  ownerUserId: 7n,
  name: `Char${id}`,
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

const at = (micros: bigint) => ({ microsSinceUnixEpoch: micros });

const playerRow = (id: any, activeCharacterId: bigint | undefined, over: Record<string, unknown> = {}) => ({
  id,
  userId: 7n,
  activeCharacterId,
  createdAt: at(T0),
  lastSeenAt: at(NOW),
  lastActivityAt: at(NOW),
  ...over,
});

function newCtx(seed: Record<string, any[]>, sender: any = alice) {
  return createMockCtx({
    seed: {
      region: [{ id: 1n, name: 'Ashfall Wilds', dangerMultiplier: 100n }],
      location: [place(10n, 'The Crossing')],
      location_connection: [],
      world_state: [{ id: 1n, isNight: false, nextTransitionAtMicros: NOW + 3_600_000_000n }],
      ...seed,
    },
    sender,
    timestampMicros: NOW,
    databaseIdentity: MODULE,
    strict: true,
  });
}

const charRow = (ctx: any, id: bigint) => ctx.db._tables.character.find((c: any) => c.id === id);

describe('set_active_character', () => {
  it('turns an offline character online and stamps the reducer time', () => {
    const ctx = newCtx({ player: [playerRow(alice, undefined)], character: [character(1n)] });
    setActiveCharacter(ctx, { characterId: 1n });
    expect(charRow(ctx, 1n).online).toBe(true);
    expect(charRow(ctx, 1n).lastOnlineAtMicros).toBe(NOW);
  });

  it('switching turns the new character online and the previous one offline at once', () => {
    const ctx = newCtx({
      player: [playerRow(alice, 1n)],
      character: [character(1n, { online: true, lastOnlineAtMicros: 5n }), character(2n)],
    });
    setActiveCharacter(ctx, { characterId: 2n });
    expect(charRow(ctx, 2n)).toMatchObject({ online: true, lastOnlineAtMicros: NOW });
    expect(charRow(ctx, 1n)).toMatchObject({ online: false, lastOnlineAtMicros: NOW });
  });

  it('a previous character still held by a second player row stays online', () => {
    const ctx = newCtx({
      player: [playerRow(alice, 1n), playerRow(bob, 1n)],
      character: [character(1n, { online: true, lastOnlineAtMicros: 5n }), character(2n)],
    });
    setActiveCharacter(ctx, { characterId: 2n });
    expect(charRow(ctx, 2n).online).toBe(true);
    expect(charRow(ctx, 1n)).toMatchObject({ online: true, lastOnlineAtMicros: 5n });
  });

  it('re-selecting a character that is already online writes no new stamp', () => {
    const ctx = newCtx({
      player: [playerRow(alice, 1n)],
      character: [character(1n, { online: true, lastOnlineAtMicros: 5n })],
    });
    setActiveCharacter(ctx, { characterId: 1n });
    expect(charRow(ctx, 1n)).toMatchObject({ online: true, lastOnlineAtMicros: 5n });
  });
});

describe('clear_active_character (camp)', () => {
  it('turns the character offline', () => {
    const ctx = newCtx({
      player: [playerRow(alice, 1n)],
      character: [character(1n, { online: true, lastOnlineAtMicros: 5n })],
    });
    clearActiveCharacter(ctx, {});
    expect(ctx.db._tables.player[0].activeCharacterId).toBeUndefined();
    expect(charRow(ctx, 1n)).toMatchObject({ online: false, lastOnlineAtMicros: NOW });
  });
});

describe('disconnect_logout (module identity)', () => {
  const D = NOW - 30_000_000n;

  it('with lastSeenAt equal to disconnectAtMicros, turns the character offline', () => {
    const ctx = newCtx(
      {
        player: [playerRow(alice, 1n, { lastSeenAt: at(D) })],
        character: [character(1n, { online: true, lastOnlineAtMicros: 5n })],
      },
      MODULE,
    );
    disconnectLogout(ctx, { arg: { scheduledId: 1n, playerId: alice, disconnectAtMicros: D } });
    expect(ctx.db._tables.player[0].activeCharacterId).toBeUndefined();
    expect(charRow(ctx, 1n)).toMatchObject({ online: false, lastOnlineAtMicros: NOW });
  });

  it('with lastSeenAt one microsecond later (an early reconnect), returns early and the character stays online', () => {
    const ctx = newCtx(
      {
        player: [playerRow(alice, 1n, { lastSeenAt: at(D + 1n) })],
        character: [character(1n, { online: true, lastOnlineAtMicros: 5n })],
      },
      MODULE,
    );
    disconnectLogout(ctx, { arg: { scheduledId: 1n, playerId: alice, disconnectAtMicros: D } });
    expect(ctx.db._tables.player[0].activeCharacterId).toBe(1n);
    expect(charRow(ctx, 1n)).toMatchObject({ online: true, lastOnlineAtMicros: 5n });
  });

  it('a forged client call changes nothing', () => {
    const ctx = newCtx({
      player: [playerRow(alice, 1n, { lastSeenAt: at(D) })],
      character: [character(1n, { online: true, lastOnlineAtMicros: 5n })],
    });
    disconnectLogout(ctx, { arg: { scheduledId: 1n, playerId: alice, disconnectAtMicros: D } });
    expect(charRow(ctx, 1n)).toMatchObject({ online: true, lastOnlineAtMicros: 5n });
  });
});

describe('clientConnected', () => {
  it('turns the connecting player active character online when it reads offline', () => {
    const ctx = newCtx({ player: [playerRow(alice, 1n)], character: [character(1n)] });
    onConnect(ctx);
    expect(charRow(ctx, 1n)).toMatchObject({ online: true, lastOnlineAtMicros: NOW });
  });

  it('a player row with no active character changes nothing', () => {
    const ctx = newCtx({ player: [playerRow(alice, undefined)], character: [character(1n)] });
    onConnect(ctx);
    expect(charRow(ctx, 1n)).toMatchObject({ online: false, lastOnlineAtMicros: 0n });
  });

  it('a brand-new player row changes nothing', () => {
    const ctx = newCtx({ player: [], character: [character(1n)] });
    onConnect(ctx);
    expect(ctx.db._tables.player).toHaveLength(1);
    expect(charRow(ctx, 1n)).toMatchObject({ online: false, lastOnlineAtMicros: 0n });
  });
});

describe('sweep_inactivity (module identity)', () => {
  it('repairs drift both ways and the AFK camp still turns the camped character offline', () => {
    const ctx = newCtx(
      {
        player: [
          // alice is active: her character 1 is held but its flag reads false (drift)
          playerRow(alice, 1n),
          // bob has been idle longer than 15 minutes: the sweep camps character 2
          playerRow(bob, 2n, { userId: 8n, lastSeenAt: at(T0), lastActivityAt: at(T0 - 1_000_000_000n) }),
        ],
        character: [
          character(1n),
          character(2n, { ownerUserId: 8n, online: true, lastOnlineAtMicros: 5n }),
          // character 3 is flagged but no player row holds it (drift)
          character(3n, { online: true, lastOnlineAtMicros: 5n }),
          // character 4 is correct (offline, unheld)
          character(4n),
        ],
      },
      MODULE,
    );
    sweepInactivity(ctx, { arg: { scheduledId: 1n } });
    expect(charRow(ctx, 1n)).toMatchObject({ online: true, lastOnlineAtMicros: NOW });
    expect(charRow(ctx, 2n)).toMatchObject({ online: false, lastOnlineAtMicros: NOW });
    expect(charRow(ctx, 3n)).toMatchObject({ online: false, lastOnlineAtMicros: NOW });
    expect(charRow(ctx, 4n)).toMatchObject({ online: false, lastOnlineAtMicros: 0n });
    expect(ctx.db._tables.player.find((p: any) => p.id === bob).activeCharacterId).toBeUndefined();
  });

  it('a forged client call repairs nothing', () => {
    const ctx = newCtx({
      player: [playerRow(alice, 1n)],
      character: [character(1n), character(3n, { online: true, lastOnlineAtMicros: 5n })],
    });
    sweepInactivity(ctx, { arg: { scheduledId: 1n } });
    expect(charRow(ctx, 1n).online).toBe(false);
    expect(charRow(ctx, 3n).online).toBe(true);
  });
});
