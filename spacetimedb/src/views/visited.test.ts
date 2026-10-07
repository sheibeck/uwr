import { describe, it, expect, vi, beforeAll } from 'vitest';
import { readFileSync } from 'node:fs';
import { createMockDb } from '../helpers/test-utils';
import { capturedViews, createRecordingServerMock, recordedTable } from '../helpers/schema_recorder';
import { myVisitedLocationRows, registerVisitedViews } from './visited';

vi.mock('spacetimedb/server', async () =>
  (await import('../helpers/schema_recorder')).createRecordingServerMock(),
);

beforeAll(async () => {
  await import('../schema/tables');
});

const COLUMNS: Record<string, { kind: string; optional?: boolean; primaryKey?: boolean; autoInc?: boolean }> = {
  id: { kind: 'u64', primaryKey: true, autoInc: true },
  characterId: { kind: 'u64' },
  locationId: { kind: 'u64' },
  firstVisitedAt: { kind: 'timestamp' },
  fromLocationId: { kind: 'u64', optional: true },
};

describe('visited_location table', () => {
  it('is recorded, is not public, and has exactly the planned columns', () => {
    const rec = recordedTable('visited_location');
    expect(rec).toBeDefined();
    expect(rec!.opts.public).not.toBe(true);
    expect(Object.keys(rec!.cols).sort()).toEqual(Object.keys(COLUMNS).sort());
    for (const [name, want] of Object.entries(COLUMNS)) {
      const got = rec!.cols[name];
      expect(got.kind, `${name} kind`).toBe(want.kind);
      expect(got.optional, `${name} optional`).toBe(!!want.optional);
      expect(got.primaryKey, `${name} primaryKey`).toBe(!!want.primaryKey);
      expect(got.autoInc, `${name} autoInc`).toBe(!!want.autoInc);
    }
  });

  it('has the by_character and by_location btree indexes', () => {
    const rec = recordedTable('visited_location')!;
    const idx = (rec.opts.indexes ?? []) as any[];
    const byChar = idx.find((i) => i.accessor === 'by_character');
    const byLoc = idx.find((i) => i.accessor === 'by_location');
    expect(byChar).toMatchObject({ algorithm: 'btree', columns: ['characterId'] });
    expect(byLoc).toMatchObject({ algorithm: 'btree', columns: ['locationId'] });
  });
});

const ident = (hex: string) => ({ toHexString: () => hex });
const alice = ident('alice');
const bob = ident('bob');
const carol = ident('carol');

/** Wrap a mock DB so touching any table's iter throws: the view must use index lookups only. */
function noScanDb(seed: Record<string, any[]>) {
  const db = createMockDb(seed, { strict: true });
  return new Proxy({} as any, {
    get: (_t, table: string) =>
      new Proxy({} as any, {
        get: (_u, prop: string) => {
          if (prop === 'iter') throw new Error(`table scan attempted on ${table}`);
          return db[table][prop];
        },
      }),
  });
}

const player = (id: any, activeCharacterId: bigint | undefined) => ({ id, userId: 1n, activeCharacterId });
const visit = (id: bigint, characterId: bigint, locationId: bigint) => ({
  id,
  characterId,
  locationId,
  firstVisitedAt: { microsSinceUnixEpoch: 0n },
  fromLocationId: undefined,
});
const ctxFor = (sender: any, seed: Record<string, any[]>) => ({ sender, db: noScanDb(seed) });

describe('myVisitedLocationRows', () => {
  it('returns [] when the sender has no player row', () => {
    expect(myVisitedLocationRows(ctxFor(carol, { player: [], visited_location: [visit(1n, 1n, 10n)] }))).toEqual([]);
  });

  it('returns [] when the player has no active character', () => {
    const ctx = ctxFor(alice, { player: [player(alice, undefined)], visited_location: [visit(1n, 1n, 10n)] });
    expect(myVisitedLocationRows(ctx)).toEqual([]);
  });

  it('returns the active character rows only; a second player sees none of the first player rows', () => {
    const seed = {
      player: [player(alice, 1n), player(bob, 2n)],
      visited_location: [visit(1n, 1n, 10n), visit(2n, 1n, 11n), visit(3n, 2n, 12n)],
    };
    expect(myVisitedLocationRows(ctxFor(alice, seed)).map((r: any) => r.locationId).sort()).toEqual([10n, 11n]);
    expect(myVisitedLocationRows(ctxFor(bob, seed)).map((r: any) => r.locationId)).toEqual([12n]);
    expect(myVisitedLocationRows(ctxFor(carol, seed))).toEqual([]);
  });

  it('never scans a table (the proxy throws on iter and the call still succeeds)', () => {
    const ctx = ctxFor(alice, { player: [player(alice, 1n)], visited_location: [visit(1n, 1n, 10n)] });
    expect(() => myVisitedLocationRows(ctx)).not.toThrow();
  });

  it('the view source contains no .iter(', () => {
    const source = readFileSync(new URL('./visited.ts', import.meta.url), 'utf8');
    expect(source).not.toContain('.iter(');
  });
});

describe('registerVisitedViews', () => {
  it('registers my_visited_locations as a public view whose handler returns the sender rows only', () => {
    const { t, schema } = createRecordingServerMock();
    const spacetimedb = schema({});
    const before = capturedViews().length;
    registerVisitedViews({ spacetimedb, t, VisitedLocation: { rowType: {} } } as any);
    const view = capturedViews().slice(before).find((v) => v.opts?.name === 'my_visited_locations');
    expect(view).toBeDefined();
    expect(view!.opts.public).toBe(true);
    const seed = {
      player: [player(alice, 1n), player(bob, 2n)],
      visited_location: [visit(1n, 1n, 10n), visit(2n, 2n, 12n)],
    };
    expect(view!.fn(ctxFor(alice, seed)).map((r: any) => r.locationId)).toEqual([10n]);
  });
});
