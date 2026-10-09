/**
 * Phase 51.3.1.1 Plan 11 (D-10, D-11, D-13, D-56): the one encounter layer (helpers/encounters.ts).
 * Every encounter (a pull, a travel ambush, a gather ambush, the quest-item ambush) rolls and draws
 * here: a seeded roll over the creature pools of a place, then a group drawn from the hit family,
 * then the fight start with its lead-in or ambush line. Runs on the shared pool world
 * (helpers/pool_fixture.ts) on a strict mock db.
 */
import { describe, it, expect, vi, beforeAll } from 'vitest';
// @ts-ignore node types are not part of this module's tsconfig (same as other source-reading tests)
import { readFileSync } from 'node:fs';
import { placeSpawnLevel } from '../data/enemy_rules';
import { DENSITY_RULES, encounterSeed, questTargetHit, pickQuestTarget } from '../data/density_rules';
import { computeLocationTargetLevel } from './location';
import {
  T0,
  ORCHARD_ID,
  FLATS_ID,
  MARKET_ID,
  REGION_ID,
  GOBLINS_ID,
  poolWorld,
  poolCtx,
  seedPools,
} from './pool_fixture';
import { setPoolCount, createPool } from './pools';
import {
  creaturePoolsHere,
  rosterLevel,
  rollEncounter,
  drawGroup,
  drawForPull,
  startPoolFight,
  activeKillTargets,
} from './encounters';

vi.mock('spacetimedb/server', async () =>
  (await import('./schema_recorder')).createRecordingServerMock(),
);

beforeAll(async () => {
  await import('../schema/tables');
});

const rows = (ctx: any, table: string): any[] => ctx.db._tables[table] ?? [];
const char = (ctx: any, id: bigint) => rows(ctx, 'character').find((c: any) => c.id === id);
const family = (ctx: any, id: bigint) => rows(ctx, 'creature_family').find((f: any) => f.id === id);
const template = (ctx: any, id: bigint) => rows(ctx, 'enemy_template').find((t: any) => t.id === id);

const GOBLIN_TEMPLATES = [101n, 102n, 103n, 104n];
const ROLE_OF: Record<string, string> = { '101': 'tank', '102': 'damage', '103': 'healer', '104': 'caster' };

/** The pool world with its standard pools; the Goblins pool optionally set to a count. */
function world(goblinCount?: bigint, opts: Parameters<typeof poolWorld>[0] = {}) {
  const ctx = poolCtx(poolWorld(opts), undefined, T0);
  const pools = seedPools(ctx);
  let goblins = pools.goblinsOrchard;
  let skitterers = pools.skitterersFlats;
  if (goblinCount !== undefined) goblins = setPoolCount(ctx, goblins, goblinCount, T0).pool;
  return { ctx, goblins, skitterers, pools };
}

/** The level a Goblins member fights at in the orchard. */
function orchardLevel(ctx: any, templateId: bigint): bigint {
  const location = rows(ctx, 'location').find((l: any) => l.id === ORCHARD_ID);
  const target = computeLocationTargetLevel(ctx, ORCHARD_ID, 1n);
  return placeSpawnLevel(template(ctx, templateId).level, target, location.levelOffset);
}

describe('creaturePoolsHere', () => {
  it('returns only the creature pools of the place, settled, with family, density level and members', () => {
    const { ctx, goblins } = world();
    const here = creaturePoolsHere(ctx, ORCHARD_ID, T0);
    expect(here).toHaveLength(1);
    expect(here[0]!.pool.id).toBe(goblins.id);
    expect(here[0]!.family).toMatchObject({ id: GOBLINS_ID, temperament: 'aggressive', singularNoun: 'goblin', pluralNoun: 'goblins', ambushVerb: 'charge', ambushRest: 'out of the trees' });
    expect(here[0]!.level).toBe(2);
    expect(here[0]!.members.map((m) => m.templateId)).toEqual(GOBLIN_TEMPLATES);
    expect(here[0]!.members.map((m) => m.role)).toEqual(['tank', 'damage', 'healer', 'caster']);
    for (const m of here[0]!.members) expect(m.level).toBe(orchardLevel(ctx, m.templateId));
    expect(here[0]!.lvLo).toBe(3n);
    expect(here[0]!.lvHi).toBe(5n);
  });

  it('skips resource pools and other places', () => {
    const { ctx } = world();
    expect(creaturePoolsHere(ctx, MARKET_ID, T0)).toEqual([]);
    expect(creaturePoolsHere(ctx, FLATS_ID, T0).map((h) => h.family.id)).toEqual([2n]);
  });
});

