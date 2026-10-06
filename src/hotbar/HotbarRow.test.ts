// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { nextTick, ref } from 'vue';
import type { Ref } from 'vue';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { mount, type VueWrapper } from '@vue/test-utils';
import HotbarRow from './HotbarRow.vue';
import FeedShell from '../frame/FeedShell.vue';
import { COMBAT_KEY, FRAME_KEY, GAME_KEY, createInertCombat, createInertFrame, createInertGame } from '../game/context';
import type { CombatController, FrameControls, GameData, GameReducers } from '../game/context';

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
    castSeconds: 0n,
    description: `${name} description.`,
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

function roundCooldownRow(abilityTemplateId: bigint, roundsRemaining: bigint) {
  // The wall-clock fields are far in the past and zero: in combat they are ignored anyway.
  return { ...cooldown(abilityTemplateId, 0, 0), roundsRemaining };
}

interface CombatSetup {
  active: Ref<boolean>;
  ownAction: Ref<any>;
  resolving: Ref<boolean>;
  down: Ref<boolean>;
  allyArgFor: ReturnType<typeof vi.fn>;
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
  combat: CombatSetup;
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
  combat?: { active?: boolean; ownAction?: any; resolving?: boolean; down?: boolean; allyArg?: bigint };
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
  const combat: CombatSetup = {
    active: ref(opts.combat?.active ?? false),
    ownAction: ref<any>(opts.combat?.ownAction ?? null),
    resolving: ref(opts.combat?.resolving ?? false),
    down: ref(opts.combat?.down ?? false),
    allyArgFor: vi.fn(() => opts.combat?.allyArg),
  };
  const controller = {
    ...createInertCombat(),
    resolving: combat.resolving,
    down: combat.down,
    allyArgFor: combat.allyArgFor,
  } as unknown as CombatController;
  const game = {
    ...base,
    combat: { ...base.combat, active: combat.active, ownAction: combat.ownAction },
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
    global: { provide: { [GAME_KEY as symbol]: game, [FRAME_KEY as symbol]: frame, [COMBAT_KEY as symbol]: controller } },
  });
  wrapper = w;
  return { wrapper: w, useAbility, switchHotbar, connected, activeScreen, isDesktop, cooldowns, hotbars, character, combat };
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
    // the native title is gone: the popover and aria-describedby carry the details
    expect(all[0].attributes('title')).toBeUndefined();
    expect(all[0].attributes('aria-describedby')).toBeTruthy();
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
    expect(slots(s.wrapper)[0].attributes('title')).toBeUndefined();
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

function ownAbility(abilityTemplateId: bigint, roundNumber = 3n, actionType = 'ability') {
  return { id: 1n, combatId: 1n, characterId: CHARACTER_ID, roundNumber, actionType, abilityTemplateId };
}

