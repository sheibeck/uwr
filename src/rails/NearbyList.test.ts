// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { effectScope, nextTick, ref } from 'vue';
import type { EffectScope, Ref } from 'vue';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils';
import { PhChatCircle, PhChatCircleDots, PhEye, PhSkull, PhUserPlus } from '@phosphor-icons/vue';
import NearbyList from './NearbyList.vue';
import { NEARBY_COPY } from './pools';
import {
  CONSOLE_KEY,
  FRAME_KEY,
  GAME_KEY,
  createInertConsole,
  createInertFrame,
  createInertGame,
} from '../game/context';
import type { ConsoleApi, FrameControls, GameData } from '../game/context';
import { createConsole } from '../console/useConsole';
import type { TimeOfDay } from '../session/frameView';

let wrapper: VueWrapper | null = null;
let consoleScope: EffectScope | null = null;

afterEach(() => {
  wrapper?.unmount();
  wrapper = null;
  consoleScope?.stop();
  consoleScope = null;
  document.body.innerHTML = '';
  vi.restoreAllMocks();
});

const PAYLOAD = '<img src=x onerror=alert(1)>';

const CROSSING = { id: 10n, name: 'The Crossing', regionId: 1n, bindStone: true, isSafe: true, terrainType: 'town', placeNoun: '' };
const PLAIN = { id: 11n, name: 'Cinder Road', regionId: 1n, bindStone: false, isSafe: false, terrainType: 'plains', placeNoun: 'the pans', levelOffset: 0n };
// Region 1 at danger 800: Cinder Road's place target is Lv 8 (placeTargetLevel, offset 0: exact).
const REGION_LV8 = { id: 1n, name: 'Ashlands', dangerMultiplier: 800n };
const LANE = { id: 12n, name: 'Quiet Lane', regionId: 1n, bindStone: false, isSafe: true, terrainType: 'town', placeNoun: '' };
const EDGE = { id: 13n, name: 'Far Edge', regionId: 2n, bindStone: false, isSafe: true, terrainType: 'uncharted', placeNoun: '' };

function character(over: Record<string, unknown> = {}) {
  return { id: 1n, name: 'Hero', locationId: 10n, boundLocationId: 99n, level: 6n, ...over };
}

function mountList(
  game: Record<string, unknown> = {},
  bindLocation = vi.fn(() => Promise.resolve()),
  options: {
    desktop?: boolean;
    props?: Record<string, unknown>;
    /** The frame's time of day (51.3.1.1-31): a value or a live ref; default null (unknown). */
    timeOfDay?: TimeOfDay | null | Ref<TimeOfDay | null>;
    /** Builds the console from the game and the frame (the real createConsole), instead of mocks. */
    console?: (game: GameData, frame: FrameControls) => ConsoleApi;
  } = {},
) {
  const calls = {
    hail: vi.fn(),
    examine: vi.fn(),
    gather: vi.fn(),
    whisperTo: vi.fn(),
    invite: vi.fn(),
    pull: vi.fn(),
    fight: vi.fn(),
  };
  const characterRef = ref(character());
  const data = {
    ...createInertGame(),
    connected: ref(true),
    character: characterRef,
    characterId: ref(1n),
    locations: ref([CROSSING, PLAIN, LANE, EDGE]),
    reducers: ref({ bindLocation }),
    // The place's pool rows have applied (51.3.1.1-19: the pool groups wait for them).
    poolsAppliedFor: () => true,
    ...game,
  } as unknown as GameData;
  const openScreen = vi.fn();
  const given = options.timeOfDay;
  const timeOfDay =
    given !== null && typeof given === 'object' ? given : ref<TimeOfDay | null>(given ?? null);
  const frame = {
    ...createInertFrame(),
    openScreen,
    isDesktop: ref(options.desktop ?? true),
    timeOfDay,
  } as unknown as FrameControls;
  const consoleApi = options.console
    ? options.console(data, frame)
    : ({ ...createInertConsole(), ...calls } as unknown as ConsoleApi);
  wrapper = mount(NearbyList, {
    attachTo: document.body,
    props: options.props ?? {},
    global: {
      provide: {
        [GAME_KEY as symbol]: data,
        [CONSOLE_KEY as symbol]: consoleApi,
        [FRAME_KEY as symbol]: frame,
      },
    },
  });
  return { w: wrapper, calls, bindLocation, characterRef, data, timeOfDay };
}

const labels = (row: { findAll: (s: string) => { attributes: (n: string) => string | undefined }[] }) =>
  row.findAll('button').map((b) => b.attributes('aria-label'));

// A character row as the generated bindings give it: the menu header reads race and class.
const PERSON = { race: 'Orc', className: 'Shaman', locationId: 10n, online: true, groupId: undefined };

const FULL = {
  npcsHere: ref([
    { id: 2n, name: 'Marta', npcType: 'vendor' },
    { id: 3n, name: 'Aldric', npcType: 'quest' },
  ]),
  playersHere: ref([
    { ...PERSON, id: 1n, name: 'Hero', level: 6n },
    { ...PERSON, id: 4n, name: 'Bo', level: 3n },
  ]),
  enemiesHere: ref([
    { id: 7n, name: 'Goblin Scout', state: 'available', locationId: 10n, enemyTemplateId: 1n, groupCount: 1n },
  ]),
  enemyTemplatesHere: ref([{ id: 1n, level: 8n }]),
};

describe('Examine eye on every row', () => {
  it('is the last button of each row, outside .row-main, and calls examine with the name', async () => {
    const { w, calls } = mountList(FULL);
    const rows = w.findAll('.nearby-row');
    // NPCs (Aldric, Marta), bind stone, player (Bo); the event spawn is a named card (51.3.1.1-19)
    expect(rows.map((r) => r.get('.row-name').text())).toEqual(['Aldric', 'Marta', 'Bind stone', 'Bo']);
    for (const row of rows) {
      // The player cluster ends with the menu opener, so the eye is the one before it.
      const buttons = row.findAll('button');
      const isPlayer = row.classes().includes('kind-player');
      const eye = buttons[buttons.length - (isPlayer ? 2 : 1)];
      expect(eye.attributes('aria-label')).toMatch(/^Examine /);
      expect(eye.attributes('title')).toBe(eye.attributes('aria-label'));
      expect(eye.element.closest('.row-main')).toBeNull();
      expect(eye.element.parentElement!.classList.contains('row-actions')).toBe(true);
    }
    const examineNames: Record<string, string> = {
      Aldric: 'Aldric',
      Marta: 'Marta',
      Bo: 'Bo',
    };
    for (const row of rows) {
      const name = row.get('.row-name').text();
      if (name === 'Bind stone') continue;
      await row.get(`[aria-label="Examine ${examineNames[name]}"]`).trigger('click');
      expect(calls.examine).toHaveBeenLastCalledWith(name);
    }
  });

  it('keeps the empty line and shows no eye when nothing is nearby', () => {
    const { w } = mountList({ character: ref(character({ locationId: 12n })) });
    expect(w.text()).toContain('No one is nearby.');
    expect(w.find('[aria-label^="Examine"]').exists()).toBe(false);
  });

  it('holds one to three buttons per row, all in one .row-actions group', () => {
    const { w } = mountList(FULL);
    for (const row of w.findAll('.nearby-row')) {
      expect(row.findAll('.row-actions')).toHaveLength(1);
      const count = row.findAll('button:not(.row-main)').length;
      expect(count).toBeGreaterThanOrEqual(1);
      expect(count).toBeLessThanOrEqual(3);
    }
  });

  it('is aria-disabled offline and sends nothing', async () => {
    const { w, calls } = mountList({ ...FULL, connected: ref(false) });
    const eyes = w.findAll('[aria-label^="Examine"]');
    expect(eyes.length).toBeGreaterThan(0);
    for (const eye of eyes) {
      expect(eye.attributes('aria-disabled')).toBe('true');
      await eye.trigger('click');
    }
    expect(calls.examine).not.toHaveBeenCalled();
  });
});

