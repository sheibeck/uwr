/**
 * Travel encounters (Plan 51.3.1.1-13; D-09, D-10, D-14, D-15, D-35, D-56): the real move_character
 * handler on the strict mock db over the shared pool world (helpers/pool_fixture.ts).
 *   - leaving a non-safe place rolls once (phase 'leave') after every travel check and before any
 *     stamina or cooldown is spent; a hit prints the leave ambush line, starts the fight where the
 *     party stands and the move does not happen;
 *   - arriving at a non-safe place rolls once (phase 'enter') after every traveller has moved; a hit
 *     prints the enter ambush line, then the place card, then the fight; a miss prints the quiet
 *     travel line instead of the plain "You travel to" line;
 *   - a party rolls once, seeded by the leader, by its LOWEST level, with the party wording; offline
 *     members never travel and are never pulled in;
 *   - safe places never roll; an arrival that auto-joins an active group fight skips the enter roll.
 * Hitting and missing timestamps are found by scanning T0 offsets with the real rollEncounter on a
 * probe world. No test reaches an uncharted place (world generation is a paid model call).
 */
import { describe, it, expect, vi, beforeAll } from 'vitest';
import { capturedReducer } from '../helpers/schema_recorder';
import {
  T0,
  ALICE,
  BOB,
  REGION_ID,
  ORCHARD_ID,
  FLATS_ID,
  MARKET_ID,
  GOBLINS_ID,
  GROUP_ID,
  poolWorld,
  poolCtx,
  seedPools,
} from '../helpers/pool_fixture';
import { setPoolCount } from '../helpers/pools';
import { encounterSeed, groupSizeFor } from '../data/density_rules';

vi.mock('spacetimedb/server', async () =>
  (await import('../helpers/schema_recorder')).createRecordingServerMock(),
);

let moveCharacter: (...args: any[]) => any;
let rollEncounter: (...args: any[]) => any;
let drawGroup: (...args: any[]) => any[];
let performTravel: (...args: any[]) => boolean;
let travelDeps: (deps: any) => any;
let bag: Record<string, any>;

beforeAll(async () => {
  await import('../index');
  const h = capturedReducer('move_character');
  if (typeof h !== 'function') {
    throw new Error("capturedReducer('move_character') is not a function: STOP and report; never edit production code to fix this.");
  }
  moveCharacter = h;
  ({ rollEncounter, drawGroup } = await import('../helpers/encounters'));
  ({ performTravel, travelDeps } = await import('../helpers/travel'));
  const events = await import('../helpers/events');
  const { areLocationsConnected } = await import('../helpers/location');
  const { isGroupLeaderOrSolo } = await import('../helpers/character');
  const { effectiveGroupId } = await import('../helpers/group');
  const { ensurePoolsForLocation } = await import('../helpers/families');
  const { startCombat } = await import('./combat');
  const { computeEnemyStats } = await import('../helpers/combat_enemies');
  const combatDeps = { SenderError: Error, computeEnemyStats, appendPrivateEvent: events.appendPrivateEvent };
  // A module-shaped deps bag (more names than travel needs), as index.ts hands the reducers.
  bag = {
    spacetimedb: {},
    appendSystemMessage: events.appendSystemMessage,
    appendPrivateEvent: events.appendPrivateEvent,
    appendLocationEvent: events.appendLocationEvent,
    appendGroupEvent: events.appendGroupEvent,
    areLocationsConnected,
    activeCombatIdForCharacter: events.activeCombatIdForCharacter,
    ensurePoolsForLocation,
    isGroupLeaderOrSolo,
    effectiveGroupId,
    startCombat: (ctx: any, ...rest: any[]) => (startCombat as any)(combatDeps, ctx, ...rest),
    unrelated: () => 'not a travel dep',
  };
}, 120_000);

// ---------------------------------------------------------------------------
// World
// ---------------------------------------------------------------------------

const FAR_REGION_ID = 2n;
const FAR_GATE_ID = 50n;

