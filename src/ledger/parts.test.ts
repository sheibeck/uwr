// @vitest-environment happy-dom
import { afterEach, describe, expect, it } from 'vitest';
import { nextTick } from 'vue';
import { mount, type VueWrapper } from '@vue/test-utils';
import { PhHammer, PhRecycle } from '@phosphor-icons/vue';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { ItemInstance, ItemTemplate } from '../module_bindings/types';
import GoldAmount from './GoldAmount.vue';
import FilterChips from './FilterChips.vue';
import SegTabs from './SegTabs.vue';
import InlineConfirm from './InlineConfirm.vue';
import ItemTile from './ItemTile.vue';

const XSS = '<img src=x onerror=alert(1)>';
const here = (file: string): string => readFileSync(resolve(process.cwd(), 'src/ledger', file), 'utf8');

let wrapper: VueWrapper | null = null;
afterEach(() => {
  wrapper?.unmount();
  wrapper = null;
  document.body.innerHTML = '';
});

function track<T extends VueWrapper>(w: T): T {
  wrapper = w;
  return w;
}

describe('GoldAmount', () => {
  it('shows a coin and the grouped amount with the spoken label', () => {
    const w = track(mount(GoldAmount, { props: { amount: 1284n } }));
    expect(w.text()).toBe('1,284');
    expect(w.text()).not.toContain('gold');
    expect(w.attributes('aria-label')).toBe('1284 gold');
    expect(w.get('.coin').attributes('aria-hidden')).toBe('true');
  });

  it('shows a leading sign for a delta', () => {
    const w = track(mount(GoldAmount, { props: { amount: 3n, delta: true } }));
    expect(w.text()).toBe('+3');
    expect(w.attributes('aria-label')).toBe('+3 gold');
  });

  it('uses 12px for the label size and 14px for the body size', () => {
    const label = track(mount(GoldAmount, { props: { amount: 5n } }));
    expect(label.classes()).toContain('size-label');
    label.unmount();
    wrapper = null;
    const body = track(mount(GoldAmount, { props: { amount: 5n, size: 'body' } }));
    expect(body.classes()).toContain('size-body');
    const source = here('GoldAmount.vue');
    expect(source).toMatch(/\.size-label\s*\{\s*font-size: 12px;/);
    expect(source).toMatch(/\.size-body\s*\{\s*font-size: 14px;/);
  });

  it('colors the amount by tone with existing tokens', () => {
    const muted = track(mount(GoldAmount, { props: { amount: 5n, tone: 'muted' } }));
    expect(muted.classes()).toContain('tone-muted');
    muted.unmount();
    wrapper = null;
    const short = track(mount(GoldAmount, { props: { amount: 5n, tone: 'short' } }));
    expect(short.classes()).toContain('tone-short');
    const source = here('GoldAmount.vue');
    expect(source).toMatch(/\.tone-muted\s*\{\s*color: var\(--color-neutral-500\);/);
    expect(source).toMatch(/\.tone-short\s*\{\s*color: var\(--color-con-red\);/);
  });
});

describe('FilterChips', () => {
  const options = [
    { id: 'all', label: 'All' },
    { id: 'gear', label: 'Gear' },
    { id: 'food', label: 'Food' },
  ];

  it('renders a labelled group of toggle buttons with one pressed', () => {
    const w = track(
      mount(FilterChips, { props: { options, modelValue: 'gear', groupLabel: 'Backpack filter' } }),
    );
    const group = w.get('[role="group"]');
    expect(group.attributes('aria-label')).toBe('Backpack filter');
    const buttons = w.findAll('button');
    expect(buttons.map((b) => b.text())).toEqual(['All', 'Gear', 'Food']);
    expect(buttons.map((b) => b.attributes('aria-pressed'))).toEqual(['false', 'true', 'false']);
    expect(buttons[1].classes()).toContain('tag-accent');
    expect(buttons[0].classes()).toContain('tag-neutral');
  });

  it('gives a mobile chip a hit area at least 44px wide and tall, centred on the chip (IN-10)', () => {
    expect(here('FilterChips.vue')).toMatch(
      /\.mobile \.chip::after\s*\{[^}]*left: 50%;[^}]*width: max\(100%, 44px\);[^}]*height: 44px;[^}]*translate\(-50%, -50%\)/,
    );
  });

  it('emits update:modelValue on click', async () => {
    const w = track(
      mount(FilterChips, { props: { options, modelValue: 'all', groupLabel: 'Backpack filter' } }),
    );
    await w.findAll('button')[2].trigger('click');
    expect(w.emitted('update:modelValue')).toEqual([['food']]);
  });

  it('is aria-disabled on every chip and emits nothing when disabled', async () => {
    const w = track(
      mount(FilterChips, {
        props: { options, modelValue: 'all', groupLabel: 'Backpack filter', disabled: true },
      }),
    );
    for (const button of w.findAll('button')) expect(button.attributes('aria-disabled')).toBe('true');
    await w.findAll('button')[1].trigger('click');
    expect(w.emitted('update:modelValue')).toBeUndefined();
  });
});

describe('SegTabs', () => {
  const tabs = [
    { id: 'bag', label: 'Backpack' },
    { id: 'eq', label: 'Equipped' },
    { id: 'gear', label: 'Gear' },
  ];

  function mountTabs(modelValue = 'bag') {
    return track(
      mount(SegTabs, {
        attachTo: document.body,
        props: { tabs, modelValue, label: 'Inventory view', idPrefix: 'inv' },
        slots: { default: '<template #default="{ active }"><p class="body">panel {{ active }}</p></template>' },
      }),
    );
  }

  function key(w: VueWrapper, name: string): KeyboardEvent {
    const event = new KeyboardEvent('keydown', { key: name, bubbles: true, cancelable: true });
    w.get('[role="tablist"]').element.dispatchEvent(event);
    return event;
  }

  it('renders ARIA tabs with a roving tabindex', () => {
    const w = mountTabs('eq');
    expect(w.get('[role="tablist"]').attributes('aria-label')).toBe('Inventory view');
    const tabEls = w.findAll('[role="tab"]');
    expect(tabEls.map((t) => t.attributes('aria-selected'))).toEqual(['false', 'true', 'false']);
    expect(tabEls.map((t) => t.attributes('tabindex'))).toEqual(['-1', '0', '-1']);
    expect(tabEls[0].attributes('aria-controls')).toBe('inv-panel-bag');
    expect(tabEls[1].attributes('id')).toBe('inv-tab-eq');
  });

  it('renders only the selected panel, labelled by its tab, with the active id in the slot', () => {
    const w = mountTabs('eq');
    const panels = w.findAll('[role="tabpanel"]');
    expect(panels).toHaveLength(1);
    expect(panels[0].attributes('id')).toBe('inv-panel-eq');
    expect(panels[0].attributes('aria-labelledby')).toBe('inv-tab-eq');
    expect(panels[0].attributes('tabindex')).toBe('0');
    expect(panels[0].text()).toBe('panel eq');
  });

  it('moves with the arrows (wrapping), Home and End, preventing the default', () => {
    const w = mountTabs('eq');
    let event = key(w, 'ArrowRight');
    expect(event.defaultPrevented).toBe(true);
    expect(w.emitted('update:modelValue')?.pop()).toEqual(['gear']);
    event = key(w, 'ArrowLeft');
    expect(event.defaultPrevented).toBe(true);
    expect(w.emitted('update:modelValue')?.pop()).toEqual(['bag']);
    event = key(w, 'Home');
    expect(event.defaultPrevented).toBe(true);
    expect(w.emitted('update:modelValue')?.pop()).toEqual(['bag']);
    event = key(w, 'End');
    expect(event.defaultPrevented).toBe(true);
    expect(w.emitted('update:modelValue')?.pop()).toEqual(['gear']);
  });

  it('wraps at both ends', async () => {
    const w = mountTabs('gear');
    key(w, 'ArrowRight');
    expect(w.emitted('update:modelValue')?.pop()).toEqual(['bag']);
    await w.setProps({ modelValue: 'bag' });
    key(w, 'ArrowLeft');
    expect(w.emitted('update:modelValue')?.pop()).toEqual(['gear']);
  });

  it('leaves other keys alone', () => {
    const w = mountTabs();
    const event = key(w, 'a');
    expect(event.defaultPrevented).toBe(false);
    expect(w.emitted('update:modelValue')).toBeUndefined();
  });

  it('moves focus to the newly selected tab and selects on click', async () => {
    const w = mountTabs('bag');
    key(w, 'ArrowRight');
    await w.setProps({ modelValue: 'eq' });
    await nextTick();
    expect(document.activeElement).toBe(w.findAll('[role="tab"]')[1].element);
    await w.findAll('[role="tab"]')[2].trigger('click');
    expect(w.emitted('update:modelValue')?.pop()).toEqual(['gear']);
  });
});

describe('InlineConfirm', () => {
  function mountConfirm(props: Record<string, unknown> = {}) {
    const opener = document.createElement('button');
    opener.textContent = 'Salvage';
    document.body.appendChild(opener);
    const w = track(
      mount(InlineConfirm, {
        attachTo: document.body,
        props: {
          prompt: "Salvage Ashen Blade? This can't be undone.",
          confirmLabel: 'Yes, salvage',
          opener,
          ...props,
        },
      }),
    );
    return { w, opener };
  }

  it('shows the prompt, a danger confirm button and Keep it', () => {
    const { w } = mountConfirm();
    expect(w.get('.confirm-prompt').text()).toBe("Salvage Ashen Blade? This can't be undone.");
    const buttons = w.findAll('button');
    expect(buttons.map((b) => b.text())).toEqual(['Yes, salvage', 'Keep it']);
    expect(buttons[0].classes()).toContain('danger');
    expect(buttons[0].classes()).toContain('btn-secondary');
    expect(buttons[1].classes()).toContain('btn-primary');
    expect(here('InlineConfirm.vue')).toMatch(/\.decision-btn\.danger\s*\{\s*color: var\(--color-health\);/);
  });

  it('focuses Keep it on mount', () => {
    const { w } = mountConfirm();
    expect(document.activeElement).toBe(w.findAll('button')[1].element);
  });

  it('Keep it emits keep and refocuses the opener', async () => {
    const { w, opener } = mountConfirm();
    await w.findAll('button')[1].trigger('click');
    await nextTick();
    expect(w.emitted('keep')).toHaveLength(1);
    expect(w.emitted('confirm')).toBeUndefined();
    expect(document.activeElement).toBe(opener);
  });

  it('Escape emits keep, prevents the default and refocuses the opener', async () => {
    const { w, opener } = mountConfirm();
    const event = new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true });
    document.dispatchEvent(event);
    await nextTick();
    expect(event.defaultPrevented).toBe(true);
    expect(w.emitted('keep')).toHaveLength(1);
    expect(document.activeElement).toBe(opener);
  });

  it('Escape prevents the default before a later document listener sees it', () => {
    mountConfirm();
    let seen: boolean | null = null;
    const later = (event: KeyboardEvent) => {
      seen = event.defaultPrevented;
    };
    document.addEventListener('keydown', later);
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }));
    document.removeEventListener('keydown', later);
    expect(seen).toBe(true);
  });

  it('stops listening for Escape after it unmounts', () => {
    const { w } = mountConfirm();
    w.unmount();
    wrapper = null;
    const event = new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true });
    document.dispatchEvent(event);
    expect(event.defaultPrevented).toBe(false);
  });

  it('shows a warning icon before the prompt only when asked', () => {
    const plain = mountConfirm();
    expect(plain.w.find('.warn-icon').exists()).toBe(false);
    plain.w.unmount();
    wrapper = null;
    const { w } = mountConfirm({ warning: true });
    const icon = w.get('.warn-icon');
    expect(icon.attributes('aria-hidden')).toBe('true');
    const children = Array.from(w.element.children);
    expect(children.indexOf(icon.element)).toBe(children.indexOf(w.get('.confirm-prompt').element) - 1);
    expect(here('InlineConfirm.vue')).toMatch(/\.warn-icon\s*\{[^}]*color: var\(--color-con-yellow\);/);
  });

  it('confirm emits confirm and is inert while pending', async () => {
    const { w } = mountConfirm();
    await w.findAll('button')[0].trigger('click');
    expect(w.emitted('confirm')).toHaveLength(1);
    await w.setProps({ pending: true });
    expect(w.findAll('button')[0].attributes('aria-disabled')).toBe('true');
    await w.findAll('button')[0].trigger('click');
    expect(w.emitted('confirm')).toHaveLength(1);
  });
});