describe('row shapes', () => {
  it('NPC rows are static with the hint NPC, Talk to, Trade with (vendors), then Examine', async () => {
    const { w, calls } = mountList(FULL);
    const [aldric, marta] = w.findAll('.nearby-row');
    for (const row of [aldric, marta]) {
      expect(row.find('button.row-main').exists()).toBe(false);
      expect(row.get('.row-hint').text()).toBe('NPC');
    }
    expect(labels(aldric)).toEqual(['Talk to Aldric', 'Examine Aldric']);
    expect(labels(marta)).toEqual(['Talk to Marta', 'Trade with Marta', 'Examine Marta']);
    await aldric.get('[aria-label="Talk to Aldric"]').trigger('click');
    expect(calls.hail).toHaveBeenCalledWith({ id: 3n, name: 'Aldric' });
  });

  it('players show Whisper, Examine and the menu', () => {
    const { w } = mountList(FULL);
    const rows = w.findAll('.nearby-row');
    expect(labels(rows[3])).toEqual(['Whisper Bo', 'Examine Bo', 'Actions for Bo']);
    expect(w.find('[aria-label="Invite Bo"]').exists()).toBe(false);
  });

  it('lists no resource node row and has no gather click (51.3.1.1-18)', () => {
    const { w, calls } = mountList(FULL);
    expect(w.text()).not.toContain('Iron Vein');
    expect(w.text()).not.toContain('Empty Vein');
    expect(w.find('button.row-main').exists()).toBe(false);
    expect(calls.gather).not.toHaveBeenCalled();
  });

  it('the event spawn card fights the spawn with no pull type (51.3.1.1-18, -19)', async () => {
    const { w, calls } = mountList(FULL);
    await w.get('[aria-label="Fight Goblin Scout"]').trigger('click');
    await flushPromises();
    expect(calls.fight).toHaveBeenCalledTimes(1);
    expect(calls.fight).toHaveBeenCalledWith({ kind: 'event', id: 7n, name: 'Goblin Scout' });
    expect(calls.pull).not.toHaveBeenCalled();
  });

  it('renders markup names as text', () => {
    const { w } = mountList({
      npcsHere: ref([{ id: 2n, name: PAYLOAD, npcType: 'vendor' }]),
    });
    expect(w.find('img').exists()).toBe(false);
    expect(w.get('.row-name').text()).toBe(PAYLOAD);
    expect(w.find(`[aria-label="Talk to ${PAYLOAD}"]`).exists()).toBe(true);
  });
});

describe('player rows (51.1-12)', () => {
  const playerRow = (w: VueWrapper) => w.findAll('.nearby-row').find((r) => r.classes().includes('kind-player'))!;
  const contextMenu = (el: Element) => {
    const event = new MouseEvent('contextmenu', { bubbles: true, cancelable: true });
    el.dispatchEvent(event);
    return event;
  };

  it('uses the chat-circle-dots icon for Whisper and the plain chat circle for Talk to', () => {
    const { w } = mountList(FULL);
    const whisper = w.get('[aria-label="Whisper Bo"]');
    expect(whisper.findComponent(PhChatCircleDots).exists()).toBe(true);
    expect(whisper.findComponent(PhChatCircle).exists()).toBe(false);
    const talk = w.get('[aria-label="Talk to Aldric"]');
    expect(talk.findComponent(PhChatCircle).exists()).toBe(true);
    expect(talk.findComponent(PhChatCircleDots).exists()).toBe(false);
    expect(w.get('[aria-label="Examine Bo"]').findComponent(PhEye).exists()).toBe(true);
    expect(w.findComponent(PhUserPlus).exists()).toBe(false);
  });

  it('Whisper pre-fills through the console', async () => {
    const { w, calls } = mountList(FULL);
    await w.get('[aria-label="Whisper Bo"]').trigger('click');
    expect(calls.whisperTo).toHaveBeenCalledWith('Bo');
  });

  it('the Actions button opens the menu, with Invite to party inside', async () => {
    const { w } = mountList(FULL);
    expect(w.find('[role="menu"]').exists()).toBe(false);
    await w.get('[aria-label="Actions for Bo"]').trigger('click');
    await flushPromises();
    const items = w.findAll('[role="menuitem"]').map((i) => i.text());
    expect(items.some((t) => t.startsWith('Invite to party'))).toBe(true);
    expect(w.get('[aria-label="Actions for Bo"]').attributes('aria-expanded')).toBe('true');
  });

  it('right-click on a player row opens the same menu, prevents the default and focuses the first item', async () => {
    const { w } = mountList(FULL);
    const event = contextMenu(playerRow(w).element);
    expect(event.defaultPrevented).toBe(true);
    await flushPromises();
    const items = w.findAll('[role="menuitem"]');
    expect(items.length).toBeGreaterThan(0);
    expect(document.activeElement).toBe(items[0].element);
  });

  it('a left click on the row name does nothing new', async () => {
    const { w } = mountList(FULL);
    await playerRow(w).get('.row-name').trigger('click');
    await flushPromises();
    expect(w.find('[role="menu"]').exists()).toBe(false);
  });

  it('right-click on an NPC row does nothing new', async () => {
    const { w } = mountList(FULL);
    const aldric = w.findAll('.nearby-row').find((r) => r.get('.row-name').text() === 'Aldric')!;
    const event = contextMenu(aldric.element);
    expect(event.defaultPrevented).toBe(false);
    await flushPromises();
    expect(w.find('[role="menu"]').exists()).toBe(false);
  });

  it('on mobile the right-click is left alone and the opener is the 44px size', async () => {
    const { w } = mountList(FULL, undefined, { desktop: false });
    const event = contextMenu(playerRow(w).element);
    expect(event.defaultPrevented).toBe(false);
    await flushPromises();
    expect(w.find('[role="menu"]').exists()).toBe(false);
    expect(w.get('[aria-label="Actions for Bo"]').classes()).toContain('sheet');
  });

  it('lists no offline player, and none whose online is missing', () => {
    const { w } = mountList({
      playersHere: ref([
        { ...PERSON, id: 4n, name: 'Bo', level: 3n },
        { ...PERSON, id: 5n, name: 'Cy', level: 3n, online: false },
        { id: 6n, name: 'Di', level: 3n, race: 'Orc', className: 'Shaman', locationId: 10n },
      ]),
    });
    const names = w.findAll('.nearby-row .row-name').map((n) => n.text());
    expect(names).toContain('Bo');
    expect(names).not.toContain('Cy');
    expect(names).not.toContain('Di');
    expect(w.find('[aria-label="Whisper Cy"]').exists()).toBe(false);
  });

  it('says In your party for a member of your party and Lv n for anyone else', () => {
    const { w } = mountList({
      playersHere: ref([
        { ...PERSON, id: 4n, name: 'Bo', level: 3n },
        { ...PERSON, id: 5n, name: 'Cy', level: 9n },
      ]),
      groupMembers: ref([
        { id: 11n, groupId: 1n, characterId: 1n },
        { id: 12n, groupId: 1n, characterId: 4n },
      ]),
    });
    const hint = (name: string) =>
      w.findAll('.nearby-row').find((r) => r.get('.row-name').text() === name)!.get('.row-hint').text();
    expect(hint('Bo')).toBe('In your party');
    expect(hint('Cy')).toBe('Lv 9');
  });

  it('renders markup in a player name as text', () => {
    const { w } = mountList({
      playersHere: ref([{ ...PERSON, id: 4n, name: PAYLOAD, level: 3n }]),
    });
    expect(w.find('img').exists()).toBe(false);
    expect(w.get('.kind-player .row-name').text()).toBe(PAYLOAD);
    expect(w.find(`[aria-label="Whisper ${PAYLOAD}"]`).exists()).toBe(true);
  });

  it('moves focus to the Nearby heading when the menu opener disappears while focused', async () => {
    const { w, data } = mountList(FULL);
    const opener = w.get('[aria-label="Actions for Bo"]');
    (opener.element as HTMLElement).focus();
    (data.playersHere as unknown as { value: unknown[] }).value = [];
    await flushPromises();
    await nextTick();
    expect(document.activeElement).toBe(w.get('h6').element);
    expect(w.get('h6').attributes('tabindex')).toBe('-1');
  });
});

