/**
 * Phase 50 (LDG-09, threats T-50-20 to T-50-23): the REAL sell_item and sell_all_junk handlers
 * captured from index.ts. Quest items are refused on the server with "Quest items can't be sold."
 * and nothing changes; a normal sale pays the shared payout, snapshots the affixes before deleting
 * them and records the one buy-back row (replacing an earlier one); sell_all_junk records nothing
 * and leaves an existing row alone. The typed sell commands (submit_intent) obey the same rules:
 * a single 'sell <item>' goes through the same helper and records; 'sell N <item>' and 'sell junk'
 * skip quest items and never touch the buy-back row. The mock db is strict; one shared identity object is used for
 * seeding and as the sender (the mock compares with ===).
 */
import { describe, it, expect, vi, beforeAll } from 'vitest';
import { capturedReducer } from '../helpers/schema_recorder';
import { createMockCtx } from '../helpers/test-utils';
import { sellPayout } from '../data/vendor_pricing';
import { parseAffixSnapshot } from '../helpers/vendor_sale';

vi.mock('spacetimedb/server', async () =>
  (await import('../helpers/schema_recorder')).createRecordingServerMock(),
);

const T0 = 1_700_000_000_000_000n;
const alice = { toHexString: () => 'a'.repeat(64) };
const START_GOLD = 1_000n;
const VENDOR = 5n;
const NON_VENDOR = 6n;
const HERE = 10n;
const REFUSAL = "Quest items can't be sold.";

let sellItem: (...args: any[]) => any;
let sellAllJunk: (...args: any[]) => any;
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
  sellAllJunk = capture('sell_all_junk');
  submitIntent = capture('submit_intent');
}, 120_000);

const rows = (ctx: any, table: string): any[] => ctx.db._tables[table] ?? [];
const messages = (ctx: any): string[] => rows(ctx, 'event_private').map((e) => e.message);
const gold = (ctx: any): bigint => rows(ctx, 'character')[0].gold;
const snapshot = (ctx: any, table: string): any[] => rows(ctx, table).map((r) => ({ ...r }));

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
  vendorValue: 7n,
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

function newCtx(o: {
  templates: any[];
  instances: any[];
  affixes?: any[];
  listings?: any[];
  buyback?: any[];
  npcs?: any[];
  gold?: bigint;
  sellMod?: bigint;
}) {
  return createMockCtx({
    seed: {
      player: [{ id: alice, userId: 7n, activeCharacterId: 1n }],
      character: [
        {
          id: 1n,
          ownerUserId: 7n,
          name: 'Mirel',
          className: 'Ashwarden',
          level: 5n,
          gold: o.gold ?? START_GOLD,
          vendorBuyMod: 0n,
          vendorSellMod: o.sellMod ?? 0n,
          locationId: HERE,
        },
      ],
      npc: o.npcs ?? [
        { id: VENDOR, name: 'Brannoc', npcType: 'vendor', locationId: HERE },
        { id: NON_VENDOR, name: 'Old Mara', npcType: 'quest', locationId: HERE },
      ],
      vendor_inventory: o.listings ?? [],
      vendor_buyback: o.buyback ?? [],
      item_template: o.templates,
      item_instance: o.instances,
      item_affix: o.affixes ?? [],
      renown_perk: [],
    },
    sender: alice,
    timestampMicros: T0,
    strict: true,
  });
}

