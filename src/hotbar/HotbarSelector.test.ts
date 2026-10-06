// @vitest-environment happy-dom
import { afterEach, describe, expect, it } from 'vitest';
import { mount, type VueWrapper } from '@vue/test-utils';
import HotbarSelector from './HotbarSelector.vue';

let wrapper: VueWrapper | null = null;

afterEach(() => {
  wrapper?.unmount();
  wrapper = null;
});

const NAMES = ['Combat', 'Travel', 'Craft'];

function mountSelector(props: Partial<{ names: string[]; activeIndex: number; desktop: boolean; disabled: boolean }> = {}) {
  wrapper = mount(HotbarSelector, {
    props: { names: NAMES, activeIndex: 2, desktop: true, disabled: false, ...props },
  });
  return wrapper;
}

describe('HotbarSelector desktop', () => {
  it('renders two caret buttons around the name and position', () => {
    const w = mountSelector();
    const prev = w.get('button[aria-label="Previous hotbar"]');
    const next = w.get('button[aria-label="Next hotbar"]');
    expect(prev.classes()).toEqual(expect.arrayContaining(['btn', 'btn-secondary', 'btn-icon']));
    expect(next.classes()).toEqual(expect.arrayContaining(['btn', 'btn-secondary', 'btn-icon']));
    expect(w.findAll('svg')).toHaveLength(2);
    const name = w.get('.label-name');
    expect(name.text()).toBe('Craft');
    expect(name.attributes('title')).toBe('Craft');
    expect(w.get('.label-position').text()).toBe('3/3');
  });

  it('Next wraps to the first and Previous steps back', async () => {
    const w = mountSelector();
    await w.get('button[aria-label="Next hotbar"]').trigger('click');
    await w.get('button[aria-label="Previous hotbar"]').trigger('click');
    expect(w.emitted('select')).toEqual([[0], [1]]);
  });

  it('Previous wraps from the first to the last', async () => {
    const w = mountSelector({ activeIndex: 0 });
    await w.get('button[aria-label="Previous hotbar"]').trigger('click');
    expect(w.emitted('select')).toEqual([[2]]);
  });

  it('disables both carets with one hotbar and emits nothing', async () => {
    const w = mountSelector({ names: ['Combat'], activeIndex: 0 });
    const buttons = w.findAll('button');
    expect(buttons).toHaveLength(2);
    for (const button of buttons) {
      expect(button.attributes('disabled')).toBeDefined();
      await button.trigger('click');
    }
    expect(w.emitted('select')).toBeUndefined();
    expect(w.get('.label-position').text()).toBe('1/1');
  });

  it('the disabled prop disables everything', () => {
    const w = mountSelector({ disabled: true });
    for (const button of w.findAll('button')) expect(button.attributes('disabled')).toBeDefined();
  });

  it('keeps hostile names as text', () => {
    const w = mountSelector({ names: ['<img src=x onerror=alert(1)>', 'Two'], activeIndex: 0 });
    expect(w.find('img').exists()).toBe(false);
    expect(w.get('.label-name').text()).toBe('<img src=x onerror=alert(1)>');
    expect(w.get('.label-name').attributes('title')).toBe('<img src=x onerror=alert(1)>');
  });
});

describe('HotbarSelector mobile', () => {
  it('renders one 52px secondary button with the two-line label and aria-label', () => {
    const w = mountSelector({ desktop: false });
    const buttons = w.findAll('button');
    expect(buttons).toHaveLength(1);
    expect(buttons[0].classes()).toEqual(expect.arrayContaining(['btn', 'btn-secondary', 'selector-mobile']));
    expect(buttons[0].attributes('aria-label')).toBe('Hotbar Craft, 3 of 3. Switch to next hotbar.');
    expect(w.get('.label-name').text()).toBe('Craft');
    expect(w.get('.label-position').text()).toBe('3/3');
  });

  it('click cycles to the next hotbar and wraps', async () => {
    const w = mountSelector({ desktop: false });
    await w.get('button').trigger('click');
    expect(w.emitted('select')).toEqual([[0]]);
  });

  it('is disabled with one hotbar and when disabled', async () => {
    const w = mountSelector({ desktop: false, names: ['Combat'], activeIndex: 0 });
    expect(w.get('button').attributes('disabled')).toBeDefined();
    await w.get('button').trigger('click');
    expect(w.emitted('select')).toBeUndefined();
    w.unmount();
    const w2 = mountSelector({ desktop: false, disabled: true });
    expect(w2.get('button').attributes('disabled')).toBeDefined();
  });
});
