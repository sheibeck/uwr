// economy_design_rules.test.ts
// Phase 51.3 plan 02. The pure design rules of a region economy: names, recipe tiers, cross-region
// requirements and the numbers of every generated item (SC2, SC3).
import { describe, it, expect } from 'vitest';
import {
  cleanItemName,
  cleanDescription,
  RESERVED_ITEM_NAMES,
  uniqueItemName,
  fallbackItemName,
  REGION_ECONOMY_COUNTS,
  REGION_ECONOMY_BIGINT_PATHS,
  GATHER_SLOTS,
  GATHER_WEIGHTS,
  MAX_RECIPE_REQUIREMENTS,
  gatherRef,
  enemyRef,
  dropRef,
  foreignRef,
  recipeTierSlots,
  FOREIGN_REGIONS_BY_TIER,
  regionalRequirementPlan,
  slotForeignIndexes,
  orderForeignRegions,
  foreignOffer,
  categoryForKind,
} from './economy_design_rules';
import { MATERIAL_KIND_VALUES, weaponGrowth, armorGrowth } from './recipe_rules';
import { BASIC_RESOURCE_DEFS, JUNK_DEFS } from './equipment_rules';

describe('cleanItemName', () => {
  it('collapses whitespace and trims', () => {
    expect(cleanItemName('  Ember   Moss ')).toBe('Ember Moss');
  });

  it('keeps only letters, spaces, apostrophes and hyphens', () => {
    expect(cleanItemName("Widow's Bone-Dust")).toBe("Widow's Bone-Dust");
    expect(cleanItemName('Fire[Blade]{x}<b>')).toBe('Fire Blade x b');
  });

  it('drops a leading Scroll word so no name can pass the Scroll: check', () => {
    expect(cleanItemName('Scroll: Fire[Blade]{x}<b>')).toBe('Fire Blade x b');
    expect(cleanItemName('scroll SCROLL Fire Blade')).toBe('Fire Blade');
    expect(cleanItemName('Scroll:Saltglass Blade')).toBe('Saltglass Blade');
  });

  it('strips markup, links and tag payloads (T-51.3-05)', () => {
    const out = cleanItemName('[Take Gold](cmd:/give) <script>alert(1)</script>');
    expect(out).not.toMatch(/[\[\]{}<>()/:]/);
  });

  it('keeps at most 4 words and 40 characters', () => {
    expect(cleanItemName('One Two Three Four Five Six')).toBe('One Two Three Four');
    const long = cleanItemName('Abcdefghijklmnop Abcdefghijklmnop Abcdefghijklmnop');
    expect(long.length).toBeLessThanOrEqual(40);
    expect(long).toBe('Abcdefghijklmnop Abcdefghijklmnop');
    expect(cleanItemName('A'.repeat(90)).length).toBe(40);
  });

  it('returns an empty string when fewer than 2 letters remain', () => {
    expect(cleanItemName('123 !!')).toBe('');
    expect(cleanItemName('x')).toBe('');
    expect(cleanItemName('')).toBe('');
    expect(cleanItemName('--- \'\' ---')).toBe('');
    expect(cleanItemName('Scroll')).toBe('');
  });

  it('never throws on non-string input', () => {
    expect(cleanItemName(undefined as unknown as string)).toBe('');
    expect(cleanItemName(null as unknown as string)).toBe('');
    expect(cleanItemName(42 as unknown as string)).toBe('');
  });
});