describe('sell_item refuses quest items and changes nothing', () => {
  it("writes one system line and leaves instance, affixes, gold, listings and buy-back as they were", () => {
    const ctx = newCtx({
      templates: [tpl(81n, 'Sealed Writ', { slot: 'quest', vendorValue: 50n })],
      instances: [inst(810n, 81n, 1n)],
      affixes: [affix(1n, 810n, 'keen', 2n)],
      buyback: [EARLIER_ROW],
    });
    const before = {
      item_instance: snapshot(ctx, 'item_instance'),
      item_affix: snapshot(ctx, 'item_affix'),
      vendor_inventory: snapshot(ctx, 'vendor_inventory'),
      vendor_buyback: snapshot(ctx, 'vendor_buyback'),
    };
    sellItem(ctx, { characterId: 1n, itemInstanceId: 810n, npcId: VENDOR });
    expect(messages(ctx)).toEqual([REFUSAL]);
    expect(rows(ctx, 'event_private')[0].kind).toBe('system');
    expect(gold(ctx)).toBe(START_GOLD);
    expect(snapshot(ctx, 'item_instance')).toEqual(before.item_instance);
    expect(snapshot(ctx, 'item_affix')).toEqual(before.item_affix);
    expect(snapshot(ctx, 'vendor_inventory')).toEqual(before.vendor_inventory);
    expect(snapshot(ctx, 'vendor_buyback')).toEqual(before.vendor_buyback);
  });

  it('a non-vendor npc is refused first (as on the typed path); the quest item stays and nothing is recorded', () => {
    const ctx = newCtx({
      templates: [tpl(81n, 'Sealed Writ', { slot: 'quest' })],
      instances: [inst(810n, 81n, 1n)],
    });
    sellItem(ctx, { characterId: 1n, itemInstanceId: 810n, npcId: NON_VENDOR });
    expect(messages(ctx)).toEqual(['There is no vendor here.']);
    expect(rows(ctx, 'item_instance')).toHaveLength(1);
    expect(rows(ctx, 'vendor_buyback')).toHaveLength(0);
  });
});

