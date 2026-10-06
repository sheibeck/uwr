import { describe, expect, it } from 'vitest';
import { chosenAbilityName, parseAbilityCards } from './abilityCards';

const ability = (over: Record<string, unknown> = {}) => ({
  name: 'Ember Lash',
  description: 'A whip of cinders.',
  kind: 'damage',
  damageType: 'fire',
  targetRule: 'enemy',
  resourceType: 'mana',
  resourceCost: 12,
  castSeconds: 1,
  cooldownSeconds: 8,
  value1: 10,
  ...over,
});

const json = (...items: unknown[]) => JSON.stringify(items);

describe('parseAbilityCards', () => {
  it('gives 3 cards in order with name, description and kind', () => {
    const cards = parseAbilityCards(json(ability({ name: 'A' }), ability({ name: 'B', kind: 'heal' }), ability({ name: 'C', kind: 'pet_command' })));
    expect(cards.map(c => c.name)).toEqual(['A', 'B', 'C']);
    expect(cards[0].description).toBe('A whip of cinders.');
    expect(cards.map(c => c.kind)).toEqual(['damage', 'heal', 'pet_command']);
  });

  it('builds tags from kind, cost and cooldown', () => {
    const [card] = parseAbilityCards(json(ability({ kind: 'damage', resourceType: 'stamina', resourceCost: 12, cooldownSeconds: 8 })));
    expect(card.tags).toEqual(['damage', '12 stamina', '8s cooldown']);
  });

  it('writes kinds in words, with underscores as spaces', () => {
    const [card] = parseAbilityCards(json(ability({ kind: 'pet_command', resourceCost: 0, cooldownSeconds: 0 })));
    expect(card.tags).toEqual(['pet command']);
    const [multi] = parseAbilityCards(json(ability({ kind: 'a_b_c', resourceCost: 0, cooldownSeconds: 0 })));
    expect(multi.tags).toEqual(['a b c']);
  });

  it('leaves out the tags that have no data', () => {
    expect(parseAbilityCards(json(ability({ kind: '', resourceCost: 0, cooldownSeconds: 0 })))[0].tags).toEqual([]);
    expect(parseAbilityCards(json(ability({ resourceCost: 5, resourceType: '' , cooldownSeconds: 0 })))[0].tags).toEqual(['damage']);
    expect(parseAbilityCards(json(ability({ resourceCost: 'many', cooldownSeconds: -1 })))[0].tags).toEqual(['damage']);
    expect(parseAbilityCards(json(ability({ resourceCost: 0, cooldownSeconds: 3 })))[0].tags).toEqual(['damage', '3s cooldown']);
  });

  it('gives the first 3 valid entries when there are more', () => {
    const cards = parseAbilityCards(json(ability({ name: '1' }), ability({ name: '2' }), ability({ name: '3' }), ability({ name: '4' })));
    expect(cards.map(c => c.name)).toEqual(['1', '2', '3']);
  });

  it('skips entries without a non-empty string name and keeps counting valid ones', () => {
    const cards = parseAbilityCards(
      json(ability({ name: '' }), ability({ name: 7 }), null, 'text', ability({ name: undefined }), ability({ name: 'Real' }), ability({ name: 'Two' }), ability({ name: 'Three' }), ability({ name: 'Four' })),
    );
    expect(cards.map(c => c.name)).toEqual(['Real', 'Two', 'Three']);
  });

  it('gives no cards for malformed JSON, a non-array, null or undefined', () => {
    expect(parseAbilityCards('{oops')).toEqual([]);
    expect(parseAbilityCards('{"name":"x"}')).toEqual([]);
    expect(parseAbilityCards('"text"')).toEqual([]);
    expect(parseAbilityCards('null')).toEqual([]);
    expect(parseAbilityCards('')).toEqual([]);
    expect(parseAbilityCards(null)).toEqual([]);
    expect(parseAbilityCards(undefined)).toEqual([]);
    expect(parseAbilityCards('[]')).toEqual([]);
  });

  it('labels the card and sends the name', () => {
    const [card] = parseAbilityCards(json(ability({ name: 'Ember Lash' })));
    expect(card.ariaLabel).toBe('Ember Lash. Start with this ability.');
    expect(card.sends).toBe('Ember Lash');
  });

  it('gives a missing description or kind as empty strings', () => {
    const [card] = parseAbilityCards(json({ name: 'Bare' }));
    expect(card.description).toBe('');
    expect(card.kind).toBe('');
    expect(card.tags).toEqual([]);
  });

  it('keeps markup in a name verbatim', () => {
    const [card] = parseAbilityCards(json(ability({ name: '<b>x</b>', description: '<img src=x onerror=alert(1)>' })));
    expect(card.name).toBe('<b>x</b>');
    expect(card.sends).toBe('<b>x</b>');
    expect(card.ariaLabel).toBe('<b>x</b>. Start with this ability.');
    expect(card.description).toBe('<img src=x onerror=alert(1)>');
  });

  it('gives each card a unique key even when two names repeat', () => {
    const cards = parseAbilityCards(json(ability({ name: 'Same' }), ability({ name: 'Same' }), ability({ name: 'Same' })));
    expect(new Set(cards.map(c => c.key)).size).toBe(3);
  });
});

describe('chosenAbilityName', () => {
  const list = json(ability({ name: 'First' }), { abilityName: 'Second via abilityName' }, ability({ name: 'Third' }));

  it('returns the raw array entry name at the index', () => {
    expect(chosenAbilityName(list, 0n)).toBe('First');
    expect(chosenAbilityName(list, 2n)).toBe('Third');
  });

  it('falls back to abilityName like the server summary', () => {
    expect(chosenAbilityName(list, 1n)).toBe('Second via abilityName');
  });

  it('indexes the raw array, not the filtered cards', () => {
    const withGap = json({ name: '' }, ability({ name: 'After the gap' }));
    expect(chosenAbilityName(withGap, 1n)).toBe('After the gap');
    expect(chosenAbilityName(withGap, 0n)).toBeNull();
  });

  it('gives null when the index is undefined or null', () => {
    expect(chosenAbilityName(list, undefined)).toBeNull();
    expect(chosenAbilityName(list, null)).toBeNull();
  });

  it('gives null when the index is out of range', () => {
    expect(chosenAbilityName(list, 3n)).toBeNull();
    expect(chosenAbilityName(list, -1n)).toBeNull();
    expect(chosenAbilityName(list, 10n ** 30n)).toBeNull();
  });

  it('gives null when the JSON does not parse, is not an array or is missing', () => {
    expect(chosenAbilityName('{oops', 0n)).toBeNull();
    expect(chosenAbilityName('{"name":"x"}', 0n)).toBeNull();
    expect(chosenAbilityName(null, 0n)).toBeNull();
    expect(chosenAbilityName(undefined, 0n)).toBeNull();
  });

  it('gives null for an entry that is not an object or has no usable name', () => {
    expect(chosenAbilityName(json('text', null, { name: 5 }), 0n)).toBeNull();
    expect(chosenAbilityName(json('text', null, { name: 5 }), 1n)).toBeNull();
    expect(chosenAbilityName(json('text', null, { name: 5 }), 2n)).toBeNull();
  });

  it('keeps markup verbatim', () => {
    expect(chosenAbilityName(json({ name: '<b>x</b>' }), 0n)).toBe('<b>x</b>');
  });
});