// Review client-rest WR-03: players drop out of Nearby when they log out or walk away. Focus on a
// removed row's control moves to the next row's first button, else the Nearby heading.
describe('player names (review client-rest IN-01)', () => {
  it('render through CharacterName with the title, as text', () => {
    const playersHere = ref([{ ...PERSON, id: 4n, name: PAYLOAD, level: 3n }]);
    const { w } = mountList({ playersHere });
    const name = w.get('.kind-player .row-name');
    expect(name.classes()).toContain('character-name');
    expect(name.attributes('title')).toBe(PAYLOAD);
    expect(name.text()).toBe(PAYLOAD);
    expect(w.find('img').exists()).toBe(false);
  });
});

describe('focus when a row goes', () => {
  it("a player leaving while his Whisper has focus moves focus to the next row's first button", async () => {
    const playersHere = ref([
      { ...PERSON, id: 4n, name: 'Bo', level: 3n },
      { ...PERSON, id: 5n, name: 'Cy', level: 3n },
    ]);
    const { w } = mountList({ playersHere });
    (w.get('[aria-label="Whisper Bo"]').element as HTMLElement).focus();
    playersHere.value = [{ ...PERSON, id: 5n, name: 'Cy', level: 3n }];
    await nextTick();
    await nextTick();
    expect(document.activeElement).toBe(w.get('[aria-label="Whisper Cy"]').element);
  });

  it('the last row leaving while its Examine has focus moves focus to the Nearby heading', async () => {
    const playersHere = ref([{ ...PERSON, id: 4n, name: 'Bo', level: 3n }]);
    const { w } = mountList({ playersHere });
    (w.get('[aria-label="Examine Bo"]').element as HTMLElement).focus();
    playersHere.value = [];
    await nextTick();
    await nextTick();
    expect(document.activeElement).toBe(w.get('h6').element);
  });

  it('a player menu opener removed with its row hands focus to the next row too (the menu fallback waits)', async () => {
    const playersHere = ref([
      { ...PERSON, id: 4n, name: 'Bo', level: 3n },
      { ...PERSON, id: 5n, name: 'Cy', level: 3n },
    ]);
    const { w } = mountList({ playersHere });
    (w.get('[aria-label="Actions for Bo"]').element as HTMLElement).focus();
    playersHere.value = [{ ...PERSON, id: 5n, name: 'Cy', level: 3n }];
    await nextTick();
    await nextTick();
    expect(document.activeElement).toBe(w.get('[aria-label="Whisper Cy"]').element);
  });
});