describe('sell_item records the single sale', () => {
  const rare = tpl(80n, 'Test Sword', { rarity: 'common', vendorValue: 13n });
  const rareInstance = inst(800n, 80n, 1n, {
    qualityTier: 'rare',
    craftQuality: 'fine',
    displayName: 'Keen Test Sword of Slowness',
    isNamed: true,
    isTemporary: false,
  });

  it('pays sellPayout, deletes the instance and affixes, lists it and writes the buy-back row', () => {
    const ctx = newCtx({
      templates: [rare],
      instances: [rareInstance],
      affixes: [affix(1n, 800n, 'keen', 3n), affix(2n, 800n, 'slow', -4n)],
    });
    sellItem(ctx, { characterId: 1n, itemInstanceId: 800n, npcId: VENDOR });
    const paid = sellPayout(13n, 1n, 0, 0n);
    expect(gold(ctx) - START_GOLD).toBe(paid);
    expect(rows(ctx, 'item_instance')).toHaveLength(0);
    expect(rows(ctx, 'item_affix')).toHaveLength(0);
    const listings = rows(ctx, 'vendor_inventory');
    expect(listings).toHaveLength(1);
    expect(listings[0]).toMatchObject({ npcId: VENDOR, itemTemplateId: 80n, price: 26n, qualityTier: 'rare' });
    const buyback = rows(ctx, 'vendor_buyback');
    expect(buyback).toHaveLength(1);
    const row = buyback[0];
    expect(row).toMatchObject({
      characterId: 1n,
      npcId: VENDOR,
      npcName: 'Brannoc',
      locationId: HERE,
      templateId: 80n,
      itemName: 'Keen Test Sword of Slowness',
      rarity: 'rare',
      quantity: 1n,
      price: paid,
      qualityTier: 'rare',
      craftQuality: 'fine',
      displayName: 'Keen Test Sword of Slowness',
      isNamed: true,
      isTemporary: false,
      listingId: listings[0].id,
    });
    expect(row.soldAt).toEqual({ microsSinceUnixEpoch: T0 });
    const parsed = parseAffixSnapshot(row.affixesJson);
    expect(parsed).toHaveLength(2);
    expect(parsed.map((a) => BigInt(a.magnitude))).toEqual([3n, -4n]);
    expect(parsed.map((a) => a.affixKey)).toEqual(['keen', 'slow']);
    expect(messages(ctx)).toEqual([`You sell Test Sword for ${paid} gold.`]);
    expect(rows(ctx, 'event_private')[0].kind).toBe('reward');
  });

  it('uses the template name and rarity when the instance has no display name or quality', () => {
    const ctx = newCtx({
      templates: [tpl(80n, 'Plain Sword', { rarity: 'uncommon' })],
      instances: [inst(800n, 80n, 1n)],
    });
    sellItem(ctx, { characterId: 1n, itemInstanceId: 800n, npcId: VENDOR });
    const row = rows(ctx, 'vendor_buyback')[0];
    expect(row.itemName).toBe('Plain Sword');
    expect(row.rarity).toBe('uncommon');
    expect(row.qualityTier).toBeUndefined();
    expect(row.affixesJson).toBe('[]');
  });

  it('records the price actually paid for a stack, with the Charisma modifier', () => {
    const ctx = newCtx({
      templates: [tpl(82n, 'Iron Nails', { stackable: true, vendorValue: 7n })],
      instances: [inst(820n, 82n, 3n)],
      sellMod: 150n,
    });
    sellItem(ctx, { characterId: 1n, itemInstanceId: 820n, npcId: VENDOR });
    const paid = sellPayout(7n, 3n, 0, 150n);
    expect(gold(ctx) - START_GOLD).toBe(paid);
    expect(rows(ctx, 'vendor_buyback')[0]).toMatchObject({ quantity: 3n, price: paid });
  });

  it('leaves listingId unset when the vendor already lists that template and quality', () => {
    const ctx = newCtx({
      templates: [tpl(82n, 'Iron Nails', { stackable: true })],
      instances: [inst(820n, 82n, 1n)],
      listings: [{ id: 40n, npcId: VENDOR, itemTemplateId: 82n, price: 14n, qualityTier: undefined }],
    });
    sellItem(ctx, { characterId: 1n, itemInstanceId: 820n, npcId: VENDOR });
    expect(rows(ctx, 'vendor_inventory')).toHaveLength(1);
    expect(rows(ctx, 'vendor_buyback')[0].listingId).toBeUndefined();
  });

  it('a second sale replaces the row (still one row for the character)', () => {
    const ctx = newCtx({
      templates: [tpl(80n, 'Test Sword', { vendorValue: 13n }), tpl(82n, 'Iron Nails', { vendorValue: 7n })],
      instances: [inst(800n, 80n, 1n), inst(820n, 82n, 1n)],
    });
    sellItem(ctx, { characterId: 1n, itemInstanceId: 800n, npcId: VENDOR });
    sellItem(ctx, { characterId: 1n, itemInstanceId: 820n, npcId: VENDOR });
    const buyback = rows(ctx, 'vendor_buyback');
    expect(buyback).toHaveLength(1);
    expect(buyback[0]).toMatchObject({ templateId: 82n, itemName: 'Iron Nails', price: sellPayout(7n, 1n, 0, 0n) });
  });

  // The buyer must be a vendor npc at the character's location (the typed 'sell <item>' rule).
  // Every refusal is one system line and no write at all.
  function expectNoVendorRefusal(ctx: any, npcId: bigint) {
    const before = {
      item_instance: snapshot(ctx, 'item_instance'),
      item_affix: snapshot(ctx, 'item_affix'),
      vendor_inventory: snapshot(ctx, 'vendor_inventory'),
      vendor_buyback: snapshot(ctx, 'vendor_buyback'),
    };
    sellItem(ctx, { characterId: 1n, itemInstanceId: 800n, npcId });
    expect(messages(ctx)).toEqual(['There is no vendor here.']);
    expect(rows(ctx, 'event_private')[0].kind).toBe('system');
    expect(gold(ctx)).toBe(START_GOLD);
    expect(snapshot(ctx, 'item_instance')).toEqual(before.item_instance);
    expect(snapshot(ctx, 'item_affix')).toEqual(before.item_affix);
    expect(snapshot(ctx, 'vendor_inventory')).toEqual(before.vendor_inventory);
    expect(snapshot(ctx, 'vendor_buyback')).toEqual(before.vendor_buyback);
  }

  it('refuses a sale to a non-vendor npc: no payout, no listing, no buy-back row', () => {
    const ctx = newCtx({
      templates: [tpl(80n, 'Test Sword', { vendorValue: 13n })],
      instances: [inst(800n, 80n, 1n)],
    });
    expectNoVendorRefusal(ctx, NON_VENDOR);
  });

  it('refuses a sale when the npc row does not exist', () => {
    const ctx = newCtx({
      templates: [tpl(80n, 'Test Sword')],
      instances: [inst(800n, 80n, 1n)],
      npcs: [],
    });
    expectNoVendorRefusal(ctx, 77n);
  });

  it('refuses a sale to a vendor who is at another location', () => {
    const ctx = newCtx({
      templates: [tpl(80n, 'Test Sword')],
      instances: [inst(800n, 80n, 1n)],
      npcs: [{ id: VENDOR, name: 'Brannoc', npcType: 'vendor', locationId: HERE + 1n }],
    });
    expectNoVendorRefusal(ctx, VENDOR);
  });

  it('keeps the existing guards (equipped item is refused and nothing is recorded)', () => {
    const ctx = newCtx({
      templates: [tpl(80n, 'Test Sword')],
      instances: [inst(800n, 80n, 1n, { equippedSlot: 'mainHand' })],
    });
    sellItem(ctx, { characterId: 1n, itemInstanceId: 800n, npcId: VENDOR });
    expect(messages(ctx)).toEqual(['Unequip item first']);
    expect(rows(ctx, 'vendor_buyback')).toHaveLength(0);
  });
});

