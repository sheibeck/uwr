/**
 * Quick 261008-f3m: the one loot-line grammar shared by the server writer and the client parser.
 * format -> parse -> strip round trip, name cleaning, rarity rules, and hostile input.
 */
import { describe, it, expect } from 'vitest';
import {
  LOOT_DROPPED_LEAD,
  LOOT_AVAILABLE_LEAD,
  TAKE_ALL_LABEL,
  LOOT_NAME_MAX,
  cleanLootName,
  formatLootLine,
  parseLootLine,
  stripLootTokens,
} from './loot_line';

const TEMPLATES = new Map<bigint, { name: string; rarity?: string | null }>([
  [7n, { name: 'Rusty Dagger', rarity: 'common' }],
  [8n, { name: 'Wolf Pelt', rarity: 'common' }],
  [9n, { name: 'Moon Pearl', rarity: 'rare' }],
  [10n, { name: '[]{}' }],
  [11n, { name: 'Odd Stone', rarity: 'Mythic' }],
  [12n, { name: 'Blank Stone', rarity: '' }],
]);
const templateOf = (id: bigint) => TEMPLATES.get(id);

const DAGGER = { id: 41n, itemTemplateId: 7n };
const PELT = { id: 42n, itemTemplateId: 8n, qualityTier: 'Uncommon' };
const LINE =
  'Loot dropped: {{loot:41:common}}Rusty Dagger{{/loot}}, {{loot:42:uncommon}}Wolf Pelt{{/loot}} {{lootall}}Take all{{/lootall}}';

describe('constants', () => {
  it('names the leads, the take-all label and the name cap', () => {
    expect(LOOT_DROPPED_LEAD).toBe('Loot dropped:');
    expect(LOOT_AVAILABLE_LEAD).toBe('Loot available:');
    expect(TAKE_ALL_LABEL).toBe('Take all');
    expect(LOOT_NAME_MAX).toBe(80);
  });
});

describe('cleanLootName', () => {
  it('removes brackets and braces and turns control characters into spaces', () => {
    expect(cleanLootName('Bad]{{/loot}} Na\nme[')).toBe('Bad/loot Na me');
  });
  it('collapses whitespace and trims', () => {
    expect(cleanLootName('  Wolf \r\n\t  Pelt  ')).toBe('Wolf Pelt');
  });
  it('cuts a long name to LOOT_NAME_MAX', () => {
    expect(cleanLootName('a'.repeat(300))).toHaveLength(80);
  });
  it('gives an empty string for a non-string', () => {
    expect(cleanLootName(undefined)).toBe('');
    expect(cleanLootName(42)).toBe('');
    expect(cleanLootName(null)).toBe('');
  });
});

describe('formatLootLine', () => {
  it('writes one line of item tokens followed by the take-all token', () => {
    expect(formatLootLine(LOOT_DROPPED_LEAD, [DAGGER, PELT], templateOf)).toBe(LINE);
  });

  it('qualityTier wins over the template rarity, lowercased', () => {
    const line = formatLootLine(LOOT_DROPPED_LEAD, [{ id: 5n, itemTemplateId: 9n, qualityTier: 'EPIC' }], templateOf);
    expect(line).toContain('{{loot:5:epic}}Moon Pearl{{/loot}}');
  });

  it('falls back to the template rarity when there is no qualityTier', () => {
    const line = formatLootLine(LOOT_DROPPED_LEAD, [{ id: 5n, itemTemplateId: 9n, qualityTier: null }], templateOf);
    expect(line).toContain('{{loot:5:rare}}Moon Pearl{{/loot}}');
  });

  it("an unknown rarity, '' and a missing rarity all become common", () => {
    const line = formatLootLine(
      LOOT_DROPPED_LEAD,
      [
        { id: 1n, itemTemplateId: 11n },
        { id: 2n, itemTemplateId: 12n },
        { id: 3n, itemTemplateId: 9n, qualityTier: 'mythic' },
      ],
      templateOf,
    );
    expect(line).toContain('{{loot:1:common}}Odd Stone{{/loot}}');
    expect(line).toContain('{{loot:2:common}}Blank Stone{{/loot}}');
    expect(line).toContain('{{loot:3:common}}Moon Pearl{{/loot}}');
  });

  it('skips a row whose template is missing or whose cleaned name is empty', () => {
    const line = formatLootLine(
      LOOT_DROPPED_LEAD,
      [{ id: 1n, itemTemplateId: 999n }, { id: 2n, itemTemplateId: 10n }, DAGGER],
      templateOf,
    );
    expect(line).toBe(
      'Loot dropped: {{loot:41:common}}Rusty Dagger{{/loot}} {{lootall}}Take all{{/lootall}}',
    );
  });

  it('returns null when every row is skipped, and for an empty list', () => {
    expect(formatLootLine(LOOT_DROPPED_LEAD, [{ id: 1n, itemTemplateId: 999n }], templateOf)).toBeNull();
    expect(formatLootLine(LOOT_DROPPED_LEAD, [], templateOf)).toBeNull();
  });

  it('has no newline, no hex color and never "Take " before an item name', () => {
    const line = formatLootLine(LOOT_AVAILABLE_LEAD, [DAGGER, PELT], templateOf)!;
    expect(line.startsWith('Loot available: ')).toBe(true);
    expect(line).not.toContain('\n');
    expect(line).not.toContain('#');
    expect(line).not.toMatch(/Take (Rusty Dagger|Wolf Pelt)/);
  });

  it('cleans a hostile name before it goes into the token', () => {
    const line = formatLootLine(
      LOOT_DROPPED_LEAD,
      [{ id: 3n, itemTemplateId: 1n }],
      () => ({ name: 'Bad]{{/loot}} Na\nme[' }),
    )!;
    expect(line).toContain('{{loot:3:common}}Bad/loot Na me{{/loot}}');
    expect(parseLootLine(line)!.filter((p) => p.kind === 'item')).toHaveLength(1);
  });
});

