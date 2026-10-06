/**
 * Quest turn-in history, Journal entry and leftovers (quick 261006-hyu). Runs the REAL handlers captured
 * from index.ts on the strict mock db. Every turn-in path (turn_in_quest, the "turn in <quest>" intent and
 * hailing the turn-in NPC) is checked for:
 *   - the quest instance is kept as history with completedAt = the turn-in time (it is not deleted);
 *   - a turned-in instance is refused by every path ("You've already turned in ..."), paying nothing,
 *     including a second turn-in through another path;
 *   - a fresh completed instance (completedAt empty) still pays;
 *   - the turn-in NPC's line goes to the Journal (npc_dialog), worded for each quest type;
 *   - the quest's quest_item rows (the delivered package) are deleted, other quests' rows stay.
 * Turned-in rows are not active: the quests list, abandon (reducer and intent), the active-quest counts.
 * The say reducer's deprecated dialogue-tree quest accept words the objective for the quest type.
 */
import { describe, it, expect, vi, beforeAll } from 'vitest';
import { capturedReducer } from '../helpers/schema_recorder';
import { createMockCtx } from '../helpers/test-utils';
import { getActiveQuestCount, getActiveQuestCountForNpc } from '../helpers/npc_conversation';

vi.mock('spacetimedb/server', async () =>
  (await import('../helpers/schema_recorder')).createRecordingServerMock(),
);

const T0 = 1_700_000_000_000_000n;
const alice = { toHexString: () => 'a'.repeat(64) };

const handlers: Record<string, (...args: any[]) => any> = {};