describe('HotbarRow rounds cooldowns in combat', () => {
  it('counts rounds, ignores the wall clock, and does nothing on click or key', async () => {
    // A 12 s ability lasts 3 rounds, so 2 remaining sweeps at 66.7%.
    const s = setup({
      combat: { active: true },
      cooldowns: [roundCooldownRow(11n, 2n)],
      abilities: [ability(11n, 'Firebolt', 'damage', { cooldownSeconds: 12n }), ...DEFAULT_ABILITIES.slice(1)],
    });
    const first = slots(s.wrapper)[0];
    expect(first.classes()).toContain('cooling');
    expect(first.get('.slot-rounds').text()).toBe('2 rounds');
    expect(first.find('.slot-seconds').exists()).toBe(false);
    expect(first.attributes('aria-disabled')).toBe('true');
    expect(first.attributes('aria-label')).toBe('Firebolt, key 1, ready in 2 rounds');
    expect(sweep(first)).toBe('66.7%');
    expect(first.get('.slot-icon').classes()).toContain('dim');
    expect(first.get('.slot-name').classes()).toContain('dim');
    await first.trigger('click');
    press('1');
    expect(s.useAbility).not.toHaveBeenCalled();
  });

  it('reads 1 round, and a ready slot with a future wall-clock end is usable', async () => {
    const s = setup({ combat: { active: true }, cooldowns: [roundCooldownRow(11n, 1n)] });
    const first = slots(s.wrapper)[0];
    expect(first.get('.slot-rounds').text()).toBe('1 round');
    expect(first.attributes('aria-label')).toBe('Firebolt, key 1, ready in 1 round');
    // roundsRemaining 0 with a wall-clock end far in the future: ready
    s.cooldowns.value = [{ ...cooldown(11n, clockNow, 600), roundsRemaining: 0n }];
    await nextTick();
    expect(first.classes()).not.toContain('cooling');
    expect(first.find('.slot-rounds').exists()).toBe(false);
    expect(first.attributes('aria-disabled')).toBeUndefined();
    expect(first.attributes('aria-label')).toBe('Firebolt, key 1');
    await first.trigger('click');
    expect(s.useAbility).toHaveBeenCalledTimes(1);
  });

  it('runs no ticker for round-only cooldowns', () => {
    const s = setup({ combat: { active: true }, cooldowns: [{ ...cooldown(11n, clockNow, 600), roundsRemaining: 0n }] });
    expect(vi.getTimerCount()).toBe(0);
    expect(slots(s.wrapper)[0].classes()).not.toContain('cooling');
  });

  it('flashes once when the rounds reach 0, and not under reduced motion', async () => {
    const s = setup({ combat: { active: true }, cooldowns: [roundCooldownRow(11n, 1n)] });
    const first = slots(s.wrapper)[0];
    s.cooldowns.value = [roundCooldownRow(11n, 0n)];
    await nextTick();
    expect(first.classes()).not.toContain('cooling');
    expect(first.classes()).toContain('ready-flash');
    await advance(240);
    expect(first.classes()).not.toContain('ready-flash');
    s.wrapper.unmount();
    wrapper = null;

    const original = window.matchMedia;
    window.matchMedia = ((query: string) => ({ matches: query.includes('reduce') })) as unknown as typeof window.matchMedia;
    try {
      const calm = setup({ combat: { active: true }, cooldowns: [roundCooldownRow(11n, 1n)] });
      calm.cooldowns.value = [roundCooldownRow(11n, 0n)];
      await nextTick();
      expect(slots(calm.wrapper)[0].classes()).not.toContain('ready-flash');
    } finally {
      window.matchMedia = original;
    }
  });

  it('does not flash a slot when combat starts and its wall-clock cooldown becomes a rounds count of 0', async () => {
    // 12 s of wall-clock cooldown left out of combat; in combat the same row has 0 rounds.
    const s = setup({
      combat: { active: false },
      cooldowns: [{ ...cooldown(11n, clockNow, 12), roundsRemaining: 0n }],
    });
    const first = slots(s.wrapper)[0];
    expect(first.classes()).toContain('cooling');
    s.combat.active.value = true;
    await nextTick();
    expect(first.classes()).not.toContain('cooling');
    expect(first.classes()).not.toContain('ready-flash');
    await advance(240);
    expect(first.classes()).not.toContain('ready-flash');
  });

  it('does not flash a slot when combat ends and its rounds count becomes a wall-clock 0', async () => {
    const s = setup({ combat: { active: true }, cooldowns: [roundCooldownRow(11n, 2n)] });
    const first = slots(s.wrapper)[0];
    expect(first.classes()).toContain('cooling');
    s.combat.active.value = false;
    await nextTick();
    expect(first.classes()).not.toContain('cooling');
    expect(first.classes()).not.toContain('ready-flash');
  });

  it('still flashes a real completion after switching modes', async () => {
    const s = setup({ combat: { active: false }, cooldowns: [{ ...cooldown(11n, clockNow, 12), roundsRemaining: 2n }] });
    const first = slots(s.wrapper)[0];
    s.combat.active.value = true;
    await nextTick();
    expect(first.classes()).toContain('cooling');
    expect(first.classes()).not.toContain('ready-flash');
    s.cooldowns.value = [roundCooldownRow(11n, 0n)];
    await nextTick();
    expect(first.classes()).toContain('ready-flash');
  });

  it('goes inert while the round resolves or the player is down', async () => {
    const s = setup({ combat: { active: true, resolving: true } });
    for (const slot of slots(s.wrapper)) {
      expect(slot.attributes('aria-disabled')).toBe('true');
      expect(slot.classes()).toContain('inert');
    }
    await slots(s.wrapper)[0].trigger('click');
    press('1');
    expect(s.useAbility).not.toHaveBeenCalled();
    s.combat.resolving.value = false;
    await nextTick();
    expect(slots(s.wrapper)[0].classes()).not.toContain('inert');
    expect(slots(s.wrapper)[0].attributes('aria-disabled')).toBeUndefined();
    s.combat.down.value = true;
    await nextTick();
    expect(slots(s.wrapper)[0].classes()).toContain('inert');
    press('1');
    await slots(s.wrapper)[1].trigger('click');
    expect(s.useAbility).not.toHaveBeenCalled();
    s.combat.down.value = false;
    await nextTick();
    press('1');
    expect(s.useAbility).toHaveBeenCalledTimes(1);
  });

  it('is never inert out of combat, whatever the controller says', () => {
    const s = setup({ combat: { active: false, resolving: true, down: true } });
    expect(slots(s.wrapper)[0].classes()).not.toContain('inert');
    expect(slots(s.wrapper)[0].attributes('aria-disabled')).toBeUndefined();
    press('1');
    expect(s.useAbility).toHaveBeenCalledTimes(1);
  });

  it('keeps the disabled treatment when the connection drops mid-fight', async () => {
    const s = setup({ combat: { active: true } });
    s.connected.value = false;
    await nextTick();
    expect(s.wrapper.get('.hotbar-row').classes()).toContain('disconnected');
    for (const slot of slots(s.wrapper)) expect(slot.attributes('aria-disabled')).toBe('true');
    press('1');
    await slots(s.wrapper)[0].trigger('click');
    expect(s.useAbility).not.toHaveBeenCalled();
  });

  it('keeps the seconds display out of combat even with a rounds value on the row', () => {
    const s = setup({ cooldowns: [{ ...cooldown(11n, clockNow, 12), roundsRemaining: 3n }] });
    const first = slots(s.wrapper)[0];
    expect(first.get('.slot-seconds').text()).toBe('12');
    expect(first.find('.slot-rounds').exists()).toBe(false);
    expect(first.attributes('aria-label')).toBe('Firebolt, key 1, ready in 12 seconds');
  });
});

