// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { defineComponent, h, nextTick, ref } from 'vue';
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils';
import { PhDotsThree } from '@phosphor-icons/vue';
import PlayerMenu from './PlayerMenu.vue';
import ActionMenu from './ActionMenu.vue';
import {
  CONSOLE_KEY,
  FRAME_KEY,
  GAME_KEY,
  createInertConsole,
  createInertFrame,
  createInertGame,
} from '../game/context';
import type { ConsoleApi, FrameControls, GameData, GameReducers } from '../game/context';
import { SOCIAL_KEY, createInertSocial } from './socialContext';
import type { SocialData } from './socialContext';
import { SEND_ERROR_TEXT } from '../ledger/actionRunner';

// The ⋯ opener and its menu for one character (51.1-UI-SPEC "Party and Player Menus"): entries
// from the applied rows, the action layer, keyboard opening, one open menu at a time, the focus
// fallback when the opener disappears, the rejection line, and the mobile sheet.
// (Named .component.test.ts: playerMenu.test.ts already exists and Windows is case-insensitive.)

const mounted: VueWrapper[] = [];
afterEach(() => {
  for (const w of mounted.splice(0)) w.unmount();
  document.body.innerHTML = '';
});

const ME = 1n;
const BRAM = 2n;
const CY = 3n;
const GROUP = 7n;
const HERE = 10n;

function character(id: bigint, name: string, over: Record<string, unknown> = {}) {
  return {
    id,
    name,
    level: 5n,
    race: 'Orc',
    className: 'Shaman',
    locationId: HERE,
    online: true,
    groupId: undefined as bigint | undefined,
    ...over,
  };
}

function member(id: bigint, characterId: bigint, joined: bigint, followLeader = true) {
  return {
    id,
    groupId: GROUP,
    characterId,
    ownerUserId: 0n,
    role: 'member',
    followLeader,
    joinedAt: { microsSinceUnixEpoch: joined },
  };
}

interface Options {
  /** You lead a party of Ann, Bram and Cy. */
  party?: 'lead' | 'member' | null;
  /** Reducer calls hang until released. */
  hold?: boolean;
  /** Reducer calls reject. */
  reject?: boolean;
  desktop?: boolean;
}

function setup(options: Options = {}) {
  const gates: Array<() => void> = [];
  const call = vi.fn((_args: unknown) => {
    if (options.reject) return Promise.reject(new Error('nope'));
    if (options.hold) return new Promise<void>((resolveCall) => gates.push(resolveCall));
    return Promise.resolve();
  });
  const reducers = {
    inviteToGroup: vi.fn((a: unknown) => call(a)),
    kickGroupMember: vi.fn((a: unknown) => call(a)),
    leaveGroup: vi.fn((a: unknown) => call(a)),
    promoteGroupLeader: vi.fn((a: unknown) => call(a)),
    sendFriendRequestToCharacter: vi.fn((a: unknown) => call(a)),
    cancelGroupInvite: vi.fn((a: unknown) => call(a)),
    setFollowLeader: vi.fn((a: unknown) => call(a)),
  };
  const party = options.party ?? null;
  const inGroup = party !== null;
  const self = ref(character(ME, 'Ann', { groupId: inGroup ? GROUP : undefined }));
  const bram = character(BRAM, 'Bram', { groupId: inGroup ? GROUP : undefined });
  const cy = character(CY, 'Cy', { groupId: inGroup ? GROUP : undefined });
  const playersHere = ref(inGroup ? [] : [bram]);
  const knownCharacters = ref(inGroup ? [bram, cy] : []);
  const group = ref(inGroup ? { id: GROUP, leaderCharacterId: party === 'lead' ? ME : BRAM } : null);
  const groupMembers = ref(
    inGroup
      ? party === 'lead'
        ? [member(11n, ME, 1n), member(12n, BRAM, 3n), member(13n, CY, 2n)]
        : [member(12n, BRAM, 1n), member(11n, ME, 2n), member(13n, CY, 3n)]
      : [],
  );
  const base = createInertGame();
  const appendLocal = vi.fn();
  const game = {
    ...base,
    connected: ref(true),
    character: self,
    characterId: ref<bigint | null>(ME),
    playersHere,
    knownCharacters,
    group,
    groupMembers,
    reducers: ref(reducers as unknown as GameReducers),
    feed: { ...base.feed, appendLocal },
  } as unknown as GameData;
  const consoleApi = { ...createInertConsole(), whisperTo: vi.fn(), examine: vi.fn() } as ConsoleApi;
  const frame = { ...createInertFrame(), isDesktop: ref(options.desktop ?? true) } as unknown as FrameControls;
  const social: SocialData = createInertSocial();
  return {
    game,
    consoleApi,
    frame,
    social,
    reducers,
    appendLocal,
    playersHere,
    knownCharacters,
    groupMembers,
    group,
    release: () => gates.splice(0).forEach((open) => open()),
  };
}