describe('sell_all_junk records nothing', () => {
  it('leaves an existing buy-back row deep-equal and adds none', () => {
    const ctx = newCtx({
      templates: [tpl(90n, 'Rusty Nail', { slot: 'junk', isJunk: true, vendorValue: 4n })],
      instances: [inst(900n, 90n, 1n)],
      buyback: [EARLIER_ROW],
    });
    const before = snapshot(ctx, 'vendor_buyback');
    sellAllJunk(ctx, { characterId: 1n });
    expect(gold(ctx) - START_GOLD).toBe(sellPayout(4n, 1n, 0, 0n));
    expect(snapshot(ctx, 'vendor_buyback')).toEqual(before);
  });

  it('creates no row when none existed', () => {
    const ctx = newCtx({
      templates: [tpl(90n, 'Rusty Nail', { slot: 'junk', isJunk: true, vendorValue: 4n })],
      instances: [inst(900n, 90n, 1n)],
    });
    sellAllJunk(ctx, { characterId: 1n });
    expect(rows(ctx, 'vendor_buyback')).toHaveLength(0);
  });
});

describe('sell_all_junk (window reducer) skips quest items like the typed sell junk', () => {
  const junkTemplates = [
    tpl(90n, 'Rusty Nail', { slot: 'junk', isJunk: true, vendorValue: 4n }),
    tpl(91n, 'Junk Writ', { slot: 'quest', isJunk: true, vendorValue: 9n }),
  ];

  it('keeps a template that is both junk and quest, sells the other junk and pays only that', () => {
    const ctx = newCtx({
      templates: junkTemplates,
      instances: [inst(900n, 90n, 1n), inst(910n, 91n, 2n)],
      affixes: [affix(1n, 910n, 'keen', 2n)],
      buyback: [EARLIER_ROW],
    });
    const before = snapshot(ctx, 'vendor_buyback');
    sellAllJunk(ctx, { characterId: 1n });
    const paid = sellPayout(4n, 1n, 0, 0n);
    expect(gold(ctx) - START_GOLD).toBe(paid);
    expect(messages(ctx)).toEqual([`You sell 1 junk item(s) for ${paid} gold.`]);
    // The quest stack and its affix survive; only the plain junk is gone.
    expect(rows(ctx, 'item_instance').map((i) => i.id)).toEqual([910n]);
    expect(rows(ctx, 'item_instance')[0].quantity).toBe(2n);
    expect(rows(ctx, 'item_affix').map((a) => a.id)).toEqual([1n]);
    expect(snapshot(ctx, 'vendor_buyback')).toEqual(before);
  });

  it('when the only junk is a quest item nothing is sold and no gold moves', () => {
    const ctx = newCtx({ templates: junkTemplates, instances: [inst(910n, 91n, 1n)] });
    sellAllJunk(ctx, { characterId: 1n });
    expect(gold(ctx)).toBe(START_GOLD);
    expect(rows(ctx, 'item_instance').map((i) => i.id)).toEqual([910n]);
    expect(messages(ctx)).toEqual(['You sell 0 junk item(s) for 0 gold.']);
  });
});

describe('parseAffixSnapshot', () => {
  it('round-trips and drops malformed input without throwing', () => {
    const good = { affixType: 'prefix', affixKey: 'k', affixName: 'N', statKey: 's', magnitude: '-4' };
    expect(parseAffixSnapshot(JSON.stringify([good]))).toEqual([good]);
    expect(parseAffixSnapshot('not json')).toEqual([]);
    expect(parseAffixSnapshot('{"a":1}')).toEqual([]);
    expect(parseAffixSnapshot(JSON.stringify([good, { ...good, magnitude: '1.5' }, { ...good, affixKey: 3 }, null]))).toEqual([good]);
  });
});

