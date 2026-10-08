import { beforeAll, describe, expect, it, vi } from 'vitest';

// Day and night lengths (owner, 2026-10-08): one full cycle is an hour, 40 minutes of day and 20 of
// night. tick_day_night reads these two constants for every transition.
vi.mock('spacetimedb/server', async () =>
  (await import('./schema_recorder')).createRecordingServerMock(),
);

let loc: typeof import('./location');
beforeAll(async () => {
  await import('../schema/tables');
  loc = await import('./location');
});

const MINUTE = 60_000_000n;

describe('day and night lengths', () => {
  it('day lasts 40 minutes', () => {
    expect(loc.DAY_DURATION_MICROS).toBe(40n * MINUTE);
  });

  it('night lasts 20 minutes', () => {
    expect(loc.NIGHT_DURATION_MICROS).toBe(20n * MINUTE);
  });

  it('a full cycle is one hour', () => {
    expect(loc.DAY_DURATION_MICROS + loc.NIGHT_DURATION_MICROS).toBe(60n * MINUTE);
  });
});
