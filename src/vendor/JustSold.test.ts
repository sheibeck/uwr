// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { computed, nextTick, ref, shallowRef } from 'vue';
import { mount, type VueWrapper } from '@vue/test-utils';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { MAX_INVENTORY_SLOTS } from '@game-data/inventory_rules';
import { GAME_KEY, createInertGame } from '../game/context';
import type { GameData } from '../game/context';
import { LEDGER_KEY, createInertLedger } from '../ledger/ledgerContext';
import type { LedgerData, LedgerReducers } from '../ledger/ledgerContext';
import { createActionRunner } from '../ledger/actionRunner';
import type { ItemInstance, ItemTemplate, VendorBuyback, VendorInventory } from '../module_bindings/types';
import JustSold from './JustSold.vue';

const XSS = '<img src=x onerror=alert(1)>';

let wrapper: VueWrapper | null = null;
afterEach(() => {
  wrapper?.unmount();
  wrapper = null;
  document.body.innerHTML = '';
});

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

function inst(id: bigint, templateId: bigint): ItemInstance {
  return {
    id,
    templateId,
    ownerCharacterId: 7n,
    equippedSlot: undefined,
    quantity: 1n,
  } as unknown as ItemInstance;
}

const TEMPLATES = [
  { id: 2n, name: 'Blade', slot: 'mainHand', stackable: false },
  { id: 3n, name: 'Potion', slot: 'consumable', stackable: true },
] as unknown as ItemTemplate[];

interface World {
  lastSale?: VendorBuyback | null;
  gold?: bigint;
  locationId?: bigint;
  connected?: boolean;
  items?: ItemInstance[];
  buyback?: () => Promise<void>;
  openVendorId?: bigint | null;
  mobile?: boolean;
  /** The open vendor stock (the screen passes it only once its subscription has applied). */
  stock?: VendorInventory[];
  stockApplied?: boolean;
}

function setup(world: World = {}) {
  const connected = ref(world.connected ?? true);
  const lastSale = shallowRef<VendorBuyback | null>(world.lastSale === undefined ? sale() : world.lastSale);
  const buybackLastSale = vi.fn(world.buyback ?? (async () => undefined));
  const reducers = { buybackLastSale } as unknown as LedgerReducers;
  const game = {
    ...createInertGame(),
    character: ref({ id: 7n, gold: world.gold ?? 500n, locationId: world.locationId ?? 10n }),
    connected,
  } as unknown as GameData;
  const ledger = {
    ...createInertLedger(),
    lastSale,
    items: ref(world.items ?? []),
    templates: ref(new Map(TEMPLATES.map((t) => [t.id, t]))),
    vendorStock: ref(world.stock ?? []),
    vendorStockApplied: ref(world.stockApplied ?? false),
    reducers: computed(() => (connected.value ? reducers : null)),
  } as unknown as LedgerData;
  const runner = createActionRunner({ online: computed(() => connected.value && ledger.reducers.value !== null) });
  wrapper = mount(JustSold, {
    attachTo: document.body,
    props: {
      openVendorId: world.openVendorId === undefined ? 2n : world.openVendorId,
      runner,
      mobile: world.mobile ?? false,
    },
    global: { provide: { [GAME_KEY as symbol]: game, [LEDGER_KEY as symbol]: ledger } },
  });
  return { w: wrapper, lastSale, buybackLastSale, runner, connected };
}

function shelf(quantity: bigint): VendorInventory {
  return { id: 1n, npcId: 2n, itemTemplateId: 3n, price: 6n, qualityTier: undefined, quantity } as unknown as VendorInventory;
}

