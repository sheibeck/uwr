import { afterEach, describe, expect, it, vi } from 'vitest';
import { PIN_THRESHOLD_PX, isPinned, prefersReducedMotion } from './pinning';

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('isPinned', () => {
  it('uses a 48px threshold', () => {
    expect(PIN_THRESHOLD_PX).toBe(48);
  });

  it('is pinned exactly 48px from the bottom and unpinned at 49', () => {
    expect(isPinned(952, 1000, 0)).toBe(true);
    expect(isPinned(951, 1000, 0)).toBe(false);
  });

  it('accounts for the viewport height', () => {
    expect(isPinned(600, 1000, 400)).toBe(true);
    expect(isPinned(500, 1000, 400)).toBe(false);
  });

  it('is pinned when there is nothing to scroll', () => {
    expect(isPinned(0, 0, 0)).toBe(true);
    expect(isPinned(0, 300, 400)).toBe(true);
  });

  it('honors an explicit threshold', () => {
    expect(isPinned(900, 1000, 0, 100)).toBe(true);
    expect(isPinned(899, 1000, 0, 100)).toBe(false);
  });
});

describe('prefersReducedMotion', () => {
  it('is false when matchMedia is missing', () => {
    vi.stubGlobal('window', {});
    expect(prefersReducedMotion()).toBe(false);
  });

  it('is false when there is no window', () => {
    vi.stubGlobal('window', undefined);
    expect(prefersReducedMotion()).toBe(false);
  });

  it('reads the reduced-motion media query', () => {
    const matchMedia = vi.fn((query: string) => ({ matches: query === '(prefers-reduced-motion: reduce)' }));
    vi.stubGlobal('window', { matchMedia });
    expect(prefersReducedMotion()).toBe(true);
    expect(matchMedia).toHaveBeenCalledWith('(prefers-reduced-motion: reduce)');
  });
});