describe('bind stone row', () => {
  it('is absent where the place has no bind stone', () => {
    const { w } = mountList({ ...FULL, character: ref(character({ locationId: 11n })) });
    expect(w.find('.kind-bindStone').exists()).toBe(false);
    expect(w.text()).not.toContain('Bind stone');
  });

  it('shows Bind with its labels when not bound, and the eye sends bind stone', async () => {
    const { w, calls } = mountList();
    const row = w.get('.kind-bindStone');
    expect(row.get('.row-name').text()).toBe('Bind stone');
    expect(row.find('.row-hint').text()).toBe('');
    const bind = row.get('.btn-bind');
    expect(bind.text()).toBe('Bind');
    expect(bind.attributes('aria-label')).toBe('Bind to The Crossing');
    expect(bind.attributes('title')).toBe('Respawn here after defeat');
    expect(labels(row)).toEqual(['Bind to The Crossing', 'Examine bind stone']);
    await row.get('[aria-label="Examine bind stone"]').trigger('click');
    expect(calls.examine).toHaveBeenCalledWith('bind stone');
  });

  it('calls bindLocation once with the character id; a second click while pending sends nothing', async () => {
    let resolve: () => void = () => {};
    const bindLocation = vi.fn(
      () =>
        new Promise<void>((done) => {
          resolve = done;
        }),
    );
    const { w } = mountList({}, bindLocation);
    const bind = w.get('.btn-bind');
    await bind.trigger('click');
    await bind.trigger('click');
    expect(bindLocation).toHaveBeenCalledTimes(1);
    expect(bindLocation).toHaveBeenCalledWith({ characterId: 1n });
    expect(bind.attributes('aria-disabled')).toBe('true');
    resolve();
    await nextTick();
    await nextTick();
    expect(bind.attributes('aria-disabled')).toBeUndefined();
  });

  it("a rejected Bind prints Couldn't send that. Try again. in the feed (review WR-01)", async () => {
    const bindLocation = vi.fn(() => Promise.reject(new Error('socket')));
    const { w, data } = mountList({}, bindLocation);
    const before = data.feed.entries.value.length;
    await w.get('.btn-bind').trigger('click');
    await vi.waitFor(() => expect(data.feed.entries.value.length).toBe(before + 1));
    const line = data.feed.entries.value[data.feed.entries.value.length - 1];
    expect(line.message).toBe("Couldn't send that. Try again.");
    expect(line.kind).toBe('system');
    expect(w.get('.btn-bind').attributes('aria-disabled')).toBeUndefined();
  });

  it('a resolved Bind prints no send error', async () => {
    const { w, data } = mountList();
    const before = data.feed.entries.value.length;
    await w.get('.btn-bind').trigger('click');
    await nextTick();
    await nextTick();
    expect(data.feed.entries.value.length).toBe(before);
  });

  it('is aria-disabled offline and sends nothing', async () => {
    const { w, bindLocation } = mountList({ connected: ref(false) });
    const bind = w.get('.btn-bind');
    expect(bind.attributes('aria-disabled')).toBe('true');
    await bind.trigger('click');
    expect(bindLocation).not.toHaveBeenCalled();
  });

  it('is aria-disabled in combat with the server reason and sends nothing (review WR-06)', async () => {
    const combat = { ...createInertGame().combat, active: ref(true) };
    const { w, bindLocation } = mountList({ combat });
    const bind = w.get('.btn-bind');
    expect(bind.attributes('aria-disabled')).toBe('true');
    expect(bind.attributes('title')).toBe('You cannot bind while in combat.');
    const reason = w.get(`#${bind.attributes('aria-describedby')}`);
    expect(reason.text()).toBe('You cannot bind while in combat.');
    await bind.trigger('click');
    expect(bindLocation).not.toHaveBeenCalled();
    combat.active.value = false;
    await nextTick();
    expect(bind.attributes('aria-disabled')).toBeUndefined();
    expect(bind.attributes('title')).toBe('Respawn here after defeat');
    expect(bind.attributes('aria-describedby')).toBeUndefined();
  });

  it('shows Bound here and no Bind button when bound to this place', () => {
    const { w } = mountList({ character: ref(character({ boundLocationId: 10n })) });
    const row = w.get('.kind-bindStone');
    expect(row.find('.btn-bind').exists()).toBe(false);
    expect(row.get('.row-hint').text()).toBe('Bound here');
    expect(labels(row)).toEqual(['Examine bind stone']);
  });

  it('does not change optimistically, then moves focus to the Examine button once bound', async () => {
    const { w, bindLocation, characterRef } = mountList();
    await w.get('.btn-bind').trigger('click');
    await nextTick();
    await nextTick();
    expect(bindLocation).toHaveBeenCalledTimes(1);
    // The reducer resolved but the character row has not changed: still not bound.
    expect(w.find('.btn-bind').exists()).toBe(true);
    characterRef.value = character({ boundLocationId: 10n });
    await nextTick();
    await nextTick();
    await nextTick();
    expect(w.find('.btn-bind').exists()).toBe(false);
    const eye = w.get('.kind-bindStone .btn-eye').element;
    expect(document.activeElement).toBe(eye);
  });

  it('moves focus when the character row changes before the promise resolves', async () => {
    let resolve: () => void = () => {};
    const bindLocation = vi.fn(
      () =>
        new Promise<void>((done) => {
          resolve = done;
        }),
    );
    const { w, characterRef } = mountList({}, bindLocation);
    await w.get('.btn-bind').trigger('click');
    characterRef.value = character({ boundLocationId: 10n });
    await nextTick();
    resolve();
    await nextTick();
    await nextTick();
    await nextTick();
    expect(document.activeElement).toBe(w.get('.kind-bindStone .btn-eye').element);
  });
});

describe('focus after Bind only for the place that was bound (review WR-02)', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('a refusal (resolved, no row change) never moves focus on a later visit', async () => {
    vi.useFakeTimers();
    const { w, characterRef } = mountList();
    await w.get('.btn-bind').trigger('click');
    await nextTick();
    await nextTick();
    vi.advanceTimersByTime(2000);
    // later the player is bound here by other means and comes back
    characterRef.value = character({ locationId: 11n });
    await nextTick();
    characterRef.value = character({ locationId: 10n, boundLocationId: 10n });
    await nextTick();
    await nextTick();
    await nextTick();
    expect(document.activeElement).not.toBe(w.get('.kind-bindStone .btn-eye').element);
  });

  it('moved before the bind ran: binding elsewhere moves no focus, and a return visit neither', async () => {
    let resolve: () => void = () => {};
    const bindLocation = vi.fn(
      () =>
        new Promise<void>((done) => {
          resolve = done;
        }),
    );
    const { w, characterRef } = mountList({}, bindLocation);
    await w.get('.btn-bind').trigger('click');
    // the leader's move runs first; the bind lands at the new place
    characterRef.value = character({ locationId: 11n, boundLocationId: 11n });
    await nextTick();
    resolve();
    await nextTick();
    await nextTick();
    characterRef.value = character({ locationId: 10n, boundLocationId: 10n });
    await nextTick();
    await nextTick();
    await nextTick();
    expect(document.activeElement).not.toBe(w.get('.kind-bindStone .btn-eye').element);
  });

  it('a rejected Bind clears the mark', async () => {
    const bindLocation = vi.fn(() => Promise.reject(new Error('socket')));
    const { w, characterRef } = mountList({}, bindLocation);
    await w.get('.btn-bind').trigger('click');
    await nextTick();
    await nextTick();
    characterRef.value = character({ boundLocationId: 10n });
    await nextTick();
    await nextTick();
    await nextTick();
    expect(document.activeElement).not.toBe(w.get('.kind-bindStone .btn-eye').element);
  });
});

describe('source', () => {
  const source = readFileSync(resolve(__dirname, 'NearbyList.vue'), 'utf8');

  it('gives the Examine and Bind buttons a 44px mobile target under 899px', () => {
    const media = source.slice(source.indexOf('@media (max-width: 899px)'));
    expect(media).toMatch(/\.btn-icon\s*\{[^}]*height: 44px/);
    expect(media).toMatch(/\.btn-bind\s*\{[^}]*min-height: 44px/);
  });

  it('wires the PlayerMenu and the right-click, and keeps no Invite button', () => {
    expect(source).toContain('PlayerMenu');
    expect(source).toContain('contextmenu');
    const code = source
      .split('\n')
      .filter((line) => !/^\s*(\/\/|\*)/.test(line))
      .join('\n');
    expect(code).not.toContain('Invite ${row.name}');
    expect(code).not.toContain('PhUserPlus');
  });

  it('never nests a button inside a row main part', () => {
    expect(source).not.toMatch(/row-main[^>]*>[^<]*<button/);
  });
});

