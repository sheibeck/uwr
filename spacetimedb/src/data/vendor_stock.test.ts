import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { EQUIPMENT_SLOTS, ITEM_CATEGORIES, QUALITY_TIERS } from './mechanical_vocabulary';
import {
  BASE_STOCK_QUANTITY,
  BASE_STOCK_SIZE,
  PROFILE_CATEGORIES,
  STOCK_RARITY_WEIGHTS,
  VENDOR_RESTOCK_BATCH,
  VENDOR_RESTOCK_CONTINUE_MICROS,
  VENDOR_RESTOCK_INTERVAL_MICROS,
  areaLevel,
  baseStockQuantity,
  isBaseStockCandidate,
  levelBand,
  listPriceFor,
  pickBaseStock,
  planRestockBatch,
  rarityWeight,
  restockSeed,
  selectBaseStock,
  stockCategoryOf,
  vendorProfileOf,
  type StockTemplate,
} from './vendor_stock';

// The local vendors, quoted from the owner's database (research 2026-10-06).
const HESPER = {
  description:
    'A broad, sunburnt woman who sells rope, lamp oil and pickled eel from a stall made of two doors. Her left hand is missing a finger, and she will tell you a different story about it each time.',
  greeting: "Rope, oil, eel. Pick two, and the third you'll want later anyway.",
  personalityJson: JSON.stringify({ knowledgeDomains: ['salvage prices', 'tide tables', 'wreck rumors'] }),
};
const SABETH = {
  description:
    'A lean woman with salt-whitened braids and a counter built from a ship\'s door. She sells lamp oil, waterskins and optimism at a fair markup.',
  greeting: "Mind the step, stranger. The last one who didn't is still down there, technically.",
  personalityJson: JSON.stringify({ knowledgeDomains: ['trade routes', 'salt storms', 'Lampwright politics'] }),
};
const MERCHANT = {
  description: 'A merchant who seems mildly annoyed by the concept of commerce.',
  greeting: 'Fine. I suppose you want to buy something. Let us get this over with.',
};

function tpl(id: bigint, name: string, over: Partial<StockTemplate> = {}): StockTemplate {
  return {
    id,
    name,
    slot: 'mainHand',
    rarity: 'common',
    tier: 1n,
    isJunk: false,
    requiredLevel: 1n,
    vendorValue: 10n,
    weaponType: '',
    wellFedDurationMicros: 0n,
    ...over,
  };
}
const sword = (id: bigint, over: Partial<StockTemplate> = {}) => tpl(id, `Sword ${id}`, { weaponType: 'sword', ...over });
const material = (id: bigint, over: Partial<StockTemplate> = {}) => tpl(id, `Material ${id}`, { slot: 'material', ...over });

describe('vendorProfileOf', () => {
  it('reads Hesper Duhallow and Sabeth Orrowyn as provisioners', () => {
    expect(vendorProfileOf(HESPER)).toBe('provisioner');
    expect(vendorProfileOf(SABETH)).toBe('provisioner');
  });

  it('reads a smith, an outfitter and a general merchant', () => {
    expect(vendorProfileOf({ description: 'A soot-streaked smith who hammers blades on her anvil' })).toBe('smith');
    expect(vendorProfileOf({ description: 'A tailor who sells cloaks, boots and trinkets' })).toBe('outfitter');
    expect(vendorProfileOf(MERCHANT)).toBe('general');
  });

  it('falls back to general for empty, null or missing fields', () => {
    expect(vendorProfileOf({})).toBe('general');
    expect(vendorProfileOf({ description: null, greeting: null, personalityJson: null })).toBe('general');
    expect(vendorProfileOf({ description: '', greeting: '', personalityJson: '' })).toBe('general');
  });

  it('never throws on malformed personalityJson', () => {
    for (const bad of ['{not json', '[]', '{"knowledgeDomains":"x"}', 'null', '42', '{"knowledgeDomains":[1,null,{}]}']) {
      expect(() => vendorProfileOf({ description: 'A smith', personalityJson: bad })).not.toThrow();
      expect(vendorProfileOf({ description: 'A smith', personalityJson: bad })).toBe('smith');
    }
  });

  it('counts a knowledgeDomains entry toward its profile', () => {
    expect(vendorProfileOf({ personalityJson: JSON.stringify({ knowledgeDomains: ['forge lore'] }) })).toBe('smith');
  });

  it('matches plurals and whole words only', () => {
    expect(vendorProfileOf({ description: 'blades' })).toBe('smith');
    expect(vendorProfileOf({ description: 'torches' })).toBe('provisioner');
    expect(vendorProfileOf({ description: 'string' })).toBe('general');
    expect(vendorProfileOf({ description: 'ring' })).toBe('outfitter');
  });

  it('gives a one-to-one tie to the earlier profile (smith before provisioner)', () => {
    expect(vendorProfileOf({ description: 'sword bread' })).toBe('smith');
    expect(vendorProfileOf({ description: 'bread sword' })).toBe('smith');
  });
});

