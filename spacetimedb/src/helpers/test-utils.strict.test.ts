import { describe, it, expect, vi, beforeAll } from 'vitest';
import { createMockDb, createMockCtx, createMockProcCtx } from './test-utils';
import { strictTableSpec } from './schema_recorder';

// Records the real table definitions; strict mode derives its accessor allowlist from them.
vi.mock('spacetimedb/server', async () =>
  (await import('./schema_recorder')).createRecordingServerMock(),
);

beforeAll(async () => {
  await import('../schema/tables');
});

const seed = () => ({
  llm_job: [{ id: 1n, playerId: 'alice', dedupeKey: 'k1', status: 'pending' }],
});

describe('strictTableSpec', () => {
  it('lists the declared index accessors with their first column, plus key columns', () => {
    const spec = strictTableSpec('llm_job');
    expect(spec).toBeDefined();
    expect(spec!.indexes).toEqual({ by_player: 'playerId', by_dedupe_key: 'dedupeKey', by_status: 'status' });
    expect(spec!.keys).toContain('id');
  });

  it('is undefined for a table that was never recorded', () => {
    expect(strictTableSpec('llm_jobz')).toBeUndefined();
  });
});

describe('createMockDb strict mode', () => {
  it('serves real index and primary-key accessors', () => {
    const db = createMockDb(seed(), { strict: true });
    expect(db.llm_job.by_player.filter('alice')).toHaveLength(1);
    expect(db.llm_job.by_status.filter('pending')).toHaveLength(1);
    expect(db.llm_job.id.find(1n)?.dedupeKey).toBe('k1');
    expect(db.llm_job.iter()).toHaveLength(1);
    expect(db.llm_job._rows()).toHaveLength(1);
  });

  it('rejects an accessor that is not a declared index (a production typo fails in the test)', () => {
    const db = createMockDb(seed(), { strict: true });
    expect(() => db.llm_job.by_playerz).toThrow(/by_playerz.*not an index or key accessor/);
    expect(() => db.llm_job.by_dedupe.filter('k1')).toThrow(/not an index or key accessor/);
  });

  it('rejects an index that exists on another table (by_job is llm_call_log only)', () => {
    const db = createMockDb(seed(), { strict: true });
    expect(() => db.llm_job.by_job).toThrow(/not an index or key accessor/);
  });

  it('rejects a non-key column used as an accessor', () => {
    const db = createMockDb(seed(), { strict: true });
    expect(() => db.llm_job.status).toThrow(/not an index or key accessor/);
  });

  it('rejects an unknown table for indexes, insert and iter', () => {
    const db = createMockDb({}, { strict: true });
    expect(() => db.llm_jobz.by_player).toThrow(/unknown table "llm_jobz"/);
    expect(() => db.llm_jobz.insert).toThrow(/unknown table "llm_jobz"/);
    expect(() => db.llm_jobz.iter).toThrow(/unknown table "llm_jobz"/);
  });

  it('update on a missing row throws, and on an existing row replaces it', () => {
    const db = createMockDb(seed(), { strict: true });
    expect(() => db.llm_job.id.update({ id: 99n, status: 'x' })).toThrow(/matched no row/);
    db.llm_job.id.update({ id: 1n, playerId: 'alice', dedupeKey: 'k1', status: 'completed' });
    expect(db.llm_job._rows()[0].status).toBe('completed');
  });

  it('delete of a missing row stays a quiet no-op (the real delete returns false)', () => {
    const db = createMockDb(seed(), { strict: true });
    expect(() => db.llm_job.id.delete(99n)).not.toThrow();
    expect(db.llm_job._rows()).toHaveLength(1);
  });

  it('createMockCtx and createMockProcCtx pass strict through', () => {
    expect(() => createMockCtx({ strict: true }).db.llm_job.by_playerz).toThrow(/not an index or key accessor/);
    const p = createMockProcCtx({ strict: true });
    expect(() => p.db.llm_job.by_playerz).toThrow(/not an index or key accessor/);
    expect(() => p.ctx.withTx((tx: any) => tx.db.llm_job.by_playerz)).toThrow(/not an index or key accessor/);
  });
});

describe('createMockDb default (lenient) mode is unchanged', () => {
  it('still guesses a column for an unknown by_* accessor and does not throw', () => {
    const db = createMockDb(seed());
    expect(() => db.llm_job.by_playerz).not.toThrow();
    expect(db.llm_job.by_playerz.filter('alice')).toEqual([]);
  });

  it('still no-ops update on a missing row', () => {
    const db = createMockDb(seed());
    expect(() => db.llm_job.id.update({ id: 99n, status: 'x' })).not.toThrow();
    expect(db.llm_job._rows()).toHaveLength(1);
  });

  it('still accepts an unknown table and any property', () => {
    const db = createMockDb({});
    expect(() => db.anything.whatever.find(1n)).not.toThrow();
  });

  it('createMockCtx without strict is lenient', () => {
    expect(() => createMockCtx().db.llm_job.by_playerz).not.toThrow();
  });
});
