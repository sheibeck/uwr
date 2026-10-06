/**
 * Typed hail turn-in (quick 261006-kpj). The new client talks to an NPC by sending "hail <name>" through
 * submit_intent, not through the hail_npc reducer, so the intent HAIL / TALK / SPEAK branch must turn in a
 * completed quest the same way hailNpc does (the shared turnInQuestsAtNpc -> turnInCompletedQuest path).
 * Runs the REAL handlers captured from index.ts on the strict mock db and checks:
 *   - "hail X", "talk to X" and "speak to X" turn in a completed quest at its giver, with the same outcome
 *     as the turn_in_quest reducer, and the quest is kept as history (completedAt set);
 *   - a delivery turns in at its recipient (and not at the giver);
 *   - a second hail pays nothing;
 *   - no completed quest (or an unfinished one) means only the greeting;
 *   - an NPC elsewhere does nothing (no such NPC here);
 *   - full bags: the in-voice refusal, nothing applied, and the greeting still shows;
 *   - the hail_npc reducer still behaves the same.
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
  for (const name of ['turn_in_quest', 'hail_npc', 'submit_intent']) {
    const h = capturedReducer(name);
    if (typeof h !== 'function') {
      throw new Error(`capturedReducer('${name}') is not a function: STOP and report; never edit production code to fix this.`);
    }
    handlers[name] = h;
  }
}, 120_000);

const GIVER_ID = 5n;
const RECIPIENT_ID = 6n;
const GIVER = 'Odalys Brannoch';
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

/** A delivery quest given at Saltmere (10) by the giver, picked up at Reedmouth (11), for Odra at Brackwater (12). */
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
        { id: GIVER_ID, name: GIVER, npcType: 'quest', locationId: 10n, description: 'A bell-founder.', greeting: 'Well met.', gender: 'female' },
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
const intent = (ctx: any, text: string) => handlers.submit_intent(ctx, { characterId: 1n, text });
const hailReducer = (ctx: any, npcName: string) => handlers.hail_npc(ctx, { characterId: 1n, npcName });
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
const UNCHANGED_CHARACTER = { level: 2n, xp: 120n, pendingLevels: 0n, gold: 10n };
const GREETING_LINE = (name: string, greeting: string) => `${name} says, "${greeting}"`;

