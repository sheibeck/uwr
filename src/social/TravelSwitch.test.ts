// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { nextTick, ref } from 'vue';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils';
import TravelSwitch from './TravelSwitch.vue';
import { CONSOLE_KEY, GAME_KEY, createInertConsole, createInertGame } from '../game/context';
import type { GameData, GameReducers } from '../game/context';
import { SEND_ERROR_TEXT } from '../ledger/actionRunner';

// The Travel with leader switch (51.1-UI-SPEC "Travel with leader switch"): members only, out of
// combat, once the group rows and the leader's character row apply. aria-checked follows the
// subscribed member row; nothing is optimistic.

let wrapper: VueWrapper | null = null;
afterEach(() => {
  wrapper?.unmount();
  wrapper = null;
});

const ME = 2n;
const LEADER = 1n;

interface Options {
  inGroup?: boolean;
  leaderId?: bigint;
  memberRow?: boolean;
  leaderRow?: boolean;
  followLeader?: boolean;
  combat?: boolean;
  connected?: boolean;
  hold?: boolean;
}

function setup(options: Options = {}) {
  const gates: Array<() => void> = [];
  const setFollowLeader = vi.fn((_args: { characterId: bigint; follow: boolean }) => {
    if (options.hold) return new Promise<void>((resolveCall) => gates.push(resolveCall));
    return Promise.resolve();
  });
  const reducers = { setFollowLeader } as unknown as GameReducers;
  const members = ref(
    options.memberRow === false
      ? []
      : [{ id: 11n, groupId: 5n, characterId: ME, followLeader: options.followLeader ?? true }],
  );
  const connected = ref(options.connected ?? true);
  const base = createInertGame();
  const game = {
    ...base,
    connected,
    characterId: ref<bigint | null>(ME),
    group: ref(options.inGroup === false ? null : { id: 5n, leaderCharacterId: options.leaderId ?? LEADER }),
    groupMembers: members,
    knownCharacters: ref(options.leaderRow === false ? [] : [{ id: LEADER, name: 'Ann' }]),
    combat: { ...base.combat, active: ref(options.combat ?? false) },
    reducers: ref(reducers),
  } as unknown as GameData;
  return { game, setFollowLeader, members, connected, release: () => gates.splice(0).forEach((open) => open()) };
}

function mountSwitch(game: GameData, props: Record<string, unknown> = {}): VueWrapper {
  wrapper = mount(TravelSwitch, {
    props: props as never,
    global: { provide: { [GAME_KEY as symbol]: game, [CONSOLE_KEY as symbol]: createInertConsole() } },
  });
  return wrapper;
}

describe('TravelSwitch visibility', () => {
  it('renders nothing when solo', () => {
    expect(mountSwitch(setup({ inGroup: false }).game).find('button').exists()).toBe(false);
  });

  it('renders nothing for the leader', () => {
    expect(mountSwitch(setup({ leaderId: ME }).game).find('button').exists()).toBe(false);
  });

  it('renders nothing in combat', () => {
    expect(mountSwitch(setup({ combat: true }).game).find('button').exists()).toBe(false);
  });

  it('renders nothing until your member row is known', () => {
    expect(mountSwitch(setup({ memberRow: false }).game).find('button').exists()).toBe(false);
  });

  it("renders nothing until the leader's character row is known", () => {
    expect(mountSwitch(setup({ leaderRow: false }).game).find('button').exists()).toBe(false);
  });

  it('appears once the member row applies', async () => {
    const s = setup({ memberRow: false });
    const w = mountSwitch(s.game);
    expect(w.find('button').exists()).toBe(false);
    s.members.value = [{ id: 11n, groupId: 5n, characterId: ME, followLeader: true }];
    await nextTick();
    expect(w.find('button').exists()).toBe(true);
  });

  it('with the inert default hub renders nothing', () => {
    wrapper = mount(TravelSwitch);
    expect(wrapper.find('button').exists()).toBe(false);
  });
});

describe('TravelSwitch state', () => {
  it('on: a switch role, aria-checked true, title and the linked sub-line', () => {
    const w = mountSwitch(setup().game);
    const button = w.get('button');
    expect(button.attributes('type')).toBe('button');
    expect(button.attributes('role')).toBe('switch');
    expect(button.attributes('aria-checked')).toBe('true');
    expect(w.text()).toContain('Travel with leader');
    const sub = w.get('.sub');
    expect(sub.text()).toBe('On · you move when Ann travels');
    expect(sub.attributes('id')).toBeTruthy();
    expect(button.attributes('aria-describedby')).toBe(sub.attributes('id'));
  });

  it('off: aria-checked false and the stay-put sub-line', () => {
    const w = mountSwitch(setup({ followLeader: false }).game);
    expect(w.get('button').attributes('aria-checked')).toBe('false');
    expect(w.get('.sub').text()).toBe('Off · you stay put when Ann travels');
  });

  it('shows the leader name as text, never markup', () => {
    const s = setup();
    (s.game.knownCharacters as unknown as { value: unknown }).value = [{ id: LEADER, name: '<img src=x onerror=alert(1)>' }];
    const w = mountSwitch(s.game);
    expect(w.find('img').exists()).toBe(false);
    expect(w.get('.sub').text()).toContain('<img src=x onerror=alert(1)>');
  });

  it('the sheet variant carries the sheet class', () => {
    const w = mountSwitch(setup().game, { variant: 'sheet' });
    expect(w.get('button').classes()).toContain('sheet');
    wrapper?.unmount();
    const rail = mountSwitch(setup().game);
    expect(rail.get('button').classes()).not.toContain('sheet');
  });
});

