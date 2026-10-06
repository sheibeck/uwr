/**
 * Phase 50 (LDG-09, threats T-50-24 to T-50-28): the REAL sell_item, sell_all_junk and
 * buyback_last_sale handlers captured from index.ts. A sale records the character's one buy-back
 * row; buyback_last_sale refunds exactly the stored price, restores the same item (and every
 * affix) as a new instance or onto the existing stack, removes the listing that sale created and
 * clears the row. Only the owner can buy back, at the place of the sale, with enough gold and room.
 * The mock db is strict; the shared identity objects are used for seeding and as the sender (the
 * mock compares with ===).
 */
import { describe, it, expect, vi, beforeAll } from 'vitest';
import { capturedReducer } from '../helpers/schema_recorder';
import { createMockCtx } from '../helpers/test-utils';
import { sellPayout } from '../data/vendor_pricing';

vi.mock('spacetimedb/server', async () =>
  (await import('../helpers/schema_recorder')).createRecordingServerMock(),
);

const T0 = 1_700_000_000_000_000n;
const alice = { toHexString: () => 'a'.repeat(64) };
const bob = { toHexString: () => 'b'.repeat(64) };
const START_GOLD = 1_000n;
const VENDOR = 5n;
const HERE = 10n;
const ELSEWHERE = 11n;

let sellItem: (...args: any[]) => any;
let sellAllJunk: (...args: any[]) => any;
let buyback: (...args: any[]) => any;
let deleteCharacter: (...args: any[]) => any;

function capture(name: string): (...args: any[]) => any {
  const h = capturedReducer(name);
  if (typeof h !== 'function') {
    throw new Error(
      `capturedReducer('${name}') is not a function: the schema recorder could not capture the ` +
        'reducer from index.ts. STOP and report; never edit production code to fix this.',
    );
  }
  return h as (...args: any[]) => any;
}

beforeAll(async () => {
  await import('../index');
  sellItem = capture('sell_item');
  sellAllJunk = capture('sell_all_junk');
  buyback = capture('buyback_last_sale');
  deleteCharacter = capture('delete_character');
}, 120_000);

const rows = (ctx: any, table: string): any[] => ctx.db._tables[table] ?? [];
const messages = (ctx: any): string[] => rows(ctx, 'event_private').map((e) => e.message);
const lastMessage = (ctx: any): string => messages(ctx)[messages(ctx).length - 1];
const aliceGold = (ctx: any): bigint => rows(ctx, 'character').find((c) => c.id === 1n).gold;
const snap = (ctx: any, table: string): any[] => rows(ctx, table).map((r) => ({ ...r }));
const state = (ctx: any) => ({
  character: snap(ctx, 'character'),
  item_instance: snap(ctx, 'item_instance'),
  item_affix: snap(ctx, 'item_affix'),
  vendor_inventory: snap(ctx, 'vendor_inventory'),
  vendor_buyback: snap(ctx, 'vendor_buyback'),
});

const baseTemplate = {
  slot: 'mainHand',
  stackable: false,
  armorType: 'none',
  weaponType: 'sword',
  allowedClasses: '',
  rarity: 'common',
  strBonus: 0n,
  dexBonus: 0n,
  intBonus: 0n,
  wisBonus: 0n,
  chaBonus: 0n,
  hpBonus: 0n,
  manaBonus: 0n,
  armorClassBonus: 0n,
  magicResistanceBonus: 0n,
  weaponBaseDamage: 0n,
  weaponDps: 0n,
  requiredLevel: 1n,
  isJunk: false,
  vendorValue: 13n,
  tier: 1n,
};
const tpl = (id: bigint, name: string, over: Record<string, unknown> = {}) => ({ ...baseTemplate, id, name, ...over });
const inst = (id: bigint, templateId: bigint, quantity: bigint, over: Record<string, unknown> = {}) => ({
  id,
  templateId,
  ownerCharacterId: 1n,
  equippedSlot: undefined,
  quantity,
  ...over,
});
const affix = (id: bigint, instanceId: bigint, key: string, magnitude: bigint) => ({
  id,
  itemInstanceId: instanceId,
  affixType: 'prefix',
  affixKey: key,
  affixName: `Name ${key}`,
  statKey: 'strBonus',
  magnitude,
});
const affixShape = (a: any) => ({
  affixType: a.affixType,
  affixKey: a.affixKey,
  affixName: a.affixName,
  statKey: a.statKey,
  magnitude: a.magnitude,
});

