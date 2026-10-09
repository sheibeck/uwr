import { describe, it, expect } from 'vitest';
import { CLICKABLE_COMMANDS, DEATH_LINE_OPENINGS, RESPAWN_COMMAND, deathPromptLine } from './death_lines';

describe('death_lines', () => {
  it('the prompt is a sarcastic opening, then the clickable command and the place', () => {
    const line = deathPromptLine('Last Lantern Camp', 0n);
    expect(line).toBe(`${DEATH_LINE_OPENINGS[0]} Type [respawn] to awaken at Last Lantern Camp.`);
  });

  it('picks the opening deterministically from the seed, every opening reachable', () => {
    const seen = new Set<string>();
    for (let seed = 0n; seed < 6n; seed++) seen.add(deathPromptLine('X', seed));
    expect(seen.size).toBe(DEATH_LINE_OPENINGS.length);
    expect(deathPromptLine('X', 4n)).toBe(deathPromptLine('X', 4n));
  });

  it('respawn is the one clickable command', () => {
    expect(RESPAWN_COMMAND).toBe('respawn');
    expect(CLICKABLE_COMMANDS).toEqual(['respawn']);
  });

  it('no opening uses first person or the word ripple', () => {
    for (const opening of DEATH_LINE_OPENINGS) {
      expect(opening).not.toMatch(/\b(I|me|my)\b/);
      expect(opening.toLowerCase()).not.toContain('ripple');
    }
  });
});
