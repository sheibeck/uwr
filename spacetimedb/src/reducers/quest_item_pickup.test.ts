/**
 * Quest item pickup (quick 261006-hyu). The loot_quest_item reducer and the "loot <item>" intent of
 * submit_intent share one helper, pickUpQuestItem: mark the item looted, complete the matching unfinished
 * quest instance (progress 1), tell the player, and roll the 30% aggro chance. Runs the REAL handlers
 * captured from index.ts on the strict mock db and checks:
 *   - both paths leave the same rows and the same messages;
 *   - the aggro roll is the deterministic (characterId ^ timestamp) % 100 < 30 on both paths: a
 *     combat starts when the roll is below 30 and does not otherwise (no Math.random);
 *   - a turned-in or already completed instance of the quest is never touched;
 *   - the helper alone: roll boundary at 29 / 30 with stubbed aggro dependencies, and a failing aggro
 *     (safe zone) is swallowed.
 */
import { describe, it, expect, vi, beforeAll } from 'vitest';
import { capturedReducer } from '../helpers/schema_recorder';
import { createMockCtx } from '../helpers/test-utils';

vi.mock('spacetimedb/server', async () =>
  (await import('../helpers/schema_recorder')).createRecordingServerMock(),
);

const T0 = 1_700_000_000_000_000n;
const alice = { toHexString: () => 'a'.repeat(64) };

const handlers: Record<string, (...args: any[]) => any> = {};
let pickUpQuestItem: (...args: any[]) => void;

beforeAll(async () => {
  await import('../index');
  for (const name of ['loot_quest_item', 'submit_intent']) {
    const h = capturedReducer(name);
    if (typeof h !== 'function') {
      throw new Error(`capturedReducer('${name}') is not a function: STOP and report; never edit production code to fix this.`);
    }
    handlers[name] = h;
  }
  pickUpQuestItem = (await import('./quests')).pickUpQuestItem;
}, 120_000);

const QUEST_NAME = 'The Drowned Bell';
const ITEM_NAME = 'Sealed Ledger';

// The roll is (characterId ^ timestamp) % 100 with characterId 1. T0 is a multiple of 2^14 and of 100, so
// T0 + x rolls (1 ^ x): T0 gives roll 1 (aggro) and T0 + 49 gives roll 48 (no aggro).
const AGGRO_TS = T0;
const CALM_TS = T0 + 49n;
const rollOf = (ts: bigint) => (1n ^ ts) % 100n;

function newCtx(opts: { ts?: bigint; qi?: Record<string, any> | null; item?: Record<string, any> } = {}) {
  return createMockCtx({
    seed: {
      player: [{ id: alice, userId: 7n, activeCharacterId: 1n }],
      character: [{
        id: 1n, ownerUserId: 7n, name: 'Mirel', className: 'Ashwarden', level: 2n, xp: 0n, gold: 0n,
        locationId: 10n, hp: 100n, mana: 0n, stamina: 20n, maxStamina: 20n,
      }],
      npc: [{ id: 5n, name: 'Hesk Varrow', npcType: 'quest', locationId: 10n, gender: 'male' }],
      location: [{ id: 10n, name: 'Saltmere' }],
      quest_template: [{
        id: 50n, name: QUEST_NAME, npcId: 5n, targetEnemyTemplateId: 0n, requiredCount: 1n, minLevel: 1n, maxLevel: 10n,
        rewardXp: 10n, rewardGold: 0n, questType: 'explore', targetLocationId: 10n, targetItemName: ITEM_NAME, characterId: 1n,
      }],
      quest_instance: opts.qi === null ? [] : [{ id: 60n, characterId: 1n, questTemplateId: 50n, progress: 0n, completed: false, ...opts.qi }],
      quest_item: [{ id: 70n, characterId: 1n, questTemplateId: 50n, locationId: 10n, name: ITEM_NAME, discovered: true, looted: false, ...opts.item }],
      // An available enemy at the location, for the aggro roll to pull.
      enemy_template: [{ id: 80n, name: 'Reed Wolf', level: 2n, role: 'dps', creatureType: 'beast', isBoss: false }],
      enemy_spawn: [{ id: 90n, locationId: 10n, enemyTemplateId: 80n, name: 'Reed Wolf', state: 'available', groupCount: 1n }],
    },
    sender: alice,
    timestampMicros: opts.ts ?? CALM_TS,
    strict: true,
  });
}

