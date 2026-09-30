import { describe, it, expect, vi, beforeAll } from 'vitest';
import { ScheduleAt } from 'spacetimedb';
import { capturedReducer } from '../helpers/schema_recorder';
import { createMockCtx } from '../helpers/test-utils';
import * as scheduling from '../helpers/scheduling';

// ============================================================================
// Publish-1 absence guards (Phase 42, Plan 03)
// ============================================================================
//
// Publish 1 removes every reader and writer of the four legacy llm tables while
// the tables stay defined. These tests load the real module graph through the
// recording mock and prove that nothing re-arms the legacy cleanup tick, and that
// the removed reducers are not registered.
// ============================================================================

vi.mock('spacetimedb/server', async () =>
  (await import('../helpers/schema_recorder')).createRecordingServerMock(),
);

beforeAll(async () => {
  await import('../index');
}, 120_000);

const rows = (ctx: any, table: string): any[] => ctx.db[table]._rows();

describe('the legacy cleanup tick is never re-armed', () => {
  it('helpers/scheduling exports no legacy cleanup ensure helper', () => {
    const names = Object.keys(scheduling);
    expect(names.filter((n) => /cleanup/i.test(n))).toEqual([]);
    expect(names).toContain('initScheduledTables');
  });

  it('initScheduledTables inserts no llm_cleanup_tick row and still arms the sweep tick', () => {
    const ctx = createMockCtx();
    scheduling.initScheduledTables(ctx);
    expect(rows(ctx, 'llm_cleanup_tick')).toEqual([]);
    expect(rows(ctx, 'llm_sweep_tick')).toHaveLength(1);
  });

  it('the client-connected handler inserts no llm_cleanup_tick row and leaves a sweep tick', () => {
    const handler = capturedReducer('__client_connected__');
    expect(handler, 'client-connected handler captured').toBeTypeOf('function');
    const ctx = createMockCtx();
    handler!(ctx);
    expect(rows(ctx, 'llm_cleanup_tick')).toEqual([]);
    expect(rows(ctx, 'llm_sweep_tick')).toHaveLength(1);
  });

  it('the legacy sweep reducer is a drain: it reads no llm_request row and inserts no tick', () => {
    const drain = capturedReducer('sweep_llm_errors');
    expect(drain, 'sweep_llm_errors still registered (the tick table points at it)').toBeTypeOf('function');
    const old = {
      id: 1n,
      playerId: { toHexString: () => 'p' },
      characterId: 1n,
      domain: 'world_gen',
      model: 'legacy',
      userPrompt: '',
      status: 'error',
      createdAt: { microsSinceUnixEpoch: 1n },
    };
    const ctx = createMockCtx({
      seed: { llm_request: [old] },
      timestampMicros: 9_000_000_000_000n,
    });
    drain!(ctx, { scheduledId: 1n, scheduledAt: ScheduleAt.time(1n) });
    expect(rows(ctx, 'llm_request')).toEqual([old]);
    expect(rows(ctx, 'llm_cleanup_tick')).toEqual([]);
  });
});
