/**
 * llm_admin_state helper tests (Phase 41, Plan 06).
 *
 * The singleton row holds key status and the last smoke result. It never holds the key itself.
 * Pure duck-typed module, exercised through a strict mock db (recorded schema).
 */
import { describe, it, expect, vi, beforeAll } from 'vitest';
import { createMockCtx } from './test-utils';
import { rowColumnProblems } from './schema_recorder';
import { LLM_SMOKE_JSON_MAX_CHARS } from '../data/llm_limits';
import {
  getAdminState,
  patchAdminState,
  markKeyCheck,
  recordSmokeResult,
  isKeyValid,
} from './llm_admin_state';

vi.mock('spacetimedb/server', async () =>
  (await import('./schema_recorder')).createRecordingServerMock(),
);

beforeAll(async () => {
  await import('../schema/tables');
});

const T0 = 1_700_000_000_000_000n;
const FAKE_KEY = ['sk', '-ant-', 'api03-', 'ADMINSTATEKEY'.repeat(3)].join('');

const makeCtx = (over: { seed?: Record<string, any[]>; timestampMicros?: bigint } = {}) =>
  createMockCtx({ seed: over.seed ?? {}, timestampMicros: over.timestampMicros ?? T0, strict: true });

const stateRow = (ctx: any): any => ctx.db._tables.llm_admin_state[0];
const smoke = (ctx: any): any => JSON.parse(stateRow(ctx).lastSmokeJson);

const okEntry = (over: Record<string, unknown> = {}) => ({
  ok: true,
  latencyMs: 1234,
  input: 10,
  output: 20,
  cacheWrite: 30,
  cacheRead: 40,
  costMicroUsd: 5678n,
  ...over,
});

describe('getAdminState and patchAdminState', () => {
  it('getAdminState is undefined on an empty table', () => {
    const ctx = makeCtx();
    expect(getAdminState(ctx)).toBeUndefined();
  });

  it('patchAdminState on an empty table inserts the defaults, then applies the patch', async () => {
    const ctx = makeCtx();
    const row = patchAdminState(ctx, { keySet: true, keyLength: 108n });
    expect(row.id).toBe(1n);
    expect(row.keySet).toBe(true);
    expect(row.keyLength).toBe(108n);
    expect(row.keyLastCheckOk).toBe(false);
    expect(row.lastSmokeJson).toBe('{}');
    expect(ctx.db._tables.llm_admin_state).toHaveLength(1);
    expect(getAdminState(ctx)).toEqual(row);
  });

  it('the inserted row has exactly the recorded columns', () => {
    const ctx = makeCtx();
    patchAdminState(ctx, {});
    expect(rowColumnProblems('llm_admin_state', stateRow(ctx))).toEqual([]);
  });

  it('a second patch updates the same row and keeps earlier fields', () => {
    const ctx = makeCtx();
    patchAdminState(ctx, { keySet: true, keyLength: 50n });
    patchAdminState(ctx, { keyLength: 60n });
    expect(ctx.db._tables.llm_admin_state).toHaveLength(1);
    expect(stateRow(ctx).keySet).toBe(true);
    expect(stateRow(ctx).keyLength).toBe(60n);
  });
});

describe('markKeyCheck', () => {
  it('true sets keyLastCheckOk and keyVerifiedAt to now', () => {
    const ctx = makeCtx();
    markKeyCheck(ctx, true);
    expect(stateRow(ctx).keyLastCheckOk).toBe(true);
    expect(stateRow(ctx).keyVerifiedAt.microsSinceUnixEpoch).toBe(T0);
  });

  it('false clears keyLastCheckOk only and leaves keyVerifiedAt as it was', () => {
    const ctx = makeCtx();
    markKeyCheck(ctx, true);
    markKeyCheck(ctx, false);
    expect(stateRow(ctx).keyLastCheckOk).toBe(false);
    expect(stateRow(ctx).keyVerifiedAt.microsSinceUnixEpoch).toBe(T0);
  });

  it('false on an empty table creates the row with the check cleared and no verified time', () => {
    const ctx = makeCtx();
    markKeyCheck(ctx, false);
    expect(stateRow(ctx).keyLastCheckOk).toBe(false);
    expect(stateRow(ctx).keyVerifiedAt).toBeUndefined();
  });
});

