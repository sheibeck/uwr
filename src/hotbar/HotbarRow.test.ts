// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { nextTick, ref } from 'vue';
import type { Ref } from 'vue';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { mount, type VueWrapper } from '@vue/test-utils';
import HotbarRow from './HotbarRow.vue';
import FeedShell from '../frame/FeedShell.vue';
import { FRAME_KEY, GAME_KEY, createInertFrame, createInertGame } from '../game/context';
import type { FrameControls, GameData, GameReducers } from '../game/context';

const PAYLOAD = '<img src=x onerror=alert(1)>';
const CHARACTER_ID = 7n;
const SECOND = 1_000_000;

let wrapper: VueWrapper | null = null;
let clockNow = 1_000 * SECOND;

beforeEach(() => {
  vi.useFakeTimers();
  clockNow = 1_000 * SECOND;
});

afterEach(() => {
  wrapper?.unmount();
  wrapper = null;
  document.body.innerHTML = '';
  vi.useRealTimers();
});

function ability(id: bigint, name: string, kind = 'damage', extra: Record<string, unknown> = {}) {
  return {
    id,
    characterId: CHARACTER_ID,
    name,
    kind,
    resourceType: 'mana',
    resourceCost: 10n,
    cooldownSeconds: 6n,
    ...extra,
  };
}

function hotbar(id: bigint, name: string, sortOrder: number, isActive: boolean) {
  return { id, characterId: CHARACTER_ID, name, sortOrder, isActive };
}

function slotRow(hotbarId: bigint, slot: number, abilityTemplateId: bigint) {
  return { id: BigInt(slot) + hotbarId * 100n, characterId: CHARACTER_ID, hotbarId, slot, abilityTemplateId };
}

function cooldown(abilityTemplateId: bigint, startedAt: number, durationSeconds: number) {
  return {
    id: abilityTemplateId,
    characterId: CHARACTER_ID,
    abilityTemplateId,
    startedAtMicros: BigInt(startedAt),
    durationMicros: BigInt(durationSeconds * SECOND),
  };
}

interface Setup {
  wrapper: VueWrapper;
  useAbility: ReturnType<typeof vi.fn>;
  switchHotbar: ReturnType<typeof vi.fn>;
  connected: Ref<boolean>;
  activeScreen: Ref<any>;
  isDesktop: Ref<boolean>;
  cooldowns: Ref<any[]>;
  hotbars: Ref<any[]>;
  character: Ref<any>;
}

interface Options {
  desktop?: boolean;
  connected?: boolean;
  hotbars?: any[];
  slots?: any[];
  abilities?: any[];
  cooldowns?: any[];
  character?: any;
  useAbility?: ReturnType<typeof vi.fn>;
}

const DEFAULT_HOTBARS = [hotbar(1n, 'Combat', 0, true), hotbar(2n, 'Travel', 1, false), hotbar(3n, 'Craft', 2, false)];
const DEFAULT_ABILITIES = [
  ability(11n, 'Firebolt', 'damage'),
  ability(12n, 'Mend', 'heal'),
  ability(13n, 'Sprint', 'travel', { resourceType: 'stamina' }),
];
const DEFAULT_SLOTS = [slotRow(1n, 1, 11n), slotRow(1n, 2, 12n), slotRow(1n, 10, 13n)];

function setup(opts: Options = {}): Setup {
  const connected = ref(opts.connected ?? true);
  const activeScreen = ref<any>(null);
  const isDesktop = ref(opts.desktop ?? true);
  const hotbars = ref<any[]>(opts.hotbars ?? DEFAULT_HOTBARS);
  const cooldowns = ref<any[]>(opts.cooldowns ?? []);
  const character = ref<any>(opts.character ?? { id: CHARACTER_ID, hp: 100n, mana: 50n, stamina: 50n });
  const useAbility = opts.useAbility ?? vi.fn(() => Promise.resolve());
  const switchHotbar = vi.fn(() => Promise.resolve());
  const reducers = { useAbility, switchHotbar } as unknown as GameReducers;
  const base = createInertGame();
  const game = {
    ...base,
    connected,
    character,
    characterId: ref<bigint | null>(CHARACTER_ID),
    hotbars,
    hotbarSlots: ref<any[]>(opts.slots ?? DEFAULT_SLOTS),
    abilities: ref<any[]>(opts.abilities ?? DEFAULT_ABILITIES),
    abilityCooldowns: cooldowns,
    clock: { ...base.clock, nowMicros: () => clockNow },
    reducers: { get value() { return connected.value ? reducers : null; } },
  } as unknown as GameData;
  const frame = { ...createInertFrame(), isDesktop, activeScreen } as unknown as FrameControls;
  const el = document.createElement('div');
  document.body.appendChild(el);
  const w = mount(HotbarRow, {
    attachTo: el,
    global: { provide: { [GAME_KEY as symbol]: game, [FRAME_KEY as symbol]: frame } },
  });
  wrapper = w;
  return { wrapper: w, useAbility, switchHotbar, connected, activeScreen, isDesktop, cooldowns, hotbars, character };
}