const say = (ctx: any, text: string) => submitIntent(ctx, { characterId: 1n, text });

describe("typed 'sell <item>' (single)", () => {
  it('refuses a quest item and changes nothing', () => {
    const ctx = newCtx({
      templates: [tpl(81n, 'Sealed Writ', { slot: 'quest', vendorValue: 50n })],
      instances: [inst(810n, 81n, 1n)],
      affixes: [affix(1n, 810n, 'keen', 2n)],
      buyback: [EARLIER_ROW],
    });
    const before = {
      item_instance: snapshot(ctx, 'item_instance'),
      item_affix: snapshot(ctx, 'item_affix'),
      vendor_inventory: snapshot(ctx, 'vendor_inventory'),
      vendor_buyback: snapshot(ctx, 'vendor_buyback'),
    };
    say(ctx, 'sell sealed writ');
    expect(messages(ctx)).toEqual([REFUSAL]);
    expect(gold(ctx)).toBe(START_GOLD);
    expect(snapshot(ctx, 'item_instance')).toEqual(before.item_instance);
    expect(snapshot(ctx, 'item_affix')).toEqual(before.item_affix);
    expect(snapshot(ctx, 'vendor_inventory')).toEqual(before.vendor_inventory);
    expect(snapshot(ctx, 'vendor_buyback')).toEqual(before.vendor_buyback);
  });

  it('sells a normal item as before and records the buy-back row, replacing an earlier one', () => {
    const ctx = newCtx({
      templates: [tpl(80n, 'Test Sword', { vendorValue: 13n })],
      instances: [inst(800n, 80n, 1n)],
      affixes: [affix(1n, 800n, 'keen', 3n)],
      buyback: [EARLIER_ROW],
    });
    say(ctx, 'sell test sword');
    const paid = sellPayout(13n, 1n, 0, 0n);
    expect(messages(ctx)).toEqual([`You sell Test Sword for ${paid} gold.`]);
    expect(gold(ctx) - START_GOLD).toBe(paid);
    expect(rows(ctx, 'item_instance')).toHaveLength(0);
    expect(rows(ctx, 'item_affix')).toHaveLength(0);
    const listings = rows(ctx, 'vendor_inventory');
    expect(listings).toHaveLength(1);
    expect(listings[0]).toMatchObject({ npcId: VENDOR, itemTemplateId: 80n, price: 26n });
    const buyback = rows(ctx, 'vendor_buyback');
    expect(buyback).toHaveLength(1);
    expect(buyback[0]).toMatchObject({
      characterId: 1n,
      npcId: VENDOR,
      npcName: 'Brannoc',
      locationId: HERE,
      templateId: 80n,
      itemName: 'Test Sword',
      price: paid,
      listingId: listings[0].id,
    });
    expect(parseAffixSnapshot(buyback[0].affixesJson).map((a) => a.affixKey)).toEqual(['keen']);
  });

  it('says there is no vendor when none is at the location and writes nothing', () => {
    const ctx = newCtx({
      templates: [tpl(80n, 'Test Sword')],
      instances: [inst(800n, 80n, 1n)],
      npcs: [{ id: NON_VENDOR, name: 'Old Mara', npcType: 'quest', locationId: HERE }],
    });
    say(ctx, 'sell test sword');
    expect(messages(ctx)).toEqual(['There is no vendor here.']);
    expect(rows(ctx, 'item_instance')).toHaveLength(1);
    expect(rows(ctx, 'vendor_buyback')).toHaveLength(0);
  });
});

