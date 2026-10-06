// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { computed, nextTick, ref, shallowRef } from 'vue';
import { mount, type VueWrapper } from '@vue/test-utils';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { FRAME_KEY, GAME_KEY, createInertFrame, createInertGame } from '../game/context';
import type { FrameControls, GameData } from '../game/context';
import { LEDGER_KEY, createInertLedger } from '../ledger/ledgerContext';
import type { LedgerData, LedgerReducers } from '../ledger/ledgerContext';
import { createActionRunner } from '../ledger/actionRunner';
import type { ItemInstance, ItemTemplate, RecipeDiscovered, RecipeTemplate } from '../module_bindings/types';
import CraftingMeta from './CraftingMeta.vue';
import MaterialsOnHand from './MaterialsOnHand.vue';
import RecipeList from './RecipeList.vue';

const XSS = '<img src=x onerror=alert(1)>';
const read = (file: string): string => readFileSync(resolve(process.cwd(), 'src/crafting', file), 'utf8');

let wrapper: VueWrapper | null = null;
afterEach(() => {
  wrapper?.unmount();
  wrapper = null;
  document.body.innerHTML = '';
  vi.unstubAllGlobals();
});

// ---------------------------------------------------------------------------
// fixtures shared by every describe block in this file
// ---------------------------------------------------------------------------

function tpl(id: bigint, name: string, overrides: Record<string, unknown> = {}): ItemTemplate {
  return {
    id,
    name,
    slot: 'material',
    armorType: '',
    weaponType: '',
    rarity: 'common',
    tier: 1n,
    isJunk: false,
    vendorValue: 2n,
    requiredLevel: 1n,
    allowedClasses: '',
    stackable: true,
    wellFedDurationMicros: 0n,
    ...overrides,
  } as unknown as ItemTemplate;
}

function inst(id: bigint, templateId: bigint, quantity = 1n, overrides: Record<string, unknown> = {}): ItemInstance {
  return {
    id,
    templateId,
    ownerCharacterId: 7n,
    equippedSlot: undefined,
    quantity,
    qualityTier: undefined,
    craftQuality: undefined,
    displayName: undefined,
    ...overrides,
  } as unknown as ItemInstance;
}

function recipe(id: bigint, name: string, over: Record<string, unknown>): RecipeTemplate {
  return {
    id,
    key: `r${id}`,
    name,
    outputTemplateId: 100n,
    outputCount: 1n,
    req1TemplateId: 1n,
    req1Count: 1n,
    req2TemplateId: 4n,
    req2Count: 1n,
    req3TemplateId: undefined,
    req3Count: undefined,
    recipeType: 'weapon',
    materialType: undefined,
    ...over,
  } as unknown as RecipeTemplate;
}

const COPPER = tpl(1n, 'Copper Ore', { tier: 1n });
const IRON = tpl(2n, 'Iron Ore', { tier: 2n });
const DARKSTEEL = tpl(3n, 'Darksteel Ore', { tier: 3n, rarity: 'rare' });
const HIDE = tpl(4n, 'Rough Hide', { tier: 1n });
const LESSER = tpl(10n, 'Lesser Essence', { slot: 'misc' });
const ESSENCE = tpl(11n, 'Essence', { slot: 'misc' });
const GREATER = tpl(12n, 'Greater Essence', { slot: 'misc', rarity: 'epic' });
const STONE = tpl(20n, 'Glowing Stone', { slot: 'misc' });
const RUNE = tpl(21n, 'Ancient Rune', { slot: 'misc' });
const WARD = tpl(22n, 'Iron Ward', { slot: 'misc' });
const SWORD = tpl(100n, 'Copper Sword', { slot: 'mainHand', weaponType: 'sword', tier: 1n, stackable: false });
const HELM = tpl(101n, 'Iron Helm', { slot: 'head', armorType: 'plate', tier: 2n, stackable: false, requiredLevel: 6n });
const BLADE = tpl(102n, 'Darksteel Blade', { slot: 'mainHand', weaponType: 'sword', tier: 3n, stackable: false, requiredLevel: 3n });
const BANDAGE = tpl(103n, 'Bandage', { slot: 'consumable', tier: 1n, stackable: true });
const TRINKET = tpl(104n, 'Odd Trinket', { slot: 'misc', tier: 1n, stackable: false });
const TEMPLATES = [COPPER, IRON, DARKSTEEL, HIDE, LESSER, ESSENCE, GREATER, STONE, RUNE, WARD, SWORD, HELM, BLADE, BANDAGE, TRINKET];

