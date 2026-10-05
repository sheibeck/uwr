// @vitest-environment happy-dom
import { afterEach, describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { mount, type VueWrapper } from '@vue/test-utils';
import Sheet from './Sheet.vue';
import MoreSheet from './MoreSheet.vue';

let wrapper: VueWrapper | null = null;

afterEach(() => {
  wrapper?.unmount();
  wrapper = null;
  document.body.innerHTML = '';
});

function mountSheet(): VueWrapper {
  wrapper = mount(Sheet, {
    props: { title: 'Inventory' },
    slots: { default: '<button type="button" class="inner">Inner</button>' },
    attachTo: document.body,
  });
  return wrapper;
}

function mountMore(): VueWrapper {
  wrapper = mount(MoreSheet, { attachTo: document.body });
  return wrapper;
}

describe('Sheet', () => {
  it('is a labelled modal dialog with a decorative grabber', () => {
    const w = mountSheet();
    const root = w.get('section');
    expect(root.attributes('role')).toBe('dialog');
    expect(root.attributes('aria-modal')).toBe('true');
    const heading = w.get('h4');
    expect(heading.text()).toBe('Inventory');
    expect(root.attributes('aria-labelledby')).toBe(heading.attributes('id'));
    expect(w.get('.grabber').attributes('aria-hidden')).toBe('true');
  });

  it('close button is labelled, focused on mount and emits close on click', async () => {
    const w = mountSheet();
    const close = w.get('button.btn-icon');
    expect(close.attributes('aria-label')).toBe('Close Inventory');
    expect(close.attributes('title')).toBe('Close Inventory');
    expect(document.activeElement).toBe(close.element);
    await close.trigger('click');
    expect(w.emitted('close')).toHaveLength(1);
  });

  it('Escape emits close unless already handled', () => {
    const w = mountSheet();
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', cancelable: true }));
    expect(w.emitted('close')).toHaveLength(1);
    const handled = new KeyboardEvent('keydown', { key: 'Escape', cancelable: true });
    handled.preventDefault();
    document.dispatchEvent(handled);
    expect(w.emitted('close')).toHaveLength(1);
  });

  it('Tab with focus outside the dialog is pulled to the close button', () => {
    const w = mountSheet();
    (document.activeElement as HTMLElement | null)?.blur();
    expect(document.activeElement).toBe(document.body);
    const event = new KeyboardEvent('keydown', { key: 'Tab', cancelable: true, bubbles: true });
    document.body.dispatchEvent(event);
    expect(event.defaultPrevented).toBe(true);
    expect(document.activeElement).toBe(w.get('button.btn-icon').element);
  });

  it('Shift+Tab with focus outside the dialog is pulled to the last focusable element', () => {
    const w = mountSheet();
    (document.activeElement as HTMLElement | null)?.blur();
    const event = new KeyboardEvent('keydown', {
      key: 'Tab',
      shiftKey: true,
      cancelable: true,
      bubbles: true,
    });
    document.body.dispatchEvent(event);
    expect(event.defaultPrevented).toBe(true);
    expect(document.activeElement).toBe(w.get('button.inner').element);
  });

  it('stops trapping Tab after unmount', () => {
    const w = mountSheet();
    w.unmount();
    wrapper = null;
    const event = new KeyboardEvent('keydown', { key: 'Tab', cancelable: true, bubbles: true });
    document.body.dispatchEvent(event);
    expect(event.defaultPrevented).toBe(false);
  });

  it('Tab on the last focusable element wraps to the close button', () => {
    const w = mountSheet();
    const inner = w.get('button.inner');
    (inner.element as HTMLElement).focus();
    const event = new KeyboardEvent('keydown', { key: 'Tab', cancelable: true, bubbles: true });
    inner.element.dispatchEvent(event);
    expect(event.defaultPrevented).toBe(true);
    expect(document.activeElement).toBe(w.get('button.btn-icon').element);
  });

  it('Tab from a tab-bar control outside the dialog is not intercepted', () => {
    const tab = document.createElement('button');
    tab.type = 'button';
    document.body.appendChild(tab);
    const w = mountSheet();
    tab.focus();
    expect(document.activeElement).toBe(tab);
    const event = new KeyboardEvent('keydown', { key: 'Tab', cancelable: true, bubbles: true });
    tab.dispatchEvent(event);
    expect(event.defaultPrevented).toBe(false);
    expect(document.activeElement).toBe(tab);
    const back = new KeyboardEvent('keydown', { key: 'Tab', shiftKey: true, cancelable: true, bubbles: true });
    tab.dispatchEvent(back);
    expect(back.defaultPrevented).toBe(false);
    expect(w.emitted('close')).toBeUndefined();
  });

  it('Shift+Tab on the first focusable element wraps to the last', () => {
    const w = mountSheet();
    const close = w.get('button.btn-icon');
    (close.element as HTMLElement).focus();
    const event = new KeyboardEvent('keydown', { key: 'Tab', shiftKey: true, cancelable: true, bubbles: true });
    close.element.dispatchEvent(event);
    expect(event.defaultPrevented).toBe(true);
    expect(document.activeElement).toBe(w.get('button.inner').element);
  });

  it('style has the 20px top radius, 44px close button and a reduced-motion rule', () => {
    const source = readFileSync(resolve(process.cwd(), 'src/frame/Sheet.vue'), 'utf8');
    expect(source).toContain('border-radius: 20px 20px 0 0');
    expect(source).toContain('44px');
    expect(source).toContain('prefers-reduced-motion');
  });
});

describe('MoreSheet', () => {
  it('titles the sheet More and lists the rows in order', () => {
    const w = mountMore();
    expect(w.get('h4').text()).toBe('More');
    const rows = w.findAll('button.more-row').map((row) => row.text());
    expect(rows).toEqual(['Stats', 'Crafting', 'Events', 'Vendor', 'Log out']);
    const body = w.get('.sheet-body');
    const kinds = Array.from(body.element.children).map((child) =>
      child.getAttribute('role') === 'separator' ? 'hr' : 'row',
    );
    expect(kinds).toEqual(['row', 'row', 'row', 'row', 'hr', 'row']);
  });

  it('emits select with the screen id for each screen row', async () => {
    const w = mountMore();
    const rows = w.findAll('button.more-row');
    await rows[0].trigger('click');
    await rows[1].trigger('click');
    await rows[2].trigger('click');
    await rows[3].trigger('click');
    expect(w.emitted('select')).toEqual([['stats'], ['craft'], ['events'], ['vendor']]);
  });

  it('emits logout and close', async () => {
    const w = mountMore();
    await w.findAll('button.more-row')[4].trigger('click');
    expect(w.emitted('logout')).toHaveLength(1);
    await w.get('button.btn-icon').trigger('click');
    expect(w.emitted('close')).toHaveLength(1);
  });
});
