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
import type { ItemInstance, ItemTemplate, RecipeTemplate } from '../module_bindings/types';
import RecipeDetail from './RecipeDetail.vue';

const XSS = '<img src=x onerror=alert(1)>';
const source = readFileSync(resolve(process.cwd(), 'src/crafting/RecipeDetail.vue'), 'utf8');

let wrapper: VueWrapper | null = null;
afterEach(() => {
  wrapper?.unmount();
  wrapper = null;
  document.body.innerHTML = '';
});

// ---------------------------------------------------------------------------
// fixtures
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
const HIDE = tpl(4n, 'Rough Hide', { tier: 1n });
const ESSENCE = tpl(11n, 'Essence', { slot: 'misc' });
const STONE = tpl(20n, 'Glowing Stone', { slot: 'misc' });
const SWORD = tpl(100n, 'Copper Sword', {
  slot: 'mainHand',
  weaponType: 'sword',
  tier: 1n,
  stackable: false,
  weaponBaseDamage: 4n,
  weaponDps: 5n,
});
const HELM = tpl(101n, 'Iron Helm', { slot: 'head', armorType: 'plate', tier: 2n, stackable: false, requiredLevel: 6n, armorClassBonus: 3n });
const BANDAGE = tpl(103n, 'Bandage', {
  slot: 'consumable',
  tier: 1n,
  stackable: true,
  wellFedDurationMicros: 60_000_000n,
  wellFedBuffType: 'str',
  wellFedBuffMagnitude: 2n,
});
const TEMPLATES = [COPPER, IRON, HIDE, ESSENCE, STONE, SWORD, HELM, BANDAGE];

const R_SWORD = recipe(1n, 'Copper Sword', { outputTemplateId: 100n, req1TemplateId: 1n, req1Count: 3n, req2TemplateId: 4n, req2Count: 1n });
const R_HELM = recipe(2n, 'Iron Helm', {
  outputTemplateId: 101n,
  req1TemplateId: 2n,
  req1Count: 2n,
  req2TemplateId: 4n,
  req2Count: 1n,
  recipeType: 'armor',
});
const R_BANDAGE = recipe(4n, 'Bandage', {
  outputTemplateId: 103n,
  outputCount: 2n,
  req1TemplateId: 4n,
  req1Count: 2n,
  req2TemplateId: 1n,
  req2Count: 1n,
  recipeType: 'consumable',
});
const RECIPES = [R_SWORD, R_HELM, R_BANDAGE];

// Copper 9, Hide 5, Iron 3, Essence 1, Glowing Stone 2.
const ITEMS = [inst(1n, 1n, 9n), inst(2n, 4n, 5n), inst(3n, 2n, 3n), inst(4n, 11n, 1n), inst(5n, 20n, 2n)];

interface World {
  items?: ItemInstance[];
  templates?: ItemTemplate[];
  recipes?: RecipeTemplate[];
  station?: boolean;
  connected?: boolean;
  reducers?: Partial<LedgerReducers>;
}

function buildWorld(world: World) {
  const connected = ref(world.connected ?? true);
  const items = shallowRef<readonly ItemInstance[]>(world.items ?? ITEMS);
  const calls = {
    craftRecipe: vi.fn(async () => undefined),
    craftRecipeCount: vi.fn(async () => undefined),
  };
  const reducers = { ...calls, ...world.reducers } as unknown as LedgerReducers;
  const game = {
    ...createInertGame(),
    character: ref({ id: 7n, name: 'Hero', level: 5n, locationId: 10n, gold: 100n, className: 'Warrior', vendorSellMod: 100n }),
    locations: ref([{ id: 10n, name: 'Forge Gate', craftingAvailable: world.station ?? true }]),
    renownPerks: ref([]),
    connected,
  } as unknown as GameData;
  const ledger = {
    ...createInertLedger(),
    items,
    itemsApplied: ref(true),
    templates: ref(new Map((world.templates ?? TEMPLATES).map((t) => [t.id, t]))),
    recipesApplied: ref(true),
    recipes: ref(new Map((world.recipes ?? RECIPES).map((r) => [r.id, r]))),
    reducers: computed(() => (connected.value ? reducers : null)),
  } as unknown as LedgerData;
  const frame = { ...createInertFrame(), isDesktop: ref(true) } as unknown as FrameControls;
  const runner = createActionRunner({ online: computed(() => connected.value && ledger.reducers.value !== null) });
  return {
    connected,
    items,
    calls,
    runner,
    global: {
      provide: { [GAME_KEY as symbol]: game, [LEDGER_KEY as symbol]: ledger, [FRAME_KEY as symbol]: frame },
    },
  };
}

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