function slots(w: VueWrapper) {
  return w.findAll('button.slot');
}

// The sweep's remaining share (full at the start). The conic-gradient itself is set as an inline
// style, which happy-dom cannot parse (color-mix inside conic-gradient), so the share is also
// exposed as data-percent.
function sweep(slot: ReturnType<typeof slots>[number]): string {
  return slot.get('.sweep').attributes('data-percent') ?? '';
}

function press(key: string, init: KeyboardEventInit = {}, target: EventTarget = document.body): void {
  target.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, ...init }));
}

async function advance(ms: number, microsPerMs = 1000): Promise<void> {
  clockNow += ms * microsPerMs;
  vi.advanceTimersByTime(ms);
  await nextTick();
}

describe('HotbarRow slots', () => {
  it('renders ten slots keyed 1..9 then 0 with icons and names', () => {
    const s = setup();
    const all = slots(s.wrapper);
    expect(all).toHaveLength(10);
    expect(all.map((slot) => slot.get('.slot-key').text())).toEqual(['1', '2', '3', '4', '5', '6', '7', '8', '9', '0']);
    expect(all[0].find('svg').exists()).toBe(true);
    expect(all[0].get('.slot-name').text()).toBe('Firebolt');
    expect(all[0].attributes('aria-label')).toBe('Firebolt, key 1');
    expect(all[0].attributes('title')).toBe('Firebolt · 10 mana · 6s');
    expect(all[9].get('.slot-name').text()).toBe('Sprint');
    expect(all[9].attributes('aria-label')).toBe('Sprint, key 0');
    // different kinds draw different icons
    expect(all[0].get('svg').html()).not.toBe(all[1].get('svg').html());
  });

  it('empty slots show only the key and do nothing', async () => {
    const s = setup();
    const empty = slots(s.wrapper)[3];
    expect(empty.find('svg').exists()).toBe(false);
    expect(empty.find('.slot-name').exists()).toBe(false);
    expect(empty.text()).toBe('4');
    expect(empty.attributes('aria-disabled')).toBe('true');
    expect(empty.attributes('aria-label')).toBe('Empty slot 4');
    await empty.trigger('click');
    press('4');
    expect(s.useAbility).not.toHaveBeenCalled();
  });

  it('clicking a ready slot calls useAbility once and shows pressed until it settles', async () => {
    let resolve: () => void = () => {};
    const useAbility = vi.fn(() => new Promise<void>((r) => { resolve = r; }));
    const s = setup({ useAbility });
    const first = slots(s.wrapper)[0];
    expect(first.attributes('aria-disabled')).toBeUndefined();
    await first.trigger('click');
    expect(useAbility).toHaveBeenCalledTimes(1);
    expect(useAbility).toHaveBeenCalledWith({ characterId: CHARACTER_ID, abilityTemplateId: 11n });
    expect(first.classes()).toContain('pressed');
    await first.trigger('click');
    expect(useAbility).toHaveBeenCalledTimes(1);
    resolve();
    await vi.advanceTimersByTimeAsync(0);
    expect(first.classes()).not.toContain('pressed');
  });

  it('logs a failed call and clears pressed', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const useAbility = vi.fn(() => Promise.reject(new Error('refused')));
    const s = setup({ useAbility });
    await slots(s.wrapper)[0].trigger('click');
    await vi.advanceTimersByTimeAsync(0);
    expect(warn).toHaveBeenCalled();
    expect(slots(s.wrapper)[0].classes()).not.toContain('pressed');
    warn.mockRestore();
  });

  it('unaffordable abilities dim the icon but still fire', async () => {
    const s = setup({
      character: { id: CHARACTER_ID, hp: 100n, mana: 5n, stamina: 50n },
    });
    const first = slots(s.wrapper)[0];
    expect(first.get('svg').classes()).toContain('unaffordable');
    expect(slots(s.wrapper)[9].get('svg').classes()).not.toContain('unaffordable');
    await first.trigger('click');
    expect(s.useAbility).toHaveBeenCalledTimes(1);
  });

  it('renders hostile ability names as text', () => {
    const s = setup({ abilities: [ability(11n, PAYLOAD), ability(12n, 'Mend'), ability(13n, 'Sprint')] });
    expect(s.wrapper.find('img').exists()).toBe(false);
    expect(slots(s.wrapper)[0].get('.slot-name').text()).toBe(PAYLOAD);
    expect(slots(s.wrapper)[0].attributes('title')).toContain(PAYLOAD);
    expect(slots(s.wrapper)[0].attributes('aria-label')).toBe(`${PAYLOAD}, key 1`);
  });

  it('shows No hotbar yet. with no hotbar rows', () => {
    const s = setup({ hotbars: [], slots: [] });
    expect(s.wrapper.get('.no-hotbar').text()).toBe('No hotbar yet.');
    expect(slots(s.wrapper)).toHaveLength(0);
    expect(s.wrapper.find('button').exists()).toBe(false);
  });
});

