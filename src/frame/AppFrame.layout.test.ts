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
  // happy-dom exposes window separately from globalThis in some versions.
  window.matchMedia = globalThis.matchMedia;
}

async function setDesktop(next: boolean): Promise<void> {
  desktop = next;
  for (const listener of [...listeners]) listener({ matches: next });
  await nextTick();
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
  levelUp: true,
  newSkill: false,
};

let wrapper: VueWrapper | null = null;

function mountFrame(
  isDesktop: boolean,
  props: Partial<{ reconnecting: boolean; nextRetryAt: number | null; versionPrompt: boolean }> = {},
): VueWrapper {
  installMatchMedia(isDesktop);
  wrapper = mount(AppFrame, {
    attachTo: document.body,
    props: { view, reconnecting: false, nextRetryAt: null, versionPrompt: false, ...props },
  });
  return wrapper;
}

beforeEach(() => {
  document.body.innerHTML = '';
});

afterEach(() => {
  wrapper?.unmount();
  wrapper = null;
  vi.unstubAllGlobals();
});

describe('AppFrame layout', () => {
  it('desktop shows header, vitals rail, feed and context rail but no tab bar', () => {
    const w = mountFrame(true);
    expect(w.find('.header-bar').exists()).toBe(true);
    expect(w.get('.header-bar').text()).toContain('Ashfall Wilds · Ember Gate');
    expect(w.get('.vitals-rail').text()).toContain('Brannoch');
    expect(w.find('main.feed').exists()).toBe(true);
    expect(w.find('.context-rail').exists()).toBe(true);
    expect(w.find('.tab-bar').exists()).toBe(false);
    expect(w.find('.vitals-strip').exists()).toBe(false);
  });

  it('mobile shows strip, location row, feed and tab bar but no header', () => {
    const w = mountFrame(false);
    expect(w.find('.header-bar').exists()).toBe(false);
    expect(w.find('.vitals-rail').exists()).toBe(false);
    expect(w.find('.vitals-strip').exists()).toBe(true);
    expect(w.get('.location-row').text()).toContain('Ember Gate');
    expect(w.find('main.feed').exists()).toBe(true);
    expect(w.find('.tab-bar').exists()).toBe(true);
  });

  it('shows the Reconnecting bar in both layouts', async () => {
    const w = mountFrame(true, { reconnecting: true });
    expect(w.text()).toContain('Reconnecting');
    await setDesktop(false);
    expect(w.text()).toContain('Reconnecting');
    expect(w.find('.header-bar').exists()).toBe(false);
  });

  it('version bar Reload click emits reload', async () => {
    const w = mountFrame(false, { versionPrompt: true });
    const reload = w.findAll('button').find((b) => b.text() === 'Reload');
    expect(reload).toBeDefined();
    await reload!.trigger('click');
    expect(w.emitted('reload')).toHaveLength(1);
  });

  it('keeps the open screen when crossing the breakpoint (drawer <-> sheet)', async () => {
    const w = mountFrame(true);
    await w.get('button[data-screen="map"]').trigger('click');
    expect(w.find('section.drawer').exists()).toBe(true);
    expect(w.get('[role="dialog"] h4').text()).toBe('Map');

    await setDesktop(false);
    expect(w.find('section.drawer').exists()).toBe(false);
    expect(w.find('section.sheet').exists()).toBe(true);
    expect(w.get('[role="dialog"] h4').text()).toBe('Map');

    await setDesktop(true);
    expect(w.find('section.sheet').exists()).toBe(false);
    expect(w.find('section.drawer').exists()).toBe(true);
    expect(w.get('[role="dialog"] h4').text()).toBe('Map');
  });

  it('the More sheet becomes nothing on desktop', async () => {
    const w = mountFrame(false);
    await w.get('button[data-tab="more"]').trigger('click');
    expect(w.get('[role="dialog"] h4').text()).toBe('More');
    await setDesktop(true);
    expect(w.find('[role="dialog"]').exists()).toBe(false);
  });

  it('with a sheet open the strip is compact, feed and location row hide and the tab bar is surface', async () => {
    const w = mountFrame(false);
    expect(w.find('.compact-row').exists()).toBe(false);
    await w.get('button[data-tab="bag"]').trigger('click');
    expect(w.find('.compact-row').exists()).toBe(true);
    expect(w.get('main.feed').attributes('style') ?? '').toContain('display: none');
    expect(w.get('.location-row').attributes('style') ?? '').toContain('display: none');
    expect(w.get('.tab-bar').classes()).toContain('sheet-open');
  });

  it('Log out from the header account menu emits logout', async () => {
    const w = mountFrame(true);
    await w.get('button[aria-label="Account menu"]').trigger('click');
    await nextTick();
    await w.get('[role="menuitem"]').trigger('click');
    expect(w.emitted('logout')).toHaveLength(1);
  });

  it('Log out from the More sheet emits logout', async () => {
    const w = mountFrame(false);
    await w.get('button[data-tab="more"]').trigger('click');
    const logout = w.findAll('button.more-row').find((b) => b.text() === 'Log out');
    expect(logout).toBeDefined();
    await logout!.trigger('click');
    expect(w.emitted('logout')).toHaveLength(1);
  });
});
