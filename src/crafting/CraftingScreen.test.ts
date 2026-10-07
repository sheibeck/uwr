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
import { encodeResultLines } from '@game-data/action_result';
import type { ResultLine } from '@game-data/action_result';
import type { ActionResult, ItemInstance, ItemTemplate, RecipeDiscovered, RecipeTemplate } from '../module_bindings/types';
import CraftingMeta from './CraftingMeta.vue';
import CraftingScreen from './CraftingScreen.vue';
import MaterialsOnHand from './MaterialsOnHand.vue';
import RecipeDetail from './RecipeDetail.vue';
import RecipeList from './RecipeList.vue';

const XSS = '<img src=x onerror=alert(1)>';
const read = (file: string): string => readFileSync(resolve(process.cwd(), 'src/crafting', file), 'utf8');

const originalMatchMedia = window.matchMedia;
let wrapper: VueWrapper | null = null;
afterEach(() => {
  wrapper?.unmount();
  wrapper = null;
  document.body.innerHTML = '';
  window.matchMedia = originalMatchMedia;
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
  lastResult?: ActionResult | null;
  reducers?: Partial<LedgerReducers>;
}

function buildWorld(world: World) {
  const connected = ref(world.connected ?? true);
  const items = shallowRef<readonly ItemInstance[]>(world.items ?? ITEMS);
  const knownRows = shallowRef<readonly RecipeDiscovered[]>(known(...(world.knownIds ?? [1n, 2n, 3n, 4n, 5n])));
  const calls = {
    researchRecipes: vi.fn(async () => undefined),
    craftRecipe: vi.fn(async () => undefined),
    craftRecipeCount: vi.fn(async () => undefined),
    equipItem: vi.fn(async () => undefined),
  };
  const lastResult = shallowRef<ActionResult | null>(world.lastResult ?? null);
  const reducers = { ...calls, ...world.reducers } as unknown as LedgerReducers;
  const game = {
    ...createInertGame(),
    character: ref(
      world.character === undefined
        ? { id: 7n, name: 'Hero', level: 5n, locationId: 10n, gold: 100n, className: 'Warrior', vendorSellMod: 100n }
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
    lastResult,
    outputRecipes: ref(new Map()),
    outputRecipesApplied: ref(true),
    reducers: computed(() => (connected.value ? reducers : null)),
  } as unknown as LedgerData;
  const frame = { ...createInertFrame(), isDesktop: ref(world.isDesktop ?? true) } as unknown as FrameControls;
  const runner = createActionRunner({ online: computed(() => connected.value && ledger.reducers.value !== null) });
  return {
    connected,
    items,
    knownRows,
    lastResult,
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
  function mountMaterials(
    world: World = {},
    props: { mode?: 'column' | 'disclosure'; showDiscover?: boolean; mobile?: boolean; usedTemplateIds?: bigint[] } = {},
  ) {
    const ctx = buildWorld(world);
    wrapper = mount(MaterialsOnHand, {
      attachTo: document.body,
      props: { mode: 'column', runner: ctx.runner, ...props },
      global: ctx.global,
    });
    return { ...ctx, w: wrapper };
  }

  it('column: heading and an icon, name and count row sorted by name, with plain and rarity colors', () => {
    const { w } = mountMaterials({ items: [...ITEMS, inst(9n, 3n, 2n)] });
    expect(w.get('h6').text()).toBe('Materials on hand');
    expect(w.findAll('.m-row').every((row) => row.find('svg').exists())).toBe(true);
    const names = w.findAll('.m-name').map((n) => n.text());
    expect(names).toEqual(['Ancient Rune', 'Copper Ore', 'Darksteel Ore', 'Essence', 'Glowing Stone', 'Iron Ore', 'Lesser Essence', 'Rough Hide']);
    const counts = w.findAll('.m-count').map((n) => n.text());
    expect(counts[1]).toBe('5');
    expect(w.findAll('.m-name')[1].attributes('style')).toContain('var(--color-text)');
    expect(w.findAll('.m-name')[2].attributes('style')).toContain('var(--color-rarity-rare)');
  });

  it('column: the selected recipe materials are highlighted, a used material with none on hand is listed in red', () => {
    const { w } = mountMaterials({ items: [inst(1n, 1n, 5n)] }, { usedTemplateIds: [1n, 4n] });
    const rows = w.findAll('.m-row');
    expect(rows.map((r) => r.get('.m-name').text())).toEqual(['Copper Ore', 'Rough Hide']);
    expect(rows.every((r) => r.classes().includes('highlighted'))).toBe(true);
    expect(rows[0].get('.m-count').classes()).not.toContain('short');
    expect(rows[1].get('.m-count').text()).toBe('0');
    expect(rows[1].get('.m-count').classes()).toContain('short');
    expect(w.get('.caption').text()).toBe('Highlighted: used by the selected recipe.');
  });

  it('column: an unused material is not highlighted and the highlight caption is absent with no selection', () => {
    const { w } = mountMaterials({}, { usedTemplateIds: [1n] });
    const lit = w.findAll('.m-row').filter((r) => r.classes().includes('highlighted'));
    expect(lit).toHaveLength(1);
    expect(lit[0].get('.m-name').text()).toBe('Copper Ore');
    wrapper?.unmount();
    wrapper = null;
    const none = mountMaterials();
    expect(none.w.find('.caption').exists()).toBe(false);
    expect(none.w.findAll('.m-row').some((r) => r.classes().includes('highlighted'))).toBe(false);
  });

  it('column: Discover carries its caption under the button', () => {
    const { w } = mountMaterials({}, { showDiscover: true });
    expect(w.get('.discover-slot .discover-caption').text()).toBe('Finds new recipes from the materials you carry.');
  });

  it('column: shows the empty line with nothing on hand', () => {
    const { w } = mountMaterials({ items: [] });
    expect(w.get('.empty').text()).toBe('No materials on hand.');
    expect(w.find('.m-rows').exists()).toBe(false);
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
    expect(target.findAll('.m-row')).toHaveLength(7);
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
    expect(w.get('.m-name').text()).toBe(XSS);
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
    // Mock 9a: an icon tile, the name and short type, and one status line (no per-material spans).
    expect(rows[0].find('.req').exists()).toBe(false);
    expect(rows[0].get('.row-icon').find('svg').exists()).toBe(true);
    expect(rows[0].get('.row-icon').attributes('style')).toContain('var(--color-text)');
    expect(rows[0].get('.row-name').attributes('style')).toContain('var(--color-text)');
    expect(rows[0].get('.row-status').text()).toBe('Can make 1');
    expect(rows[0].get('.row-status').classes()).toContain('met');
    const bandage = rows[3];
    expect(bandage.get('.row-status').text()).toBe('Missing Rough Hide');
    expect(bandage.get('.row-status').classes()).toContain('short');
    expect(bandage.classes()).toContain('uncraftable');
    expect(bandage.attributes('aria-label')).toBe('Bandage, Consumable tier 1, missing Rough Hide');
    expect(rows[0].attributes('aria-label')).toBe('Copper Sword, Weapon tier 1, can make 1');
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
    (showAll.element as HTMLElement).focus();
    await showAll.trigger('click');
    await nextTick();
    await nextTick();
    expect((box.element as HTMLInputElement).checked).toBe(false);
    expect(w.findAll('button.recipe-row')).toHaveLength(5);
    // WR-03: the removed button hands focus to the first recipe row, not body.
    expect(document.activeElement).toBe(w.findAll('button.recipe-row')[0].element);
  });

  it('with no recipes known shows the Materials disclosure when asked (WR-04)', () => {
    const { w } = mountList({ knownIds: [] }, { showMaterialsDisclosure: true });
    expect(w.get('button.disclosure').text()).toBe('Materials on hand · 7');
    expect(w.findAll('button.discover')).toHaveLength(1);
    wrapper?.unmount();
    wrapper = null;
    expect(mountList({ knownIds: [] }).w.find('button.disclosure').exists()).toBe(false);
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
    expect(w.get('.row-status').text()).toBe(`Missing ${XSS}`);
    expect(w.find('img').exists()).toBe(false);
  });

  it('draws the mock 9a row: a 32px icon tile, a 14px name, and a status in the met or short color', () => {
    const source = read('RecipeList.vue');
    expect(source).toContain('row.statusText');
    expect(source).not.toContain('req.text');
    expect(source).toMatch(/\.row-icon\s*\{[^}]*width: 32px;\s*height: 32px;/);
    expect(source).toMatch(/\.row-status\.met\s*\{\s*color: var\(--color-con-light-green\);/);
    expect(source).toMatch(/\.row-status\.short\s*\{\s*color: var\(--color-con-red\);/);
    expect(source).not.toMatch(/opacity: 0\.55/);
  });

  it('keeps an uncraftable row at full opacity with the muted name and the red status', () => {
    const { w } = mountList({}, { mobile: true });
    const bandage = w.findAll('button.recipe-row')[3];
    expect(bandage.classes()).toContain('uncraftable');
    expect(bandage.get('.row-status').classes()).toContain('short');
    expect(read('RecipeList.vue')).toMatch(/\.recipe-row\.uncraftable \.row-name\s*\{\s*color: var\(--color-neutral-400\);/);
  });

  it('keeps the 56px mobile rows and the squared checkbox dot in the source', () => {
    const source = read('RecipeList.vue');
    expect(source).toMatch(/\.mobile \.recipe-row\s*\{\s*min-height: 56px;/);
    expect(source).toMatch(/\.only-craftable \.dot\s*\{\s*border-radius: var\(--radius-sm\);/);
    expect(source).toMatch(/\.recipe-row\.selected\s*\{[^}]*var\(--color-accent\)/);
  });
});

// ---------------------------------------------------------------------------
// RecipeDetail
// ---------------------------------------------------------------------------

function press(el: Element, key: string): void {
  el.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true }));
}

describe('RecipeDetail', () => {
  function mountDetail(world: World = {}, props: { recipeId?: bigint; mobile?: boolean } = {}) {
    const ctx = buildWorld(world);
    wrapper = mount(RecipeDetail, {
      attachTo: document.body,
      props: { recipeId: 1n, runner: ctx.runner, mobile: false, ...props },
      global: ctx.global,
    });
    return { ...ctx, w: wrapper };
  }

  function slotButton(w: VueWrapper, label: string) {
    return w.findAll('button.slot-main').find((b) => b.text().includes(label))!;
  }

  // The single 'Add Essence + reagent' slot opens the essence and reagent slots in place.
  async function openSlots(w: VueWrapper): Promise<void> {
    const toggle = w.get('button.reagent-toggle');
    if (toggle.attributes('aria-expanded') !== 'true') await toggle.trigger('click');
  }

  // The Creates card, Uses rows, quality line and reagent slot cases live in RecipeDetail.test.ts.

  it('opens the essence picker, fills the slot with the chosen essence and reveals the reagent slots', async () => {
    const { w } = mountDetail();
    await openSlots(w);
    expect(slotButton(w, 'Add essence').text()).toContain('Unlocks reagents');
    expect(w.find('.slots-line').exists()).toBe(false);
    const essence = slotButton(w, 'Add essence');
    expect(essence.attributes('aria-expanded')).toBe('false');
    await essence.trigger('click');
    expect(essence.attributes('aria-expanded')).toBe('true');
    const listbox = w.get('[role="listbox"]');
    expect(listbox.attributes('aria-label')).toBe('Choose essence');
    await w.findAll('[role="option"]')[0].trigger('click');
    expect(w.find('[role="listbox"]').exists()).toBe(false);
    const filled = w.get('.slot.filled');
    expect(filled.get('.slot-name').text()).toBe('Essence');
    expect(filled.get('.slot-right').text()).toBe('+2 per reagent');
    expect(filled.get('button.remove').attributes('aria-label')).toBe('Remove Essence');
    expect(w.get('.slots-line').text()).toBe('Standard quality takes up to 1 reagent.');
    expect(w.findAll('.slot')).toHaveLength(2);
    expect(slotButton(w, 'Add reagent').text()).toContain('+ affix');
  });

  it('lists a too-weak essence as aria-disabled and cannot choose it', async () => {
    const { w } = mountDetail({}, { recipeId: 2n });
    await openSlots(w);
    await slotButton(w, 'Add essence').trigger('click');
    const options = w.findAll('[role="option"]');
    const lesser = options.find((o) => o.text().includes('Lesser Essence'))!;
    expect(lesser.attributes('aria-disabled')).toBe('true');
    expect(lesser.text()).toContain('Too weak for Reinforced quality');
    await lesser.trigger('click');
    expect(w.find('.slot.filled').exists()).toBe(false);
  });

  it('chooses a reagent with its effect, removes it, and clears the reagent slots when the essence is removed', async () => {
    const { w } = mountDetail();
    await openSlots(w);
    await slotButton(w, 'Add essence').trigger('click');
    await w.findAll('[role="option"]')[0].trigger('click');
    await slotButton(w, 'Add reagent').trigger('click');
    expect(w.get('[role="listbox"]').attributes('aria-label')).toBe('Choose reagent');
    await w.findAll('[role="option"]').find((o) => o.text().includes('Glowing Stone'))!.trigger('click');
    const filledSlots = w.findAll('.slot.filled');
    expect(filledSlots).toHaveLength(2);
    expect(filledSlots[1].get('.slot-name').text()).toBe('Glowing Stone');
    expect(filledSlots[1].get('.slot-right').text()).toBe('+2 STR');
    await filledSlots[1].get('button.remove').trigger('click');
    expect(w.findAll('.slot.filled')).toHaveLength(1);
    expect(slotButton(w, 'Add reagent').exists()).toBe(true);
    await w.get('.slot.filled button.remove').trigger('click');
    expect(w.find('.slots-line').exists()).toBe(false);
    expect(w.findAll('.slot')).toHaveLength(1);
    expect(slotButton(w, 'Add essence').exists()).toBe(true);
  });

  it('crafts with only the ids of the recipe when no essence or reagent is chosen', async () => {
    const { w, calls } = mountDetail();
    await w.get('button.craft-btn').trigger('click');
    expect(calls.craftRecipeCount).toHaveBeenLastCalledWith({ characterId: 7n, recipeTemplateId: 1n, count: 1n });
  });

  it('sends the essence and reagent ids through craftRecipeCount', async () => {
    const items = [...ITEMS, inst(20n, 3n, 2n), inst(21n, 2n, 1n), inst(22n, 12n, 1n)];
    const { w, calls } = mountDetail({ items }, { recipeId: 3n });
    await openSlots(w);
    await slotButton(w, 'Add essence').trigger('click');
    await w.findAll('[role="option"]').find((o) => o.text().includes('Greater Essence'))!.trigger('click');
    const reagentButtons = w.findAll('button.slot-main').filter((b) => b.text().includes('Add reagent'));
    expect(reagentButtons).toHaveLength(3);
    await reagentButtons[1].trigger('click');
    await w.findAll('[role="option"]').find((o) => o.text().includes('Ancient Rune'))!.trigger('click');
    await w.get('button.craft-btn').trigger('click');
    expect(calls.craftRecipeCount).toHaveBeenCalledTimes(1);
    expect(calls.craftRecipeCount).toHaveBeenCalledWith({
      characterId: 7n,
      recipeTemplateId: 3n,
      count: 1n,
      catalystTemplateId: 12n,
      modifier1TemplateId: 21n,
    });
  });

  it('shows Craft with the recipe name, runs once and is inert while pending', async () => {
    let release: () => void = () => undefined;
    const craftRecipeCount = vi.fn(() => new Promise<void>((resolveCall) => (release = resolveCall)));
    const { w } = mountDetail({ reducers: { craftRecipeCount } as Partial<LedgerReducers> });
    const button = w.get('button.craft-btn');
    expect(button.text()).toBe('Craft Copper Sword');
    expect(button.attributes('aria-label')).toBe('Craft 1 Copper Sword');
    expect(button.find('svg').exists()).toBe(true);
    await button.trigger('click');
    await button.trigger('click');
    expect(craftRecipeCount).toHaveBeenCalledTimes(1);
    expect(button.attributes('aria-disabled')).toBe('true');
    release();
    await nextTick();
  });

  it('is unavailable with the reason referenced by aria-describedby: no station, missing material, essence without reagent', async () => {
    const noStation = mountDetail({ station: false });
    expect(noStation.w.get('.reason').text()).toBe('No crafting station here.');
    const craft = noStation.w.get('button.craft-btn');
    expect(craft.attributes('aria-disabled')).toBe('true');
    expect(craft.attributes('aria-describedby')).toBe(noStation.w.get('.reason').attributes('id'));
    await craft.trigger('click');
    expect(noStation.calls.craftRecipeCount).not.toHaveBeenCalled();
    wrapper?.unmount();
    wrapper = null;

    const missing = mountDetail({}, { recipeId: 4n });
    expect(missing.w.get('.reason').text()).toBe('Missing 1 Rough Hide.');
    await missing.w.get('button.craft-btn').trigger('click');
    expect(missing.calls.craftRecipeCount).not.toHaveBeenCalled();
    missing.w.unmount();
    wrapper = null;

    const reagentless = mountDetail();
    await openSlots(reagentless.w);
    await slotButton(reagentless.w, 'Add essence').trigger('click');
    await reagentless.w.findAll('[role="option"]')[0].trigger('click');
    expect(reagentless.w.get('.reason').text()).toBe('Add a reagent to use the essence, or remove it.');
    expect(reagentless.w.get('button.craft-btn').attributes('aria-disabled')).toBe('true');
  });

  it('keeps the slots unavailable without a station and offline', async () => {
    const { w } = mountDetail({ station: false });
    const toggle = w.get('button.reagent-toggle');
    expect(toggle.attributes('aria-disabled')).toBe('true');
    await toggle.trigger('click');
    expect(toggle.attributes('aria-expanded')).toBe('false');
    expect(w.find('[role="listbox"]').exists()).toBe(false);
    wrapper?.unmount();
    wrapper = null;
    const offline = mountDetail({ connected: false });
    await offline.w.get('button.craft-btn').trigger('click');
    expect(offline.calls.craftRecipeCount).not.toHaveBeenCalled();
  });

  it('keeps the choices after a craft and clears the ones whose items are used up', async () => {
    const { w, items } = mountDetail();
    await openSlots(w);
    await slotButton(w, 'Add essence').trigger('click');
    await w.findAll('[role="option"]')[0].trigger('click');
    await slotButton(w, 'Add reagent').trigger('click');
    await w.findAll('[role="option"]').find((o) => o.text().includes('Glowing Stone'))!.trigger('click');
    expect(w.findAll('.slot.filled')).toHaveLength(2);
    // The craft used one Glowing Stone (two on hand, one left) and the Copper: the choices stay.
    items.value = [inst(1n, 1n, 2n), inst(2n, 4n, 0n + 1n), inst(5n, 11n, 1n), inst(7n, 20n, 1n)];
    await nextTick();
    expect(w.findAll('.slot.filled')).toHaveLength(2);
    // The next craft used up the Glowing Stone: that reagent clears, the essence stays.
    items.value = [inst(1n, 1n, 2n), inst(2n, 4n, 1n), inst(5n, 11n, 1n)];
    await nextTick();
    expect(w.findAll('.slot.filled')).toHaveLength(1);
    expect(w.get('.slot.filled .slot-name').text()).toBe('Essence');
    // The essence is used up: it and the reagent slots clear.
    items.value = [inst(1n, 1n, 2n), inst(2n, 4n, 1n)];
    await nextTick();
    expect(w.find('.slot.filled').exists()).toBe(false);
    expect(w.find('.slots-line').exists()).toBe(false);
  });

  it('closes only the picker on Escape (prevented, so the drawer stays) and returns focus to the slot', async () => {
    const { w } = mountDetail();
    await openSlots(w);
    const essence = slotButton(w, 'Add essence');
    await essence.trigger('click');
    expect(w.find('[role="listbox"]').exists()).toBe(true);
    const event = new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true });
    document.body.dispatchEvent(event);
    expect(event.defaultPrevented).toBe(true);
    await nextTick();
    await nextTick();
    expect(w.find('[role="listbox"]').exists()).toBe(false);
    expect(document.activeElement).toBe(essence.element);
  });

  it('chooses with the keyboard and returns focus to the slot that opened the picker', async () => {
    const { w } = mountDetail();
    await openSlots(w);
    const essence = slotButton(w, 'Add essence');
    await essence.trigger('click');
    press(w.get('[role="listbox"]').element, 'Enter');
    await nextTick();
    await nextTick();
    expect(w.find('.slot.filled').exists()).toBe(true);
    expect(document.activeElement).toBe(w.get('.slot.filled button.slot-main').element);
  });

  it('starts over with empty choices when the recipe changes', async () => {
    const { w } = mountDetail();
    await openSlots(w);
    await slotButton(w, 'Add essence').trigger('click');
    await w.findAll('[role="option"]')[0].trigger('click');
    expect(w.find('.slot.filled').exists()).toBe(true);
    await w.setProps({ recipeId: 3n });
    expect(w.get('h4').text()).toBe('Darksteel Blade');
    expect(w.find('.slot.filled').exists()).toBe(false);
  });

  it('mobile: Craft text with the full aria-label, Uses rows with have / need, no kicker, a docked reason', () => {
    const { w } = mountDetail({ station: false }, { mobile: true, recipeId: 4n });
    expect(w.find('.kicker').exists()).toBe(false);
    const craft = w.get('button.craft-btn');
    expect(craft.text()).toBe('Missing materials');
    expect(craft.attributes('aria-label')).toBe('Missing materials for Bandage');
    const rows = w.findAll('ul.uses li');
    expect(rows.map((r) => r.get('.use-name').text())).toEqual(['Rough Hide', 'Copper Ore']);
    expect(rows[0].get('.have').classes()).toContain('short');
    expect(rows[1].get('.have').classes()).toContain('met');
    expect(w.get('.detail-dock .reason').text()).toBe('No crafting station here.');
    const source = read('RecipeDetail.vue');
    expect(source).toMatch(/\.mobile \.craft-btn\s*\{[^}]*min-height: 44px;/);
    expect(source).toMatch(/\.craft-btn\s*\{[^}]*min-height: 40px;/);
    expect(source).toMatch(/\.mobile \.slot-main\s*\{\s*min-height: 44px;/);
  });

  it('contains no percent sign and no Likely quality text in a mounted gear recipe, on either layout', () => {
    for (const mobile of [false, true]) {
      const { w } = mountDetail({}, { mobile });
      expect(w.text()).not.toContain('%');
      expect(w.text()).not.toContain('Likely quality');
      expect(w.get('.quality-line').text()).toContain('Quality: Standard');
      wrapper?.unmount();
      wrapper = null;
    }
  });

  it('renders recipe, material and reagent names with markup literally', async () => {
    const evilRecipe = recipe(9n, XSS, { req1TemplateId: 50n, req1Count: 1n, req2TemplateId: 4n, req2Count: 1n });
    const evilMaterial = tpl(50n, XSS);
    const evilReagent = tpl(23n, 'Silver Token', { slot: 'misc', name: XSS });
    const evilOutput = tpl(100n, XSS, { slot: 'mainHand', weaponType: 'sword', tier: 1n, stackable: false });
    const { w } = mountDetail(
      {
        recipes: [evilRecipe],
        templates: [...TEMPLATES.filter((t) => t.id !== 100n), evilOutput, evilMaterial, evilReagent],
        items: [...ITEMS, inst(30n, 50n, 1n)],
      },
      { recipeId: 9n },
    );
    expect(w.get('h4').text()).toBe(XSS);
    expect(w.get('.use-name').text()).toBe(XSS);
    expect(w.find('img').exists()).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// CraftingScreen
// ---------------------------------------------------------------------------

function setWide(on: boolean): void {
  (window as unknown as { matchMedia: unknown }).matchMedia = (query: string) => ({
    matches: on && query.includes('1200'),
    media: query,
    addEventListener() {},
    removeEventListener() {},
  });
}

describe('CraftingScreen desktop', () => {
  function mountScreen(world: World = {}, wide = true) {
    setWide(wide);
    const ctx = buildWorld(world);
    wrapper = mount(CraftingScreen, { attachTo: document.body, global: ctx.global });
    return { ...ctx, w: wrapper };
  }

  it('at 1200px and wider shows the list, the detail and the Materials column (mock 9a order) with Discover pinned', async () => {
    const { w } = mountScreen();
    await nextTick();
    expect(w.get('.desk-grid').classes()).toContain('wide');
    expect(w.findAll('.desk-grid > .col').map((c) => c.classes().filter((k) => k !== 'col')[0])).toEqual([
      'list-col',
      'detail-col',
      'materials-col',
    ]);
    const materials = w.get('.materials-col');
    expect(materials.get('h6').text()).toBe('Materials on hand');
    expect(materials.find('button.discover').exists()).toBe(true);
    expect(w.findAll('button.recipe-row')).toHaveLength(5);
    expect(w.find('button.disclosure').exists()).toBe(false);
    expect(w.findAll('button.discover')).toHaveLength(1);
    expect(w.get('.detail-col h4').text()).toBe('Copper Sword');
    expect(w.findAll('button.recipe-row')[0].attributes('aria-pressed')).toBe('true');
    expect(read('CraftingScreen.vue')).toMatch(/\.desk-grid\.wide\s*\{\s*grid-template-columns: 300px minmax\(0, 1fr\) 210px;/);
    expect(read('CraftingScreen.vue')).toMatch(/\.desk-grid\s*\{[^}]*grid-template-columns: minmax\(0, 1fr\) 320px;/);
  });

  it('highlights the selected recipe materials in the Materials column and follows the selection', async () => {
    const { w } = mountScreen();
    await nextTick();
    const lit = () => w.findAll('.materials-col .m-row.highlighted').map((r) => r.get('.m-name').text());
    expect(lit()).toEqual(['Copper Ore', 'Rough Hide']);
    expect(w.get('.materials-col .caption').text()).toBe('Highlighted: used by the selected recipe.');
    await w.findAll('button.recipe-row')[1].trigger('click');
    expect(lit()).toEqual(['Iron Ore', 'Rough Hide']);
  });

  it('keeps the list and materials as the two columns, list first, with no recipes known', () => {
    const { w } = mountScreen({ knownIds: [] });
    expect(w.findAll('.desk-grid > .col').map((c) => c.classes().filter((k) => k !== 'col')[0])).toEqual([
      'list-col',
      'materials-col',
    ]);
    expect(read('CraftingScreen.vue')).toMatch(/\.desk-grid\.empty-grid\.wide\s*\{\s*grid-template-columns: minmax\(0, 1fr\) 210px;/);
  });

  it('at 900 to 1199px moves Materials into the list as a disclosure with Discover after the rows', async () => {
    const { w } = mountScreen({}, false);
    await nextTick();
    expect(w.find('.materials-col').exists()).toBe(false);
    expect(w.get('.list-col button.disclosure').text()).toBe('Materials on hand · 7');
    expect(w.findAll('.list-col button.discover')).toHaveLength(1);
    expect(w.find('.detail-col h4').exists()).toBe(true);
  });

  it('selects the first visible row by default, keeps the selection on a click and replaces it when filtered out', async () => {
    const { w } = mountScreen();
    await nextTick();
    expect(w.get('.detail-col h4').text()).toBe('Copper Sword');
    await w.findAll('button.recipe-row')[1].trigger('click');
    expect(w.get('.detail-col h4').text()).toBe('Iron Helm');
    await w.findAll('[role="group"] button')[1].trigger('click');
    await nextTick();
    expect(w.get('.detail-col h4').text()).toBe('Copper Sword');
    await w.findAll('[role="group"] button')[3].trigger('click');
    await nextTick();
    expect(w.find('.detail-col h4').exists()).toBe(false);
    expect(w.get('.detail-col .empty').text()).toBe('No accessory recipes known.');
  });

  it('shows No recipes known yet with the Discover button when none are known, and with no character', async () => {
    const empty = mountScreen({ knownIds: [] });
    expect(empty.w.text()).toContain('No recipes known yet.');
    await empty.w.get('button.discover').trigger('click');
    expect(empty.calls.researchRecipes).toHaveBeenCalledWith({ characterId: 7n });
    wrapper?.unmount();
    wrapper = null;
    const noCharacter = mountScreen({ character: null });
    expect(noCharacter.w.text()).toContain('No recipes known yet.');
    expect(noCharacter.w.find('.desk-grid').exists()).toBe(false);
  });

  it('with no recipes known still shows Materials on hand: the column at 1200px, a disclosure below (WR-04)', () => {
    const wide = mountScreen({ knownIds: [] });
    expect(wide.w.get('.materials-col h6').text()).toBe('Materials on hand');
    expect(wide.w.findAll('.materials-col .m-name')).toHaveLength(7);
    expect(wide.w.findAll('button.discover')).toHaveLength(1);
    expect(wide.w.find('.detail-col').exists()).toBe(false);
    wrapper?.unmount();
    wrapper = null;
    const narrow = mountScreen({ knownIds: [] }, false);
    expect(narrow.w.find('.materials-col').exists()).toBe(false);
    expect(narrow.w.get('button.disclosure').text()).toBe('Materials on hand · 7');
    expect(narrow.w.findAll('button.discover')).toHaveLength(1);
  });

  it('renders nothing until the recipe subscription has applied', () => {
    const { w } = mountScreen({ applied: false });
    expect(w.find('.desk-grid').exists()).toBe(false);
    expect(w.text()).toBe('');
  });

  it('wires Craft and Discover through the shared runner and shows the send error in the notice line', async () => {
    const { w } = mountScreen({ reducers: { craftRecipeCount: async () => Promise.reject(new Error('no')) } });
    await nextTick();
    await w.get('.detail-col button.craft-btn').trigger('click');
    await vi.waitFor(() => expect(w.get('[role="status"]').text()).toContain("Couldn't send that. Try again."));
  });

  it('shows the single quality line in the detail with no percent and no odds legend', async () => {
    const { w } = mountScreen();
    await nextTick();
    expect(w.get('.detail-col .quality-line').text()).toContain('Quality: Standard');
    expect(w.get('.detail-col').text()).not.toContain('%');
    expect(w.get('.detail-col').text()).not.toContain('Likely quality');
  });

  it('renders recipe and material names with markup literally', async () => {
    const evilRecipe = recipe(9n, XSS, { req1TemplateId: 50n, req1Count: 1n, req2TemplateId: 4n, req2Count: 1n });
    const evilOutput = tpl(100n, XSS, { slot: 'mainHand', weaponType: 'sword', tier: 1n, stackable: false });
    const { w } = mountScreen({
      recipes: [evilRecipe],
      knownIds: [9n],
      templates: [...TEMPLATES.filter((t) => t.id !== 100n), evilOutput, tpl(50n, XSS)],
      items: [...ITEMS, inst(30n, 50n, 1n)],
    });
    await nextTick();
    expect(w.get('.row-name').text()).toBe(XSS);
    expect(w.get('.detail-col h4').text()).toBe(XSS);
    expect(w.find('img').exists()).toBe(false);
  });
});

describe('CraftingScreen mobile', () => {
  function mountScreen(world: World = {}) {
    setWide(false);
    const ctx = buildWorld({ isDesktop: false, ...world });
    wrapper = mount(CraftingScreen, { attachTo: document.body, global: ctx.global });
    return { ...ctx, w: wrapper };
  }

  it('opens on the list view with the station line, chips, checkbox, Materials disclosure, rows and Discover', () => {
    const { w } = mountScreen();
    const view = w.get('.list-view');
    expect(view.get('.station-line .tag').text()).toBe('Crafting station');
    expect(view.find('[role="group"]').exists()).toBe(true);
    expect(view.find('label.radio').exists()).toBe(true);
    expect(view.find('button.disclosure').exists()).toBe(true);
    expect(view.findAll('button.recipe-row')).toHaveLength(5);
    expect(view.find('button.discover').exists()).toBe(true);
    expect(w.find('.detail-view').exists()).toBe(false);
    expect(view.attributes('style') ?? '').not.toContain('display: none');
  });

  it('says there is no station on the station line', () => {
    const { w } = mountScreen({ station: false });
    expect(w.get('.station-line .no-station').text()).toBe('No crafting station here');
    expect(w.find('.station-line .tag').exists()).toBe(false);
  });

  it('opens the detail view on a row, with All recipes at the top and the reason and Craft docked', async () => {
    const { w } = mountScreen();
    await w.findAll('button.recipe-row')[1].trigger('click');
    expect(w.get('.list-view').attributes('style')).toContain('display: none');
    const view = w.get('.detail-view');
    const back = view.get('button.back');
    expect(back.text()).toBe('All recipes');
    expect(back.classes()).toContain('btn-ghost');
    expect(back.find('svg').exists()).toBe(true);
    expect(view.get('h4').text()).toBe('Iron Helm');
    expect(view.get('.detail-dock button.craft-btn').text()).toBe('Craft Iron Helm');
    expect(view.get('.detail-dock button.craft-btn').attributes('aria-label')).toBe('Craft 1 Iron Helm');
    expect(read('CraftingScreen.vue')).toMatch(/\.back\s*\{[^}]*min-height: 44px;/);
  });

  it('choosing a row moves focus to All recipes instead of leaving it on the hidden row (WR-03)', async () => {
    const { w } = mountScreen();
    const row = w.findAll('button.recipe-row')[1];
    (row.element as HTMLElement).focus();
    await row.trigger('click');
    await nextTick();
    await nextTick();
    expect(document.activeElement).toBe(w.get('button.back').element);
  });

  it('with no recipes known shows the Materials disclosure on mobile (WR-04)', () => {
    const { w } = mountScreen({ knownIds: [] });
    expect(w.get('button.disclosure').text()).toBe('Materials on hand · 7');
    expect(w.findAll('button.discover')).toHaveLength(1);
  });

  it('All recipes returns to the list and puts focus on the row it came from', async () => {
    const { w } = mountScreen();
    await w.findAll('button.recipe-row')[2].trigger('click');
    await w.get('button.back').trigger('click');
    await nextTick();
    await nextTick();
    expect(w.find('.detail-view').exists()).toBe(false);
    expect(w.get('.list-view').attributes('style') ?? '').not.toContain('display: none');
    expect(document.activeElement).toBe(w.findAll('button.recipe-row')[2].element);
  });

  it('keeps the list filters across a detail visit', async () => {
    const { w } = mountScreen();
    await w.findAll('[role="group"] button')[1].trigger('click');
    await w.findAll('button.recipe-row')[0].trigger('click');
    await w.get('button.back').trigger('click');
    await nextTick();
    expect(w.findAll('[role="group"] button')[1].attributes('aria-pressed')).toBe('true');
    expect(w.findAll('button.recipe-row')).toHaveLength(2);
  });

  it('shows No recipes known yet with Discover when none are known', async () => {
    const { w, calls } = mountScreen({ knownIds: [] });
    expect(w.text()).toContain('No recipes known yet.');
    await w.get('button.discover').trigger('click');
    expect(calls.researchRecipes).toHaveBeenCalledWith({ characterId: 7n });
  });

  it('shows the single quality line and no percent in the mobile detail', async () => {
    const { w } = mountScreen();
    await w.findAll('button.recipe-row')[0].trigger('click');
    expect(w.get('.detail-view .quality-line').text()).toContain('Quality: Standard');
    expect(w.get('.detail-view').text()).not.toContain('%');
    expect(w.get('.detail-view').text()).not.toContain('Likely quality');
  });

  it('renders recipe names with markup literally', () => {
    const evilRecipe = recipe(9n, XSS, { req1TemplateId: 4n, req1Count: 1n, req2TemplateId: 1n, req2Count: 1n });
    const { w } = mountScreen({ recipes: [evilRecipe], knownIds: [9n] });
    expect(w.get('.row-name').text()).toBe(XSS);
    expect(w.find('img').exists()).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// The shared result card for crafts and Discover (Plan 50-37)
// ---------------------------------------------------------------------------

describe('Craft and Discover result card (Plan 50-37)', () => {
  const POTION = recipe(6n, 'Bandage Roll', {
    outputTemplateId: 103n,
    outputCount: 1n,
    req1TemplateId: 1n,
    req1Count: 2n,
    req2TemplateId: 4n,
    req2Count: 1n,
    recipeType: 'consumable',
  });
  const MADE_ID = 50n;

  function craftRow(seq: bigint, over: Record<string, unknown> = {}, lines?: ResultLine[]): ActionResult {
    return {
      characterId: 7n,
      seq,
      kind: 'craft',
      templateId: 103n,
      itemInstanceId: undefined,
      itemName: 'Bandage',
      rarity: 'common',
      craftQuality: undefined,
      quantity: 3n,
      recipeTemplateId: 6n,
      craftCount: 3n,
      linesJson: encodeResultLines(
        lines ?? [
          { kind: 'used', templateId: 1n, name: 'Copper Ore', quantity: 6n, total: 0n, instanceId: null },
          { kind: 'used', templateId: 4n, name: 'Rough Hide', quantity: 3n, total: 0n, instanceId: null },
        ],
      ),
      at: {},
      ...over,
    } as unknown as ActionResult;
  }

  function discoverRow(seq: bigint, found: bigint, lines: ResultLine[] = []): ActionResult {
    return {
      characterId: 7n,
      seq,
      kind: 'discover',
      templateId: undefined,
      itemInstanceId: undefined,
      itemName: '',
      rarity: '',
      craftQuality: undefined,
      quantity: found,
      recipeTemplateId: undefined,
      craftCount: 0n,
      linesJson: encodeResultLines(lines),
      at: {},
    } as unknown as ActionResult;
  }

  interface CardOptions {
    isDesktop?: boolean;
    wide?: boolean;
    gear?: boolean;
    outcome?: 'row' | 'reject' | 'silent';
    preset?: ActionResult | null;
    items?: ItemInstance[];
    character?: Record<string, unknown>;
    rowOver?: Record<string, unknown>;
    discoverFound?: bigint;
  }

  // The fake server: craft_recipe_count takes the recipe's materials and writes the next result row;
  // research_recipes writes a discover row.
  function mountCard(opts: CardOptions = {}) {
    setWide(opts.wide ?? opts.isDesktop !== false);
    const holder: { ctx?: ReturnType<typeof buildWorld>; seq: bigint } = { seq: opts.preset ? opts.preset.seq : 0n };
    const recipeUsed = opts.gear ? R_SWORD : POTION;
    const craftRecipeCount = vi.fn(async (args: { count: bigint }) => {
      const outcome = opts.outcome ?? 'row';
      if (outcome === 'reject') throw new Error('no');
      if (outcome === 'silent') return;
      const ctx = holder.ctx!;
      let next = ctx.items.value.map((row) => ({ ...row }));
      for (const [templateId, per] of [
        [recipeUsed.req1TemplateId, recipeUsed.req1Count],
        [recipeUsed.req2TemplateId, recipeUsed.req2Count],
      ] as Array<[bigint, bigint]>) {
        let remaining = per * args.count;
        next = next
          .map((row) => {
            if (row.templateId !== templateId || row.equippedSlot || remaining <= 0n) return row;
            const take = row.quantity < remaining ? row.quantity : remaining;
            remaining -= take;
            return { ...row, quantity: row.quantity - take };
          })
          .filter((row) => row.quantity > 0n);
      }
      if (opts.gear) next.push(inst(MADE_ID, 100n, 1n, { craftQuality: 'standard' }));
      ctx.items.value = next;
      holder.seq += 1n;
      ctx.lastResult.value = opts.gear
        ? craftRow(
            holder.seq,
            {
              templateId: 100n,
              itemInstanceId: MADE_ID,
              itemName: 'Copper Sword',
              craftQuality: 'standard',
              quantity: 1n,
              recipeTemplateId: 1n,
              craftCount: 1n,
              ...opts.rowOver,
            },
            [
              { kind: 'used', templateId: 1n, name: 'Copper Ore', quantity: 3n, total: 0n, instanceId: null },
              { kind: 'used', templateId: 4n, name: 'Rough Hide', quantity: 1n, total: 0n, instanceId: null },
            ],
          )
        : craftRow(
            holder.seq,
            { quantity: args.count, craftCount: args.count, ...opts.rowOver },
            [
              { kind: 'used', templateId: 1n, name: 'Copper Ore', quantity: 2n * args.count, total: 0n, instanceId: null },
              { kind: 'used', templateId: 4n, name: 'Rough Hide', quantity: args.count, total: 0n, instanceId: null },
            ],
          );
    });
    const researchRecipes = vi.fn(async () => {
      holder.seq += 1n;
      const found = opts.discoverFound ?? 0n;
      holder.ctx!.lastResult.value = discoverRow(
        holder.seq,
        found,
        found === 0n
          ? []
          : [
              { kind: 'recipe', templateId: 103n, name: 'Bandage Roll', quantity: 1n, total: 1n, instanceId: null },
              { kind: 'recipe', templateId: 100n, name: XSS, quantity: 1n, total: 1n, instanceId: null },
            ],
      );
    });
    const ctx = buildWorld({
      isDesktop: opts.isDesktop ?? true,
      recipes: [POTION, R_SWORD],
      knownIds: [opts.gear ? 1n : 6n],
      items: opts.items ?? [inst(1n, 1n, 10n), inst(2n, 4n, 5n)],
      character: {
        id: 7n,
        name: 'Hero',
        level: 5n,
        locationId: 10n,
        gold: 100n,
        className: 'Warrior',
        vendorSellMod: 100n,
        ...opts.character,
      },
      lastResult: opts.preset ?? null,
      reducers: { craftRecipeCount, researchRecipes } as unknown as Partial<LedgerReducers>,
    });
    holder.ctx = ctx;
    wrapper = mount(CraftingScreen, { attachTo: document.body, global: ctx.global });
    return { ...ctx, craftRecipeCount, researchRecipes, w: wrapper };
  }

  const dialog = () => wrapper!.find('[role="dialog"]');
  const cardButton = (label: string) => wrapper!.findAll('[role="dialog"] button').find((b) => b.text() === label);
  const flush = async () => {
    await new Promise((r) => setTimeout(r, 0));
    await nextTick();
    await nextTick();
  };

  // Press the Craft button the way a click does: focus it, then click.
  async function craft(count = 3, host = '.detail-col') {
    await nextTick();
    for (let i = 1; i < count; i += 1) await wrapper!.get(`${host} button[aria-label="One more"]`).trigger('click');
    const button = wrapper!.get(`${host} button.craft-btn`);
    (button.element as HTMLElement).focus();
    await button.trigger('click');
    await flush();
    return button;
  }

  it('opens the shared card with what the server reported after a craft of 3', async () => {
    mountCard();
    expect(dialog().exists()).toBe(false);
    await craft(3);
    const card = wrapper!.get('[role="dialog"]');
    expect(card.attributes('aria-modal')).toBe('true');
    expect(card.get('.kicker').text()).toBe('Crafted');
    expect(card.get('h4').text()).toBe('Bandage');
    expect(card.get('.qty-tag').text()).toBe('x3');
    expect(card.get('.sub').text()).toBe('3 added to your bag');
    expect(card.get('h6').text()).toBe('Used');
    const rows = card.findAll('.result-row');
    expect(rows.map((r) => r.get('.qty').text())).toEqual(['−6', '−3']);
    expect(rows[0].text()).toContain('Copper Ore');
    expect(card.get('.footer').text()).toBe('Items went to your backpack. Also written to your log.');
    expect(document.activeElement).toBe(cardButton('Done')!.element);
  });

  it('Esc closes the card only (the drawer stays) and focus returns to the Craft button', async () => {
    mountCard();
    const button = await craft(3);
    const drawer = vi.fn();
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
    expect(document.activeElement).toBe(button.element);
  });

  it('Done and a scrim click close the card and return focus to Craft', async () => {
    mountCard();
    const button = await craft(3);
    await cardButton('Done')!.trigger('click');
    await flush();
    expect(dialog().exists()).toBe(false);
    expect(document.activeElement).toBe(button.element);
    await button.trigger('click');
    await flush();
    expect(dialog().exists()).toBe(true);
    await wrapper!.get('.result-scrim').trigger('click');
    await flush();
    expect(dialog().exists()).toBe(false);
  });

  it('Craft again repeats the recipe with the smaller of the last count and what the bag now allows', async () => {
    const ctx = mountCard();
    await craft(3);
    // Copper 10 and Hide 5 minus a craft of 3 leaves Copper 4 and Hide 2: two more are possible.
    expect(ctx.craftRecipeCount).toHaveBeenCalledTimes(1);
    expect(ctx.craftRecipeCount).toHaveBeenCalledWith({ characterId: 7n, recipeTemplateId: 6n, count: 3n });
    await cardButton('Craft again')!.trigger('click');
    await flush();
    expect(ctx.craftRecipeCount).toHaveBeenCalledTimes(2);
    expect(ctx.craftRecipeCount).toHaveBeenLastCalledWith({ characterId: 7n, recipeTemplateId: 6n, count: 2n });
    // A new row with a higher seq replaced the content of the open card.
    expect(wrapper!.findAll('[role="dialog"]')).toHaveLength(1);
    expect(wrapper!.get('[role="dialog"] .qty-tag').text()).toBe('x2');
    expect(wrapper!.findAll('[role="dialog"] .result-row').map((r) => r.get('.qty').text())).toEqual(['−4', '−2']);
  });

  it('Craft again uses the last count when the bag still allows it', async () => {
    const ctx = mountCard({ items: [inst(1n, 1n, 20n), inst(2n, 4n, 10n)] });
    await craft(2);
    await cardButton('Craft again')!.trigger('click');
    await flush();
    expect(ctx.craftRecipeCount).toHaveBeenLastCalledWith({ characterId: 7n, recipeTemplateId: 6n, count: 2n });
  });

  it('hides Craft again when the bag allows no more, and when there is no station', async () => {
    mountCard({ items: [inst(1n, 1n, 6n), inst(2n, 4n, 3n)] });
    await craft(3);
    expect(dialog().exists()).toBe(true);
    expect(cardButton('Craft again')).toBeUndefined();
    expect(cardButton('Done')).toBeDefined();
    wrapper!.unmount();
    wrapper = null;

    const ctx = mountCard({ items: [inst(1n, 1n, 20n), inst(2n, 4n, 10n)] });
    await craft(1);
    expect(cardButton('Craft again')).toBeDefined();
    (ctx.game.locations as unknown as { value: unknown }).value = [
      { id: 10n, name: 'Forge Gate', craftingAvailable: false },
    ];
    await flush();
    expect(cardButton('Craft again')).toBeUndefined();
  });

  it('Craft again is inert while its call is pending and sends once', async () => {
    let release: () => void = () => undefined;
    const ctx = mountCard({ items: [inst(1n, 1n, 20n), inst(2n, 4n, 10n)] });
    await craft(1);
    ctx.craftRecipeCount.mockImplementation(() => new Promise<void>((resolveCall) => (release = resolveCall)));
    const again = cardButton('Craft again')!;
    await again.trigger('click');
    await again.trigger('click');
    expect(ctx.craftRecipeCount).toHaveBeenCalledTimes(2);
    expect(cardButton('Craft again')!.attributes('aria-disabled')).toBe('true');
    release();
    await flush();
  });

  it('Equip appears for gear the character can equip, equips the made instance and closes the card', async () => {
    const ctx = mountCard({ gear: true, items: [inst(1n, 1n, 9n), inst(2n, 4n, 3n)] });
    await craft(1);
    const card = wrapper!.get('[role="dialog"]');
    expect(card.get('.kicker').text()).toBe('Crafted');
    expect(card.get('.sub').text()).toContain('Standard quality');
    const equip = cardButton('Equip')!;
    expect(equip.find('svg').exists()).toBe(true);
    expect(equip.classes()).toContain('btn-primary');
    await equip.trigger('click');
    await flush();
    expect(ctx.calls.equipItem).toHaveBeenCalledTimes(1);
    expect(ctx.calls.equipItem).toHaveBeenCalledWith({ characterId: 7n, itemInstanceId: MADE_ID });
    expect(dialog().exists()).toBe(false);
  });

  it('hides Equip for gear the character cannot equip and for a consumable', async () => {
    mountCard({ gear: true, items: [inst(1n, 1n, 9n), inst(2n, 4n, 3n)], character: { weaponProficiencies: 'axe' } });
    await craft(1);
    expect(dialog().exists()).toBe(true);
    expect(cardButton('Equip')).toBeUndefined();
    wrapper!.unmount();
    wrapper = null;

    mountCard();
    await craft(3);
    expect(cardButton('Equip')).toBeUndefined();
    expect(cardButton('Craft again')).toBeDefined();
  });

  it('Discover ends on the card: Nothing new with the tip, focus back on the Discover button', async () => {
    mountCard({ discoverFound: 0n });
    await nextTick();
    const button = wrapper!.get('.materials-col button.discover');
    (button.element as HTMLElement).focus();
    await button.trigger('click');
    await flush();
    const card = wrapper!.get('[role="dialog"]');
    expect(card.get('.kicker').text()).toBe('Discover recipes');
    expect(card.get('h4').text()).toBe('Nothing new');
    expect(card.get('h6').text()).toBe('Tip');
    expect(card.get('.result-row').text()).toContain('Gather other materials to find new recipes.');
    expect(cardButton('Craft again')).toBeUndefined();
    await cardButton('Done')!.trigger('click');
    await flush();
    expect(dialog().exists()).toBe(false);
    expect(document.activeElement).toBe(button.element);
  });

  it('Discover with finds lists the new recipes as text', async () => {
    mountCard({ discoverFound: 2n });
    await nextTick();
    const button = wrapper!.get('.materials-col button.discover');
    (button.element as HTMLElement).focus();
    await button.trigger('click');
    await flush();
    const card = wrapper!.get('[role="dialog"]');
    expect(card.get('h4').text()).toBe('2 new recipes');
    expect(card.get('h6').text()).toBe('Found');
    const names = card.findAll('.result-row .name').map((n) => n.text());
    expect(names).toEqual(['Bandage Roll', XSS]);
    expect(wrapper!.find('img').exists()).toBe(false);
  });

  it('Discover at 900 to 1199px returns focus to the Discover button after the list rows', async () => {
    mountCard({ wide: false, discoverFound: 0n });
    await nextTick();
    const button = wrapper!.get('.list-col button.discover');
    (button.element as HTMLElement).focus();
    await button.trigger('click');
    await flush();
    expect(dialog().exists()).toBe(true);
    await cardButton('Done')!.trigger('click');
    await flush();
    expect(document.activeElement).toBe(button.element);
  });

  it('opens no card for a row present at mount or one that arrives with no action started', async () => {
    const ctx = mountCard({ preset: craftRow(1n) });
    await flush();
    expect(dialog().exists()).toBe(false);
    ctx.lastResult.value = craftRow(2n);
    await flush();
    expect(dialog().exists()).toBe(false);
    ctx.lastResult.value = discoverRow(3n, 0n);
    await flush();
    expect(dialog().exists()).toBe(false);
  });

  it('opens no card on a refusal, and the notice line says so', async () => {
    mountCard({ outcome: 'reject' });
    await craft(1);
    expect(dialog().exists()).toBe(false);
    expect(wrapper!.get('[role="status"]').text()).toBe("Couldn't send that. Try again.");
  });

  it('opens no card when the call settles without a new result row', async () => {
    mountCard({ outcome: 'silent' });
    await craft(1);
    expect(dialog().exists()).toBe(false);
  });

  it('renders the item and line names with markup as text', async () => {
    mountCard({ rowOver: { itemName: XSS } });
    await craft(3);
    expect(wrapper!.find('img').exists()).toBe(false);
    expect(wrapper!.get('[role="dialog"] h4').text()).toBe(XSS);
  });

  it('hosts the card in a position: relative screen root, with Craft again from the detail args', () => {
    const source = read('CraftingScreen.vue');
    expect(source).toMatch(/\.crafting-screen\s*\{[^}]*position: relative;/);
    expect(source).toMatch(/useActionResult\(/);
    expect(source).toMatch(/craft: 'craft'/);
    expect(source).toMatch(/discover: 'discover'/);
    expect(source).toMatch(/<ResultCard/);
    expect(source).toMatch(/craft-start/);
    expect(source).toMatch(/craftRecipeCount\(/);
    expect(source).not.toMatch(/hotbar/i);
  });

  describe('mobile 390x844', () => {
    async function craftMobile(count = 3) {
      await nextTick();
      await wrapper!.get('button.recipe-row').trigger('click');
      return craft(count, '.detail-view');
    }

    it('opens the bottom sheet with Done and Craft again only, no Equip and no chips', async () => {
      mountCard({ isDesktop: false, gear: true, items: [inst(1n, 1n, 20n), inst(2n, 4n, 10n)] });
      await craftMobile(1);
      const sheet = wrapper!.get('[role="dialog"]');
      expect(sheet.classes()).toContain('mobile');
      expect(wrapper!.get('.result-scrim').classes()).toContain('mobile');
      expect(wrapper!.findAll('[role="dialog"] button').map((b) => b.text())).toEqual(['Done', 'Craft again']);
      expect(cardButton('Equip')).toBeUndefined();
      expect(sheet.find('.chips').exists()).toBe(false);
    });

    it('Craft again on the sheet repeats the craft and Done returns focus to Craft', async () => {
      const ctx = mountCard({ isDesktop: false, items: [inst(1n, 1n, 20n), inst(2n, 4n, 10n)] });
      const button = await craftMobile(2);
      await cardButton('Craft again')!.trigger('click');
      await flush();
      expect(ctx.craftRecipeCount).toHaveBeenLastCalledWith({ characterId: 7n, recipeTemplateId: 6n, count: 2n });
      await cardButton('Done')!.trigger('click');
      await flush();
      expect(dialog().exists()).toBe(false);
      expect(document.activeElement).toBe(button.element);
    });

    it('falls back to the selected recipe row when the Craft button is gone', async () => {
      mountCard({ isDesktop: false });
      await craftMobile(1);
      expect(dialog().exists()).toBe(true);
      await wrapper!.get('button.back').trigger('click');
      await nextTick();
      await cardButton('Done')!.trigger('click');
      await flush();
      expect(dialog().exists()).toBe(false);
      expect(document.activeElement).toBe(wrapper!.get('button.recipe-row').element);
    });

    it('Discover on mobile ends on the sheet and returns to the Discover button', async () => {
      mountCard({ isDesktop: false, discoverFound: 0n });
      await nextTick();
      const button = wrapper!.get('.list-view button.discover');
      (button.element as HTMLElement).focus();
      await button.trigger('click');
      await flush();
      expect(wrapper!.get('[role="dialog"]').classes()).toContain('mobile');
      expect(wrapper!.findAll('[role="dialog"] button').map((b) => b.text())).toEqual(['Done']);
      await cardButton('Done')!.trigger('click');
      await flush();
      expect(document.activeElement).toBe(button.element);
    });
  });
});

// ---------------------------------------------------------------------------
// The Craft / Salvage switch and the Salvage result (Plan 50-38)
// ---------------------------------------------------------------------------

describe('Craft / Salvage switch (Plan 50-38)', () => {
  const GILDED = tpl(200n, 'Gilded Vest', { slot: 'chest', armorType: 'cloth', rarity: 'rare', stackable: false, vendorValue: 40n });
  const TUNIC = tpl(201n, 'Plain Tunic', { slot: 'chest', armorType: 'cloth', stackable: false });
  const SCROLL = tpl(202n, 'Scroll: Rope', { slot: 'misc' });
  const EVIL = tpl(203n, XSS, { slot: 'chest', armorType: 'cloth', rarity: 'rare', stackable: false });
  const SALVAGE_TEMPLATES = [...TEMPLATES, GILDED, TUNIC, SCROLL, EVIL];
  const GILDED_ID = 40n;
  const TUNIC_ID = 41n;
  const SCROLL_ID = 60n;
  const EVIL_ID = 42n;

  const gearItems = (): ItemInstance[] => [
    ...ITEMS,
    inst(GILDED_ID, 200n),
    inst(TUNIC_ID, 201n),
    inst(43n, 201n, 1n, { equippedSlot: 'chest' }),
  ];

  function salvageRow(seq: bigint, lines: ResultLine[], over: Record<string, unknown> = {}): ActionResult {
    return {
      characterId: 7n,
      seq,
      kind: 'salvage',
      templateId: 200n,
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

  const HIT: ResultLine[] = [{ kind: 'received', templateId: 4n, name: 'Rough Hide', quantity: 1n, total: 3n, instanceId: null }];

  interface SalvageOptions {
    isDesktop?: boolean;
    wide?: boolean;
    items?: ItemInstance[];
    templates?: ItemTemplate[];
    lines?: ResultLine[];
    scroll?: boolean;
    outcome?: 'row' | 'silent';
    preset?: ActionResult | null;
  }

  // The fake server: salvage_item drops the instance from the bag and writes the next result row.
  function mountSalvage(opts: SalvageOptions = {}) {
    const desktop = opts.isDesktop !== false;
    setWide(opts.wide ?? desktop);
    const holder: { ctx?: ReturnType<typeof buildWorld>; seq: bigint } = { seq: opts.preset ? opts.preset.seq : 0n };
    const salvageItem = vi.fn(async (args: { itemInstanceId: bigint }) => {
      if ((opts.outcome ?? 'row') === 'silent') return;
      const ctx = holder.ctx!;
      ctx.items.value = ctx.items.value.filter((row) => row.id !== args.itemInstanceId);
      holder.seq += 1n;
      const lines = [...(opts.lines ?? HIT)];
      if (opts.scroll) {
        lines.push({ kind: 'scroll', templateId: 202n, name: 'Scroll: Rope', quantity: 1n, total: 1n, instanceId: SCROLL_ID });
      }
      ctx.lastResult.value = salvageRow(holder.seq, lines);
    });
    const learnRecipeScroll = vi.fn(async () => undefined);
    const ctx = buildWorld({
      isDesktop: desktop,
      templates: opts.templates ?? SALVAGE_TEMPLATES,
      items: opts.items ?? (opts.scroll ? [...gearItems(), inst(SCROLL_ID, 202n)] : gearItems()),
      lastResult: opts.preset ?? null,
      reducers: { salvageItem, learnRecipeScroll } as unknown as Partial<LedgerReducers>,
    });
    holder.ctx = ctx;
    wrapper = mount(CraftingScreen, { attachTo: document.body, global: ctx.global });
    return { ...ctx, salvageItem, learnRecipeScroll, w: wrapper };
  }

  const tab = (label: string) => wrapper!.findAll('[role="tab"]').find((t) => t.text() === label)!;
  async function openSalvage() {
    await nextTick();
    await tab('Salvage').trigger('click');
    await nextTick();
  }
  const dialog = () => wrapper!.find('[role="dialog"]');
  const cardButton = (label: string) => wrapper!.findAll('[role="dialog"] button').find((b) => b.text() === label);
  const flush = async () => {
    await new Promise((r) => setTimeout(r, 0));
    await nextTick();
    await nextTick();
  };
  const salvageRowNames = () => wrapper!.findAll('button.salvage-row .row-name').map((r) => r.text());

  // Selects the Gilded Vest, presses Salvage and answers the confirm.
  async function salvageGilded(host: string) {
    await openSalvage();
    await wrapper!.get(`button.salvage-row[data-instance-id="${GILDED_ID}"]`).trigger('click');
    await nextTick();
    await nextTick();
    const button = wrapper!.get(`${host} button.salvage-btn`);
    (button.element as HTMLElement).focus();
    await button.trigger('click');
    await nextTick();
    await wrapper!.findAll('.inline-confirm button')[0].trigger('click');
    await flush();
  }

  describe('the switch', () => {
    it('renders a tablist named Crafting mode with Craft and Salvage and their icons, Craft selected', async () => {
      const { w } = mountSalvage();
      await nextTick();
      expect(w.get('[role="tablist"]').attributes('aria-label')).toBe('Crafting mode');
      const tabs = w.findAll('[role="tab"]');
      expect(tabs.map((t) => t.text())).toEqual(['Craft', 'Salvage']);
      expect(tabs.map((t) => t.attributes('aria-selected'))).toEqual(['true', 'false']);
      for (const t of tabs) expect(t.find('svg').exists()).toBe(true);
      expect(w.find('button.recipe-row').exists()).toBe(true);
      expect(w.find('button.salvage-row').exists()).toBe(false);
    });

    it('works with the arrow, Home and End keys', async () => {
      const { w } = mountSalvage();
      await nextTick();
      const press = async (key: string) => {
        w.get('[role="tablist"]').element.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true }));
        await nextTick();
        await nextTick();
      };
      await press('ArrowRight');
      expect(tab('Salvage').attributes('aria-selected')).toBe('true');
      expect(w.find('button.salvage-row').exists()).toBe(true);
      await press('Home');
      expect(tab('Craft').attributes('aria-selected')).toBe('true');
      await press('End');
      expect(tab('Salvage').attributes('aria-selected')).toBe('true');
    });

    it('starts the Salvage panel with the count line', async () => {
      const { w } = mountSalvage();
      await openSalvage();
      expect(w.get('.salvage-count').text()).toBe('2 items can be salvaged');
    });

    it('says 1 item (singular) for one salvageable item', async () => {
      mountSalvage({ items: [inst(GILDED_ID, 200n)] });
      await openSalvage();
      expect(wrapper!.get('.salvage-count').text()).toBe('1 item can be salvaged');
    });

    it('opens on Craft with the whole Craft panel in it', async () => {
      const { w } = mountSalvage();
      await nextTick();
      expect(w.get('[role="tabpanel"] .desk-grid').classes()).toContain('wide');
      expect(w.findAll('button.recipe-row')).toHaveLength(5);
    });
  });

  describe('Salvage panel layouts', () => {
    const colNames = (grid: { element: Element }) =>
      Array.from(grid.element.children).map((c) => Array.from(c.classList).filter((k) => k !== 'col')[0]);

    it('wide: the list, the detail and the Materials column, with the first row selected', async () => {
      const { w } = mountSalvage();
      await openSalvage();
      const grid = w.get('[role="tabpanel"] .desk-grid');
      expect(grid.classes()).toContain('wide');
      expect(colNames(grid)).toEqual(['list-col', 'detail-col', 'materials-col']);
      expect(salvageRowNames()).toEqual(['Gilded Vest', 'Plain Tunic']);
      expect(w.get('button.salvage-row').attributes('aria-pressed')).toBe('true');
      expect(grid.get('.detail-col .item-card h4').text()).toBe('Gilded Vest');
      expect(grid.get('.detail-col h6').text()).toBe('May return');
    });

    it('900 to 1199: the list and the detail only', async () => {
      const { w } = mountSalvage({ wide: false });
      await openSalvage();
      const grid = w.get('[role="tabpanel"] .desk-grid');
      expect(grid.classes()).not.toContain('wide');
      expect(colNames(grid)).toEqual(['list-col', 'detail-col']);
      expect(grid.find('.detail-col .salvage-detail').exists()).toBe(true);
    });

    it('selecting another row shows its detail', async () => {
      const { w } = mountSalvage();
      await openSalvage();
      await w.findAll('button.salvage-row')[1].trigger('click');
      expect(w.get('.detail-col .item-card h4').text()).toBe('Plain Tunic');
    });

    it('shows the empty line and no detail with nothing to salvage', async () => {
      const { w } = mountSalvage({ items: ITEMS });
      await openSalvage();
      expect(w.get('.salvage-count').text()).toBe('0 items can be salvaged');
      expect(w.get('.salvage-list .empty').text()).toBe('Nothing left to salvage.');
      expect(w.find('.salvage-detail').exists()).toBe(false);
    });

    it('mobile: the list view, then the detail with All gear (44px) that returns focus to the row', async () => {
      const { w } = mountSalvage({ isDesktop: false });
      await openSalvage();
      expect(w.find('.salvage-detail-view').exists()).toBe(false);
      expect(w.get('.salvage-list-view').attributes('style') ?? '').not.toContain('display: none');
      expect(w.get('button.salvage-row').attributes('aria-pressed')).toBe('false');
      await w.findAll('button.salvage-row')[1].trigger('click');
      await nextTick();
      await nextTick();
      expect(w.get('.salvage-list-view').attributes('style')).toContain('display: none');
      const back = w.get('.salvage-detail-view button.back');
      expect(back.text()).toBe('All gear');
      expect(document.activeElement).toBe(back.element);
      expect(w.get('.salvage-detail-view .item-card h4').text()).toBe('Plain Tunic');
      expect(read('CraftingScreen.vue')).toMatch(/\.back\s*\{[^}]*min-height: 44px;/);
      await back.trigger('click');
      await nextTick();
      await nextTick();
      expect(w.find('.salvage-detail-view').exists()).toBe(false);
      expect(document.activeElement).toBe(w.findAll('button.salvage-row')[1].element);
    });
  });

  describe('the salvage result', () => {
    it('ends on the shared card with exactly what the server reported', async () => {
      const ctx = mountSalvage();
      await salvageGilded('.detail-col');
      expect(ctx.salvageItem).toHaveBeenCalledWith({ characterId: 7n, itemInstanceId: GILDED_ID });
      const card = wrapper!.get('[role="dialog"]');
      expect(card.get('.kicker').text()).toBe('Salvaged');
      expect(card.get('h4').text()).toBe('Gilded Vest');
      const rows = card.findAll('.result-row');
      expect(rows).toHaveLength(1);
      expect(rows[0].text()).toContain('Rough Hide');
      expect(rows[0].get('.qty').text()).toBe('+1');
      expect(rows[0].get('.total').text()).toBe('now 3');
      expect(card.text()).not.toMatch(/chance/i);
      expect(card.text()).not.toContain('May return');
      expect(cardButton('Read scroll')).toBeUndefined();
      expect(cardButton('Open crafting')).toBeUndefined();
    });

    it('offers Read scroll only for a granted scroll, calls learnRecipeScroll once and closes', async () => {
      const ctx = mountSalvage({ scroll: true });
      await salvageGilded('.detail-col');
      expect(wrapper!.findAll('[role="dialog"] button').map((b) => b.text())).toEqual(['Done', 'Read scroll']);
      await cardButton('Read scroll')!.trigger('click');
      await flush();
      expect(ctx.learnRecipeScroll).toHaveBeenCalledTimes(1);
      expect(ctx.learnRecipeScroll).toHaveBeenCalledWith({ characterId: 7n, itemInstanceId: SCROLL_ID });
      expect(dialog().exists()).toBe(false);
    });

    it('after Done, focus lands on the newly selected salvage row (desktop)', async () => {
      mountSalvage();
      await salvageGilded('.detail-col');
      await cardButton('Done')!.trigger('click');
      await flush();
      expect(dialog().exists()).toBe(false);
      expect(salvageRowNames()).toEqual(['Plain Tunic']);
      const row = wrapper!.get('button.salvage-row');
      expect(row.attributes('aria-pressed')).toBe('true');
      expect(document.activeElement).toBe(row.element);
    });

    it('an empty roll opens the card with Nothing usable was left and nothing else', async () => {
      mountSalvage({ lines: [] });
      await salvageGilded('.detail-col');
      const card = wrapper!.get('[role="dialog"]');
      expect(card.get('.kicker').text()).toBe('Salvaged');
      expect(card.get('h4').text()).toBe('Gilded Vest');
      expect(card.get('.empty').text()).toBe('Nothing usable was left.');
      expect(card.findAll('.result-row')).toHaveLength(0);
      expect(card.find('.total').exists()).toBe(false);
      expect(card.text()).not.toContain('now ');
      expect(cardButton('Read scroll')).toBeUndefined();
      expect(wrapper!.get('[role="status"]').text()).toBe('Salvaged Gilded Vest. Nothing usable was left.');
      await cardButton('Done')!.trigger('click');
      await flush();
      expect(dialog().exists()).toBe(false);
      expect(document.activeElement).toBe(wrapper!.get('button.salvage-row').element);
    });

    it('a refused salvage (no row) opens no card', async () => {
      const ctx = mountSalvage({ outcome: 'silent' });
      await salvageGilded('.detail-col');
      expect(ctx.salvageItem).toHaveBeenCalledTimes(1);
      expect(dialog().exists()).toBe(false);
    });

    it('a row present at mount opens no card', async () => {
      mountSalvage({ preset: salvageRow(5n, HIT) });
      await openSalvage();
      expect(dialog().exists()).toBe(false);
    });
  });

  describe('mobile 390x844', () => {
    it('tabs are at least 44px tall (the SegTabs rule)', () => {
      expect(readFileSync(resolve(process.cwd(), 'src/ledger/SegTabs.vue'), 'utf8')).toMatch(/\.seg-opt\s*\{[^}]*min-height: 44px/);
    });

    it('still asks for a rare item with the shared prompt, then ends on the bottom sheet', async () => {
      const ctx = mountSalvage({ isDesktop: false });
      await openSalvage();
      await wrapper!.get('button.salvage-row').trigger('click');
      await nextTick();
      await wrapper!.get('.salvage-detail-view button.salvage-btn').trigger('click');
      const prompt = wrapper!.get('.inline-confirm .confirm-prompt').text();
      expect(prompt.startsWith('Salvage destroys this item.')).toBe(true);
      expect(prompt).not.toMatch(/\d/);
      expect(ctx.salvageItem).not.toHaveBeenCalled();
      await wrapper!.findAll('.inline-confirm button')[0].trigger('click');
      await flush();
      const sheet = wrapper!.get('[role="dialog"]');
      expect(sheet.classes()).toContain('mobile');
      expect(sheet.find('.result-row').exists()).toBe(true);
    });

    it('an empty roll shows the plain text in the bottom sheet, and Done returns to the list', async () => {
      mountSalvage({ isDesktop: false, lines: [] });
      await salvageGilded('.salvage-detail-view');
      const sheet = wrapper!.get('[role="dialog"]');
      expect(sheet.classes()).toContain('mobile');
      expect(sheet.get('.empty').text()).toBe('Nothing usable was left.');
      await cardButton('Done')!.trigger('click');
      await flush();
      expect(dialog().exists()).toBe(false);
      expect(wrapper!.find('.salvage-detail-view').exists()).toBe(false);
      expect(wrapper!.get('.salvage-list').element.contains(document.activeElement)).toBe(true);
    });
  });

  describe('escape', () => {
    it('renders a markup item name as text in the list and the detail', async () => {
      mountSalvage({ items: [inst(EVIL_ID, 203n)], lines: [] });
      await openSalvage();
      expect(wrapper!.get('.row-name').text()).toBe(XSS);
      expect(wrapper!.get('.detail-col .item-card h4').text()).toBe(XSS);
      expect(wrapper!.find('img').exists()).toBe(false);
    });

    it('renders a markup line name in the card as text', async () => {
      mountSalvage({
        lines: [{ kind: 'received', templateId: 4n, name: XSS, quantity: 1n, total: 1n, instanceId: null }],
      });
      await salvageGilded('.detail-col');
      expect(wrapper!.get('[role="dialog"] .result-row .name').text()).toBe(XSS);
      expect(wrapper!.find('img').exists()).toBe(false);
    });
  });

  describe('source', () => {
    it('adds the switch, the salvage key and both salvage components', () => {
      const source = read('CraftingScreen.vue');
      expect(source).toContain('Crafting mode');
      expect(source).toContain("salvage: 'salvage'");
      expect(source).toContain('<SalvageList');
      expect(source).toContain('<SalvageDetail');
      expect(source.match(/PhRecycle/g)!.length).toBeGreaterThanOrEqual(2);
    });
  });
});