describe('rosterLevel (D-56)', () => {
  it('is the lowest level of the roster', () => {
    const { ctx } = world();
    expect(rosterLevel([char(ctx, 1n), char(ctx, 2n)])).toBe(3n);
    expect(rosterLevel([char(ctx, 2n)])).toBe(6n);
    expect(rosterLevel([])).toBe(1n);
  });
});

describe('rollEncounter (D-10)', () => {
  const roll = (ctx: any, locationId: bigint, partyLevel: bigint, now: bigint, isSafe = false) =>
    rollEncounter(ctx, { locationId, isSafe, partyLevel, phase: 'enter', leaderId: 1n, now });

  it('never hits at a safe place', () => {
    const { ctx } = world(90n);
    for (let i = 0n; i < 200n; i += 1n) expect(roll(ctx, ORCHARD_ID, 1n, T0 + i, true)).toBeNull();
  });

  it('never hits when every family of the place is wiped out', () => {
    const { ctx } = world(0n);
    for (let i = 0n; i < 200n; i += 1n) expect(roll(ctx, ORCHARD_ID, 1n, T0 + i)).toBeNull();
  });

  it('an Overrun aggressive family above the party hits more often than a Scarce skittish family below it', () => {
    const { ctx, skitterers } = world(90n);
    setPoolCount(ctx, skitterers, 10n, T0);
    let overrun = 0;
    let scarce = 0;
    for (let i = 0n; i < 200n; i += 1n) {
      if (roll(ctx, ORCHARD_ID, 1n, T0 + i)) overrun += 1;
      if (roll(ctx, FLATS_ID, 6n, T0 + i)) scarce += 1;
    }
    expect(overrun).toBeGreaterThan(40);
    expect(overrun).toBeGreaterThan(scarce * 3);
  });

  it('is deterministic and returns the hit pool, its family and its density level', () => {
    const { ctx, goblins } = world(90n);
    let hits = 0;
    for (let i = 0n; i < 50n; i += 1n) {
      const a = roll(ctx, ORCHARD_ID, 1n, T0 + i);
      const b = roll(ctx, ORCHARD_ID, 1n, T0 + i);
      expect(a === null).toBe(b === null);
      if (a && b) {
        hits += 1;
        expect(a.pool.id).toBe(goblins.id);
        expect(a.family.id).toBe(GOBLINS_ID);
        expect(a.level).toBe(3);
        expect(a.seed).toBe(b.seed);
        expect(a.seed).toBe(encounterSeed(T0 + i, 1n, ORCHARD_ID, 'enter'));
      }
    }
    expect(hits).toBeGreaterThan(0);
  });

  it('a factor of 0 never hits', () => {
    const { ctx } = world(90n);
    for (let i = 0n; i < 100n; i += 1n) {
      expect(rollEncounter(ctx, { locationId: ORCHARD_ID, isSafe: false, partyLevel: 1n, phase: 'aggro', leaderId: 1n, now: T0 + i, factorPct: 0 })).toBeNull();
    }
  });
});

