// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { computed, nextTick, ref, shallowRef } from 'vue';
import { mount, type VueWrapper } from '@vue/test-utils';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { MAX_INVENTORY_SLOTS } from '@game-data/inventory_rules';
import { GAME_KEY, createInertGame } from '../game/context';
import type { GameData } from '../game/context';
import { LEDGER_KEY, createInertLedger } from '../ledger/ledgerContext';
import type { LedgerData } from '../ledger/ledgerContext';
import { parseDecls, sfcStyleBlocks } from '../styles/cssContract';
import type { ItemInstance, ItemTemplate } from '../module_bindings/types';
import BackpackGrid from './BackpackGrid.vue';
import {
  BACKPACK_COLUMNS,
  BACKPACK_GAP_PX,
  BACKPACK_TILE_MAX_PX,
  BACKPACK_TILE_MIN_PX,
} from './backpack';

// The backpack grid (Plans 50-32 and 50-39): the desktop grid fills the backpack column with tiles of
// at most 72px (the owner's 2026-10-07 decision replaced the 58px cap), the column count measured by
// a ResizeObserver; mobile stays 5 columns of at most 66px. Source pins on the scoped CSS, plus mounts.

const file = resolve(process.cwd(), 'src/inventory/BackpackGrid.vue');
const source = readFileSync(file, 'utf8');
const decls = sfcStyleBlocks(source).flatMap((block) => parseDecls(block, 'BackpackGrid.vue'));
const valueOf = (selector: string, prop: string): string | undefined =>
  decls.find((d) => d.selector === selector && d.prop === prop)?.value;

let wrapper: VueWrapper | null = null;
afterEach(() => {
  wrapper?.unmount();
  wrapper = null;
  document.body.innerHTML = '';
  vi.unstubAllGlobals();
});

function press(el: Element, key: string): void {
  el.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true }));
}

describe('BackpackGrid CSS pins (Plans 50-32 and 50-39)', () => {
  // Replaces the 50-32 'caps a desktop track at the mock size' case (58px, six fixed tracks): the
  // owner's 2026-10-07 decision (plan 50-39) takes the column count from the measured width.
  it('fills the desktop column with measured tracks of at most 72px and a 4px gap, left-aligned', () => {
    const tracks = `repeat(var(--bag-columns, ${BACKPACK_COLUMNS.desktop}), minmax(${BACKPACK_TILE_MIN_PX}px, ${BACKPACK_TILE_MAX_PX.desktop}px))`;
    expect(tracks).toBe('repeat(var(--bag-columns, 6), minmax(44px, 72px))');
    expect(valueOf('.grid', 'grid-template-columns')).toBe(tracks);
    expect(valueOf('.grid', 'gap')).toBe(`${BACKPACK_GAP_PX}px`);
    expect(valueOf('.grid', 'justify-content')).toBe('start');
  });

  it('caps a mobile track at 66px', () => {
    const tracks = `repeat(${BACKPACK_COLUMNS.mobile}, minmax(${BACKPACK_TILE_MIN_PX}px, ${BACKPACK_TILE_MAX_PX.mobile}px))`;
    expect(tracks).toBe('repeat(5, minmax(44px, 66px))');
    expect(valueOf('.grid.mobile', 'grid-template-columns')).toBe(tracks);
  });

  it('never stretches a track with 1fr', () => {
    expect(source).not.toContain('1fr');
  });

  // Replaces 'limits the column to the capped grid': the desktop column now fills the backpack
  // column (no max-width); the mobile column keeps its 5-column limit.
  it('lets the desktop column fill, and keeps the mobile column limit', () => {
    const mobile = `calc(${BACKPACK_COLUMNS.mobile} * ${BACKPACK_TILE_MAX_PX.mobile}px + ${BACKPACK_COLUMNS.mobile - 1} * ${BACKPACK_GAP_PX}px)`;
    expect(valueOf('.backpack', 'max-width')).toBeUndefined();
    expect(valueOf('.backpack.mobile', 'max-width')).toBe(mobile);
  });

  it('keeps the empty tile square with a 44px touch size', () => {
    expect(valueOf('.empty-tile', 'aspect-ratio')).toBe('1');
    expect(valueOf('.empty-tile', 'min-width')).toBe('44px');
    expect(valueOf('.empty-tile', 'min-height')).toBe('44px');
  });
});

