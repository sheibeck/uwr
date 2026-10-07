/**
 * Visited places through the real handlers (plan 51-01): move_character, set_active_character,
 * respawn_character and delete_character on the strict mock db. Also pins that the handler's
 * stamina deduction equals the shared travelStaminaCost rule. No test moves onto an uncharted
 * place, so world generation (a paid model call) is never reached.
 */
import { describe, it, expect, vi, beforeAll } from 'vitest';
import { capturedReducer } from '../helpers/schema_recorder';
import { createMockCtx } from '../helpers/test-utils';
import { travelEffectDiscount, travelStaminaCost } from '../data/travel_config';

vi.mock('spacetimedb/server', async () =>
  (await import('../helpers/schema_recorder')).createRecordingServerMock(),
);

const T0 = 1_700_000_000_000_000n;
const alice = { toHexString: () => 'a'.repeat(64) };

let moveCharacter: (...args: any[]) => any;
let setActiveCharacter: (...args: any[]) => any;
let respawnCharacter: (...args: any[]) => any;
let deleteCharacter: (...args: any[]) => any;

beforeAll(async () => {
  await import('../index');
  const grab = (name: string) => {
    const h = capturedReducer(name);
    if (typeof h !== 'function') {
      throw new Error(`capturedReducer('${name}') is not a function: STOP and report; never edit production code to fix this.`);
    }
    return h;
  };
  moveCharacter = grab('move_character');
  setActiveCharacter = grab('set_active_character');
  respawnCharacter = grab('respawn_character');
  deleteCharacter = grab('delete_character');
}, 120_000);

const character = (over: Record<string, unknown> = {}) => ({
  id: 1n,
  ownerUserId: 7n,
  name: 'Mirel',
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
  ...over,
});

const place = (id: bigint, name: string, regionId = 1n) => ({
  id,
  name,
  description: `${name} lies here.`,
  regionId,
  isSafe: true,
  bindStone: false,
  craftingAvailable: false,
  terrainType: 'plains',
  levelOffset: 0n,
});

const link = (from: bigint, to: bigint) => [
  { id: from * 100n + to, fromLocationId: from, toLocationId: to },
  { id: to * 100n + from, fromLocationId: to, toLocationId: from },
];

function newCtx(seed: Record<string, any[]> = {}) {
  return createMockCtx({
    seed: {
      player: [{ id: alice, userId: 7n, activeCharacterId: 1n }],
      character: [character()],
      region: [
        { id: 1n, name: 'Ashfall Wilds', dangerMultiplier: 100n },
        { id: 2n, name: 'Saltmarsh', dangerMultiplier: 100n },
      ],
      location: [place(10n, 'The Crossing'), place(11n, 'Gloamwood'), place(12n, 'Saltmarsh Gate', 2n)],
      location_connection: [...link(10n, 11n), ...link(10n, 12n)],
      world_state: [{ id: 1n, isNight: false, nextTransitionAtMicros: T0 + 3_600_000_000n }],
      ...seed,
    },
    sender: alice,
    timestampMicros: T0,
    strict: true,
  });
}

const visited = (ctx: any): any[] => ctx.db._tables.visited_location ?? [];
const rowFor = (ctx: any, characterId: bigint, locationId: bigint) =>
  visited(ctx).find((r) => r.characterId === characterId && r.locationId === locationId);
const staminaOf = (ctx: any, id: bigint) => ctx.db._tables.character.find((c: any) => c.id === id).stamina;

