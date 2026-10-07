import { describe, it, expect, vi, beforeAll } from 'vitest';
import { createMockDb } from '../helpers/test-utils';
import { capturedViews, createRecordingServerMock, recordedTable, recordedTables } from '../helpers/schema_recorder';
import { myActionResultRows, registerActionResultViews } from './action_result';
import { writeActionResult } from '../helpers/action_result';
import { decodeResultLines } from '../data/action_result';

vi.mock('spacetimedb/server', async () =>
  (await import('../helpers/schema_recorder')).createRecordingServerMock(),
);

// The strict mock db takes its accessors from the recorded schema, so load it first.
beforeAll(async () => {
  await import('../schema/tables');
});

const COLUMNS: Record<string, { kind: string; optional?: boolean; primaryKey?: boolean; autoInc?: boolean }> = {
  characterId: { kind: 'u64', primaryKey: true },
  seq: { kind: 'u64' },
  kind: { kind: 'string' },
  templateId: { kind: 'u64', optional: true },
  itemInstanceId: { kind: 'u64', optional: true },
  itemName: { kind: 'string' },
  rarity: { kind: 'string' },
  craftQuality: { kind: 'string', optional: true },
  quantity: { kind: 'u64' },
  recipeTemplateId: { kind: 'u64', optional: true },
  craftCount: { kind: 'u64' },
  linesJson: { kind: 'string' },
  at: { kind: 'timestamp' },
};

describe('action_result table', () => {
  it('is recorded and is not public', () => {
    const rec = recordedTable('action_result');
    expect(rec).toBeDefined();
    expect(rec!.opts.public).not.toBe(true);
  });

  it('no recorded table whose name starts with action_result is public', () => {
    const publicOnes = recordedTables()
      .filter((r) => typeof r.name === 'string' && r.name.startsWith('action_result'))
      .filter((r) => r.opts.public === true);
    expect(publicOnes).toEqual([]);
  });

  it('has exactly the planned columns, with characterId as a non-autoInc primary key', () => {
    const rec = recordedTable('action_result')!;
    expect(Object.keys(rec.cols)).toEqual(Object.keys(COLUMNS));
    for (const [name, want] of Object.entries(COLUMNS)) {
      const got = rec.cols[name];
      expect(got.kind, `${name} kind`).toBe(want.kind);
      expect(got.optional, `${name} optional`).toBe(!!want.optional);
      expect(got.primaryKey, `${name} primaryKey`).toBe(!!want.primaryKey);
      expect(got.autoInc, `${name} autoInc`).toBe(!!want.autoInc);
    }
  });
});

const ident = (hex: string) => ({ toHexString: () => hex });
const alice = ident('alice');
const bob = ident('bob');
const carol = ident('carol');