describe('parseLootLine', () => {
  it('splits the formatted line into text, item and take-all pieces in order', () => {
    expect(parseLootLine(LINE)).toEqual([
      { kind: 'text', text: 'Loot dropped: ' },
      { kind: 'item', lootId: 41n, rarity: 'common', name: 'Rusty Dagger' },
      { kind: 'text', text: ', ' },
      { kind: 'item', lootId: 42n, rarity: 'uncommon', name: 'Wolf Pelt' },
      { kind: 'text', text: ' ' },
      { kind: 'takeAll', label: 'Take all' },
    ]);
  });

  it.each([
    ['plain text', 'You gain 5 gold.'],
    ['the legacy color form', '{{color:#fff}}[Take Rusty Dagger]{{/color}}'],
    ['a take-all token alone', 'Loot: {{lootall}}Take all{{/lootall}}'],
    ['an empty string', ''],
  ])('returns null for %s', (_label, raw) => {
    expect(parseLootLine(raw)).toBeNull();
  });

  it('returns null for a non-string', () => {
    expect(parseLootLine(undefined)).toBeNull();
    expect(parseLootLine(42)).toBeNull();
    expect(parseLootLine({ message: LINE })).toBeNull();
  });

  it('keeps malformed tokens as literal text next to a good one', () => {
    const bad1 = '{{loot:x1:rare}}A{{/loot}}';
    const bad2 = `{{loot:${'1'.repeat(21)}:rare}}B{{/loot}}`;
    const pieces = parseLootLine(`${bad1} ${bad2} {{loot:7:rare}}Good{{/loot}}`)!;
    expect(pieces).toEqual([
      { kind: 'text', text: `${bad1} ${bad2} ` },
      { kind: 'item', lootId: 7n, rarity: 'rare', name: 'Good' },
    ]);
  });

  it('an unknown rarity inside a token parses as common', () => {
    const pieces = parseLootLine('{{loot:5:mythic}}Odd{{/loot}}')!;
    expect(pieces).toEqual([{ kind: 'item', lootId: 5n, rarity: 'common', name: 'Odd' }]);
  });

  it('trims the start of the first text piece and the end of the last one', () => {
    const pieces = parseLootLine('  Lead: {{loot:5:rare}}A{{/loot}} tail  ')!;
    expect(pieces).toEqual([
      { kind: 'text', text: 'Lead: ' },
      { kind: 'item', lootId: 5n, rarity: 'rare', name: 'A' },
      { kind: 'text', text: ' tail' },
    ]);
  });

  it('a 20,000-character hostile string does not throw and returns null', () => {
    const hostile = '{{loot:1:'.repeat(Math.ceil(20_000 / 9)).slice(0, 20_000);
    expect(() => parseLootLine(hostile)).not.toThrow();
    expect(parseLootLine(hostile)).toBeNull();
  });

  it('parses the same line twice in a row (the shared regex resets)', () => {
    expect(parseLootLine(LINE)).toEqual(parseLootLine(LINE));
  });
});

describe('stripLootTokens', () => {
  it('turns item tokens into names and removes the take-all token with its space', () => {
    expect(stripLootTokens(LINE)).toBe('Loot dropped: Rusty Dagger, Wolf Pelt');
  });
  it('leaves a string with no tokens unchanged', () => {
    expect(stripLootTokens('You receive Rusty Dagger.')).toBe('You receive Rusty Dagger.');
  });
});
