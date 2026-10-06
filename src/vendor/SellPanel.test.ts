// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { computed, nextTick, ref, shallowRef } from 'vue';
import { mount, type VueWrapper } from '@vue/test-utils';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { sellPayout } from '@game-data/vendor_pricing';
import { PhMinus, PhPlus } from '@phosphor-icons/vue';
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
  sellItemQuantity?: () => Promise<void>;
  sellAllJunk?: () => Promise<void>;
  buybackLastSale?: () => Promise<void>;
}

function setup(world: World = {}) {
  const connected = ref(world.connected ?? true);
  const items = shallowRef<readonly ItemInstance[]>(world.items ?? ITEMS);
  const lastSale = shallowRef<VendorBuyback | null>(world.lastSale ?? null);
  const sellItem = vi.fn(async () => undefined);
  const sellItemQuantity = vi.fn(world.sellItemQuantity ?? (async () => undefined));
  const sellAllJunk = vi.fn(world.sellAllJunk ?? (async () => undefined));
  const buybackLastSale = vi.fn(world.buybackLastSale ?? (async () => undefined));
  const reducers = { sellItem, sellItemQuantity, sellAllJunk, buybackLastSale } as unknown as LedgerReducers;
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
  return { w: wrapper, items, lastSale, connected, sellItem, sellItemQuantity, sellAllJunk, buybackLastSale, runner, game, ledger };
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

  it('sells a single item at once: sellItemQuantity with quantity 1n, once, inert while pending', async () => {
    let release: () => void = () => undefined;
    const { w, sellItem, sellItemQuantity } = setup({
      sellItemQuantity: () => new Promise<void>((resolveCall) => (release = resolveCall)),
    });
    const button = w.get('[aria-label="Sell Iron Sword for 40 gold"]');
    expect(button.attributes('aria-expanded')).toBeUndefined();
    await button.trigger('click');
    await button.trigger('click');
    expect(sellItemQuantity).toHaveBeenCalledTimes(1);
    expect(sellItemQuantity).toHaveBeenCalledWith({ characterId: 7n, itemInstanceId: 11n, npcId: 2n, quantity: 1n });
    expect(sellItem).not.toHaveBeenCalled();
    expect(w.find('.picker-row').exists()).toBe(false);
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
    const { w, sellItemQuantity, sellAllJunk } = setup({ vendorNearby: false });
    const reason = w.get('.reason');
    expect(reason.text()).toBe('Marta is no longer nearby.');
    const sell = w.get('[aria-label="Sell Iron Sword for 40 gold"]');
    expect(sell.attributes('aria-disabled')).toBe('true');
    expect(sell.attributes('aria-describedby')).toBe(reason.attributes('id'));
    await sell.trigger('click');
    const junk = w.get('button.junk-btn');
    expect(junk.attributes('aria-disabled')).toBe('true');
    await junk.trigger('click');
    expect(sellItemQuantity).not.toHaveBeenCalled();
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
    const { w, sellItemQuantity, sellAllJunk } = setup({ connected: false, lastSale: SALE });
    for (const button of w.findAll('button.sell-btn')) {
      expect(button.attributes('aria-disabled')).toBe('true');
      await button.trigger('click');
    }
    await w.get('button.junk-btn').trigger('click');
    await w.get('button.buyback').trigger('click');
    expect(sellItemQuantity).not.toHaveBeenCalled();
    expect(w.find('.picker-row').exists()).toBe(false);
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

  it('sells a stack through the picker and runs the junk confirmation with mobile decision buttons', async () => {
    const { w, sellItemQuantity, sellAllJunk } = setup({ mobile: true });
    await w.get('[aria-label="Sell Iron Ore ×4 for 20 gold"]').trigger('click');
    expect(sellItemQuantity).not.toHaveBeenCalled();
    await w.get('[aria-label="Set to all 4"]').trigger('click');
    await w.get('.picker-item .inline-confirm').findAll('button.decision-btn')[0].trigger('click');
    expect(sellItemQuantity).toHaveBeenCalledWith({ characterId: 7n, itemInstanceId: 13n, npcId: 2n, quantity: 4n });
    await w.get('button.junk-btn').trigger('click');
    expect(w.find('.picker-item').exists()).toBe(false);
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
    const { w, sellItemQuantity } = setup({ mobile: true, items: [inst(11n, 1n)], vendorNearby: false });
    const junk = w.get('button.junk-btn');
    expect(junk.attributes('disabled')).toBeDefined();
    expect(junk.attributes('title')).toBe('No junk to sell');
    const sell = w.get('button.sell-btn');
    expect(sell.attributes('aria-disabled')).toBe('true');
    await sell.trigger('click');
    expect(sellItemQuantity).not.toHaveBeenCalled();
    expect(w.get('.reason').text()).toBe('Marta is no longer nearby.');
  });

  it('renders item names with markup literally', () => {
    const { w } = setup({ mobile: true, items: [inst(40n, 1n, { displayName: XSS })] });
    expect(w.get('.item-name').text()).toBe(XSS);
    expect(w.find('img').exists()).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// The sell quantity picker (Plan 50-27)
// ---------------------------------------------------------------------------

const ORE_LABEL = 'Sell Iron Ore ×4 for 20 gold';
const read = (file: string): string => readFileSync(resolve(process.cwd(), 'src/vendor', file), 'utf8');

for (const layout of [
  { label: 'desktop', mobile: false, rows: 'tbody tr', picker: 'tr.picker-row' },
  { label: 'mobile', mobile: true, rows: 'li.sell-row', picker: 'li.picker-item' },
]) {
  describe(`SellPanel quantity picker (${layout.label})`, () => {
    const open = async (world: World = {}) => {
      const ctx = setup({ mobile: layout.mobile, ...world });
      const sell = ctx.w.get(`[aria-label="${ORE_LABEL}"]`);
      await sell.trigger('click');
      return { ...ctx, sell, picker: ctx.w.get(layout.picker) };
    };
    const input = (w: VueWrapper) => w.get('input.qty-input');
    const press = async (w: VueWrapper, label: string) => w.get(`[aria-label="${label}"]`).trigger('click');
    const typeInto = async (w: VueWrapper, text: string) => {
      const el = input(w);
      await el.setValue(text);
      await el.trigger('change');
    };
    const goldFor = (q: bigint) => sellPayout(5n, q, 0, 0n);

    it('opens one picker directly under the stack row instead of selling', async () => {
      const { w, sell, sellItemQuantity, picker } = await open();
      expect(sellItemQuantity).not.toHaveBeenCalled();
      expect(w.findAll(layout.picker)).toHaveLength(1);
      const rows = w.findAll(layout.rows).filter((r) => !r.classes().some((c) => c.indexOf('picker') === 0));
      const oreRow = rows.find((r) => r.find('.item-name').exists() && r.get('.item-name').text() === 'Iron Ore')!;
      expect(oreRow.element.nextElementSibling).toBe(picker.element);
      if (!layout.mobile) {
        const cells = picker.findAll('td');
        expect(cells).toHaveLength(1);
        expect(cells[0].attributes('colspan')).toBe('3');
      }
      expect(sell.attributes('aria-expanded')).toBe('true');
    });

    it('shows the prompt, the labelled stepper group and the decisions, with focus on Keep it', async () => {
      const { w, picker } = await open();
      expect(picker.get('.confirm-prompt').text()).toBe(`Sell 1 of 4 Iron Ore for ${goldFor(1n)} gold?`);
      const group = picker.get('[role="group"]');
      expect(group.attributes('aria-label')).toBe('How many to sell');
      const one = group.get('[aria-label="Set to one"]');
      expect(one.text()).toBe('1');
      const fewer = group.get('[aria-label="One fewer"]');
      expect(fewer.findComponent(PhMinus).exists()).toBe(true);
      const field = group.get('input');
      expect(field.attributes('aria-label')).toBe('Quantity, 1 to 4');
      expect(field.attributes('inputmode')).toBe('numeric');
      expect((field.element as HTMLInputElement).value).toBe('1');
      const more = group.get('[aria-label="One more"]');
      expect(more.findComponent(PhPlus).exists()).toBe(true);
      const all = group.get('[aria-label="Set to all 4"]');
      expect(all.text()).toBe('All');
      const decisions = picker.findAll('button.decision-btn');
      expect(decisions.map((b) => b.text())).toEqual(['Sell 1', 'Keep it']);
      expect(document.activeElement).toBe(decisions[1].element);
      expect(w.findAll('[aria-expanded="false"]')).toHaveLength(0);
    });

    it('steps with One more, All, Set to one and One fewer, and stops at the bounds', async () => {
      const { w, picker } = await open();
      await press(w, 'One more');
      await press(w, 'One more');
      expect((input(w).element as HTMLInputElement).value).toBe('3');
      expect(picker.findAll('button.decision-btn')[0].text()).toBe('Sell 3');
      expect(picker.get('.confirm-prompt').text()).toBe(`Sell 3 of 4 Iron Ore for ${goldFor(3n)} gold?`);
      await press(w, 'Set to all 4');
      expect((input(w).element as HTMLInputElement).value).toBe('4');
      const more = w.get('[aria-label="One more"]');
      expect(more.attributes('aria-disabled')).toBe('true');
      await more.trigger('click');
      expect((input(w).element as HTMLInputElement).value).toBe('4');
      await press(w, 'Set to one');
      expect((input(w).element as HTMLInputElement).value).toBe('1');
      const fewer = w.get('[aria-label="One fewer"]');
      expect(fewer.attributes('aria-disabled')).toBe('true');
      await fewer.trigger('click');
      expect((input(w).element as HTMLInputElement).value).toBe('1');
    });

    it('accepts typed digits, clamps to 1..4 and puts the previous value back for anything else', async () => {
      const { w } = await open();
      await typeInto(w, '3');
      expect((input(w).element as HTMLInputElement).value).toBe('3');
      await typeInto(w, '0');
      expect((input(w).element as HTMLInputElement).value).toBe('1');
      await typeInto(w, '9');
      expect((input(w).element as HTMLInputElement).value).toBe('4');
      await typeInto(w, '3');
      await typeInto(w, 'abc');
      expect((input(w).element as HTMLInputElement).value).toBe('3');
      await typeInto(w, '2.5');
      expect((input(w).element as HTMLInputElement).value).toBe('3');
    });

    it('confirm sends sellItemQuantity once with the picked quantity and is inert while pending', async () => {
      let release: () => void = () => undefined;
      const { w, sellItemQuantity, sellItem, picker } = await open({
        sellItemQuantity: () => new Promise<void>((resolveCall) => (release = resolveCall)),
      });
      await press(w, 'One more');
      await press(w, 'One more');
      const confirm = picker.findAll('button.decision-btn')[0];
      await confirm.trigger('click');
      await confirm.trigger('click');
      expect(sellItemQuantity).toHaveBeenCalledTimes(1);
      expect(sellItemQuantity).toHaveBeenCalledWith({ characterId: 7n, itemInstanceId: 13n, npcId: 2n, quantity: 3n });
      expect(sellItem).not.toHaveBeenCalled();
      release();
      await nextTick();
    });

    it('after a partial sale the picker closes and focus returns to that row Sell button', async () => {
      const { w, items } = await open();
      await press(w, 'One more');
      await w.get('.inline-confirm').findAll('button.decision-btn')[0].trigger('click');
      items.value = items.value.map((row) => (row.id === 13n ? inst(13n, 5n, { quantity: 1n }) : row));
      await vi.waitFor(() => expect(w.find(layout.picker).exists()).toBe(false));
      await vi.waitFor(() =>
        expect(document.activeElement).toBe(w.get('[aria-label="Sell Iron Ore for 5 gold"]').element),
      );
    });

    it('after a whole sale the existing next-row focus rule applies', async () => {
      const { w, items } = await open();
      await press(w, 'Set to all 4');
      await w.get('.inline-confirm').findAll('button.decision-btn')[0].trigger('click');
      items.value = items.value.filter((row) => row.id !== 13n);
      await vi.waitFor(() => expect(w.find(layout.picker).exists()).toBe(false));
      await vi.waitFor(() =>
        expect(document.activeElement).toBe(w.get('[aria-label="Sell Iron Sword for 40 gold"]').element),
      );
    });

    it('keeps the picker open when the call is refused (the promise rejects)', async () => {
      const { w, sellItemQuantity } = await open({ sellItemQuantity: async () => Promise.reject(new Error('no')) });
      await w.get('.inline-confirm').findAll('button.decision-btn')[0].trigger('click');
      await vi.waitFor(() => expect(sellItemQuantity).toHaveBeenCalledTimes(1));
      await nextTick();
      expect(w.find(layout.picker).exists()).toBe(true);
    });

    it('Keep it closes the picker, sends nothing and returns focus to Sell', async () => {
      const { w, sell, sellItemQuantity } = await open();
      await w.get('.inline-confirm').findAll('button.decision-btn')[1].trigger('click');
      await nextTick();
      await nextTick();
      expect(w.find(layout.picker).exists()).toBe(false);
      expect(sellItemQuantity).not.toHaveBeenCalled();
      expect(document.activeElement).toBe(sell.element);
      expect(sell.attributes('aria-expanded')).toBe('false');
    });

    it('Esc closes the picker, sends nothing and returns focus to Sell', async () => {
      const { w, sell, sellItemQuantity } = await open();
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }));
      await nextTick();
      await nextTick();
      expect(w.find(layout.picker).exists()).toBe(false);
      expect(sellItemQuantity).not.toHaveBeenCalled();
      expect(document.activeElement).toBe(sell.element);
    });

    it('opening Sell all junk closes the picker, and opening a picker closes the junk confirmation', async () => {
      const { w } = await open();
      await w.get('button.junk-btn').trigger('click');
      expect(w.find(layout.picker).exists()).toBe(false);
      expect(w.findAll('.inline-confirm')).toHaveLength(1);
      await w.get(`[aria-label="${ORE_LABEL}"]`).trigger('click');
      expect(w.findAll('.inline-confirm')).toHaveLength(1);
      expect(w.find(layout.picker).exists()).toBe(true);
    });

    it('closes when the vendor leaves or the row disappears, and clamps when the stack shrinks', async () => {
      const gone = await open();
      await gone.w.setProps({ vendorNearby: false });
      expect(gone.w.find(layout.picker).exists()).toBe(false);
      gone.w.unmount();
      wrapper = null;

      const removed = await open();
      removed.items.value = removed.items.value.filter((row) => row.id !== 13n);
      await nextTick();
      expect(removed.w.find(layout.picker).exists()).toBe(false);
      removed.w.unmount();
      wrapper = null;

      const shrink = await open();
      await typeInto(shrink.w, '3');
      shrink.items.value = shrink.items.value.map((row) => (row.id === 13n ? inst(13n, 5n, { quantity: 2n }) : row));
      await nextTick();
      expect((input(shrink.w).element as HTMLInputElement).value).toBe('2');
      expect(shrink.w.get('.confirm-prompt').text()).toBe(`Sell 2 of 2 Iron Ore for ${goldFor(2n)} gold?`);
    });

    it('shows a stack name with markup as text only', async () => {
      const ctx = setup({
        mobile: layout.mobile,
        items: [inst(40n, 5n, { quantity: 4n, displayName: XSS })],
      });
      await ctx.w.get('button.sell-btn').trigger('click');
      expect(ctx.w.get('.confirm-prompt').text()).toContain(XSS);
      expect(ctx.w.find('img').exists()).toBe(false);
    });
  });
}

describe('SellQuantity source (Plan 50-27)', () => {
  it('pins the 44px mobile targets and keeps raw HTML, svg and colors out', () => {
    const source = read('SellQuantity.vue');
    expect(source).toMatch(/\.stepper\.mobile \.step-btn\s*\{[^}]*min-height: 44px;/);
    expect(source).toMatch(/\.stepper\.mobile \.step-btn\s*\{[^}]*min-width: 44px;/);
    expect(source).toMatch(/\.stepper\.mobile \.qty-input\s*\{[^}]*min-height: 44px;/);
    expect(source).not.toMatch(/v-html|<svg/);
    expect(source).not.toMatch(/#[0-9a-fA-F]{3,8}\b|rgba?\(/);
  });

  it('marks the stepper mobile on the mobile layout', async () => {
    const ctx = setup({ mobile: true });
    await ctx.w.get(`[aria-label="${ORE_LABEL}"]`).trigger('click');
    expect(ctx.w.get('.stepper').classes()).toContain('mobile');
    wrapper?.unmount();
    wrapper = null;
    const desktop = setup({ mobile: false });
    await desktop.w.get(`[aria-label="${ORE_LABEL}"]`).trigger('click');
    expect(desktop.w.get('.stepper').classes()).not.toContain('mobile');
  });

  it('SellPanel no longer calls the old whole-instance sell reducer', () => {
    const source = read('SellPanel.vue')
      .split(String.fromCharCode(10))
      .filter((line) => !/^\s*(\/\/|\*)/.test(line))
      .join(String.fromCharCode(10));
    expect(source).not.toMatch(/reducers\.sellItem\(/);
    expect(source).toMatch(/reducers\.sellItemQuantity\(/);
  });
});