describe('PROFILE_CATEGORIES', () => {
  it('maps each profile to its categories', () => {
    expect(PROFILE_CATEGORIES.smith).toEqual(['weapon', 'armor']);
    expect(PROFILE_CATEGORIES.outfitter).toEqual(['armor', 'accessory']);
    expect(PROFILE_CATEGORIES.provisioner).toEqual(['consumable', 'resource']);
    expect([...PROFILE_CATEGORIES.general].sort()).toEqual(['accessory', 'armor', 'consumable', 'resource', 'weapon']);
  });

  it('lists only real item categories', () => {
    for (const list of Object.values(PROFILE_CATEGORIES)) {
      for (const category of list) expect((ITEM_CATEGORIES as readonly string[]).indexOf(category)).not.toBe(-1);
    }
  });
});

describe('stockCategoryOf', () => {
  it('maps the equipment slots', () => {
    expect(stockCategoryOf(tpl(1n, 'A', { slot: 'mainHand' }))).toBe('weapon');
    expect(stockCategoryOf(tpl(1n, 'A', { slot: 'offHand', weaponType: 'dagger' }))).toBe('weapon');
    expect(stockCategoryOf(tpl(1n, 'A', { slot: 'offHand', weaponType: '' }))).toBe('armor');
    for (const slot of ['head', 'chest', 'legs', 'boots', 'hands', 'wrists', 'belt']) {
      expect(stockCategoryOf(tpl(1n, 'A', { slot }))).toBe('armor');
    }
    for (const slot of ['neck', 'earrings', 'cloak']) {
      expect(stockCategoryOf(tpl(1n, 'A', { slot }))).toBe('accessory');
    }
  });

  it('maps consumables and resources', () => {
    expect(stockCategoryOf(tpl(1n, 'Bread', { slot: 'food' }))).toBe('consumable');
    expect(stockCategoryOf(tpl(1n, 'Tea', { slot: 'consumable' }))).toBe('consumable');
    expect(stockCategoryOf(tpl(1n, 'Stew', { slot: 'material', wellFedDurationMicros: 5n }))).toBe('consumable');
    expect(stockCategoryOf(tpl(1n, 'Ore', { slot: 'material' }))).toBe('resource');
    expect(stockCategoryOf(tpl(1n, 'Hide', { slot: 'resource' }))).toBe('resource');
  });

  it('returns null for quest items, junk, recipe scrolls and unknown slots', () => {
    expect(stockCategoryOf(tpl(1n, 'Writ', { slot: 'quest' }))).toBeNull();
    expect(stockCategoryOf(tpl(1n, 'Tail', { slot: 'mainHand', isJunk: true }))).toBeNull();
    expect(stockCategoryOf(tpl(1n, 'Tail', { slot: 'junk' }))).toBeNull();
    expect(stockCategoryOf(tpl(1n, 'Scroll: Bread', { slot: 'consumable' }))).toBeNull();
    expect(stockCategoryOf(tpl(1n, 'Flag', { slot: 'banner' }))).toBeNull();
  });

  it('maps every equipment slot to weapon, armor or accessory', () => {
    for (const slot of EQUIPMENT_SLOTS) {
      const category = stockCategoryOf(tpl(1n, 'A', { slot, weaponType: 'sword' }));
      expect(['weapon', 'armor', 'accessory']).toContain(category);
    }
  });
});

