// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { computed, nextTick, ref, shallowRef } from 'vue';
import { mount, type VueWrapper } from '@vue/test-utils';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { MAX_INVENTORY_SLOTS } from '@game-data/inventory_rules';
import { SEND_ERROR_TEXT } from '../ledger/actionRunner';
import {
  FRAME_KEY,
  GAME_KEY,
  createInertFrame,
  createInertGame,
} from '../game/context';
import type { FrameControls, GameData } from '../game/context';
import { LEDGER_KEY, createInertLedger } from '../ledger/ledgerContext';
import type { LedgerData, LedgerReducers } from '../ledger/ledgerContext';
import { encodeResultLines } from '@game-data/action_result';
import type { ResultLine } from '@game-data/action_result';
import type { ActionResult, ItemAffix, ItemInstance, ItemTemplate } from '../module_bindings/types';
import EquippedSlots from './EquippedSlots.vue';
import BackpackGrid from './BackpackGrid.vue';
import InventoryActions from './InventoryActions.vue';
import InventoryMeta from './InventoryMeta.vue';
import InventoryScreen from './InventoryScreen.vue';

const XSS = '<img src=x onerror=alert(1)>';
const read = (file: string): string => readFileSync(resolve(process.cwd(), 'src/inventory', file), 'utf8');

let wrapper: VueWrapper | null = null;
afterEach(() => {
  wrapper?.unmount();
  wrapper = null;
  document.body.innerHTML = '';
});

// ---------------------------------------------------------------------------
// fixtures shared by every describe block in this file
// ---------------------------------------------------------------------------

export function tpl(id: bigint, overrides: Record<string, unknown> = {}): ItemTemplate {
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
    strBonus: 0n,
    dexBonus: 0n,
    chaBonus: 0n,
    wisBonus: 0n,
    intBonus: 0n,
    hpBonus: 0n,
    manaBonus: 0n,
    armorClassBonus: 0n,
    magicResistanceBonus: 0n,
    weaponBaseDamage: 0n,
    weaponDps: 0n,
    description: undefined,
    ...overrides,
  } as unknown as ItemTemplate;
}

export function inst(id: bigint, templateId: bigint, overrides: Record<string, unknown> = {}): ItemInstance {
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

export interface World {
  items?: ItemInstance[];
  templates?: ItemTemplate[];
  affixes?: ItemAffix[];
  character?: Record<string, unknown> | null;
  applied?: boolean;
  connected?: boolean;
  isDesktop?: boolean;
  reducers?: Partial<LedgerReducers>;
  /** The hub's own latest action_result row (Plan 50-34). */
  lastResult?: ActionResult | null;
}

export const HERO = {
  id: 7n,
  name: 'Hero',
  level: 5n,
  className: 'Warrior',
  gold: 1284n,
  armorClass: 12n,
  str: 10n,
  dex: 8n,
  int: 6n,
  wis: 7n,
  cha: 9n,
  weaponProficiencies: 'sword',
  armorProficiencies: 'leather',
  vendorSellMod: 0n,
};

export function worldContext(world: World) {
  const connected = ref(world.connected ?? true);
  const items = shallowRef<readonly ItemInstance[]>(world.items ?? []);
  const lastResult = shallowRef<ActionResult | null>(world.lastResult ?? null);
  const reducers = {
    equipItem: async () => undefined,
    unequipItem: async () => undefined,
    useItem: async () => undefined,
    eatFood: async () => undefined,
    salvageItem: async () => undefined,
    learnRecipeScroll: async () => undefined,
    ...world.reducers,
  } as unknown as LedgerReducers;
  const game = {
    ...createInertGame(),
    character: ref(world.character === undefined ? HERO : world.character),
    renownPerks: ref([]),
    connected,
  } as unknown as GameData;
  const ledger = {
    ...createInertLedger(),
    items,
    itemsApplied: ref(world.applied ?? true),
    affixes: ref(world.affixes ?? []),
    templates: ref(new Map((world.templates ?? []).map((t) => [t.id, t]))),
    lastResult,
    outputRecipes: ref(new Map()),
    outputRecipesApplied: ref(true),
    reducers: computed(() => (connected.value ? reducers : null)),
  } as unknown as LedgerData;
  const frame = {
    ...createInertFrame(),
    isDesktop: ref(world.isDesktop ?? true),
    openScreen: vi.fn(),
  } as unknown as FrameControls;
  return {
    items,
    lastResult,
    connected,
    game,
    ledger,
    frame,
    global: {
      provide: { [GAME_KEY as symbol]: game, [LEDGER_KEY as symbol]: ledger, [FRAME_KEY as symbol]: frame },
    },
  };
}

function press(el: Element, key: string): void {
  el.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true }));
}

// ---------------------------------------------------------------------------
// EquippedSlots
// ---------------------------------------------------------------------------

