import { describe, it, expect, vi, beforeAll } from 'vitest';
import { rowColumnProblems } from './schema_recorder';
import { createMockCtx as createLenientMockCtx, defaultLlmAdminStateRow } from './test-utils';
import { findSecretLeaks } from './measurement';
import { CLAUDE_MODEL } from '../data/llm_models';
import { LLM_ROUTE_NAMES } from '../data/llm_routes';
import {
  enqueueLlmJob,
  buildDedupeKey,
  SOURCE_KEYS,
  LLM_JOB_STATUSES,
  LLM_ACTIVE_JOB_STATUSES,
  LLM_TERMINAL_JOB_STATUSES,
  LLM_REQUEST_JSON_MAX_CHARS,
  LLM_ERROR_MESSAGE_MAX_CHARS,
  LLM_CALL_LOG_FIELD_MAX_CHARS,
  isActiveJobStatus,
  serializeRequest,
  resolveCharacterPlayerId,
  logLlmCall,
  LLM_CAP_EXEMPT_ROUTES,
  LLM_REFUSAL_MESSAGES,
  LLM_RESTING_LINE,
  llmRefusalMessage,
  countActiveCappedJobs,
  type LlmRefusal,
} from './llm_queue';
import { reservationMicroUsd, utcDay, getPhaseLedger } from './llm_budget';
import { scheduledMicros } from './llm_schedule';
import {
  LLM_PLAYER_DAILY_CALLS,
  LLM_PLAYER_DAILY_COST_MICRO_USD,
  LLM_DAILY_CEILING_DEFAULT_MICRO_USD,
  LLM_PLAYER_MAX_ACTIVE_JOBS,
} from '../data/llm_limits';
import { KEEPER_BANNED_PHRASES } from '../data/keeper_bible';

// Records the real column definitions so rowColumnProblems can validate inserted rows.
vi.mock('spacetimedb/server', async () =>
  (await import('./schema_recorder')).createRecordingServerMock(),
);

// Strict mock db (WR-04): unknown index accessors and missing-row updates throw, like the real db.
// The accessors come from the recorded schema, so load it before any test touches ctx.db.
beforeAll(async () => {
  await import('../schema/tables');
});

const createMockCtx = (o: Parameters<typeof createLenientMockCtx>[0] = {}) =>
  createLenientMockCtx({ ...o, strict: true });

const ident = (hex: string) => ({ toHexString: () => hex });
const rows = (ctx: any, table: string): any[] => ctx.db[table]._rows();

function enqueue(ctx: any, over: Record<string, unknown> = {}) {
  return enqueueLlmJob(ctx, {
    route: 'renown_perk_gen',
    playerId: ident('aaa'),
    characterId: 3n,
    sourceKey: SOURCE_KEYS.renownPerk(3n, 2),
    request: { characterId: 3n, rank: 2 },
    ...over,
  } as any);
}

describe('mock index positive control', () => {
  it('finds a seeded llm_job through by_dedupe_key', () => {
    const key = buildDedupeKey(ident('aaa'), 'renown_perk_gen', '3:2');
    const ctx = createMockCtx({
      seed: { llm_job: [{ id: 1n, dedupeKey: key, status: 'pending' }, { id: 2n, dedupeKey: 'x', status: 'pending' }] },
    });
    const found = [...ctx.db.llm_job.by_dedupe_key.filter(key)];
    expect(found.map((r: any) => r.id)).toEqual([1n]);
  });
});

describe('status constants', () => {
  it('partition the six statuses into active and terminal', () => {
    expect([...LLM_JOB_STATUSES].sort()).toEqual(
      [...LLM_ACTIVE_JOB_STATUSES, ...LLM_TERMINAL_JOB_STATUSES].sort(),
    );
    expect(isActiveJobStatus('pending')).toBe(true);
    expect(isActiveJobStatus('completed')).toBe(false);
    expect(isActiveJobStatus(undefined)).toBe(false);
  });
});