describe('cleanDescription', () => {
  it('keeps sentences and removes [ ] { } < >', () => {
    expect(cleanDescription('A [pale] moss. It {glows} <softly>.')).toBe('A pale moss. It glows softly.');
  });

  it('collapses whitespace and control characters', () => {
    expect(cleanDescription('  Line one\n\n  line\ttwo\u0000 ')).toBe('Line one line two');
  });

  it('caps at 240 characters at a word boundary', () => {
    const text = 'word '.repeat(80);
    const out = cleanDescription(text);
    expect(out.length).toBeLessThanOrEqual(240);
    expect(out.endsWith('word')).toBe(true);
    expect(cleanDescription('x'.repeat(500)).length).toBe(240);
  });

  it('returns an empty string for non-strings', () => {
    expect(cleanDescription(undefined as unknown as string)).toBe('');
    expect(cleanDescription(7 as unknown as string)).toBe('');
  });
});

describe('RESERVED_ITEM_NAMES', () => {
  it('holds seeded and starter names in lowercase', () => {
    for (const name of ['rat tail', 'copper ore', 'training sword', 'stone', 'clear water']) {
      expect(RESERVED_ITEM_NAMES.has(name)).toBe(true);
    }
  });

  it('covers every junk and basic resource name', () => {
    for (const def of [...JUNK_DEFS, ...BASIC_RESOURCE_DEFS]) {
      expect(RESERVED_ITEM_NAMES.has(def.name.toLowerCase())).toBe(true);
    }
  });

  it('holds only lowercase keys', () => {
    for (const key of RESERVED_ITEM_NAMES) expect(key).toBe(key.toLowerCase());
  });
});

describe('uniqueItemName', () => {
  const none = () => false;

  it('returns a free name unchanged', () => {
    expect(uniqueItemName('Ember Moss', 'Varrow Teeth', none)).toBe('Ember Moss');
  });

  it('prefixes the region when the name is reserved, then numbers it', () => {
    expect(uniqueItemName('Iron Ore', 'Varrow Teeth', none)).toBe('Varrow Teeth Iron Ore');
    const taken = new Set(['varrow teeth iron ore']);
    expect(uniqueItemName('Iron Ore', 'Varrow Teeth', (n) => taken.has(n.toLowerCase()))).toBe(
      'Varrow Teeth Iron Ore 2',
    );
    taken.add('varrow teeth iron ore 2');
    expect(uniqueItemName('Iron Ore', 'Varrow Teeth', (n) => taken.has(n.toLowerCase()))).toBe(
      'Varrow Teeth Iron Ore 3',
    );
  });

  it('is case-insensitive against the reserved set and against isTaken', () => {
    expect(uniqueItemName('RAT TAIL', 'Ashfen', none)).toBe('Ashfen RAT TAIL');
    expect(uniqueItemName('Ember Moss', 'Ashfen', (n) => n.toLowerCase() === 'ember moss')).toBe('Ashfen Ember Moss');
    expect(uniqueItemName('Ember  Moss', 'Ashfen', (n) => n.toLowerCase() === 'ember moss')).toBe(
      'Ashfen Ember Moss',
    );
  });

  it('never returns a Scroll-prefixed name', () => {
    expect(uniqueItemName('Scroll: Fire Blade', 'Ashfen', none)).toBe('Fire Blade');
  });

  it('falls back to a rule name built from the region and kind when the name is empty', () => {
    expect(uniqueItemName('', 'Varrow Teeth', none, { role: 'gather', kindOrSlot: 'metal' })).toBe(
      'Varrow Teeth Ore',
    );
    expect(uniqueItemName('!!', 'Varrow Teeth', none, { role: 'trophy', kindOrSlot: '' })).toBe(
      'Varrow Teeth Trophy',
    );
  });

  it('numbers a fallback name that clashes without doubling the region', () => {
    const taken = new Set(['varrow teeth ore']);
    expect(
      uniqueItemName('', 'Varrow Teeth', (n) => taken.has(n.toLowerCase()), { role: 'gather', kindOrSlot: 'metal' }),
    ).toBe('Varrow Teeth Ore 2');
  });

  it('gives something non-empty even with no name, no region and no fallback', () => {
    expect(uniqueItemName('', '', none).length).toBeGreaterThan(0);
    expect(uniqueItemName(undefined as unknown as string, undefined as unknown as string, none).length).toBeGreaterThan(0);
  });

  it('makes names that differ only in case or spacing two distinct stored names (SC2 adjacency)', () => {
    const chosen = new Set<string>();
    const isTaken = (n: string) => chosen.has(n.toLowerCase().replace(/\s+/g, ' '));
    const first = uniqueItemName(cleanItemName('Ember Moss'), 'Ashfen', isTaken);
    chosen.add(first.toLowerCase());
    const second = uniqueItemName(cleanItemName('ember  moss'), 'Ashfen', isTaken);
    chosen.add(second.toLowerCase());
    expect(first).toBe('Ember Moss');
    expect(second).not.toBe(first);
    expect(second.toLowerCase()).not.toBe(first.toLowerCase());
    expect(second).toBe('Ashfen ember moss');
  });
});