describe('ItemTile', () => {
  const template = (over: Record<string, unknown> = {}) =>
    ({
      id: 1n,
      name: 'Ashen Blade',
      slot: 'mainHand',
      weaponType: 'sword',
      rarity: 'rare',
      isJunk: false,
      wellFedDurationMicros: 0n,
      ...over,
    }) as unknown as ItemTemplate;
  const instance = (over: Record<string, unknown> = {}) =>
    ({ id: 7n, templateId: 1n, quantity: 1n, qualityTier: undefined, displayName: undefined, ...over }) as unknown as ItemInstance;

  it('is a button with the item label and no quantity at one', () => {
    const w = track(mount(ItemTile, { props: { instance: instance(), template: template(), selected: false } }));
    expect(w.element.tagName).toBe('BUTTON');
    expect(w.attributes('aria-label')).toBe('Ashen Blade, rare');
    expect(w.attributes('aria-pressed')).toBe('false');
    expect(w.find('.quantity').exists()).toBe(false);
    expect(w.get('.name').text()).toBe('Ashen Blade');
  });

  it('shows the quantity above one and lists it in the label', () => {
    const w = track(
      mount(ItemTile, {
        props: { instance: instance({ quantity: 20n }), template: template({ slot: 'material', name: 'Ore', rarity: 'common' }), selected: false },
      }),
    );
    expect(w.get('.quantity').text()).toBe('x20');
    expect(w.attributes('aria-label')).toBe('Ore, common, quantity 20');
  });

  it('shows x{n} for every stackable including x1, and names the quantity', () => {
    const ore = template({ slot: 'material', name: 'Ore', rarity: 'common', stackable: true });
    const w = track(mount(ItemTile, { props: { instance: instance({ quantity: 14n }), template: ore, selected: false } }));
    expect(w.get('.quantity').text()).toBe('x14');
    expect(w.attributes('aria-label')).toBe('Ore, common, quantity 14');
    w.unmount();
    wrapper = null;
    const one = track(mount(ItemTile, { props: { instance: instance({ quantity: 1n }), template: ore, selected: false } }));
    expect(one.get('.quantity').text()).toBe('x1');
    expect(one.attributes('aria-label')).toBe('Ore, common, quantity 1');
  });

  it('shows no count for a non-stackable at one, and x2 at two', () => {
    const w = track(mount(ItemTile, { props: { instance: instance({ quantity: 1n }), template: template(), selected: false } }));
    expect(w.find('.quantity').exists()).toBe(false);
    w.unmount();
    wrapper = null;
    const two = track(mount(ItemTile, { props: { instance: instance({ quantity: 2n }), template: template(), selected: false } }));
    expect(two.get('.quantity').text()).toBe('x2');
  });

  it('rings a common tile in neutral-200 at 1px and 2px selected with the common token', async () => {
    const common = template({ rarity: 'common', slot: 'material', name: 'Ore' });
    const w = track(mount(ItemTile, { props: { instance: instance(), template: common, selected: false } }));
    expect(w.attributes('style')).toContain('0 0 0 1px var(--color-neutral-200)');
    await w.setProps({ selected: true });
    expect(w.attributes('style')).toContain('0 0 0 2px var(--color-rarity-common)');
  });

  it('pins the count top-right at 10px and the 44px touch size in the SFC', () => {
    const source = here('ItemTile.vue');
    const quantity = /\.quantity \{([^}]*)\}/.exec(source)![1];
    expect(quantity).toMatch(/top: 4px;/);
    expect(quantity).toMatch(/right: 4px;/);
    expect(quantity).not.toMatch(/bottom:/);
    expect(quantity).toMatch(/font-size: 10px;/);
    expect(source).toMatch(/min-width: 44px;/);
    expect(source).toMatch(/min-height: 44px;/);
  });

  it('hides the name on mobile and marks a selected tile pressed', () => {
    const w = track(
      mount(ItemTile, { props: { instance: instance(), template: template(), selected: true, mobile: true } }),
    );
    expect(w.find('.name').exists()).toBe(false);
    expect(w.attributes('aria-pressed')).toBe('true');
    expect(w.attributes('style')).toContain('2px');
    expect(w.attributes('style')).toContain('var(--color-rarity-rare)');
  });

  it('adds junk and quest item to the label and dims a junk ring', () => {
    const junk = track(
      mount(ItemTile, { props: { instance: instance(), template: template({ isJunk: true }), selected: false } }),
    );
    expect(junk.attributes('aria-label')).toBe('Ashen Blade, rare, junk');
    expect(junk.attributes('style')).toContain('var(--color-neutral-700)');
    junk.unmount();
    wrapper = null;
    const quest = track(
      mount(ItemTile, { props: { instance: instance(), template: template({ slot: 'quest' }), selected: false } }),
    );
    expect(quest.attributes('aria-label')).toBe('Ashen Blade, rare, quest item');
  });

  it('uses the instance display name and quality tier', () => {
    const w = track(
      mount(ItemTile, {
        props: {
          instance: instance({ displayName: 'Dawnbreaker', qualityTier: 'Epic' }),
          template: template(),
          selected: false,
        },
      }),
    );
    expect(w.attributes('aria-label')).toBe('Dawnbreaker, epic');
  });

  it('emits select on click and takes a tabindex', async () => {
    const w = track(
      mount(ItemTile, { props: { instance: instance(), template: template(), selected: false, tabindex: -1 } }),
    );
    expect(w.attributes('tabindex')).toBe('-1');
    await w.trigger('click');
    expect(w.emitted('select')).toHaveLength(1);
  });

  it('renders an item name with markup literally (no element)', () => {
    const w = track(
      mount(ItemTile, {
        props: { instance: instance({ displayName: XSS }), template: template(), selected: false },
      }),
    );
    expect(w.find('img').exists()).toBe(false);
    expect(w.get('.name').text()).toBe(XSS);
    expect(w.attributes('aria-label')).toContain(XSS);
    expect(w.element.querySelector('img')).toBeNull();
  });
});

