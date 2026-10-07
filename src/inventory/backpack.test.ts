import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { MAX_INVENTORY_SLOTS } from '@game-data/inventory_rules';
import type { ItemInstance, ItemTemplate } from '../module_bindings/types';
import {
  BACKPACK_COLUMNS,
  BACKPACK_GAP_PX,
  BACKPACK_TILE_MAX_PX,
  BACKPACK_TILE_MIN_PX,
  BAG_FILTERS,
  FILTER_EMPTY_TEXT,
  backpackColumns,
  bagTiles,
  filterBag,
  slotMetaText,
  slotUsage,
  stackCountText,
} from './backpack';

function inst(id: bigint, templateId: bigint, extra: Record<string, unknown> = {}): ItemInstance {
  return {
    id,
    templateId,
    ownerCharacterId: 7n,
    equippedSlot: undefined,
    quantity: 1n,
    qualityTier: undefined,
    displayName: undefined,
    ...extra,
  } as unknown as ItemInstance;
}

const TEMPLATES = new Map<bigint, ItemTemplate>(
  Object.entries({
    1: { name: 'Cap', slot: 'head', rarity: 'common' },
    2: { name: 'Ore', slot: 'material', rarity: 'common' },
    3: { name: 'Bread', slot: 'food', rarity: 'common' },
    4: { name: 'Scroll: Rope', slot: 'misc', rarity: 'common' },
    5: { name: 'Rag', slot: 'head', rarity: 'common', isJunk: true },
    6: { name: 'Blade', slot: 'mainHand', rarity: 'epic' },
  }).map(([id, t]) => [
    BigInt(id),
    { id: BigInt(id), isJunk: false, wellFedDurationMicros: 0n, weaponType: '', ...t } as unknown as ItemTemplate,
  ]),
);

const BAG = [
  inst(1n, 1n),
  inst(2n, 2n, { quantity: 20n }),
  inst(3n, 3n),
  inst(4n, 4n),
  inst(5n, 5n),
  inst(6n, 6n),
  inst(7n, 1n, { equippedSlot: 'head' }),
];

describe('slotUsage and slotMetaText', () => {
  it('does not count equipped rows and counts a stack once', () => {
    const usage = slotUsage(BAG);
    expect(usage.used).toBe(6);
    expect(usage.cap).toBe(MAX_INVENTORY_SLOTS);
    expect(usage.full).toBe(false);
  });

  it('is full at the cap', () => {
    const many = Array.from({ length: MAX_INVENTORY_SLOTS }, (_, i) => inst(BigInt(i + 1), 1n));
    expect(slotUsage(many).full).toBe(true);
    expect(slotUsage(many.slice(1)).full).toBe(false);
  });

  it('formats the header text', () => {
    expect(slotMetaText({ used: 12, cap: 50, full: false }, false)).toBe('12 / 50 slots');
    expect(slotMetaText({ used: 50, cap: 50, full: true }, false)).toBe('50 / 50 slots · Full');
    expect(slotMetaText({ used: 12, cap: 50, full: false }, true)).toBe('12 / 50');
  });
});

describe('BAG_FILTERS and filterBag', () => {
  it('has the four filters', () => {
    expect(BAG_FILTERS.map((f) => f.label)).toEqual(['All', 'Gear', 'Materials', 'Food']);
    expect(BAG_FILTERS.map((f) => f.id)).toEqual(['all', 'gear', 'materials', 'food']);
  });

  it('All keeps every non-equipped instance', () => {
    expect(filterBag(BAG, TEMPLATES, 'all').map((e) => e.instance.id).sort()).toEqual([
      1n,
      2n,
      3n,
      4n,
      5n,
      6n,
    ]);
  });

  it('Gear, Materials and Food keep their category only', () => {
    expect(filterBag(BAG, TEMPLATES, 'gear').map((e) => e.instance.id).sort()).toEqual([1n, 6n]);
    expect(filterBag(BAG, TEMPLATES, 'materials').map((e) => e.instance.id)).toEqual([2n]);
    expect(filterBag(BAG, TEMPLATES, 'food').map((e) => e.instance.id)).toEqual([3n]);
  });

  it('shows recipe, junk and other only under All', () => {
    for (const filter of ['gear', 'materials', 'food'] as const) {
      const ids = filterBag(BAG, TEMPLATES, filter).map((e) => e.instance.id);
      expect(ids).not.toContain(4n);
      expect(ids).not.toContain(5n);
    }
    expect(filterBag(BAG, TEMPLATES, 'all').map((e) => e.instance.id)).toContain(4n);
  });

  it('leaves out an instance whose template has not arrived', () => {
    expect(filterBag([inst(9n, 99n)], TEMPLATES, 'all')).toEqual([]);
  });
});

