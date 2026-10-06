/**
 * Phase 50 plan 24 (threats T-50-77 to T-50-83): the REAL restock_vendors scheduled reducer and the
 * first-fill-on-connect hook, captured from index.ts. Every vendor gets rule-based base stock for
 * its role and its area's level band; restock replaces only rows that carry a vendor_base_stock
 * marker, so player-sold listings survive; a forged client call does nothing; prices equal a player
 * resale; buy_item and sell_item (unchanged) work on the result. The mock db is strict; one shared
 * identity object is used for seeding and as the sender (the mock compares with ===).
 */
import { describe, it, expect, vi, beforeAll } from 'vitest';
import { capturedReducer, recordedTable, rowColumnProblems } from '../helpers/schema_recorder';
import { createMockCtx } from '../helpers/test-utils';
import { MODULE } from '../helpers/combat_fight_fixture';
import { listingBuyPrice } from '../data/vendor_pricing';
import {
  BASE_STOCK_SIZE,
  VENDOR_RESTOCK_BATCH,
  VENDOR_RESTOCK_CONTINUE_MICROS,
  VENDOR_RESTOCK_INTERVAL_MICROS,
  baseStockQuantity,
  listPriceFor,
  restockSeed,
} from '../data/vendor_stock';

vi.mock('spacetimedb/server', async () =>
  (await import('../helpers/schema_recorder')).createRecordingServerMock(),
);

const T0 = 1_700_000_000_000_000n;
const alice = { toHexString: () => 'a'.repeat(64) };

let restock: (...args: any[]) => any;
let sellItem: (...args: any[]) => any;
let buyItem: (...args: any[]) => any;
let onConnect: (...args: any[]) => any;

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
  restock = capture('restock_vendors');
  sellItem = capture('sell_item');
  buyItem = capture('buy_item');
  onConnect = capture('__client_connected__');
}, 120_000);

const rows = (ctx: any, table: string): any[] => ctx.db._tables[table] ?? [];
const snap = (ctx: any, table: string): any[] => rows(ctx, table).map((r) => ({ ...r }));
const allTables = (ctx: any): Record<string, any[]> =>
  Object.fromEntries(Object.keys(ctx.db._tables).map((name) => [name, snap(ctx, name)]));
const listingsOf = (ctx: any, npcId: bigint): any[] => rows(ctx, 'vendor_inventory').filter((r) => r.npcId === npcId);
const templateIdsOf = (ctx: any, npcId: bigint): bigint[] =>
  listingsOf(ctx, npcId)
    .map((r) => r.itemTemplateId as bigint)
    .sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
const lastTick = (ctx: any): any => rows(ctx, 'vendor_restock_tick')[rows(ctx, 'vendor_restock_tick').length - 1];

const baseTemplate = {
  slot: 'mainHand',
  stackable: false,
  armorType: 'none',
  weaponType: '',
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
  vendorValue: 10n,
  tier: 1n,
  wellFedDurationMicros: 0n,
};
const tpl = (id: bigint, name: string, over: Record<string, unknown> = {}) => ({ ...baseTemplate, id, name, ...over });
const mat = (id: bigint, name: string, over: Record<string, unknown> = {}) =>
  tpl(id, name, { slot: 'material', stackable: true, ...over });

const TEMPLATES = (): any[] => [
  tpl(1n, 'Training Sword', { slot: 'mainHand', weaponType: 'sword' }),
  tpl(2n, 'Scout Jerkin', { slot: 'chest', armorType: 'leather' }),
  tpl(3n, 'Worn Cloak', { slot: 'cloak', vendorValue: 5n }),
  mat(4n, 'Lamp Oil', { vendorValue: 1n }),
  mat(5n, 'Herbs'),
  mat(6n, 'Stone'),
  mat(7n, 'Life Stone', { rarity: 'uncommon' }),
  mat(8n, 'Void Crystal', { rarity: 'rare', tier: 3n }),
  tpl(9n, 'Rat Tail', { slot: 'junk', isJunk: true }),
  tpl(10n, 'Sealed Writ', { slot: 'quest' }),
  tpl(11n, 'Scroll: Bread', { slot: 'consumable' }),
  tpl(12n, 'Bread', { slot: 'food', stackable: true }),
  tpl(13n, 'Iron Longsword', { slot: 'mainHand', weaponType: 'sword', requiredLevel: 3n }),
  tpl(14n, 'Sunforged Blade', { slot: 'mainHand', weaponType: 'sword', rarity: 'epic' }),
  tpl(15n, 'Iron Helm', { slot: 'head', armorType: 'chain', requiredLevel: 3n }),
  ...Array.from({ length: 10 }, (_, i) => mat(BigInt(16 + i), `Ore ${16 + i}`)),
];