describe('enqueueLlmJob dedupe', () => {
  it('inserts a valid pending job', async () => {
    await import('../schema/tables');
    const ctx = createMockCtx();
    const { job, created } = enqueue(ctx);
    expect(created).toBe(true);
    expect(job.status).toBe('pending');
    expect(job.attempt).toBe(0n);
    expect(job.characterId).toBe(3n);
    expect(job.route).toBe('renown_perk_gen');
    expect(job.createdAt).toBe(ctx.timestamp);
    expect('resultText' in job).toBe(false);
    expect(rowColumnProblems('llm_job', job)).toEqual([]);
    expect(job.reservedMicroUsd).toBe(reservationMicroUsd('renown_perk_gen', job.requestJson));
    expect(job.costMicroUsd).toBe(0n);
    expect(job.budgetDay).toBe(utcDay(ctx.timestamp));
    expect(job.applyAttempts).toBe(0n);
    expect('nextAttemptAt' in job).toBe(false);
  });

  it('characterId defaults to 0n', () => {
    const ctx = createMockCtx();
    const { job } = enqueue(ctx, { characterId: undefined });
    expect(job.characterId).toBe(0n);
  });

  it('same identity, route and source key twice yields one job and created false with the first id', () => {
    const ctx = createMockCtx();
    const first = enqueue(ctx);
    const second = enqueue(ctx);
    expect(first.created).toBe(true);
    expect(second.created).toBe(false);
    expect(second.job.id).toBe(first.job.id);
    expect(rows(ctx, 'llm_job')).toHaveLength(1);
  });

  it('two distinct identity objects with the same hex (two tabs) share one job', () => {
    const ctx = createMockCtx();
    const first = enqueue(ctx, { playerId: ident('same-hex') });
    const second = enqueue(ctx, { playerId: ident('same-hex') });
    expect(second.created).toBe(false);
    expect(second.job.id).toBe(first.job.id);
    expect(rows(ctx, 'llm_job')).toHaveLength(1);
  });

  it.each(LLM_ACTIVE_JOB_STATUSES)('an existing %s job blocks a duplicate', (status) => {
    const key = buildDedupeKey(ident('aaa'), 'renown_perk_gen', SOURCE_KEYS.renownPerk(3n, 2));
    const ctx = createMockCtx({ seed: { llm_job: [{ id: 7n, dedupeKey: key, status }] } });
    const { job, created } = enqueue(ctx);
    expect(created).toBe(false);
    expect(job.id).toBe(7n);
    expect(rows(ctx, 'llm_job')).toHaveLength(1);
  });

  it.each(LLM_TERMINAL_JOB_STATUSES)('an existing %s job allows a new job with the same key', (status) => {
    const key = buildDedupeKey(ident('aaa'), 'renown_perk_gen', SOURCE_KEYS.renownPerk(3n, 2));
    const ctx = createMockCtx({ seed: { llm_job: [{ id: 7n, dedupeKey: key, status }] } });
    const { job, created } = enqueue(ctx);
    expect(created).toBe(true);
    expect(job.id).not.toBe(7n);
    expect(rows(ctx, 'llm_job')).toHaveLength(2);
  });

  it('a terminal job does not hide an active one for the same key', () => {
    const key = buildDedupeKey(ident('aaa'), 'renown_perk_gen', SOURCE_KEYS.renownPerk(3n, 2));
    const ctx = createMockCtx({
      seed: {
        llm_job: [
          { id: 1n, dedupeKey: key, status: 'failed' },
          { id: 2n, dedupeKey: key, status: 'in_flight' },
        ],
      },
    });
    const { job, created } = enqueue(ctx);
    expect(created).toBe(false);
    expect(job.id).toBe(2n);
  });

  it('a different source key, route or identity creates a separate job', () => {
    const ctx = createMockCtx();
    enqueue(ctx);
    expect(enqueue(ctx, { sourceKey: SOURCE_KEYS.renownPerk(3n, 3) }).created).toBe(true);
    expect(enqueue(ctx, { route: 'skill_gen' }).created).toBe(true);
    expect(enqueue(ctx, { playerId: ident('bbb') }).created).toBe(true);
    expect(rows(ctx, 'llm_job')).toHaveLength(4);
  });
});

describe('enqueueLlmJob validation', () => {
  it('rejects an unknown route, an empty source key and a bad identity without inserting', () => {
    const ctx = createMockCtx();
    expect(() => enqueue(ctx, { route: 'gpt_route' })).toThrow(/route/i);
    expect(() => enqueue(ctx, { sourceKey: '' })).toThrow(/sourceKey/);
    expect(() => enqueue(ctx, { playerId: {} })).toThrow(/playerId/);
    expect(() => enqueue(ctx, { playerId: undefined })).toThrow(/playerId/);
    expect(() => enqueue(ctx, { request: null })).toThrow(/request/);
    expect(rows(ctx, 'llm_job')).toHaveLength(0);
  });

  // JSON of {"k":"<pad>"} is 8 characters of framing around the pad.
  const requestOfLength = (n: number) => ({ k: 'x'.repeat(n - JSON.stringify({ k: '' }).length) });

  it('accepts a request of exactly 64,000 characters', () => {
    const ctx = createMockCtx();
    const request = requestOfLength(LLM_REQUEST_JSON_MAX_CHARS);
    expect(serializeRequest(request).length).toBe(LLM_REQUEST_JSON_MAX_CHARS);
    const { job, created } = enqueue(ctx, { request });
    expect(created).toBe(true);
    expect(job.requestJson.length).toBe(LLM_REQUEST_JSON_MAX_CHARS);
  });

  it('rejects a request of 64,001 characters and inserts nothing', () => {
    const ctx = createMockCtx();
    const request = requestOfLength(LLM_REQUEST_JSON_MAX_CHARS + 1);
    expect(serializeRequest(request).length).toBe(LLM_REQUEST_JSON_MAX_CHARS + 1);
    expect(() => enqueue(ctx, { request })).toThrow(/too large/);
    expect(rows(ctx, 'llm_job')).toHaveLength(0);
  });

  it('serializes bigint values as decimal strings', async () => {
    await import('../schema/tables');
    const ctx = createMockCtx();
    const { job } = enqueue(ctx, { request: { id: 12345678901234567890n, nested: { n: 2n } } });
    expect(JSON.parse(job.requestJson)).toEqual({ id: '12345678901234567890', nested: { n: '2' } });
    expect(rowColumnProblems('llm_job', job)).toEqual([]);
  });

  it('accepts every route name', () => {
    const ctx = createMockCtx();
    for (const route of LLM_ROUTE_NAMES) {
      expect(enqueue(ctx, { route }).created).toBe(true);
    }
  });
});