const R_SWORD = recipe(1n, 'Copper Sword', { outputTemplateId: 100n, req1TemplateId: 1n, req1Count: 3n, req2TemplateId: 4n, req2Count: 1n });
const R_HELM = recipe(2n, 'Iron Helm', {
  outputTemplateId: 101n,
  req1TemplateId: 2n,
  req1Count: 2n,
  req2TemplateId: 4n,
  req2Count: 1n,
  recipeType: 'armor',
});
const R_BLADE = recipe(3n, 'Darksteel Blade', { outputTemplateId: 102n, req1TemplateId: 3n, req1Count: 2n, req2TemplateId: 2n, req2Count: 1n });
const R_BANDAGE = recipe(4n, 'Bandage', {
  outputTemplateId: 103n,
  outputCount: 2n,
  req1TemplateId: 4n,
  req1Count: 2n,
  req2TemplateId: 1n,
  req2Count: 1n,
  recipeType: 'consumable',
});
const R_ODD = recipe(5n, 'Odd Trinket', { outputTemplateId: 104n, recipeType: 'gadget' });
const RECIPES = [R_SWORD, R_HELM, R_BLADE, R_BANDAGE, R_ODD];

// Copper 5, Hide 1 (an equipped Hide is never counted), Iron 3, Essence 1, Lesser Essence 1, Glowing Stone 2, Ancient Rune 1.
const ITEMS = [
  inst(1n, 1n, 5n),
  inst(2n, 4n, 1n),
  inst(3n, 4n, 4n, { equippedSlot: 'head' }),
  inst(4n, 2n, 3n),
  inst(5n, 11n, 1n),
  inst(6n, 10n, 1n),
  inst(7n, 20n, 2n),
  inst(8n, 21n, 1n),
];

function known(...ids: bigint[]): RecipeDiscovered[] {
  return ids.map((id, index) => ({ id: BigInt(index + 1), characterId: 7n, recipeTemplateId: id })) as unknown as RecipeDiscovered[];
}

interface World {
  items?: ItemInstance[];
  templates?: ItemTemplate[];
  recipes?: RecipeTemplate[];
  knownIds?: bigint[];
  applied?: boolean;
  character?: Record<string, unknown> | null;
  station?: boolean;
  connected?: boolean;
  isDesktop?: boolean;
  reducers?: Partial<LedgerReducers>;
}

function buildWorld(world: World) {
  const connected = ref(world.connected ?? true);
  const items = shallowRef<readonly ItemInstance[]>(world.items ?? ITEMS);
  const knownRows = shallowRef<readonly RecipeDiscovered[]>(known(...(world.knownIds ?? [1n, 2n, 3n, 4n, 5n])));
  const calls = {
    researchRecipes: vi.fn(async () => undefined),
    craftRecipe: vi.fn(async () => undefined),
  };
  const reducers = { ...calls, ...world.reducers } as unknown as LedgerReducers;
  const game = {
    ...createInertGame(),
    character: ref(
      world.character === undefined
        ? { id: 7n, name: 'Hero', level: 5n, locationId: 10n, gold: 100n, className: 'Warrior' }
        : world.character,
    ),
    locations: ref([{ id: 10n, name: 'Forge Gate', craftingAvailable: world.station ?? true }]),
    renownPerks: ref([]),
    connected,
  } as unknown as GameData;
  const ledger = {
    ...createInertLedger(),
    items,
    itemsApplied: ref(true),
    templates: ref(new Map((world.templates ?? TEMPLATES).map((t) => [t.id, t]))),
    recipesKnown: knownRows,
    recipesApplied: ref(world.applied ?? true),
    recipes: ref(new Map((world.recipes ?? RECIPES).map((r) => [r.id, r]))),
    reducers: computed(() => (connected.value ? reducers : null)),
  } as unknown as LedgerData;
  const frame = { ...createInertFrame(), isDesktop: ref(world.isDesktop ?? true) } as unknown as FrameControls;
  const runner = createActionRunner({ online: computed(() => connected.value && ledger.reducers.value !== null) });
  return {
    connected,
    items,
    knownRows,
    calls,
    game,
    ledger,
    frame,
    runner,
    global: {
      provide: { [GAME_KEY as symbol]: game, [LEDGER_KEY as symbol]: ledger, [FRAME_KEY as symbol]: frame },
    },
  };
}

