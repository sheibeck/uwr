/**
 * Phase 51.3.1.1 Plan 10 (SC4, D-16, D-17, Pitfall 3): kills deplete their pool exactly once, when
 * the fight ends, whatever way it ends. A fight is started with the real startCombat from a drawn
 * group of Goblins (pool_fixture), then closed through the real captured reducers: victory and defeat
 * (resolve_round_timer), end_combat (admin) and the failure close (a reward path that throws).
 * Depletion per kill is DENSITY_RULES.DEPLETION_BY_ROLE: tank 8, caster 7, healer 6, damage 5.
 */
import { describe, it, expect, vi, beforeAll, afterEach } from 'vitest';
import { capturedReducer } from '../helpers/schema_recorder';
import {
  T0,
  MODULE,
  GOBLINS_ID,
  ORCHARD_ID,
  poolWorld,
  poolCtx,
  seedPools,
} from '../helpers/pool_fixture';
import { openTickArg } from '../helpers/combat_fight_fixture';

vi.mock('spacetimedb/server', async () =>
  (await import('../helpers/schema_recorder')).createRecordingServerMock(),
);

const ADMIN = { toHexString: () => 'c200252497b98fff5aab75f8fbc675956b5a12a5b85042ab355d3a05c6ab7d6e' };
const TEN_S = 10_000_000n;

const handlers: Record<string, (...args: any[]) => any> = {};
let startCombat: any;
let startCombatForSpawn: any;
let settlePoolKills: any;
let deps: any;

beforeAll(async () => {
  await import('../index');
  for (const name of ['resolve_round_timer', 'end_combat']) {
    const h = capturedReducer(name);
    if (typeof h !== 'function') {
      throw new Error(`capturedReducer('${name}') is not a function: STOP and report; never edit production code to fix this.`);
    }
    handlers[name] = h;
  }
  ({ startCombat, startCombatForSpawn } = await import('./combat'));
  ({ settlePoolKills } = await import('../helpers/pools'));
  const { computeEnemyStats } = await import('../helpers/combat_enemies');
  const { appendPrivateEvent } = await import('../helpers/events');
  deps = { SenderError: Error, computeEnemyStats, appendPrivateEvent };
}, 120_000);

afterEach(() => {
  vi.restoreAllMocks();
});

const rows = (ctx: any, table: string): any[] => ctx.db._tables[table] ?? [];
const char = (ctx: any, id: bigint) => rows(ctx, 'character').find((c: any) => c.id === id);
const poolCount = (ctx: any, poolId: bigint): bigint => rows(ctx, 'place_pool').find((p: any) => p.id === poolId).count;

const TANK = 101n;
const DAMAGE = 102n;
const HEALER = 103n;
const CASTER = 104n;

/** The pool world with its pools, at T0, plus the Goblins pool row. */
function world(opts: Parameters<typeof poolWorld>[0] = {}, sender: any = MODULE) {
  const ctx = poolCtx(poolWorld(opts), sender, T0);
  const pools = seedPools(ctx);
  return { ctx, goblins: pools.goblinsOrchard };
}

/** A Goblins pull fight for `leaderId` (alone), with the listed member templates drawn from `poolId`. */
function startPoolFight(ctx: any, poolId: bigint, templateIds: bigint[], leaderId = 1n) {
  const leader = char(ctx, leaderId);
  return startCombat(
    deps,
    ctx,
    leader,
    [leader],
    null,
    templateIds.map((enemyTemplateId) => ({ enemyTemplateId, level: 4n, spawnId: 0n, poolId })),
    { kind: 'pull', familyId: GOBLINS_ID, level: 2, name: 'Goblins', plural: 'goblins' },
  );
}

/** Sets the HP of the fight's enemies of the given templates to 0 (dead) and the rest as given. */
function kill(ctx: any, combatId: bigint, templateIds: bigint[]) {
  ctx.db._tables.combat_enemy = rows(ctx, 'combat_enemy').map((e: any) =>
    e.combatId === combatId && templateIds.includes(e.enemyTemplateId) ? { ...e, currentHp: 0n } : e,
  );
}