describe('buildDedupeKey and SOURCE_KEYS', () => {
  it('buildDedupeKey is a JSON array string', () => {
    expect(buildDedupeKey(ident('abc'), 'skill_gen', '3:4')).toBe('["abc","skill_gen","3:4"]');
  });

  it('source keys with quotes or colons never collide across fields', () => {
    const a = buildDedupeKey(ident('p'), 'skill_gen', 'a","b');
    const b = buildDedupeKey(ident('p'), 'skill_gen', 'a');
    const c = buildDedupeKey(ident('p:skill_gen'), 'skill_gen', 'a');
    expect(new Set([a, b, c]).size).toBe(3);
    expect(JSON.parse(a)).toEqual(['p', 'skill_gen', 'a","b']);
  });

  it('SOURCE_KEYS produce the documented shapes', () => {
    expect(SOURCE_KEYS.creation(7n, 'race')).toBe('7:race');
    expect(SOURCE_KEYS.creation(7n, 'class')).toBe('7:class');
    expect(SOURCE_KEYS.worldGen(5n)).toBe('5');
    expect(SOURCE_KEYS.skillGen(3n, 4n)).toBe('3:4');
    expect(SOURCE_KEYS.renownPerk(3n, 2)).toBe('3:2');
    expect(SOURCE_KEYS.npcConversation(3n, 9n, 1000n)).toBe('3:9:1000');
    expect(SOURCE_KEYS.combatNarration(11n, 2n, 'round')).toBe('11:2:round');
    expect(SOURCE_KEYS.smokeTest()).toBe('smoke');
    expect(SOURCE_KEYS.regionEconomy(4097n)).toBe('region:4097');
    expect(SOURCE_KEYS.enemyLoot(12n)).toBe('enemy:12');
    expect(Object.isFrozen(SOURCE_KEYS)).toBe(true);
  });

  it('a new npc conversation turn marker yields a separate job', () => {
    const ctx = createMockCtx();
    const first = enqueue(ctx, { route: 'npc_conversation', sourceKey: SOURCE_KEYS.npcConversation(3n, 9n, 0n) });
    const same = enqueue(ctx, { route: 'npc_conversation', sourceKey: SOURCE_KEYS.npcConversation(3n, 9n, 0n) });
    const next = enqueue(ctx, { route: 'npc_conversation', sourceKey: SOURCE_KEYS.npcConversation(3n, 9n, 1000n) });
    expect(same.created).toBe(false);
    expect(next.created).toBe(true);
    expect(next.job.id).not.toBe(first.job.id);
  });
});

describe('resolveCharacterPlayerId', () => {
  const character = { id: 50n, ownerUserId: 7n };
  const p1 = ident('p1');
  const p2 = ident('p2');

  it('prefers the player whose activeCharacterId is the character', () => {
    const ctx = createMockCtx({
      seed: {
        player: [
          { id: p1, userId: 7n, activeCharacterId: 10n },
          { id: p2, userId: 7n, activeCharacterId: 50n },
        ],
      },
    });
    expect(resolveCharacterPlayerId(ctx, character)).toBe(p2);
  });

  it('falls back to the first player with the owner userId', () => {
    const ctx = createMockCtx({
      seed: {
        player: [
          { id: ident('other'), userId: 8n, activeCharacterId: 50n },
          { id: p1, userId: 7n, activeCharacterId: 10n },
          { id: p2, userId: 7n },
        ],
      },
    });
    expect(resolveCharacterPlayerId(ctx, character)).toBe(p1);
  });

  it('returns null when no player matches', () => {
    const ctx = createMockCtx({ seed: { player: [{ id: p1, userId: 8n }] } });
    expect(resolveCharacterPlayerId(ctx, character)).toBeNull();
    expect(resolveCharacterPlayerId(createMockCtx(), character)).toBeNull();
  });
});