// ---------------------------------------------------------------------------------------------
// 51.3.1.1-19: the pool groups (UI-SPEC "Nearby: Creatures / Named & quest targets / Resources /
// Also here", UI Considerations Q1-Q3).
// ---------------------------------------------------------------------------------------------

let poolSeq = 500n;

function poolRow(over: Record<string, unknown> = {}) {
  poolSeq += 1n;
  return {
    id: poolSeq,
    regionId: 1n,
    locationId: 11n,
    kind: 'creature',
    refId: 1n,
    level: 2n,
    lvLo: 4n,
    lvHi: 5n,
    name: 'Goblins',
    iconKey: 'humanoid',
    temperament: 'aggressive',
    singularNoun: 'goblin',
    pluralNoun: 'goblins',
    timeOfDay: 'any',
    ...over,
  };
}

const resourcePool = (over: Record<string, unknown> = {}) =>
  poolRow({
    kind: 'resource',
    name: 'Panlight Salt',
    iconKey: 'mineral',
    temperament: '',
    singularNoun: '',
    pluralNoun: '',
    lvLo: 0n,
    lvHi: 0n,
    ...over,
  });

function namedEnemy(over: Record<string, unknown> = {}) {
  return {
    id: 40n,
    characterId: 1n,
    name: 'Old Brannoc',
    enemyTemplateId: 9n,
    locationId: 11n,
    isAlive: true,
    respawnMinutes: 60n,
    ...over,
  };
}

function poolsGame(over: Record<string, unknown> = {}) {
  return {
    character: ref(character({ locationId: 11n })),
    poolLevelsHere: ref([
      poolRow({ id: 1n, name: 'Goblins', level: 3n }),
      poolRow({
        id: 2n,
        name: 'Wisps',
        level: 1n,
        iconKey: 'spirit',
        temperament: 'skittish',
        singularNoun: 'wisp',
        pluralNoun: 'wisps',
      }),
      resourcePool({ id: 3n }),
    ]),
    namedEnemies: ref([namedEnemy(), namedEnemy({ id: 41n, name: 'Elsewhere', locationId: 10n })]),
    npcsHere: ref([{ id: 2n, name: 'Marta', npcType: 'vendor' }]),
    ...over,
  };
}

const groupLabels = (w: VueWrapper) => w.findAll('h6').map((h) => h.text());
const groupNamed = (w: VueWrapper, label: string) =>
  w.findAll('.nearby-group').find((g) => g.get('h6').text() === label)!;

describe('pool groups', () => {
  it('shows Creatures, Named & quest targets, Resources and Also here in order', () => {
    const { w } = mountList(poolsGame());
    expect(groupLabels(w)).toEqual(['Nearby', 'Creatures', 'Named & quest targets', 'Resources', 'Also here']);
    const groups = w.findAll('.nearby-group');
    expect(groups.map((g) => g.get('h6').text())).toEqual([
      'Creatures',
      'Named & quest targets',
      'Resources',
      'Also here',
    ]);
    for (const group of groups) {
      const list = group.get('ul').element;
      for (const item of Array.from(list.children)) expect(item.tagName).toBe('LI');
    }
    const [creatures, named, resources] = groups;
    expect(creatures.findAll('.card-name').map((n) => n.text())).toEqual(['Goblins', 'Wisps']);
    expect(named.findAll('.card-name').map((n) => n.text())).toEqual(['Old Brannoc']);
    expect(resources.findAll('.card-name').map((n) => n.text())).toEqual(['Panlight Salt']);
  });

  it('lists no individual ordinary enemy and no resource node; the family card carries the line and hint', () => {
    const { w } = mountList(poolsGame());
    const goblins = w.findAll('.pool-card')[0];
    expect(goblins.get('.card-line').text()).toBe('Goblins swarm the pans, and every last goblin has noticed you.');
    expect(goblins.get('.card-hint').text()).toBe('Expect a crowd');
    expect(goblins.get('.density-badge').text()).toBe('Population: Overrun');
    expect(w.findAll('.kind-enemy, .kind-node')).toHaveLength(0);
  });

  it('Pull, Fight and Gather call the console with the pool or enemy id and the name', async () => {
    const { w, calls } = mountList(poolsGame());
    await w.get('[aria-label="Pull Goblins"]').trigger('click');
    await w.get('[aria-label="Fight Old Brannoc"]').trigger('click');
    await w.get('[aria-label="Gather Panlight Salt"]').trigger('click');
    await flushPromises();
    expect(calls.pull).toHaveBeenCalledWith({ id: 1n, name: 'Goblins' });
    expect(calls.fight).toHaveBeenCalledWith({ kind: 'named', id: 40n, name: 'Old Brannoc' });
    expect(calls.gather).toHaveBeenCalledWith({ id: 3n, name: 'Panlight Salt' });
  });

  it('offline every card button is aria-disabled and sends nothing', async () => {
    const { w, calls } = mountList(poolsGame({ connected: ref(false) }));
    for (const label of ['Pull Goblins', 'Fight Old Brannoc', 'Gather Panlight Salt']) {
      const button = w.get(`[aria-label="${label}"]`);
      expect(button.attributes('aria-disabled')).toBe('true');
      await button.trigger('click');
    }
    await flushPromises();
    expect(calls.pull).not.toHaveBeenCalled();
    expect(calls.fight).not.toHaveBeenCalled();
    expect(calls.gather).not.toHaveBeenCalled();
  });

  it("a rejected send prints Couldn't send that. Try again. and the button re-enables", async () => {
    const { w, calls, data } = mountList(poolsGame());
    calls.pull.mockImplementation(() => {
      throw new Error('socket');
    });
    const before = data.feed.entries.value.length;
    await w.get('[aria-label="Pull Goblins"]').trigger('click');
    await vi.waitFor(() => expect(data.feed.entries.value.length).toBe(before + 1));
    const line = data.feed.entries.value[data.feed.entries.value.length - 1];
    expect(line.message).toBe("Couldn't send that. Try again.");
    const pull = w.get('[aria-label="Pull Goblins"]');
    expect(pull.attributes('aria-disabled')).toBeUndefined();
    expect(pull.attributes('aria-busy')).toBeUndefined();
  });

  describe('a rejected reducer promise prints the send error line (51.3.1.1-31)', () => {
    const SEND_ERROR = "Couldn't send that. Try again.";
    const cases: Array<[string, 'pull' | 'fight' | 'gather']> = [
      ['Pull Goblins', 'pull'],
      ['Fight Old Brannoc', 'fight'],
      ['Gather Panlight Salt', 'gather'],
    ];
    for (const [label, call] of cases) {
      it(`${label}: once, and the button re-enables`, async () => {
        const { w, calls, data } = mountList(poolsGame());
        calls[call].mockImplementation(() => Promise.reject(new Error('refused')));
        const before = data.feed.entries.value.length;
        await w.get(`[aria-label="${label}"]`).trigger('click');
        await vi.waitFor(() => expect(data.feed.entries.value.length).toBe(before + 1));
        await flushPromises();
        const errors = data.feed.entries.value.filter((entry) => entry.message === SEND_ERROR);
        expect(errors).toHaveLength(1);
        const button = w.get(`[aria-label="${label}"]`);
        expect(button.attributes('aria-disabled')).toBeUndefined();
        expect(button.attributes('aria-busy')).toBeUndefined();
      });
    }

    it('with the real console: a rejecting pullFamily prints the line once and logs the warning', async () => {
      const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
      const error = new Error('refused');
      const pullFamily = vi.fn(() => Promise.reject(error));
      const { w, data } = mountList(
        poolsGame({ reducers: ref({ pullFamily }) }),
        undefined,
        {
          console: (game, frame) => {
            consoleScope = effectScope();
            return consoleScope.run(() => createConsole({ game, frame }))!;
          },
        },
      );
      await w.get('[aria-label="Pull Goblins"]').trigger('click');
      await vi.waitFor(() =>
        expect(data.feed.entries.value.some((entry) => entry.message === SEND_ERROR)).toBe(true),
      );
      await flushPromises();
      expect(pullFamily).toHaveBeenCalledWith({ characterId: 1n, poolId: 1n });
      expect(data.feed.entries.value.filter((entry) => entry.message === SEND_ERROR)).toHaveLength(1);
      expect(warn).toHaveBeenCalledWith('[console]', 'pullFamily', error);
      // The error detail never reaches the feed (T-51.3.1.1-110).
      expect(data.feed.entries.value.some((entry) => entry.message.includes('refused'))).toBe(false);
      const pull = w.get('[aria-label="Pull Goblins"]');
      expect(pull.attributes('aria-disabled')).toBeUndefined();
      expect(pull.attributes('aria-busy')).toBeUndefined();
    });
  });

  it('renders no pool group until the place pool rows have applied, and no empty line', () => {
    const { w } = mountList(poolsGame({ poolsAppliedFor: () => false, npcsHere: ref([]), namedEnemies: ref([]) }));
    expect(groupLabels(w)).toEqual(['Nearby']);
    expect(w.find('.pool-card').exists()).toBe(false);
    expect(w.text()).not.toContain('No one is nearby.');
    expect(w.text()).not.toContain('Nothing hunts here now.');
  });

  it('the Named & quest targets group does not wait on the pool rows (WR-04)', () => {
    const { w } = mountList(poolsGame({ poolsAppliedFor: () => false }));
    expect(groupLabels(w)).toEqual(['Nearby', 'Named & quest targets', 'Also here']);
    expect(groupNamed(w, 'Named & quest targets').findAll('.pool-card')).toHaveLength(1);
    expect(groupLabels(w)).not.toContain('Creatures');
    expect(groupLabels(w)).not.toContain('Resources');
  });

  it('a failed pool subscription shows one quiet line, and the named cards still show (WR-04)', () => {
    const { w } = mountList(poolsGame({ poolsAppliedFor: () => false, poolsFailed: ref(true) }));
    const line = w.get('.group-empty[role="status"]');
    expect(line.text()).toBe(NEARBY_COPY.loadFailed);
    expect(groupLabels(w)).toContain('Named & quest targets');
    expect(w.text()).not.toContain('No one is nearby.');
  });

  it('no failure line while the pool rows are only loading', () => {
    const { w } = mountList(poolsGame({ poolsAppliedFor: () => false, poolsFailed: ref(false) }));
    expect(w.text()).not.toContain(NEARBY_COPY.loadFailed);
  });

  it('reads the pools-applied state for the current place', () => {
    const asked: bigint[] = [];
    const poolsAppliedFor = (id: bigint): boolean => {
      asked.push(id);
      return true;
    };
    mountList(poolsGame({ poolsAppliedFor }));
    expect(asked).toContain(11n);
  });
});