type Setup = ReturnType<typeof setup>;

function mountMenu(s: Setup, props: Record<string, unknown> = {}): VueWrapper {
  const w = mount(PlayerMenu, {
    attachTo: document.body,
    props: { targetId: BRAM, ...props } as never,
    global: {
      provide: {
        [GAME_KEY as symbol]: s.game,
        [CONSOLE_KEY as symbol]: s.consoleApi,
        [FRAME_KEY as symbol]: s.frame,
        [SOCIAL_KEY as symbol]: s.social,
      },
    },
  });
  mounted.push(w);
  return w;
}

function opener(w: VueWrapper) {
  return w.get('button.menu-opener');
}

function items(): HTMLElement[] {
  return Array.from(document.querySelectorAll<HTMLElement>('[role="menuitem"]'));
}

function item(label: string): HTMLElement {
  const found = items().find((el) => (el.textContent ?? '').includes(label));
  if (!found) throw new Error(`no item ${label}`);
  return found;
}

function button(text: string): HTMLElement {
  const found = Array.from(document.querySelectorAll<HTMLElement>('button')).find(
    (el) => (el.textContent ?? '').trim() === text,
  );
  if (!found) throw new Error(`no button ${text}`);
  return found;
}

function key(target: Element, keyName: string): KeyboardEvent {
  const event = new KeyboardEvent('keydown', { key: keyName, bubbles: true, cancelable: true });
  target.dispatchEvent(event);
  return event;
}

async function settle(): Promise<void> {
  await flushPromises();
  await nextTick();
}

describe('PlayerMenu opener', () => {
  it('renders nothing for yourself while solo', () => {
    const w = mountMenu(setup(), { targetId: ME });
    expect(w.find('button').exists()).toBe(false);
  });

  it('renders nothing for an unknown character', () => {
    const w = mountMenu(setup(), { targetId: 99n });
    expect(w.find('button').exists()).toBe(false);
  });

  it('a known other player gets one ⋯ button with the menu aria attributes', () => {
    const w = mountMenu(setup());
    const buttons = w.findAll('button');
    expect(buttons).toHaveLength(1);
    const b = opener(w);
    expect(b.findComponent(PhDotsThree).exists()).toBe(true);
    expect(b.attributes('aria-label')).toBe('Actions for Bram');
    expect(b.attributes('aria-haspopup')).toBe('menu');
    expect(b.attributes('aria-expanded')).toBe('false');
    expect(b.attributes('aria-controls')).toBeUndefined();
  });

  it("yourself in a party: 'Actions for yourself'", () => {
    const w = mountMenu(setup({ party: 'member' }), { targetId: ME });
    expect(opener(w).attributes('aria-label')).toBe('Actions for yourself');
  });

  it('the opener contains no other button, link or input', () => {
    const w = mountMenu(setup());
    expect(opener(w).findAll('button, a, input, select, textarea')).toHaveLength(0);
  });

  it("size 'sheet' makes the opener the 44px variant", () => {
    const w = mountMenu(setup(), { size: 'sheet' });
    expect(opener(w).classes()).toContain('sheet');
    const rail = mountMenu(setup());
    expect(opener(rail).classes()).not.toContain('sheet');
  });
});

