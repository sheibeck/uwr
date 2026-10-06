// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mount, type VueWrapper } from '@vue/test-utils';
import { computed, defineComponent, h, inject, nextTick, ref, shallowRef } from 'vue';
import App from './App.vue';
import SplashScreen from './session/SplashScreen.vue';
import CharacterPicker from './session/CharacterPicker.vue';
import CreationView from './creation/CreationView.vue';
import AppFrame from './frame/AppFrame.vue';
import type { Session } from './session/useSession';
import type { AppScreen } from './session/deriveScreen';
import type { FrameView } from './session/frameView';
import type { Character } from './module_bindings/types';
import { GAME_KEY } from './game/context';
import type { GameData } from './game/context';
import { CREATION_KEY } from './creation/creationContext';
import type { CreationData } from './creation/creationContext';

const frameView: FrameView = {
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

const characters = [
  { id: 7n, name: 'Aldric', level: 3n },
  { id: 9n, name: 'Brannoch', level: 6n },
] as unknown as Character[];

interface Fake {
  session: Session;
  screen: ReturnType<typeof shallowRef<AppScreen>>;
  frame: ReturnType<typeof shallowRef<FrameView | null>>;
  fns: Record<'start' | 'signIn' | 'selectCharacter' | 'logout' | 'reload' | 'dispose', ReturnType<typeof vi.fn>>;
}

function fakeSession(initial: AppScreen): Fake {
  const screen = shallowRef<AppScreen>(initial);
  const frame = shallowRef<FrameView | null>(frameView);
  const fns = {
    start: vi.fn(),
    signIn: vi.fn(),
    selectCharacter: vi.fn(),
    logout: vi.fn(async () => {}),
    reload: vi.fn(),
    dispose: vi.fn(),
  };
  const session = {
    screen: computed(() => screen.value),
    frame: computed(() => frame.value),
    characters: computed(() => characters),
    pickerPendingId: ref<bigint | null>(null),
    pickerFailed: ref(false),
    reconnecting: computed(() => true),
    nextRetryAt: ref<number | null>(12345),
    versionPrompt: computed(() => true),
    ...fns,
  } as unknown as Session;
  return { session, screen, frame, fns };
}

type Listener = (event: { matches: boolean }) => void;

function installMatchMedia(isDesktop: boolean): void {
  const listeners = new Set<Listener>();
  vi.stubGlobal('matchMedia', (query: string) => ({
    matches: isDesktop,
    media: query,
    addEventListener: (_t: string, l: Listener) => listeners.add(l),
    removeEventListener: (_t: string, l: Listener) => listeners.delete(l),
  }));
  window.matchMedia = globalThis.matchMedia;
}

let wrapper: VueWrapper | null = null;

function mountApp(fake: Fake): VueWrapper {
  wrapper = mount(App, { attachTo: document.body, props: { session: fake.session } });
  return wrapper;
}

beforeEach(() => {
  document.body.innerHTML = '';
  installMatchMedia(true);
});

afterEach(() => {
  wrapper?.unmount();
  wrapper = null;
  vi.unstubAllGlobals();
});

describe('App screen switch', () => {
  it('splash renders only SplashScreen with the derived state and Sign in calls session.signIn', async () => {
    const fake = fakeSession({ kind: 'splash', state: 'connecting' });
    const w = mountApp(fake);
    expect(w.findComponent(SplashScreen).props('state')).toBe('connecting');
    expect(w.findComponent(CharacterPicker).exists()).toBe(false);
    expect(w.findComponent(CreationView).exists()).toBe(false);
    expect(w.findComponent(AppFrame).exists()).toBe(false);

    fake.screen.value = { kind: 'splash', state: 'idle' };
    await nextTick();
    await w.find('button.sign-in').trigger('click');
    expect(fake.fns.signIn).toHaveBeenCalledTimes(1);
  });

  it('picker renders characters and routes select and logout', async () => {
    const fake = fakeSession({ kind: 'picker' });
    const w = mountApp(fake);
    const picker = w.findComponent(CharacterPicker);
    expect(picker.exists()).toBe(true);
    expect(picker.props('characters')).toEqual(characters);
    expect(picker.props('pendingId')).toBeNull();
    expect(picker.props('failed')).toBe(false);

    await w.findAll('button.row')[1].trigger('click');
    expect(fake.fns.selectCharacter).toHaveBeenCalledWith(9n);

    picker.vm.$emit('logout');
    expect(fake.fns.logout).toHaveBeenCalledTimes(1);
  });

  it('creation renders CreationView, not the picker or the frame, and routes logout, reload and the notice props', () => {
    const fake = fakeSession({ kind: 'creation' });
    const w = mountApp(fake);
    const creation = w.findComponent(CreationView);
    expect(creation.exists()).toBe(true);
    expect(w.findComponent(CharacterPicker).exists()).toBe(false);
    expect(w.findComponent(AppFrame).exists()).toBe(false);
    expect(creation.props('reconnecting')).toBe(true);
    expect(creation.props('nextRetryAt')).toBe(12345);
    expect(creation.props('versionPrompt')).toBe(true);

    creation.vm.$emit('logout');
    expect(fake.fns.logout).toHaveBeenCalledTimes(1);
    creation.vm.$emit('reload');
    expect(fake.fns.reload).toHaveBeenCalledTimes(1);
  });

  it('frame renders AppFrame with the session view and routes logout and reload', () => {
    const fake = fakeSession({ kind: 'frame' });
    const w = mountApp(fake);
    const appFrame = w.findComponent(AppFrame);
    expect(appFrame.exists()).toBe(true);
    expect(appFrame.props('view')).toEqual(frameView);
    expect(appFrame.props('reconnecting')).toBe(true);
    expect(appFrame.props('nextRetryAt')).toBe(12345);
    expect(appFrame.props('versionPrompt')).toBe(true);

    appFrame.vm.$emit('reload');
    expect(fake.fns.reload).toHaveBeenCalledTimes(1);
    appFrame.vm.$emit('logout');
    expect(fake.fns.logout).toHaveBeenCalledTimes(1);
  });

  it('starts the session once on mount and disposes it once on unmount', () => {
    const fake = fakeSession({ kind: 'splash', state: 'idle' });
    const w = mountApp(fake);
    expect(fake.fns.start).toHaveBeenCalledTimes(1);
    expect(fake.fns.dispose).not.toHaveBeenCalled();
    w.unmount();
    wrapper = null;
    expect(fake.fns.dispose).toHaveBeenCalledTimes(1);
    expect(fake.fns.start).toHaveBeenCalledTimes(1);
  });

  it('switches the rendered view when the screen changes without remounting App', async () => {
    const fake = fakeSession({ kind: 'splash', state: 'connecting' });
    const w = mountApp(fake);
    expect(w.findComponent(SplashScreen).exists()).toBe(true);

    fake.screen.value = { kind: 'picker' };
    await nextTick();
    expect(w.findComponent(SplashScreen).exists()).toBe(false);
    expect(w.findComponent(CharacterPicker).exists()).toBe(true);

    fake.screen.value = { kind: 'frame' };
    await nextTick();
    expect(w.findComponent(CharacterPicker).exists()).toBe(false);
    expect(w.findComponent(AppFrame).exists()).toBe(true);

    expect(fake.fns.start).toHaveBeenCalledTimes(1);
    expect(fake.fns.dispose).not.toHaveBeenCalled();
  });

  it('renders no frame while the frame screen has no view yet', () => {
    const fake = fakeSession({ kind: 'frame' });
    fake.frame.value = null;
    const w = mountApp(fake);
    expect(w.findComponent(AppFrame).exists()).toBe(false);
  });
});

describe('App game hub provide', () => {
  // A stand-in for AppFrame that reports the GameData it injects.
  const seen: { game: GameData | undefined }[] = [];
  const Probe = defineComponent({
    name: 'ProbeFrame',
    setup() {
      const game = inject(GAME_KEY);
      seen.push({ game });
      return () => h('div', { class: 'game-probe' }, game ? 'game' : 'none');
    },
  });

  beforeEach(() => {
    seen.length = 0;
  });

  it('provides session.game to the frame', () => {
    const fake = fakeSession({ kind: 'frame' });
    const game = { marker: 'session-game' } as unknown as GameData;
    (fake.session as unknown as { game: GameData }).game = game;
    wrapper = mount(App, {
      attachTo: document.body,
      props: { session: fake.session },
      global: { stubs: { AppFrame: Probe } },
    });
    expect(wrapper.find('.game-probe').text()).toBe('game');
    expect(seen).toHaveLength(1);
    expect(seen[0].game).toBe(game);
  });

  it('provides an inert game when the session has none', () => {
    const fake = fakeSession({ kind: 'frame' });
    wrapper = mount(App, {
      attachTo: document.body,
      props: { session: fake.session },
      global: { stubs: { AppFrame: Probe } },
    });
    const game = seen[0].game;
    expect(game).toBeDefined();
    expect(game!.connected.value).toBe(false);
    expect(game!.reducers.value).toBeNull();
    expect(game!.feed.entries.value).toEqual([]);
  });
});

describe('App creation hub provide', () => {
  // A stand-in for CreationView that reports the CreationData it injects.
  const seen: { creation: CreationData | undefined }[] = [];
  const Probe = defineComponent({
    name: 'ProbeCreation',
    setup() {
      const creation = inject(CREATION_KEY);
      seen.push({ creation });
      return () => h('div', { class: 'creation-probe' }, creation ? 'creation' : 'none');
    },
  });

  beforeEach(() => {
    seen.length = 0;
  });

  it('provides session.creation to the creation view', () => {
    const fake = fakeSession({ kind: 'creation' });
    const creation = { marker: 'session-creation' } as unknown as CreationData;
    (fake.session as unknown as { creation: CreationData }).creation = creation;
    wrapper = mount(App, {
      attachTo: document.body,
      props: { session: fake.session },
      global: { stubs: { CreationView: Probe } },
    });
    expect(wrapper.find('.creation-probe').text()).toBe('creation');
    expect(seen).toHaveLength(1);
    expect(seen[0].creation).toBe(creation);
  });

  it('provides an inert creation hub when the session has none', () => {
    const fake = fakeSession({ kind: 'creation' });
    wrapper = mount(App, {
      attachTo: document.body,
      props: { session: fake.session },
      global: { stubs: { CreationView: Probe } },
    });
    const creation = seen[0].creation;
    expect(creation).toBeDefined();
    expect(creation!.connected.value).toBe(false);
    expect(creation!.state.value).toBeNull();
    expect(creation!.feed.entries.value).toEqual([]);
  });
});
