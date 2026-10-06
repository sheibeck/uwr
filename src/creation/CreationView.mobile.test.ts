// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mount, type VueWrapper } from '@vue/test-utils';
import { nextTick, ref } from 'vue';
import type { Ref } from 'vue';
import CreationView from './CreationView.vue';
import { CREATION_KEY } from './creationContext';
import type { CreationData } from './creationContext';
import { createCreationFeedStore } from './creationFeedStore';

// A fake hub built from writable refs (the builder is copied from CreationView.test.ts on purpose).
interface FakeHub extends CreationData {
  sent: string[];
  refs: {
    connected: Ref<boolean>;
    state: Ref<unknown>;
    races: Ref<unknown[]>;
    effectiveStep: Ref<string | null>;
  };
}

function makeHub(): FakeHub {
  const refs = {
    connected: ref(true),
    state: ref<unknown>(null),
    races: ref<unknown[]>([]),
    effectiveStep: ref<string | null>('AWAITING_RACE'),
  };
  const hub = {
    connected: refs.connected,
    state: refs.state,
    stateApplied: ref(true),
    eventsApplied: ref(true),
    races: refs.races,
    racesApplied: ref(true),
    llmJobs: ref([]),
    creationJobActive: ref(false),
    unplacedActive: ref(false),
    regionFailed: ref(false),
    endedWithoutCharacter: ref(false),
    effectiveStep: refs.effectiveStep,
    sending: ref(false),
    startFailed: ref(false),
    feed: createCreationFeedStore(),
    sent: [] as string[],
    refs,
    mount: () => () => {},
    retryStart() {},
    send(text: string) {
      hub.sent.push(text);
      return Promise.resolve(true);
    },
    reset() {},
    dispose() {},
  };
  return hub as unknown as FakeHub;
}

const BONUSES = '{"primary":{"stat":"dex","value":2},"secondary":{"stat":"int","value":1},"flavor":"Underlight Eyes"}';

function raceRow(id: bigint, name: string) {
  return {
    id,
    name,
    nameLower: name.toLowerCase(),
    narrative: `About ${name}.`,
    bonusesJson: BONUSES,
    createdAt: { microsSinceUnixEpoch: id * 1000n },
  };
}

const originalMatchMedia = window.matchMedia;

function installMatchMedia(desktop: boolean): void {
  vi.stubGlobal('matchMedia', (query: string) => ({
    matches: desktop,
    media: query,
    addEventListener: () => {},
    removeEventListener: () => {},
  }));
  window.matchMedia = globalThis.matchMedia;
}

class StubViewport extends EventTarget {
  height = 844;
}

function stubViewport(): StubViewport {
  const viewport = new StubViewport();
  window.innerHeight = 844;
  Object.defineProperty(window, 'visualViewport', { value: viewport, configurable: true });
  return viewport;
}

let wrapper: VueWrapper | null = null;

function mountView(hub: FakeHub): VueWrapper {
  wrapper = mount(CreationView, {
    props: { reconnecting: false, nextRetryAt: null, versionPrompt: false },
    global: { provide: { [CREATION_KEY as symbol]: hub } },
    attachTo: document.body,
  });
  return wrapper;
}

beforeEach(() => {
  installMatchMedia(false);
});

afterEach(() => {
  wrapper?.unmount();
  wrapper = null;
  vi.unstubAllGlobals();
  window.matchMedia = originalMatchMedia;
  Object.defineProperty(window, 'visualViewport', { value: undefined, configurable: true });
  document.body.innerHTML = '';
});

const input = (w: VueWrapper) => w.get('input.composer-input');
const chip = (w: VueWrapper) => w.get('button.sheet-chip');

function seedClassStep(hub: FakeHub): void {
  hub.refs.effectiveStep.value = 'AWAITING_ARCHETYPE';
  hub.refs.state.value = {
    step: 'AWAITING_ARCHETYPE',
    raceName: 'Saltkin',
    raceBonuses: BONUSES,
  };
}

describe('CreationView: mobile layout', () => {
  it('shows Step 2 of 5 · Archetype and no sheet rail aside', () => {
    const hub = makeHub();
    seedClassStep(hub);
    const w = mountView(hub);
    expect(w.get('.step-text').text()).toBe('Step 2 of 5 · Archetype');
    expect(w.find('aside').exists()).toBe(false);
    expect(chip(w).attributes('aria-label')).toBe('Open character sheet');
  });

  it('renders three race cards in the single-column grid', () => {
    const hub = makeHub();
    hub.refs.races.value = [raceRow(1n, 'Mossborn'), raceRow(2n, 'Emberfolk'), raceRow(3n, 'Saltkin')];
    const w = mountView(hub);
    expect(w.findAll('button.choice-card')).toHaveLength(3);
    expect(w.get('.grid').classes()).toContain('grid-single');
    expect(w.get('.grid').classes()).not.toContain('grid-multi');
  });

  it('uses the short input text at AWAITING_RACE and an icon Send button labelled Send', () => {
    const hub = makeHub();
    const w = mountView(hub);
    expect(input(w).attributes('placeholder')).toBe('Describe, choose, or tap…');
    const send = w.get('button.send');
    expect(send.attributes('aria-label')).toBe('Send');
    expect(send.classes()).toContain('send-icon');
    expect(send.text()).toBe('');
  });
});

