/**
 * QUAL-03 failure drills (Phase 44, Plan 02): seven failure classes crossed with every domain that
 * holds a lock, run through the real executor and the REAL failure apply (applyLlmFailure), with the
 * five edge families (boundary, adjacency, empty, ordering, precision) pinned at their thresholds.
 *
 * What each case asserts together: the job's status and error code, the domain lock's failure state,
 * the exact in-voice player line (recorded by the events mock, never a spy on the failure apply), the
 * money (bigint, exact), and that no automatic retry happened. Expected lines are imported from their
 * source modules. The few lines that are inline literals in the apply layer (and so cannot be imported
 * without a production change) are declared once below and pinned against the source text, so drift
 * fails loudly.
 *
 * No network. The API key is a fake built from fragments. No production file is touched.
 */
import { describe, it, expect, vi, beforeAll, beforeEach } from 'vitest';
// @ts-ignore node types are not part of this module's tsconfig (same as other source-reading tests)
import { readFileSync } from 'node:fs';
// @ts-ignore see above
import { fileURLToPath } from 'node:url';
// @ts-ignore see above
import { join } from 'node:path';
import { createMockCtx, createMockProcCtx, makeSyncResponse, type MockReply, type MockThrow } from './test-utils';
import { ScheduleAt } from 'spacetimedb';
import { enqueueLlmJob, serializeRequest, SOURCE_KEYS, LLM_RESTING_LINE } from './llm_queue';
import { encodeRouteInput, smokeInputFor } from './llm_inputs';
import { applyLlmFailure, applyLlmResult } from './llm_apply';
import { runLlmJob, claimLlmJob, type ExecutorDeps } from './llm_executor';
import { sweepLlmJobs } from './llm_sweeper';
import { patchAdminState, setDailyCeiling, setLlmEnabled } from './llm_admin_state';
import { reservationMicroUsd, utcDay, globalDayHeld } from './llm_budget';
import { retryDelayMs, msToMicros } from './llm_retry';
import { classifyClaudeResponse } from './claude_request';
import { keeperMessageForJob, publicErrorBucket, LLM_RESTING_ERROR_CODES } from './llm_status';
import { CLASS_FILL_FAILED_LINE, classFillRetryLine } from './creation_generation';
import { WORLD_FILL_FAILED_MESSAGE } from './world_gen';
import { awardRenown } from './renown';
import { appendPrivateEvent, appendCreationEvent, appendNpcDialog } from './events';
import { estimateCostMicroUsd } from './measurement';
import { LLM_ROUTES, type LlmRoute } from '../data/llm_routes';
import { LLM_NO_AUTO_RETRY_ROUTES, LLM_SWEEP_IN_FLIGHT_GRACE_MICROS, LLM_RETRY_MAX_MS } from '../data/llm_limits';

vi.mock('spacetimedb/server', async () =>
  (await import('./schema_recorder')).createRecordingServerMock(),
);

vi.mock('./events', () => ({
  appendSystemMessage: vi.fn(),
  appendPrivateEvent: vi.fn(),
  appendWorldEvent: vi.fn(),
  appendNpcDialog: vi.fn(),
  appendCreationEvent: vi.fn(),
}));

// Strict mock db: accessors come from the recorded schema, so load it before any test touches ctx.db.
beforeAll(async () => {
  await import('../schema/tables');
});

beforeEach(() => {
  vi.clearAllMocks();
});

// ----------------------------------------------------------------------------
// Fixtures and helpers (small local copies of the llm_executor.test.ts harness)
// ----------------------------------------------------------------------------

/** A fake key built from fragments so no key-shaped literal appears in the source. */
const FAKE_KEY = ['sk', '-ant-', 'api03-', 'DRILLTESTKEY'.repeat(4)].join('');

const T0 = 1_700_000_000_000_000n;
const ts = (micros: bigint) => ({ microsSinceUnixEpoch: micros });
const alice = { toHexString: () => 'a'.repeat(64) };
const bob = { toHexString: () => 'b'.repeat(64) };
const carol = { toHexString: () => 'c'.repeat(64) };
const PLAYERS = [alice, bob, carol];

const characterRow = (id: bigint, owner: bigint, name: string) => ({
  id,
  ownerUserId: owner,
  name,
  race: 'Kobold',
  className: 'Ashweaver',
  locationId: 0n,
});

function seedTables(over: Record<string, any[]> = {}): Record<string, any[]> {
  return {
    player: [
      { id: alice, userId: 7n, activeCharacterId: 1n },
      { id: bob, userId: 8n, activeCharacterId: 2n },
      { id: carol, userId: 9n, activeCharacterId: 3n },
    ],
    character: [characterRow(1n, 7n, 'Aldric'), characterRow(2n, 8n, 'Brenna'), characterRow(3n, 9n, 'Corvin')],
    llm_config: [{ id: 1n, apiKey: FAKE_KEY, updatedAt: ts(T0) }],
    npc: [{ id: 1n, name: 'Orsk' }],
    ...over,
  };
}

type Proc = ReturnType<typeof createMockProcCtx>;

function makeProc(responses: Array<MockReply | MockThrow> = [], seed: Record<string, any[]> = {}): Proc {
  return createMockProcCtx({ seed: seedTables(seed), timestampMicros: T0, responses, strict: true });
}

const rows = (proc: Proc, table: string): any[] => proc.db._tables[table] ?? [];
const jobOf = (proc: Proc, id: bigint): any => rows(proc, 'llm_job').find((j) => j.id === id);
const ledger = (proc: Proc): any => rows(proc, 'llm_spend')[0];
const dayOf = (proc: Proc, player: any = alice): any =>
  rows(proc, 'llm_player_budget').find((r) => r.playerId.toHexString() === player.toHexString());
const callLogs = (proc: Proc, jobId: bigint): any[] =>
  rows(proc, 'llm_call_log')
    .filter((r) => r.jobId === jobId)
    .sort((a, b) => (a.attempt < b.attempt ? -1 : a.attempt > b.attempt ? 1 : 0));

/** Enqueue one job through the real seam (reserves budget, writes the dispatch row) and return its id. */
function enqueue(
  proc: Proc,
  route: LlmRoute,
  o: { sourceKey: string; request: Record<string, unknown>; playerId?: any; characterId?: bigint },
): bigint {
  return proc.ctx.withTx((tx: any) => {
    const result = enqueueLlmJob(tx, {
      route,
      playerId: o.playerId ?? alice,
      characterId: o.characterId ?? 1n,
      sourceKey: o.sourceKey,
      request: o.request,
    });
    if (!result.job) throw new Error(`enqueue refused: ${String(result.refused)}`);
    return result.job.id as bigint;
  });
}

/** What the scheduler does before running llm_run: delete the dispatch row and hand it over as the argument. */
function takeDispatch(proc: Proc, jobId: bigint): any {
  const list = rows(proc, 'llm_dispatch');
  const i = list.findIndex((r) => r.jobId === jobId);
  if (i < 0) return { scheduledId: 9_999n, scheduledAt: ScheduleAt.time(proc.clock.now()), jobId };
  return list.splice(i, 1)[0];
}

/** The REAL apply and failure functions, wrapped in spies that call through. Nothing is stubbed. */
function realDeps(proc: Proc, over: Partial<ExecutorDeps> = {}): ExecutorDeps & { apply: any; applyFailure: any; log: any } {
  return {
    nowMs: () => Number(proc.clock.now() / 1000n),
    apply: vi.fn(applyLlmResult),
    applyFailure: vi.fn(applyLlmFailure),
    log: vi.fn(),
    ...over,
  } as any;
}

function run(proc: Proc, jobId: bigint, deps: ExecutorDeps = realDeps(proc)) {
  return runLlmJob(proc.ctx, takeDispatch(proc, jobId), deps);
}

const FIXTURE_DIR = fileURLToPath(new URL('./__fixtures__/claude/', import.meta.url));
const fixture = (name: string): any => JSON.parse(readFileSync(join(FIXTURE_DIR, `${name}.json`), 'utf8'));
const reply = (name: string, over: Record<string, unknown> = {}): any => ({ ...fixture(name), ...over });

/** Usage of the ok_json, refusal and max_tokens fixtures. */
const FIXTURE_USAGE = { input: 116, output: 562, cacheWrite: 0, cacheRead: 3727 };
const FIXTURE_COST = BigInt(estimateCostMicroUsd(FIXTURE_USAGE));

// ---- recorded player lines --------------------------------------------------

type Line = { channel: 'creation' | 'private' | 'npc_dialog'; to: string; kind: string; text: string; segments?: unknown };
const calls = (fn: unknown): any[][] => (fn as any).mock.calls;

/** Every in-voice line the apply layer posted, from the events mock (the production code wrote them). */
function playerLines(): Line[] {
  return [
    ...calls(appendCreationEvent).map((c) => ({ channel: 'creation' as const, to: c[1].toHexString(), kind: c[2], text: c[3], segments: c[4] })),
    ...calls(appendPrivateEvent).map((c) => ({ channel: 'private' as const, to: String(c[1]), kind: c[3], text: c[4], segments: c[5] })),
    ...calls(appendNpcDialog).map((c) => ({ channel: 'npc_dialog' as const, to: String(c[1]), kind: 'npc_dialog', text: c[3] })),
  ];
}

const resetLines = (): void => {
  for (const fn of [appendCreationEvent, appendPrivateEvent, appendNpcDialog]) (fn as any).mockClear();
};

const sortedJson = (ls: unknown[]): string[] => ls.map((l) => JSON.stringify(l)).sort();
const expectLines = (actual: Line[], expected: Array<Omit<Line, 'to'> & { to?: string }>): void => {
  const withTo = (e: any) => ({ channel: e.channel, to: e.to ?? '', kind: e.kind, text: e.text });
  const strip = (l: any) => ({ channel: l.channel, kind: l.kind, text: l.text });
  expect(sortedJson(actual.map(strip))).toEqual(sortedJson(expected.map(withTo).map(strip)));
  for (const e of expected) {
    if (e.to !== undefined) {
      expect(actual.some((l) => l.channel === e.channel && l.text === e.text && l.to === e.to)).toBe(true);
    }
  }
};

/** Everything a player may read after a failure: the posted lines and the public world-gen error message. */
function playerTexts(proc: Proc): string[] {
  const texts = playerLines().map((l) => l.text);
  for (const s of rows(proc, 'world_gen_state')) if (typeof s.errorMessage === 'string') texts.push(s.errorMessage);
  return texts;
}

