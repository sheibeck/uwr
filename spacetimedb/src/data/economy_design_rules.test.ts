// economy_design_rules.test.ts
// Phase 51.3 plan 02. The pure design rules of a region economy: names, recipe tiers, cross-region
// requirements and the numbers of every generated item (SC2, SC3).
import { describe, it, expect, vi, beforeAll } from 'vitest';
import { readFileSync } from 'node:fs';
import { recordedTable } from '../helpers/schema_recorder';
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
  RARITY_STAT_PCT,
  scaleStat,
  materialItemTier,
  materialTemplate,
  trophyTemplate,
  repairGear,
  gearTemplate,
  regionalOutputTemplate,
  armorSlotFromName,
  scrollTemplate,
  REGION_ECONOMY_SIZES,
  REGION_ECONOMY_SIZE,
  gatherSlotsForSize,
  recipeTierSlotsForSize,
  familyRef,
  memberRef,
  economyFamilies,
  type RegionEconomyInput,
} from './economy_design_rules';
import {
  ARMOR_FORMS,
  FOOD_DURATION_MICROS,
  FOOD_FORMS,
  MATERIAL_KIND_VALUES,
  WEAPON_FORMS,
  armorGrowth,
  levelStep,
  weaponGrowth,
} from './recipe_rules';
import { BASIC_RESOURCE_DEFS, JUNK_DEFS } from './equipment_rules';

vi.mock('spacetimedb/server', async () =>
  (await import('../helpers/schema_recorder')).createRecordingServerMock(),
);


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
      'families[].familyId',
      'families[].members[].templateId',
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

describe('economy size (D-50, D-57: a named constant)', () => {
  it("small is today's three gatherables and three recipes; medium five and five; large seven and seven", () => {
    expect(REGION_ECONOMY_SIZES.small).toEqual({ gatherSlots: ['common', 'uncommon', 'rare'], recipes: 3 });
    expect(REGION_ECONOMY_SIZES.medium).toEqual({
      gatherSlots: ['common', 'common', 'uncommon', 'uncommon', 'rare'],
      recipes: 5,
    });
    expect(REGION_ECONOMY_SIZES.large).toEqual({
      gatherSlots: ['common', 'common', 'common', 'uncommon', 'uncommon', 'rare', 'rare'],
      recipes: 7,
    });
    expect(Object.keys(REGION_ECONOMY_SIZES)).toEqual(['small', 'medium', 'large']);
  });

  it('is frozen all the way down', () => {
    expect(Object.isFrozen(REGION_ECONOMY_SIZES)).toBe(true);
    for (const size of Object.values(REGION_ECONOMY_SIZES)) {
      expect(Object.isFrozen(size)).toBe(true);
      expect(Object.isFrozen(size.gatherSlots)).toBe(true);
    }
  });

  it('the server sets small today', () => {
    expect(REGION_ECONOMY_SIZE).toBe('small');
  });

  it('REGION_ECONOMY_COUNTS takes its gatherables and recipes from the size', () => {
    expect(REGION_ECONOMY_COUNTS.gatherables).toBe(REGION_ECONOMY_SIZES[REGION_ECONOMY_SIZE].gatherSlots.length);
    expect(REGION_ECONOMY_COUNTS.recipes).toBe(REGION_ECONOMY_SIZES[REGION_ECONOMY_SIZE].recipes);
  });

  it('gatherSlotsForSize returns a fresh copy of the slots, small for an unknown size', () => {
    expect(gatherSlotsForSize('small')).toEqual(['common', 'uncommon', 'rare']);
    expect(gatherSlotsForSize('medium')).toEqual(['common', 'common', 'uncommon', 'uncommon', 'rare']);
    expect(gatherSlotsForSize('large')).toHaveLength(7);
    expect(gatherSlotsForSize('huge')).toEqual(['common', 'uncommon', 'rare']);
    expect(gatherSlotsForSize('constructor')).toEqual(['common', 'uncommon', 'rare']);
    const copy = gatherSlotsForSize('small');
    copy.push('epic');
    expect(gatherSlotsForSize('small')).toHaveLength(3);
  });

  it('recipeTierSlotsForSize with three recipes equals recipeTierSlots', () => {
    for (let k = 0n; k <= 4n; k++) expect(recipeTierSlotsForSize(k, 3)).toEqual(recipeTierSlots(k));
  });

  it('a fourth and later recipe alternates common and uncommon', () => {
    expect(recipeTierSlotsForSize(2n, 5)).toEqual(['uncommon', 'rare', 'epic', 'common', 'uncommon']);
    expect(recipeTierSlotsForSize(0n, 7)).toEqual([
      'common',
      'common',
      'uncommon',
      'common',
      'uncommon',
      'common',
      'uncommon',
    ]);
    expect(recipeTierSlotsForSize(3n, 7)).toEqual([
      'uncommon',
      'epic',
      'legendary',
      'common',
      'uncommon',
      'common',
      'uncommon',
    ]);
  });

  it('a count below three keeps the first tiers; a non-integer count reads as three', () => {
    expect(recipeTierSlotsForSize(1n, 2)).toEqual(['common', 'uncommon']);
    expect(recipeTierSlotsForSize(1n, 0)).toEqual([]);
    expect(recipeTierSlotsForSize(1n, -4)).toEqual([]);
    expect(recipeTierSlotsForSize(1n, Number.NaN)).toEqual(recipeTierSlots(1n));
  });
});

