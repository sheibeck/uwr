import { describe, expect, it } from 'vitest';
import { cleanServerText } from './cleanServerText';

describe('cleanServerText', () => {
  it('removes color open and close tokens', () => {
    expect(cleanServerText('{{color:#ffd700}}Ember Gate{{/color}}')).toBe('Ember Gate');
    expect(cleanServerText('{{color}}x{{/color}}')).toBe('x');
    expect(cleanServerText('{{color:red}}a{{/color}} and {{color:#fff}}b{{/color}}')).toBe('a and b');
  });

  it('unwraps bracket words', () => {
    expect(cleanServerText('Type [accept Bob] to join')).toBe('Type accept Bob to join');
    expect(cleanServerText('[look] around')).toBe('look around');
  });

  it('keeps newlines and indentation', () => {
    expect(cleanServerText('a\n  [b]')).toBe('a\n  b');
    expect(cleanServerText('[a\nb]')).toBe('[a\nb]');
  });

  it('leaves empty and unmatched brackets alone', () => {
    expect(cleanServerText('[]')).toBe('[]');
    expect(cleanServerText('a [ b')).toBe('a [ b');
    expect(cleanServerText('a ] b')).toBe('a ] b');
  });

  it('returns an empty string for empty input', () => {
    expect(cleanServerText('')).toBe('');
  });

  it('does not touch other markup', () => {
    expect(cleanServerText('<b>x</b>')).toBe('<b>x</b>');
  });
});