describe('Creatures group (UI Q1)', () => {
  it('is omitted at a safe place and at an uncharted place', () => {
    for (const locationId of [12n, 13n]) {
      const { w } = mountList(
        poolsGame({ character: ref(character({ locationId })), poolLevelsHere: ref([poolRow({ locationId })]) }),
      );
      expect(groupLabels(w)).not.toContain('Creatures');
      w.unmount();
      wrapper = null;
    }
  });

  it('says Nothing hunts here now. at a non-safe place with no family pools', () => {
    const { w } = mountList(poolsGame({ poolLevelsHere: ref([resourcePool()]) }));
    const creatures = groupNamed(w, 'Creatures');
    expect(creatures.get('.group-empty').text()).toBe('Nothing hunts here now.');
    expect(creatures.find('ul').exists()).toBe(false);
  });

  it('keeps a wiped-out family last with its line and no Pull', () => {
    const { w } = mountList(
      poolsGame({
        poolLevelsHere: ref([
          poolRow({ id: 1n, name: 'Rats', pluralNoun: 'rats', singularNoun: 'rat', level: 0n, lvHi: 30n }),
          poolRow({ id: 2n, level: 1n }),
        ]),
      }),
    );
    const cards = groupNamed(w, 'Creatures').findAll('.pool-card');
    expect(cards.map((c) => c.get('.card-name').text())).toEqual(['Goblins', 'Rats']);
    expect(cards[1].find('button').exists()).toBe(false);
    expect(cards[1].get('.card-line').text()).toBe('No rats are left in the pans. The quiet feels borrowed.');
  });

  it('a place with no noun and an unknown terrain uses the area', () => {
    const plainNoNoun = { ...PLAIN, placeNoun: '', terrainType: 'grassland' };
    const { w } = mountList(poolsGame({ locations: ref([CROSSING, plainNoNoun]) }));
    expect(w.findAll('.card-line')[0].text()).toBe('Goblins swarm the area, and every last goblin has noticed you.');
  });
});