describe('fallbackItemName', () => {
  it('uses a noun by material kind', () => {
    const nouns: Record<string, string> = {
      metal: 'Ore',
      hide: 'Hide',
      cloth: 'Fiber',
      trinket: 'Stone',
      wood: 'Timber',
      edible: 'Herb',
      base: 'Salt',
    };
    for (const kind of MATERIAL_KIND_VALUES) {
      expect(fallbackItemName('gather', kind, 'Ashfen')).toBe(`Ashfen ${nouns[kind]}`);
    }
  });

  it('names trophies, gear by slot and recipe outputs by category', () => {
    expect(fallbackItemName('trophy', '', 'Ashfen')).toBe('Ashfen Trophy');
    expect(fallbackItemName('gear', 'weapon', 'Ashfen')).toBe('Ashfen Blade');
    expect(fallbackItemName('gear', 'chest', 'Ashfen')).toBe('Ashfen Jerkin');
    expect(fallbackItemName('gear', 'legs', 'Ashfen')).toBe('Ashfen Pants');
    expect(fallbackItemName('gear', 'boots', 'Ashfen')).toBe('Ashfen Boots');
    expect(fallbackItemName('output', 'weapon', 'Ashfen')).toBe('Ashfen Blade');
    expect(fallbackItemName('output', 'armor', 'Ashfen')).toBe('Ashfen Jerkin');
    expect(fallbackItemName('output', 'accessory', 'Ashfen')).toBe('Ashfen Pendant');
    expect(fallbackItemName('output', 'consumable', 'Ashfen')).toBe('Ashfen Stew');
  });

  it('works without a region', () => {
    expect(fallbackItemName('trophy', '', '')).toBe('Trophy');
  });
});

describe('shared recipe_rules exports', () => {
  it('lists every material kind in the MaterialKind order', () => {
    expect([...MATERIAL_KIND_VALUES]).toEqual(['metal', 'hide', 'cloth', 'trinket', 'wood', 'edible', 'base']);
  });

  it('exports the weapon and armor growth rules unchanged', () => {
    expect(weaponGrowth(1n)).toBe(0n);
    expect(weaponGrowth(6n)).toBe(6n);
    expect(armorGrowth(6n)).toBe(4n);
  });
});

describe('BASIC_RESOURCE_DEFS', () => {
  it('holds the 19 basic resources ensureStarterItemTemplates upserts', () => {
    expect(BASIC_RESOURCE_DEFS).toHaveLength(19);
    expect(BASIC_RESOURCE_DEFS[0].name).toBe('Stone');
    expect(BASIC_RESOURCE_DEFS[18].name).toBe('Lamp Oil');
    expect(new Set(BASIC_RESOURCE_DEFS.map((d) => d.name)).size).toBe(19);
  });
});

