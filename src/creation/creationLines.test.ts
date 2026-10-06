import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { cleanCreationText, creationLines } from './creationLines';
import type { CreationEntryLike } from './creationLines';
import type { FeedLineView } from '../console/lines';

const seg = (text: string, kind = 'narration') => ({ kind, speaker: 'The Keeper', text });

const server = (over: Partial<CreationEntryLike> = {}): CreationEntryLike => ({
  key: 'creation:1',
  origin: 'server',
  kind: 'creation',
  message: 'hello',
  segments: null,
  ...over,
});

const local = (kind: string, message: string, key = 'local:1'): CreationEntryLike => ({
  key,
  origin: 'local',
  kind,
  message,
  segments: null,
});

describe('cleanCreationText', () => {
  it('removes every ** marker', () => {
    expect(cleanCreationText('**Eldrin**')).toBe('Eldrin');
    expect(cleanCreationText('a **b** and **c**')).toBe('a b and c');
    expect(cleanCreationText('****')).toBe('');
  });

  it('unwraps [bracket] words', () => {
    expect(cleanCreationText('[Warrior]')).toBe('Warrior');
    expect(cleanCreationText('As an [Elf], [Dwarf] or [Goblin]')).toBe('As an Elf, Dwarf or Goblin');
  });

  it('removes color tokens', () => {
    expect(cleanCreationText('{{color:x}}Ember{{/color}} Gate')).toBe('Ember Gate');
  });

  it('keeps newlines inside the text and trims the ends', () => {
    expect(cleanCreationText('\n\nRace: X\nClass: Y')).toBe('Race: X\nClass: Y');
    expect(cleanCreationText('Race: X\n\nClass: Y\n')).toBe('Race: X\n\nClass: Y');
  });

  it('trims the ends even when markers sat next to the whitespace', () => {
    expect(cleanCreationText('** hi **')).toBe('hi');
  });

  it('leaves an img-onerror string untouched', () => {
    expect(cleanCreationText('<img src=x onerror=alert(1)>')).toBe('<img src=x onerror=alert(1)>');
  });

  it('gives an empty string for empty input', () => {
    expect(cleanCreationText('')).toBe('');
  });
});

describe('creationLines: server rows', () => {
  it('gives one labelled Keeper line per segment, keyed by entry and index', () => {
    const lines = creationLines([server({ segments: [seg('First.'), seg('Second.')], message: 'First.\nSecond.' })]);
    expect(lines).toHaveLength(2);
    expect(lines.map(l => l.line.kind)).toEqual(['keeper', 'keeper']);
    expect(lines.map(l => l.line.label)).toEqual(['The Keeper', 'The Keeper']);
    expect(lines.map(l => l.line.text)).toEqual(['First.', 'Second.']);
    expect(lines.map(l => l.line.key)).toEqual(['creation:1:0', 'creation:1:1']);
    expect(lines.map(l => l.key)).toEqual(['creation:1:0', 'creation:1:1']);
  });

  it('treats a dialogue segment as a Keeper line too (the Keeper is the only speaker)', () => {
    const [line] = creationLines([server({ segments: [seg('Say it.', 'dialogue')] })]);
    expect(line.line.kind).toBe('keeper');
    expect(line.line.label).toBe('The Keeper');
    expect(line.line.speaker).toBeNull();
  });

  it('gives one Keeper line from the message when there are no segments', () => {
    const lines = creationLines([server({ message: 'Describe yourself.', segments: null })]);
    expect(lines).toHaveLength(1);
    expect(lines[0].line.kind).toBe('keeper');
    expect(lines[0].line.label).toBe('The Keeper');
    expect(lines[0].line.text).toBe('Describe yourself.');
    expect(lines[0].line.key).toBe('creation:1:0');
  });

  it('treats an empty segments array like no segments', () => {
    const lines = creationLines([server({ message: 'Plain.', segments: [] })]);
    expect(lines.map(l => l.line.text)).toEqual(['Plain.']);
  });

  it('gives one Error line (no label) from message for creation_error, even with segments', () => {
    const lines = creationLines([
      server({ kind: 'creation_error', message: 'That name is taken.', segments: [seg('Segment one.'), seg('Segment two.')] }),
    ]);
    expect(lines).toHaveLength(1);
    expect(lines[0].line.kind).toBe('error');
    expect(lines[0].line.label).toBeNull();
    expect(lines[0].line.text).toBe('That name is taken.');
    expect(lines[0].warning).toBe(false);
  });

  it('gives Keeper lines for creation_warning with the warning flag on the first line only', () => {
    const lines = creationLines([
      server({ kind: 'creation_warning', segments: [seg('This discards your race.'), seg('Say yes to go back.')], message: 'x' }),
    ]);
    expect(lines.map(l => l.line.kind)).toEqual(['keeper', 'keeper']);
    expect(lines.map(l => l.warning)).toEqual([true, false]);
  });

  it('flags a creation_warning without segments as one warning Keeper line', () => {
    const lines = creationLines([server({ kind: 'creation_warning', message: 'Careful.' })]);
    expect(lines).toHaveLength(1);
    expect(lines[0].warning).toBe(true);
    expect(lines[0].line.kind).toBe('keeper');
  });

  it('gives Keeper lines with no warning for an unknown server kind', () => {
    const lines = creationLines([server({ kind: 'mystery', message: 'Something.' })]);
    expect(lines[0].line.kind).toBe('keeper');
    expect(lines[0].warning).toBe(false);
  });

  it('never flags a plain creation row', () => {
    expect(creationLines([server()]).every(l => !l.warning)).toBe(true);
  });

  it('cleans markup in segment text and in messages', () => {
    const [a] = creationLines([server({ segments: [seg('**Eldrin** the [Warrior]')] })]);
    expect(a.line.text).toBe('Eldrin the Warrior');
    const [b] = creationLines([server({ message: 'Class: **[Mystic]**' })]);
    expect(b.line.text).toBe('Class: Mystic');
    const [c] = creationLines([server({ kind: 'creation_error', message: '**Nope.**' })]);
    expect(c.line.text).toBe('Nope.');
  });

  it('keeps newlines inside the text and trims its ends', () => {
    const [line] = creationLines([server({ message: '\n\nRace: X\nClass: Y\n\n' })]);
    expect(line.line.text).toBe('Race: X\nClass: Y');
  });

  it('skips a segment that is empty after cleaning, and an entry with nothing to show', () => {
    const lines = creationLines([server({ segments: [seg('Kept.'), seg('  **  '), seg('Also kept.')] })]);
    expect(lines.map(l => l.line.text)).toEqual(['Kept.', 'Also kept.']);
    expect(lines.map(l => l.line.key)).toEqual(['creation:1:0', 'creation:1:1']);
    expect(creationLines([server({ message: '   ' })])).toEqual([]);
    expect(creationLines([server({ kind: 'creation_error', message: '' })])).toEqual([]);
  });

  it('keeps an img-onerror string verbatim', () => {
    const [line] = creationLines([server({ message: '<img src=x onerror=alert(1)>' })]);
    expect(line.line.text).toBe('<img src=x onerror=alert(1)>');
    const [seg1] = creationLines([server({ segments: [seg('<img src=x onerror=alert(1)>')] })]);
    expect(seg1.line.text).toBe('<img src=x onerror=alert(1)>');
  });

  it('keeps entries in order across several entries', () => {
    const lines = creationLines([
      server({ key: 'creation:1', message: 'one' }),
      local('echo', 'Surprise me.', 'local:1'),
      server({ key: 'creation:2', segments: [seg('two a'), seg('two b')] }),
    ]);
    expect(lines.map(l => l.line.text)).toEqual(['one', 'Surprise me.', 'two a', 'two b']);
  });
});

