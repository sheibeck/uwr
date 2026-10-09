import { describe, it, expect } from 'vitest';
import {
  CLICKABLE_COMMANDS,
  DEAD_IN_FIGHT,
  DEATH_LINE_OPENINGS,
  RESPAWN_COMMAND,
  allowedWhileDead,
  deathPromptLine,
} from './death_lines';

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

describe('allowedWhileDead (owner, 2026-10-09: respawning is the only action the dead take)', () => {
  it('lets the dead respawn, ask for help and look around (the client sends look on load)', () => {
    for (const text of [RESPAWN_COMMAND, 'help', 'h', '?', 'look', 'l', 'look at the corpse', 'l wolf', 'look at']) {
      expect(allowedWhileDead(text), text).toBe(true);
    }
  });

  it('lets the dead talk: say, whisper, tell and w', () => {
    for (const text of ['say help me', 'whisper bob come get me', 'tell bob hurry', 'w bob hi']) {
      expect(allowedWhileDead(text), text).toBe(true);
    }
  });

  it('is case-insensitive and ignores surrounding space', () => {
    expect(allowedWhileDead('  LOOK ')).toBe(true);
    expect(allowedWhileDead('Say Hello')).toBe(true);
  });

  it('refuses every in-world action', () => {
    for (const text of [
      'pull wolves', 'pull', 'gather reeds', 'travel', 'travel to camp', 'go camp', 'explore', 'camp', 'rest',
      'bind', 'shop', 'sell junk', 'craft', 'turn in the lost ring', 'loot', 'loot ring', 'attack', 'hail bob',
      'deposit sword', 'skills', 'use heal', 'flee', 'last lantern camp', 'lookout', 'saying', 'say', 'w bob',
    ]) {
      expect(allowedWhileDead(text), text).toBe(false);
    }
  });

  it('the in-fight line is the owner-approved text', () => {
    expect(DEAD_IN_FIGHT).toBe('You are dead, and the fight goes on without you.');
  });
});