const HESPER = {
  id: 5n,
  name: 'Hesper Duhallow',
  npcType: 'vendor',
  locationId: 10n,
  description:
    'A broad, sunburnt woman who sells rope, lamp oil and pickled eel from a stall made of two doors. Her left hand is missing a finger, and she will tell you a different story about it each time.',
  greeting: "Rope, oil, eel. Pick two, and the third you'll want later anyway.",
  personalityJson: JSON.stringify({ knowledgeDomains: ['salvage prices', 'tide tables', 'wreck rumors'] }),
};
const SMITH_TEXT = 'A soot-streaked smith who hammers blades on her anvil.';
const smithNpc = (id: bigint, locationId: bigint) => ({
  id,
  name: `Smith ${id}`,
  npcType: 'vendor',
  locationId,
  description: SMITH_TEXT,
  greeting: 'Mind the sparks.',
});

const NPCS = (): any[] => [
  HESPER,
  smithNpc(6n, 10n),
  smithNpc(7n, 20n),
  { id: 8n, name: 'Banker', npcType: 'banker', locationId: 10n, description: SMITH_TEXT, greeting: '' },
];

function newCtx(o: Partial<Record<string, any[]>> & { sender?: any; timestampMicros?: bigint } = {}) {
  const { sender, timestampMicros, ...over } = o;
  return createMockCtx({
    seed: {
      player: [{ id: alice, userId: 7n, activeCharacterId: 1n }],
      region: [
        { id: 1n, name: 'Basin', dangerMultiplier: 100n },
        { id: 2n, name: 'Heights', dangerMultiplier: 300n },
      ],
      location: [
        { id: 10n, name: 'Stair', regionId: 1n, levelOffset: 0n },
        { id: 20n, name: 'Ridge', regionId: 2n, levelOffset: 0n },
      ],
      npc: NPCS(),
      character: [
        {
          id: 1n,
          ownerUserId: 7n,
          name: 'Mirel',
          className: 'Ashwarden',
          level: 5n,
          gold: 1000n,
          vendorBuyMod: 40n,
          vendorSellMod: 0n,
          locationId: 10n,
        },
      ],
      item_template: TEMPLATES(),
      item_instance: [],
      item_affix: [],
      vendor_inventory: [],
      vendor_base_stock: [],
      vendor_restock_tick: [],
      vendor_buyback: [],
      renown_perk: [],
      ...over,
    },
    sender: sender ?? MODULE,
    databaseIdentity: MODULE,
    timestampMicros: timestampMicros ?? T0,
    strict: true,
  });
}

const run = (ctx: any, afterNpcId: bigint | undefined = 0n) =>
  restock(ctx, { arg: { scheduledId: 1n, afterNpcId } });
const at = (ctx: any, micros: bigint) => ({ ...ctx, timestamp: { microsSinceUnixEpoch: micros } });

const pairs = (ctx: any) =>
  rows(ctx, 'vendor_inventory').map((r) => [r.npcId, r.itemTemplateId, r.price] as const);