describe('HotbarRow cooldowns', () => {
  it('shows the sweep, seconds and ready label, ignores input, then becomes ready with one flash', async () => {
    const s = setup({ cooldowns: [cooldown(11n, clockNow, 12)] });
    const first = slots(s.wrapper)[0];
    expect(first.classes()).toContain('cooling');
    expect(first.attributes('aria-disabled')).toBe('true');
    expect(first.attributes('aria-label')).toBe('Firebolt, key 1, ready in 12 seconds');
    expect(first.get('.slot-seconds').text()).toBe('12');
    expect(sweep(first)).toBe('100%');
    expect(first.get('.slot-icon').classes()).toContain('dim');
    expect(first.get('.slot-name').classes()).toContain('dim');

    await first.trigger('click');
    press('1');
    expect(s.useAbility).not.toHaveBeenCalled();

    await advance(6000);
    expect(first.get('.slot-seconds').text()).toBe('6');
    expect(sweep(first)).toBe('50%');

    await advance(5999);
    expect(first.classes()).toContain('cooling');
    expect(first.get('.slot-seconds').text()).toBe('1');
    expect(first.attributes('aria-label')).toBe('Firebolt, key 1, ready in 1 second');

    await advance(1);
    expect(first.classes()).not.toContain('cooling');
    expect(first.attributes('aria-disabled')).toBeUndefined();
    expect(first.find('.slot-seconds').exists()).toBe(false);
    expect(first.classes()).toContain('ready-flash');

    await advance(240);
    expect(first.classes()).not.toContain('ready-flash');
    await first.trigger('click');
    expect(s.useAbility).toHaveBeenCalledTimes(1);
  });

  it('stops the ticker once nothing is cooling and starts it when a cooldown appears', async () => {
    const s = setup({ cooldowns: [cooldown(11n, clockNow, 1)] });
    expect(vi.getTimerCount()).toBe(1);
    await advance(1000);
    await advance(240); // the ready flash timer
    expect(vi.getTimerCount()).toBe(0);
    s.cooldowns.value = [cooldown(11n, clockNow, 5)];
    await nextTick();
    expect(vi.getTimerCount()).toBeGreaterThanOrEqual(1);
    expect(slots(s.wrapper)[0].classes()).toContain('cooling');
  });

  it('runs no ticker with no cooldowns', () => {
    setup();
    expect(vi.getTimerCount()).toBe(0);
  });

  it('clamps rows past their end and rows skewed into the future', () => {
    const past = setup({ cooldowns: [cooldown(11n, clockNow - 100 * SECOND, 5)] });
    expect(slots(past.wrapper)[0].classes()).not.toContain('cooling');
    expect(slots(past.wrapper)[0].attributes('aria-disabled')).toBeUndefined();
    past.wrapper.unmount();
    const future = setup({ cooldowns: [cooldown(11n, clockNow + 1000 * SECOND, 5)] });
    const first = slots(future.wrapper)[0];
    expect(first.classes()).toContain('cooling');
    expect(first.get('.slot-seconds').text()).toBe('5');
    expect(sweep(first)).toBe('100%');
  });

  it('uses the later-ending row per ability and formats minutes and hours', () => {
    const s = setup({
      cooldowns: [cooldown(11n, clockNow - 10 * SECOND, 20), cooldown(11n, clockNow, 125), cooldown(12n, clockNow, 7200)],
    });
    expect(slots(s.wrapper)[0].get('.slot-seconds').text()).toBe('2m');
    expect(slots(s.wrapper)[1].get('.slot-seconds').text()).toBe('2h');
  });

  it('ignores cooldown rows of other characters', () => {
    const other = { ...cooldown(11n, clockNow, 30), characterId: 99n };
    const s = setup({ cooldowns: [other] });
    expect(slots(s.wrapper)[0].classes()).not.toContain('cooling');
  });

  it('adds no ready flash under reduced motion', async () => {
    vi.stubGlobal('matchMedia', undefined);
    const original = window.matchMedia;
    window.matchMedia = ((query: string) => ({ matches: query.includes('reduce') })) as unknown as typeof window.matchMedia;
    try {
      const s = setup({ cooldowns: [cooldown(11n, clockNow, 1)] });
      await advance(1000, 1000);
      await advance(1000);
      expect(slots(s.wrapper)[0].classes()).not.toContain('ready-flash');
      expect(slots(s.wrapper)[0].classes()).not.toContain('cooling');
    } finally {
      window.matchMedia = original;
      vi.unstubAllGlobals();
    }
  });
});