describe('areaLevel and levelBand', () => {
  it('computes the area level from danger and offset', () => {
    expect(areaLevel(100n, 0n)).toBe(1n);
    expect(areaLevel(169n, 0n)).toBe(1n);
    expect(areaLevel(300n, 0n)).toBe(3n);
    expect(areaLevel(300n, 2n)).toBe(5n);
    expect(areaLevel(250n, 1n)).toBe(3n);
    expect(areaLevel(100n, -3n)).toBe(1n);
  });

  it('is the same function the recipe generation uses, so the two level rules cannot drift apart', async () => {
    const recipes = await import('./recipe_rules');
    expect(areaLevel).toBe(recipes.areaLevel);
    for (const danger of [0n, 50n, 100n, 169n, 300n, 800n]) {
      for (const offset of [-5n, 0n, 2n, 10n]) {
        expect(areaLevel(danger, offset)).toBe(recipes.areaLevel(danger, offset));
      }
    }
  });

  it('computes the band', () => {
    expect(levelBand(1n)).toEqual({ minLevel: 1n, maxLevel: 2n, minTier: 1n, maxTier: 1n });
    expect(levelBand(3n)).toEqual({ minLevel: 2n, maxLevel: 4n, minTier: 1n, maxTier: 1n });
    expect(levelBand(5n)).toEqual({ minLevel: 4n, maxLevel: 6n, minTier: 1n, maxTier: 2n });
    expect(levelBand(8n)).toEqual({ minLevel: 7n, maxLevel: 9n, minTier: 2n, maxTier: 3n });
  });
});

describe('rarityWeight', () => {
  it('weights toward common and never stocks epic or legendary', () => {
    expect(rarityWeight('common')).toBe(16n);
    expect(rarityWeight('Common')).toBe(16n);
    expect(rarityWeight('uncommon')).toBe(4n);
    expect(rarityWeight('rare')).toBe(1n);
    expect(rarityWeight('epic')).toBe(0n);
    expect(rarityWeight('legendary')).toBe(0n);
    expect(rarityWeight('')).toBe(0n);
    expect(rarityWeight('mythic')).toBe(0n);
    expect(rarityWeight(null)).toBe(0n);
    expect(rarityWeight(undefined)).toBe(0n);
  });

  it('keys STOCK_RARITY_WEIGHTS by the quality tiers', () => {
    expect(Object.keys(STOCK_RARITY_WEIGHTS).sort()).toEqual([...QUALITY_TIERS].sort());
  });
});

