import { describe, expect, it } from 'vitest';
import { MAX_INVENTORY_SLOTS } from '@game-data/inventory_rules';
import { listingBuyPrice, sellPayout } from '@game-data/vendor_pricing';
import { perkBonusByField } from '@game-data/perk_rules';
import type { ItemInstance, ItemTemplate, Npc, VendorBuyback, VendorInventory } from '../module_bindings/types';
import {
  FOR_SALE_FILTERS,
  SOLD_OUT_REASON,
  buybackCard,
  clampSellQuantity,
  forSaleEmptyText,
  forSaleRows,
  formatRapportPercent,
  junkSummary,
  needsQuantity,
  parseSellQuantity,
  quantitySale,
  rapportParts,
  rapportText,
  resolveVendor,
  sellRows,
  vendorLeft,
} from './vendorModel';
import type { ForSaleInput, SellInput, VendorCharacter } from './vendorModel';

const PAYLOAD = '<img src=x onerror=alert(1)>';

function tpl(id: bigint, overrides: Record<string, unknown> = {}): ItemTemplate {
  return {
    id,
    name: `Item ${id}`,
    slot: 'chest',
    armorType: 'leather',
    weaponType: '',
    rarity: 'common',
    tier: 1n,
    isJunk: false,
    vendorValue: 10n,
    requiredLevel: 1n,
    allowedClasses: '',
    stackable: false,
    wellFedDurationMicros: 0n,
    description: undefined,
    ...overrides,
  } as unknown as ItemTemplate;
}

function inst(id: bigint, templateId: bigint, overrides: Record<string, unknown> = {}): ItemInstance {
  return {
    id,
    templateId,
    ownerCharacterId: 7n,
    equippedSlot: undefined,
    quantity: 1n,
    qualityTier: undefined,
    craftQuality: undefined,
    displayName: undefined,
    ...overrides,
  } as unknown as ItemInstance;
}

function listing(id: bigint, templateId: bigint, price: bigint, quantity = 1n): VendorInventory {
  return { id, npcId: 2n, itemTemplateId: templateId, price, qualityTier: undefined, quantity } as unknown as VendorInventory;
}

function npc(id: bigint, name: string, npcType = 'vendor'): Npc {
  return { id, name, npcType, locationId: 10n, greeting: '', factionId: undefined } as unknown as Npc;
}

const CHARACTER: VendorCharacter = {
  level: 5n,
  className: 'Warrior',
  weaponProficiencies: 'sword,axe',
  armorProficiencies: 'leather,plate',
  gold: 1000n,
  locationId: 10n,
  vendorBuyMod: 0n,
  vendorSellMod: 0n,
};

function map(templates: ItemTemplate[]): ReadonlyMap<bigint, ItemTemplate> {
  return new Map(templates.map((t) => [t.id, t]));
}

describe('resolveVendor', () => {
  const marta = npc(2n, 'Marta');
  const bram = npc(3n, 'Bram');
  const aldric = npc(4n, 'Aldric', 'quest');

  it('uses the screen arguments NPC when that vendor is here', () => {
    expect(resolveVendor({ npcId: 3n, npcName: 'Bram' }, [marta, bram])).toEqual({ kind: 'vendor', npc: bram });
  });

  it('reports an argument NPC that is not here as gone, with the name the arguments carried', () => {
    expect(resolveVendor({ npcId: 9n, npcName: 'Old Tom' }, [marta])).toEqual({
      kind: 'gone',
      npcId: 9n,
      name: 'Old Tom',
    });
    expect(resolveVendor({ npcId: 9n }, [marta])).toEqual({ kind: 'gone', npcId: 9n, name: '' });
  });

  it('with no arguments picks the only vendor, lists several, and is empty with none', () => {
    expect(resolveVendor(null, [marta, aldric])).toEqual({ kind: 'vendor', npc: marta });
    expect(resolveVendor(null, [marta, bram])).toEqual({ kind: 'list', vendors: [marta, bram] });
    expect(resolveVendor(null, [aldric])).toEqual({ kind: 'empty' });
    expect(resolveVendor(null, [])).toEqual({ kind: 'empty' });
  });

  it('ignores arguments without an NPC id and non-vendor NPCs', () => {
    expect(resolveVendor({}, [marta])).toEqual({ kind: 'vendor', npc: marta });
    expect(resolveVendor({ npcId: 4n, npcName: 'Aldric' }, [aldric, marta])).toEqual({
      kind: 'gone',
      npcId: 4n,
      name: 'Aldric',
    });
  });

  it('vendorLeft is true once the NPC id is not in npcsHere', () => {
    expect(vendorLeft({ id: 2n }, [marta])).toBe(false);
    expect(vendorLeft({ id: 2n }, [bram])).toBe(true);
    expect(vendorLeft({ id: 2n }, [])).toBe(true);
  });
});