describe('logLlmCall', () => {
  const keyShaped = ['sk', '-ant-'].join('') + 'A1b2C3d4'.repeat(4);
  const base = {
    jobId: 9n,
    playerId: ident('aaa'),
    route: 'renown_perk_gen' as const,
    attempt: 1n,
    httpStatus: 200,
    outcome: 'ok',
    latencyMs: 1234,
  };

  it('inserts a valid row with the model constant and bigint counters', async () => {
    await import('../schema/tables');
    const ctx = createMockCtx();
    const row = logLlmCall(ctx, {
      ...base,
      stopReason: 'end_turn',
      requestId: 'req_1',
      usage: { input: 10, output: 20, cacheWrite: 30, cacheRead: 40 },
    });
    expect(rows(ctx, 'llm_call_log')).toHaveLength(1);
    expect(row.model).toBe(CLAUDE_MODEL);
    expect(row.httpStatus).toBe(200n);
    expect(row.latencyMs).toBe(1234n);
    expect(row.inputTokens).toBe(10n);
    expect(row.outputTokens).toBe(20n);
    expect(row.cacheWriteTokens).toBe(30n);
    expect(row.cacheReadTokens).toBe(40n);
    expect(row.createdAt).toBe(ctx.timestamp);
    expect('errorMessage' in row).toBe(false);
    expect(rowColumnProblems('llm_call_log', row)).toEqual([]);
  });

  it('usage defaults to 0n and optional fields are omitted', async () => {
    await import('../schema/tables');
    const ctx = createMockCtx();
    const row = logLlmCall(ctx, base);
    expect(row.inputTokens).toBe(0n);
    expect(row.cacheReadTokens).toBe(0n);
    expect('stopReason' in row).toBe(false);
    expect('requestId' in row).toBe(false);
    expect(rowColumnProblems('llm_call_log', row)).toEqual([]);
  });

  it('redacts a key-shaped string in errorMessage', async () => {
    await import('../schema/tables');
    const ctx = createMockCtx();
    const row = logLlmCall(ctx, { ...base, outcome: 'error', httpStatus: 401, errorMessage: `bad key ${keyShaped} rejected` });
    expect(findSecretLeaks(row.errorMessage, { strictPrefix: true }).total).toBe(0);
    expect(row.errorMessage).toContain('[REDACTED]');
    expect(rowColumnProblems('llm_call_log', row)).toEqual([]);
  });

  it('caps errorMessage at 400 code points without splitting a surrogate pair', () => {
    const ctx = createMockCtx();
    const row = logLlmCall(ctx, { ...base, outcome: 'error', errorMessage: '\u{1F600}'.repeat(500) });
    expect([...row.errorMessage]).toHaveLength(LLM_ERROR_MESSAGE_MAX_CHARS);
    expect(row.errorMessage.length).toBe(LLM_ERROR_MESSAGE_MAX_CHARS * 2);
  });

  it('a short error message is stored unchanged', () => {
    const ctx = createMockCtx();
    const row = logLlmCall(ctx, { ...base, outcome: 'error', errorMessage: 'overloaded' });
    expect(row.errorMessage).toBe('overloaded');
  });

  it('writes the Phase 41 columns: cost and dispatch lateness default to 0n, supplied values are kept', async () => {
    await import('../schema/tables');
    const ctx = createMockCtx();
    const plain = logLlmCall(ctx, base);
    expect(plain.costMicroUsd).toBe(0n);
    expect(plain.dispatchLateMs).toBe(0n);
    expect(rowColumnProblems('llm_call_log', plain)).toEqual([]);
    const full = logLlmCall(ctx, { ...base, costMicroUsd: 4321n, dispatchLateMs: 7.4 });
    expect(full.costMicroUsd).toBe(4321n);
    expect(full.dispatchLateMs).toBe(7n);
    expect(rowColumnProblems('llm_call_log', full)).toEqual([]);
  });

  // Built from fragments so no key-shaped literal appears in the source.
  const needle = ['not', 'a', 'prefixed', 'secret'].join('-') + '-Zq81';

  it('redacts a caller-supplied needle (no sk-ant prefix) from errorMessage, stopReason and requestId', async () => {
    await import('../schema/tables');
    const ctx = createMockCtx();
    const row = logLlmCall(ctx, {
      ...base,
      outcome: 'error',
      errorMessage: `upstream echoed ${needle} twice ${needle}`,
      stopReason: `stop-${needle}`,
      requestId: `req_${needle}`,
      needles: [needle],
    });
    for (const k of ['errorMessage', 'stopReason', 'requestId']) {
      expect(findSecretLeaks(row[k], { needles: [needle] }).total, k).toBe(0);
      expect(row[k], k).toContain('[REDACTED]');
    }
    expect(rowColumnProblems('llm_call_log', row)).toEqual([]);
  });

  it('without needles a non-prefixed string is stored unchanged (the pattern alone would miss it)', () => {
    const ctx = createMockCtx();
    const row = logLlmCall(ctx, { ...base, outcome: 'error', errorMessage: needle });
    expect(row.errorMessage).toBe(needle);
  });

  it('redacts a key-shaped string in stopReason and requestId too', () => {
    const ctx = createMockCtx();
    const row = logLlmCall(ctx, { ...base, stopReason: keyShaped, requestId: `req ${keyShaped}` });
    expect(findSecretLeaks(row.stopReason, { strictPrefix: true }).total).toBe(0);
    expect(findSecretLeaks(row.requestId, { strictPrefix: true }).total).toBe(0);
  });

  it('caps stopReason and requestId at LLM_CALL_LOG_FIELD_MAX_CHARS code points without splitting a surrogate pair', () => {
    expect(LLM_CALL_LOG_FIELD_MAX_CHARS).toBe(128);
    const ctx = createMockCtx();
    const row = logLlmCall(ctx, {
      ...base,
      stopReason: '\u{1F600}'.repeat(300),
      requestId: 'r'.repeat(300),
    });
    expect([...row.stopReason]).toHaveLength(LLM_CALL_LOG_FIELD_MAX_CHARS);
    expect(row.stopReason.length).toBe(LLM_CALL_LOG_FIELD_MAX_CHARS * 2);
    expect([...row.requestId]).toHaveLength(LLM_CALL_LOG_FIELD_MAX_CHARS);
    // No lone surrogate survives the cut.
    expect(row.stopReason).toBe('\u{1F600}'.repeat(LLM_CALL_LOG_FIELD_MAX_CHARS));
  });

  it('rounds fractional latency to a whole bigint', () => {
    const ctx = createMockCtx();
    expect(logLlmCall(ctx, { ...base, latencyMs: 12.6 }).latencyMs).toBe(13n);
  });

  it.each([NaN, Infinity, -Infinity])('a non-finite counter (%s) becomes 0n instead of throwing', (bad) => {
    const ctx = createMockCtx();
    let row: any;
    expect(() => {
      row = logLlmCall(ctx, {
        ...base,
        httpStatus: bad,
        latencyMs: bad,
        usage: { input: bad, output: bad, cacheWrite: bad, cacheRead: bad },
      });
    }).not.toThrow();
    for (const k of ['httpStatus', 'latencyMs', 'inputTokens', 'outputTokens', 'cacheWriteTokens', 'cacheReadTokens']) {
      expect(row[k], k).toBe(0n);
    }
    expect(rows(ctx, 'llm_call_log')).toHaveLength(1);
  });

  it('a negative counter clamps to 0n and a huge finite counter clamps to a safe integer', () => {
    const ctx = createMockCtx();
    const row = logLlmCall(ctx, { ...base, httpStatus: -5, latencyMs: 1e300 });
    expect(row.httpStatus).toBe(0n);
    expect(row.latencyMs).toBe(BigInt(Number.MAX_SAFE_INTEGER));
  });
});

// ============================================================================
// Phase 41-05: reservation, cap, dispatch and refusal in one transaction
// ============================================================================

// The mock compares identities with ===: one identity object per player.
const PLAYER = { toHexString: () => 'player-aaa' };
const OTHER = { toHexString: () => 'player-bbb' };

const T_NOW = BigInt(Date.parse('2026-09-30T12:00:00.000Z')) * 1000n;
const TODAY = '2026-09-30';

// The mock creates an empty table array on first read, so empty tables are dropped from the snapshot.
const snap = (ctx: any): string =>
  JSON.stringify(
    Object.fromEntries(Object.entries(ctx.db._tables as Record<string, any[]>).filter(([, v]) => v.length > 0)),
    (_k, v) => (typeof v === 'bigint' ? `${v}n` : v),
  );

