import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { compareBigint, compareNames } from './order';

describe('compareNames (IN-06)', () => {
  it('ignores case and accents', () => {
    expect(compareNames('Ash', 'ash')).toBe(0);
    expect(compareNames('Éa', 'ea')).toBe(0);
  });

  it('sorts alphabetically whatever the case', () => {
    expect(compareNames('apple', 'Birch')).toBeLessThan(0);
    expect(compareNames('Birch', 'apple')).toBeGreaterThan(0);
  });

  it('uses the fixed en locale, so every player gets the same order', () => {
    const source = readFileSync(resolve(process.cwd(), 'src/map/order.ts'), 'utf8');
    expect(source).toContain("localeCompare(b, 'en'");
  });
});

describe('compareBigint', () => {
  it('orders bigints without subtraction', () => {
    expect(compareBigint(1n, 2n)).toBe(-1);
    expect(compareBigint(2n, 1n)).toBe(1);
    expect(compareBigint(7n, 7n)).toBe(0);
  });
});
