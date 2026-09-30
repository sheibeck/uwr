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
import { findSecretLeaks } from '../helpers/measurement';
import { ADMIN_IDENTITIES } from '../data/admin';
import { LLM_PHASE_SPEND_CAP_MICRO_USD } from '../data/llm_limits';
import { registerLlmViews, projectMyLlmJob, MY_LLM_JOB_KEYS, projectAdminLlmStatus, ADMIN_LLM_STATUS_KEYS } from './llm';
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

function registeredViews() {
  const { t, schema } = createRecordingServerMock();
  const spacetimedb = schema({});
  const before = capturedViews().length;
  registerLlmViews({ spacetimedb, t } as any);
  const added = capturedViews().slice(before);
  expect(added.map((v) => v.opts?.name)).toEqual(['my_llm_jobs', 'admin_llm_status']);
  return added;
}

function registeredView() {
  return registeredViews()[0];
}

function registeredAdminView() {
  return registeredViews()[1];
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

// ============================================================================
// admin_llm_status
// ============================================================================

const CLI_ADMIN_HEX = 'c200252497b98fff5aab75f8fbc675956b5a12a5b85042ab355d3a05c6ab7d6e';
const adminIdent = ident(CLI_ADMIN_HEX);
// Fake key built from fragments so no key-shaped literal sits in the source.
const FAKE_KEY = ['sk', 'ant', 'api03', 'ADMINVIEWFAKE0123456789abcdef'].join('-');
const ts = (micros: bigint) => ({ microsSinceUnixEpoch: micros });
const jsonText = (v: unknown) => JSON.stringify(v, (_k, val) => (typeof val === 'bigint' ? val.toString() : val));

function adminSeed(over: Record<string, any[]> = {}): Record<string, any[]> {
  return {
    llm_admin_state: [
      {
        id: 1n,
        keySet: true,
        keyLength: 108n,
        keyUpdatedAt: ts(100n),
        keyVerifiedAt: ts(200n),
        keyLastCheckOk: true,
        lastSmokeAt: ts(300n),
        lastSmokeJson: '{"smoke_test":{"ok":true}}',
      },
    ],
    llm_spend: [{ id: 1n, spentMicroUsd: 1234n, reservedMicroUsd: 567n, calls: 8n, updatedAt: ts(400n) }],
    llm_job: [
      job(1n, alice, { status: 'in_flight' }),
      job(2n, bob, { status: 'in_flight' }),
      job(3n, alice, { status: 'pending' }),
    ],
    llm_config: [{ id: 1n, apiKey: FAKE_KEY, updatedAt: ts(100n) }],
    ...over,
  };
}

describe('admin_llm_status view', () => {
  it('is registered as public (privacy comes from the sender check)', () => {
    expect(registeredAdminView().opts).toEqual({ name: 'admin_llm_status', public: true });
  });

  it('the CLI admin identity used here is a real admin', () => {
    expect(ADMIN_IDENTITIES.has(CLI_ADMIN_HEX)).toBe(true);
  });

  it('returns [] to a non-admin even with state, ledger and jobs seeded', () => {
    const v = registeredAdminView();
    expect(v.fn({ sender: alice, db: noScanDb(adminSeed()) })).toEqual([]);
    expect(v.fn({ sender: bob, db: noScanDb(adminSeed()) })).toEqual([]);
  });

  it('returns the defaults to an admin with no state or ledger yet', () => {
    const v = registeredAdminView();
    const rows = v.fn({ sender: adminIdent, db: noScanDb({}) });
    expect(rows).toHaveLength(1);
    expect(rows[0]).toEqual({
      keySet: false,
      keyLength: 0n,
      keyValid: false,
      keyUpdatedAt: undefined,
      keyVerifiedAt: undefined,
      lastSmokeAt: undefined,
      lastSmokeJson: '{}',
      phaseSpentMicroUsd: 0n,
      phaseReservedMicroUsd: 0n,
      phaseCalls: 0n,
      phaseCapMicroUsd: 2_000_000n,
      inFlight: 0n,
    });
  });

  it('returns the state, ledger totals and in-flight count to an admin', () => {
    const v = registeredAdminView();
    const rows = v.fn({ sender: adminIdent, db: noScanDb(adminSeed()) });
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      keySet: true,
      keyLength: 108n,
      keyValid: true,
      keyUpdatedAt: ts(100n),
      keyVerifiedAt: ts(200n),
      lastSmokeAt: ts(300n),
      lastSmokeJson: '{"smoke_test":{"ok":true}}',
      phaseSpentMicroUsd: 1234n,
      phaseReservedMicroUsd: 567n,
      phaseCalls: 8n,
      phaseCapMicroUsd: LLM_PHASE_SPEND_CAP_MICRO_USD,
      inFlight: 2n,
    });
  });

  it('is not valid when verified before the key was last set, when the last check failed, or when never verified', () => {
    const v = registeredAdminView();
    const state = adminSeed().llm_admin_state[0];
    const valid = (patch: Record<string, unknown>) =>
      v.fn({ sender: adminIdent, db: noScanDb(adminSeed({ llm_admin_state: [{ ...state, ...patch }] })) })[0].keyValid;
    expect(valid({})).toBe(true);
    expect(valid({ keyVerifiedAt: ts(50n) })).toBe(false);
    expect(valid({ keyLastCheckOk: false })).toBe(false);
    expect(valid({ keyVerifiedAt: undefined })).toBe(false);
    expect(valid({ keySet: false })).toBe(false);
  });

  it('exposes exactly the twelve documented keys', () => {
    const v = registeredAdminView();
    const row = v.fn({ sender: adminIdent, db: noScanDb(adminSeed()) })[0];
    expect(ADMIN_LLM_STATUS_KEYS).toHaveLength(12);
    expect(Object.keys(row).sort()).toEqual([...ADMIN_LLM_STATUS_KEYS].sort());
    expect(Object.keys(projectAdminLlmStatus(undefined, undefined, 0)).sort()).toEqual([...ADMIN_LLM_STATUS_KEYS].sort());
  });

  it('never returns a key seeded in the key table, or any fragment of it', () => {
    const v = registeredAdminView();
    const rows = v.fn({ sender: adminIdent, db: noScanDb(adminSeed()) });
    const text = jsonText(rows);
    expect(findSecretLeaks(text, { needles: [FAKE_KEY], strictPrefix: true }).total).toBe(0);
    expect(text).not.toContain(FAKE_KEY.slice(0, 20));
    // Positive control: the seeded key is really present in the mock db, so the check above is a real negative.
    const db: any = createMockDb(adminSeed(), { strict: true });
    expect(db.llm_config.id.find(1n).apiKey).toBe(FAKE_KEY);
  });

  it('counts only in_flight jobs through the index, never scanning a table', () => {
    const v = registeredAdminView();
    const many = Array.from({ length: 5 }, (_, i) => job(BigInt(10 + i), alice, { status: 'in_flight' }));
    const rows = v.fn({
      sender: adminIdent,
      db: noScanDb(adminSeed({ llm_job: [...many, job(99n, bob, { status: 'completed' })] })),
    });
    expect(rows[0].inFlight).toBe(5n);
  });

  it('the source never names the key table', () => {
    const src: string = readFileSync(fileURLToPath(new URL('./llm.ts', import.meta.url)), 'utf8');
    const keyTable = ['llm', 'config'].join('_');
    expect(src).not.toContain(keyTable);
    expect(src).not.toMatch(/apiKey/);
    expect(src).toContain('ADMIN_IDENTITIES.has(');
  });
});

describe('registerViews wiring', () => {
  it('registers my_llm_jobs and admin_llm_status through registerViews', () => {
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
    expect(names.filter((n) => n === 'admin_llm_status')).toHaveLength(1);
  });
});