describe('HotbarRow number keys', () => {
  it('1 uses slot 1 and 0 uses slot 10', () => {
    const s = setup();
    press('1');
    expect(s.useAbility).toHaveBeenLastCalledWith({ characterId: CHARACTER_ID, abilityTemplateId: 11n });
    press('0');
    expect(s.useAbility).toHaveBeenLastCalledWith({ characterId: CHARACTER_ID, abilityTemplateId: 13n });
    expect(s.useAbility).toHaveBeenCalledTimes(2);
  });

  it('ignores every other key', () => {
    const s = setup({
      slots: [...DEFAULT_SLOTS, slotRow(1n, 3, 11n)],
    });
    for (const key of ['a', 'Enter', '-', '11', '', 'Digit1', '!', ' ']) press(key);
    expect(s.useAbility).not.toHaveBeenCalled();
  });

  it('is ignored while an input, textarea, select or contenteditable has focus', () => {
    const s = setup();
    const tags = ['input', 'textarea', 'select'];
    for (const tag of tags) {
      const field = document.createElement(tag);
      document.body.appendChild(field);
      field.focus();
      press('1', {}, field);
      field.remove();
    }
    const editable = document.createElement('div');
    editable.setAttribute('contenteditable', 'true');
    editable.tabIndex = 0;
    document.body.appendChild(editable);
    editable.focus();
    press('1', {}, editable);
    editable.remove();
    expect(s.useAbility).not.toHaveBeenCalled();
    // with nothing focused it works again
    press('1');
    expect(s.useAbility).toHaveBeenCalledTimes(1);
  });

  it('works with a button focused', () => {
    const s = setup();
    const button = document.createElement('button');
    document.body.appendChild(button);
    button.focus();
    press('1', {}, button);
    expect(s.useAbility).toHaveBeenCalledTimes(1);
  });

  it('is ignored with ctrl, meta or alt, and on key repeat', () => {
    const s = setup();
    press('1', { ctrlKey: true });
    press('1', { metaKey: true });
    press('1', { altKey: true });
    press('1', { repeat: true });
    expect(s.useAbility).not.toHaveBeenCalled();
  });

  it('is ignored while a drawer or sheet is open', async () => {
    const s = setup();
    s.activeScreen.value = 'map';
    await nextTick();
    press('1');
    expect(s.useAbility).not.toHaveBeenCalled();
    s.activeScreen.value = null;
    await nextTick();
    press('1');
    expect(s.useAbility).toHaveBeenCalledTimes(1);
  });

  it('is ignored offline and the row looks disconnected', async () => {
    const s = setup({ connected: false });
    press('1');
    await slots(s.wrapper)[0].trigger('click');
    expect(s.useAbility).not.toHaveBeenCalled();
    expect(s.wrapper.get('.hotbar-row').classes()).toContain('disconnected');
    for (const slot of slots(s.wrapper)) expect(slot.attributes('aria-disabled')).toBe('true');
    s.connected.value = true;
    await nextTick();
    expect(s.wrapper.get('.hotbar-row').classes()).not.toContain('disconnected');
    press('1');
    expect(s.useAbility).toHaveBeenCalledTimes(1);
  });

  it('is ignored while the slot is cooling and works the instant it is ready', async () => {
    const s = setup({ cooldowns: [cooldown(11n, clockNow, 2)] });
    press('1');
    await advance(1999);
    press('1');
    expect(s.useAbility).not.toHaveBeenCalled();
    await advance(1);
    press('1');
    expect(s.useAbility).toHaveBeenCalledTimes(1);
  });

  it('stops listening after unmount', () => {
    const s = setup();
    s.wrapper.unmount();
    wrapper = null;
    press('1');
    expect(s.useAbility).not.toHaveBeenCalled();
  });
});

