import { describe, it, expect, vi, beforeAll, beforeEach, afterEach } from 'vitest';
import { createMockCtx as createLenientMockCtx } from '../helpers/test-utils';
import { capturedReducer, createRecordingServerMock } from '../helpers/schema_recorder';
import { findSecretLeaks } from '../helpers/measurement';
import { reservationMicroUsd, utcDay } from '../helpers/llm_budget';
import {
  LLM_SMOKE_ROUTES,
  LLM_DAILY_CEILING_MIN_MICRO_USD,
  LLM_DAILY_CEILING_MAX_MICRO_USD,
} from '../data/llm_limits';
import { ADMIN_IDENTITIES, requireAdmin } from '../data/admin';
import { requireCharacterOwnedBy } from '../helpers/events';
import { registerLlmReducers, LLM_KEY_SET_LOG_PREFIX } from './llm';

// The recording mock supplies a chainable `t`, SenderError and captures reducer registrations.
vi.mock('spacetimedb/server', async () =>
  (await import('../helpers/schema_recorder')).createRecordingServerMock(),
);

// Strict mock db: unknown index accessors and missing-row updates throw, like the real db.
beforeAll(async () => {
  await import('../schema/tables');
  const { t, schema, SenderError } = createRecordingServerMock();
  const spacetimedb = schema({});
  registerLlmReducers({
    spacetimedb,
    t,
    SenderError,
    requireAdmin,
    requireCharacterOwnedBy,
    fail: () => {
      throw new Error('fail() is not expected in these reducers');
    },
  });
});

const createMockCtx = (o: Parameters<typeof createLenientMockCtx>[0] = {}) =>
  createLenientMockCtx({ ...o, strict: true });

const ident = (hex: string) => ({ toHexString: () => hex });
const CLI_HEX = 'c200252497b98fff5aab75f8fbc675956b5a12a5b85042ab355d3a05c6ab7d6e';
const admin = ident(CLI_HEX);
const stranger = ident('not-an-admin');

// Fake key built from fragments so no key-shaped literal sits in the source.
const FAKE_KEY = ['sk', 'ant', 'api03', 'FAKEFRAGMENTabcdef0123456789'].join('-');
const FAKE_KEY_PADDED = `  ${FAKE_KEY}  `;

const rows = (ctx: any, table: string): any[] => ctx.db[table]._rows();
const reducer = (name: string) => {
  const fn = capturedReducer(name);
  expect(fn, `reducer ${name} registered`).toBeTypeOf('function');
  return fn as (...args: any[]) => any;
};

function adminCtx(seed: Record<string, any[]> = {}, over: Record<string, unknown> = {}) {
  return createMockCtx({ sender: admin, seed, ...over } as any);
}

function collectConsole() {
  const lines: string[] = [];
  const grab = (...args: unknown[]) => {
    lines.push(args.map((a) => String(a)).join(' '));
  };
  const spies = (['log', 'info', 'warn', 'error', 'debug'] as const).map((m) => vi.spyOn(console, m).mockImplementation(grab));
  return { lines, spies };
}

let output: ReturnType<typeof collectConsole>;
beforeEach(() => {
  output = collectConsole();
});
afterEach(() => {
  for (const s of output.spies) s.mockRestore();
});

function jsonOf(v: unknown): string {
  return JSON.stringify(v, (_k, val) => (typeof val === 'bigint' ? val.toString() : val));
}

/** Leak count for the key over every table except llm_config plus everything logged. */
function leaksOutsideConfig(ctx: any, key: string): number {
  const tables: Record<string, any[]> = ctx.db._tables;
  let total = 0;
  for (const [name, list] of Object.entries(tables)) {
    if (name === 'llm_config') continue;
    total += findSecretLeaks(jsonOf(list), { needles: [key], strictPrefix: true }).total;
  }
  total += findSecretLeaks(output.lines.join('\n'), { needles: [key], strictPrefix: true }).total;
  return total;
}

describe('the admin identity used by these tests', () => {
  it('is the CLI admin identity pinned in data/admin.ts', () => {
    expect(ADMIN_IDENTITIES.has(CLI_HEX)).toBe(true);
    expect(ADMIN_IDENTITIES.has('not-an-admin')).toBe(false);
  });
});

