/**
 * Differential guard (Phase 50, LDG-08 / LDG-09, threat T-50-14): the REAL buy_item, sell_item and
 * sell_all_junk handlers captured from index.ts charge and pay exactly what the shared
 * data/vendor_pricing helpers compute, across Charisma modifiers and with and without a renown
 * vendor perk. Written to pass against the inline price math and kept unchanged after the handlers
 * were pointed at the helper. The mock db is strict; one shared identity object is used for
 * seeding and as the sender (the mock compares with ===).
 */
import { describe, it, expect, vi, beforeAll } from 'vitest';
import { capturedReducer } from '../helpers/schema_recorder';
import { createMockCtx } from '../helpers/test-utils';
import { buyPrice, sellPayout } from '../data/vendor_pricing';
import { perkBonusByField } from '../data/perk_rules';

vi.mock('spacetimedb/server', async () =>
  (await import('../helpers/schema_recorder')).createRecordingServerMock(),
);

const T0 = 1_700_000_000_000_000n;
const alice = { toHexString: () => 'a'.repeat(64) };
const LEVEL = 5n;
const START_GOLD = 10_000n;
const VENDOR = 5n;

let buyItem: (...args: any[]) => any;
let sellItem: (...args: any[]) => any;
let sellAllJunk: (...args: any[]) => any;

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
  buyItem = capture('buy_item');
  sellItem = capture('sell_item');
  sellAllJunk = capture('sell_all_junk');
}, 120_000);

const rows = (ctx: any, table: string): any[] => ctx.db._tables[table] ?? [];
const messages = (ctx: any): string[] => rows(ctx, 'event_private').map((e) => e.message);
const gold = (ctx: any): bigint => rows(ctx, 'character')[0].gold;

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

const PERK_KEY = 'shrewd_bargainer';

interface Seedable {
  templates: any[];
  instances: any[];
  listings?: any[];
  buyMod: bigint;
  sellMod: bigint;
  perk: boolean;
  gold?: bigint;
}

function newCtx(o: Seedable) {
  return createMockCtx({
    seed: {
      player: [{ id: alice, userId: 7n, activeCharacterId: 1n }],
      character: [
        {
          id: 1n,
          ownerUserId: 7n,
          name: 'Mirel',
          className: 'Ashwarden',
          level: LEVEL,
          gold: o.gold ?? START_GOLD,
          vendorBuyMod: o.buyMod,
          vendorSellMod: o.sellMod,
          locationId: 10n,
        },
      ],
      npc: [{ id: VENDOR, name: 'Brannoc', npcType: 'vendor', locationId: 10n }],
      vendor_inventory: o.listings ?? [],
      item_template: o.templates,
      item_instance: o.instances,
      item_affix: [],
      renown_perk: o.perk
        ? [{ id: 1n, characterId: 1n, rank: 3n, perkKey: PERK_KEY, chosenAt: { microsSinceUnixEpoch: T0 } }]
        : [],
    },
    sender: alice,
    timestampMicros: T0,
    strict: true,
  });
}

const perkPct = (perk: boolean, field: 'vendorBuyDiscount' | 'vendorSellBonus') =>
  perk ? perkBonusByField([PERK_KEY], field, LEVEL) : 0;

const MODS: [bigint, bigint][] = [
  [0n, 0n],
  [37n, 37n],
  [150n, 150n],
  [150n, 0n],
  [0n, 37n],
];
const FIXTURES = MODS.flatMap(([buyMod, sellMod]) =>
  [false, true].map((perk) => ({ label: `buyMod ${buyMod} sellMod ${sellMod} ${perk ? 'with' : 'without'} perk`, buyMod, sellMod, perk })),
);

const inst = (id: bigint, templateId: bigint, quantity: bigint, over: Record<string, unknown> = {}) => ({
  id,
  templateId,
  ownerCharacterId: 1n,
  equippedSlot: undefined,
  quantity,
  ...over,
});

describe('the perk used by the fixtures is real', () => {
  it('shrewd_bargainer gives a 5 percent buy discount and sell bonus', () => {
    expect(perkBonusByField([PERK_KEY], 'vendorBuyDiscount', LEVEL)).toBe(5);
    expect(perkBonusByField([PERK_KEY], 'vendorSellBonus', LEVEL)).toBe(5);
  });
});