describe('typed hail turns in a completed quest at its giver', () => {
  const phrasings = [
    `hail ${GIVER}`,
    `talk to ${GIVER}`,
    `speak to ${GIVER}`,
    `Talk ${GIVER.toUpperCase()}`,
  ];

  for (const text of phrasings) {
    it(`"${text}" gives the turn_in_quest outcome and keeps the instance as turned-in history`, () => {
      const viaIntent = newCtx();
      intent(viaIntent, text);
      const viaReducer = newCtx();
      turnInQuest(viaReducer);

      expect(outcome(viaIntent)).toEqual(outcome(viaReducer));

      const o = outcome(viaIntent);
      expect(o.questInstances).toEqual([TURNED_IN]);
      expect(o.character).toEqual({ level: 2n, xp: 160n, pendingLevels: 0n, gold: 35n });
      expect(o.rewardTemplates.map((t: any) => t.name)).toEqual(['Bellwright Token']);
      expect(o.rewardInstances).toHaveLength(1);
      expect(o.affinity).toEqual([{ npcId: GIVER_ID, affinity: 10n }]);
      expect(o.memory).toEqual([{ npcId: GIVER_ID, questsCompleted: [QUEST_NAME] }]);
      expect(messages(viaIntent)).toContain('+25 gold from quest reward.');
      expect(messages(viaIntent)).toContain('Received: Bellwright Token!');
    });
  }

  it('writes the journal line for the turn-in', () => {
    const ctx = newCtx();
    intent(ctx, `hail ${GIVER}`);
    const journal = rows(ctx, 'npc_dialog').length ? rows(ctx, 'npc_dialog') : rows(ctx, 'journal_entry');
    const reference = newCtx();
    turnInQuest(reference);
    const referenceJournal = rows(reference, 'npc_dialog').length ? rows(reference, 'npc_dialog') : rows(reference, 'journal_entry');
    expect(journal.length).toBeGreaterThan(0);
    expect(journal.length).toBe(referenceJournal.length);
  });

  it('a turn-in takes priority over the greeting', () => {
    const ctx = newCtx();
    intent(ctx, `hail ${GIVER}`);
    expect(messages(ctx)).not.toContain(GREETING_LINE(GIVER, 'Well met.'));
    expect(messages(ctx)).toContain(`You present your completed quest "${QUEST_NAME}" to ${GIVER}.`);
  });

  it('turns in a completed quest whose instance has no completedAt, never one already turned in', () => {
    const ctx = newCtx({ qi: { completedAt: undefined } });
    intent(ctx, `hail ${GIVER}`);
    expect(outcome(ctx).questInstances).toEqual([TURNED_IN]);
  });

  it('a second hail pays nothing and only greets', () => {
    const ctx = newCtx();
    intent(ctx, `hail ${GIVER}`);
    const after = outcome(ctx);
    intent(ctx, `talk to ${GIVER}`);
    intent(ctx, `speak to ${GIVER}`);
    const again = outcome(ctx);
    expect(again.character).toEqual(after.character);
    expect(again.rewardInstances).toEqual(after.rewardInstances);
    expect(again.memory).toEqual(after.memory);
    expect(again.affinity).toEqual(after.affinity);
    expect(again.questInstances).toEqual([TURNED_IN]);
    expect(messages(ctx).filter((m) => m === GREETING_LINE(GIVER, 'Well met.'))).toHaveLength(2);
    expect(messages(ctx).filter((m) => m === '+25 gold from quest reward.')).toHaveLength(1);
  });

  it('turn_in_quest cannot pay it again after a typed hail', () => {
    const ctx = newCtx();
    intent(ctx, `hail ${GIVER}`);
    const after = outcome(ctx);
    turnInQuest(ctx);
    expect(outcome(ctx).character).toEqual(after.character);
    expect(outcome(ctx).rewardInstances).toEqual(after.rewardInstances);
  });

  it('xp crossing a level threshold earns a pending level and the [Level Up] prompt', () => {
    const viaIntent = newCtx({ qt: { rewardXp: 150n } });
    intent(viaIntent, `hail ${GIVER}`);
    const viaReducer = newCtx({ qt: { rewardXp: 150n } });
    turnInQuest(viaReducer);
    expect(outcome(viaIntent)).toEqual(outcome(viaReducer));
    expect(outcome(viaIntent).character).toEqual({ level: 2n, xp: 270n, pendingLevels: 1n, gold: 35n });
    expect(messages(viaIntent)).toContain('You can advance to level 3! Click [Level Up] when ready.');
  });

  it('turns in every completed quest this NPC accepts in one hail', () => {
    const ctx = newCtx({
      seed: {
        quest_template: [questTemplate(), questTemplate({ id: 51n, name: 'The Salt Road', rewardType: 'gold', rewardItemName: undefined, rewardGold: 5n })],
        quest_instance: [
          { id: 60n, characterId: 1n, questTemplateId: 50n, progress: 1n, completed: true },
          { id: 61n, characterId: 1n, questTemplateId: 51n, progress: 1n, completed: true },
        ],
      },
    });
    intent(ctx, `hail ${GIVER}`);
    const o = outcome(ctx);
    expect(o.questInstances).toHaveLength(2);
    expect(o.questInstances.every((q: any) => q.completedAt !== undefined)).toBe(true);
    expect(o.character.gold).toBe(10n + 25n + 5n);
  });
});

describe('typed hail with nothing to turn in', () => {
  it('no quest at all: only the greeting', () => {
    const ctx = newCtx({ noQuest: true });
    intent(ctx, `hail ${GIVER}`);
    expect(messages(ctx)).toEqual([GREETING_LINE(GIVER, 'Well met.')]);
    expect(outcome(ctx).character).toEqual(UNCHANGED_CHARACTER);
  });

  it('a quest not yet complete is not turned in; only the greeting', () => {
    const ctx = newCtx({ qi: { progress: 0n, completed: false } });
    intent(ctx, `hail ${GIVER}`);
    const o = outcome(ctx);
    expect(o.questInstances).toEqual([{ characterId: 1n, questTemplateId: 50n, progress: 0n, completed: false }]);
    expect(o.character).toEqual(UNCHANGED_CHARACTER);
    expect(o.memory).toEqual([]);
    expect(messages(ctx)).toEqual([GREETING_LINE(GIVER, 'Well met.')]);
  });

  it('a completed quest for a different NPC is not turned in by hailing this one', () => {
    const ctx = newCtx({ qt: { npcId: RECIPIENT_ID } });
    intent(ctx, `hail ${GIVER}`);
    expect(outcome(ctx).questInstances).toHaveLength(1);
    expect(outcome(ctx).questInstances[0].completedAt).toBeUndefined();
    expect(outcome(ctx).character).toEqual(UNCHANGED_CHARACTER);
    expect(messages(ctx)).toEqual([GREETING_LINE(GIVER, 'Well met.')]);
  });

  it('an NPC elsewhere does nothing: no such NPC here, quest untouched', () => {
    const ctx = newCtx({ char: { locationId: 11n } });
    intent(ctx, `hail ${GIVER}`);
    const o = outcome(ctx);
    expect(o.questInstances).toEqual([{ characterId: 1n, questTemplateId: 50n, progress: 1n, completed: true }]);
    expect(o.character).toEqual(UNCHANGED_CHARACTER);
    expect(o.memory).toEqual([]);
    expect(messages(ctx)).toEqual([`No one named "${GIVER}" is here.`]);
  });
});

