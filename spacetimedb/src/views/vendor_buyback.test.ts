import { describe, it, expect, vi, beforeAll } from 'vitest';
import { createMockDb } from '../helpers/test-utils';
import { capturedViews, createRecordingServerMock, recordedTable, recordedTables } from '../helpers/schema_recorder';
import { myVendorBuybackRows, registerVendorBuybackViews } from './vendor_buyback';

// vi.mock is hoisted; the recording mock supplies a chainable `t` and captures table and view
// registrations.
vi.mock('spacetimedb/server', async () =>
  (await import('../helpers/schema_recorder')).createRecordingServerMock(),
);

// Strict mock db: unknown table or index accessors throw like the real db. Accessors come from
// the recorded schema, so load it before any test touches ctx.db.
beforeAll(async () => {
  await import('../schema/tables');
});

const BUYBACK_COLUMNS: Record<string, { kind: string; optional?: boolean; primaryKey?: boolean; autoInc?: boolean }> = {
  characterId: { kind: 'u64', primaryKey: true },
  npcId: { kind: 'u64' },
  npcName: { kind: 'string' },
  locationId: { kind: 'u64' },
  templateId: { kind: 'u64' },
  itemName: { kind: 'string' },
  rarity: { kind: 'string' },
  quantity: { kind: 'u64' },
  price: { kind: 'u64' },
  qualityTier: { kind: 'string', optional: true },
  craftQuality: { kind: 'string', optional: true },
  displayName: { kind: 'string', optional: true },
  isNamed: { kind: 'bool', optional: true },
  isTemporary: { kind: 'bool', optional: true },
  affixesJson: { kind: 'string' },
  listingId: { kind: 'u64', optional: true },
  soldAt: { kind: 'timestamp' },
};

describe('vendor_buyback table', () => {
  it('is recorded and is not public', () => {
    const rec = recordedTable('vendor_buyback');
    expect(rec).toBeDefined();
    expect(rec!.opts.public).not.toBe(true);
  });

  it('is the only new private table that clients could subscribe to by mistake: no public vendor_buyback', () => {
    const publicOnes = recordedTables()
      .filter((r) => typeof r.name === 'string' && r.name.startsWith('vendor_buyback'))
      .filter((r) => r.opts.public === true);
    expect(publicOnes).toEqual([]);
  });

  it('has exactly the planned columns, with characterId as a non-autoInc primary key', () => {
    const rec = recordedTable('vendor_buyback')!;
    expect(Object.keys(rec.cols).sort()).toEqual(Object.keys(BUYBACK_COLUMNS).sort());
    for (const [name, want] of Object.entries(BUYBACK_COLUMNS)) {
      const got = rec.cols[name];
      expect(got.kind, `${name} kind`).toBe(want.kind);
      expect(got.optional, `${name} optional`).toBe(!!want.optional);
      expect(got.primaryKey, `${name} primaryKey`).toBe(!!want.primaryKey);
      expect(got.autoInc, `${name} autoInc`).toBe(!!want.autoInc);
    }
  });

  it('a strict mock db accepts characterId find, update and delete', () => {
    const row = { characterId: 1n, npcId: 5n, itemName: 'Sword' };
    const db = createMockDb({ vendor_buyback: [row] }, { strict: true });
    expect(db.vendor_buyback.characterId.find(1n)).toBe(row);
    db.vendor_buyback.characterId.update({ ...row, itemName: 'Axe' });
    expect(db.vendor_buyback.characterId.find(1n).itemName).toBe('Axe');
    db.vendor_buyback.characterId.delete(1n);
    expect(db.vendor_buyback.characterId.find(1n)).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// my_vendor_buyback: per-sender view (owner rule: a public table must never expose other
// players' sales)
// ---------------------------------------------------------------------------

// The mock db compares index values with ===, so the same identity object is used as
// player.id and as ctx.sender.
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
const sale = (characterId: bigint, itemName: string) => ({
  characterId,
  npcId: 5n,
  npcName: 'Brannoc',
  locationId: 10n,
  templateId: 80n,
  itemName,
  rarity: 'common',
  quantity: 1n,
  price: 7n,
  affixesJson: '[]',
  soldAt: { microsSinceUnixEpoch: 0n },
});

const ctxFor = (sender: any, seed: Record<string, any[]>) => ({ sender, db: noScanDb(seed) });

describe('myVendorBuybackRows', () => {
  it('returns [] when the sender has no player row', () => {
    expect(myVendorBuybackRows(ctxFor(carol, { player: [], vendor_buyback: [sale(1n, 'Sword')] }))).toEqual([]);
  });

  it('returns [] when the player has no active character', () => {
    const ctx = ctxFor(alice, { player: [player(alice, undefined)], vendor_buyback: [sale(1n, 'Sword')] });
    expect(myVendorBuybackRows(ctx)).toEqual([]);
  });

  it('returns [] when the active character has no row', () => {
    const ctx = ctxFor(alice, { player: [player(alice, 1n)], vendor_buyback: [sale(2n, 'Axe')] });
    expect(myVendorBuybackRows(ctx)).toEqual([]);
  });

  it('each sender sees only the row of their own active character', () => {
    const seed = {
      player: [player(alice, 1n), player(bob, 2n)],
      vendor_buyback: [sale(1n, 'Alice Sword'), sale(2n, 'Bob Axe')],
    };
    expect(myVendorBuybackRows(ctxFor(alice, seed)).map((r: any) => r.itemName)).toEqual(['Alice Sword']);
    expect(myVendorBuybackRows(ctxFor(bob, seed)).map((r: any) => r.itemName)).toEqual(['Bob Axe']);
    expect(myVendorBuybackRows(ctxFor(carol, seed))).toEqual([]);
  });

  it('never scans a table (the proxy throws on iter and the call still succeeds)', () => {
    const ctx = ctxFor(alice, { player: [player(alice, 1n)], vendor_buyback: [sale(1n, 'Sword')] });
    expect(() => myVendorBuybackRows(ctx)).not.toThrow();
    expect(myVendorBuybackRows(ctx)).toHaveLength(1);
  });
});

describe('registerVendorBuybackViews', () => {
  it('registers my_vendor_buyback as a public view', () => {
    const { t, schema } = createRecordingServerMock();
    const spacetimedb = schema({});
    const before = capturedViews().length;
    registerVendorBuybackViews({ spacetimedb, t, VendorBuyback: { rowType: {} } } as any);
    const added = capturedViews().slice(before);
    const view = added.find((v) => v.opts?.name === 'my_vendor_buyback');
    expect(view).toBeDefined();
    expect(view!.opts.public).toBe(true);
  });

  it('the registered handler returns the sender row only', () => {
    const { t, schema } = createRecordingServerMock();
    const spacetimedb = schema({});
    const before = capturedViews().length;
    registerVendorBuybackViews({ spacetimedb, t, VendorBuyback: { rowType: {} } } as any);
    const view = capturedViews().slice(before).find((v) => v.opts?.name === 'my_vendor_buyback')!;
    const seed = { player: [player(alice, 1n), player(bob, 2n)], vendor_buyback: [sale(1n, 'A'), sale(2n, 'B')] };
    expect(typeof view.fn).toBe('function');
    expect(view.fn(ctxFor(alice, seed)).map((r: any) => r.itemName)).toEqual(['A']);
  });
});