// ---- leak and pronoun checks ------------------------------------------------

/**
 * Provider, status, key and account words. Whole-word matches, so "narrate" is not "rate". The words come
 * from the plan (anthropic, claude, api, status codes, rate, overload, spend, quota, key, token, http)
 * plus the account words the truth names (account, billing, credit, payment).
 */
const LEAK_PATTERN =
  /\b(anthropic|claude|api|http|https|key|keys|token|tokens|quota|rate|overload|overloaded|spend|billing|account|credit|credits|payment|status)\b|\b(401|403|429|500|529)\b/i;

/** The Keeper is he. The pattern of pronoun_rules.test.ts (KEEPER_IT_OR_THEY). */
const KEEPER_IT_OR_THEY = /\bKeeper\b[^.]*\b(its|itself|they|them|their|theirs|themselves)\b/;

function expectPlayerSafe(texts: string[]): void {
  for (const t of texts) {
    expect(t, `leak in: ${t}`).not.toMatch(LEAK_PATTERN);
    expect(t, `pronoun in: ${t}`).not.toMatch(KEEPER_IT_OR_THEY);
    expect(t.length).toBeGreaterThan(0);
  }
}

// ---- inline lines of the apply layer, pinned against the source ---------------

const CREATION_FLICKER_LINE = 'The page flickers. Something went wrong in the cosmic machinery. Try again.';
const WORLD_START_FAILED_LINE = 'The map blurs and will not settle. The world refuses to be remembered right now.';
const EXPLORE_HINT = 'Type [explore] to try again.';
const SKILL_FAILED_LINE =
  'The page flickers. Your potential eludes crystallization. Type [skills] when you want another attempt.';
const SKILL_RESTING_SUFFIX = 'Type [skills] when you want another attempt.';
const RENOWN_FALLBACK_LINE = 'The cosmos shrugs and offers some... standard options for your consideration.';
const npcDistractedLine = (name: string) => `${name} seems distracted.`;

const SRC = (rel: string): string => readFileSync(fileURLToPath(new URL(rel, import.meta.url)), 'utf8');

// ----------------------------------------------------------------------------
// The matrix tables
// ----------------------------------------------------------------------------

interface FailureClass {
  name: string;
  script: () => Array<MockReply | MockThrow>;
  errorCode: string;
  bucket: string;
  /** A 200 whose content was unusable: the real cost is charged to the player and the ledger. */
  billed?: boolean;
  /** A thrown attempt: the ledger holds the reservation as the unknown-billing stand-in. */
  unknownBilling?: boolean;
  /** Retried by routes that may retry (npc_conversation, skill_gen, renown_perk_gen). */
  transient?: boolean;
}

const CLASSES: FailureClass[] = [
  { name: 'truncation', script: () => [reply('max_tokens')], errorCode: 'truncated', bucket: 'failed', billed: true },
  { name: 'refusal', script: () => [reply('refusal')], errorCode: 'refusal', bucket: 'declined', billed: true },
  { name: '401', script: () => [reply('err_401')], errorCode: 'auth', bucket: 'unavailable' },
  { name: '429', script: () => [reply('err_429_retry_after')], errorCode: 'rate_limit', bucket: 'transient', transient: true },
  { name: '529', script: () => [reply('err_529')], errorCode: 'overloaded', bucket: 'transient', transient: true },
  { name: 'spend cap (provider)', script: () => [reply('err_429_spend_cap')], errorCode: 'billing', bucket: 'unavailable' },
  {
    name: 'timeout',
    script: () => [{ throw: 'timeout' }],
    errorCode: 'timeout',
    bucket: 'transient',
    transient: true,
    unknownBilling: true,
  },
];

interface LockRoute {
  route: LlmRoute;
  /** The state step the job holds while it runs. */
  holds: string;
  /** The step after a failure (the lock released). */
  after: string;
  table: 'character_creation_state' | 'world_gen_state';
  sourceKey: string;
  seed: () => Record<string, any[]>;
  request: () => Record<string, unknown>;
  /** The line the player reads: a normal failure, or the resting line of a stopped job. */
  line: (resting: boolean) => string;
  kind: string;
}

const creationState = (step: string, playerId: any = alice, id = 1n) => ({
  id,
  playerId,
  step,
  createdAt: ts(T0),
  updatedAt: ts(T0),
});
const worldState = (step: string, over: Record<string, any> = {}) => ({
  id: 5n,
  playerId: alice,
  characterId: 1n,
  sourceLocationId: 0n,
  sourceRegionId: 0n,
  step,
  createdAt: ts(T0),
  updatedAt: ts(T0),
  ...over,
});
const inputOf = (route: LlmRoute) => encodeRouteInput(smokeInputFor(route));

const LOCK_ROUTES: LockRoute[] = [
  {
    route: 'creation_race',
    holds: 'GENERATING_RACE',
    after: 'AWAITING_RACE',
    table: 'character_creation_state',
    sourceKey: SOURCE_KEYS.creation(1n, 'race'),
    seed: () => ({ character_creation_state: [creationState('GENERATING_RACE')] }),
    request: () => ({ creationStateId: '1', input: inputOf('creation_race') }),
    line: (resting) => (resting ? LLM_RESTING_LINE : CREATION_FLICKER_LINE),
    kind: 'creation_error',
  },
  {
    route: 'creation_class_reveal',
    holds: 'GENERATING_CLASS',
    after: 'AWAITING_ARCHETYPE',
    table: 'character_creation_state',
    sourceKey: SOURCE_KEYS.creation(1n, 'class'),
    seed: () => ({ character_creation_state: [creationState('GENERATING_CLASS')] }),
    request: () => ({ creationStateId: '1', input: inputOf('creation_class_reveal') }),
    line: (resting) => (resting ? LLM_RESTING_LINE : CREATION_FLICKER_LINE),
    kind: 'creation_error',
  },
  {
    route: 'creation_class',
    holds: 'CLASS_FILLING',
    after: 'CLASS_FILL_ERROR',
    table: 'character_creation_state',
    sourceKey: SOURCE_KEYS.creation(1n, 'class'),
    seed: () => ({ character_creation_state: [creationState('CLASS_FILLING')] }),
    request: () => ({ creationStateId: '1', input: inputOf('creation_class') }),
    line: (resting) => (resting ? classFillRetryLine(LLM_RESTING_LINE) : CLASS_FILL_FAILED_LINE),
    kind: 'creation_error',
  },
  {
    route: 'world_gen_start',
    holds: 'GENERATING',
    after: 'ERROR',
    table: 'world_gen_state',
    sourceKey: SOURCE_KEYS.worldGen(5n),
    seed: () => ({ world_gen_state: [worldState('GENERATING')] }),
    request: () => ({ genStateId: '5', input: inputOf('world_gen_start') }),
    line: (resting) => `${resting ? LLM_RESTING_LINE : WORLD_START_FAILED_LINE} ${EXPLORE_HINT}`,
    kind: 'creation_error',
  },
  {
    route: 'world_gen',
    holds: 'FILLING',
    after: 'FILL_ERROR',
    table: 'world_gen_state',
    sourceKey: SOURCE_KEYS.worldGen(5n),
    seed: () => ({ world_gen_state: [worldState('FILLING')] }),
    request: () => ({ genStateId: '5', input: inputOf('world_gen') }),
    line: (resting) => `${resting ? LLM_RESTING_LINE : WORLD_FILL_FAILED_MESSAGE} ${EXPLORE_HINT}`,
    kind: 'creation_error',
  },
];

const stepOf = (proc: Proc, r: LockRoute): string => rows(proc, r.table)[0].step;

/** A lock-route job, enqueued and ready to run: the proc, the job id and what it reserved. */
function lockJob(r: LockRoute, responses: Array<MockReply | MockThrow> = [], extraSeed: Record<string, any[]> = {}) {
  const proc = makeProc(responses, { ...r.seed(), ...extraSeed });
  const jobId = enqueue(proc, r.route, { sourceKey: r.sourceKey, request: r.request() });
  const reserved: bigint = jobOf(proc, jobId).reservedMicroUsd;
  resetLines();
  return { proc, jobId, reserved };
}

// ---- money -------------------------------------------------------------------

/**
 * Exact money after a terminal failure. Every figure is a bigint. The reservation is fully released
 * (nothing is held), and the player's held figure (spent plus reserved) moves from R to what was charged:
 * R equals charged plus released exactly, with no rounding.
 */
function expectMoney(
  proc: Proc,
  jobId: bigint,
  reserved: bigint,
  cls: { billed?: boolean; unknownBilling?: boolean },
  player: any = alice,
): void {
  const job = jobOf(proc, jobId);
  const day = dayOf(proc, player);
  const led = ledger(proc);
  const figures = [
    job.reservedMicroUsd,
    job.costMicroUsd,
    job.ledgerChargedMicroUsd,
    day.reservedMicroUsd,
    day.spentMicroUsd,
    day.calls,
    led.reservedMicroUsd,
    led.spentMicroUsd,
    led.calls,
  ];
  for (const f of figures) expect(typeof f).toBe('bigint');

  expect(job.reservedMicroUsd).toBe(0n);
  expect(day.reservedMicroUsd).toBe(0n);
  expect(led.reservedMicroUsd).toBe(0n);

  const charged: bigint = day.spentMicroUsd;
  const released: bigint = reserved - charged; // what left the player's held figure without being charged
  expect(charged + released).toBe(reserved);
  expect(released >= 0n).toBe(true);

  if (cls.billed) {
    expect(reserved >= FIXTURE_COST).toBe(true);
    expect(charged).toBe(FIXTURE_COST);
    expect(led.spentMicroUsd).toBe(FIXTURE_COST);
    expect(day.calls).toBe(1n);
    expect(led.calls).toBe(1n);
    expect(job.costMicroUsd).toBe(FIXTURE_COST);
  } else if (cls.unknownBilling) {
    expect(charged).toBe(0n);
    expect(released).toBe(reserved); // the player is refunded the whole reservation
    expect(led.spentMicroUsd).toBe(reserved); // the ledger keeps it as the unknown-billing stand-in
    expect(day.calls).toBe(0n);
    expect(led.calls).toBe(0n);
  } else {
    expect(charged).toBe(0n);
    expect(released).toBe(reserved);
    expect(led.spentMicroUsd).toBe(0n);
    expect(day.calls).toBe(0n);
    expect(led.calls).toBe(0n);
  }
}

// ----------------------------------------------------------------------------
// Pins: the inline lines this file declares exist verbatim in the production source
// ----------------------------------------------------------------------------