describe('JustSold quantity and stock (Plan 50-27)', () => {
  it('shows the quantity sold in the name', () => {
    const { w } = setup({ lastSale: sale({ itemName: 'Potion', templateId: 3n, quantity: 5n }) });
    expect(w.get('.name').text()).toBe('Potion ×5');
  });

  it('says the vendor has already sold it when the applied stock holds fewer than were sold', async () => {
    const { w, buybackLastSale } = setup({
      lastSale: sale({ itemName: 'Potion', templateId: 3n, quantity: 5n }),
      stock: [shelf(2n)],
      stockApplied: true,
    });
    const reason = w.get('.reason');
    expect(reason.text()).toBe('Marta has already sold Potion.');
    const button = w.get('button.buyback');
    expect(button.attributes('aria-disabled')).toBe('true');
    expect(button.attributes('aria-describedby')).toBe(reason.attributes('id'));
    await button.trigger('click');
    expect(buybackLastSale).not.toHaveBeenCalled();
  });

  it('stays ready while the stock subscription has not applied (no flash of sold)', () => {
    const { w } = setup({
      lastSale: sale({ itemName: 'Potion', templateId: 3n, quantity: 5n }),
      stock: [],
      stockApplied: false,
    });
    expect(w.find('.reason').exists()).toBe(false);
    expect(w.get('button.buyback').attributes('aria-disabled')).toBeUndefined();
  });

  it('is ready when the applied stock holds enough of the sold units', () => {
    const { w } = setup({
      lastSale: sale({ itemName: 'Potion', templateId: 3n, quantity: 5n }),
      stock: [shelf(5n)],
      stockApplied: true,
    });
    expect(w.get('button.buyback').attributes('aria-disabled')).toBeUndefined();
  });
});