const seededJob = (id: bigint, route: string, over: Record<string, unknown> = {}) => ({
  id,
  playerId: PLAYER,
  route,
  dedupeKey: `seed-${id}`,
  status: 'pending',
  budgetDay: TODAY,
  ...over,
});

const budgetRow = (over: Record<string, unknown> = {}) => ({
  id: 1n,
  playerId: PLAYER,
  dayUtc: TODAY,
  reservedMicroUsd: 0n,
  spentMicroUsd: 0n,
  calls: 0n,
  ...over,
});

const ledgerRow = (over: Record<string, unknown> = {}) => ({
  id: 1n,
  spentMicroUsd: 0n,
  reservedMicroUsd: 0n,
  calls: 0n,
  updatedAt: { microsSinceUnixEpoch: 1n },
  dayUtc: TODAY,
  daySpentMicroUsd: 0n,
  ...over,
});

/** A ledger whose today figure sits at the global daily ceiling (reserved plus spent = the ceiling). */
const ceilingLedger = () =>
  ledgerRow({
    spentMicroUsd: LLM_DAILY_CEILING_DEFAULT_MICRO_USD,
    daySpentMicroUsd: LLM_DAILY_CEILING_DEFAULT_MICRO_USD,
  });

const haltedRow = () => ({ ...defaultLlmAdminStateRow(), llmEnabled: false });

const ctxAt = (seed: Record<string, any[]> = {}) => createMockCtx({ timestampMicros: T_NOW, seed });

const npc = (ctx: any, turn: bigint | number = 0, over: Record<string, unknown> = {}) =>
  enqueueLlmJob(ctx, {
    route: 'npc_conversation',
    playerId: PLAYER,
    characterId: 3n,
    sourceKey: SOURCE_KEYS.npcConversation(3n, 9n, turn),
    request: { message: 'hello' },
    ...over,
  } as any);

describe('enqueueLlmJob: created path', () => {
  it('writes one pending job, one dispatch row at the transaction timestamp and one sweep tick', () => {
    const ctx = ctxAt();
    const r = npc(ctx);
    expect(r.created).toBe(true);
    expect(r.refused).toBeUndefined();
    const job = r.job;
    expect(job.status).toBe('pending');
    expect(job.attempt).toBe(0n);
    expect(job.costMicroUsd).toBe(0n);
    expect(job.applyAttempts).toBe(0n);
    expect(job.budgetDay).toBe(TODAY);
    expect(job.reservedMicroUsd).toBe(reservationMicroUsd('npc_conversation', job.requestJson));
    expect(job.reservedMicroUsd > 0n).toBe(true);
    expect(rowColumnProblems('llm_job', job)).toEqual([]);

    expect(rows(ctx, 'llm_job')).toHaveLength(1);
    const dispatch = rows(ctx, 'llm_dispatch');
    expect(dispatch).toHaveLength(1);
    expect(dispatch[0].jobId).toBe(job.id);
    expect(scheduledMicros(dispatch[0].scheduledAt)).toBe(T_NOW);
    expect(rowColumnProblems('llm_dispatch', dispatch[0])).toEqual([]);
    expect(rows(ctx, 'llm_sweep_tick')).toHaveLength(1);
    expect(rowColumnProblems('llm_sweep_tick', rows(ctx, 'llm_sweep_tick')[0])).toEqual([]);
  });

  it('reserves against the player day and the phase ledger', () => {
    const ctx = ctxAt();
    const { job } = npc(ctx);
    const day = rows(ctx, 'llm_player_budget');
    expect(day).toHaveLength(1);
    expect(day[0].dayUtc).toBe(TODAY);
    expect(day[0].reservedMicroUsd).toBe(job.reservedMicroUsd);
    expect(day[0].calls).toBe(1n);
    expect(getPhaseLedger(ctx).reservedMicroUsd).toBe(job.reservedMicroUsd);
  });

  it('a second enqueue with another source key adds a second job and dispatch but keeps one sweep tick', () => {
    const ctx = ctxAt();
    const a = npc(ctx, 0);
    const b = npc(ctx, 1000n);
    expect(b.created).toBe(true);
    expect(b.job.id).not.toBe(a.job.id);
    expect(rows(ctx, 'llm_job')).toHaveLength(2);
    expect(rows(ctx, 'llm_dispatch')).toHaveLength(2);
    expect(rows(ctx, 'llm_sweep_tick')).toHaveLength(1);
  });
});

describe('enqueueLlmJob: dedupe merge writes nothing further', () => {
  it('a duplicate returns created false with the first job and leaves every table unchanged', () => {
    const ctx = ctxAt();
    const first = npc(ctx);
    const before = snap(ctx);
    const reservedBefore = getPhaseLedger(ctx).reservedMicroUsd;
    const second = npc(ctx);
    expect(second.created).toBe(false);
    expect(second.job.id).toBe(first.job.id);
    expect(second.refused).toBeUndefined();
    expect(rows(ctx, 'llm_job')).toHaveLength(1);
    expect(rows(ctx, 'llm_dispatch')).toHaveLength(1);
    expect(rows(ctx, 'llm_player_budget')).toHaveLength(1);
    expect(getPhaseLedger(ctx).reservedMicroUsd).toBe(reservedBefore);
    expect(snap(ctx)).toBe(before);
  });

  it('a merge is not refused as busy even when the player is at the cap', () => {
    const ctx = ctxAt();
    const first = npc(ctx, 0);
    npc(ctx, 1n, { route: 'skill_gen', sourceKey: 'a' });
    npc(ctx, 2n, { route: 'creation_race', sourceKey: 'b' });
    expect(countActiveCappedJobs(ctx, PLAYER)).toBe(3);
    const again = npc(ctx, 0);
    expect(again.created).toBe(false);
    expect(again.job.id).toBe(first.job.id);
    expect(again.refused).toBeUndefined();
  });

  it('the next conversation turn marker creates a separate job', () => {
    const ctx = ctxAt();
    const a = npc(ctx, 0);
    const b = npc(ctx, 1234n);
    expect(b.created).toBe(true);
    expect(b.job.id).not.toBe(a.job.id);
  });
});

