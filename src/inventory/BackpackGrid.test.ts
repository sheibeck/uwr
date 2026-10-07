// @vitest-environment happy-dom
import { afterEach, describe, expect, it } from 'vitest';
import { computed, ref, shallowRef } from 'vue';
import { mount, type VueWrapper } from '@vue/test-utils';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
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

// The capped backpack grid (Plan 50-32): the tiles stay at the Inventory mock's size, never
// stretching with the column. Source pins on the scoped CSS, plus a mount for the classes.

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
});

describe('BackpackGrid CSS pins (Plan 50-32)', () => {
  it('caps a desktop track at the mock size with a 4px gap, left-aligned', () => {
    const tracks = `repeat(${BACKPACK_COLUMNS.desktop}, minmax(${BACKPACK_TILE_MIN_PX}px, ${BACKPACK_TILE_MAX_PX.desktop}px))`;
    expect(tracks).toBe('repeat(6, minmax(44px, 58px))');
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

  it('limits the column to the capped grid so the heading and chips line up', () => {
    const desktop = `calc(${BACKPACK_COLUMNS.desktop} * ${BACKPACK_TILE_MAX_PX.desktop}px + ${BACKPACK_COLUMNS.desktop - 1} * ${BACKPACK_GAP_PX}px)`;
    const mobile = `calc(${BACKPACK_COLUMNS.mobile} * ${BACKPACK_TILE_MAX_PX.mobile}px + ${BACKPACK_COLUMNS.mobile - 1} * ${BACKPACK_GAP_PX}px)`;
    expect(valueOf('.backpack', 'max-width')).toBe(desktop);
    expect(valueOf('.backpack.mobile', 'max-width')).toBe(mobile);
  });

  it('keeps the empty tile square with a 44px touch size', () => {
    expect(valueOf('.empty-tile', 'aspect-ratio')).toBe('1');
    expect(valueOf('.empty-tile', 'min-width')).toBe('44px');
    expect(valueOf('.empty-tile', 'min-height')).toBe('44px');
  });
});

describe('BackpackGrid mount (Plan 50-32)', () => {
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

  function mountGrid(props: Record<string, unknown> = {}) {
    const game = { ...createInertGame(), connected: ref(true) } as unknown as GameData;
    const ledger = {
      ...createInertLedger(),
      items: shallowRef<readonly ItemInstance[]>([instance(1n, 14n), instance(2n, 1n)]),
      templates: ref(new Map([[1n, template()]])),
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
});
