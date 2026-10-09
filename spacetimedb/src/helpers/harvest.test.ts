/**
 * Phase 51.3.1.1 Plan 12 (D-27, D-28; T-51.3.1.1-37, T-51.3.1.1-39): the per-player, per-place harvest
 * cap (helpers/harvest.ts) on the strict mock db. A player may gather HARVEST_CAP_GATHERS times per
 * place per HARVEST_WINDOW_MICROS; the cap gather stores a capped-until time (the only field the
 * my_harvest_caps view shows), and the next gather after the window starts a fresh window.
 */
import { describe, it, expect, vi, beforeAll } from 'vitest';
import { DENSITY_RULES } from '../data/density_rules';
import { T0, ALICE, ORCHARD_ID, FLATS_ID, poolWorld, poolCtx } from './pool_fixture';
import { harvestRow, harvestCappedFor, recordHarvest } from './harvest';
import { myHarvestCapRows } from '../views/harvest';

vi.mock('spacetimedb/server', async () =>
  (await import('./schema_recorder')).createRecordingServerMock(),
);

beforeAll(async () => {
  await import('../schema/tables');
});

const CAP = DENSITY_RULES.HARVEST_CAP_GATHERS;
const WINDOW = DENSITY_RULES.HARVEST_WINDOW_MICROS;
const MIN = 60_000_000n;

const rows = (ctx: any): any[] => ctx.db._tables.pool_harvest ?? [];

/** Records `n` gathers by `characterId` at `locationId`, one minute apart from `start`. */
function gather(ctx: any, characterId: bigint, locationId: bigint, n: number, start: bigint = T0): bigint {
  let now = start;
  for (let i = 0; i < n; i += 1) {
    now = start + BigInt(i) * MIN;
    recordHarvest(ctx, characterId, locationId, now);
  }
  return now;
}

describe('harvestCappedFor (D-27)', () => {
  it('is false with no row', () => {
    const ctx = poolCtx(poolWorld());
    expect(harvestRow(ctx, 1n, ORCHARD_ID)).toBeNull();
    expect(harvestCappedFor(ctx, 1n, ORCHARD_ID, T0)).toBe(false);
  });

  it('is false after one fewer gather than the cap, true after the cap gather, until the window ends', () => {
    expect(CAP).toBe(4n);
    const ctx = poolCtx(poolWorld());
    const last = gather(ctx, 1n, ORCHARD_ID, Number(CAP) - 1);
    expect(harvestCappedFor(ctx, 1n, ORCHARD_ID, last)).toBe(false);

    const capAt = last + MIN;
    recordHarvest(ctx, 1n, ORCHARD_ID, capAt);
    expect(harvestCappedFor(ctx, 1n, ORCHARD_ID, capAt)).toBe(true);
    expect(harvestCappedFor(ctx, 1n, ORCHARD_ID, T0 + WINDOW - 1n)).toBe(true);
    expect(harvestCappedFor(ctx, 1n, ORCHARD_ID, T0 + WINDOW)).toBe(false);
  });
});

describe('recordHarvest (D-28)', () => {
  it('creates the row on the first gather and increments it after', () => {
    const ctx = poolCtx(poolWorld());
    recordHarvest(ctx, 1n, ORCHARD_ID, T0);
    expect(rows(ctx)).toHaveLength(1);
    expect(rows(ctx)[0]).toMatchObject({ characterId: 1n, locationId: ORCHARD_ID, windowStartMicros: T0, gathers: 1n, cappedUntilMicros: 0n });

    recordHarvest(ctx, 1n, ORCHARD_ID, T0 + MIN);
    expect(rows(ctx)).toHaveLength(1);
    expect(rows(ctx)[0]).toMatchObject({ windowStartMicros: T0, gathers: 2n, cappedUntilMicros: 0n });
  });

  it('the cap gather stores capped-until = window start + window', () => {
    const ctx = poolCtx(poolWorld());
    gather(ctx, 1n, ORCHARD_ID, Number(CAP));
    expect(rows(ctx)).toHaveLength(1);
    expect(rows(ctx)[0]).toMatchObject({ gathers: CAP, cappedUntilMicros: T0 + WINDOW });
  });

  it('a gather after the window starts a fresh window and clears the capped-until time', () => {
    const ctx = poolCtx(poolWorld());
    gather(ctx, 1n, ORCHARD_ID, Number(CAP));
    const later = T0 + WINDOW + 5n * MIN;
    recordHarvest(ctx, 1n, ORCHARD_ID, later);
    expect(rows(ctx)).toHaveLength(1);
    expect(rows(ctx)[0]).toMatchObject({ windowStartMicros: later, gathers: 1n, cappedUntilMicros: 0n });
    expect(harvestCappedFor(ctx, 1n, ORCHARD_ID, later)).toBe(false);
  });

  it('a window that passed without a cap starts fresh too', () => {
    const ctx = poolCtx(poolWorld());
    gather(ctx, 1n, ORCHARD_ID, 2);
    const later = T0 + WINDOW;
    recordHarvest(ctx, 1n, ORCHARD_ID, later);
    expect(rows(ctx)[0]).toMatchObject({ windowStartMicros: later, gathers: 1n, cappedUntilMicros: 0n });
  });

  it('keeps one row per (character, place): another place and another player count on their own', () => {
    const ctx = poolCtx(poolWorld());
    gather(ctx, 1n, ORCHARD_ID, Number(CAP));
    gather(ctx, 1n, FLATS_ID, 1);
    gather(ctx, 2n, ORCHARD_ID, 2);
    expect(rows(ctx)).toHaveLength(3);
    expect(harvestCappedFor(ctx, 1n, ORCHARD_ID, T0 + 10n * MIN)).toBe(true);
    expect(harvestCappedFor(ctx, 1n, FLATS_ID, T0 + 10n * MIN)).toBe(false);
    expect(harvestCappedFor(ctx, 2n, ORCHARD_ID, T0 + 10n * MIN)).toBe(false);
    expect(harvestRow(ctx, 1n, FLATS_ID)).toMatchObject({ gathers: 1n });
    expect(harvestRow(ctx, 2n, ORCHARD_ID)).toMatchObject({ gathers: 2n });
  });
});

describe('my_harvest_caps shows only the capped-until time (T-51.3.1.1-39)', () => {
  it('lists the capped place of the active character and drops it after a fresh window', () => {
    const ctx = poolCtx(poolWorld());
    gather(ctx, 1n, ORCHARD_ID, Number(CAP));
    gather(ctx, 1n, FLATS_ID, 1);
    // poolCtx's default sender is the module; read the view as Alice.
    const asAlice = { db: ctx.db, sender: ALICE };
    expect(myHarvestCapRows(asAlice)).toEqual([{ id: harvestRow(ctx, 1n, ORCHARD_ID).id, locationId: ORCHARD_ID, cappedUntilMicros: T0 + WINDOW }]);

    recordHarvest(ctx, 1n, ORCHARD_ID, T0 + WINDOW + MIN);
    expect(myHarvestCapRows(asAlice)).toEqual([]);
  });
});
