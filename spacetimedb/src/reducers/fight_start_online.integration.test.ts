/**
 * Code review CR-02 (Phase 51.1): offline party members are never pulled into a fight, on EVERY
 * fight-start path, not only start_combat. Runs the real handlers captured from index.ts on the
 * strict mock db for the paths the review found (the quest-item aggro and pull_named_enemy). The node
 * gathering ambush left with start_gather_resource (Phase 51.3.1.1 Plan 27); the pool gather ambush
 * goes through startPoolFight to startCombat, whose roster rule is the startCombat block below.
 *
 * Group 5: Mirel (1, the initiator), Bran (2, online, same place), Cora (3, OFFLINE, same place),
 * Dax (4, online, another place). Every fight must hold exactly Mirel and Bran.
 */
import { describe, it, expect, vi, beforeAll } from 'vitest';
import { capturedReducer } from '../helpers/schema_recorder';
import { createMockCtx } from '../helpers/test-utils';
import { startSeed } from '../helpers/combat_fight_fixture';

vi.mock('spacetimedb/server', async () =>
  (await import('../helpers/schema_recorder')).createRecordingServerMock(),
);

const T0 = 1_700_000_000_000_000n;
const alice = { toHexString: () => 'a'.repeat(64) };

const handlers: Record<string, (...args: any[]) => any> = {};
beforeAll(async () => {
  await import('../index');
  for (const name of ['loot_quest_item', 'pull_named_enemy']) {
    const h = capturedReducer(name);
    if (typeof h !== 'function') {
      throw new Error(`capturedReducer('${name}') is not a function: STOP and report; never edit production code to fix this.`);
    }
    handlers[name] = h;
  }
}, 120_000);

/** A full character row (the combat fixture's), in group 5 and online unless overridden. */
const member = (id: bigint, name: string, over: Record<string, unknown>) => ({
  ...startSeed().character[0],
  id,
  ownerUserId: 6n + id,
  name,
  groupId: 5n,
  online: true,
  ...over,
});

/** The party, an unsafe place with an available spawn, and whatever each path needs. */
function newCtx(ts: bigint) {
  return createMockCtx({
    seed: {
      player: [{ id: alice, userId: 7n, activeCharacterId: 1n }],
      character: [
        member(1n, 'Mirel', {}),
        member(2n, 'Bran', {}),
        member(3n, 'Cora', { online: false }),
        member(4n, 'Dax', { locationId: 11n }),
      ],
      group: [{ id: 5n, name: "Mirel's group", leaderCharacterId: 1n, pullerCharacterId: 1n, createdAt: { microsSinceUnixEpoch: T0 - 10n } }],
      group_member: [1n, 2n, 3n, 4n].map((characterId) => ({
        id: characterId,
        groupId: 5n,
        characterId,
        ownerUserId: 6n + characterId,
        role: characterId === 1n ? 'leader' : 'member',
        followLeader: true,
        joinedAt: { microsSinceUnixEpoch: T0 - 10n + characterId },
      })),
      region: startSeed().region,
      location: [...startSeed().location, { ...startSeed().location[0], id: 11n, name: 'Reedwater' }],
      // The fixture's full enemy template (Cave Rat, id 1) with one available spawn here. Reed Wolf (2)
      // is an ordinary creature here (Cave Rat is Old Greymaw's template, so it never forms a family):
      // ensurePoolsForLocation pools it, and the quest-item ambush draws from that pool (Plan 11).
      enemy_template: [...startSeed().enemy_template, { ...startSeed().enemy_template[0], id: 2n, name: 'Reed Wolf' }],
      enemy_spawn: [{ id: 90n, locationId: 10n, enemyTemplateId: 1n, name: 'Cave Rat', state: 'available', groupCount: 1n }],
      location_enemy_template: [{ id: 95n, locationId: 10n, enemyTemplateId: 1n }, { id: 96n, locationId: 10n, enemyTemplateId: 2n }],
      resource_node: [{ id: 70n, locationId: 10n, name: 'Copper Vein', state: 'available', quantity: 3n }],
      npc: [{ id: 5n, name: 'Hesk Varrow', npcType: 'quest', locationId: 10n, gender: 'male' }],
      quest_template: [{
        id: 50n, name: 'The Drowned Bell', npcId: 5n, targetEnemyTemplateId: 0n, requiredCount: 1n, minLevel: 1n, maxLevel: 10n,
        rewardXp: 10n, rewardGold: 0n, questType: 'explore', targetLocationId: 10n, targetItemName: 'Sealed Ledger', characterId: 1n,
      }],
      quest_instance: [{ id: 60n, characterId: 1n, questTemplateId: 50n, progress: 0n, completed: false }],
      quest_item: [{ id: 71n, characterId: 1n, questTemplateId: 50n, locationId: 10n, name: 'Sealed Ledger', discovered: true, looted: false }],
      named_enemy: [{ id: 99n, characterId: 1n, enemyTemplateId: 1n, name: 'Old Greymaw', isAlive: true }],
    },
    sender: alice,
    timestampMicros: ts,
    strict: true,
  });
}

