// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mount, type VueWrapper } from '@vue/test-utils';
import { defineComponent, h, inject, nextTick } from 'vue';
import AppFrame from './AppFrame.vue';
import { FRAME_KEY } from '../game/context';
import type { FrameControls } from '../game/context';
import type { FrameView } from '../session/frameView';

// Focus after Nearby's Trade (50 review WR-02): the screen that opens keeps focus on its close
// button, and on mobile the Map tab (the sheet's own opener) is where Trade returns focus to.
vi.mock('../screens/screens', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../screens/screens')>();
  const { defineComponent: define, h: hh, inject: inj } = await import('vue');
  const { FRAME_KEY: KEY } = await import('../game/context');
  // Stands in for the Map screen's Nearby list: a Trade button inside the open sheet.
  const MapWithTrade = define({
    name: 'TestMapWithTrade',
    setup() {
      const frame = inj(KEY)!;
      return () =>
        hh(
          'button',
          {
            class: 'sheet-trade',
            onClick: () => frame.openScreen('vendor', { npcId: 5n, npcName: 'Marta' }),
          },
          'trade',
        );
    },
  });
  const Empty = define({ name: 'TestEmpty', setup: () => () => hh('div') });
  return {
    ...actual,
    getScreen: (id: Parameters<typeof actual.getScreen>[0]) => {
      if (id === 'map') return { ...actual.getScreen(id), component: MapWithTrade };
      if (id === 'vendor' || id === 'bag') {
        const { meta: _meta, ...rest } = actual.getScreen(id);
        return { ...rest, component: Empty };
      }
      return actual.getScreen(id);
    },
  };
});

function installMatchMedia(isDesktop: boolean): void {
  vi.stubGlobal('matchMedia', (query: string) => ({
    matches: isDesktop,
    media: query,
    addEventListener: () => {},
    removeEventListener: () => {},
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

// The desktop rail's Nearby list lives outside the drawer; FeedShell renders in both layouts.
const Probe = defineComponent({
  name: 'ProbeFeed',
  setup() {
    controls = inject(FRAME_KEY);
    return () =>
      h('div', { class: 'frame-probe' }, [
        h('button', { class: 'probe-open-bag', onClick: () => controls?.openScreen('bag') }, 'bag'),
        h(
          'button',
          {
            class: 'probe-trade',
            onClick: () => controls?.openScreen('vendor', { npcId: 5n, npcName: 'Marta' }),
          },
          'trade',
        ),
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

describe('Trade focus (desktop)', () => {
  it('with Inventory open, Trade leaves focus on the Trade drawer close button', async () => {
    const w = mountFrame(true);
    await w.get('.probe-open-bag').trigger('click');
    await settle();
    expect(w.get('[role="dialog"] h4').text()).toBe('Inventory');
    const trade = w.get('.probe-trade').element as HTMLElement;
    trade.focus();
    await w.get('.probe-trade').trigger('click');
    await settle();
    expect(w.get('[role="dialog"] h4').text()).toBe('Trade');
    expect(document.activeElement).toBe(w.get('[role="dialog"] button[aria-label="Close Trade"]').element);
  });

  it('closing Trade returns focus to the Trade button that opened it', async () => {
    const w = mountFrame(true);
    const trade = w.get('.probe-trade').element as HTMLElement;
    trade.focus();
    await w.get('.probe-trade').trigger('click');
    await settle();
    await w.get('[role="dialog"] button[aria-label="Close Trade"]').trigger('click');
    await settle();
    expect(document.activeElement).toBe(trade);
  });
});

describe('Trade focus (mobile, from inside the Map sheet)', () => {
  it('leaves focus on the Trade sheet close button, and closing returns it to the Map tab', async () => {
    const w = mountFrame(false);
    const mapTab = w.get('button[data-tab="map"]');
    (mapTab.element as HTMLElement).focus();
    await mapTab.trigger('click');
    await settle();
    expect(w.get('[role="dialog"] h4').text()).toBe('Map');
    const tradeInSheet = w.get('.sheet-trade');
    (tradeInSheet.element as HTMLElement).focus();
    await tradeInSheet.trigger('click');
    await settle();
    expect(controls!.activeScreen.value).toBe('vendor');
    expect(w.find('.sheet-trade').exists()).toBe(false);
    expect(document.activeElement).toBe(w.get('[role="dialog"] button[aria-label="Close Trade"]').element);

    await w.get('[role="dialog"] button[aria-label="Close Trade"]').trigger('click');
    await settle();
    expect(document.activeElement).toBe(mapTab.element);
  });
});