describe('SegTabs icons (Plan 50-38)', () => {
  it('draws an optional icon before the label, hidden from readers, at 14px', () => {
    const w = track(
      mount(SegTabs, {
        attachTo: document.body,
        props: {
          tabs: [
            { id: 'craft', label: 'Craft', icon: PhHammer },
            { id: 'salvage', label: 'Salvage', icon: PhRecycle },
          ],
          modelValue: 'craft',
          label: 'Crafting mode',
          idPrefix: 'cm',
        },
        slots: { default: '<template #default="{ active }"><p>{{ active }}</p></template>' },
      }),
    );
    const tabEls = w.findAll('[role="tab"]');
    expect(tabEls.map((t) => t.text())).toEqual(['Craft', 'Salvage']);
    for (const tab of tabEls) {
      const icon = tab.get('svg');
      expect(icon.attributes('aria-hidden')).toBe('true');
      expect(icon.attributes('width')).toBe('14');
    }
    expect(tabEls[0].element.firstElementChild?.tagName.toLowerCase()).toBe('svg');
  });

  it('renders tabs without an icon exactly as before', () => {
    const w = track(
      mount(SegTabs, {
        attachTo: document.body,
        props: {
          tabs: [
            { id: 'a', label: 'A' },
            { id: 'b', label: 'B' },
          ],
          modelValue: 'a',
          label: 'Plain',
          idPrefix: 'pl',
        },
        slots: { default: '<p>x</p>' },
      }),
    );
    expect(w.findAll('[role="tab"] svg')).toHaveLength(0);
    expect(here('SegTabs.vue')).toContain('icon?: Component');
  });
});