describe('forSaleRows', () => {
  const sword = tpl(1n, {
    name: 'Iron Sword',
    slot: 'mainHand',
    armorType: '',
    weaponType: 'sword',
    rarity: 'rare',
    tier: 2n,
    requiredLevel: 3n,
  });
  const helm = tpl(2n, { name: 'Leather Cap', slot: 'head', armorType: 'leather', tier: 1n });
  const chest = tpl(3n, { name: 'Plate Mail', slot: 'chest', armorType: 'plate', tier: 3n, requiredLevel: 8n });
  const bread = tpl(4n, { name: 'Bread', slot: 'food', armorType: '', tier: 1n, rarity: 'common' });
  const tea = tpl(5n, { name: 'Traveler Tea', slot: 'consumable', armorType: '', tier: 1n });
  const scroll = tpl(6n, { name: 'Scroll: Spark', slot: 'misc', armorType: '', tier: 1n });
  const ore = tpl(7n, { name: 'Iron Ore', slot: 'material', armorType: '', tier: 2n, stackable: true });
  const odd = tpl(8n, { name: 'Odd Thing', slot: 'misc', armorType: '', tier: 1n });
  const robe = tpl(9n, { name: 'Mage Robe', slot: 'chest', armorType: 'cloth', tier: 1n });
  const ALL = [sword, helm, chest, bread, tea, scroll, ore, odd, robe];

  function input(over: Partial<ForSaleInput> = {}): ForSaleInput {
    return {
      stock: [
        listing(100n, 8n, 5n),
        listing(101n, 7n, 12n),
        listing(102n, 3n, 300n),
        listing(103n, 1n, 50n),
        listing(104n, 6n, 40n),
        listing(105n, 4n, 3n),
        listing(106n, 2n, 20n),
        listing(107n, 5n, 6n),
        listing(108n, 9n, 15n),
      ],
      templates: map(ALL),
      items: [],
      character: CHARACTER,
      perkKeys: [],
      filter: 'all',
      ...over,
    };
  }

  it('orders gear by slot, then Food, Recipe, Material, Other, within a group by tier then name', () => {
    const rows = forSaleRows(input());
    expect(rows.map((r) => r.name)).toEqual([
      'Iron Sword', // mainHand
      'Leather Cap', // head
      'Mage Robe', // chest tier 1
      'Plate Mail', // chest tier 3
      'Bread',
      'Traveler Tea',
      'Scroll: Spark',
      'Iron Ore',
      'Odd Thing',
    ]);
  });

  it('colors a row by the template rarity and builds the sub-line and slot cell', () => {
    const rows = forSaleRows(input());
    const byName = (n: string) => rows.find((r) => r.name === n)!;
    expect(byName('Iron Sword').color).toBe('var(--color-rarity-rare)');
    expect(byName('Leather Cap').color).toBe('var(--color-rarity-common)');
    expect(byName('Iron Sword').subLine).toBe('Tier 2 · Sword');
    expect(byName('Leather Cap').subLine).toBe('Tier 1 · Leather');
    expect(byName('Leather Cap').slotText).toBe('Head');
    expect(byName('Iron Sword').slotText).toBe('Main hand');
    expect(byName('Bread').subLine).toBe('Food');
    expect(byName('Traveler Tea').subLine).toBe('Consumable');
    expect(byName('Scroll: Spark').subLine).toBe('Recipe');
    expect(byName('Iron Ore').subLine).toBe('Material');
    expect(byName('Bread').slotText).toBe('—');
  });

  // The price the server charges for a listing of this fixture's templates (vendorValue 10).
  const charged = (listPrice: bigint, over: { buyMod?: bigint; sellMod?: bigint; perk?: boolean } = {}): bigint =>
    listingBuyPrice({
      listPrice,
      vendorValue: 10n,
      perkBuyPct: over.perk ? perkBonusByField(['shrewd_bargainer'], 'vendorBuyDiscount', CHARACTER.level) : 0,
      perkSellPct: over.perk ? perkBonusByField(['shrewd_bargainer'], 'vendorSellBonus', CHARACTER.level) : 0,
      vendorBuyMod: over.buyMod ?? 0n,
      vendorSellMod: over.sellMod ?? 0n,
    });

  it('prices every row with the shared listingBuyPrice (renown discount, Charisma, then the floor) and keeps parity', () => {
    const character = { ...CHARACTER, vendorBuyMod: 40n };
    const rows = forSaleRows(input({ character, perkKeys: ['shrewd_bargainer'] }));
    const cap = rows.find((r) => r.name === 'Leather Cap')!;
    expect(cap.price).toBe(charged(20n, { buyMod: 40n, perk: true }));
    const plate = rows.find((r) => r.name === 'Plate Mail')!;
    expect(plate.price).toBe(charged(300n, { buyMod: 40n, perk: true }));
    expect(plate.ariaLabel).toBe(`Buy Plate Mail for ${charged(300n, { buyMod: 40n, perk: true })} gold`);
  });

  it('a listing priced under the floor shows the floored price (Bread 3n with value 10n)', () => {
    const bread = forSaleRows(input()).find((r) => r.name === 'Bread')!;
    expect(bread.price).toBe(charged(3n));
    expect(bread.price).toBe(11n);
  });

  it('every row costs more than the character earns per unit at extreme Charisma with the perk', () => {
    const character = { ...CHARACTER, vendorBuyMod: 1000n, vendorSellMod: 800n };
    const perkSell = perkBonusByField(['shrewd_bargainer'], 'vendorSellBonus', character.level);
    const rows = forSaleRows(input({ character, perkKeys: ['shrewd_bargainer'] }));
    expect(rows.length).toBe(9);
    for (const row of rows) {
      expect(row.price > sellPayout(10n, 1n, perkSell, 800n)).toBe(true);
      expect(row.ariaLabel).toBe(`Buy ${row.name} for ${row.price} gold`);
    }
  });

  it('carries the stock: quantity, x n text and the sold-out flag', () => {
    const rows = forSaleRows(
      input({ stock: [listing(1n, 4n, 3n, 3n), listing(2n, 5n, 6n, 1n), listing(3n, 7n, 12n, 0n)] }),
    );
    const byName = (n: string) => rows.find((r) => r.name === n)!;
    expect(byName('Bread').quantity).toBe(3n);
    expect(byName('Bread').quantityText).toBe('×3');
    expect(byName('Bread').soldOut).toBe(false);
    expect(byName('Traveler Tea').quantityText).toBe('×1');
    expect(byName('Iron Ore').quantity).toBe(0n);
    expect(byName('Iron Ore').quantityText).toBe('');
    expect(byName('Iron Ore').soldOut).toBe(true);
  });

  it('a sold-out row reads Sold out even when gold is short or the bag is full, and is muted', () => {
    const stock = [listing(1n, 4n, 3n, 0n)];
    expect(forSaleRows(input({ stock }))[0].reason).toBe(SOLD_OUT_REASON);
    expect(SOLD_OUT_REASON).toBe('Sold out');
    const poor = forSaleRows(input({ stock, character: { ...CHARACTER, gold: 1n } }))[0];
    expect(poor.reason).toBe('Sold out');
    expect(poor.priceTone).toBe('muted');
    const bag: ItemInstance[] = [];
    for (let i = 0; i < MAX_INVENTORY_SLOTS; i += 1) bag.push(inst(BigInt(500 + i), 99n));
    expect(forSaleRows(input({ stock, items: bag }))[0].reason).toBe('Sold out');
    const inStock = forSaleRows(input({ stock: [listing(1n, 4n, 3n, 2n)], items: bag }))[0];
    expect(inStock.reason).toBe('Backpack full');
  });

  it('stock does not change the order: one listing going from 1n to 0n keeps the same keys', () => {
    const base = input().stock;
    const sold = base.map((l) => (l.id === 105n ? listing(105n, 4n, 3n, 0n) : l));
    expect(forSaleRows(input({ stock: sold })).map((r) => r.key)).toEqual(
      forSaleRows(input({ stock: base })).map((r) => r.key),
    );
  });

  it('flags a class-unusable row and keeps a level-short row visible with its reason', () => {
    const rows = forSaleRows(input());
    const robe = rows.find((r) => r.name === 'Mage Robe')!;
    expect(robe.usable).toBe(false);
    expect(robe.subLine).toBe('Tier 1 · Cloth · Not your class');
    expect(robe.priceTone).toBe('muted');
    const plate = rows.find((r) => r.name === 'Plate Mail')!;
    expect(plate.usable).toBe(true);
    expect(plate.levelShort).toBe(true);
    expect(plate.subLine).toBe('Tier 3 · Plate · Requires Lv 8');
    expect(plate.priceTone).toBe('muted');
    expect(plate.reason).toBeNull();
    const bread = rows.find((r) => r.name === 'Bread')!;
    expect(bread.usable).toBe(true);
    expect(bread.priceTone).toBe('default');
  });

  it('Usable by you hides class-unusable rows only; level-short rows stay', () => {
    const names = forSaleRows(input({ filter: 'usable' })).map((r) => r.name);
    expect(names).not.toContain('Mage Robe');
    expect(names).toContain('Plate Mail');
    expect(names).toContain('Bread');
    expect(forSaleRows(input({ filter: 'all' })).map((r) => r.name)).toContain('Mage Robe');
    expect(FOR_SALE_FILTERS.map((f) => f.label)).toEqual(['All', 'Usable by you']);
  });

  it('gives Not enough gold (short tone) and Backpack full reasons, gold first', () => {
    // Exactly the floored price of Bread (listed at 3n, value 10n): enough for it, short for Plate Mail.
    const breadPrice = forSaleRows(input()).find((r) => r.name === 'Bread')!.price;
    const poor = forSaleRows(input({ character: { ...CHARACTER, gold: breadPrice } }));
    const plate = poor.find((r) => r.name === 'Plate Mail')!;
    expect(plate.reason).toBe('Not enough gold');
    expect(plate.priceTone).toBe('short');
    expect(poor.find((r) => r.name === 'Bread')!.reason).toBeNull();

    const bag: ItemInstance[] = [];
    for (let i = 0; i < MAX_INVENTORY_SLOTS; i += 1) bag.push(inst(BigInt(500 + i), 99n));
    const full = forSaleRows(input({ items: bag }));
    expect(full.find((r) => r.name === 'Bread')!.reason).toBe('Backpack full');
    const both = forSaleRows(input({ items: bag, character: { ...CHARACTER, gold: 1n } }));
    expect(both.find((r) => r.name === 'Bread')!.reason).toBe('Not enough gold');
  });

  it('respects stacking: a full bag with a stack of the template does not block a stackable item', () => {
    const bag: ItemInstance[] = [inst(900n, 7n, { quantity: 4n })];
    for (let i = 1; i < MAX_INVENTORY_SLOTS; i += 1) bag.push(inst(BigInt(500 + i), 99n));
    const rows = forSaleRows(input({ items: bag }));
    expect(rows.find((r) => r.name === 'Iron Ore')!.reason).toBeNull();
    expect(rows.find((r) => r.name === 'Bread')!.reason).toBe('Backpack full');
  });

  it('leaves out a row whose template has not arrived', () => {
    const rows = forSaleRows(input({ templates: map([bread]) }));
    expect(rows.map((r) => r.name)).toEqual(['Bread']);
  });

  it('gives the empty texts: no stock, and nothing usable', () => {
    expect(forSaleEmptyText(input({ stock: [] }), 'Marta')).toBe('Marta has nothing for sale right now.');
    const onlyRobe = input({ stock: [listing(1n, 9n, 15n)], filter: 'usable' });
    expect(forSaleEmptyText(onlyRobe, 'Marta')).toBe('Nothing here your character can use.');
    expect(forSaleEmptyText(input(), 'Marta')).toBeNull();
    // Stock exists but its templates have not arrived: no wrong sentence.
    expect(forSaleEmptyText(input({ templates: new Map() }), 'Marta')).toBeNull();
  });

  it('passes an XSS item name through as plain text', () => {
    const evil = tpl(20n, { name: PAYLOAD, slot: 'head' });
    const rows = forSaleRows(input({ stock: [listing(1n, 20n, 5n)], templates: map([evil]) }));
    expect(rows[0].name).toBe(PAYLOAD);
    // Listed at 5n against a vendorValue of 10n, so the floor applies: 11 gold.
    expect(rows[0].ariaLabel).toBe(`Buy ${PAYLOAD} for ${rows[0].price} gold`);
    expect(rows[0].price).toBe(charged(5n));
  });
});