describe('BackpackGrid mount (Plans 50-32 and 50-39)', () => {
  const template = (over: Record<string, unknown> = {}) =>
    ({
      id: 1n,
      name: 'Ore',
      slot: 'material',
      weaponType: '',
      armorType: '',
      rarity: 'common',
      tier: 1n,
      isJunk: false,
      stackable: true,
      wellFedDurationMicros: 0n,
      ...over,
    }) as unknown as ItemTemplate;
  const instance = (id: bigint, quantity: bigint) =>
    ({ id, templateId: 1n, quantity, equippedSlot: undefined, qualityTier: undefined, displayName: undefined }) as unknown as ItemInstance;

  function mountGrid(props: Record<string, unknown> = {}, count = 2) {
    const game = { ...createInertGame(), connected: ref(true) } as unknown as GameData;
    const ledger = {
      ...createInertLedger(),
      items: shallowRef<readonly ItemInstance[]>(
        count === 2
          ? [instance(1n, 14n), instance(2n, 1n)]
          : Array.from({ length: count }, (_, i) => instance(BigInt(i + 1), 1n)),
      ),
      templates: ref(
        new Map([
          [1n, template()],
          [2n, template({ id: 2n, name: 'Cap', slot: 'head', armorType: 'leather', stackable: false })],
        ]),
      ),
      reducers: computed(() => null),
    } as unknown as LedgerData;
    wrapper = mount(BackpackGrid, {
      attachTo: document.body,
      props: { selectedId: null, filter: 'all', ...props },
      global: { provide: { [GAME_KEY as symbol]: game, [LEDGER_KEY as symbol]: ledger } },
    });
  }

  it('renders the desktop grid with x{n} counts and empty tiles', () => {
    mountGrid();
    const grid = wrapper!.get('.grid');
    expect(grid.classes()).not.toContain('mobile');
    expect(wrapper!.findAll('.item-tile .quantity').map((q) => q.text())).toEqual(['x14', 'x1']);
    expect(wrapper!.findAll('.empty-tile').length).toBeGreaterThan(0);
  });

  it('renders the mobile grid class', () => {
    mountGrid({ mobile: true });
    expect(wrapper!.get('.grid').classes()).toContain('mobile');
    expect(wrapper!.get('.backpack').classes()).toContain('mobile');
  });

  it('renders 22 item tiles and 28 aria-hidden empty cells under All, 50 cells in all', () => {
    mountGrid({}, 22);
    expect(wrapper!.findAll('button.item-tile')).toHaveLength(22);
    const empties = wrapper!.findAll('.empty-tile');
    expect(empties).toHaveLength(28);
    expect(empties.every((cell) => cell.attributes('aria-hidden') === 'true' && !cell.attributes('tabindex'))).toBe(true);
    expect(wrapper!.get('.grid').element.children).toHaveLength(MAX_INVENTORY_SLOTS);
  });

  it('End from the first tile focuses the last item tile, never an empty cell', async () => {
    mountGrid({}, 22);
    const buttons = wrapper!.findAll('button.item-tile');
    press(buttons[0].element, 'End');
    await nextTick();
    expect(document.activeElement).toBe(buttons[21].element);
  });

  it('draws no empty cells under another filter, and only the matching tiles', () => {
    mountGrid({ filter: 'materials' }, 22);
    expect(wrapper!.findAll('.empty-tile')).toHaveLength(0);
    expect(wrapper!.findAll('button.item-tile')).toHaveLength(22);
    wrapper!.unmount();
    mountGrid({ filter: 'gear' }, 22);
    expect(wrapper!.findAll('button.item-tile')).toHaveLength(0);
    expect(wrapper!.find('.filter-empty').text()).toBe('No gear in your backpack.');
  });

  it('keeps the empty state for an empty bag', () => {
    mountGrid({}, 0);
    expect(wrapper!.text()).toContain('Your backpack is empty.');
    expect(wrapper!.find('.grid').exists()).toBe(false);
  });
});