// A fixed-seed shuffle, so the order tests are reproducible.
function shuffled<T>(list: readonly T[], seed: number): T[] {
  const out = [...list];
  let x = seed;
  for (let i = out.length - 1; i > 0; i--) {
    x = (x * 1103515245 + 12345) % 2147483648;
    const j = x % (i + 1);
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

describe('REGION_ECONOMY_COUNTS and handles', () => {
  it('holds the Small counts', () => {
    expect(REGION_ECONOMY_COUNTS).toEqual({
      gatherables: 3,
      recipes: 3,
      lootEntriesMin: 4,
      lootEntriesMax: 6,
      maxForeignRegions: 3,
      maxOfferPerRegion: 4,
    });
  });

  it('gathers common, uncommon and rare at weights 15, 8 and 3', () => {
    expect([...GATHER_SLOTS]).toEqual(['common', 'uncommon', 'rare']);
    expect(GATHER_WEIGHTS.common).toBe(15n);
    expect(GATHER_WEIGHTS.uncommon).toBe(8n);
    expect(GATHER_WEIGHTS.rare).toBe(3n);
  });

  it('names the bigint paths of the input the model route must keep exact', () => {
    expect([...REGION_ECONOMY_BIGINT_PATHS]).toEqual([
      'regionId',
      'enemies[].templateId',
      'foreignRegions[].regionId',
      'foreign[].templateId',
    ]);
  });

  it('makes handles from zero-based positions', () => {
    expect(gatherRef(0)).toBe('G1');
    expect(gatherRef(2)).toBe('G3');
    expect(enemyRef(0)).toBe('E1');
    expect(enemyRef(7)).toBe('E8');
    expect(dropRef('E1')).toBe('D:E1');
    expect(foreignRef(0)).toBe('F1');
    expect(foreignRef(3)).toBe('F4');
  });
});

describe('recipeTierSlots', () => {
  it('gives the tier mix by number of other regions', () => {
    expect(recipeTierSlots(0n)).toEqual(['common', 'common', 'uncommon']);
    expect(recipeTierSlots(1n)).toEqual(['common', 'uncommon', 'rare']);
    expect(recipeTierSlots(2n)).toEqual(['uncommon', 'rare', 'epic']);
    expect(recipeTierSlots(3n)).toEqual(['uncommon', 'epic', 'legendary']);
    expect(recipeTierSlots(7n)).toEqual(['uncommon', 'epic', 'legendary']);
  });

  it('always has three slots and at least one research-learnable tier', () => {
    for (let k = 0n; k <= 6n; k++) {
      const slots = recipeTierSlots(k);
      expect(slots).toHaveLength(REGION_ECONOMY_COUNTS.recipes);
      expect(slots.some((t) => t === 'common' || t === 'uncommon')).toBe(true);
    }
  });

  it('never throws on a negative or odd count', () => {
    expect(recipeTierSlots(-1n)).toEqual(['common', 'common', 'uncommon']);
    expect(recipeTierSlots(undefined as unknown as bigint)).toEqual(['common', 'common', 'uncommon']);
  });
});

describe('regionalRequirementPlan', () => {
  it('has no foreign slot for common and uncommon', () => {
    expect(regionalRequirementPlan('common')).toEqual({
      primaryCount: 3n,
      localSecondaryCount: 1n,
      foreignCount: 0,
      foreignEach: 0n,
    });
    expect(regionalRequirementPlan('uncommon')).toEqual({
      primaryCount: 3n,
      localSecondaryCount: 2n,
      foreignCount: 0,
      foreignEach: 0n,
    });
    expect(FOREIGN_REGIONS_BY_TIER.common).toBe(0);
    expect(FOREIGN_REGIONS_BY_TIER.uncommon).toBe(0);
  });

  it('rare needs 1 other region, epic 2, legendary 3 (SC3)', () => {
    expect(FOREIGN_REGIONS_BY_TIER.rare).toBe(1);
    expect(FOREIGN_REGIONS_BY_TIER.epic).toBe(2);
    expect(FOREIGN_REGIONS_BY_TIER.legendary).toBe(3);
    expect(regionalRequirementPlan('rare')).toEqual({
      primaryCount: 3n,
      localSecondaryCount: 1n,
      foreignCount: 1,
      foreignEach: 1n,
    });
    expect(regionalRequirementPlan('epic')).toEqual({
      primaryCount: 3n,
      localSecondaryCount: null,
      foreignCount: 2,
      foreignEach: 2n,
    });
    expect(regionalRequirementPlan('legendary')).toEqual({
      primaryCount: 4n,
      localSecondaryCount: null,
      foreignCount: 3,
      foreignEach: 2n,
    });
  });

  it('legendary has exactly 4 requirements and 3 distinct foreign region slots', () => {
    const count = (tier: string) => {
      const p = regionalRequirementPlan(tier);
      return 1 + (p.localSecondaryCount === null ? 0 : 1) + p.foreignCount;
    };
    expect(count('common')).toBe(2);
    expect(count('uncommon')).toBe(2);
    expect(count('rare')).toBe(3);
    expect(count('epic')).toBe(3);
    expect(count('legendary')).toBe(4);
    expect(count('legendary')).toBe(MAX_RECIPE_REQUIREMENTS);
    expect(MAX_RECIPE_REQUIREMENTS).toBe(4);
    const legendarySlots = slotForeignIndexes(['legendary']);
    expect(new Set(legendarySlots[0]).size).toBe(3);
  });

  it('treats an unknown tier as common', () => {
    expect(regionalRequirementPlan('mythic')).toEqual(regionalRequirementPlan('common'));
    expect(regionalRequirementPlan('constructor')).toEqual(regionalRequirementPlan('common'));
  });
});

describe('slotForeignIndexes', () => {
  it('gives each slot the foreign region positions it needs', () => {
    expect(slotForeignIndexes(['uncommon', 'epic', 'legendary'])).toEqual([[], [0, 1], [0, 1, 2]]);
    expect(slotForeignIndexes(['common', 'uncommon', 'rare'])).toEqual([[], [], [0]]);
    expect(slotForeignIndexes(['common', 'common', 'uncommon'])).toEqual([[], [], []]);
    expect(slotForeignIndexes(['uncommon', 'rare', 'epic'])).toEqual([[], [0], [0, 1]]);
  });

  it('matches the plan foreign count for every tier of every mix', () => {
    for (let k = 0n; k <= 4n; k++) {
      const tiers = recipeTierSlots(k);
      const idx = slotForeignIndexes(tiers);
      tiers.forEach((tier, i) => expect(idx[i]).toHaveLength(regionalRequirementPlan(tier).foreignCount));
    }
  });

  it('never needs more foreign regions than the mix has other regions', () => {
    for (let k = 0n; k <= 5n; k++) {
      const need = Math.max(0, ...slotForeignIndexes(recipeTierSlots(k)).map((l) => l.length));
      expect(BigInt(need)).toBeLessThanOrEqual(k);
    }
  });
});

describe('orderForeignRegions', () => {
  const candidates = [
    { regionId: 9n, neighbor: false },
    { regionId: 2n, neighbor: false },
    { regionId: 7n, neighbor: true },
    { regionId: 5n, neighbor: true },
    { regionId: 3n, neighbor: false },
    { regionId: 11n, neighbor: false },
  ];

  it('puts neighbors first ascending, then the rest rotated by the region id', () => {
    // Region 4: neighbors 5, 7; rest ascending 2, 3, 9, 11 (4 entries); 4 mod 4 is 0, so no rotation.
    expect(orderForeignRegions(4n, candidates)).toEqual([5n, 7n, 2n, 3n, 9n, 11n]);
    // Region 6: 6 mod 4 is 2, so the rest starts at 9.
    expect(orderForeignRegions(6n, candidates)).toEqual([5n, 7n, 9n, 11n, 2n, 3n]);
  });

  it('excludes the region itself and rotates over the remaining list', () => {
    // Region 5 is a candidate: neighbors left are 7; rest 2, 3, 9, 11; 5 mod 4 is 1, so it starts at 3.
    expect(orderForeignRegions(5n, candidates)).toEqual([7n, 3n, 9n, 11n, 2n]);
    expect(orderForeignRegions(7n, candidates)).not.toContain(7n);
  });

  it('is the same for any input order', () => {
    const expected = orderForeignRegions(5n, candidates);
    for (let seed = 1; seed <= 12; seed++) {
      expect(orderForeignRegions(5n, shuffled(candidates, seed))).toEqual(expected);
    }
  });

  it('drops duplicate candidates and treats a repeated neighbor flag as neighbor', () => {
    const out = orderForeignRegions(1n, [
      { regionId: 4n, neighbor: false },
      { regionId: 4n, neighbor: true },
      { regionId: 6n, neighbor: false },
    ]);
    expect(out).toEqual([4n, 6n]);
  });

  it('gives an empty list for no candidates and never throws on odd input', () => {
    expect(orderForeignRegions(1n, [])).toEqual([]);
    expect(orderForeignRegions(1n, undefined as unknown as [])).toEqual([]);
  });
});

describe('foreignOffer', () => {
  const mats = [
    { templateId: 30n, regionId: 2n, rarity: 'common', name: 'Salt Reed', kind: 'edible' },
    { templateId: 31n, regionId: 2n, rarity: 'uncommon', name: 'Glass Sand', kind: 'trinket' },
    { templateId: 32n, regionId: 2n, rarity: 'rare', name: 'Sun Pearl', kind: 'trinket' },
    { templateId: 33n, regionId: 2n, rarity: 'common', name: 'Brine Cloth', kind: 'cloth' },
    { templateId: 34n, regionId: 2n, rarity: 'common', name: 'Dune Hide', kind: 'hide' },
    { templateId: 35n, regionId: 2n, rarity: 'uncommon', name: 'Reed Wood', kind: 'wood' },
    { templateId: 40n, regionId: 1n, rarity: 'common', name: 'Frost Ore', kind: 'metal' },
  ];

  it('keeps at most 4 per region, rarest first then ascending template id', () => {
    const out = foreignOffer(mats);
    expect(out.filter((m) => m.regionId === 2n).map((m) => m.templateId)).toEqual([32n, 31n, 35n, 30n]);
    expect(out.filter((m) => m.regionId === 1n).map((m) => m.templateId)).toEqual([40n]);
  });

  it('lists regions in ascending id order', () => {
    expect(foreignOffer(mats).map((m) => m.regionId)).toEqual([1n, 2n, 2n, 2n, 2n]);
  });

  it('ignores input order', () => {
    const expected = foreignOffer(mats);
    for (let seed = 1; seed <= 12; seed++) {
      expect(foreignOffer(shuffled(mats, seed))).toEqual(expected);
    }
  });

  it('drops a repeated template id and returns an empty list for odd input', () => {
    expect(foreignOffer([mats[0], mats[0]])).toHaveLength(1);
    expect(foreignOffer([])).toEqual([]);
    expect(foreignOffer(undefined as unknown as [])).toEqual([]);
  });
});

describe('categoryForKind', () => {
  it('maps a primary kind to its recipe category', () => {
    expect(categoryForKind('metal')).toBe('weapon');
    expect(categoryForKind('hide')).toBe('armor');
    expect(categoryForKind('cloth')).toBe('armor');
    expect(categoryForKind('trinket')).toBe('accessory');
    expect(categoryForKind('edible')).toBe('consumable');
  });

  it('gives null for secondary-only kinds and unknown kinds', () => {
    expect(categoryForKind('wood')).toBeNull();
    expect(categoryForKind('base')).toBeNull();
    expect(categoryForKind('nonsense')).toBeNull();
    expect(categoryForKind('constructor')).toBeNull();
  });
});