describe('sellRows and junkSummary', () => {
  const sword = tpl(1n, { name: 'Iron Sword', slot: 'mainHand', rarity: 'rare', vendorValue: 40n });
  const rags = tpl(2n, { name: 'Rags', slot: 'misc', isJunk: true, vendorValue: 3n });
  const bone = tpl(3n, { name: 'Bone Shard', slot: 'misc', isJunk: true, vendorValue: 7n });
  const key = tpl(4n, { name: 'Gate Key', slot: 'quest', vendorValue: 99n });
  const ore = tpl(5n, { name: 'Iron Ore', slot: 'material', vendorValue: 5n, stackable: true });
  const ALL = [sword, rags, bone, key, ore];

  function input(items: ItemInstance[], over: Partial<SellInput> = {}): SellInput {
    return {
      items,
      templates: map(ALL),
      character: { level: 5n, vendorSellMod: 0n },
      perkKeys: [],
      ...over,
    };
  }

  const ITEMS = [
    inst(10n, 4n),
    inst(11n, 1n),
    inst(12n, 3n),
    inst(13n, 5n, { quantity: 4n }),
    inst(14n, 2n),
    inst(15n, 1n, { equippedSlot: 'mainHand' }),
  ];

  it('orders junk first, then sellable items by name, then quest items last; equipped is left out', () => {
    const rows = sellRows(input(ITEMS));
    expect(rows.map((r) => r.name)).toEqual(['Bone Shard', 'Rags', 'Iron Ore', 'Iron Sword', 'Gate Key']);
    expect(rows.map((r) => r.instanceId)).toEqual([12n, 14n, 13n, 11n, 10n]);
  });

  it('values come from the shared sellPayout (renown bonus, Charisma) with parity', () => {
    const character = { level: 5n, vendorSellMod: 50n };
    const rows = sellRows(input(ITEMS, { character, perkKeys: ['shrewd_bargainer'] }));
    const oreRow = rows.find((r) => r.name === 'Iron Ore')!;
    expect(oreRow.value).toBe(sellPayout(5n, 4n, 5, 50n));
    expect(oreRow.valueText).toBe(String(sellPayout(5n, 4n, 5, 50n)));
    const swordRow = rows.find((r) => r.name === 'Iron Sword')!;
    expect(swordRow.value).toBe(sellPayout(40n, 1n, 5, 50n));
  });

  it('shows stacks with the quantity and the each value, and builds the Sell aria-label', () => {
    const rows = sellRows(input(ITEMS));
    const oreRow = rows.find((r) => r.name === 'Iron Ore')!;
    expect(oreRow.quantityText).toBe(' ×4');
    expect(oreRow.subLine).toBe('5 each');
    expect(oreRow.ariaLabel).toBe('Sell Iron Ore ×4 for 20 gold');
    const swordRow = rows.find((r) => r.name === 'Iron Sword')!;
    expect(swordRow.quantityText).toBe('');
    expect(swordRow.subLine).toBe('');
    expect(swordRow.ariaLabel).toBe('Sell Iron Sword for 40 gold');
    expect(swordRow.color).toBe('var(--color-rarity-rare)');
  });

  it('marks junk with the neutral name color and the junk flag', () => {
    const rows = sellRows(input(ITEMS));
    const rag = rows.find((r) => r.name === 'Rags')!;
    expect(rag.junk).toBe(true);
    expect(rag.color).toBe('var(--color-neutral-400)');
  });

  it('gives quest items no Sell action, a dash value and the cannot-be-sold sub-line', () => {
    const rows = sellRows(input(ITEMS));
    const quest = rows.find((r) => r.name === 'Gate Key')!;
    expect(quest.quest).toBe(true);
    expect(quest.canSell).toBe(false);
    expect(quest.value).toBeNull();
    expect(quest.valueText).toBe('—');
    expect(quest.subLine).toBe("Quest item · can't be sold");
    expect(quest.ariaLabel).toBe('');
  });

  it('uses the instance display name and skips an instance whose template is missing', () => {
    const rows = sellRows(input([inst(30n, 1n, { displayName: 'Keen Blade' }), inst(31n, 77n)]));
    expect(rows.map((r) => r.name)).toEqual(['Keen Blade']);
  });

  it('junkSummary counts and sums per-instance payouts exactly like the reducer', () => {
    const junkItems = [inst(1n, 2n, { quantity: 3n }), inst(2n, 3n), inst(3n, 3n, { equippedSlot: 'head' }), inst(4n, 1n)];
    const character = { level: 5n, vendorSellMod: 33n };
    const summary = junkSummary(input(junkItems, { character, perkKeys: ['shrewd_bargainer'] }));
    const expected = sellPayout(3n, 3n, 5, 33n) + sellPayout(7n, 1n, 5, 33n);
    expect(summary.count).toBe(2);
    expect(summary.gold).toBe(expected);
    expect(summary.prompt).toBe(
      `Sell 2 junk items for ${expected} gold? Junk sales can't be bought back.`,
    );
  });

  it('junkSummary skips a quest item that is also flagged junk, matching the row list (IN-03)', () => {
    const questJunk = tpl(6n, { name: 'Torn Letter', slot: 'quest', isJunk: true, vendorValue: 9n });
    const templates = map([...ALL, questJunk]);
    const summary = junkSummary(input([inst(1n, 6n), inst(2n, 3n)], { templates }));
    expect(summary.count).toBe(1);
    expect(summary.gold).toBe(sellPayout(7n, 1n, 0, 0n));
    const onlyQuest = junkSummary(input([inst(1n, 6n)], { templates }));
    expect(onlyQuest.count).toBe(0);
    expect(onlyQuest.prompt).toBe('');
  });

  it('junkSummary uses the singular for one item and is empty with no junk', () => {
    const one = junkSummary(input([inst(2n, 3n)]));
    expect(one.count).toBe(1);
    expect(one.prompt).toBe("Sell 1 junk item for 7 gold? Junk sales can't be bought back.");
    const none = junkSummary(input([inst(1n, 1n)]));
    expect(none.count).toBe(0);
    expect(none.gold).toBe(0n);
    expect(none.prompt).toBe('');
  });

  it('passes an XSS item name through as plain text', () => {
    const rows = sellRows(input([inst(40n, 1n, { displayName: PAYLOAD })]));
    expect(rows[0].name).toBe(PAYLOAD);
    expect(rows[0].ariaLabel).toBe(`Sell ${PAYLOAD} for 40 gold`);
  });
});