/** Touching any table's iter throws, and only player.id.find and action_result.characterId.find may be read. */
function lookupOnlyDb(seed: Record<string, any[]>) {
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
const result = (characterId: bigint, itemName: string) => ({
  characterId,
  seq: 1n,
  kind: 'craft',
  itemName,
  rarity: 'common',
  quantity: 1n,
  craftCount: 1n,
  linesJson: '[]',
  at: { microsSinceUnixEpoch: 0n },
});
const ctxFor = (sender: any, seed: Record<string, any[]>) => ({ sender, db: lookupOnlyDb(seed) });

describe('myActionResultRows', () => {
  it('returns [] with no player row', () => {
    expect(myActionResultRows(ctxFor(carol, { player: [], action_result: [result(1n, 'Sword')] }))).toEqual([]);
  });

  it('returns [] with no active character', () => {
    const ctx = ctxFor(alice, { player: [player(alice, undefined)], action_result: [result(1n, 'Sword')] });
    expect(myActionResultRows(ctx)).toEqual([]);
  });

  it('returns [] when the active character has no row', () => {
    const ctx = ctxFor(alice, { player: [player(alice, 1n)], action_result: [result(2n, 'Axe')] });
    expect(myActionResultRows(ctx)).toEqual([]);
  });

  it('each sender sees only the row of their own active character', () => {
    const seed = {
      player: [player(alice, 1n), player(bob, 2n)],
      action_result: [result(1n, 'Alice Sword'), result(2n, 'Bob Axe')],
    };
    expect(myActionResultRows(ctxFor(alice, seed)).map((r: any) => r.itemName)).toEqual(['Alice Sword']);
    expect(myActionResultRows(ctxFor(bob, seed)).map((r: any) => r.itemName)).toEqual(['Bob Axe']);
    expect(myActionResultRows(ctxFor(carol, seed))).toEqual([]);
  });
});

describe('registerActionResultViews', () => {
  it('registers my_action_result as a public view returning the sender row only', () => {
    const { t, schema } = createRecordingServerMock();
    const spacetimedb = schema({});
    const before = capturedViews().length;
    registerActionResultViews({ spacetimedb, t, ActionResult: { rowType: {} } } as any);
    const view = capturedViews().slice(before).find((v) => v.opts?.name === 'my_action_result')!;
    expect(view).toBeDefined();
    expect(view.opts.public).toBe(true);
    const seed = { player: [player(alice, 1n), player(bob, 2n)], action_result: [result(1n, 'A'), result(2n, 'B')] };
    expect(view.fn(ctxFor(alice, seed)).map((r: any) => r.itemName)).toEqual(['A']);
  });
});

describe('writeActionResult', () => {
  const stamp = { microsSinceUnixEpoch: 42n };
  const line = (name: string) => ({
    kind: 'used' as const,
    templateId: 5n,
    name,
    quantity: 2n,
    total: 1n,
    instanceId: null,
  });

  it('inserts seq 1n with the timestamp and encoded lines when there is no row', () => {
    const db = createMockDb({ action_result: [] }, { strict: true });
    const ctx = { db, timestamp: stamp };
    const row = writeActionResult(ctx, 7n, {
      kind: 'craft',
      templateId: 3n,
      itemInstanceId: 9n,
      itemName: 'Potion',
      rarity: 'common',
      craftQuality: 'reinforced',
      quantity: 3n,
      recipeTemplateId: 11n,
      craftCount: 3n,
      lines: [line('Iron')],
    });
    expect(row.seq).toBe(1n);
    expect(row.at).toBe(stamp);
    expect(db.action_result.characterId.find(7n)).toEqual(row);
    expect(decodeResultLines(row.linesJson)).toEqual([line('Iron')]);
  });

  it('a second write raises seq by one and leaves no field of the first', () => {
    const db = createMockDb({ action_result: [] }, { strict: true });
    const ctx = { db, timestamp: stamp };
    writeActionResult(ctx, 7n, {
      kind: 'craft',
      templateId: 3n,
      itemInstanceId: 9n,
      itemName: 'Potion',
      rarity: 'rare',
      craftQuality: 'reinforced',
      quantity: 3n,
      recipeTemplateId: 11n,
      craftCount: 3n,
      lines: [line('Iron')],
    });
    const second = writeActionResult(ctx, 7n, {
      kind: 'salvage',
      itemName: 'Scraps',
      rarity: 'common',
      quantity: 1n,
      craftCount: 1n,
      lines: [],
    });
    expect(second.seq).toBe(2n);
    expect(second.kind).toBe('salvage');
    expect(second.templateId).toBeUndefined();
    expect(second.itemInstanceId).toBeUndefined();
    expect(second.craftQuality).toBeUndefined();
    expect(second.recipeTemplateId).toBeUndefined();
    expect(second.rarity).toBe('common');
    expect(second.linesJson).toBe('[]');
    expect(db.action_result.characterId.find(7n)).toEqual(second);
  });

  it('does not touch another character row', () => {
    const other = result(8n, 'Other');
    const db = createMockDb({ action_result: [other] }, { strict: true });
    writeActionResult({ db, timestamp: stamp }, 7n, {
      kind: 'discover', itemName: 'X', rarity: 'common', quantity: 0n, craftCount: 1n, lines: [],
    });
    expect(db.action_result.characterId.find(8n)).toEqual(other);
  });

  it('throws a plain Error (a server bug, not a SenderError) for a kind outside RESULT_KINDS', async () => {
    const { SenderError } = await import('spacetimedb/server');
    const db = createMockDb({ action_result: [] }, { strict: true });
    let thrown: unknown;
    try {
      writeActionResult({ db, timestamp: stamp }, 7n, {
        kind: 'bogus' as any, itemName: 'X', rarity: 'common', quantity: 0n, craftCount: 1n, lines: [],
      });
    } catch (err) {
      thrown = err;
    }
    expect(thrown).toBeInstanceOf(Error);
    expect(thrown).not.toBeInstanceOf(SenderError as any);
    expect((thrown as Error).message).toBe('writeActionResult: unknown result kind bogus');
    expect(db.action_result.characterId.find(7n)).toBeUndefined();
  });
});