describe('pinned inline lines', () => {
  const apply = SRC('./llm_apply.ts');

  it.each([
    ['creation flicker', CREATION_FLICKER_LINE],
    ['world start failed', WORLD_START_FAILED_LINE],
    ['skill failed', SKILL_FAILED_LINE],
    ['renown fallback', RENOWN_FALLBACK_LINE],
    ['skill resting suffix', SKILL_RESTING_SUFFIX],
  ])('%s is still in llm_apply.ts verbatim', (_name, line) => {
    expect(apply).toContain(line);
  });

  it('the NPC distracted line and the [explore] hint are still in the source', () => {
    expect(apply).toContain('seems distracted.');
    expect(SRC('./world_gen.ts')).toContain(EXPLORE_HINT);
    expect(apply).toContain(EXPLORE_HINT);
  });

  it('every pinned line is itself in voice: leak-free, Keeper is he', () => {
    expectPlayerSafe([
      CREATION_FLICKER_LINE,
      WORLD_START_FAILED_LINE,
      SKILL_FAILED_LINE,
      RENOWN_FALLBACK_LINE,
      LLM_RESTING_LINE,
      CLASS_FILL_FAILED_LINE,
      WORLD_FILL_FAILED_MESSAGE,
      classFillRetryLine(LLM_RESTING_LINE),
      npcDistractedLine('Orsk'),
    ]);
  });
});

describe('the leak and pronoun patterns can fail (mutation checks)', () => {
  it.each([
    'The Keeper hit a rate limit.',
    'Anthropic is overloaded.',
    'Claude refused.',
    'HTTP 529 from the API.',
    'Your key is bad.',
    'Out of credits on the account.',
    'You hit the spend cap.',
    'Status 401.',
  ])('flags "%s"', (text) => {
    expect(text).toMatch(LEAK_PATTERN);
  });

  it.each(['The Keeper declined to narrate that one.', 'The Keeper is resting. Return later.', 'He turned the keystone slowly.'])(
    'passes "%s"',
    (text) => {
      expect(text).not.toMatch(LEAK_PATTERN);
    },
  );

  it('flags the Keeper called it or they, and passes he', () => {
    expect('The Keeper shakes its head.').toMatch(KEEPER_IT_OR_THEY);
    expect('The Keeper and their lamp.').toMatch(KEEPER_IT_OR_THEY);
    expect('The Keeper shakes his head.').not.toMatch(KEEPER_IT_OR_THEY);
  });
});

// ----------------------------------------------------------------------------
// The matrix: 7 failure classes x 5 lock-holding routes
// ----------------------------------------------------------------------------

describe.each(CLASSES)('failure class: $name', (cls) => {
  it.each(LOCK_ROUTES)('$route: in-voice line, lock released, money exact, no retry', (r) => {
    const { proc, jobId, reserved } = lockJob(r, cls.script());
    expect(stepOf(proc, r)).toBe(r.holds);
    expect(reserved).toBeGreaterThan(0n);
    const deps = realDeps(proc);

    const outcome = run(proc, jobId, deps);

    // Status, error code and the single attempt.
    expect(outcome).toBe('failed');
    const job = jobOf(proc, jobId);
    expect(job.status).toBe('failed');
    expect(job.errorCode).toBe(cls.errorCode);
    expect(job.finishedAt).toBeDefined();
    expect(job.attempt).toBe(1n);

    // No unwanted automatic retry: one call, no dispatch row, the failure apply ran once with this code.
    expect(proc.http.calls).toHaveLength(1);
    expect(proc.http.calls[0].timeoutMs).toBe(LLM_ROUTES[r.route].timeoutMs);
    expect(rows(proc, 'llm_dispatch')).toHaveLength(0);
    expect(proc.http.remaining()).toBe(0);
    expect(deps.applyFailure).toHaveBeenCalledTimes(1);
    expect(deps.applyFailure.mock.calls[0][1].errorCode).toBe(cls.errorCode);
    expect(deps.applyFailure.mock.calls[0][1].playerId).toBe(alice);

    // The lock moved to its documented failure state.
    expect(stepOf(proc, r)).toBe(r.after);

    // The exact in-voice line, once, to the right player.
    const lines = playerLines();
    expect(lines).toHaveLength(1);
    expect(lines[0]).toMatchObject({ channel: 'creation', kind: r.kind, text: r.line(false), to: alice.toHexString() });
    if (r.table === 'world_gen_state') {
      expect(rows(proc, 'world_gen_state')[0].errorMessage).not.toMatch(LEAK_PATTERN);
    }
    expectPlayerSafe(playerTexts(proc));

    // Money and the call-log row.
    expectMoney(proc, jobId, reserved, cls);
    const log = callLogs(proc, jobId);
    expect(log).toHaveLength(1);
    expect(log[0].outcome).toBe(cls.errorCode);
    expect(log[0].costMicroUsd).toBe(cls.billed ? FIXTURE_COST : cls.unknownBilling ? reserved : 0n);
  });
});

// ---- local spend cap: the kill switch and the global ceiling, at claim ------------

describe('failure class: spend cap (local ceiling) and kill switch', () => {
  const STOPS: Array<[string, string, (proc: Proc, reserved: bigint) => void]> = [
    ['kill switch', 'halted', (proc) => void proc.ctx.withTx((tx: any) => setLlmEnabled(tx, false))],
    [
      'global ceiling',
      'ceiling',
      (proc, reserved) => void proc.ctx.withTx((tx: any) => patchAdminState(tx, { dailyCeilingMicroUsd: reserved - 1n })),
    ],
  ];

  describe.each(STOPS)('%s', (_label, code, stop) => {
    it.each(LOCK_ROUTES)('$route: one resting line, lock released, full refund, no call', (r) => {
      const { proc, jobId, reserved } = lockJob(r);
      stop(proc, reserved);
      const deps = realDeps(proc);

      const outcome = run(proc, jobId, deps);

      expect(outcome).toBe('failed');
      const job = jobOf(proc, jobId);
      expect(job.status).toBe('failed');
      expect(job.errorCode).toBe(code);
      expect(job.attempt).toBe(0n);
      expect(proc.http.calls).toHaveLength(0);
      expect(rows(proc, 'llm_dispatch')).toHaveLength(0);
      expect(deps.applyFailure).toHaveBeenCalledTimes(1);
      expect(stepOf(proc, r)).toBe(r.after);

      const lines = playerLines();
      expect(lines).toHaveLength(1);
      expect(lines[0]).toMatchObject({ channel: 'creation', kind: r.kind, text: r.line(true), to: alice.toHexString() });
      expectPlayerSafe(playerTexts(proc));

      expectMoney(proc, jobId, reserved, {});
    });
  });

  it.each(LOCK_ROUTES)('$route: the player cannot tell which cause stopped the job (identical lines)', (r) => {
    const seen: string[][] = [];
    for (const [, , stop] of STOPS) {
      const { proc, jobId, reserved } = lockJob(r);
      stop(proc, reserved);
      run(proc, jobId);
      seen.push(playerTexts(proc));
    }
    expect(seen[0]).toEqual(seen[1]);
    // The line, plus (world gen only) the public state message, which is the same resting line.
    expect(seen[0]).toEqual(r.table === 'world_gen_state' ? [r.line(true), LLM_RESTING_LINE] : [r.line(true)]);
  });
});

// ---- the player's own view: my_llm_jobs lines by class ------------------------------

describe('the line a player reads through my_llm_jobs, by class', () => {
  const CODES = [...CLASSES.map((c) => [c.errorCode, c.bucket] as const), ['halted', 'unavailable'] as const, ['ceiling', 'unavailable'] as const];

  it.each(CODES)('error code %s maps to the %s bucket and an in-voice, leak-free line', (code, bucket) => {
    expect(publicErrorBucket(code)).toBe(bucket);
    for (const r of LOCK_ROUTES) {
      const line = keeperMessageForJob('failed', code, r.route);
      expectPlayerSafe([line]);
      expect(line).toMatch(/Keeper/);
    }
  });

  it('401 and the provider spend cap read the same, so the player cannot tell an account fault apart', () => {
    expect(keeperMessageForJob('failed', 'auth', 'npc_conversation')).toBe(keeperMessageForJob('failed', 'billing', 'npc_conversation'));
  });

  it('429, 529 and timeout read the same', () => {
    const a = keeperMessageForJob('failed', 'rate_limit', 'npc_conversation');
    expect(keeperMessageForJob('failed', 'overloaded', 'npc_conversation')).toBe(a);
    expect(keeperMessageForJob('failed', 'timeout', 'npc_conversation')).toBe(a);
  });

  it('halted and ceiling both read as the one resting line', () => {
    expect([...LLM_RESTING_ERROR_CODES].sort()).toEqual(['ceiling', 'halted']);
    expect(keeperMessageForJob('failed', 'halted', 'npc_conversation')).toBe(LLM_RESTING_LINE);
    expect(keeperMessageForJob('failed', 'ceiling', 'npc_conversation')).toBe(LLM_RESTING_LINE);
  });

  it('a lock route that is NOT in the no-retry list would be a defect: all five are', () => {
    for (const r of LOCK_ROUTES) expect((LLM_NO_AUTO_RETRY_ROUTES as readonly string[]).includes(r.route)).toBe(true);
  });
});

// ---- a placed character gets the world-gen failure as a private line --------------

describe('world-gen failure for a placed character', () => {
  it.each(['world_gen_start', 'world_gen'])('%s: the line goes to the character, not the creation log', (route) => {
    const r = LOCK_ROUTES.find((x) => x.route === route)!;
    const { proc, jobId } = lockJob(r, [reply('err_500')], {
      character: [{ ...characterRow(1n, 7n, 'Aldric'), locationId: 10n }],
    });
    run(proc, jobId);
    const lines = playerLines();
    expect(lines).toHaveLength(1);
    expect(lines[0]).toMatchObject({ channel: 'private', kind: 'system', to: '1', text: r.line(false) });
    expectPlayerSafe(playerTexts(proc));
  });

  it('a world_gen_start job at PENDING (not yet GENERATING) is failed to ERROR too', () => {
    const r = LOCK_ROUTES.find((x) => x.route === 'world_gen_start')!;
    const { proc, jobId } = lockJob(r, [reply('err_401')], { world_gen_state: [worldState('PENDING')] });
    run(proc, jobId);
    expect(stepOf(proc, r)).toBe('ERROR');
    expect(playerLines()).toHaveLength(1);
  });
});

