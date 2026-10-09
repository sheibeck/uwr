/**
 * The region hold at the crossing (Phase 51.3.1.2, D-15 to D-18), through the real move_character
 * handler on the strict mock db. Shape: region A (1) holds Ashfall Ridge (5), the crossing (6, the
 * passage stage 1 made of the Edge Beyond place, terrainType 'passage') and an uncharted edge (11);
 * region B (2), the region being made beyond the crossing, holds its arrival point (20) and a
 * second place (21). The generation state S has source 6 and generated region 2.
 *
 * Only the trigger cases move onto an uncharted place: world generation there only enqueues a job
 * row (the paid call runs in a scheduled procedure no test reaches).
 */
import { describe, it, expect, vi, beforeAll } from 'vitest';
import { capturedReducer } from '../helpers/schema_recorder';
import { createMockCtx } from '../helpers/test-utils';
import { travelStaminaCost } from '../data/travel_config';
import {
  REGION_HOLD_ARRIVING_LINE,
  REGION_HOLD_REFUSED_LINE,
  REGION_HOLD_FAILED_LINE,
} from '../helpers/region_hold';

vi.mock('spacetimedb/server', async () =>
  (await import('../helpers/schema_recorder')).createRecordingServerMock(),
);

const T0 = 1_700_000_000_000_000n;
const alice = { toHexString: () => 'a'.repeat(64) };
const bob = { toHexString: () => 'b'.repeat(64) };
const CROSS_COST = travelStaminaCost({ crossRegion: true, effectDiscount: 0n });
const START_LINE = 'The edges of reality shimmer around you. The world pauses, as if remembering something it had forgotten...';

let moveCharacter: (...args: any[]) => any;

beforeAll(async () => {
  await import('../index');
  const h = capturedReducer('move_character');
  if (typeof h !== 'function') {
    throw new Error("capturedReducer('move_character') is not a function: STOP and report; never edit production code to fix this.");
  }
  moveCharacter = h;
}, 120_000);

const character = (over: Record<string, unknown> = {}) => ({
  id: 1n,
  ownerUserId: 7n,
  name: 'Mirel',
  race: 'Kobold',
  className: 'Tidecaller',
  level: 3n,
  locationId: 6n,
  boundLocationId: 5n,
  stamina: 50n,
  maxStamina: 50n,
  hp: 20n,
  maxHp: 20n,
  mana: 0n,
  maxMana: 0n,
  perception: 0n,
  str: 10n,
  dex: 10n,
  cha: 10n,
  wis: 10n,
  int: 10n,
  online: true,
  ...over,
});

const place = (id: bigint, name: string, regionId: bigint, terrainType = 'plains') => ({
  id,
  name,
  description: `${name} lies here.`,
  zone: 'z',
  regionId,
  isSafe: true,
  bindStone: false,
  craftingAvailable: false,
  terrainType,
  levelOffset: 0n,
});

const link = (from: bigint, to: bigint) => [
  { id: from * 100n + to, fromLocationId: from, toLocationId: to },
  { id: to * 100n + from, fromLocationId: to, toLocationId: from },
];

/** The generation state S of region B (source: the crossing 6). */
const genState = (step: string, over: Record<string, unknown> = {}) => ({
  id: 1n,
  playerId: alice,
  characterId: 1n,
  sourceLocationId: 6n,
  sourceRegionId: 1n,
  step,
  generatedRegionId: 2n,
  createdAt: { microsSinceUnixEpoch: T0 },
  updatedAt: { microsSinceUnixEpoch: T0 },
  ...over,
});

function newCtx(step: string | null, seed: Record<string, any[]> = {}) {
  return createMockCtx({
    seed: {
      player: [{ id: alice, userId: 7n, activeCharacterId: 1n }],
      character: [character()],
      region: [
        { id: 1n, name: 'Ashfall Wilds', dangerMultiplier: 100n },
        { id: 2n, name: 'Kesterlane Basin', dangerMultiplier: 100n },
      ],
      location: [
        place(5n, 'Ashfall Ridge', 1n),
        place(6n, 'The Shrouded Pass', 1n, 'passage'),
        place(11n, 'The Edge Beyond', 1n, 'uncharted'),
        place(20n, 'Kesterlane Gate', 2n),
        place(21n, 'Kesterlane Mire', 2n),
      ],
      location_connection: [...link(5n, 6n), ...link(6n, 20n), ...link(20n, 21n), ...link(5n, 11n)],
      world_state: [{ id: 1n, isNight: false, nextTransitionAtMicros: T0 + 3_600_000_000n }],
      world_gen_state: step ? [genState(step)] : [],
      ...seed,
    },
    sender: alice,
    timestampMicros: T0,
    strict: true,
  });
}