describe('set_api_key', () => {
  it('rejects a non-admin with "Admin only" and writes nothing', () => {
    // Seeded empty: the shared mock otherwise carries a default admin-state row (Phase 43).
    const ctx = createMockCtx({ sender: stranger, seed: { llm_admin_state: [] } });
    expect(() => reducer('set_api_key')(ctx, { apiKey: FAKE_KEY })).toThrow('Admin only');
    expect(rows(ctx, 'llm_config')).toHaveLength(0);
    expect(rows(ctx, 'llm_admin_state')).toHaveLength(0);
    expect(output.lines).toEqual([]);
  });

  it('stores the trimmed key and records status only', () => {
    const ctx = adminCtx();
    reducer('set_api_key')(ctx, { apiKey: FAKE_KEY_PADDED });

    const config = rows(ctx, 'llm_config');
    expect(config).toHaveLength(1);
    expect(config[0].id).toBe(1n);
    expect(config[0].apiKey).toBe(FAKE_KEY);

    const state = rows(ctx, 'llm_admin_state');
    expect(state).toHaveLength(1);
    expect(state[0]).toMatchObject({
      id: 1n,
      keySet: true,
      keyLength: BigInt(FAKE_KEY.length),
      keyUpdatedAt: ctx.timestamp,
      keyLastCheckOk: false,
    });
    expect(state[0].keyVerifiedAt).toBeUndefined();
  });

  it('logs exactly "llm key set, len=<n>" once and never the key', () => {
    const ctx = adminCtx();
    reducer('set_api_key')(ctx, { apiKey: FAKE_KEY_PADDED });
    expect(LLM_KEY_SET_LOG_PREFIX).toBe('llm key set, len=');
    expect(output.spies[1]).toHaveBeenCalledTimes(1); // console.info
    expect(output.lines).toEqual([`llm key set, len=${FAKE_KEY.length}`]);
    expect(leaksOutsideConfig(ctx, FAKE_KEY)).toBe(0);
  });

  it('rejects a blank key with a SenderError and writes nothing', () => {
    const ctx = adminCtx({ llm_admin_state: [] });
    expect(() => reducer('set_api_key')(ctx, { apiKey: '   ' })).toThrow('API key cannot be empty');
    expect(rows(ctx, 'llm_config')).toHaveLength(0);
    expect(rows(ctx, 'llm_admin_state')).toHaveLength(0);
  });

  it('rotating the key clears verification and leaves in-flight jobs untouched', () => {
    const ctx = adminCtx({
      llm_job: [{ id: 1n, playerId: stranger, route: 'renown_perk_gen', status: 'in_flight', requestJson: '{}' }],
    });
    reducer('set_api_key')(ctx, { apiKey: FAKE_KEY });
    // The smoke test passed for the first key.
    const state = rows(ctx, 'llm_admin_state')[0];
    ctx.db.llm_admin_state.id.update({
      ...state,
      keyLastCheckOk: true,
      keyVerifiedAt: { microsSinceUnixEpoch: ctx.timestamp.microsSinceUnixEpoch + 1n },
    });
    const jobBefore = jsonOf(rows(ctx, 'llm_job'));

    const rotated = FAKE_KEY + 'ROTATED';
    reducer('set_api_key')(ctx, { apiKey: rotated });

    expect(rows(ctx, 'llm_config')[0].apiKey).toBe(rotated);
    const after = rows(ctx, 'llm_admin_state')[0];
    expect(after.keyVerifiedAt).toBeUndefined();
    expect(after.keyLastCheckOk).toBe(false);
    expect(after.keyLength).toBe(BigInt(rotated.length));
    expect(jsonOf(rows(ctx, 'llm_job'))).toBe(jobBefore);
    expect(leaksOutsideConfig(ctx, rotated)).toBe(0);
  });
});

