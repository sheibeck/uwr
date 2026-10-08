import { describe, expect, it } from 'vitest';
import { formatLootLine, LOOT_DROPPED_LEAD, parseLootLine } from '@game-data/loot_line';
import { keywordActionLabel } from './keywordLabel';
import { lootParts, lootPlainText, TAKE_ALL_ENTRY_NAME } from './lootLine';

// Quick 261008-f3m: loot pieces from the real server grammar become keyword parts that are
// clickable only for ids still in my_combat_loot.

const TEMPLATES = new Map<bigint, { name: string; rarity: string }>([
  [7n, { name: 'Rusty Dagger', rarity: 'common' }],
  [8n, { name: 'Wolf Pelt', rarity: 'common' }],
]);
const LINE = formatLootLine(
  LOOT_DROPPED_LEAD,
  [
    { id: 41n, itemTemplateId: 7n },
    { id: 42n, itemTemplateId: 8n, qualityTier: 'uncommon' },
  ],
  (id) => TEMPLATES.get(id),
)!;
const PIECES = parseLootLine(LINE)!;

describe('keywordActionLabel for loot', () => {
  it('an item reads Take {item}', () => {
    expect(keywordActionLabel({ kind: 'loot', id: 41n, name: 'Rusty Dagger' })).toBe('Take Rusty Dagger');
  });
  it('take all reads Take all loot', () => {
    expect(keywordActionLabel({ kind: 'lootAll', id: 0n, name: TAKE_ALL_ENTRY_NAME })).toBe('Take all loot');
  });
});

describe('lootPlainText', () => {
  it('draws items and take-all in brackets', () => {
    expect(lootPlainText(PIECES)).toBe('Loot dropped: [Rusty Dagger], [Wolf Pelt] [Take all]');
  });
});

describe('lootParts', () => {
  it('only an available id is a loot entry; take-all follows the line\'s own ids', () => {
    const parts = lootParts(PIECES, new Set([41n]));
    expect(parts.map((p) => p.text).join('')).toBe('Loot dropped: [Rusty Dagger], [Wolf Pelt] [Take all]');
    const dagger = parts.find((p) => p.text === '[Rusty Dagger]')!;
    expect(dagger.entry).toEqual({ kind: 'loot', id: 41n, name: 'Rusty Dagger' });
    expect(dagger.rarity).toBe('common');
    const pelt = parts.find((p) => p.text === '[Wolf Pelt]')!;
    expect(pelt.entry).toBeNull();
    expect(pelt.rarity).toBe('uncommon');
    const all = parts.find((p) => p.text === '[Take all]')!;
    expect(all.entry).toEqual({ kind: 'lootAll', id: 0n, name: TAKE_ALL_ENTRY_NAME });
    expect(all.rarity).toBeUndefined();
    for (const part of parts.filter((p) => !p.text.startsWith('['))) expect(part.entry).toBeNull();
  });

  it('with nothing available every entry is null and the text and rarity stay', () => {
    const parts = lootParts(PIECES, new Set());
    expect(parts.every((p) => p.entry === null)).toBe(true);
    expect(parts.map((p) => p.text).join('')).toBe('Loot dropped: [Rusty Dagger], [Wolf Pelt] [Take all]');
    expect(parts.find((p) => p.text === '[Wolf Pelt]')!.rarity).toBe('uncommon');
  });

  it('a row of another fight enables nothing in this line', () => {
    const parts = lootParts(PIECES, new Set([99n]));
    expect(parts.every((p) => p.entry === null)).toBe(true);
  });
});