/** A leader (1, alice) and a following online member (2, bob), both at the crossing. */
function partyCtx(step: string | null, at = 6n) {
  return newCtx(step, {
    player: [
      { id: alice, userId: 7n, activeCharacterId: 1n },
      { id: bob, userId: 8n, activeCharacterId: 2n },
    ],
    character: [
      character({ groupId: 5n, locationId: at }),
      character({ id: 2n, name: 'Bram', ownerUserId: 8n, groupId: 5n, locationId: at }),
    ],
    group: [{ id: 5n, leaderCharacterId: 1n }],
    group_member: [
      { id: 1n, groupId: 5n, characterId: 1n, role: 'leader', followLeader: true },
      { id: 2n, groupId: 5n, characterId: 2n, role: 'member', followLeader: true },
    ],
  });
}

const table = (ctx: any, name: string): any[] => ctx.db._tables[name] ?? [];
const row = (ctx: any, id: bigint) => table(ctx, 'character').find((c) => c.id === id);
const where = (ctx: any, id: bigint) => row(ctx, id).locationId;
const systemLines = (ctx: any, ownerId: bigint = 7n): string[] =>
  table(ctx, 'event_private').filter((e) => e.ownerUserId === ownerId && e.kind === 'system').map((e) => e.message);
const locationIds = (ctx: any): bigint[] => table(ctx, 'location').map((r) => r.id);

const IN_PROGRESS = ['GENERATING', 'FILLING', 'FILLING_FAMILIES'];
const FAILED = ['FILL_ERROR', 'FAMILIES_ERROR'];

describe('travel into a held region is refused (D-15, D-18)', () => {
  it.each(IN_PROGRESS)('S at %s: refused with 7b; still at the crossing, stamina unchanged, no region timer', (step) => {
    const ctx = newCtx(step);
    moveCharacter(ctx, { characterId: 1n, locationId: 20n });
    expect(where(ctx, 1n)).toBe(6n);
    expect(row(ctx, 1n).stamina).toBe(50n);
    expect(table(ctx, 'travel_cooldown')).toEqual([]);
    expect(systemLines(ctx)).toEqual([REGION_HOLD_REFUSED_LINE]);
  });

  it.each(FAILED)('S at %s: refused with 7d; nothing moves or is spent', (step) => {
    const ctx = newCtx(step);
    moveCharacter(ctx, { characterId: 1n, locationId: 20n });
    expect(where(ctx, 1n)).toBe(6n);
    expect(row(ctx, 1n).stamina).toBe(50n);
    expect(table(ctx, 'travel_cooldown')).toEqual([]);
    expect(systemLines(ctx)).toEqual([REGION_HOLD_FAILED_LINE]);
  });

  it('S at COMPLETE: the travel succeeds as today (cross-region cost, region timer set)', () => {
    const ctx = newCtx('COMPLETE');
    moveCharacter(ctx, { characterId: 1n, locationId: 20n });
    expect(where(ctx, 1n)).toBe(20n);
    expect(row(ctx, 1n).stamina).toBe(50n - CROSS_COST);
    expect(table(ctx, 'travel_cooldown')).toHaveLength(1);
    expect(systemLines(ctx)).toEqual([]);
  });
});

describe('travel back and travel inside a region are never held', () => {
  it.each([...IN_PROGRESS, 'PENDING', ...FAILED])('S at %s: from the crossing back to a place of A is allowed', (step) => {
    const ctx = newCtx(step);
    moveCharacter(ctx, { characterId: 1n, locationId: 5n });
    expect(where(ctx, 1n)).toBe(5n);
    expect(systemLines(ctx)).toEqual([]);
  });

  it.each([...IN_PROGRESS, ...FAILED])('S at %s: a character already inside B travels within B and from B to the crossing', (step) => {
    const ctx = newCtx(step, { character: [character({ locationId: 20n })] });
    moveCharacter(ctx, { characterId: 1n, locationId: 21n });
    expect(where(ctx, 1n)).toBe(21n);
    moveCharacter(ctx, { characterId: 1n, locationId: 20n });
    expect(where(ctx, 1n)).toBe(20n);
    expect(table(ctx, 'event_private').filter((e) => e.message === REGION_HOLD_REFUSED_LINE || e.message === REGION_HOLD_FAILED_LINE)).toEqual([]);
    moveCharacter(ctx, { characterId: 1n, locationId: 6n });
    expect(where(ctx, 1n)).toBe(6n);
  });
});