describe('typed hail with a delivery quest', () => {
  const atRecipient = { locationId: 12n };

  it('turns in at the recipient with the same outcome as turn_in_quest there', () => {
    const viaIntent = newCtx({ char: atRecipient, qt: DELIVERY });
    intent(viaIntent, `hail ${RECIPIENT}`);
    const viaReducer = newCtx({ char: atRecipient, qt: DELIVERY });
    turnInQuest(viaReducer);

    expect(outcome(viaIntent)).toEqual(outcome(viaReducer));
    const o = outcome(viaIntent);
    expect(o.questInstances).toEqual([TURNED_IN]);
    expect(o.character).toEqual({ level: 2n, xp: 160n, pendingLevels: 0n, gold: 35n });
    expect(o.affinity).toEqual([{ npcId: RECIPIENT_ID, affinity: 10n }]);
    expect(o.memory).toHaveLength(2);
    expect(messages(viaIntent)).toContain(`You present your completed quest "${QUEST_NAME}" to ${RECIPIENT}.`);
  });

  it('is not turned in at the giver', () => {
    const ctx = newCtx({ qt: DELIVERY });
    intent(ctx, `hail ${GIVER}`);
    expect(outcome(ctx).questInstances).toEqual([{ characterId: 1n, questTemplateId: 50n, progress: 1n, completed: true }]);
    expect(outcome(ctx).character).toEqual(UNCHANGED_CHARACTER);
    expect(messages(ctx)).toEqual([GREETING_LINE(GIVER, 'Well met.')]);
  });

  it('a second hail at the recipient pays nothing', () => {
    const ctx = newCtx({ char: atRecipient, qt: DELIVERY });
    intent(ctx, `talk to ${RECIPIENT}`);
    const after = outcome(ctx);
    intent(ctx, `talk to ${RECIPIENT}`);
    expect(outcome(ctx).character).toEqual(after.character);
    expect(messages(ctx)).toContain(GREETING_LINE(RECIPIENT, 'Yes?'));
  });

  it('a delivery whose package was never picked up is not paid', () => {
    const ctx = newCtx({ char: atRecipient, qt: DELIVERY, qi: { progress: 0n, completed: false } });
    intent(ctx, `hail ${RECIPIENT}`);
    expect(outcome(ctx).questInstances[0].completed).toBe(false);
    expect(outcome(ctx).character).toEqual(UNCHANGED_CHARACTER);
  });
});

describe('typed hail with full bags', () => {
  it('refuses in voice, applies nothing, keeps the quest ready, and still greets', () => {
    const ctx = newCtx({ seed: bagSeed(MAX_INVENTORY_SLOTS) });
    intent(ctx, `hail ${GIVER}`);

    const o = outcome(ctx);
    expect(o.questInstances).toEqual([{ characterId: 1n, questTemplateId: 50n, progress: 1n, completed: true }]);
    expect(o.character).toEqual(UNCHANGED_CHARACTER);
    expect(o.rewardTemplates).toEqual([]);
    expect(o.memory).toEqual([]);
    const msgs = messages(ctx);
    expect(msgs).toContain(
      `${GIVER} holds out your reward for "${QUEST_NAME}", but your pack is full and you cannot take it. Free a space in your pack and turn the quest in again.`,
    );
    expect(msgs).toContain(GREETING_LINE(GIVER, 'Well met.'));
  });

  it('after freeing a slot the next typed hail turns the quest in', () => {
    const ctx = newCtx({ seed: bagSeed(MAX_INVENTORY_SLOTS) });
    intent(ctx, `hail ${GIVER}`);
    ctx.db.item_instance.id.delete(1000n);
    intent(ctx, `hail ${GIVER}`);
    expect(outcome(ctx).questInstances).toEqual([TURNED_IN]);
    expect(outcome(ctx).character.gold).toBe(35n);
  });
});

describe('the hail_npc reducer is unchanged', () => {
  it('turns in the giver quest with the same outcome as the typed hail, and no greeting', () => {
    const viaReducer = newCtx();
    hailReducer(viaReducer, GIVER);
    const viaIntent = newCtx();
    intent(viaIntent, `hail ${GIVER}`);

    expect(outcome(viaReducer)).toEqual(outcome(viaIntent));
    expect(outcome(viaReducer).questInstances).toEqual([TURNED_IN]);
    expect(messages(viaReducer)).not.toContain(`${GIVER} nods but has nothing to say.`);
  });

  it('with nothing to turn in it falls through to its own greeting', () => {
    const ctx = newCtx({ noQuest: true });
    hailReducer(ctx, GIVER);
    expect(messages(ctx)).toContain(`${GIVER} nods but has nothing to say.`);
    expect(outcome(ctx).character).toEqual(UNCHANGED_CHARACTER);
  });

  it('an NPC elsewhere is refused', () => {
    const ctx = newCtx({ char: { locationId: 11n } });
    hailReducer(ctx, GIVER);
    expect(messages(ctx)).toEqual(['No such NPC here']);
    expect(outcome(ctx).questInstances[0].completedAt).toBeUndefined();
  });
});
