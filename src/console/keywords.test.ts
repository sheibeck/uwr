import { describe, expect, it } from 'vitest';
import { KEYWORD_LIMIT, buildVocabulary, findKeywords, foldText } from './keywords';

const empty = { npcs: [], places: [], nodes: [], players: [] };
const vocab = (over: Partial<Parameters<typeof buildVocabulary>[0]>) => buildVocabulary({ ...empty, ...over });
const summary = (parts: { text: string; entry: { kind: string } | null }[]) =>
  parts.map((p) => (p.entry ? `[${p.entry.kind}:${p.text}]` : p.text));

describe('findKeywords', () => {
  it('finds npc and node names in a sentence', () => {
    const v = vocab({ npcs: [{ id: 1n, name: 'Ferryman' }], nodes: [{ id: 2n, name: 'Old Well' }] });
    const parts = findKeywords('You see the Ferryman by the Old Well.', v);
    expect(parts.map((p) => p.text)).toEqual(['You see the ', 'Ferryman', ' by the ', 'Old Well', '.']);
    expect(parts[1].entry).toEqual({ kind: 'npc', id: 1n, name: 'Ferryman' });
    expect(parts[3].entry).toEqual({ kind: 'node', id: 2n, name: 'Old Well' });
    expect(parts[0].entry).toBeNull();
  });

  it('is case-insensitive and keeps the original casing', () => {
    const v = vocab({ npcs: [{ id: 1n, name: 'Ferryman' }] });
    const parts = findKeywords('the ferryman', v);
    expect(parts[1]).toMatchObject({ text: 'ferryman', entry: { name: 'Ferryman' } });
  });

  it('matches whole words only', () => {
    const v = vocab({ npcs: [{ id: 1n, name: 'Ferryman' }] });
    expect(findKeywords('Ferrymanship', v).every((p) => p.entry === null)).toBe(true);
    expect(summary(findKeywords("Ferryman's boat", v))).toEqual(['[npc:Ferryman]', "'s boat"]);
    expect(findKeywords('xFerryman', v).every((p) => p.entry === null)).toBe(true);
  });

  it('prefers the longest name', () => {
    const v = vocab({
      places: [
        { id: 1n, name: 'Gloam' },
        { id: 2n, name: 'Gloamwood' },
      ],
    });
    const parts = findKeywords('to Gloamwood', v);
    expect(summary(parts)).toEqual(['to ', '[place:Gloamwood]']);
    expect(parts[1].entry?.id).toBe(2n);
  });

  it('finds every occurrence', () => {
    const v = vocab({ npcs: [{ id: 1n, name: 'Mara' }] });
    expect(findKeywords('Mara and Mara', v).filter((p) => p.entry)).toHaveLength(2);
  });

  it('resolves duplicate names by kind priority', () => {
    const v = vocab({
      players: [{ id: 4n, name: 'Ember' }],
      nodes: [{ id: 3n, name: 'Ember' }],
      places: [{ id: 2n, name: 'Ember' }],
      npcs: [{ id: 1n, name: 'Ember' }],
    });
    expect(v.size).toBe(1);
    expect(findKeywords('Ember', v)[0].entry?.kind).toBe('npc');
    const v2 = vocab({ players: [{ id: 4n, name: 'Ember' }], nodes: [{ id: 3n, name: 'Ember' }] });
    expect(findKeywords('Ember', v2)[0].entry?.kind).toBe('node');
  });

  it('drops the self name, empty names and whitespace names', () => {
    const v = vocab({
      players: [
        { id: 1n, name: 'Me' },
        { id: 2n, name: '   ' },
        { id: 3n, name: '' },
        { id: 4n, name: 'Bo' },
      ],
      selfName: 'me',
    });
    expect(v.size).toBe(1);
    expect(findKeywords('Me and Bo', v).filter((p) => p.entry).map((p) => p.text)).toEqual(['Bo']);
  });

  it('caps the vocabulary and keeps higher-priority kinds', () => {
    const many = (prefix: string, n: number) =>
      Array.from({ length: n }, (_, i) => ({ id: BigInt(i), name: `${prefix}${i}x` }));
    const v = vocab({ npcs: many('n', 150), places: many('p', 150), nodes: many('o', 50) });
    expect(v.size).toBe(KEYWORD_LIMIT);
    expect(findKeywords('n0x', v)[0].entry?.kind).toBe('npc');
    expect(findKeywords('p49x', v)[0].entry?.kind).toBe('place');
    expect(findKeywords('p50x', v).every((p) => p.entry === null)).toBe(true);
  });

  it('treats curly and straight apostrophes alike', () => {
    const v = vocab({ places: [{ id: 1n, name: "Mara's Rest" }] });
    expect(findKeywords('at Mara’s Rest', v)[1].entry?.kind).toBe('place');
    const v2 = vocab({ places: [{ id: 1n, name: 'Mara’s Rest' }] });
    expect(findKeywords("at Mara's Rest", v2)[1].entry?.kind).toBe('place');
  });

  it('keeps index alignment across length-changing case folds', () => {
    const v = vocab({ places: [{ id: 1n, name: 'Ferry' }] });
    const text = 'İstanbul and Ferry here';
    const parts = findKeywords(text, v);
    expect(parts.map((p) => p.text).join('')).toBe(text);
    expect(parts.filter((p) => p.entry).map((p) => p.text)).toEqual(['Ferry']);
    expect(foldText('İ').length).toBe(1);
  });

  it('matches names with regex metacharacters literally', () => {
    const v = vocab({
      places: [
        { id: 1n, name: 'C++' },
        { id: 2n, name: 'Mara (the Elder)' },
        { id: 3n, name: 'St.' },
      ],
    });
    expect(summary(findKeywords('use C++ now', v))).toEqual(['use ', '[place:C++]', ' now']);
    expect(findKeywords('see Mara (the Elder).', v).some((p) => p.entry?.id === 2n)).toBe(true);
    expect(findKeywords('see St. Anne', v).some((p) => p.entry?.id === 3n)).toBe(true);
    expect(findKeywords('use C+ now', v).every((p) => p.entry === null)).toBe(true);
  });

  it('skips the boundary check on a non-word edge', () => {
    const v = vocab({ places: [{ id: 1n, name: 'C++' }] });
    expect(findKeywords('C++x', v).some((p) => p.entry)).toBe(true);
  });

  it('matches non-Latin names with unicode boundaries', () => {
    const v = vocab({ npcs: [{ id: 1n, name: 'Мара' }] });
    expect(findKeywords('это Мара.', v).some((p) => p.entry)).toBe(true);
    expect(findKeywords('этоМара', v).every((p) => p.entry === null)).toBe(true);
  });

  it('is total on hostile input', () => {
    const v = vocab({
      npcs: [
        { id: 1n, name: 'Mara' },
        { id: 2n, name: '\ud800' },
        { id: 3n, name: '(((' },
        { id: 4n, name: '\\' },
        { id: 5n, name: '😀 Smile' },
      ],
    });
    const inputs = [
      '',
      'Mara',
      'a'.repeat(5000),
      'Mara '.repeat(1000),
      '\ud800 lone \udc00 surrogates Mara',
      '((( \\ )))',
      '😀 Smile 😀 Smiley',
      '\u0000 \n\t',
    ];
    for (const input of inputs) {
      const parts = findKeywords(input, v);
      expect(parts.map((p) => p.text).join('')).toBe(input);
    }
    expect(findKeywords('', v)).toEqual([]);
  });

  it('returns one plain part for an empty vocabulary', () => {
    expect(findKeywords('Mara walks', vocab({}))).toEqual([{ text: 'Mara walks', entry: null }]);
  });

  it('does not throw on a malformed vocabulary', () => {
    expect(findKeywords('x', {} as never)).toEqual([{ text: 'x', entry: null }]);
    expect(findKeywords('x', null as never)).toEqual([{ text: 'x', entry: null }]);
  });
});

describe('foldText', () => {
  it('keeps the UTF-16 length', () => {
    for (const s of ['İstanbul', 'ΑΣ', 'ß', '😀', '\ud800', 'It’s']) {
      expect(foldText(s).length).toBe(s.length);
    }
  });
});
