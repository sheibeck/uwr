// @vitest-environment happy-dom
import { afterEach, describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { mount, type VueWrapper } from '@vue/test-utils';
import Drawer from './Drawer.vue';

let wrapper: VueWrapper | null = null;

function mountDrawer(slot = '<button type="button" class="inner">Inner</button>'): VueWrapper {
  wrapper = mount(Drawer, { props: { title: 'Map' }, slots: { default: slot }, attachTo: document.body });
  return wrapper;
}

afterEach(() => {
  wrapper?.unmount();
  wrapper = null;
  document.body.innerHTML = '';
});

describe('Drawer', () => {
  it('is a labelled modal dialog titled by an h4', () => {
    const w = mountDrawer();
    const root = w.get('section');
    expect(root.attributes('role')).toBe('dialog');
    expect(root.attributes('aria-modal')).toBe('true');
    const heading = w.get('h4');
    expect(heading.text()).toBe('Map');
    expect(root.attributes('aria-labelledby')).toBe(heading.attributes('id'));
  });

  it('close button is labelled and focused on mount', () => {
    const w = mountDrawer();
    const close = w.get('button.btn-icon');
    expect(close.attributes('aria-label')).toBe('Close Map');
    expect(close.attributes('title')).toBe('Close Map');
    expect(document.activeElement).toBe(close.element);
  });

  it('click on close emits close', async () => {
    const w = mountDrawer();
    await w.get('button.btn-icon').trigger('click');
    expect(w.emitted('close')).toHaveLength(1);
  });

  it('Escape emits close unless already handled', () => {
    const w = mountDrawer();
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', cancelable: true }));
    expect(w.emitted('close')).toHaveLength(1);

    const handled = new KeyboardEvent('keydown', { key: 'Escape', cancelable: true });
    handled.preventDefault();
    document.dispatchEvent(handled);
    expect(w.emitted('close')).toHaveLength(1);
  });

  it('removes the Escape listener on unmount', () => {
    const w = mountDrawer();
    w.unmount();
    wrapper = null;
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', cancelable: true }));
    expect(w.emitted('close')).toBeUndefined();
  });

  it('Tab on the last focusable element wraps to the close button', async () => {
    const w = mountDrawer();
    const inner = w.get('button.inner');
    (inner.element as HTMLElement).focus();
    const event = new KeyboardEvent('keydown', { key: 'Tab', cancelable: true, bubbles: true });
    inner.element.dispatchEvent(event);
    expect(event.defaultPrevented).toBe(true);
    expect(document.activeElement).toBe(w.get('button.btn-icon').element);
  });

  it('renders the slot inside the scrolling body', () => {
    const w = mountDrawer('<p class="content">Hello</p>');
    expect(w.get('.drawer-body .content').text()).toBe('Hello');
  });

  it('style block has the 252px inset and a reduced-motion rule', () => {
    const source = readFileSync(resolve(process.cwd(), 'src/frame/Drawer.vue'), 'utf8');
    expect(source).toContain('inset: 0 0 0 252px');
    expect(source).toContain('prefers-reduced-motion');
  });
});