describe('EquippedSlots', () => {
  const TEMPLATES = [
    tpl(1n, { name: 'Old Vest', rarity: 'rare', armorClassBonus: 4n, strBonus: 2n }),
    tpl(2n, { name: 'Iron Cap', slot: 'head', armorType: 'plate', dexBonus: 1n }),
    tpl(3n, { name: 'Plain Ring', slot: 'neck', armorType: '' }),
  ];

  function mountSlots(world: World, props: { selectedId?: bigint | null; compareSlot?: string | null; mobile?: boolean } = {}) {
    const ctx = worldContext({ templates: TEMPLATES, ...world });
    wrapper = mount(EquippedSlots, {
      attachTo: document.body,
      props: { selectedId: null, compareSlot: null, ...props },
      global: ctx.global,
    });
    return ctx;
  }

  it('renders twelve cards in the contract order', () => {
    mountSlots({});
    const labels = wrapper!.findAll('.slot-label').map((l) => l.text());
    expect(labels).toEqual([
      'Head',
      'Neck',
      'Earrings',
      'Cloak',
      'Chest',
      'Wrists',
      'Hands',
      'Belt',
      'Legs',
      'Boots',
      'Main hand',
      'Off hand',
    ]);
    expect(wrapper!.findAll('.slot-card')).toHaveLength(12);
    expect(wrapper!.get('h6').text()).toBe('Equipped');
  });

  it('makes a filled slot a button with its aria label and a static empty slot reading Empty', () => {
    mountSlots({ items: [inst(1n, 1n, { equippedSlot: 'chest' })] });
    const filled = wrapper!.get('button.slot-card');
    expect(filled.attributes('aria-label')).toBe('Chest: Old Vest, rare');
    expect(filled.attributes('aria-pressed')).toBe('false');
    expect(wrapper!.findAll('button.slot-card')).toHaveLength(1);
    const empties = wrapper!.findAll('.slot-card.empty');
    expect(empties).toHaveLength(11);
    expect(empties[0].element.tagName).toBe('DIV');
    expect(empties[0].text()).toContain('Empty');
    expect(empties[0].attributes('tabindex')).toBeUndefined();
  });

  it('presses the slot of the inspected item and emits select with its id', async () => {
    mountSlots({ items: [inst(1n, 1n, { equippedSlot: 'chest' })] }, { selectedId: 1n });
    const filled = wrapper!.get('button.slot-card');
    expect(filled.attributes('aria-pressed')).toBe('true');
    expect(filled.attributes('style')).toContain('inset 0 0 0 2px');
    await filled.trigger('click');
    expect(wrapper!.emitted('select')).toEqual([[1n]]);
  });

  it('marks the comparison-target slot with the accent ring class', () => {
    mountSlots({ items: [inst(1n, 1n, { equippedSlot: 'chest' })] }, { compareSlot: 'chest' });
    const target = wrapper!.findAll('.slot-card').filter((c) => c.classes().includes('compare-target'));
    expect(target).toHaveLength(1);
    expect(target[0].text()).toContain('Chest');
    const source = read('EquippedSlots.vue');
    expect(source).toMatch(/\.slot-card\.compare-target\s*\{\s*box-shadow: inset 0 0 0 1px var\(--color-accent\);/);
    expect(source).toMatch(/\.compare-target \.slot-label\s*\{\s*color: var\(--color-accent-300\);/);
  });

  it('tracks the slot label at the mock 0.06em (Plan 50-32)', () => {
    const source = read('EquippedSlots.vue');
    const label = /\.slot-label \{([^}]*)\}/.exec(source)![1];
    expect(label).toMatch(/letter-spacing: 0\.06em;/);
  });

  it('shows Armor Class from the character and totals for stats with a gear bonus only', () => {
    mountSlots({
      items: [inst(1n, 1n, { equippedSlot: 'chest' }), inst(2n, 2n, { equippedSlot: 'head' })],
    });
    const labels = wrapper!.findAll('.total-label').map((l) => l.text());
    expect(labels).toEqual(['Armor Class', 'Strength', 'Dexterity']);
    const values = wrapper!.findAll('.total-value').map((v) => v.text().replace(/\s+/g, ' '));
    expect(values).toEqual(['12', '12+2', '9+1']);
    expect(wrapper!.find('.no-bonus').exists()).toBe(false);
  });

  it('keeps the stat order Strength, Dexterity, Intelligence, Wisdom, Charisma', () => {
    const rich = tpl(9n, { slot: 'belt', strBonus: 1n, dexBonus: 1n, intBonus: 1n, wisBonus: 1n, chaBonus: 1n });
    mountSlots({ templates: [rich], items: [inst(9n, 9n, { equippedSlot: 'belt' })] });
    expect(wrapper!.findAll('.total-label').map((l) => l.text())).toEqual([
      'Armor Class',
      'Strength',
      'Dexterity',
      'Intelligence',
      'Wisdom',
      'Charisma',
    ]);
  });

  it('says there are no gear bonuses yet with nothing equipped', () => {
    mountSlots({});
    expect(wrapper!.get('.no-bonus').text()).toBe('No gear bonuses yet.');
    expect(wrapper!.findAll('.total-label').map((l) => l.text())).toEqual(['Armor Class']);
  });

  it('includes affix bonuses in the gear totals', () => {
    mountSlots({
      items: [inst(3n, 3n, { equippedSlot: 'neck' })],
      affixes: [
        { id: 1n, itemInstanceId: 3n, affixType: 'prefix', affixKey: 'k', affixName: 'Sage', statKey: 'intBonus', magnitude: 3n } as unknown as ItemAffix,
      ],
    });
    expect(wrapper!.findAll('.total-label').map((l) => l.text())).toEqual(['Armor Class', 'Intelligence']);
    expect(wrapper!.findAll('.total-value')[1].text().replace(/\s+/g, ' ')).toBe('9+3');
  });

  it('carries a 44px minimum on mobile slot cards and renders literally an item named with markup', () => {
    expect(read('EquippedSlots.vue')).toMatch(/\.mobile \.slot-card\s*\{\s*min-height: 44px;/);
    mountSlots({
      items: [inst(1n, 1n, { equippedSlot: 'chest', displayName: XSS })],
    }, { mobile: true });
    expect(wrapper!.find('img').exists()).toBe(false);
    expect(wrapper!.get('button.slot-card .slot-name').text()).toBe(XSS);
    expect(wrapper!.find('h6').text()).toBe('Gear totals');
  });
});

// ---------------------------------------------------------------------------
// BackpackGrid
// ---------------------------------------------------------------------------

describe('BackpackGrid', () => {
  const TEMPLATES = [
    tpl(1n, { name: 'Cap', slot: 'head' }),
    tpl(2n, { name: 'Ore', slot: 'material', armorType: '' }),
    tpl(3n, { name: 'Bread', slot: 'food', armorType: '' }),
    tpl(4n, { name: 'Vest', slot: 'chest' }),
  ];
  const BAG = [inst(1n, 1n), inst(2n, 2n, { quantity: 4n }), inst(3n, 3n), inst(4n, 4n)];

  function mountGrid(world: World, props: Record<string, unknown> = {}) {
    const ctx = worldContext({ templates: TEMPLATES, items: BAG, ...world });
    wrapper = mount(BackpackGrid, {
      attachTo: document.body,
      props: { selectedId: null, filter: 'all', ...props },
      global: ctx.global,
    });
    return ctx;
  }

  const tiles = () => wrapper!.findAll('button.item-tile');

  it('shows the chips All, Gear, Materials, Food in the labelled group', () => {
    mountGrid({});
    const group = wrapper!.get('[role="group"][aria-label="Backpack filter"]');
    expect(group.findAll('button').map((b) => b.text())).toEqual(['All', 'Gear', 'Materials', 'Food']);
    expect(wrapper!.get('h6').text()).toBe('Backpack');
    expect(wrapper!.get('h6').attributes('tabindex')).toBe('-1');
  });

  it('under All shows the sorted tiles then aria-hidden empty tiles up to the cap', () => {
    mountGrid({});
    expect(tiles().map((t) => t.attributes('aria-label'))).toEqual([
      'Cap, common',
      'Vest, common',
      'Ore, common, quantity 4',
      'Bread, common',
    ]);
    const empties = wrapper!.findAll('.empty-tile');
    expect(empties).toHaveLength(MAX_INVENTORY_SLOTS - 4);
    expect(empties[0].attributes('aria-hidden')).toBe('true');
    expect(wrapper!.get('[aria-label="Backpack items"]').attributes('role')).toBe('group');
  });

  it('shows only matching tiles under another filter, with no empty tiles', () => {
    mountGrid({}, { filter: 'materials' });
    expect(tiles().map((t) => t.attributes('aria-label'))).toEqual(['Ore, common, quantity 4']);
    expect(wrapper!.findAll('.empty-tile')).toHaveLength(0);
  });

  it('shows the filter empty line when nothing matches', () => {
    mountGrid({ items: [inst(2n, 2n)] }, { filter: 'gear' });
    expect(wrapper!.get('.filter-empty').text()).toBe('No gear in your backpack.');
    expect(wrapper!.find('[aria-label="Backpack items"]').exists()).toBe(false);
  });

  it('emits update:filter from a chip and select from a tile', async () => {
    mountGrid({});
    await wrapper!.findAll('[aria-label="Backpack filter"] button')[2].trigger('click');
    expect(wrapper!.emitted('update:filter')).toEqual([['materials']]);
    await tiles()[0].trigger('click');
    expect(wrapper!.emitted('select')).toEqual([[1n]]);
  });

  it('is one tab stop with a roving tabindex', async () => {
    mountGrid({});
    expect(tiles().map((t) => t.attributes('tabindex'))).toEqual(['0', '-1', '-1', '-1']);
    await wrapper!.setProps({ selectedId: 2n });
    expect(tiles().map((t) => t.attributes('tabindex'))).toEqual(['-1', '-1', '0', '-1']);
  });

  it('moves focus by one with the left and right arrows', async () => {
    mountGrid({});
    (tiles()[0].element as HTMLElement).focus();
    press(tiles()[0].element, 'ArrowRight');
    await nextTick();
    await nextTick();
    expect(document.activeElement).toBe(tiles()[1].element);
    press(tiles()[1].element, 'ArrowLeft');
    await nextTick();
    await nextTick();
    expect(document.activeElement).toBe(tiles()[0].element);
    expect(tiles().map((t) => t.attributes('tabindex'))).toEqual(['0', '-1', '-1', '-1']);
  });

  it('moves by the column count with up and down, 6 on desktop and 5 on mobile', async () => {
    const many = Array.from({ length: 14 }, (_, i) => inst(BigInt(i + 1), 1n));
    mountGrid({ items: many });
    (tiles()[0].element as HTMLElement).focus();
    press(tiles()[0].element, 'ArrowDown');
    await nextTick();
    await nextTick();
    expect(document.activeElement).toBe(tiles()[6].element);
    press(tiles()[6].element, 'ArrowUp');
    await nextTick();
    await nextTick();
    expect(document.activeElement).toBe(tiles()[0].element);
    wrapper!.unmount();
    mountGrid({ items: many }, { mobile: true });
    (tiles()[0].element as HTMLElement).focus();
    press(tiles()[0].element, 'ArrowDown');
    await nextTick();
    await nextTick();
    expect(document.activeElement).toBe(tiles()[5].element);
    expect(wrapper!.get('[aria-label="Backpack items"]').classes()).toContain('mobile');
    expect(read('BackpackGrid.vue')).toMatch(/repeat\(5, minmax\(44px, 66px\)\)/);
  });

  it('jumps with Home and End and ignores other keys', async () => {
    mountGrid({});
    (tiles()[1].element as HTMLElement).focus();
    press(tiles()[1].element, 'End');
    await nextTick();
    await nextTick();
    expect(document.activeElement).toBe(tiles()[3].element);
    press(tiles()[3].element, 'Home');
    await nextTick();
    await nextTick();
    expect(document.activeElement).toBe(tiles()[0].element);
    const other = new KeyboardEvent('keydown', { key: 'a', bubbles: true, cancelable: true });
    tiles()[0].element.dispatchEvent(other);
    expect(other.defaultPrevented).toBe(false);
  });

  it('shows the empty state for an empty bag', () => {
    mountGrid({ items: [inst(9n, 1n, { equippedSlot: 'head' })] });
    expect(wrapper!.text()).toContain('Your backpack is empty.');
    expect(wrapper!.text()).toContain('Items you pick up, buy or craft land here.');
    expect(wrapper!.find('[aria-label="Backpack items"]').exists()).toBe(false);
  });

  it('exposes focusFirst that focuses the first tile, else the heading', async () => {
    mountGrid({});
    const vm = wrapper!.vm as unknown as { focusFirst(): boolean };
    expect(vm.focusFirst()).toBe(true);
    expect(document.activeElement).toBe(tiles()[0].element);
    wrapper!.unmount();
    mountGrid({ items: [] });
    const empty = wrapper!.vm as unknown as { focusFirst(): boolean };
    expect(empty.focusFirst()).toBe(false);
    expect(document.activeElement).toBe(wrapper!.get('h6').element);
  });

  it('disables the chips offline and renders an item named with markup literally', async () => {
    mountGrid({ connected: false, items: [inst(1n, 1n, { displayName: XSS })] });
    expect(wrapper!.findAll('[aria-label="Backpack filter"] button').every((b) => b.attributes('aria-disabled') === 'true')).toBe(true);
    expect(wrapper!.find('img').exists()).toBe(false);
    expect(tiles()[0].attributes('aria-label')).toContain(XSS);
  });
});

// ---------------------------------------------------------------------------
// InventoryMeta
// ---------------------------------------------------------------------------

describe('InventoryMeta', () => {
  function mountMeta(world: World) {
    const ctx = worldContext({ templates: [tpl(1n)], ...world });
    wrapper = mount(InventoryMeta, { global: ctx.global });
    return ctx;
  }

  it('shows the slot count on desktop and has no gold (the gold is in the header actions, Plan 50-39)', () => {
    mountMeta({ items: [inst(1n, 1n), inst(2n, 1n), inst(3n, 1n, { equippedSlot: 'chest' })] });
    expect(wrapper!.get('.slots').text()).toBe(`2 / ${MAX_INVENTORY_SLOTS} slots`);
    expect(wrapper!.find('.gold').exists()).toBe(false);
    expect(wrapper!.get('.slots').classes()).not.toContain('full');
  });

  it('shows the short form on mobile', () => {
    mountMeta({ items: [inst(1n, 1n)], isDesktop: false });
    expect(wrapper!.get('.slots').text()).toBe(`1 / ${MAX_INVENTORY_SLOTS}`);
  });

  it('says Full in the orange token at the cap', () => {
    const full = Array.from({ length: MAX_INVENTORY_SLOTS }, (_, i) => inst(BigInt(i + 1), 1n));
    mountMeta({ items: full });
    expect(wrapper!.get('.slots').text()).toBe(`${MAX_INVENTORY_SLOTS} / ${MAX_INVENTORY_SLOTS} slots · Full`);
    expect(wrapper!.get('.slots').classes()).toContain('full');
    expect(read('InventoryMeta.vue')).toMatch(/\.slots\.full\s*\{\s*color: var\(--color-con-orange\);/);
  });

  it('renders nothing before the items apply or without a character', () => {
    mountMeta({ applied: false });
    expect(wrapper!.find('.inventory-meta').exists()).toBe(false);
    wrapper!.unmount();
    mountMeta({ character: null });
    expect(wrapper!.find('.inventory-meta').exists()).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// InventoryActions (Plan 50-39: the header gold and Organize, mock 10a)
// ---------------------------------------------------------------------------

describe('Inventory header actions (Plan 50-39)', () => {
  function mountActions(
    world: World,
    consolidate: (...args: never[]) => Promise<void> = vi.fn().mockResolvedValue(undefined),
  ) {
    const ctx = worldContext({
      templates: [tpl(1n)],
      items: [inst(1n, 1n)],
      reducers: { consolidateStacks: consolidate } as Partial<LedgerReducers>,
      ...world,
    });
    wrapper = mount(InventoryActions, { attachTo: document.body, global: ctx.global });
    return { ctx, consolidate };
  }

  it('renders nothing before the items apply or without a character', () => {
    mountActions({ applied: false });
    expect(wrapper!.find('.inventory-actions').exists()).toBe(false);
    wrapper!.unmount();
    mountActions({ character: null });
    expect(wrapper!.find('.inventory-actions').exists()).toBe(false);
  });

  it('shows the gold once, then Organize with the sort icon, on desktop', () => {
    mountActions({});
    expect(wrapper!.findAll('.gold')).toHaveLength(1);
    expect(wrapper!.get('.gold').attributes('aria-label')).toBe('1284 gold');
    const button = wrapper!.get('button.organize');
    expect(button.text()).toBe('Organize');
    expect(button.attributes('aria-label')).toBeUndefined();
    expect(button.find('svg').attributes('aria-hidden')).toBe('true');
    const kids = Array.from(wrapper!.get('.inventory-actions').element.children);
    expect(kids[0].className).toContain('gold');
    expect(kids[kids.length - 1]).toBe(button.element);
  });

  it('calls consolidateStacks once, and a second click while pending sends nothing', async () => {
    let release: () => void = () => undefined;
    const consolidate = vi.fn(() => new Promise<void>((resolve) => (release = resolve)));
    mountActions({}, consolidate);
    const button = wrapper!.get('button.organize');
    expect(button.attributes('aria-disabled')).toBeUndefined();
    await button.trigger('click');
    expect(consolidate).toHaveBeenCalledTimes(1);
    expect(consolidate).toHaveBeenCalledWith({ characterId: 7n });
    expect(button.attributes('aria-disabled')).toBe('true');
    expect(button.attributes('aria-busy')).toBe('true');
    await button.trigger('click');
    expect(consolidate).toHaveBeenCalledTimes(1);
    release();
    await new Promise((resolve) => setTimeout(resolve, 0));
    await nextTick();
    expect(button.attributes('aria-disabled')).toBeUndefined();
    expect(button.attributes('aria-busy')).toBeUndefined();
  });

  it('is inert offline, and sends nothing', async () => {
    const { consolidate } = mountActions({ connected: false });
    const button = wrapper!.get('button.organize');
    expect(button.attributes('aria-disabled')).toBe('true');
    await button.trigger('click');
    expect(consolidate).not.toHaveBeenCalled();
  });

  it('is icon-only on mobile, named Organize backpack, with 44px targets pinned in the source', () => {
    mountActions({ isDesktop: false });
    const button = wrapper!.get('button.organize');
    expect(button.classes()).toContain('mobile');
    expect(button.attributes('aria-label')).toBe('Organize backpack');
    expect(button.attributes('title')).toBe('Organize');
    expect(button.text()).toBe('');
    expect(button.find('svg').exists()).toBe(true);
    const source = read('InventoryActions.vue');
    expect(source).toMatch(/\.organize\.mobile\s*\{[^}]*min-width: 44px;[^}]*min-height: 44px;/);
    expect(source).toMatch(/\.organize\s*\{\s*padding: 4px 8px;/);
  });

  it("shows a rejection in the Inventory screen's notice line, like every other bag action", async () => {
    const consolidate = vi.fn().mockRejectedValue(new Error('no'));
    const ctx = worldContext({
      templates: SCREEN_TEMPLATES,
      items: screenItems(),
      reducers: { consolidateStacks: consolidate } as Partial<LedgerReducers>,
    });
    wrapper = mount(InventoryScreen, { attachTo: document.body, global: ctx.global });
    const header = mount(InventoryActions, { attachTo: document.body, global: ctx.global });
    await nextTick();
    expect(wrapper.find('.notice-line').exists()).toBe(false);
    await header.get('button.organize').trigger('click');
    await new Promise((resolve) => setTimeout(resolve, 0));
    await nextTick();
    header.unmount();
    expect(consolidate).toHaveBeenCalledTimes(1);
    expect(wrapper.get('.notice-line').text()).toBe(SEND_ERROR_TEXT);
  });

  it("shows the server's Organize line in the screen's notice line as text", async () => {
    const ctx = worldContext({ templates: SCREEN_TEMPLATES, items: screenItems() });
    wrapper = mount(InventoryScreen, { attachTo: document.body, global: ctx.global });
    await nextTick();
    ctx.game.feed.setCharacter(7n);
    ctx.game.feed.ingest('private', {
      id: 1n,
      kind: 'system',
      message: 'Inventory organized: 2 stack(s) consolidated.',
      createdAt: { microsSinceUnixEpoch: 10n },
      characterId: 7n,
    } as never);
    ctx.game.feed.flush();
    await nextTick();
    await nextTick();
    expect(wrapper.get('.notice-line').text()).toBe('Inventory organized: 2 stack(s) consolidated.');
  });

  it('has no inline svg and no raw html in the source', () => {
    const source = read('InventoryActions.vue');
    expect(source).not.toContain('<svg');
    expect(source).not.toContain('v-html');
  });
});

// ---------------------------------------------------------------------------
// InventoryScreen (desktop drawer and 390x844 sheet)
// ---------------------------------------------------------------------------

const SCREEN_TEMPLATES = [
  tpl(1n, { name: 'Old Vest', slot: 'chest', rarity: 'rare', armorClassBonus: 4n }),
  tpl(2n, { name: 'New Vest', slot: 'chest', armorClassBonus: 6n }),
  tpl(3n, { name: 'Ore', slot: 'material', armorType: '' }),
  tpl(4n, { name: 'Simple Rations', slot: 'food', armorType: '' }),
];

function screenItems(): ItemInstance[] {
  return [
    inst(1n, 1n, { equippedSlot: 'chest' }),
    inst(2n, 2n),
    inst(3n, 3n, { quantity: 4n }),
    inst(4n, 4n),
  ];
}

async function mountScreen(world: World = {}) {
  const ctx = worldContext({ templates: SCREEN_TEMPLATES, items: screenItems(), ...world });
  wrapper = mount(InventoryScreen, { attachTo: document.body, global: ctx.global });
  await nextTick();
  return ctx;
}

const tile = (label: string) => wrapper!.find(`button.item-tile[aria-label^="${label}"]`);
const settle = async () => {
  await nextTick();
  await nextTick();
};

describe('InventoryScreen desktop', () => {
  it('renders Equipped, Backpack and Inspector as separate regions in that DOM order', async () => {
    await mountScreen();
    const regions = Array.from(wrapper!.get('.desk-grid').element.children).map((el) =>
      el.className.split(' ').slice(0, 2).join(' '),
    );
    expect(regions).toEqual(['col equipped-col', 'col backpack-col', 'col inspector-col']);
    expect(wrapper!.get('.equipped-col').text()).toContain('Gear totals');
    expect(wrapper!.get('.backpack-col h6').text()).toBe('Backpack');
    expect(wrapper!.get('.inspector-col').text()).toBe('Select an item to see its details.');
  });

  it('gives each column its own scroll region, a sticky inspector and the 300 / fluid / 260 grid', () => {
    const source = read('InventoryScreen.vue');
    expect(source).toMatch(/grid-template-columns: 300px minmax\(0, 1fr\) 260px;/);
    expect(source).toMatch(/\.col\s*\{\s*min-height: 0;\s*overflow-y: auto;/);
    expect(source).toMatch(/\.inspector-col\s*\{[^}]*position: sticky;[^}]*top: 0;/);
    expect(source).toMatch(
      /\.inventory-screen\s*\{\s*height: 100%;\s*min-height: 0;\s*display: flex;\s*flex-direction: column;/,
    );
    expect(source).toMatch(/@media \(min-width: 1200px\)/);
  });

  // Plan 50-39: the backpack column draws every one of the 50 slots.
  it('draws 3 item tiles and 47 empty cells in the backpack column', async () => {
    await mountScreen();
    const column = wrapper!.get('.backpack-col');
    expect(column.findAll('button.item-tile')).toHaveLength(3);
    expect(column.findAll('.empty-tile')).toHaveLength(MAX_INVENTORY_SLOTS - 3);
    expect(column.get('[aria-label="Backpack items"]').element.children).toHaveLength(MAX_INVENTORY_SLOTS);
  });

  it('has nothing selected on open', async () => {
    await mountScreen();
    expect(wrapper!.findAll('button.item-tile[aria-pressed="true"], button.slot-card[aria-pressed="true"]')).toHaveLength(0);
    const children = Array.from(wrapper!.get('.inventory-screen').element.children);
    expect(children[0].className).toContain('desk-grid');
  });

  it('selects a tile, shows it in the inspector, and deselects on a second click', async () => {
    await mountScreen();
    await tile('New Vest').trigger('click');
    expect(tile('New Vest').attributes('aria-pressed')).toBe('true');
    expect(wrapper!.get('.inspector-col .name').text()).toBe('New Vest');
    await tile('New Vest').trigger('click');
    expect(tile('New Vest').attributes('aria-pressed')).toBe('false');
    expect(wrapper!.get('.inspector-col').text()).toBe('Select an item to see its details.');
  });

  it('inspects the equipped item when its slot is chosen', async () => {
    await mountScreen();
    await wrapper!.get('button.slot-card').trigger('click');
    expect(wrapper!.get('.inspector-col .name').text()).toBe('Old Vest');
    expect(wrapper!.get('.inspector-col .action.primary').text()).toBe('Unequip');
    expect(wrapper!.get('button.slot-card').attributes('aria-pressed')).toBe('true');
  });

  it('marks the equip slot of a selected bag gear item as the comparison target', async () => {
    await mountScreen();
    expect(wrapper!.findAll('.compare-target')).toHaveLength(0);
    await tile('New Vest').trigger('click');
    const targets = wrapper!.findAll('.compare-target');
    expect(targets).toHaveLength(1);
    expect(targets[0].text()).toContain('Chest');
    await tile('Ore').trigger('click');
    expect(wrapper!.findAll('.compare-target')).toHaveLength(0);
  });

  it('clears the selection when the instance leaves and focuses the first tile', async () => {
    const ctx = await mountScreen();
    await tile('Ore').trigger('click');
    (tile('Ore').element as HTMLElement).focus();
    ctx.items.value = ctx.items.value.filter((row) => row.id !== 3n);
    await settle();
    await settle();
    expect(wrapper!.get('.inspector-col').text()).toBe('Select an item to see its details.');
    const first = wrapper!.get('button.item-tile');
    expect(document.activeElement).toBe(first.element);
  });

  it('focuses the Backpack heading when no tile is left', async () => {
    const ctx = await mountScreen({ items: [inst(3n, 3n)] });
    await tile('Ore').trigger('click');
    (tile('Ore').element as HTMLElement).focus();
    ctx.items.value = [];
    await settle();
    await settle();
    expect(document.activeElement).toBe(wrapper!.get('.backpack-col h6').element);
    expect(document.activeElement).not.toBe(document.body);
  });

  it('keeps the same instance selected after Equip and focus on the primary button', async () => {
    const ctx = await mountScreen({ items: [inst(2n, 2n)] });
    await tile('New Vest').trigger('click');
    const primary = wrapper!.get('.inspector-col .action.primary');
    expect(primary.text()).toBe('Equip');
    (primary.element as HTMLElement).focus();
    ctx.items.value = [inst(2n, 2n, { equippedSlot: 'chest' })];
    await settle();
    const after = wrapper!.get('.inspector-col .action.primary');
    expect(after.text()).toBe('Unequip');
    expect(wrapper!.get('.inspector-col .name').text()).toBe('New Vest');
    expect(document.activeElement).toBe(after.element);
    expect(wrapper!.get('button.slot-card').attributes('aria-pressed')).toBe('true');
  });

  it('shows Your backpack is empty. without a character and for an empty bag', async () => {
    await mountScreen({ character: null });
    expect(wrapper!.text()).toContain('Your backpack is empty.');
    expect(wrapper!.find('.desk-grid').exists()).toBe(false);
    wrapper!.unmount();
    await mountScreen({ items: [] });
    expect(wrapper!.text()).toContain('Your backpack is empty.');
  });

  it('renders nothing before the items subscription applies', async () => {
    await mountScreen({ applied: false });
    expect(wrapper!.find('.desk-grid').exists()).toBe(false);
    expect(wrapper!.text()).toBe('');
  });

  it('goes offline with game.connected, and a rejected call reaches the notice line', async () => {
    const equipItem = vi.fn().mockRejectedValue(new Error('no'));
    const ctx = await mountScreen({ reducers: { equipItem } });
    await tile('New Vest').trigger('click');
    await wrapper!.get('.inspector-col .action.primary').trigger('click');
    await new Promise((r) => setTimeout(r, 0));
    await nextTick();
    expect(equipItem).toHaveBeenCalledWith({ characterId: 7n, itemInstanceId: 2n });
    expect(wrapper!.get('[role="status"]').text()).toBe("Couldn't send that. Try again.");
    ctx.connected.value = false;
    await nextTick();
    expect(wrapper!.get('.inspector-col .action.primary').attributes('aria-disabled')).toBe('true');
    await wrapper!.get('.inspector-col .action.primary').trigger('click');
    expect(equipItem).toHaveBeenCalledTimes(1);
  });

  it('renders an item named with markup literally across the whole screen', async () => {
    await mountScreen({
      items: [inst(1n, 1n, { equippedSlot: 'chest', displayName: XSS }), inst(2n, 2n, { displayName: XSS })],
    });
    await wrapper!.get('button.item-tile').trigger('click');
    expect(wrapper!.find('img').exists()).toBe(false);
    expect(wrapper!.get('.inspector-col .name').text()).toBe(XSS);
  });
});

describe('InventoryScreen mobile 390x844', () => {
  it('shows the Backpack and Equipped tabs with chips and a 5-column grid without tile names', async () => {
    await mountScreen({ isDesktop: false });
    const tablist = wrapper!.get('[role="tablist"]');
    expect(tablist.attributes('aria-label')).toBe('Inventory view');
    expect(wrapper!.findAll('[role="tab"]').map((t) => t.text())).toEqual(['Backpack', 'Equipped']);
    expect(wrapper!.findAll('[role="tab"]')[0].attributes('aria-selected')).toBe('true');
    expect(wrapper!.find('[aria-label="Backpack filter"]').exists()).toBe(true);
    expect(wrapper!.get('[aria-label="Backpack items"]').classes()).toContain('mobile');
    expect(wrapper!.find('.item-tile .name').exists()).toBe(false);
    expect(wrapper!.find('.desk-grid').exists()).toBe(false);
    // Plan 50-39: the mobile grid keeps its fixed 5 columns, with no measured column count.
    expect(wrapper!.get('[aria-label="Backpack items"]').attributes('style') ?? '').not.toContain('--bag-columns');
  });

  it('shows the slot grid and Gear totals on the Equipped tab', async () => {
    await mountScreen({ isDesktop: false });
    await wrapper!.findAll('[role="tab"]')[1].trigger('click');
    expect(wrapper!.findAll('.slot-card')).toHaveLength(12);
    expect(wrapper!.text()).toContain('Gear totals');
    expect(wrapper!.find('[aria-label="Backpack filter"]').exists()).toBe(false);
  });

  it('opens the dock on selection and returns focus to the tile when it is closed', async () => {
    await mountScreen({ isDesktop: false });
    expect(wrapper!.find('.dock-slot').exists()).toBe(false);
    await tile('New Vest').trigger('click');
    expect(wrapper!.find('.dock').exists()).toBe(true);
    expect(wrapper!.get('.dock-name').text()).toBe('New Vest');
    await wrapper!.get('.dock-close').trigger('click');
    await settle();
    expect(wrapper!.find('.dock').exists()).toBe(false);
    expect(document.activeElement).toBe(tile('New Vest').element);
  });

  it('opens the dock for a selected slot and returns focus to the slot card', async () => {
    await mountScreen({ isDesktop: false });
    await wrapper!.findAll('[role="tab"]')[1].trigger('click');
    await wrapper!.get('button.slot-card').trigger('click');
    expect(wrapper!.get('.dock-name').text()).toBe('Old Vest');
    await wrapper!.get('.dock-close').trigger('click');
    await settle();
    expect(document.activeElement).toBe(wrapper!.get('button.slot-card').element);
  });

  it('closes the dock when the selected item disappears', async () => {
    const ctx = await mountScreen({ isDesktop: false });
    await tile('Ore').trigger('click');
    expect(wrapper!.find('.dock').exists()).toBe(true);
    ctx.items.value = ctx.items.value.filter((row) => row.id !== 3n);
    await settle();
    await settle();
    expect(wrapper!.find('.dock').exists()).toBe(false);
    expect(document.activeElement).not.toBe(document.body);
  });

  it('shows the empty state for an empty bag and nothing before the items apply', async () => {
    await mountScreen({ isDesktop: false, items: [] });
    expect(wrapper!.text()).toContain('Your backpack is empty.');
    wrapper!.unmount();
    await mountScreen({ isDesktop: false, applied: false });
    expect(wrapper!.text()).toBe('');
  });

  it('carries min-height 44px for the tabs, the dock buttons, the slot cards and the dock close', () => {
    expect(readFileSync(resolve(process.cwd(), 'src/ledger/SegTabs.vue'), 'utf8')).toMatch(
      /\.seg-opt\s*\{[^}]*min-height: 44px;/,
    );
    expect(read('Inspector.vue')).toMatch(/\.actions\.mobile \.action\s*\{\s*min-height: 44px;/);
    expect(read('Inspector.vue')).toMatch(/\.dock-close\s*\{[^}]*min-height: 44px;/);
    expect(read('EquippedSlots.vue')).toMatch(/\.mobile \.slot-card\s*\{\s*min-height: 44px;/);
  });

  it('shows the result of an action in the notice line', async () => {
    const equipItem = vi.fn().mockRejectedValue(new Error('no'));
    await mountScreen({ isDesktop: false, reducers: { equipItem } });
    await tile('New Vest').trigger('click');
    await wrapper!.get('.dock .action.primary').trigger('click');
    await new Promise((r) => setTimeout(r, 0));
    await nextTick();
    expect(wrapper!.get('[role="status"]').text()).toBe("Couldn't send that. Try again.");
  });
});

// ---------------------------------------------------------------------------
// Salvage result card (Plan 50-34)
// ---------------------------------------------------------------------------

describe('Salvage result card (Plan 50-34)', () => {
  const RARE_ID = 10n;
  const COMMON_ID = 11n;
  const SCROLL_ID = 20n;
  const CARD_TEMPLATES = [
    tpl(10n, { name: 'Gilded Vest', slot: 'chest', rarity: 'rare', armorClassBonus: 4n }),
    tpl(11n, { name: 'Plain Vest', slot: 'chest', armorClassBonus: 1n }),
    tpl(3n, { name: 'Ore', slot: 'material', armorType: '' }),
    tpl(30n, { name: 'Rough Hide', slot: 'material', armorType: '' }),
    tpl(31n, { name: 'Ancient Rune', slot: 'material', armorType: '', rarity: 'rare' }),
    tpl(32n, { name: 'Scroll: Rope', slot: 'misc', armorType: '' }),
  ];

  function cardItems(extra: ItemInstance[] = []): ItemInstance[] {
    return [inst(RARE_ID, 10n), inst(COMMON_ID, 11n), inst(3n, 3n, { quantity: 4n }), ...extra];
  }

  function salvageRow(seq: bigint, over: Record<string, unknown> = {}, scroll = false): ActionResult {
    const lines: ResultLine[] = [
      { kind: 'received', templateId: 30n, name: 'Rough Hide', quantity: 2n, total: 6n, instanceId: null },
      { kind: 'bonus', templateId: 31n, name: 'Ancient Rune', quantity: 1n, total: 1n, instanceId: null },
    ];
    if (scroll) {
      lines.push({ kind: 'scroll', templateId: 32n, name: 'Scroll: Rope', quantity: 1n, total: 1n, instanceId: SCROLL_ID });
    }
    return {
      characterId: 7n,
      seq,
      kind: 'salvage',
      templateId: 10n,
      itemInstanceId: undefined,
      itemName: 'Gilded Vest',
      rarity: 'rare',
      craftQuality: undefined,
      quantity: 1n,
      recipeTemplateId: undefined,
      craftCount: 0n,
      linesJson: encodeResultLines(lines),
      at: {},
      ...over,
    } as unknown as ActionResult;
  }

  interface CardOptions {
    isDesktop?: boolean;
    scroll?: boolean;
    removeId?: bigint;
    outcome?: 'row' | 'reject' | 'silent';
    preset?: ActionResult | null;
    rowOver?: Record<string, unknown>;
    items?: ItemInstance[];
    learn?: ReturnType<typeof vi.fn>;
  }

  // The fake server: a salvage drops the instance from the bag and writes the next result row.
  async function mountCard(opts: CardOptions = {}) {
    const holder: { ctx?: ReturnType<typeof worldContext>; seq: bigint } = { seq: 0n };
    const salvageItem = vi.fn().mockImplementation(async (args: { itemInstanceId: bigint }) => {
      const outcome = opts.outcome ?? 'row';
      if (outcome === 'reject') throw new Error('no');
      if (outcome === 'silent') return;
      const ctx = holder.ctx!;
      ctx.items.value = ctx.items.value.filter((row) => row.id !== (opts.removeId ?? args.itemInstanceId));
      holder.seq += 1n;
      ctx.lastResult.value = salvageRow(holder.seq, opts.rowOver ?? {}, opts.scroll ?? false);
    });
    const learnRecipeScroll = opts.learn ?? vi.fn().mockResolvedValue(undefined);
    const items = opts.items ?? cardItems(opts.scroll ? [inst(SCROLL_ID, 32n)] : []);
    const ctx = worldContext({
      templates: CARD_TEMPLATES,
      items,
      isDesktop: opts.isDesktop ?? true,
      lastResult: opts.preset ?? null,
      reducers: { salvageItem, learnRecipeScroll } as unknown as Partial<LedgerReducers>,
    });
    holder.ctx = ctx;
    holder.seq = opts.preset ? opts.preset.seq : 0n;
    wrapper = mount(InventoryScreen, { attachTo: document.body, global: ctx.global });
    await nextTick();
    return { ...ctx, salvageItem, learnRecipeScroll };
  }

  const dialog = () => wrapper!.find('[role="dialog"]');
  const cardButton = (label: string) =>
    wrapper!.findAll('[role="dialog"] button').find((b) => b.text() === label);
  const salvageBtn = (variantClass: string) => wrapper!.get(`${variantClass} .action.salvage`);
  const flush = async () => {
    await new Promise((r) => setTimeout(r, 0));
    await nextTick();
    await nextTick();
  };

  async function salvageRare(host = '.inspector-col') {
    await tile('Gilded Vest').trigger('click');
    await salvageBtn(host).trigger('click');
    await wrapper!.findAll('.inline-confirm button')[0].trigger('click');
    await flush();
  }

  it('opens the shared card with exactly what the server reported', async () => {
    await mountCard();
    expect(dialog().exists()).toBe(false);
    await salvageRare();
    const card = wrapper!.get('[role="dialog"]');
    expect(card.attributes('aria-modal')).toBe('true');
    expect(card.get('.kicker').text()).toBe('Salvaged');
    expect(card.get('h4').text()).toBe('Gilded Vest');
    expect(card.get('h6').text()).toBe('Received');
    const rows = card.findAll('.result-row');
    expect(rows).toHaveLength(2);
    expect(rows[0].text()).toContain('Rough Hide');
    expect(rows[0].get('.qty').text()).toBe('+2');
    expect(rows[0].get('.total').text()).toBe('now 6');
    expect(rows[0].find('.row-tag').exists()).toBe(false);
    expect(rows[1].get('.qty').text()).toBe('+1');
    expect(rows[1].get('.row-tag').text()).toBe('Bonus');
    expect(card.text()).not.toContain('Recipe found');
    expect(card.get('.footer').text()).toBe('Materials went to your backpack. Also written to your log.');
    expect(document.activeElement).toBe(cardButton('Done')!.element);
    expect(wrapper!.get('.sr-only[role="status"][aria-live="polite"]').text()).toBe(
      'Salvaged Gilded Vest. Received 2 Rough Hide, 1 Ancient Rune.',
    );
  });

  it('offers Open crafting on desktop, only Read scroll when a scroll was granted', async () => {
    await mountCard();
    await salvageRare();
    expect(cardButton('Open crafting')).toBeDefined();
    expect(cardButton('Read scroll')).toBeUndefined();
    wrapper!.unmount();

    await mountCard({ scroll: true });
    await salvageRare();
    expect(cardButton('Open crafting')).toBeDefined();
    expect(cardButton('Read scroll')).toBeDefined();
    expect(wrapper!.get('[role="dialog"]').text()).toContain('Recipe found');
  });

  it('does not offer Read scroll when the scroll row is no longer in the bag', async () => {
    await mountCard({ scroll: true, items: cardItems() });
    await salvageRare();
    expect(dialog().exists()).toBe(true);
    expect(cardButton('Read scroll')).toBeUndefined();
  });

  it('Open crafting closes the card and opens the Crafting screen', async () => {
    const ctx = await mountCard();
    await salvageRare();
    await cardButton('Open crafting')!.trigger('click');
    await flush();
    expect(dialog().exists()).toBe(false);
    expect(ctx.frame.openScreen).toHaveBeenCalledTimes(1);
    expect(ctx.frame.openScreen).toHaveBeenCalledWith('craft');
  });

  it('Read scroll calls learnRecipeScroll once on that scroll, then closes the card', async () => {
    const ctx = await mountCard({ scroll: true });
    await salvageRare();
    await cardButton('Read scroll')!.trigger('click');
    await flush();
    expect(ctx.learnRecipeScroll).toHaveBeenCalledTimes(1);
    expect(ctx.learnRecipeScroll).toHaveBeenCalledWith({ characterId: 7n, itemInstanceId: SCROLL_ID });
    expect(dialog().exists()).toBe(false);
  });

  it('ignores a second Read scroll click while the first is pending', async () => {
    let release: () => void = () => undefined;
    const learn = vi.fn().mockImplementation(() => new Promise<void>((done) => { release = done; }));
    await mountCard({ scroll: true, learn });
    await salvageRare();
    await cardButton('Read scroll')!.trigger('click');
    await nextTick();
    await cardButton('Read scroll')!.trigger('click');
    expect(learn).toHaveBeenCalledTimes(1);
    expect(cardButton('Read scroll')!.attributes('aria-disabled')).toBe('true');
    release();
    await flush();
    expect(dialog().exists()).toBe(false);
  });

  // WR-06 (iteration 3): offline, Read scroll is aria-disabled with a visible reason and sends nothing;
  // Open crafting is navigation and stays live.
  it('offline: Read scroll is aria-disabled with the reason and sends nothing; Open crafting stays live', async () => {
    const ctx = await mountCard({ scroll: true });
    await salvageRare();
    ctx.connected.value = false;
    await flush();
    const read = cardButton('Read scroll')!;
    expect(read.attributes('aria-disabled')).toBe('true');
    const reasonId = read.attributes('aria-describedby');
    expect(reasonId).toBeTruthy();
    expect(wrapper!.get(`#${reasonId}`).text()).toBe("You're offline. Try again once you're reconnected.");
    await read.trigger('click');
    await flush();
    expect(ctx.learnRecipeScroll).not.toHaveBeenCalled();
    expect(dialog().exists()).toBe(true);
    const open = cardButton('Open crafting')!;
    expect(open.attributes('aria-disabled')).toBeUndefined();
    expect(open.attributes('aria-describedby')).toBeUndefined();
    ctx.connected.value = true;
    await flush();
    expect(cardButton('Read scroll')!.attributes('aria-disabled')).toBeUndefined();
    expect(wrapper!.find('[role="dialog"] .reason').exists()).toBe(false);
  });

  it('closes on Done and returns focus to the first backpack tile', async () => {
    await mountCard();
    await salvageRare();
    await cardButton('Done')!.trigger('click');
    await flush();
    expect(dialog().exists()).toBe(false);
    expect(document.activeElement).toBe(wrapper!.get('button.item-tile').element);
  });

  it('closes on a scrim click', async () => {
    await mountCard();
    await salvageRare();
    await wrapper!.get('.result-scrim').trigger('pointerdown');
    await wrapper!.get('.result-scrim').trigger('click');
    await flush();
    expect(dialog().exists()).toBe(false);
  });

  it('closes on Esc without closing the drawer', async () => {
    await mountCard();
    await salvageRare();
    const drawer = vi.fn();
    // The frame's own Escape handler runs in the bubble phase and honors defaultPrevented.
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !event.defaultPrevented) drawer();
    };
    document.addEventListener('keydown', onKey);
    const event = new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true });
    document.body.dispatchEvent(event);
    await flush();
    document.removeEventListener('keydown', onKey);
    expect(event.defaultPrevented).toBe(true);
    expect(drawer).not.toHaveBeenCalled();
    expect(dialog().exists()).toBe(false);
  });

  it('does not let the inventory focus-after-removal rule move focus while the card is open', async () => {
    const ctx = await mountCard();
    await salvageRare();
    const done = cardButton('Done')!.element;
    expect(document.activeElement).toBe(done);
    await tile('Ore').trigger('click');
    // Focus is lost (as when the focused element is removed): the rule would move it to a tile.
    (done as HTMLElement).blur();
    ctx.items.value = ctx.items.value.filter((row) => row.id !== 3n);
    await flush();
    expect(wrapper!.get('.inspector-col').text()).toBe('Select an item to see its details.');
    expect(document.activeElement).not.toBe(wrapper!.get('button.item-tile').element);
  });

  it('returns focus to the Salvage button that started a common salvage when it still exists', async () => {
    // The common item stays in the bag (the server step here removes another row), so the button is kept.
    await mountCard({ removeId: 3n });
    await tile('Plain Vest').trigger('click');
    const button = salvageBtn('.inspector-col');
    (button.element as HTMLElement).focus();
    await button.trigger('click');
    await flush();
    expect(dialog().exists()).toBe(true);
    await cardButton('Done')!.trigger('click');
    await flush();
    expect(document.activeElement).toBe(salvageBtn('.inspector-col').element);
  });

  it('opens the card after a common item salvages at once, with no confirm', async () => {
    const ctx = await mountCard();
    await tile('Plain Vest').trigger('click');
    await salvageBtn('.inspector-col').trigger('click');
    expect(wrapper!.find('.inline-confirm').exists()).toBe(false);
    await flush();
    expect(ctx.salvageItem).toHaveBeenCalledWith({ characterId: 7n, itemInstanceId: COMMON_ID });
    expect(dialog().exists()).toBe(true);
  });

  it('never opens a card for a row present at mount or one that arrives with no salvage started', async () => {
    const ctx = await mountCard({ preset: salvageRow(1n) });
    expect(dialog().exists()).toBe(false);
    ctx.lastResult.value = salvageRow(2n);
    await flush();
    expect(dialog().exists()).toBe(false);
  });

  it('opens no card on a refusal, and the notice line says so', async () => {
    await mountCard({ outcome: 'reject' });
    await salvageRare();
    expect(dialog().exists()).toBe(false);
    expect(wrapper!.get('[role="status"]').text()).toBe("Couldn't send that. Try again.");
  });

  it('opens no card when the call settles without a new result row', async () => {
    await mountCard({ outcome: 'silent' });
    await salvageRare();
    expect(dialog().exists()).toBe(false);
  });

  it('renders item and line names with markup as text', async () => {
    await mountCard({ rowOver: { itemName: XSS, linesJson: encodeResultLines([
      { kind: 'received', templateId: 30n, name: XSS, quantity: 2n, total: 6n, instanceId: null },
    ]) } });
    await salvageRare();
    expect(wrapper!.find('img').exists()).toBe(false);
    expect(wrapper!.get('[role="dialog"] h4').text()).toBe(XSS);
    expect(wrapper!.get('[role="dialog"] .result-row .name').text()).toBe(XSS);
  });

  it('hosts the card in a position: relative screen root', () => {
    const source = read('InventoryScreen.vue');
    expect(source).toMatch(/\.inventory-screen\s*\{[^}]*position: relative;/);
    expect(source).toMatch(/useActionResult\(/);
    expect(source).toMatch(/'item-salvage': 'salvage'/);
    expect(source).toMatch(/<ResultCard/);
    expect(source).toMatch(/learnRecipeScroll/);
  });

  describe('mobile 390x844', () => {
    async function salvageRareMobile() {
      await tile('Gilded Vest').trigger('click');
      await salvageBtn('.dock').trigger('click');
      expect(wrapper!.find('.inline-confirm').exists()).toBe(true);
      await wrapper!.findAll('.inline-confirm button')[0].trigger('click');
      await flush();
    }

    it('still asks first for a rare item, then opens the bottom sheet with Done only', async () => {
      const ctx = await mountCard({ isDesktop: false });
      await tile('Gilded Vest').trigger('click');
      await salvageBtn('.dock').trigger('click');
      expect(ctx.salvageItem).not.toHaveBeenCalled();
      expect(wrapper!.get('.inline-confirm').classes()).toContain('mobile');
      await wrapper!.findAll('.inline-confirm button')[0].trigger('click');
      await flush();
      const sheet = wrapper!.get('[role="dialog"]');
      expect(sheet.classes()).toContain('mobile');
      expect(wrapper!.get('.result-scrim').classes()).toContain('mobile');
      expect(cardButton('Done')).toBeDefined();
      expect(cardButton('Open crafting')).toBeUndefined();
      expect(cardButton('Read scroll')).toBeUndefined();
      expect(sheet.find('.chips').exists()).toBe(false);
    });

    it('adds Read scroll when a scroll line exists, and reads it', async () => {
      const ctx = await mountCard({ isDesktop: false, scroll: true });
      await salvageRareMobile();
      expect(cardButton('Open crafting')).toBeUndefined();
      await cardButton('Read scroll')!.trigger('click');
      await flush();
      expect(ctx.learnRecipeScroll).toHaveBeenCalledWith({ characterId: 7n, itemInstanceId: SCROLL_ID });
      expect(dialog().exists()).toBe(false);
    });

    it('returns focus to the first tile when Done closes the sheet', async () => {
      await mountCard({ isDesktop: false });
      await salvageRareMobile();
      await cardButton('Done')!.trigger('click');
      await flush();
      expect(document.activeElement).toBe(wrapper!.get('button.item-tile').element);
    });

    it('pins 44px minimums for the sheet buttons in the shared card source', () => {
      const source = readFileSync(resolve(process.cwd(), 'src/ledger/ResultCard.vue'), 'utf8');
      expect(source).toMatch(/\.mobile \.card-btn\s*\{\s*min-height: 44px;/);
    });
  });
});