const rows = (ctx: any, table: string): any[] => ctx.db._tables[table] ?? [];

/**
 * The first timestamp after T0 where loot_quest_item draws its pool ambush (Phase 51.3.1.1 Plan 11:
 * the seeded roll of leader 1 at place 10, phase 'aggro'; it does not depend on who else is in the
 * roster here, since every member has the same level).
 */
let questAggroAt: bigint | null = null;
function questAggroTs(): bigint {
  if (questAggroAt !== null) return questAggroAt;
  for (let i = 0n; i < 400n; i += 1n) {
    const ctx = newCtx(T0 + i);
    handlers.loot_quest_item(ctx, { characterId: 1n, questItemId: 71n });
    if (rows(ctx, 'combat_encounter').length === 1) {
      questAggroAt = T0 + i;
      return questAggroAt;
    }
  }
  throw new Error('no timestamp draws the quest-item ambush');
}
const fighters = (ctx: any): bigint[] =>
  rows(ctx, 'combat_participant')
    .map((p) => p.characterId)
    .sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
const combatLines = (ctx: any, characterId: bigint): string[] =>
  rows(ctx, 'event_private')
    .filter((e) => e.characterId === characterId && e.kind === 'combat')
    .map((e) => e.message);

function expectOnlyMirelAndBran(ctx: any) {
  expect(rows(ctx, 'combat_encounter')).toHaveLength(1);
  expect(fighters(ctx)).toEqual([1n, 2n]);
  expect(combatLines(ctx, 3n)).toEqual([]);
  expect(combatLines(ctx, 4n)).toEqual([]);
}

describe('offline members are never pulled into a fight (code review CR-02)', () => {
  it('the quest-item aggro pulls only online members at the place', () => {
    // Phase 51.3.1.1 Plan 11: the aggro is the seeded pool roll (helpers/encounters.ts) over the Cave
    // Rat pool that ensurePoolsForLocation builds here; questAggroTs() is a timestamp where it hits.
    const ctx = newCtx(questAggroTs());
    handlers.loot_quest_item(ctx, { characterId: 1n, questItemId: 71n });
    expect(rows(ctx, 'quest_item')[0].looted).toBe(true);
    expectOnlyMirelAndBran(ctx);
  });

  it('pull_named_enemy pulls only online members at the place', () => {
    const ctx = newCtx(T0 + 7n);
    handlers.pull_named_enemy(ctx, { characterId: 1n, namedEnemyId: 99n });
    expect(rows(ctx, 'event_private').map((e) => e.message)).toContain('You engage Old Greymaw!');
    expectOnlyMirelAndBran(ctx);
  });
});

describe('a member already in another fight is not pulled in (review 2 IN-04)', () => {
  /** Bran (2) is already in active fight 500. */
  function branInAFight(ts: bigint) {
    const ctx = newCtx(ts);
    ctx.db._tables.combat_encounter = [
      { id: 500n, locationId: 10n, groupId: undefined, leaderCharacterId: undefined, state: 'active', addCount: 0n, pendingAddCount: 0n, createdAt: { microsSinceUnixEpoch: ts - 5n } },
    ];
    ctx.db._tables.combat_participant = [
      { id: 500n, combatId: 500n, characterId: 2n, status: 'active', nextAutoAttackAt: 0n },
    ];
    return ctx;
  }
  const newFighters = (ctx: any): bigint[] =>
    rows(ctx, 'combat_participant')
      .filter((p) => p.combatId !== 500n)
      .map((p) => p.characterId);

  const PATHS = [
    ['the quest-item aggro', () => questAggroTs(), (ctx: any) => handlers.loot_quest_item(ctx, { characterId: 1n, questItemId: 71n })],
    ['pull_named_enemy', () => T0 + 7n, (ctx: any) => handlers.pull_named_enemy(ctx, { characterId: 1n, namedEnemyId: 99n })],
  ] as const;

  for (const [label, ts, start] of PATHS) {
    it(`${label}: the new fight holds only Mirel; Bran keeps his one participant row`, () => {
      const ctx = branInAFight(ts());
      start(ctx);
      expect(rows(ctx, 'combat_encounter')).toHaveLength(2);
      expect(newFighters(ctx)).toEqual([1n]);
      expect(rows(ctx, 'combat_participant').filter((p) => p.characterId === 2n)).toHaveLength(1);
    });
  }
});

