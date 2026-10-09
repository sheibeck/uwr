/**
 * Quest item pickup (quick 261006-hyu; Phase 51.3.1.1 Plan 11). The loot_quest_item reducer and the
 * "loot <item>" intent of submit_intent share one helper, pickUpQuestItem: mark the item looted,
 * complete the matching unfinished quest instance (progress 1), tell the player, and then roll a
 * quest-item ambush from the place's density pools (helpers/encounters.ts rollEncounter, phase
 * 'aggro', factor QUEST_ITEM_AMBUSH_FACTOR_PCT). Runs the REAL handlers captured from index.ts on the
 * shared pool world (helpers/pool_fixture.ts: Alice L3 and Bob L6 online at the orchard, Goblins
 * there) on the strict mock db and checks:
 *   - both paths leave the same quest rows, item rows and pickup messages;
 *   - the ambush is the seeded pool roll (no Math.random, no timestamp modulo): a hitting seed draws
 *     a Goblins group with origin 'ambush_other' and an 'ambush' line; a missing seed draws nothing;
 *   - a safe place, or a place whose families are all wiped out, never ambushes;
 *   - a turned-in or already completed instance of the quest is never touched;
 *   - a failing fight start is swallowed and the pickup still stands.
 * KNOWN GAP (Plan 11 hand-off): reducers/intent.ts (outside Plan 11's files) still hands
 * pickUpQuestItem the old dependency bag without startCombat, so the "loot <item>" intent picks the
 * item up but draws no ambush until intent.ts passes `startCombat: deps.startCombat`.
 */
import { describe, it, expect, vi, beforeAll } from 'vitest';
// @ts-ignore node types are not part of this module's tsconfig (same as other source-reading tests)
import { readFileSync } from 'node:fs';
import { capturedReducer } from '../helpers/schema_recorder';
import {
  T0,
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
import { DENSITY_RULES } from '../data/density_rules';

vi.mock('spacetimedb/server', async () =>
  (await import('../helpers/schema_recorder')).createRecordingServerMock(),
);

const handlers: Record<string, (...args: any[]) => any> = {};
let pickUpQuestItem: (...args: any[]) => void;
let rollEncounter: (...args: any[]) => any;

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
  rollEncounter = (await import('../helpers/encounters')).rollEncounter;
}, 120_000);

const QUEST_NAME = 'The Drowned Bell';
const ITEM_NAME = 'Sealed Ledger';

type CtxOpts = {
  ts?: bigint;
  qi?: Record<string, any> | null;
  item?: Record<string, any>;
  /** The Goblins count at the orchard (default 90, Overrun). */
  goblins?: bigint;
  /** Where Alice and Bob stand (default the orchard). */
  at?: bigint;
};

function newCtx(opts: CtxOpts = {}) {
  const at = opts.at ?? ORCHARD_ID;
  const seed = poolWorld({
    extra: {
      npc: [{ id: 5n, name: 'Hesk Varrow', npcType: 'quest', locationId: MARKET_ID, gender: 'male' }],
      quest_template: [{
        id: 50n, name: QUEST_NAME, npcId: 5n, targetEnemyTemplateId: 0n, requiredCount: 1n, minLevel: 1n, maxLevel: 10n,
        rewardXp: 10n, rewardGold: 0n, questType: 'explore', targetLocationId: at, targetItemName: ITEM_NAME, characterId: 1n,
      }],
      quest_instance: opts.qi === null ? [] : [{ id: 60n, characterId: 1n, questTemplateId: 50n, progress: 0n, completed: false, ...opts.qi }],
      quest_item: [{ id: 70n, characterId: 1n, questTemplateId: 50n, locationId: at, name: ITEM_NAME, discovered: true, looted: false, ...opts.item }],
    },
  });
  seed.character = seed.character.map((c: any) => (c.id === 1n || c.id === 2n ? { ...c, locationId: at } : c));
  const ctx = poolCtx(seed, ALICE, T0);
  const pools = seedPools(ctx);
  setPoolCount(ctx, pools.goblinsOrchard, opts.goblins ?? 90n, T0);
  ctx.timestamp = { microsSinceUnixEpoch: opts.ts ?? calmTs() };
  return ctx;
}

const rows = (ctx: any, table: string): any[] => ctx.db._tables[table] ?? [];
const messages = (ctx: any): string[] => rows(ctx, 'event_private').map((e) => e.message);
const alice = (ctx: any) => rows(ctx, 'character').find((c: any) => c.id === 1n);
const item = (ctx: any) => rows(ctx, 'quest_item')[0];

