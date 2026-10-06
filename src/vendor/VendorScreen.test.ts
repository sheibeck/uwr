// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { computed, nextTick, ref, shallowRef } from 'vue';
import { mount, type VueWrapper } from '@vue/test-utils';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { MAX_INVENTORY_SLOTS } from '@game-data/inventory_rules';
import { buyPrice } from '@game-data/vendor_pricing';
import {
  FRAME_KEY,
  GAME_KEY,
  createInertFrame,
  createInertGame,
} from '../game/context';
import type { FrameControls, GameData, ScreenArgs } from '../game/context';
import { LEDGER_KEY, createInertLedger } from '../ledger/ledgerContext';
import type { LedgerData, LedgerReducers, VendorTarget } from '../ledger/ledgerContext';
import { createActionRunner } from '../ledger/actionRunner';
import type { ItemInstance, ItemTemplate, Npc, VendorBuyback, VendorInventory } from '../module_bindings/types';
import ForSale from './ForSale.vue';
import VendorMeta from './VendorMeta.vue';
import VendorScreen from './VendorScreen.vue';
import type { VendorSnapshot } from './vendorModel';

const XSS = '<img src=x onerror=alert(1)>';
const read = (file: string): string => readFileSync(resolve(process.cwd(), 'src/vendor', file), 'utf8');

let wrapper: VueWrapper | null = null;
afterEach(() => {
  wrapper?.unmount();
  wrapper = null;
  document.body.innerHTML = '';
});

// ---------------------------------------------------------------------------
// fixtures shared by every describe block in this file
// ---------------------------------------------------------------------------

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

function listing(id: bigint, templateId: bigint, price: bigint, npcId = 2n): VendorInventory {
  return { id, npcId, itemTemplateId: templateId, price, qualityTier: undefined } as unknown as VendorInventory;
}

function npc(id: bigint, name: string, over: Record<string, unknown> = {}): Npc {
  return {
    id,
    name,
    npcType: 'vendor',
    locationId: 10n,
    greeting: 'Fine wares for fine folk.',
    factionId: 1n,
    ...over,
  } as unknown as Npc;
}

const SWORD = tpl(1n, {
  name: 'Iron Sword',
  slot: 'mainHand',
  armorType: '',
  weaponType: 'sword',
  rarity: 'rare',
  tier: 2n,
  requiredLevel: 3n,
});
const CAP = tpl(2n, { name: 'Leather Cap', slot: 'head', armorType: 'leather', tier: 1n });
const PLATE = tpl(3n, { name: 'Plate Mail', slot: 'chest', armorType: 'plate', tier: 3n, requiredLevel: 8n });
const BREAD = tpl(4n, { name: 'Bread', slot: 'food', armorType: '', tier: 1n });
const ROBE = tpl(5n, { name: 'Mage Robe', slot: 'chest', armorType: 'cloth', tier: 1n });
const ORE = tpl(6n, { name: 'Iron Ore', slot: 'material', armorType: '', tier: 1n, stackable: true });
const TEMPLATES = [SWORD, CAP, PLATE, BREAD, ROBE, ORE];

const STOCK = [
  listing(100n, 1n, 50n),
  listing(101n, 2n, 20n),
  listing(102n, 3n, 300n),
  listing(103n, 4n, 3n),
  listing(104n, 5n, 15n),
];

export const HERO = {
  id: 7n,
  name: 'Hero',
  level: 5n,
  className: 'Warrior',
  gold: 1000n,
  locationId: 10n,
  weaponProficiencies: 'sword,axe',
  armorProficiencies: 'leather,plate',
  vendorBuyMod: 0n,
  vendorSellMod: 0n,
};

interface World {
  items?: ItemInstance[];
  templates?: ItemTemplate[];
  stock?: VendorInventory[];
  stockApplied?: boolean;
  character?: Record<string, unknown> | null;
  npcsHere?: Npc[];
  factions?: Array<{ id: bigint; name: string }>;
  perkKeys?: string[];
  connected?: boolean;
  isDesktop?: boolean;
  screenArgs?: ScreenArgs | null;
  vendorTarget?: VendorTarget | null;
  lastSale?: VendorBuyback | null;
  reducers?: Partial<LedgerReducers>;
}