describe('llm_set_enabled', () => {
  const stateRow = (extra: Record<string, unknown> = {}) => ({
    id: 1n, keySet: true, keyLength: 40n, keyLastCheckOk: true, lastSmokeJson: '{}', llmEnabled: true, dailyCeilingMicroUsd: 7_000_000n, ...extra,
  });

  it('rejects a non-admin with "Admin only" and writes nothing', () => {
    const ctx = createMockCtx({ sender: stranger, seed: { llm_admin_state: [] } });
    expect(() => reducer('llm_set_enabled')(ctx, { enabled: false })).toThrow('Admin only');
    expect(rows(ctx, 'llm_admin_state')).toHaveLength(0);
    expect(output.lines).toEqual([]);
  });

  it('a stranger cannot change an existing row', () => {
    const ctx = createMockCtx({ sender: stranger, seed: { llm_admin_state: [stateRow()] } });
    const before = jsonOf(ctx.db._tables);
    expect(() => reducer('llm_set_enabled')(ctx, { enabled: false })).toThrow('Admin only');
    expect(jsonOf(ctx.db._tables)).toBe(before);
  });

  it('the admin turns calls off and on, logging only the plain line', () => {
    const ctx = adminCtx();
    reducer('llm_set_enabled')(ctx, { enabled: false });
    expect(rows(ctx, 'llm_admin_state')[0].llmEnabled).toBe(false);
    reducer('llm_set_enabled')(ctx, { enabled: true });
    expect(rows(ctx, 'llm_admin_state')[0].llmEnabled).toBe(true);
    expect(output.lines).toEqual(['llm calls off', 'llm calls on']);
  });

  it('keeps the key status and the ceiling when flipping', () => {
    const ctx = adminCtx({ llm_admin_state: [stateRow()] });
    reducer('llm_set_enabled')(ctx, { enabled: false });
    expect(rows(ctx, 'llm_admin_state')[0]).toMatchObject({
      keySet: true, keyLength: 40n, dailyCeilingMicroUsd: 7_000_000n, llmEnabled: false,
    });
  });
});

describe('llm_set_daily_ceiling', () => {
  const stateRow = (ceiling: bigint) => ({
    id: 1n, keySet: false, keyLength: 0n, keyLastCheckOk: false, lastSmokeJson: '{}', llmEnabled: true, dailyCeilingMicroUsd: ceiling,
  });

  it('rejects a non-admin with "Admin only" and writes nothing', () => {
    const ctx = createMockCtx({ sender: stranger, seed: { llm_admin_state: [stateRow(10_000_000n)] } });
    const before = jsonOf(ctx.db._tables);
    expect(() => reducer('llm_set_daily_ceiling')(ctx, { microUsd: 5_000_000n })).toThrow('Admin only');
    expect(jsonOf(ctx.db._tables)).toBe(before);
    expect(output.lines).toEqual([]);
  });

  it('refuses MIN - 1, MAX + 1 and 0 with the range message and writes nothing', () => {
    for (const bad of [LLM_DAILY_CEILING_MIN_MICRO_USD - 1n, LLM_DAILY_CEILING_MAX_MICRO_USD + 1n, 0n]) {
      const ctx = adminCtx({ llm_admin_state: [stateRow(10_000_000n)] });
      const before = jsonOf(ctx.db._tables);
      expect(() => reducer('llm_set_daily_ceiling')(ctx, { microUsd: bad })).toThrow(
        'Daily ceiling must be between $0.01 and $1000.00.',
      );
      expect(jsonOf(ctx.db._tables)).toBe(before);
    }
    expect(output.lines).toEqual([]);
  });

  it('stores MIN and MAX and logs the new ceiling in micro-USD only', () => {
    const ctx = adminCtx({ llm_admin_state: [stateRow(10_000_000n)] });
    reducer('llm_set_daily_ceiling')(ctx, { microUsd: LLM_DAILY_CEILING_MIN_MICRO_USD });
    expect(rows(ctx, 'llm_admin_state')[0].dailyCeilingMicroUsd).toBe(LLM_DAILY_CEILING_MIN_MICRO_USD);
    reducer('llm_set_daily_ceiling')(ctx, { microUsd: LLM_DAILY_CEILING_MAX_MICRO_USD });
    expect(rows(ctx, 'llm_admin_state')[0].dailyCeilingMicroUsd).toBe(LLM_DAILY_CEILING_MAX_MICRO_USD);
    expect(output.lines).toEqual([
      `llm daily ceiling set, micro_usd=${LLM_DAILY_CEILING_MIN_MICRO_USD}`,
      `llm daily ceiling set, micro_usd=${LLM_DAILY_CEILING_MAX_MICRO_USD}`,
    ]);
  });

  it('never carries the key in a table or a log line', () => {
    const ctx = adminCtx({ llm_config: [{ id: 1n, apiKey: FAKE_KEY, updatedAt: { microsSinceUnixEpoch: 1n } }] });
    reducer('llm_set_enabled')(ctx, { enabled: false });
    reducer('llm_set_daily_ceiling')(ctx, { microUsd: 5_000_000n });
    expect(leaksOutsideConfig(ctx, FAKE_KEY)).toBe(0);
  });
});