// ---------------------------------------------------------------------------
// CraftingMeta
// ---------------------------------------------------------------------------

describe('CraftingMeta', () => {
  function mountMeta(world: World = {}) {
    const ctx = buildWorld(world);
    wrapper = mount(CraftingMeta, { global: ctx.global });
    return { ...ctx, w: wrapper };
  }

  it('shows how many recipes are known and the accent station tag with the hammer', () => {
    const { w } = mountMeta();
    expect(w.get('.known').text()).toBe('5 recipes known');
    const tag = w.get('.tag');
    expect(tag.text()).toBe('Crafting station');
    expect(tag.classes()).toContain('tag-accent');
    expect(tag.find('svg').exists()).toBe(true);
    expect(w.find('.no-station').exists()).toBe(false);
  });

  it('uses the singular for one recipe and says there is no station when there is none', () => {
    const { w } = mountMeta({ knownIds: [1n], station: false });
    expect(w.get('.known').text()).toBe('1 recipe known');
    expect(w.find('.tag').exists()).toBe(false);
    expect(w.get('.no-station').text()).toBe('No crafting station here');
  });

  it('shows the count only on mobile (the list view carries the station line) and nothing without a character', () => {
    const mobile = mountMeta({ isDesktop: false });
    expect(mobile.w.get('.known').text()).toBe('5 recipes known');
    expect(mobile.w.find('.tag').exists()).toBe(false);
    expect(mobile.w.find('.no-station').exists()).toBe(false);
    wrapper?.unmount();
    wrapper = null;
    expect(mountMeta({ character: null }).w.text()).toBe('');
  });
});

// ---------------------------------------------------------------------------
// MaterialsOnHand
// ---------------------------------------------------------------------------

