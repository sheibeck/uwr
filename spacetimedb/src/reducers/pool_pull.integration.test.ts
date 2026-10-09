/**
 * Phase 51.3.1.1 Plan 11 (SC3, D-11, D-12, D-32, D-56): pulling a family. The REAL pull_family
 * reducer (reducers/pools.ts, captured from index.ts) draws a group from the family's pool at the
 * character's place and starts the fight at once, on the shared pool world (helpers/pool_fixture.ts):
 *   - the group is sized by density (Scarce 1, Stable 1-2, Overrun 2-4), slot 0 a tank or damage
 *     member, trimmed when the family is 4+ levels above the party's LOWEST member;
 *   - the fight row records origin 'pull' with the pull-time density level, and the roster reads
 *     the lead-in "You make some noise. {Count} {noun} answer(s).";
 *   - every refusal is a visible fail() line and starts nothing; a foreign character id throws.
 * Task 3 adds the retired careful pull: start_combat without the spawn fallback, start_pull at once,
 * resolve_pull draining.
 */
import { describe, it, expect, vi, beforeAll } from 'vitest';
import { capturedReducer } from '../helpers/schema_recorder';
import {
  T0,
  MODULE,
  ALICE,
  REGION_ID,
  ORCHARD_ID,
  MARKET_ID,
  GOBLINS_ID,
  poolWorld,
  poolCtx,
  seedPools,
} from '../helpers/pool_fixture';
import { setPoolCount, createPool } from '../helpers/pools';
import { drawForPull } from '../helpers/encounters';
import { pullLeadIn, pullRefusal } from '../data/density_lines';

vi.mock('spacetimedb/server', async () =>
  (await import('../helpers/schema_recorder')).createRecordingServerMock(),
);

const handlers: Record<string, (...args: any[]) => any> = {};
let PULL_REFUSALS: Record<string, string>;

beforeAll(async () => {
  await import('../index');
  for (const name of ['pull_family', 'start_combat', 'start_pull', 'resolve_pull']) {
    const h = capturedReducer(name);
    if (typeof h !== 'function') {
      throw new Error(`capturedReducer('${name}') is not a function: STOP and report; never edit production code to fix this.`);
    }
    handlers[name] = h;
  }
  ({ PULL_REFUSALS } = await import('./pools'));
}, 120_000);

const rows = (ctx: any, table: string): any[] => ctx.db._tables[table] ?? [];
const family = (ctx: any, id: bigint) => rows(ctx, 'creature_family').find((f: any) => f.id === id);
const feed = (ctx: any, characterId: bigint): string[] =>
  rows(ctx, 'event_private').filter((e: any) => e.characterId === characterId).map((e: any) => e.message);
const ROLE_OF: Record<string, string> = { '101': 'tank', '102': 'damage', '103': 'healer', '104': 'caster' };

/** The pool world at `ts` with Alice as sender; the Goblins pool optionally set to a count. */
function world(goblinCount?: bigint, ts: bigint = T0, mutate?: (seed: Record<string, any[]>) => void) {
  const seed = poolWorld();
  mutate?.(seed);
  const ctx = poolCtx(seed, ALICE, T0);
  const pools = seedPools(ctx);
  let goblins = pools.goblinsOrchard;
  if (goblinCount !== undefined) goblins = setPoolCount(ctx, goblins, goblinCount, T0).pool;
  ctx.timestamp = { microsSinceUnixEpoch: ts };
  return { ctx, goblins, pools };
}

const pull = (ctx: any, poolId: bigint, characterId = 1n) => handlers.pull_family(ctx, { characterId, poolId });

