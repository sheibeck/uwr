import { describe, it, expect, vi } from 'vitest';
import {
  recordedTable,
  recordedTables,
  rowColumnProblems,
  capturedReducer,
  capturedViews,
  snapshotDb,
} from './schema_recorder';
import { createMockDb } from './test-utils';

vi.mock('spacetimedb/server', async () =>
  (await import('./schema_recorder')).createRecordingServerMock(),
);

describe('schema recorder: tables.ts', () => {
  it('records llm_config as a non-public table', async () => {
    await import('../schema/tables');
    const cfg = recordedTable('llm_config');
    expect(cfg).toBeDefined();
    expect(cfg!.opts.public).toBeUndefined();
    expect(cfg!.cols.id.primaryKey).toBe(true);
    expect(cfg!.cols.apiKey.optional).toBe(false);
  });

  it('records llm_task options, index and per-column flags', async () => {
    await import('../schema/tables');
    const task = recordedTable('llm_task');
    expect(task).toBeDefined();
    expect(task!.opts.public).toBe(true);
    expect(task!.opts.indexes).toEqual([
      { accessor: 'by_player', algorithm: 'btree', columns: ['playerId'] },
    ]);
    expect(task!.cols.id.primaryKey).toBe(true);
    expect(task!.cols.id.autoInc).toBe(true);
    expect(task!.cols.contextJson.optional).toBe(true);
    expect(task!.cols.systemPrompt.optional).toBe(false);
    expect(task!.cols.playerId.kind).toBe('identity');
    expect(recordedTables().length).toBeGreaterThan(10);
  });
});

describe('rowColumnProblems', () => {
  // Shape copied from helpers/renown.ts (the legacy, broken llm_task insert).
  const legacyRenownRow = {
    id: 0n,
    playerId: { toHexString: () => 'p' },
    domain: 'renown_perk_gen',
    model: 'gpt-5-mini',
    systemPrompt: 's',
    userPrompt: 'u',
    maxTokens: 1200n,
    status: 'pending',
    contextJson: '{}',
    createdAt: { microsSinceUnixEpoch: 1n },
    completedAt: undefined,
    resultText: undefined,
    errorMessage: undefined,
  };

  it('flags the three non-columns of the legacy renown insert (PIPE-08 bug class)', async () => {
    await import('../schema/tables');
    expect(rowColumnProblems('llm_task', legacyRenownRow).sort()).toEqual([
      'unknown column completedAt',
      'unknown column errorMessage',
      'unknown column resultText',
    ]);
  });

  it('returns [] for a complete valid row', async () => {
    await import('../schema/tables');
    const { completedAt, resultText, errorMessage, ...valid } = legacyRenownRow;
    expect(rowColumnProblems('llm_task', valid)).toEqual([]);
  });

  it('reports a missing required column but tolerates omitted optional and autoInc ones', async () => {
    await import('../schema/tables');
    const { completedAt, resultText, errorMessage, id, contextJson, userPrompt, ...rest } =
      legacyRenownRow;
    expect(rowColumnProblems('llm_task', rest)).toEqual(['missing column userPrompt']);
  });

  it('reports an unrecorded table as unknown', async () => {
    await import('../schema/tables');
    expect(rowColumnProblems('no_such_table', {})).toEqual(['unknown table no_such_table']);
  });
});

describe('schema recorder: index.ts reducer capture', () => {
  it('loads the real index.ts module graph and captures reducers as functions', async () => {
    await import('../index');
    expect(typeof capturedReducer('submit_llm_result')).toBe('function');
    expect(typeof capturedReducer('prepare_creation_llm')).toBe('function');
    expect(capturedViews().some((v) => v.opts?.name === 'my_bank_slots')).toBe(true);
  });
});

describe('snapshotDb', () => {
  it('serializes bigint, identity, timestamp, drops functions and sorts tables', () => {
    const id = { toHexString: () => 'abc' };
    const db = createMockDb({
      zeta: [{ id: 1n, who: id, at: { microsSinceUnixEpoch: 5n }, fn: () => 1, n: 'x' }],
      alpha: [{ id: 2n }],
    });
    const snap = snapshotDb(db);
    expect(snap).toContain('"1n"');
    expect(snap).toContain('"identity:abc"');
    expect(snap).toContain('"ts:5n"');
    expect(snap).not.toContain('fn');
    expect(snap.indexOf('alpha')).toBeLessThan(snap.indexOf('zeta'));
  });

  it('two equal databases serialize identically regardless of insertion order', () => {
    const a = createMockDb();
    a.one.insert({ id: 0n, b: 1n, a: 2n });
    a.two.insert({ id: 0n });
    const b = createMockDb();
    b.two.insert({ id: 0n });
    b.one.insert({ a: 2n, b: 1n, id: 0n });
    expect(snapshotDb(a)).toBe(snapshotDb(b));
  });
});
