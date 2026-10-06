/**
 * Hail turn-in (quick 261006-hky). Hailing an NPC turns in the character's completed quests for that NPC
 * through turnInCompletedQuest, the path turn_in_quest and the "turn in <quest>" intent already share, so
 * every turn-in path gives the same rewards and leaves the quest instance in the same state (kept, completedAt set).
 * Runs the REAL handlers captured from index.ts on the strict mock db and checks:
 *   - hailing the giver of a completed quest: xp (with level-up crossing), gold, item reward, NPC
 *     affinity and NPC memory equal the turn_in_quest outcome, and the instance is kept as turned-in history (completedAt set);
 *   - a delivery quest with a recipient (targetNpcId) is turned in by hailing the recipient once the
 *     package has been picked up (instance completed), with the same rewards as turn_in_quest there;
 *     the giver's memory and the recipient's both record it; affinity goes to the recipient;
 *   - a delivery whose package was never picked up is not paid by hailing the recipient;
 *   - full bags: the in-voice refusal, nothing applied, the quest stays ready, and the greeting still runs;
 *   - an xp/gold-only quest works with full bags.
 */
import { describe, it, expect, vi, beforeAll } from 'vitest';
import { capturedReducer } from '../helpers/schema_recorder';
import { createMockCtx } from '../helpers/test-utils';
import { MAX_INVENTORY_SLOTS } from '../helpers/items';

vi.mock('spacetimedb/server', async () =>
  (await import('../helpers/schema_recorder')).createRecordingServerMock(),
);

const T0 = 1_700_000_000_000_000n;
const alice = { toHexString: () => 'a'.repeat(64) };

const handlers: Record<string, (...args: any[]) => any> = {};

beforeAll(async () => {
  await import('../index');
  for (const name of ['turn_in_quest', 'hail_npc']) {
    const h = capturedReducer(name);
    if (typeof h !== 'function') {
      throw new Error(`capturedReducer('${name}') is not a function: STOP and report; never edit production code to fix this.`);
    }
    handlers[name] = h;
  }
}, 120_000);

const GIVER_ID = 5n;
const RECIPIENT_ID = 6n;
const GIVER = 'Hesk Varrow';
const RECIPIENT = 'Odra Fenn';
const QUEST_NAME = 'The Drowned Bell';

function character(overrides: Record<string, any> = {}) {
  return {
    id: 1n,
    ownerUserId: 7n,
    name: 'Mirel',
    className: 'Ashwarden',
    weaponProficiencies: 'sword,axe,mace,greatsword,dagger',
    armorProficiencies: 'cloth,leather,chain,plate',
    level: 2n,
    xp: 120n,
    pendingLevels: 0n,
    gold: 10n,
    locationId: 10n,
    str: 10n, dex: 10n, cha: 10n, wis: 10n, int: 10n,
    hp: 100n, mana: 0n, stamina: 20n, maxStamina: 20n,
    ...overrides,
  };
}

function questTemplate(overrides: Record<string, any> = {}) {
  return {
    id: 50n,
    name: QUEST_NAME,
    npcId: GIVER_ID,
    targetEnemyTemplateId: 0n,
    requiredCount: 1n,
    minLevel: 1n,
    maxLevel: 10n,
    rewardXp: 40n,
    rewardGold: 25n,
    questType: 'kill',
    rewardType: 'item',
    rewardItemName: 'Bellwright Token',
    rewardItemDesc: 'Salt-crusted and humming.',
    characterId: 1n,
    ...overrides,
  };
}

/** A delivery quest given at Saltmere (10) by Hesk, picked up at Reedmouth (11), for Odra at Brackwater (12). */
const DELIVERY = {
  questType: 'delivery',
  targetNpcId: RECIPIENT_ID,
  targetLocationId: 12n,
  sourceLocationId: 11n,
  targetItemName: 'Sealed Ledger',
};

type Opts = { char?: Record<string, any>; qt?: Record<string, any>; qi?: Record<string, any>; seed?: Record<string, any[]>; noQuest?: boolean };

function newCtx(opts: Opts = {}) {
  return createMockCtx({
    seed: {
      player: [{ id: alice, userId: 7n, activeCharacterId: 1n }],
      character: [character(opts.char)],
      npc: [
        { id: GIVER_ID, name: GIVER, npcType: 'quest', locationId: 10n, description: 'A bell-founder.', greeting: 'Well met.', gender: 'male' },
        { id: RECIPIENT_ID, name: RECIPIENT, npcType: 'quest', locationId: 12n, description: 'A harbor clerk.', greeting: 'Yes?', gender: 'female' },
      ],
      location: [{ id: 10n, name: 'Saltmere' }, { id: 11n, name: 'Reedmouth' }, { id: 12n, name: 'Brackwater' }],
      quest_template: [questTemplate(opts.qt)],
      quest_instance: opts.noQuest ? [] : [{ id: 60n, characterId: 1n, questTemplateId: 50n, progress: 1n, completed: true, ...opts.qi }],
      ...opts.seed,
    },
    sender: alice,
    timestampMicros: T0,
    strict: true,
  });
}

