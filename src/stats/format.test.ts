import { describe, expect, it } from 'vitest';
import { formatPermille, formatVendorMods } from './format';

describe('formatPermille', () => {
  it('shows the 1000 scale as a percent with two decimals', () => {
    expect(formatPermille(150n)).toBe('15.00%');
    expect(formatPermille(0n)).toBe('0.00%');
    expect(formatPermille(1234n)).toBe('123.40%');
    expect(formatPermille(5n)).toBe('0.50%');
    expect(formatPermille(1000n)).toBe('100.00%');
  });

  it('does not lose precision on a large value', () => {
    expect(formatPermille(9007199254740993n)).toBe('900719925474099.30%');
  });

  it('keeps the sign of a negative value', () => {
    expect(formatPermille(-35n)).toBe('-3.50%');
  });
});

describe('formatVendorMods', () => {
  it('uses the true minus on the buy side and a plus on the sell side', () => {
    expect(formatVendorMods(20n, 35n)).toBe('−2.00% / +3.50%');
    expect(formatVendorMods(0n, 0n)).toBe('−0.00% / +0.00%');
  });

  it('never uses the hyphen-minus for the buy side', () => {
    expect(formatVendorMods(20n, 35n).startsWith('-')).toBe(false);
  });
});
