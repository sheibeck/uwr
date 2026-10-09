// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { nextTick, ref } from 'vue';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils';
import { PhChatCircle, PhChatCircleDots, PhEye, PhUserPlus } from '@phosphor-icons/vue';
import NearbyList from './NearbyList.vue';
import {
  CONSOLE_KEY,
  FRAME_KEY,
  GAME_KEY,
  createInertConsole,
  createInertFrame,
  createInertGame,
} from '../game/context';
import type { ConsoleApi, FrameControls, GameData } from '../game/context';

let wrapper: VueWrapper | null = null;

afterEach(() => {
  wrapper?.unmount();
  wrapper = null;
  document.body.innerHTML = '';
});

const PAYLOAD = '<img src=x onerror=alert(1)>';

const CROSSING = { id: 10n, name: 'The Crossing', regionId: 1n, bindStone: true };
const PLAIN = { id: 11n, name: 'Cinder Road', regionId: 1n, bindStone: false };

function character(over: Record<string, unknown> = {}) {
  return { id: 1n, name: 'Hero', locationId: 10n, boundLocationId: 99n, level: 6n, ...over };
}

function mountList(
  game: Record<string, unknown> = {},
  bindLocation = vi.fn(() => Promise.resolve()),
  options: { desktop?: boolean } = {},
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
    locations: ref([CROSSING, PLAIN]),
    reducers: ref({ bindLocation }),
    ...game,
  } as unknown as GameData;
  const consoleApi = { ...createInertConsole(), ...calls } as unknown as ConsoleApi;
  const openScreen = vi.fn();
  const frame = {
    ...createInertFrame(),
    openScreen,
    isDesktop: ref(options.desktop ?? true),
  } as unknown as FrameControls;
  wrapper = mount(NearbyList, {
    attachTo: document.body,
    global: {
      provide: {
        [GAME_KEY as symbol]: data,
        [CONSOLE_KEY as symbol]: consoleApi,
        [FRAME_KEY as symbol]: frame,
      },
    },
  });
  return { w: wrapper, calls, bindLocation, characterRef, data };
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
  // A legacy field the list must ignore: resources are pools now (51.3.1.1-18; Plan 19 adds the cards).
  nodesHere: ref([
    { id: 20n, name: 'Iron Vein', state: 'available' },
    { id: 21n, name: 'Empty Vein', state: 'depleted' },
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
    // enemy, NPCs (Aldric, Marta), bind stone, player (Bo); no resource node rows (51.3.1.1-18)
    expect(rows.map((r) => r.get('.row-name').text())).toEqual(['Goblin Scout', 'Aldric', 'Marta', 'Bind stone', 'Bo']);
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
      'Goblin Scout': 'Goblin Scout',
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
    const { w } = mountList({ character: ref(character({ locationId: 11n })) });
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
    const [, aldric, marta] = w.findAll('.nearby-row');
    for (const row of [aldric, marta]) {
      expect(row.find('button.row-main').exists()).toBe(false);
      expect(row.get('.row-hint').text()).toBe('NPC');
    }
    expect(labels(aldric)).toEqual(['Talk to Aldric', 'Examine Aldric']);
    expect(labels(marta)).toEqual(['Talk to Marta', 'Trade with Marta', 'Examine Marta']);
    await aldric.get('[aria-label="Talk to Aldric"]').trigger('click');
    expect(calls.hail).toHaveBeenCalledWith({ id: 3n, name: 'Aldric' });
  });

  it('players show Whisper, Examine and the menu; enemies show Pull and Examine', () => {
    const { w } = mountList(FULL);
    const rows = w.findAll('.nearby-row');
    expect(labels(rows[4])).toEqual(['Whisper Bo', 'Examine Bo', 'Actions for Bo']);
    expect(w.find('[aria-label="Invite Bo"]').exists()).toBe(false);
    expect(labels(rows[0]).length).toBe(2);
    expect(labels(rows[0])[0]).toMatch(/^Pull Goblin Scout/);
    expect(labels(rows[0])[1]).toBe('Examine Goblin Scout');
  });

  it('lists no resource node row and has no gather click (51.3.1.1-18)', () => {
    const { w, calls } = mountList(FULL);
    expect(w.text()).not.toContain('Iron Vein');
    expect(w.text()).not.toContain('Empty Vein');
    expect(w.find('button.row-main').exists()).toBe(false);
    expect(calls.gather).not.toHaveBeenCalled();
  });

  it('the enemy spawn button fights the spawn (an event enemy) with no pull type (51.3.1.1-18)', async () => {
    const { w, calls } = mountList(FULL);
    await w.get('[aria-label^="Pull Goblin Scout"]').trigger('click');
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
