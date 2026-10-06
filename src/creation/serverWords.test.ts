import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { ARCHETYPE_CHOICES, START_OVER_CONFIRMATION, SURPRISE_ME_TEXT, controlsFor } from './creationControls';
import { KNOWN_CREATION_STEPS } from './creationSteps';

// Pins every word a creation button sends against the server's own matching rules, read from
// spacetimedb/src/reducers/creation.ts at run time, so a server copy change fails loudly (UI-SPEC A13).

const source = readFileSync(resolve(process.cwd(), 'spacetimedb/src/reducers/creation.ts'), 'utf8');

function goBackPatterns(): string[] {
  const match = /const GO_BACK_PATTERNS = \[([\s\S]*?)\];/.exec(source);
  if (!match) return [];
  const out: string[] = [];
  const quoted = /'([^']*)'/g;
  let hit: RegExpExecArray | null;
  while ((hit = quoted.exec(match[1])) !== null) out.push(hit[1]);
  return out;
}

const PATTERNS = goBackPatterns();

/** Mirrors the server's isGoBackIntent: lower-cased substring match; at CLASS_FILL_ERROR "try again" retries. */
function wouldGoBack(text: string, step?: string): boolean {
  const lower = text.toLowerCase();
  const patterns = step === 'CLASS_FILL_ERROR' ? PATTERNS.filter(p => p !== 'try again') : PATTERNS;
  return patterns.some(p => lower.includes(p));
}

function exploreRegex(): RegExp | null {
  const match = /function isExploreText\(text: string\): boolean \{\s*return (\/.+\/[a-z]*)\.test\(text\.trim\(\)\);/.exec(source);
  if (!match) return null;
  const literal = match[1];
  const end = literal.lastIndexOf('/');
  return new RegExp(literal.slice(1, end), literal.slice(end + 1));
}

/** Every word the client can send, from every control the composer and cards can show. */
function collectWords(): string[] {
  const words = new Set<string>();
  const steps: Array<string | null> = [null, ...KNOWN_CREATION_STEPS];
  for (const step of steps) {
    for (const regionFailed of [false, true]) {
      for (const startFailed of [false, true]) {
        const c = controlsFor({ step, known: true, regionFailed, startFailed, connected: true });
        for (const d of c.decisions) if (d.action.type === 'send') words.add(d.action.text);
        if (c.quick) words.add(c.quick.sends);
      }
    }
  }
  const unknown = controlsFor({ step: 'SOMETHING_NEW', known: false, regionFailed: false, startFailed: false, connected: true });
  for (const d of unknown.decisions) if (d.action.type === 'send') words.add(d.action.text);
  const yes = START_OVER_CONFIRMATION.yes.action;
  if (yes.type === 'send') words.add(yes.text);
  const keep = START_OVER_CONFIRMATION.keep.action;
  if (keep.type === 'send') words.add(keep.text);
  for (const choice of ARCHETYPE_CHOICES) words.add(choice.sends);
  words.add(SURPRISE_ME_TEXT);
  return [...words];
}

describe('server go-back rules (read from creation.ts)', () => {
  it('parses a non-empty GO_BACK_PATTERNS array out of the source', () => {
    expect(PATTERNS.length).toBeGreaterThan(0);
    expect(PATTERNS).toContain('go back');
    expect(PATTERNS).toContain('start over');
  });

  it('keeps the CLASS_FILL_ERROR carve-out for "try again" in the source', () => {
    expect(source).toContain("step === 'CLASS_FILL_ERROR' ? GO_BACK_PATTERNS.filter(p => p !== 'try again')");
  });
});

// One assertion per word the client sends. A word with no entry here fails the coverage test below.
const pins: Record<string, () => void> = {
  retry: () => {
    // At CLASS_FILL_ERROR "retry" runs the fill again and never goes back.
    expect(wouldGoBack('retry', 'CLASS_FILL_ERROR')).toBe(false);
    expect(wouldGoBack('retry')).toBe(false);
  },
  'go back': () => {
    for (const step of ['AWAITING_ARCHETYPE', 'CLASS_REVEALED', 'CLASS_FILL_ERROR']) {
      expect(wouldGoBack('go back', step)).toBe(true);
    }
  },
  yes: () => {
    // The go-back confirmation is an exact lower-cased "yes".
    expect(source).toContain("trimmed.toLowerCase() === 'yes'");
    expect('yes'.toLowerCase()).toBe('yes');
  },
  no: () => {
    // Anything but yes declines, so the exact-yes check must be the only accept path.
    expect(source).toContain("trimmed.toLowerCase() === 'yes'");
    expect('no'.toLowerCase() === 'yes').toBe(false);
  },
  Confirm: () => {
    expect(source).toContain("lowerInput === 'confirm'");
    expect('Confirm'.toLowerCase()).toBe('confirm');
  },
  'start over': () => {
    expect(source).toContain("lowerInput === 'start over'");
    expect('start over'.toLowerCase()).toBe('start over');
    expect(wouldGoBack('start over', 'CONFIRMING')).toBe(true);
  },
  explore: () => {
    const regex = exploreRegex();
    expect(regex).not.toBeNull();
    expect(regex!.test('explore')).toBe(true);
  },
  [SURPRISE_ME_TEXT]: () => {
    expect(wouldGoBack(SURPRISE_ME_TEXT, 'AWAITING_RACE')).toBe(false);
  },
  Warrior: () => {
    expect(source).toContain("lower.includes('warrior')");
    expect('Warrior'.toLowerCase().includes('warrior')).toBe(true);
    expect(wouldGoBack('Warrior', 'AWAITING_ARCHETYPE')).toBe(false);
  },
  Mystic: () => {
    expect(source).toContain("lower.includes('mystic')");
    expect('Mystic'.toLowerCase().includes('mystic')).toBe(true);
    expect(wouldGoBack('Mystic', 'AWAITING_ARCHETYPE')).toBe(false);
  },
};

describe('words the creation buttons send', () => {
  const words = collectWords();

  it('collects every expected word', () => {
    expect([...words].sort()).toEqual(
      ['Confirm', 'Mystic', 'Surprise me.', 'Warrior', 'explore', 'go back', 'no', 'retry', 'start over', 'yes'].sort(),
    );
  });

  it.each(Object.keys(pins))('%s matches the server rule it relies on', word => {
    pins[word]();
  });

  it('covers every collected word, so no unknown word ships untested', () => {
    const unpinned = words.filter(w => !Object.prototype.hasOwnProperty.call(pins, w));
    expect(unpinned).toEqual([]);
  });

  it('pins the archetype words against both includes checks', () => {
    expect(ARCHETYPE_CHOICES.map(c => c.sends.toLowerCase())).toEqual(['warrior', 'mystic']);
  });
});

describe('server quirk: ability names that contain a go-back phrase (Pitfall 3, no client fix)', () => {
  it('Redoubt Strike is read as a go-back request at CLASS_REVEALED because it contains "redo"', () => {
    expect(wouldGoBack('Redoubt Strike', 'CLASS_REVEALED')).toBe(true);
  });

  it('Undoing Word is read as a go-back request at CLASS_REVEALED because it contains "undo"', () => {
    expect(wouldGoBack('Undoing Word', 'CLASS_REVEALED')).toBe(true);
  });

  it('Ember Lash is not', () => {
    expect(wouldGoBack('Ember Lash', 'CLASS_REVEALED')).toBe(false);
  });
});
