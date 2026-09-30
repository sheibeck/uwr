import { describe, it, expect, vi, beforeAll } from 'vitest';
// This tsconfig has no @types/node; vitest runs the file in Node, so the built-ins resolve at runtime.
// @ts-ignore
import { readFileSync } from 'node:fs';
// @ts-ignore
import { fileURLToPath } from 'node:url';
import { createMockDb } from '../helpers/test-utils';
import { capturedViews, createRecordingServerMock } from '../helpers/schema_recorder';
import { keeperMessageForJob, publicErrorBucket } from '../helpers/llm_status';
import { LLM_JOB_STATUSES } from '../helpers/llm_queue';
import { LLM_ROUTE_NAMES } from '../data/llm_routes';
import { registerLlmViews, projectMyLlmJob, MY_LLM_JOB_KEYS } from './llm';
import { registerViews } from './index';

// vi.mock is hoisted; the recording mock supplies a chainable `t` and captures view registrations.
vi.mock('spacetimedb/server', async () =>
  (await import('../helpers/schema_recorder')).createRecordingServerMock(),
);

// Strict mock db (WR-04): unknown index accessors and missing-row updates throw, like the real db.
// The accessors come from the recorded schema, so load it before any test touches ctx.db.
beforeAll(async () => {
  await import('../schema/tables');
});

const FAILURE_CLASSES = [
  'auth',
  'billing',
  'rate_limit',
  'overloaded',
  'server',
  'bad_request',
  'timeout',
  'network',
  'truncated',
  'refusal',
  'invalid_json',
  'schema_mismatch',
  'empty_output',
  'unexpected_stop',
];

const ident = (hex: string) => ({ toHexString: () => hex });
const alice = ident('alice');
const bob = ident('bob');
const charlie = ident('charlie');

function job(id: bigint, playerId: any, over: Record<string, unknown> = {}) {
  return {
    id,
    playerId,
    characterId: 3n,
    route: 'renown_perk_gen',
    dedupeKey: `secret-dedupe-${id}`,
    status: 'pending',
    attempt: 0n,
    requestJson: '{"secret":"prompt context"}',
    resultText: 'secret model output',
    inputTokens: 5n,
    outputTokens: 6n,
    cacheWriteTokens: 0n,
    cacheReadTokens: 0n,
    createdAt: { microsSinceUnixEpoch: 1n },
    ...over,
  };
}

/** Wrap a mock DB so touching any table's iter throws: the view must use index lookups only. */
function noScanDb(seed: Record<string, any[]>) {
  const db = createMockDb(seed, { strict: true });
  return new Proxy({} as any, {
    get: (_t, table: string) =>
      new Proxy({} as any, {
        get: (_u, prop: string) => {
          if (prop === 'iter') throw new Error(`table scan attempted on ${table}`);
          return db[table][prop];
        },
      }),
  });
}

function registeredView() {
  const { t, schema } = createRecordingServerMock();
  const spacetimedb = schema({});
  const before = capturedViews().length;
  registerLlmViews({ spacetimedb, t } as any);
  const added = capturedViews().slice(before);
  expect(added).toHaveLength(1);
  return added[0];
}

const seed = () => ({
  llm_job: [
    job(1n, alice, { status: 'completed' }),
    job(2n, alice, { status: 'failed', errorCode: 'rate_limit' }),
    job(3n, bob),
  ],
});