describe('drawGroup (D-11)', () => {
  it('an Overrun family of 4 draws 2-4 pool enemies, slot 0 a tank or damage member, each at its place level', () => {
    const { ctx, goblins } = world(90n);
    const sizes = new Set<number>();
    for (let seed = 0n; seed < 60n; seed += 1n) {
      const drawn = drawGroup(ctx, { pool: goblins, family: family(ctx, GOBLINS_ID), partyLevel: 3n, seed });
      sizes.add(drawn.length);
      expect(drawn.length).toBeGreaterThanOrEqual(2);
      expect(drawn.length).toBeLessThanOrEqual(4);
      expect(['tank', 'damage']).toContain(ROLE_OF[drawn[0]!.enemyTemplateId.toString()]);
      expect(drawn.every((d) => ROLE_OF[d.enemyTemplateId.toString()] === 'healer')).toBe(false);
      for (const d of drawn) {
        expect(d.spawnId).toBe(0n);
        expect(d.poolId).toBe(goblins.id);
        expect(d.level).toBe(orchardLevel(ctx, d.enemyTemplateId));
      }
    }
    expect([...sizes].sort()).toEqual([2, 3, 4]);
  });

  it('a Scarce family draws one; a Stable family 1-2', () => {
    const scarce = world(10n);
    const stable = world(50n);
    for (let seed = 0n; seed < 30n; seed += 1n) {
      expect(drawGroup(scarce.ctx, { pool: scarce.goblins, family: family(scarce.ctx, GOBLINS_ID), partyLevel: 3n, seed })).toHaveLength(1);
      const n = drawGroup(stable.ctx, { pool: stable.goblins, family: family(stable.ctx, GOBLINS_ID), partyLevel: 3n, seed }).length;
      expect(n === 1 || n === 2).toBe(true);
    }
  });

  it('a wiped-out family draws nothing', () => {
    const { ctx, goblins } = world(0n);
    expect(drawGroup(ctx, { pool: goblins, family: family(ctx, GOBLINS_ID), partyLevel: 3n, seed: 7n })).toEqual([]);
  });

  it('a family of one (a damage member only) draws copies of that member', () => {
    const base = poolWorld();
    const wolf = { ...base.enemy_template.find((t: any) => t.id === 201n), id: 401n, name: 'Reed Wolf', role: 'damage', creatureType: 'beast' };
    const ctx = poolCtx(
      poolWorld({
        extra: {
          enemy_template: [wolf],
          creature_family: [{ ...base.creature_family[0], id: 3n, key: 'quest:401', name: 'Reed Wolves', singularNoun: 'reed wolf', pluralNoun: 'reed wolves' }],
          family_member: [{ id: 50n, familyId: 3n, enemyTemplateId: 401n, role: 'damage', filler: false }],
        },
      }),
    );
    const pool = createPool(ctx, { regionId: REGION_ID, locationId: ORCHARD_ID, kind: 'creature', refId: 3n, homeLevel: 2 }, T0);
    const overrun = setPoolCount(ctx, pool, 90n, T0).pool;
    for (let seed = 0n; seed < 20n; seed += 1n) {
      const drawn = drawGroup(ctx, { pool: overrun, family: family(ctx, 3n), partyLevel: 3n, seed });
      expect(drawn.length).toBeGreaterThanOrEqual(2);
      expect(drawn.every((d) => d.enemyTemplateId === 401n)).toBe(true);
    }
  });

  it('trims one member when the family top level is 4+ above the party (never below 1)', () => {
    const { ctx, goblins } = world(90n);
    const fam = family(ctx, GOBLINS_ID);
    let trimmed = 0;
    for (let seed = 0n; seed < 40n; seed += 1n) {
      const even = drawGroup(ctx, { pool: goblins, family: fam, partyLevel: 3n, seed }).length; // gap 2
      const far = drawGroup(ctx, { pool: goblins, family: fam, partyLevel: 1n, seed }).length; // gap 4
      expect(far).toBe(Math.max(1, even - 1));
      if (far < even) trimmed += 1;
    }
    expect(trimmed).toBeGreaterThan(0);
  });

  it('drawForPull seeds with the pull phase of the leader and place', () => {
    const { ctx, goblins } = world(90n);
    const fam = family(ctx, GOBLINS_ID);
    const seed = encounterSeed(T0, 1n, ORCHARD_ID, 'pull');
    expect(drawForPull(ctx, goblins, fam, 3n, 1n, T0)).toEqual(drawGroup(ctx, { pool: goblins, family: fam, partyLevel: 3n, seed }));
  });
});

