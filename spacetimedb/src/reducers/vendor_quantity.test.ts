/**
 * Phase 50 plan 26 (threats T-50-100 to T-50-107): finite vendor stock, the price floor and sell
 * quantity, on the REAL handlers captured from index.ts (sell_item, sell_item_quantity, buy_item,
 * buyback_last_sale, restock_vendors and the typed submit_intent commands). Every listing has a
 * quantity: sales add what was sold, buys and buy-backs take exactly what they move, base stock
 * sells out until restock, and units are conserved across any sell and buy loop. The mock db is
 * strict; the shared identity objects are used for seeding and as the sender (the mock compares
 * with ===).
 */
import { describe, it, expect, vi, beforeAll } from 'vitest';
// @ts-ignore node types are not part of this module's tsconfig (same as other source-reading tests)
import { readFileSync, readdirSync, statSync } from 'node:fs';
// @ts-ignore see above
import { fileURLToPath } from 'node:url';
// @ts-ignore see above
import { join } from 'node:path';
import { capturedReducer, recordedTable } from '../helpers/schema_recorder';
import { createMockCtx } from '../helpers/test-utils';
import { listingBuyPrice, sellPayout } from '../data/vendor_pricing';
import { QUEST_ITEM_SALE_REFUSAL } from '../data/item_rules';
import { perkBonusByField } from '../data/perk_rules';

vi.mock('spacetimedb/server', async () =>
  (await import('../helpers/schema_recorder')).createRecordingServerMock(),
);

const T0 = 1_700_000_000_000_000n;
const alice = { toHexString: () => 'a'.repeat(64) };
const bob = { toHexString: () => 'b'.repeat(64) };
const MODULE_ID = { toHexString: () => 'module-identity-hex' };
const START_GOLD = 1_000n;
const VENDOR = 5n;
const NON_VENDOR = 6n;
const HERE = 10n;
const LEVEL = 5n;
const PERK_KEY = 'shrewd_bargainer';

let sellItem: (...args: any[]) => any;
let sellItemQuantity: (...args: any[]) => any;
let buyItem: (...args: any[]) => any;
let buyback: (...args: any[]) => any;
let restock: (...args: any[]) => any;
let submitIntent: (...args: any[]) => any;

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
  sellItemQuantity = capture('sell_item_quantity');
  buyItem = capture('buy_item');
  buyback = capture('buyback_last_sale');
  restock = capture('restock_vendors');
  submitIntent = capture('submit_intent');
}, 120_000);

const rows = (ctx: any, table: string): any[] => ctx.db._tables[table] ?? [];
const snap = (ctx: any, table: string): any[] => rows(ctx, table).map((r) => ({ ...r }));
const messages = (ctx: any): string[] => rows(ctx, 'event_private').map((e) => e.message);
const lastMessage = (ctx: any): string => messages(ctx)[messages(ctx).length - 1];
const goldOf = (ctx: any, id = 1n): bigint => rows(ctx, 'character').find((c) => c.id === id).gold;
const state = (ctx: any) => ({
  character: snap(ctx, 'character'),
  item_instance: snap(ctx, 'item_instance'),
  item_affix: snap(ctx, 'item_affix'),
  vendor_inventory: snap(ctx, 'vendor_inventory'),
  vendor_base_stock: snap(ctx, 'vendor_base_stock'),
  vendor_buyback: snap(ctx, 'vendor_buyback'),
});
const listingsFor = (ctx: any, templateId: bigint): any[] =>
  rows(ctx, 'vendor_inventory').filter((r) => r.itemTemplateId === templateId);
const countOf = (ctx: any, templateId: bigint, owner = 1n): bigint =>
  rows(ctx, 'item_instance')
    .filter((i) => i.templateId === templateId && i.ownerCharacterId === owner)
    .reduce((sum, i) => sum + (i.quantity ?? 1n), 0n);

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

const ORE = tpl(70n, 'Iron Ore', { slot: 'material', stackable: true, vendorValue: 7n });
const SWORD = tpl(80n, 'Test Sword', { vendorValue: 13n });
const SHARD = tpl(83n, 'Glass Shard', { slot: 'material', stackable: true, vendorValue: 3n });
const WRIT = tpl(81n, 'Shard Writ', { slot: 'quest', vendorValue: 50n });
const TEMPLATES = () => [ORE, SWORD, SHARD, WRIT];