// ----------------------------------------------------------------------------
// Routes that are not locks: retry and failure behavior by class
// ----------------------------------------------------------------------------

interface OtherRoute {
  route: LlmRoute;
  retries: boolean;
  seed: () => Record<string, any[]>;
  enqueue: (proc: Proc) => bigint;
  /** Lines after a terminal failure that is not a resting stop. */
  terminal: () => Array<Omit<Line, 'to'>>;
  /** Lines after a kill switch stop at claim. */
  resting: () => Array<Omit<Line, 'to'>>;
}

const renownSeed = (): Record<string, any[]> => ({
  renown: [{ id: 1n, characterId: 1n, points: 90n, currentRank: 1n }],
});

const OTHER_ROUTES: OtherRoute[] = [
  {
    route: 'npc_conversation',
    retries: true,
    seed: () => ({}),
    enqueue: (proc) =>
      enqueue(proc, 'npc_conversation', {
        sourceKey: SOURCE_KEYS.npcConversation(1n, 1n, 0),
        request: { characterId: '1', npcId: '1', input: inputOf('npc_conversation') },
      }),
    terminal: () => [
      { channel: 'npc_dialog', kind: 'npc_dialog', text: npcDistractedLine('Orsk') },
      { channel: 'private', kind: 'npc', text: `${npcDistractedLine('Orsk')} Try again.` },
    ],
    resting: () => [{ channel: 'private', kind: 'system', text: LLM_RESTING_LINE }],
  },
  {
    route: 'skill_gen',
    retries: true,
    seed: () => ({}),
    enqueue: (proc) =>
      enqueue(proc, 'skill_gen', {
        sourceKey: SOURCE_KEYS.skillGen(1n, 2n),
        request: { characterId: '1', input: inputOf('skill_gen') },
      }),
    terminal: () => [{ channel: 'private', kind: 'narrative', text: SKILL_FAILED_LINE }],
    resting: () => [{ channel: 'private', kind: 'narrative', text: `${LLM_RESTING_LINE} ${SKILL_RESTING_SUFFIX}` }],
  },
  {
    route: 'renown_perk_gen',
    retries: true,
    seed: renownSeed,
    enqueue: (proc) => {
      proc.ctx.withTx((tx: any) => awardRenown(tx, characterRow(1n, 7n, 'Aldric'), 20n, 'test'));
      const jobs = rows(proc, 'llm_job');
      expect(jobs).toHaveLength(1);
      return jobs[0].id;
    },
    // An earned perk offer is never lost: the static options are delivered with one in-voice line.
    terminal: () => [{ channel: 'private', kind: 'narrative', text: RENOWN_FALLBACK_LINE }],
    resting: () => [{ channel: 'private', kind: 'narrative', text: RENOWN_FALLBACK_LINE }],
  },
  {
    route: 'combat_narration',
    retries: false,
    seed: () => ({}),
    enqueue: (proc) =>
      enqueue(proc, 'combat_narration', {
        sourceKey: SOURCE_KEYS.combatNarration(1n, 1n, 'round'),
        request: {
          combatId: '1',
          roundNumber: '1',
          narrativeType: 'round',
          participantCharacterIds: ['1'],
          input: inputOf('combat_narration'),
        },
      }),
    // Narration is silent: combat continues without it.
    terminal: () => [],
    resting: () => [],
  },
];

function otherJob(r: OtherRoute, responses: Array<MockReply | MockThrow> = []) {
  const proc = makeProc(responses, r.seed());
  const jobId = r.enqueue(proc);
  const reserved: bigint = jobOf(proc, jobId).reservedMicroUsd;
  resetLines();
  return { proc, jobId, reserved };
}

describe.each(CLASSES)('non-lock routes, failure class: $name', (cls) => {
  describe.each(OTHER_ROUTES)('$route', (r) => {
    const willRetry = r.retries && cls.transient === true;

    if (willRetry) {
      it('retries once: one dispatch, one call so far, no player line, reservation held', () => {
        const { proc, jobId, reserved } = otherJob(r, cls.script());
        const deps = realDeps(proc);

        expect(run(proc, jobId, deps)).toBe('retry');

        const job = jobOf(proc, jobId);
        expect(job.status).toBe('pending');
        expect(job.errorCode).toBe(cls.errorCode);
        expect(job.attempt).toBe(1n);
        expect(job.reservedMicroUsd).toBe(reserved);
        expect(rows(proc, 'llm_dispatch')).toHaveLength(1);
        expect(rows(proc, 'llm_dispatch')[0].jobId).toBe(jobId);
        expect(proc.http.calls).toHaveLength(1);
        expect(deps.applyFailure).not.toHaveBeenCalled();
        expect(playerLines()).toEqual([]);
        // The reservation is still held, the player untouched; only a thrown attempt charges the ledger.
        expect(dayOf(proc).spentMicroUsd).toBe(0n);
        expect(dayOf(proc).reservedMicroUsd).toBe(reserved);
        expect(ledger(proc).spentMicroUsd).toBe(cls.unknownBilling ? reserved : 0n);
      });

      it('after the last attempt it is terminal: one line, one refund, three calls, no dispatch left', () => {
        const script = [...cls.script(), ...cls.script(), ...cls.script()];
        const { proc, jobId, reserved } = otherJob(r, script);
        const deps = realDeps(proc);

        expect(run(proc, jobId, deps)).toBe('retry');
        proc.clock.advance(70_000_000n);
        expect(run(proc, jobId, deps)).toBe('retry');
        proc.clock.advance(70_000_000n);
        expect(run(proc, jobId, deps)).toBe('failed');

        const job = jobOf(proc, jobId);
        expect(job.status).toBe('failed');
        expect(job.errorCode).toBe(cls.errorCode);
        expect(job.attempt).toBe(3n);
        expect(proc.http.calls).toHaveLength(3);
        expect(rows(proc, 'llm_dispatch')).toHaveLength(0);
        expect(deps.applyFailure).toHaveBeenCalledTimes(1);
        expectLines(playerLines(), r.terminal());
        expectPlayerSafe(playerTexts(proc));

        // The player is refunded; a thrown attempt charged the ledger the reservation each time.
        expect(job.reservedMicroUsd).toBe(0n);
        expect(dayOf(proc).reservedMicroUsd).toBe(0n);
        expect(dayOf(proc).spentMicroUsd).toBe(0n);
        expect(dayOf(proc).calls).toBe(0n);
        expect(ledger(proc).reservedMicroUsd).toBe(0n);
        expect(ledger(proc).spentMicroUsd).toBe(cls.unknownBilling ? reserved * 3n : 0n);
        expect(ledger(proc).calls).toBe(0n);
      });
    } else {
      it('is terminal at once: one call, no dispatch, the designed line, money exact', () => {
        const { proc, jobId, reserved } = otherJob(r, cls.script());
        const deps = realDeps(proc);

        expect(run(proc, jobId, deps)).toBe('failed');

        const job = jobOf(proc, jobId);
        expect(job.status).toBe('failed');
        expect(job.errorCode).toBe(cls.errorCode);
        expect(job.attempt).toBe(1n);
        expect(proc.http.calls).toHaveLength(1);
        expect(rows(proc, 'llm_dispatch')).toHaveLength(0);
        expect(deps.applyFailure).toHaveBeenCalledTimes(1);
        expectLines(playerLines(), r.terminal());
        expectPlayerSafe(playerTexts(proc));
        expectMoney(proc, jobId, reserved, cls);
      });
    }
  });
});

describe('non-lock routes stopped at claim (kill switch): the designed resting behavior', () => {
  it.each(OTHER_ROUTES)('$route', (r) => {
    const { proc, jobId, reserved } = otherJob(r);
    proc.ctx.withTx((tx: any) => setLlmEnabled(tx, false));

    expect(run(proc, jobId)).toBe('failed');

    expect(jobOf(proc, jobId).errorCode).toBe('halted');
    expect(proc.http.calls).toHaveLength(0);
    expectLines(playerLines(), r.resting());
    expectPlayerSafe(playerTexts(proc));
    expectMoney(proc, jobId, reserved, {});
  });

  it('renown: the static options are delivered even when the Keeper is resting', () => {
    const r = OTHER_ROUTES.find((x) => x.route === 'renown_perk_gen')!;
    const { proc, jobId } = otherJob(r, [reply('err_401')]);
    run(proc, jobId);
    const perks = rows(proc, 'pending_renown_perk');
    expect(perks.length).toBeGreaterThan(0);
    expect(perks.every((p) => p.characterId === 1n && p.rank === 2n)).toBe(true);
  });

  it('combat_narration stays silent for every class and leaves no narrative row', () => {
    const r = OTHER_ROUTES.find((x) => x.route === 'combat_narration')!;
    for (const cls of CLASSES) {
      const { proc, jobId } = otherJob(r, cls.script());
      run(proc, jobId);
      expect(playerLines()).toEqual([]);
      expect(rows(proc, 'combat_narrative')).toHaveLength(0);
      resetLines();
    }
  });
});

// ----------------------------------------------------------------------------
// Edge family: boundary
// ----------------------------------------------------------------------------

/** A fixed, non-round day figure for the ledger so a rounding slip cannot hide. */
const SPENT = 2_000_003n;

const ledgerSeed = (spent: bigint = SPENT): Record<string, any[]> => ({
  llm_spend: [
    {
      id: 1n,
      spentMicroUsd: spent,
      reservedMicroUsd: 0n,
      calls: 0n,
      updatedAt: ts(T0),
      dayUtc: utcDay(ts(T0)),
      daySpentMicroUsd: spent,
    },
  ],
});