describe('restock_vendors fills base stock by role and area band', () => {
  it('gives each vendor stock that suits its profile and level band', () => {
    const ctx = newCtx();
    run(ctx);
    const hesperIds = templateIdsOf(ctx, 5n);
    expect(hesperIds.length).toBeGreaterThan(0);
    expect(hesperIds.length).toBeLessThanOrEqual(BASE_STOCK_SIZE);
    const allowed = [4n, 5n, 6n, 7n, 12n, ...Array.from({ length: 10 }, (_, i) => BigInt(16 + i))];
    for (const id of hesperIds) expect(allowed).toContain(id);
    expect(templateIdsOf(ctx, 6n)).toEqual([1n, 2n]);
    expect(templateIdsOf(ctx, 7n)).toEqual([13n, 15n]);
    expect(templateIdsOf(ctx, 8n)).toEqual([]);
    const listed = rows(ctx, 'vendor_inventory').map((r) => r.itemTemplateId);
    for (const never of [8n, 9n, 10n, 11n, 14n]) expect(listed).not.toContain(never);
  });

  it('prices every row with listPriceFor, writes a marker per row and well-formed rows', () => {
    const ctx = newCtx();
    run(ctx);
    const templates = new Map(TEMPLATES().map((t) => [t.id, t]));
    expect(rows(ctx, 'vendor_inventory').length).toBeGreaterThan(0);
    for (const row of rows(ctx, 'vendor_inventory')) {
      const template = templates.get(row.itemTemplateId);
      expect(row.price).toBe(listPriceFor(template.vendorValue));
      expect(row.qualityTier).toBeUndefined();
      expect(row.quantity).toBe(baseStockQuantity(template.rarity, restockSeed(row.npcId, T0), template.id));
      expect(row.quantity >= 1n && row.quantity <= 5n).toBe(true);
      const markers = rows(ctx, 'vendor_base_stock').filter((m) => m.listingId === row.id);
      expect(markers).toEqual([{ listingId: row.id, npcId: row.npcId }]);
      expect(rowColumnProblems('vendor_inventory', row)).toEqual([]);
    }
    expect(rows(ctx, 'vendor_base_stock')).toHaveLength(rows(ctx, 'vendor_inventory').length);
    for (const m of rows(ctx, 'vendor_base_stock')) expect(rowColumnProblems('vendor_base_stock', m)).toEqual([]);
    for (const tk of rows(ctx, 'vendor_restock_tick')) expect(rowColumnProblems('vendor_restock_tick', tk)).toEqual([]);
  });
});

describe('restock_vendors is deterministic per vendor and tick', () => {
  it('gives identical stock from two fresh contexts with the same seed and time', () => {
    const a = newCtx();
    const b = newCtx();
    run(a);
    run(b);
    expect(pairs(a)).toEqual(pairs(b));
    expect(pairs(a).length).toBeGreaterThan(0);
  });

  it('changes the set over different ticks', () => {
    const sets = new Set<string>();
    for (let k = 0n; k < 10n; k += 1n) {
      const ctx = newCtx({ npc: [HESPER], timestampMicros: T0 + k * 1_000_003n });
      run(ctx);
      sets.add(templateIdsOf(ctx, 5n).join(','));
    }
    expect(sets.size).toBeGreaterThan(1);
  });
});

describe('restock_vendors never touches player-sold listings', () => {
  const PLAYER = { id: 901n, npcId: 5n, itemTemplateId: 5n, price: 2n, qualityTier: undefined, quantity: 2n };
  const OLD_BASE = { id: 900n, npcId: 5n, itemTemplateId: 4n, price: 2n, qualityTier: undefined, quantity: 1n };

  it('keeps the player listing, drops the old base listing and its marker, and skips listed templates', () => {
    const ctx = newCtx({
      vendor_inventory: [OLD_BASE, PLAYER],
      vendor_base_stock: [{ listingId: 900n, npcId: 5n }],
    });
    const before = { ...PLAYER };
    run(ctx);
    expect(rows(ctx, 'vendor_inventory').find((r) => r.id === 901n)).toEqual(before);
    expect(rows(ctx, 'vendor_inventory').find((r) => r.id === 900n)).toBeUndefined();
    expect(rows(ctx, 'vendor_base_stock').find((m) => m.listingId === 900n)).toBeUndefined();
    const baseRows = listingsOf(ctx, 5n).filter((r) => r.id !== 901n);
    expect(baseRows.length).toBeGreaterThan(0);
    expect(baseRows.map((r) => r.itemTemplateId)).not.toContain(5n);
  });

  it('keeps it through a second restock that replaces the first one, with every marker valid', () => {
    const ctx = newCtx({
      vendor_inventory: [PLAYER],
      vendor_base_stock: [],
    });
    run(ctx);
    const firstIds = listingsOf(ctx, 5n)
      .filter((r) => r.id !== 901n)
      .map((r) => r.id);
    expect(firstIds.length).toBeGreaterThan(0);
    run(at(ctx, T0 + VENDOR_RESTOCK_INTERVAL_MICROS));
    expect(rows(ctx, 'vendor_inventory').find((r) => r.id === 901n)).toEqual(PLAYER);
    const now = rows(ctx, 'vendor_inventory').map((r) => r.id);
    for (const id of firstIds) expect(now).not.toContain(id);
    for (const m of rows(ctx, 'vendor_base_stock')) {
      const listing = rows(ctx, 'vendor_inventory').find((r) => r.id === m.listingId);
      expect(listing).toBeDefined();
      expect(listing.npcId).toBe(m.npcId);
    }
    expect(rows(ctx, 'vendor_base_stock')).toHaveLength(rows(ctx, 'vendor_inventory').length - 1);
  });
});