type WorldOpts = {
  /** Where Alice, Bob and Cara stand (Cara is offline). */
  alice?: bigint;
  bob?: bigint;
  cara?: bigint;
  /** Pool counts (default: Goblins at the orchard 90 = Overrun, Skitterers at the flats 50 = Stable). */
  goblins?: bigint;
  skitterers?: bigint;
  /** The orchard's level offset (default 1: target 4, the Goblins read 3..5 there). */
  orchardOffset?: bigint;
  /** Character levels by id. */
  levels?: Record<string, bigint>;
  extra?: Record<string, any[]>;
};

function newCtx(ts: bigint, opts: WorldOpts = {}, sender: any = ALICE) {
  const seed = poolWorld({
    extra: {
      region: [{ id: FAR_REGION_ID, name: 'Far Reach', dangerMultiplier: 100n, regionType: 'wild', biome: 'plains', landmarks: '[]', threats: '[]' }],
      location: [{
        id: FAR_GATE_ID, name: 'Far Gate', description: 'Far Gate.', zone: 'z', regionId: FAR_REGION_ID, levelOffset: 0n,
        isSafe: true, terrainType: 'town', bindStone: false, craftingAvailable: false, shortName: '', placeNoun: '', isHub: false,
      }],
      location_connection: [
        { id: 50n, fromLocationId: ORCHARD_ID, toLocationId: FAR_GATE_ID },
        { id: 51n, fromLocationId: FAR_GATE_ID, toLocationId: ORCHARD_ID },
      ],
      ...(opts.extra ?? {}),
    },
  });
  const at: Record<string, bigint | undefined> = { '1': opts.alice, '2': opts.bob, '3': opts.cara };
  seed.character = seed.character.map((c: any) => ({
    ...c,
    locationId: at[String(c.id)] ?? c.locationId,
    level: opts.levels?.[String(c.id)] ?? c.level,
  }));
  if (opts.orchardOffset !== undefined) {
    seed.location = seed.location.map((l: any) => (l.id === ORCHARD_ID ? { ...l, levelOffset: opts.orchardOffset } : l));
  }
  const ctx = poolCtx(seed, sender, T0);
  const pools = seedPools(ctx);
  setPoolCount(ctx, pools.goblinsOrchard, opts.goblins ?? 90n, T0);
  setPoolCount(ctx, pools.skitterersFlats, opts.skitterers ?? 50n, T0);
  ctx.timestamp = { microsSinceUnixEpoch: ts };
  return ctx;
}

const rows = (ctx: any, table: string): any[] => ctx.db._tables[table] ?? [];
const char = (ctx: any, id: bigint) => rows(ctx, 'character').find((c: any) => c.id === id);
const linesOf = (ctx: any, characterId: bigint) => rows(ctx, 'event_private').filter((e: any) => e.characterId === characterId);
const kindsOf = (ctx: any, characterId: bigint, kinds: string[]) =>
  linesOf(ctx, characterId).filter((e: any) => kinds.includes(e.kind)).map((e: any) => e.kind);
const ofKind = (ctx: any, characterId: bigint, kind: string) =>
  linesOf(ctx, characterId).filter((e: any) => e.kind === kind).map((e: any) => e.message);

/** Whether the travel roll at (place, phase) hits AND draws a group at `ts` in this world. */
function hitsAt(ts: bigint, opts: WorldOpts, placeId: bigint, phase: 'enter' | 'leave', partyLevel: bigint, leaderId = 1n): boolean {
  const probe = newCtx(ts, opts);
  const place = rows(probe, 'location').find((l: any) => l.id === placeId);
  const hit = rollEncounter(probe, { locationId: placeId, isSafe: place.isSafe, partyLevel, phase, leaderId, now: ts });
  if (!hit) return false;
  return drawGroup(probe, { pool: hit.pool, family: hit.family, partyLevel, seed: hit.seed }).length > 0;
}

function scan(pred: (ts: bigint) => boolean, label: string): bigint {
  for (let i = 1n; i < 600n; i += 1n) {
    if (pred(T0 + i)) return T0 + i;
  }
  throw new Error(`no timestamp found: ${label}`);
}

const SOLO_AT_ORCHARD: WorldOpts = { alice: ORCHARD_ID, bob: FLATS_ID };
const SOLO_AT_MARKET: WorldOpts = { alice: MARKET_ID, bob: FLATS_ID };

// ---------------------------------------------------------------------------
// Leave roll
// ---------------------------------------------------------------------------