describe('boundary: the spend cap at ceiling minus 1, the ceiling, and ceiling plus 1 micro-USD', () => {
  const race = LOCK_ROUTES[0];

  /** The job's own reservation, computed the way the seam does, and checked against a real enqueue. */
  const ownReservation = (): bigint => {
    const probe = lockJob(race, [], ledgerSeed());
    expect(reservationMicroUsd('creation_race', serializeRequest(race.request()))).toBe(probe.reserved);
    return probe.reserved;
  };

  const setCeiling = (proc: Proc, v: bigint) => void proc.ctx.withTx((tx: any) => setDailyCeiling(tx, v));

  describe('the enqueue gate (held plus reservation greater than ceiling is refused)', () => {
    it('ceiling minus 1: refused as ceiling, nothing written', () => {
      const r = ownReservation();
      const proc = makeProc([], { ...race.seed(), ...ledgerSeed() });
      setCeiling(proc, SPENT + r - 1n);
      const before = JSON.stringify(rows(proc, 'llm_spend'), (_k, v) => (typeof v === 'bigint' ? `${v}n` : v));

      const result = proc.ctx.withTx((tx: any) =>
        enqueueLlmJob(tx, { route: 'creation_race', playerId: alice, characterId: 1n, sourceKey: race.sourceKey, request: race.request() }),
      );

      expect(result.refused).toBe('ceiling');
      expect(result.job).toBeNull();
      expect(rows(proc, 'llm_job')).toHaveLength(0);
      expect(rows(proc, 'llm_dispatch')).toHaveLength(0);
      expect(rows(proc, 'llm_player_budget')).toHaveLength(0);
      expect(JSON.stringify(rows(proc, 'llm_spend'), (_k, v) => (typeof v === 'bigint' ? `${v}n` : v))).toBe(before);
    });

    it.each([
      ['exactly the ceiling', 0n],
      ['ceiling plus 1', 1n],
    ])('%s: admitted and reserved', (_label, plus) => {
      const r = ownReservation();
      const proc = makeProc([], { ...race.seed(), ...ledgerSeed() });
      setCeiling(proc, SPENT + r + plus); // spent + r exactly, or one micro above it
      const jobId = enqueue(proc, 'creation_race', { sourceKey: race.sourceKey, request: race.request() });
      expect(jobOf(proc, jobId).reservedMicroUsd).toBe(r);
      expect(ledger(proc).reservedMicroUsd).toBe(r);
      expect(globalDayHeld(ledger(proc), utcDay(ts(T0)))).toBe(SPENT + r);
    });
  });

  describe('the claim gate (today spent plus other in-flight plus this job, against the ceiling)', () => {
    it('ceiling minus 1: an already-queued job fails as ceiling: one refund, one resting line, lock released', () => {
      const { proc, jobId, reserved } = lockJob(race, [], ledgerSeed());
      setCeiling(proc, SPENT + reserved - 1n);
      const deps = realDeps(proc);

      expect(run(proc, jobId, deps)).toBe('failed');

      expect(jobOf(proc, jobId).errorCode).toBe('ceiling');
      expect(proc.http.calls).toHaveLength(0);
      expect(stepOf(proc, race)).toBe(race.after);
      expectLines(playerLines(), [{ channel: 'creation', kind: 'creation_error', text: LLM_RESTING_LINE }]);
      expect(ledger(proc).reservedMicroUsd).toBe(0n);
      expect(ledger(proc).calls).toBe(0n);
      expect(ledger(proc).spentMicroUsd).toBe(SPENT);
      expect(dayOf(proc).reservedMicroUsd).toBe(0n);
      expect(dayOf(proc).calls).toBe(0n);
    });

    it.each([
      ['exactly the ceiling', 0n],
      ['ceiling plus 1', 1n],
    ])('%s: the job is claimed and runs', (_label, plus) => {
      const { proc, jobId, reserved } = lockJob(race, [], ledgerSeed());
      setCeiling(proc, SPENT + reserved + plus);
      const claim = claimLlmJob(proc.ctx, takeDispatch(proc, jobId), realDeps(proc));
      expect(claim.kind).toBe('run');
      expect(jobOf(proc, jobId).status).toBe('in_flight');
      expect(playerLines()).toEqual([]);
    });
  });
});

describe('boundary: the timeout, at exactly the route timeout and 1 ms over', () => {
  it.each(Object.keys(LLM_ROUTES).filter((k) => k !== 'smoke_test'))('%s: the call carries exactly the route timeout', (route) => {
    const proc = makeProc([reply('err_500')], { ...LOCK_ROUTES[0].seed() });
    const jobId = enqueue(proc, route as LlmRoute, {
      sourceKey: `t-${route}`,
      request: { input: inputOf(route as LlmRoute) },
    });
    run(proc, jobId, realDeps(proc, { applyFailure: vi.fn() as any }));
    expect(proc.http.calls[0].timeoutMs).toBe(LLM_ROUTES[route as LlmRoute].timeoutMs);
  });

  it('a reply that takes exactly the route timeout is a normal reply (the executor adds no cut of its own)', () => {
    const t = LLM_ROUTES.npc_conversation.timeoutMs;
    const proc = makeProc([reply('ok_text', { advanceMicros: BigInt(t) * 1000n })]);
    const jobId = OTHER_ROUTES[0].enqueue(proc);
    const deps = realDeps(proc, { apply: vi.fn() as any });
    expect(run(proc, jobId, deps)).toBe('completed');
    expect(callLogs(proc, jobId)[0].latencyMs).toBe(BigInt(t));
    expect(deps.applyFailure).not.toHaveBeenCalled();
  });

  it('a call that throws a timeout 1 ms over the route timeout fails as timeout and releases the lock', () => {
    const r = LOCK_ROUTES[0];
    const t = LLM_ROUTES.creation_race.timeoutMs;
    const { proc, jobId, reserved } = lockJob(r, [{ throw: 'timeout', advanceMicros: BigInt(t + 1) * 1000n }]);
    expect(run(proc, jobId)).toBe('failed');
    expect(jobOf(proc, jobId).errorCode).toBe('timeout');
    expect(callLogs(proc, jobId)[0].latencyMs).toBe(BigInt(t + 1));
    expect(stepOf(proc, r)).toBe(r.after);
    expectLines(playerLines(), [{ channel: 'creation', kind: 'creation_error', text: r.line(false) }]);
    expectMoney(proc, jobId, reserved, { unknownBilling: true });
  });

  describe('the sweeper: an in-flight job is left alone at exactly route timeout plus grace and expired one micro later', () => {
    it.each(LOCK_ROUTES)('$route', (r) => {
      const { proc, jobId, reserved } = lockJob(r);
      const claim = claimLlmJob(proc.ctx, takeDispatch(proc, jobId), realDeps(proc));
      expect(claim.kind).toBe('run');
      const edge = BigInt(LLM_ROUTES[r.route].timeoutMs) * 1000n + LLM_SWEEP_IN_FLIGHT_GRACE_MICROS;
      const sweep = () =>
        proc.ctx.withTx((tx: any) => sweepLlmJobs(tx, { applyFailure: applyLlmFailure, log: () => {} }));

      proc.clock.advance(edge); // exactly timeout plus grace
      expect(sweep().expiredInFlight).toBe(0);
      expect(jobOf(proc, jobId).status).toBe('in_flight');
      expect(playerLines()).toEqual([]);
      expect(stepOf(proc, r)).toBe(r.holds);

      proc.clock.advance(1n); // one microsecond past
      expect(sweep().expiredInFlight).toBe(1);
      const job = jobOf(proc, jobId);
      expect(job.status).toBe('expired');
      expect(job.errorCode).toBe('timeout');
      expect(stepOf(proc, r)).toBe(r.after);
      expectLines(playerLines(), [{ channel: 'creation', kind: 'creation_error', text: r.line(false) }]);
      expectPlayerSafe(playerTexts(proc));
      // The player is refunded, the ledger holds the reservation as the unknown-billing stand-in.
      expectMoney(proc, jobId, reserved, { unknownBilling: true });
      // A second sweep finds nothing: no second line, no second refund.
      expect(sweep().expiredInFlight).toBe(0);
      expect(playerLines()).toHaveLength(1);
    });
  });
});

describe('boundary: retry-after at 59 s, 60 s, 61 s and a very large value', () => {
  const retryAfter = (value: string) => {
    const r = reply('err_429_retry_after');
    r.headers = { ...r.headers, 'retry-after': value };
    return r;
  };
  const delayOf = (value: string): { delay: bigint; proc: Proc; jobId: bigint } => {
    const proc = makeProc([retryAfter(value)]);
    const jobId = OTHER_ROUTES[0].enqueue(proc);
    run(proc, jobId);
    return { delay: jobOf(proc, jobId).nextAttemptAt.microsSinceUnixEpoch - T0, proc, jobId };
  };
  const S = 1_000_000n;

  it.each([
    ['59', 59n * S],
    ['60', 60n * S],
  ])('retry-after %s s waits that long, plus bounded jitter (under 20 percent of the 2 s base)', (value, core) => {
    const { delay } = delayOf(value);
    expect(delay).toBeGreaterThanOrEqual(core);
    expect(delay).toBeLessThan(core + 400_000n);
  });

  it.each(['61', '600', '86400', '99999999999'])('retry-after %s s is capped at 60 s plus jitter', (value) => {
    const { delay } = delayOf(value);
    expect(delay).toBeGreaterThanOrEqual(60n * S);
    expect(delay).toBeLessThan(60n * S + 400_000n);
  });

  it('the delay equals the production formula exactly (cap and jitter included)', () => {
    for (const value of ['0', '17', '59', '60', '61', '99999999999']) {
      const { delay, jobId } = delayOf(value);
      expect(delay).toBe(msToMicros(retryDelayMs(1, Number(value), jobId)));
      expect(delay <= msToMicros(LLM_RETRY_MAX_MS) + 400_000n).toBe(true);
    }
  });

  it('a second 429 does not wait less than its base: attempt 2 waits at least 8 s even with retry-after 1', () => {
    expect(retryDelayMs(2, 1, 1n)).toBeGreaterThanOrEqual(8000);
  });
});

// ----------------------------------------------------------------------------
// Edge family: adjacency (two causes at once)
// ----------------------------------------------------------------------------