const rows = (ctx: any, table: string): any[] => ctx.db._tables[table] ?? [];
const messages = (ctx: any): string[] => rows(ctx, 'event_private').map((e) => e.message);

const viaReducer = (ctx: any) => handlers.loot_quest_item(ctx, { characterId: 1n, questItemId: 70n });
const viaIntent = (ctx: any) => handlers.submit_intent(ctx, { characterId: 1n, text: `loot ${ITEM_NAME.toLowerCase()}` });
const PATHS = [
  { label: 'loot_quest_item reducer', pickUp: viaReducer },
  { label: '"loot <item>" intent', pickUp: viaIntent },
];

/** The state a pickup leaves: quest rows, item rows, combat rows and the messages. */
function snapshot(ctx: any) {
  return {
    questInstances: rows(ctx, 'quest_instance'),
    questItems: rows(ctx, 'quest_item'),
    combats: rows(ctx, 'combat_encounter').length,
    messages: messages(ctx).filter((m) => !m.startsWith('>')),
  };
}

describe('the roll used by the tests', () => {
  it('is below 30 for AGGRO_TS and at least 30 for CALM_TS', () => {
    expect(rollOf(AGGRO_TS)).toBeLessThan(30n);
    expect(rollOf(CALM_TS)).toBeGreaterThanOrEqual(30n);
  });
});

describe.each(PATHS)('$label', ({ pickUp }) => {
  it('marks the item looted, completes the quest at progress 1 and says so', () => {
    const ctx = newCtx();
    pickUp(ctx);
    expect(rows(ctx, 'quest_item')[0].looted).toBe(true);
    expect(rows(ctx, 'quest_instance')[0]).toMatchObject({ progress: 1n, completed: true });
    expect(rows(ctx, 'quest_instance')[0].completedAt).toBeUndefined(); // not turned in yet
    expect(messages(ctx)).toContain(`Quest complete: ${QUEST_NAME}. Return to Hesk Varrow.`);
    expect(messages(ctx)).toContain(`You found ${ITEM_NAME}!`);
  });

  it('starts a combat when the roll is below 30', () => {
    const ctx = newCtx({ ts: AGGRO_TS });
    pickUp(ctx);
    expect(rows(ctx, 'combat_encounter')).toHaveLength(1);
  });

  it('starts no combat when the roll is 30 or more', () => {
    const ctx = newCtx({ ts: CALM_TS });
    pickUp(ctx);
    expect(rows(ctx, 'combat_encounter')).toHaveLength(0);
  });

  it('does not touch a turned-in instance of the quest', () => {
    const turnedIn = { progress: 1n, completed: true, completedAt: { microsSinceUnixEpoch: T0 - 5n } };
    const ctx = newCtx({ qi: turnedIn });
    pickUp(ctx);
    expect(rows(ctx, 'quest_instance')).toEqual([{ id: 60n, characterId: 1n, questTemplateId: 50n, ...turnedIn }]);
    expect(messages(ctx).filter((m) => m.startsWith('Quest complete'))).toEqual([]);
  });

  it('does not touch an instance that is already complete', () => {
    const done = { progress: 1n, completed: true };
    const ctx = newCtx({ qi: done });
    pickUp(ctx);
    expect(rows(ctx, 'quest_instance')).toEqual([{ id: 60n, characterId: 1n, questTemplateId: 50n, ...done }]);
  });

  it('still marks the item looted when the character has no such quest', () => {
    const ctx = newCtx({ qi: null });
    pickUp(ctx);
    expect(rows(ctx, 'quest_item')[0].looted).toBe(true);
    expect(messages(ctx)).toContain(`You found ${ITEM_NAME}!`);
  });
});