describe('HotbarRow chosen slot and ally argument', () => {
  it('marks the slot of the open round choice from the server row', async () => {
    const s = setup({ combat: { active: true, ownAction: ownAbility(11n) } });
    const all = slots(s.wrapper);
    expect(all[0].classes()).toContain('chosen');
    expect(all[0].attributes('aria-pressed')).toBe('true');
    expect(all[0].attributes('aria-label')).toBe('Firebolt, key 1, chosen');
    expect(all[1].classes()).not.toContain('chosen');
    expect(all[1].attributes('aria-pressed')).toBeUndefined();
    expect(all[1].attributes('aria-label')).toBe('Mend, key 2');
    // a replacing choice moves the mark
    s.combat.ownAction.value = ownAbility(12n);
    await nextTick();
    expect(all[0].classes()).not.toContain('chosen');
    expect(all[1].classes()).toContain('chosen');
    // the next round clears it
    s.combat.ownAction.value = null;
    await nextTick();
    for (const slot of all) {
      expect(slot.classes()).not.toContain('chosen');
      expect(slot.attributes('aria-pressed')).toBeUndefined();
    }
  });

  it('does not mark a slot for no row, an auto_attack row or a flee row', () => {
    const actions = [null, ownAbility(11n, 3n, 'auto_attack'), { ...ownAbility(11n, 3n, 'flee'), abilityTemplateId: undefined }];
    for (const action of actions) {
      const s = setup({ combat: { active: true, ownAction: action } });
      for (const slot of slots(s.wrapper)) expect(slot.classes()).not.toContain('chosen');
      s.wrapper.unmount();
      wrapper = null;
    }
  });

  it('never marks a slot from a click alone: only the 47 pressed state covers the wait', async () => {
    let resolve: () => void = () => {};
    const useAbility = vi.fn(() => new Promise<void>((r) => { resolve = r; }));
    const s = setup({ combat: { active: true }, useAbility });
    const first = slots(s.wrapper)[0];
    await first.trigger('click');
    expect(first.classes()).toContain('pressed');
    expect(first.classes()).not.toContain('chosen');
    expect(first.attributes('aria-pressed')).toBeUndefined();
    resolve();
    await vi.advanceTimersByTimeAsync(0);
  });

  it('marks nothing chosen out of combat', () => {
    const s = setup({ combat: { active: false, ownAction: ownAbility(11n) } });
    expect(slots(s.wrapper)[0].classes()).not.toContain('chosen');
    expect(slots(s.wrapper)[0].attributes('aria-pressed')).toBeUndefined();
  });

  it('adds targetCharacterId only when allyArgFor returns an id', async () => {
    const withAlly = setup({ combat: { active: true, allyArg: 8n } });
    await slots(withAlly.wrapper)[1].trigger('click');
    expect(withAlly.useAbility).toHaveBeenCalledWith({ characterId: CHARACTER_ID, abilityTemplateId: 12n, targetCharacterId: 8n });
    expect(withAlly.combat.allyArgFor).toHaveBeenCalledWith(expect.objectContaining({ id: 12n }));
    withAlly.wrapper.unmount();
    wrapper = null;

    const without = setup({ combat: { active: true } });
    await slots(without.wrapper)[1].trigger('click');
    expect(without.useAbility).toHaveBeenCalledTimes(1);
    const args = without.useAbility.mock.calls[0][0] as Record<string, unknown>;
    expect(args).toEqual({ characterId: CHARACTER_ID, abilityTemplateId: 12n });
    expect(Object.keys(args)).toEqual(['characterId', 'abilityTemplateId']);
  });

  it('number keys carry the ally argument in combat', () => {
    const s = setup({ combat: { active: true, allyArg: 8n } });
    press('2');
    expect(s.useAbility).toHaveBeenCalledWith({ characterId: CHARACTER_ID, abilityTemplateId: 12n, targetCharacterId: 8n });
  });

  it('never consults allyArgFor out of combat', async () => {
    const s = setup({ combat: { active: false, allyArg: 8n } });
    await slots(s.wrapper)[1].trigger('click');
    expect(s.combat.allyArgFor).not.toHaveBeenCalled();
    expect(s.useAbility).toHaveBeenCalledWith({ characterId: CHARACTER_ID, abilityTemplateId: 12n });
  });

  it('renders hostile-looking ability names as text in combat', () => {
    const s = setup({
      combat: { active: true, ownAction: ownAbility(11n) },
      abilities: [ability(11n, PAYLOAD)],
    });
    const first = slots(s.wrapper)[0];
    expect(first.get('.slot-name').text()).toBe(PAYLOAD);
    expect(first.find('img').exists()).toBe(false);
  });
});