describe('bagTiles', () => {
  it('gives the sorted items then empty tiles up to the cap under All', () => {
    const tiles = bagTiles(BAG, TEMPLATES, 'all');
    expect(tiles.items.map((e) => e.instance.id)).toEqual([6n, 1n, 2n, 3n, 4n, 5n]);
    expect(tiles.emptyCount).toBe(MAX_INVENTORY_SLOTS - 6);
  });

  it('counts the empty tiles from the slot count, so an instance whose template is still loading holds its slot (IN-01)', () => {
    const loading = [...BAG, inst(99n, 999n)];
    const tiles = bagTiles(loading, TEMPLATES, 'all');
    expect(tiles.items).toHaveLength(6);
    expect(tiles.emptyCount).toBe(MAX_INVENTORY_SLOTS - slotUsage(loading).used);
    expect(tiles.emptyCount).toBe(MAX_INVENTORY_SLOTS - 7);
  });

  it('gives no empty tiles over the cap', () => {
    const many = Array.from({ length: MAX_INVENTORY_SLOTS + 2 }, (_, i) => inst(BigInt(i + 1), 1n));
    expect(bagTiles(many, TEMPLATES, 'all').emptyCount).toBe(0);
  });

  it('gives no empty tiles under another filter', () => {
    expect(bagTiles(BAG, TEMPLATES, 'gear').emptyCount).toBe(0);
    expect(bagTiles(BAG, TEMPLATES, 'materials').emptyCount).toBe(0);
  });

  // Plan 50-39 "The bag shows every slot": under All the grid always totals the 50 slots.
  it('draws exactly the capacity in cells under All for 1 to 49 bag rows', () => {
    for (let used = 1; used <= MAX_INVENTORY_SLOTS - 1; used += 1) {
      const rows = Array.from({ length: used }, (_, i) => inst(BigInt(i + 1), BigInt((i % 6) + 1)));
      const tiles = bagTiles(rows, TEMPLATES, 'all');
      expect(tiles.items.length + tiles.emptyCount).toBe(MAX_INVENTORY_SLOTS);
    }
  });

  it('draws no empty cell with the bag at the cap, and none under Gear', () => {
    const full = Array.from({ length: MAX_INVENTORY_SLOTS }, (_, i) => inst(BigInt(i + 1), 1n));
    const tiles = bagTiles(full, TEMPLATES, 'all');
    expect(tiles.emptyCount).toBe(0);
    expect(tiles.items).toHaveLength(MAX_INVENTORY_SLOTS);
    expect(bagTiles(BAG, TEMPLATES, 'gear').emptyCount).toBe(0);
  });

  it('the bag is always in Organize order (type, rarity best first, name)', () => {
    const tpl = new Map<bigint, ItemTemplate>(
      Object.entries({
        10: { name: 'Abe', slot: 'head', rarity: 'common' },
        11: { name: 'Zed', slot: 'mainHand', rarity: 'epic' },
        12: { name: 'Ore', slot: 'material', rarity: 'common' },
        13: { name: 'Gem', slot: 'material', rarity: 'rare' },
        14: { name: 'Bread', slot: 'food', rarity: 'common' },
        15: { name: 'Scroll: Rope', slot: 'misc', rarity: 'common' },
        16: { name: 'Widget', slot: 'misc', rarity: 'common' },
        17: { name: 'Rag', slot: 'head', rarity: 'common', isJunk: true },
        18: { name: 'Letter', slot: 'quest', rarity: 'common' },
      }).map(([id, t]) => [
        BigInt(id),
        { id: BigInt(id), isJunk: false, wellFedDurationMicros: 0n, weaponType: '', ...t } as unknown as ItemTemplate,
      ]),
    );
    const mixed = [
      inst(1n, 17n),
      inst(2n, 14n),
      inst(3n, 12n),
      inst(4n, 10n),
      inst(5n, 15n),
      inst(6n, 13n),
      inst(7n, 11n),
      inst(8n, 16n),
      inst(9n, 18n),
    ];
    const names = bagTiles(mixed, tpl, 'all').items.map((e) => e.template.name);
    expect(names).toEqual(['Zed', 'Abe', 'Gem', 'Ore', 'Bread', 'Scroll: Rope', 'Widget', 'Letter', 'Rag']);
  });
});