const rows = (ctx: any, table: string): any[] => ctx.db._tables[table] ?? [];
const messages = (ctx: any): string[] => rows(ctx, 'event_private').map((e) => e.message);
const hail = (ctx: any, npcName: string) => handlers.hail_npc(ctx, { characterId: 1n, npcName });
const turnInQuest = (ctx: any) => handlers.turn_in_quest(ctx, { characterId: 1n, questInstanceId: 60n });

const FILLER_TEMPLATE = { id: 900n, name: 'River Pebble', slot: 'junk', isJunk: true, stackable: false };
function bagSeed(count: number) {
  const items: any[] = Array.from({ length: count }, (_, i) => ({
    id: 1000n + BigInt(i), templateId: 900n, ownerCharacterId: 1n, equippedSlot: undefined, quantity: 1n,
  }));
  return { item_template: [FILLER_TEMPLATE], item_instance: items };
}

/** Everything a turn-in can change, stripped of row ids, so two paths can be compared. */
function outcome(ctx: any) {
  const ch = rows(ctx, 'character')[0];
  const strip = ({ id: _id, ...rest }: any) => rest;
  const rewardTemplates = rows(ctx, 'item_template').filter((t) => t.id !== FILLER_TEMPLATE.id);
  return {
    character: { level: ch.level, xp: ch.xp, pendingLevels: ch.pendingLevels, gold: ch.gold },
    questInstances: rows(ctx, 'quest_instance').map(strip),
    rewardTemplates: rewardTemplates.map(strip),
    rewardInstances: rows(ctx, 'item_instance')
      .filter((i) => rewardTemplates.some((t) => t.id === i.templateId))
      .map(({ id: _id, templateId: _t, ...rest }: any) => rest),
    affinity: rows(ctx, 'npc_affinity').map((a) => ({ npcId: a.npcId, affinity: a.affinity })),
    memory: rows(ctx, 'npc_memory').map((m) => ({ npcId: m.npcId, questsCompleted: JSON.parse(m.memoryJson).questsCompleted })),
  };
}

/** The quest instance after a turn-in: kept as history, completedAt = the turn-in time. */
const TURNED_IN = { characterId: 1n, questTemplateId: 50n, progress: 1n, completed: true, completedAt: { microsSinceUnixEpoch: T0 } };

const GREETING = (name: string) => `${name} nods but has nothing to say.`;