describe('PlayerMenu opening', () => {
  it('a click opens the menu with focus on the first enabled item', async () => {
    const w = mountMenu(setup());
    await opener(w).trigger('click');
    await nextTick();
    const b = opener(w);
    expect(b.attributes('aria-expanded')).toBe('true');
    const controls = b.attributes('aria-controls') as string;
    expect(controls).toBeTruthy();
    const panel = document.getElementById(controls);
    expect(panel?.querySelector('[role="menu"]')).not.toBeNull();
    expect(document.activeElement).toBe(item('Invite to party'));
  });

  it('a second click closes it and keeps focus on the opener', async () => {
    const w = mountMenu(setup());
    await opener(w).trigger('click');
    await opener(w).trigger('click');
    await nextTick();
    expect(opener(w).attributes('aria-expanded')).toBe('false');
    expect(items()).toHaveLength(0);
    expect(document.activeElement).toBe(opener(w).element);
  });

  it('Enter and Arrow Down open with focus on the first item, Arrow Up on the last', async () => {
    for (const [keyName, label] of [
      ['Enter', 'Invite to party'],
      [' ', 'Invite to party'],
      ['ArrowDown', 'Invite to party'],
      ['ArrowUp', 'Add friend'],
    ] as const) {
      const w = mountMenu(setup());
      const event = key(opener(w).element, keyName);
      await nextTick();
      await nextTick();
      expect(event.defaultPrevented).toBe(true);
      expect(opener(w).attributes('aria-expanded')).toBe('true');
      expect(document.activeElement).toBe(item(label));
      w.unmount();
      mounted.splice(mounted.indexOf(w), 1);
    }
  });

  it('the exposed open() opens it without a click (the right-click path)', async () => {
    const w = mountMenu(setup());
    (w.vm as unknown as { open(focus?: 'first' | 'last'): void }).open('first');
    await nextTick();
    await nextTick();
    expect(opener(w).attributes('aria-expanded')).toBe('true');
    expect(document.activeElement).toBe(item('Invite to party'));
    (w.vm as unknown as { close(): void }).close();
    await nextTick();
    expect(items()).toHaveLength(0);
  });

  it('opening a second menu closes the first', async () => {
    const s = setup({ party: 'lead' });
    const first = mountMenu(s, { targetId: BRAM });
    const second = mountMenu(s, { targetId: CY });
    await opener(first).trigger('click');
    expect(opener(first).attributes('aria-expanded')).toBe('true');
    await opener(second).trigger('click');
    await nextTick();
    expect(opener(first).attributes('aria-expanded')).toBe('false');
    expect(opener(second).attributes('aria-expanded')).toBe('true');
    expect(document.querySelectorAll('[role="menu"]')).toHaveLength(1);
  });

  it('a pointerdown outside closes the menu and focuses the opener', async () => {
    const w = mountMenu(setup());
    const outside = document.createElement('div');
    document.body.appendChild(outside);
    await opener(w).trigger('click');
    outside.dispatchEvent(new Event('pointerdown', { bubbles: true }));
    await nextTick();
    expect(opener(w).attributes('aria-expanded')).toBe('false');
    expect(document.activeElement).toBe(opener(w).element);
  });

  it('a pointerdown inside the menu does not close it', async () => {
    const w = mountMenu(setup());
    await opener(w).trigger('click');
    await nextTick();
    item('Whisper').dispatchEvent(new Event('pointerdown', { bubbles: true }));
    await nextTick();
    expect(opener(w).attributes('aria-expanded')).toBe('true');
  });

  it('Escape closes and returns focus to the opener', async () => {
    const w = mountMenu(setup());
    await opener(w).trigger('click');
    await nextTick();
    key(item('Whisper'), 'Escape');
    await nextTick();
    expect(items()).toHaveLength(0);
    expect(document.activeElement).toBe(opener(w).element);
  });

  it('Tab closes the menu from the opener so focus moves on', async () => {
    const w = mountMenu(setup());
    await opener(w).trigger('click');
    await nextTick();
    const event = key(item('Whisper'), 'Tab');
    await nextTick();
    expect(event.defaultPrevented).toBe(false);
    expect(items()).toHaveLength(0);
    expect(document.activeElement).toBe(opener(w).element);
  });
});

