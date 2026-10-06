import { describe, expect, it } from 'vitest';
import { parseNpcSays, parsePartyChat, parseWhisper } from './whisper';

describe('parseWhisper', () => {
  it('parses a sent whisper', () => {
    expect(parseWhisper('You whisper to Mara: "meet at dawn"')).toEqual({
      direction: 'sent',
      name: 'Mara',
      text: 'meet at dawn',
    });
  });
  it('parses a received whisper', () => {
    expect(parseWhisper('Mara whispers: "hi"')).toEqual({ direction: 'received', name: 'Mara', text: 'hi' });
  });
  it('keeps multi-line text', () => {
    expect(parseWhisper('Mara whispers: "a\nb"')?.text).toBe('a\nb');
  });
  it('returns null for other lines', () => {
    expect(parseWhisper('No such character')).toBeNull();
    expect(parseWhisper('')).toBeNull();
  });
});

describe('parsePartyChat', () => {
  it('parses a member line', () => {
    expect(parsePartyChat('Mara: hello all', ['Mara', 'Bo'])).toEqual({ name: 'Mara', text: 'hello all' });
  });
  it('rejects a non-member prefix', () => {
    expect(parsePartyChat('Server: x', ['Mara', 'Bo'])).toBeNull();
  });
  it('matches names exactly and case-sensitively', () => {
    expect(parsePartyChat('mara: hi', ['Mara'])).toBeNull();
  });
  it('prefers the longest member name', () => {
    expect(parsePartyChat('Mara Bo: hi', ['Mara', 'Mara Bo'])).toEqual({ name: 'Mara Bo', text: 'hi' });
  });
  it('handles an empty member list', () => {
    expect(parsePartyChat('Mara: hi', [])).toBeNull();
  });
});

describe('parseNpcSays', () => {
  it('parses a says line', () => {
    expect(parseNpcSays('The Ferryman says, "Mind the current, traveller."')).toEqual({
      name: 'The Ferryman',
      text: 'Mind the current, traveller.',
    });
  });
  it('parses a colon line', () => {
    expect(parseNpcSays('Ferryman: Hello')).toEqual({ name: 'Ferryman', text: 'Hello' });
  });
  it('returns null for neither shape', () => {
    expect(parseNpcSays('The wind rises.')).toBeNull();
  });
});
