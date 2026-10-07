import { describe, it, expect, vi, beforeAll } from 'vitest';
import { recordedTable } from '../helpers/schema_recorder';

vi.mock('spacetimedb/server', async () =>
  (await import('../helpers/schema_recorder')).createRecordingServerMock(),
);

beforeAll(async () => {
  await import('./tables');
});

// Phase 51.1: emails never leave the server, and every character carries a stored online flag
// (ROADMAP 51.1 criteria 1 and 5).

describe('user table privacy', () => {
  it('is recorded without a truthy public option', () => {
    const rec = recordedTable('user');
    expect(rec).toBeDefined();
    expect(rec!.opts.public).toBeFalsy();
  });

  it('keeps its by_email index for the reducers that read it', () => {
    const idx = (recordedTable('user')!.opts.indexes ?? []) as any[];
    expect(idx.find((i) => i.accessor === 'by_email')).toMatchObject({ algorithm: 'btree', columns: ['email'] });
  });
});

describe('character online columns', () => {
  it('ends with online (bool, defaulted) then lastOnlineAtMicros (u64, defaulted)', () => {
    const rec = recordedTable('character')!;
    expect(rec).toBeDefined();
    const names = Object.keys(rec.cols);
    expect(names.slice(-2)).toEqual(['online', 'lastOnlineAtMicros']);
    expect(rec.cols.online).toMatchObject({ kind: 'bool', defaulted: true, optional: false });
    expect(rec.cols.lastOnlineAtMicros).toMatchObject({ kind: 'u64', defaulted: true, optional: false });
  });

  it('leaves the character table public', () => {
    expect(recordedTable('character')!.opts.public).toBe(true);
  });
});
