// @vitest-environment happy-dom
import { afterEach, describe, expect, it } from 'vitest';
import { computed, nextTick, ref, shallowRef } from 'vue';
import { mount, type VueWrapper } from '@vue/test-utils';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { MAX_INVENTORY_SLOTS } from '@game-data/inventory_rules';
import {
  FRAME_KEY,
  GAME_KEY,
  createInertFrame,
  createInertGame,
} from '../game/context';
import type { FrameControls, GameData } from '../game/context';
import { LEDGER_KEY, createInertLedger } from '../ledger/ledgerContext';
import type { LedgerData, LedgerReducers } from '../ledger/ledgerContext';
import type { ItemAffix, ItemInstance, ItemTemplate } from '../module_bindings/types';
import EquippedSlots from './EquippedSlots.vue';
import BackpackGrid from './BackpackGrid.vue';
import InventoryMeta from './InventoryMeta.vue';

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
  const reducers = {
    equipItem: async () => undefined,
    unequipItem: async () => undefined,
    useItem: async () => undefined,
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
    reducers: computed(() => (connected.value ? reducers : null)),
  } as unknown as LedgerData;
  const frame = { ...createInertFrame(), isDesktop: ref(world.isDesktop ?? true) } as unknown as FrameControls;
  return {
    items,
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
    expect(read('BackpackGrid.vue')).toMatch(/repeat\(5, minmax\(0, 1fr\)\)/);
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

  it('shows the slot count and the gold on desktop', () => {
    mountMeta({ items: [inst(1n, 1n), inst(2n, 1n), inst(3n, 1n, { equippedSlot: 'chest' })] });
    expect(wrapper!.get('.slots').text()).toBe(`2 / ${MAX_INVENTORY_SLOTS} slots`);
    expect(wrapper!.get('.gold').attributes('aria-label')).toBe('1284 gold');
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