describe('FILTER_EMPTY_TEXT', () => {
  it('has the three filter empty lines', () => {
    expect(FILTER_EMPTY_TEXT.gear).toBe('No gear in your backpack.');
    expect(FILTER_EMPTY_TEXT.materials).toBe('No materials in your backpack.');
    expect(FILTER_EMPTY_TEXT.food).toBe('No food in your backpack.');
  });
});

describe('tile size and stack count (Plans 50-32 and 50-39)', () => {
  // The old 50-32 rule, kept only to compare: 6 columns of 1fr with an 8px gap.
  const oldStretch = (width: number): number => (width - 8 * 5) / 6;

  // The tile edge BackpackGrid's CSS gives: backpackColumns tracks of minmax(44px, 72px) (desktop) or
  // 5 of minmax(44px, 66px) (mobile) with the 4px gap. backpack.ts no longer exports a tile-size helper
  // because only these tests read it (IN-09, iteration 3); the model lives here.
  const backpackTileSize = (columnWidthPx: number, mobile: boolean): number => {
    const cols = backpackColumns(columnWidthPx, mobile);
    const max = mobile ? BACKPACK_TILE_MAX_PX.mobile : BACKPACK_TILE_MAX_PX.desktop;
    const share = Math.floor((columnWidthPx - BACKPACK_GAP_PX * (cols - 1)) / cols);
    return Math.min(max, Math.max(BACKPACK_TILE_MIN_PX, share));
  };

  it('models the grid CSS tracks it describes', () => {
    const grid = readFileSync(resolve(process.cwd(), 'src/inventory/BackpackGrid.vue'), 'utf8');
    expect(grid).toContain(
      `repeat(var(--bag-columns, ${BACKPACK_COLUMNS.desktop}), minmax(${BACKPACK_TILE_MIN_PX}px, ${BACKPACK_TILE_MAX_PX.desktop}px))`,
    );
    expect(grid).toContain(
      `repeat(${BACKPACK_COLUMNS.mobile}, minmax(${BACKPACK_TILE_MIN_PX}px, ${BACKPACK_TILE_MAX_PX.mobile}px))`,
    );
  });

  // Replaces the 50-32 'exposes the mock constants' case that pinned the 58px cap: the owner's
  // 2026-10-07 decision (plan 50-39) raises the desktop cap to 72px and fills the column.
  it('exposes the constants', () => {
    expect(BACKPACK_COLUMNS).toEqual({ desktop: 6, mobile: 5 });
    expect(BACKPACK_TILE_MAX_PX).toEqual({ desktop: 72, mobile: 66 });
    expect(BACKPACK_TILE_MIN_PX).toBe(44);
    expect(BACKPACK_GAP_PX).toBe(4);
  });

  describe('backpackColumns', () => {
    it('is always 5 on mobile', () => {
      expect(backpackColumns(358, true)).toBe(5);
      expect(backpackColumns(0, true)).toBe(5);
      expect(backpackColumns(1200, true)).toBe(5);
    });

    it('is 6 before the column has been measured', () => {
      expect(backpackColumns(0, false)).toBe(6);
      expect(backpackColumns(-10, false)).toBe(6);
      expect(backpackColumns(Number.NaN, false)).toBe(6);
    });

    it('is the fewest columns whose tile is at most 72px', () => {
      const table: Array<[number, number]> = [
        [292, 4],
        [372, 5],
        [458, 7],
        [532, 8],
        [1012, 14],
        [1652, 22],
        [316, 5],
        [615, 9],
        [100, 2],
        [60, 1],
      ];
      for (const [width, cols] of table) expect(backpackColumns(width, false)).toBe(cols);
    });
  });

  // Replaces the 50-32 'caps a desktop tile at 58px on any wide column' case (owner decision
  // 2026-10-07, plan 50-39): the grid fills the column with tiles of at most 72px.
  it('sizes a desktop tile to fill the column, at most 72px', () => {
    const table: Array<[number, number]> = [
      [292, 70],
      [372, 71],
      [458, 62],
      [532, 63],
      [1012, 68],
      [1652, 71],
      [316, 60],
      [615, 64],
      [100, 48],
    ];
    for (const [width, size] of table) expect(backpackTileSize(width, false)).toBe(size);
  });

  it('caps a mobile tile at 66px and shrinks on a narrow phone', () => {
    expect(backpackTileSize(358, true)).toBe(66);
    expect(backpackTileSize(288, true)).toBe(54);
  });

  it('never goes below the 44px touch target', () => {
    expect(backpackTileSize(100, false)).toBeGreaterThanOrEqual(44);
    expect(backpackTileSize(0, true)).toBe(44);
  });

  // Replaces the 50-32 'stays at or under 58px across the stacked widths' case.
  it('keeps a desktop tile between 56 and 72px, fitting the column, for every width', () => {
    for (let width = 292; width <= 2600; width += 1) {
      const cols = backpackColumns(width, false);
      const size = backpackTileSize(width, false);
      expect(size).toBeGreaterThanOrEqual(56);
      expect(size).toBeLessThanOrEqual(72);
      expect(cols * size + BACKPACK_GAP_PX * (cols - 1)).toBeLessThanOrEqual(width);
      expect(width - (cols * size + BACKPACK_GAP_PX * (cols - 1))).toBeLessThan(cols);
    }
  });

  // Replaces 'is within 3px of the old size at 1280': the tile is now bigger than the 58px of 50-32.
  it('is bigger than the 50-32 tile at 1280', () => {
    expect(backpackTileSize(372, false)).toBeGreaterThan(58);
    expect(backpackTileSize(372, false)).toBe(71);
  });

  it('is at most half the old stretch at 1920 and smaller at 1440', () => {
    expect(backpackTileSize(1012, false)).toBeLessThanOrEqual(oldStretch(1012) / 2);
    expect(backpackTileSize(532, false)).toBeLessThan(oldStretch(532));
  });

  describe('stackCountText', () => {
    const tpl = (stackable: boolean): ItemTemplate => ({ stackable }) as unknown as ItemTemplate;
    it('shows x{n} for a stackable, including x1', () => {
      expect(stackCountText(inst(1n, 1n, { quantity: 14n }), tpl(true))).toBe('x14');
      expect(stackCountText(inst(1n, 1n, { quantity: 1n }), tpl(true))).toBe('x1');
    });
    it('shows a non-stackable count only above 1', () => {
      expect(stackCountText(inst(1n, 1n, { quantity: 1n }), tpl(false))).toBe('');
      expect(stackCountText(inst(1n, 1n, { quantity: 2n }), tpl(false))).toBe('x2');
    });
    it('treats a missing quantity as 1', () => {
      expect(stackCountText(inst(1n, 1n, { quantity: undefined }), tpl(true))).toBe('x1');
      expect(stackCountText(inst(1n, 1n, { quantity: undefined }), tpl(false))).toBe('');
    });
  });
});
