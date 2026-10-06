// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mount, type VueWrapper } from '@vue/test-utils';
import { nextTick, ref } from 'vue';
import type { Ref } from 'vue';
import CreationView from './CreationView.vue';
import { CREATION_KEY } from './creationContext';
import type { CreationData } from './creationContext';
import { createCreationFeedStore } from './creationFeedStore';

// A fake hub built from writable refs; every call the view makes is tracked.
interface FakeHub extends CreationData {
  mountCalls: number;
  releaseCalls: number;
  sent: string[];
  retryCalls: number;
  refs: {
    connected: Ref<boolean>;
    state: Ref<unknown>;
    racesApplied: Ref<boolean>;
    races: Ref<unknown[]>;
    effectiveStep: Ref<string | null>;
    regionFailed: Ref<boolean>;
    sending: Ref<boolean>;
    startFailed: Ref<boolean>;
  };
}

function makeHub(): FakeHub {
  const refs = {
    connected: ref(true),
    state: ref<unknown>(null),
    racesApplied: ref(true),
    races: ref<unknown[]>([]),
    effectiveStep: ref<string | null>('AWAITING_RACE'),
    regionFailed: ref(false),
    sending: ref(false),
    startFailed: ref(false),
  };
  const hub = {
    connected: refs.connected,
    state: refs.state,
    stateApplied: ref(true),
    eventsApplied: ref(true),
    races: refs.races,
    racesApplied: refs.racesApplied,
    llmJobs: ref([]),
    creationJobActive: ref(false),
    unplacedActive: ref(false),
    regionFailed: refs.regionFailed,
    effectiveStep: refs.effectiveStep,
    sending: refs.sending,
    startFailed: refs.startFailed,
    feed: createCreationFeedStore(),
    mountCalls: 0,
    releaseCalls: 0,
    sent: [] as string[],
    retryCalls: 0,
    refs,
    mount() {
      hub.mountCalls += 1;
      return () => {
        hub.releaseCalls += 1;
      };
    },
    retryStart() {
      hub.retryCalls += 1;
    },
    send(text: string) {
      hub.sent.push(text);
      return Promise.resolve(true);
    },
    reset() {},
    dispose() {},
  };
  return hub as unknown as FakeHub;
}

