import { describe, expect, it } from 'vitest';
import { MAX_INVENTORY_SLOTS } from '@game-data/inventory_rules';
import type { ItemInstance, ItemTemplate } from '../module_bindings/types';
import {
  BACKPACK_COLUMNS,
  BACKPACK_GAP_PX,
  BACKPACK_TILE_MAX_PX,
  BACKPACK_TILE_MIN_PX,
  BAG_FILTERS,
  FILTER_EMPTY_TEXT,
  backpackTileSize,
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
});

describe('FILTER_EMPTY_TEXT', () => {
  it('has the three filter empty lines', () => {
    expect(FILTER_EMPTY_TEXT.gear).toBe('No gear in your backpack.');
    expect(FILTER_EMPTY_TEXT.materials).toBe('No materials in your backpack.');
    expect(FILTER_EMPTY_TEXT.food).toBe('No food in your backpack.');
  });
});

describe('tile size and stack count (Plan 50-32)', () => {
  // The old rule, kept only to compare: 6 columns of 1fr with an 8px gap.
  const oldStretch = (width: number): number => (width - 8 * 5) / 6;

  it('exposes the mock constants', () => {
    expect(BACKPACK_COLUMNS).toEqual({ desktop: 6, mobile: 5 });
    expect(BACKPACK_TILE_MAX_PX).toEqual({ desktop: 58, mobile: 66 });
    expect(BACKPACK_TILE_MIN_PX).toBe(44);
    expect(BACKPACK_GAP_PX).toBe(4);
  });

  it('caps a desktop tile at 58px on any wide column', () => {
    expect(backpackTileSize(372, false)).toBe(58);
    expect(backpackTileSize(532, false)).toBe(58);
    expect(backpackTileSize(1012, false)).toBe(58);
    expect(backpackTileSize(292, false)).toBe(45);
  });

  it('caps a mobile tile at 66px and shrinks on a narrow phone', () => {
    expect(backpackTileSize(358, true)).toBe(66);
    expect(backpackTileSize(288, true)).toBe(54);
  });

  it('never goes below the 44px touch target', () => {
    expect(backpackTileSize(100, false)).toBe(44);
    expect(backpackTileSize(0, true)).toBe(44);
  });

  it('is at most half the old stretch at 1920 and smaller at 1440', () => {
    expect(backpackTileSize(1012, false)).toBeLessThanOrEqual(oldStretch(1012) / 2);
    expect(backpackTileSize(532, false)).toBeLessThan(oldStretch(532));
  });

  it('stays at or under 58px across the stacked widths, smaller wherever the old size was above 58', () => {
    for (let width = 316; width <= 615; width += 1) {
      const size = backpackTileSize(width, false);
      expect(size).toBeLessThanOrEqual(58);
      if (oldStretch(width) > 58) expect(size).toBeLessThan(oldStretch(width));
    }
  });

  it('is within 3px of the old size at 1280', () => {
    expect(Math.abs(backpackTileSize(372, false) - oldStretch(372))).toBeLessThanOrEqual(3);
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