describe('PlayerMenu actions', () => {
  it('Invite to party calls inviteToGroup once, closes and focuses the opener', async () => {
    const s = setup();
    const w = mountMenu(s);
    await opener(w).trigger('click');
    await nextTick();
    item('Invite to party').click();
    await settle();
    expect(s.reducers.inviteToGroup).toHaveBeenCalledTimes(1);
    expect(s.reducers.inviteToGroup).toHaveBeenCalledWith({ characterId: ME, targetName: 'Bram' });
    expect(items()).toHaveLength(0);
    expect(document.activeElement).toBe(opener(w).element);
  });

  it('an action is inert while pending', async () => {
    const s = setup({ hold: true });
    const w = mountMenu(s);
    await opener(w).trigger('click');
    await nextTick();
    item('Invite to party').click();
    await nextTick();
    expect(item('Invite to party').getAttribute('aria-disabled')).toBe('true');
    item('Invite to party').click();
    await nextTick();
    expect(s.reducers.inviteToGroup).toHaveBeenCalledTimes(1);
    s.release();
    await settle();
    expect(items()).toHaveLength(0);
  });

  it('Remove from party asks first and only Remove sends kickGroupMember', async () => {
    const s = setup({ party: 'lead' });
    const w = mountMenu(s);
    await opener(w).trigger('click');
    await nextTick();
    item('Remove from party').click();
    await nextTick();
    expect(document.body.textContent).toContain('Remove Bram from the party?');
    expect(s.reducers.kickGroupMember).not.toHaveBeenCalled();
    button('Keep Bram').click();
    await nextTick();
    await nextTick();
    expect(s.reducers.kickGroupMember).not.toHaveBeenCalled();
    item('Remove from party').click();
    await nextTick();
    button('Remove').click();
    await settle();
    expect(s.reducers.kickGroupMember).toHaveBeenCalledTimes(1);
    expect(s.reducers.kickGroupMember).toHaveBeenCalledWith({ characterId: ME, targetName: 'Bram' });
    expect(items()).toHaveLength(0);
    expect(document.activeElement).toBe(opener(w).element);
  });

  it('Leave party as the leader names an online successor over an offline earlier joiner', async () => {
    const s = setup({ party: 'lead' });
    // Cy joined before Bram but is offline: the server's successorOrder passes leadership to Bram.
    s.knownCharacters.value = s.knownCharacters.value.map((row) => (row.id === CY ? { ...row, online: false } : row));
    const w = mountMenu(s, { targetId: ME });
    await opener(w).trigger('click');
    await nextTick();
    item('Leave party').click();
    await nextTick();
    expect(document.body.textContent).toContain('Leave the party? Leadership passes to Bram.');
  });

  it('Leave party as the leader names the successor and sends leaveGroup on Leave', async () => {
    const s = setup({ party: 'lead' });
    const w = mountMenu(s, { targetId: ME });
    await opener(w).trigger('click');
    await nextTick();
    item('Leave party').click();
    await nextTick();
    expect(document.body.textContent).toContain('Leave the party? Leadership passes to Cy.');
    button('Leave').click();
    await settle();
    expect(s.reducers.leaveGroup).toHaveBeenCalledTimes(1);
    expect(s.reducers.leaveGroup).toHaveBeenCalledWith({ characterId: ME });
  });

  it('Make party leader is sent without a confirm', async () => {
    const s = setup({ party: 'lead' });
    const w = mountMenu(s);
    await opener(w).trigger('click');
    await nextTick();
    item('Make party leader').click();
    await settle();
    expect(s.reducers.promoteGroupLeader).toHaveBeenCalledWith({ characterId: ME, targetName: 'Bram' });
  });

  it('Whisper hands the name to the console and closes the menu without refocusing the opener', async () => {
    const s = setup();
    const w = mountMenu(s);
    await opener(w).trigger('click');
    await nextTick();
    item('Whisper').click();
    await settle();
    expect(s.consoleApi.whisperTo).toHaveBeenCalledTimes(1);
    expect(s.consoleApi.whisperTo).toHaveBeenCalledWith('Bram');
    expect(items()).toHaveLength(0);
    expect(document.activeElement).not.toBe(opener(w).element);
  });

  it('a disabled entry sends nothing', async () => {
    const s = setup();
    s.playersHere.value = [character(BRAM, 'Bram', { groupId: 42n })];
    const w = mountMenu(s);
    await opener(w).trigger('click');
    await nextTick();
    expect(item('Invite to party').getAttribute('aria-label')).toBe('Invite to party, In another party');
    item('Invite to party').click();
    await settle();
    expect(s.reducers.inviteToGroup).not.toHaveBeenCalled();
    expect(items().length).toBeGreaterThan(0);
  });

  it('a rejected reducer promise appends the send-error line once', async () => {
    const s = setup({ reject: true });
    const w = mountMenu(s);
    await opener(w).trigger('click');
    await nextTick();
    item('Invite to party').click();
    await settle();
    expect(s.appendLocal).toHaveBeenCalledTimes(1);
    expect(s.appendLocal).toHaveBeenCalledWith('system', SEND_ERROR_TEXT);
  });
});

