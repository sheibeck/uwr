/**
 * Quest turn-in follow-ups (quick 261006-gy6). Both turn-in paths, the turn_in_quest reducer and the
 * "turn in <quest>" intent of submit_intent (the path the client's [Turn In] link uses), go through
 * turnInCompletedQuest. Runs the REAL handlers captured from index.ts on the strict mock db and checks,
 * for both paths:
 *   - the quest is recorded in the giver's NPC memory (the intent path used to skip it);
 *   - an item-reward quest is refused with a visible message when the bags are full, and nothing
 *     (xp, gold, item, affinity, memory, quest removal) is applied; freeing a slot lets it go through;
 *   - quest xp goes through awardXp: crossing a level threshold earns pending levels and the [Level Up]
 *     prompt, the promised amount is not rescaled, and max level still receives it;
 *   - a reward whose name matches a starter template (ensureStarterItemTemplates upserts by name) gets
 *     its own name: it neither overwrites nor is overwritten by the starter row;
 *   - turning in away from the giver is refused (turn_in_quest used to skip this check).
 */
import { describe, it, expect, vi, beforeAll } from 'vitest';
import { capturedReducer } from '../helpers/schema_recorder';
import { createMockCtx } from '../helpers/test-utils';
import { MAX_INVENTORY_SLOTS, ensureStarterItemTemplates, findItemTemplateByName } from '../helpers/items';
import { MAX_LEVEL } from '../data/xp';

vi.mock('spacetimedb/server', async () =>
  (await import('../helpers/schema_recorder')).createRecordingServerMock(),
);

const T0 = 1_700_000_000_000_000n;
const alice = { toHexString: () => 'a'.repeat(64) };

const handlers: Record<string, (...args: any[]) => any> = {};

beforeAll(async () => {
  await import('../index');
  for (const name of ['turn_in_quest', 'submit_intent']) {
    const h = capturedReducer(name);
    if (typeof h !== 'function') {
      throw new Error(`capturedReducer('${name}') is not a function: STOP and report; never edit production code to fix this.`);
    }
    handlers[name] = h;
  }
}, 120_000);

const NPC_ID = 5n;
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
    npcId: NPC_ID,
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

function newCtx(opts: { char?: Record<string, any>; qt?: Record<string, any>; seed?: Record<string, any[]> } = {}) {
  return createMockCtx({
    seed: {
      player: [{ id: alice, userId: 7n, activeCharacterId: 1n }],
      character: [character(opts.char)],
      npc: [{ id: NPC_ID, name: 'Hesk Varrow', npcType: 'quest', locationId: 10n, description: 'A bell-founder.', greeting: 'Well met.', gender: 'male' }],
      location: [{ id: 10n, name: 'Saltmere' }],
      quest_template: [questTemplate(opts.qt)],
      quest_instance: [{ id: 60n, characterId: 1n, questTemplateId: 50n, progress: 1n, completed: true }],
      ...opts.seed,
    },
    sender: alice,
    timestampMicros: T0,
    strict: true,
  });
}

const rows = (ctx: any, table: string): any[] => ctx.db._tables[table] ?? [];

const FILLER_TEMPLATE = { id: 900n, name: 'River Pebble', slot: 'junk', isJunk: true, stackable: false };

/** count unequipped filler items in the bags, plus one equipped item (equipped items take no bag slot). */
function bagSeed(count: number) {
  const items: any[] = Array.from({ length: count }, (_, i) => ({
    id: 1000n + BigInt(i), templateId: 900n, ownerCharacterId: 1n, equippedSlot: undefined, quantity: 1n,
  }));
  items.push({ id: 2000n, templateId: 900n, ownerCharacterId: 1n, equippedSlot: 'chest', quantity: 1n });
  return { item_template: [FILLER_TEMPLATE], item_instance: items };
}
const messages = (ctx: any): string[] => rows(ctx, 'event_private').map((e) => e.message);

type Path = { label: string; turnIn: (ctx: any) => void };
const PATHS: Path[] = [
  { label: 'turn_in_quest', turnIn: (ctx) => handlers.turn_in_quest(ctx, { characterId: 1n, questInstanceId: 60n }) },
  { label: '"turn in <quest>" intent', turnIn: (ctx) => handlers.submit_intent(ctx, { characterId: 1n, text: `turn in ${QUEST_NAME}` }) },
];