describe('prices and purchases are unchanged', () => {
  it('a real sell_item listing has the same price rule and survives a restock untouched', () => {
    const ctx = newCtx({
      sender: alice,
      item_instance: [{ id: 700n, templateId: 3n, ownerCharacterId: 1n, equippedSlot: undefined, quantity: 1n }],
    });
    sellItem(ctx, { characterId: 1n, itemInstanceId: 700n, npcId: 5n });
    const listing = listingsOf(ctx, 5n).find((r) => r.itemTemplateId === 3n);
    expect(listing).toBeDefined();
    expect(listing.price).toBe(listPriceFor(5n));
    expect(rows(ctx, 'vendor_base_stock')).toHaveLength(0);
    const before = { ...listing };
    run({ ...ctx, sender: MODULE });
    expect(rows(ctx, 'vendor_inventory').find((r) => r.id === listing.id)).toEqual(before);
  });

  it('buy_item charges listingBuyPrice with rapport on a base-stock listing and takes one unit', () => {
    const ctx = newCtx();
    run(ctx);
    const listing = { ...listingsOf(ctx, 5n)[0] };
    const template = TEMPLATES().find((t) => t.id === listing.itemTemplateId);
    const beforeCount = listingsOf(ctx, 5n).length;
    buyItem({ ...ctx, sender: alice }, { characterId: 1n, npcId: 5n, itemTemplateId: listing.itemTemplateId });
    const expected = listingBuyPrice({
      listPrice: listPriceFor(template.vendorValue),
      vendorValue: template.vendorValue,
      perkBuyPct: 0,
      perkSellPct: 0,
      vendorBuyMod: 40n,
      vendorSellMod: 0n,
    });
    expect(1000n - rows(ctx, 'character')[0].gold).toBe(expected);
    expect(rows(ctx, 'item_instance').map((i) => i.templateId)).toEqual([listing.itemTemplateId]);
    expect(listingsOf(ctx, 5n)).toHaveLength(beforeCount);
    expect(listingsOf(ctx, 5n).find((r) => r.id === listing.id)!.quantity).toBe(listing.quantity - 1n);
  });
});

describe('restock_vendors batches its work', () => {
  it('with no vendors writes nothing but one tick due after the interval', () => {
    const ctx = newCtx({ npc: [] });
    const before = allTables(ctx);
    run(ctx);
    const after = allTables(ctx);
    const { vendor_restock_tick: ticksAfter, ...restAfter } = after;
    const { vendor_restock_tick: _ignored, ...restBefore } = before;
    expect(restAfter).toEqual(restBefore);
    expect(ticksAfter).toHaveLength(1);
    expect(ticksAfter[0].scheduledAt.value.microsSinceUnixEpoch).toBe(T0 + VENDOR_RESTOCK_INTERVAL_MICROS);
    expect(ticksAfter[0].afterNpcId).toBe(0n);
  });

  it('stocks the first batch, continues one second later, then finishes and waits the interval', () => {
    const many = Array.from({ length: VENDOR_RESTOCK_BATCH + 1 }, (_, i) => smithNpc(BigInt(101 + i), 10n));
    const ctx = newCtx({ npc: many, item_template: TEMPLATES().slice(0, 2) });
    run(ctx);
    const lastStocked = BigInt(100 + VENDOR_RESTOCK_BATCH);
    for (let id = 101n; id <= lastStocked; id += 1n) expect(templateIdsOf(ctx, id)).toEqual([1n, 2n]);
    expect(templateIdsOf(ctx, lastStocked + 1n)).toEqual([]);
    expect(rows(ctx, 'vendor_restock_tick')).toHaveLength(1);
    const next = lastTick(ctx);
    expect(next.scheduledAt.value.microsSinceUnixEpoch).toBe(T0 + VENDOR_RESTOCK_CONTINUE_MICROS);
    expect(next.afterNpcId).toBe(lastStocked);

    run(ctx, next.afterNpcId);
    expect(templateIdsOf(ctx, lastStocked + 1n)).toEqual([1n, 2n]);
    expect(rows(ctx, 'vendor_restock_tick')).toHaveLength(2);
    const done = lastTick(ctx);
    expect(done.scheduledAt.value.microsSinceUnixEpoch).toBe(T0 + VENDOR_RESTOCK_INTERVAL_MICROS);
    expect(done.afterNpcId).toBe(0n);
  });

  it('treats a missing afterNpcId as 0n', () => {
    const ctx = newCtx();
    restock(ctx, { arg: { scheduledId: 1n } });
    expect(templateIdsOf(ctx, 6n)).toEqual([1n, 2n]);
  });

  it('does not throw and writes no listings when there are no item templates', () => {
    const ctx = newCtx({ item_template: [] });
    expect(() => run(ctx)).not.toThrow();
    expect(rows(ctx, 'vendor_inventory')).toHaveLength(0);
    expect(rows(ctx, 'vendor_base_stock')).toHaveLength(0);
    expect(rows(ctx, 'vendor_restock_tick')).toHaveLength(1);
  });
});

