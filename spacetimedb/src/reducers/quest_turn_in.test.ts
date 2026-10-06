/**
 * Quest turn-in follow-ups (quick 261006-gy6). Both turn-in paths, the turn_in_quest reducer and the
 * "turn in <quest>" intent of submit_intent (the path the client's [Turn In] link uses), go through
 * turnInCompletedQuest. Runs the REAL handlers captured from index.ts on the strict mock db and checks,
 * for both paths:
 *   - the quest is recorded in the giver's NPC memory (the intent path used to skip it).
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
});