describe("typed 'sell N <item>'", () => {
  const templates = [
    tpl(81n, 'Shard Writ', { slot: 'quest', vendorValue: 50n }),
    tpl(83n, 'Glass Shard', { vendorValue: 7n }),
  ];

  it('sells the normal matches, leaves the quest item and never touches the buy-back row', () => {
    const ctx = newCtx({
      templates,
      instances: [inst(810n, 81n, 1n), inst(830n, 83n, 1n), inst(831n, 83n, 1n)],
      affixes: [affix(1n, 830n, 'keen', 2n)],
      buyback: [EARLIER_ROW],
    });
    const before = snapshot(ctx, 'vendor_buyback');
    say(ctx, 'sell 2 shard');
    const each = sellPayout(7n, 1n, 0, 0n);
    expect(messages(ctx)).toEqual([`You sell 2x Glass Shard for ${each * 2n} gold.`]);
    expect(gold(ctx) - START_GOLD).toBe(each * 2n);
    expect(rows(ctx, 'item_instance').map((i) => i.id)).toEqual([810n]);
    expect(rows(ctx, 'item_affix')).toHaveLength(0);
    expect(snapshot(ctx, 'vendor_buyback')).toEqual(before);
  });

  it('pays the shared per-instance payout with the Charisma modifier', () => {
    const ctx = newCtx({
      templates,
      instances: [inst(830n, 83n, 3n), inst(831n, 83n, 2n)],
      sellMod: 150n,
    });
    say(ctx, 'sell 2 glass shard');
    expect(gold(ctx) - START_GOLD).toBe(sellPayout(7n, 3n, 0, 150n) + sellPayout(7n, 2n, 0, 150n));
    expect(rows(ctx, 'vendor_buyback')).toHaveLength(0);
  });

  it('answers the refusal and changes nothing when every match is a quest item', () => {
    const ctx = newCtx({
      templates,
      instances: [inst(810n, 81n, 1n)],
      buyback: [EARLIER_ROW],
    });
    const before = {
      item_instance: snapshot(ctx, 'item_instance'),
      vendor_inventory: snapshot(ctx, 'vendor_inventory'),
      vendor_buyback: snapshot(ctx, 'vendor_buyback'),
    };
    say(ctx, 'sell 1 shard writ');
    expect(messages(ctx)).toEqual([REFUSAL]);
    expect(gold(ctx)).toBe(START_GOLD);
    expect(snapshot(ctx, 'item_instance')).toEqual(before.item_instance);
    expect(snapshot(ctx, 'vendor_inventory')).toEqual(before.vendor_inventory);
    expect(snapshot(ctx, 'vendor_buyback')).toEqual(before.vendor_buyback);
  });

  it('keeps the not-found line when nothing matches', () => {
    const ctx = newCtx({ templates, instances: [inst(830n, 83n, 1n)] });
    say(ctx, 'sell 2 banner');
    expect(messages(ctx)).toEqual(['You don\'t have "banner" in your backpack.']);
    expect(rows(ctx, 'item_instance')).toHaveLength(1);
  });
});

describe("typed 'sell junk'", () => {
  const junkTemplates = [
    tpl(90n, 'Rusty Nail', { slot: 'junk', isJunk: true, vendorValue: 4n }),
    tpl(91n, 'Junk Writ', { slot: 'quest', isJunk: true, vendorValue: 9n }),
  ];

  it('skips a template that is both junk and quest, sells the other junk and leaves the buy-back row', () => {
    const ctx = newCtx({
      templates: junkTemplates,
      instances: [inst(900n, 90n, 1n), inst(910n, 91n, 1n)],
      buyback: [EARLIER_ROW],
    });
    const before = snapshot(ctx, 'vendor_buyback');
    say(ctx, 'sell junk');
    const paid = sellPayout(4n, 1n, 0, 0n);
    expect(gold(ctx) - START_GOLD).toBe(paid);
    expect(messages(ctx)).toEqual([`You sell 1 junk item(s) for ${paid} gold: Rusty Nail.`]);
    expect(rows(ctx, 'item_instance').map((i) => i.id)).toEqual([910n]);
    expect(snapshot(ctx, 'vendor_buyback')).toEqual(before);
  });

  it('creates no buy-back row', () => {
    const ctx = newCtx({ templates: junkTemplates, instances: [inst(900n, 90n, 1n)] });
    say(ctx, 'sell all junk');
    expect(rows(ctx, 'vendor_buyback')).toHaveLength(0);
  });

  it('answers "You have no junk to sell." when the only junk is a quest item', () => {
    const ctx = newCtx({ templates: junkTemplates, instances: [inst(910n, 91n, 1n)], buyback: [EARLIER_ROW] });
    say(ctx, 'sell junk');
    expect(messages(ctx)).toEqual(['You have no junk to sell.']);
    expect(rows(ctx, 'item_instance')).toHaveLength(1);
    expect(gold(ctx)).toBe(START_GOLD);
  });
});
