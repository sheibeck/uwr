import { describe, it, expect, vi, beforeAll } from 'vitest';
import { createMockCtx as createLenientMockCtx } from './test-utils';
import { rowColumnProblems } from './schema_recorder';
import {
  insertLlmDispatch,
  hasLlmDispatch,
  ensureLlmSweepScheduled,
  scheduledMicros,
} from './llm_schedule';

// Records the real column definitions so the strict mock knows the accessors.
vi.mock('spacetimedb/server', async () =>
  (await import('./schema_recorder')).createRecordingServerMock(),
);

beforeAll(async () => {
  await import('../schema/tables');
});

const createMockCtx = (o: Parameters<typeof createLenientMockCtx>[0] = {}) =>
  createLenientMockCtx({ ...o, strict: true });

const rows = (ctx: any, table: string): any[] => ctx.db[table]._rows();
const T = 1_700_000_000_000_000n;

describe('insertLlmDispatch', () => {
  it('inserts one llm_dispatch row carrying the job id and the fire time', () => {
    const ctx = createMockCtx({ timestampMicros: T });
    const row = insertLlmDispatch(ctx, 7n, T + 5_000_000n);
    const stored = rows(ctx, 'llm_dispatch');
    expect(stored).toHaveLength(1);
    expect(stored[0].jobId).toBe(7n);
    expect(scheduledMicros(stored[0].scheduledAt)).toBe(T + 5_000_000n);
    expect(row.jobId).toBe(7n);
  });

  it('writes a row that matches the recorded column definitions', () => {
    const ctx = createMockCtx({ timestampMicros: T });
    insertLlmDispatch(ctx, 7n, T);
    expect(rowColumnProblems('llm_dispatch', rows(ctx, 'llm_dispatch')[0])).toEqual([]);
  });

  it('inserts a NEW row for every call (rows are never reused)', () => {
    const ctx = createMockCtx({ timestampMicros: T });
    insertLlmDispatch(ctx, 7n, T);
    insertLlmDispatch(ctx, 7n, T + 1n);
    expect(rows(ctx, 'llm_dispatch')).toHaveLength(2);
  });
});

describe('hasLlmDispatch', () => {
  it('is true for a job with a row and false for one without', () => {
    const ctx = createMockCtx({ timestampMicros: T });
    expect(hasLlmDispatch(ctx, 7n)).toBe(false);
    insertLlmDispatch(ctx, 7n, T);
    expect(hasLlmDispatch(ctx, 7n)).toBe(true);
    expect(hasLlmDispatch(ctx, 8n)).toBe(false);
  });
});

describe('scheduledMicros', () => {
  it('reads a Time schedule and returns null for anything else', () => {
    expect(scheduledMicros({ tag: 'Time', value: { microsSinceUnixEpoch: 55n } })).toBe(55n);
    expect(scheduledMicros({ tag: 'Interval', value: { micros: 5n } })).toBeNull();
    expect(scheduledMicros(undefined)).toBeNull();
    expect(scheduledMicros(null)).toBeNull();
  });
});

describe('ensureLlmSweepScheduled', () => {
  it('inserts one tick 30 s out on an empty table and returns true', () => {
    const ctx = createMockCtx({ timestampMicros: T });
    expect(ensureLlmSweepScheduled(ctx)).toBe(true);
    const stored = rows(ctx, 'llm_sweep_tick');
    expect(stored).toHaveLength(1);
    expect(scheduledMicros(stored[0].scheduledAt)).toBe(T + 30_000_000n);
  });

  it('is idempotent: a second call returns false and leaves one row', () => {
    const ctx = createMockCtx({ timestampMicros: T });
    expect(ensureLlmSweepScheduled(ctx)).toBe(true);
    expect(ensureLlmSweepScheduled(ctx)).toBe(false);
    expect(rows(ctx, 'llm_sweep_tick')).toHaveLength(1);
  });
});
