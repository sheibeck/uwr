// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { nextTick, ref } from 'vue';
import type { Ref } from 'vue';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { mount, type VueWrapper } from '@vue/test-utils';
import ActionRow from './ActionRow.vue';
import FeedShell from '../frame/FeedShell.vue';
import { createActionFirstSeen } from './actionFirstSeen';
import { GAME_KEY, createInertCombatData, createInertGame } from '../game/context';
import type { GameData } from '../game/context';

const XSS = '<img src=x onerror=alert(1)>';
const S = 1_000_000;
const T = 1_700_000_000 * S;

let wrapper: VueWrapper | null = null;

beforeEach(() => {
  vi.useFakeTimers();
  vi.stubGlobal('matchMedia', (query: string) => ({ matches: false, media: query }));
});

afterEach(() => {
  wrapper?.unmount();
  wrapper = null;
  document.body.innerHTML = '';
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

interface Setup {
  gathers?: Array<Record<string, unknown>>;
  casts?: Array<Record<string, unknown>>;
  nodeName?: string;
  abilityName?: string;
  active?: boolean;
  attach?: boolean;
}

const gatherRow = (id: bigint, endsAt: number) => ({ id, characterId: 5n, nodeId: 3n, endsAtMicros: BigInt(endsAt) });
const castRow = (id: bigint, endsAt: number, abilityTemplateId = 20n) => ({
  id,
  characterId: 5n,
  abilityTemplateId,
  endsAtMicros: BigInt(endsAt),
});

function makeGame(setup: Setup = {}) {
  let now = T;
  const gathers = ref<Array<Record<string, unknown>>>(setup.gathers ?? []);
  const casts = ref<Array<Record<string, unknown>>>(setup.casts ?? []);
  const active = ref(setup.active ?? false);
  // The data-layer first-seen map, in client time, like createGameData builds it.
  const seen = createActionFirstSeen({
    gathers: gathers as unknown as Ref<readonly { id: bigint }[]>,
    casts: casts as unknown as Ref<readonly { id: bigint }[]>,
    now: () => now,
  });
  const game = {
    ...createInertGame(),
    characterId: ref(5n),
    gathers,
    characterCasts: casts,
    nodesHere: ref([{ id: 3n, name: setup.nodeName ?? 'Ironwood' }]),
    abilities: ref([{ id: 20n, name: setup.abilityName ?? 'Mend', kind: 'heal', castSeconds: 2n }]),
    combat: { ...createInertCombatData(), active },
    actionFirstSeen: seen.firstSeen,
    clock: { skewMicros: ref(0), sample() {}, nowMicros: () => now },
  } as unknown as GameData;
  return {
    game,
    gathers,
    casts,
    active,
    seen,
    setNow: (value: number) => {
      now = value;
    },
  };
}

function mountRow(setup: Setup = {}) {
  const h = makeGame(setup);
  const w = mount(ActionRow, {
    global: { provide: { [GAME_KEY as symbol]: h.game } },
    ...(setup.attach ? { attachTo: document.body } : {}),
  });
  wrapper = w;
  return { ...h, w };
}

describe('ActionRow visibility', () => {
  it('renders nothing with the inert game', () => {
    wrapper = mount(ActionRow);
    expect(wrapper.find('.action-row').exists()).toBe(false);
  });

  it('renders nothing in combat even with a gather row', () => {
    const { w } = mountRow({ gathers: [gatherRow(1n, T + 8 * S)], active: true });
    expect(w.find('.action-row').exists()).toBe(false);
  });

  it('has no button', () => {
    const { w } = mountRow({ gathers: [gatherRow(1n, T + 8 * S)] });
    expect(w.find('.action-row').exists()).toBe(true);
    expect(w.find('button').exists()).toBe(false);
  });
});

describe('ActionRow gather', () => {
  it('shows the label, the bar and the seconds', () => {
    const { w } = mountRow({ gathers: [gatherRow(1n, T + 8 * S)] });
    expect(w.get('.action-label').text()).toBe('Gathering Ironwood');
    expect(w.get('.action-time').text()).toBe('8s');
    const bar = w.get('[role="progressbar"]');
    expect(bar.attributes('aria-label')).toBe('Gathering Ironwood');
    expect(bar.attributes('aria-valuemin')).toBe('0');
    expect(bar.attributes('aria-valuemax')).toBe('100');
    expect(bar.attributes('aria-valuenow')).toBe('0');
    expect(bar.attributes('aria-valuetext')).toBe('8s');
    // The label is announced once, through the bar's aria-label.
    expect(w.get('.action-label').attributes('aria-hidden')).toBe('true');
    expect(w.get('.action-row').attributes('title')).toBe('Gathering Ironwood · 8s');
  });

  it('fills as the clock moves', async () => {
    const { w, setNow } = mountRow({ gathers: [gatherRow(1n, T + 8 * S)] });
    setNow(T + 3 * S);
    vi.advanceTimersByTime(250);
    await nextTick();
    expect(w.get('.action-time').text()).toBe('5s');
    expect(w.get('[role="progressbar"]').attributes('aria-valuenow')).toBe('38');
    expect((w.get('.fill').element as HTMLElement).style.width).toBe('37.5%');
  });

  it('reads Finishing… past the end and goes away with the row', async () => {
    const { w, gathers, setNow } = mountRow({ gathers: [gatherRow(1n, T + 8 * S)] });
    setNow(T + 9 * S);
    vi.advanceTimersByTime(250);
    await nextTick();
    expect(w.get('.action-time').text()).toBe('Finishing…');
    expect(w.get('.action-time').classes()).toContain('finishing');
    expect(w.get('[role="progressbar"]').attributes('aria-valuenow')).toBe('100');
    gathers.value = [];
    await nextTick();
    expect(w.find('.action-row').exists()).toBe(false);
    expect(vi.getTimerCount()).toBe(0);
  });
});

describe('ActionRow lifecycle', () => {
  it('starts an action that appears after mount from its own arrival', async () => {
    const { w, gathers, setNow } = mountRow();
    expect(w.find('.action-row').exists()).toBe(false);
    expect(vi.getTimerCount()).toBe(0);
    setNow(T + 30 * S);
    vi.advanceTimersByTime(5000);
    gathers.value = [gatherRow(1n, T + 38 * S)];
    await nextTick();
    expect(w.get('.action-label').text()).toBe('Gathering Ironwood');
    expect(w.get('.action-time').text()).toBe('8s');
    expect(w.get('[role="progressbar"]').attributes('aria-valuenow')).toBe('0');
    expect(vi.getTimerCount()).toBe(1);
    setNow(T + 34 * S);
    vi.advanceTimersByTime(250);
    await nextTick();
    expect(w.get('.action-time').text()).toBe('4s');
    expect(w.get('[role="progressbar"]').attributes('aria-valuenow')).toBe('50');
  });

  it('keeps the bar where it was when the row is remounted', async () => {
    const h = makeGame({ gathers: [gatherRow(1n, T + 8 * S)] });
    const provide = { [GAME_KEY as symbol]: h.game };
    const first = mount(ActionRow, { global: { provide } });
    h.setNow(T + 4 * S);
    vi.advanceTimersByTime(250);
    await nextTick();
    expect(first.get('[role="progressbar"]').attributes('aria-valuenow')).toBe('50');
    first.unmount();
    // The desktop breakpoint swaps FeedShell: a new ActionRow on the same game.
    wrapper = mount(ActionRow, { global: { provide } });
    expect(wrapper.get('.action-time').text()).toBe('4s');
    expect(wrapper.get('[role="progressbar"]').attributes('aria-valuenow')).toBe('50');
  });

  it('starts over after the first-seen map is reset (logout)', async () => {
    const h = makeGame({ gathers: [gatherRow(1n, T + 8 * S)] });
    h.setNow(T + 4 * S);
    h.gathers.value = [];
    h.seen.reset();
    h.gathers.value = [gatherRow(1n, T + 12 * S)];
    wrapper = mount(ActionRow, { global: { provide: { [GAME_KEY as symbol]: h.game } } });
    expect(wrapper.get('.action-time').text()).toBe('8s');
    expect(wrapper.get('[role="progressbar"]').attributes('aria-valuenow')).toBe('0');
  });
});

describe('ActionRow cast', () => {
  it('shows Casting with the ability name', () => {
    const { w } = mountRow({ casts: [castRow(2n, T + 3 * S)] });
    expect(w.get('.action-label').text()).toBe('Casting Mend');
  });

  it('falls back to Casting for an unknown ability', () => {
    const { w } = mountRow({ casts: [castRow(2n, T + 3 * S, 0n)] });
    expect(w.get('.action-label').text()).toBe('Casting');
  });
});

describe('ActionRow escaping', () => {
  it('renders a node name as literal text', () => {
    const { w } = mountRow({ gathers: [gatherRow(1n, T + 8 * S)], nodeName: XSS, attach: true });
    expect(w.findAll('img')).toHaveLength(0);
    expect(document.body.querySelectorAll('img')).toHaveLength(0);
    expect(w.get('.action-label').text()).toBe(`Gathering ${XSS}`);
  });

  it('renders an ability name as literal text', () => {
    const { w } = mountRow({ casts: [castRow(2n, T + 3 * S)], abilityName: XSS, attach: true });
    expect(w.findAll('img')).toHaveLength(0);
    expect(document.body.querySelectorAll('img')).toHaveLength(0);
    expect(w.get('.action-label').text()).toBe(`Casting ${XSS}`);
  });
});

describe('ActionRow in the composer', () => {
  it('sits between the round row slot and the hotbar row', () => {
    const { game } = makeGame({ gathers: [gatherRow(1n, T + 8 * S)] });
    wrapper = mount(FeedShell, { global: { provide: { [GAME_KEY as symbol]: game } } });
    const composer = wrapper.get('section.composer').element;
    expect(composer.firstElementChild?.classList.contains('action-row')).toBe(true);
    expect(composer.children[1]?.classList.contains('hotbar-row')).toBe(true);
  });

  it('lists RoundRow, ActionRow, HotbarRow in the FeedShell template', () => {
    const shell = readFileSync(resolve(__dirname, '../frame/FeedShell.vue'), 'utf8');
    const round = shell.indexOf('<RoundRow />');
    const action = shell.indexOf('<ActionRow />');
    const hotbar = shell.indexOf('<HotbarRow />');
    expect(round).toBeGreaterThan(-1);
    expect(action).toBeGreaterThan(round);
    expect(hotbar).toBeGreaterThan(action);
  });
});

describe('ActionRow reduced motion', () => {
  it('sets the fill transition to none in a prefers-reduced-motion block', () => {
    const source = readFileSync(resolve(__dirname, 'ActionRow.vue'), 'utf8');
    const block = source.slice(source.indexOf('@media (prefers-reduced-motion: reduce)'));
    expect(block).toMatch(/\.fill\s*\{\s*transition:\s*none;/);
  });
});