describe('adjacency: two causes hit the same job, the player gets one line and one refund', () => {
  const race = LOCK_ROUTES[0];

  const expectSingleOutcome = (proc: Proc, jobId: bigint, reserved: bigint, text: string) => {
    expect(playerLines()).toHaveLength(1);
    expect(playerLines()[0]).toMatchObject({ channel: 'creation', kind: 'creation_error', text, to: alice.toHexString() });
    expect(stepOf(proc, race)).toBe(race.after);
    expect(dayOf(proc).reservedMicroUsd).toBe(0n);
    expect(dayOf(proc).calls).toBe(0n);
    expect(ledger(proc).reservedMicroUsd).toBe(0n);
    expect(ledger(proc).calls).toBe(0n);
    expect(jobOf(proc, jobId).reservedMicroUsd).toBe(0n);
    expect(reserved).toBeGreaterThan(0n);
  };

  it('kill switch and ceiling both on before the claim: one failed job, one resting line, one refund, lock released once', () => {
    const { proc, jobId, reserved } = lockJob(race);
    proc.ctx.withTx((tx: any) => patchAdminState(tx, { llmEnabled: false, dailyCeilingMicroUsd: reserved - 1n }));
    const arg = takeDispatch(proc, jobId);
    const deps = realDeps(proc);

    expect(runLlmJob(proc.ctx, arg, deps)).toBe('failed');

    expect(jobOf(proc, jobId).status).toBe('failed');
    expect(['halted', 'ceiling']).toContain(jobOf(proc, jobId).errorCode);
    expect(deps.applyFailure).toHaveBeenCalledTimes(1);
    expect(proc.http.calls).toHaveLength(0);
    expectSingleOutcome(proc, jobId, reserved, LLM_RESTING_LINE);

    // The same dispatch arriving again (a duplicate) does nothing: no second line, no second refund.
    expect(runLlmJob(proc.ctx, arg, realDeps(proc))).toBe('skip');
    // Neither does the sweeper, an hour later.
    proc.clock.advance(3_600_000_000n);
    proc.ctx.withTx((tx: any) => sweepLlmJobs(tx, { applyFailure: applyLlmFailure, log: () => {} }));
    expectSingleOutcome(proc, jobId, reserved, LLM_RESTING_LINE);
    expect(ledger(proc).spentMicroUsd).toBe(0n);
  });

  it('both causes together read exactly like either one alone (identical line, identical money)', () => {
    const outcomes: string[] = [];
    for (const patch of [{ llmEnabled: false }, { dailyCeilingMicroUsd: 1n }, { llmEnabled: false, dailyCeilingMicroUsd: 1n }]) {
      const { proc, jobId } = lockJob(race);
      proc.ctx.withTx((tx: any) => patchAdminState(tx, patch));
      run(proc, jobId);
      outcomes.push(
        JSON.stringify({ texts: playerTexts(proc), step: stepOf(proc, race), res: ledger(proc).reservedMicroUsd.toString(), calls: ledger(proc).calls.toString() }),
      );
    }
    expect(new Set(outcomes).size).toBe(1);
  });

  it('a provider 429 spend cap on a job whose local ceiling passed at exactly the limit: one in-voice line, one refund, no retry', () => {
    const probe = lockJob(race, [], ledgerSeed());
    const { proc, jobId, reserved } = lockJob(race, [reply('err_429_spend_cap')], ledgerSeed());
    expect(reserved).toBe(probe.reserved);
    proc.ctx.withTx((tx: any) => setDailyCeiling(tx, SPENT + reserved)); // exactly at the limit
    const deps = realDeps(proc);

    expect(run(proc, jobId, deps)).toBe('failed');

    const job = jobOf(proc, jobId);
    expect(job.errorCode).toBe('billing'); // the provider's cap, not the local ceiling
    expect(proc.http.calls).toHaveLength(1);
    expect(rows(proc, 'llm_dispatch')).toHaveLength(0);
    expect(deps.applyFailure).toHaveBeenCalledTimes(1);
    expectSingleOutcome(proc, jobId, reserved, race.line(false));
    expectPlayerSafe(playerTexts(proc));
    expect(ledger(proc).spentMicroUsd).toBe(SPENT);
    expect(rows(proc, 'llm_admin_state')[0].keyLastCheckOk).toBe(false);
  });

  it('the kill switch and the global ceiling flipped while the call is out do not stop it; the provider cap that comes back fails it once', () => {
    const { proc, jobId, reserved } = lockJob(race, [reply('err_429_spend_cap')], ledgerSeed());
    const original = proc.ctx.http.fetch.bind(proc.ctx.http);
    proc.ctx.http.fetch = (url: string, init: any) => {
      proc.ctx.withTx((tx: any) => patchAdminState(tx, { llmEnabled: false, dailyCeilingMicroUsd: 1n }));
      return original(url, init);
    };

    expect(run(proc, jobId)).toBe('failed');

    expect(jobOf(proc, jobId).errorCode).toBe('billing');
    expect(proc.http.calls).toHaveLength(1);
    expectSingleOutcome(proc, jobId, reserved, race.line(false));
  });

  it('the sweeper expires a job while its 429 spend-cap reply is still on the way: one line, one refund, the late reply adds neither', () => {
    const { proc, jobId, reserved } = lockJob(race, [reply('err_429_spend_cap')], ledgerSeed());
    const original = proc.ctx.http.fetch.bind(proc.ctx.http);
    proc.ctx.http.fetch = (url: string, init: any) => {
      const res = original(url, init);
      proc.clock.advance(BigInt(LLM_ROUTES.creation_race.timeoutMs) * 1000n + 31_000_000n);
      proc.ctx.withTx((tx: any) => sweepLlmJobs(tx, { applyFailure: applyLlmFailure, log: () => {} }));
      return res;
    };

    expect(run(proc, jobId)).toBe('stale');

    expect(jobOf(proc, jobId).status).toBe('expired');
    expectSingleOutcome(proc, jobId, reserved, race.line(false));
  });
});

// ----------------------------------------------------------------------------
// Edge family: empty or missing bodies and headers
// ----------------------------------------------------------------------------

describe('empty: failure replies with an empty or missing body or headers still map to a defined class', () => {
  const STATUS_CLASS: Array<[number, string, boolean]> = [
    [401, 'auth', false],
    [429, 'rate_limit', true],
    [500, 'server', true],
    [529, 'overloaded', true],
  ];
  const VARIANTS: Array<[string, (status: number) => MockReply]> = [
    ['no body and no headers', (status) => ({ status })],
    ['an empty string body and empty headers', (status) => ({ status, body: '', headers: {} })],
    ['an empty string body with only a content type', (status) => ({ status, body: '', headers: { 'content-type': 'application/json' } })],
    ['an empty JSON object', (status) => ({ status, body: '{}', headers: {} })],
    ['a JSON null', (status) => ({ status, body: 'null' })],
    ['a JSON error with no type and no message', (status) => ({ status, body: { error: {} } })],
    ['an HTML body', (status) => ({ status, body: '<html><body>Bad gateway</body></html>', headers: { 'content-type': 'text/html' } })],
  ];

  const cases = STATUS_CLASS.flatMap(([status, cls, retry]) => VARIANTS.map(([v, make]) => ({ status, cls, retry, v, make })));

  it.each(cases)('$status with $v: classified $cls, no retry-after assumed, no raw text', ({ status, cls, retry, make }) => {
    const res = makeSyncResponse(make(status));
    const result = classifyClaudeResponse('creation_race', res as any, { needles: [FAKE_KEY] });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.class).toBe(cls);
    expect(result.retryable).toBe(retry);
    expect(result.retryAfterSeconds).toBeUndefined();
    expect(typeof result.message).toBe('string');
    expect(result.message.length).toBeGreaterThan(0);
  });

  describe.each(cases)('through the executor: $status with $v', ({ status, cls, make }) => {
    it.each(LOCK_ROUTES)('$route: in-voice line, lock released, refunded, no raw error', (r) => {
      const { proc, jobId, reserved } = lockJob(r, [make(status)]);
      expect(run(proc, jobId)).toBe('failed');
      expect(jobOf(proc, jobId).errorCode).toBe(cls);
      expect(stepOf(proc, r)).toBe(r.after);
      expectLines(playerLines(), [{ channel: 'creation', kind: r.kind, text: r.line(false) }]);
      expectPlayerSafe(playerTexts(proc));
      expectMoney(proc, jobId, reserved, {});
      expect(proc.http.calls).toHaveLength(1);
      expect(rows(proc, 'llm_dispatch')).toHaveLength(0);
    });
  });

  it('a 429 with no body and no retry-after on a retrying route uses the default 2 s backoff, not a guessed wait', () => {
    const proc = makeProc([{ status: 429 }]);
    const jobId = OTHER_ROUTES[0].enqueue(proc);
    expect(run(proc, jobId)).toBe('retry');
    const delay = jobOf(proc, jobId).nextAttemptAt.microsSinceUnixEpoch - T0;
    expect(delay).toBe(msToMicros(retryDelayMs(1, undefined, jobId)));
    expect(delay).toBeGreaterThanOrEqual(2_000_000n);
    expect(delay).toBeLessThan(2_400_000n);
  });

  it.each(['abc', '', 'Wed, 21 Oct 2026 07:28:00 GMT', '-5', '1e3'])('a retry-after of %j is treated as absent (default backoff)', (value) => {
    const r = reply('err_429_retry_after');
    r.headers = { ...r.headers, 'retry-after': value };
    const proc = makeProc([r]);
    const jobId = OTHER_ROUTES[0].enqueue(proc);
    expect(run(proc, jobId)).toBe('retry');
    const delay = jobOf(proc, jobId).nextAttemptAt.microsSinceUnixEpoch - T0;
    expect(delay).toBe(msToMicros(retryDelayMs(1, undefined, jobId)));
  });

  describe('a 200 with an empty or unusable body never completes the job', () => {
    // The third figure is what the player is charged: the real cost of the usage the reply reported
    // (a billed failure), or nothing when the reply reported no usage (the ledger keeps the reservation).
    const cost = (input: number, output: number): bigint =>
      BigInt(estimateCostMicroUsd({ input, output, cacheWrite: 0, cacheRead: 0 }));
    const OK_EMPTIES: Array<[string, MockReply, bigint]> = [
      ['no body', { status: 200 }, 0n],
      ['an empty string body', { status: 200, body: '' }, 0n],
      ['an empty JSON object', { status: 200, body: '{}' }, 0n],
      ['no content blocks', { status: 200, body: { stop_reason: 'end_turn', content: [], usage: { input_tokens: 3, output_tokens: 0 } } }, cost(3, 0)],
      [
        'a whitespace text block',
        { status: 200, body: { stop_reason: 'end_turn', content: [{ type: 'text', text: '   ' }], usage: { input_tokens: 3, output_tokens: 1 } } },
        cost(3, 1),
      ],
    ];

    it.each(OK_EMPTIES)('%s: failed, lock released, one in-voice line, never completed', (_label, res, playerCharge) => {
      for (const r of LOCK_ROUTES) {
        resetLines();
        const { proc, jobId, reserved } = lockJob(r, [res]);
        const outcome = run(proc, jobId);
        expect(outcome).not.toBe('completed');
        expect(outcome).toBe('failed');
        expect(jobOf(proc, jobId).status).toBe('failed');
        expect(stepOf(proc, r)).toBe(r.after);
        expectLines(playerLines(), [{ channel: 'creation', kind: r.kind, text: r.line(false) }]);
        expectPlayerSafe(playerTexts(proc));
        expect(jobOf(proc, jobId).reservedMicroUsd).toBe(0n);
        expect(dayOf(proc).reservedMicroUsd).toBe(0n);
        expect(ledger(proc).reservedMicroUsd).toBe(0n);
        expect(reserved).toBeGreaterThan(0n);
        // The player pays only the real cost of the usage the reply reported, never the reservation.
        expect(dayOf(proc).spentMicroUsd).toBe(playerCharge);
        expect(playerCharge <= reserved).toBe(true);
      }
    });

    it('on a retrying route an empty-body 200 retries instead of completing', () => {
      const proc = makeProc([{ status: 200 }]);
      const jobId = OTHER_ROUTES[0].enqueue(proc);
      expect(run(proc, jobId)).toBe('retry');
      expect(jobOf(proc, jobId).status).toBe('pending');
    });
  });

  it('a thrown error with an empty message is a transport failure: in-voice line, lock released, ledger holds the reservation', () => {
    for (const r of LOCK_ROUTES) {
      const { proc, jobId, reserved } = lockJob(r, [{ throw: new Error('') }]);
      expect(run(proc, jobId)).toBe('failed');
      expect(jobOf(proc, jobId).errorCode).toBe('network');
      expect(stepOf(proc, r)).toBe(r.after);
      expectLines(playerLines(), [{ channel: 'creation', kind: r.kind, text: r.line(false) }]);
      expectPlayerSafe(playerTexts(proc));
      expectMoney(proc, jobId, reserved, { unknownBilling: true });
      resetLines();
    }
  });
});