describe('leaving a non-safe place (phase leave, D-35)', () => {
  it('a hit prints the leave ambush line, starts the fight at the origin and the move does not happen', () => {
    const ts = scan((t) => hitsAt(t, SOLO_AT_ORCHARD, ORCHARD_ID, 'leave', 3n), 'leave hit');
    const ctx = newCtx(ts, SOLO_AT_ORCHARD);
    moveCharacter(ctx, { characterId: 1n, locationId: FAR_GATE_ID });

    expect(char(ctx, 1n).locationId).toBe(ORCHARD_ID);
    expect(char(ctx, 1n).stamina).toBe(50n);
    expect(rows(ctx, 'travel_cooldown')).toHaveLength(0);
    const ambush = ofKind(ctx, 1n, 'ambush');
    expect(ambush).toHaveLength(1);
    expect(ambush[0]).toMatch(/^As you try to leave Glass Orchard, (one goblin charges|(two|three|four) goblins charge) out of the trees!$/);
    const fights = rows(ctx, 'combat_encounter');
    expect(fights).toHaveLength(1);
    expect(fights[0]).toMatchObject({ origin: 'ambush_leave', originFamilyId: GOBLINS_ID, locationId: ORCHARD_ID, originName: 'Goblins' });
    expect(rows(ctx, 'combat_participant').map((p: any) => p.characterId)).toEqual([1n]);
    expect(rows(ctx, 'combat_enemy').every((e: any) => e.poolId > 0n)).toBe(true);
    expect(ofKind(ctx, 1n, 'move')).toEqual([]);
    expect(ofKind(ctx, 1n, 'travel_quiet')).toEqual([]);
    expect(ofKind(ctx, 1n, 'look')).toEqual([]);
  });

  it('performTravel returns false on a leave ambush (deps from the one travelDeps builder)', () => {
    const ts = scan((t) => hitsAt(t, SOLO_AT_ORCHARD, ORCHARD_ID, 'leave', 3n), 'leave hit');
    const ctx = newCtx(ts, SOLO_AT_ORCHARD);
    expect(performTravel(ctx, travelDeps(bag), char(ctx, 1n), FAR_GATE_ID)).toBe(false);
    expect(rows(ctx, 'combat_encounter')).toHaveLength(1);
    expect(char(ctx, 1n).locationId).toBe(ORCHARD_ID);
  });

  it('a miss spends the stamina, starts the cross-region cooldown and moves', () => {
    const ts = scan((t) => !hitsAt(t, SOLO_AT_ORCHARD, ORCHARD_ID, 'leave', 3n), 'leave miss');
    const ctx = newCtx(ts, SOLO_AT_ORCHARD);
    moveCharacter(ctx, { characterId: 1n, locationId: FAR_GATE_ID });
    expect(char(ctx, 1n).locationId).toBe(FAR_GATE_ID);
    expect(char(ctx, 1n).stamina).toBeLessThan(50n);
    expect(rows(ctx, 'travel_cooldown')).toHaveLength(1);
    expect(rows(ctx, 'combat_encounter')).toHaveLength(0);
    expect(ofKind(ctx, 1n, 'ambush')).toEqual([]);
    // Far Gate is safe: the plain travel line, no roll on arrival.
    expect(ofKind(ctx, 1n, 'move')).toEqual(['You travel to Far Gate.']);
  });
});

// ---------------------------------------------------------------------------
// Enter roll
// ---------------------------------------------------------------------------