const EARLIER_ROW = {
  characterId: 1n,
  npcId: VENDOR,
  npcName: 'Brannoc',
  locationId: HERE,
  templateId: 99n,
  itemName: 'Earlier Thing',
  rarity: 'common',
  quantity: 1n,
  price: 3n,
  qualityTier: undefined,
  craftQuality: undefined,
  displayName: undefined,
  isNamed: undefined,
  isTemporary: undefined,
  affixesJson: '[]',
  listingId: undefined,
  soldAt: { microsSinceUnixEpoch: T0 - 1n },
};

interface Seed {
  templates?: any[];
  instances?: any[];
  affixes?: any[];
  listings?: any[];
  markers?: any[];
  buyback?: any[];
  buyMod?: bigint;
  sellMod?: bigint;
  perk?: boolean;
}

function newCtx(o: Seed = {}) {
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
          level: LEVEL,
          gold: START_GOLD,
          vendorBuyMod: o.buyMod ?? 0n,
          vendorSellMod: o.sellMod ?? 0n,
          locationId: HERE,
        },
        {
          id: 2n,
          ownerUserId: 8n,
          name: 'Torv',
          className: 'Ashwarden',
          level: LEVEL,
          gold: START_GOLD,
          vendorBuyMod: 0n,
          vendorSellMod: 0n,
          locationId: HERE,
        },
      ],
      npc: [
        { id: VENDOR, name: 'Brannoc', npcType: 'vendor', locationId: HERE },
        { id: NON_VENDOR, name: 'Old Mara', npcType: 'quest', locationId: HERE },
      ],
      vendor_inventory: o.listings ?? [],
      vendor_base_stock: o.markers ?? [],
      vendor_restock_tick: [],
      vendor_buyback: o.buyback ?? [],
      item_template: o.templates ?? TEMPLATES(),
      item_instance: o.instances ?? [],
      item_affix: o.affixes ?? [],
      renown_perk: o.perk
        ? [{ id: 1n, characterId: 1n, rank: 3n, perkKey: PERK_KEY, chosenAt: { microsSinceUnixEpoch: T0 } }]
        : [],
    },
    sender: alice,
    timestampMicros: T0,
    strict: true,
  });
}

/** Run a reducer as another sender against the same database. */
const as = (ctx: any, sender: any) => ({ ...ctx, sender });
const sellQ = (ctx: any, instanceId: bigint, quantity: bigint) =>
  sellItemQuantity(ctx, { characterId: 1n, itemInstanceId: instanceId, npcId: VENDOR, quantity });
const sellWhole = (ctx: any, instanceId: bigint) =>
  sellItem(ctx, { characterId: 1n, itemInstanceId: instanceId, npcId: VENDOR });
const buyAs = (ctx: any, templateId: bigint, who: 'alice' | 'bob' = 'alice') =>
  buyItem(as(ctx, who === 'alice' ? alice : bob), {
    characterId: who === 'alice' ? 1n : 2n,
    npcId: VENDOR,
    itemTemplateId: templateId,
  });
const buyBack = (ctx: any) => buyback(ctx, { characterId: 1n });
const say = (ctx: any, text: string) => submitIntent(ctx, { characterId: 1n, text });
const runRestock = (ctx: any) => restock(as(ctx, MODULE_ID), { arg: { scheduledId: 1n, afterNpcId: 0n } });

// ---------------------------------------------------------------------------