describe('creationLines: local entries', () => {
  it('gives one echo line whose text is exactly what was sent', () => {
    const lines = creationLines([local('echo', '[x] **y**')]);
    expect(lines).toHaveLength(1);
    expect(lines[0].line.kind).toBe('echo');
    expect(lines[0].line.text).toBe('[x] **y**');
    expect(lines[0].line.label).toBeNull();
    expect(lines[0].warning).toBe(false);
  });

  it('does not trim or clean an echo', () => {
    expect(creationLines([local('echo', '  spaced  ')])[0].line.text).toBe('  spaced  ');
  });

  it('gives one Error line for a local error entry', () => {
    const lines = creationLines([local('error', "Couldn't send that. Try again.")]);
    expect(lines).toHaveLength(1);
    expect(lines[0].line.kind).toBe('error');
    expect(lines[0].line.label).toBeNull();
    expect(lines[0].line.text).toBe("Couldn't send that. Try again.");
  });

  it('keeps an img-onerror echo verbatim', () => {
    expect(creationLines([local('echo', '<img src=x onerror=alert(1)>')])[0].line.text).toBe('<img src=x onerror=alert(1)>');
  });

  it('skips an empty local entry', () => {
    expect(creationLines([local('echo', '')])).toEqual([]);
  });
});

describe('creationLines: FeedLineView shape', () => {
  const samples: CreationEntryLike[] = [
    server({ segments: [seg('a')] }),
    server({ message: 'b' }),
    server({ kind: 'creation_error', message: 'c' }),
    server({ kind: 'creation_warning', message: 'd' }),
    local('echo', 'e'),
    local('error', 'f'),
  ];

  it('is keyword-ineligible with no parts and no speaker keyword, and fills every required field', () => {
    for (const entry of samples) {
      for (const { line } of creationLines([entry])) {
        const view: FeedLineView = line;
        expect(view.keywordEligible).toBe(false);
        expect(view.parts).toBeNull();
        expect(view.titleParts).toBeNull();
        expect(view.speakerKeyword).toBeNull();
        expect(view.speaker).toBeNull();
        expect(view.speakerNpcId).toBeNull();
        expect(view.direction).toBeNull();
        expect(view.title).toBeNull();
        expect(view.queued).toBe(false);
        expect(typeof view.key).toBe('string');
        expect(typeof view.text).toBe('string');
        expect(view.playerAuthored).toBeUndefined();
      }
    }
  });
});

describe('source', () => {
  const source = readFileSync(resolve(process.cwd(), 'src/creation/creationLines.ts'), 'utf8');

  it('reuses cleanServerText and the Keeper label from the console modules', () => {
    expect(source).toContain('cleanServerText');
    expect(source).toContain("from '../console/cleanServerText'");
    expect(source).toContain('KEEPER_LABEL');
  });

  it('builds no markup and uses no replaceAll', () => {
    expect(source).not.toMatch(/v-html|innerHTML|replaceAll/);
  });
});
