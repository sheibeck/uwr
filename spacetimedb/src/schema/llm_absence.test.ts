import { describe, it, expect, vi, beforeAll } from 'vitest';
// This tsconfig has no @types/node; vitest runs the file in Node, so the built-ins resolve at runtime.
// @ts-ignore
import { existsSync, readdirSync, readFileSync } from 'node:fs';
// @ts-ignore
import { fileURLToPath } from 'node:url';
import { capturedReducer, recordedTable, recordedTables, strictTableSpec } from '../helpers/schema_recorder';
import { createMockCtx } from '../helpers/test-utils';
import * as scheduling from '../helpers/scheduling';

// ============================================================================
// Publish-2 absence guards (Phase 42, Plan 06)
// ============================================================================
//
// Publish 2 drops the four legacy llm tables, the drained sweep reducer and the
// purge reducer. These tests load the real module graph through the recording
// mock and check absence at the schema level (recorder, schema definition,
// scheduledReducers). The mock db returns [] for an unknown table, so a row
// check alone would pass vacuously.
// ============================================================================

vi.mock('spacetimedb/server', async () =>
  (await import('../helpers/schema_recorder')).createRecordingServerMock(),
);

beforeAll(async () => {
  await import('../index');
}, 120_000);

const rows = (ctx: any, table: string): any[] => ctx.db[table]._rows();

const LEGACY_TABLES = ['llm_task', 'llm_request', 'llm_budget', 'llm_cleanup_tick'];

describe('the legacy cleanup tick, its sweep and the purge are gone', () => {
  it('purge_legacy_llm and sweep_llm_errors are not registered; neighbours are', () => {
    expect(capturedReducer('purge_legacy_llm')).toBeUndefined();
    expect(capturedReducer('sweep_llm_errors')).toBeUndefined();
    // Non-vacuity: the module graph did load.
    expect(capturedReducer('set_api_key')).toBeTypeOf('function');
    expect(capturedReducer('request_skill_offer')).toBeTypeOf('function');
  });

  it('the recorder has no llm_cleanup_tick table and the schema definition has no such key', async () => {
    expect(recordedTable('llm_cleanup_tick')).toBeUndefined();
    expect(strictTableSpec('llm_cleanup_tick')).toBeUndefined();
    const mod: any = await import('./tables');
    expect(Object.keys(mod.default.__defs)).not.toContain('llm_cleanup_tick');
    expect(recordedTables().length).toBeGreaterThan(10);
  });

  it('scheduledReducers holds no entry for the sweep', async () => {
    const mod: any = await import('./tables');
    expect(Object.keys(mod.scheduledReducers)).not.toContain('sweep_llm_errors');
    // Non-vacuity: other scheduled reducers are registered.
    expect(Object.keys(mod.scheduledReducers)).toContain('combat_loop');
  });

  it('the scheduled_tables module exports no cleanup tick', async () => {
    const mod: any = await import('./scheduled_tables');
    expect(Object.keys(mod).filter((n) => /cleanup/i.test(n))).toEqual([]);
    expect(Object.keys(mod)).toContain('RoundTimerTick');
  });

  it('initScheduledTables still arms llm_sweep_tick and touches no dropped table', () => {
    const ctx = createMockCtx({ strict: true });
    // A strict mock throws on any table missing from the recorded schema.
    scheduling.initScheduledTables(ctx);
    expect(rows(ctx, 'llm_sweep_tick')).toHaveLength(1);
  });

  it('the client-connected handler leaves a sweep tick', () => {
    const handler = capturedReducer('__client_connected__');
    expect(handler, 'client-connected handler captured').toBeTypeOf('function');
    const ctx = createMockCtx();
    handler!(ctx);
    expect(rows(ctx, 'llm_sweep_tick')).toHaveLength(1);
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

describe('no client-trusted result reducer and no trace of the legacy tables', () => {
  it('submit_llm_result, validate_llm_request and purge_llm_tasks are not registered', () => {
    for (const name of ['submit_llm_result', 'validate_llm_request', 'purge_llm_tasks']) {
      expect(capturedReducer(name), name).toBeUndefined();
    }
    // Non-vacuity: neighbouring reducers are captured.
    expect(capturedReducer('request_skill_offer')).toBeTypeOf('function');
    expect(capturedReducer('set_api_key')).toBeTypeOf('function');
  });

  it('no legacy llm table is recorded, defined in the schema or named in tables.ts', async () => {
    const mod: any = await import('./tables');
    const defs = Object.keys(mod.default.__defs);
    const source = readFileSync(new URL('./tables.ts', import.meta.url), 'utf8');
    for (const name of LEGACY_TABLES) {
      expect(recordedTable(name), `recordedTable ${name}`).toBeUndefined();
      expect(strictTableSpec(name), `strictTableSpec ${name}`).toBeUndefined();
      expect(defs, `__defs ${name}`).not.toContain(name);
      expect(source, `tables.ts ${name}`).not.toContain(`name: '${name}'`);
    }
    // Non-vacuity: the live tables are still there.
    expect(defs).toEqual(expect.arrayContaining(['llm_job', 'llm_call_log', 'llm_config']));
    expect(recordedTable('llm_job')).toBeDefined();
  });

  it('no production file names a legacy table as a db accessor or a quoted string', () => {
    const files = walkServer(fileURLToPath(new URL('../', import.meta.url)).replace(/\\/g, '/'));
    expect(files.length).toBeGreaterThan(50);
    // Comment lines are scanned on purpose: removed things are described by concept, never by name.
    const NAMED = /(?:\bdb\s*\.\s*|['"`])(llm_task|llm_request|llm_budget|llm_cleanup_tick)\b/;
    const LIVE = /\bdb\s*\.\s*llm_job\b/;
    const offenders: string[] = [];
    let liveFiles = 0;
    for (const f of files) {
      const lines = readFileSync(f, 'utf8').split('\n');
      if (lines.some((l) => LIVE.test(l))) liveFiles += 1;
      if (lines.some((l) => NAMED.test(l))) offenders.push(f);
    }
    expect(liveFiles, 'the scan sees db.llm_job accessors').toBeGreaterThan(0);
    expect(offenders).toEqual([]);
  });
});