function describedText(slot: ReturnType<typeof slots>[number]): string {
  const id = slot.attributes('aria-describedby');
  expect(id).toBeTruthy();
  const target = document.getElementById(id as string);
  expect(target).not.toBeNull();
  return (target as HTMLElement).textContent ?? '';
}

describe('HotbarRow ability tooltip', () => {
  const FIREBOLT = ability(11n, 'Firebolt', 'damage', { castSeconds: 2n, description: 'Hurls a bolt of fire.' });
  const withFirebolt = (extra: Partial<Options> = {}) =>
    setup({ abilities: [FIREBOLT, ...DEFAULT_ABILITIES.slice(1)], ...extra });
  const tip = (w: VueWrapper) => w.find('.slot-tip');

  it('shows the name, cost, cooldown, cast time and description on mouse hover, and hides on leave', async () => {
    const s = withFirebolt();
    const first = slots(s.wrapper)[0];
    expect(tip(s.wrapper).exists()).toBe(false);
    await first.trigger('pointerenter', { pointerType: 'mouse' });
    expect(tip(s.wrapper).exists()).toBe(true);
    expect(tip(s.wrapper).get('.tip-name').text()).toBe('Firebolt');
    expect(tip(s.wrapper).get('.tip-stats').text()).toBe('10 mana · 6s cooldown · 2s cast');
    expect(tip(s.wrapper).get('.tip-description').text()).toBe('Hurls a bolt of fire.');
    await first.trigger('pointerleave', { pointerType: 'mouse' });
    expect(tip(s.wrapper).exists()).toBe(false);
  });

  it('follows the hovered slot and says Instant for a zero cast time', async () => {
    const s = withFirebolt();
    await slots(s.wrapper)[0].trigger('pointerenter', { pointerType: 'mouse' });
    await slots(s.wrapper)[0].trigger('pointerleave', { pointerType: 'mouse' });
    await slots(s.wrapper)[1].trigger('pointerenter', { pointerType: 'pen' });
    expect(tip(s.wrapper).get('.tip-name').text()).toBe('Mend');
    expect(tip(s.wrapper).get('.tip-stats').text()).toBe('10 mana · 6s cooldown · Instant');
  });

  it('does not open for an empty slot', async () => {
    const s = withFirebolt();
    const empty = slots(s.wrapper)[3];
    await empty.trigger('pointerenter', { pointerType: 'mouse' });
    await empty.trigger('focus');
    expect(tip(s.wrapper).exists()).toBe(false);
    expect(empty.attributes('aria-describedby')).toBeUndefined();
  });

  it('ignores the pointerenter a touch press fires', async () => {
    const s = withFirebolt();
    await slots(s.wrapper)[0].trigger('pointerenter', { pointerType: 'touch' });
    expect(tip(s.wrapper).exists()).toBe(false);
  });

  it('shows on keyboard focus and hides on blur', async () => {
    const s = withFirebolt();
    const first = slots(s.wrapper)[0];
    // happy-dom does not model :focus-visible, so the keyboard case is stated here
    const matches = vi.spyOn(first.element, 'matches').mockReturnValue(true);
    await first.trigger('focus');
    expect(matches).toHaveBeenCalledWith(':focus-visible');
    expect(tip(s.wrapper).exists()).toBe(true);
    expect(tip(s.wrapper).get('.tip-name').text()).toBe('Firebolt');
    await first.trigger('blur');
    expect(tip(s.wrapper).exists()).toBe(false);
  });

  it('does not show for focus that came from a mouse click', async () => {
    const s = withFirebolt();
    const first = slots(s.wrapper)[0];
    vi.spyOn(first.element, 'matches').mockReturnValue(false);
    await first.trigger('focus');
    expect(tip(s.wrapper).exists()).toBe(false);
  });

  it('links every filled slot to a description holding the same text through aria-describedby', () => {
    const s = withFirebolt();
    const first = slots(s.wrapper)[0];
    expect(describedText(first)).toBe('10 mana, 6s cooldown, 2s cast. Hurls a bolt of fire.');
    expect(describedText(slots(s.wrapper)[1])).toBe('10 mana, 6s cooldown, Instant. Mend description.');
    const ids = slots(s.wrapper)
      .map((slot) => slot.attributes('aria-describedby'))
      .filter((id) => id !== undefined);
    expect(new Set(ids).size).toBe(3);
    // the slot name and its label are unchanged
    expect(first.attributes('aria-label')).toBe('Firebolt, key 1');
  });

  it('reads the cooldown in rounds in combat', async () => {
    const s = withFirebolt({ combat: { active: true } });
    const first = slots(s.wrapper)[0];
    await first.trigger('pointerenter', { pointerType: 'mouse' });
    expect(tip(s.wrapper).get('.tip-stats').text()).toBe('10 mana · 2 rounds cooldown · 2s cast');
    expect(describedText(first)).toContain('2 rounds cooldown');
    s.combat.active.value = false;
    await nextTick();
    expect(tip(s.wrapper).get('.tip-stats').text()).toBe('10 mana · 6s cooldown · 2s cast');
  });

  it('leaves the description line out when the ability has none', async () => {
    const s = setup({ abilities: [ability(11n, 'Firebolt', 'damage', { description: '  ' }), ...DEFAULT_ABILITIES.slice(1)] });
    await slots(s.wrapper)[0].trigger('pointerenter', { pointerType: 'mouse' });
    expect(tip(s.wrapper).find('.tip-description').exists()).toBe(false);
    expect(describedText(slots(s.wrapper)[0])).toBe('10 mana, 6s cooldown, Instant');
  });

  it('renders hostile name and description as text, never markup', async () => {
    const s = setup({
      abilities: [ability(11n, PAYLOAD, 'damage', { description: PAYLOAD }), ...DEFAULT_ABILITIES.slice(1)],
    });
    const first = slots(s.wrapper)[0];
    await first.trigger('pointerenter', { pointerType: 'mouse' });
    expect(s.wrapper.find('img').exists()).toBe(false);
    expect(tip(s.wrapper).get('.tip-name').text()).toBe(PAYLOAD);
    expect(tip(s.wrapper).get('.tip-description').text()).toBe(PAYLOAD);
    expect(describedText(first)).toContain(PAYLOAD);
    expect(document.body.querySelector('img')).toBeNull();
  });

  it('Escape dismisses the popover', async () => {
    const s = withFirebolt();
    await slots(s.wrapper)[0].trigger('pointerenter', { pointerType: 'mouse' });
    expect(tip(s.wrapper).exists()).toBe(true);
    press('Escape');
    await nextTick();
    expect(tip(s.wrapper).exists()).toBe(false);
  });

  it('closes when the open slot is replaced by an empty one', async () => {
    const s = withFirebolt();
    await slots(s.wrapper)[0].trigger('pointerenter', { pointerType: 'mouse' });
    expect(tip(s.wrapper).exists()).toBe(true);
    s.hotbars.value = [hotbar(1n, 'Combat', 0, false), hotbar(2n, 'Travel', 1, true)];
    await nextTick();
    expect(tip(s.wrapper).exists()).toBe(false);
  });
});