describe('sell quantity', () => {
  const ore = tpl(5n, { name: 'Iron Ore', slot: 'material', vendorValue: 5n, stackable: true });
  const key = tpl(4n, { name: 'Gate Key', slot: 'quest', vendorValue: 99n });
  const sword = tpl(1n, { name: 'Iron Sword', slot: 'mainHand', vendorValue: 40n });
  const sellInput = (items: ItemInstance[], over: Partial<SellInput> = {}): SellInput => ({
    items,
    templates: map([ore, key, sword]),
    character: { level: 5n, vendorSellMod: 33n },
    perkKeys: ['shrewd_bargainer'],
    ...over,
  });
  const perkSell = perkBonusByField(['shrewd_bargainer'], 'vendorSellBonus', 5n);
  const stack = (quantity: bigint) => inst(13n, 5n, { quantity });
  const oreRow = (quantity: bigint) => sellRows(sellInput([stack(quantity)]))[0];

  it('needsQuantity is true only for a sellable stack', () => {
    expect(needsQuantity(oreRow(3n))).toBe(true);
    expect(needsQuantity(oreRow(1n))).toBe(false);
    const questRow = sellRows(sellInput([inst(14n, 4n, { quantity: 2n })]))[0];
    expect(questRow.quest).toBe(true);
    expect(needsQuantity(questRow)).toBe(false);
  });

  it('clampSellQuantity keeps 1..max', () => {
    expect(clampSellQuantity(0n, 12n)).toBe(1n);
    expect(clampSellQuantity(5n, 12n)).toBe(5n);
    expect(clampSellQuantity(13n, 12n)).toBe(12n);
    expect(clampSellQuantity(5n, 0n)).toBe(1n);
    expect(clampSellQuantity(2n, 1n)).toBe(1n);
  });

  it('parseSellQuantity accepts digits only', () => {
    expect(parseSellQuantity('5')).toBe(5n);
    expect(parseSellQuantity(' 12 ')).toBe(12n);
    expect(parseSellQuantity('0')).toBe(0n);
    for (const bad of ['', '-1', '2.5', 'abc', '1e3', '1234567890']) expect(parseSellQuantity(bad)).toBeNull();
  });

  it('quantitySale gives the exact payout, prompt, label and bounds for Iron Ore x12', () => {
    const input = sellInput([stack(12n)]);
    const row = sellRows(input)[0];
    const sale = quantitySale(input, row, 3n)!;
    expect(sale.quantity).toBe(3n);
    expect(sale.gold).toBe(sellPayout(5n, 3n, perkSell, 33n));
    expect(sale.prompt).toBe(`Sell 3 of 12 Iron Ore for ${sale.gold.toLocaleString('en-US')} gold?`);
    expect(sale.confirmLabel).toBe('Sell 3');
    expect(sale.canDecrease).toBe(true);
    expect(sale.canIncrease).toBe(true);
    expect(quantitySale(input, row, 0n)!.quantity).toBe(1n);
    expect(quantitySale(input, row, 0n)!.canDecrease).toBe(false);
    expect(quantitySale(input, row, 99n)!.quantity).toBe(12n);
    expect(quantitySale(input, row, 99n)!.canIncrease).toBe(false);
    // Rounding is per call, exactly like the server's partial sale.
    for (let q = 1n; q <= 12n; q += 1n) {
      expect(quantitySale(input, row, q)!.gold).toBe(sellPayout(5n, q, perkSell, 33n));
    }
  });

  it('quantitySale groups large gold and is null for a quest row or a missing template', () => {
    const big = tpl(5n, { name: 'Iron Ore', slot: 'material', vendorValue: 5000n, stackable: true });
    const input = sellInput([stack(4n)], { templates: map([big, key]) });
    const sale = quantitySale(input, sellRows(input)[0], 4n)!;
    expect(sale.prompt).toContain(sale.gold.toLocaleString('en-US'));
    expect(sale.prompt).toContain(',');

    const questInput = sellInput([inst(14n, 4n, { quantity: 2n })]);
    expect(quantitySale(questInput, sellRows(questInput)[0], 1n)).toBeNull();

    const row = oreRow(4n);
    expect(quantitySale(sellInput([stack(4n)], { templates: new Map() }), row, 1n)).toBeNull();
  });

  it('passes an XSS name through as plain text in the prompt', () => {
    const input = sellInput([inst(13n, 5n, { quantity: 4n, displayName: PAYLOAD })]);
    const sale = quantitySale(input, sellRows(input)[0], 2n)!;
    expect(sale.prompt.startsWith(`Sell 2 of 4 ${PAYLOAD} for `)).toBe(true);
  });
});