describe('move_character writes visited places (real handler)', () => {
  it('a solo move records the origin when missing and the destination with its origin', () => {
    const ctx = newCtx();
    moveCharacter(ctx, { characterId: 1n, locationId: 11n });
    expect(visited(ctx)).toHaveLength(2);
    expect(rowFor(ctx, 1n, 10n)).toMatchObject({ fromLocationId: undefined });
    expect(rowFor(ctx, 1n, 11n)).toMatchObject({ fromLocationId: 10n });
    expect(rowFor(ctx, 1n, 11n).firstVisitedAt).toEqual(ctx.timestamp);
  });

  it('the stamina deducted equals the shared rule (plain trip)', () => {
    const ctx = newCtx();
    moveCharacter(ctx, { characterId: 1n, locationId: 11n });
    expect(staminaOf(ctx, 1n)).toBe(50n - travelStaminaCost({ crossRegion: false, effectDiscount: 0n }));
  });

  it('the stamina deducted equals the shared rule across a region with a racial increase and a travel_discount effect', () => {
    const effects = [{ id: 1n, characterId: 1n, effectType: 'travel_discount', roundsRemaining: 3n, magnitude: 2n }];
    const ctx = newCtx({
      character: [character({ racialTravelCostIncrease: 3n, racialTravelCostDiscount: 1n })],
      character_effect: effects,
    });
    moveCharacter(ctx, { characterId: 1n, locationId: 12n });
    const expected = travelStaminaCost({
      crossRegion: true,
      racialIncrease: 3n,
      racialDiscount: 1n,
      effectDiscount: travelEffectDiscount(effects),
    });
    expect(expected).toBe(10n);
    expect(staminaOf(ctx, 1n)).toBe(50n - expected);
    expect(rowFor(ctx, 1n, 12n)).toMatchObject({ fromLocationId: 10n });
  });

  it('a leader writes rows for itself and a following member; a non-following member gets none', () => {
    const ctx = newCtx({
      character: [
        character({ groupId: 5n }),
        character({ id: 2n, name: 'Follower', ownerUserId: 8n, groupId: 5n, online: true }),
        character({ id: 3n, name: 'Stayer', ownerUserId: 9n, groupId: 5n, online: true }),
      ],
      group: [{ id: 5n, leaderCharacterId: 1n }],
      group_member: [
        { id: 1n, groupId: 5n, characterId: 1n, role: 'leader', followLeader: true },
        { id: 2n, groupId: 5n, characterId: 2n, role: 'member', followLeader: true },
        { id: 3n, groupId: 5n, characterId: 3n, role: 'member', followLeader: false },
      ],
    });
    moveCharacter(ctx, { characterId: 1n, locationId: 11n });
    expect(rowFor(ctx, 1n, 11n)).toMatchObject({ fromLocationId: 10n });
    expect(rowFor(ctx, 2n, 11n)).toMatchObject({ fromLocationId: 10n });
    expect(rowFor(ctx, 2n, 10n)).toBeDefined();
    expect(visited(ctx).filter((r) => r.characterId === 3n)).toEqual([]);
  });

  it('moving back updates the origin place fromLocationId to the place it came back from', () => {
    const ctx = newCtx();
    moveCharacter(ctx, { characterId: 1n, locationId: 11n });
    moveCharacter(ctx, { characterId: 1n, locationId: 10n });
    expect(visited(ctx)).toHaveLength(2);
    expect(rowFor(ctx, 1n, 10n)).toMatchObject({ fromLocationId: 11n });
    expect(rowFor(ctx, 1n, 11n)).toMatchObject({ fromLocationId: 10n });
  });

  it('a refused move (not connected) writes nothing', () => {
    const ctx = newCtx({ location: [place(10n, 'The Crossing'), place(11n, 'Gloamwood'), place(12n, 'Saltmarsh Gate', 2n), place(13n, 'Far Off')] });
    moveCharacter(ctx, { characterId: 1n, locationId: 13n });
    expect(visited(ctx)).toEqual([]);
  });
});

describe('set_active_character backfills the current place (real handler)', () => {
  it('inserts a row for the place with no origin, and a second call inserts nothing', () => {
    const ctx = newCtx({
      player: [{ id: alice, userId: 7n, activeCharacterId: undefined }],
      character: [character({ locationId: 12n })],
    });
    setActiveCharacter(ctx, { characterId: 1n });
    expect(visited(ctx)).toHaveLength(1);
    expect(rowFor(ctx, 1n, 12n)).toMatchObject({ fromLocationId: undefined });
    setActiveCharacter(ctx, { characterId: 1n });
    expect(visited(ctx)).toHaveLength(1);
  });

  it('never changes the origin of an existing row', () => {
    const ctx = newCtx({
      player: [{ id: alice, userId: 7n, activeCharacterId: undefined }],
      character: [character({ locationId: 11n })],
      visited_location: [{ id: 1n, characterId: 1n, locationId: 11n, firstVisitedAt: { microsSinceUnixEpoch: 5n }, fromLocationId: 10n }],
    });
    setActiveCharacter(ctx, { characterId: 1n });
    expect(visited(ctx)).toHaveLength(1);
    expect(rowFor(ctx, 1n, 11n)).toMatchObject({ fromLocationId: 10n, firstVisitedAt: { microsSinceUnixEpoch: 5n } });
  });

  it('a character with no place yet (location 0) gets no row', () => {
    const ctx = newCtx({
      player: [{ id: alice, userId: 7n, activeCharacterId: undefined }],
      character: [character({ locationId: 0n, boundLocationId: undefined })],
    });
    setActiveCharacter(ctx, { characterId: 1n });
    expect(visited(ctx)).toEqual([]);
  });
});

describe('respawn_character records the bind place (real handler)', () => {
  it('marks the bound place visited with no origin', () => {
    const ctx = newCtx({ character: [character({ hp: 0n, locationId: 11n, boundLocationId: 10n })] });
    respawnCharacter(ctx, { characterId: 1n });
    expect(visited(ctx)).toHaveLength(1);
    expect(rowFor(ctx, 1n, 10n)).toMatchObject({ fromLocationId: undefined });
  });
});

describe('delete_character removes the visited rows of that character only', () => {
  it('deletes the rows of the deleted character and keeps the rest', () => {
    const t = { microsSinceUnixEpoch: 1n };
    const ctx = newCtx({
      visited_location: [
        { id: 1n, characterId: 1n, locationId: 10n, firstVisitedAt: t },
        { id: 2n, characterId: 1n, locationId: 11n, firstVisitedAt: t, fromLocationId: 10n },
        { id: 3n, characterId: 2n, locationId: 10n, firstVisitedAt: t },
      ],
    });
    deleteCharacter(ctx, { characterId: 1n });
    expect(visited(ctx).map((r) => r.id)).toEqual([3n]);
  });
});