describe('startCombat: a drawn group with its origin on record (Phase 51.3.1.1 Plan 10, D-32)', () => {
  let startCombat: any;
  let startCombatForSpawn: any;
  let pool: typeof import('../helpers/pool_fixture');
  let templateAtLevel: any;
  let computeEnemyStats: any;
  let deps: any;
  beforeAll(async () => {
    ({ startCombat, startCombatForSpawn } = await import('./combat'));
    pool = await import('../helpers/pool_fixture');
    ({ templateAtLevel } = await import('../data/enemy_rules'));
    ({ computeEnemyStats } = await import('../helpers/combat_enemies'));
    const { appendPrivateEvent } = await import('../helpers/events');
    deps = { SenderError: Error, computeEnemyStats, appendPrivateEvent };
  });

  const PULL = { kind: 'pull', familyId: 1n, level: 2, name: 'Goblins', plural: 'goblins' } as const;
  /** Tank (101), healer (103) at the orchard's level 4, caster (104) at 5, from pool 7. */
  const DRAWN = [
    { enemyTemplateId: 101n, level: 4n, spawnId: 0n, poolId: 7n },
    { enemyTemplateId: 103n, level: 4n, spawnId: 0n, poolId: 7n },
    { enemyTemplateId: 104n, level: 5n, spawnId: 0n, poolId: 7n },
  ];
  const char = (ctx: any, id: bigint) => rows(ctx, 'character').find((c: any) => c.id === id);
  const start = (ctx: any, candidates: bigint[] = [1n, 2n, 3n], drawn: any[] = DRAWN, origin: any = PULL) =>
    startCombat(deps, ctx, char(ctx, 1n), candidates.map((id) => char(ctx, id)), 5n, drawn, origin);

  it('creates one encounter and one combat_enemy per drawn enemy (spawnId 0n, the poolId, the drawn levels)', () => {
    const ctx = pool.poolCtx(pool.poolWorld());
    const combat = start(ctx);
    expect(rows(ctx, 'combat_encounter')).toHaveLength(1);
    const enemies = rows(ctx, 'combat_enemy');
    expect(enemies.map((e: any) => [e.enemyTemplateId, e.spawnId, e.poolId, e.level])).toEqual([
      [101n, 0n, 7n, 4n],
      [103n, 0n, 7n, 4n],
      [104n, 0n, 7n, 5n],
    ]);
    expect(enemies.every((e: any) => e.combatId === combat.id)).toBe(true);
    // Stats come from the template at the drawn level (templateAtLevel), as for a spawn.
    const participants = [char(ctx, 1n), char(ctx, 2n)];
    for (const e of enemies) {
      const stored = rows(ctx, 'enemy_template').find((t: any) => t.id === e.enemyTemplateId);
      const expected = computeEnemyStats(templateAtLevel(stored, e.level), null, participants);
      expect([e.maxHp, e.currentHp, e.attackDamage]).toEqual([expected.maxHp, expected.maxHp, expected.attackDamage]);
    }
    // No enemy_spawn row is read or written for a pool fight.
    expect(rows(ctx, 'enemy_spawn')).toEqual([]);
    expect(rows(ctx, 'round_timer_tick').filter((r: any) => r.combatId === combat.id)).toHaveLength(1);
  });

  it('records the origin on the fight row and names the family in the opening line', () => {
    const ctx = pool.poolCtx(pool.poolWorld());
    start(ctx);
    expect(rows(ctx, 'combat_encounter')[0]).toMatchObject({
      origin: 'pull',
      originFamilyId: 1n,
      originLevel: 2n,
      originName: 'Goblins',
      originPlural: 'goblins',
    });
    expect(combatLines(ctx, 1n)).toContain('Combat begins against Goblins.');
  });

  it('keeps the one roster rule: no offline member, no member at another place', () => {
    const ctx = pool.poolCtx(pool.poolWorld({ bobLocationId: pool.FLATS_ID }));
    start(ctx);
    expect(fighters(ctx)).toEqual([1n]);
    expect(combatLines(ctx, 2n)).toEqual([]);
    expect(combatLines(ctx, 3n)).toEqual([]);
  });

  it('keeps the one roster rule: a member already in another fight stays out', () => {
    const ctx = pool.poolCtx(pool.poolWorld());
    ctx.db._tables.combat_encounter = [
      { id: 500n, locationId: 10n, groupId: undefined, leaderCharacterId: undefined, state: 'active', addCount: 0n, pendingAddCount: 0n, createdAt: { microsSinceUnixEpoch: T0 - 5n }, origin: '', originFamilyId: 0n, originLevel: 0n, originName: '', originPlural: '' },
    ];
    ctx.db._tables.combat_participant = [{ id: 500n, combatId: 500n, characterId: 2n, status: 'active', nextAutoAttackAt: 0n }];
    const combat = start(ctx);
    expect(rows(ctx, 'combat_participant').filter((p: any) => p.combatId === combat.id).map((p: any) => p.characterId)).toEqual([1n]);
  });

  it("a summoner's pet aggro row targets the first drawn enemy", () => {
    const seed = pool.poolWorld();
    seed.character = seed.character.map((c: any) => (c.id === 1n ? { ...c, className: 'Summoner' } : c));
    seed.active_pet = [
      { id: 40n, characterId: 1n, combatId: undefined, name: 'Ember', level: 3n, currentHp: 30n, maxHp: 30n, attackDamage: 4n, abilityKey: undefined, nextAbilityAt: undefined, abilityCooldownSeconds: undefined, targetEnemyId: undefined, nextAutoAttackAt: undefined, expiresAtMicros: undefined },
    ];
    const ctx = pool.poolCtx(seed);
    start(ctx);
    const first = rows(ctx, 'combat_enemy')[0];
    const petAggro = rows(ctx, 'aggro_entry').filter((a: any) => a.petId === 40n);
    expect(petAggro).toHaveLength(1);
    expect(petAggro[0].enemyId).toBe(first.id);
  });

  it('startCombatForSpawn: a named spawn is one enemy, origin named, originName the spawn name', () => {
    const ctx = newCtx(T0 + 7n);
    handlers.pull_named_enemy(ctx, { characterId: 1n, namedEnemyId: 99n });
    const spawn = rows(ctx, 'enemy_spawn').find((s: any) => s.id !== 90n);
    expect(rows(ctx, 'combat_enemy')).toHaveLength(1);
    expect(rows(ctx, 'combat_enemy')[0]).toMatchObject({ spawnId: spawn.id, poolId: 0n });
    expect(rows(ctx, 'combat_encounter')[0]).toMatchObject({
      origin: 'named',
      originFamilyId: 0n,
      originLevel: 0n,
      originName: spawn.name,
      originPlural: '',
    });
  });

  it('startCombatForSpawn: a plain (event or legacy) spawn has no origin and still consumes its spawn', () => {
    const ctx = newCtx(T0);
    // The fixture's named enemy shares the Cave Rat template; without it the spawn is a plain one.
    ctx.db._tables.named_enemy = [];
    const leader = rows(ctx, 'character').find((c: any) => c.id === 1n);
    const spawn = rows(ctx, 'enemy_spawn').find((s: any) => s.id === 90n);
    startCombatForSpawn(deps, ctx, leader, spawn, [leader], null);
    expect(rows(ctx, 'combat_encounter')[0]).toMatchObject({ origin: '', originName: 'Cave Rat', originFamilyId: 0n });
    expect(rows(ctx, 'combat_enemy').map((e: any) => [e.spawnId, e.poolId])).toEqual([[90n, 0n]]);
    expect(rows(ctx, 'enemy_spawn').find((s: any) => s.id === 90n)).toMatchObject({ state: 'engaged' });
    expect(combatLines(ctx, 1n)).toContain('Combat begins against Cave Rat.');
  });
});

describe('end_combat after the fight\'s group dissolved (code review IN-05)', () => {
  it('the admin can still end the fight (no "Group not found")', async () => {
    const { fightSeed, fightCtx } = await import('../helpers/combat_fight_fixture');
    const admin = { toHexString: () => 'c200252497b98fff5aab75f8fbc675956b5a12a5b85042ab355d3a05c6ab7d6e' };
    const seed = fightSeed();
    seed.player = [{ ...seed.player[0], id: admin }];
    seed.combat_encounter = [{ ...seed.combat_encounter[0], groupId: 5n, leaderCharacterId: 1n }];
    const ctx = fightCtx(seed, admin);
    capturedReducer('end_combat')(ctx, { characterId: 1n });
    const said = rows(ctx, 'event_private').map((e) => e.message);
    expect(said).not.toContain('Group not found');
    expect(said).toContain('Combat was ended by the leader.');
  });
});
