// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { computed, nextTick, ref, shallowRef } from 'vue';
import { mount, type VueWrapper } from '@vue/test-utils';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { sellPayout } from '@game-data/vendor_pricing';
import { GAME_KEY, createInertGame } from '../game/context';
import type { GameData } from '../game/context';
import { LEDGER_KEY, createInertLedger } from '../ledger/ledgerContext';
import type { LedgerData, LedgerReducers } from '../ledger/ledgerContext';
import { createActionRunner } from '../ledger/actionRunner';
import type { ItemInstance, ItemTemplate, VendorBuyback } from '../module_bindings/types';
import SellPanel from './SellPanel.vue';

const XSS = '<img src=x onerror=alert(1)>';

let wrapper: VueWrapper | null = null;
afterEach(() => {
  wrapper?.unmount();
  wrapper = null;
  document.body.innerHTML = '';
});

function tpl(id: bigint, overrides: Record<string, unknown> = {}): ItemTemplate {
  return {
    id,
    name: `Item ${id}`,
    slot: 'misc',
    armorType: '',
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

const TEMPLATES = [
  tpl(1n, { name: 'Iron Sword', slot: 'mainHand', rarity: 'rare', vendorValue: 40n }),
  tpl(2n, { name: 'Rags', isJunk: true, vendorValue: 3n }),
  tpl(3n, { name: 'Bone Shard', isJunk: true, vendorValue: 7n }),
  tpl(4n, { name: 'Gate Key', slot: 'quest', vendorValue: 99n }),
  tpl(5n, { name: 'Iron Ore', slot: 'material', vendorValue: 5n, stackable: true }),
];

const ITEMS = [
  inst(10n, 4n),
  inst(11n, 1n),
  inst(12n, 3n),
  inst(13n, 5n, { quantity: 4n }),
  inst(14n, 2n),
  inst(15n, 1n, { equippedSlot: 'mainHand' }),
];

interface World {
  items?: ItemInstance[];
  templates?: ItemTemplate[];
  connected?: boolean;
  itemsApplied?: boolean;
  gold?: bigint;
  vendorNearby?: boolean;
  openVendorId?: bigint | null;
  mobile?: boolean;
  lastSale?: VendorBuyback | null;
  sellItem?: () => Promise<void>;
  sellAllJunk?: () => Promise<void>;
  buybackLastSale?: () => Promise<void>;
}

function setup(world: World = {}) {
  const connected = ref(world.connected ?? true);
  const items = shallowRef<readonly ItemInstance[]>(world.items ?? ITEMS);
  const lastSale = shallowRef<VendorBuyback | null>(world.lastSale ?? null);
  const sellItem = vi.fn(world.sellItem ?? (async () => undefined));
  const sellAllJunk = vi.fn(world.sellAllJunk ?? (async () => undefined));
  const buybackLastSale = vi.fn(world.buybackLastSale ?? (async () => undefined));
  const reducers = { sellItem, sellAllJunk, buybackLastSale } as unknown as LedgerReducers;
  const game = {
    ...createInertGame(),
    character: ref({
      id: 7n,
      level: 5n,
      className: 'Warrior',
      gold: world.gold ?? 500n,
      locationId: 10n,
      vendorSellMod: 0n,
      vendorBuyMod: 0n,
    }),
    renownPerks: ref([]),
    connected,
  } as unknown as GameData;
  const ledger = {
    ...createInertLedger(),
    items,
    itemsApplied: ref(world.itemsApplied ?? true),
    lastSale,
    templates: ref(new Map((world.templates ?? TEMPLATES).map((t) => [t.id, t]))),
    reducers: computed(() => (connected.value ? reducers : null)),
  } as unknown as LedgerData;
  const runner = createActionRunner({ online: computed(() => connected.value && ledger.reducers.value !== null) });
  wrapper = mount(SellPanel, {
    attachTo: document.body,
    props: {
      openVendorId: world.openVendorId === undefined ? 2n : world.openVendorId,
      vendorNearby: world.vendorNearby ?? true,
      vendorName: 'Marta',
      runner,
      mobile: world.mobile ?? false,
    },
    global: { provide: { [GAME_KEY as symbol]: game, [LEDGER_KEY as symbol]: ledger } },
  });
  return { w: wrapper, items, lastSale, connected, sellItem, sellAllJunk, buybackLastSale, runner };
}

const SALE = {
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

function rowNames(w: VueWrapper): string[] {
  return w.findAll('.item-name').map((n) => n.text());
}

describe('SellPanel desktop', () => {
  it('draws the heading, Sell all junk with the count, a captioned table and the rows in model order', () => {
    const { w } = setup();
    const heading = w.get('h6');
    expect(heading.text()).toBe('Your backpack');
    expect(heading.attributes('tabindex')).toBe('-1');
    expect(w.get('button.junk-btn').text()).toBe('Sell all junk (2)');
    expect(w.get('table').classes()).toContain('table');
    expect(w.get('caption').text()).toBe('Your backpack');
    expect(w.findAll('th').map((th) => th.text())).toEqual(['Item', 'Value', 'Action']);
    expect(w.findAll('th').every((th) => th.attributes('scope') === 'col')).toBe(true);
    expect(rowNames(w)).toEqual(['Bone Shard', 'Rags', 'Iron Ore', 'Iron Sword', 'Gate Key']);
    expect(w.findAll('li')).toHaveLength(0);
  });

  it('shows the quantity, the junk tag, the each line and the stack value from the shared payout', () => {
    const { w } = setup();
    const rows = w.findAll('tbody tr');
    expect(rows[0].get('.junk-tag').text()).toBe('junk');
    const ore = rows[2];
    expect(ore.get('.qty').text()).toBe('×4');
    expect(ore.get('.sub').text()).toBe('5 each');
    expect(ore.get('[role="img"]').attributes('aria-label')).toBe(`${sellPayout(5n, 4n, 0, 0n)} gold`);
    expect(rows[3].find('.junk-tag').exists()).toBe(false);
  });

  it('pins the Just sold card after the table, outside its scroll region', () => {
    const { w } = setup({ lastSale: SALE });
    const region = w.get('.table-region');
    const card = w.get('.just-sold');
    expect(region.element.contains(card.element)).toBe(false);
    expect(region.element.nextElementSibling?.contains(card.element)).toBe(true);
    expect(card.get('.card-kicker').text()).toBe('Just sold');
  });

  it('calls sellItem with the character, the instance and the open vendor, once, inert while pending', async () => {
    let release: () => void = () => undefined;
    const { w, sellItem } = setup({ sellItem: () => new Promise<void>((resolveCall) => (release = resolveCall)) });
    const button = w.get('[aria-label="Sell Iron Sword for 40 gold"]');
    await button.trigger('click');
    await button.trigger('click');
    expect(sellItem).toHaveBeenCalledTimes(1);
    expect(sellItem).toHaveBeenCalledWith({ characterId: 7n, itemInstanceId: 11n, npcId: 2n });
    expect(button.attributes('aria-disabled')).toBe('true');
    release();
    await nextTick();
  });

  it('gives quest rows a dash and no Sell button, and the sub-line', () => {
    const { w } = setup();
    const quest = w.findAll('tbody tr')[4];
    expect(quest.find('button').exists()).toBe(false);
    expect(quest.get('.dash').text()).toBe('—');
    expect(quest.get('.sub').text()).toBe("Quest item · can't be sold");
    expect(w.findAll('button.sell-btn')).toHaveLength(4);
  });

  it('makes Sell and Sell all junk unavailable with the reason when the vendor is no longer nearby', async () => {
    const { w, sellItem, sellAllJunk } = setup({ vendorNearby: false });
    const reason = w.get('.reason');
    expect(reason.text()).toBe('Marta is no longer nearby.');
    const sell = w.get('[aria-label="Sell Iron Sword for 40 gold"]');
    expect(sell.attributes('aria-disabled')).toBe('true');
    expect(sell.attributes('aria-describedby')).toBe(reason.attributes('id'));
    await sell.trigger('click');
    const junk = w.get('button.junk-btn');
    expect(junk.attributes('aria-disabled')).toBe('true');
    await junk.trigger('click');
    expect(sellItem).not.toHaveBeenCalled();
    expect(sellAllJunk).not.toHaveBeenCalled();
    expect(w.find('.inline-confirm').exists()).toBe(false);
  });

  it('opens the inline confirmation with the model prompt; Keep it sends nothing and refocuses the button', async () => {
    const { w, sellAllJunk } = setup();
    const junk = w.get('button.junk-btn');
    await junk.trigger('click');
    const confirm = w.get('.inline-confirm');
    expect(confirm.get('.confirm-prompt').text()).toBe(
      `Sell 2 junk items for ${sellPayout(7n, 1n, 0, 0n) + sellPayout(3n, 1n, 0, 0n)} gold? Junk sales can't be bought back.`,
    );
    expect(confirm.findAll('button').map((b) => b.text())).toEqual(['Sell junk', 'Keep it']);
    expect(document.activeElement).toBe(confirm.findAll('button')[1].element);
    await confirm.findAll('button')[1].trigger('click');
    await nextTick();
    await nextTick();
    expect(sellAllJunk).not.toHaveBeenCalled();
    expect(w.find('.inline-confirm').exists()).toBe(false);
    expect(document.activeElement).toBe(junk.element);
  });

  it('Sell junk calls sellAllJunk with only the character id and closes the confirmation', async () => {
    const { w, sellAllJunk } = setup();
    await w.get('button.junk-btn').trigger('click');
    await w.get('.inline-confirm').findAll('button')[0].trigger('click');
    expect(sellAllJunk).toHaveBeenCalledTimes(1);
    expect(sellAllJunk).toHaveBeenCalledWith({ characterId: 7n });
    await vi.waitFor(() => expect(w.find('.inline-confirm').exists()).toBe(false));
  });

  it('natively disables Sell all junk with the title when there is no junk', async () => {
    const { w, sellAllJunk } = setup({ items: [inst(11n, 1n)] });
    const junk = w.get('button.junk-btn');
    expect(junk.text()).toBe('Sell all junk (0)');
    expect(junk.attributes('disabled')).toBeDefined();
    expect(junk.attributes('title')).toBe('No junk to sell');
    await junk.trigger('click');
    expect(sellAllJunk).not.toHaveBeenCalled();
  });

  it('moves focus to the next row Sell button when a Sell removes the focused row', async () => {
    const { w, items } = setup();
    const first = w.get('[aria-label="Sell Bone Shard for 7 gold"]');
    (first.element as HTMLElement).focus();
    await first.trigger('click');
    items.value = items.value.filter((row) => row.id !== 12n);
    await vi.waitFor(() => expect(rowNames(w)).not.toContain('Bone Shard'));
    expect(document.activeElement).toBe(w.get('[aria-label="Sell Rags for 3 gold"]').element);
  });

  it('moves focus to the Your backpack heading when no Sell button follows the removed row', async () => {
    const { w, items } = setup({ items: [inst(11n, 1n), inst(10n, 4n)] });
    const sword = w.get('[aria-label="Sell Iron Sword for 40 gold"]');
    (sword.element as HTMLElement).focus();
    await sword.trigger('click');
    items.value = items.value.filter((row) => row.id !== 11n);
    await vi.waitFor(() => expect(rowNames(w)).toEqual(['Gate Key']));
    expect(document.activeElement).toBe(w.get('h6').element);
  });

  it('moves focus to the heading after the Just sold card clears following a buy-back', async () => {
    const { w, lastSale } = setup({ lastSale: SALE });
    const button = w.get('button.buyback');
    (button.element as HTMLElement).focus();
    await button.trigger('click');
    await vi.waitFor(() => expect(button.attributes('aria-disabled')).toBeUndefined());
    lastSale.value = null;
    await vi.waitFor(() => expect(document.activeElement).toBe(w.get('h6').element));
  });

  it('shows the empty line with nothing to sell', () => {
    const { w } = setup({ items: [] });
    expect(w.get('.empty').text()).toBe('Nothing in your backpack to sell.');
    expect(w.find('table').exists()).toBe(false);
  });

  it('shows no empty line until the item subscription has applied (WR-05)', () => {
    const { w } = setup({ items: [], itemsApplied: false });
    expect(w.find('.empty').exists()).toBe(false);
    expect(w.find('table').exists()).toBe(false);
    wrapper?.unmount();
    wrapper = null;
    const mobile = setup({ items: [], itemsApplied: false, mobile: true });
    expect(mobile.w.find('.empty').exists()).toBe(false);
  });

  it('disables every action while offline', async () => {
    const { w, sellItem, sellAllJunk } = setup({ connected: false, lastSale: SALE });
    for (const button of w.findAll('button.sell-btn')) {
      expect(button.attributes('aria-disabled')).toBe('true');
      await button.trigger('click');
    }
    await w.get('button.junk-btn').trigger('click');
    await w.get('button.buyback').trigger('click');
    expect(sellItem).not.toHaveBeenCalled();
    expect(sellAllJunk).not.toHaveBeenCalled();
    expect(w.find('.inline-confirm').exists()).toBe(false);
  });

  it('renders item names with markup literally', () => {
    const { w } = setup({ items: [inst(40n, 1n, { displayName: XSS })], lastSale: { ...SALE, itemName: XSS } as VendorBuyback });
    expect(w.findAll('.item-name')[0].text()).toBe(XSS);
    expect(w.get('.just-sold .name').text()).toBe(XSS);
    expect(w.find('img').exists()).toBe(false);
  });
});

describe('SellPanel mobile', () => {
  it('stacks Sell all junk, the Just sold card and a list of rows with 44px Sell buttons', () => {
    const { w } = setup({ mobile: true, lastSale: SALE });
    const children = Array.from(w.get('.sell-panel').element.children).map((el) => el.className.split(' ')[0] || el.tagName);
    const junkIndex = children.indexOf('btn');
    const cardIndex = children.indexOf('card');
    const listIndex = children.indexOf('sell-list');
    expect(junkIndex).toBeGreaterThanOrEqual(0);
    expect(cardIndex).toBeGreaterThan(junkIndex);
    expect(listIndex).toBeGreaterThan(cardIndex);
    expect(w.find('table').exists()).toBe(false);
    expect(w.get('ul').findAll('li')).toHaveLength(5);
    expect(w.get('button.junk-btn').text()).toBe('Sell all junk (2)');
    expect(w.get('h6').classes()).toContain('sr-only');
    const source = readFileSync(resolve(process.cwd(), 'src/vendor/SellPanel.vue'), 'utf8');
    expect(source).toMatch(/\.mobile \.junk-btn\s*\{[^}]*min-height: 44px;/);
    expect(source).toMatch(/\.mobile \.sell-btn\s*\{[^}]*min-height: 44px;/);
    expect(source).toMatch(/\.sell-row\s*\{[^}]*min-height: 56px;/);
  });

  it('sells a row and runs the junk confirmation with mobile decision buttons', async () => {
    const { w, sellItem, sellAllJunk } = setup({ mobile: true });
    await w.get('[aria-label="Sell Iron Ore ×4 for 20 gold"]').trigger('click');
    expect(sellItem).toHaveBeenCalledWith({ characterId: 7n, itemInstanceId: 13n, npcId: 2n });
    await w.get('button.junk-btn').trigger('click');
    expect(w.get('.inline-confirm').classes()).toContain('mobile');
    await w.get('.inline-confirm').findAll('button')[0].trigger('click');
    expect(sellAllJunk).toHaveBeenCalledWith({ characterId: 7n });
  });

  it('shows quest rows with a dash and no button, and the empty line', () => {
    const { w } = setup({ mobile: true });
    const quest = w.findAll('li')[4];
    expect(quest.find('button').exists()).toBe(false);
    expect(quest.get('.dash').text()).toBe('—');
    wrapper?.unmount();
    wrapper = null;
    const empty = setup({ mobile: true, items: [] });
    expect(empty.w.get('.empty').text()).toBe('Nothing in your backpack to sell.');
  });

  it('natively disables Sell all junk with no junk and makes Sell unavailable when the vendor left', async () => {
    const { w, sellItem } = setup({ mobile: true, items: [inst(11n, 1n)], vendorNearby: false });
    const junk = w.get('button.junk-btn');
    expect(junk.attributes('disabled')).toBeDefined();
    expect(junk.attributes('title')).toBe('No junk to sell');
    const sell = w.get('button.sell-btn');
    expect(sell.attributes('aria-disabled')).toBe('true');
    await sell.trigger('click');
    expect(sellItem).not.toHaveBeenCalled();
    expect(w.get('.reason').text()).toBe('Marta is no longer nearby.');
  });

  it('renders item names with markup literally', () => {
    const { w } = setup({ mobile: true, items: [inst(40n, 1n, { displayName: XSS })] });
    expect(w.get('.item-name').text()).toBe(XSS);
    expect(w.find('img').exists()).toBe(false);
  });
});
