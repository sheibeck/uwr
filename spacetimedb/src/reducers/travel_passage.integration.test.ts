/**
 * The departure trigger of the passage collapse (plan 51-03), through the real move_character
 * handler on the strict mock db. Local passage 6 shape: own place 5 (region 1), passage 6
 * (region 1, terrainType 'passage'), far place 4097 (region 4097). The collapse runs once, after
 * every traveller has moved. No test moves onto an uncharted place, so world generation (a paid
 * model call) is never reached.
 */
import { describe, it, expect, vi, beforeAll } from 'vitest';
import { capturedReducer } from '../helpers/schema_recorder';
import { createMockCtx } from '../helpers/test-utils';

vi.mock('spacetimedb/server', async () =>
  (await import('../helpers/schema_recorder')).createRecordingServerMock(),
);

const T0 = 1_700_000_000_000_000n;
const alice = { toHexString: () => 'a'.repeat(64) };

let moveCharacter: (...args: any[]) => any;
let respawnCharacter: (...args: any[]) => any;
let deleteCharacter: (...args: any[]) => any;
let autoRespawnDeadCharacter: typeof import('../helpers/character').autoRespawnDeadCharacter;
let executeResurrect: typeof import('../helpers/corpse').executeResurrect;

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
  respawnCharacter = grab('respawn_character');
  deleteCharacter = grab('delete_character');
  autoRespawnDeadCharacter = (await import('../helpers/character')).autoRespawnDeadCharacter;
  executeResurrect = (await import('../helpers/corpse')).executeResurrect;
}, 120_000);

