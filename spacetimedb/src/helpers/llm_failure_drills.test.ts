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
import { createMockProcCtx, makeSyncResponse, type MockReply, type MockThrow } from './test-utils';
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

type Line = { channel: 'creation' | 'private' | 'npc_dialog'; to: string; kind: string; text: string };
const calls = (fn: unknown): any[][] => (fn as any).mock.calls;

/** Every in-voice line the apply layer posted, from the events mock (the production code wrote them). */
function playerLines(): Line[] {
  return [
    ...calls(appendCreationEvent).map((c) => ({ channel: 'creation' as const, to: c[1].toHexString(), kind: c[2], text: c[3] })),
    ...calls(appendPrivateEvent).map((c) => ({ channel: 'private' as const, to: String(c[1]), kind: c[3], text: c[4] })),
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

const CREATION_FLICKER_LINE = 'The Keeper flickers. "Something went wrong in the cosmic machinery. Try again."';
const WORLD_START_FAILED_LINE = 'The Keeper falters. "The world refuses to be remembered right now."';
const EXPLORE_HINT = 'Type [explore] to try again.';
const SKILL_FAILED_LINE =
  'The Keeper flickers. "Your potential eludes crystallization. Type [skills] when you want me to try again."';
const SKILL_RESTING_SUFFIX = 'Type [skills] when you want him to try again.';
const RENOWN_FALLBACK_LINE = 'The Keeper shrugs. "The cosmos provided some... standard options for your consideration."';
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