describe('buy_item charges buyPrice', () => {
  it.each(FIXTURES)('$label', ({ buyMod, sellMod, perk }) => {
    const listing = { id: 1n, npcId: VENDOR, itemTemplateId: 80n, price: 123n, qualityTier: undefined };
    const ctx = newCtx({ templates: [tpl(80n, 'Test Sword')], instances: [], listings: [listing], buyMod, sellMod, perk });
    buyItem(ctx, { characterId: 1n, npcId: VENDOR, itemTemplateId: 80n });
    const pct = perkPct(perk, 'vendorBuyDiscount');
    const expected = buyPrice(123n, pct, buyMod);
    expect(START_GOLD - gold(ctx)).toBe(expected);
    expect(messages(ctx)).toEqual([`You buy Test Sword for ${expected} gold.${pct > 0 ? ` (${pct}% perk discount)` : ''}`]);
    expect(rows(ctx, 'event_private')[0].kind).toBe('reward');
    expect(rows(ctx, 'item_instance')).toHaveLength(1);
  });

  it('refuses with Not enough gold and charges nothing', () => {
    const listing = { id: 1n, npcId: VENDOR, itemTemplateId: 80n, price: 123n };
    const ctx = newCtx({ templates: [tpl(80n, 'Test Sword')], instances: [], listings: [listing], buyMod: 0n, sellMod: 0n, perk: false, gold: 10n });
    buyItem(ctx, { characterId: 1n, npcId: VENDOR, itemTemplateId: 80n });
    expect(messages(ctx)).toEqual(['Not enough gold']);
    expect(gold(ctx)).toBe(10n);
    expect(rows(ctx, 'item_instance')).toHaveLength(0);
  });

  it('refuses with Backpack is full', () => {
    const listing = { id: 1n, npcId: VENDOR, itemTemplateId: 80n, price: 123n };
    const filler = Array.from({ length: 50 }, (_, i) => inst(BigInt(1000 + i), 81n, 1n));
    const ctx = newCtx({
      templates: [tpl(80n, 'Test Sword'), tpl(81n, 'Filler')],
      instances: filler,
      listings: [listing],
      buyMod: 0n,
      sellMod: 0n,
      perk: false,
    });
    buyItem(ctx, { characterId: 1n, npcId: VENDOR, itemTemplateId: 80n });
    expect(messages(ctx)).toEqual(['Backpack is full']);
    expect(gold(ctx)).toBe(START_GOLD);
    expect(rows(ctx, 'item_instance')).toHaveLength(50);
  });
});

describe('sell_item pays sellPayout', () => {
  const cases: [string, bigint, bigint][] = [
    ['a stack of 3', 7n, 3n],
    ['a single item', 13n, 1n],
  ];
  for (const [what, value, qty] of cases) {
    it.each(FIXTURES)(`${what}: $label`, ({ buyMod, sellMod, perk }) => {
      const ctx = newCtx({
        templates: [tpl(80n, 'Test Sword', { vendorValue: value, stackable: qty > 1n })],
        instances: [inst(800n, 80n, qty)],
        buyMod,
        sellMod,
        perk,
      });
      sellItem(ctx, { characterId: 1n, itemInstanceId: 800n, npcId: VENDOR });
      const pct = perkPct(perk, 'vendorSellBonus');
      const expected = sellPayout(value, qty, pct, sellMod);
      expect(gold(ctx) - START_GOLD).toBe(expected);
      expect(messages(ctx)).toEqual([`You sell Test Sword for ${expected} gold.${pct > 0 ? ` (${pct}% perk bonus)` : ''}`]);
      expect(rows(ctx, 'event_private')[0].kind).toBe('reward');
      expect(rows(ctx, 'item_instance')).toHaveLength(0);
    });
  }
});

describe('sell_all_junk pays the sum of per-instance sellPayout', () => {
  // Three junk stacks of value 7: per instance 7 * 105 / 100 truncates to 7 each (21 total) but a
  // pooled 21 * 105 / 100 would pay 22, so a pooled sum fails the perk fixtures.
  const junk = (id: bigint, templateId: bigint, qty: bigint, over: Record<string, unknown> = {}) =>
    inst(id, templateId, qty, over);

  it.each(FIXTURES)('$label', ({ buyMod, sellMod, perk }) => {
    const ctx = newCtx({
      templates: [
        tpl(90n, 'Rusty Nail', { slot: 'junk', isJunk: true, stackable: true, vendorValue: 7n }),
        tpl(91n, 'Broken Cup', { slot: 'junk', isJunk: true, stackable: true, vendorValue: 7n }),
        tpl(92n, 'Bent Spoon', { slot: 'junk', isJunk: true, stackable: true, vendorValue: 7n }),
        tpl(93n, 'Good Sword', { vendorValue: 99n }),
        tpl(94n, 'Worn Junk', { slot: 'junk', isJunk: true, vendorValue: 50n }),
      ],
      instances: [
        junk(900n, 90n, 1n),
        junk(901n, 91n, 1n),
        junk(902n, 92n, 1n),
        junk(903n, 93n, 1n), // not junk: kept
        junk(904n, 94n, 1n, { equippedSlot: 'neck' }), // equipped: kept
      ],
      buyMod,
      sellMod,
      perk,
    });
    sellAllJunk(ctx, { characterId: 1n });
    const pct = perkPct(perk, 'vendorSellBonus');
    const expected = 3n * sellPayout(7n, 1n, pct, sellMod);
    expect(gold(ctx) - START_GOLD).toBe(expected);
    expect(messages(ctx)).toEqual([`You sell 3 junk item(s) for ${expected} gold${pct > 0 ? ` (${pct}% perk bonus)` : ''}.`]);
    expect(rows(ctx, 'item_instance').map((i) => i.id).sort()).toEqual([903n, 904n]);
    if (perk && sellMod === 0n) {
      // The pooled sum would round differently, so this fixture really pins per-instance rounding.
      expect(expected).toBe(21n);
      expect(sellPayout(21n, 1n, pct, sellMod)).toBe(22n);
    }
  });

  it('writes a zero line and no gold change when there is no junk', () => {
    const ctx = newCtx({ templates: [tpl(93n, 'Good Sword')], instances: [junk(903n, 93n, 1n)], buyMod: 0n, sellMod: 0n, perk: false });
    sellAllJunk(ctx, { characterId: 1n });
    expect(gold(ctx)).toBe(START_GOLD);
    expect(messages(ctx)).toEqual(['You sell 0 junk item(s) for 0 gold.']);
  });
});