describe('isBaseStockCandidate', () => {
  it('uses the required level for gear', () => {
    expect(isBaseStockCandidate(sword(1n, { requiredLevel: 1n }), 'smith', 1n)).toBe(true);
    expect(isBaseStockCandidate(sword(2n, { requiredLevel: 3n }), 'smith', 1n)).toBe(false);
    expect(isBaseStockCandidate(sword(2n, { requiredLevel: 3n }), 'smith', 3n)).toBe(true);
    expect(isBaseStockCandidate(sword(1n, { requiredLevel: 1n }), 'smith', 3n)).toBe(false);
  });

  it('uses the tier for consumables and resources', () => {
    expect(isBaseStockCandidate(material(1n, { tier: 1n }), 'provisioner', 1n)).toBe(true);
    expect(isBaseStockCandidate(material(2n, { tier: 3n }), 'provisioner', 1n)).toBe(false);
    expect(isBaseStockCandidate(material(1n, { tier: 1n, requiredLevel: 1n }), 'provisioner', 5n)).toBe(true);
    expect(isBaseStockCandidate(material(1n, { tier: 2n, requiredLevel: 1n }), 'provisioner', 5n)).toBe(true);
    expect(isBaseStockCandidate(material(1n, { tier: 3n, requiredLevel: 1n }), 'provisioner', 5n)).toBe(false);
  });

  it('refuses epic and legendary, wrong categories and excluded kinds', () => {
    expect(isBaseStockCandidate(sword(1n, { rarity: 'epic' }), 'smith', 1n)).toBe(false);
    expect(isBaseStockCandidate(sword(1n, { rarity: 'legendary' }), 'general', 1n)).toBe(false);
    const cloak = tpl(3n, 'Worn Cloak', { slot: 'cloak' });
    expect(isBaseStockCandidate(cloak, 'provisioner', 1n)).toBe(false);
    expect(isBaseStockCandidate(cloak, 'outfitter', 1n)).toBe(true);
    expect(isBaseStockCandidate(cloak, 'general', 1n)).toBe(true);
    expect(isBaseStockCandidate(sword(1n), 'provisioner', 1n)).toBe(false);
    expect(isBaseStockCandidate(tpl(4n, 'Writ', { slot: 'quest' }), 'general', 1n)).toBe(false);
  });
});

describe('listPriceFor', () => {
  it('doubles the vendor value, with a floor of 10 for a worthless item', () => {
    expect(listPriceFor(13n)).toBe(26n);
    expect(listPriceFor(1n)).toBe(2n);
    expect(listPriceFor(0n)).toBe(10n);
  });
});

describe('restockSeed', () => {
  const T = 1_700_000_000_000_000n;
  it('is stable and differs by vendor and tick', () => {
    expect(restockSeed(5n, T)).toBe(restockSeed(5n, T));
    expect(restockSeed(5n, T)).not.toBe(restockSeed(6n, T));
    expect(restockSeed(5n, T)).not.toBe(restockSeed(5n, T + 1n));
  });
});

describe('pickBaseStock', () => {
  const many = Array.from({ length: 14 }, (_, i) => material(BigInt(i + 1)));

  it('returns nothing for no candidates and for count 0', () => {
    expect(pickBaseStock([], 1n, 8)).toEqual([]);
    expect(pickBaseStock(many, 1n, 0)).toEqual([]);
  });

  it('never duplicates and returns min(count, positive-weight candidates) in ascending id order', () => {
    const picked = pickBaseStock(many, 77n, 8);
    expect(picked).toHaveLength(8);
    const ids = picked.map((p) => p.id);
    expect(new Set(ids).size).toBe(8);
    expect(ids).toEqual([...ids].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0)));
    expect(pickBaseStock(many.slice(0, 3), 77n, 8)).toHaveLength(3);
  });

  it('is deterministic, also when the input is reversed', () => {
    const a = pickBaseStock(many, 12345n, 8).map((p) => p.id);
    const b = pickBaseStock(many, 12345n, 8).map((p) => p.id);
    const c = pickBaseStock([...many].reverse(), 12345n, 8).map((p) => p.id);
    expect(b).toEqual(a);
    expect(c).toEqual(a);
  });

  it('prefers common over rare', () => {
    const pair = [material(1n, { rarity: 'common' }), material(2n, { rarity: 'rare' })];
    let common = 0;
    for (let seed = 0n; seed < 200n; seed += 1n) {
      if (pickBaseStock(pair, seed, 1)[0].id === 1n) common += 1;
    }
    expect(common).toBeGreaterThanOrEqual(150);
  });

  it('gives different sets over different ticks', () => {
    const T0 = 1_700_000_000_000_000n;
    const sets = new Set<string>();
    for (let k = 0n; k < 10n; k += 1n) sets.add(pickBaseStock(many, T0 + k, 8).map((p) => p.id).join(','));
    expect(sets.size).toBeGreaterThan(1);
  });

  it('never picks a weight-0 candidate', () => {
    const mixed = [...many.slice(0, 4), material(50n, { rarity: 'epic' }), material(51n, { rarity: 'legendary' })];
    for (let seed = 0n; seed < 50n; seed += 1n) {
      const ids = pickBaseStock(mixed, seed, 6).map((p) => p.id);
      expect(ids).not.toContain(50n);
      expect(ids).not.toContain(51n);
      expect(ids).toHaveLength(4);
    }
  });
});