describe('restock_vendors rejects a client caller (T-50-77)', () => {
  it('a forged call leaves every table as it was and schedules no tick', () => {
    const ctx = newCtx({ sender: alice });
    const before = allTables(ctx);
    run(ctx);
    expect(allTables(ctx)).toEqual(before);
    expect(rows(ctx, 'vendor_restock_tick')).toHaveLength(0);
  });
});

describe('the first fill starts when a client connects', () => {
  const connectCtx = (extra: Record<string, any[]> = {}) => newCtx({ sender: alice, ...extra });

  it('inserts one tick due now, and a second connect adds none', () => {
    const ctx = connectCtx();
    onConnect(ctx);
    expect(rows(ctx, 'vendor_restock_tick')).toHaveLength(1);
    expect(rows(ctx, 'vendor_restock_tick')[0].scheduledAt.value.microsSinceUnixEpoch).toBe(T0);
    expect(rows(ctx, 'vendor_restock_tick')[0].afterNpcId).toBe(0n);
    onConnect(ctx);
    expect(rows(ctx, 'vendor_restock_tick')).toHaveLength(1);
  });

  it('adds none when a tick is already pending', () => {
    const existing = {
      scheduledId: 5n,
      scheduledAt: { tag: 'Time', value: { microsSinceUnixEpoch: T0 + 5n } },
      afterNpcId: 0n,
    };
    const ctx = connectCtx({ vendor_restock_tick: [existing] });
    onConnect(ctx);
    expect(snap(ctx, 'vendor_restock_tick')).toEqual([existing]);
  });
});

describe('schema', () => {
  it('keeps the two new tables private and shaped as planned', () => {
    const marker = recordedTable('vendor_base_stock')!;
    const tick = recordedTable('vendor_restock_tick')!;
    expect(marker.opts.public).not.toBe(true);
    expect(tick.opts.public).not.toBe(true);
    expect(typeof tick.opts.scheduled).toBe('function');
    expect(Object.keys(tick.cols).sort()).toEqual(['afterNpcId', 'scheduledAt', 'scheduledId']);
    expect(tick.cols.scheduledId).toMatchObject({ kind: 'u64', primaryKey: true, autoInc: true });
    expect(tick.cols.afterNpcId).toMatchObject({ kind: 'u64' });
    expect(Object.keys(marker.cols).sort()).toEqual(['listingId', 'npcId']);
    expect(marker.cols.listingId).toMatchObject({ kind: 'u64', primaryKey: true });
    expect(marker.cols.listingId.autoInc).toBeFalsy();
    expect(marker.cols.npcId).toMatchObject({ kind: 'u64' });
    expect(marker.opts.indexes).toEqual([{ accessor: 'by_vendor', algorithm: 'btree', columns: ['npcId'] }]);
  });

  it('gives vendor_inventory its five columns plus a trailing quantity (Plan 50-26)', () => {
    expect(Object.keys(recordedTable('vendor_inventory')!.cols)).toEqual([
      'id',
      'npcId',
      'itemTemplateId',
      'price',
      'qualityTier',
      'quantity',
    ]);
  });
});