// ---------------------------------------------------------------------------
// Quest-aware draws (D-74)
// ---------------------------------------------------------------------------

/** A quest_template row with every column (strict mock). */
function questTemplateRow(id: bigint, targetEnemyTemplateId: bigint, questType: string | undefined, characterId = 1n) {
  return {
    id,
    name: `Quest ${id}`,
    npcId: 5n,
    targetEnemyTemplateId,
    requiredCount: 3n,
    minLevel: 1n,
    maxLevel: 10n,
    rewardXp: 50n,
    questType,
    targetLocationId: ORCHARD_ID,
    sourceLocationId: undefined,
    targetNpcId: undefined,
    targetItemName: undefined,
    itemDropChance: undefined,
    description: 'Thin them out.',
    rewardType: 'xp',
    rewardItemName: undefined,
    rewardItemDesc: undefined,
    rewardGold: undefined,
    characterId,
  };
}

/** A quest_instance row with every column. */
function questInstanceRow(id: bigint, characterId: bigint, questTemplateId: bigint, completed = false) {
  return {
    id,
    characterId,
    questTemplateId,
    progress: completed ? 3n : 0n,
    completed,
    acceptedAt: { microsSinceUnixEpoch: T0 },
    completedAt: undefined,
  };
}

/** The pool world with quests: each entry is [templateId, questType, characterId, completed?]. */
function questWorld(goblinCount: bigint, quests: [bigint, string | undefined, bigint, boolean?][]) {
  const quest_template: any[] = [];
  const quest_instance: any[] = [];
  quests.forEach(([target, type, characterId, completed], i) => {
    const id = 70n + BigInt(i);
    quest_template.push(questTemplateRow(id, target, type, characterId));
    quest_instance.push(questInstanceRow(90n + BigInt(i), characterId, id, completed === true));
  });
  return world(goblinCount, { extra: { quest_template, quest_instance } });
}