// Review client-rest WR-04: disconnected, the ⋯ is aria-disabled with the reason and opens nothing;
// a menu open when the connection drops keeps its entries readable but disabled, sending nothing.
// Review client-social WR-04: the desktop popover is fixed from the opener's rectangle, so it closes
// on any scroll outside it (a rail scrolling) or a window resize instead of staying beside the wrong row.
describe('PlayerMenu closes on scroll and resize (desktop)', () => {
  it('a rail scrolling closes the menu and returns focus to the opener', async () => {
    const s = setup();
    const rail = document.createElement('div');
    document.body.appendChild(rail);
    const w = mountMenu(s);
    await opener(w).trigger('click');
    await nextTick();
    expect(items().length).toBeGreaterThan(0);
    rail.dispatchEvent(new Event('scroll'));
    await nextTick();
    expect(items()).toHaveLength(0);
    expect(opener(w).attributes('aria-expanded')).toBe('false');
    expect(document.activeElement).toBe(opener(w).element);
  });

  it('a window resize closes the menu', async () => {
    const w = mountMenu(setup());
    await opener(w).trigger('click');
    await nextTick();
    window.dispatchEvent(new Event('resize'));
    await nextTick();
    expect(items()).toHaveLength(0);
  });

  it('a scroll inside the menu panel keeps it open', async () => {
    const w = mountMenu(setup());
    await opener(w).trigger('click');
    await nextTick();
    items()[0].closest('.menu-panel')!.dispatchEvent(new Event('scroll'));
    await nextTick();
    expect(items().length).toBeGreaterThan(0);
  });

  it('after closing, a scroll does nothing (the listeners are gone)', async () => {
    const w = mountMenu(setup());
    await opener(w).trigger('click');
    await nextTick();
    await opener(w).trigger('click');
    await nextTick();
    const outside = document.createElement('button');
    document.body.appendChild(outside);
    outside.focus();
    window.dispatchEvent(new Event('resize'));
    document.body.dispatchEvent(new Event('scroll'));
    await nextTick();
    expect(document.activeElement).toBe(outside);
  });

  it('the mobile sheet ignores scrolls (it is not placed from the opener)', async () => {
    const s = setup({ desktop: false });
    const w = mountMenu(s, { size: 'sheet' });
    await opener(w).trigger('click');
    await nextTick();
    document.body.dispatchEvent(new Event('scroll'));
    window.dispatchEvent(new Event('resize'));
    await nextTick();
    expect(items().length).toBeGreaterThan(0);
  });
});

describe('PlayerMenu while not connected', () => {
  it('the opener is aria-disabled with the reason and opens no menu by click, key or right-click', async () => {
    const s = setup();
    (s.game.connected as unknown as { value: boolean }).value = false;
    const w = mountMenu(s);
    const button = opener(w);
    expect(button.attributes('aria-disabled')).toBe('true');
    expect(button.attributes('title')).toBe('Actions for Bram · Reconnecting…');
    const reason = document.getElementById(button.attributes('aria-describedby')!);
    expect(reason?.textContent).toBe('Reconnecting…');
    await button.trigger('click');
    await button.trigger('keydown', { key: 'ArrowDown' });
    (w.vm as unknown as { open: () => void }).open();
    await nextTick();
    expect(items()).toHaveLength(0);
    expect(button.attributes('aria-expanded')).toBe('false');
  });

  it('connected, the opener has no aria-disabled and no reason', () => {
    const w = mountMenu(setup());
    expect(opener(w).attributes('aria-disabled')).toBeUndefined();
    expect(opener(w).attributes('aria-describedby')).toBeUndefined();
    expect(opener(w).attributes('title')).toBe('Actions for Bram');
  });

  it('a menu open when the connection drops shows every entry disabled with the reason and sends nothing', async () => {
    const s = setup();
    const w = mountMenu(s);
    await opener(w).trigger('click');
    await nextTick();
    expect(items().length).toBeGreaterThan(0);
    (s.game.connected as unknown as { value: boolean }).value = false;
    await nextTick();
    for (const el of items()) {
      expect(el.getAttribute('aria-disabled')).toBe('true');
      expect(el.getAttribute('aria-label')).toContain(', Reconnecting…');
    }
    item('Invite to party').click();
    item('Whisper').click();
    await settle();
    expect(s.reducers.inviteToGroup).not.toHaveBeenCalled();
    expect(s.consoleApi.whisperTo).not.toHaveBeenCalled();
  });
});