describe('a party is held as one (D-15)', () => {
  it('S at FILLING_FAMILIES: the leader is refused and neither moves; the member alone is refused too', () => {
    const ctx = partyCtx('FILLING_FAMILIES');
    moveCharacter(ctx, { characterId: 1n, locationId: 20n });
    expect(where(ctx, 1n)).toBe(6n);
    expect(where(ctx, 2n)).toBe(6n);
    expect(row(ctx, 1n).stamina).toBe(50n);
    expect(row(ctx, 2n).stamina).toBe(50n);
    expect(systemLines(ctx, 7n)).toEqual([REGION_HOLD_REFUSED_LINE]);

    moveCharacter({ ...ctx, sender: bob }, { characterId: 2n, locationId: 20n });
    expect(where(ctx, 2n)).toBe(6n);
    expect(row(ctx, 2n).stamina).toBe(50n);
    expect(systemLines(ctx, 8n)).toEqual([REGION_HOLD_REFUSED_LINE]);
    expect(table(ctx, 'travel_cooldown')).toEqual([]);
  });

  it('S at COMPLETE: the leader and the following member move together', () => {
    const ctx = partyCtx('COMPLETE');
    moveCharacter(ctx, { characterId: 1n, locationId: 20n });
    expect(where(ctx, 1n)).toBe(20n);
    expect(where(ctx, 2n)).toBe(20n);
  });
});

describe('arriving at a held crossing', () => {
  it('S at FILLING: a character travelling to the crossing gets 7a once', () => {
    const ctx = newCtx('FILLING', { character: [character({ locationId: 5n })] });
    moveCharacter(ctx, { characterId: 1n, locationId: 6n });
    expect(where(ctx, 1n)).toBe(6n);
    expect(systemLines(ctx)).toEqual([REGION_HOLD_ARRIVING_LINE]);
  });

  it('S at FAMILIES_ERROR: a character travelling to the crossing gets 7d', () => {
    const ctx = newCtx('FAMILIES_ERROR', { character: [character({ locationId: 5n })] });
    moveCharacter(ctx, { characterId: 1n, locationId: 6n });
    expect(where(ctx, 1n)).toBe(6n);
    expect(systemLines(ctx)).toEqual([REGION_HOLD_FAILED_LINE]);
  });

  it('S at COMPLETE: neither line', () => {
    const ctx = newCtx('COMPLETE', { character: [character({ locationId: 5n })] });
    moveCharacter(ctx, { characterId: 1n, locationId: 6n });
    expect(where(ctx, 1n)).toBe(6n);
    expect(systemLines(ctx)).toEqual([]);
  });

  it('S at FILLING: a party arriving gets 7a once each', () => {
    const ctx = partyCtx('FILLING', 5n);
    moveCharacter(ctx, { characterId: 1n, locationId: 6n });
    expect(where(ctx, 1n)).toBe(6n);
    expect(where(ctx, 2n)).toBe(6n);
    expect(systemLines(ctx, 7n)).toEqual([REGION_HOLD_ARRIVING_LINE]);
    expect(systemLines(ctx, 8n)).toEqual([REGION_HOLD_ARRIVING_LINE]);
  });
});

describe('the travel trigger posts 7a instead of the start line', () => {
  it('a party travelling onto an uncharted place with no state: the state starts and every traveller gets 7a', () => {
    const ctx = partyCtx(null, 5n);
    moveCharacter(ctx, { characterId: 1n, locationId: 11n });
    expect(where(ctx, 1n)).toBe(11n);
    expect(where(ctx, 2n)).toBe(11n);
    const states = table(ctx, 'world_gen_state');
    expect(states).toHaveLength(1);
    expect(states[0]).toMatchObject({ step: 'GENERATING', sourceLocationId: 11n, sourceRegionId: 1n });
    expect(systemLines(ctx, 7n)).toEqual([REGION_HOLD_ARRIVING_LINE]);
    expect(systemLines(ctx, 8n)).toEqual([REGION_HOLD_ARRIVING_LINE]);
    expect(table(ctx, 'event_private').map((e) => e.message)).not.toContain(START_LINE);
  });

  it('arriving at an uncharted place whose state is already GENERATING posts 7a and starts nothing new', () => {
    const ctx = newCtx(null, {
      character: [character({ locationId: 5n })],
      world_gen_state: [genState('GENERATING', { sourceLocationId: 11n, generatedRegionId: undefined, playerId: bob, characterId: 9n })],
    });
    moveCharacter(ctx, { characterId: 1n, locationId: 11n });
    expect(where(ctx, 1n)).toBe(11n);
    expect(table(ctx, 'world_gen_state')).toHaveLength(1);
    expect(systemLines(ctx)).toEqual([REGION_HOLD_ARRIVING_LINE]);
  });
});

describe('a held crossing stays while travellers leave it', () => {
  it.each([...IN_PROGRESS, ...FAILED])('S at %s: the last character leaving back to A leaves the crossing in place', (step) => {
    const ctx = newCtx(step);
    moveCharacter(ctx, { characterId: 1n, locationId: 5n });
    expect(where(ctx, 1n)).toBe(5n);
    expect(locationIds(ctx)).toContain(6n);
  });

  it('S at COMPLETE: the last departure collapses the crossing as before', () => {
    const ctx = newCtx('COMPLETE');
    moveCharacter(ctx, { characterId: 1n, locationId: 5n });
    expect(where(ctx, 1n)).toBe(5n);
    expect(locationIds(ctx)).not.toContain(6n);
  });
});