function buildWorld(world: World) {
  const connected = ref(world.connected ?? true);
  const items = shallowRef<readonly ItemInstance[]>(world.items ?? []);
  const stock = shallowRef<readonly VendorInventory[]>(world.stock ?? STOCK);
  const npcsHere = shallowRef<readonly Npc[]>(world.npcsHere ?? [npc(2n, 'Marta')]);
  const lastSale = shallowRef<VendorBuyback | null>(world.lastSale ?? null);
  const vendorTarget = shallowRef<VendorTarget | null>(world.vendorTarget ?? null);
  const screenArgs = shallowRef<ScreenArgs | null>(world.screenArgs ?? null);
  const calls = {
    buyItem: vi.fn(async () => undefined),
    sellItem: vi.fn(async () => undefined),
    sellAllJunk: vi.fn(async () => undefined),
    buybackLastSale: vi.fn(async () => undefined),
  };
  const reducers = { ...calls, ...world.reducers } as unknown as LedgerReducers;
  const setVendor = vi.fn((target: VendorTarget | null) => {
    vendorTarget.value = target;
  });
  const character = ref(world.character === undefined ? HERO : world.character);
  const game = {
    ...createInertGame(),
    character,
    renownPerks: ref((world.perkKeys ?? []).map((perkKey, index) => ({ id: BigInt(index), perkKey }))),
    npcsHere,
    factions: ref(world.factions ?? [{ id: 1n, name: 'Merchants Guild' }]),
    connected,
  } as unknown as GameData;
  const ledger = {
    ...createInertLedger(),
    items,
    itemsApplied: ref(true),
    templates: ref(new Map((world.templates ?? TEMPLATES).map((t) => [t.id, t]))),
    vendorStock: stock,
    vendorStockApplied: ref(world.stockApplied ?? true),
    vendorTarget,
    lastSale,
    setVendor,
    reducers: computed(() => (connected.value ? reducers : null)),
  } as unknown as LedgerData;
  const frame = {
    ...createInertFrame(),
    isDesktop: ref(world.isDesktop ?? true),
    screenArgs,
  } as unknown as FrameControls;
  const runner = createActionRunner({ online: computed(() => connected.value && ledger.reducers.value !== null) });
  return {
    connected,
    items,
    stock,
    npcsHere,
    lastSale,
    vendorTarget,
    screenArgs,
    character,
    calls,
    setVendor,
    runner,
    game,
    ledger,
    frame,
    global: {
      provide: { [GAME_KEY as symbol]: game, [LEDGER_KEY as symbol]: ledger, [FRAME_KEY as symbol]: frame },
    },
  };
}

const VENDOR: VendorSnapshot = { id: 2n, name: 'Marta', greeting: 'Fine wares.', factionId: 1n, locationId: 10n };

// ---------------------------------------------------------------------------
// ForSale
// ---------------------------------------------------------------------------