describe('family handles (D-47)', () => {
  it('familyRef takes a zero-based position', () => {
    expect(familyRef(0)).toBe('E1');
    expect(familyRef(2)).toBe('E3');
  });

  it('memberRef uses the prompt role word: healer is support', () => {
    expect(memberRef('E1', 'tank')).toBe('E1.tank');
    expect(memberRef('E1', 'damage')).toBe('E1.damage');
    expect(memberRef('E1', 'healer')).toBe('E1.support');
    expect(memberRef('E2', 'caster')).toBe('E2.caster');
    expect(memberRef('E1', 'support')).toBe('E1.support');
  });

  it('a second member of the same role gets a number', () => {
    expect(memberRef('E1', 'damage', 1)).toBe('E1.damage2');
    expect(memberRef('E1', 'healer', 2)).toBe('E1.support3');
  });
});

describe('economyFamilies: the families of a stored input', () => {
  const base = (over: Partial<RegionEconomyInput>): RegionEconomyInput => ({
    mode: 'region',
    regionId: 1n,
    regionName: 'Kesterlane Basin',
    biome: 'coastal',
    areaLevel: 1,
    dominantFaction: 'unknown',
    landmarks: [],
    threats: [],
    terrains: ['swamp'],
    enemies: [],
    recipeSlots: [],
    foreignRegions: [],
    foreign: [],
    existingMaterials: [],
    ...over,
  });

  it('returns the stored families as they are', () => {
    const families = [
      {
        ref: 'E1',
        familyId: 7n,
        name: 'Salt-Crust Skitterers',
        creatureType: 'beast',
        level: 1,
        members: [{ ref: 'E1.tank', templateId: 101n, role: 'tank', name: 'Skitter Shellback' }],
      },
    ];
    expect(economyFamilies(base({ families }))).toEqual(families);
  });

  it('a 51.3 input with enemies and no families reads as families of one', () => {
    const input = base({
      enemies: [
        { ref: 'E1', templateId: 101n, name: 'Salt-Crust Skitterer', creatureType: 'beast', level: 1 },
        { ref: 'E2', templateId: 102n, name: 'Brine Sentinel', creatureType: 'construct', level: 2 },
      ],
    });
    expect(economyFamilies(input)).toEqual([
      {
        ref: 'E1',
        familyId: 0n,
        name: 'Salt-Crust Skitterer',
        creatureType: 'beast',
        level: 1,
        members: [{ ref: 'E1.damage', templateId: 101n, role: 'damage', name: 'Salt-Crust Skitterer' }],
      },
      {
        ref: 'E2',
        familyId: 0n,
        name: 'Brine Sentinel',
        creatureType: 'construct',
        level: 2,
        members: [{ ref: 'E2.damage', templateId: 102n, role: 'damage', name: 'Brine Sentinel' }],
      },
    ]);
  });

  it('never throws on a partial or hostile stored input', () => {
    expect(economyFamilies({} as RegionEconomyInput)).toEqual([]);
    expect(economyFamilies(null as unknown as RegionEconomyInput)).toEqual([]);
    expect(economyFamilies({ enemies: [null, 3, { ref: 'E1' }] } as unknown as RegionEconomyInput)).toHaveLength(1);
    expect(economyFamilies({ families: [null, 'x'] } as unknown as RegionEconomyInput)).toEqual([]);
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

// ---------------------------------------------------------------------------
// Task 3: item template builders
// ---------------------------------------------------------------------------

let itemTemplateColumns: string[] = [];

beforeAll(async () => {
  await import('../schema/tables');
  itemTemplateColumns = Object.keys(recordedTable('item_template')!.cols).filter((c) => c !== 'id');
});

describe('RARITY_STAT_PCT and scaleStat', () => {
  it('holds the stat factor of each rarity', () => {
    expect(RARITY_STAT_PCT).toEqual({
      common: 100n,
      uncommon: 110n,
      rare: 125n,
      epic: 145n,
      legendary: 170n,
    });
  });

  it('floors the scaled value and treats an unknown rarity as common', () => {
    expect(scaleStat(16n, 'legendary')).toBe(27n);
    expect(scaleStat(16n, 'common')).toBe(16n);
    expect(scaleStat(5n, 'uncommon')).toBe(5n);
    expect(scaleStat(10n, 'uncommon')).toBe(11n);
    expect(scaleStat(16n, 'mythic')).toBe(16n);
    expect(scaleStat(16n, 'constructor')).toBe(16n);
  });
});

describe('materialItemTier', () => {
  it('is max(1, level / 3)', () => {
    expect(materialItemTier(1n)).toBe(1n);
    expect(materialItemTier(5n)).toBe(1n);
    expect(materialItemTier(7n)).toBe(2n);
    expect(materialItemTier(30n)).toBe(10n);
    expect(materialItemTier(0n)).toBe(1n);
  });
});

describe('materialTemplate', () => {
  it('builds a stackable material from rarity and area level', () => {
    const t = materialTemplate({ name: 'Ember Moss', description: 'A glowing moss.', rarity: 'uncommon', areaLevel: 7n });
    expect(t).toMatchObject({
      name: 'Ember Moss',
      slot: 'material',
      armorType: 'none',
      rarity: 'uncommon',
      tier: 2n,
      isJunk: false,
      vendorValue: 4n + 7n / 3n,
      requiredLevel: 1n,
      allowedClasses: 'any',
      weaponType: '',
      stackable: true,
      description: 'A glowing moss.',
    });
    for (const stat of [
      'strBonus',
      'dexBonus',
      'chaBonus',
      'wisBonus',
      'intBonus',
      'hpBonus',
      'manaBonus',
      'armorClassBonus',
      'magicResistanceBonus',
      'weaponBaseDamage',
      'weaponDps',
      'wellFedDurationMicros',
      'wellFedBuffMagnitude',
    ] as const) {
      expect(t[stat]).toBe(0n);
    }
    expect(t.wellFedBuffType).toBe('');
  });

  it('values a rarer material higher', () => {
    const v = (rarity: string) => materialTemplate({ name: 'X Y', description: '', rarity, areaLevel: 1n }).vendorValue;
    expect(v('common')).toBe(2n);
    expect(v('uncommon')).toBe(4n);
    expect(v('rare')).toBe(8n);
    expect(v('epic')).toBe(16n);
    expect(v('legendary')).toBe(32n);
  });

  it('cleans the description and falls back to a rule description', () => {
    expect(materialTemplate({ name: 'X Y', description: 'A [pale] <glow>.', rarity: 'common', areaLevel: 1n }).description).toBe(
      'A pale glow.',
    );
    expect(materialTemplate({ name: 'X Y', description: '  ', rarity: 'common', areaLevel: 1n, kind: 'metal' }).description).toBe(
      'A metal material found in this region.',
    );
    expect(materialTemplate({ name: 'X Y', description: '', rarity: 'common', areaLevel: 1n }).description).toBe(
      'A material found in this region.',
    );
  });
});

describe('trophyTemplate', () => {
  it('builds a stackable junk trophy', () => {
    const t = trophyTemplate({ name: 'Wolf Fang', description: 'A fang.', level: 6n });
    expect(t).toMatchObject({
      slot: 'junk',
      isJunk: true,
      rarity: 'common',
      tier: 1n,
      stackable: true,
      vendorValue: 2n + 3n,
      requiredLevel: 1n,
      description: 'A fang.',
    });
    expect(trophyTemplate({ name: 'Wolf Fang', description: '', level: 1n }).vendorValue).toBeGreaterThanOrEqual(2n);
    expect(trophyTemplate({ name: 'Wolf Fang', description: '', level: 1n }).description).toBe(
      'A keepsake taken from a fallen foe.',
    );
  });
});

describe('repairGear', () => {
  it('gives a sword with no armor type for a weapon with a bad weapon type or armor', () => {
    expect(repairGear({ slot: 'weapon', weaponType: 'none', armorType: 'plate' })).toEqual({
      slot: 'weapon',
      weaponType: 'sword',
      armorType: 'none',
    });
    expect(repairGear({ slot: 'weapon', weaponType: 'axe', armorType: 'none' })).toMatchObject({ weaponType: 'axe' });
  });

  it('gives leather and no weapon for an armor slot with a bad armor type', () => {
    expect(repairGear({ slot: 'legs', weaponType: 'axe', armorType: 'none' })).toEqual({
      slot: 'legs',
      weaponType: 'none',
      armorType: 'leather',
    });
    expect(repairGear({ slot: 'boots', weaponType: '', armorType: 'plate' })).toEqual({
      slot: 'boots',
      weaponType: 'none',
      armorType: 'plate',
    });
  });

  it('gives a sword for an unknown slot', () => {
    expect(repairGear({ slot: 'head', weaponType: 'bow', armorType: 'chain' })).toEqual({
      slot: 'weapon',
      weaponType: 'sword',
      armorType: 'none',
    });
    expect(repairGear({ slot: 'constructor', weaponType: 'x', armorType: 'y' }).slot).toBe('weapon');
    expect(repairGear(undefined as unknown as { slot: string; weaponType: string; armorType: string }).slot).toBe('weapon');
  });
});

describe('gearTemplate', () => {
  it('builds a level 6 sword from the weapon form and growth', () => {
    const t = gearTemplate({
      name: 'Dune Sword',
      description: 'A pale blade.',
      slot: 'weapon',
      weaponType: 'sword',
      armorType: 'none',
      level: 6n,
    });
    expect(t).toMatchObject({
      slot: 'mainHand',
      weaponType: 'sword',
      armorType: 'none',
      rarity: 'common',
      isJunk: false,
      requiredLevel: 6n,
      allowedClasses: 'any',
      stackable: false,
      tier: 2n,
      vendorValue: 5n + 12n,
      weaponBaseDamage: 6n + weaponGrowth(6n),
      weaponDps: 6n + weaponGrowth(6n) + 1n,
      armorClassBonus: 0n,
    });
  });

  it('builds a level 6 plate chest one step over leather per slot', () => {
    const chest = ARMOR_FORMS[0];
    const t = gearTemplate({
      name: 'Dune Cuirass',
      description: '',
      slot: 'chest',
      weaponType: 'none',
      armorType: 'plate',
      level: 6n,
    });
    expect(t).toMatchObject({ slot: 'chest', armorType: 'plate', weaponType: '', weaponBaseDamage: 0n, weaponDps: 0n });
    expect(t.armorClassBonus).toBe(chest.baseAc.leather + 2n + armorGrowth(6n));
  });

  it('steps cloth, leather, chain and plate in order', () => {
    const ac = (armorType: string) =>
      gearTemplate({ name: 'A B', description: '', slot: 'legs', weaponType: 'none', armorType, level: 1n }).armorClassBonus;
    expect(ac('cloth')).toBe(ARMOR_FORMS[1].baseAc.cloth);
    expect(ac('leather')).toBe(ARMOR_FORMS[1].baseAc.leather);
    expect(ac('chain')).toBe(ARMOR_FORMS[1].baseAc.leather + 1n);
    expect(ac('plate')).toBe(ARMOR_FORMS[1].baseAc.leather + 2n);
  });

  it('repairs a bad slot and uses a rule description when the text is empty', () => {
    const t = gearTemplate({
      name: 'Dune Axe',
      description: '',
      slot: 'helm',
      weaponType: 'axe',
      armorType: 'plate',
      level: 1n,
      regionName: 'Ashfen',
    });
    expect(t.slot).toBe('mainHand');
    expect(t.weaponType).toBe('sword');
    expect(t.description).toBe('A sword carried in Ashfen.');
    expect(
      gearTemplate({ name: 'A B', description: '', slot: 'weapon', weaponType: 'axe', armorType: 'none', level: 1n }).description,
    ).toBe('An axe carried in this region.');
  });

  it('treats a level below 1 as level 1', () => {
    const t = gearTemplate({ name: 'A B', description: '', slot: 'weapon', weaponType: 'sword', armorType: 'none', level: 0n });
    expect(t.requiredLevel).toBe(1n);
    expect(t.weaponBaseDamage).toBe(WEAPON_FORMS[2].baseDamage);
  });
});

describe('regionalOutputTemplate', () => {
  const base = {
    name: 'Saltglass Blade',
    description: 'A blade.',
    primaryKind: 'metal',
    secondaryKind: 'hide',
    index: 0,
    regionId: 1n,
  };

  it('scales a legendary weapon by 170 percent and leaves a common one unscaled', () => {
    const sword = WEAPON_FORMS[2];
    const raw = sword.baseDamage + weaponGrowth(10n);
    const legendary = regionalOutputTemplate({ ...base, category: 'weapon', tier: 'legendary', level: 10n });
    expect(legendary).toMatchObject({ slot: 'mainHand', weaponType: 'sword', rarity: 'legendary', requiredLevel: 10n });
    expect(legendary.weaponBaseDamage).toBe((raw * 170n) / 100n);
    expect(legendary.weaponDps).toBe(((sword.dps + weaponGrowth(10n)) * 170n) / 100n);
    const common = regionalOutputTemplate({ ...base, category: 'weapon', tier: 'common', level: 10n });
    expect(common.weaponBaseDamage).toBe(raw);
    expect(common.rarity).toBe('common');
  });

  it('starts the weapon form by secondary kind', () => {
    const type = (secondaryKind: string) =>
      regionalOutputTemplate({ ...base, secondaryKind, category: 'weapon', tier: 'rare', level: 1n }).weaponType;
    expect(type('cloth')).toBe('dagger');
    expect(type('hide')).toBe('sword');
    expect(type('wood')).toBe('staff');
    expect(type('metal')).toBe('dagger');
  });

  it('builds armor by primary kind and index', () => {
    const t = regionalOutputTemplate({ ...base, category: 'armor', primaryKind: 'hide', tier: 'epic', level: 6n, index: 1 });
    expect(t).toMatchObject({ slot: 'legs', armorType: 'leather', weaponType: '' });
    expect(t.armorClassBonus).toBe(((ARMOR_FORMS[1].baseAc.leather + armorGrowth(6n)) * 145n) / 100n);
    const cloth = regionalOutputTemplate({ ...base, category: 'armor', primaryKind: 'cloth', tier: 'common', level: 1n, index: 5 });
    expect(cloth).toMatchObject({ slot: 'boots', armorType: 'cloth', armorClassBonus: ARMOR_FORMS[2].baseAc.cloth });
  });

  // Review B WR-02: job 8206's "Wickthread Sash" (recipe index 1) shipped as legs; the slot now
  // follows the cleaned name's last armor word, and the index only decides when no word matches.
  it('takes the armor slot from the name: the live "Wickthread Sash" at index 1 is chest', () => {
    const sash = regionalOutputTemplate({ ...base, name: 'Wickthread Sash', category: 'armor', primaryKind: 'cloth', tier: 'common', level: 1n, index: 1 });
    expect(sash).toMatchObject({ slot: 'chest', armorType: 'cloth', armorClassBonus: ARMOR_FORMS[0].baseAc.cloth });
    const jerkin = regionalOutputTemplate({ ...base, name: 'Kesterlane Basin Jerkin', category: 'armor', primaryKind: 'hide', tier: 'common', level: 1n, index: 2 });
    expect(jerkin.slot).toBe('chest');
    const greaves = regionalOutputTemplate({ ...base, name: 'Saltcrust Greaves', category: 'armor', primaryKind: 'hide', tier: 'common', level: 1n, index: 0 });
    expect(greaves.slot).toBe('legs');
    const sandals = regionalOutputTemplate({ ...base, name: 'Dune Sandals', category: 'armor', primaryKind: 'hide', tier: 'common', level: 1n, index: 0 });
    expect(sandals.slot).toBe('boots');
  });

  it('armorSlotFromName reads the last armor word, singular or plural, any case; null when none', () => {
    for (const [name, slot] of [
      ['Wickthread Sash', 'chest'],
      ['Reed Robe', 'chest'],
      ['Glass Vest', 'chest'],
      ['Drowned Watch Cuirass', 'chest'],
      ['Wayfarer Coat', 'chest'],
      ['Brine GREAVES', 'legs'],
      ['Kelp Leggings', 'legs'],
      ['Dune Trousers', 'legs'],
      ['Salt Kilt', 'legs'],
      ['Ash Boots', 'boots'],
      ['Ash Boot', 'boots'],
      ['Reed Sandals', 'boots'],
      ['Sash of Boots', 'boots'],
    ] as const) {
      expect(armorSlotFromName(name), name).toBe(slot);
    }
    expect(armorSlotFromName('Saltglass Blade')).toBeNull();
    expect(armorSlotFromName('')).toBeNull();
    expect(armorSlotFromName(undefined as unknown as string)).toBeNull();
  });

  it('falls back to the index when the name has no armor word', () => {
    const cloak = regionalOutputTemplate({ ...base, name: 'Reed Wrap', category: 'armor', primaryKind: 'cloth', tier: 'common', level: 1n, index: 2 });
    expect(cloak.slot).toBe('boots');
  });

  it('builds an accessory whose stat is picked by region id plus index', () => {
    const stats = ['hpBonus', 'wisBonus', 'intBonus', 'magicResistanceBonus'] as const;
    const baseAmount: Record<string, bigint> = { hpBonus: 3n, wisBonus: 1n, intBonus: 1n, magicResistanceBonus: 1n };
    for (let regionId = 0n; regionId < 4n; regionId++) {
      const t = regionalOutputTemplate({
        ...base,
        category: 'accessory',
        primaryKind: 'trinket',
        secondaryKind: 'cloth',
        tier: 'rare',
        level: 10n,
        index: 1,
        regionId,
      });
      const picked = stats[Number((regionId + 1n) % 4n)];
      expect(t.slot).toBe('neck');
      expect(t[picked]).toBe((baseAmount[picked] * levelStep(10n) * 125n) / 100n);
      for (const other of stats) if (other !== picked) expect(t[other]).toBe(0n);
    }
    expect(
      regionalOutputTemplate({ ...base, category: 'accessory', secondaryKind: 'metal', tier: 'rare', level: 1n }).slot,
    ).toBe('earrings');
  });

  it('builds food with a well fed buff', () => {
    const t = regionalOutputTemplate({ ...base, category: 'consumable', tier: 'common', level: 5n, index: 7 });
    expect(t).toMatchObject({
      slot: 'food',
      stackable: true,
      wellFedBuffType: FOOD_FORMS[2].buffType,
      wellFedDurationMicros: FOOD_DURATION_MICROS,
      wellFedBuffMagnitude: levelStep(5n),
      armorType: 'none',
      weaponType: '',
    });
  });

  it('values by rarity plus level and sets the tier from the level', () => {
    const t = regionalOutputTemplate({ ...base, category: 'weapon', tier: 'epic', level: 9n });
    expect(t.vendorValue).toBe(80n + 9n);
    expect(t.tier).toBe(3n);
    expect(regionalOutputTemplate({ ...base, category: 'weapon', tier: 'rare', level: 9n }).vendorValue).toBe(40n + 9n);
    expect(regionalOutputTemplate({ ...base, category: 'weapon', tier: 'legendary', level: 9n }).vendorValue).toBe(160n + 9n);
    expect(regionalOutputTemplate({ ...base, category: 'weapon', tier: 'uncommon', level: 9n }).vendorValue).toBe(20n + 9n);
    expect(regionalOutputTemplate({ ...base, category: 'weapon', tier: 'common', level: 9n }).vendorValue).toBe(10n + 9n);
  });

  it('gives a rule description when the model text is empty and never throws on an odd category', () => {
    expect(
      regionalOutputTemplate({ ...base, description: '', category: 'weapon', tier: 'rare', level: 1n }).description,
    ).not.toBe('');
    const odd = regionalOutputTemplate({ ...base, category: 'nonsense' as never, tier: 'rare', level: 1n });
    expect(odd.slot).toBe('mainHand');
  });
});

describe('scrollTemplate', () => {
  it('follows the old scroll convention', () => {
    const t = scrollTemplate('Saltglass Blade', 'epic');
    expect(t).toMatchObject({
      name: 'Scroll: Saltglass Blade',
      slot: 'resource',
      armorType: 'none',
      rarity: 'epic',
      tier: 1n,
      isJunk: false,
      requiredLevel: 1n,
      allowedClasses: 'any',
      weaponType: '',
      stackable: true,
      vendorValue: 50n,
      description: 'Teaches the Saltglass Blade crafting recipe when used.',
    });
  });

  it('values a scroll by rarity', () => {
    expect(scrollTemplate('X Y', 'rare').vendorValue).toBe(25n);
    expect(scrollTemplate('X Y', 'epic').vendorValue).toBe(50n);
    expect(scrollTemplate('X Y', 'legendary').vendorValue).toBe(100n);
    expect(scrollTemplate('X Y', 'common').vendorValue).toBe(10n);
  });
});

describe('every builder returns the item_template columns minus id', () => {
  const output = (category: 'weapon' | 'armor' | 'accessory' | 'consumable', primaryKind: string, secondaryKind: string) =>
    regionalOutputTemplate({
      name: 'A B',
      description: '',
      category,
      tier: 'rare',
      primaryKind,
      secondaryKind,
      level: 3n,
      index: 0,
      regionId: 1n,
    });
  const builders: Record<string, () => object> = {
    materialTemplate: () => materialTemplate({ name: 'A B', description: '', rarity: 'rare', areaLevel: 3n }),
    trophyTemplate: () => trophyTemplate({ name: 'A B', description: '', level: 3n }),
    gearWeapon: () =>
      gearTemplate({ name: 'A B', description: '', slot: 'weapon', weaponType: 'axe', armorType: 'none', level: 3n }),
    gearArmor: () =>
      gearTemplate({ name: 'A B', description: '', slot: 'boots', weaponType: 'none', armorType: 'chain', level: 3n }),
    outputWeapon: () => output('weapon', 'metal', 'wood'),
    outputArmor: () => output('armor', 'cloth', 'wood'),
    outputAccessory: () => output('accessory', 'trinket', 'wood'),
    outputConsumable: () => output('consumable', 'edible', 'base'),
    scrollTemplate: () => scrollTemplate('A B', 'rare'),
  };

  it('reads the column list from the recorded schema', () => {
    expect(itemTemplateColumns).toContain('name');
    expect(itemTemplateColumns).toContain('description');
    expect(itemTemplateColumns).not.toContain('id');
  });

  for (const [label, build] of Object.entries(builders)) {
    it(`${label} has exactly the columns of item_template`, () => {
      expect(Object.keys(build()).sort()).toEqual([...itemTemplateColumns].sort());
    });

    it(`${label} has only bigint numbers, never negative`, () => {
      for (const [key, value] of Object.entries(build())) {
        if (typeof value === 'bigint') expect(value >= 0n, key).toBe(true);
        expect(typeof value === 'number', key).toBe(false);
      }
    });
  }
});

describe('purity', () => {
  const source = readFileSync(new URL('./economy_design_rules.ts', import.meta.url), 'utf8');

  it('has no clock and no source of chance in the code', () => {
    const code = source
      .split('\n')
      .filter((line: string) => !/^\s*(\/\/|\*|\/\*)/.test(line))
      .join('\n');
    expect(code).not.toMatch(/Math\.random|Date\.now|new Date|crypto/);
  });

  it('imports only data modules', () => {
    const froms = [...source.matchAll(/from '([^']+)'/g)].map((m) => m[1]);
    expect(froms.length).toBeGreaterThan(0);
    for (const f of froms) {
      expect(f).toMatch(/^\.\/(recipe_rules|crafting_rules|equipment_rules|combat_constants|mechanical_vocabulary|family_rules)$/);
    }
  });
});
