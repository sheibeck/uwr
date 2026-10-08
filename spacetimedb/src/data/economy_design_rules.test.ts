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