describe('rapport', () => {
  it('formats percents with U+2212, a plus sign and one decimal only when not whole', () => {
    expect(formatRapportPercent(-2)).toBe('−2%');
    expect(formatRapportPercent(3.5)).toBe('+3.5%');
    expect(formatRapportPercent(0)).toBe('0%');
    expect(formatRapportPercent(5)).toBe('+5%');
    expect(formatRapportPercent(-0)).toBe('0%');
  });

  it('says from Charisma when no renown perk applies', () => {
    const text = rapportText({ perkKeys: [], level: 5n, vendorBuyMod: 20n, vendorSellMod: 35n });
    expect(text).toBe('Your rapport: −2% buy, +3.5% sell from Charisma.');
  });

  it('says from Charisma and renown when a renown vendor perk applies', () => {
    const text = rapportText({ perkKeys: ['shrewd_bargainer'], level: 5n, vendorBuyMod: 0n, vendorSellMod: 0n });
    expect(text).toBe('Your rapport: −5% buy, +5% sell from Charisma and renown.');
  });

  it('splits into lead, figures and suffix for the accent figures', () => {
    const parts = rapportParts({ perkKeys: [], level: 1n, vendorBuyMod: 0n, vendorSellMod: 0n });
    expect(parts).toEqual({ lead: 'Your rapport: ', figures: '0% buy, 0% sell', suffix: ' from Charisma.' });
  });
});

