/**
 * Code review CR-02 (Phase 51.1): offline party members are never pulled into a fight, on EVERY
 * fight-start path, not only start_combat. Runs the real handlers captured from index.ts on the
 * strict mock db for the three paths the review found (the gathering ambush, the quest-item aggro
 * and pull_named_enemy).
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
  for (const name of ['start_gather_resource', 'loot_quest_item', 'pull_named_enemy']) {
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
      // The fixture's full enemy template (Cave Rat, id 1) with one available spawn here.
      enemy_template: startSeed().enemy_template,
      enemy_spawn: [{ id: 90n, locationId: 10n, enemyTemplateId: 1n, name: 'Cave Rat', state: 'available', groupCount: 1n }],
      location_enemy_template: [{ id: 95n, locationId: 10n, enemyTemplateId: 1n }],
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
  it('the gathering ambush pulls only online members at the place', () => {
    // The ambush roll is (timestamp + characterId) % 100; T0 is a multiple of 100, so T0 rolls 1 (< 20).
    const ctx = newCtx(T0);
    handlers.start_gather_resource(ctx, { characterId: 1n, nodeId: 70n });
    expect(rows(ctx, 'event_private').map((e) => e.message)).toContain(
      'As you reach for Copper Vein, Cave Rat notices you and attacks!',
    );
    expectOnlyMirelAndBran(ctx);
  });

  it('the quest-item aggro pulls only online members at the place', () => {
    // The aggro roll is (characterId ^ timestamp) % 100; T0 rolls 1 (< 30).
    const ctx = newCtx(T0);
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
    ['the gathering ambush', T0, (ctx: any) => handlers.start_gather_resource(ctx, { characterId: 1n, nodeId: 70n })],
    ['the quest-item aggro', T0, (ctx: any) => handlers.loot_quest_item(ctx, { characterId: 1n, questItemId: 71n })],
    ['pull_named_enemy', T0 + 7n, (ctx: any) => handlers.pull_named_enemy(ctx, { characterId: 1n, namedEnemyId: 99n })],
  ] as const;

  for (const [label, ts, start] of PATHS) {
    it(`${label}: the new fight holds only Mirel; Bran keeps his one participant row`, () => {
      const ctx = branInAFight(ts);
      start(ctx);
      expect(rows(ctx, 'combat_encounter')).toHaveLength(2);
      expect(newFighters(ctx)).toEqual([1n]);
      expect(rows(ctx, 'combat_participant').filter((p) => p.characterId === 2n)).toHaveLength(1);
    });
  }
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