describe('TravelSwitch clicks', () => {
  it('sends setFollowLeader once with the opposite value and does not flip by itself', async () => {
    const s = setup({ hold: true });
    const w = mountSwitch(s.game);
    await w.get('button').trigger('click');
    expect(s.setFollowLeader).toHaveBeenCalledTimes(1);
    expect(s.setFollowLeader).toHaveBeenCalledWith({ characterId: ME, follow: false });
    expect(w.get('button').attributes('aria-checked')).toBe('true');
    // A second click while pending sends nothing.
    await w.get('button').trigger('click');
    expect(s.setFollowLeader).toHaveBeenCalledTimes(1);
    expect(w.get('button').attributes('aria-disabled')).toBe('true');
    s.release();
    await flushPromises();
    // Settled, but the row has not changed: still on.
    expect(w.get('button').attributes('aria-checked')).toBe('true');
    expect(w.get('button').attributes('aria-disabled')).toBeUndefined();
  });

  it('follows the member row when the server changes it', async () => {
    const s = setup();
    const w = mountSwitch(s.game);
    await w.get('button').trigger('click');
    await flushPromises();
    s.members.value = [{ id: 11n, groupId: 5n, characterId: ME, followLeader: false }];
    await nextTick();
    expect(w.get('button').attributes('aria-checked')).toBe('false');
    await w.get('button').trigger('click');
    await flushPromises();
    expect(s.setFollowLeader).toHaveBeenLastCalledWith({ characterId: ME, follow: true });
  });

  it('offline: aria-disabled true and a click sends nothing', async () => {
    const s = setup({ connected: false });
    const w = mountSwitch(s.game);
    expect(w.get('button').attributes('aria-disabled')).toBe('true');
    await w.get('button').trigger('click');
    expect(s.setFollowLeader).not.toHaveBeenCalled();
  });

  it('a rejected call writes the shared send error line to the feed once (review WR-01)', async () => {
    const s = setup();
    s.setFollowLeader.mockImplementationOnce(() => Promise.reject(new Error('refused')));
    const append = vi.spyOn(s.game.feed, 'appendLocal');
    const w = mountSwitch(s.game);
    await w.get('button').trigger('click');
    await flushPromises();
    expect(append).toHaveBeenCalledTimes(1);
    expect(append).toHaveBeenCalledWith('system', SEND_ERROR_TEXT);
  });

  it('an online switch is not aria-disabled', () => {
    expect(mountSwitch(setup().game).get('button').attributes('aria-disabled')).toBeUndefined();
  });
});

describe('TravelSwitch name (review IN-05)', () => {
  it('is named by the title only and described by the sub-line', () => {
    const w = mountSwitch(setup().game);
    const button = w.get('button');
    const labelledBy = button.attributes('aria-labelledby');
    expect(labelledBy).toBeTruthy();
    expect(labelledBy).toBe(w.get('.title').attributes('id'));
    expect(w.get('.title').text()).toBe('Travel with leader');
    expect(button.attributes('aria-describedby')).toBe(w.get('.sub').attributes('id'));
    expect(button.attributes('aria-labelledby')).not.toBe(button.attributes('aria-describedby'));
  });
});

describe('TravelSwitch source', () => {
  const text = readFileSync(resolve(process.cwd(), 'src/social/TravelSwitch.vue'), 'utf8');

  it('goes through the party actions layer, not the reducer directly', () => {
    expect(text).toContain('setTravelWithLeader(');
    expect(text).not.toContain('setFollowLeader(');
  });

  it('has no optimistic local state for the flag', () => {
    expect(text).not.toMatch(/ref\(\s*(true|false)\s*\)/);
  });

  it('moves the knob with a 120ms left transition, none under reduced motion', () => {
    expect(text).toMatch(/transition:\s*left 120ms/);
    expect(text).toMatch(/@media \(prefers-reduced-motion: reduce\)[^}]*\{[^}]*transition:\s*none/);
  });

  it('keeps the focus ring (no outline removal) and draws the 32 x 16 track with a 12px knob', () => {
    expect(text).not.toMatch(/outline:\s*(none|0)/);
    expect(text).toMatch(/width:\s*32px/);
    expect(text).toMatch(/height:\s*16px/);
    expect(text).toMatch(/width:\s*12px/);
    expect(text).toContain('left: 18px');
    expect(text).toContain('min-height: 44px');
  });

  it('colours the on and off states by token', () => {
    expect(text).toContain('var(--color-accent-800)');
    expect(text).toContain('var(--color-accent-200)');
    expect(text).toContain('var(--color-neutral-900)');
    expect(text).toContain('var(--color-neutral-700)');
    expect(text).toContain('var(--color-neutral-500)');
  });
});