describe('llm_smoke_test', () => {
  it('rejects a non-admin and writes nothing', () => {
    const ctx = createMockCtx({ sender: stranger, seed: { llm_admin_state: [] } });
    expect(() => reducer('llm_smoke_test')(ctx, {})).toThrow('Admin only');
    expect(rows(ctx, 'llm_job')).toHaveLength(0);
    expect(rows(ctx, 'llm_dispatch')).toHaveLength(0);
    expect(rows(ctx, 'llm_admin_state')).toHaveLength(0);
    expect(rows(ctx, 'llm_spend')).toHaveLength(0);
  });

  it('enqueues one phase-only smoke job per smoke route with dispatch rows and reserves against the ledger only', () => {
    const ctx = adminCtx({
      llm_admin_state: [
        { id: 1n, keySet: true, keyLength: 40n, keyLastCheckOk: true, lastSmokeJson: '{"old":1}' },
      ],
    });
    reducer('llm_smoke_test')(ctx, {});

    const jobs = rows(ctx, 'llm_job');
    expect(jobs.map((j) => j.route)).toEqual([...LLM_SMOKE_ROUTES]);
    for (const j of jobs) {
      expect(j.requestJson).toBe('{"smoke":true}');
      expect(j.budgetDay).toBe('');
      expect(j.playerId).toBe(admin);
      expect(j.status).toBe('pending');
    }
    expect(rows(ctx, 'llm_dispatch')).toHaveLength(LLM_SMOKE_ROUTES.length);
    expect(rows(ctx, 'llm_player_budget')).toHaveLength(0);

    const expectedReserved = LLM_SMOKE_ROUTES.reduce((sum, r) => sum + reservationMicroUsd(r, '{"smoke":true}'), 0n);
    const ledger = rows(ctx, 'llm_spend')[0];
    expect(ledger.reservedMicroUsd).toBe(expectedReserved);
    expect(ledger.spentMicroUsd).toBe(0n);
    expect(jobs.reduce((s, j) => s + j.reservedMicroUsd, 0n)).toBe(expectedReserved);

    const state = rows(ctx, 'llm_admin_state')[0];
    expect(state.lastSmokeJson).toBe('{}');
    expect(state.lastSmokeAt).toEqual(ctx.timestamp);
    // Key status is untouched by a smoke run.
    expect(state.keySet).toBe(true);
    expect(state.keyLength).toBe(40n);
  });

  it('a second run while one is active enqueues nothing and keeps lastSmokeJson', () => {
    const ctx = adminCtx();
    reducer('llm_smoke_test')(ctx, {});
    const state = rows(ctx, 'llm_admin_state')[0];
    ctx.db.llm_admin_state.id.update({ ...state, lastSmokeJson: '{"smoke_test":{"ok":true}}' });
    const before = jsonOf(ctx.db._tables);

    reducer('llm_smoke_test')(ctx, {});

    expect(jsonOf(ctx.db._tables)).toBe(before);
    expect(rows(ctx, 'llm_job')).toHaveLength(LLM_SMOKE_ROUTES.length);
    expect(rows(ctx, 'llm_admin_state')[0].lastSmokeJson).toBe('{"smoke_test":{"ok":true}}');
  });

  it('a new run enqueues the smoke routes again once every smoke job is terminal', () => {
    const ctx = adminCtx();
    reducer('llm_smoke_test')(ctx, {});
    for (const j of rows(ctx, 'llm_job')) ctx.db.llm_job.id.update({ ...j, status: 'completed' });

    reducer('llm_smoke_test')(ctx, {});

    const jobs = rows(ctx, 'llm_job');
    expect(jobs).toHaveLength(LLM_SMOKE_ROUTES.length * 2);
    expect(jobs.filter((j) => j.status === 'pending')).toHaveLength(LLM_SMOKE_ROUTES.length);
  });

  it('is still refused while only one smoke job remains active', () => {
    const ctx = adminCtx();
    reducer('llm_smoke_test')(ctx, {});
    const list = rows(ctx, 'llm_job');
    for (const j of list.slice(1)) ctx.db.llm_job.id.update({ ...j, status: 'completed' });
    reducer('llm_smoke_test')(ctx, {});
    expect(rows(ctx, 'llm_job')).toHaveLength(LLM_SMOKE_ROUTES.length);
  });

  it('is not blocked by an active non-smoke job of the admin', () => {
    const ctx = adminCtx({
      llm_job: [{ id: 1n, playerId: admin, route: 'renown_perk_gen', status: 'pending', requestJson: '{"rank":2}', dedupeKey: 'other' }],
    });
    reducer('llm_smoke_test')(ctx, {});
    expect(rows(ctx, 'llm_job')).toHaveLength(LLM_SMOKE_ROUTES.length + 1);
  });

  // Phase 43 CONTEXT retires the phase cap: the smoke test now follows the kill switch and the global daily ceiling.
  // (The two earlier phase-cap cases are flipped on purpose to the ceiling below.)
  const smokeNeeded = () =>
    LLM_SMOKE_ROUTES.reduce((sum, r) => sum + reservationMicroUsd(r, '{"smoke":true}'), 0n);
  const stateRow = (ceiling: bigint, extra: Record<string, unknown> = {}) => ({
    id: 1n,
    keySet: true,
    keyLength: 40n,
    keyLastCheckOk: true,
    lastSmokeJson: '{"keep":true}',
    llmEnabled: true,
    dailyCeilingMicroUsd: ceiling,
    ...extra,
  });
  const spendRow = (ctx: any, daySpent: bigint, reserved = 0n) => ({
    id: 1n,
    spentMicroUsd: daySpent,
    reservedMicroUsd: reserved,
    calls: 1n,
    updatedAt: { microsSinceUnixEpoch: 1n },
    dayUtc: utcDay(ctx.timestamp),
    daySpentMicroUsd: daySpent,
  });

  it('at the daily ceiling creates no jobs, logs the refusal and does not throw', () => {
    const base = adminCtx();
    const ctx = adminCtx({
      llm_spend: [spendRow(base, 5_000_000n)],
      llm_admin_state: [stateRow(5_000_000n)],
    });
    expect(() => reducer('llm_smoke_test')(ctx, {})).not.toThrow();
    expect(rows(ctx, 'llm_job')).toHaveLength(0);
    expect(rows(ctx, 'llm_dispatch')).toHaveLength(0);
    expect(rows(ctx, 'llm_spend')[0].reservedMicroUsd).toBe(0n);
    expect(rows(ctx, 'llm_admin_state')[0].lastSmokeJson).toBe('{"keep":true}');
    expect(output.lines).toEqual(['llm smoke test refused: daily ceiling']);
  });

  it('one micro-USD over the ceiling creates no job at all (never a half run)', () => {
    const base = adminCtx();
    const held = 1_000_000n;
    const ctx = adminCtx({
      llm_spend: [spendRow(base, held)],
      llm_admin_state: [stateRow(held + smokeNeeded() - 1n)],
    });
    expect(() => reducer('llm_smoke_test')(ctx, {})).not.toThrow();
    expect(rows(ctx, 'llm_job')).toHaveLength(0);
    expect(rows(ctx, 'llm_dispatch')).toHaveLength(0);
    expect(output.lines).toEqual(['llm smoke test refused: daily ceiling']);
  });

  it('exactly at the ceiling creates one job per smoke route', () => {
    const base = adminCtx();
    const held = 1_000_000n;
    const needed = smokeNeeded();
    const ctx = adminCtx({
      llm_spend: [spendRow(base, held)],
      llm_admin_state: [stateRow(held + needed)],
    });
    reducer('llm_smoke_test')(ctx, {});
    expect(rows(ctx, 'llm_job')).toHaveLength(LLM_SMOKE_ROUTES.length);
    expect(rows(ctx, 'llm_spend')[0].reservedMicroUsd).toBe(needed);
  });

  it('counts reservations still held toward the ceiling', () => {
    const base = adminCtx();
    const ctx = adminCtx({
      llm_spend: [spendRow(base, 0n, 10n)],
      llm_admin_state: [stateRow(smokeNeeded() + 9n)],
    });
    reducer('llm_smoke_test')(ctx, {});
    expect(rows(ctx, 'llm_job')).toHaveLength(0);
  });

  it('while llm calls are off creates no job, dispatch or reservation, logs the refusal and does not throw', () => {
    const ctx = adminCtx({ llm_admin_state: [stateRow(10_000_000n, { llmEnabled: false })] });
    expect(() => reducer('llm_smoke_test')(ctx, {})).not.toThrow();
    expect(rows(ctx, 'llm_job')).toHaveLength(0);
    expect(rows(ctx, 'llm_dispatch')).toHaveLength(0);
    expect(rows(ctx, 'llm_spend')).toHaveLength(0);
    expect(rows(ctx, 'llm_admin_state')[0].lastSmokeJson).toBe('{"keep":true}');
    expect(output.lines).toEqual(['llm smoke test refused: llm calls are off']);
  });

  it('never logs a key', () => {
    const ctx = adminCtx({ llm_config: [{ id: 1n, apiKey: FAKE_KEY, updatedAt: { microsSinceUnixEpoch: 1n } }] });
    reducer('llm_smoke_test')(ctx, {});
    expect(leaksOutsideConfig(ctx, FAKE_KEY)).toBe(0);
  });
});