function newCtx(o: {
  templates: any[];
  instances: any[];
  affixes?: any[];
  listings?: any[];
  buyback?: any[];
  sender?: any;
}) {
  return createMockCtx({
    seed: {
      player: [
        { id: alice, userId: 7n, activeCharacterId: 1n },
        { id: bob, userId: 8n, activeCharacterId: 2n },
      ],
      character: [
        {
          id: 1n,
          ownerUserId: 7n,
          name: 'Mirel',
          className: 'Ashwarden',
          level: 5n,
          gold: START_GOLD,
          vendorBuyMod: 0n,
          vendorSellMod: 0n,
          locationId: HERE,
        },
        {
          id: 2n,
          ownerUserId: 8n,
          name: 'Torv',
          className: 'Ashwarden',
          level: 5n,
          gold: START_GOLD,
          vendorBuyMod: 0n,
          vendorSellMod: 0n,
          locationId: HERE,
        },
      ],
      npc: [{ id: VENDOR, name: 'Brannoc', npcType: 'vendor', locationId: HERE }],
      vendor_inventory: o.listings ?? [],
      vendor_buyback: o.buyback ?? [],
      item_template: o.templates,
      item_instance: o.instances,
      item_affix: o.affixes ?? [],
      renown_perk: [],
    },
    sender: o.sender ?? alice,
    timestampMicros: T0,
    strict: true,
  });
}

/** Run a reducer as another sender against the same database. */
const as = (ctx: any, sender: any) => ({ ...ctx, sender });

const SWORD = tpl(80n, 'Test Sword', { vendorValue: 13n });
const RARE_SWORD = inst(800n, 80n, 1n, {
  qualityTier: 'rare',
  craftQuality: 'exquisite',
  displayName: 'Keen Test Sword of Slowness',
  isNamed: true,
  isTemporary: false,
});
const RARE_AFFIXES = [affix(1n, 800n, 'keen', 3n), affix(2n, 800n, 'slow', -4n)];

const sell = (ctx: any, instanceId: bigint) =>
  sellItem(ctx, { characterId: 1n, itemInstanceId: instanceId, npcId: VENDOR });
const buyBack = (ctx: any, characterId = 1n) => buyback(ctx, { characterId });