describe('arriving at a non-safe place (phase enter, D-09, D-32)', () => {
  it('a hit prints the enter ambush line, then the place card, then the fight, with no plain travel line', () => {
    const ts = scan((t) => hitsAt(t, SOLO_AT_MARKET, ORCHARD_ID, 'enter', 3n), 'enter hit');
    const ctx = newCtx(ts, SOLO_AT_MARKET);
    moveCharacter(ctx, { characterId: 1n, locationId: ORCHARD_ID });

    expect(char(ctx, 1n).locationId).toBe(ORCHARD_ID);
    const order = kindsOf(ctx, 1n, ['ambush', 'look', 'combat', 'move', 'travel_quiet']);
    expect(order.slice(0, 3)).toEqual(['ambush', 'look', 'combat']);
    expect(order.filter((k) => k === 'ambush' || k === 'look')).toEqual(['ambush', 'look']);
    expect(ofKind(ctx, 1n, 'ambush')[0]).toMatch(/^As you cross into Glass Orchard, (one goblin charges|(two|three|four) goblins charge) out of the trees!$/);
    expect(ofKind(ctx, 1n, 'combat')[0]).toBe('Combat begins against Goblins.');
    expect(ofKind(ctx, 1n, 'move')).toEqual([]);
    expect(ofKind(ctx, 1n, 'travel_quiet')).toEqual([]);
    const fights = rows(ctx, 'combat_encounter');
    expect(fights).toHaveLength(1);
    expect(fights[0]).toMatchObject({ origin: 'ambush_enter', originFamilyId: GOBLINS_ID, locationId: ORCHARD_ID });
    expect(rows(ctx, 'combat_participant').map((p: any) => p.characterId)).toEqual([1n]);
  });

  it('a miss prints the quiet travel line, then the place card', () => {
    const opts: WorldOpts = { ...SOLO_AT_ORCHARD, goblins: 0n };
    const ts = scan((t) => !hitsAt(t, opts, FLATS_ID, 'enter', 3n), 'enter miss');
    const ctx = newCtx(ts, opts);
    moveCharacter(ctx, { characterId: 1n, locationId: FLATS_ID });

    expect(char(ctx, 1n).locationId).toBe(FLATS_ID);
    expect(kindsOf(ctx, 1n, ['ambush', 'look', 'combat', 'move', 'travel_quiet'])).toEqual(['travel_quiet', 'look']);
    expect(ofKind(ctx, 1n, 'travel_quiet')).toEqual(['You travel to Mother Pan Flats. Nothing follows you. This time.']);
    expect(rows(ctx, 'combat_encounter')).toHaveLength(0);
  });

  it('a safe town never rolls: the plain travel line for every timestamp, even with a dense family pooled there', () => {
    // Goblins wiped at the orchard (no leave roll can hit); an Overrun Goblins pool AT the market.
    for (let i = 1n; i <= 25n; i += 1n) {
      const ctx = newCtx(T0 + i, { ...SOLO_AT_ORCHARD, goblins: 0n });
      const pool = rows(ctx, 'place_pool').find((p: any) => p.refId === GOBLINS_ID);
      ctx.db.place_pool.insert({ ...pool, id: 0n, locationId: MARKET_ID, count: 100n });
      moveCharacter(ctx, { characterId: 1n, locationId: MARKET_ID });
      expect(char(ctx, 1n).locationId).toBe(MARKET_ID);
      expect(ofKind(ctx, 1n, 'move')).toEqual(['You travel to Kestrel Market.']);
      expect(ofKind(ctx, 1n, 'ambush')).toEqual([]);
      expect(ofKind(ctx, 1n, 'travel_quiet')).toEqual([]);
      expect(rows(ctx, 'combat_encounter')).toHaveLength(0);
    }
  });

  it('a safe origin never rolls on leaving', () => {
    for (let i = 1n; i <= 25n; i += 1n) {
      const opts: WorldOpts = { ...SOLO_AT_MARKET, goblins: 0n };
      const ctx = newCtx(T0 + i, opts);
      const pool = rows(ctx, 'place_pool').find((p: any) => p.refId === GOBLINS_ID);
      ctx.db.place_pool.insert({ ...pool, id: 0n, locationId: MARKET_ID, count: 100n });
      moveCharacter(ctx, { characterId: 1n, locationId: ORCHARD_ID });
      expect(char(ctx, 1n).locationId).toBe(ORCHARD_ID);
      expect(ofKind(ctx, 1n, 'ambush')).toEqual([]);
      expect(rows(ctx, 'combat_encounter')).toHaveLength(0);
    }
  });

  it('the enter roll is skipped when a traveller auto-joins an active group fight at the destination', () => {
    const ts = scan((t) => hitsAt(t, { ...SOLO_AT_MARKET, bob: ORCHARD_ID }, ORCHARD_ID, 'enter', 3n), 'enter hit (auto-join)');
    const ctx = newCtx(ts, {
      ...SOLO_AT_MARKET,
      bob: ORCHARD_ID,
      extra: {
        combat_encounter: [{
          id: 900n, locationId: ORCHARD_ID, groupId: GROUP_ID, leaderCharacterId: 2n, state: 'active', addCount: 0n,
          pendingAddCount: 0n, pendingAddAtMicros: undefined, createdAt: { microsSinceUnixEpoch: T0 },
          origin: '', originFamilyId: 0n, originLevel: 0n, originName: 'Goblin Brute', originPlural: '',
        }],
        combat_participant: [{ id: 900n, combatId: 900n, characterId: 2n, status: 'active', nextAutoAttackAt: 0n }],
        combat_enemy: [{
          id: 900n, combatId: 900n, spawnId: 0n, poolId: 0n, enemyTemplateId: 101n, displayName: 'Goblin Brute',
          currentHp: 40n, maxHp: 40n, attackDamage: 5n, armorClass: 0n, level: 3n, healTargetEnemyId: 0n,
        }],
      },
    });
    moveCharacter(ctx, { characterId: 1n, locationId: ORCHARD_ID });

    expect(char(ctx, 1n).locationId).toBe(ORCHARD_ID);
    expect(rows(ctx, 'combat_encounter')).toHaveLength(1);
    expect(rows(ctx, 'combat_participant').filter((p: any) => p.combatId === 900n).map((p: any) => p.characterId).sort()).toEqual([1n, 2n]);
    expect(ofKind(ctx, 1n, 'ambush')).toEqual([]);
    expect(ofKind(ctx, 1n, 'travel_quiet')).toEqual([]);
    expect(ofKind(ctx, 1n, 'move')).toEqual(['You travel to Glass Orchard.']);
    expect(ofKind(ctx, 1n, 'look')).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------
// The party rule
// ---------------------------------------------------------------------------

describe('a travelling party rolls once, by its lowest level (D-14, D-56)', () => {
  // Alice (leader, L3) and Bob (following, L6) at the market; Cara (offline, following) there too.
  // The orchard at offset 5 (target 8): the Goblins read up to L8 there, 5 above Alice, 2 above Bob.
  const PARTY: WorldOpts = { alice: MARKET_ID, bob: MARKET_ID, cara: MARKET_ID, orchardOffset: 5n };

  it('a hit pulls in the travellers only, with the party wording, sized by the lowest level', () => {
    const ts = scan((t) => hitsAt(t, PARTY, ORCHARD_ID, 'enter', 3n), 'party enter hit');
    const ctx = newCtx(ts, PARTY);
    moveCharacter(ctx, { characterId: 1n, locationId: ORCHARD_ID });

    expect(char(ctx, 1n).locationId).toBe(ORCHARD_ID);
    expect(char(ctx, 2n).locationId).toBe(ORCHARD_ID);
    expect(char(ctx, 3n).locationId).toBe(MARKET_ID);
    const fights = rows(ctx, 'combat_encounter');
    expect(fights).toHaveLength(1);
    expect(fights[0]).toMatchObject({ origin: 'ambush_enter', groupId: GROUP_ID });
    expect(rows(ctx, 'combat_participant').map((p: any) => p.characterId).sort()).toEqual([1n, 2n]);
    for (const id of [1n, 2n]) {
      expect(ofKind(ctx, id, 'ambush')).toHaveLength(1);
      expect(ofKind(ctx, id, 'ambush')[0]).toMatch(/^As your party crosses into Glass Orchard, /);
      expect(kindsOf(ctx, id, ['ambush', 'look', 'move', 'travel_quiet']).slice(0, 2)).toEqual(['ambush', 'look']);
    }
    expect(linesOf(ctx, 3n)).toEqual([]);

    // The group size uses level 3 (gap 5: one fewer), not Bob's 6 (gap 2).
    const seed = encounterSeed(ts, 1n, ORCHARD_ID, 'enter');
    const enemies = rows(ctx, 'combat_enemy');
    expect(enemies.length).toBe(groupSizeFor(3, 8 - 3, seed));
    expect(enemies.length).toBe(groupSizeFor(3, 8 - 6, seed) - 1);
  });

  it('a miss gives both travellers the party quiet line', () => {
    const ts = scan((t) => !hitsAt(t, PARTY, ORCHARD_ID, 'enter', 3n), 'party enter miss');
    const ctx = newCtx(ts, PARTY);
    moveCharacter(ctx, { characterId: 1n, locationId: ORCHARD_ID });
    for (const id of [1n, 2n]) {
      expect(ofKind(ctx, id, 'travel_quiet')).toEqual(['Your party travels to Glass Orchard. Nothing follows you. This time.']);
    }
    expect(rows(ctx, 'combat_encounter')).toHaveLength(0);
  });

  it('a party leave ambush keeps everyone at the origin, spends nothing, and uses the party wording', () => {
    const opts: WorldOpts = { alice: ORCHARD_ID, bob: ORCHARD_ID, cara: ORCHARD_ID };
    const ts = scan((t) => hitsAt(t, opts, ORCHARD_ID, 'leave', 3n), 'party leave hit');
    const ctx = newCtx(ts, opts);
    moveCharacter(ctx, { characterId: 1n, locationId: FAR_GATE_ID });
    for (const id of [1n, 2n]) {
      expect(char(ctx, id).locationId).toBe(ORCHARD_ID);
      expect(char(ctx, id).stamina).toBe(50n);
      expect(ofKind(ctx, id, 'ambush')[0]).toMatch(/^As your party tries to leave Glass Orchard, /);
    }
    expect(rows(ctx, 'travel_cooldown')).toHaveLength(0);
    expect(rows(ctx, 'combat_participant').map((p: any) => p.characterId).sort()).toEqual([1n, 2n]);
    expect(linesOf(ctx, 3n)).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// Determinism
// ---------------------------------------------------------------------------

describe('the roll is seeded (deterministic)', () => {
  const snapshot = (ctx: any) => ({
    at: char(ctx, 1n).locationId,
    fights: rows(ctx, 'combat_encounter').map((c: any) => [c.origin, c.originFamilyId]),
    enemies: rows(ctx, 'combat_enemy').map((e: any) => e.enemyTemplateId),
    lines: linesOf(ctx, 1n).map((e: any) => [e.kind, e.message]),
  });

  it('the same timestamp gives the same outcome', () => {
    for (let i = 1n; i <= 10n; i += 1n) {
      const a = newCtx(T0 + i, SOLO_AT_MARKET);
      moveCharacter(a, { characterId: 1n, locationId: ORCHARD_ID });
      const b = newCtx(T0 + i, SOLO_AT_MARKET);
      moveCharacter(b, { characterId: 1n, locationId: ORCHARD_ID });
      expect(snapshot(b)).toEqual(snapshot(a));
    }
  });

  it('a different leader at the same timestamp can differ', () => {
    // Alice and Bob both L3, each travelling alone from the market (the other one elsewhere).
    const levels = { '2': 3n };
    const aliceOpts: WorldOpts = { alice: MARKET_ID, bob: FLATS_ID, levels };
    const bobOpts: WorldOpts = { alice: FLATS_ID, bob: MARKET_ID, levels };
    const ts = scan(
      (t) => hitsAt(t, aliceOpts, ORCHARD_ID, 'enter', 3n, 1n) && !hitsAt(t, bobOpts, ORCHARD_ID, 'enter', 3n, 2n),
      'leader 1 hits, leader 2 misses',
    );
    const a = newCtx(ts, aliceOpts);
    moveCharacter(a, { characterId: 1n, locationId: ORCHARD_ID });
    const b = newCtx(ts, bobOpts, BOB);
    moveCharacter(b, { characterId: 2n, locationId: ORCHARD_ID });
    expect(rows(a, 'combat_encounter')).toHaveLength(1);
    expect(rows(b, 'combat_encounter')).toHaveLength(0);
    expect(ofKind(b, 2n, 'travel_quiet')).toEqual(['You travel to Glass Orchard. Nothing follows you. This time.']);
  });
});

describe('fixture sanity', () => {
  it('the pool world is region 1 with the Goblins at the orchard', () => {
    const ctx = newCtx(T0 + 1n);
    expect(rows(ctx, 'place_pool').some((p: any) => p.regionId === REGION_ID && p.locationId === ORCHARD_ID && p.refId === GOBLINS_ID)).toBe(true);
  });
});