describe('schema', () => {
  it('vendor_inventory ends with a defaulted u64 quantity and is otherwise as before', () => {
    const rec = recordedTable('vendor_inventory')!;
    expect(rec).toBeDefined();
    expect(Object.keys(rec.cols)).toEqual(['id', 'npcId', 'itemTemplateId', 'price', 'qualityTier', 'quantity']);
    expect(rec.cols.quantity).toMatchObject({ kind: 'u64', defaulted: true });
    expect(rec.cols.quantity.optional).toBeFalsy();
    expect(rec.opts.public).toBe(true);
    expect(rec.opts.indexes).toEqual([{ accessor: 'by_vendor', algorithm: 'btree', columns: ['npcId'] }]);
  });

  it('every insert into vendor_inventory (non-test source scan) writes quantity, in exactly two files', () => {
    const here = fileURLToPath(new URL('.', import.meta.url));
    const srcRoot = join(here, '..');
    const files: string[] = [];
    const walk = (dir: string) => {
      for (const entry of readdirSync(dir)) {
        const full = join(dir, entry);
        if (statSync(full).isDirectory()) walk(full);
        else if (
          entry.endsWith('.ts') &&
          !entry.endsWith('.test.ts') &&
          !entry.endsWith('.d.ts') &&
          entry !== 'test-utils.ts' &&
          entry !== 'schema_recorder.ts' &&
          !entry.includes('fixture')
        ) {
          files.push(full);
        }
      }
    };
    walk(srcRoot);
    const hits: string[] = [];
    const failures: string[] = [];
    for (const file of files) {
      const source = (readFileSync(file, 'utf8') as string)
        .split(/\r?\n/)
        .filter((line) => !/^\s*(\/\/|\*|\/\*)/.test(line))
        .join('\n');
      const re = /vendor_inventory\s*\.insert\(\s*\{/g;
      let m: RegExpExecArray | null;
      while ((m = re.exec(source)) !== null) {
        const open = m.index + m[0].length - 1;
        let depth = 0;
        let end = -1;
        for (let i = open; i < source.length; i++) {
          if (source[i] === '{') depth++;
          else if (source[i] === '}') {
            depth--;
            if (depth === 0) {
              end = i;
              break;
            }
          }
        }
        const literal = source.slice(open, end + 1);
        const rel = file.slice(srcRoot.length + 1).replace(/\\/g, '/');
        if (hits.indexOf(rel) === -1) hits.push(rel);
        if (!literal.includes('quantity')) failures.push(`${rel}: insert literal has no quantity`);
      }
    }
    expect(failures).toEqual([]);
    expect(hits.sort()).toEqual(['helpers/vendor_sale.ts', 'index.ts']);
  });
});

describe('no duplication (T-50-100)', () => {
  it('selling one sword then buying two refuses the second buy and changes nothing', () => {
    const ctx = newCtx({ instances: [inst(800n, 80n, 1n)] });
    sellQ(ctx, 800n, 1n);
    expect(rows(ctx, 'vendor_inventory')).toHaveLength(1);
    expect(rows(ctx, 'vendor_inventory')[0]).toMatchObject({
      npcId: VENDOR,
      itemTemplateId: 80n,
      price: 26n,
      quantity: 1n,
    });
    expect(rows(ctx, 'vendor_inventory')[0].qualityTier).toBeUndefined();

    buyAs(ctx, 80n, 'bob');
    expect(countOf(ctx, 80n, 2n)).toBe(1n);
    expect(rows(ctx, 'vendor_inventory')).toHaveLength(0);

    const before = state(ctx);
    buyAs(ctx, 80n, 'bob');
    expect(lastMessage(ctx)).toBe('Brannoc has no more Test Sword.');
    expect(state(ctx)).toEqual(before);
  });

  it('a sale of 3 of 5 ore can be bought exactly three times', () => {
    const ctx = newCtx({ instances: [inst(700n, 70n, 5n)] });
    sellQ(ctx, 700n, 3n);
    expect(rows(ctx, 'vendor_inventory')[0].quantity).toBe(3n);
    for (let i = 0; i < 3; i++) {
      buyAs(ctx, 70n, 'bob');
      expect(messages(ctx).some((m) => m.startsWith('You buy Iron Ore'))).toBe(true);
    }
    const before = state(ctx);
    buyAs(ctx, 70n, 'bob');
    expect(lastMessage(ctx)).toBe('Brannoc has no more Iron Ore.');
    expect(state(ctx)).toEqual(before);
    const bobStacks = rows(ctx, 'item_instance').filter((i) => i.ownerCharacterId === 2n);
    expect(bobStacks).toHaveLength(1);
    expect(bobStacks[0].quantity).toBe(3n);
    expect(countOf(ctx, 70n, 1n)).toBe(2n);
    expect(rows(ctx, 'vendor_inventory')).toHaveLength(0);
  });

  it('conserves units over a sell and buy loop and gold strictly falls each loop', () => {
    const ctx = newCtx({ instances: [inst(800n, 80n, 1n)] });
    let goldBefore = goldOf(ctx);
    for (let i = 0; i < 5; i++) {
      const mine = rows(ctx, 'item_instance').find((r) => r.templateId === 80n && r.ownerCharacterId === 1n)!;
      sellQ(ctx, mine.id, 1n);
      const listed = listingsFor(ctx, 80n).reduce((s, r) => s + r.quantity, 0n);
      expect(countOf(ctx, 80n) + listed).toBe(1n);
      buyAs(ctx, 80n);
      const listedAfter = listingsFor(ctx, 80n).reduce((s, r) => s + r.quantity, 0n);
      expect(countOf(ctx, 80n) + listedAfter).toBe(1n);
      expect(goldOf(ctx)).toBeLessThan(goldBefore);
      goldBefore = goldOf(ctx);
    }
  });

  it('a sale of the same template and tier raises one row; another tier makes its own row', () => {
    const ctx = newCtx({
      instances: [inst(700n, 70n, 2n), inst(701n, 70n, 2n), inst(702n, 70n, 1n, { qualityTier: 'rare' })],
    });
    sellQ(ctx, 700n, 2n);
    sellQ(ctx, 701n, 2n);
    expect(listingsFor(ctx, 70n)).toHaveLength(1);
    expect(listingsFor(ctx, 70n)[0].quantity).toBe(4n);
    sellQ(ctx, 702n, 1n);
    const all = listingsFor(ctx, 70n);
    expect(all).toHaveLength(2);
    expect(all.find((r) => r.qualityTier === 'rare')!.quantity).toBe(1n);
    expect(all.find((r) => r.qualityTier === undefined)!.quantity).toBe(4n);
  });

  it('buy_item takes from a listing that still has stock, not a sold-out one with the same template', () => {
    const ctx = newCtx({
      listings: [
        { id: 41n, npcId: VENDOR, itemTemplateId: 70n, price: 14n, qualityTier: undefined, quantity: 0n },
        { id: 42n, npcId: VENDOR, itemTemplateId: 70n, price: 14n, qualityTier: 'rare', quantity: 2n },
      ],
      markers: [{ listingId: 41n, npcId: VENDOR }],
    });
    buyAs(ctx, 70n, 'bob');
    expect(rows(ctx, 'vendor_inventory').find((r) => r.id === 42n)!.quantity).toBe(1n);
    expect(rows(ctx, 'vendor_inventory').find((r) => r.id === 41n)!.quantity).toBe(0n);
  });
});

describe('sold-out base stock', () => {
  const BASE = { id: 40n, npcId: VENDOR, itemTemplateId: 70n, price: 14n, qualityTier: undefined, quantity: 2n };
  const MARKER = { listingId: 40n, npcId: VENDOR };

  it('stays at 0 with its marker, refuses a further buy, and restock replaces it', () => {
    const ctx = newCtx({ listings: [{ ...BASE }], markers: [{ ...MARKER }] });
    buyAs(ctx, 70n, 'bob');
    buyAs(ctx, 70n, 'bob');
    expect(rows(ctx, 'vendor_inventory').find((r) => r.id === 40n)!.quantity).toBe(0n);
    expect(rows(ctx, 'vendor_base_stock')).toEqual([MARKER]);
    const before = state(ctx);
    buyAs(ctx, 70n, 'bob');
    expect(lastMessage(ctx)).toBe('Brannoc has no more Iron Ore.');
    expect(state(ctx)).toEqual(before);

    runRestock(ctx);
    expect(rows(ctx, 'vendor_inventory').find((r) => r.id === 40n)).toBeUndefined();
    expect(rows(ctx, 'vendor_base_stock').find((m) => m.listingId === 40n)).toBeUndefined();
  });

  it('player units sold into a base listing get their own row: the base row and its marker stay, and only the base row rotates', () => {
    const ctx = newCtx({
      instances: [inst(700n, 70n, 2n)],
      listings: [{ ...BASE }],
      markers: [{ ...MARKER }],
    });
    sellQ(ctx, 700n, 2n);
    // WR-02: the base units stay base stock (quantity 2, marker kept); the player's 2 are a separate row.
    expect(rows(ctx, 'vendor_inventory').find((r) => r.id === 40n)).toEqual(BASE);
    expect(rows(ctx, 'vendor_base_stock')).toEqual([MARKER]);
    const player = listingsFor(ctx, 70n).filter((r) => r.id !== 40n);
    expect(player).toHaveLength(1);
    expect(player[0].quantity).toBe(2n);
    expect(rows(ctx, 'vendor_base_stock').find((m) => m.listingId === player[0].id)).toBeUndefined();
    const kept = { ...player[0] };
    runRestock(ctx);
    // Restock replaces the base row as a whole and never touches the player's units.
    expect(rows(ctx, 'vendor_inventory').find((r) => r.id === 40n)).toBeUndefined();
    expect(rows(ctx, 'vendor_base_stock').find((m) => m.listingId === 40n)).toBeUndefined();
    expect(rows(ctx, 'vendor_inventory').find((r) => r.id === kept.id)).toEqual(kept);
    expect(listingsFor(ctx, 70n)).toHaveLength(1);
  });

  it('a second sale raises the same player row and never the base row', () => {
    const ctx = newCtx({
      instances: [inst(700n, 70n, 2n), inst(701n, 70n, 3n)],
      listings: [{ ...BASE }],
      markers: [{ ...MARKER }],
    });
    sellQ(ctx, 700n, 2n);
    sellQ(ctx, 701n, 3n);
    expect(listingsFor(ctx, 70n)).toHaveLength(2);
    expect(rows(ctx, 'vendor_inventory').find((r) => r.id === 40n)).toEqual(BASE);
    expect(listingsFor(ctx, 70n).find((r) => r.id !== 40n)!.quantity).toBe(5n);
  });
});

describe('the price floor on the real handlers (T-50-101)', () => {
  const MODS: Array<[bigint, bigint]> = [
    [0n, 0n],
    [37n, 37n],
    [150n, 150n],
    [600n, 480n],
    [1000n, 800n],
  ];
  for (const [buyMod, sellMod] of MODS) {
    for (const perk of [false, true]) {
      for (const n of [1n, 3n, 12n]) {
        it(`buy mod ${buyMod}, sell mod ${sellMod}, perk ${perk}, stack ${n}: every unit costs more than a sale pays and gold only falls`, () => {
          const ctx = newCtx({ instances: [inst(830n, 83n, n)], buyMod, sellMod, perk });
          const perkBuy = perk ? perkBonusByField([PERK_KEY], 'vendorBuyDiscount', LEVEL) : 0;
          const perkSell = perk ? perkBonusByField([PERK_KEY], 'vendorSellBonus', LEVEL) : 0;
          sellQ(ctx, 830n, n);
          expect(goldOf(ctx) - START_GOLD).toBe(sellPayout(3n, n, perkSell, sellMod));
          const price = listingBuyPrice({
            listPrice: 6n,
            vendorValue: 3n,
            perkBuyPct: perkBuy,
            perkSellPct: perkSell,
            vendorBuyMod: buyMod,
            vendorSellMod: sellMod,
          });
          expect(price > sellPayout(3n, 1n, perkSell, sellMod)).toBe(true);
          for (let i = 0n; i < n; i++) {
            const before = goldOf(ctx);
            buyAs(ctx, 83n);
            expect(before - goldOf(ctx)).toBe(price);
          }
          expect(goldOf(ctx)).toBeLessThan(START_GOLD);
          expect(countOf(ctx, 83n)).toBe(n);
          expect(rows(ctx, 'vendor_inventory')).toHaveLength(0);
        });
      }
    }
  }
});

describe('partial sale and split (T-50-102, T-50-106)', () => {
  it('lowers the stack in place, lists the sold units and records exactly them', () => {
    const ctx = newCtx({ instances: [inst(700n, 70n, 12n)] });
    const before = { ...rows(ctx, 'item_instance')[0] };
    sellQ(ctx, 700n, 5n);
    const paid = sellPayout(7n, 5n, 0, 0n);
    const after = rows(ctx, 'item_instance').find((i) => i.id === 700n)!;
    expect(after).toEqual({ ...before, quantity: 7n });
    expect(goldOf(ctx)).toBe(START_GOLD + paid);
    const listing = listingsFor(ctx, 70n)[0];
    expect(listing).toMatchObject({ quantity: 5n, price: 14n });
    const sale = rows(ctx, 'vendor_buyback')[0];
    expect(sale).toMatchObject({ quantity: 5n, price: paid, affixesJson: '[]', listingId: listing.id });
    expect(lastMessage(ctx)).toBe(`You sell 5x Iron Ore for ${paid} gold.`);

    sellQ(ctx, 700n, 7n);
    expect(rows(ctx, 'item_instance')).toHaveLength(0);
    expect(listingsFor(ctx, 70n)[0].quantity).toBe(12n);
    const paid2 = sellPayout(7n, 7n, 0, 0n);
    expect(rows(ctx, 'vendor_buyback')).toHaveLength(1);
    expect(rows(ctx, 'vendor_buyback')[0]).toMatchObject({ quantity: 7n, price: paid2 });
    expect(lastMessage(ctx)).toBe(`You sell Iron Ore for ${paid2} gold.`);
  });

  it('keeps the affixes on the remaining part and records none for the sold units', () => {
    const ctx = newCtx({
      instances: [inst(800n, 80n, 3n)],
      affixes: [affix(1n, 800n, 'keen', 3n), affix(2n, 800n, 'slow', -4n)],
    });
    sellQ(ctx, 800n, 1n);
    expect(rows(ctx, 'item_instance')[0]).toMatchObject({ id: 800n, quantity: 2n });
    expect(rows(ctx, 'item_affix').map((a) => a.itemInstanceId)).toEqual([800n, 800n]);
    expect(rows(ctx, 'vendor_buyback')[0]).toMatchObject({ quantity: 1n, affixesJson: '[]' });
  });

  describe('refusals before any write', () => {
    const seeded = () =>
      newCtx({
        instances: [
          inst(700n, 70n, 12n),
          inst(701n, 70n, 3n, { ownerCharacterId: 2n }),
          inst(702n, 80n, 1n, { equippedSlot: 'mainHand' }),
          inst(703n, 81n, 2n),
        ],
        affixes: [affix(1n, 700n, 'keen', 3n)],
        buyback: [EARLIER_ROW],
      });
    const refuses = (instanceId: bigint, quantity: bigint, text: string, npcId = VENDOR) => {
      const ctx = seeded();
      const before = state(ctx);
      sellItemQuantity(ctx, { characterId: 1n, itemInstanceId: instanceId, npcId, quantity });
      expect(lastMessage(ctx)).toBe(text);
      expect(state(ctx)).toEqual(before);
    };
    it('quantity 0', () => refuses(700n, 0n, 'Choose at least one to sell.'));
    it('quantity above the stack', () => refuses(700n, 13n, 'You only have 12 Iron Ore.'));
    it("another character's instance", () => refuses(701n, 1n, 'Item does not belong to you'));
    it('an equipped instance', () => refuses(702n, 1n, 'Unequip item first'));
    it('an npc that is not a vendor', () => refuses(700n, 1n, 'There is no vendor here.', NON_VENDOR));
    it('a quest item, even with a valid quantity', () => refuses(703n, 1n, QUEST_ITEM_SALE_REFUSAL));
  });

  it('the kept sell_item still sells the whole stack', () => {
    const ctx = newCtx({ instances: [inst(700n, 70n, 12n)] });
    sellWhole(ctx, 700n);
    expect(rows(ctx, 'item_instance')).toHaveLength(0);
    expect(listingsFor(ctx, 70n)[0].quantity).toBe(12n);
    expect(rows(ctx, 'vendor_buyback')[0].quantity).toBe(12n);
  });
});

describe('buy-back quantity (T-50-104)', () => {
  it('merges the units back, refunds exactly, removes the listing and clears the row', () => {
    const ctx = newCtx({ instances: [inst(700n, 70n, 12n)] });
    sellQ(ctx, 700n, 5n);
    buyBack(ctx);
    expect(rows(ctx, 'item_instance')).toHaveLength(1);
    expect(rows(ctx, 'item_instance')[0]).toMatchObject({ id: 700n, quantity: 12n });
    expect(goldOf(ctx)).toBe(START_GOLD);
    expect(rows(ctx, 'vendor_inventory')).toHaveLength(0);
    expect(rows(ctx, 'vendor_buyback')).toHaveLength(0);
  });

  it('with a pre-existing player listing at 4, a sale of 5 makes 9 and the buy-back restores 4', () => {
    const seed = { id: 40n, npcId: VENDOR, itemTemplateId: 70n, price: 14n, qualityTier: undefined, quantity: 4n };
    const ctx = newCtx({ instances: [inst(700n, 70n, 12n)], listings: [{ ...seed }] });
    sellQ(ctx, 700n, 5n);
    expect(rows(ctx, 'vendor_inventory')[0].quantity).toBe(9n);
    buyBack(ctx);
    expect(rows(ctx, 'vendor_inventory')).toEqual([seed]);
  });

  it('refuses when the vendor has already resold the units and changes nothing', () => {
    const ctx = newCtx({ instances: [inst(700n, 70n, 12n)] });
    sellQ(ctx, 700n, 5n);
    buyAs(ctx, 70n, 'bob');
    expect(rows(ctx, 'vendor_inventory')[0].quantity).toBe(4n);
    const before = state(ctx);
    buyBack(ctx);
    expect(lastMessage(ctx)).toBe('Brannoc has already sold Iron Ore.');
    expect(state(ctx)).toEqual(before);
    expect(rows(ctx, 'vendor_buyback')).toHaveLength(1);
  });

  it('a sale into a template with base stock leaves the base row alone, and the buy-back removes only the player row', () => {
    const base = { id: 40n, npcId: VENDOR, itemTemplateId: 70n, price: 14n, qualityTier: undefined, quantity: 3n };
    const ctx = newCtx({
      instances: [inst(700n, 70n, 2n)],
      listings: [{ ...base }],
      markers: [{ listingId: 40n, npcId: VENDOR }],
    });
    sellQ(ctx, 700n, 2n);
    expect(rows(ctx, 'vendor_inventory').find((r) => r.id === 40n)).toEqual(base);
    buyBack(ctx);
    expect(rows(ctx, 'vendor_inventory')).toEqual([base]);
    expect(rows(ctx, 'vendor_base_stock')).toEqual([{ listingId: 40n, npcId: VENDOR }]);
    expect(countOf(ctx, 70n)).toBe(2n);
  });

  it('when buyers took every unit of that template and tier, the buy-back is refused and changes nothing', () => {
    const base = { id: 40n, npcId: VENDOR, itemTemplateId: 70n, price: 14n, qualityTier: undefined, quantity: 5n };
    const ctx = newCtx({
      instances: [inst(700n, 70n, 2n)],
      listings: [{ ...base }],
      markers: [{ listingId: 40n, npcId: VENDOR }],
    });
    sellQ(ctx, 700n, 2n);
    const playerId = listingsFor(ctx, 70n).find((r) => r.id !== 40n)!.id;
    // buy_item takes the lowest id first: 5 base units, then the player's 2.
    for (let i = 0; i < 7; i++) buyAs(ctx, 70n, 'bob');
    expect(listingsFor(ctx, 70n).reduce((s, r) => s + r.quantity, 0n)).toBe(0n);
    expect(rows(ctx, 'vendor_inventory').find((r) => r.id === playerId)).toBeUndefined();
    // Nothing left anywhere: the buy-back is refused and changes nothing.
    const before = state(ctx);
    buyBack(ctx);
    expect(lastMessage(ctx)).toBe('Brannoc has already sold Iron Ore.');
    expect(state(ctx)).toEqual(before);
  });

  it('a template removed after the sale takes the units out of the listing and clears the row', () => {
    const ctx = newCtx({ instances: [inst(700n, 70n, 5n)] });
    sellQ(ctx, 700n, 5n);
    expect(rows(ctx, 'vendor_inventory')).toHaveLength(1);
    const templates = rows(ctx, 'item_template');
    templates.splice(
      templates.findIndex((t) => t.id === 70n),
      1,
    );
    buyBack(ctx);
    expect(lastMessage(ctx)).toBe('That item can no longer be bought back.');
    expect(rows(ctx, 'vendor_inventory')).toHaveLength(0);
    expect(rows(ctx, 'vendor_buyback')).toHaveLength(0);
  });
});

describe('typed commands share the helper', () => {
  it("'sell 5 iron ore' sells five of twelve and records the exact quantity", () => {
    const ctx = newCtx({ instances: [inst(700n, 70n, 12n)] });
    say(ctx, 'sell 5 iron ore');
    expect(rows(ctx, 'item_instance')[0]).toMatchObject({ id: 700n, quantity: 7n });
    expect(listingsFor(ctx, 70n)[0].quantity).toBe(5n);
    expect(rows(ctx, 'vendor_buyback')).toHaveLength(1);
    expect(rows(ctx, 'vendor_buyback')[0].quantity).toBe(5n);
    expect(lastMessage(ctx)).toBe(`You sell 5x Iron Ore for ${sellPayout(7n, 5n, 0, 0n)} gold.`);
  });

  it("'sell 20 iron ore' sells the whole stack of twelve", () => {
    const ctx = newCtx({ instances: [inst(700n, 70n, 12n)] });
    say(ctx, 'sell 20 iron ore');
    expect(rows(ctx, 'item_instance')).toHaveLength(0);
    expect(lastMessage(ctx).startsWith('You sell 12x Iron Ore')).toBe(true);
    expect(listingsFor(ctx, 70n)[0].quantity).toBe(12n);
  });

  it("'sell 2 test sword' over two instances lists both and leaves an earlier buy-back row alone", () => {
    const ctx = newCtx({ instances: [inst(800n, 80n, 1n), inst(801n, 80n, 1n)], buyback: [EARLIER_ROW] });
    say(ctx, 'sell 2 test sword');
    expect(rows(ctx, 'item_instance')).toHaveLength(0);
    expect(listingsFor(ctx, 80n)).toHaveLength(1);
    expect(listingsFor(ctx, 80n)[0].quantity).toBe(2n);
    expect(rows(ctx, 'vendor_buyback')).toEqual([EARLIER_ROW]);
  });

  it("the typed single 'sell <item>' sells the whole instance into the listing", () => {
    const ctx = newCtx({ instances: [inst(700n, 70n, 4n)] });
    say(ctx, 'sell iron ore');
    expect(rows(ctx, 'item_instance')).toHaveLength(0);
    expect(listingsFor(ctx, 70n)[0].quantity).toBe(4n);
    expect(rows(ctx, 'vendor_buyback')[0].quantity).toBe(4n);
  });

  it("'shop' hides sold-out listings and shows the quantity", () => {
    const ctx = newCtx({
      listings: [
        { id: 40n, npcId: VENDOR, itemTemplateId: 70n, price: 14n, qualityTier: undefined, quantity: 0n },
        { id: 41n, npcId: VENDOR, itemTemplateId: 80n, price: 26n, qualityTier: undefined, quantity: 2n },
      ],
      markers: [{ listingId: 40n, npcId: VENDOR }],
    });
    say(ctx, 'shop');
    const text = lastMessage(ctx);
    expect(text).toContain('[Buy Test Sword]');
    expect(text).toContain('×2');
    expect(text).not.toContain('Iron Ore');
  });

  it("'shop' with every listing at 0 reads Nothing for sale.", () => {
    const ctx = newCtx({
      listings: [{ id: 40n, npcId: VENDOR, itemTemplateId: 70n, price: 14n, qualityTier: undefined, quantity: 0n }],
      markers: [{ listingId: 40n, npcId: VENDOR }],
    });
    say(ctx, 'shop');
    expect(lastMessage(ctx)).toContain('Nothing for sale.');
  });
});
