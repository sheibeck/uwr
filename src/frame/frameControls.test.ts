// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mount, type VueWrapper } from '@vue/test-utils';
import { defineComponent, h, inject, nextTick } from 'vue';
import AppFrame from './AppFrame.vue';
import { FRAME_KEY } from '../game/context';
import type { FrameControls } from '../game/context';
import type { FrameView } from '../session/frameView';

type Listener = (event: { matches: boolean }) => void;

function installMatchMedia(isDesktop: boolean): void {
  vi.stubGlobal('matchMedia', (query: string) => ({
    matches: isDesktop,
    media: query,
    addEventListener: (_type: string, _listener: Listener) => {},
    removeEventListener: (_type: string, _listener: Listener) => {},
  }));
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

let controls: FrameControls | undefined;
let wrapper: VueWrapper | null = null;

// FeedShell renders in both layouts, so a stub of it can inject the controls on either one.
const Probe = defineComponent({
  name: 'ProbeFeed',
  setup() {
    controls = inject(FRAME_KEY);
    return () =>
      h('div', { class: 'frame-probe' }, [
        h('button', { class: 'probe-open-map', onClick: () => controls?.openScreen('map') }, 'map'),
        h('button', { class: 'probe-open-bag', onClick: () => controls?.openScreen('bag') }, 'bag'),
        h('button', { class: 'probe-close', onClick: () => controls?.closeScreen() }, 'close'),
      ]);
  },
});

function mountFrame(isDesktop: boolean): VueWrapper {
  installMatchMedia(isDesktop);
  wrapper = mount(AppFrame, {
    attachTo: document.body,
    props: { view, reconnecting: false, nextRetryAt: null, versionPrompt: false },
    global: { stubs: { FeedShell: Probe } },
  });
  return wrapper;
}

async function settle(): Promise<void> {
  await nextTick();
  await nextTick();
}

beforeEach(() => {
  document.body.innerHTML = '';
  controls = undefined;
});

afterEach(() => {
  wrapper?.unmount();
  wrapper = null;
  vi.unstubAllGlobals();
});

describe('AppFrame frame controls (FRAME_KEY)', () => {
  it('opens the Map drawer on desktop and closes it', async () => {
    const w = mountFrame(true);
    expect(controls).toBeDefined();
    expect(controls!.isDesktop.value).toBe(true);
    expect(controls!.activeScreen.value).toBeNull();

    await w.get('.probe-open-map').trigger('click');
    await settle();
    expect(controls!.activeScreen.value).toBe('map');
    expect(w.get('[role="dialog"] h4').text()).toBe('Map');

    await w.get('.probe-close').trigger('click');
    await settle();
    expect(controls!.activeScreen.value).toBeNull();
    expect(w.find('[role="dialog"]').exists()).toBe(false);
  });

  it('openScreen replaces an open screen', async () => {
    const w = mountFrame(true);
    await w.get('.probe-open-map').trigger('click');
    await w.get('.probe-open-bag').trigger('click');
    await settle();
    expect(controls!.activeScreen.value).toBe('bag');
    expect(w.findAll('[role="dialog"]')).toHaveLength(1);
    expect(w.get('[role="dialog"] h4').text()).toBe('Inventory');
  });

  it('closeScreen with nothing open is a no-op', async () => {
    const w = mountFrame(true);
    const spy = vi.spyOn(HTMLElement.prototype, 'focus');
    await w.get('.probe-close').trigger('click');
    await settle();
    expect(controls!.activeScreen.value).toBeNull();
    expect(w.find('[role="dialog"]').exists()).toBe(false);
    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();
  });

  it('isDesktop reflects the breakpoint and the mobile layout opens a sheet', async () => {
    const w = mountFrame(false);
    expect(controls!.isDesktop.value).toBe(false);
    await w.get('.probe-open-map').trigger('click');
    await settle();
    expect(controls!.activeScreen.value).toBe('map');
    expect(w.get('[role="dialog"] h4').text()).toBe('Map');
    await w.get('.probe-close').trigger('click');
    await settle();
    expect(w.find('[role="dialog"]').exists()).toBe(false);
  });

  it('activeScreen follows a screen opened from the header', async () => {
    const w = mountFrame(true);
    await w.get('button[data-screen="stats"]').trigger('click');
    await settle();
    expect(controls!.activeScreen.value).toBe('stats');
  });
});