describe('Named & quest targets group (UI Q2)', () => {
  it('is omitted with no named, boss or quest enemy here', () => {
    const { w } = mountList(poolsGame({ namedEnemies: ref([]) }));
    expect(groupLabels(w)).not.toContain('Named & quest targets');
  });

  it('a slain named enemy shows the slain line and no button, after the living', () => {
    const { w } = mountList(
      poolsGame({
        namedEnemies: ref([namedEnemy({ name: 'Ash Wight', isAlive: false }), namedEnemy({ id: 42n, name: 'Vesk' })]),
      }),
    );
    const cards = groupNamed(w, 'Named & quest targets').findAll('.pool-card');
    expect(cards.map((c) => c.get('.card-name').text())).toEqual(['Vesk', 'Ash Wight']);
    expect(cards[1].classes()).toContain('slain');
    expect(cards[1].get('.card-sub').text()).toBe('Slain · back after a long rest');
    expect(cards[1].find('button').exists()).toBe(false);
  });

  it('a quest target shows Quest: {name}; an engaged event spawn shows In combat and an aria-disabled Fight', () => {
    const { w } = mountList(
      poolsGame({
        quests: ref([{ id: 1n, characterId: 1n, questTemplateId: 70n, progress: 0n, completed: false }]),
        questTemplates: ref([{ id: 70n, name: 'Crown of Ash', targetEnemyTemplateId: 9n }]),
        enemiesHere: ref([
          {
            id: 7n,
            name: 'Cinder Maw',
            state: 'engaged',
            locationId: 11n,
            enemyTemplateId: 1n,
            groupCount: 1n,
            level: 6n,
            lockedCombatId: 3n,
          },
        ]),
      }),
    );
    const named = groupNamed(w, 'Named & quest targets');
    expect(named.findAll('.card-sub').map((s) => s.text())).toEqual([
      'Named · Lv 6 · In combat',
      'Named · Quest: Crown of Ash',
    ]);
    expect(named.get('[aria-label="Fight Cinder Maw"]').attributes('aria-disabled')).toBe('true');
  });

  it('a named enemy shows its template level, con colour and Boss once the template is known (D-39, 51.3.1.1-31)', () => {
    const { w } = mountList(
      poolsGame({
        regions: ref([REGION_LV8]),
        namedEnemyTemplates: ref([{ id: 9n, name: 'Wight', level: 8n, isBoss: true }]),
      }),
    );
    const card = groupNamed(w, 'Named & quest targets').get('.pool-card');
    expect(card.get('.card-sub').text()).toBe('Boss · Lv 8');
    expect(card.get('.card-name').classes().some((c) => c.startsWith('con-'))).toBe(true);
    expect(card.findComponent(PhSkull).exists()).toBe(true);
  });

  it('a named enemy whose template is not known keeps Named and no level', () => {
    const { w } = mountList(poolsGame({ namedEnemyTemplates: ref([]) }));
    const card = groupNamed(w, 'Named & quest targets').get('.pool-card');
    expect(card.get('.card-sub').text()).toBe('Named');
    expect(card.findComponent(PhSkull).exists()).toBe(false);
  });

  it('a template in both the spawn and the named lists is harmless', () => {
    const template = { id: 9n, name: 'Wight', level: 8n, isBoss: false };
    const { w } = mountList(
      poolsGame({
        regions: ref([REGION_LV8]),
        enemyTemplatesHere: ref([template]),
        namedEnemyTemplates: ref([template]),
      }),
    );
    expect(groupNamed(w, 'Named & quest targets').get('.card-sub').text()).toBe('Named · Lv 8');
  });

  it('a named enemy reads the place-scaled level, not its template level (WR-03)', () => {
    // A level-12 template at the Lv 8 place (exact, offset 0) fights at Lv 8, so the card says so.
    const { w } = mountList(
      poolsGame({
        regions: ref([REGION_LV8]),
        namedEnemyTemplates: ref([{ id: 9n, name: 'Wight', level: 12n, isBoss: false }]),
      }),
    );
    expect(groupNamed(w, 'Named & quest targets').get('.card-sub').text()).toBe('Named · Lv 8');
  });

  it("a named enemy shows no level while the place's region is not loaded", () => {
    const { w } = mountList(
      poolsGame({ regions: ref([]), namedEnemyTemplates: ref([{ id: 9n, name: 'Wight', level: 8n, isBoss: false }]) }),
    );
    expect(groupNamed(w, 'Named & quest targets').get('.card-sub').text()).toBe('Named');
  });

  it('a completed quest adds no quest part', () => {
    const { w } = mountList(
      poolsGame({
        quests: ref([{ id: 1n, characterId: 1n, questTemplateId: 70n, progress: 1n, completed: true }]),
        questTemplates: ref([{ id: 70n, name: 'Crown of Ash', targetEnemyTemplateId: 9n }]),
      }),
    );
    expect(groupNamed(w, 'Named & quest targets').get('.card-sub').text()).toBe('Named');
  });
});

describe('Resources group (UI Q3)', () => {
  it('is omitted with no resource pools', () => {
    const { w } = mountList(poolsGame({ poolLevelsHere: ref([poolRow()]) }));
    expect(groupLabels(w)).not.toContain('Resources');
  });

  describe("time of day from the frame (D-55, 51.3.1.1-31)", () => {
    const timedPools = () =>
      ref([
        resourcePool({ id: 3n, name: 'Moonmoss', timeOfDay: 'night' }),
        resourcePool({ id: 4n, name: 'Sunwort', timeOfDay: 'day' }),
        resourcePool({ id: 5n, name: 'Salt', timeOfDay: 'any' }),
      ]);
    const resourceNames = (w: VueWrapper) => groupNamed(w, 'Resources').findAll('.card-name').map((n) => n.text());

    it('by day lists the day and any-time pools, not the night ones', () => {
      const { w } = mountList(poolsGame({ poolLevelsHere: timedPools() }), undefined, { timeOfDay: 'day' });
      expect(resourceNames(w)).toEqual(expect.arrayContaining(['Sunwort', 'Salt']));
      expect(resourceNames(w)).not.toContain('Moonmoss');
    });

    it('by night lists the night and any-time pools, not the day ones', () => {
      const { w } = mountList(poolsGame({ poolLevelsHere: timedPools() }), undefined, { timeOfDay: 'night' });
      expect(resourceNames(w)).toEqual(expect.arrayContaining(['Moonmoss', 'Salt']));
      expect(resourceNames(w)).not.toContain('Sunwort');
    });

    it('with no known time of day lists every pool', () => {
      const { w } = mountList(poolsGame({ poolLevelsHere: timedPools() }));
      expect(resourceNames(w)).toEqual(expect.arrayContaining(['Moonmoss', 'Sunwort', 'Salt']));
    });

    it('follows a day/night flip live, without a remount', async () => {
      const time = ref<TimeOfDay | null>('day');
      const { w } = mountList(poolsGame({ poolLevelsHere: timedPools() }), undefined, { timeOfDay: time });
      expect(resourceNames(w)).not.toContain('Moonmoss');
      time.value = 'night';
      await nextTick();
      expect(resourceNames(w)).toContain('Moonmoss');
      expect(resourceNames(w)).not.toContain('Sunwort');
    });

    it('has no timeOfDay prop any more: the frame is the one source', () => {
      const source = readFileSync(resolve(process.cwd(), 'src/rails/NearbyList.vue'), 'utf8');
      expect(source).not.toContain('defineProps');
      expect(source).toContain('frame.timeOfDay');
    });
  });

  it('every pool Exhausted keeps the cards and adds one summary line', () => {
    const { w } = mountList(
      poolsGame({ poolLevelsHere: ref([resourcePool({ level: 0n }), resourcePool({ level: 0n, name: 'Reed' })]) }),
    );
    const resources = groupNamed(w, 'Resources');
    expect(resources.findAll('.pool-card')).toHaveLength(2);
    expect(resources.find('button').exists()).toBe(false);
    expect(resources.findAll('.group-empty')).toHaveLength(1);
    expect(resources.get('.group-empty').text()).toBe('Everything worth taking has been picked from the pans.');
  });

  it('the harvest cap here disables Gather with its visible reason; a gather in progress too', () => {
    const now = BigInt(Date.now()) * 1000n;
    const capped = mountList(
      poolsGame({ harvestCaps: ref([{ id: 1n, locationId: 11n, cappedUntilMicros: now + 600_000_000n }]) }),
    ).w;
    const gather = capped.get('[aria-label="Gather Panlight Salt"]');
    expect(gather.attributes('aria-disabled')).toBe('true');
    expect(capped.get('.card-reason').text()).toBe('You have taken what you can carry from here for now.');
    capped.unmount();
    wrapper = null;
    const busy = mountList(
      poolsGame({ gathers: ref([{ id: 1n, characterId: 1n, nodeId: 0n, endsAtMicros: 0n, poolId: 3n }]) }),
    ).w;
    expect(busy.get('[aria-label="Gather Panlight Salt"]').attributes('aria-disabled')).toBe('true');
    expect(busy.get('.card-reason').text()).toBe('Finish gathering first.');
  });

  it('an expired cap does not disable Gather', () => {
    const { w } = mountList(poolsGame({ harvestCaps: ref([{ id: 1n, locationId: 11n, cappedUntilMicros: 1n }]) }));
    expect(w.get('[aria-label="Gather Panlight Salt"]').attributes('aria-disabled')).toBeUndefined();
  });
});

