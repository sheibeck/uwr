import { describe, it, expect, vi, beforeAll } from 'vitest';
// This tsconfig has no @types/node; vitest runs the file in Node, so the built-ins resolve at runtime.
// @ts-ignore
import { existsSync, readdirSync, readFileSync } from 'node:fs';
// @ts-ignore
import { fileURLToPath } from 'node:url';
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

const REPO_ROOT = fileURLToPath(new URL('../../../', import.meta.url)); // spacetimedb/src/schema -> repo root

function walkClient(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === 'module_bindings' || entry.name === 'node_modules') continue;
    const full = dir + entry.name + (entry.isDirectory() ? '/' : '');
    if (entry.isDirectory()) walkClient(full, out);
    else if (/\.(ts|vue|js)$/.test(entry.name) && !/\.test\.[a-z]+$/.test(entry.name)) out.push(full);
  }
  return out;
}

describe('the old request-validation path is gone', () => {
  it('the validation reducer is not registered', () => {
    expect(capturedReducer('validate_llm_request')).toBeUndefined();
    // Non-vacuity: the module graph did load.
    expect(capturedReducer('request_skill_offer')).toBeTypeOf('function');
  });

  it('the legacy helper module and the client composable do not exist', () => {
    expect(existsSync(new URL('../helpers/llm.ts', import.meta.url))).toBe(false);
    expect(existsSync(REPO_ROOT + 'src/composables/useLlm.ts')).toBe(false);
  });

  it('no client file outside module_bindings names the validation reducer', () => {
    const files = walkClient(REPO_ROOT + 'src/');
    expect(files.length).toBeGreaterThan(10);
    const offenders = files.filter((f) => /validateLlmRequest|validate_llm_request/.test(readFileSync(f, 'utf8')));
    expect(offenders).toEqual([]);
  });
});

function walkServer(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === 'node_modules' || entry.name === '__snapshots__') continue;
    const full = dir + entry.name + (entry.isDirectory() ? '/' : '');
    if (entry.isDirectory()) walkServer(full, out);
    else if (entry.name.endsWith('.ts') && !entry.name.endsWith('.test.ts')) out.push(full);
  }
  return out;
}

const codeLines = (text: string): string[] =>
  text.split('\n').filter((l) => !/^\s*(\/\/|\/\*|\*)/.test(l));

describe('no client-trusted result reducer and no reader of the legacy tables', () => {
  it('submit_llm_result, validate_llm_request and purge_llm_tasks are not registered', () => {
    for (const name of ['submit_llm_result', 'validate_llm_request', 'purge_llm_tasks']) {
      expect(capturedReducer(name), name).toBeUndefined();
    }
    // Non-vacuity: neighbouring reducers are captured.
    expect(capturedReducer('request_skill_offer')).toBeTypeOf('function');
    expect(capturedReducer('set_api_key')).toBeTypeOf('function');
    expect(capturedReducer('purge_legacy_llm')).toBeTypeOf('function');
  });

  it('no production file reads or writes llm_task, llm_request, llm_budget or llm_cleanup_tick through a db accessor', () => {
    const files = walkServer(fileURLToPath(new URL('../', import.meta.url)).replace(/\\/g, '/'));
    expect(files.length).toBeGreaterThan(50);
    const LEGACY = /\bdb\s*\.\s*(llm_task|llm_request|llm_budget|llm_cleanup_tick)\b/;
    const LIVE = /\bdb\s*\.\s*llm_job\b/;
    const offenders: string[] = [];
    let liveFiles = 0;
    for (const f of files) {
      const lines = codeLines(readFileSync(f, 'utf8'));
      if (lines.some((l) => LIVE.test(l))) liveFiles += 1;
      if (lines.some((l) => LEGACY.test(l))) offenders.push(f);
    }
    expect(liveFiles, 'the scan sees db.llm_job accessors').toBeGreaterThan(0);
    expect(offenders).toEqual([]);
  });

  it('the four legacy tables are still defined for publish 1', () => {
    const tables = readFileSync(new URL('./tables.ts', import.meta.url), 'utf8');
    for (const name of ['llm_task', 'llm_request', 'llm_budget', 'llm_cleanup_tick']) {
      expect(tables).toContain(`name: '${name}'`);
    }
  });
});
