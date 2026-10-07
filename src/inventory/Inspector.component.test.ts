// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { computed, nextTick, ref, shallowRef } from 'vue';
import { mount, type VueWrapper } from '@vue/test-utils';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { GAME_KEY, createInertGame } from '../game/context';
import type { GameData } from '../game/context';
import { LEDGER_KEY, createInertLedger } from '../ledger/ledgerContext';
import type { LedgerData, LedgerReducers } from '../ledger/ledgerContext';
import { createActionRunner } from '../ledger/actionRunner';
import type { ActionRunner } from '../ledger/actionRunner';
import type { ItemAffix, ItemInstance, ItemTemplate } from '../module_bindings/types';
import { salvagePreview } from '../ledger/salvagePreview';
import Inspector from './Inspector.vue';

const XSS = '<img src=x onerror=alert(1)>';
const source = readFileSync(resolve(process.cwd(), 'src/inventory/Inspector.vue'), 'utf8');

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

function affix(id: bigint, instanceId: bigint, statKey: string, magnitude: bigint): ItemAffix {
  return {
    id,
    itemInstanceId: instanceId,
    affixType: 'prefix',
    affixKey: 'k',
    affixName: 'Keen',
    statKey,
    magnitude,
  } as unknown as ItemAffix;
}

interface Setup {
  items: ItemInstance[];
  templates: ItemTemplate[];
  affixes?: ItemAffix[];
  instanceId: bigint | null;
  variant?: 'card' | 'dock';
  connected?: boolean;
  reducers?: Partial<LedgerReducers>;
  level?: bigint;
  /** The hub's recipe cap state: undefined = not applied (count unknown), null = applied with no recipe. */
  outputRecipe?: null;
}

function mountInspector(setup: Setup) {
  const reducers = {
    equipItem: vi.fn().mockResolvedValue(undefined),
    unequipItem: vi.fn().mockResolvedValue(undefined),
    useItem: vi.fn().mockResolvedValue(undefined),
    eatFood: vi.fn().mockResolvedValue(undefined),
    salvageItem: vi.fn().mockResolvedValue(undefined),
    learnRecipeScroll: vi.fn().mockResolvedValue(undefined),
    ...setup.reducers,
  };
  const items = shallowRef<readonly ItemInstance[]>(setup.items);
  const connected = ref(setup.connected ?? true);
  const game = {
    ...createInertGame(),
    character: ref({
      id: 7n,
      name: 'Hero',
      level: setup.level ?? 5n,
      className: 'Warrior',
      weaponProficiencies: 'sword',
      armorProficiencies: 'leather',
      vendorSellMod: 0n,
    }),
    renownPerks: ref([]),
    connected,
  } as unknown as GameData;
  const reducersRef = computed(() => (connected.value ? (reducers as unknown as LedgerReducers) : null));
  const ledger = {
    ...createInertLedger(),
    items,
    affixes: ref(setup.affixes ?? []),
    templates: ref(new Map(setup.templates.map((t) => [t.id, t]))),
    outputRecipes: ref(new Map()),
    outputRecipesApplied: ref(setup.outputRecipe === null),
    reducers: reducersRef,
  } as unknown as LedgerData;
  const runner: ActionRunner = createActionRunner({
    online: computed(() => connected.value && reducersRef.value !== null),
  });
  wrapper = mount(Inspector, {
    attachTo: document.body,
    props: { instanceId: setup.instanceId, variant: setup.variant ?? 'card', runner },
    global: { provide: { [GAME_KEY as symbol]: game, [LEDGER_KEY as symbol]: ledger } },
  });
  return { reducers, items, runner, connected };
}

const primary = () => wrapper!.get('.action.primary');
const salvage = () => wrapper!.get('.action.salvage');

