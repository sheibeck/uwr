/**
 * Quick 261008-f3m: dropped loot as clickable links in the feed. Runs the real handlers captured
 * from index.ts on the strict mock db: the `loot` command line (one tokenized reward line), and
 * the two reducers the links call, take_loot (into the bag, or refused when the bag is full) and
 * take_all_loot. The reducers are unchanged by this task; these tests pin the server lines the
 * client relies on, because the client writes no line of its own.
 */
import { describe, it, expect, vi, beforeAll } from 'vitest';
import { capturedReducer } from '../helpers/schema_recorder';
import { createMockCtx } from '../helpers/test-utils';
import { parseLootLine } from '../data/loot_line';

vi.mock('spacetimedb/server', async () =>
  (await import('../helpers/schema_recorder')).createRecordingServerMock(),
);

const T0 = 1_700_000_000_000_000n;
const alice = { toHexString: () => 'a'.repeat(64) };

let submitIntent: (...args: any[]) => any;
let takeLoot: (...args: any[]) => any;
let takeAllLoot: (...args: any[]) => any;

function handler(name: string) {
  const h = capturedReducer(name);
  if (typeof h !== 'function') {
    throw new Error(`capturedReducer('${name}') is not a function: STOP and report; never edit production code to fix this.`);
  }
  return h;
}

beforeAll(async () => {
  await import('../index');
  submitIntent = handler('submit_intent');
  takeLoot = handler('take_loot');
  takeAllLoot = handler('take_all_loot');
}, 120_000);

const template = (id: bigint, name: string, slot: string) => ({
  id,
  name,
  slot,
  rarity: 'common',
  armorType: 'none',
  armorClassBonus: 0n,
  requiredLevel: 1n,
  tier: 1n,
  isJunk: false,
  stackable: false,
  description: '',
});

const lootRow = (id: bigint, itemTemplateId: bigint, characterId = 1n, ownerUserId = 7n) => ({
  id,
  combatId: 900n,
  ownerUserId,
  characterId,
  itemTemplateId,
  createdAt: { microsSinceUnixEpoch: T0 },
});

function newCtx(opts: { loot?: any[]; bag?: any[] } = {}) {
  return createMockCtx({
    seed: {
      player: [{ id: alice, userId: 7n, activeCharacterId: 1n }],
      character: [
        { id: 1n, ownerUserId: 7n, name: 'Mirel', level: 3n, locationId: 10n },
        { id: 2n, ownerUserId: 8n, name: 'Other', level: 3n, locationId: 10n },
      ],
      location: [{ id: 10n, name: 'The Crossing', description: 'A crossroads.', isSafe: true, bindStone: false, craftingAvailable: false }],
      world_state: [{ id: 1n, isNight: false, nextTransitionAtMicros: T0 + 3_600_000_000n }],
      item_template: [template(7n, 'Rusty Dagger', 'mainHand'), template(8n, 'Wolf Pelt', 'material'), template(300n, 'Pebble', 'junk')],
      combat_loot: opts.loot ?? [],
      item_instance: opts.bag ?? [],
    },
    sender: alice,
    timestampMicros: T0,
    strict: true,
  });
}

const events = (ctx: any): any[] => ctx.db._tables.event_private ?? [];
const mine = (ctx: any) => events(ctx).filter((e: any) => e.characterId === 1n);
const lootTable = (ctx: any): any[] => ctx.db._tables.combat_loot ?? [];
const bag = (ctx: any): any[] => (ctx.db._tables.item_instance ?? []).filter((r: any) => r.ownerCharacterId === 1n);
const fullBag = () =>
  Array.from({ length: 50 }, (_, i) => ({
    id: 5000n + BigInt(i),
    templateId: 300n,
    ownerCharacterId: 1n,
    equippedSlot: undefined,
    quantity: 1n,
  }));

describe('the loot command line (real submit_intent)', () => {
  it('lists the character\'s rows as one private reward line of loot tokens and a take-all', () => {
    const ctx = newCtx({ loot: [lootRow(41n, 7n), lootRow(42n, 8n), lootRow(43n, 7n, 2n, 8n)] });
    submitIntent(ctx, { characterId: 1n, text: 'loot' });
    const lines = mine(ctx);
    expect(lines).toHaveLength(1);
    expect(lines[0].kind).toBe('reward');
    expect(lines[0].message.startsWith('Loot available:')).toBe(true);
    expect(lines[0].message).not.toContain('\n');
    const pieces = parseLootLine(lines[0].message)!;
    expect(pieces.filter((p) => p.kind === 'item').map((p: any) => p.lootId)).toEqual([41n, 42n]);
    expect(pieces[pieces.length - 1].kind).toBe('takeAll');
    expect(lines[0].message).not.toContain('loot:43:');
  });

  it('with no rows it keeps the "There is nothing to loot here." system line', () => {
    const ctx = newCtx({ loot: [lootRow(43n, 7n, 2n, 8n)] });
    submitIntent(ctx, { characterId: 1n, text: 'loot' });
    const lines = mine(ctx);
    expect(lines).toHaveLength(1);
    expect(lines[0].kind).toBe('system');
    expect(lines[0].message).toBe('There is nothing to loot here.');
  });
});

describe('take_loot (real handler)', () => {
  it('puts the item in the bag, deletes the loot row and writes "You receive ..."', () => {
    const ctx = newCtx({ loot: [lootRow(41n, 7n), lootRow(42n, 8n)] });
    takeLoot(ctx, { characterId: 1n, lootId: 41n });
    expect(bag(ctx).filter((r) => r.templateId === 7n)).toHaveLength(1);
    expect(lootTable(ctx).map((r) => r.id)).toEqual([42n]);
    expect(mine(ctx).map((e: any) => e.message)).toContain('You receive Rusty Dagger.');
  });

  it('refuses with "Backpack is full" when 50 unequipped rows are held, and keeps the loot row', () => {
    const ctx = newCtx({ loot: [lootRow(41n, 7n)], bag: fullBag() });
    takeLoot(ctx, { characterId: 1n, lootId: 41n });
    const lines = mine(ctx);
    expect(lines).toHaveLength(1);
    expect(lines[0].kind).toBe('system');
    expect(lines[0].message).toContain('Backpack is full');
    expect(lootTable(ctx).map((r) => r.id)).toEqual([41n]);
    expect(bag(ctx)).toHaveLength(50);
    expect(bag(ctx).filter((r) => r.templateId === 7n)).toHaveLength(0);
  });
});

describe('take_all_loot (real handler)', () => {
  it('takes every row into the bag and writes "You take all loot: ..."', () => {
    const ctx = newCtx({ loot: [lootRow(41n, 7n), lootRow(42n, 8n)] });
    takeAllLoot(ctx, { characterId: 1n });
    expect(lootTable(ctx)).toHaveLength(0);
    expect(bag(ctx).map((r) => r.templateId).sort()).toEqual([7n, 8n]);
    expect(mine(ctx).some((e: any) => e.message.startsWith('You take all loot:'))).toBe(true);
  });
});
