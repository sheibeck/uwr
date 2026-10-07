import { describe, it, expect, vi, beforeAll } from 'vitest';
import { createMockDb } from './test-utils';
import { markLocationVisited, visitedRowFor } from './visited';

vi.mock('spacetimedb/server', async () =>
  (await import('./schema_recorder')).createRecordingServerMock(),
);

// Strict mock db: accessors come from the recorded schema, so load it first.
beforeAll(async () => {
  await import('../schema/tables');
});

const T1 = { microsSinceUnixEpoch: 111n };
const T2 = { microsSinceUnixEpoch: 222n };

function ctxWith(rows: any[], timestamp: any = T1) {
  return { timestamp, db: createMockDb({ visited_location: rows }, { strict: true }) } as any;
}
const rowsOf = (ctx: any): any[] => [...ctx.db.visited_location.iter()];

describe('markLocationVisited', () => {
  it('inserts a row with firstVisitedAt = ctx.timestamp and the given origin', () => {
    const ctx = ctxWith([]);
    markLocationVisited(ctx, 1n, 10n, 9n);
    const rows = rowsOf(ctx);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ characterId: 1n, locationId: 10n, firstVisitedAt: T1, fromLocationId: 9n });
  });

  it('inserts with no origin when none is given', () => {
    const ctx = ctxWith([]);
    markLocationVisited(ctx, 1n, 10n);
    const rows = rowsOf(ctx);
    expect(rows).toHaveLength(1);
    expect(rows[0].fromLocationId).toBeUndefined();
  });

  it('a second call with a different origin updates only fromLocationId', () => {
    const ctx = ctxWith([]);
    markLocationVisited(ctx, 1n, 10n, 9n);
    ctx.timestamp = T2;
    markLocationVisited(ctx, 1n, 10n, 8n);
    const rows = rowsOf(ctx);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ characterId: 1n, locationId: 10n, firstVisitedAt: T1, fromLocationId: 8n });
  });

  it('a call without an origin on an existing row changes nothing', () => {
    const ctx = ctxWith([]);
    markLocationVisited(ctx, 1n, 10n, 9n);
    ctx.timestamp = T2;
    markLocationVisited(ctx, 1n, 10n);
    const rows = rowsOf(ctx);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ firstVisitedAt: T1, fromLocationId: 9n });
  });

  it('the same origin again changes nothing', () => {
    const ctx = ctxWith([]);
    markLocationVisited(ctx, 1n, 10n, 9n);
    const before = rowsOf(ctx)[0];
    markLocationVisited(ctx, 1n, 10n, 9n);
    expect(rowsOf(ctx)).toEqual([before]);
  });

  it('leaves other characters rows untouched and keeps one row per character and place', () => {
    const other = { id: 7n, characterId: 2n, locationId: 10n, firstVisitedAt: T1, fromLocationId: 5n };
    const ctx = ctxWith([other]);
    markLocationVisited(ctx, 1n, 10n, 9n);
    const rows = rowsOf(ctx);
    expect(rows).toHaveLength(2);
    expect(rows.find((r) => r.characterId === 2n)).toEqual(other);
    markLocationVisited(ctx, 1n, 11n, 10n);
    expect(rowsOf(ctx).filter((r) => r.characterId === 1n).map((r) => r.locationId).sort()).toEqual([10n, 11n]);
  });

  it('skips locationId 0n silently', () => {
    const ctx = ctxWith([]);
    markLocationVisited(ctx, 1n, 0n, 9n);
    expect(rowsOf(ctx)).toEqual([]);
  });
});

describe('visitedRowFor', () => {
  it('finds the character row for the place or returns undefined', () => {
    const ctx = ctxWith([]);
    markLocationVisited(ctx, 1n, 10n, 9n);
    expect(visitedRowFor(ctx, 1n, 10n)).toMatchObject({ characterId: 1n, locationId: 10n });
    expect(visitedRowFor(ctx, 1n, 11n)).toBeUndefined();
    expect(visitedRowFor(ctx, 2n, 10n)).toBeUndefined();
  });
});