describe('per-player active-job cap', () => {
  const threeActive = () => [
    seededJob(1n, 'npc_conversation'),
    seededJob(2n, 'skill_gen', { status: 'in_flight' }),
    seededJob(3n, 'creation_race', { status: 'received' }),
  ];

  it('the limit is three and the exempt routes are narration, renown and the two stage-2 fills', () => {
    expect(LLM_PLAYER_MAX_ACTIVE_JOBS).toBe(3);
    // Review WR-B01: world_gen and creation_class continue a request the cap admitted at stage 1.
    // Phase 51.3: region_economy is a background world job, cap-exempt like world_gen.
    expect([...LLM_CAP_EXEMPT_ROUTES].sort()).toEqual([
      'combat_narration',
      'creation_class',
      'region_economy',
      'renown_perk_gen',
      'world_gen',
    ]);
  });

  it('review WR-B01: a stage-2 fill is never refused busy, whatever else the player holds', () => {
    // The stage-1 job being applied (received) plus two other capped jobs: the cap is full.
    const held = [
      seededJob(1n, 'world_gen_start', { status: 'received' }),
      seededJob(2n, 'npc_conversation'),
      seededJob(3n, 'skill_gen', { status: 'in_flight' }),
      seededJob(4n, 'renown_perk_gen'),
    ];
    const ctx = ctxAt({ llm_job: held });
    expect(countActiveCappedJobs(ctx, PLAYER)).toBeGreaterThanOrEqual(LLM_PLAYER_MAX_ACTIVE_JOBS);
    expect(npc(ctx).refused).toBe('busy'); // control: a new player request is still capped
    const fill = enqueueLlmJob(ctx, {
      route: 'world_gen',
      playerId: PLAYER,
      sourceKey: SOURCE_KEYS.worldGen(5n),
      request: { genStateId: '5' },
    } as any);
    expect(fill.created).toBe(true);
    const classFill = enqueueLlmJob(ctx, {
      route: 'creation_class',
      playerId: PLAYER,
      sourceKey: SOURCE_KEYS.creation(2n, 'class'),
      request: { creationStateId: '2' },
    } as any);
    expect(classFill.created).toBe(true);
  });

  it('review WR-B01: the kill switch, the ceiling and the daily budget still refuse a stage-2 fill', () => {
    const fill = (ctx: any) =>
      enqueueLlmJob(ctx, {
        route: 'world_gen',
        playerId: PLAYER,
        sourceKey: SOURCE_KEYS.worldGen(5n),
        request: { genStateId: '5' },
      } as any);
    expect(fill(ctxAt({ llm_admin_state: [haltedRow()], llm_job: threeActive() })).refused).toBe('halted');
    expect(fill(ctxAt({ llm_spend: [ceilingLedger()], llm_job: threeActive() })).refused).toBe('ceiling');
    expect(
      fill(ctxAt({ llm_player_budget: [budgetRow({ spentMicroUsd: LLM_PLAYER_DAILY_COST_MICRO_USD, calls: 1n })] })).refused,
    ).toBe('daily_cost');
  });

  it('a fourth player-requested job is refused busy and the database is unchanged', () => {
    const ctx = ctxAt({ llm_job: threeActive() });
    const before = snap(ctx);
    const r = npc(ctx);
    expect(r).toEqual({ created: false, job: null, refused: 'busy' });
    expect(snap(ctx)).toBe(before);
    expect(rows(ctx, 'llm_dispatch')).toHaveLength(0);
    expect(rows(ctx, 'llm_player_budget')).toHaveLength(0);
    expect(rows(ctx, 'llm_spend')).toHaveLength(0);
  });

  it('exactly two active jobs still lets the third through', () => {
    const ctx = ctxAt({ llm_job: threeActive().slice(0, 2) });
    expect(npc(ctx).created).toBe(true);
  });

  it('combat_narration and renown_perk_gen are never refused as busy', () => {
    const ctx = ctxAt({ llm_job: threeActive() });
    const narr = enqueueLlmJob(ctx, {
      route: 'combat_narration',
      playerId: PLAYER,
      sourceKey: SOURCE_KEYS.combatNarration(11n, 1n, 'victory'),
      request: { x: 1 },
    } as any);
    expect(narr.created).toBe(true);
    const renown = enqueueLlmJob(ctx, {
      route: 'renown_perk_gen',
      playerId: PLAYER,
      sourceKey: SOURCE_KEYS.renownPerk(3n, 2),
      request: { rank: 2 },
    } as any);
    expect(renown.created).toBe(true);
  });

  it('narration jobs do not count toward the cap, held renown jobs do (but are never refused)', () => {
    const ctx = ctxAt({
      llm_job: [
        seededJob(1n, 'combat_narration'),
        seededJob(2n, 'renown_perk_gen'),
        seededJob(3n, 'npc_conversation'),
        seededJob(4n, 'skill_gen'),
      ],
    });
    expect(countActiveCappedJobs(ctx, PLAYER)).toBe(3);
    expect(npc(ctx).refused).toBe('busy');
  });

  it('terminal jobs never count: one completed job lets the fourth through', () => {
    const jobs = threeActive();
    jobs[0] = { ...jobs[0], status: 'completed' };
    const ctx = ctxAt({ llm_job: jobs });
    expect(npc(ctx).created).toBe(true);
    for (const status of ['failed', 'expired'] as const) {
      const c = ctxAt({ llm_job: [{ ...threeActive()[0], status }, ...threeActive().slice(1)] });
      expect(countActiveCappedJobs(c, PLAYER)).toBe(2);
    }
  });

  it('jobs without a budget day (smoke, Phase 40) never count', () => {
    const ctx = ctxAt({
      llm_job: [
        seededJob(1n, 'smoke_test', { budgetDay: '' }),
        seededJob(2n, 'npc_conversation', { budgetDay: '' }),
        seededJob(3n, 'skill_gen', { budgetDay: '' }),
      ],
    });
    expect(countActiveCappedJobs(ctx, PLAYER)).toBe(0);
    expect(npc(ctx).created).toBe(true);
  });

  it("another player's jobs do not count", () => {
    const ctx = ctxAt({
      llm_job: threeActive().map((j) => ({ ...j, playerId: OTHER })),
    });
    expect(npc(ctx).created).toBe(true);
  });

  it('the cap is not applied in phase_only mode', () => {
    const ctx = ctxAt({ llm_job: threeActive() });
    const r = npc(ctx, 0, { budget: 'phase_only', route: 'smoke_test', sourceKey: SOURCE_KEYS.smokeTest() });
    expect(r.created).toBe(true);
  });
});

