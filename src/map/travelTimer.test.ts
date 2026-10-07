import { describe, expect, it } from 'vitest';
import { aboutMinutes, formatClock, travelTimer } from './travelTimer';

const NOW = 1_000_000_000;

describe('travelTimer', () => {
  it('is not running with no rows', () => {
    expect(travelTimer([], NOW)).toEqual({ running: false, secondsLeft: 0 });
  });

  it('rounds the remaining time up to whole seconds', () => {
    const ready = BigInt(NOW + 90_200_000);
    expect(travelTimer([{ readyAtMicros: ready }], NOW)).toEqual({ running: true, secondsLeft: 91 });
  });

  it('reads a past or exact ready time as Ready (stale rows)', () => {
    expect(travelTimer([{ readyAtMicros: BigInt(NOW - 5_000_000) }], NOW)).toEqual({
      running: false,
      secondsLeft: 0,
    });
    expect(travelTimer([{ readyAtMicros: BigInt(NOW) }], NOW)).toEqual({ running: false, secondsLeft: 0 });
  });

  it('takes the larger ready time when there are two rows', () => {
    const rows = [{ readyAtMicros: BigInt(NOW + 10_000_000) }, { readyAtMicros: BigInt(NOW + 40_000_000) }];
    expect(travelTimer(rows, NOW)).toEqual({ running: true, secondsLeft: 40 });
    expect(travelTimer([...rows].reverse(), NOW)).toEqual({ running: true, secondsLeft: 40 });
  });

  it('ignores a stale row next to a live one', () => {
    const rows = [{ readyAtMicros: BigInt(NOW - 1) }, { readyAtMicros: BigInt(NOW + 2_000_000) }];
    expect(travelTimer(rows, NOW)).toEqual({ running: true, secondsLeft: 2 });
  });
});

describe('formatClock', () => {
  it('prints m:ss', () => {
    expect(formatClock(0)).toBe('0:00');
    expect(formatClock(61)).toBe('1:01');
    expect(formatClock(300)).toBe('5:00');
    expect(formatClock(3599)).toBe('59:59');
  });
});

describe('aboutMinutes', () => {
  it('rounds up to whole minutes, at least one', () => {
    expect(aboutMinutes(1)).toBe('about 1 minute');
    expect(aboutMinutes(60)).toBe('about 1 minute');
    expect(aboutMinutes(61)).toBe('about 2 minutes');
    expect(aboutMinutes(299)).toBe('about 5 minutes');
  });
});
