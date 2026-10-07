// @vitest-environment happy-dom
import { afterEach, describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { mount, type VueWrapper } from '@vue/test-utils';
import { defineComponent, h } from 'vue';
import Sheet from './Sheet.vue';
import MoreSheet from './MoreSheet.vue';
import FeedShell from './FeedShell.vue';

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

  it('renders a meta slot between the title and the spacer', () => {
    wrapper = mount(Sheet, {
      props: { title: 'Encounter' },
      slots: { default: 'Body', meta: '<span class="sheet-meta">Round 3 · 6s</span>' },
      attachTo: document.body,
    });
    const header = wrapper.get('.sheet-header');
    const kinds = Array.from(header.element.children).map((child) => child.tagName.toLowerCase() + '.' + child.className);
    expect(kinds.slice(0, 3)).toEqual(['h4.', 'span.sheet-meta', 'span.sheet-spacer']);
    expect(wrapper.get('.sheet-meta').text()).toBe('Round 3 · 6s');
  });

  it('without a meta slot the header is the title, the spacer and the close button', () => {
    const w = mountSheet();
    const kinds = Array.from(w.get('.sheet-header').element.children).map((child) => child.tagName.toLowerCase());
    expect(kinds).toEqual(['h4', 'span', 'button']);
  });

  // Plan 50-39: header actions sit after the spacer, before the close button.
  it('puts the actions after the spacer and before the close button, and has no wrapper without them', () => {
    wrapper = mount(Sheet, {
      props: { title: 'Inventory' },
      slots: {
        default: 'Body',
        meta: '<span class="sheet-meta">2 / 50</span>',
        actions: '<button type="button" class="act">A</button>',
      },
      attachTo: document.body,
    });
    const kinds = Array.from(wrapper.get('.sheet-header').element.children).map(
      (child) => child.tagName.toLowerCase() + '.' + child.className.split(' ')[0],
    );
    expect(kinds).toEqual(['h4.', 'span.sheet-meta', 'span.sheet-spacer', 'span.sheet-actions', 'button.btn']);
    expect(wrapper.get('.sheet-actions .act').text()).toBe('A');
    expect(document.activeElement).toBe(wrapper.get('button.sheet-close').element);
    wrapper.unmount();
    expect(mountSheet().find('.sheet-actions').exists()).toBe(false);
  });

  // Plan 51-09: the Map's header action renders nothing on mobile (the pill lives in the region row).
  it('hides an actions wrapper whose slot renders nothing', () => {
    const Empty = defineComponent({ setup: () => () => null });
    wrapper = mount(Sheet, {
      props: { title: 'Map' },
      slots: { default: 'Body', actions: () => h(Empty) },
      attachTo: document.body,
    });
    const actions = wrapper.get('.sheet-actions').element;
    expect(Array.from(actions.childNodes).every((node) => node.nodeType === Node.COMMENT_NODE)).toBe(true);
    expect(actions.matches(':empty')).toBe(true);
    const source = readFileSync(resolve(process.cwd(), 'src/frame/Sheet.vue'), 'utf8');
    expect(source).toContain('.sheet-actions:empty');
    expect(source).toMatch(/.sheet-actions:emptys*{s*display:s*none;/);
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

describe('MoreSheet logoutOnly', () => {
  it('lists only the Log out row, with no separator, and emits logout', async () => {
    wrapper = mount(MoreSheet, { props: { logoutOnly: true }, attachTo: document.body });
    const rows = wrapper.findAll('button.more-row');
    expect(rows.map((row) => row.text())).toEqual(['Log out']);
    expect(wrapper.find('[role="separator"]').exists()).toBe(false);
    await rows[0].trigger('click');
    expect(wrapper.emitted('logout')).toHaveLength(1);
    expect(wrapper.emitted('select')).toBeUndefined();
  });

  it('still closes from the close button', async () => {
    wrapper = mount(MoreSheet, { props: { logoutOnly: true }, attachTo: document.body });
    await wrapper.get('button.btn-icon').trigger('click');
    expect(wrapper.emitted('close')).toHaveLength(1);
  });

  it('without the prop the full list is unchanged', () => {
    const w = mountMore();
    expect(w.findAll('button.more-row').map((row) => row.text())).toEqual([
      'Stats',
      'Crafting',
      'Events',
      'Vendor',
      'Log out',
    ]);
    expect(w.find('[role="separator"]').exists()).toBe(true);
  });
});

describe('FeedShell safeBottom', () => {
  it('adds the safe-bottom class only when asked', () => {
    wrapper = mount(FeedShell, { props: { compact: true, safeBottom: true } });
    expect(wrapper.get('main.feed').classes()).toContain('safe-bottom');
    wrapper.unmount();
    wrapper = mount(FeedShell, { props: { compact: true } });
    expect(wrapper.get('main.feed').classes()).not.toContain('safe-bottom');
    expect(wrapper.get('main.feed').classes()).toEqual(['feed', 'compact']);
  });

  it('pads the compact composer by the bottom safe-area inset', () => {
    const source = readFileSync(resolve(process.cwd(), 'src/frame/FeedShell.vue'), 'utf8');
    expect(source).toContain('.compact.safe-bottom .composer');
    expect(source).toContain('calc(8px + env(safe-area-inset-bottom))');
  });
});
