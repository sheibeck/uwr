// @vitest-environment happy-dom
import { afterEach, describe, expect, it } from 'vitest';
import { nextTick } from 'vue';
import { mount, type VueWrapper } from '@vue/test-utils';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import ReagentPicker from './ReagentPicker.vue';
import type { PickerOption } from './craftingModel';

const XSS = '<img src=x onerror=alert(1)>';

let wrapper: VueWrapper | null = null;
afterEach(() => {
  wrapper?.unmount();
  wrapper = null;
  document.body.innerHTML = '';
});

const OPTIONS: PickerOption[] = [
  { templateId: 11n, name: 'Essence', color: 'var(--color-text)', have: 2n, hint: '+2 per reagent', eligible: true },
  { templateId: 12n, name: 'Greater Essence', color: 'var(--color-rarity-epic)', have: 1n, hint: '+3 per reagent', eligible: true },
  { templateId: 10n, name: 'Lesser Essence', color: 'var(--color-text)', have: 3n, hint: 'Too weak for Reinforced quality', eligible: false },
];

function mountPicker(props: Partial<{ kind: 'essence' | 'reagent'; options: PickerOption[]; mobile: boolean }> = {}) {
  wrapper = mount(ReagentPicker, {
    attachTo: document.body,
    props: { kind: 'essence', options: OPTIONS, ...props },
  });
  return wrapper;
}

function press(el: Element, key: string): void {
  el.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true }));
}

describe('ReagentPicker', () => {
  it('renders a listbox labelled for its kind with one option per entry: name, count, hint', () => {
    const w = mountPicker();
    const box = w.get('[role="listbox"]');
    expect(box.attributes('aria-label')).toBe('Choose essence');
    const options = w.findAll('[role="option"]');
    expect(options).toHaveLength(3);
    expect(options[1].get('.name').text()).toBe('Greater Essence');
    expect(options[1].get('.name').attributes('style')).toContain('var(--color-rarity-epic)');
    expect(options[1].get('.have').text()).toBe('×1');
    expect(options[1].get('.hint').text()).toBe('+3 per reagent');
    wrapper?.unmount();
    wrapper = null;
    const reagent = mountPicker({ kind: 'reagent' });
    expect(reagent.get('[role="listbox"]').attributes('aria-label')).toBe('Choose reagent');
  });

  it('lists an ineligible option aria-disabled with its hint and does not let it be chosen', async () => {
    const w = mountPicker();
    const weak = w.findAll('[role="option"]')[2];
    expect(weak.attributes('aria-disabled')).toBe('true');
    expect(weak.get('.hint').text()).toBe('Too weak for Reinforced quality');
    await weak.trigger('click');
    expect(w.emitted('choose')).toBeUndefined();
    const box = w.get('[role="listbox"]').element;
    press(box, 'ArrowDown');
    press(box, 'ArrowDown');
    await nextTick();
    expect(w.get('[role="listbox"]').attributes('aria-activedescendant')).toBe(weak.attributes('id'));
    press(box, 'Enter');
    expect(w.emitted('choose')).toBeUndefined();
  });

  it('moves the active option with ArrowDown and ArrowUp and chooses with Enter', async () => {
    const w = mountPicker();
    const box = w.get('[role="listbox"]');
    const ids = w.findAll('[role="option"]').map((o) => o.attributes('id'));
    expect(box.attributes('aria-activedescendant')).toBe(ids[0]);
    press(box.element, 'ArrowDown');
    await nextTick();
    expect(box.attributes('aria-activedescendant')).toBe(ids[1]);
    expect(w.findAll('[role="option"]')[1].attributes('aria-selected')).toBe('true');
    press(box.element, 'ArrowUp');
    await nextTick();
    expect(box.attributes('aria-activedescendant')).toBe(ids[0]);
    press(box.element, 'ArrowUp');
    await nextTick();
    expect(box.attributes('aria-activedescendant')).toBe(ids[0]);
    press(box.element, 'ArrowDown');
    await nextTick();
    press(box.element, 'Enter');
    expect(w.emitted('choose')).toEqual([[12n]]);
  });

  it('chooses an eligible option on click', async () => {
    const w = mountPicker();
    await w.findAll('[role="option"]')[0].trigger('click');
    expect(w.emitted('choose')).toEqual([[11n]]);
  });

  it('moves focus to the listbox when it opens', async () => {
    const w = mountPicker();
    await nextTick();
    await nextTick();
    expect(document.activeElement).toBe(w.get('[role="listbox"]').element);
  });

  it('emits close on Escape and prevents the key so the drawer stays open; stops listening on unmount', () => {
    const w = mountPicker();
    const event = new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true });
    document.body.dispatchEvent(event);
    expect(event.defaultPrevented).toBe(true);
    expect(w.emitted('close')).toHaveLength(1);
    w.unmount();
    wrapper = null;
    const later = new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true });
    document.body.dispatchEvent(later);
    expect(later.defaultPrevented).toBe(false);
  });

  it('shows the empty line for each kind and still closes on Escape', () => {
    const essences = mountPicker({ options: [] });
    expect(essences.text()).toBe('No essences on hand.');
    expect(essences.find('[role="listbox"]').exists()).toBe(false);
    document.body.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }));
    expect(essences.emitted('close')).toHaveLength(1);
    wrapper?.unmount();
    wrapper = null;
    expect(mountPicker({ kind: 'reagent', options: [] }).text()).toBe('No reagents on hand.');
  });

  it('keeps 32px options on desktop and 44px on mobile in the source', () => {
    const source = readFileSync(resolve(process.cwd(), 'src/crafting/ReagentPicker.vue'), 'utf8');
    expect(source).toMatch(/\.option\s*\{[^}]*min-height: 32px;/);
    expect(source).toMatch(/\.mobile \.option\s*\{\s*min-height: 44px;/);
    expect(source).toMatch(/\.option\s*\{[^}]*padding: 4px 8px;/);
    expect(mountPicker({ mobile: true }).get('.reagent-picker').classes()).toContain('mobile');
  });

  it('renders an option name with markup literally', () => {
    const w = mountPicker({ options: [{ ...OPTIONS[0], name: XSS }] });
    expect(w.get('.name').text()).toBe(XSS);
    expect(w.find('img').exists()).toBe(false);
  });
});