describe('grant_test_pending_level', () => {
  const seed = (owner: bigint = 7n) => ({
    player: [{ id: admin, userId: 7n }],
    character: [{ id: 5n, ownerUserId: owner, pendingLevels: 1n }],
  });

  it('rejects a non-admin with "Admin only"', () => {
    const ctx = createMockCtx({ sender: stranger, seed: seed() });
    expect(() => reducer('grant_test_pending_level')(ctx, { characterId: 5n, levels: 2n })).toThrow('Admin only');
    expect(rows(ctx, 'character')[0].pendingLevels).toBe(1n);
  });

  it('adds the levels to pendingLevels on the admin\'s own character', () => {
    const ctx = adminCtx(seed());
    reducer('grant_test_pending_level')(ctx, { characterId: 5n, levels: 2n });
    expect(rows(ctx, 'character')[0].pendingLevels).toBe(3n);
  });

  it('treats a missing pendingLevels as zero', () => {
    const ctx = adminCtx({
      player: [{ id: admin, userId: 7n }],
      character: [{ id: 5n, ownerUserId: 7n }],
    });
    reducer('grant_test_pending_level')(ctx, { characterId: 5n, levels: 5n });
    expect(rows(ctx, 'character')[0].pendingLevels).toBe(5n);
  });

  it('rejects levels outside 1 to 5 and changes nothing', () => {
    for (const levels of [0n, 6n]) {
      const ctx = adminCtx(seed());
      expect(() => reducer('grant_test_pending_level')(ctx, { characterId: 5n, levels })).toThrow('levels must be between 1 and 5');
      expect(rows(ctx, 'character')[0].pendingLevels).toBe(1n);
    }
  });

  it('rejects an admin who does not own the character', () => {
    const ctx = adminCtx(seed(99n));
    expect(() => reducer('grant_test_pending_level')(ctx, { characterId: 5n, levels: 2n })).toThrow('Not your character');
    expect(rows(ctx, 'character')[0].pendingLevels).toBe(1n);
  });

  it('rejects an unknown character', () => {
    const ctx = adminCtx(seed());
    expect(() => reducer('grant_test_pending_level')(ctx, { characterId: 404n, levels: 1n })).toThrow('Character not found');
  });
});
