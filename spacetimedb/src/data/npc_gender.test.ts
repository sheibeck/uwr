import { describe, it, expect } from 'vitest';
import {
  NPC_GENDERS,
  genderFromName,
  inferGenderFromText,
  resolveNpcGender,
  npcGender,
  npcPronouns,
  npcNoticeLine,
  npcRegardLine,
} from './npc_gender';

describe('NPC_GENDERS', () => {
  it('is male and female only', () => {
    expect([...NPC_GENDERS]).toEqual(['male', 'female']);
  });
});

describe('genderFromName', () => {
  it('pins known names', () => {
    expect(genderFromName('The Reluctant Merchant')).toBe('male');
    expect(genderFromName('The Ledger Keeper')).toBe('female');
    expect(genderFromName('Mara Quill')).toBe('female');
    expect(genderFromName('Oswin Tarr')).toBe('male');
    expect(genderFromName('Mirel')).toBe('male');
  });
  it('ignores case and surrounding space, and handles empty', () => {
    expect(genderFromName('  MARA QUILL ')).toBe('female');
    expect(genderFromName('')).toBe('female');
  });
  it('is stable across calls', () => {
    expect(genderFromName('Vessa')).toBe(genderFromName('Vessa'));
  });
});

describe('inferGenderFromText', () => {
  it('reads pronouns', () => {
    expect(inferGenderFromText('She keeps the ledgers, and her prices are fair.')).toBe('female');
    expect(inferGenderFromText('He mends nets; his hands shake.')).toBe('male');
  });
  it('returns null when silent, tied, or only partial words match', () => {
    expect(inferGenderFromText('A figure who says little.')).toBeNull();
    expect(inferGenderFromText('He trusts her.')).toBeNull();
    expect(inferGenderFromText('The shelf holds herbs.')).toBeNull();
    expect(inferGenderFromText('Theo sells thistles.')).toBeNull();
  });
});

describe('resolveNpcGender', () => {
  it('keeps a valid model value, trimmed and case-insensitive', () => {
    expect(resolveNpcGender('Female', 'Oswin Tarr')).toBe('female');
    expect(resolveNpcGender(' male ', 'Mara Quill')).toBe('male');
  });
  it('falls back to the text, then the name', () => {
    expect(resolveNpcGender(undefined, 'Oswin Tarr', 'She sells salt.')).toBe('female');
    expect(resolveNpcGender('they', 'Oswin Tarr', '')).toBe('male');
    expect(resolveNpcGender(42, 'Mara Quill')).toBe('female');
    expect(resolveNpcGender(null, '')).toBe('female');
  });
  it('is always male or female for junk input', () => {
    const junk: unknown[] = [undefined, null, 0, 1n, {}, [], 'it', 'they', '', '  ', 'MALEFEMALE', Symbol.iterator.toString()];
    for (const v of junk) {
      for (const name of ['', 'x', 'Oswin Tarr', undefined, null, 12]) {
        expect(NPC_GENDERS).toContain(resolveNpcGender(v, name, 'text'));
      }
    }
  });
});

describe('npcGender', () => {
  it('uses a stored value', () => {
    expect(npcGender({ gender: 'female', name: 'Oswin Tarr' })).toBe('female');
  });
  it('resolves a pre-column row deterministically', () => {
    expect(
      npcGender({ gender: '', name: 'Mirel', description: 'A weathered keeper of the crossing.', greeting: 'Well met.' })
    ).toBe('male');
    expect(npcGender({ gender: '', name: 'Oswin Tarr', description: 'She rows the ferry.' })).toBe('female');
  });
});

describe('npcPronouns', () => {
  it('maps both genders', () => {
    expect(npcPronouns('male')).toEqual({ subject: 'he', object: 'him', possessive: 'his' });
    expect(npcPronouns('female')).toEqual({ subject: 'she', object: 'her', possessive: 'her' });
  });
});

describe('npcNoticeLine', () => {
  it('is empty for no NPCs', () => {
    expect(npcNoticeLine([])).toBe('');
  });
  it('uses he or she for one NPC', () => {
    expect(npcNoticeLine([{ name: 'Mara Quill', gender: 'female' }])).toBe(
      'You notice Mara Quill nearby. Perhaps she has something to say.'
    );
    expect(npcNoticeLine([{ name: 'Oswin Tarr', gender: 'male' }])).toBe(
      'You notice Oswin Tarr nearby. Perhaps he has something to say.'
    );
  });
  it('uses someone for several NPCs', () => {
    expect(
      npcNoticeLine([
        { name: 'Mara Quill', gender: 'female' },
        { name: 'Oswin Tarr', gender: 'male' },
      ])
    ).toBe('You notice Mara Quill and Oswin Tarr nearby. Perhaps someone here has something to say.');
  });
});

describe('npcRegardLine', () => {
  it('uses her for a female NPC', () => {
    expect(npcRegardLine('Mara', 'female', 60)).toBe('Mara regards you warmly. You have earned her respect.');
    expect(npcRegardLine('Mara', 'female', 10)).toContain('You are a stranger to her.');
    expect(npcRegardLine('Mara', 'female', -10)).toContain('puts her on edge.');
    expect(npcRegardLine('Mara', 'female', -30)).toContain('hide her dislike. Tread carefully.');
    expect(npcRegardLine('Mara', 'female', -60)).toContain('deepens her contempt.');
  });
  it('uses his and him for a male NPC', () => {
    expect(npcRegardLine('Oswin', 'male', 60)).toContain('earned his respect.');
    expect(npcRegardLine('Oswin', 'male', 10)).toContain('a stranger to him.');
    expect(npcRegardLine('Oswin', 'male', -10)).toContain('puts him on edge.');
    expect(npcRegardLine('Oswin', 'male', -30)).toContain('hide his dislike.');
    expect(npcRegardLine('Oswin', 'male', -60)).toContain('deepens his contempt.');
  });
  it('keeps the unchanged lines and the thresholds', () => {
    expect(npcRegardLine('A', 'male', 100)).toBe('A is devoted to you. A rare and unshakeable bond.');
    expect(npcRegardLine('A', 'male', 75)).toBe('A considers you a close friend. Trust runs deep here.');
    expect(npcRegardLine('A', 'male', 25)).toBe('A recognizes you as a passing acquaintance. There is room to grow.');
    expect(npcRegardLine('A', 'male', 50)).toContain('warmly');
    expect(npcRegardLine('A', 'male', 0)).toContain('polite indifference');
    expect(npcRegardLine('A', 'male', -25)).toContain('warily');
    expect(npcRegardLine('A', 'male', -50)).toContain('hide');
    expect(npcRegardLine('A', 'male', -51)).toContain('despises');
  });
});