describe('Also here', () => {
  it('is labelled only when a group above renders', () => {
    const atSafe = mountList({ ...FULL, enemiesHere: ref([]) }).w;
    expect(groupLabels(atSafe)).toEqual(['Nearby']);
    expect(atSafe.findAll('.nearby-row').length).toBeGreaterThan(0);
    atSafe.unmount();
    wrapper = null;
    const withPools = mountList(poolsGame()).w;
    expect(groupLabels(withPools)).toContain('Also here');
  });

  it('No one is nearby. only when there are no families, named, resources or anyone else', () => {
    const { w } = mountList(
      poolsGame({
        poolLevelsHere: ref([]),
        namedEnemies: ref([]),
        npcsHere: ref([]),
        character: ref(character({ locationId: 12n })),
      }),
    );
    expect(w.text()).toContain('No one is nearby.');
    w.unmount();
    wrapper = null;
    const other = mountList(poolsGame({ npcsHere: ref([]) })).w;
    expect(other.text()).not.toContain('No one is nearby.');
  });
});

describe('keep focus on pool cards', () => {
  it('a Pull that goes away (wiped out) hands focus to the first button of the row now at that index', async () => {
    const pools = ref([poolRow({ id: 1n, name: 'Goblins', level: 3n }), poolRow({ id: 2n, name: 'Wisps', level: 1n })]);
    const { w } = mountList(poolsGame({ poolLevelsHere: pools, namedEnemies: ref([]) }));
    (w.get('[aria-label="Pull Goblins"]').element as HTMLElement).focus();
    pools.value = [poolRow({ id: 1n, name: 'Goblins', level: 0n }), poolRow({ id: 2n, name: 'Wisps', level: 1n })];
    await nextTick();
    await nextTick();
    // Wisps now leads (the wiped family sorts last), so the row at the old index holds Pull Wisps.
    expect(document.activeElement).toBe(w.get('[aria-label="Pull Wisps"]').element);
  });

  it('a slain named enemy with nothing after it hands focus to the Nearby heading', async () => {
    const named = ref([namedEnemy({ name: 'Vesk', locationId: 12n })]);
    const { w } = mountList(
      poolsGame({
        poolLevelsHere: ref([]),
        npcsHere: ref([]),
        namedEnemies: named,
        character: ref(character({ locationId: 12n })),
      }),
    );
    (w.get('[aria-label="Fight Vesk"]').element as HTMLElement).focus();
    named.value = [namedEnemy({ name: 'Vesk', locationId: 12n, isAlive: false })];
    await nextTick();
    await nextTick();
    expect(document.activeElement).toBe(w.get('h6').element);
  });
});

describe('pool cards: security, privacy and structure', () => {
  it('has no nested buttons anywhere in Nearby', () => {
    const { w } = mountList(
      poolsGame({ playersHere: FULL.playersHere, enemiesHere: FULL.enemiesHere, enemyTemplatesHere: FULL.enemyTemplatesHere }),
    );
    expect(w.findAll('.pool-card').length).toBeGreaterThan(3);
    expect(w.element.querySelectorAll('button button')).toHaveLength(0);
  });

  it('renders markup in family, resource, named and place names as text', () => {
    const { w } = mountList(
      poolsGame({
        locations: ref([CROSSING, { ...PLAIN, placeNoun: PAYLOAD }]),
        poolLevelsHere: ref([poolRow({ name: PAYLOAD, pluralNoun: '', singularNoun: '' }), resourcePool({ name: PAYLOAD })]),
        namedEnemies: ref([namedEnemy({ name: PAYLOAD })]),
      }),
    );
    expect(w.find('img').exists()).toBe(false);
    expect(w.findAll('.card-name').map((n) => n.text())).toEqual([PAYLOAD, PAYLOAD, PAYLOAD]);
    expect(w.findAll('.card-line')[0].text()).toContain(PAYLOAD.toLowerCase());
  });

  it('with numeric fixtures no rendered text shows a count, a cap amount or a percent', () => {
    const now = BigInt(Date.now()) * 1000n;
    const { w } = mountList(
      poolsGame({
        poolLevelsHere: ref([poolRow({ level: 3n, lvLo: 12n, lvHi: 14n, refId: 777n }), resourcePool({ level: 2n, refId: 888n })]),
        harvestCaps: ref([{ id: 5n, locationId: 11n, cappedUntilMicros: now + 123_456_789n }]),
      }),
    );
    const text = w.get('section').text().replace(/Lv \d+(–\d+)?/g, '');
    expect(text).not.toMatch(/\d|%/);
  });
});

describe('pool card source', () => {
  const source = readFileSync(resolve(__dirname, 'NearbyList.vue'), 'utf8');

  it('calls the console through the action runner and keeps focus by pool keys', () => {
    expect(source).toContain('consoleApi.pull(');
    expect(source).toContain('consoleApi.gather(');
    expect(source).toContain('consoleApi.fight(');
    expect(source).toContain('runner.run(');
    expect(source).toContain('family-${');
    expect(source).toContain('named-${');
    expect(source).toContain('resource-${');
  });
});