// ----------------------------------------------------------------------------
// Edge family: ordering (several jobs failing in one pass)
// ----------------------------------------------------------------------------

describe('ordering: jobs failing in the same sweep or claim pass, in any order', () => {
  const race = LOCK_ROUTES[0];
  const hexOf = (v: any): string => v.toHexString();

  const replacer = (_k: string, v: any): any =>
    typeof v === 'bigint' ? `${v}n` : v && typeof v.toHexString === 'function' ? v.toHexString() : v;

  /** The end state of the whole database, with auto-increment ids dropped and every table sorted. */
  function endState(proc: Proc): string {
    const strip = (t: string, keys: string[]) =>
      rows(proc, t)
        .map((r) => {
          const copy = { ...r };
          for (const k of keys) delete copy[k];
          return JSON.stringify(copy, replacer);
        })
        .sort();
    return JSON.stringify({
      llm_job: strip('llm_job', ['id']),
      llm_player_budget: strip('llm_player_budget', ['id']),
      llm_spend: strip('llm_spend', []),
      llm_dispatch: strip('llm_dispatch', ['scheduledId', 'jobId']),
      character_creation_state: strip('character_creation_state', ['id']),
      lines: sortedJson(playerLines()),
    });
  }

  const threeStates = (): Record<string, any[]> => ({
    character_creation_state: PLAYERS.map((p, i) => creationState('GENERATING_RACE', p, BigInt(i + 1))),
  });

  /** Enqueue one creation_race job per player, in the given order; each is its player's own state. */
  function scene(order: number[]): { proc: Proc; jobIds: bigint[]; reserved: bigint } {
    const proc = makeProc([], threeStates());
    const jobIds: bigint[] = [];
    for (const i of order) {
      jobIds[i] = enqueue(proc, 'creation_race', {
        playerId: PLAYERS[i],
        characterId: BigInt(i + 1),
        sourceKey: SOURCE_KEYS.creation(BigInt(i + 1), 'race'),
        request: { creationStateId: String(i + 1), input: inputOf('creation_race') },
      });
    }
    return { proc, jobIds, reserved: jobOf(proc, jobIds[0]).reservedMicroUsd };
  }

  const expectOneLineEach = (proc: Proc) => {
    const lines = playerLines();
    expect(lines).toHaveLength(3);
    for (const p of PLAYERS) {
      const mine = lines.filter((l) => l.to === hexOf(p));
      expect(mine).toHaveLength(1);
      expect(mine[0].channel).toBe('creation');
    }
    expectPlayerSafe(playerTexts(proc));
  };

  const ORDERS = [
    [0, 1, 2],
    [2, 0, 1],
    [1, 2, 0],
  ];

  describe('one sweep', () => {
    const sweepScene = (order: number[]) => {
      const s = scene(order);
      // Claim each job (no call): the call is then lost, as in a publish or crash mid-call.
      for (const i of order) claimLlmJob(s.proc.ctx, takeDispatch(s.proc, s.jobIds[i]), realDeps(s.proc));
      resetLines();
      s.proc.clock.advance(BigInt(LLM_ROUTES.creation_race.timeoutMs) * 1000n + LLM_SWEEP_IN_FLIGHT_GRACE_MICROS + 1n);
      const report = s.proc.ctx.withTx((tx: any) => sweepLlmJobs(tx, { applyFailure: applyLlmFailure, log: () => {} }));
      return { ...s, report };
    };

    it('each expires once, refunds once and posts one line to its own player', () => {
      const { proc, jobIds, reserved, report } = sweepScene([0, 1, 2]);
      expect(report.expiredInFlight).toBe(3);
      expect(report.errors).toBe(0);
      expectOneLineEach(proc);
      for (const i of [0, 1, 2]) {
        expect(jobOf(proc, jobIds[i]).status).toBe('expired');
        expect(dayOf(proc, PLAYERS[i]).reservedMicroUsd).toBe(0n);
        expect(dayOf(proc, PLAYERS[i]).calls).toBe(0n);
        expect(dayOf(proc, PLAYERS[i]).spentMicroUsd).toBe(0n);
        expect(rows(proc, 'character_creation_state').find((s: any) => s.id === BigInt(i + 1)).step).toBe('AWAITING_RACE');
      }
      expect(ledger(proc).reservedMicroUsd).toBe(0n);
      expect(ledger(proc).calls).toBe(0n);
      expect(ledger(proc).spentMicroUsd).toBe(3n * reserved);
    });

    it('the same three jobs enqueued in three different orders end in the same normalised state', () => {
      const states = ORDERS.map((o) => {
        resetLines();
        return endState(sweepScene(o).proc);
      });
      expect(states[1]).toBe(states[0]);
      expect(states[2]).toBe(states[0]);
    });

    it('a second sweep over the finished set changes nothing', () => {
      const { proc } = sweepScene([0, 1, 2]);
      const before = endState(proc);
      proc.ctx.withTx((tx: any) => sweepLlmJobs(tx, { applyFailure: applyLlmFailure, log: () => {} }));
      expect(endState(proc)).toBe(before);
      expect(playerLines()).toHaveLength(3);
    });
  });

  describe('one claim pass under a halted switch', () => {
    const claimScene = (order: number[]) => {
      const s = scene(order);
      s.proc.ctx.withTx((tx: any) => setLlmEnabled(tx, false));
      resetLines();
      for (const i of order) runLlmJob(s.proc.ctx, takeDispatch(s.proc, s.jobIds[i]), realDeps(s.proc));
      return s;
    };

    it('each fails once, refunds once and posts the resting line to its own player', () => {
      const { proc, jobIds } = claimScene([0, 1, 2]);
      expectOneLineEach(proc);
      for (const l of playerLines()) expect(l.text).toBe(LLM_RESTING_LINE);
      for (const i of [0, 1, 2]) {
        expect(jobOf(proc, jobIds[i]).errorCode).toBe('halted');
        expect(dayOf(proc, PLAYERS[i]).calls).toBe(0n);
        expect(dayOf(proc, PLAYERS[i]).reservedMicroUsd).toBe(0n);
      }
      expect(ledger(proc).reservedMicroUsd).toBe(0n);
      expect(ledger(proc).calls).toBe(0n);
      expect(proc.http.calls).toHaveLength(0);
    });

    it('processed in three different orders, the same end state', () => {
      const states = ORDERS.map((o) => {
        const s = claimScene(o);
        return endState(s.proc);
      });
      expect(states[1]).toBe(states[0]);
      expect(states[2]).toBe(states[0]);
    });
  });

  describe('one claim pass with headroom for two of the three', () => {
    it.each([
      [[0, 1, 2], 2],
      [[2, 1, 0], 0],
    ])('order %j: exactly one job is refused (player %i), refunded once, with one line to that player', (order, loser) => {
      const proc = makeProc([], { ...threeStates(), ...ledgerSeed() });
      const jobIds: bigint[] = [];
      for (const i of order) {
        jobIds[i] = enqueue(proc, 'creation_race', {
          playerId: PLAYERS[i],
          characterId: BigInt(i + 1),
          sourceKey: SOURCE_KEYS.creation(BigInt(i + 1), 'race'),
          request: { creationStateId: String(i + 1), input: inputOf('creation_race') },
        });
      }
      const r: bigint = jobOf(proc, jobIds[0]).reservedMicroUsd;
      expect(jobOf(proc, jobIds[1]).reservedMicroUsd).toBe(r);
      expect(jobOf(proc, jobIds[2]).reservedMicroUsd).toBe(r);
      proc.ctx.withTx((tx: any) => patchAdminState(tx, { dailyCeilingMicroUsd: SPENT + 2n * r }));
      resetLines();

      const outcomes: Record<number, string> = {};
      for (const i of order) outcomes[i] = claimLlmJob(proc.ctx, takeDispatch(proc, jobIds[i]), realDeps(proc)).kind;

      expect(Object.values(outcomes).filter((k) => k === 'failed')).toHaveLength(1);
      expect(outcomes[loser]).toBe('failed');
      expect(jobOf(proc, jobIds[loser]).errorCode).toBe('ceiling');
      const lines = playerLines();
      expect(lines).toHaveLength(1);
      expect(lines[0].to).toBe(hexOf(PLAYERS[loser]));
      expect(lines[0].text).toBe(LLM_RESTING_LINE);
      // The loser is refunded once; the two admitted jobs still hold exactly their own reservations.
      expect(dayOf(proc, PLAYERS[loser]).reservedMicroUsd).toBe(0n);
      expect(dayOf(proc, PLAYERS[loser]).calls).toBe(0n);
      expect(ledger(proc).reservedMicroUsd).toBe(2n * r);
      expect(ledger(proc).calls).toBe(2n);
    });
  });
});

// ----------------------------------------------------------------------------
// Edge family: precision (exact bigint micro-USD)
// ----------------------------------------------------------------------------