describe('HotbarRow long-press', () => {
  const FIREBOLT = ability(11n, 'Firebolt', 'damage', { castSeconds: 2n, description: 'Hurls a bolt of fire.' });
  const touchSetup = (extra: Partial<Options> = {}) =>
    setup({ abilities: [FIREBOLT, ...DEFAULT_ABILITIES.slice(1)], desktop: false, ...extra });
  const tip = (w: VueWrapper) => w.find('.slot-tip');

  it('opens the same content after about 500 ms without casting, then swallows the trailing click', async () => {
    const s = touchSetup();
    const first = slots(s.wrapper)[0];
    await first.trigger('pointerdown', { pointerType: 'touch' });
    vi.advanceTimersByTime(499);
    await nextTick();
    expect(tip(s.wrapper).exists()).toBe(false);
    vi.advanceTimersByTime(1);
    await nextTick();
    expect(tip(s.wrapper).exists()).toBe(true);
    expect(tip(s.wrapper).get('.tip-name').text()).toBe('Firebolt');
    expect(tip(s.wrapper).get('.tip-stats').text()).toBe('10 mana · 6s cooldown · 2s cast');
    expect(tip(s.wrapper).get('.tip-description').text()).toBe('Hurls a bolt of fire.');
    await first.trigger('pointerup', { pointerType: 'touch' });
    // the touch pointer leaving after lift does not close it
    await first.trigger('pointerleave', { pointerType: 'touch' });
    expect(tip(s.wrapper).exists()).toBe(true);
    await first.trigger('click');
    expect(s.useAbility).not.toHaveBeenCalled();
  });

  it('a normal tap still casts and opens nothing', async () => {
    const s = touchSetup();
    const first = slots(s.wrapper)[0];
    await first.trigger('pointerdown', { pointerType: 'touch' });
    vi.advanceTimersByTime(120);
    await first.trigger('pointerup', { pointerType: 'touch' });
    await first.trigger('click');
    vi.advanceTimersByTime(1000);
    await nextTick();
    expect(tip(s.wrapper).exists()).toBe(false);
    expect(s.useAbility).toHaveBeenCalledTimes(1);
    expect(s.useAbility).toHaveBeenCalledWith({ characterId: CHARACTER_ID, abilityTemplateId: 11n });
  });

  it('a tap after a long-press casts: the swallowed click does not linger', async () => {
    const s = touchSetup();
    const first = slots(s.wrapper)[0];
    // a long-press with no click after it (the browser drops it)
    await first.trigger('pointerdown', { pointerType: 'touch' });
    vi.advanceTimersByTime(500);
    await first.trigger('pointerup', { pointerType: 'touch' });
    expect(s.useAbility).not.toHaveBeenCalled();
    await first.trigger('pointerdown', { pointerType: 'touch' });
    await first.trigger('pointerup', { pointerType: 'touch' });
    await first.trigger('click');
    expect(s.useAbility).toHaveBeenCalledTimes(1);
  });

  it('releasing, cancelling or scrolling away before 500 ms opens nothing', async () => {
    const s = touchSetup();
    const first = slots(s.wrapper)[0];
    await first.trigger('pointerdown', { pointerType: 'touch' });
    vi.advanceTimersByTime(300);
    await first.trigger('pointercancel', { pointerType: 'touch' });
    vi.advanceTimersByTime(1000);
    await nextTick();
    expect(tip(s.wrapper).exists()).toBe(false);
  });

  it('a mouse press never starts the long-press timer', async () => {
    const s = touchSetup();
    await slots(s.wrapper)[0].trigger('pointerdown', { pointerType: 'mouse' });
    vi.advanceTimersByTime(1000);
    await nextTick();
    expect(tip(s.wrapper).exists()).toBe(false);
  });

  it('does not open for an empty slot', async () => {
    const s = touchSetup();
    await slots(s.wrapper)[3].trigger('pointerdown', { pointerType: 'touch' });
    vi.advanceTimersByTime(1000);
    await nextTick();
    expect(tip(s.wrapper).exists()).toBe(false);
  });

  it('a press elsewhere closes the popover', async () => {
    const s = touchSetup();
    const first = slots(s.wrapper)[0];
    await first.trigger('pointerdown', { pointerType: 'touch' });
    vi.advanceTimersByTime(500);
    await nextTick();
    expect(tip(s.wrapper).exists()).toBe(true);
    const pointerDown = (pointerType: string): void => {
      const event = new Event('pointerdown', { bubbles: true });
      Object.defineProperty(event, 'pointerType', { value: pointerType });
      document.body.dispatchEvent(event);
    };
    pointerDown('mouse');
    await nextTick();
    expect(tip(s.wrapper).exists()).toBe(true);
    pointerDown('touch');
    await nextTick();
    expect(tip(s.wrapper).exists()).toBe(false);
  });

  it('keeps the browser context menu off a long-press', async () => {
    const s = touchSetup();
    const first = slots(s.wrapper)[0];
    await first.trigger('pointerdown', { pointerType: 'touch' });
    vi.advanceTimersByTime(500);
    const menu = new Event('contextmenu', { bubbles: true, cancelable: true });
    first.element.dispatchEvent(menu);
    expect(menu.defaultPrevented).toBe(true);
    // a plain right-click with the mouse keeps its menu
    await first.trigger('pointerdown', { pointerType: 'mouse' });
    const mouseMenu = new Event('contextmenu', { bubbles: true, cancelable: true });
    first.element.dispatchEvent(mouseMenu);
    expect(mouseMenu.defaultPrevented).toBe(false);
  });

  it('clears the timer when the row unmounts', async () => {
    const s = touchSetup();
    await slots(s.wrapper)[0].trigger('pointerdown', { pointerType: 'touch' });
    expect(vi.getTimerCount()).toBe(1);
    s.wrapper.unmount();
    wrapper = null;
    expect(vi.getTimerCount()).toBe(0);
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

  it('wires the tooltip: aria-describedby, a 500 ms long-press, text nodes only', () => {
    const source = read('src/hotbar/HotbarRow.vue');
    for (const marker of [':aria-describedby=', 'LONG_PRESS_MS = 500', 'slotTooltip(', '@pointerdown=', 'key === \'Escape\'']) {
      expect(source).toContain(marker);
    }
    expect(source).not.toMatch(/v-html|innerHTML|replaceAll|ripple/);
    expect(source).not.toContain('<svg');
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
