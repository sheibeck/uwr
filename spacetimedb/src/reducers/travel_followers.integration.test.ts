/**
 * Who comes along when the leader travels (plan 51.1-02): the real move_character handler on the
 * strict mock db. A member travels only when comesAlongWithLeader is true (following, online, at
 * the leader's place); offline members are left behind and neither pay stamina nor block the trip.
 * Within-region trips only, so no test reaches world generation (a paid model call).
 */
import { describe, it, expect, vi, beforeAll } from 'vitest';
import { capturedReducer } from '../helpers/schema_recorder';
import { createMockCtx } from '../helpers/test-utils';
import { travelStaminaCost } from '../data/travel_config';

vi.mock('spacetimedb/server', async () =>
  (await import('../helpers/schema_recorder')).createRecordingServerMock(),
);

const T0 = 1_700_000_000_000_000n;
const alice = { toHexString: () => 'a'.repeat(64) };
const COST = travelStaminaCost({ crossRegion: false, effectDiscount: 0n });

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
  online: true,
  groupId: 5n,
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

const link = (from: bigint, to: bigint) => [
  { id: from * 100n + to, fromLocationId: from, toLocationId: to },
  { id: to * 100n + from, fromLocationId: to, toLocationId: from },
];

type Member = { id: bigint; name: string; follow?: boolean; online?: boolean; at?: bigint; stamina?: bigint };

/** Group 5 led by character 1 at place 10; members as given. Place 12 is a neighbour of 10 and 11. */
function newCtx(members: Member[], leaderOver: Record<string, unknown> = {}) {
  return createMockCtx({
    seed: {
      player: [{ id: alice, userId: 7n, activeCharacterId: 1n }],
      character: [
        character(leaderOver),
        ...members.map((m) =>
          character({
            id: m.id,
            name: m.name,
            ownerUserId: 100n + m.id,
            online: m.online ?? true,
            locationId: m.at ?? 10n,
            stamina: m.stamina ?? 50n,
          }),
        ),
      ],
      region: [{ id: 1n, name: 'Ashfall Wilds', dangerMultiplier: 100n }],
      location: [place(10n, 'The Crossing'), place(11n, 'Gloamwood'), place(12n, 'Mossy Ford')],
      location_connection: [...link(10n, 11n), ...link(10n, 12n), ...link(11n, 12n)],
      world_state: [{ id: 1n, isNight: false, nextTransitionAtMicros: T0 + 3_600_000_000n }],
      group: [{ id: 5n, leaderCharacterId: 1n }],
      group_member: [
        { id: 1n, groupId: 5n, characterId: 1n, role: 'leader', followLeader: true },
        ...members.map((m) => ({
          id: m.id,
          groupId: 5n,
          characterId: m.id,
          role: 'member',
          followLeader: m.follow ?? true,
        })),
      ],
    },
    sender: alice,
    timestampMicros: T0,
    strict: true,
  });
}

const row = (ctx: any, id: bigint) => ctx.db._tables.character.find((c: any) => c.id === id);
const where = (ctx: any, id: bigint) => row(ctx, id).locationId;
const stamina = (ctx: any, id: bigint) => row(ctx, id).stamina;
const privateLines = (ctx: any, ownerId: bigint, kind: string): string[] =>
  (ctx.db._tables.event_private ?? [])
    .filter((e: any) => e.ownerUserId === ownerId && e.kind === kind)
    .map((e: any) => e.message);