const character = (over: Record<string, unknown> = {}) => ({
  id: 1n,
  ownerUserId: 7n,
  name: 'Mirel',
  level: 3n,
  locationId: 6n,
  boundLocationId: 5n,
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

const place = (id: bigint, name: string, regionId: bigint, terrainType = 'plains') => ({
  id,
  name,
  description: `${name} lies here.`,
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

function newCtx(seed: Record<string, any[]> = {}) {
  return createMockCtx({
    seed: {
      player: [{ id: alice, userId: 7n, activeCharacterId: 1n }],
      character: [character()],
      region: [
        { id: 1n, name: 'Ashfall Wilds', dangerMultiplier: 100n },
        { id: 4097n, name: 'Beyond', dangerMultiplier: 100n },
      ],
      location: [place(5n, 'Own Place', 1n), place(6n, 'The Narrows', 1n, 'passage'), place(4097n, 'Far Place', 4097n)],
      location_connection: [...link(5n, 6n), ...link(6n, 4097n)],
      world_state: [{ id: 1n, isNight: false, nextTransitionAtMicros: T0 + 3_600_000_000n }],
      ...seed,
    },
    sender: alice,
    timestampMicros: T0,
    strict: true,
  });
}

const table = (ctx: any, name: string): any[] => ctx.db._tables[name] ?? [];
const edges = (ctx: any): string[] =>
  table(ctx, 'location_connection').map((r) => `${r.fromLocationId}>${r.toLocationId}`).sort();
const locationIds = (ctx: any): bigint[] => table(ctx, 'location').map((r) => r.id);
const where = (ctx: any, id: bigint) => table(ctx, 'character').find((c) => c.id === id).locationId;

describe('move_character collapses an emptied passage (real handler)', () => {
  it('a solo character leaving for its own side: the passage collapses in the same call', () => {
    const ctx = newCtx();
    moveCharacter(ctx, { characterId: 1n, locationId: 5n });
    expect(where(ctx, 1n)).toBe(5n);
    expect(locationIds(ctx)).toEqual([5n, 4097n]);
    expect(edges(ctx)).toEqual(['4097>5', '5>4097']);
    const visited = table(ctx, 'visited_location');
    // The arrival came from the passage, which no longer exists, so the own-side row keeps no origin (review IN-04).
    expect(visited.find((r) => r.characterId === 1n && r.locationId === 5n)).toMatchObject({ fromLocationId: undefined });
    expect(visited.filter((r) => r.locationId === 6n)).toEqual([]);
  });

  it('a solo character leaving across the border: stamina 10, the timer is set, the passage collapses', () => {
    const ctx = newCtx();
    moveCharacter(ctx, { characterId: 1n, locationId: 4097n });
    expect(where(ctx, 1n)).toBe(4097n);
    expect(table(ctx, 'character')[0].stamina).toBe(40n);
    expect(table(ctx, 'travel_cooldown')).toHaveLength(1);
    expect(locationIds(ctx)).toEqual([5n, 4097n]);
    expect(edges(ctx)).toEqual(['4097>5', '5>4097']);
  });

  it('a leader and a following member both leave: both arrive and the passage collapses once', () => {
    const ctx = newCtx({
      character: [
        character({ groupId: 5n }),
        character({ id: 2n, name: 'Follower', ownerUserId: 8n, groupId: 5n, online: true }),
      ],
      group: [{ id: 5n, leaderCharacterId: 1n }],
      group_member: [
        { id: 1n, groupId: 5n, characterId: 1n, role: 'leader', followLeader: true },
        { id: 2n, groupId: 5n, characterId: 2n, role: 'member', followLeader: true },
      ],
    });
    moveCharacter(ctx, { characterId: 1n, locationId: 5n });
    expect(where(ctx, 1n)).toBe(5n);
    expect(where(ctx, 2n)).toBe(5n);
    expect(locationIds(ctx)).toEqual([5n, 4097n]);
    expect(edges(ctx)).toEqual(['4097>5', '5>4097']);
  });

  it('a member who does not follow keeps the passage open', () => {
    const ctx = newCtx({
      character: [
        character({ groupId: 5n }),
        character({ id: 2n, name: 'Stayer', ownerUserId: 8n, groupId: 5n, online: true }),
      ],
      group: [{ id: 5n, leaderCharacterId: 1n }],
      group_member: [
        { id: 1n, groupId: 5n, characterId: 1n, role: 'leader', followLeader: true },
        { id: 2n, groupId: 5n, characterId: 2n, role: 'member', followLeader: false },
      ],
    });
    moveCharacter(ctx, { characterId: 1n, locationId: 5n });
    expect(where(ctx, 1n)).toBe(5n);
    expect(where(ctx, 2n)).toBe(6n);
    expect(locationIds(ctx)).toEqual([5n, 6n, 4097n]);
    expect(edges(ctx)).toEqual(['4097>6', '5>6', '6>4097', '6>5']);
  });

  it('travelling into the passage from 5 leaves it in place', () => {
    const ctx = newCtx({ character: [character({ locationId: 5n })] });
    moveCharacter(ctx, { characterId: 1n, locationId: 6n });
    expect(where(ctx, 1n)).toBe(6n);
    expect(locationIds(ctx)).toEqual([5n, 6n, 4097n]);
    expect(edges(ctx)).toEqual(['4097>6', '5>6', '6>4097', '6>5']);
  });

  it('entering the passage and leaving it again collapses it; the own place stays', () => {
    const ctx = newCtx({ character: [character({ locationId: 5n })] });
    moveCharacter(ctx, { characterId: 1n, locationId: 6n });
    moveCharacter(ctx, { characterId: 1n, locationId: 5n });
    // The departure emptied the passage, so it collapses; place 5 stays.
    expect(locationIds(ctx)).toEqual([5n, 4097n]);
  });
});

describe('a held crossing does not collapse on departure (Phase 51.3.1.2, D-15)', () => {
  const genState = (step: string) => ({
    id: 1n,
    playerId: alice,
    characterId: 1n,
    sourceLocationId: 6n,
    sourceRegionId: 1n,
    step,
    generatedRegionId: 4097n,
    createdAt: { microsSinceUnixEpoch: T0 },
    updatedAt: { microsSinceUnixEpoch: T0 },
  });

  it.each(['FILLING', 'FILLING_FAMILIES', 'FILL_ERROR', 'FAMILIES_ERROR'])(
    'S at %s: the last character leaving for its own side leaves the passage and its links in place',
    (step) => {
      const ctx = newCtx({ world_gen_state: [genState(step)] });
      moveCharacter(ctx, { characterId: 1n, locationId: 5n });
      expect(where(ctx, 1n)).toBe(5n);
      expect(locationIds(ctx)).toEqual([5n, 6n, 4097n]);
      expect(edges(ctx)).toEqual(['4097>6', '5>6', '6>4097', '6>5']);
    },
  );

  it('S at FILLING: a respawn out of the passage keeps it too', () => {
    const ctx = newCtx({ character: [character({ hp: 0n })], world_gen_state: [genState('FILLING')] });
    respawnCharacter(ctx, { characterId: 1n });
    expect(where(ctx, 1n)).toBe(5n);
    expect(locationIds(ctx)).toEqual([5n, 6n, 4097n]);
  });

  it('S at COMPLETE: the departure collapses the passage as before', () => {
    const ctx = newCtx({ world_gen_state: [genState('COMPLETE')] });
    moveCharacter(ctx, { characterId: 1n, locationId: 5n });
    expect(locationIds(ctx)).toEqual([5n, 4097n]);
    expect(edges(ctx)).toEqual(['4097>5', '5>4097']);
  });
});

describe('the other ways out of a passage also collapse it (review WR-02)', () => {
  const other = (over: Record<string, unknown> = {}) =>
    character({ id: 2n, name: 'Other', ownerUserId: 8n, locationId: 5n, ...over });

  it('respawn_character from a passage: the character wakes at its bind point and the passage collapses', () => {
    const ctx = newCtx({ character: [character({ hp: 0n })] });
    respawnCharacter(ctx, { characterId: 1n });
    expect(where(ctx, 1n)).toBe(5n);
    expect(locationIds(ctx)).toEqual([5n, 4097n]);
    expect(edges(ctx)).toEqual(['4097>5', '5>4097']);
  });

  it('respawn_character leaves the passage while someone else still stands in it', () => {
    const ctx = newCtx({ character: [character({ hp: 0n }), other({ locationId: 6n })] });
    respawnCharacter(ctx, { characterId: 1n });
    expect(where(ctx, 1n)).toBe(5n);
    expect(locationIds(ctx)).toEqual([5n, 6n, 4097n]);
  });

  it('delete_character of the last character in a passage collapses it', () => {
    const ctx = newCtx({ character: [character(), other()] });
    deleteCharacter(ctx, { characterId: 1n });
    expect(table(ctx, 'character').map((c) => c.id)).toEqual([2n]);
    expect(locationIds(ctx)).toEqual([5n, 4097n]);
    expect(edges(ctx)).toEqual(['4097>5', '5>4097']);
  });

  it('autoRespawnDeadCharacter out of a passage collapses it', () => {
    const ctx = newCtx({ character: [character({ hp: 0n })] });
    autoRespawnDeadCharacter(ctx, table(ctx, 'character')[0]);
    expect(where(ctx, 1n)).toBe(5n);
    expect(locationIds(ctx)).toEqual([5n, 4097n]);
  });

  it('a resurrection that takes the target out of a passage to its corpse collapses it', () => {
    const ctx = newCtx({
      character: [other({ id: 2n, name: 'Caster' }), character({ hp: 0n })],
      corpse: [{ id: 1n, characterId: 1n, locationId: 4097n, createdAt: { microsSinceUnixEpoch: T0 } }],
    });
    const caster = table(ctx, 'character').find((c) => c.id === 2n);
    const target = table(ctx, 'character').find((c) => c.id === 1n);
    executeResurrect(ctx, caster, target, table(ctx, 'corpse')[0]);
    expect(where(ctx, 1n)).toBe(4097n);
    expect(locationIds(ctx)).toEqual([5n, 4097n]);
    // The corpse at the far place is untouched by the collapse.
    expect(table(ctx, 'corpse')[0].locationId).toBe(4097n);
  });
});
