// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mount, type VueWrapper } from '@vue/test-utils';
import { defineComponent, h, inject, nextTick } from 'vue';
import AppFrame from './AppFrame.vue';
import { CONSOLE_KEY } from '../game/context';
import type { ConsoleApi } from '../game/context';
import type { FrameView } from '../session/frameView';

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

let injected: ConsoleApi | undefined;
let wrapper: VueWrapper | null = null;

const Probe = defineComponent({
  name: 'ProbeFeed',
  setup() {
    injected = inject(CONSOLE_KEY);
    return () => h('div', { class: 'console-probe' });
  },
});

beforeEach(() => {
  document.body.innerHTML = '';
  injected = undefined;
});

afterEach(() => {
  wrapper?.unmount();
  wrapper = null;
  vi.unstubAllGlobals();
});

describe('AppFrame console provide', () => {
  it.each([true, false])('provides one working console to the feed (desktop %s)', async (desktop) => {
    installMatchMedia(desktop);
    wrapper = mount(AppFrame, {
      attachTo: document.body,
      props: { view, reconnecting: false, nextRetryAt: null, versionPrompt: false },
      global: { stubs: { FeedShell: Probe } },
    });
    await nextTick();
    expect(injected).toBeDefined();
    // The inert game is offline, so the real console refuses to send and keeps the draft.
    injected!.draft.value = 'look';
    expect(injected!.submit()).toBe('offline');
    expect(injected!.draft.value).toBe('look');
  });

  it('disposes the console on unmount without throwing', async () => {
    installMatchMedia(true);
    wrapper = mount(AppFrame, {
      attachTo: document.body,
      props: { view, reconnecting: false, nextRetryAt: null, versionPrompt: false },
      global: { stubs: { FeedShell: Probe } },
    });
    await nextTick();
    expect(() => wrapper!.unmount()).not.toThrow();
    wrapper = null;
  });
});
