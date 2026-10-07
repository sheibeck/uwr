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
import { salvagePreview } from '../ledger/salvagePreview';
import type { ItemAffix, ItemInstance, ItemTemplate, RecipeTemplate } from '../module_bindings/types';
import SalvageDetail from './SalvageDetail.vue';
import SalvageList from './SalvageList.vue';

const XSS = '<img src=x onerror=alert(1)>';
const read = (file: string): string => readFileSync(resolve(process.cwd(), 'src/crafting', file), 'utf8');

let wrapper: VueWrapper | null = null;
afterEach(() => {
  wrapper?.unmount();
  wrapper = null;
  document.body.innerHTML = '';
});

function tpl(id: bigint, name: string, overrides: Record<string, unknown> = {}): ItemTemplate {
  return {
    id,
    name,
    slot: 'chest',
    armorType: 'cloth',
    weaponType: '',
    rarity: 'common',
    tier: 1n,
    isJunk: false,
    vendorValue: 20n,
    requiredLevel: 1n,
    allowedClasses: '',
    stackable: false,
    wellFedDurationMicros: 0n,
    description: undefined,
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

function affix(instanceId: bigint, name: string, over: Record<string, unknown> = {}): ItemAffix {
  return {
    id: instanceId * 100n,
    itemInstanceId: instanceId,
    affixType: 'suffix',
    affixKey: 'of_intelligence',
    affixName: name,
    statKey: 'intBonus',
    magnitude: 2n,
    ...over,
  } as unknown as ItemAffix;
}

function recipeOf(outputTemplateId: bigint, req1: bigint, c1: bigint, req2: bigint, c2: bigint): RecipeTemplate {
  return {
    id: 5n,
    key: 'r5',
    name: 'Recipe',
    outputTemplateId,
    outputCount: 1n,
    req1TemplateId: req1,
    req1Count: c1,
    req2TemplateId: req2,
    req2Count: c2,
    req3TemplateId: undefined,
    req3Count: undefined,
    recipeType: 'armor',
  } as unknown as RecipeTemplate;
}

const ROBE = tpl(1n, 'Silk Robe', { rarity: 'rare', description: 'Soft and warm.' });
const PLATE = tpl(2n, 'Darksteel Plate', { slot: 'chest', armorType: 'plate', tier: 3n, rarity: 'rare', vendorValue: 400n });
const TUNIC = tpl(3n, 'Plain Tunic');
const SWORD = tpl(4n, 'Copper Sword', { slot: 'mainHand', armorType: '', weaponType: 'sword' });
const CRAFTED = tpl(5n, 'Crafted Vest');
const PART_A = tpl(70n, 'Rough Hide', { slot: 'material', armorType: '', vendorValue: 2n });
const PART_B = tpl(71n, 'Scrap Cloth', { slot: 'material', armorType: '', vendorValue: 1n });
const XSS_ITEM = tpl(6n, XSS, { rarity: 'rare' });
const XSS_PART = tpl(72n, XSS, { slot: 'material', armorType: '', vendorValue: 1n });
const XSS_OUT = tpl(7n, 'Mark Vest', { rarity: 'rare' });
const TEMPLATES = [ROBE, PLATE, TUNIC, SWORD, CRAFTED, PART_A, PART_B, XSS_ITEM, XSS_PART, XSS_OUT];

const ROBE_ID = 10n;
const PLATE_ID = 11n;
const TUNIC_ID = 12n;
const CRAFTED_ID = 13n;
const XSS_ID = 14n;
const MARK_ID = 16n;

interface World {
  items?: ItemInstance[];
  affixes?: ItemAffix[];
  recipes?: RecipeTemplate[];
  applied?: boolean;
  connected?: boolean;
  isDesktop?: boolean;
  reducers?: Partial<LedgerReducers>;
}

function buildWorld(world: World = {}) {
  const connected = ref(world.connected ?? true);
  const items = shallowRef<readonly ItemInstance[]>(
    world.items ?? [
      inst(ROBE_ID, 1n),
      inst(PLATE_ID, 2n),
      inst(TUNIC_ID, 3n),
      inst(CRAFTED_ID, 5n, { craftQuality: 'standard' }),
    ],
  );
  const affixes = shallowRef<readonly ItemAffix[]>(world.affixes ?? [affix(ROBE_ID, 'of Intelligence')]);
  const salvageItem = vi.fn(async () => undefined);
  const reducers = { salvageItem, ...world.reducers } as unknown as LedgerReducers;
  const outputRecipes = new Map<bigint, RecipeTemplate>(
    (world.recipes ?? [recipeOf(5n, 70n, 1n, 71n, 1n)]).map((r) => [r.outputTemplateId, r]),
  );
  const game = {
    ...createInertGame(),
    character: ref({ id: 7n, name: 'Hero', level: 5n, locationId: 10n, gold: 100n, className: 'Warrior', vendorSellMod: 100n }),
    renownPerks: ref([]),
    connected,
  } as unknown as GameData;
  const ledger = {
    ...createInertLedger(),
    items,
    itemsApplied: ref(true),
    affixes,
    templates: ref(new Map(TEMPLATES.map((t) => [t.id, t]))),
    outputRecipes: ref(outputRecipes),
    outputRecipesApplied: ref(world.applied ?? true),
    reducers: computed(() => (connected.value ? reducers : null)),
  } as unknown as LedgerData;
  const frame = { ...createInertFrame(), isDesktop: ref(world.isDesktop ?? true) } as unknown as FrameControls;
  const runner = createActionRunner({ online: computed(() => connected.value && ledger.reducers.value !== null) });
  return {
    connected,
    items,
    affixes,
    salvageItem,
    game,
    ledger,
    runner,
    global: { provide: { [GAME_KEY as symbol]: game, [LEDGER_KEY as symbol]: ledger, [FRAME_KEY as symbol]: frame } },
  };
}

function expectedPreview(ctx: ReturnType<typeof buildWorld>, instanceId: bigint) {
  const instance = ctx.ledger.items.value.find((i) => i.id === instanceId)!;
  const template = ctx.ledger.templates.value.get(instance.templateId)!;
  return salvagePreview({
    instance,
    template,
    affixes: ctx.ledger.affixes.value,
    characterId: 7n,
    outputRecipe: ctx.ledger.outputRecipesApplied.value
      ? (ctx.ledger.outputRecipes.value.get(template.id) ?? null)
      : undefined,
    templates: ctx.ledger.templates.value,
  })!;
}

describe('SalvageList', () => {
  function mountList(world: World = {}, props: Record<string, unknown> = {}) {
    const ctx = buildWorld(world);
    const w = mount(SalvageList, {
      attachTo: document.body,
      props: { selectedId: null, ...props },
      global: ctx.global,
    });
    wrapper = w;
    return { ...ctx, w };
  }

  it('shows the intro and one row button per salvageable item, in the bag sort', () => {
    const { w } = mountList();
    expect(w.get('.intro').text()).toBe('Gear in your bag. Unequip an item to salvage it.');
    const rows = w.findAll('button.salvage-row');
    expect(rows.map((r) => r.get('.row-name').text())).toEqual(['Darksteel Plate', 'Silk Robe', 'Crafted Vest', 'Plain Tunic']);
    expect(rows[0].attributes('aria-label')).toBe('Darksteel Plate, Chest · Plate · Tier 3');
    expect(rows[1].get('.row-meta').text()).toBe('Chest · Cloth · Tier 1');
    expect(rows[0].attributes('aria-pressed')).toBe('false');
  });

  it('names rows in their rarity color, with an icon tile', () => {
    const { w } = mountList();
    const first = w.get('button.salvage-row');
    expect(first.get('.row-name').attributes('style')).toContain('--color-rarity-rare');
    expect(first.find('.row-icon svg').exists()).toBe(true);
  });

  it('never lists equipped gear, materials or junk', () => {
    const { w } = mountList({
      items: [
        inst(1n, 1n, { equippedSlot: 'chest' }),
        inst(2n, 70n),
        inst(3n, 3n),
        inst(4n, 4n, { equippedSlot: 'mainHand' }),
      ],
    });
    expect(w.findAll('button.salvage-row').map((r) => r.get('.row-name').text())).toEqual(['Plain Tunic']);
  });

  it('marks the selected row with aria-pressed', () => {
    const { w } = mountList({}, { selectedId: ROBE_ID });
    const pressed = w.findAll('button.salvage-row').filter((r) => r.attributes('aria-pressed') === 'true');
    expect(pressed).toHaveLength(1);
    expect(pressed[0].get('.row-name').text()).toBe('Silk Robe');
  });

  it('reads the empty state when nothing can be salvaged and reports no selection', async () => {
    const { w } = mountList({ items: [inst(1n, 70n)] }, { selectedId: 5n });
    expect(w.get('.empty').text()).toBe('Nothing left to salvage.');
    expect(w.find('button.salvage-row').exists()).toBe(false);
    await nextTick();
    expect(w.emitted('select')).toEqual([[null]]);
  });

  it('on desktop selects the first row when nothing is selected, and when the selected row vanished', async () => {
    const { w } = mountList();
    await nextTick();
    expect(w.emitted('select')![0]).toEqual([PLATE_ID]);
    await w.setProps({ selectedId: 999n });
    expect(w.emitted('select')![1]).toEqual([PLATE_ID]);
  });

  it('on mobile never auto-selects, and rows are at least 56px tall (source pin)', async () => {
    const { w } = mountList({}, { mobile: true });
    await nextTick();
    expect(w.emitted('select')).toBeUndefined();
    expect(read('SalvageList.vue')).toMatch(/\.mobile \.salvage-row\s*\{[^}]*min-height: 56px/);
  });

  it('emits the id of a clicked row and can focus one', async () => {
    const { w } = mountList();
    await w.findAll('button.salvage-row')[2].trigger('click');
    expect(w.emitted('select')!.some((e) => e[0] === CRAFTED_ID)).toBe(true);
    (w.vm as unknown as { focusRow: (id: bigint) => void }).focusRow(TUNIC_ID);
    expect((document.activeElement as HTMLElement).getAttribute('data-instance-id')).toBe(String(TUNIC_ID));
  });

  it('renders markup in a name as text', () => {
    const { w } = mountList({ items: [inst(XSS_ID, 6n)] });
    expect(w.find('img').exists()).toBe(false);
    expect(w.get('.row-name').text()).toBe(XSS);
  });
});

describe('SalvageDetail', () => {
  function mountDetail(world: World = {}, instanceId: bigint = ROBE_ID, mobile = false) {
    const ctx = buildWorld(world);
    const w = mount(SalvageDetail, {
      attachTo: document.body,
      props: { instanceId, runner: ctx.runner, mobile },
      global: ctx.global,
    });
    wrapper = w;
    return { ...ctx, w };
  }
  const buttonOf = (w: VueWrapper) => w.get('button.salvage-btn');
  const flush = async () => {
    await new Promise((r) => setTimeout(r, 0));
    await nextTick();
    await nextTick();
  };

  describe('desktop', () => {
    it('draws the item card and the May return rows straight from the shared preview', () => {
      const ctx = mountDetail({ recipes: [] });
      const { w } = ctx;
      expect(w.get('.item-card .kicker').text()).toBe('Salvage');
      expect(w.get('.item-card h4').text()).toBe('Silk Robe');
      expect(w.get('.item-card h4').attributes('style')).toContain('--color-rarity-rare');
      expect(w.text()).toContain('Intelligence');
      expect(w.text()).toContain('+2');
      expect(w.get('.item-card .meta').text()).toContain('Sells for');
      expect(w.get('.item-card .description').text()).toBe('Soft and warm.');
      expect(w.findAll('h6').map((h) => h.text())).toEqual(['May return']);
      const preview = expectedPreview(ctx, ROBE_ID);
      expect(preview.yields.length).toBeGreaterThanOrEqual(2);
      const rows = w.findAll('.yield-row');
      expect(rows).toHaveLength(preview.yields.length);
      preview.yields.forEach((y, index) => {
        expect(rows[index].get('.yield-name').text()).toBe(y.name);
        expect(rows[index].get('.yield-value').text()).toBe(y.text);
        const note = rows[index].find('.yield-note');
        expect(note.exists() ? note.text() : '').toBe(y.note);
      });
      expect(rows[0].get('.yield-value').text()).toMatch(/^×\d+ · \d+% chance$/);
      expect(rows[0].get('.yield-name').text()).toBe('Rough Hide');
      expect(rows[0].get('.yield-value').text()).toBe('×1 · 50% chance');
      const reagent = rows[rows.length - 1];
      expect(reagent.get('.yield-value').text()).toBe('12% chance');
      expect(reagent.get('.yield-note').text()).toBe('from “of Intelligence”');
      expect(w.find('.yield-hint').exists()).toBe(false);
      for (const row of rows) expect(row.get('.yield-value').text()).toMatch(/% chance$/);
    });

    it('has the Salvage {name} button with the recycle icon', () => {
      const { w } = mountDetail();
      const button = buttonOf(w);
      expect(button.text()).toBe('Salvage Silk Robe');
      expect(button.classes()).toEqual(expect.arrayContaining(['btn', 'btn-primary']));
      expect(button.find('svg').exists()).toBe(true);
    });

    it('shows no scroll line and promises no count', () => {
      const { w } = mountDetail({ recipes: [] });
      expect(w.text()).not.toMatch(/scroll/i);
      expect(w.text()).not.toMatch(/You'll|You will receive|guarantee/i);
    });

    it('gives the rare component the note unlikely', () => {
      const ctx2 = mountDetail({ recipes: [], affixes: [], items: [inst(PLATE_ID, 2n)] }, PLATE_ID);
      const preview = expectedPreview(ctx2, PLATE_ID);
      const row = ctx2.w.get('.yield-row');
      expect(row.get('.yield-name').text()).toBe(preview.yields[0].name);
      expect(preview.yields[0].name).toBe('Darksteel Ore');
      expect(row.get('.yield-note').text()).toBe('unlikely');
    });

    it('says nothing usable will come of it when the recipe leaves nothing possible', () => {
      const { w } = mountDetail({ affixes: [] }, CRAFTED_ID);
      expect(w.findAll('.yield-row')).toHaveLength(0);
      expect(w.get('.yield-hint').text()).toBe('Nothing usable will come of it.');
    });

    it('says materials may come back while the recipe parts are not known, and keeps the reagent row', () => {
      const { w } = mountDetail({ applied: false });
      expect(w.get('.yield-hint').text()).toBe('It may return some materials.');
      const rows = w.findAll('.yield-row');
      expect(rows).toHaveLength(1);
      expect(rows[0].get('.yield-value').text()).toBe('12% chance');
    });

    it('renders neither yields nor a button for a template that is not salvageable', () => {
      const { w } = mountDetail({ items: [inst(77n, 70n)] }, 77n);
      expect(w.find('.yield-row').exists()).toBe(false);
      expect(w.find('h6').exists()).toBe(false);
      expect(w.find('button.salvage-btn').exists()).toBe(false);
    });
  });

  describe('confirm', () => {
    it('opens the shared prompt with the warning icon, focus on Keep it, and calls salvageItem once on Salvage', async () => {
      const ctx = mountDetail();
      const { w } = ctx;
      const preview = expectedPreview(ctx, ROBE_ID);
      await buttonOf(w).trigger('click');
      const confirm = w.get('.inline-confirm');
      expect(confirm.find('.warn-icon').exists()).toBe(true);
      expect(confirm.get('.confirm-prompt').text()).toBe(preview.confirmText);
      expect(preview.confirmText.startsWith('Salvage destroys this item.')).toBe(true);
      expect(preview.confirmText).not.toMatch(/\d/);
      const buttons = confirm.findAll('button');
      expect(buttons.map((b) => b.text())).toEqual(['Salvage', 'Keep it']);
      expect(document.activeElement).toBe(buttons[1].element);
      expect(ctx.salvageItem).not.toHaveBeenCalled();
      await buttons[0].trigger('click');
      await flush();
      expect(ctx.salvageItem).toHaveBeenCalledTimes(1);
      expect(ctx.salvageItem).toHaveBeenCalledWith({ characterId: 7n, itemInstanceId: ROBE_ID });
    });

    it('asks for crafted items too, with the shared prompt', async () => {
      const ctx = mountDetail({ affixes: [] }, CRAFTED_ID);
      await buttonOf(ctx.w).trigger('click');
      expect(ctx.w.get('.confirm-prompt').text()).toBe(expectedPreview(ctx, CRAFTED_ID).confirmText);
    });

    it('Keep it calls nothing and refocuses the Salvage button', async () => {
      const ctx = mountDetail();
      await buttonOf(ctx.w).trigger('click');
      await ctx.w.findAll('.inline-confirm button')[1].trigger('click');
      await nextTick();
      await nextTick();
      expect(ctx.w.find('.inline-confirm').exists()).toBe(false);
      expect(ctx.salvageItem).not.toHaveBeenCalled();
      expect(document.activeElement).toBe(buttonOf(ctx.w).element);
    });

    it('Esc calls nothing and refocuses the Salvage button', async () => {
      const ctx = mountDetail();
      await buttonOf(ctx.w).trigger('click');
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }));
      await nextTick();
      await nextTick();
      expect(ctx.w.find('.inline-confirm').exists()).toBe(false);
      expect(ctx.salvageItem).not.toHaveBeenCalled();
      expect(document.activeElement).toBe(buttonOf(ctx.w).element);
    });

    it('closes an open confirm and sends nothing when the instance changes', async () => {
      const ctx = mountDetail();
      await buttonOf(ctx.w).trigger('click');
      expect(ctx.w.find('.inline-confirm').exists()).toBe(true);
      await ctx.w.setProps({ instanceId: PLATE_ID });
      expect(ctx.w.find('.inline-confirm').exists()).toBe(false);
      expect(ctx.salvageItem).not.toHaveBeenCalled();
      await buttonOf(ctx.w).trigger('click');
      await ctx.w.findAll('.inline-confirm button')[0].trigger('click');
      await flush();
      expect(ctx.salvageItem).toHaveBeenCalledWith({ characterId: 7n, itemInstanceId: PLATE_ID });
    });

    it('salvages a plain common item at once, with no confirm', async () => {
      const ctx = mountDetail({ affixes: [] }, TUNIC_ID);
      await buttonOf(ctx.w).trigger('click');
      await flush();
      expect(ctx.w.find('.inline-confirm').exists()).toBe(false);
      expect(ctx.salvageItem).toHaveBeenCalledTimes(1);
      expect(ctx.salvageItem).toHaveBeenCalledWith({ characterId: 7n, itemInstanceId: TUNIC_ID });
    });
  });

  describe('unavailable', () => {
    it('is aria-disabled and sends nothing while offline', async () => {
      const ctx = mountDetail({ connected: false }, TUNIC_ID);
      expect(buttonOf(ctx.w).attributes('aria-disabled')).toBe('true');
      await buttonOf(ctx.w).trigger('click');
      expect(ctx.w.find('.inline-confirm').exists()).toBe(false);
      expect(ctx.salvageItem).not.toHaveBeenCalled();
    });

    it('is aria-disabled while a salvage is pending, and ignores a second click', async () => {
      let release: () => void = () => undefined;
      const hold = new Promise<void>((r) => {
        release = r;
      });
      const salvageItem = vi.fn(() => hold);
      const ctx = mountDetail({ reducers: { salvageItem } as unknown as Partial<LedgerReducers> }, TUNIC_ID);
      await buttonOf(ctx.w).trigger('click');
      await nextTick();
      expect(buttonOf(ctx.w).attributes('aria-disabled')).toBe('true');
      await buttonOf(ctx.w).trigger('click');
      expect(salvageItem).toHaveBeenCalledTimes(1);
      release();
      await flush();
      expect(buttonOf(ctx.w).attributes('aria-disabled')).toBeUndefined();
    });

    it('is aria-disabled and sends nothing for an equipped instance (a stale view)', async () => {
      const ctx = mountDetail({ items: [inst(TUNIC_ID, 3n, { equippedSlot: 'chest' })], affixes: [] }, TUNIC_ID);
      expect(buttonOf(ctx.w).attributes('aria-disabled')).toBe('true');
      await buttonOf(ctx.w).trigger('click');
      expect(ctx.w.find('.inline-confirm').exists()).toBe(false);
      expect(ctx.salvageItem).not.toHaveBeenCalled();
    });
  });

  describe('mobile', () => {
    it('draws the mobile item card and the same May return rows, and still asks for a rare item', async () => {
      const ctx = mountDetail({ recipes: [] }, ROBE_ID, true);
      const { w } = ctx;
      expect(w.get('.item-card').classes()).toContain('mobile');
      expect(w.find('.item-card .kicker').exists()).toBe(false);
      const preview = expectedPreview(ctx, ROBE_ID);
      expect(w.findAll('h6').map((h) => h.text())).toEqual(['May return']);
      expect(w.findAll('.yield-row').map((r) => r.get('.yield-value').text())).toEqual(preview.yields.map((y) => y.text));
      await buttonOf(w).trigger('click');
      expect(w.get('.inline-confirm').classes()).toContain('mobile');
      expect(w.get('.confirm-prompt').text()).toBe(preview.confirmText);
    });

    it('pins the button to a 44px minimum height on mobile (source pin)', () => {
      expect(read('SalvageDetail.vue')).toMatch(/\.mobile \.salvage-btn\s*\{[^}]*min-height: 44px/);
    });
  });

  describe('escape', () => {
    it('renders item, affix and recipe part names as text in the card, the rows and the prompt', async () => {
      const ctx = mountDetail(
        {
          items: [inst(XSS_ID, 6n), inst(MARK_ID, 7n)],
          affixes: [affix(XSS_ID, XSS), affix(MARK_ID, XSS)],
          recipes: [recipeOf(7n, 72n, 4n, 71n, 1n)],
        },
        MARK_ID,
      );
      const { w } = ctx;
      const preview = expectedPreview(ctx, MARK_ID);
      expect(preview.yields.some((y) => y.name === XSS)).toBe(true);
      expect(w.find('img').exists()).toBe(false);
      expect(w.findAll('.yield-name').some((n) => n.text() === XSS)).toBe(true);
      await buttonOf(w).trigger('click');
      expect(w.find('img').exists()).toBe(false);
      expect(w.get('.confirm-prompt').text()).toContain(XSS);
      await w.setProps({ instanceId: XSS_ID });
      expect(w.find('img').exists()).toBe(false);
      expect(w.get('.item-card h4').text()).toBe(XSS);
    });
  });

  describe('source', () => {
    it('reads only the new preview fields and never builds a prompt of its own', () => {
      const source = read('SalvageDetail.vue');
      expect(source).toContain('preview.confirmText');
      expect(source).not.toMatch(/countKnown|You'll receive|This destroys/);
      expect(source).not.toMatch(/v-html|<svg/);
    });
  });
});