describe('precision: exact integer micro-USD, no float rounding', () => {
  /** 2^53 + 1: the first integer a float cannot hold. */
  const BEYOND_FLOAT = 9_007_199_254_740_993n;

  it('the sample figure really is one a float round-trip would change', () => {
    expect(BigInt(Number(BEYOND_FLOAT))).not.toBe(BEYOND_FLOAT);
  });

  it('a timeout charge and a refund on top of an all-time figure beyond float range stay exact', () => {
    const r = LOCK_ROUTES[0];
    const probe = lockJob(r);
    const { proc, jobId, reserved } = lockJob(r, [{ throw: 'timeout' }], {
      llm_spend: [
        {
          id: 1n,
          spentMicroUsd: BEYOND_FLOAT,
          reservedMicroUsd: 0n,
          calls: 0n,
          updatedAt: ts(T0),
          dayUtc: utcDay(ts(T0)),
          daySpentMicroUsd: 0n,
        },
      ],
    });
    expect(reserved).toBe(probe.reserved);
    run(proc, jobId);
    expect(typeof ledger(proc).spentMicroUsd).toBe('bigint');
    expect(ledger(proc).spentMicroUsd).toBe(BEYOND_FLOAT + reserved);
    expect(ledger(proc).reservedMicroUsd).toBe(0n);
    expect(dayOf(proc).reservedMicroUsd).toBe(0n);
  });

  it('a billed failure on top of an all-time figure beyond float range adds the exact real cost', () => {
    const r = LOCK_ROUTES[0];
    const { proc, jobId } = lockJob(r, [reply('refusal')], {
      llm_spend: [
        {
          id: 1n,
          spentMicroUsd: BEYOND_FLOAT,
          reservedMicroUsd: 0n,
          calls: 0n,
          updatedAt: ts(T0),
          dayUtc: utcDay(ts(T0)),
          daySpentMicroUsd: 0n,
        },
      ],
    });
    run(proc, jobId);
    expect(ledger(proc).spentMicroUsd).toBe(BEYOND_FLOAT + FIXTURE_COST);
    expect(dayOf(proc).spentMicroUsd).toBe(FIXTURE_COST);
  });

  it('three non-round reservations are held, then refunded one at a time, back to exactly zero', () => {
    const proc = makeProc([], threeStatesForPrecision());
    const ids: bigint[] = [];
    const held: bigint[] = [];
    for (let i = 0; i < 3; i++) {
      ids.push(
        enqueue(proc, 'creation_race', {
          playerId: PLAYERS[i],
          characterId: BigInt(i + 1),
          sourceKey: SOURCE_KEYS.creation(BigInt(i + 1), 'race'),
          // Different text lengths give different, non-round reservations.
          request: { creationStateId: String(i + 1), input: { raceDescription: 'x'.repeat(7 + i * 131) } },
        }),
      );
      held.push(jobOf(proc, ids[i]).reservedMicroUsd);
    }
    expect(new Set(held.map(String)).size).toBeGreaterThan(1);
    expect(held.some((h) => h % 1000n !== 0n)).toBe(true);
    let remaining = held[0] + held[1] + held[2];
    expect(ledger(proc).reservedMicroUsd).toBe(remaining);

    proc.ctx.withTx((tx: any) => setLlmEnabled(tx, false));
    for (let i = 0; i < 3; i++) {
      run(proc, ids[i]);
      remaining -= held[i];
      expect(typeof ledger(proc).reservedMicroUsd).toBe('bigint');
      expect(ledger(proc).reservedMicroUsd).toBe(remaining);
    }
    expect(remaining).toBe(0n);
    expect(ledger(proc).spentMicroUsd).toBe(0n);
    expect(ledger(proc).calls).toBe(0n);
  });

  it.each(CLASSES)('$name on every lock route: reserved equals charged plus released, all columns bigint', (cls) => {
    for (const r of LOCK_ROUTES) {
      const { proc, jobId, reserved } = lockJob(r, cls.script());
      run(proc, jobId);
      expectMoney(proc, jobId, reserved, cls);
      for (const row of callLogs(proc, jobId)) {
        expect(typeof row.costMicroUsd).toBe('bigint');
        expect(typeof row.inputTokens).toBe('bigint');
        expect(typeof row.outputTokens).toBe('bigint');
      }
      resetLines();
    }
  });

  it('at least one drilled reservation has a non-round remainder', () => {
    const r = LOCK_ROUTES[0];
    const { reserved } = lockJob(r);
    expect(reserved % 10n !== 0n || reserved % 100n !== 0n || reserved % 1000n !== 0n).toBe(true);
  });

  it('the real cost of the fixtures is a whole number of micro-USD (ceiling already applied)', () => {
    expect(Number.isInteger(Number(FIXTURE_COST))).toBe(true);
    expect(FIXTURE_COST > 0n).toBe(true);
  });
});

function threeStatesForPrecision(): Record<string, any[]> {
  return { character_creation_state: PLAYERS.map((p, i) => creationState('GENERATING_RACE', p, BigInt(i + 1))) };
}

// ----------------------------------------------------------------------------
// Phase 46 (SEG-02, SEG-04): failure lines are one Keeper narration segment
// ----------------------------------------------------------------------------

describe('Phase 46: failure lines carry one Keeper narration segment', () => {
  const KEEPER_NARRATION = (text: string) => ({ kind: 'narration', speaker: 'The Keeper', text });
  const classFillingState = () => ({
    ...creationState('CLASS_FILLING'),
    className: 'Emberblade',
    classDescription: 'A duelist who fights like a grudge.',
    abilities: '[]',
  });
  const placedChar = (locationId: bigint) => [{ ...characterRow(1n, 7n, 'Aldric'), locationId }];
  const GEN_CTX = JSON.stringify({ genStateId: '5' });
  const CHAR_CTX = JSON.stringify({ characterId: '1' });

  type Drill = {
    domain: string;
    seed: () => Record<string, any[]>;
    contextJson?: string;
    /** Lines expected as Keeper narration segments (kind of the recorded line). */
    keeperKinds: string[];
    /** Lines expected as plain system lines with no segments. */
    systemKinds?: string[];
  };

  const DRILLS: Drill[] = [
    { domain: 'creation_race', seed: () => ({ character_creation_state: [creationState('GENERATING_RACE')] }), keeperKinds: ['creation_error'] },
    { domain: 'creation_class_reveal', seed: () => ({ character_creation_state: [creationState('GENERATING_CLASS')] }), keeperKinds: ['creation_error'] },
    { domain: 'creation_class', seed: () => ({ character_creation_state: [classFillingState()] }), keeperKinds: ['creation_error'] },
    {
      domain: 'world_gen_start (unplaced character)',
      seed: () => ({ world_gen_state: [worldState('GENERATING')], character: placedChar(0n) }),
      contextJson: GEN_CTX,
      keeperKinds: ['creation_error'],
    },
    {
      domain: 'world_gen_start (placed character)',
      seed: () => ({ world_gen_state: [worldState('GENERATING')], character: placedChar(100n) }),
      contextJson: GEN_CTX,
      keeperKinds: [],
      systemKinds: ['system'],
    },
    {
      domain: 'world_gen (character row gone)',
      seed: () => ({ world_gen_state: [worldState('FILLING', { characterId: 99n })] }),
      contextJson: GEN_CTX,
      keeperKinds: ['creation_error'],
    },
    {
      domain: 'world_gen (placed character)',
      seed: () => ({ world_gen_state: [worldState('FILLING')], character: placedChar(100n) }),
      contextJson: GEN_CTX,
      keeperKinds: [],
      systemKinds: ['system'],
    },
    { domain: 'skill_gen', seed: () => ({}), contextJson: CHAR_CTX, keeperKinds: ['narrative'] },
    { domain: 'renown_perk_gen', seed: () => ({}), contextJson: JSON.stringify({ characterId: '1', rank: '2' }), keeperKinds: ['narrative'] },
    {
      domain: 'npc_conversation',
      seed: () => ({}),
      contextJson: JSON.stringify({ characterId: '1', npcId: '1', memoryId: '1' }),
      keeperKinds: ['npc'],
    },
  ];

  const CODES: Array<[label: string, code: string | undefined]> = [
    ['a generic error code', 'timeout'],
    ['a resting code', 'halted'],
  ];

  const lineKinds = (lines: Line[]) => lines.filter((l) => l.channel !== 'npc_dialog');

  describe.each(DRILLS)('$domain', (d) => {
    it.each(CODES)('%s: every Keeper-voice line is exactly one narration segment equal to its text, system lines carry none', (_label, code) => {
      resetLines();
      const ctx: any = createMockCtx({ seed: seedTables(d.seed()), sender: alice, timestampMicros: T0, strict: true });
      const route = d.domain.split(' ')[0];
      const job = { domain: route, playerId: alice, contextJson: d.contextJson, errorCode: code };
      expect(() => applyLlmFailure(ctx, job)).not.toThrow();

      const lines = lineKinds(playerLines());
      expect(lines.length).toBeGreaterThan(0);
      for (const l of lines) {
        if (l.kind === 'system') {
          expect(l.segments, `system line must carry no segments: ${l.text}`).toBeUndefined();
        } else {
          expect(['creation_error', 'narrative', 'npc']).toContain(l.kind);
          expect(l.segments, `Keeper line must carry one segment: ${l.text}`).toEqual([KEEPER_NARRATION(l.text)]);
        }
      }
      // npc_conversation with a resting code posts a system line, not an NPC line
      const keeperLines = lines.filter((l) => l.kind !== 'system');
      const systemLines = lines.filter((l) => l.kind === 'system');
      if (d.domain === 'npc_conversation' && code === 'halted') {
        expect(keeperLines).toHaveLength(0);
        expect(systemLines).toHaveLength(1);
      } else {
        expect(keeperLines.map((l) => l.kind)).toEqual(d.keeperKinds);
      }
    });
  });

  it('combat_narration stays silent on failure: no lines at all', () => {
    for (const code of ['timeout', 'halted']) {
      resetLines();
      const ctx: any = createMockCtx({ seed: seedTables(), sender: alice, timestampMicros: T0, strict: true });
      const job = {
        domain: 'combat_narration',
        playerId: alice,
        contextJson: JSON.stringify({ combatId: '1', roundNumber: '0', narrativeType: 'victory', participantCharacterIds: ['1'] }),
        errorCode: code,
      };
      expect(() => applyLlmFailure(ctx, job)).not.toThrow();
      expect(playerLines()).toEqual([]);
      expect(rowsOf(ctx, 'combat_narrative')).toHaveLength(0);
    }
  });

  const rowsOf = (ctx: any, table: string): any[] => ctx.db._tables[table] ?? [];
});