describe('selectBaseStock', () => {
  const T = 1_700_000_000_000_000n;
  const hesper = { id: 5n, ...HESPER };

  it('never returns an excluded template and handles an empty template list', () => {
    const templates = Array.from({ length: 6 }, (_, i) => material(BigInt(i + 1)));
    const picks = selectBaseStock({
      templates,
      vendor: hesper,
      dangerMultiplier: 100n,
      levelOffset: 0n,
      excludeTemplateIds: [1n, 2n],
      tickMicros: T,
    });
    const ids = picks.map((p) => p.id);
    expect(ids).not.toContain(1n);
    expect(ids).not.toContain(2n);
    expect(ids).toHaveLength(4);
    expect(
      selectBaseStock({ templates: [], vendor: hesper, dangerMultiplier: 100n, levelOffset: 0n, excludeTemplateIds: [], tickMicros: T }),
    ).toEqual([]);
  });

  it('picks only tier 1 materials for Hesper at danger 100, at most BASE_STOCK_SIZE', () => {
    const templates: StockTemplate[] = [
      tpl(1n, 'Rat Tail', { slot: 'junk', isJunk: true }),
      tpl(2n, 'Sealed Writ', { slot: 'quest' }),
      tpl(3n, 'Scroll: Bread', { slot: 'consumable' }),
      material(4n, { tier: 3n }),
      material(5n, { rarity: 'epic' }),
      tpl(6n, 'Worn Cloak', { slot: 'cloak' }),
      sword(7n),
      ...Array.from({ length: 10 }, (_, i) => material(BigInt(20 + i), { tier: 1n })),
    ];
    const picks = selectBaseStock({
      templates,
      vendor: hesper,
      dangerMultiplier: 100n,
      levelOffset: 0n,
      excludeTemplateIds: [],
      tickMicros: T,
    });
    expect(picks.length).toBeLessThanOrEqual(BASE_STOCK_SIZE);
    expect(picks).toHaveLength(BASE_STOCK_SIZE);
    for (const pick of picks) {
      expect(pick.slot).toBe('material');
      expect(pick.tier).toBe(1n);
      expect(pick.id >= 20n).toBe(true);
    }
  });

  it('is the same for the same vendor, templates and tick', () => {
    const templates = Array.from({ length: 12 }, (_, i) => material(BigInt(i + 1)));
    const run = () =>
      selectBaseStock({ templates, vendor: hesper, dangerMultiplier: 100n, levelOffset: 0n, excludeTemplateIds: [], tickMicros: T }).map(
        (p) => p.id,
      );
    expect(run()).toEqual(run());
  });
});

describe('planRestockBatch', () => {
  it('takes the first batch above the cursor in ascending order', () => {
    expect(planRestockBatch([5n, 1n, 9n, 3n], 0n, 2)).toEqual({ batch: [1n, 3n], more: true, nextAfterNpcId: 3n });
    expect(planRestockBatch([5n, 1n, 9n, 3n], 3n, 2)).toEqual({ batch: [5n, 9n], more: false, nextAfterNpcId: 0n });
  });

  it('handles no vendors and duplicate ids', () => {
    expect(planRestockBatch([], 0n, 20)).toEqual({ batch: [], more: false, nextAfterNpcId: 0n });
    expect(planRestockBatch([2n, 2n, 2n, 1n], 0n, 2)).toEqual({ batch: [1n, 2n], more: false, nextAfterNpcId: 0n });
  });
});