/** Resolve the fight's open round the way the scheduler does, at T0 + 10 s. */
function fire(ctx: any, combatId: bigint) {
  const tick = openTickArg(ctx, combatId);
  ctx.sender = MODULE;
  ctx.timestamp = { microsSinceUnixEpoch: T0 + TEN_S };
  handlers.resolve_round_timer(ctx, tick);
  const table = ctx.db._tables.round_timer_tick ?? [];
  const idx = table.findIndex((r: any) => r.scheduledId === tick.arg.scheduledId);
  if (idx >= 0) table.splice(idx, 1);
}

/** The db with one table that throws when touched (after `when()` holds, if given). */
function breakTable(ctx: any, tableName: string, when: () => boolean = () => true) {
  const real = ctx.db;
  ctx.db = new Proxy(real, {
    get(target, prop, receiver) {
      if (prop === tableName && when()) throw new Error('injected failure');
      return Reflect.get(target, prop, receiver);
    },
  });
}

const resolved = (ctx: any, combatId: bigint) =>
  rows(ctx, 'combat_encounter').find((c: any) => c.id === combatId).state === 'resolved';

describe('kills settle against their pool when the fight ends (D-16, Pitfall 3)', () => {
  it('a won fight against a tank and a damage member depletes the pool by 8 + 5 = 13', () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    const { ctx, goblins } = world();
    const combat = startPoolFight(ctx, goblins.id, [TANK, DAMAGE]);
    expect(poolCount(ctx, goblins.id)).toBe(50n);
    kill(ctx, combat.id, [TANK, DAMAGE]);
    fire(ctx, combat.id);
    expect(resolved(ctx, combat.id)).toBe(true);
    expect(error).not.toHaveBeenCalledWith(expect.stringContaining('victory failed'));
    expect(poolCount(ctx, goblins.id)).toBe(37n);
    expect(rows(ctx, 'combat_enemy')).toHaveLength(0);
  });

  it('a lost fight with one of three enemies dead depletes only that kill (healer 6)', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const { ctx, goblins } = world();
    const combat = startPoolFight(ctx, goblins.id, [TANK, DAMAGE, HEALER]);
    kill(ctx, combat.id, [HEALER]);
    ctx.db._tables.character = rows(ctx, 'character').map((c: any) => (c.id === 1n ? { ...c, hp: 0n } : c));
    fire(ctx, combat.id);
    expect(resolved(ctx, combat.id)).toBe(true);
    expect(poolCount(ctx, goblins.id)).toBe(44n);
  });

  it('end_combat with no kills depletes nothing', () => {
    const { ctx, goblins } = world();
    ctx.db._tables.player = rows(ctx, 'player').map((p: any) => (p.userId === 7n ? { ...p, id: ADMIN } : p));
    const combat = startPoolFight(ctx, goblins.id, [TANK, DAMAGE]);
    ctx.sender = ADMIN;
    handlers.end_combat(ctx, { characterId: 1n });
    expect(resolved(ctx, combat.id)).toBe(true);
    expect(poolCount(ctx, goblins.id)).toBe(50n);
  });

  it('end_combat with one kill depletes that kill (damage 5)', () => {
    const { ctx, goblins } = world();
    ctx.db._tables.player = rows(ctx, 'player').map((p: any) => (p.userId === 7n ? { ...p, id: ADMIN } : p));
    const combat = startPoolFight(ctx, goblins.id, [TANK, DAMAGE]);
    kill(ctx, combat.id, [DAMAGE]);
    ctx.sender = ADMIN;
    handlers.end_combat(ctx, { characterId: 1n });
    expect(resolved(ctx, combat.id)).toBe(true);
    expect(poolCount(ctx, goblins.id)).toBe(45n);
  });

  it('the failure close (a victory whose reward path throws) settles the dead once', () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    const { ctx, goblins } = world();
    const combat = startPoolFight(ctx, goblins.id, [TANK, CASTER]);
    kill(ctx, combat.id, [TANK, CASTER]);
    breakTable(ctx, 'combat_loot');
    fire(ctx, combat.id);
    expect(error).toHaveBeenCalledWith(expect.stringContaining('resolveRound: victory failed in combat'));
    expect(resolved(ctx, combat.id)).toBe(true);
    expect(rows(ctx, 'combat_enemy')).toHaveLength(0);
    expect(poolCount(ctx, goblins.id)).toBe(50n - 8n - 7n);
  });

  it('a victory that fails after its own cleanup: the second clear finds no rows and depletes nothing more', () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    const { ctx, goblins } = world();
    const combat = startPoolFight(ctx, goblins.id, [TANK, DAMAGE]);
    kill(ctx, combat.id, [TANK, DAMAGE]);
    // renown is written after clearCombatArtifacts: break it only once the fight's enemies are gone.
    breakTable(ctx, 'renown', () => rows(ctx, 'combat_enemy').length === 0);
    fire(ctx, combat.id);
    expect(error).toHaveBeenCalledWith(expect.stringContaining('resolveRound: victory failed in combat'));
    expect(resolved(ctx, combat.id)).toBe(true);
    expect(poolCount(ctx, goblins.id)).toBe(37n);
  });

  it('a cleanup that fails after settling, then the failure close: the kills deplete the pool once (review B WR-03)', () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    const { ctx, goblins } = world();
    const combat = startPoolFight(ctx, goblins.id, [TANK, DAMAGE]);
    kill(ctx, combat.id, [TANK, DAMAGE]);
    // aggro_entry is deleted in clearCombatArtifacts after the settle and before the combat_enemy
    // deletes: throw there once, after the pool dropped, while the killed rows still exist.
    let thrown = false;
    breakTable(ctx, 'aggro_entry', () => {
      if (thrown || poolCount(ctx, goblins.id) === 50n || rows(ctx, 'combat_enemy').length === 0) return false;
      thrown = true;
      return true;
    });
    fire(ctx, combat.id);
    expect(thrown).toBe(true);
    expect(error).toHaveBeenCalledWith(expect.stringContaining('resolveRound: victory failed in combat'));
    expect(resolved(ctx, combat.id)).toBe(true);
    expect(rows(ctx, 'combat_enemy')).toHaveLength(0);
    expect(poolCount(ctx, goblins.id)).toBe(50n - 8n - 5n);
  });

  it('one pool that fails to settle does not lose the depletion of the other pools of the fight (review 2 IN-01)', () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    const { ctx, goblins } = world();
    const skitterers = rows(ctx, 'place_pool').find((p: any) => p.kind === 'creature' && p.id !== goblins.id);
    const combat = startPoolFight(ctx, goblins.id, [TANK, DAMAGE]);
    kill(ctx, combat.id, [TANK, DAMAGE]);
    // The damage kill came from the second pool: the fight touches two pools.
    ctx.db._tables.combat_enemy = rows(ctx, 'combat_enemy').map((e: any) =>
      e.combatId === combat.id && e.enemyTemplateId === DAMAGE ? { ...e, poolId: skitterers.id } : e,
    );
    const first = goblins.id < skitterers.id ? goblins : skitterers;
    const second = first === goblins ? skitterers : goblins;
    const secondPoints = first === goblins ? 5n : 8n;
    const secondBefore = poolCount(ctx, second.id);
    const firstBefore = poolCount(ctx, first.id);
    // The first pool in id order throws when it is looked up for its write.
    const real = ctx.db;
    const failingPools = new Proxy(real.place_pool, {
      get(target, prop) {
        if (prop !== 'id') return Reflect.get(target, prop);
        const index = Reflect.get(target, prop);
        return new Proxy(index, {
          get(ix, key) {
            const value = Reflect.get(ix, key);
            if (key !== 'find') return typeof value === 'function' ? value.bind(ix) : value;
            return (id: bigint) => {
              if (id === first.id) throw new Error('injected pool failure');
              return value.call(ix, id);
            };
          },
        });
      },
    });
    ctx.db = new Proxy(real, { get: (target, prop) => (prop === 'place_pool' ? failingPools : Reflect.get(target, prop)) });

    expect(() => settlePoolKills(ctx, combat.id, T0 + TEN_S)).not.toThrow();
    ctx.db = real;
    expect(error).toHaveBeenCalledWith(expect.stringContaining(`settlePoolKills: pool ${first.id}`));
    expect(poolCount(ctx, second.id)).toBe(secondBefore - secondPoints);
    expect(poolCount(ctx, first.id)).toBe(firstBefore);
    // Every counted kill was unlinked, so a second settle depletes nothing (no double count).
    expect(rows(ctx, 'combat_enemy').filter((e: any) => e.combatId === combat.id).map((e: any) => e.poolId)).toEqual([0n, 0n]);
    settlePoolKills(ctx, combat.id, T0 + TEN_S);
    expect(poolCount(ctx, second.id)).toBe(secondBefore - secondPoints);
    expect(poolCount(ctx, first.id)).toBe(firstBefore);
  });

  it('startCombat refuses an empty draw: null, and no encounter, participant or tick is written (review B IN-06)', () => {
    const { ctx } = world();
    const leader = char(ctx, 1n);
    const before = {
      encounters: rows(ctx, 'combat_encounter').length,
      participants: rows(ctx, 'combat_participant').length,
      ticks: (ctx.db._tables.round_timer_tick ?? []).length,
    };
    const result = startCombat(deps, ctx, leader, [leader], null, [], { kind: 'pull', familyId: GOBLINS_ID, level: 2, name: 'Goblins', plural: 'goblins' });
    expect(result).toBeNull();
    expect({
      encounters: rows(ctx, 'combat_encounter').length,
      participants: rows(ctx, 'combat_participant').length,
      ticks: (ctx.db._tables.round_timer_tick ?? []).length,
    }).toEqual(before);
  });

  it('a named or event fight (poolId 0) changes no pool, and its spawn writes no respawn tick', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const { ctx, goblins } = world({
      extra: {
        enemy_spawn: [
          { id: 90n, locationId: ORCHARD_ID, enemyTemplateId: TANK, name: 'Goblin Brute', state: 'available', lockedCombatId: undefined, groupCount: 1n, level: 4n },
        ],
      },
    });
    const leader = char(ctx, 1n);
    const combat = startCombatForSpawn(deps, ctx, leader, rows(ctx, 'enemy_spawn')[0], [leader], null);
    expect(rows(ctx, 'combat_enemy').map((e: any) => [e.spawnId, e.poolId])).toEqual([[90n, 0n]]);
    kill(ctx, combat.id, [TANK]);
    fire(ctx, combat.id);
    expect(resolved(ctx, combat.id)).toBe(true);
    expect(poolCount(ctx, goblins.id)).toBe(50n);
    expect(rows(ctx, 'enemy_respawn_tick')).toEqual([]);
  });

  it('pool enemies (spawnId 0n) are skipped by the spawn reset: no spawn row, no respawn tick', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const { ctx, goblins } = world();
    const combat = startPoolFight(ctx, goblins.id, [TANK]);
    kill(ctx, combat.id, [TANK]);
    fire(ctx, combat.id);
    expect(rows(ctx, 'enemy_spawn')).toEqual([]);
    expect(rows(ctx, 'enemy_respawn_tick')).toEqual([]);
    expect(poolCount(ctx, goblins.id)).toBe(42n);
  });

  it('two fights drawing the same pool at once both settle, and the count clamps at 0 (no reservation)', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const { ctx, goblins } = world({ noRelations: true });
    const all = [TANK, DAMAGE, HEALER, CASTER]; // 26 points a fight
    const first = startPoolFight(ctx, goblins.id, all, 1n);
    const second = startPoolFight(ctx, goblins.id, all, 2n);
    expect(first.id).not.toBe(second.id);
    kill(ctx, first.id, all);
    kill(ctx, second.id, all);
    fire(ctx, first.id);
    expect(poolCount(ctx, goblins.id)).toBe(24n);
    fire(ctx, second.id);
    expect(resolved(ctx, first.id) && resolved(ctx, second.id)).toBe(true);
    expect(poolCount(ctx, goblins.id)).toBe(0n);
  });
});