/** Whether the quest-item ambush roll hits at `ts` in the default world (Alice L3 + Bob L6, Overrun Goblins). */
function hitsAt(ts: bigint): boolean {
  const probe = newCtx({ ts });
  return rollEncounter(probe, {
    locationId: ORCHARD_ID, isSafe: false, partyLevel: 3n, phase: 'aggro', leaderId: 1n, now: ts,
    factorPct: DENSITY_RULES.QUEST_ITEM_AMBUSH_FACTOR_PCT,
  }) !== null;
}
let found: { hit: bigint; calm: bigint } | null = null;
function findTs() {
  if (found) return found;
  let hit: bigint | null = null;
  let calm: bigint | null = null;
  for (let i = 1n; i < 400n && (hit === null || calm === null); i += 1n) {
    const ts = T0 + i;
    if (hitsAt(ts)) hit ??= ts;
    else calm ??= ts;
  }
  if (hit === null || calm === null) throw new Error('no hitting or no calm timestamp found');
  found = { hit, calm };
  return found;
}
const aggroTs = () => findTs().hit;
const calmTs = () => (found ? found.calm : T0 + 1n);

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

describe('the timestamps used by the tests', () => {
  it('one hits the ambush roll and one does not', () => {
    const { hit, calm } = findTs();
    expect(hitsAt(hit)).toBe(true);
    expect(hitsAt(calm)).toBe(false);
  });
});

describe.each(PATHS)('$label', ({ pickUp }) => {
  it('marks the item looted, completes the quest at progress 1 and says so', () => {
    const ctx = newCtx({ ts: findTs().calm });
    pickUp(ctx);
    expect(item(ctx).looted).toBe(true);
    expect(rows(ctx, 'quest_instance')[0]).toMatchObject({ progress: 1n, completed: true });
    expect(rows(ctx, 'quest_instance')[0].completedAt).toBeUndefined(); // not turned in yet
    expect(messages(ctx)).toContain(`Quest complete: ${QUEST_NAME}. Return to Hesk Varrow.`);
    expect(messages(ctx)).toContain(`You found ${ITEM_NAME}!`);
  });

  it('starts no combat when the roll misses', () => {
    const ctx = newCtx({ ts: findTs().calm });
    pickUp(ctx);
    expect(rows(ctx, 'combat_encounter')).toHaveLength(0);
  });

  it('does not touch a turned-in instance of the quest', () => {
    const turnedIn = { progress: 1n, completed: true, completedAt: { microsSinceUnixEpoch: T0 - 5n } };
    const ctx = newCtx({ qi: turnedIn, ts: findTs().calm });
    pickUp(ctx);
    expect(rows(ctx, 'quest_instance')).toEqual([{ id: 60n, characterId: 1n, questTemplateId: 50n, ...turnedIn }]);
    expect(messages(ctx).filter((m) => m.startsWith('Quest complete'))).toEqual([]);
  });

  it('does not touch an instance that is already complete', () => {
    const done = { progress: 1n, completed: true };
    const ctx = newCtx({ qi: done, ts: findTs().calm });
    pickUp(ctx);
    expect(rows(ctx, 'quest_instance')).toEqual([{ id: 60n, characterId: 1n, questTemplateId: 50n, ...done }]);
  });

  it('still marks the item looted when the character has no such quest', () => {
    const ctx = newCtx({ qi: null, ts: findTs().calm });
    pickUp(ctx);
    expect(item(ctx).looted).toBe(true);
    expect(messages(ctx)).toContain(`You found ${ITEM_NAME}!`);
  });
});

describe('both paths behave the same', () => {
  it('leave identical quest rows, item rows, combats and messages when the roll misses', () => {
    const a = newCtx({ ts: findTs().calm });
    viaReducer(a);
    const b = newCtx({ ts: findTs().calm });
    viaIntent(b);
    expect(snapshot(a)).toEqual(snapshot(b));
  });

  it('KNOWN GAP: on a hit the intent path picks the item up the same way but draws no ambush yet', () => {
    const a = newCtx({ ts: aggroTs() });
    viaReducer(a);
    const b = newCtx({ ts: aggroTs() });
    viaIntent(b);
    expect(rows(a, 'combat_encounter')).toHaveLength(1);
    expect(rows(b, 'combat_encounter')).toHaveLength(0); // flips to 1 when intent.ts passes startCombat
    expect(snapshot(b).questItems).toEqual(snapshot(a).questItems);
    expect(snapshot(b).questInstances).toEqual(snapshot(a).questInstances);
  });
});

describe('loot_quest_item draws the ambush from the pools', () => {
  it('a hitting roll starts a Goblins fight with origin ambush_other, pool enemies and an ambush line', () => {
    const ctx = newCtx({ ts: aggroTs() });
    viaReducer(ctx);
    const fights = rows(ctx, 'combat_encounter');
    expect(fights).toHaveLength(1);
    expect(fights[0]).toMatchObject({ origin: 'ambush_other', originFamilyId: GOBLINS_ID, originLevel: 3n, originName: 'Goblins' });
    const enemies = rows(ctx, 'combat_enemy');
    expect(enemies.length).toBeGreaterThanOrEqual(2);
    expect(enemies.every((e: any) => e.poolId === 1n)).toBe(true);
    expect(rows(ctx, 'enemy_spawn')).toHaveLength(0);
    const ambush = rows(ctx, 'event_private').filter((e: any) => e.kind === 'ambush' && e.characterId === 1n);
    expect(ambush).toHaveLength(1);
    expect(ambush[0].message).toMatch(/^Before you can move on, (two|three|four) goblins charge out of the trees!$/);
    expect(rows(ctx, 'combat_participant').map((p: any) => p.characterId).sort()).toEqual([1n, 2n]);
  });
});