describe('budget refusals write nothing', () => {
  const cases: Array<[string, LlmRefusal, Record<string, any[]>]> = [
    [
      'daily cost limit',
      'daily_cost',
      { llm_player_budget: [budgetRow({ spentMicroUsd: LLM_PLAYER_DAILY_COST_MICRO_USD, calls: 1n })] },
    ],
    ['200 calls', 'daily_calls', { llm_player_budget: [budgetRow({ calls: LLM_PLAYER_DAILY_CALLS })] }],
    // Phase 43 CONTEXT retires the $2 phase cap as a limit; the global daily ceiling replaces it.
    ['global daily ceiling', 'ceiling', { llm_spend: [ceilingLedger()] }],
    ['kill switch off', 'halted', { llm_admin_state: [haltedRow()] }],
    ['missing admin-state row (fails closed)', 'halted', { llm_admin_state: [] }],
  ];

  it.each(cases)('%s gives refused %s and leaves the database unchanged', (_n, reason, seed) => {
    const ctx = ctxAt(seed);
    const before = snap(ctx);
    const r = npc(ctx);
    expect(r).toEqual({ created: false, job: null, refused: reason });
    expect(snap(ctx)).toBe(before);
    expect(rows(ctx, 'llm_job')).toHaveLength(0);
    expect(rows(ctx, 'llm_dispatch')).toHaveLength(0);
    expect(rows(ctx, 'llm_sweep_tick')).toHaveLength(0);
  });

  it('a refused renown job is also traceless', () => {
    const ctx = ctxAt({ llm_spend: [ceilingLedger()] });
    const before = snap(ctx);
    const r = enqueueLlmJob(ctx, {
      route: 'renown_perk_gen',
      playerId: PLAYER,
      sourceKey: SOURCE_KEYS.renownPerk(3n, 2),
      request: { rank: 2 },
    } as any);
    expect(r.refused).toBe('ceiling');
    expect(snap(ctx)).toBe(before);
  });
});

describe('kill switch and ceiling at enqueue', () => {
  const stateSeed = (seed: Record<string, any[]>) => ctxAt(seed);

  it('halted wins over busy: a player at the active-job cap still sees halted, with nothing written', () => {
    const active = [1n, 2n, 3n].map((id) => seededJob(id, 'npc_conversation'));
    const ctx = stateSeed({ llm_admin_state: [haltedRow()], llm_job: active });
    const before = snap(ctx);
    expect(npc(ctx, 1)).toEqual({ created: false, job: null, refused: 'halted' });
    expect(snap(ctx)).toBe(before);
  });

  it('the same player at the cap with the switch on is busy (control)', () => {
    const active = [1n, 2n, 3n].map((id) => seededJob(id, 'npc_conversation'));
    expect(npc(stateSeed({ llm_job: active }), 1).refused).toBe('busy');
  });

  it('kill switch off: no job, no dispatch row, no sweep tick, no reservation, no player budget row', () => {
    const ctx = stateSeed({ llm_admin_state: [haltedRow()] });
    const r = npc(ctx);
    expect(r).toEqual({ created: false, job: null, refused: 'halted' });
    expect(rows(ctx, 'llm_job')).toHaveLength(0);
    expect(rows(ctx, 'llm_dispatch')).toHaveLength(0);
    expect(rows(ctx, 'llm_sweep_tick')).toHaveLength(0);
    expect(rows(ctx, 'llm_spend')).toHaveLength(0);
    expect(rows(ctx, 'llm_player_budget')).toHaveLength(0);
  });

  it('smoke (phase_only) jobs are halted too', () => {
    const ctx = stateSeed({ llm_admin_state: [haltedRow()] });
    const r = npc(ctx, 0, { budget: 'phase_only', route: 'smoke_test', sourceKey: SOURCE_KEYS.smokeTest() });
    expect(r.refused).toBe('halted');
  });

  it('kill switch and ceiling together give one refusal reason and one resting line', () => {
    const ctx = stateSeed({ llm_admin_state: [haltedRow()], llm_spend: [ceilingLedger()] });
    const r = npc(ctx);
    expect(r.refused).toBe('halted');
    expect(llmRefusalMessage(r.refused as LlmRefusal)).toBe(LLM_RESTING_LINE);
    expect(llmRefusalMessage('ceiling')).toBe(llmRefusalMessage('halted'));
  });

  it('a dedupe hit on an active job still merges while halted, and writes nothing', () => {
    const live = stateSeed({});
    const first = npc(live);
    expect(first.created).toBe(true);
    const ctx = stateSeed({ llm_job: [first.job], llm_admin_state: [haltedRow()] });
    const before = snap(ctx);
    const again = npc(ctx);
    expect(again.created).toBe(false);
    expect(again.refused).toBeUndefined();
    expect(again.job.id).toBe(first.job.id);
    expect(snap(ctx)).toBe(before);
  });

  it('the per-player limits still refuse under the global ceiling', () => {
    const ctx = stateSeed({
      llm_player_budget: [budgetRow({ calls: LLM_PLAYER_DAILY_CALLS })],
      llm_spend: [ledgerRow({ spentMicroUsd: 5n, daySpentMicroUsd: 5n })],
    });
    expect(npc(ctx).refused).toBe('daily_calls');
  });

  it('a smoke job at the ceiling is refused as ceiling', () => {
    const ctx = stateSeed({ llm_spend: [ceilingLedger()] });
    const r = npc(ctx, 0, { budget: 'phase_only', route: 'smoke_test', sourceKey: SOURCE_KEYS.smokeTest() });
    expect(r.refused).toBe('ceiling');
  });

  it('the global ceiling counts every players reservations, not only this one', () => {
    const ctx = stateSeed({
      llm_player_budget: [budgetRow({ playerId: OTHER, reservedMicroUsd: LLM_DAILY_CEILING_DEFAULT_MICRO_USD, calls: 1n })],
      llm_spend: [ledgerRow({ reservedMicroUsd: LLM_DAILY_CEILING_DEFAULT_MICRO_USD, calls: 1n })],
    });
    expect(npc(ctx).refused).toBe('ceiling');
  });
});

