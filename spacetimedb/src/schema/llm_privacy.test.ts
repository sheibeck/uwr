import { describe, it, expect, vi } from 'vitest';
import { recordedTable, recordedTables } from '../helpers/schema_recorder';
import { createMockDb } from '../helpers/test-utils';

vi.mock('spacetimedb/server', async () =>
  (await import('../helpers/schema_recorder')).createRecordingServerMock(),
);

const JOB_COLUMNS: Record<string, { kind: string; optional?: boolean; primaryKey?: boolean; autoInc?: boolean }> = {
  id: { kind: 'u64', primaryKey: true, autoInc: true },
  playerId: { kind: 'identity' },
  characterId: { kind: 'u64' },
  route: { kind: 'string' },
  dedupeKey: { kind: 'string' },
  status: { kind: 'string' },
  attempt: { kind: 'u64' },
  requestJson: { kind: 'string' },
  resultText: { kind: 'string', optional: true },
  stopReason: { kind: 'string', optional: true },
  errorCode: { kind: 'string', optional: true },
  requestId: { kind: 'string', optional: true },
  inputTokens: { kind: 'u64' },
  outputTokens: { kind: 'u64' },
  cacheWriteTokens: { kind: 'u64' },
  cacheReadTokens: { kind: 'u64' },
  createdAt: { kind: 'timestamp' },
  startedAt: { kind: 'timestamp', optional: true },
  finishedAt: { kind: 'timestamp', optional: true },
  nextAttemptAt: { kind: 'timestamp', optional: true },
  reservedMicroUsd: { kind: 'u64' },
  costMicroUsd: { kind: 'u64' },
  budgetDay: { kind: 'string' },
  applyAttempts: { kind: 'u64' },
};

const LOG_COLUMNS: Record<string, { kind: string; optional?: boolean; primaryKey?: boolean; autoInc?: boolean }> = {
  id: { kind: 'u64', primaryKey: true, autoInc: true },
  jobId: { kind: 'u64' },
  playerId: { kind: 'identity' },
  route: { kind: 'string' },
  model: { kind: 'string' },
  outcome: { kind: 'string' },
  attempt: { kind: 'u64' },
  httpStatus: { kind: 'u64' },
  latencyMs: { kind: 'u64' },
  stopReason: { kind: 'string', optional: true },
  requestId: { kind: 'string', optional: true },
  errorMessage: { kind: 'string', optional: true },
  inputTokens: { kind: 'u64' },
  outputTokens: { kind: 'u64' },
  cacheWriteTokens: { kind: 'u64' },
  cacheReadTokens: { kind: 'u64' },
  createdAt: { kind: 'timestamp' },
  costMicroUsd: { kind: 'u64' },
  dispatchLateMs: { kind: 'u64' },
};

type ColSpec = { kind: string; optional?: boolean; primaryKey?: boolean; autoInc?: boolean };

const NEW_TABLE_COLUMNS: Record<string, Record<string, ColSpec>> = {
  llm_dispatch: {
    scheduledId: { kind: 'u64', primaryKey: true, autoInc: true },
    scheduledAt: { kind: 'scheduleAt' },
    jobId: { kind: 'u64' },
  },
  llm_sweep_tick: {
    scheduledId: { kind: 'u64', primaryKey: true, autoInc: true },
    scheduledAt: { kind: 'scheduleAt' },
  },
  llm_player_budget: {
    id: { kind: 'u64', primaryKey: true, autoInc: true },
    playerId: { kind: 'identity' },
    dayUtc: { kind: 'string' },
    reservedMicroUsd: { kind: 'u64' },
    spentMicroUsd: { kind: 'u64' },
    calls: { kind: 'u64' },
  },
  llm_spend: {
    id: { kind: 'u64', primaryKey: true },
    spentMicroUsd: { kind: 'u64' },
    reservedMicroUsd: { kind: 'u64' },
    calls: { kind: 'u64' },
    updatedAt: { kind: 'timestamp' },
  },
  llm_admin_state: {
    id: { kind: 'u64', primaryKey: true },
    keySet: { kind: 'bool' },
    keyLength: { kind: 'u64' },
    keyUpdatedAt: { kind: 'timestamp', optional: true },
    keyVerifiedAt: { kind: 'timestamp', optional: true },
    keyLastCheckOk: { kind: 'bool' },
    lastSmokeAt: { kind: 'timestamp', optional: true },
    lastSmokeJson: { kind: 'string' },
  },
};
const NEW_TABLES = Object.keys(NEW_TABLE_COLUMNS);

function expectColumns(
  tableName: string,
  expected: Record<string, { kind: string; optional?: boolean; primaryKey?: boolean; autoInc?: boolean }>,
) {
  const rec = recordedTable(tableName)!;
  expect(rec).toBeDefined();
  expect(Object.keys(rec.cols).sort()).toEqual(Object.keys(expected).sort());
  for (const [name, want] of Object.entries(expected)) {
    const got = rec.cols[name];
    expect(got.kind, `${tableName}.${name} kind`).toBe(want.kind);
    expect(got.optional, `${tableName}.${name} optional`).toBe(!!want.optional);
    expect(got.primaryKey, `${tableName}.${name} primaryKey`).toBe(!!want.primaryKey);
    expect(got.autoInc, `${tableName}.${name} autoInc`).toBe(!!want.autoInc);
  }
}