describe('quest-aware draws (D-74)', () => {
  it('activeKillTargets: an active kill quest of a roster member on a family member', () => {
    const { ctx } = questWorld(10n, [[104n, 'kill', 1n]]);
    expect(activeKillTargets(ctx, [char(ctx, 1n)], GOBLIN_TEMPLATES)).toEqual([104n]);
  });

  it('activeKillTargets: completed, other quest types, other targets and other characters give nothing', () => {
    const done = questWorld(10n, [[104n, 'kill', 1n, true]]);
    expect(activeKillTargets(done.ctx, [char(done.ctx, 1n)], GOBLIN_TEMPLATES)).toEqual([]);
    for (const type of ['boss_kill', 'delivery', 'explore']) {
      const { ctx } = questWorld(10n, [[104n, type, 1n]]);
      expect(activeKillTargets(ctx, [char(ctx, 1n)], GOBLIN_TEMPLATES), type).toEqual([]);
    }
    const other = questWorld(10n, [[201n, 'kill', 1n]]);
    expect(activeKillTargets(other.ctx, [char(other.ctx, 1n)], GOBLIN_TEMPLATES)).toEqual([]);
    const bobs = questWorld(10n, [[104n, 'kill', 2n]]);
    expect(activeKillTargets(bobs.ctx, [char(bobs.ctx, 1n)], GOBLIN_TEMPLATES)).toEqual([]);
    expect(activeKillTargets(bobs.ctx, [char(bobs.ctx, 1n), char(bobs.ctx, 2n)], GOBLIN_TEMPLATES)).toEqual([104n]);
  });

  it('activeKillTargets: kill_loot counts, a missing questType reads kill, duplicates collapse in ascending order', () => {
    const { ctx } = questWorld(10n, [
      [104n, 'kill_loot', 1n],
      [103n, undefined, 2n],
      [104n, 'kill', 2n],
    ]);
    const roster = [char(ctx, 1n), char(ctx, 2n), char(ctx, 1n)];
    expect(activeKillTargets(ctx, roster, GOBLIN_TEMPLATES)).toEqual([103n, 104n]);
  });

  it("a Scarce draw is the target exactly when the slot-0 roll hits, else today's draw", () => {
    const { ctx, goblins } = questWorld(10n, [[104n, 'kill', 1n]]);
    const fam = family(ctx, GOBLINS_ID);
    const roster = [char(ctx, 1n)];
    let hits = 0;
    const N = 400;
    for (let seed = 0n; seed < BigInt(N); seed += 1n) {
      const plain = drawGroup(ctx, { pool: goblins, family: fam, partyLevel: 3n, seed });
      const drawn = drawGroup(ctx, { pool: goblins, family: fam, partyLevel: 3n, seed, roster });
      expect(drawn).toHaveLength(1);
      if (questTargetHit(seed, 0)) {
        expect(drawn).toEqual([{ enemyTemplateId: 104n, level: orchardLevel(ctx, 104n), spawnId: 0n, poolId: goblins.id }]);
      } else {
        expect(drawn).toEqual(plain);
      }
      if (drawn[0]!.enemyTemplateId === 104n) hits += 1;
    }
    // Measured 2026-10-09: the caster is the lone member in 158 of these 400 seeds (39.5%) (the slot-0 quest roll; a
    // Scarce plain draw never sends a caster, slot 0 is a front-liner).
    expect(hits / N).toBeGreaterThanOrEqual(0.25);
    expect(hits / N).toBeLessThanOrEqual(0.55);
  });

  it('an Overrun draw keeps its size; each slot is the target exactly when its own roll hits', () => {
    const { ctx, goblins } = questWorld(90n, [[104n, 'kill', 1n]]);
    const fam = family(ctx, GOBLINS_ID);
    const roster = [char(ctx, 1n)];
    let replaced = 0;
    for (let seed = 0n; seed < 120n; seed += 1n) {
      const plain = drawGroup(ctx, { pool: goblins, family: fam, partyLevel: 3n, seed });
      const drawn = drawGroup(ctx, { pool: goblins, family: fam, partyLevel: 3n, seed, roster });
      expect(drawn).toHaveLength(plain.length);
      drawn.forEach((d, slot) => {
        if (questTargetHit(seed, slot)) {
          expect(d).toEqual({ enemyTemplateId: 104n, level: orchardLevel(ctx, 104n), spawnId: 0n, poolId: goblins.id });
          replaced += 1;
        } else {
          expect(d).toEqual(plain[slot]);
        }
      });
    }
    expect(replaced).toBeGreaterThan(0);
  });

  it('no roster, an empty roster or a roster with no matching quest draws exactly as today', () => {
    for (const count of [10n, 50n, 90n]) {
      const { ctx, goblins } = questWorld(count, [[201n, 'kill', 1n], [104n, 'kill', 1n, true]]);
      const fam = family(ctx, GOBLINS_ID);
      for (let seed = 0n; seed < 60n; seed += 1n) {
        const plain = drawGroup(ctx, { pool: goblins, family: fam, partyLevel: 3n, seed });
        expect(drawGroup(ctx, { pool: goblins, family: fam, partyLevel: 3n, seed, roster: [] })).toEqual(plain);
        expect(
          drawGroup(ctx, { pool: goblins, family: fam, partyLevel: 3n, seed, roster: [char(ctx, 1n), char(ctx, 2n)] }),
        ).toEqual(plain);
      }
    }
  });

  it('a healer target can be the lone Scarce slot on a hit (D-74 over the front-liner rule)', () => {
    const { ctx, goblins } = questWorld(10n, [[103n, 'kill', 1n]]);
    const fam = family(ctx, GOBLINS_ID);
    let seen = 0;
    for (let seed = 0n; seed < 60n; seed += 1n) {
      const drawn = drawGroup(ctx, { pool: goblins, family: fam, partyLevel: 3n, seed, roster: [char(ctx, 1n)] });
      if (questTargetHit(seed, 0)) {
        expect(drawn.map((d) => d.enemyTemplateId)).toEqual([103n]);
        seen += 1;
      } else {
        expect(['tank', 'damage']).toContain(ROLE_OF[drawn[0]!.enemyTemplateId.toString()]);
      }
    }
    expect(seen).toBeGreaterThan(0);
  });

  it("with two targets a hit slot is pickQuestTarget's choice (a support target only where D-11 allows it)", () => {
    const { ctx, goblins } = questWorld(90n, [[104n, 'kill', 1n], [103n, 'kill', 2n]]);
    const fam = family(ctx, GOBLINS_ID);
    const roster = [char(ctx, 1n), char(ctx, 2n)];
    const picked = new Set<bigint>();
    for (let seed = 0n; seed < 80n; seed += 1n) {
      const drawn = drawGroup(ctx, { pool: goblins, family: fam, partyLevel: 3n, seed, roster });
      drawn.forEach((d, slot) => {
        if (!questTargetHit(seed, slot)) return;
        const want = pickQuestTarget(seed, slot, [103n, 104n])!;
        if (want === 103n && d.enemyTemplateId !== 103n) return; // the D-11 support rules kept this slot
        expect(d.enemyTemplateId).toBe(want);
        expect(d.level).toBe(orchardLevel(ctx, want));
        picked.add(want);
      });
    }
    expect([...picked].sort()).toEqual([103n, 104n]);
  });

  it('a support target keeps D-11 in a group: slot 0 stays a front-liner and the support cap holds (review A IN-05)', () => {
    for (const count of [50n, 90n]) {
      const { ctx, goblins } = questWorld(count, [[103n, 'kill', 1n]]);
      const fam = family(ctx, GOBLINS_ID);
      let swapped = 0;
      for (let seed = 0n; seed < 400n; seed += 1n) {
        const drawn = drawGroup(ctx, { pool: goblins, family: fam, partyLevel: 3n, seed, roster: [char(ctx, 1n)] });
        if (drawn.length < 2) continue;
        const roles = drawn.map((d) => ROLE_OF[d.enemyTemplateId.toString()]);
        expect(['tank', 'damage'], `seed ${seed}`).toContain(roles[0]);
        const cap = drawn.length >= 4 ? DENSITY_RULES.HEALER_CAP_FOUR : DENSITY_RULES.HEALER_CAP_UP_TO_THREE;
        expect(roles.filter((r) => r === 'healer').length, `seed ${seed}`).toBeLessThanOrEqual(cap);
        expect(roles.some((r) => r !== 'healer')).toBe(true);
        swapped += drawn.filter((d, slot) => slot > 0 && questTargetHit(seed, slot) && d.enemyTemplateId === 103n).length;
      }
      // The target still comes in where the cap leaves room.
      expect(swapped, `count ${count}`).toBeGreaterThan(0);
    }
  });

  it('drawForPull passes its roster on', () => {
    const { ctx, goblins } = questWorld(90n, [[104n, 'kill', 1n]]);
    const fam = family(ctx, GOBLINS_ID);
    const roster = [char(ctx, 1n)];
    const seed = encounterSeed(T0, 1n, ORCHARD_ID, 'pull');
    expect(drawForPull(ctx, goblins, fam, 3n, 1n, T0, roster)).toEqual(
      drawGroup(ctx, { pool: goblins, family: fam, partyLevel: 3n, seed, roster }),
    );
  });
});