beforeAll(async () => {
  await import('../index');
  for (const name of ['turn_in_quest', 'submit_intent', 'hail_npc', 'abandon_quest', 'say']) {
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
const TURNED_IN_AT = { microsSinceUnixEpoch: T0 - 1_000n };

function questTemplate(overrides: Record<string, any> = {}) {
  return {
    id: 50n, name: QUEST_NAME, npcId: GIVER_ID, targetEnemyTemplateId: 0n, requiredCount: 1n,
    minLevel: 1n, maxLevel: 10n, rewardXp: 40n, rewardGold: 25n, questType: 'kill', rewardType: 'gold',
    characterId: 1n,
    ...overrides,
  };
}

function newCtx(opts: { char?: Record<string, any>; qt?: Record<string, any>; qi?: Record<string, any>; seed?: Record<string, any[]> } = {}) {
  return createMockCtx({
    seed: {
      player: [{ id: alice, userId: 7n, activeCharacterId: 1n }],
      character: [{
        id: 1n, ownerUserId: 7n, name: 'Mirel', className: 'Ashwarden', level: 2n, xp: 120n, pendingLevels: 0n, gold: 10n,
        locationId: 10n, str: 10n, dex: 10n, cha: 10n, wis: 10n, int: 10n,
        hp: 100n, mana: 0n, stamina: 20n, maxStamina: 20n, ...opts.char,
      }],
      npc: [
        { id: GIVER_ID, name: GIVER, npcType: 'quest', locationId: 10n, description: 'A bell-founder.', greeting: 'Well met.', gender: 'male' },
        { id: RECIPIENT_ID, name: RECIPIENT, npcType: 'quest', locationId: 12n, description: 'A harbor clerk.', greeting: 'Yes?', gender: 'female' },
      ],
      location: [{ id: 10n, name: 'Saltmere' }, { id: 11n, name: 'Reedmouth' }, { id: 12n, name: 'Brackwater' }],
      quest_template: [questTemplate(opts.qt)],
      quest_instance: [{ id: 60n, characterId: 1n, questTemplateId: 50n, progress: 1n, completed: true, ...opts.qi }],
      ...opts.seed,
    },
    sender: alice,
    timestampMicros: T0,
    strict: true,
  });
}

const rows = (ctx: any, table: string): any[] => ctx.db._tables[table] ?? [];
const messages = (ctx: any): string[] => rows(ctx, 'event_private').map((e) => e.message);
const journal = (ctx: any): string[] => rows(ctx, 'npc_dialog').map((d) => d.text);
const gold = (ctx: any): bigint => rows(ctx, 'character')[0].gold;

const PATHS = [
  { label: 'turn_in_quest', turnIn: (ctx: any) => handlers.turn_in_quest(ctx, { characterId: 1n, questInstanceId: 60n }), npc: GIVER },
  { label: '"turn in <quest>" intent', turnIn: (ctx: any) => handlers.submit_intent(ctx, { characterId: 1n, text: `turn in ${QUEST_NAME}` }), npc: GIVER },
  { label: 'hail_npc', turnIn: (ctx: any) => handlers.hail_npc(ctx, { characterId: 1n, npcName: GIVER }), npc: GIVER },
];

describe.each(PATHS)('$label', ({ turnIn }) => {
  it('keeps the quest instance as history with completedAt set to the turn-in time', () => {
    const ctx = newCtx();
    turnIn(ctx);
    expect(rows(ctx, 'quest_instance')).toEqual([
      { id: 60n, characterId: 1n, questTemplateId: 50n, progress: 1n, completed: true, completedAt: { microsSinceUnixEpoch: T0 } },
    ]);
  });

  it('still pays a fresh completed quest (completedAt empty)', () => {
    const ctx = newCtx();
    turnIn(ctx);
    expect(gold(ctx)).toBe(35n);
    expect(rows(ctx, 'character')[0].xp).toBe(160n);
  });

  it('refuses a quest that is already turned in and pays nothing', () => {
    const ctx = newCtx({ qi: { completedAt: TURNED_IN_AT } });
    turnIn(ctx);
    expect(gold(ctx)).toBe(10n);
    expect(rows(ctx, 'character')[0].xp).toBe(120n);
    expect(rows(ctx, 'npc_memory')).toEqual([]);
    expect(rows(ctx, 'quest_instance')[0].completedAt).toEqual(TURNED_IN_AT);
    expect(journal(ctx)).not.toContain(`${GIVER} says, "Well done! You have slain 1 creatures(s)."`);
  });

  it('is not paid a second time by any path after it was turned in', () => {
    const ctx = newCtx();
    turnIn(ctx);
    const after = { gold: gold(ctx), xp: rows(ctx, 'character')[0].xp, memory: rows(ctx, 'npc_memory').length };
    for (const other of PATHS) other.turnIn(ctx);
    expect({ gold: gold(ctx), xp: rows(ctx, 'character')[0].xp, memory: rows(ctx, 'npc_memory').length }).toEqual(after);
    expect(rows(ctx, 'quest_instance')[0].completedAt).toEqual({ microsSinceUnixEpoch: T0 });
  });
});

describe('the already-turned-in refusal', () => {
  it.each(PATHS.filter((p) => p.label !== 'hail_npc'))('$label says so', ({ turnIn }) => {
    const ctx = newCtx({ qi: { completedAt: TURNED_IN_AT } });
    turnIn(ctx);
    expect(messages(ctx)).toContain(`You've already turned in ${QUEST_NAME}.`);
  });

  it('hailing does not pay a turned-in quest and greets as usual', () => {
    const ctx = newCtx({ qi: { completedAt: TURNED_IN_AT } });
    handlers.hail_npc(ctx, { characterId: 1n, npcName: GIVER });
    expect(gold(ctx)).toBe(10n);
    expect(messages(ctx)).toContain(`${GIVER} nods but has nothing to say.`);
  });
});

describe('the Journal entry', () => {
  const FIXTURE = {
    enemy_template: [{ id: 70n, name: 'Reed Wolf' }],
  };

  type Case = { type: string; qt: Record<string, any>; at?: bigint; npc: string; line: string };
  const CASES: Case[] = [
    { type: 'kill', qt: { targetEnemyTemplateId: 70n, requiredCount: 3n }, npc: GIVER, line: 'Well done! You have slain 3 Reed Wolf(s).' },
    { type: 'kill_loot', qt: { questType: 'kill_loot', targetEnemyTemplateId: 70n, requiredCount: 2n, targetItemName: 'Wolf Pelt' }, npc: GIVER, line: 'Well done! You have brought me 2 Wolf Pelt(s).' },
    { type: 'boss_kill', qt: { questType: 'boss_kill', targetEnemyTemplateId: 70n, targetItemName: 'Old Gaunt' }, npc: GIVER, line: 'It is done, then. Old Gaunt is dead. Well done!' },
    { type: 'explore', qt: { questType: 'explore', targetLocationId: 11n }, npc: GIVER, line: 'So you found your way to Reedmouth. Well done!' },
    { type: 'delivery', qt: { questType: 'delivery', targetNpcId: RECIPIENT_ID, targetLocationId: 12n, targetItemName: 'Sealed Ledger' }, at: 12n, npc: RECIPIENT, line: "Ah, you've brought Sealed Ledger. Thank you." },
    { type: 'delivery without an item name', qt: { questType: 'delivery', targetNpcId: RECIPIENT_ID }, at: 12n, npc: RECIPIENT, line: "Ah, you've brought it. Thank you." },
    { type: 'gather', qt: { questType: 'gather', requiredCount: 4n, targetItemName: 'Salt Reed' }, npc: GIVER, line: 'You have gathered 4 Salt Reed(s). Well done!' },
    { type: 'escort', qt: { questType: 'escort' }, npc: GIVER, line: 'You saw the journey through. Thank you.' },
    { type: 'interact', qt: { questType: 'interact' }, npc: GIVER, line: "You've seen to it. Thank you." },
    { type: 'discover', qt: { questType: 'discover', targetLocationId: 11n }, npc: GIVER, line: 'You found Reedmouth, then. Well done!' },
    { type: 'an unknown type', qt: { questType: 'weird' }, npc: GIVER, line: `Well done! "${QUEST_NAME}" is finished.` },
  ];

  describe.each(PATHS)('$label', ({ turnIn }) => {
    it('writes the NPC line for the kill quest', () => {
      const ctx = newCtx({ qt: CASES[0].qt, seed: FIXTURE });
      turnIn(ctx);
      expect(journal(ctx)).toEqual([`${GIVER} says, "${CASES[0].line}"`]);
      expect(rows(ctx, 'npc_dialog')[0]).toMatchObject({ characterId: 1n, npcId: GIVER_ID });
    });
  });

  it.each(CASES)('wording for $type', ({ qt, at, npc, line }) => {
    const ctx = newCtx({ qt, char: at ? { locationId: at } : undefined, seed: FIXTURE });
    handlers.turn_in_quest(ctx, { characterId: 1n, questInstanceId: 60n });
    expect(journal(ctx)).toEqual([`${npc} says, "${line}"`]);
    const dialog = rows(ctx, 'npc_dialog')[0];
    expect(dialog.npcId).toBe(npc === GIVER ? GIVER_ID : RECIPIENT_ID);
  });

  it('a delivery is hailed at the recipient and journaled there', () => {
    const qt = CASES[4].qt;
    const ctx = newCtx({ qt, char: { locationId: 12n } });
    handlers.hail_npc(ctx, { characterId: 1n, npcName: RECIPIENT });
    expect(journal(ctx)).toEqual([`${RECIPIENT} says, "${CASES[4].line}"`]);
  });

  it('is not written when the turn-in is refused (wrong place, full bags, already turned in)', () => {
    const away = newCtx({ char: { locationId: 11n } });
    handlers.turn_in_quest(away, { characterId: 1n, questInstanceId: 60n });
    expect(journal(away)).toEqual([]);

    const done = newCtx({ qi: { completedAt: TURNED_IN_AT } });
    handlers.turn_in_quest(done, { characterId: 1n, questInstanceId: 60n });
    expect(journal(done)).toEqual([]);
  });

  it('never uses the banned word', () => {
    for (const c of CASES) {
      const ctx = newCtx({ qt: c.qt, char: c.at ? { locationId: c.at } : undefined, seed: FIXTURE });
      handlers.turn_in_quest(ctx, { characterId: 1n, questInstanceId: 60n });
      expect(journal(ctx).join(' ').toLowerCase()).not.toContain('rip' + 'ple');
    }
  });
});

describe('the delivered package', () => {
  const PACKAGE = { id: 70n, characterId: 1n, questTemplateId: 50n, locationId: 11n, name: 'Sealed Ledger', discovered: true, looted: true };
  const OTHER = { id: 71n, characterId: 1n, questTemplateId: 99n, locationId: 11n, name: 'Other Parcel', discovered: true, looted: true };
  const THEIRS = { id: 72n, characterId: 2n, questTemplateId: 50n, locationId: 11n, name: 'Sealed Ledger', discovered: true, looted: true };

  it.each(PATHS)('$label deletes the quest_item row of the turned-in quest and no other', ({ turnIn }) => {
    const ctx = newCtx({ seed: { quest_item: [PACKAGE, OTHER, THEIRS] } });
    turnIn(ctx);
    expect(rows(ctx, 'quest_item').map((q) => q.id)).toEqual([71n, 72n]);
  });

  it('a refused turn-in (wrong place) keeps the package', () => {
    const ctx = newCtx({ char: { locationId: 11n }, seed: { quest_item: [PACKAGE] } });
    handlers.turn_in_quest(ctx, { characterId: 1n, questInstanceId: 60n });
    expect(rows(ctx, 'quest_item')).toHaveLength(1);
  });
});

describe('a turned-in row is not an active quest', () => {
  const turnedIn = { completedAt: TURNED_IN_AT };

  it('does not count toward the active quest counts', () => {
    const ctx = newCtx({ qi: turnedIn });
    expect(getActiveQuestCount(ctx, 1n)).toBe(0);
    expect(getActiveQuestCountForNpc(ctx, 1n, GIVER_ID)).toBe(0);
  });

  it('is not listed by the quests command', () => {
    const ctx = newCtx({ qi: turnedIn });
    handlers.submit_intent(ctx, { characterId: 1n, text: 'quests' });
    expect(messages(ctx)).toContain('You have no active quests. Speak with NPCs to discover what needs doing.');
    expect(messages(ctx).join('\n')).not.toContain(QUEST_NAME);
  });

  it('is left out of the list and the count while an open quest is shown', () => {
    const ctx = newCtx({
      qi: turnedIn,
      seed: {
        quest_template: [questTemplate(), questTemplate({ id: 51n, name: 'Second Errand' })],
        quest_instance: [
          { id: 60n, characterId: 1n, questTemplateId: 50n, progress: 1n, completed: true, ...turnedIn },
          { id: 61n, characterId: 1n, questTemplateId: 51n, progress: 0n, completed: false },
        ],
      },
    });
    handlers.submit_intent(ctx, { characterId: 1n, text: 'quests' });
    const list = messages(ctx).find((m) => m.startsWith('Active Quests'))!;
    expect(list).toContain('Active Quests (1/4):');
    expect(list).toContain('Second Errand');
    expect(list).not.toContain(QUEST_NAME);
  });

  it('cannot be abandoned by the reducer or the intents, and is kept', () => {
    const ctx = newCtx({ qi: turnedIn });
    handlers.abandon_quest(ctx, { characterId: 1n, questInstanceId: 60n });
    handlers.submit_intent(ctx, { characterId: 1n, text: `abandon ${QUEST_NAME}` });
    handlers.submit_intent(ctx, { characterId: 1n, text: `confirm abandon ${QUEST_NAME}` });
    expect(rows(ctx, 'quest_instance')).toHaveLength(1);
    expect(rows(ctx, 'npc_affinity')).toEqual([]);
    expect(messages(ctx).filter((m) => m === `You've already turned in ${QUEST_NAME}; it cannot be abandoned.`)).toHaveLength(3);
  });

  it('an open quest can still be abandoned', () => {
    const ctx = newCtx({ qi: { completed: false, progress: 0n } });
    handlers.abandon_quest(ctx, { characterId: 1n, questInstanceId: 60n });
    expect(rows(ctx, 'quest_instance')).toEqual([]);
  });

  it('is not re-accepted through the dialogue-tree quest offer', () => {
    const ctx = newCtx({
      qi: turnedIn,
      seed: {
        npc_dialogue_option: [{
          id: 1n, npcId: GIVER_ID, parentOptionId: undefined, playerText: 'work', npcResponse: 'There is work.',
          requiredAffinity: 0n, isAffinityLocked: false, affinityHint: undefined, affinityChange: 0n, questTemplateName: QUEST_NAME,
        }],
      },
    });
    handlers.say(ctx, { characterId: 1n, message: 'work' });
    expect(rows(ctx, 'quest_instance')).toHaveLength(1);
    expect(rows(ctx, 'quest_instance')[0].completedAt).toEqual(TURNED_IN_AT);
  });
});

describe('the dialogue-tree quest auto-accept wording (say reducer)', () => {
  function offer(qt: Record<string, any>, seed: Record<string, any[]> = {}) {
    const ctx = newCtx({
      qt,
      seed: {
        quest_instance: [],
        npc_dialogue_option: [{
          id: 1n, npcId: GIVER_ID, parentOptionId: undefined, playerText: 'work', npcResponse: 'There is work.',
          requiredAffinity: 0n, isAffinityLocked: false, affinityHint: undefined, affinityChange: 0n, questTemplateName: QUEST_NAME,
        }],
        ...seed,
      },
    });
    handlers.say(ctx, { characterId: 1n, message: 'work' });
    return ctx;
  }
  const accepted = (ctx: any) => messages(ctx).find((m) => m.includes('Quest accepted.'));
  const FIXTURE = { enemy_template: [{ id: 70n, name: 'Reed Wolf' }] };

  const CASES: [string, Record<string, any>, string][] = [
    ['kill', { targetEnemyTemplateId: 70n, requiredCount: 3n }, 'Slay 3 Reed Wolf(s).'],
    ['kill_loot', { questType: 'kill_loot', targetEnemyTemplateId: 70n, requiredCount: 2n, targetItemName: 'Wolf Pelt' }, 'Hunt Reed Wolf(s) and collect 2 Wolf Pelt(s).'],
    ['explore', { questType: 'explore', targetLocationId: 11n }, 'Explore Reedmouth.'],
    ['delivery', { questType: 'delivery', targetNpcId: RECIPIENT_ID, targetLocationId: 12n, targetItemName: 'Sealed Ledger' }, 'Deliver Sealed Ledger to Odra Fenn at Brackwater.'],
    ['boss_kill', { questType: 'boss_kill', targetEnemyTemplateId: 70n, targetItemName: 'Old Gaunt', targetLocationId: 11n }, 'Defeat Old Gaunt at Reedmouth.'],
    ['gather', { questType: 'gather', requiredCount: 4n, targetItemName: 'Salt Reed' }, 'Gather 4 Salt Reed(s).'],
    ['escort', { questType: 'escort', targetNpcId: RECIPIENT_ID, targetLocationId: 12n }, 'Escort Odra Fenn to Brackwater.'],
    ['interact', { questType: 'interact', targetItemName: 'the bell rope' }, 'Interact with the bell rope.'],
    ['discover', { questType: 'discover', targetLocationId: 11n }, 'Discover Reedmouth.'],
  ];

  it.each(CASES)('words the objective for %s', (_type, qt, objective) => {
    const ctx = offer(qt, FIXTURE);
    expect(accepted(ctx)).toBe(`${GIVER} offers you "${QUEST_NAME}". Objective: ${objective} Quest accepted.`);
    expect(rows(ctx, 'quest_instance')).toHaveLength(1);
    expect(journal(ctx)).toContain(accepted(ctx));
  });

  it('a kill quest keeps the old wording', () => {
    const ctx = offer({ targetEnemyTemplateId: 70n, requiredCount: 3n }, FIXTURE);
    expect(accepted(ctx)).toContain('Slay 3 Reed Wolf(s).');
  });

  it('a non-kill quest is not worded as a slaying', () => {
    const ctx = offer({ questType: 'explore', targetLocationId: 11n }, FIXTURE);
    expect(accepted(ctx)).not.toContain('Slay');
  });
});
