import { describe, expect, it } from 'vitest';
import { splitLastInteger } from './emphasis';

describe('splitLastInteger', () => {
  it('splits a damage line around the amount', () => {
    expect(splitLastInteger('Rotfang hits you for 22 damage.')).toEqual({
      before: 'Rotfang hits you for ',
      amount: '22',
      after: ' damage.',
    });
  });

  it('takes the last integer when there are several', () => {
    expect(splitLastInteger('You heal 5 and then 12.')).toEqual({
      before: 'You heal 5 and then ',
      amount: '12',
      after: '.',
    });
  });

  it('handles an amount at the very start or end', () => {
    expect(splitLastInteger('7 damage')).toEqual({ before: '', amount: '7', after: ' damage' });
    expect(splitLastInteger('You take 9')).toEqual({ before: 'You take ', amount: '9', after: '' });
  });

  it('returns null when there is no integer', () => {
    expect(splitLastInteger('No numbers here.')).toBeNull();
    expect(splitLastInteger('')).toBeNull();
  });

  it('does not treat digits inside a word as standalone', () => {
    expect(splitLastInteger('Hit x2b twice')).toBeNull();
    expect(splitLastInteger('Hit x2b for 4')).toEqual({ before: 'Hit x2b for ', amount: '4', after: '' });
  });

  it('keeps markup characters as literal text in before and after', () => {
    expect(splitLastInteger('<b>7</b>')).toEqual({ before: '<b>', amount: '7', after: '</b>' });
  });

  it('keeps hostile text as plain substrings that rejoin to the input', () => {
    const text = '<img src=x onerror=alert(1)> hits you for 15 damage';
    const parts = splitLastInteger(text);
    expect(parts).not.toBeNull();
    expect(parts!.amount).toBe('15');
    expect(`${parts!.before}${parts!.amount}${parts!.after}`).toBe(text);
  });

  it('is repeatable (no shared regex state between calls)', () => {
    expect(splitLastInteger('a 1 b 2')?.amount).toBe('2');
    expect(splitLastInteger('a 1 b 2')?.amount).toBe('2');
    expect(splitLastInteger('only 3')?.amount).toBe('3');
  });
});