function raceRow(id: bigint, name: string, narrative = `About ${name}.`) {
  return {
    id,
    name,
    nameLower: name.toLowerCase(),
    narrative,
    bonusesJson: '{"primary":{"stat":"dex","value":2},"secondary":{"stat":"int","value":1},"flavor":"Underlight Eyes"}',
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

let wrapper: VueWrapper | null = null;

function mountView(
  hub: FakeHub,
  props: Partial<{ reconnecting: boolean; nextRetryAt: number | null; versionPrompt: boolean }> = {},
): VueWrapper {
  wrapper = mount(CreationView, {
    props: { reconnecting: false, nextRetryAt: null, versionPrompt: false, ...props },
    global: { provide: { [CREATION_KEY as symbol]: hub } },
  });
  return wrapper;
}

beforeEach(() => {
  installMatchMedia(true);
});

afterEach(() => {
  wrapper?.unmount();
  wrapper = null;
  vi.unstubAllGlobals();
  window.matchMedia = originalMatchMedia;
});

const input = (w: VueWrapper) => w.get('input.composer-input');
const buttonByText = (w: VueWrapper, text: string) => {
  const found = w.findAll('button').find((b) => b.text() === text);
  if (!found) throw new Error(`no button ${text}`);
  return found;
};
const current = (w: VueWrapper) => w.get('li[aria-current="step"]').attributes('aria-label');

const ABILITIES = JSON.stringify([
  { name: 'Brine Lash', kind: 'damage', description: 'A whip of seawater.' },
  { name: 'Undertow', kind: 'debuff', description: 'Drags a foe down.' },
  { name: 'Tidal Ward', kind: 'shield', description: 'A wall of water.' },
]);

describe('CreationView: mount lifecycle', () => {
  it('calls mount once on mount and the release once on unmount', () => {
    const hub = makeHub();
    const w = mountView(hub);
    expect(hub.mountCalls).toBe(1);
    expect(hub.releaseCalls).toBe(0);
    w.unmount();
    wrapper = null;
    expect(hub.releaseCalls).toBe(1);
  });

  it('keeps feed lines across a remount', () => {
    const hub = makeHub();
    hub.feed.appendEcho('Saltkin');
    const first = mountView(hub);
    expect(first.text()).toContain('Saltkin');
    first.unmount();
    wrapper = null;
    const second = mountView(hub);
    expect(second.text()).toContain('Saltkin');
    expect(hub.mountCalls).toBe(2);
  });
});

describe('CreationView: header and notices', () => {
  it('reads New character, emits logout from Log out and passes the notice props through', async () => {
    const hub = makeHub();
    const w = mountView(hub, { reconnecting: true, nextRetryAt: null, versionPrompt: true });
    expect(w.get('.pre-frame .title').text()).toBe('New character');
    expect(w.text()).toContain('Reconnecting…');
    expect(w.text()).toContain('A new version is ready.');
    await buttonByText(w, 'Log out').trigger('click');
    expect(w.emitted('logout')).toHaveLength(1);
    await buttonByText(w, 'Reload').trigger('click');
    expect(w.emitted('reload')).toHaveLength(1);
  });
});

describe('CreationView: desktop at AWAITING_RACE', () => {
  it('shows the step bar, three race cards, Surprise me, the input text and the sheet rail', () => {
    const hub = makeHub();
    hub.refs.races.value = [raceRow(1n, 'Mossborn'), raceRow(2n, 'Emberfolk'), raceRow(3n, 'Saltkin')];
    const w = mountView(hub);
    expect(current(w)).toBe('Race, current');
    expect(w.findAll('button.choice-card')).toHaveLength(3);
    expect(w.text()).toContain('Surprise me');
    expect(input(w).attributes('placeholder')).toBe('Describe a race, or choose one…');
    const rail = w.get('aside[aria-label="Character sheet"]');
    expect(rail.text()).toContain('Unnamed');
    expect(w.find('.sheet-chip').exists()).toBe(false);
  });

  it('sends the race name for a card, Surprise me. for the chip and the typed text on Enter', async () => {
    const hub = makeHub();
    hub.refs.races.value = [raceRow(1n, 'Mossborn'), raceRow(3n, 'Saltkin')];
    const w = mountView(hub);
    await w.findAll('button.choice-card')[0].trigger('click');
    expect(hub.sent).toEqual(['Saltkin']);
    await buttonByText(w, 'Surprise me').trigger('click');
    expect(hub.sent).toEqual(['Saltkin', 'Surprise me.']);
    await input(w).setValue('  A tide-touched hermit folk  ');
    await input(w).trigger('keydown', { key: 'Enter' });
    expect(hub.sent[2]).toBe('A tide-touched hermit folk');
  });
});

describe('CreationView: steps', () => {
  it('shows Warrior and Mystic cards and Go back a step at AWAITING_ARCHETYPE', async () => {
    const hub = makeHub();
    hub.refs.effectiveStep.value = 'AWAITING_ARCHETYPE';
    const w = mountView(hub);
    const names = w.findAll('button.choice-card .name').map((n) => n.text());
    expect(names).toEqual(['Warrior', 'Mystic']);
    expect(current(w)).toBe('Archetype, current');
    await buttonByText(w, 'Go back a step').trigger('click');
    expect(hub.sent).toEqual(['go back']);
  });

  it('shows the ability cards from the state abilities at CLASS_REVEALED', async () => {
    const hub = makeHub();
    hub.refs.effectiveStep.value = 'CLASS_REVEALED';
    hub.refs.state.value = { step: 'CLASS_REVEALED', abilities: ABILITIES };
    const w = mountView(hub);
    const names = w.findAll('button.choice-card .name').map((n) => n.text());
    expect(names).toEqual(['Brine Lash', 'Undertow', 'Tidal Ward']);
    await w.findAll('button.choice-card')[1].trigger('click');
    expect(hub.sent).toEqual(['Undertow']);
  });

  it('shows Retry class details sending retry at CLASS_FILL_ERROR', async () => {
    const hub = makeHub();
    hub.refs.effectiveStep.value = 'CLASS_FILL_ERROR';
    const w = mountView(hub);
    expect(w.find('.choice-block').exists()).toBe(false);
    await buttonByText(w, 'Retry class details').trigger('click');
    expect(hub.sent).toEqual(['retry']);
  });

  it('marks the cards aria-disabled while a send is in flight', async () => {
    const hub = makeHub();
    hub.refs.races.value = [raceRow(1n, 'Mossborn'), raceRow(3n, 'Saltkin')];
    const w = mountView(hub);
    expect(w.get('button.choice-card').attributes('aria-disabled')).toBeUndefined();
    hub.refs.sending.value = true;
    await nextTick();
    for (const card of w.findAll('button.choice-card')) {
      expect(card.attributes('aria-disabled')).toBe('true');
    }
    await w.get('button.choice-card').trigger('click');
    expect(hub.sent).toEqual([]);
  });

  it('offers Retry that calls retryStart when the start failed and no state row exists', async () => {
    const hub = makeHub();
    hub.refs.effectiveStep.value = null;
    hub.refs.startFailed.value = true;
    const w = mountView(hub);
    await buttonByText(w, 'Retry').trigger('click');
    expect(hub.retryCalls).toBe(1);
    expect(hub.sent).toEqual([]);
  });
});

describe('CreationView: Enter the realm hold', () => {
  it('shows the step bar at Enter the realm working, no choice block and a locked input for an unplaced character', () => {
    const hub = makeHub();
    hub.refs.effectiveStep.value = 'COMPLETE';
    const w = mountView(hub);
    expect(current(w)).toBe('Enter the realm, current');
    expect(w.find('.icon.spinning').exists()).toBe(true);
    expect(w.find('.choice-block').exists()).toBe(false);
    expect(input(w).attributes('placeholder')).toBe('Entering the realm…');
    expect((input(w).element as HTMLInputElement).disabled).toBe(true);
    expect(w.text()).not.toContain('Retry finding a region');
  });

  it('offers Retry finding a region that sends explore when the first region failed', async () => {
    const hub = makeHub();
    hub.refs.effectiveStep.value = 'COMPLETE';
    hub.refs.regionFailed.value = true;
    const w = mountView(hub);
    expect(w.find('.icon.spinning').exists()).toBe(false);
    await buttonByText(w, 'Retry finding a region').trigger('click');
    expect(hub.sent).toEqual(['explore']);
  });
});

describe('CreationView: unknown step and offline', () => {
  it('locks the input with The Keeper is working… and keeps the last known position for an unknown step', async () => {
    const hub = makeHub();
    hub.refs.effectiveStep.value = 'AWAITING_ARCHETYPE';
    const w = mountView(hub);
    expect(current(w)).toBe('Archetype, current');
    hub.refs.effectiveStep.value = 'SOMETHING_NEW';
    await nextTick();
    expect(current(w)).toBe('Archetype, current');
    expect(input(w).attributes('placeholder')).toBe('The Keeper is working…');
    expect((input(w).element as HTMLInputElement).disabled).toBe(true);
  });

  it('shows Reconnecting… and disables every control while the draft is kept when offline', async () => {
    const hub = makeHub();
    hub.refs.races.value = [raceRow(1n, 'Mossborn')];
    const w = mountView(hub);
    await input(w).setValue('half a thought');
    hub.refs.connected.value = false;
    await nextTick();
    expect(input(w).attributes('placeholder')).toBe('Reconnecting…');
    expect((input(w).element as HTMLInputElement).disabled).toBe(true);
    expect((input(w).element as HTMLInputElement).value).toBe('half a thought');
    expect(buttonByText(w, 'Surprise me').attributes('disabled')).toBeDefined();
    expect(buttonByText(w, 'Send').attributes('disabled')).toBeDefined();
    expect(w.get('button.choice-card').attributes('aria-disabled')).toBe('true');
    await w.get('button.choice-card').trigger('click');
    expect(hub.sent).toEqual([]);
  });
});

describe('CreationView: server text is text', () => {
  it('shows an img-onerror race name as text in the card and the sheet, never as an element', async () => {
    const EVIL = '<img src=x onerror=alert(1)>';
    const hub = makeHub();
    hub.refs.races.value = [raceRow(1n, EVIL, EVIL)];
    const w = mountView(hub);
    expect(w.get('button.choice-card').text()).toContain(EVIL);
    expect(w.find('img').exists()).toBe(false);
    hub.refs.state.value = { step: 'AWAITING_ARCHETYPE', raceName: EVIL, raceBonuses: raceRow(1n, EVIL).bonusesJson };
    hub.refs.effectiveStep.value = 'AWAITING_ARCHETYPE';
    await nextTick();
    expect(w.get('aside[aria-label="Character sheet"]').text()).toContain(EVIL);
    expect(w.find('img').exists()).toBe(false);
    expect(w.element.querySelector('img')).toBeNull();
  });
});