describe('constants', () => {
  it('are in range', () => {
    expect(BASE_STOCK_SIZE).toBeGreaterThanOrEqual(6);
    expect(BASE_STOCK_SIZE).toBeLessThanOrEqual(10);
    expect(VENDOR_RESTOCK_INTERVAL_MICROS >= 600_000_000n).toBe(true);
    expect(VENDOR_RESTOCK_INTERVAL_MICROS <= 1_200_000_000n).toBe(true);
    expect(VENDOR_RESTOCK_BATCH).toBeGreaterThan(0);
    expect(VENDOR_RESTOCK_CONTINUE_MICROS < VENDOR_RESTOCK_INTERVAL_MICROS).toBe(true);
  });
});

describe('baseStockQuantity (Plan 50-26)', () => {
  const seeds: bigint[] = [];
  for (let i = 0n; i < 200n; i += 1n) seeds.push(i);
  const ranges: Array<[string, bigint, bigint]> = [['common', 3n, 5n], ['uncommon', 2n, 3n], ['rare', 1n, 2n]];

  it('stays in the rarity range and every value of the range appears', () => {
    for (const [rarity, lo, hi] of ranges) {
      const seen = new Set<bigint>();
      for (const seed of seeds) {
        for (const id of [1n, 2n, 3n]) {
          const q = baseStockQuantity(rarity, seed, id);
          expect(q >= lo && q <= hi).toBe(true);
          seen.add(q);
        }
      }
      for (let v = lo; v <= hi; v += 1n) expect(seen.has(v)).toBe(true);
    }
  });

  it('trims and ignores case', () => {
    for (const seed of seeds) {
      expect(baseStockQuantity(' Common ', seed, 2n)).toBe(baseStockQuantity('common', seed, 2n));
    }
  });

  it('gives 1 for anything that is not base-stock rarity, and never 0', () => {
    for (const r of ['epic', 'legendary', '', null, undefined, 'mythic']) {
      expect(baseStockQuantity(r as string | null | undefined, 5n, 1n)).toBe(1n);
    }
    for (const seed of seeds) {
      for (const [rarity] of ranges) expect(baseStockQuantity(rarity, seed, 9n) > 0n).toBe(true);
    }
  });

  it('is deterministic and depends on the template id', () => {
    expect(baseStockQuantity('common', 77n, 3n)).toBe(baseStockQuantity('common', 77n, 3n));
    let differs = false;
    for (const seed of seeds) {
      if (baseStockQuantity('common', seed, 1n) !== baseStockQuantity('common', seed, 2n)) differs = true;
    }
    expect(differs).toBe(true);
  });

  it('BASE_STOCK_QUANTITY keys are exactly common, uncommon and rare, each a quality tier', () => {
    expect(Object.keys(BASE_STOCK_QUANTITY).sort()).toEqual(['common', 'rare', 'uncommon']);
    for (const [key, [min, max]] of Object.entries(BASE_STOCK_QUANTITY)) {
      expect((QUALITY_TIERS as readonly string[]).indexOf(key)).toBeGreaterThanOrEqual(0);
      expect(min >= 1n).toBe(true);
      expect(min <= max).toBe(true);
    }
  });
});

describe('vendor_stock.ts imports', () => {
  it('imports only item_rules, mechanical_vocabulary and recipe_rules, and nothing from the server runtime', () => {
    const path = fileURLToPath(new URL('./vendor_stock.ts', import.meta.url));
    const source = readFileSync(path, 'utf8');
    const out: string[] = [];
    const re = /from\s+'([^']+)'/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(source)) !== null) out.push(m[1]);
    expect(out.sort()).toEqual(['./item_rules', './mechanical_vocabulary', './recipe_rules']);
    expect(source).not.toContain("'spacetimedb");
  });
});