describe('PlayerMenu rows and focus fallback', () => {
  it('rows changing while open re-derive the entries', async () => {
    const s = setup();
    const w = mountMenu(s);
    await opener(w).trigger('click');
    await nextTick();
    expect(item('Whisper').getAttribute('aria-disabled')).toBeNull();
    s.playersHere.value = [character(BRAM, 'Bram', { online: false })];
    await nextTick();
    expect(item('Whisper').getAttribute('aria-disabled')).toBe('true');
    expect(document.body.textContent).toContain('offline');
  });

  it('the opener disappearing while open closes the menu and focuses the fallback', async () => {
    const s = setup({ party: 'lead' });
    const heading = document.createElement('h6');
    heading.tabIndex = -1;
    document.body.appendChild(heading);
    const w = mountMenu(s, { fallbackFocus: () => heading });
    await opener(w).trigger('click');
    await nextTick();
    expect(items().length).toBeGreaterThan(0);
    // Bram leaves the party and the place: his row is gone.
    s.knownCharacters.value = s.knownCharacters.value.filter((row) => row.id !== BRAM);
    await nextTick();
    await nextTick();
    expect(w.find('button').exists()).toBe(false);
    expect(items()).toHaveLength(0);
    expect(document.activeElement).toBe(heading);
  });

  it('unmounting while open moves focus to the fallback', async () => {
    // A host that drops its row (v-if), as a party list does when a member leaves. (Unmounting
    // the test wrapper itself detaches the DOM before the hooks run, so a host is used.)
    const s = setup();
    const show = ref(true);
    const heading = ref<HTMLElement | null>(null);
    const menu = ref<{ open(focus?: 'first' | 'last'): void } | null>(null);
    const Host = defineComponent({
      setup() {
        return () =>
          h('div', [
            h('h6', { ref: heading, tabindex: '-1' }, 'Party'),
            show.value ? h(PlayerMenu, { ref: menu, targetId: BRAM, fallbackFocus: () => heading.value }) : null,
          ]);
      },
    });
    const w = mount(Host, {
      attachTo: document.body,
      global: {
        provide: {
          [GAME_KEY as symbol]: s.game,
          [CONSOLE_KEY as symbol]: s.consoleApi,
          [FRAME_KEY as symbol]: s.frame,
          [SOCIAL_KEY as symbol]: s.social,
        },
      },
    });
    mounted.push(w);
    menu.value?.open('first');
    await nextTick();
    await nextTick();
    expect(document.activeElement).toBe(item('Invite to party'));
    show.value = false;
    await nextTick();
    // The fallback runs after the DOM settles (a host's keepFocus rule goes first).
    await nextTick();
    expect(items()).toHaveLength(0);
    expect(document.activeElement).toBe(heading.value);
  });

  it('after unmounting while open, another menu opens without closing a stale holder', async () => {
    const s = setup({ party: 'lead' });
    const first = mountMenu(s, { targetId: BRAM });
    await opener(first).trigger('click');
    first.unmount();
    mounted.splice(mounted.indexOf(first), 1);
    const second = mountMenu(s, { targetId: CY });
    await opener(second).trigger('click');
    await nextTick();
    expect(opener(second).attributes('aria-expanded')).toBe('true');
  });
});

describe('PlayerMenu on mobile', () => {
  it('with the frame not desktop the menu renders as the sheet', async () => {
    const s = setup({ desktop: false });
    const w = mountMenu(s, { size: 'sheet' });
    await opener(w).trigger('click');
    await nextTick();
    const menu = w.getComponent(ActionMenu);
    expect(menu.props('mobile')).toBe(true);
    expect(document.querySelector('section[role="dialog"][aria-modal="true"]')).not.toBeNull();
    button('Cancel').click();
    await nextTick();
    expect(items()).toHaveLength(0);
    expect(document.activeElement).toBe(opener(w).element);
  });

  it('desktop passes the side and the opener rectangle', async () => {
    const s = setup();
    const w = mountMenu(s, { side: 'left' });
    await opener(w).trigger('click');
    const menu = w.getComponent(ActionMenu);
    expect(menu.props('mobile')).toBe(false);
    expect(menu.props('side')).toBe('left');
    expect(menu.props('anchor')).not.toBeNull();
  });
});
