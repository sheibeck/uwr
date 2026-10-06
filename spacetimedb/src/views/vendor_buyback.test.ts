import { describe, it, expect, vi, beforeAll } from 'vitest';
import { createMockDb } from '../helpers/test-utils';
import { recordedTable, recordedTables } from '../helpers/schema_recorder';

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