async function openSlots(w: VueWrapper): Promise<void> {
  const toggle = w.get('button.reagent-toggle');
  if (toggle.attributes('aria-expanded') !== 'true') await toggle.trigger('click');
}

// ---------------------------------------------------------------------------
// Task 1: Creates card, Uses, quality line and the single reagent slot
// ---------------------------------------------------------------------------

describe('RecipeDetail body (mock 9a)', () => {
  it('desktop gear: the Creates card, the Uses rows, the quality line with its hint and the closed reagent slot', () => {
    const { w } = mountDetail();
    const card = w.get('.item-card');
    expect(card.get('.kicker').text()).toBe('Creates');
    expect(card.get('h4').text()).toBe('Copper Sword');
    expect(card.get('h4').attributes('style')).toContain('var(--color-text)');
    expect(card.findAll('.stat-tile').map((t) => t.text())).toEqual(['Damage4', 'DPS5']);
    expect(card.get('.meta').text()).toContain('Sells for');

    expect(w.get('.uses-head h6').text()).toBe('Uses');
    const rows = w.findAll('ul.uses li');
    expect(rows.map((r) => r.get('.use-name').text())).toEqual(['Copper Ore', 'Rough Hide']);
    expect(rows[0].get('.have').text()).toBe('9');
    expect(rows[0].get('.have').classes()).toContain('met');
    expect(rows[0].get('.of').text()).toBe('/ 3');
    expect(rows[0].find('svg').exists()).toBe(true);

    const line = w.get('p.quality-line');
    expect(line.find('svg').exists()).toBe(true);
    expect(line.text()).toContain('Quality: Standard');
    expect(line.text()).toContain('Tier 1 Copper Ore');
    expect(w.get('p.hint').text()).toBe('A recipe with a tier 2 primary material would make it Reinforced.');

    const toggle = w.get('button.reagent-toggle');
    expect(toggle.text()).toContain('Add Essence + reagent');
    expect(toggle.text()).toContain('optional · adds an affix');
    expect(toggle.attributes('aria-expanded')).toBe('false');
    expect(toggle.attributes('aria-controls')).toBeTruthy();
    expect(w.find('button.slot-main').exists()).toBe(false);
  });

  it('marks a short have count in red and keeps no odds bar, percent or quality tier word block', () => {
    const { w } = mountDetail({}, { recipeId: 4n });
    const rows = w.findAll('ul.uses li');
    expect(rows[0].get('.have').text()).toBe('5');
    expect(rows[0].get('.have').classes()).toContain('met');
    const short = mountDetail({ items: [inst(1n, 1n, 9n), inst(2n, 4n, 1n)] }, { recipeId: 4n });
    expect(short.w.findAll('ul.uses li')[0].get('.have').classes()).toContain('short');
    expect(w.text()).not.toContain('%');
    expect(w.text()).not.toContain('Likely quality');
    expect(w.find('[role="img"]').exists()).toBe(false);
    expect(w.find('.tier').exists()).toBe(false);
  });

  it('consumable: the card shows the effect line, with no quality line and no reagent slot', () => {
    const { w } = mountDetail({}, { recipeId: 4n });
    const card = w.get('.item-card');
    expect(card.get('.effect').text()).toBe('Eat to be well fed: +2 strength.');
    expect(card.get('.yield-tag').text()).toBe('x2');
    expect(w.find('.quality-line').exists()).toBe(false);
    expect(w.find('.reagent-toggle').exists()).toBe(false);
  });

  it('an output with the old two-material description still shows its stats in the card', () => {
    const old = tpl(100n, 'Copper Sword', {
      slot: 'mainHand',
      weaponType: 'sword',
      stackable: false,
      weaponBaseDamage: 4n,
      weaponDps: 5n,
      description: 'Crafted from Copper Ore and Rough Hide.',
    });
    const { w } = mountDetail({ templates: [COPPER, HIDE, old] });
    expect(w.findAll('.item-card .stat-label').map((s) => s.text())).toEqual(['Damage', 'DPS']);
    expect(w.get('.item-card .description').text()).toBe('Crafted from Copper Ore and Rough Hide.');
  });

  it('falls back to the recipe name and meta line while the output template is missing', () => {
    const { w } = mountDetail({ templates: [COPPER, HIDE] });
    expect(w.find('.item-card').exists()).toBe(false);
    expect(w.get('h4').text()).toBe('Copper Sword');
  });

  it('the reagent slot opens the essence slot in the region it controls', async () => {
    const { w } = mountDetail();
    const toggle = w.get('button.reagent-toggle');
    await toggle.trigger('click');
    expect(toggle.attributes('aria-expanded')).toBe('true');
    const region = w.get(`#${toggle.attributes('aria-controls')}`);
    expect(region.text()).toContain('Add essence');
    expect(region.text()).toContain('Unlocks reagents');
    await toggle.trigger('click');
    expect(toggle.attributes('aria-expanded')).toBe('false');
    expect(w.find('button.slot-main').exists()).toBe(false);
  });

  it('chooses an essence through the picker, shows the reagent slots, fills one and removes it', async () => {
    const { w } = mountDetail();
    await openSlots(w);
    await slotButton(w, 'Add essence').trigger('click');
    expect(w.get('[role="listbox"]').attributes('aria-label')).toBe('Choose essence');
    await w.findAll('[role="option"]')[0].trigger('click');
    expect(w.get('.slot.filled .slot-right').text()).toBe('+2 per reagent');
    expect(w.get('.slots-line').text()).toBe('Standard quality takes up to 1 reagent.');
    await slotButton(w, 'Add reagent').trigger('click');
    await w.findAll('[role="option"]').find((o) => o.text().includes('Glowing Stone'))!.trigger('click');
    const filled = w.findAll('.slot.filled');
    expect(filled).toHaveLength(2);
    expect(filled[1].get('.slot-right').text()).toBe('+2 STR');
    expect(w.get('button.reagent-toggle').text()).toContain('Essence + 1 reagent');
    await filled[1].get('button.remove').trigger('click');
    expect(w.findAll('.slot.filled')).toHaveLength(1);
    expect(w.get('button.reagent-toggle').text()).toContain('Essence + 0 reagents');
    await w.get('.slot.filled button.remove').trigger('click');
    expect(w.find('.slots-line').exists()).toBe(false);
    expect(w.get('button.reagent-toggle').text()).toContain('Add Essence + reagent');
  });

  it('Esc closes only the picker and returns focus to its slot', async () => {
    const { w } = mountDetail();
    await openSlots(w);
    const essence = slotButton(w, 'Add essence');
    await essence.trigger('click');
    const event = new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true });
    document.body.dispatchEvent(event);
    expect(event.defaultPrevented).toBe(true);
    await nextTick();
    await nextTick();
    expect(w.find('[role="listbox"]').exists()).toBe(false);
    expect(w.get('button.reagent-toggle').attributes('aria-expanded')).toBe('true');
    expect(document.activeElement).toBe(essence.element);
  });

  it('starts over with empty choices and a collapsed slot when the recipe changes', async () => {
    const { w } = mountDetail();
    await openSlots(w);
    await slotButton(w, 'Add essence').trigger('click');
    await w.findAll('[role="option"]')[0].trigger('click');
    await w.setProps({ recipeId: 2n });
    expect(w.get('button.reagent-toggle').attributes('aria-expanded')).toBe('false');
    expect(w.get('button.reagent-toggle').text()).toContain('Add Essence + reagent');
    expect(w.find('.slot.filled').exists()).toBe(false);
  });

  it('without a station the reagent slot is aria-disabled, refers to the reason and does not open', async () => {
    const { w } = mountDetail({ station: false });
    const toggle = w.get('button.reagent-toggle');
    expect(toggle.attributes('aria-disabled')).toBe('true');
    expect(toggle.attributes('aria-describedby')).toBe(w.get('.reason').attributes('id'));
    expect(w.get('.reason').text()).toBe('No crafting station here.');
    await toggle.trigger('click');
    expect(toggle.attributes('aria-expanded')).toBe('false');
  });

  it('mobile: the chip card, the Uses rows, the quality line and the reagent slot (44px)', async () => {
    const { w } = mountDetail({}, { mobile: true });
    const card = w.get('.item-card');
    expect(card.classes()).toContain('mobile');
    expect(card.find('.kicker').exists()).toBe(false);
    expect(card.findAll('.stat-chip').map((c) => c.text())).toEqual(['Damage 4', 'DPS 5']);
    expect(w.findAll('ul.uses li')).toHaveLength(2);
    expect(w.get('p.quality-line').text()).toContain('Quality: Standard');
    expect(w.get('button.reagent-toggle').text()).toContain('Add Essence + reagent');
    expect(source).toMatch(/\.mobile \.reagent-toggle\s*\{\s*min-height: 44px;/);
  });

  it('renders recipe, output, material and essence names with markup literally', async () => {
    const evilOutput = tpl(100n, XSS, { slot: 'mainHand', weaponType: 'sword', stackable: false, description: XSS });
    const evilMaterial = tpl(50n, XSS);
    const evilEssence = tpl(23n, XSS, { slot: 'misc' });
    const evilRecipe = recipe(9n, XSS, { req1TemplateId: 50n, req1Count: 1n, req2TemplateId: 4n, req2Count: 1n });
    const { w } = mountDetail(
      {
        recipes: [evilRecipe],
        templates: [COPPER, HIDE, evilOutput, evilMaterial, evilEssence],
        items: [inst(30n, 50n, 1n), inst(31n, 4n, 1n), inst(32n, 23n, 1n)],
      },
      { recipeId: 9n },
    );
    await openSlots(w);
    await slotButton(w, 'Add essence').trigger('click');
    expect(w.get('.item-card h4').text()).toBe(XSS);
    expect(w.get('.use-name').text()).toBe(XSS);
    expect(w.find('img').exists()).toBe(false);
  });

  it('has no v-html and no inline svg', () => {
    expect(source).not.toMatch(/v-html|<svg/);
  });
});

