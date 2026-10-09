import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { NEARBY_COPY } from '../rails/pools';
import { keywordActionLabel } from './keywordLabel';

const SOURCE = readFileSync(resolve(process.cwd(), 'src/console/keywordLabel.ts'), 'utf8');

describe('keywordActionLabel (51.3.1.1-31, D-39)', () => {
  it('labels a named or World event enemy keyword Fight', () => {
    expect(keywordActionLabel({ kind: 'enemy', id: 3n, name: 'Old Brannoc', target: 'named' })).toBe('Fight Old Brannoc');
    expect(keywordActionLabel({ kind: 'enemy', id: 4n, name: 'Ash Wraith', target: 'event' })).toBe('Fight Ash Wraith');
  });

  it('keeps Pull for a family keyword and for one with no target', () => {
    expect(keywordActionLabel({ kind: 'enemy', id: 5n, name: 'Goblins', target: 'family' })).toBe('Pull Goblins');
    expect(keywordActionLabel({ kind: 'enemy', id: 6n, name: 'Goblin Scout' })).toBe('Pull Goblin Scout');
  });

  it('keeps the verbs of the other kinds', () => {
    expect(keywordActionLabel({ kind: 'npc', id: 1n, name: 'Ferryman' })).toBe('Talk to Ferryman');
    expect(keywordActionLabel({ kind: 'place', id: 2n, name: 'Gloamwood' })).toBe('Travel to Gloamwood');
    expect(keywordActionLabel({ kind: 'node', id: 3n, name: 'Old Well' })).toBe('Examine Old Well');
    expect(keywordActionLabel({ kind: 'player', id: 4n, name: 'Marisol' })).toBe('Whisper Marisol');
    expect(keywordActionLabel({ kind: 'loot', id: 5n, name: 'Rusty Dagger' })).toBe('Take Rusty Dagger');
  });

  it('shares the Nearby action words (one place for the D-58 copy review)', () => {
    expect(SOURCE).toContain("from '../rails/pools'");
    expect(SOURCE).toContain('NEARBY_COPY.actions.fight');
    expect(SOURCE).toContain('NEARBY_COPY.actions.pull');
    expect(SOURCE).not.toMatch(/'Fight'|'Pull'/);
    expect(keywordActionLabel({ kind: 'enemy', id: 3n, name: 'X', target: 'named' })).toBe(`${NEARBY_COPY.actions.fight} X`);
  });
});