describe('buybackCard', () => {
  const potion = tpl(1n, { name: 'Potion', slot: 'consumable', stackable: true });
  const blade = tpl(2n, { name: 'Blade', slot: 'mainHand' });
  const templates = map([potion, blade]);

  function sale(over: Record<string, unknown> = {}): VendorBuyback {
    return {
      characterId: 7n,
      npcId: 2n,
      npcName: 'Marta',
      locationId: 10n,
      templateId: 2n,
      itemName: 'Keen Blade',
      rarity: 'rare',
      quantity: 1n,
      price: 30n,
      ...over,
    } as unknown as VendorBuyback;
  }

  const here = { gold: 100n, locationId: 10n };

  it('is null without a row (no placeholder)', () => {
    expect(buybackCard(null, here, 2n, [], templates)).toBeNull();
  });

  it('is ready with the name, rarity color, price and aria-label', () => {
    const card = buybackCard(sale(), here, 2n, [], templates)!;
    expect(card.state).toBe('ready');
    expect(card.reason).toBeNull();
    expect(card.name).toBe('Keen Blade');
    expect(card.color).toBe('var(--color-rarity-rare)');
    expect(card.price).toBe(30n);
    expect(card.ariaLabel).toBe('Buy back Keen Blade for 30 gold');
  });

  it('adds the quantity for a stack', () => {
    const card = buybackCard(sale({ quantity: 3n, itemName: 'Potion', templateId: 1n }), here, 2n, [], templates)!;
    expect(card.name).toBe('Potion ×3');
    expect(card.ariaLabel).toBe('Buy back Potion ×3 for 30 gold');
  });

  it('gives the gold reason when the gold is below the price', () => {
    const card = buybackCard(sale({ price: 500n }), here, 2n, [], templates)!;
    expect(card.state).toBe('gold');
    expect(card.reason).toBe('You need 500 gold to buy it back.');
  });

  it('gives the place reason for a different open vendor, no open vendor or a different location', () => {
    const reason = 'Sold to Marta. Go back there to buy it back.';
    const otherVendor = buybackCard(sale(), here, 3n, [], templates)!;
    expect(otherVendor.state).toBe('place');
    expect(otherVendor.reason).toBe(reason);
    expect(buybackCard(sale(), here, null, [], templates)!.state).toBe('place');
    const elsewhere = buybackCard(sale(), { gold: 100n, locationId: 11n }, 2n, [], templates)!;
    expect(elsewhere.state).toBe('place');
    expect(elsewhere.reason).toBe(reason);
  });

  it('gives the full-bag reason when the template cannot fit, and lets a stack merge', () => {
    const bag: ItemInstance[] = [];
    for (let i = 0; i < MAX_INVENTORY_SLOTS; i += 1) bag.push(inst(BigInt(500 + i), 99n));
    const blocked = buybackCard(sale(), here, 2n, bag, templates)!;
    expect(blocked.state).toBe('full');
    expect(blocked.reason).toBe('Your backpack is full.');
    const stackBag = [inst(900n, 1n, { quantity: 2n }), ...bag.slice(1)];
    const merges = buybackCard(sale({ templateId: 1n, itemName: 'Potion' }), here, 2n, stackBag, templates)!;
    expect(merges.state).toBe('ready');
  });

  it('shows the first applicable reason: gold, then place, then full bag', () => {
    const bag: ItemInstance[] = [];
    for (let i = 0; i < MAX_INVENTORY_SLOTS; i += 1) bag.push(inst(BigInt(500 + i), 99n));
    const all = buybackCard(sale({ price: 500n }), { gold: 1n, locationId: 11n }, 3n, bag, templates)!;
    expect(all.state).toBe('gold');
    const placeAndFull = buybackCard(sale(), here, 3n, bag, templates)!;
    expect(placeAndFull.state).toBe('place');
  });

  it('passes an XSS item name through as plain text', () => {
    const card = buybackCard(sale({ itemName: PAYLOAD }), here, 2n, [], templates)!;
    expect(card.name).toBe(PAYLOAD);
  });

  describe('stock check (Plan 50-27)', () => {
    const shelf = (npcId: bigint, templateId: bigint, quantity: bigint, qualityTier?: string): VendorInventory =>
      ({ id: 1n, npcId, itemTemplateId: templateId, price: 5n, qualityTier, quantity }) as unknown as VendorInventory;

    it('with no stock argument every five-argument call is unchanged (null by default)', () => {
      expect(buybackCard(sale(), here, 2n, [], templates)!.state).toBe('ready');
      expect(buybackCard(sale(), here, 2n, [], templates, null)!.state).toBe('ready');
    });

    it('is ready when the vendor holds at least the sold quantity of that template and tier', () => {
      expect(buybackCard(sale({ quantity: 5n }), here, 2n, [], templates, [shelf(2n, 2n, 5n)])!.state).toBe('ready');
      expect(buybackCard(sale({ quantity: 5n }), here, 2n, [], templates, [shelf(2n, 2n, 9n)])!.state).toBe('ready');
    });

    it('is sold with the vendor reason when the shelf holds fewer, has no row, or another tier', () => {
      const reason = 'Marta has already sold Keen Blade.';
      const fewer = buybackCard(sale({ quantity: 5n }), here, 2n, [], templates, [shelf(2n, 2n, 4n)])!;
      expect(fewer.state).toBe('sold');
      expect(fewer.reason).toBe(reason);
      expect(buybackCard(sale(), here, 2n, [], templates, [])!.state).toBe('sold');
      expect(buybackCard(sale(), here, 2n, [], templates, [shelf(3n, 2n, 5n)])!.state).toBe('sold');
      expect(buybackCard(sale(), here, 2n, [], templates, [shelf(2n, 9n, 5n)])!.state).toBe('sold');
      expect(buybackCard(sale(), here, 2n, [], templates, [shelf(2n, 2n, 5n, 'rare')])!.state).toBe('sold');
      expect(
        buybackCard(sale({ qualityTier: 'rare' }), here, 2n, [], templates, [shelf(2n, 2n, 5n, 'rare')])!.state,
      ).toBe('ready');
    });

    it('keeps the server order: gold wins over place, place wins over sold, sold wins over full', () => {
      const bag: ItemInstance[] = [];
      for (let i = 0; i < MAX_INVENTORY_SLOTS; i += 1) bag.push(inst(BigInt(500 + i), 99n));
      expect(buybackCard(sale({ price: 500n }), here, 3n, [], templates, [])!.state).toBe('gold');
      expect(buybackCard(sale(), here, 3n, [], templates, [])!.state).toBe('place');
      expect(buybackCard(sale(), here, 2n, bag, templates, [])!.state).toBe('sold');
      expect(buybackCard(sale(), here, 2n, bag, templates, [shelf(2n, 2n, 5n)])!.state).toBe('full');
    });

    it('names the quantity sold', () => {
      expect(buybackCard(sale({ quantity: 5n }), here, 2n, [], templates)!.name).toBe('Keen Blade ×5');
    });
  });
});
