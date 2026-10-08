/**
 * Parity of the follow rule (plan 51.1-07): for every combination of "Travel with leader", online
 * and same-place, the real move_character handler, the Map's travelChecks and the party view's
 * followState must agree on who travels with the leader. Offline members are left behind (owner
 * decision); all three call comesAlongWithLeader from group_config.
 *
 * Run from the repo root: the client modules imported below resolve @game-data through the root
 * vite alias config, which a run started inside spacetimedb/ does not load.
 * Within-region trip only (10 -> 11), so no test reaches world generation (a paid model call).
 */
import { describe, it, expect, vi, beforeAll } from 'vitest';
import { capturedReducer } from '../helpers/schema_recorder';
import { createMockCtx } from '../helpers/test-utils';
import { travelChecks } from '../../../src/map/travelChecks';
import { followState } from '../../../src/social/follow';

vi.mock('spacetimedb/server', async () =>
  (await import('../helpers/schema_recorder')).createRecordingServerMock(),
);

const T0 = 1_700_000_000_000_000n;
const alice = { toHexString: () => 'a'.repeat(64) };

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

const LEADER_PLACE = 10n;
const DESTINATION = 11n;
const ELSEWHERE = 12n;

/** Group 5 led by character 1 (online, at place 10); member 2 as the case says. */
function newCtx(member: { followLeader: boolean; online: boolean; same: boolean }) {
  return createMockCtx({
    seed: {
      player: [{ id: alice, userId: 7n, activeCharacterId: 1n }],
      character: [
        character(),
        character({
          id: 2n,
          name: 'Bram',
          ownerUserId: 102n,
          online: member.online,
          locationId: member.same ? LEADER_PLACE : ELSEWHERE,
        }),
      ],
      region: [{ id: 1n, name: 'Ashfall Wilds', dangerMultiplier: 100n }],
      location: [place(10n, 'The Crossing'), place(11n, 'Gloamwood'), place(12n, 'Mossy Ford')],
      location_connection: [...link(10n, 11n), ...link(10n, 12n), ...link(11n, 12n)],
      world_state: [{ id: 1n, isNight: false, nextTransitionAtMicros: T0 + 3_600_000_000n }],
      group: [{ id: 5n, leaderCharacterId: 1n }],
      group_member: [
        { id: 1n, groupId: 5n, characterId: 1n, role: 'leader', followLeader: true },
        { id: 2n, groupId: 5n, characterId: 2n, role: 'member', followLeader: member.followLeader },
      ],
    },
    sender: alice,
    timestampMicros: T0,
    strict: true,
  });
}

const rowOf = (ctx: any, id: bigint) => ctx.db._tables.character.find((c: any) => c.id === id);

interface Case {
  followLeader: boolean;
  online: boolean;
  same: boolean;
  /** Whether member 2 travels with the leader (the owner decision). */
  travels: boolean;
}

const CASES: Case[] = [];
for (const followLeader of [true, false]) {
  for (const online of [true, false]) {
    for (const same of [true, false]) {
      CASES.push({ followLeader, online, same, travels: followLeader && online && same });
    }
  }
}

describe('follow parity: server, travelChecks and followState', () => {
  it('covers all eight combinations and exactly one that travels', () => {
    expect(CASES).toHaveLength(8);
    expect(CASES.filter((c) => c.travels)).toHaveLength(1);
  });

  for (const c of CASES) {
    const label = `follow ${c.followLeader ? 'on' : 'off'}, ${c.online ? 'online' : 'offline'}, ${
      c.same ? "at the leader's place" : 'elsewhere'
    } -> ${c.travels ? 'travels' : 'stays'}`;

    it(label, () => {
      const ctx = newCtx(c);

      // The client half reads the rows as they stand before the trip.
      const leaderRow = rowOf(ctx, 1n);
      const memberRow = rowOf(ctx, 2n);
      const checks = travelChecks({
        self: leaderRow,
        origin: { id: LEADER_PLACE, regionId: 1n },
        destination: { id: DESTINATION, regionId: 1n },
        regionName: () => 'Ashfall Wilds',
        group: { leaderCharacterId: 1n },
        members: [
          { characterId: 1n, followLeader: true },
          { characterId: 2n, followLeader: c.followLeader },
        ],
        characters: [leaderRow, memberRow],
        effects: [],
        cooldowns: [],
        nowMicros: 0,
        gathering: false,
      });
      const mapSaysTravels = checks.followers.some((f) => f.id === 2n);
      const state = followState({
        isLeader: false,
        followLeader: c.followLeader,
        online: memberRow.online,
        atLeaderPlace: memberRow.locationId === leaderRow.locationId,
      });

      // The server half: the real handler moves the leader.
      moveCharacter(ctx, { characterId: 1n, locationId: DESTINATION });
      const serverMoved = rowOf(ctx, 2n).locationId === DESTINATION;

      expect(rowOf(ctx, 1n).locationId).toBe(DESTINATION);
      expect(serverMoved).toBe(c.travels);
      expect(mapSaysTravels).toBe(serverMoved);
      expect(state === 'comes_along').toBe(serverMoved);
    });
  }

  it('a member row whose online field is missing is left behind by all three', () => {
    const ctx = newCtx({ followLeader: true, online: true, same: true });
    delete rowOf(ctx, 2n).online;
    const leaderRow = rowOf(ctx, 1n);
    const memberRow = rowOf(ctx, 2n);
    const checks = travelChecks({
      self: leaderRow,
      origin: { id: LEADER_PLACE, regionId: 1n },
      destination: { id: DESTINATION, regionId: 1n },
      regionName: () => 'Ashfall Wilds',
      group: { leaderCharacterId: 1n },
      members: [
        { characterId: 1n, followLeader: true },
        { characterId: 2n, followLeader: true },
      ],
      characters: [leaderRow, memberRow],
      effects: [],
      cooldowns: [],
      nowMicros: 0,
      gathering: false,
    });
    const state = followState({
      isLeader: false,
      followLeader: true,
      online: memberRow.online,
      atLeaderPlace: true,
    });
    moveCharacter(ctx, { characterId: 1n, locationId: DESTINATION });
    expect(rowOf(ctx, 2n).locationId).toBe(LEADER_PLACE);
    expect(checks.followers).toEqual([]);
    expect(state).toBe('following_elsewhere');
  });
});