describe('keeperMessageForJob', () => {
  const codes: Array<string | undefined> = [undefined, ...FAILURE_CLASSES];
  const forbidden = [/\d{3}/, /http/i, /anthropic/i, /claude/i, /\bapi\b/i, /sk-/i, /x-api-key/i, /bearer/i];

  it('returns a non-empty message for every status, failure class and route', () => {
    for (const status of [...LLM_JOB_STATUSES, 'nonsense']) {
      for (const code of codes) {
        for (const route of [...LLM_ROUTE_NAMES, 'unknown_route']) {
          const msg = keeperMessageForJob(status, code, route);
          expect(typeof msg).toBe('string');
          expect(msg.trim().length).toBeGreaterThan(0);
        }
      }
    }
  });

  it('never leaks HTTP codes, provider names or key fragments', () => {
    for (const status of [...LLM_JOB_STATUSES, 'nonsense']) {
      for (const code of codes) {
        const msg = keeperMessageForJob(status, code, 'renown_perk_gen');
        for (const re of forbidden) expect(msg).not.toMatch(re);
      }
    }
  });

  it('is deterministic', () => {
    expect(keeperMessageForJob('failed', 'auth', 'x')).toBe(keeperMessageForJob('failed', 'auth', 'x'));
  });

  it('gives each status its own line', () => {
    const lines = ['pending', 'in_flight', 'received', 'completed', 'expired', 'failed'].map((s) =>
      keeperMessageForJob(s, undefined, 'r'),
    );
    expect(new Set(lines).size).toBe(lines.length);
  });

  it('groups failure classes into distinct lines', () => {
    const line = (c: string) => keeperMessageForJob('failed', c, 'r');
    expect(line('timeout')).toBe(line('rate_limit'));
    expect(line('auth')).toBe(line('billing'));
    expect(line('truncated')).toBe(line('schema_mismatch'));
    expect(new Set([line('timeout'), line('auth'), line('refusal'), line('truncated')]).size).toBe(4);
  });
});

describe('publicErrorBucket', () => {
  it('maps every failure class to a coarse bucket that is never a raw class', () => {
    for (const c of FAILURE_CLASSES) {
      const b = publicErrorBucket(c);
      expect(['transient', 'unavailable', 'declined', 'failed']).toContain(b);
      expect(FAILURE_CLASSES).not.toContain(b);
    }
  });

  it('buckets retryable classes as transient, account classes as unavailable', () => {
    for (const c of ['rate_limit', 'overloaded', 'server', 'timeout', 'network']) {
      expect(publicErrorBucket(c)).toBe('transient');
    }
    expect(publicErrorBucket('auth')).toBe('unavailable');
    expect(publicErrorBucket('billing')).toBe('unavailable');
    expect(publicErrorBucket('refusal')).toBe('declined');
    for (const c of ['truncated', 'invalid_json', 'schema_mismatch', 'bad_request', 'something_new']) {
      expect(publicErrorBucket(c)).toBe('failed');
    }
  });

  it('is undefined when there is no error', () => {
    expect(publicErrorBucket(undefined)).toBeUndefined();
    expect(publicErrorBucket(null)).toBeUndefined();
    expect(publicErrorBucket('')).toBeUndefined();
  });
});