describe('hailing the giver of a completed quest', () => {
  it('gives the same xp, gold, item, affinity and memory as turn_in_quest, and keeps the instance as turned-in history', () => {
    const viaHail = newCtx();
    hail(viaHail, GIVER);
    const viaReducer = newCtx();
    turnInQuest(viaReducer);

    expect(outcome(viaHail)).toEqual(outcome(viaReducer));

    const o = outcome(viaHail);
    expect(o.questInstances).toEqual([TURNED_IN]);
    expect(o.character).toEqual({ level: 2n, xp: 160n, pendingLevels: 0n, gold: 35n });
    expect(o.rewardTemplates.map((t: any) => t.name)).toEqual(['Bellwright Token']);
    expect(o.rewardInstances).toHaveLength(1);
    expect(o.rewardInstances[0].ownerCharacterId).toBe(1n);
    expect(o.affinity).toEqual([{ npcId: GIVER_ID, affinity: 10n }]);
    expect(o.memory).toEqual([{ npcId: GIVER_ID, questsCompleted: [QUEST_NAME] }]);
    expect(messages(viaHail)).toContain('+25 gold from quest reward.');
    expect(messages(viaHail)).toContain('Received: Bellwright Token!');
  });

  it('xp crossing a level threshold earns a pending level and the [Level Up] prompt', () => {
    const viaHail = newCtx({ qt: { rewardXp: 150n } });
    hail(viaHail, GIVER);
    const viaReducer = newCtx({ qt: { rewardXp: 150n } });
    turnInQuest(viaReducer);

    expect(outcome(viaHail)).toEqual(outcome(viaReducer));
    expect(outcome(viaHail).character).toEqual({ level: 2n, xp: 270n, pendingLevels: 1n, gold: 35n });
    expect(messages(viaHail)).toContain(`Quest "${QUEST_NAME}" complete! +150 XP`);
    expect(messages(viaHail)).toContain('You can advance to level 3! Click [Level Up] when ready.');
  });

  it('an xp/gold-only quest turns in (even with full bags) with no item', () => {
    const qt = { rewardType: 'gold', rewardItemName: undefined };
    const viaHail = newCtx({ qt, seed: bagSeed(MAX_INVENTORY_SLOTS) });
    hail(viaHail, GIVER);
    const viaReducer = newCtx({ qt, seed: bagSeed(MAX_INVENTORY_SLOTS) });
    turnInQuest(viaReducer);

    expect(outcome(viaHail)).toEqual(outcome(viaReducer));
    const o = outcome(viaHail);
    expect(o.questInstances).toEqual([TURNED_IN]);
    expect(o.character).toEqual({ level: 2n, xp: 160n, pendingLevels: 0n, gold: 35n });
    expect(o.rewardTemplates).toEqual([]);
    expect(o.memory).toEqual([{ npcId: GIVER_ID, questsCompleted: [QUEST_NAME] }]);
  });

  it('the turned-in quest cannot be paid again by turn_in_quest or a second hail', () => {
    const ctx = newCtx();
    hail(ctx, GIVER);
    const after = outcome(ctx);
    turnInQuest(ctx);
    hail(ctx, GIVER);
    const again = outcome(ctx);
    expect(again.character).toEqual(after.character);
    expect(again.rewardInstances).toEqual(after.rewardInstances);
    expect(again.memory).toEqual(after.memory);
  });

  it('turn-in takes priority over the greeting', () => {
    const ctx = newCtx();
    hail(ctx, GIVER);
    expect(messages(ctx)).not.toContain(GREETING(GIVER));
  });

  it('a quest not yet complete is not turned in; the greeting runs', () => {
    const ctx = newCtx({ qi: { progress: 0n, completed: false } });
    hail(ctx, GIVER);
    const o = outcome(ctx);
    expect(o.questInstances).toHaveLength(1);
    expect(o.character).toEqual({ level: 2n, xp: 120n, pendingLevels: 0n, gold: 10n });
    expect(o.memory).toEqual([]);
    expect(messages(ctx)).toContain(GREETING(GIVER));
  });

  describe('full bags', () => {
    it('refuses in voice, applies nothing, keeps the quest ready, and still greets', () => {
      const ctx = newCtx({ seed: bagSeed(MAX_INVENTORY_SLOTS) });
      hail(ctx, GIVER);

      // The greeting alone: the same hail with no quest at all.
      const control = newCtx({ seed: bagSeed(MAX_INVENTORY_SLOTS), noQuest: true });
      hail(control, GIVER);

      const o = outcome(ctx);
      expect(o.questInstances).toEqual([{ characterId: 1n, questTemplateId: 50n, progress: 1n, completed: true }]);
      expect(o.character).toEqual({ level: 2n, xp: 120n, pendingLevels: 0n, gold: 10n });
      expect(o.rewardTemplates).toEqual([]);
      expect(rows(ctx, 'item_instance')).toHaveLength(MAX_INVENTORY_SLOTS);
      expect(o.memory).toEqual([]);
      expect(o.affinity).toEqual(outcome(control).affinity); // only the greeting's affinity

      const msgs = messages(ctx);
      const refusal = msgs.find((m) => m.includes('pack is full'));
      expect(refusal).toBe(
        `${GIVER} holds out your reward for "${QUEST_NAME}", but your pack is full and you cannot take it. Free a space in your pack and turn the quest in again.`,
      );
      expect(msgs).toContain(GREETING(GIVER));
    });

    it('after freeing a slot the next hail turns the quest in', () => {
      const ctx = newCtx({ seed: bagSeed(MAX_INVENTORY_SLOTS) });
      hail(ctx, GIVER);
      ctx.db.item_instance.id.delete(1000n);
      hail(ctx, GIVER);
      const o = outcome(ctx);
      expect(o.questInstances).toEqual([TURNED_IN]);
      expect(o.character.gold).toBe(35n);
      expect(o.rewardTemplates.map((t: any) => t.name)).toEqual(['Bellwright Token']);
      expect(o.memory).toEqual([{ npcId: GIVER_ID, questsCompleted: [QUEST_NAME] }]);
    });
  });
});