describe('sell then buy back', () => {
  it('restores gold, the same item data, a new id and every affix; clears the row; removes the listing', () => {
    const ctx = newCtx({ templates: [SWORD], instances: [RARE_SWORD], affixes: RARE_AFFIXES });
    sell(ctx, 800n);
    const paid = sellPayout(13n, 1n, 0, 0n);
    expect(aliceGold(ctx)).toBe(START_GOLD + paid);
    expect(rows(ctx, 'vendor_inventory')).toHaveLength(1);
    expect(rows(ctx, 'vendor_buyback')).toHaveLength(1);

    buyBack(ctx);

    expect(aliceGold(ctx)).toBe(START_GOLD);
    const items = rows(ctx, 'item_instance');
    expect(items).toHaveLength(1);
    expect(items[0].id).not.toBe(800n);
    expect(items[0]).toMatchObject({
      templateId: 80n,
      ownerCharacterId: 1n,
      quantity: 1n,
      qualityTier: 'rare',
      craftQuality: 'exquisite',
      displayName: 'Keen Test Sword of Slowness',
      isNamed: true,
      isTemporary: false,
    });
    expect(items[0].equippedSlot).toBeUndefined();
    const restored = rows(ctx, 'item_affix');
    expect(restored).toHaveLength(2);
    expect(restored.every((a) => a.itemInstanceId === items[0].id)).toBe(true);
    expect(restored.map(affixShape)).toEqual(RARE_AFFIXES.map(affixShape));
    expect(restored.map((a) => a.id)).not.toContain(1n);
    expect(rows(ctx, 'vendor_inventory')).toHaveLength(0);
    expect(rows(ctx, 'vendor_buyback')).toHaveLength(0);
    expect(lastMessage(ctx)).toBe(`You buy back Keen Test Sword of Slowness for ${paid} gold.`);
    expect(rows(ctx, 'event_private')[rows(ctx, 'event_private').length - 1].kind).toBe('reward');
  });

  it('keeps a listing that existed before the sale (listingId unset)', () => {
    const listing = { id: 40n, npcId: VENDOR, itemTemplateId: 80n, price: 26n, qualityTier: 'rare' };
    const ctx = newCtx({ templates: [SWORD], instances: [RARE_SWORD], affixes: RARE_AFFIXES, listings: [listing] });
    sell(ctx, 800n);
    expect(rows(ctx, 'vendor_buyback')[0].listingId).toBeUndefined();
    buyBack(ctx);
    expect(rows(ctx, 'vendor_inventory')).toEqual([listing]);
    expect(aliceGold(ctx)).toBe(START_GOLD);
    expect(rows(ctx, 'item_instance')).toHaveLength(1);
  });

  it('merges a stack of 3 onto the stack already in the bag', () => {
    const NAILS = tpl(82n, 'Iron Nails', { stackable: true, vendorValue: 7n });
    const ctx = newCtx({ templates: [NAILS], instances: [inst(820n, 82n, 3n), inst(821n, 82n, 2n)] });
    sell(ctx, 820n);
    expect(rows(ctx, 'item_instance').map((i) => i.id)).toEqual([821n]);
    buyBack(ctx);
    const items = rows(ctx, 'item_instance');
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({ id: 821n, templateId: 82n, quantity: 5n });
    expect(aliceGold(ctx)).toBe(START_GOLD);
    expect(rows(ctx, 'vendor_buyback')).toHaveLength(0);
  });

  it('with 50 rows in the bag a stackable item that has a stack still comes back (it merges)', () => {
    const NAILS = tpl(82n, 'Iron Nails', { stackable: true, vendorValue: 7n });
    const FILLER = tpl(81n, 'Filler');
    const ctx = newCtx({
      templates: [NAILS, FILLER],
      instances: [inst(820n, 82n, 3n), inst(821n, 82n, 2n), ...Array.from({ length: 48 }, (_, i) => inst(BigInt(1000 + i), 81n, 1n))],
    });
    sell(ctx, 820n);
    rows(ctx, 'item_instance').push(inst(2000n, 81n, 1n));
    expect(rows(ctx, 'item_instance')).toHaveLength(50);
    buyBack(ctx);
    expect(rows(ctx, 'item_instance')).toHaveLength(50);
    expect(rows(ctx, 'item_instance').find((i) => i.id === 821n)!.quantity).toBe(5n);
    expect(aliceGold(ctx)).toBe(START_GOLD);
    expect(rows(ctx, 'vendor_buyback')).toHaveLength(0);
  });

  it('a second sale replaces the first: only the newer item comes back', () => {
    const NAILS = tpl(82n, 'Iron Nails', { vendorValue: 7n });
    const ctx = newCtx({ templates: [SWORD, NAILS], instances: [inst(800n, 80n, 1n), inst(820n, 82n, 1n)] });
    sell(ctx, 800n);
    sell(ctx, 820n);
    buyBack(ctx);
    const items = rows(ctx, 'item_instance');
    expect(items).toHaveLength(1);
    expect(items[0].templateId).toBe(82n);
    expect(aliceGold(ctx)).toBe(START_GOLD + sellPayout(13n, 1n, 0, 0n));
    buyBack(ctx);
    expect(lastMessage(ctx)).toBe('Nothing to buy back.');
  });

  it('sell_all_junk neither records nor changes the row; buy back still returns the single sale', () => {
    const JUNK = tpl(90n, 'Rusty Nail', { slot: 'junk', isJunk: true, vendorValue: 4n });
    const ctx = newCtx({ templates: [SWORD, JUNK], instances: [inst(800n, 80n, 1n), inst(900n, 90n, 1n)] });
    sell(ctx, 800n);
    const before = snap(ctx, 'vendor_buyback');
    sellAllJunk(ctx, { characterId: 1n });
    expect(snap(ctx, 'vendor_buyback')).toEqual(before);
    buyBack(ctx);
    const items = rows(ctx, 'item_instance');
    expect(items.map((i) => i.templateId)).toEqual([80n]);
    expect(aliceGold(ctx)).toBe(START_GOLD + sellPayout(4n, 1n, 0, 0n));
  });

  it('a second buy back right after a success answers Nothing to buy back.', () => {
    const ctx = newCtx({ templates: [SWORD], instances: [inst(800n, 80n, 1n)] });
    sell(ctx, 800n);
    buyBack(ctx);
    const after = state(ctx);
    buyBack(ctx);
    expect(lastMessage(ctx)).toBe('Nothing to buy back.');
    expect(state(ctx)).toEqual(after);
  });
});