describe('recordSmokeResult', () => {
  it('stores an entry keyed by route with decimal-string cost and time, and sets lastSmokeAt', () => {
    const ctx = makeCtx();
    recordSmokeResult(ctx, 'renown_perk_gen', okEntry(), [FAKE_KEY]);
    const json = smoke(ctx);
    expect(Object.keys(json)).toEqual(['renown_perk_gen']);
    expect(json.renown_perk_gen).toEqual({
      ok: true,
      latencyMs: 1234,
      input: 10,
      output: 20,
      cacheWrite: 30,
      cacheRead: 40,
      costMicroUsd: '5678',
      atMicros: String(T0),
    });
    expect(stateRow(ctx).lastSmokeAt.microsSinceUnixEpoch).toBe(T0);
  });

  it('a second result for the same route replaces the first; other routes are kept', () => {
    const ctx = makeCtx();
    recordSmokeResult(ctx, 'creation_race', okEntry({ ok: false, class: 'auth' }), []);
    recordSmokeResult(ctx, 'world_gen', okEntry(), []);
    recordSmokeResult(ctx, 'creation_race', okEntry({ ok: true }), []);
    const json = smoke(ctx);
    expect(Object.keys(json).sort()).toEqual(['creation_race', 'world_gen']);
    expect(json.creation_race.ok).toBe(true);
    expect(json.creation_race.class).toBeUndefined();
  });

  it('the completion order of two routes does not change the result', () => {
    const a = makeCtx();
    recordSmokeResult(a, 'creation_race', okEntry(), []);
    recordSmokeResult(a, 'world_gen', okEntry({ ok: false, class: 'server' }), []);
    const b = makeCtx();
    recordSmokeResult(b, 'world_gen', okEntry({ ok: false, class: 'server' }), []);
    recordSmokeResult(b, 'creation_race', okEntry(), []);
    expect(smoke(b)).toEqual(smoke(a));
  });

  it('keeps a failure class', () => {
    const ctx = makeCtx();
    recordSmokeResult(ctx, 'creation_race', okEntry({ ok: false, class: 'auth' }), []);
    expect(smoke(ctx).creation_race.ok).toBe(false);
    expect(smoke(ctx).creation_race.class).toBe('auth');
  });

  it('the smoke_test route keeps a reply cut to 120 code points; other routes never store one', () => {
    const ctx = makeCtx();
    const long = '\u{1F400}'.repeat(200);
    recordSmokeResult(ctx, 'smoke_test', okEntry({ reply: long }), []);
    recordSmokeResult(ctx, 'creation_race', okEntry({ reply: 'should not be kept' }), []);
    const json = smoke(ctx);
    expect([...json.smoke_test.reply]).toHaveLength(120);
    expect(json.smoke_test.reply).toBe('\u{1F400}'.repeat(120));
    expect(json.creation_race.reply).toBeUndefined();
  });

  it('a short reply is stored whole', () => {
    const ctx = makeCtx();
    recordSmokeResult(ctx, 'smoke_test', okEntry({ reply: 'The rat considers you.' }), []);
    expect(smoke(ctx).smoke_test.reply).toBe('The rat considers you.');
  });

  it('redacts a needle and a key-shaped string from the reply and the class', () => {
    const ctx = makeCtx();
    recordSmokeResult(ctx, 'smoke_test', okEntry({ reply: `echo ${FAKE_KEY} done` }), [FAKE_KEY]);
    recordSmokeResult(ctx, 'world_gen', okEntry({ ok: false, class: `odd ${FAKE_KEY}` }), [FAKE_KEY]);
    const text = stateRow(ctx).lastSmokeJson;
    expect(text).not.toContain(FAKE_KEY);
    expect(text).not.toContain(['sk', '-ant-'].join(''));
    expect(smoke(ctx).smoke_test.reply).toContain('[REDACTED]');
  });

  it('redacts a needle that has no key prefix', () => {
    const ctx = makeCtx();
    const needle = 'plain-secret-value-1234567890';
    recordSmokeResult(ctx, 'smoke_test', okEntry({ reply: `it said ${needle}` }), [needle]);
    expect(stateRow(ctx).lastSmokeJson).not.toContain(needle);
  });

  it('keeps the JSON at or under the cap; over the cap only the newest entry plus truncated:true stays', () => {
    const ctx = makeCtx();
    const routes = ['creation_race', 'creation_class', 'world_gen', 'skill_gen', 'renown_perk_gen', 'smoke_test'];
    // One entry fits under the cap; any two together do not.
    for (const r of routes) {
      recordSmokeResult(ctx, r as any, okEntry({ ok: false, class: 'x'.repeat(2500) }), []);
    }
    const text = stateRow(ctx).lastSmokeJson;
    expect(text.length).toBeLessThanOrEqual(LLM_SMOKE_JSON_MAX_CHARS);
    const json = JSON.parse(text);
    expect(json.truncated).toBe(true);
    expect(Object.keys(json).filter((k) => k !== 'truncated')).toEqual(['smoke_test']);
  });

  it('a small object is never marked truncated', () => {
    const ctx = makeCtx();
    recordSmokeResult(ctx, 'creation_race', okEntry(), []);
    recordSmokeResult(ctx, 'world_gen', okEntry(), []);
    expect(smoke(ctx).truncated).toBeUndefined();
  });

  it('recovers from malformed stored JSON', () => {
    const ctx = makeCtx({
      seed: {
        llm_admin_state: [
          { id: 1n, keySet: true, keyLength: 10n, keyLastCheckOk: false, lastSmokeJson: '{not json' },
        ],
      },
    });
    recordSmokeResult(ctx, 'creation_race', okEntry(), []);
    expect(Object.keys(smoke(ctx))).toEqual(['creation_race']);
  });
});

describe('isKeyValid', () => {
  const at = (micros: bigint) => ({ microsSinceUnixEpoch: micros });
  const base = {
    keySet: true,
    keyLength: 108n,
    keyUpdatedAt: at(100n),
    keyVerifiedAt: at(200n),
    keyLastCheckOk: true,
  };

  it('is true when set, last check ok and verified after the key was updated', () => {
    expect(isKeyValid(base)).toBe(true);
  });

  it('is true when verified at exactly the update time', () => {
    expect(isKeyValid({ ...base, keyVerifiedAt: at(100n) })).toBe(true);
  });

  it('is false when verified before the key was updated (a rotated key is unproven)', () => {
    expect(isKeyValid({ ...base, keyVerifiedAt: at(99n) })).toBe(false);
  });

  it('is false when the key is not set', () => {
    expect(isKeyValid({ ...base, keySet: false })).toBe(false);
  });

  it('is false when the last check failed', () => {
    expect(isKeyValid({ ...base, keyLastCheckOk: false })).toBe(false);
  });

  it('is false when never verified', () => {
    expect(isKeyValid({ ...base, keyVerifiedAt: undefined })).toBe(false);
  });

  it('is false for a missing state', () => {
    expect(isKeyValid(undefined)).toBe(false);
  });
});
