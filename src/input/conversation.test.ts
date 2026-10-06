import { describe, expect, it } from 'vitest';
import { BARE_GAME_ACTIONS, FAREWELL_WORDS, isFarewell, isGameAction } from './conversation';

const ctx = { placeNames: ['Gloamwood', 'Old Mill'], nodeNames: ['Ironwood', 'Silverleaf'] };

describe('FAREWELL_WORDS', () => {
  it('is exactly the CONTEXT list', () => {
    expect([...FAREWELL_WORDS]).toEqual(['bye', 'farewell', 'leave', 'goodbye', 'end', 'quit', 'exit', 'back']);
  });
});

describe('isFarewell', () => {
  it.each([
    ['bye', true],
    ['Farewell', true],
    ['goodbye.', true],
    ['BYE!!', true],
    ['leave?', true],
    ['  end  ', true],
    ['quit', true],
    ['exit', true],
    ['back', true],
    ['bye now', false],
    ['byebye', false],
    ['bye.x', false],
    ['', false],
    ['...', false],
  ])('%j -> %s', (text, expected) => {
    expect(isFarewell(text)).toBe(expected);
  });

  it('handles a long run of trailing punctuation', () => {
    expect(isFarewell('bye' + '!'.repeat(5000))).toBe(true);
  });
});

describe('isGameAction', () => {
  it.each([
    'look',
    'LOOK',
    'l',
    'inventory',
    'who',
    'hotbar',
    'look at the well',
    'Look At Statue',
    'go to Gloamwood',
    'go gloamwood',
    'travel to old mill',
    'attack',
    'attack the rat',
    'fight',
    'kill the rat',
    'gather Ironwood',
    'gather ironwood',
    'buy bread',
    'sell sword',
    'craft potion',
    'craft',
  ])('%j is a game action', (text) => {
    expect(isGameAction(text, ctx)).toBe(true);
  });

  it.each([
    '',
    'hello there',
    'Go away, fool',
    'go to Nowhere',
    'travel Nowhere',
    'gather Nothing',
    'gather',
    'look at',
    'looking around',
    'killing time is fun',
    'Tell me about the river',
    'buy',
  ])('%j is not a game action', (text) => {
    expect(isGameAction(text, ctx)).toBe(false);
  });

  it('does not treat place names as patterns', () => {
    expect(isGameAction('go to C++ (the Elder)', { placeNames: ['C++ (the Elder)'], nodeNames: [] })).toBe(true);
    expect(isGameAction('go to C', { placeNames: ['C++ (the Elder)'], nodeNames: [] })).toBe(false);
  });

  it('lists every bare action once', () => {
    expect(new Set(BARE_GAME_ACTIONS).size).toBe(BARE_GAME_ACTIONS.length);
  });
});