describe('MaterialsOnHand', () => {
  function mountMaterials(world: World = {}, props: { mode?: 'column' | 'disclosure'; showDiscover?: boolean; mobile?: boolean } = {}) {
    const ctx = buildWorld(world);
    wrapper = mount(MaterialsOnHand, {
      attachTo: document.body,
      props: { mode: 'column', runner: ctx.runner, ...props },
      global: ctx.global,
    });
    return { ...ctx, w: wrapper };
  }

  it('column: heading and a name and count grid sorted by name, with plain and rarity colors', () => {
    const { w } = mountMaterials({ items: [...ITEMS, inst(9n, 3n, 2n)] });
    expect(w.get('h6').text()).toBe('Materials on hand');
    const names = w.findAll('dt').map((n) => n.text());
    expect(names).toEqual(['Ancient Rune', 'Copper Ore', 'Darksteel Ore', 'Essence', 'Glowing Stone', 'Iron Ore', 'Lesser Essence', 'Rough Hide']);
    const counts = w.findAll('dd').map((n) => n.text());
    expect(counts[1]).toBe('5');
    expect(w.findAll('dt')[1].attributes('style')).toContain('var(--color-text)');
    expect(w.findAll('dt')[2].attributes('style')).toContain('var(--color-rarity-rare)');
  });

  it('column: shows the empty line with nothing on hand', () => {
    const { w } = mountMaterials({ items: [] });
    expect(w.get('.empty').text()).toBe('No materials on hand.');
    expect(w.find('dl').exists()).toBe(false);
  });

  it('disclosure: a collapsed ghost button with the count, aria-expanded and aria-controls that expands', async () => {
    const { w } = mountMaterials({}, { mode: 'disclosure' });
    const button = w.get('button.disclosure');
    expect(button.classes()).toContain('btn-ghost');
    expect(button.text()).toBe('Materials on hand · 7');
    expect(button.attributes('aria-expanded')).toBe('false');
    const target = w.get(`#${button.attributes('aria-controls')}`);
    expect(target.attributes('style')).toContain('display: none');
    await button.trigger('click');
    expect(button.attributes('aria-expanded')).toBe('true');
    expect(target.attributes('style') ?? '').not.toContain('display: none');
    expect(target.findAll('dt')).toHaveLength(7);
    await button.trigger('click');
    expect(button.attributes('aria-expanded')).toBe('false');
  });

  it('Discover recipes calls researchRecipes with the character id once and is inert while pending', async () => {
    let release: () => void = () => undefined;
    const researchRecipes = vi.fn(() => new Promise<void>((resolveCall) => (release = resolveCall)));
    const { w } = mountMaterials({ reducers: { researchRecipes } as Partial<LedgerReducers> }, { showDiscover: true });
    const button = w.get('button.discover');
    expect(button.text()).toBe('Discover recipes');
    expect(button.find('svg').exists()).toBe(true);
    await button.trigger('click');
    await button.trigger('click');
    expect(researchRecipes).toHaveBeenCalledTimes(1);
    expect(researchRecipes).toHaveBeenCalledWith({ characterId: 7n });
    expect(button.attributes('aria-disabled')).toBe('true');
    release();
    await nextTick();
  });

  it('Discover recipes is aria-disabled with the station reason and sends nothing without a station', async () => {
    const { w, calls } = mountMaterials({ station: false }, { showDiscover: true });
    const button = w.get('button.discover');
    expect(button.attributes('aria-disabled')).toBe('true');
    const reason = w.get('.reason');
    expect(reason.text()).toBe('Find a crafting station to discover recipes.');
    expect(button.attributes('aria-describedby')).toBe(reason.attributes('id'));
    await button.trigger('click');
    expect(calls.researchRecipes).not.toHaveBeenCalled();
  });

  it('Discover recipes is inert while offline', async () => {
    const { w, calls } = mountMaterials({ connected: false }, { showDiscover: true });
    expect(w.get('button.discover').attributes('aria-disabled')).toBe('true');
    await w.get('button.discover').trigger('click');
    expect(calls.researchRecipes).not.toHaveBeenCalled();
  });

  it('renders material names with markup literally', () => {
    const evil = tpl(30n, XSS);
    const { w } = mountMaterials({ templates: [evil], items: [inst(1n, 30n, 2n)] });
    expect(w.get('dt').text()).toBe(XSS);
    expect(w.find('img').exists()).toBe(false);
  });

  it('keeps the mobile 44px rules in the source', () => {
    const source = read('MaterialsOnHand.vue');
    expect(source).toMatch(/\.mobile \.disclosure\s*\{\s*min-height: 44px;/);
    expect(source).toMatch(/\.mobile \.discover\s*\{\s*min-height: 44px;/);
  });
});

// ---------------------------------------------------------------------------
// RecipeList
// ---------------------------------------------------------------------------

describe('RecipeList', () => {
  function mountList(world: World = {}, props: { selectedId?: bigint | null; mobile?: boolean; showDiscover?: boolean; showMaterialsDisclosure?: boolean } = {}) {
    const ctx = buildWorld(world);
    wrapper = mount(RecipeList, {
      attachTo: document.body,
      props: { selectedId: null, runner: ctx.runner, ...props },
      global: ctx.global,
    });
    return { ...ctx, w: wrapper };
  }

  it('shows the category chips, an unchecked real checkbox and the rows with their two lines', () => {
    const { w } = mountList({}, { mobile: true });
    const group = w.get('[role="group"]');
    expect(group.attributes('aria-label')).toBe('Recipe category');
    expect(group.findAll('button').map((b) => b.text())).toEqual(['All', 'Weapon', 'Armor', 'Accessory', 'Consumable']);
    const box = w.get('label.radio input[type="checkbox"]');
    expect((box.element as HTMLInputElement).checked).toBe(false);
    expect(w.get('label.radio').text()).toBe('Show only craftable');
    expect(w.find('.dot').exists()).toBe(true);
    const rows = w.findAll('button.recipe-row');
    expect(rows.map((r) => r.get('.row-name').text())).toEqual(['Copper Sword', 'Iron Helm', 'Odd Trinket', 'Bandage', 'Darksteel Blade']);
    expect(rows[0].get('.row-meta').text()).toBe('Weapon · T1');
    expect(rows[0].findAll('.req').map((r) => r.text())).toEqual(['Copper Ore 5/3', 'Rough Hide 1/1']);
    expect(rows[0].findAll('.req').every((r) => r.classes().includes('met'))).toBe(true);
    const bandage = rows[3];
    expect(bandage.findAll('.req').map((r) => r.classes().includes('short'))).toEqual([true, false]);
    expect(bandage.classes()).toContain('uncraftable');
    expect(bandage.attributes('aria-label')).toBe('Bandage, Consumable tier 1, missing Rough Hide');
    expect(rows[0].attributes('aria-label')).toBe('Copper Sword, Weapon tier 1, craftable');
  });

  it('selects a row on click (aria-pressed on the selected one) through the select event', async () => {
    const { w } = mountList({}, { mobile: true, selectedId: 2n });
    const rows = w.findAll('button.recipe-row');
    expect(rows.map((r) => r.attributes('aria-pressed'))).toEqual(['false', 'true', 'false', 'false', 'false']);
    await rows[0].trigger('click');
    expect(w.emitted('select')).toEqual([[1n]]);
  });

  it('filters by category chip and keeps an unknown recipe type under All only', async () => {
    const { w } = mountList({}, { mobile: true });
    await w.findAll('[role="group"] button')[1].trigger('click');
    expect(w.findAll('.row-name').map((n) => n.text())).toEqual(['Copper Sword', 'Darksteel Blade']);
    expect(w.findAll('[role="group"] button')[1].attributes('aria-pressed')).toBe('true');
    await w.findAll('[role="group"] button')[0].trigger('click');
    expect(w.findAll('.row-name').map((n) => n.text())).toContain('Odd Trinket');
  });

  it('shows the empty line for a category with no recipes', async () => {
    const { w } = mountList({}, { mobile: true });
    await w.findAll('[role="group"] button')[3].trigger('click');
    expect(w.get('.empty').text()).toBe('No accessory recipes known.');
    expect(w.find('ul.rows').exists()).toBe(false);
  });

  it('only-craftable hides uncraftable rows; the empty state offers Show all n recipes, which unchecks the box', async () => {
    const { w } = mountList({ items: [inst(1n, 1n, 1n)] }, { mobile: true });
    const box = w.get('label.radio input');
    await box.setValue(true);
    expect(w.get('.empty').text()).toBe('No craftable recipes right now.');
    const showAll = w.get('button.show-all');
    expect(showAll.classes()).toContain('btn-ghost');
    expect(showAll.text()).toBe('Show all 5 recipes');
    await showAll.trigger('click');
    expect((box.element as HTMLInputElement).checked).toBe(false);
    expect(w.findAll('button.recipe-row')).toHaveLength(5);
  });

  it('only-craftable keeps the craftable rows when some are craftable', async () => {
    const { w } = mountList({}, { mobile: true });
    await w.get('label.radio input').setValue(true);
    expect(w.findAll('.row-name').map((n) => n.text())).toEqual(['Copper Sword', 'Iron Helm', 'Odd Trinket']);
  });

  it('shows No recipes known yet with the body and the Discover button when none are known', async () => {
    const { w, calls } = mountList({ knownIds: [] });
    expect(w.text()).toContain('No recipes known yet.');
    expect(w.text()).toContain('Discover recipes at a crafting station, or learn a recipe scroll.');
    expect(w.find('[role="group"]').exists()).toBe(false);
    await w.get('button.discover').trigger('click');
    expect(calls.researchRecipes).toHaveBeenCalledWith({ characterId: 7n });
  });

  it('adds Discover recipes after the rows only when asked, and the Materials disclosure by layout', () => {
    expect(mountList({}, { mobile: true }).w.find('button.discover').exists()).toBe(false);
    wrapper?.unmount();
    wrapper = null;
    const withBoth = mountList({}, { mobile: true, showDiscover: true, showMaterialsDisclosure: true });
    expect(withBoth.w.find('button.discover').exists()).toBe(true);
    expect(withBoth.w.get('button.disclosure').text()).toBe('Materials on hand · 7');
    const children = Array.from(withBoth.w.get('.recipe-list').element.children).map((el) => el.className.split(' ')[0] || el.tagName);
    // Mobile order: chips, checkbox, disclosure, rows, Discover.
    expect(children.indexOf('radio')).toBeLessThan(children.indexOf('materials'));
    expect(children.indexOf('materials')).toBeLessThan(children.indexOf('rows'));
    expect(children.indexOf('rows')).toBeLessThan(children.indexOf('discover-slot'));
  });

  it('desktop selects the first visible row and replaces a selection that is filtered out; mobile does not', async () => {
    const { w } = mountList({}, { selectedId: null });
    expect(w.emitted('select')).toEqual([[1n]]);
    await w.setProps({ selectedId: 3n });
    await w.findAll('[role="group"] button')[2].trigger('click');
    const events = w.emitted('select')!;
    expect(events[events.length - 1]).toEqual([2n]);
    wrapper?.unmount();
    wrapper = null;
    const mobile = mountList({}, { mobile: true, selectedId: null });
    expect(mobile.w.emitted('select')).toBeUndefined();
  });

  it('desktop reports no selection when no row is visible', async () => {
    const { w } = mountList({}, { selectedId: 1n });
    await w.findAll('[role="group"] button')[3].trigger('click');
    const events = w.emitted('select')!;
    expect(events[events.length - 1]).toEqual([null]);
  });

  it('focusRow puts focus on a recipe row', () => {
    const { w } = mountList({}, { mobile: true });
    (w.vm as unknown as { focusRow: (id: bigint) => void }).focusRow(2n);
    expect(document.activeElement).toBe(w.get('[data-recipe-id="2"]').element);
  });

  it('disables the chips while offline', () => {
    const { w } = mountList({ connected: false }, { mobile: true });
    expect(w.get('[role="group"] button').attributes('aria-disabled')).toBe('true');
  });

  it('renders recipe and material names with markup literally', () => {
    const evilRecipe = recipe(9n, XSS, { req1TemplateId: 50n, req1Count: 1n, req2TemplateId: 4n, req2Count: 1n });
    const { w } = mountList({ recipes: [evilRecipe], knownIds: [9n], templates: [...TEMPLATES, tpl(50n, XSS)] }, { mobile: true });
    expect(w.get('.row-name').text()).toBe(XSS);
    expect(w.get('.req').text()).toBe(`${XSS} 0/1`);
    expect(w.find('img').exists()).toBe(false);
  });

  it('keeps the 56px mobile rows and the squared checkbox dot in the source', () => {
    const source = read('RecipeList.vue');
    expect(source).toMatch(/\.mobile \.recipe-row\s*\{\s*min-height: 56px;/);
    expect(source).toMatch(/\.only-craftable \.dot\s*\{\s*border-radius: var\(--radius-sm\);/);
    expect(source).toMatch(/\.recipe-row\.selected\s*\{[^}]*var\(--color-accent\)/);
  });
});
