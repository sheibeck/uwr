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

  it('shows the Recipe kicker, the h4 name, the meta line with the level in red and the have-of-need tiles', () => {
    const { w } = mountDetail({}, { recipeId: 2n });
    expect(w.get('.kicker').text()).toBe('Recipe');
    expect(w.get('h4').text()).toBe('Iron Helm');
    expect(w.get('.meta').text()).toBe('Head · Plate · Tier 2 · Requires Lv 6');
    expect(w.get('.meta-part.short').text()).toBe('Requires Lv 6');
    const tiles = w.findAll('.tile');
    expect(tiles.map((t) => t.get('.tile-name').text())).toEqual(['Iron Ore', 'Rough Hide']);
    expect(tiles[0].get('.have').text()).toBe('3');
    expect(tiles[0].get('.of').text()).toBe('of 2');
    expect(tiles[0].get('.have').classes()).not.toContain('short');
  });

  it('marks a short have count in red', () => {
    const { w } = mountDetail({}, { recipeId: 4n });
    const tiles = w.findAll('.tile');
    expect(tiles[0].get('.have').text()).toBe('1');
    expect(tiles[0].get('.have').classes()).toContain('short');
    expect(tiles[1].get('.have').classes()).not.toContain('short');
  });

  it('shows Quality with the tier in its craft color and the upgrade hint, with no bar, legend or percent', () => {
    const { w } = mountDetail();
    const quality = w.get('.quality');
    expect(quality.get('h6').text()).toBe('Quality');
    expect(quality.get('.tier').text()).toBe('Standard');
    expect(quality.get('.tier').attributes('style')).toContain('var(--color-craft-standard)');
    expect(quality.get('.hint').text()).toBe('A recipe with a tier 2 primary material would make it Reinforced.');
    expect(w.text()).not.toContain('%');
    expect(w.text()).not.toContain('Likely quality');
    expect(w.find('[role="img"]').exists()).toBe(false);
  });

  it('shows no hint for the top tier and uses the matching craft color', () => {
    const { w } = mountDetail({}, { recipeId: 3n });
    expect(w.get('.tier').text()).toBe('Exquisite');
    expect(w.get('.tier').attributes('style')).toContain('var(--color-craft-exquisite)');
    expect(w.find('.hint').exists()).toBe(false);
  });

  it('renders neither the quality line nor the reagent section for a consumable recipe', () => {
    const { w } = mountDetail({}, { recipeId: 4n });
    expect(w.find('.quality').exists()).toBe(false);
    expect(w.find('.reagents').exists()).toBe(false);
    expect(w.get('.meta').text()).toBe('Tier 1 · Makes 2');
  });

  it('opens the essence picker, fills the slot with the chosen essence and reveals the reagent slots', async () => {
    const { w } = mountDetail();
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
    expect(calls.craftRecipe).toHaveBeenLastCalledWith({ characterId: 7n, recipeTemplateId: 1n });
  });

  it('sends the essence and reagent ids through craftRecipe', async () => {
    const items = [...ITEMS, inst(20n, 3n, 2n), inst(21n, 2n, 1n), inst(22n, 12n, 1n)];
    const { w, calls } = mountDetail({ items }, { recipeId: 3n });
    await slotButton(w, 'Add essence').trigger('click');
    await w.findAll('[role="option"]').find((o) => o.text().includes('Greater Essence'))!.trigger('click');
    const reagentButtons = w.findAll('button.slot-main').filter((b) => b.text().includes('Add reagent'));
    expect(reagentButtons).toHaveLength(3);
    await reagentButtons[1].trigger('click');
    await w.findAll('[role="option"]').find((o) => o.text().includes('Ancient Rune'))!.trigger('click');
    await w.get('button.craft-btn').trigger('click');
    expect(calls.craftRecipe).toHaveBeenCalledTimes(1);
    expect(calls.craftRecipe).toHaveBeenCalledWith({
      characterId: 7n,
      recipeTemplateId: 3n,
      catalystTemplateId: 12n,
      modifier1TemplateId: 21n,
    });
  });

  it('shows Craft with the recipe name, runs once and is inert while pending', async () => {
    let release: () => void = () => undefined;
    const craftRecipe = vi.fn(() => new Promise<void>((resolveCall) => (release = resolveCall)));
    const { w } = mountDetail({ reducers: { craftRecipe } as Partial<LedgerReducers> });
    const button = w.get('button.craft-btn');
    expect(button.text()).toBe('Craft Copper Sword');
    expect(button.attributes('aria-label')).toBe('Craft Copper Sword');
    expect(button.find('svg').exists()).toBe(true);
    await button.trigger('click');
    await button.trigger('click');
    expect(craftRecipe).toHaveBeenCalledTimes(1);
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
    expect(noStation.calls.craftRecipe).not.toHaveBeenCalled();
    wrapper?.unmount();
    wrapper = null;

    const missing = mountDetail({}, { recipeId: 4n });
    expect(missing.w.get('.reason').text()).toBe('Missing 1 Rough Hide.');
    await missing.w.get('button.craft-btn').trigger('click');
    expect(missing.calls.craftRecipe).not.toHaveBeenCalled();
    missing.w.unmount();
    wrapper = null;

    const reagentless = mountDetail();
    await slotButton(reagentless.w, 'Add essence').trigger('click');
    await reagentless.w.findAll('[role="option"]')[0].trigger('click');
    expect(reagentless.w.get('.reason').text()).toBe('Add a reagent to use the essence, or remove it.');
    expect(reagentless.w.get('button.craft-btn').attributes('aria-disabled')).toBe('true');
  });

  it('keeps the slots unavailable without a station and offline', async () => {
    const { w } = mountDetail({ station: false });
    const essence = slotButton(w, 'Add essence');
    expect(essence.attributes('aria-disabled')).toBe('true');
    await essence.trigger('click');
    expect(w.find('[role="listbox"]').exists()).toBe(false);
    wrapper?.unmount();
    wrapper = null;
    const offline = mountDetail({ connected: false });
    await offline.w.get('button.craft-btn').trigger('click');
    expect(offline.calls.craftRecipe).not.toHaveBeenCalled();
  });

  it('keeps the choices after a craft and clears the ones whose items are used up', async () => {
    const { w, items } = mountDetail();
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
    await slotButton(w, 'Add essence').trigger('click');
    await w.findAll('[role="option"]')[0].trigger('click');
    expect(w.find('.slot.filled').exists()).toBe(true);
    await w.setProps({ recipeId: 3n });
    expect(w.get('h4').text()).toBe('Darksteel Blade');
    expect(w.find('.slot.filled').exists()).toBe(false);
  });

  it('mobile: Craft text with the full aria-label, material rows with have / need, no kicker, a docked reason', () => {
    const { w } = mountDetail({ station: false }, { mobile: true, recipeId: 4n });
    expect(w.find('.kicker').exists()).toBe(false);
    const craft = w.get('button.craft-btn');
    expect(craft.text()).toBe('Craft');
    expect(craft.attributes('aria-label')).toBe('Craft Bandage');
    const rows = w.findAll('li.material-row');
    expect(rows.map((r) => r.text())).toEqual(['Rough Hide1 / 2', 'Copper Ore5 / 1']);
    expect(rows[0].get('.mat-count').classes()).toContain('short');
    expect(rows[1].get('.mat-count').classes()).toContain('met');
    expect(w.get('.detail-dock .reason').text()).toBe('No crafting station here.');
    const source = read('RecipeDetail.vue');
    expect(source).toMatch(/\.mobile \.craft-btn\s*\{\s*min-height: 44px;/);
    expect(source).toMatch(/\.craft-btn\s*\{[^}]*min-height: 40px;/);
    expect(source).toMatch(/\.material-row\s*\{[^}]*min-height: 44px;/);
    expect(source).toMatch(/\.mobile \.slot-main\s*\{\s*min-height: 44px;/);
  });

  it('contains no percent sign and no Likely quality text in a mounted gear recipe, on either layout', () => {
    for (const mobile of [false, true]) {
      const { w } = mountDetail({}, { mobile });
      expect(w.text()).not.toContain('%');
      expect(w.text()).not.toContain('Likely quality');
      expect(w.get('.quality h6').text()).toBe('Quality');
      wrapper?.unmount();
      wrapper = null;
    }
  });

  it('renders recipe, material and reagent names with markup literally', async () => {
    const evilRecipe = recipe(9n, XSS, { req1TemplateId: 50n, req1Count: 1n, req2TemplateId: 4n, req2Count: 1n });
    const evilMaterial = tpl(50n, XSS);
    const evilReagent = tpl(23n, 'Silver Token', { slot: 'misc', name: XSS });
    const { w } = mountDetail(
      {
        recipes: [evilRecipe],
        templates: [...TEMPLATES, evilMaterial, evilReagent],
        items: [...ITEMS, inst(30n, 50n, 1n)],
      },
      { recipeId: 9n },
    );
    expect(w.get('h4').text()).toBe(XSS);
    expect(w.get('.tile-name').text()).toBe(XSS);
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

  it('at 1200px and wider shows the Materials column with Discover pinned, the list and the selected detail', async () => {
    const { w } = mountScreen();
    await nextTick();
    expect(w.get('.desk-grid').classes()).toContain('wide');
    const materials = w.get('.materials-col');
    expect(materials.get('h6').text()).toBe('Materials on hand');
    expect(materials.find('button.discover').exists()).toBe(true);
    expect(w.findAll('button.recipe-row')).toHaveLength(5);
    expect(w.find('button.disclosure').exists()).toBe(false);
    expect(w.get('.detail-col h4').text()).toBe('Copper Sword');
    expect(w.findAll('button.recipe-row')[0].attributes('aria-pressed')).toBe('true');
    expect(read('CraftingScreen.vue')).toMatch(/\.desk-grid\.wide\s*\{\s*grid-template-columns: 200px 360px minmax\(0, 1fr\);/);
    expect(read('CraftingScreen.vue')).toMatch(/\.desk-grid\s*\{[^}]*grid-template-columns: minmax\(0, 1fr\) 320px;/);
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
    const { w } = mountScreen({ reducers: { craftRecipe: async () => Promise.reject(new Error('no')) } });
    await nextTick();
    await w.get('.detail-col button.craft-btn').trigger('click');
    await vi.waitFor(() => expect(w.get('[role="status"]').text()).toContain("Couldn't send that. Try again."));
  });

  it('shows the single quality line in the detail with no percent and no odds legend', async () => {
    const { w } = mountScreen();
    await nextTick();
    expect(w.get('.detail-col .quality .tier').text()).toBe('Standard');
    expect(w.get('.detail-col').text()).not.toContain('%');
    expect(w.get('.detail-col').text()).not.toContain('Likely quality');
  });

  it('renders recipe and material names with markup literally', async () => {
    const evilRecipe = recipe(9n, XSS, { req1TemplateId: 50n, req1Count: 1n, req2TemplateId: 4n, req2Count: 1n });
    const { w } = mountScreen({
      recipes: [evilRecipe],
      knownIds: [9n],
      templates: [...TEMPLATES, tpl(50n, XSS)],
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
    expect(view.get('.detail-dock button.craft-btn').text()).toBe('Craft');
    expect(view.get('.detail-dock button.craft-btn').attributes('aria-label')).toBe('Craft Iron Helm');
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
    expect(w.get('.detail-view .quality .tier').text()).toBe('Standard');
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