describe('Inspector card', () => {
  it('shows only the prompt with nothing selected', () => {
    mountInspector({ items: [], templates: [], instanceId: null });
    expect(wrapper!.text()).toBe('Select an item to see its details.');
    expect(wrapper!.find('button').exists()).toBe(false);
  });

  it('draws the rows in the contract order with a 14px 500 wrapping name', () => {
    const worn = tpl(1n, { name: 'Old Vest', armorClassBonus: 4n });
    const next = tpl(2n, {
      name: 'New Vest',
      rarity: 'rare',
      tier: 2n,
      requiredLevel: 8n,
      armorClassBonus: 6n,
      description: 'Stitched twice.',
    });
    mountInspector({
      items: [inst(1n, 1n, { equippedSlot: 'chest' }), inst(2n, 2n, { craftQuality: 'exquisite' })],
      templates: [worn, next],
      affixes: [affix(1n, 2n, 'intBonus', 3n)],
      instanceId: 2n,
    });
    const classes = Array.from(wrapper!.get('section').element.children).map((el) => el.className.split(' ')[0]);
    expect(classes).toEqual(['kicker', 'name', 'meta', 'caption', 'stats', 'affixes', 'flavor', 'action-block', 'footer']);
    expect(wrapper!.get('.kicker').text()).toBe('Rare · Tier 2 · Chest');
    expect(wrapper!.get('.name').text()).toBe('New Vest');
    expect(wrapper!.get('.meta').text()).toContain('Requires Lv 8');
    expect(wrapper!.get('.meta-part.short').text()).toBe('Requires Lv 8');
    expect(wrapper!.get('.caption').text()).toBe('Compared with Old Vest');
    expect(wrapper!.get('.affix-row').text()).toContain('+3 INT');
    expect(wrapper!.get('.flavor').text()).toBe('Stitched twice.');
    expect(wrapper!.get('.footer').text()).toContain('Sells for');
    expect(source).toMatch(/\.name\s*\{\s*font-size: 14px;\s*font-weight: 500;/);
    expect(source).toMatch(/\.name\s*\{[^}]*overflow-wrap: anywhere;/);
  });

  it('colors the craft quality in its craft token only for a known quality', () => {
    mountInspector({
      items: [inst(2n, 2n, { craftQuality: 'exquisite' })],
      templates: [tpl(2n)],
      instanceId: 2n,
    });
    const part = wrapper!.findAll('.meta-part').find((p) => p.text() === 'Exquisite quality')!;
    expect(part.attributes('style')).toContain('var(--color-craft-exquisite)');
    wrapper!.unmount();
    mountInspector({
      items: [inst(2n, 2n, { craftQuality: 'constructor' })],
      templates: [tpl(2n)],
      instanceId: 2n,
    });
    const odd = wrapper!.findAll('.meta-part').find((p) => p.text() === 'Constructor quality')!;
    expect(odd.attributes('style') ?? '').not.toContain('color');
  });

  it('hides the up marker from assistive tech and adds a screen-reader span', () => {
    const worn = tpl(1n, { armorClassBonus: 4n });
    const next = tpl(2n, { armorClassBonus: 6n });
    mountInspector({
      items: [inst(1n, 1n, { equippedSlot: 'chest' }), inst(2n, 2n)],
      templates: [worn, next],
      instanceId: 2n,
    });
    const marker = wrapper!.get('.marker');
    expect(marker.text()).toBe('▲2');
    expect(marker.attributes('aria-hidden')).toBe('true');
    expect(wrapper!.get('.stat-value .sr-only').text()).toBe(', 2 more than equipped');
  });

  it('runs Equip once with object arguments, stays inert while pending and ignores a second click', async () => {
    let release: () => void = () => undefined;
    const equipItem = vi.fn().mockImplementation(
      () => new Promise<void>((done) => { release = done; }),
    );
    const { runner } = mountInspector({
      items: [inst(2n, 2n)],
      templates: [tpl(2n)],
      instanceId: 2n,
      reducers: { equipItem },
    });
    expect(primary().text()).toBe('Equip');
    expect(primary().attributes('aria-disabled')).toBeUndefined();
    await primary().trigger('click');
    expect(equipItem).toHaveBeenCalledTimes(1);
    expect(equipItem).toHaveBeenCalledWith({ characterId: 7n, itemInstanceId: 2n });
    await nextTick();
    expect(primary().attributes('aria-disabled')).toBe('true');
    await primary().trigger('click');
    expect(equipItem).toHaveBeenCalledTimes(1);
    release();
    await new Promise((r) => setTimeout(r, 0));
    expect(primary().attributes('aria-disabled')).toBeUndefined();
    expect(runner.rejection.value).toBe(0);
  });

  it('counts a rejected call on the runner', async () => {
    const equipItem = vi.fn().mockRejectedValue(new Error('no'));
    const { runner } = mountInspector({
      items: [inst(2n, 2n)],
      templates: [tpl(2n)],
      instanceId: 2n,
      reducers: { equipItem },
    });
    await primary().trigger('click');
    await new Promise((r) => setTimeout(r, 0));
    expect(runner.rejection.value).toBe(1);
  });

  it('makes a class-blocked Equip aria-disabled with the reason and sends nothing', async () => {
    const { reducers } = mountInspector({
      items: [inst(2n, 2n)],
      templates: [tpl(2n, { armorType: 'plate' })],
      instanceId: 2n,
    });
    expect(primary().attributes('aria-disabled')).toBe('true');
    const reasonId = primary().attributes('aria-describedby')!;
    expect(wrapper!.get(`#${reasonId}`).text()).toBe("Your class can't use plate.");
    await primary().trigger('click');
    expect(reducers.equipItem).not.toHaveBeenCalled();
  });

  it('keeps Equip enabled for a level shortfall and shows the level in red as information', async () => {
    const { reducers } = mountInspector({
      items: [inst(2n, 2n)],
      templates: [tpl(2n, { requiredLevel: 30n })],
      instanceId: 2n,
    });
    expect(primary().attributes('aria-disabled')).toBeUndefined();
    expect(wrapper!.find('.reason').exists()).toBe(false);
    expect(wrapper!.get('.meta-part.short').text()).toBe('Requires Lv 30');
    await primary().trigger('click');
    expect(reducers.equipItem).toHaveBeenCalledTimes(1);
  });

  it('runs Unequip with the slot, Use and Learn recipe', async () => {
    const worn = mountInspector({
      items: [inst(1n, 1n, { equippedSlot: 'chest' })],
      templates: [tpl(1n)],
      instanceId: 1n,
    });
    expect(primary().text()).toBe('Unequip');
    await primary().trigger('click');
    expect(worn.reducers.unequipItem).toHaveBeenCalledWith({ characterId: 7n, slot: 'chest' });
    wrapper!.unmount();

    const food = mountInspector({
      items: [inst(3n, 3n)],
      templates: [tpl(3n, { slot: 'food', name: 'Simple Rations', armorType: '' })],
      instanceId: 3n,
    });
    expect(primary().text()).toBe('Use');
    expect(wrapper!.find('.action.salvage').exists()).toBe(false);
    await primary().trigger('click');
    expect(food.reducers.useItem).toHaveBeenCalledWith({ characterId: 7n, itemInstanceId: 3n });
    wrapper!.unmount();

    const stew = mountInspector({
      items: [inst(6n, 6n)],
      templates: [tpl(6n, { slot: 'food', name: 'Hearthstone Stew', armorType: '', wellFedDurationMicros: 60n })],
      instanceId: 6n,
    });
    expect(primary().text()).toBe('Eat');
    await primary().trigger('click');
    expect(stew.reducers.eatFood).toHaveBeenCalledWith({ characterId: 7n, itemInstanceId: 6n });
    expect(stew.reducers.useItem).not.toHaveBeenCalled();
    wrapper!.unmount();

    const scroll = mountInspector({
      items: [inst(4n, 4n)],
      templates: [tpl(4n, { slot: 'misc', name: 'Scroll: Rope', armorType: '' })],
      instanceId: 4n,
    });
    expect(primary().text()).toBe('Learn recipe');
    await primary().trigger('click');
    expect(scroll.reducers.learnRecipeScroll).toHaveBeenCalledWith({ characterId: 7n, itemInstanceId: 4n });
  });

  it('shows no action row for a material', () => {
    mountInspector({
      items: [inst(5n, 5n)],
      templates: [tpl(5n, { slot: 'material', armorType: '' })],
      instanceId: 5n,
    });
    expect(wrapper!.find('.action-block').exists()).toBe(false);
    expect(wrapper!.find('button').exists()).toBe(false);
  });
});

describe('Inspector salvage', () => {
  const previewFor = (
    instance: ItemInstance,
    template: ItemTemplate,
    affixes: ItemAffix[] = [],
    applied = true,
  ) =>
    salvagePreview({
      instance,
      template,
      affixes,
      characterId: 7n,
      outputRecipe: applied ? null : undefined,
      templates: new Map([[template.id, template]]),
    })!;

  it('shows a PhRecycle icon and the text Salvage on the card and the dock', () => {
    for (const variant of ['card', 'dock'] as const) {
      mountInspector({ items: [inst(2n, 2n)], templates: [tpl(2n)], instanceId: 2n, variant });
      expect(salvage().text()).toBe('Salvage');
      const icon = salvage().find('svg');
      expect(icon.exists()).toBe(true);
      expect(icon.attributes('aria-hidden')).toBe('true');
      wrapper!.unmount();
    }
    expect(source).toMatch(/PhRecycle/);
  });

  it('salvages a common bag item at once', async () => {
    const { reducers } = mountInspector({ items: [inst(2n, 2n)], templates: [tpl(2n)], instanceId: 2n });
    expect(salvage().text()).toBe('Salvage');
    await salvage().trigger('click');
    expect(reducers.salvageItem).toHaveBeenCalledWith({ characterId: 7n, itemInstanceId: 2n });
    expect(wrapper!.find('.inline-confirm').exists()).toBe(false);
  });

  it('asks first above common with the warning icon, naming the yield, focusing Keep it', async () => {
    const template = tpl(2n, { name: 'Fine Vest', rarity: 'uncommon', armorType: 'cloth' });
    const instance = inst(2n, 2n);
    const { reducers } = mountInspector({
      items: [instance],
      templates: [template],
      instanceId: 2n,
      outputRecipe: null,
    });
    await salvage().trigger('click');
    expect(reducers.salvageItem).not.toHaveBeenCalled();
    const confirm = wrapper!.get('.inline-confirm');
    expect(confirm.find('.warn-icon').exists()).toBe(true);
    const expected = previewFor(instance, template).confirmText;
    expect(expected).toMatch(/^Salvage destroys this item\. You'll get \d+ /);
    expect(confirm.get('.confirm-prompt').text()).toBe(expected);
    const buttons = confirm.findAll('button');
    expect(buttons.map((b) => b.text())).toEqual(['Salvage', 'Keep it']);
    expect(document.activeElement).toBe(buttons[1].element);
  });

  it('Keep it and Esc send nothing and refocus the Salvage button', async () => {
    const { reducers } = mountInspector({
      items: [inst(2n, 2n)],
      templates: [tpl(2n, { name: 'Fine Vest', rarity: 'uncommon' })],
      instanceId: 2n,
    });
    await salvage().trigger('click');
    await wrapper!.findAll('.inline-confirm button')[1].trigger('click');
    await nextTick();
    await nextTick();
    expect(reducers.salvageItem).not.toHaveBeenCalled();
    expect(wrapper!.find('.inline-confirm').exists()).toBe(false);
    expect(document.activeElement).toBe(salvage().element);

    await salvage().trigger('click');
    const event = new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true });
    document.body.dispatchEvent(event);
    await nextTick();
    await nextTick();
    expect(event.defaultPrevented).toBe(true);
    expect(reducers.salvageItem).not.toHaveBeenCalled();
    expect(wrapper!.find('.inline-confirm').exists()).toBe(false);
    expect(document.activeElement).toBe(salvage().element);
  });

  it('omits the count while the recipe cap has not applied', async () => {
    const template = tpl(2n, { rarity: 'rare', armorType: 'cloth' });
    const instance = inst(2n, 2n);
    mountInspector({ items: [instance], templates: [template], instanceId: 2n });
    await salvage().trigger('click');
    const text = wrapper!.get('.confirm-prompt').text();
    expect(text).toBe(previewFor(instance, template, [], false).confirmText);
    expect(text).not.toMatch(/\d/);
    expect(text).toMatch(/^Salvage destroys this item\. You'll get \S/);
  });

  it('asks first for crafted gear the server stores as common, and for a reagent-affixed item (CR-01)', async () => {
    const crafted = mountInspector({
      items: [inst(2n, 2n, { qualityTier: 'common', craftQuality: 'exquisite' })],
      templates: [tpl(2n)],
      instanceId: 2n,
    });
    await salvage().trigger('click');
    expect(crafted.reducers.salvageItem).not.toHaveBeenCalled();
    expect(wrapper!.find('.inline-confirm').exists()).toBe(true);
    wrapper!.unmount();

    const affixed = mountInspector({
      items: [inst(3n, 3n)],
      templates: [tpl(3n)],
      affixes: [affix(1n, 3n, 'intBonus', 2n)],
      instanceId: 3n,
    });
    await salvage().trigger('click');
    expect(affixed.reducers.salvageItem).not.toHaveBeenCalled();
    expect(wrapper!.find('.inline-confirm').exists()).toBe(true);
    // The reagent chance is named in the prompt.
    expect(wrapper!.get('.confirm-prompt').text()).toContain('maybe a reagent');
  });

  it('salvages exactly once after the confirm Salvage, never unequipping', async () => {
    const { reducers } = mountInspector({
      items: [inst(2n, 2n)],
      templates: [tpl(2n, { rarity: 'rare' })],
      instanceId: 2n,
    });
    await salvage().trigger('click');
    await wrapper!.findAll('.inline-confirm button')[0].trigger('click');
    await new Promise((r) => setTimeout(r, 0));
    expect(reducers.salvageItem).toHaveBeenCalledTimes(1);
    expect(reducers.salvageItem).toHaveBeenCalledWith({ characterId: 7n, itemInstanceId: 2n });
    expect(reducers.unequipItem).not.toHaveBeenCalled();
  });

  it('closes only the confirmation on Escape and prevents the event', async () => {
    mountInspector({
      items: [inst(2n, 2n)],
      templates: [tpl(2n, { rarity: 'rare' })],
      instanceId: 2n,
    });
    await salvage().trigger('click');
    const event = new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true });
    document.body.dispatchEvent(event);
    await nextTick();
    expect(event.defaultPrevented).toBe(true);
    expect(wrapper!.find('.inline-confirm').exists()).toBe(false);
  });

  it.each(['card', 'dock'] as const)(
    'refuses an equipped item up front in the %s: aria-disabled, described by the reason, nothing sent (T-50-142)',
    async (variant) => {
      const { reducers } = mountInspector({
        items: [inst(1n, 1n, { equippedSlot: 'chest' })],
        templates: [tpl(1n, { rarity: 'rare' })],
        instanceId: 1n,
        variant,
      });
      expect(wrapper!.find('.action.salvage').exists()).toBe(true);
      expect(salvage().attributes('aria-disabled')).toBe('true');
      const reasonId = salvage().attributes('aria-describedby')!;
      expect(wrapper!.get(`#${reasonId}`).text()).toBe("Equipped items can't be salvaged.");
      await salvage().trigger('click');
      expect(wrapper!.find('.inline-confirm').exists()).toBe(false);
      expect(reducers.unequipItem).not.toHaveBeenCalled();
      expect(reducers.salvageItem).not.toHaveBeenCalled();
    },
  );

  it('has no unequip-first flow left in the source', () => {
    expect(source).not.toMatch(/stillEquipped/);
  });

  it('closes the confirmation by itself when the selected instance changes', async () => {
    mountInspector({
      items: [inst(2n, 2n), inst(3n, 2n)],
      templates: [tpl(2n, { rarity: 'rare' })],
      instanceId: 2n,
    });
    await salvage().trigger('click');
    expect(wrapper!.find('.inline-confirm').exists()).toBe(true);
    await wrapper!.setProps({ instanceId: 3n });
    expect(wrapper!.find('.inline-confirm').exists()).toBe(false);
  });
});