describe('CreationView: mobile sheet', () => {
  it('opens the ledger from the chip, hides the feed region and keeps the composer draft', async () => {
    const hub = makeHub();
    seedClassStep(hub);
    const w = mountView(hub);
    await input(w).setValue('a draft in progress');
    expect(w.find('[role="dialog"]').exists()).toBe(false);

    await chip(w).trigger('click');
    const dialog = w.get('[role="dialog"]');
    expect(dialog.get('h4').text()).toBe('The ledger so far');
    expect(dialog.text()).toContain('Unnamed');
    expect(dialog.text()).toContain('Saltkin');
    expect(dialog.text()).toContain('Dexterity');
    expect(dialog.text()).toContain('+2 race');
    expect((w.get('.region').element as HTMLElement).style.display).toBe('none');

    await dialog.get('button.sheet-close').trigger('click');
    expect((w.get('.region').element as HTMLElement).style.display).not.toBe('none');
    expect((input(w).element as HTMLInputElement).value).toBe('a draft in progress');
  });

  it('closes on Escape and returns focus to the chip', async () => {
    const hub = makeHub();
    seedClassStep(hub);
    const w = mountView(hub);
    await chip(w).trigger('click');
    expect(w.find('[role="dialog"]').exists()).toBe(true);
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', cancelable: true }));
    await nextTick();
    await nextTick();
    expect(w.find('[role="dialog"]').exists()).toBe(false);
    expect(document.activeElement).toBe(chip(w).element);
  });

  it('closes with the close button (Close The ledger so far) and returns focus to the chip', async () => {
    const hub = makeHub();
    seedClassStep(hub);
    const w = mountView(hub);
    await chip(w).trigger('click');
    const close = w.get('button[aria-label="Close The ledger so far"]');
    expect(document.activeElement).toBe(close.element);
    await close.trigger('click');
    await nextTick();
    expect(w.find('[role="dialog"]').exists()).toBe(false);
    expect(document.activeElement).toBe(chip(w).element);
  });
});

describe('CreationView: breakpoint change', () => {
  it('moves focus to the composer input when the open ledger closes because the viewport became desktop', async () => {
    const listeners = new Set<(event: { matches: boolean }) => void>();
    vi.stubGlobal('matchMedia', (query: string) => ({
      matches: false,
      media: query,
      addEventListener: (_type: string, listener: (event: { matches: boolean }) => void) => listeners.add(listener),
      removeEventListener: (_type: string, listener: (event: { matches: boolean }) => void) => listeners.delete(listener),
    }));
    window.matchMedia = globalThis.matchMedia;
    const hub = makeHub();
    seedClassStep(hub);
    const w = mountView(hub);
    await chip(w).trigger('click');
    expect(document.activeElement).toBe(w.get('button[aria-label="Close The ledger so far"]').element);

    for (const listener of listeners) listener({ matches: true });
    await nextTick();
    await nextTick();
    await nextTick();
    expect(w.find('[role="dialog"]').exists()).toBe(false);
    expect(document.activeElement).toBe(input(w).element);
  });
});

describe('CreationView: mobile keyboard', () => {
  it('hides the step text row and the chip while the input is focused with a short viewport, and restores them on blur', async () => {
    const viewport = stubViewport();
    const hub = makeHub();
    seedClassStep(hub);
    const w = mountView(hub);
    expect(w.find('.text-row').exists()).toBe(true);
    expect(w.find('.sheet-chip').exists()).toBe(true);

    (input(w).element as HTMLInputElement).focus();
    viewport.height = 644;
    viewport.dispatchEvent(new Event('resize'));
    await nextTick();
    expect(w.find('.step-text').exists()).toBe(false);
    expect(w.find('.sheet-chip').exists()).toBe(false);
    expect(w.findAll('li.step')).toHaveLength(5);

    (input(w).element as HTMLInputElement).blur();
    await nextTick();
    expect(w.find('.step-text').exists()).toBe(true);
    expect(w.find('.sheet-chip').exists()).toBe(true);
  });
});