describe('pull_family draws a group sized by density (D-11, D-12)', () => {
  it('a Stable family sends 1-2 goblins; the fight records origin pull at level 2 and the roster reads the lead-in', () => {
    const { ctx, goblins } = world();
    pull(ctx, goblins.id);

    const fights = rows(ctx, 'combat_encounter');
    expect(fights).toHaveLength(1);
    expect(fights[0]).toMatchObject({ origin: 'pull', originLevel: 2n, originName: 'Goblins', originPlural: 'goblins', originFamilyId: GOBLINS_ID });
    const enemies = rows(ctx, 'combat_enemy');
    expect(enemies.length === 1 || enemies.length === 2).toBe(true);
    for (const e of enemies) expect(e.poolId).toBe(goblins.id);

    const lead = pullLeadIn(enemies.length, 'goblin', 'goblins');
    expect(['You make some noise. One goblin answers.', 'You make some noise. Two goblins answer.']).toContain(lead);
    expect(feed(ctx, 1n)).toContain(lead);
    expect(feed(ctx, 2n)).toContain(lead); // Bob is grouped, online and here
    expect(feed(ctx, 1n).indexOf(lead)).toBeLessThan(feed(ctx, 1n).indexOf('Combat begins against Goblins.'));
  });

  it('an Overrun family sends 2-4 with slot 0 a tank or damage member', () => {
    for (let i = 0n; i < 12n; i += 1n) {
      const { ctx, goblins } = world(90n, T0 + i);
      pull(ctx, goblins.id);
      const enemies = rows(ctx, 'combat_enemy');
      expect(enemies.length).toBeGreaterThanOrEqual(2);
      expect(enemies.length).toBeLessThanOrEqual(4);
      expect(['tank', 'damage']).toContain(ROLE_OF[enemies[0].enemyTemplateId.toString()]);
      expect(rows(ctx, 'combat_encounter')[0].originLevel).toBe(3n);
    }
  });

  it('the trim uses the lowest roster member (Alice L1 with Bob L6); offline Cara never joins', () => {
    const lowAlice = (seed: Record<string, any[]>) => {
      seed.character = seed.character.map((c: any) => (c.id === 1n ? { ...c, level: 1n } : c));
    };
    let differs = 0;
    for (let i = 0n; i < 12n; i += 1n) {
      const ts = T0 + i;
      const probe = world(90n, ts, lowAlice);
      const expected = drawForPull(probe.ctx, probe.goblins, family(probe.ctx, GOBLINS_ID), 1n, 1n, ts);
      const strong = drawForPull(probe.ctx, probe.goblins, family(probe.ctx, GOBLINS_ID), 6n, 1n, ts);
      if (strong.length !== expected.length) differs += 1;

      const { ctx, goblins } = world(90n, ts, lowAlice);
      pull(ctx, goblins.id);
      expect(rows(ctx, 'combat_enemy').map((e: any) => e.enemyTemplateId)).toEqual(expected.map((d) => d.enemyTemplateId));
      expect(rows(ctx, 'combat_participant').map((p: any) => p.characterId).sort()).toEqual([1n, 2n]);
    }
    expect(differs).toBeGreaterThan(0);
  });
});

describe('pull_family refusals start nothing (T-51.3.1.1-33, T-51.3.1.1-34)', () => {
  const nothingStarted = (ctx: any) => {
    expect(rows(ctx, 'combat_encounter')).toHaveLength(0);
    expect(rows(ctx, 'combat_enemy')).toHaveLength(0);
  };

  it('a pool at another place', () => {
    const { ctx, pools } = world();
    pull(ctx, pools.skitterersFlats.id);
    expect(feed(ctx, 1n)).toContain(PULL_REFUSALS.notHere);
    nothingStarted(ctx);
  });

  it('a pool that does not exist', () => {
    const { ctx } = world();
    pull(ctx, 999n);
    expect(feed(ctx, 1n)).toContain(PULL_REFUSALS.notHere);
    nothingStarted(ctx);
  });

  it('a resource pool', () => {
    const { ctx, pools } = world();
    pull(ctx, pools.ironOrchard.id);
    expect(feed(ctx, 1n)).toContain(PULL_REFUSALS.notHere);
    nothingStarted(ctx);
  });

  it('a safe place', () => {
    const { ctx } = world(undefined, T0, (seed) => {
      seed.character = seed.character.map((c: any) => (c.id === 1n ? { ...c, locationId: MARKET_ID } : c));
    });
    const marketPool = createPool(ctx, { regionId: REGION_ID, locationId: MARKET_ID, kind: 'creature', refId: GOBLINS_ID, homeLevel: 2 }, T0);
    pull(ctx, marketPool.id);
    expect(feed(ctx, 1n)).toContain(PULL_REFUSALS.safe);
    nothingStarted(ctx);
  });

  it('a wiped-out family', () => {
    const { ctx, goblins } = world(0n);
    pull(ctx, goblins.id);
    expect(feed(ctx, 1n)).toContain(pullRefusal('goblins'));
    expect(feed(ctx, 1n)).toContain('There are no goblins here to pull.');
    nothingStarted(ctx);
  });

  it('Alice is already in a fight', () => {
    const { ctx, goblins } = world();
    pull(ctx, goblins.id);
    expect(rows(ctx, 'combat_encounter')).toHaveLength(1);
    const enemies = rows(ctx, 'combat_enemy').length;
    pull(ctx, goblins.id);
    expect(feed(ctx, 1n)).toContain(PULL_REFUSALS.fighting);
    expect(rows(ctx, 'combat_encounter')).toHaveLength(1);
    expect(rows(ctx, 'combat_enemy')).toHaveLength(enemies);
  });

  it('Alice is gathering', () => {
    const { ctx, goblins } = world(undefined, T0, (seed) => {
      seed.resource_gather = [{ id: 1n, characterId: 1n, nodeId: 0n, endsAtMicros: T0 + 1_000_000n, poolId: 0n }];
    });
    pull(ctx, goblins.id);
    expect(feed(ctx, 1n)).toContain(PULL_REFUSALS.gathering);
    nothingStarted(ctx);
  });

  it("someone else's character id throws before anything is read", () => {
    const { ctx, goblins } = world();
    expect(() => pull(ctx, goblins.id, 2n)).toThrow(/Not your character/);
    nothingStarted(ctx);
  });

  it('the refusal lines are visible fail() lines of kind combat', () => {
    const { ctx, pools } = world();
    pull(ctx, pools.ironOrchard.id);
    const line = rows(ctx, 'event_private').find((e: any) => e.message === PULL_REFUSALS.notHere);
    expect(line).toMatchObject({ characterId: 1n, ownerUserId: 7n, kind: 'combat' });
  });
});