describe('startPoolFight', () => {
  function stubDeps() {
    const calls: any[][] = [];
    return {
      calls,
      deps: {
        startCombat: (...args: any[]) => {
          calls.push(args);
          return { id: 77n };
        },
      },
    };
  }

  const feed = (ctx: any, characterId: bigint) =>
    rows(ctx, 'event_private').filter((e: any) => e.characterId === characterId).map((e: any) => ({ kind: e.kind, message: e.message }));

  it('writes the pull lead-in to each roster member (kind combat) and starts the fight with the drawn enemies and a pull origin', () => {
    const { ctx, goblins } = world(50n);
    const fam = family(ctx, GOBLINS_ID);
    const leader = char(ctx, 1n);
    const candidates = [leader, char(ctx, 2n), char(ctx, 3n)];
    const drawn = drawForPull(ctx, goblins, fam, 3n, 1n, T0);
    const { deps, calls } = stubDeps();
    const combat = startPoolFight(deps, ctx, {
      leader,
      candidates,
      groupId: 5n,
      pool: goblins,
      family: fam,
      drawn,
      originKind: 'pull',
      line: { kind: 'combat', text: 'You make some noise. One goblin answers.' },
    });
    expect(combat).toEqual({ id: 77n });
    expect(feed(ctx, 1n)).toEqual([{ kind: 'combat', message: 'You make some noise. One goblin answers.' }]);
    expect(feed(ctx, 2n)).toEqual([{ kind: 'combat', message: 'You make some noise. One goblin answers.' }]);
    expect(feed(ctx, 3n)).toEqual([]); // Cara is offline: never in the roster
    expect(calls).toHaveLength(1);
    const [cctx, cleader, ccandidates, cgroup, cdrawn, origin] = calls[0]!;
    expect(cctx).toBe(ctx);
    expect(cleader.id).toBe(1n);
    expect(ccandidates).toBe(candidates);
    expect(cgroup).toBe(5n);
    expect(cdrawn).toBe(drawn);
    expect(origin).toEqual({ kind: 'pull', familyId: GOBLINS_ID, level: 2, name: 'Goblins', plural: 'goblins' });
  });

  it('an ambush line goes out with kind ambush and the ambush origin', () => {
    const { ctx, goblins } = world(90n);
    const fam = family(ctx, GOBLINS_ID);
    const leader = char(ctx, 1n);
    const { deps, calls } = stubDeps();
    startPoolFight(deps, ctx, {
      leader,
      candidates: [leader],
      groupId: null,
      pool: goblins,
      family: fam,
      drawn: drawForPull(ctx, goblins, fam, 3n, 1n, T0),
      originKind: 'ambush_other',
      line: { kind: 'ambush', text: 'Before you can move on, two goblins charge out of the trees!' },
    });
    expect(feed(ctx, 1n)).toEqual([{ kind: 'ambush', message: 'Before you can move on, two goblins charge out of the trees!' }]);
    expect(calls[0]![5]).toMatchObject({ kind: 'ambush_other', level: 3 });
  });

  it('starts nothing for an empty draw', () => {
    const { ctx, goblins } = world(50n);
    const leader = char(ctx, 1n);
    const { deps, calls } = stubDeps();
    const combat = startPoolFight(deps, ctx, {
      leader, candidates: [leader], groupId: null, pool: goblins, family: family(ctx, GOBLINS_ID), drawn: [], originKind: 'pull', line: { kind: 'combat', text: 'x' },
    });
    expect(combat).toBeNull();
    expect(calls).toHaveLength(0);
    expect(feed(ctx, 1n)).toEqual([]);
  });
});

describe('source rules (D-10)', () => {
  it('encounters.ts uses no Math.random, no timestamp modulo and no runtime import of reducers/combat', () => {
    const src: string = readFileSync(new URL('./encounters.ts', import.meta.url), 'utf8');
    const code = src.split('\n').filter((line) => !/^\s*(\/\/|\*|\/\*)/.test(line)).join('\n');
    expect(code).not.toMatch(/Math\.random/);
    expect(code).not.toMatch(/% 100n/);
    expect(code).not.toMatch(/^import (?!type)[^;]*from '\.\.\/reducers\/combat'/m);
  });
});
