import { describe, it, expect, vi, beforeAll } from 'vitest';
import { rowColumnProblems } from './schema_recorder';
import { createMockCtx as createLenientMockCtx } from './test-utils';
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
  isActiveJobStatus,
  serializeRequest,
  resolveCharacterPlayerId,
  logLlmCall,
} from './llm_queue';

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
