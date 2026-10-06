// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mount, type VueWrapper } from '@vue/test-utils';
import { nextTick, ref } from 'vue';
import AppFrame from './AppFrame.vue';
import type { FrameView } from '../session/frameView';
import { GAME_KEY, createInertGame } from '../game/context';
import type { GameData } from '../game/context';

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
  game?: GameData,
): VueWrapper {
  installMatchMedia(isDesktop);
  wrapper = mount(AppFrame, {
    attachTo: document.body,
    props: { view, reconnecting: false, nextRetryAt: null, versionPrompt: false, ...props },
    ...(game ? { global: { provide: { [GAME_KEY as symbol]: game } } } : {}),
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

  describe('software keyboard', () => {
    class StubViewport extends EventTarget {
      height = 844;
    }

    afterEach(() => {
      Object.defineProperty(window, 'visualViewport', { value: undefined, configurable: true });
    });

    // The composer input is disabled while offline, so these cases need a connected game to focus it.
    function connectedGame(): GameData {
      return { ...createInertGame(), connected: ref(true) } as unknown as GameData;
    }

    function stubViewport(): StubViewport {
      const viewport = new StubViewport();
      window.innerHeight = 844;
      Object.defineProperty(window, 'visualViewport', { value: viewport, configurable: true });
      return viewport;
    }

    it('with the input focused and a short visual viewport the strip compacts and the location row hides; both return on blur', async () => {
      const viewport = stubViewport();
      const w = mountFrame(false, {}, connectedGame());
      const input = w.get('input.composer-input').element as HTMLInputElement;
      expect(w.find('.compact-row').exists()).toBe(false);

      input.focus();
      viewport.height = 500;
      viewport.dispatchEvent(new Event('resize'));
      await nextTick();
      expect(w.find('.compact-row').exists()).toBe(true);
      expect(w.get('.location-row').attributes('style') ?? '').toContain('display: none');
      expect(w.find('.tab-bar').exists()).toBe(true);
      expect(w.find('main.feed').exists()).toBe(true);
      // Not a sheet: the feed stays visible.
      expect(w.get('main.feed').attributes('style') ?? '').not.toContain('display: none');

      input.blur();
      await nextTick();
      expect(w.find('.compact-row').exists()).toBe(false);
      expect(w.get('.location-row').attributes('style') ?? '').not.toContain('display: none');
    });

    it('a small viewport shrink (browser chrome) does not compact the strip', async () => {
      const viewport = stubViewport();
      const w = mountFrame(false, {}, connectedGame());
      (w.get('input.composer-input').element as HTMLInputElement).focus();
      viewport.height = 800;
      viewport.dispatchEvent(new Event('resize'));
      await nextTick();
      expect(w.find('.compact-row').exists()).toBe(false);
    });

    it('without a visual viewport nothing compacts', async () => {
      const w = mountFrame(false, {}, connectedGame());
      (w.get('input.composer-input').element as HTMLInputElement).focus();
      await nextTick();
      expect(w.find('.compact-row').exists()).toBe(false);
    });
  });

  describe('desktop combat header', () => {
    function combatGame(active: boolean, round: bigint | null): { game: GameData; active: ReturnType<typeof ref<boolean>>; round: ReturnType<typeof ref<bigint | null>> } {
      const activeRef = ref(active);
      const roundRef = ref<bigint | null>(round);
      const inert = createInertGame();
      const game = {
        ...inert,
        combat: { ...inert.combat, active: activeRef, roundNumber: roundRef },
      } as unknown as GameData;
      return { game, active: activeRef, round: roundRef };
    }

    it('shows In combat and the round in the header with the buttons locked', () => {
      const { game } = combatGame(true, 2n);
      const w = mountFrame(true, {}, game);
      expect(w.get('.header-bar').text()).toContain('In combat · Round 2');
      expect(w.find('.header-bar .in-combat-tag').exists()).toBe(true);
      expect(w.get('button[data-screen="map"]').attributes('aria-disabled')).toBe('true');
    });

    it('shows no tag when there is no fight', () => {
      const { game } = combatGame(false, null);
      const w = mountFrame(true, {}, game);
      expect(w.find('.in-combat-tag').exists()).toBe(false);
      expect(w.get('.header-bar').text()).not.toContain('In combat');
      expect(w.get('button[data-screen="map"]').attributes('aria-disabled')).toBeUndefined();
    });

    it('follows the fight start, the round and the end', async () => {
      const { game, active, round } = combatGame(false, null);
      const w = mountFrame(true, {}, game);
      active.value = true;
      round.value = 1n;
      await nextTick();
      expect(w.get('.in-combat-tag').text()).toBe('In combat · Round 1');
      round.value = 2n;
      await nextTick();
      expect(w.get('.in-combat-tag').text()).toBe('In combat · Round 2');
      active.value = false;
      await nextTick();
      expect(w.find('.in-combat-tag').exists()).toBe(false);
    });
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