describe('both paths behave the same', () => {
  for (const [label, ts] of [['no aggro', CALM_TS], ['aggro', AGGRO_TS]] as const) {
    it(`leave identical quest rows, item rows, combats and messages (${label})`, () => {
      const a = newCtx({ ts });
      viaReducer(a);
      const b = newCtx({ ts });
      viaIntent(b);
      expect(snapshot(a)).toEqual(snapshot(b));
    });
  }
});

describe('pickUpQuestItem (helper)', () => {
  function stubs() {
    return {
      ensurePoolsForLocation: vi.fn(),
      effectiveGroupId: vi.fn(() => undefined),
      startCombatForSpawn: vi.fn(),
    };
  }
  const append = (ctx: any, characterId: bigint, ownerUserId: bigint, kind: string, message: string) =>
    ctx.db.event_private.insert({ id: 0n, ownerUserId, characterId, kind, message, createdAt: ctx.timestamp });

  /** A timestamp whose roll is exactly `roll` (roll < 100). */
  const tsForRoll = (roll: bigint) => T0 + (roll ^ 1n);

  it('pulls the available spawn at roll 29', () => {
    const ctx = newCtx({ ts: tsForRoll(29n) });
    expect(rollOf(ctx.timestamp.microsSinceUnixEpoch)).toBe(29n);
    const aggro = stubs();
    pickUpQuestItem(ctx, rows(ctx, 'character')[0], rows(ctx, 'quest_item')[0], append, aggro);
    expect(aggro.ensurePoolsForLocation).toHaveBeenCalledWith(ctx, 10n);
    expect(aggro.startCombatForSpawn).toHaveBeenCalledTimes(1);
    const [, leader, spawn, participants, groupId] = aggro.startCombatForSpawn.mock.calls[0];
    expect(leader.id).toBe(1n);
    expect(spawn.id).toBe(90n);
    expect(participants.map((p: any) => p.id)).toEqual([1n]);
    expect(groupId).toBeNull();
  });

  it('does nothing at roll 30', () => {
    const ctx = newCtx({ ts: tsForRoll(30n) });
    expect(rollOf(ctx.timestamp.microsSinceUnixEpoch)).toBe(30n);
    const aggro = stubs();
    pickUpQuestItem(ctx, rows(ctx, 'character')[0], rows(ctx, 'quest_item')[0], append, aggro);
    expect(aggro.ensurePoolsForLocation).not.toHaveBeenCalled();
    expect(aggro.startCombatForSpawn).not.toHaveBeenCalled();
  });

  it('swallows a failing aggro (safe zone): the pickup still stands', () => {
    const ctx = newCtx({ ts: AGGRO_TS });
    const aggro = stubs();
    aggro.startCombatForSpawn.mockImplementation(() => { throw new Error('safe zone'); });
    expect(() => pickUpQuestItem(ctx, rows(ctx, 'character')[0], rows(ctx, 'quest_item')[0], append, aggro)).not.toThrow();
    expect(rows(ctx, 'quest_item')[0].looted).toBe(true);
    expect(rows(ctx, 'quest_instance')[0].completed).toBe(true);
  });

  it('pulls nothing when no spawn is available', () => {
    const ctx = newCtx({ ts: AGGRO_TS });
    ctx.db._tables.enemy_spawn[0].state = 'engaged';
    const aggro = stubs();
    pickUpQuestItem(ctx, rows(ctx, 'character')[0], rows(ctx, 'quest_item')[0], append, aggro);
    expect(aggro.startCombatForSpawn).not.toHaveBeenCalled();
  });
});
