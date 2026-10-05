// @vitest-environment happy-dom
import { afterEach, describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { mount, type VueWrapper } from '@vue/test-utils';
import TabBar from './TabBar.vue';
import LocationRow from './LocationRow.vue';
import { TABS, screenForTab, tabForScreen } from './tabs';

let wrapper: VueWrapper | null = null;

afterEach(() => {
  wrapper?.unmount();
  wrapper = null;
  document.body.innerHTML = '';
});

function readSource(name: string): string {
  return readFileSync(resolve(process.cwd(), 'src/frame', name), 'utf8');
}

describe('tabs mapping', () => {
  it('lists the five tabs in order with labels', () => {
    expect(TABS.map((t) => t.id)).toEqual(['story', 'map', 'bag', 'party', 'more']);
    expect(TABS.map((t) => t.label)).toEqual(['Story', 'Map', 'Bag', 'Party', 'More']);
  });

  it('maps tabs to screens', () => {
    expect(screenForTab('story')).toBeNull();
    expect(screenForTab('map')).toBe('map');
    expect(screenForTab('bag')).toBe('bag');
    expect(screenForTab('party')).toBe('social');
    expect(screenForTab('more')).toBe('more');
  });

  it('maps screens back to tabs', () => {
    expect(tabForScreen(null)).toBe('story');
    expect(tabForScreen('map')).toBe('map');
    expect(tabForScreen('bag')).toBe('bag');
    expect(tabForScreen('social')).toBe('party');
    for (const other of ['more', 'stats', 'craft', 'events', 'vendor'] as const) {
      expect(tabForScreen(other)).toBe('more');
    }
  });
});

describe('TabBar', () => {
  function mountBar(overrides: Record<string, unknown> = {}): VueWrapper {
    wrapper = mount(TabBar, {
      attachTo: document.body,
      props: { activeTab: 'story', sheetOpen: false, ...overrides },
    });
    return wrapper;
  }

  it('renders five buttons in order', () => {
    const w = mountBar();
    const buttons = w.findAll('button');
    expect(buttons.map((b) => b.attributes('data-tab'))).toEqual(['story', 'map', 'bag', 'party', 'more']);
    expect(buttons.map((b) => b.text())).toEqual(['Story', 'Map', 'Bag', 'Party', 'More']);
  });

  it('marks the active tab pressed with an active class', () => {
    const w = mountBar({ activeTab: 'bag' });
    const bag = w.find('button[data-tab="bag"]');
    expect(bag.attributes('aria-pressed')).toBe('true');
    expect(bag.classes()).toContain('active');
    const story = w.find('button[data-tab="story"]');
    expect(story.attributes('aria-pressed')).toBe('false');
    expect(story.classes()).not.toContain('active');
  });

  it('emits select with the tab and the button element', async () => {
    const w = mountBar();
    const party = w.find('button[data-tab="party"]');
    await party.trigger('click');
    const events = w.emitted('select');
    expect(events).toHaveLength(1);
    expect(events![0][0]).toBe('party');
    expect(events![0][1]).toBe(party.element);
  });

  it('adds sheet-open when a sheet is open', async () => {
    const w = mountBar();
    expect(w.find('nav').classes()).not.toContain('sheet-open');
    await w.setProps({ sheetOpen: true });
    expect(w.find('nav').classes()).toContain('sheet-open');
  });

  it('uses the safe-area inset and a 64px bar height', () => {
    const src = readSource('TabBar.vue');
    expect(src).toContain('env(safe-area-inset-bottom)');
    expect(src).toContain('64px');
  });
});

describe('LocationRow', () => {
  it('shows the location with title, separator and time', () => {
    wrapper = mount(LocationRow, { props: { locationName: 'Hollow Gate', timeOfDay: 'night' } });
    const name = wrapper.find('.name');
    expect(name.text()).toBe('Hollow Gate');
    expect(name.attributes('title')).toBe('Hollow Gate');
    expect(wrapper.text()).toContain('·');
    expect(wrapper.text()).toContain('Night');
  });

  it('renders Day', () => {
    wrapper = mount(LocationRow, { props: { locationName: 'Hollow Gate', timeOfDay: 'day' } });
    expect(wrapper.text()).toContain('Day');
  });

  it('hides separator and time when timeOfDay is null', () => {
    wrapper = mount(LocationRow, { props: { locationName: 'Hollow Gate', timeOfDay: null } });
    expect(wrapper.text()).not.toContain('·');
    expect(wrapper.text()).not.toContain('Day');
    expect(wrapper.text()).not.toContain('Night');
  });
});