describe('JustSold', () => {
  it('renders nothing without a last-sale row (no placeholder)', () => {
    const { w } = setup({ lastSale: null });
    expect(w.find('.card').exists()).toBe(false);
    expect(w.text()).toBe('');
  });

  it('shows the kicker, the name in the rarity color, a plus gold amount and the Buy back button', () => {
    const { w } = setup();
    expect(w.get('.card-kicker').text()).toBe('Just sold');
    const name = w.get('.name');
    expect(name.text()).toBe('Keen Blade');
    expect(name.attributes('style')).toContain('var(--color-rarity-rare)');
    expect(name.attributes('title')).toBe('Keen Blade');
    const gold = w.get('[role="img"]');
    expect(gold.attributes('aria-label')).toBe('+30 gold');
    expect(gold.text()).toBe('+30');
    const button = w.get('button.buyback');
    expect(button.text()).toBe('Buy back');
    expect(button.attributes('aria-label')).toBe('Buy back Keen Blade for 30 gold');
    expect(button.attributes('aria-disabled')).toBeUndefined();
    expect(button.find('svg').exists()).toBe(true);
    expect(w.find('.reason').exists()).toBe(false);
  });

  it('adds the quantity to the name and the label for a stack', () => {
    const { w } = setup({ lastSale: sale({ quantity: 3n, itemName: 'Potion', templateId: 3n }) });
    expect(w.get('.name').text()).toBe('Potion ×3');
    expect(w.get('button.buyback').attributes('aria-label')).toBe('Buy back Potion ×3 for 30 gold');
  });

  it('calls buybackLastSale with only the character id, once, and stays inert while pending', async () => {
    let release: () => void = () => undefined;
    const { w, buybackLastSale } = setup({
      buyback: () => new Promise<void>((resolveCall) => (release = resolveCall)),
    });
    const button = w.get('button.buyback');
    await button.trigger('click');
    await button.trigger('click');
    expect(buybackLastSale).toHaveBeenCalledTimes(1);
    expect(buybackLastSale).toHaveBeenCalledWith({ characterId: 7n });
    expect(button.attributes('aria-disabled')).toBe('true');
    release();
    await nextTick();
  });

  it('counts a rejection on the runner', async () => {
    const { w, runner } = setup({ buyback: async () => Promise.reject(new Error('no')) });
    await w.get('button.buyback').trigger('click');
    await vi.waitFor(() => expect(runner.rejection.value).toBe(1));
  });

  it('is aria-disabled with the gold reason and sends nothing when gold is short', async () => {
    const { w, buybackLastSale } = setup({ gold: 5n });
    const button = w.get('button.buyback');
    expect(button.attributes('aria-disabled')).toBe('true');
    const reason = w.get('.reason');
    expect(reason.text()).toBe('You need 30 gold to buy it back.');
    expect(button.attributes('aria-describedby')).toBe(reason.attributes('id'));
    await button.trigger('click');
    expect(buybackLastSale).not.toHaveBeenCalled();
  });

  it('is aria-disabled with the place reason for another vendor, another place or no open vendor', async () => {
    const reason = 'Sold to Marta. Go back there to buy it back.';
    for (const world of [{ openVendorId: 9n }, { locationId: 11n }, { openVendorId: null }]) {
      const { w, buybackLastSale } = setup(world);
      expect(w.get('button.buyback').attributes('aria-disabled')).toBe('true');
      expect(w.get('.reason').text()).toBe(reason);
      await w.get('button.buyback').trigger('click');
      expect(buybackLastSale).not.toHaveBeenCalled();
      w.unmount();
      wrapper = null;
    }
  });

  it('is aria-disabled with the full-bag reason and sends nothing', async () => {
    const bag: ItemInstance[] = [];
    for (let i = 0; i < MAX_INVENTORY_SLOTS; i += 1) bag.push(inst(BigInt(100 + i), 99n));
    const { w, buybackLastSale } = setup({ items: bag });
    expect(w.get('button.buyback').attributes('aria-disabled')).toBe('true');
    expect(w.get('.reason').text()).toBe('Your backpack is full.');
    await w.get('button.buyback').trigger('click');
    expect(buybackLastSale).not.toHaveBeenCalled();
  });

  it('is disabled while offline and sends nothing', async () => {
    const { w, buybackLastSale } = setup({ connected: false });
    expect(w.get('button.buyback').attributes('aria-disabled')).toBe('true');
    await w.get('button.buyback').trigger('click');
    expect(buybackLastSale).not.toHaveBeenCalled();
  });

  it('emits cleared when the row goes away after a successful buy-back (row clears after the call settles)', async () => {
    const { w, lastSale } = setup();
    await w.get('button.buyback').trigger('click');
    await vi.waitFor(() => expect(w.get('button.buyback').attributes('aria-disabled')).toBeUndefined());
    expect(w.emitted('cleared')).toBeUndefined();
    lastSale.value = null;
    await nextTick();
    expect(w.emitted('cleared')).toHaveLength(1);
    expect(w.find('.card').exists()).toBe(false);
  });

  it('emits cleared once when the row clears before the call settles', async () => {
    let release: () => void = () => undefined;
    const { w, lastSale } = setup({ buyback: () => new Promise<void>((resolveCall) => (release = resolveCall)) });
    await w.get('button.buyback').trigger('click');
    lastSale.value = null;
    await nextTick();
    expect(w.emitted('cleared')).toBeUndefined();
    release();
    await vi.waitFor(() => expect(w.emitted('cleared')).toHaveLength(1));
  });

  it('does not emit cleared when the row clears without this call, or is replaced by a newer sale', async () => {
    const { w, lastSale } = setup();
    lastSale.value = sale({ itemName: 'Old Cap', price: 12n });
    await nextTick();
    expect(w.emitted('cleared')).toBeUndefined();
    lastSale.value = null;
    await nextTick();
    expect(w.emitted('cleared')).toBeUndefined();
  });

  it('shows the newer item when a second sale replaces the row', async () => {
    const { w, lastSale } = setup();
    expect(w.get('.name').text()).toBe('Keen Blade');
    lastSale.value = sale({ itemName: 'Plain Cap', rarity: 'common', price: 4n });
    await nextTick();
    expect(w.get('.name').text()).toBe('Plain Cap');
    expect(w.get('button.buyback').attributes('aria-label')).toBe('Buy back Plain Cap for 4 gold');
  });

  it('gives the mobile button a 44px minimum height in the source and the desktop one 32px', () => {
    const source = readFileSync(resolve(process.cwd(), 'src/vendor/JustSold.vue'), 'utf8');
    expect(source).toMatch(/\.mobile \.buyback\s*\{\s*min-height: 44px;/);
    expect(source).toMatch(/\.buyback\s*\{[^}]*min-height: 32px;/);
    const { w } = setup({ mobile: true });
    expect(w.get('.just-sold').classes()).toContain('mobile');
  });

  it('renders an item name with markup literally', () => {
    const { w } = setup({ lastSale: sale({ itemName: XSS }) });
    expect(w.get('.name').text()).toBe(XSS);
    expect(w.find('img').exists()).toBe(false);
    expect(w.get('button.buyback').attributes('aria-label')).toBe(`Buy back ${XSS} for 30 gold`);
  });
});