describe('HotbarRow selector', () => {
  it('shows the active hotbar name and position and switches by name', async () => {
    const s = setup();
    expect(s.wrapper.get('.label-name').text()).toBe('Combat');
    expect(s.wrapper.get('.label-position').text()).toBe('1/3');
    await s.wrapper.get('button[aria-label="Next hotbar"]').trigger('click');
    expect(s.switchHotbar).toHaveBeenCalledWith({ characterId: CHARACTER_ID, hotbarName: 'Travel' });
    await s.wrapper.get('button[aria-label="Previous hotbar"]').trigger('click');
    expect(s.switchHotbar).toHaveBeenLastCalledWith({ characterId: CHARACTER_ID, hotbarName: 'Craft' });
  });

  it('follows the isActive flag and orders by sortOrder', () => {
    const s = setup({
      hotbars: [hotbar(3n, 'Craft', 2, false), hotbar(1n, 'Combat', 0, false), hotbar(2n, 'Travel', 1, true)],
    });
    expect(s.wrapper.get('.label-name').text()).toBe('Travel');
    expect(s.wrapper.get('.label-position').text()).toBe('2/3');
  });

  it('disables the selector with one hotbar and offline', async () => {
    const one = setup({ hotbars: [hotbar(1n, 'Combat', 0, true)] });
    for (const caret of one.wrapper.findAll('button.caret')) expect(caret.attributes('disabled')).toBeDefined();
    one.wrapper.unmount();
    const offline = setup({ connected: false });
    for (const caret of offline.wrapper.findAll('button.caret')) expect(caret.attributes('disabled')).toBeDefined();
  });

  it('uses the single cycle button on mobile', async () => {
    const s = setup({ desktop: false });
    expect(s.wrapper.findAll('button.caret')).toHaveLength(0);
    const cycle = s.wrapper.get('button.selector-mobile');
    expect(cycle.attributes('aria-label')).toBe('Hotbar Combat, 1 of 3. Switch to next hotbar.');
    await cycle.trigger('click');
    expect(s.switchHotbar).toHaveBeenCalledWith({ characterId: CHARACTER_ID, hotbarName: 'Travel' });
  });
});

describe('HotbarRow source and mounting', () => {
  const read = (path: string): string => readFileSync(resolve(process.cwd(), path), 'utf8');

  it('declares the contract markers', () => {
    const source = read('src/hotbar/HotbarRow.vue');
    for (const marker of ['useAbility({', 'switchHotbar({', 'No hotbar yet.', 'conic-gradient', 'prefers-reduced-motion']) {
      expect(source).toContain(marker);
    }
  });

  it('FeedShell renders HotbarRow before the composer input', () => {
    const w = mount(FeedShell);
    wrapper = w;
    const section = w.get('section.composer');
    const children = Array.from(section.element.children);
    expect(children[0].classList.contains('hotbar-row')).toBe(true);
    expect(children[1].classList.contains('composer-box')).toBe(true);
    expect(read('src/frame/FeedShell.vue')).toContain('HotbarRow');
    // inert game: no hotbar rows
    expect(section.text()).toContain('No hotbar yet.');
  });
});