describe('my_llm_jobs view', () => {
  it('is registered as my_llm_jobs and public (privacy comes from the lookup and projection)', () => {
    const v = registeredView();
    expect(v.opts).toEqual({ name: 'my_llm_jobs', public: true });
  });

  it('returns only the caller\'s jobs', () => {
    const v = registeredView();
    const rows = v.fn({ sender: alice, db: noScanDb(seed()) });
    expect(rows.map((r: any) => r.id).sort()).toEqual([1n, 2n]);
  });

  it('never returns another player\'s rows', () => {
    const v = registeredView();
    const rows = v.fn({ sender: alice, db: noScanDb(seed()) });
    expect(rows.some((r: any) => r.id === 3n)).toBe(false);
    const bobRows = v.fn({ sender: bob, db: noScanDb(seed()) });
    expect(bobRows.map((r: any) => r.id)).toEqual([3n]);
  });

  it('returns an empty array for a player with no jobs', () => {
    const v = registeredView();
    expect(v.fn({ sender: charlie, db: noScanDb(seed()) })).toEqual([]);
  });

  it('exposes exactly six keys and no prompt, output, dedupe key or identity', () => {
    const v = registeredView();
    const rows = v.fn({ sender: alice, db: noScanDb(seed()) });
    expect(rows).toHaveLength(2);
    for (const r of rows) {
      expect(Object.keys(r).sort()).toEqual(['createdAt', 'errorCode', 'id', 'route', 'status', 'userMessage']);
      expect(Object.keys(r).sort()).toEqual([...MY_LLM_JOB_KEYS].sort());
    }
    const text = JSON.stringify(rows, (_k, val) => (typeof val === 'bigint' ? val.toString() : val));
    expect(text).not.toMatch(/secret/);
    expect(text).not.toMatch(/alice/);
  });

  it('attaches the Keeper message for each row', () => {
    const v = registeredView();
    const rows = v.fn({ sender: alice, db: noScanDb(seed()) });
    // The message is derived from the RAW class on the server, not the public bucket.
    const rawByid = new Map(seed().llm_job.map((j: any) => [j.id, j]));
    for (const r of rows) {
      const raw: any = rawByid.get(r.id);
      expect(r.userMessage).toBe(keeperMessageForJob(raw.status, raw.errorCode, raw.route));
    }
    // The coarse bucket is exposed, never the raw failure class (SEC-01).
    expect(rows.find((r: any) => r.id === 2n).errorCode).toBe('transient');
    expect(rows.find((r: any) => r.id === 1n).errorCode).toBeUndefined();
  });

  it('never exposes a raw failure class through errorCode', () => {
    const v = registeredView();
    const allowed = ['transient', 'unavailable', 'declined', 'failed'];
    const jobs = FAILURE_CLASSES.map((c, i) => job(BigInt(i + 1), alice, { status: 'failed', errorCode: c }));
    const rows = v.fn({ sender: alice, db: noScanDb({ llm_job: jobs }) });
    expect(rows).toHaveLength(FAILURE_CLASSES.length);
    for (const r of rows) {
      expect(allowed).toContain(r.errorCode);
      expect(FAILURE_CLASSES).not.toContain(r.errorCode);
    }
    const byId = (id: bigint) => rows.find((r: any) => r.id === id).errorCode;
    expect(byId(BigInt(FAILURE_CLASSES.indexOf('auth') + 1))).toBe('unavailable');
    expect(byId(BigInt(FAILURE_CLASSES.indexOf('billing') + 1))).toBe('unavailable');
    expect(byId(BigInt(FAILURE_CLASSES.indexOf('refusal') + 1))).toBe('declined');
  });

  it('projectMyLlmJob keeps only the six keys from a full row', () => {
    const p = projectMyLlmJob(job(9n, alice));
    expect(Object.keys(p).sort()).toEqual([...MY_LLM_JOB_KEYS].sort());
  });

  it('the source never scans a table and never names a payload column', () => {
    const src: string = readFileSync(fileURLToPath(new URL('./llm.ts', import.meta.url)), 'utf8');
    const scanMethod = ['i', 't', 'e', 'r'].join('');
    expect(src).not.toMatch(new RegExp(`\\.${scanMethod}\\s*\\(`));
    expect(src).toContain('by_player.filter(ctx.sender)');
    expect(src).not.toMatch(/requestJson|resultText|dedupeKey/);
  });
});

describe('registerViews wiring', () => {
  it('registers my_llm_jobs through registerViews', () => {
    const { t, schema } = createRecordingServerMock();
    const spacetimedb = schema({});
    const before = capturedViews().length;
    const deps: any = { spacetimedb, t };
    // The other view groups only need names to resolve at registration time.
    for (const k of [
      'Player', 'FriendRequest', 'Friend', 'GroupInvite', 'EventGroup', 'GroupMember',
      'CharacterEffect', 'CombatResult', 'CombatLoot', 'NpcDialog', 'QuestInstance',
      'Faction', 'FactionStanding', 'UiPanelLayout',
    ]) {
      deps[k] = { rowType: {} };
    }
    registerViews(deps);
    const names = capturedViews().slice(before).map((v) => v.opts?.name);
    expect(names).toContain('my_llm_jobs');
    expect(names.filter((n) => n === 'my_llm_jobs')).toHaveLength(1);
  });
});