// ---------------------------------------------------------------------------
// Task 2: the quantity row and Craft N× through craftRecipeCount
// ---------------------------------------------------------------------------

describe('RecipeDetail quantity row and batch craft', () => {
  const btn = (w: VueWrapper, label: string) => w.get(`button[aria-label="${label}"]`);
  const craftBtn = (w: VueWrapper) => w.get('button.craft-btn');
  const valueOf = (w: VueWrapper) => w.get('output.qty-value').text();
  const flush = async () => {
    await nextTick();
    await nextTick();
  };

  it('draws the group: minus, the shown value, plus, Max 3 and Craft, with no text input', () => {
    const { w } = mountDetail();
    const group = w.get('[role="group"]');
    expect(group.attributes('aria-label')).toBe('How many to craft');
    expect(group.findAll('button').map((b) => b.attributes('aria-label'))).toEqual([
      'One fewer',
      'One more',
      'Set to the most you can make, 3',
    ]);
    expect(group.find('button[aria-label="One fewer"] svg').exists()).toBe(true);
    expect(group.find('button[aria-label="One more"] svg').exists()).toBe(true);
    expect(valueOf(w)).toBe('1');
    expect(btn(w, 'Set to the most you can make, 3').text()).toBe('Max 3');
    expect(craftBtn(w).text()).toBe('Craft Copper Sword');
    expect(w.find('input').exists()).toBe(false);
  });

  it('plus scales the Uses rows, the label and the for-N-crafts text; plus and Max stop at the maximum', async () => {
    const { w } = mountDetail();
    expect(w.find('.for-qty').exists()).toBe(false);
    await btn(w, 'One more').trigger('click');
    await btn(w, 'One more').trigger('click');
    expect(valueOf(w)).toBe('3');
    expect(craftBtn(w).text()).toBe('Craft 3× Copper Sword');
    const rows = w.findAll('ul.uses li');
    expect(rows.map((r) => `${r.get('.have').text()} ${r.get('.of').text()}`)).toEqual(['9 / 9', '5 / 3']);
    expect(w.get('.for-qty').text()).toBe('for 3 crafts');
    expect(btn(w, 'One more').attributes('aria-disabled')).toBe('true');
    expect(btn(w, 'Set to the most you can make, 3').attributes('aria-disabled')).toBe('true');
    await btn(w, 'One more').trigger('click');
    await btn(w, 'Set to the most you can make, 3').trigger('click');
    expect(valueOf(w)).toBe('3');
  });

  it('minus is aria-disabled at 1 and changes nothing; Max from 1 sets the maximum; minus steps down', async () => {
    const { w } = mountDetail();
    const minus = btn(w, 'One fewer');
    expect(minus.attributes('aria-disabled')).toBe('true');
    await minus.trigger('click');
    expect(valueOf(w)).toBe('1');
    await btn(w, 'Set to the most you can make, 3').trigger('click');
    expect(valueOf(w)).toBe('3');
    expect(minus.attributes('aria-disabled')).toBeUndefined();
    await minus.trigger('click');
    expect(valueOf(w)).toBe('2');
  });

  it('follows the live rows: the quantity clamps when the materials drop', async () => {
    const { w, items } = mountDetail();
    await btn(w, 'Set to the most you can make, 3').trigger('click');
    expect(valueOf(w)).toBe('3');
    items.value = [inst(1n, 1n, 6n), inst(2n, 4n, 5n)];
    await flush();
    expect(valueOf(w)).toBe('2');
    expect(craftBtn(w).text()).toBe('Craft 2× Copper Sword');
  });

  it('with nothing to make: Missing materials, aria-disabled with the reason, Max 0, and a click sends nothing', async () => {
    const { w, calls } = mountDetail({ items: [inst(1n, 1n, 2n), inst(2n, 4n, 5n)] });
    expect(craftBtn(w).text()).toBe('Missing materials');
    expect(craftBtn(w).attributes('aria-disabled')).toBe('true');
    expect(w.get('.reason').text()).toBe('Missing 1 Copper Ore.');
    expect(craftBtn(w).attributes('aria-describedby')).toBe(w.get('.reason').attributes('id'));
    expect(btn(w, 'Set to the most you can make, 0').text()).toBe('Max 0');
    expect(btn(w, 'Set to the most you can make, 0').attributes('aria-disabled')).toBe('true');
    await craftBtn(w).trigger('click');
    expect(calls.craftRecipeCount).not.toHaveBeenCalled();
  });

  it('Craft sends craftRecipeCount once with the count, emits craft-start first and never calls the single reducer', async () => {
    const { w, calls } = mountDetail();
    await btn(w, 'Set to the most you can make, 3').trigger('click');
    await craftBtn(w).trigger('click');
    await flush();
    expect(calls.craftRecipeCount).toHaveBeenCalledTimes(1);
    expect(calls.craftRecipeCount).toHaveBeenCalledWith({ characterId: 7n, recipeTemplateId: 1n, count: 3n });
    expect(w.emitted('craft-start')).toEqual([[{ args: { characterId: 7n, recipeTemplateId: 1n, count: 3n } }]]);
    expect(calls.craftRecipe).not.toHaveBeenCalled();
  });

  it('carries the essence and reagent ids with the count', async () => {
    const { w, calls } = mountDetail();
    await openSlots(w);
    await slotButton(w, 'Add essence').trigger('click');
    await w.findAll('[role="option"]')[0].trigger('click');
    await slotButton(w, 'Add reagent').trigger('click');
    await w.findAll('[role="option"]').find((o) => o.text().includes('Glowing Stone'))!.trigger('click');
    await craftBtn(w).trigger('click');
    await flush();
    expect(calls.craftRecipeCount).toHaveBeenCalledTimes(1);
    expect(calls.craftRecipeCount).toHaveBeenCalledWith({
      characterId: 7n,
      recipeTemplateId: 1n,
      count: 1n,
      catalystTemplateId: 11n,
      modifier1TemplateId: 20n,
    });
  });

  it('ignores a second click while pending and goes back to 1 once the call resolves', async () => {
    let release: () => void = () => undefined;
    const craftRecipeCount = vi.fn(() => new Promise<void>((resolveCall) => (release = resolveCall)));
    const { w } = mountDetail({ reducers: { craftRecipeCount } as Partial<LedgerReducers> });
    await btn(w, 'Set to the most you can make, 3').trigger('click');
    await craftBtn(w).trigger('click');
    await craftBtn(w).trigger('click');
    expect(craftRecipeCount).toHaveBeenCalledTimes(1);
    expect(craftBtn(w).attributes('aria-disabled')).toBe('true');
    expect(valueOf(w)).toBe('3');
    release();
    await flush();
    await flush();
    expect(valueOf(w)).toBe('1');
    expect(craftBtn(w).text()).toBe('Craft Copper Sword');
  });

  it('keeps the quantity when the call is rejected', async () => {
    const craftRecipeCount = vi.fn(() => Promise.reject(new Error('no')));
    const { w, runner } = mountDetail({ reducers: { craftRecipeCount } as Partial<LedgerReducers> });
    await btn(w, 'Set to the most you can make, 3').trigger('click');
    await craftBtn(w).trigger('click');
    await flush();
    await flush();
    expect(runner.rejection.value).toBe(1);
    expect(valueOf(w)).toBe('3');
  });

  it('is aria-disabled and sends nothing offline, and with no station (the station reason first)', async () => {
    const noStation = mountDetail({ station: false });
    expect(craftBtn(noStation.w).attributes('aria-disabled')).toBe('true');
    expect(noStation.w.get('.reason').text()).toBe('No crafting station here.');
    await craftBtn(noStation.w).trigger('click');
    expect(noStation.calls.craftRecipeCount).not.toHaveBeenCalled();
    noStation.w.unmount();
    wrapper = null;
    const offline = mountDetail({ connected: false });
    expect(craftBtn(offline.w).attributes('aria-disabled')).toBe('true');
    await craftBtn(offline.w).trigger('click');
    expect(offline.calls.craftRecipeCount).not.toHaveBeenCalled();
    expect(offline.w.emitted('craft-start')).toBeUndefined();
  });

  it('starts over at 1 when the recipe changes', async () => {
    const { w } = mountDetail();
    await btn(w, 'Set to the most you can make, 3').trigger('click');
    await w.setProps({ recipeId: 2n });
    expect(valueOf(w)).toBe('1');
  });

  it('mobile: the same label, the stepper and Max, and a full-width Craft (44px controls)', () => {
    const { w } = mountDetail({}, { mobile: true });
    expect(w.find('.qty-row').exists()).toBe(true);
    expect(craftBtn(w).text()).toBe('Craft Copper Sword');
    expect(craftBtn(w).attributes('aria-label')).toBe('Craft 1 Copper Sword');
    expect(w.get('.detail-dock').findAll('button.step-btn')).toHaveLength(2);
    expect(source).toMatch(/\.mobile \.step-btn\s*\{[^}]*min-height: 44px;/);
    expect(source).toMatch(/\.mobile \.step-btn\s*\{[^}]*min-width: 44px;/);
    expect(source).toMatch(/\.mobile \.max-btn\s*\{\s*min-height: 44px;/);
    expect(source).toMatch(/\.mobile \.craft-btn\s*\{[^}]*min-height: 44px;/);
    expect(source).toMatch(/\.mobile \.craft-btn\s*\{[^}]*flex: 1 1 100%;/);
  });

  it('desktop pins 40px for the stepper group, Max and Craft', () => {
    expect(source).toMatch(/\.stepper\s*\{[^}]*min-height: 40px;/);
    expect(source).toMatch(/\.max-btn\s*\{[^}]*min-height: 40px;/);
    expect(source).toMatch(/\.craft-btn\s*\{[^}]*min-height: 40px;/);
  });

  it('uses craftRecipeCount and never the single-craft reducer', () => {
    const code = source
      .split('\n')
      .filter((line) => !/^\s*\/\//.test(line))
      .join('\n');
    expect(code).toContain('reducers.craftRecipeCount(');
    expect(code).not.toContain('reducers.craftRecipe(');
  });

  it('renders a markup-named recipe in the Craft label as text', () => {
    const evilRecipe = recipe(9n, XSS, { req1TemplateId: 1n, req1Count: 1n, req2TemplateId: 4n, req2Count: 1n });
    const { w } = mountDetail({ recipes: [evilRecipe] }, { recipeId: 9n });
    expect(craftBtn(w).text()).toBe(`Craft ${XSS}`);
    expect(w.find('img').exists()).toBe(false);
  });
});