describe.each(PATHS)('$label', ({ turnIn }) => {
  describe('NPC memory', () => {
    it("records the quest in the giver's memory", () => {
      const ctx = newCtx();
      turnIn(ctx);
      expect(rows(ctx, 'quest_instance')).toHaveLength(0);
      const memory = rows(ctx, 'npc_memory').filter((m) => m.characterId === 1n && m.npcId === NPC_ID);
      expect(memory).toHaveLength(1);
      expect(JSON.parse(memory[0].memoryJson).questsCompleted).toEqual([QUEST_NAME]);
    });
  });

  describe('quest xp and level-ups', () => {
    // level 2 with 120 xp; level 3 needs 260 total, level 4 needs 480 (data/xp.ts).
    it('xp crossing a level threshold earns a pending level and the [Level Up] prompt', () => {
      const ctx = newCtx({ qt: { rewardXp: 150n } });
      turnIn(ctx);
      const ch = rows(ctx, 'character')[0];
      expect(ch.xp).toBe(270n); // exactly the promised 150, not rescaled
      expect(ch.pendingLevels).toBe(1n);
      expect(ch.level).toBe(2n); // applied later by the level_up reducer, as for combat xp
      expect(messages(ctx)).toContain(`Quest "${QUEST_NAME}" complete! +150 XP`);
      expect(messages(ctx)).toContain('You can advance to level 3! Click [Level Up] when ready.');
    });

    it('xp crossing two thresholds earns two pending levels', () => {
      const ctx = newCtx({ qt: { rewardXp: 500n } });
      turnIn(ctx);
      const ch = rows(ctx, 'character')[0];
      expect(ch.xp).toBe(620n);
      expect(ch.pendingLevels).toBe(2n);
      expect(messages(ctx)).toContain('You have 2 levels pending (next: level 3)! Click [Level Up] when ready.');
    });

    it('xp below the next threshold earns no level', () => {
      const ctx = newCtx();
      turnIn(ctx);
      const ch = rows(ctx, 'character')[0];
      expect(ch.xp).toBe(160n);
      expect(ch.pendingLevels).toBe(0n);
      expect(messages(ctx).some((m) => m.includes('[Level Up]'))).toBe(false);
    });

    it('at max level the promised xp is still added, with no level-up', () => {
      const ctx = newCtx({ char: { level: MAX_LEVEL, xp: 3100n } });
      turnIn(ctx);
      const ch = rows(ctx, 'character')[0];
      expect(ch.xp).toBe(3140n);
      expect(ch.pendingLevels).toBe(0n);
      expect(messages(ctx)).toContain(`Quest "${QUEST_NAME}" complete! +40 XP`);
    });
  });

  describe('reward named like a starter item', () => {
    const STARTER = 'Training Sword';
    const sameName = (ctx: any, name: string) =>
      rows(ctx, 'item_template').filter((t) => t.name.toLowerCase() === name.toLowerCase());

    it.each([STARTER, STARTER.toLowerCase()])('reward "%s" gets its own name and leaves the starter row alone', (rewardName) => {
      const ctx = newCtx({ qt: { rewardItemName: rewardName } });
      ensureStarterItemTemplates(ctx);
      const starterBefore = { ...sameName(ctx, STARTER)[0] };
      turnIn(ctx);

      // Still exactly one template by the starter name, unchanged, and it is what name lookups return.
      expect(sameName(ctx, STARTER)).toEqual([starterBefore]);
      expect(findItemTemplateByName(ctx, STARTER)?.id).toBe(starterBefore.id);

      const inst = rows(ctx, 'item_instance').find((i) => i.ownerCharacterId === 1n)!;
      const reward = rows(ctx, 'item_template').find((t) => t.id === inst.templateId)!;
      expect(reward.id).not.toBe(starterBefore.id);
      expect(reward.name).toBe(`Hesk Varrow's ${rewardName}`);
      expect(messages(ctx)).toContain(`Received: Hesk Varrow's ${rewardName}!`);
    });

    it('the starter upsert does not overwrite the reward, whatever order the table iterates in', () => {
      const ctx = newCtx({ qt: { rewardItemName: STARTER } });
      ensureStarterItemTemplates(ctx);
      turnIn(ctx);
      const inst = rows(ctx, 'item_instance').find((i) => i.ownerCharacterId === 1n)!;
      const rewardBefore = { ...rows(ctx, 'item_template').find((t) => t.id === inst.templateId) };

      // The real table has no guaranteed iteration order: put the reward first, then re-run the upsert
      // (it runs at init and on every character creation).
      ctx.db._tables.item_template.reverse();
      ensureStarterItemTemplates(ctx);

      expect(rows(ctx, 'item_template').find((t) => t.id === rewardBefore.id)).toEqual(rewardBefore);
      expect(findItemTemplateByName(ctx, STARTER)?.id).not.toBe(rewardBefore.id);
    });

    it('a second clash on the same name gets a number', () => {
      const ctx = newCtx({ qt: { rewardItemName: STARTER } });
      ensureStarterItemTemplates(ctx);
      ctx.db.item_template.insert({ ...rows(ctx, 'item_template')[0], id: 0n, name: `Hesk Varrow's ${STARTER}` });
      turnIn(ctx);
      expect(messages(ctx)).toContain(`Received: Hesk Varrow's ${STARTER} 2!`);
    });

    it('a name no template uses is kept as the quest promised it', () => {
      const ctx = newCtx();
      ensureStarterItemTemplates(ctx);
      turnIn(ctx);
      expect(sameName(ctx, 'Bellwright Token')).toHaveLength(1);
      expect(messages(ctx)).toContain('Received: Bellwright Token!');
    });
  });

  describe("giver's location", () => {
    it('away from the giver: refuses with the way back and applies nothing', () => {
      const ctx = newCtx({ char: { locationId: 11n } });
      turnIn(ctx);
      expect(rows(ctx, 'quest_instance')).toHaveLength(1);
      expect(rows(ctx, 'character')[0].xp).toBe(120n);
      expect(rows(ctx, 'character')[0].gold).toBe(10n);
      expect(rows(ctx, 'item_template')).toHaveLength(0);
      expect(rows(ctx, 'npc_memory')).toHaveLength(0);
      expect(messages(ctx)).toEqual(['You must return to Hesk Varrow at Saltmere to turn in this quest.']);
    });
  });

  describe('inventory space', () => {
    it('full bags: refuses the turn-in with a visible message and applies nothing', () => {
      const ctx = newCtx({ seed: bagSeed(MAX_INVENTORY_SLOTS) });
      const before = { ...rows(ctx, 'character')[0] };
      turnIn(ctx);

      const ch = rows(ctx, 'character')[0];
      expect(ch.xp).toBe(before.xp);
      expect(ch.gold).toBe(before.gold);
      expect(ch.pendingLevels).toBe(before.pendingLevels);
      expect(rows(ctx, 'quest_instance')).toHaveLength(1);
      expect(rows(ctx, 'item_template')).toHaveLength(1);
      expect(rows(ctx, 'item_instance')).toHaveLength(MAX_INVENTORY_SLOTS + 1);
      expect(rows(ctx, 'npc_affinity')).toHaveLength(0);
      expect(rows(ctx, 'npc_memory')).toHaveLength(0);

      const events = rows(ctx, 'event_private');
      expect(events).toHaveLength(1);
      expect(events[0].kind).toBe('system');
      expect(events[0].message).toContain('Hesk Varrow');
      expect(events[0].message).toContain('pack is full');
      expect(events[0].message).toContain('turn the quest in again');
    });

    it('a freed slot lets the same quest be turned in', () => {
      const ctx = newCtx({ seed: bagSeed(MAX_INVENTORY_SLOTS) });
      turnIn(ctx);
      expect(rows(ctx, 'quest_instance')).toHaveLength(1);

      ctx.db.item_instance.id.delete(1000n);
      turnIn(ctx);
      expect(rows(ctx, 'quest_instance')).toHaveLength(0);
      expect(rows(ctx, 'character')[0].gold).toBe(35n);
      expect(rows(ctx, 'item_template').some((t) => t.name === 'Bellwright Token')).toBe(true);
      expect(rows(ctx, 'item_instance')).toHaveLength(MAX_INVENTORY_SLOTS + 1);
    });

    it('one free slot is enough', () => {
      const ctx = newCtx({ seed: bagSeed(MAX_INVENTORY_SLOTS - 1) });
      turnIn(ctx);
      expect(rows(ctx, 'quest_instance')).toHaveLength(0);
      expect(rows(ctx, 'item_instance')).toHaveLength(MAX_INVENTORY_SLOTS + 1);
    });

    it('an xp/gold quest needs no bag space', () => {
      const ctx = newCtx({ seed: bagSeed(MAX_INVENTORY_SLOTS), qt: { rewardType: 'gold', rewardItemName: undefined } });
      turnIn(ctx);
      expect(rows(ctx, 'quest_instance')).toHaveLength(0);
      expect(rows(ctx, 'character')[0].gold).toBe(35n);
    });
  });
});