describe('ForSale desktop', () => {
  function mountSale(world: World = {}, props: { vendorNearby?: boolean; vendor?: VendorSnapshot; resetKey?: number } = {}) {
    const ctx = buildWorld(world);
    wrapper = mount(ForSale, {
      attachTo: document.body,
      props: { vendor: VENDOR, vendorNearby: true, runner: ctx.runner, mobile: false, resetKey: 0, ...props },
      global: ctx.global,
    });
    return { ...ctx, w: wrapper };
  }

  it('draws the heading, the filter chips and a captioned table with its headers', () => {
    const { w } = mountSale();
    expect(w.get('h6').text()).toBe('For sale');
    const group = w.get('[role="group"]');
    expect(group.attributes('aria-label')).toBe('For sale filter');
    expect(group.findAll('button').map((b) => b.text())).toEqual(['All', 'Usable by you']);
    expect(group.findAll('button').map((b) => b.attributes('aria-pressed'))).toEqual(['true', 'false']);
    expect(w.get('caption').text()).toBe('For sale');
    expect(w.findAll('th').map((th) => th.text())).toEqual(['Item', 'Slot', 'Price', 'Action']);
    expect(w.findAll('th').every((th) => th.attributes('scope') === 'col')).toBe(true);
    expect(w.findAll('li')).toHaveLength(0);
  });

  it('hides the Slot column below 1200px (source) and keeps the right-aligned price column', () => {
    const source = read('ForSale.vue');
    expect(source).toMatch(/\.slot-col\s*\{\s*display: none;/);
    expect(source).toMatch(/@media \(min-width: 1200px\)\s*\{\s*\.slot-col\s*\{\s*display: table-cell;/);
    expect(source).toMatch(/th\.num,\s*\.sale-table td\.num\s*\{\s*text-align: right;/);
  });

  it('shows each row with the rarity color, sub-line, slot, shared-helper price and the Buy label', () => {
    const { w } = mountSale({ character: { ...HERO, vendorBuyMod: 40n }, perkKeys: ['shrewd_bargainer'] });
    const rows = w.findAll('tbody tr');
    expect(rows.map((r) => r.get('.item-name').text())).toEqual([
      'Iron Sword',
      'Leather Cap',
      'Mage Robe',
      'Plate Mail',
      'Bread',
    ]);
    const sword = rows[0];
    expect(sword.get('.item-name').attributes('style')).toContain('var(--color-rarity-rare)');
    expect(sword.get('.sub').text()).toBe('Tier 2 · Sword');
    expect(sword.get('.slot-cell').text()).toBe('Main hand');
    const price = buyPrice(50n, 5, 40n);
    expect(sword.get('[role="img"]').attributes('aria-label')).toBe(`${price} gold`);
    expect(sword.get('button').attributes('aria-label')).toBe(`Buy Iron Sword for ${price} gold`);
    expect(sword.get('button').text()).toBe('Buy');
    expect(rows[4].get('.sub').text()).toBe('Food');
    expect(rows[4].get('.slot-cell').text()).toBe('—');
  });

  it('sends buyItem({ characterId, npcId, itemTemplateId }) through the runner', async () => {
    const { w, calls } = mountSale();
    await w.get('[aria-label="Buy Leather Cap for 20 gold"]').trigger('click');
    expect(calls.buyItem).toHaveBeenCalledTimes(1);
    expect(calls.buyItem).toHaveBeenCalledWith({ characterId: 7n, npcId: 2n, itemTemplateId: 2n });
  });

  it('makes a second click inert while the first call is in flight', async () => {
    let release: () => void = () => undefined;
    const buyItem = vi.fn(() => new Promise<void>((resolveCall) => (release = resolveCall)));
    const { w } = mountSale({ reducers: { buyItem } as Partial<LedgerReducers> });
    const button = w.get('[aria-label="Buy Leather Cap for 20 gold"]');
    await button.trigger('click');
    await button.trigger('click');
    expect(buyItem).toHaveBeenCalledTimes(1);
    expect(button.attributes('aria-disabled')).toBe('true');
    release();
    await nextTick();
  });

  it('is aria-disabled with Not enough gold in the sub-line, referenced by aria-describedby', async () => {
    const { w, calls } = mountSale({ character: { ...HERO, gold: 25n } });
    const row = w.findAll('tbody tr').find((r) => r.get('.item-name').text() === 'Plate Mail')!;
    const button = row.get('button');
    expect(button.attributes('aria-disabled')).toBe('true');
    const reason = row.get('.reason');
    expect(reason.text()).toBe('· Not enough gold');
    expect(button.attributes('aria-describedby')).toBe(reason.attributes('id'));
    expect(row.get('[role="img"]').classes()).toContain('tone-short');
    await button.trigger('click');
    expect(calls.buyItem).not.toHaveBeenCalled();
  });

  it('is aria-disabled with Backpack full when the bag has no room', async () => {
    const bag: ItemInstance[] = [];
    for (let i = 0; i < MAX_INVENTORY_SLOTS; i += 1) bag.push(inst(BigInt(500 + i), 99n));
    const { w, calls } = mountSale({ items: bag });
    const button = w.get('[aria-label="Buy Leather Cap for 20 gold"]');
    expect(button.attributes('aria-disabled')).toBe('true');
    expect(w.get('.reason').text()).toBe('· Backpack full');
    await button.trigger('click');
    expect(calls.buyItem).not.toHaveBeenCalled();
  });

  it('keeps an enabled Buy for a level-short and for a class-unusable row under All, with the reason in the sub-line', async () => {
    const { w, calls } = mountSale();
    const plate = w.findAll('tbody tr').find((r) => r.get('.item-name').text() === 'Plate Mail')!;
    expect(plate.get('.sub').text()).toBe('Tier 3 · Plate · Requires Lv 8');
    expect(plate.get('button').attributes('aria-disabled')).toBeUndefined();
    const robe = w.findAll('tbody tr').find((r) => r.get('.item-name').text() === 'Mage Robe')!;
    expect(robe.get('.sub').text()).toBe('Tier 1 · Cloth · Not your class');
    expect(robe.get('button').attributes('aria-disabled')).toBeUndefined();
    await robe.get('button').trigger('click');
    expect(calls.buyItem).toHaveBeenCalledWith({ characterId: 7n, npcId: 2n, itemTemplateId: 5n });
  });

  it('Usable by you hides class-unusable rows only, and the screen resets it through resetKey', async () => {
    const { w } = mountSale();
    await w.findAll('[role="group"] button')[1].trigger('click');
    const names = w.findAll('.item-name').map((n) => n.text());
    expect(names).not.toContain('Mage Robe');
    expect(names).toContain('Plate Mail');
    expect(w.findAll('[role="group"] button')[1].attributes('aria-pressed')).toBe('true');
    await w.setProps({ resetKey: 1 });
    expect(w.findAll('[role="group"] button')[0].attributes('aria-pressed')).toBe('true');
    expect(w.findAll('.item-name').map((n) => n.text())).toContain('Mage Robe');
  });

  it('shows the empty texts for no stock and for a filter that hides everything', async () => {
    const { w } = mountSale({ stock: [] });
    expect(w.get('.empty').text()).toBe('Marta has nothing for sale right now.');
    expect(w.find('table').exists()).toBe(false);
    wrapper?.unmount();
    wrapper = null;
    const filtered = mountSale({ stock: [listing(104n, 5n, 15n)] });
    await filtered.w.findAll('[role="group"] button')[1].trigger('click');
    expect(filtered.w.get('.empty').text()).toBe('Nothing here your character can use.');
  });

  it('shows no empty line, no table and a busy region until the stock subscription applies (WR-05)', () => {
    const { w } = mountSale({ stock: [], stockApplied: false });
    expect(w.find('.empty').exists()).toBe(false);
    expect(w.find('table').exists()).toBe(false);
    expect(w.get('.rows-region').attributes('aria-busy')).toBe('true');
    wrapper?.unmount();
    wrapper = null;
    const loaded = mountSale({ stock: [], stockApplied: true });
    expect(loaded.w.get('.rows-region').attributes('aria-busy')).toBeUndefined();
    expect(loaded.w.get('.empty').text()).toBe('Marta has nothing for sale right now.');
  });

  it('ignores stock rows that belong to another vendor', () => {
    const { w } = mountSale({ stock: [listing(100n, 1n, 50n, 9n), listing(101n, 2n, 20n)] });
    expect(w.findAll('.item-name').map((n) => n.text())).toEqual(['Leather Cap']);
  });

  it('makes Buy unavailable with the no-longer-nearby reason when the vendor left', async () => {
    const { w, calls } = mountSale({}, { vendorNearby: false });
    const button = w.get('[aria-label="Buy Leather Cap for 20 gold"]');
    expect(button.attributes('aria-disabled')).toBe('true');
    expect(w.get('.reason').text()).toBe('· Marta is no longer nearby.');
    await button.trigger('click');
    expect(calls.buyItem).not.toHaveBeenCalled();
  });

  it('disables Buy and the chips while offline', async () => {
    const { w, calls } = mountSale({ connected: false });
    for (const button of w.findAll('button.buy-btn')) {
      expect(button.attributes('aria-disabled')).toBe('true');
      await button.trigger('click');
    }
    expect(w.get('[role="group"] button').attributes('aria-disabled')).toBe('true');
    expect(calls.buyItem).not.toHaveBeenCalled();
  });

  it('renders item names with markup literally', () => {
    const evil = tpl(30n, { name: XSS, slot: 'head' });
    const { w } = mountSale({ templates: [evil], stock: [listing(1n, 30n, 5n)] });
    expect(w.get('.item-name').text()).toBe(XSS);
    expect(w.find('img').exists()).toBe(false);
    expect(w.get('button.buy-btn').attributes('aria-label')).toBe(`Buy ${XSS} for 5 gold`);
  });
});

describe('ForSale mobile', () => {
  function mountSale(world: World = {}) {
    const ctx = buildWorld({ isDesktop: false, ...world });
    wrapper = mount(ForSale, {
      attachTo: document.body,
      props: { vendor: VENDOR, vendorNearby: true, runner: ctx.runner, mobile: true, resetKey: 0 },
      global: ctx.global,
    });
    return { ...ctx, w: wrapper };
  }

  it('renders a ul of li rows with the name, price and a Buy button, and no table', async () => {
    const { w, calls } = mountSale();
    expect(w.find('table').exists()).toBe(false);
    const rows = w.get('ul').findAll('li');
    expect(rows).toHaveLength(5);
    expect(rows[1].get('.item-name').text()).toBe('Leather Cap');
    expect(rows[1].get('.sub').text()).toBe('Tier 1 · Leather');
    expect(rows[1].get('[role="img"]').attributes('aria-label')).toBe('20 gold');
    await rows[1].get('button').trigger('click');
    expect(calls.buyItem).toHaveBeenCalledWith({ characterId: 7n, npcId: 2n, itemTemplateId: 2n });
  });

  it('carries the 56px row and 44px Buy rules in the source and the mobile chips', () => {
    const source = read('ForSale.vue');
    expect(source).toMatch(/\.sale-row\s*\{[^}]*min-height: 56px;/);
    expect(source).toMatch(/\.mobile \.buy-btn\s*\{[^}]*min-height: 44px;/);
    const { w } = mountSale();
    expect(w.get('.filter-chips').classes()).toContain('mobile');
  });

  it('shows the reasons in the sub-line and keeps Buy unavailable for a vendor that left', async () => {
    const ctx = buildWorld({ isDesktop: false, character: { ...HERO, gold: 25n } });
    wrapper = mount(ForSale, {
      attachTo: document.body,
      props: { vendor: VENDOR, vendorNearby: true, runner: ctx.runner, mobile: true },
      global: ctx.global,
    });
    const plate = wrapper.findAll('li').find((r) => r.get('.item-name').text() === 'Plate Mail')!;
    expect(plate.get('.reason').text()).toBe('· Not enough gold');
    expect(plate.get('button').attributes('aria-disabled')).toBe('true');
    await wrapper.setProps({ vendorNearby: false });
    expect(wrapper.get('li .reason').text()).toBe('· Marta is no longer nearby.');
  });

  it('renders item names with markup literally', () => {
    const evil = tpl(30n, { name: XSS, slot: 'head' });
    const { w } = mountSale({ templates: [evil], stock: [listing(1n, 30n, 5n)] });
    expect(w.get('.item-name').text()).toBe(XSS);
    expect(w.find('img').exists()).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// VendorMeta
// ---------------------------------------------------------------------------

describe('VendorMeta', () => {
  function mountMeta(world: World = {}) {
    const ctx = buildWorld(world);
    wrapper = mount(VendorMeta, { global: ctx.global });
    return { ...ctx, w: wrapper };
  }

  it('shows the gold and no warning while the vendor is here', () => {
    const { w } = mountMeta({ vendorTarget: { npcId: 2n, npcName: 'Marta' } });
    expect(w.get('[role="img"]').attributes('aria-label')).toBe('1000 gold');
    expect(w.find('.gone').exists()).toBe(false);
  });

  it('shows the gold alone with no vendor target', () => {
    const { w } = mountMeta();
    expect(w.find('[role="img"]').exists()).toBe(true);
    expect(w.find('.gone').exists()).toBe(false);
  });

  it('warns that the vendor is no longer nearby, in the orange token', async () => {
    const { w, npcsHere } = mountMeta({ vendorTarget: { npcId: 2n, npcName: 'Marta' } });
    npcsHere.value = [];
    await nextTick();
    expect(w.get('.gone').text()).toBe('Marta is no longer nearby.');
    expect(read('VendorMeta.vue')).toMatch(/\.gone\s*\{[^}]*color: var\(--color-con-orange\);/);
  });

  it('renders nothing without a character and renders the vendor name as text', async () => {
    const empty = mountMeta({ character: null });
    expect(empty.w.text()).toBe('');
    wrapper?.unmount();
    wrapper = null;
    const { w, npcsHere } = mountMeta({ vendorTarget: { npcId: 2n, npcName: XSS } });
    npcsHere.value = [];
    await nextTick();
    expect(w.get('.gone').text()).toBe(`${XSS} is no longer nearby.`);
    expect(w.find('img').exists()).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// VendorScreen
// ---------------------------------------------------------------------------

function mountScreen(world: World = {}) {
  const ctx = buildWorld(world);
  wrapper = mount(VendorScreen, { attachTo: document.body, global: ctx.global });
  return { ...ctx, w: wrapper };
}

const MARTA_ARGS: ScreenArgs = { npcId: 2n, npcName: 'Marta' };
const TWO_VENDORS = [npc(2n, 'Marta'), npc(3n, 'Bram', { greeting: 'Hot bread!', factionId: undefined })];
const OPEN_QUOTE = '“';
const CLOSE_QUOTE = '”';
const MINUS = '−';

const SALE_ROW = {
  characterId: 7n,
  npcId: 2n,
  npcName: 'Marta',
  locationId: 10n,
  templateId: 1n,
  itemName: 'Keen Blade',
  rarity: 'rare',
  quantity: 1n,
  price: 30n,
} as unknown as VendorBuyback;

describe('VendorScreen desktop', () => {
  it('shows the band for the screen-argument vendor and registers it with the ledger', () => {
    const { w, setVendor } = mountScreen({ screenArgs: MARTA_ARGS });
    expect(w.get('.avatar').text()).toBe('M');
    expect(w.get('.band .name').text()).toBe('Marta');
    expect(w.get('.role').text()).toBe('Vendor · Merchants Guild');
    expect(w.get('.quote').text()).toBe(`${OPEN_QUOTE}Fine wares for fine folk.${CLOSE_QUOTE}`);
    expect(w.get('.quote').attributes('title')).toBe('Fine wares for fine folk.');
    expect(setVendor).toHaveBeenCalledWith({ npcId: 2n, npcName: 'Marta' });
  });

  it('shows Vendor alone without a faction and hides an empty greeting', () => {
    const { w } = mountScreen({
      screenArgs: { npcId: 3n, npcName: 'Bram' },
      npcsHere: [npc(3n, 'Bram', { greeting: '', factionId: undefined })],
    });
    expect(w.get('.role').text()).toBe('Vendor');
    expect(w.find('.quote').exists()).toBe(false);
  });

  it('computes the rapport line with the shared helper (Charisma and renown)', () => {
    const plain = mountScreen({
      screenArgs: MARTA_ARGS,
      character: { ...HERO, vendorBuyMod: 20n, vendorSellMod: 35n },
    });
    expect(plain.w.get('.rapport').text()).toBe(`Your rapport: ${MINUS}2% buy, +3.5% sell from Charisma.`);
    expect(plain.w.get('.figures').text()).toBe(`${MINUS}2% buy, +3.5% sell`);
    wrapper?.unmount();
    wrapper = null;
    const perk = mountScreen({ screenArgs: MARTA_ARGS, perkKeys: ['shrewd_bargainer'] });
    expect(perk.w.get('.rapport').text()).toBe(`Your rapport: ${MINUS}5% buy, +5% sell from Charisma and renown.`);
  });

  it('lays out the band, the For sale and Your backpack columns and the pinned card', () => {
    const { w } = mountScreen({ screenArgs: MARTA_ARGS, lastSale: SALE_ROW });
    expect(w.findAll('h6').map((h) => h.text())).toEqual(['For sale', 'Your backpack']);
    expect(w.get('.desk-grid').findAll('.col')).toHaveLength(2);
    expect(w.find('.just-sold').exists()).toBe(true);
    const source = read('VendorScreen.vue');
    expect(source).toMatch(/\.band\s*\{\s*flex: none;/);
    expect(source).toMatch(
      /@media \(min-width: 1200px\)\s*\{\s*\.band\s*\{[^}]*grid-template-columns: 44px minmax\(0, 1fr\) auto;/,
    );
    expect(source).toMatch(/\.desk-grid\s*\{\s*flex: 1;\s*min-height: 0;/);
    expect(read('ForSale.vue')).toMatch(/\.rows-region\s*\{\s*flex: 1;\s*min-height: 0;\s*overflow-y: auto;/);
  });

  it('uses the only vendor here when there are no screen arguments', () => {
    const { w, setVendor } = mountScreen({ npcsHere: [npc(2n, 'Marta'), npc(8n, 'Aldric', { npcType: 'quest' })] });
    expect(w.get('.band .name').text()).toBe('Marta');
    expect(setVendor).toHaveBeenCalledWith({ npcId: 2n, npcName: 'Marta' });
  });

  it('lists several vendors under Vendors here with 48px buttons and shows the chosen one', async () => {
    const { w, setVendor } = mountScreen({ npcsHere: TWO_VENDORS });
    expect(w.get('h6').text()).toBe('Vendors here');
    const picks = w.findAll('button.vendor-pick');
    expect(picks.map((b) => b.text())).toEqual(['Marta', 'Bram']);
    expect(picks[0].find('svg').exists()).toBe(true);
    expect(read('VendorScreen.vue')).toMatch(/\.vendor-pick\s*\{[^}]*min-height: 48px;/);
    expect(w.find('.band').exists()).toBe(false);
    await picks[1].trigger('click');
    expect(w.get('.band .name').text()).toBe('Bram');
    expect(w.get('.role').text()).toBe('Vendor');
    expect(setVendor).toHaveBeenLastCalledWith({ npcId: 3n, npcName: 'Bram' });
  });

  it('moves focus to the vendor name after a pick removes the focused button (WR-03)', async () => {
    const { w } = mountScreen({ npcsHere: TWO_VENDORS });
    const pick = w.findAll('button.vendor-pick')[1];
    (pick.element as HTMLElement).focus();
    await pick.trigger('click');
    await nextTick();
    await nextTick();
    expect(document.activeElement).toBe(w.get('.band .name').element);
    expect(w.get('.band .name').attributes('tabindex')).toBe('-1');
  });

  it('renders vendor names in the Vendors here list literally (IN-08)', () => {
    const { w } = mountScreen({ npcsHere: [npc(2n, XSS), npc(3n, 'Bram')] });
    expect(w.find('img').exists()).toBe(false);
    expect(w.findAll('button.vendor-pick')[0].text()).toBe(XSS);
  });

  it('shows No vendor here with the Nearby hint when no vendor is here, and with no character', () => {
    const none = mountScreen({ npcsHere: [npc(8n, 'Aldric', { npcType: 'quest' })] });
    expect(none.w.text()).toContain('No vendor here.');
    expect(none.w.text()).toContain('Find a vendor in Nearby, then choose Trade.');
    expect(none.w.find('.band').exists()).toBe(false);
    wrapper?.unmount();
    wrapper = null;
    const noCharacter = mountScreen({ character: null });
    expect(noCharacter.w.text()).toContain('No vendor here.');
  });

  it('follows a second Trade for another vendor without a remount and resets filter and confirmation', async () => {
    const junk = tpl(7n, { name: 'Rags', slot: 'misc', isJunk: true, vendorValue: 3n });
    const { w, screenArgs, setVendor } = mountScreen({
      screenArgs: MARTA_ARGS,
      npcsHere: TWO_VENDORS,
      items: [inst(10n, 7n)],
      templates: [...TEMPLATES, junk],
      stock: [...STOCK, listing(200n, 4n, 4n, 3n)],
    });
    await w.findAll('[role="group"] button')[1].trigger('click');
    expect(w.findAll('[role="group"] button')[1].attributes('aria-pressed')).toBe('true');
    await w.get('button.junk-btn').trigger('click');
    expect(w.find('.inline-confirm').exists()).toBe(true);
    const root = w.get('.vendor-screen').element;

    screenArgs.value = { npcId: 3n, npcName: 'Bram' };
    await nextTick();
    await nextTick();
    expect(w.get('.vendor-screen').element).toBe(root);
    expect(w.get('.band .name').text()).toBe('Bram');
    expect(setVendor).toHaveBeenLastCalledWith({ npcId: 3n, npcName: 'Bram' });
    expect(w.findAll('[role="group"] button')[0].attributes('aria-pressed')).toBe('true');
    expect(w.find('.inline-confirm').exists()).toBe(false);
    expect(w.findAll('.item-name').map((n) => n.text())).toContain('Bread');
  });

  it('keeps the band and makes Buy and Sell unavailable when the vendor leaves npcsHere', async () => {
    const junk = tpl(7n, { name: 'Rags', slot: 'misc', isJunk: true, vendorValue: 3n });
    const { w, npcsHere, calls } = mountScreen({
      screenArgs: MARTA_ARGS,
      items: [inst(10n, 7n)],
      templates: [...TEMPLATES, junk],
    });
    npcsHere.value = [];
    await nextTick();
    expect(w.get('.band .name').text()).toBe('Marta');
    const buy = w.get('[aria-label="Buy Leather Cap for 20 gold"]');
    const sell = w.get('[aria-label="Sell Rags for 3 gold"]');
    expect(buy.attributes('aria-disabled')).toBe('true');
    expect(sell.attributes('aria-disabled')).toBe('true');
    expect(w.text()).toContain('Marta is no longer nearby.');
    await buy.trigger('click');
    await sell.trigger('click');
    expect(calls.buyItem).not.toHaveBeenCalled();
    expect(calls.sellItem).not.toHaveBeenCalled();
  });

  it('keeps an automatically picked vendor on screen after it leaves (no longer nearby)', async () => {
    const { w, npcsHere } = mountScreen();
    expect(w.get('.band .name').text()).toBe('Marta');
    npcsHere.value = [];
    await nextTick();
    await nextTick();
    expect(w.get('.band .name').text()).toBe('Marta');
    expect(w.text()).toContain('Marta is no longer nearby.');
  });

  it('opens for an NPC that is not here already, with its name', () => {
    const { w } = mountScreen({ screenArgs: { npcId: 9n, npcName: 'Old Tom' }, npcsHere: [] });
    expect(w.get('.band .name').text()).toBe('Old Tom');
    expect(w.get('.role').text()).toBe('Vendor');
  });

  it('wires Buy through the shared action runner and shows the send error in the notice line', async () => {
    const { w } = mountScreen({
      screenArgs: MARTA_ARGS,
      reducers: { buyItem: async () => Promise.reject(new Error('no')) },
    });
    await w.get('[aria-label="Buy Leather Cap for 20 gold"]').trigger('click');
    await vi.waitFor(() => expect(w.get('[role="status"]').text()).toContain("Couldn't send that. Try again."));
  });

  it('calls ledger.setVendor(null) when it unmounts', () => {
    const { w, setVendor } = mountScreen({ screenArgs: MARTA_ARGS });
    w.unmount();
    wrapper = null;
    expect(setVendor).toHaveBeenLastCalledWith(null);
  });

  it('renders a vendor name, greeting and faction with markup literally', () => {
    const { w } = mountScreen({
      screenArgs: { npcId: 2n, npcName: XSS },
      npcsHere: [npc(2n, XSS, { greeting: XSS })],
      factions: [{ id: 1n, name: XSS }],
    });
    expect(w.get('.band .name').text()).toBe(XSS);
    expect(w.get('.quote').text()).toBe(`${OPEN_QUOTE}${XSS}${CLOSE_QUOTE}`);
    expect(w.get('.role').text()).toBe(`Vendor · ${XSS}`);
    expect(w.find('img').exists()).toBe(false);
  });
});

describe('VendorScreen mobile', () => {
  it('shows the vendor row, the rapport line and the Buy and Sell tabs, with no gold in the row', () => {
    const { w } = mountScreen({ screenArgs: MARTA_ARGS, isDesktop: false });
    const row = w.get('.vendor-row');
    expect(row.get('.avatar').text()).toBe('M');
    expect(row.get('.name').text()).toBe('Marta');
    expect(row.get('.quote').text()).toBe(`${OPEN_QUOTE}Fine wares for fine folk.${CLOSE_QUOTE}`);
    expect(row.find('[role="img"]').exists()).toBe(false);
    expect(w.get('.mobile-rapport').text()).toContain('Your rapport:');
    expect(w.get('[role="tablist"]').attributes('aria-label')).toBe('Trade view');
    expect(w.findAll('[role="tab"]').map((t) => t.text())).toEqual(['Buy', 'Sell']);
    expect(w.find('.band').exists()).toBe(false);
  });

  it('shows the Buy list first and the Sell panel with the Just sold card on top on the Sell tab', async () => {
    const { w, calls } = mountScreen({
      screenArgs: MARTA_ARGS,
      isDesktop: false,
      items: [inst(11n, 1n)],
      lastSale: SALE_ROW,
    });
    expect(w.find('.sale-list').exists()).toBe(true);
    expect(w.findAll('.sale-list li')).toHaveLength(5);
    await w.findAll('[role="tab"]')[1].trigger('click');
    expect(w.find('.sale-list').exists()).toBe(false);
    const kids = Array.from(w.get('.sell-panel').element.children);
    const cardIndex = kids.findIndex((el) => el.classList.contains('just-sold'));
    const listIndex = kids.findIndex((el) => el.classList.contains('sell-list'));
    expect(cardIndex).toBeGreaterThanOrEqual(0);
    expect(listIndex).toBeGreaterThan(cardIndex);
    await w.get('[aria-label="Sell Iron Sword for 10 gold"]').trigger('click');
    expect(calls.sellItem).toHaveBeenCalledWith({ characterId: 7n, itemInstanceId: 11n, npcId: 2n });
  });

  it('returns to the Buy tab on a second Trade for another vendor', async () => {
    const { w, screenArgs } = mountScreen({ screenArgs: MARTA_ARGS, isDesktop: false, npcsHere: TWO_VENDORS });
    await w.findAll('[role="tab"]')[1].trigger('click');
    expect(w.findAll('[role="tab"]')[1].attributes('aria-selected')).toBe('true');
    screenArgs.value = { npcId: 3n, npcName: 'Bram' };
    await nextTick();
    await nextTick();
    expect(w.findAll('[role="tab"]')[0].attributes('aria-selected')).toBe('true');
    expect(w.get('.vendor-row .name').text()).toBe('Bram');
  });

  it('lists several vendors on mobile too and shows the chosen one', async () => {
    const { w } = mountScreen({ isDesktop: false, npcsHere: TWO_VENDORS });
    expect(w.get('h6').text()).toBe('Vendors here');
    const pick = w.findAll('button.vendor-pick')[0];
    (pick.element as HTMLElement).focus();
    await pick.trigger('click');
    await nextTick();
    await nextTick();
    expect(w.get('.vendor-row .name').text()).toBe('Marta');
    expect(document.activeElement).toBe(w.get('.vendor-row .name').element);
  });

  it('keeps the mobile 44px rules in the sources and puts the gold in the header meta only', () => {
    expect(read('SellPanel.vue')).toMatch(/\.mobile \.sell-btn\s*\{[^}]*min-height: 44px;/);
    expect(read('ForSale.vue')).toMatch(/\.mobile \.buy-btn\s*\{[^}]*min-height: 44px;/);
    expect(readFileSync(resolve(process.cwd(), 'src/ledger/SegTabs.vue'), 'utf8')).toMatch(
      /\.seg-opt\s*\{[^}]*min-height: 44px;/,
    );
    expect(read('VendorMeta.vue')).toContain('GoldAmount');
    expect(read('VendorScreen.vue')).not.toContain('GoldAmount');
  });

  it('renders the vendor name and greeting with markup literally', () => {
    const { w } = mountScreen({
      screenArgs: { npcId: 2n, npcName: XSS },
      isDesktop: false,
      npcsHere: [npc(2n, XSS, { greeting: XSS })],
    });
    expect(w.get('.vendor-row .name').text()).toBe(XSS);
    expect(w.get('.vendor-row .quote').text()).toBe(`${OPEN_QUOTE}${XSS}${CLOSE_QUOTE}`);
    expect(w.find('img').exists()).toBe(false);
  });
});