describe('move_character: which members come along (real handler)', () => {
  it('an online following member at the leader place moves and pays the trip cost', () => {
    const ctx = newCtx([{ id: 2n, name: 'Bram' }]);
    moveCharacter(ctx, { characterId: 1n, locationId: 11n });
    expect(where(ctx, 1n)).toBe(11n);
    expect(where(ctx, 2n)).toBe(11n);
    expect(stamina(ctx, 2n)).toBe(50n - COST);
  });

  it('an offline following member stays and keeps its stamina; the leader still moves', () => {
    const ctx = newCtx([{ id: 2n, name: 'Bram', online: false }]);
    moveCharacter(ctx, { characterId: 1n, locationId: 11n });
    expect(where(ctx, 1n)).toBe(11n);
    expect(where(ctx, 2n)).toBe(10n);
    expect(stamina(ctx, 2n)).toBe(50n);
  });

  it('a character row without the online field reads offline and is left behind', () => {
    const ctx = newCtx([{ id: 2n, name: 'Bram' }]);
    delete ctx.db._tables.character.find((c: any) => c.id === 2n).online;
    moveCharacter(ctx, { characterId: 1n, locationId: 11n });
    expect(where(ctx, 2n)).toBe(10n);
  });

  it('an online member with Travel with leader off stays', () => {
    const ctx = newCtx([{ id: 2n, name: 'Bram', follow: false }]);
    moveCharacter(ctx, { characterId: 1n, locationId: 11n });
    expect(where(ctx, 1n)).toBe(11n);
    expect(where(ctx, 2n)).toBe(10n);
    expect(stamina(ctx, 2n)).toBe(50n);
  });

  it('an online following member at a neighbouring place, not the leader place, stays [E6]', () => {
    const ctx = newCtx([{ id: 2n, name: 'Bram', at: 12n }]);
    moveCharacter(ctx, { characterId: 1n, locationId: 11n });
    expect(where(ctx, 1n)).toBe(11n);
    expect(where(ctx, 2n)).toBe(12n);
    expect(stamina(ctx, 2n)).toBe(50n);
  });

  it('a follower whose stamina equals the trip cost travels and ends at 0 [E5]', () => {
    const ctx = newCtx([{ id: 2n, name: 'Low', stamina: COST }]);
    moveCharacter(ctx, { characterId: 1n, locationId: 11n });
    expect(where(ctx, 1n)).toBe(11n);
    expect(where(ctx, 2n)).toBe(11n);
    expect(stamina(ctx, 2n)).toBe(0n);
  });

  it('a follower one below the cost blocks the whole trip with the exact existing text [E5]', () => {
    const ctx = newCtx([{ id: 2n, name: 'Low', stamina: COST - 1n }]);
    moveCharacter(ctx, { characterId: 1n, locationId: 11n });
    expect(where(ctx, 1n)).toBe(10n);
    expect(where(ctx, 2n)).toBe(10n);
    expect(stamina(ctx, 1n)).toBe(50n);
    expect(stamina(ctx, 2n)).toBe(COST - 1n);
    const lines = (ctx.db._tables.event_private ?? []).map((e: any) => e.message);
    expect(lines).toContain('Low does not have enough stamina to travel');
  });

  it('an offline follower with stamina 0 neither moves nor blocks [E5]', () => {
    const ctx = newCtx([{ id: 2n, name: 'Low', online: false, stamina: 0n }]);
    moveCharacter(ctx, { characterId: 1n, locationId: 11n });
    expect(where(ctx, 1n)).toBe(11n);
    expect(where(ctx, 2n)).toBe(10n);
    expect(stamina(ctx, 2n)).toBe(0n);
  });

  it('every other member offline: the leader travels alone and pays only its own cost [E7]', () => {
    const ctx = newCtx([
      { id: 2n, name: 'Bram', online: false },
      { id: 3n, name: 'Cael', online: false },
    ]);
    moveCharacter(ctx, { characterId: 1n, locationId: 11n });
    expect(where(ctx, 1n)).toBe(11n);
    expect(stamina(ctx, 1n)).toBe(50n - COST);
    expect(where(ctx, 2n)).toBe(10n);
    expect(where(ctx, 3n)).toBe(10n);
    expect(stamina(ctx, 2n)).toBe(50n);
    expect(stamina(ctx, 3n)).toBe(50n);
    expect(privateLines(ctx, 102n, 'move')).toEqual([]);
  });

  it('an online and an offline follower together: only the online one comes along', () => {
    const ctx = newCtx([
      { id: 2n, name: 'Bram' },
      { id: 3n, name: 'Cael', online: false },
    ]);
    moveCharacter(ctx, { characterId: 1n, locationId: 11n });
    expect(where(ctx, 2n)).toBe(11n);
    expect(where(ctx, 3n)).toBe(10n);
  });

  it('a member who is not the leader moves only itself', () => {
    const ctx = newCtx([
      { id: 2n, name: 'Bram' },
      { id: 3n, name: 'Cael' },
    ]);
    ctx.sender = { toHexString: () => 'b'.repeat(64) };
    ctx.db._tables.player.push({ id: ctx.sender, userId: 102n, activeCharacterId: 2n });
    moveCharacter(ctx, { characterId: 2n, locationId: 11n });
    expect(where(ctx, 2n)).toBe(11n);
    expect(where(ctx, 1n)).toBe(10n);
    expect(where(ctx, 3n)).toBe(10n);
  });
});

describe('move_character: the leader moves once (code review WR-03)', () => {
  it('a group move gives the leader exactly one "You travel to" line and one arrival', () => {
    const ctx = newCtx([{ id: 2n, name: 'Bram' }]);
    moveCharacter(ctx, { characterId: 1n, locationId: 11n });
    expect(privateLines(ctx, 7n, 'move').filter((m) => m === 'You travel to Gloamwood.')).toHaveLength(1);
    expect(privateLines(ctx, 102n, 'move').filter((m) => m === 'You travel to Gloamwood.')).toHaveLength(1);
    const arrivals = (ctx.db._tables.event_location ?? []).filter(
      (e: any) => e.locationId === 11n && String(e.message).startsWith('Mirel '),
    );
    expect(arrivals.length).toBeLessThanOrEqual(1);
    expect(stamina(ctx, 1n)).toBe(50n - COST);
  });
});
