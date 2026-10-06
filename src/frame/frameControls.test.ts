// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mount, type VueWrapper } from '@vue/test-utils';
import { defineComponent, h, inject, nextTick } from 'vue';
import AppFrame from './AppFrame.vue';
import { FRAME_KEY, createInertFrame } from '../game/context';
import type { FrameControls } from '../game/context';
import type { FrameView } from '../session/frameView';

// The meta rendering is tested through the real shells: the map screen gets a header meta
// component, every other screen has none.
vi.mock('../screens/screens', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../screens/screens')>();
  const { defineComponent: define, h: hh } = await import('vue');
  const MapMeta = define({
    name: 'TestMapMeta',
    setup: () => () => hh('span', { class: 'test-meta' }, '3 / 50 slots'),
  });
  return {
    ...actual,
    getScreen: (id: Parameters<typeof actual.getScreen>[0]) =>
      id === 'map' ? { ...actual.getScreen(id), meta: MapMeta } : actual.getScreen(id),
  };
});

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
        h(
          'button',
          {
            class: 'probe-open-vendor',
            onClick: () => controls?.openScreen('vendor', { npcId: 5n, npcName: 'Marta' }),
          },
          'vendor',
        ),
        h(
          'button',
          {
            class: 'probe-reopen-vendor',
            onClick: () => {
              controls?.closeScreen();
              controls?.openScreen('vendor', { npcId: 6n, npcName: 'Ilse' });
            },
          },
          'reopen',
        ),
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

describe('AppFrame screen arguments (FrameControls.screenArgs)', () => {
  it('opens the vendor screen with its arguments', async () => {
    const w = mountFrame(true);
    expect(controls!.screenArgs.value).toBeNull();
    await w.get('.probe-open-vendor').trigger('click');
    await settle();
    expect(controls!.activeScreen.value).toBe('vendor');
    expect(controls!.screenArgs.value).toEqual({ npcId: 5n, npcName: 'Marta' });
    expect(w.get('[role="dialog"] h4').text()).toBe('Trade');
  });

  it('opening a screen without arguments leaves them null', async () => {
    const w = mountFrame(true);
    await w.get('.probe-open-bag').trigger('click');
    await settle();
    expect(controls!.activeScreen.value).toBe('bag');
    expect(controls!.screenArgs.value).toBeNull();
  });

  it('closeScreen clears the arguments', async () => {
    const w = mountFrame(true);
    await w.get('.probe-open-vendor').trigger('click');
    await w.get('.probe-close').trigger('click');
    await settle();
    expect(controls!.activeScreen.value).toBeNull();
    expect(controls!.screenArgs.value).toBeNull();
  });

  it('opening another screen or a header screen clears the arguments', async () => {
    const w = mountFrame(true);
    await w.get('.probe-open-vendor').trigger('click');
    await w.get('.probe-open-map').trigger('click');
    await settle();
    expect(controls!.activeScreen.value).toBe('map');
    expect(controls!.screenArgs.value).toBeNull();

    await w.get('.probe-open-vendor').trigger('click');
    await w.get('button[data-screen="stats"]').trigger('click');
    await settle();
    expect(controls!.activeScreen.value).toBe('stats');
    expect(controls!.screenArgs.value).toBeNull();
  });

  it('close then open in the same tick ends on the new vendor (the Trade sequence)', async () => {
    const w = mountFrame(true);
    await w.get('.probe-open-vendor').trigger('click');
    await w.get('.probe-reopen-vendor').trigger('click');
    await settle();
    expect(controls!.activeScreen.value).toBe('vendor');
    expect(controls!.screenArgs.value).toEqual({ npcId: 6n, npcName: 'Ilse' });
  });

  it('re-opening the open vendor for another NPC replaces the arguments', async () => {
    const w = mountFrame(true);
    await w.get('.probe-open-vendor').trigger('click');
    controls!.openScreen('vendor', { npcId: 9n, npcName: 'Tomas' });
    await settle();
    expect(controls!.screenArgs.value).toEqual({ npcId: 9n, npcName: 'Tomas' });
  });

  it('the More tab clears them and openFromMore leaves them null (mobile)', async () => {
    const w = mountFrame(false);
    await w.get('.probe-open-vendor').trigger('click');
    await settle();
    expect(controls!.screenArgs.value).toEqual({ npcId: 5n, npcName: 'Marta' });
    await w.get('button[data-tab="more"]').trigger('click');
    await settle();
    expect(controls!.activeScreen.value).toBe('more');
    expect(controls!.screenArgs.value).toBeNull();
    const vendorRow = w.findAll('.more-row').find((row) => row.text() === 'Vendor');
    expect(vendorRow).toBeDefined();
    await vendorRow!.trigger('click');
    await settle();
    expect(controls!.activeScreen.value).toBe('vendor');
    expect(controls!.screenArgs.value).toBeNull();
  });

  it('the inert frame has null screen arguments', () => {
    const inert = createInertFrame();
    expect(inert.screenArgs.value).toBeNull();
    expect(() => inert.openScreen('vendor', { npcId: 1n, npcName: 'x' })).not.toThrow();
    expect(inert.screenArgs.value).toBeNull();
  });
});

describe('AppFrame header meta', () => {
  it('renders a screen meta component in the desktop drawer header', async () => {
    const w = mountFrame(true);
    await w.get('.probe-open-map').trigger('click');
    await settle();
    expect(w.get('[role="dialog"] .drawer-meta .test-meta').text()).toBe('3 / 50 slots');
  });

  it('renders a screen meta component in the mobile sheet header', async () => {
    const w = mountFrame(false);
    await w.get('.probe-open-map').trigger('click');
    await settle();
    expect(w.get('[role="dialog"] .sheet-header .test-meta').text()).toBe('3 / 50 slots');
  });

  it('renders no meta for a screen without one', async () => {
    const desktop = mountFrame(true);
    await desktop.get('.probe-open-bag').trigger('click');
    await settle();
    expect(desktop.find('.test-meta').exists()).toBe(false);
    expect(desktop.get('.drawer-meta').text()).toBe('');
    desktop.unmount();
    wrapper = null;

    const mobile = mountFrame(false);
    await mobile.get('.probe-open-bag').trigger('click');
    await settle();
    expect(mobile.find('.test-meta').exists()).toBe(false);
    expect(mobile.find('.sheet-header .sheet-meta').exists()).toBe(false);
  });
});