describe('LLM_RESTING_LINE', () => {
  it('is the exact numberless in-voice line', () => {
    expect(LLM_RESTING_LINE).toBe('The Keeper is resting. Return later.');
  });

  it('has no digit, dollar sign or exclamation mark, no banned phrase and no it/they for the Keeper', () => {
    expect(LLM_RESTING_LINE).not.toMatch(/\d/);
    expect(LLM_RESTING_LINE).not.toMatch(/\$/);
    expect(LLM_RESTING_LINE).not.toMatch(/!/);
    for (const phrase of KEEPER_BANNED_PHRASES) {
      expect(LLM_RESTING_LINE.toLowerCase()).not.toContain(phrase.toLowerCase());
    }
    // The pattern the repository pronoun guard scans for (pronoun_rules.test.ts KEEPER_IT_OR_THEY).
    expect(LLM_RESTING_LINE).not.toMatch(/\bKeeper\b[^.]*\b(its|itself|they|them|their|theirs|themselves)\b/);
  });

  it('halted and ceiling both map to it', () => {
    expect(LLM_REFUSAL_MESSAGES.halted).toBe(LLM_RESTING_LINE);
    expect(LLM_REFUSAL_MESSAGES.ceiling).toBe(LLM_RESTING_LINE);
  });
});

describe("budget 'phase_only' (smoke)", () => {
  it('writes no player budget row, an empty budget day and counts against the ledger', () => {
    const ctx = ctxAt();
    const r = enqueueLlmJob(ctx, {
      route: 'smoke_test',
      playerId: PLAYER,
      sourceKey: SOURCE_KEYS.smokeTest(),
      request: { smoke: true },
      budget: 'phase_only',
    });
    expect(r.created).toBe(true);
    expect(r.job.budgetDay).toBe('');
    expect(r.job.reservedMicroUsd > 0n).toBe(true);
    expect(rows(ctx, 'llm_player_budget')).toHaveLength(0);
    expect(getPhaseLedger(ctx).reservedMicroUsd).toBe(r.job.reservedMicroUsd);
    expect(rows(ctx, 'llm_dispatch')).toHaveLength(1);
  });
});

describe('llmRefusalMessage', () => {
  const reasons: LlmRefusal[] = ['daily_cost', 'daily_calls', 'halted', 'ceiling', 'busy'];

  it.each(reasons)('%s is a non-empty in-voice line with no numbers, currency or provider words', (reason) => {
    const msg = llmRefusalMessage(reason);
    expect(msg.length).toBeGreaterThan(0);
    expect(msg).toMatch(/Keeper/);
    expect(msg).not.toMatch(/\d/);
    expect(msg).not.toMatch(/\$/);
    expect(msg).not.toMatch(/budget|limit|anthropic|claude|http|\bapi\b|\bkey\b/i);
  });

  it('never reveals which daily limit was hit', () => {
    expect(llmRefusalMessage('daily_cost')).toBe(llmRefusalMessage('daily_calls'));
    expect(Object.keys(LLM_REFUSAL_MESSAGES).sort()).toEqual(['busy', 'ceiling', 'daily_calls', 'daily_cost', 'halted']);
    expect(Object.keys(LLM_REFUSAL_MESSAGES).sort()).toEqual([...reasons].sort());
    expect(llmRefusalMessage('halted')).toBe(llmRefusalMessage('ceiling'));
    expect(Object.isFrozen(LLM_REFUSAL_MESSAGES)).toBe(true);
  });
});

describe('enqueueLlmJob validation writes nothing', () => {
  it('unknown route, missing identity, empty source key and oversized request throw plain Errors', () => {
    const ctx = ctxAt();
    const before = snap(ctx);
    const bad: Array<[Record<string, unknown>, RegExp]> = [
      [{ route: 'gpt_route' }, /route/i],
      [{ playerId: undefined }, /playerId/],
      [{ sourceKey: '' }, /sourceKey/],
      [{ request: { k: 'x'.repeat(LLM_REQUEST_JSON_MAX_CHARS) } }, /too large/],
    ];
    for (const [over, re] of bad) {
      let caught: unknown;
      try {
        npc(ctx, 0, over);
      } catch (e) {
        caught = e;
      }
      expect(caught).toBeInstanceOf(Error);
      expect((caught as Error).constructor).toBe(Error);
      expect((caught as Error).message).toMatch(re);
    }
    expect(snap(ctx)).toBe(before);
  });
});
