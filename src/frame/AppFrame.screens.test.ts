// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mount, type VueWrapper } from '@vue/test-utils';
import { nextTick } from 'vue';
import AppFrame from './AppFrame.vue';
import type { FrameView } from '../session/frameView';

type Listener = (event: { matches: boolean }) => void;

let desktop = true;
const listeners = new Set<Listener>();

function installMatchMedia(isDesktop: boolean): void {
  desktop = isDesktop;
  listeners.clear();
  vi.stubGlobal(
    'matchMedia',
    (query: string) => ({
      get matches() {
        return desktop;
      },
      media: query,
      addEventListener: (_type: string, listener: Listener) => listeners.add(listener),
      removeEventListener: (_type: string, listener: Listener) => listeners.delete(listener),
    }),
  );
  window.matchMedia = globalThis.matchMedia;
}

const view: FrameView = {
  characterName: 'Brannoch',
  avatarInitial: 'B',
  classLine: 'Lv 6 · Wizard',
  accountLine: 'Lv 6 · Elf Wizard',
  hp: 212n,
  maxHp: 260n,
  mana: 80n,
  maxMana: 120n,
  stamina: 50n,
  maxStamina: 90n,
  placeLabel: 'Ashfall Wilds · Ember Gate',
  locationName: 'Ember Gate',
  timeOfDay: 'day',
  levelUp: false,
  newSkill: false,
};

let wrapper: VueWrapper | null = null;

function mountFrame(isDesktop: boolean): VueWrapper {
  installMatchMedia(isDesktop);
  wrapper = mount(AppFrame, {
    attachTo: document.body,
    props: { view, reconnecting: false, nextRetryAt: null, versionPrompt: false },
  });
  return wrapper;
}

async function settle(): Promise<void> {
  await nextTick();
  await nextTick();
}

function pressEscape(): void {
  document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }));
}

const HEADER_CASES: ReadonlyArray<{ id: string; title: string; line1: string }> = [
  { id: 'map', title: 'Map', line1: 'No places discovered yet.' },
  { id: 'bag', title: 'Inventory', line1: 'Your bag is empty.' },
  { id: 'stats', title: 'Stats', line1: 'No stats to show yet.' },
  { id: 'craft', title: 'Crafting', line1: 'No recipes known yet.' },
  { id: 'social', title: 'Social', line1: 'No friends or party yet.' },
  { id: 'events', title: 'World events', line1: 'No world events right now.' },
];

beforeEach(() => {
  document.body.innerHTML = '';
});

afterEach(() => {
  wrapper?.unmount();
  wrapper = null;
  vi.unstubAllGlobals();
});

describe('desktop drawer', () => {
  for (const { id, title, line1 } of HEADER_CASES) {
    it(`header button ${id} opens one dialog titled "${title}" with its empty state`, async () => {
      const w = mountFrame(true);
      const button = w.get(`button[data-screen="${id}"]`);
      await button.trigger('click');
      await settle();
      const dialogs = w.findAll('[role="dialog"]');
      expect(dialogs).toHaveLength(1);
      expect(dialogs[0].get('h4').text()).toBe(title);
      expect(dialogs[0].text()).toContain(line1);
      expect(button.attributes('aria-pressed')).toBe('true');
    });
  }

  it('a second header button replaces the drawer; the open screen button closes it', async () => {
    const w = mountFrame(true);
    await w.get('button[data-screen="map"]').trigger('click');
    await w.get('button[data-screen="bag"]').trigger('click');
    await settle();
    expect(w.findAll('[role="dialog"]')).toHaveLength(1);
    expect(w.get('[role="dialog"] h4').text()).toBe('Inventory');
    expect(w.get('button[data-screen="map"]').attributes('aria-pressed')).toBe('false');

    await w.get('button[data-screen="bag"]').trigger('click');
    await settle();
    expect(w.find('[role="dialog"]').exists()).toBe(false);
  });

  it('Escape closes the drawer and returns focus to the opening header button', async () => {
    const w = mountFrame(true);
    const button = w.get('button[data-screen="stats"]');
    (button.element as HTMLElement).focus();
    await button.trigger('click');
    await settle();
    expect(w.find('[role="dialog"]').exists()).toBe(true);
    pressEscape();
    await settle();
    expect(w.find('[role="dialog"]').exists()).toBe(false);
    expect(document.activeElement).toBe(button.element);
  });

  it('the close button closes the drawer and returns focus to the opening button', async () => {
    const w = mountFrame(true);
    const button = w.get('button[data-screen="craft"]');
    await button.trigger('click');
    await settle();
    await w.get('[role="dialog"] button[aria-label="Close Crafting"]').trigger('click');
    await settle();
    expect(w.find('[role="dialog"]').exists()).toBe(false);
    expect(document.activeElement).toBe(button.element);
  });

  it('keeps the header and the vitals rail present while the drawer is open', async () => {
    const w = mountFrame(true);
    await w.get('button[data-screen="map"]').trigger('click');
    await settle();
    expect(w.find('.header-bar').exists()).toBe(true);
    expect(w.find('.vitals-rail').exists()).toBe(true);
    expect(w.get('.vitals-rail').text()).toContain('Brannoch');
    // The drawer lives inside the frame body next to the rail, not around it.
    expect(w.get('.frame-body').find('.drawer').exists()).toBe(true);
    expect(w.get('.header-bar').find('.drawer').exists()).toBe(false);
  });

  it('Tab on the last focusable element inside the drawer moves focus to its close button', async () => {
    const w = mountFrame(true);
    await w.get('button[data-screen="map"]').trigger('click');
    await settle();
    const close = w.get('[role="dialog"] button[aria-label="Close Map"]');
    (close.element as HTMLElement).focus();
    const event = new KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true });
    close.element.dispatchEvent(event);
    expect(event.defaultPrevented).toBe(true);
    expect(document.activeElement).toBe(close.element);
  });

  it('Escape with the account menu open closes the menu and leaves the drawer open', async () => {
    const w = mountFrame(true);
    await w.get('button[data-screen="map"]').trigger('click');
    await settle();
    await w.get('button[aria-label="Account menu"]').trigger('click');
    await settle();
    const item = w.get('[role="menuitem"]');
    expect(document.activeElement).toBe(item.element);
    item.element.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }));
    await settle();
    expect(w.find('[role="menu"]').exists()).toBe(false);
    expect(w.find('section.drawer').exists()).toBe(true);
  });
});