describe('buy back refusals change nothing', () => {
  const expectRefusal = (mutate: (ctx: any) => void, message: (ctx: any) => string, extra?: { templates?: any[]; instances?: any[] }) => {
    const ctx = newCtx({
      templates: extra?.templates ?? [SWORD],
      instances: extra?.instances ?? [RARE_SWORD],
      affixes: RARE_AFFIXES,
    });
    sell(ctx, 800n);
    mutate(ctx);
    const before = state(ctx);
    buyBack(ctx);
    expect(lastMessage(ctx)).toBe(message(ctx));
    expect(state(ctx)).toEqual(before);
  };

  it('no row: Nothing to buy back.', () => {
    const ctx = newCtx({ templates: [SWORD], instances: [RARE_SWORD] });
    const before = state(ctx);
    buyBack(ctx);
    expect(messages(ctx)).toEqual(['Nothing to buy back.']);
    expect(state(ctx)).toEqual(before);
  });

  it('gold below the price: Not enough gold to buy that back.', () => {
    expectRefusal(
      (ctx) => {
        const c = rows(ctx, 'character').find((r) => r.id === 1n);
        c.gold = sellPayout(13n, 1n, 0, 0n) - 1n;
      },
      () => 'Not enough gold to buy that back.',
    );
  });

  it('another location than the sale: Go back to {npcName} to buy that back.', () => {
    expectRefusal(
      (ctx) => {
        rows(ctx, 'character').find((r) => r.id === 1n).locationId = ELSEWHERE;
      },
      () => 'Go back to Brannoc to buy that back.',
    );
  });

  it('50 non-equipped rows and a non-stackable item: Your backpack is full.', () => {
    const FILLER = tpl(81n, 'Filler');
    expectRefusal(
      (ctx) => {
        for (let i = 0; i < 50; i++) rows(ctx, 'item_instance').push(inst(BigInt(3000 + i), 81n, 1n));
      },
      () => 'Your backpack is full.',
      { templates: [SWORD, FILLER], instances: [RARE_SWORD] },
    );
  });
});

describe('only the owner can buy back', () => {
  it("bob calling alice's characterId throws Not your character and alice's row stays", () => {
    const ctx = newCtx({ templates: [SWORD], instances: [inst(800n, 80n, 1n)] });
    sell(ctx, 800n);
    const before = state(ctx);
    expect(() => buyBack(as(ctx, bob), 1n)).toThrow(/Not your character/);
    expect(state(ctx)).toEqual(before);
    expect(rows(ctx, 'vendor_buyback')).toHaveLength(1);
  });
});

describe('a damaged snapshot', () => {
  it('restores the item without affixes and never throws', () => {
    const row = {
      characterId: 1n,
      npcId: VENDOR,
      npcName: 'Brannoc',
      locationId: HERE,
      templateId: 80n,
      itemName: 'Test Sword',
      rarity: 'common',
      quantity: 1n,
      price: 5n,
      qualityTier: undefined,
      craftQuality: undefined,
      displayName: undefined,
      isNamed: undefined,
      isTemporary: undefined,
      affixesJson: '{not json',
      listingId: undefined,
      soldAt: { microsSinceUnixEpoch: T0 - 1n },
    };
    const ctx = newCtx({ templates: [SWORD], instances: [], buyback: [row] });
    expect(() => buyBack(ctx)).not.toThrow();
    expect(rows(ctx, 'item_instance')).toHaveLength(1);
    expect(rows(ctx, 'item_affix')).toHaveLength(0);
    expect(aliceGold(ctx)).toBe(START_GOLD - 5n);
    expect(lastMessage(ctx)).toBe('You buy back Test Sword for 5 gold.');
    expect(rows(ctx, 'vendor_buyback')).toHaveLength(0);
  });
});