describe('pickUpQuestItem (helper)', () => {
  function stubs() {
    return {
      ensurePoolsForLocation: vi.fn(),
      effectiveGroupId: vi.fn(() => undefined),
      startCombat: vi.fn(() => ({ id: 1n })),
    };
  }
  const append = (ctx: any, characterId: bigint, ownerUserId: bigint, kind: string, message: string) =>
    ctx.db.event_private.insert({ id: 0n, ownerUserId, characterId, kind, message, createdAt: ctx.timestamp });

  it('on a hitting roll starts the drawn Goblins group through startCombat', () => {
    const ctx = newCtx({ ts: aggroTs() });
    const aggro = stubs();
    pickUpQuestItem(ctx, alice(ctx), item(ctx), append, aggro);
    expect(aggro.ensurePoolsForLocation).toHaveBeenCalledWith(ctx, ORCHARD_ID);
    expect(aggro.startCombat).toHaveBeenCalledTimes(1);
    const [cctx, leader, candidates, groupId, drawn, origin] = (aggro.startCombat.mock.calls[0] as any[]);
    expect(cctx).toBe(ctx);
    expect(leader.id).toBe(1n);
    expect(candidates.map((p: any) => p.id)).toEqual([1n, 2n]);
    expect(groupId).toBeNull();
    expect(drawn.length).toBeGreaterThanOrEqual(2);
    expect(drawn.every((d: any) => d.spawnId === 0n && d.poolId === 1n)).toBe(true);
    expect(origin).toEqual({ kind: 'ambush_other', familyId: GOBLINS_ID, level: 3, name: 'Goblins', plural: 'goblins' });
  });

  it('does nothing when the roll misses', () => {
    const ctx = newCtx({ ts: findTs().calm });
    const aggro = stubs();
    pickUpQuestItem(ctx, alice(ctx), item(ctx), append, aggro);
    expect(aggro.startCombat).not.toHaveBeenCalled();
  });

  it('never ambushes at a safe place, even with an Overrun family pooled there', () => {
    for (let i = 1n; i <= 60n; i += 1n) {
      const ctx = newCtx({ ts: T0 + i, at: MARKET_ID });
      const marketPool = createPool(ctx, { regionId: REGION_ID, locationId: MARKET_ID, kind: 'creature', refId: GOBLINS_ID, homeLevel: 2 }, T0);
      setPoolCount(ctx, marketPool, 90n, T0);
      const aggro = stubs();
      pickUpQuestItem(ctx, alice(ctx), item(ctx), append, aggro);
      expect(aggro.startCombat).not.toHaveBeenCalled();
    }
  });

  it('never ambushes when every family at the place is wiped out', () => {
    for (let i = 1n; i <= 60n; i += 1n) {
      const ctx = newCtx({ ts: T0 + i, goblins: 0n });
      const aggro = stubs();
      pickUpQuestItem(ctx, alice(ctx), item(ctx), append, aggro);
      expect(aggro.startCombat).not.toHaveBeenCalled();
    }
  });

  it('never ambushes a character who is already fighting', () => {
    const ctx = newCtx({ ts: aggroTs() });
    ctx.db._tables.combat_encounter = [{ id: 9n, locationId: ORCHARD_ID, state: 'active' }];
    ctx.db._tables.combat_participant = [{ id: 1n, combatId: 9n, characterId: 1n, status: 'active', nextAutoAttackAt: 0n }];
    const aggro = stubs();
    pickUpQuestItem(ctx, alice(ctx), item(ctx), append, aggro);
    expect(aggro.startCombat).not.toHaveBeenCalled();
  });

  it('swallows a failing fight start: the pickup still stands', () => {
    const ctx = newCtx({ ts: aggroTs() });
    const aggro = stubs();
    aggro.startCombat.mockImplementation(() => { throw new Error('boom'); });
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    expect(() => pickUpQuestItem(ctx, alice(ctx), item(ctx), append, aggro)).not.toThrow();
    expect(item(ctx).looted).toBe(true);
    expect(rows(ctx, 'quest_instance')[0].completed).toBe(true);
    error.mockRestore();
  });

  it('without startCombat (the intent bag today) it picks up and draws nothing', () => {
    const ctx = newCtx({ ts: aggroTs() });
    const { startCombat: _drop, ...bag } = stubs();
    expect(() => pickUpQuestItem(ctx, alice(ctx), item(ctx), append, bag)).not.toThrow();
    expect(item(ctx).looted).toBe(true);
    expect(rows(ctx, 'combat_encounter')).toHaveLength(0);
  });
});

describe('source rules (D-10)', () => {
  it('quests.ts no longer rolls the old timestamp modulo', () => {
    const src: string = readFileSync(new URL('./quests.ts', import.meta.url), 'utf8');
    expect(src).not.toMatch(/% 100n/);
    expect(src).not.toMatch(/Math\.random/);
  });
});