describe('delivery quest with a recipient', () => {
  const atRecipient = { locationId: 12n };

  it('hailing the recipient with the package gives the same rewards as turn_in_quest there and keeps the instance as turned-in history', () => {
    const viaHail = newCtx({ char: atRecipient, qt: DELIVERY });
    hail(viaHail, RECIPIENT);
    const viaReducer = newCtx({ char: atRecipient, qt: DELIVERY });
    turnInQuest(viaReducer);

    expect(outcome(viaHail)).toEqual(outcome(viaReducer));

    const o = outcome(viaHail);
    expect(o.questInstances).toEqual([TURNED_IN]);
    expect(o.character).toEqual({ level: 2n, xp: 160n, pendingLevels: 0n, gold: 35n });
    expect(o.rewardTemplates.map((t: any) => t.name)).toEqual(['Bellwright Token']);
    expect(o.rewardInstances).toHaveLength(1);
    // Affinity with the recipient, who accepts the delivery; memory with both.
    expect(o.affinity).toEqual([{ npcId: RECIPIENT_ID, affinity: 10n }]);
    expect(o.memory).toEqual(expect.arrayContaining([
      { npcId: GIVER_ID, questsCompleted: [QUEST_NAME] },
      { npcId: RECIPIENT_ID, questsCompleted: [QUEST_NAME] },
    ]));
    expect(o.memory).toHaveLength(2);
    expect(messages(viaHail)).toContain(`You present your completed quest "${QUEST_NAME}" to ${RECIPIENT}.`);
  });

  it('xp crossing a level threshold earns a pending level', () => {
    const qt = { ...DELIVERY, rewardXp: 150n };
    const viaHail = newCtx({ char: atRecipient, qt });
    hail(viaHail, RECIPIENT);
    const viaReducer = newCtx({ char: atRecipient, qt });
    turnInQuest(viaReducer);
    expect(outcome(viaHail)).toEqual(outcome(viaReducer));
    expect(outcome(viaHail).character).toEqual({ level: 2n, xp: 270n, pendingLevels: 1n, gold: 35n });
    expect(messages(viaHail)).toContain('You can advance to level 3! Click [Level Up] when ready.');
  });

  it('an xp/gold-only delivery turns in with full bags', () => {
    const qt = { ...DELIVERY, rewardType: 'xp', rewardItemName: undefined, rewardGold: 5n };
    const ctx = newCtx({ char: atRecipient, qt, seed: bagSeed(MAX_INVENTORY_SLOTS) });
    hail(ctx, RECIPIENT);
    const o = outcome(ctx);
    expect(o.questInstances).toEqual([TURNED_IN]);
    expect(o.character).toEqual({ level: 2n, xp: 160n, pendingLevels: 0n, gold: 15n });
    expect(o.rewardTemplates).toEqual([]);
  });

  it('full bags: the recipient refuses in voice, nothing is applied, and the greeting still runs', () => {
    const ctx = newCtx({ char: atRecipient, qt: DELIVERY, seed: bagSeed(MAX_INVENTORY_SLOTS) });
    hail(ctx, RECIPIENT);
    const control = newCtx({ char: atRecipient, qt: DELIVERY, seed: bagSeed(MAX_INVENTORY_SLOTS), noQuest: true });
    hail(control, RECIPIENT);

    const o = outcome(ctx);
    expect(o.questInstances).toEqual([{ characterId: 1n, questTemplateId: 50n, progress: 1n, completed: true }]);
    expect(o.character).toEqual({ level: 2n, xp: 120n, pendingLevels: 0n, gold: 10n });
    expect(o.rewardTemplates).toEqual([]);
    expect(o.memory).toEqual([]);
    expect(o.affinity).toEqual(outcome(control).affinity);
    expect(messages(ctx)).toContain(
      `${RECIPIENT} holds out your reward for "${QUEST_NAME}", but your pack is full and you cannot take it. Free a space in your pack and turn the quest in again.`,
    );
    expect(messages(ctx)).toContain(GREETING(RECIPIENT));
  });

  it('a delivery whose package was never picked up is not paid', () => {
    const ctx = newCtx({ char: atRecipient, qt: DELIVERY, qi: { progress: 0n, completed: false } });
    hail(ctx, RECIPIENT);
    const o = outcome(ctx);
    expect(o.questInstances).toHaveLength(1);
    expect(o.questInstances[0].completed).toBe(false);
    expect(o.character).toEqual({ level: 2n, xp: 120n, pendingLevels: 0n, gold: 10n });
    expect(o.memory).toEqual([]);
  });

  it('is turned in to the recipient, not the giver', () => {
    const ctx = newCtx({ qt: DELIVERY }); // at the giver's location
    hail(ctx, GIVER);
    expect(outcome(ctx).questInstances).toHaveLength(1);
    turnInQuest(ctx);
    expect(outcome(ctx).questInstances).toHaveLength(1);
    expect(messages(ctx)).toContain(`You must return to ${RECIPIENT} at Brackwater to turn in this quest.`);
  });
});

describe('delivery quest without a recipient', () => {
  it('is turned in by hailing the giver, like any other quest', () => {
    const qt = { ...DELIVERY, targetNpcId: undefined, targetLocationId: undefined };
    const viaHail = newCtx({ qt });
    hail(viaHail, GIVER);
    const viaReducer = newCtx({ qt });
    turnInQuest(viaReducer);
    expect(outcome(viaHail)).toEqual(outcome(viaReducer));
    expect(outcome(viaHail).questInstances).toEqual([TURNED_IN]);
    expect(outcome(viaHail).memory).toEqual([{ npcId: GIVER_ID, questsCompleted: [QUEST_NAME] }]);
  });
});
