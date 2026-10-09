import { describe, expect, it } from 'vitest';
import { deathPromptLine } from '@game-data/death_lines';
import { cleanServerText } from './cleanServerText';
import { isClickableCommand, withCommandParts } from './commandLinks';
import { keywordActionLabel } from './keywordLabel';
import { buildVocabulary } from './keywords';
import { buildFeedLines } from './lines';
import type { LineSource } from './lines';

const vocabulary = buildVocabulary({ npcs: [], places: [], nodes: [], players: [] });
const row = (kind: string, message: string, source: LineSource['source'] = 'private'): LineSource => ({
  key: `${source}:1`,
  source,
  kind,
  message,
  segments: null,
});
const build = (entry: LineSource) => buildFeedLines([entry], { vocabulary, partyNames: [], npcsHere: [] });

describe('command links ([respawn], owner 2026-10-09)', () => {
  it('only respawn is clickable', () => {
    expect(isClickableCommand('respawn')).toBe(true);
    expect(isClickableCommand(' Respawn ')).toBe(true);
    expect(isClickableCommand('travel')).toBe(false);
  });

  it('server text keeps [respawn] and still unwraps other bracket words', () => {
    expect(cleanServerText('Type [respawn] to awaken. Or [travel].')).toBe('Type [respawn] to awaken. Or travel.');
  });

  it('splits a plain part around the command, keeping the brackets visible', () => {
    const parts = withCommandParts([{ text: 'Type [respawn] to awaken at Camp.', entry: null }]);
    expect(parts).toEqual([
      { text: 'Type ', entry: null },
      { text: '[respawn]', entry: { kind: 'command', id: 0n, name: 'respawn' } },
      { text: ' to awaken at Camp.', entry: null },
    ]);
  });

  it('leaves text with no clickable command as it is', () => {
    const part = { text: 'A [map] and nothing else.', entry: null };
    expect(withCommandParts([part])).toEqual([part]);
  });

  it('the death prompt from the server becomes a system line with a Respawn button', () => {
    const [line] = build(row('system', deathPromptLine('Last Lantern Camp', 0n)));
    expect(line.kind).toBe('system');
    const button = line.parts?.find((part) => part.entry !== null);
    expect(button).toEqual({ text: '[respawn]', entry: { kind: 'command', id: 0n, name: 'respawn' } });
    expect(line.parts?.map((part) => part.text).join('')).toBe(line.text);
    expect(keywordActionLabel(button!.entry!)).toBe('Respawn');
  });

  it('player-typed text never gets a command button', () => {
    for (const entry of [row('command', '> [respawn]'), row('say', 'Type [respawn] now', 'location')]) {
      for (const line of build(entry)) {
        expect((line.parts ?? []).some((part) => part.entry?.kind === 'command')).toBe(false);
      }
    }
  });
});