// Plan 50-39: the measured column count (a ResizeObserver on the backpack column).
describe('BackpackGrid measured columns (Plan 50-39)', () => {
  type Entries = Array<{ contentRect: { width: number } }>;
  function fakeObserver() {
    const state: { callback: ((entries: Entries) => void) | null; created: number } = { callback: null, created: 0 };
    const observe = vi.fn();
    const disconnect = vi.fn();
    class FakeObserver {
      constructor(cb: (entries: Entries) => void) {
        state.callback = cb;
        state.created += 1;
      }
      observe = observe;
      disconnect = disconnect;
      unobserve = vi.fn();
    }
    vi.stubGlobal('ResizeObserver', FakeObserver);
    return { state, observe, disconnect };
  }

  function mountGrid(mobile = false, count = 20) {
    const template = {
      id: 1n,
      name: 'Ore',
      slot: 'material',
      weaponType: '',
      armorType: '',
      rarity: 'common',
      tier: 1n,
      isJunk: false,
      stackable: false,
      wellFedDurationMicros: 0n,
    } as unknown as ItemTemplate;
    const game = { ...createInertGame(), connected: ref(true) } as unknown as GameData;
    const ledger = {
      ...createInertLedger(),
      items: shallowRef<readonly ItemInstance[]>(
        Array.from(
          { length: count },
          (_, i) =>
            ({ id: BigInt(i + 1), templateId: 1n, quantity: 1n, equippedSlot: undefined, qualityTier: undefined, displayName: undefined }) as unknown as ItemInstance,
        ),
      ),
      templates: ref(new Map([[1n, template]])),
      reducers: computed(() => null),
    } as unknown as LedgerData;
    wrapper = mount(BackpackGrid, {
      attachTo: document.body,
      props: { selectedId: null, filter: 'all', ...(mobile ? { mobile: true } : {}) },
      global: { provide: { [GAME_KEY as symbol]: game, [LEDGER_KEY as symbol]: ledger } },
    });
    return wrapper;
  }

  const gridStyle = () => wrapper!.get('.grid').attributes('style') ?? '';

  it('sets --bag-columns from the measured width, steps the arrows by it and disconnects on unmount', async () => {
    const { state, observe, disconnect } = fakeObserver();
    mountGrid();
    await nextTick();
    expect(observe).toHaveBeenCalledTimes(1);
    expect(gridStyle()).toContain('--bag-columns: 6');

    state.callback!([{ contentRect: { width: 372 } }]);
    await nextTick();
    expect(gridStyle()).toContain('--bag-columns: 5');
    const buttons = wrapper!.findAll('button.item-tile');
    press(buttons[0].element, 'ArrowDown');
    await nextTick();
    expect(document.activeElement).toBe(buttons[5].element);

    state.callback!([{ contentRect: { width: 1012 } }]);
    await nextTick();
    expect(gridStyle()).toContain('--bag-columns: 14');
    press(wrapper!.findAll('button.item-tile')[0].element, 'ArrowDown');
    await nextTick();
    expect(document.activeElement).toBe(wrapper!.findAll('button.item-tile')[14].element);

    state.callback!([{ contentRect: { width: 0 } }]);
    await nextTick();
    expect(gridStyle()).toContain('--bag-columns: 6');

    wrapper!.unmount();
    wrapper = null;
    expect(disconnect).toHaveBeenCalled();
  });

  it('without a ResizeObserver the columns stay 6 and ArrowDown moves by 6', async () => {
    vi.stubGlobal('ResizeObserver', undefined);
    mountGrid();
    await nextTick();
    expect(gridStyle()).toContain('--bag-columns: 6');
    const buttons = wrapper!.findAll('button.item-tile');
    press(buttons[0].element, 'ArrowDown');
    await nextTick();
    expect(document.activeElement).toBe(buttons[6].element);
  });

  it('mobile creates no observer, has no --bag-columns style and steps by 5', async () => {
    const { state } = fakeObserver();
    mountGrid(true);
    await nextTick();
    expect(state.created).toBe(0);
    expect(gridStyle()).not.toContain('--bag-columns');
    const buttons = wrapper!.findAll('button.item-tile');
    press(buttons[0].element, 'ArrowDown');
    await nextTick();
    expect(document.activeElement).toBe(buttons[5].element);
  });
});