describe('Inspector offline', () => {
  it('disables every action and sends nothing while offline', async () => {
    const { reducers } = mountInspector({
      items: [inst(2n, 2n)],
      templates: [tpl(2n)],
      instanceId: 2n,
      connected: false,
    });
    expect(primary().attributes('aria-disabled')).toBe('true');
    expect(salvage().attributes('aria-disabled')).toBe('true');
    await primary().trigger('click');
    await salvage().trigger('click');
    expect(reducers.equipItem).not.toHaveBeenCalled();
    expect(reducers.salvageItem).not.toHaveBeenCalled();
  });
});

describe('Inspector dock', () => {
  const worn = tpl(1n, { armorClassBonus: 11n, intBonus: 2n, description: 'Never shown.' });
  const next = tpl(2n, {
    rarity: 'rare',
    armorClassBonus: 14n,
    intBonus: 3n,
    armorType: 'plate',
    description: 'Never shown.',
  });

  function mountDock() {
    return mountInspector({
      items: [inst(1n, 1n, { equippedSlot: 'chest' }), inst(2n, 2n)],
      templates: [worn, next],
      affixes: [affix(1n, 2n, 'intBonus', 1n)],
      instanceId: 2n,
      variant: 'dock',
    });
  }

  it('shows the name, a close button, the summary, the reason and short action labels', () => {
    mountDock();
    expect(wrapper!.get('.dock-name').text()).toBe('Item 2');
    const close = wrapper!.get('.dock-close');
    expect(close.attributes('aria-label')).toBe('Close item details');
    expect(wrapper!.get('.summary').text()).toBe('Rare chest · AC 14 ▲3 · INT +4 ▲2');
    expect(primary().text()).toBe('Equip');
    expect(salvage().text()).toBe('Salvage');
    expect(wrapper!.get('.reason').text()).toBe("Your class can't use plate.");
    expect(wrapper!.get('.footer').text()).toContain('Sells for');
  });

  it('leaves out the affix rows, the flavor and the card rows', () => {
    mountDock();
    expect(wrapper!.find('.affixes').exists()).toBe(false);
    expect(wrapper!.find('.flavor').exists()).toBe(false);
    expect(wrapper!.find('.kicker').exists()).toBe(false);
    expect(wrapper!.find('.stats').exists()).toBe(false);
  });

  it('emits close from the close button', async () => {
    mountDock();
    await wrapper!.get('.dock-close').trigger('click');
    expect(wrapper!.emitted('close')).toHaveLength(1);
  });

  it('carries 44px minimums for the close button and the actions', () => {
    expect(source).toMatch(/\.dock-close\s*\{[^}]*min-height: 44px;/);
    expect(source).toMatch(/\.actions\.mobile \.action\s*\{\s*min-height: 44px;/);
    mountDock();
    expect(wrapper!.get('.actions').classes()).toContain('mobile');
  });

  it('keeps the confirmation inside the dock', async () => {
    mountInspector({
      items: [inst(2n, 2n)],
      templates: [tpl(2n, { rarity: 'rare' })],
      instanceId: 2n,
      variant: 'dock',
    });
    await salvage().trigger('click');
    expect(wrapper!.get('.inline-confirm').classes()).toContain('mobile');
  });
});

describe('Inspector escaping', () => {
  it.each(['card', 'dock'] as const)('renders an item named with markup literally in the %s', (variant) => {
    mountInspector({
      items: [inst(2n, 2n, { displayName: XSS })],
      templates: [tpl(2n, { description: XSS })],
      affixes: [{ ...affix(1n, 2n, 'intBonus', 1n), affixName: XSS } as ItemAffix],
      instanceId: 2n,
      variant,
    });
    expect(wrapper!.find('img').exists()).toBe(false);
    expect(wrapper!.text()).toContain(XSS);
  });

  it('renders markup in the salvage prompt as text (item name and affix name)', async () => {
    mountInspector({
      items: [inst(2n, 2n, { displayName: XSS })],
      templates: [tpl(2n, { rarity: 'rare' })],
      affixes: [{ ...affix(1n, 2n, 'intBonus', 1n), affixName: XSS } as ItemAffix],
      instanceId: 2n,
    });
    await salvage().trigger('click');
    expect(wrapper!.get('.confirm-prompt').find('img').exists()).toBe(false);
    expect(wrapper!.find('img').exists()).toBe(false);
    expect(wrapper!.text()).toContain(XSS);
  });

  it('does not use v-html anywhere in the source', () => {
    expect(source).not.toMatch(/v-html/);
  });
});