describe('llm_* table privacy (SEC-01)', () => {
  it('records llm_job and llm_call_log without public: true', async () => {
    await import('./tables');
    for (const name of ['llm_job', 'llm_call_log']) {
      const rec = recordedTable(name);
      expect(rec, name).toBeDefined();
      expect(rec!.opts.public).not.toBe(true);
    }
  });

  it('the set of public llm_* tables is exactly [llm_task] (Phase 42 tightens it to [])', async () => {
    await import('./tables');
    const publicLlm = recordedTables()
      .filter((r) => typeof r.name === 'string' && r.name.startsWith('llm_'))
      .filter((r) => r.opts.public === true)
      .map((r) => r.name)
      .sort();
    expect(publicLlm).toEqual(['llm_task']);
  });

  it('every llm_* table other than the legacy llm_task is private', async () => {
    await import('./tables');
    const llm = recordedTables().filter((r) => typeof r.name === 'string' && r.name.startsWith('llm_'));
    // Guard against the filter matching nothing.
    expect(llm.length).toBeGreaterThanOrEqual(12);
    for (const rec of llm.filter((r) => r.name !== 'llm_task')) {
      expect(rec.opts.public, rec.name).not.toBe(true);
    }
  });

  it('registers llm_job, llm_call_log and llm_config in schema({...})', async () => {
    const mod: any = await import('./tables');
    const defs = mod.default.__defs;
    expect(Object.keys(defs)).toEqual(
      expect.arrayContaining(['llm_job', 'llm_call_log', 'llm_config', 'llm_task', ...NEW_TABLES]),
    );
  });

  it('records the five Phase 41 tables without public: true', async () => {
    await import('./tables');
    for (const name of NEW_TABLES) {
      const rec = recordedTable(name);
      expect(rec, name).toBeDefined();
      expect(rec!.opts.public, name).not.toBe(true);
    }
  });
});

describe('llm_job and llm_call_log shape', () => {
  it('llm_job has exactly the planned columns and flags', async () => {
    await import('./tables');
    expectColumns('llm_job', JOB_COLUMNS);
  });

  it('llm_call_log has exactly the planned columns and flags', async () => {
    await import('./tables');
    expectColumns('llm_call_log', LOG_COLUMNS);
  });

  it.each(NEW_TABLES)('%s has exactly the planned columns and flags', async (name) => {
    await import('./tables');
    expectColumns(name, NEW_TABLE_COLUMNS[name]);
  });

  it('no column holds a built prompt, a header or the API key', async () => {
    await import('./tables');
    for (const name of ['llm_job', 'llm_call_log', ...NEW_TABLES]) {
      for (const col of Object.keys(recordedTable(name)!.cols)) {
        expect(col, `${name}.${col}`).not.toMatch(/prompt|header|apikey/i);
      }
    }
  });

  const EXPECTED_INDEXES: Array<[string, string, string]> = [
    ['llm_job', 'by_player', 'playerId'],
    ['llm_job', 'by_dedupe_key', 'dedupeKey'],
    ['llm_job', 'by_status', 'status'],
    ['llm_call_log', 'by_job', 'jobId'],
    ['llm_call_log', 'by_player', 'playerId'],
    ['llm_player_budget', 'by_player', 'playerId'],
  ];

  it('declares exactly the planned indexes, single-column btree, in the table OPTIONS', async () => {
    await import('./tables');
    for (const tableName of ['llm_job', 'llm_call_log', 'llm_player_budget']) {
      const declared = recordedTable(tableName)!.opts.indexes as any[];
      const want = EXPECTED_INDEXES.filter(([t]) => t === tableName);
      expect(declared.length).toBe(want.length);
      for (const [, accessor, column] of want) {
        expect(declared).toContainEqual({ accessor, algorithm: 'btree', columns: [column] });
      }
      for (const idx of declared) {
        expect(idx.algorithm).toBe('btree');
        expect(idx.columns).toHaveLength(1);
      }
    }
  });

  it('the other new tables declare no secondary index', async () => {
    await import('./tables');
    for (const name of ['llm_dispatch', 'llm_sweep_tick', 'llm_spend', 'llm_admin_state']) {
      expect(recordedTable(name)!.opts.indexes ?? [], name).toEqual([]);
    }
  });

  it.each(EXPECTED_INDEXES)(
    'positive control: the mock DB finds a seeded %s row through %s (%s)',
    (tableName, accessor, column) => {
      const marker = `marker-${tableName}-${accessor}`;
      const db = createMockDb({
        [tableName]: [
          { id: 1n, [column]: marker },
          { id: 2n, [column]: 'other' },
        ],
      });
      const found = [...(db as any)[tableName][accessor].filter(marker)];
      expect(found).toHaveLength(1);
      expect(found[0].id).toBe(1n);
    },
  );
});
