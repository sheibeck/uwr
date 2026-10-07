// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest';
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
    expect(wrapper!.get('.inspector-col .action.primary').text()).toBe('Unequip item');
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
    expect(primary.text()).toBe('Equip item');
    (primary.element as HTMLElement).focus();
    ctx.items.value = [inst(2n, 2n, { equippedSlot: 'chest' })];
    await settle();
    const after = wrapper!.get('.inspector-col .action.primary');
    expect(after.text()).toBe('Unequip item');
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