describe('mobile sheets', () => {
  const TAB_CASES: ReadonlyArray<{ tab: string; title: string }> = [
    { tab: 'map', title: 'Map' },
    { tab: 'bag', title: 'Inventory' },
    { tab: 'party', title: 'Social' },
  ];

  for (const { tab, title } of TAB_CASES) {
    it(`tab ${tab} opens the "${title}" sheet`, async () => {
      const w = mountFrame(false);
      await w.get(`button[data-tab="${tab}"]`).trigger('click');
      await settle();
      expect(w.findAll('[role="dialog"]')).toHaveLength(1);
      expect(w.get('section.sheet h4').text()).toBe(title);
      expect(w.get(`button[data-tab="${tab}"]`).attributes('aria-pressed')).toBe('true');
    });
  }

  it('Story closes any open sheet', async () => {
    const w = mountFrame(false);
    await w.get('button[data-tab="bag"]').trigger('click');
    await settle();
    expect(w.find('[role="dialog"]').exists()).toBe(true);
    await w.get('button[data-tab="story"]').trigger('click');
    await settle();
    expect(w.find('[role="dialog"]').exists()).toBe(false);
    expect(w.get('button[data-tab="story"]').attributes('aria-pressed')).toBe('true');
  });

  it('More opens a sheet listing Stats, Crafting, Events, Vendor and Log out', async () => {
    const w = mountFrame(false);
    await w.get('button[data-tab="more"]').trigger('click');
    await settle();
    const sheet = w.get('[role="dialog"]');
    expect(sheet.get('h4').text()).toBe('More');
    const rows = sheet.findAll('button.more-row').map((b) => b.text());
    expect(rows).toEqual(['Stats', 'Crafting', 'Events', 'Vendor', 'Log out']);
  });

  it('More then Vendor opens the Vendor sheet; closing returns focus to the More tab', async () => {
    const w = mountFrame(false);
    const more = w.get('button[data-tab="more"]');
    await more.trigger('click');
    await settle();
    const vendor = w.findAll('button.more-row').find((b) => b.text() === 'Vendor');
    expect(vendor).toBeDefined();
    await vendor!.trigger('click');
    await settle();
    expect(w.findAll('[role="dialog"]')).toHaveLength(1);
    expect(w.get('[role="dialog"] h4').text()).toBe('Vendor');
    expect(w.get('[role="dialog"]').text()).toContain('No vendor nearby.');
    expect(w.get('button[data-tab="more"]').attributes('aria-pressed')).toBe('true');

    await w.get('[role="dialog"] button[aria-label="Close Vendor"]').trigger('click');
    await settle();
    expect(w.find('[role="dialog"]').exists()).toBe(false);
    expect(document.activeElement).toBe(more.element);
  });

  it('Escape closes a mobile sheet', async () => {
    const w = mountFrame(false);
    await w.get('button[data-tab="map"]').trigger('click');
    await settle();
    pressEscape();
    await settle();
    expect(w.find('[role="dialog"]').exists()).toBe(false);
  });
});
