/**
 * Reference-driver seam test (Phase 40, Plan 09).
 *
 * Proves the whole request layer offline through createMockProcCtx: read the job and key in one
 * transaction, build the request, call the scripted ctx.http.fetch with NO transaction open,
 * classify, persist the outcome in a second transaction, and apply the result in a third
 * transaction through applyLlmResult. `runJobOnce` is TEST-ONLY: Phase 41 promotes it into the
 * real executor procedure. It must never be imported from production code.
 *
 * No network. The API key is a fake built from fragments.
 */
import { describe, it, expect, vi } from 'vitest';
// @ts-ignore node types are not part of this module's tsconfig (same as other source-reading tests)
import { readFileSync } from 'node:fs';
// @ts-ignore see above
import { fileURLToPath } from 'node:url';
// @ts-ignore see above
import { join } from 'node:path';
import { TimeDuration } from 'spacetimedb';
import { createMockProcCtx, type MockReply, type MockThrow } from './test-utils';
import { snapshotDb } from './schema_recorder';
import { findSecretLeaks } from './measurement';
import {
  buildClaudeHeaders,
  buildClaudeRequest,
  classifyClaudeError,
  classifyClaudeResponse,
  type ClaudeResult,
} from './claude_request';
import { enqueueLlmJob, logLlmCall, SOURCE_KEYS } from './llm_queue';
import { applyLlmResult, toApplyJob } from './llm_apply';
import { awardRenown } from './renown';
import { buildRouteLayers, type RouteInputMap } from '../data/llm_layers';
import { LLM_ROUTES, type LlmRoute } from '../data/llm_routes';
import { ANTHROPIC_MESSAGES_URL, CLAUDE_MODEL } from '../data/llm_models';

vi.mock('spacetimedb/server', async () =>
  (await import('./schema_recorder')).createRecordingServerMock(),
);

vi.mock('./events', () => ({
  appendSystemMessage: vi.fn(),
  appendPrivateEvent: vi.fn(),
  appendWorldEvent: vi.fn(),
}));

// ----------------------------------------------------------------------------
// Fixtures and helpers
// ----------------------------------------------------------------------------

const FIXTURE_DIR = fileURLToPath(new URL('./__fixtures__/claude/', import.meta.url));
const fixture = (name: string): any =>
  JSON.parse(readFileSync(join(FIXTURE_DIR, `${name}.json`), 'utf8'));

/** A fake key built from fragments so no key-shaped literal appears in the source. */
const FAKE_KEY = ['sk', '-ant-', 'api03-', 'SEAMTESTKEY'.repeat(4)].join('');

const T0 = 1_700_000_000_000_000n;
const alice = { toHexString: () => 'a'.repeat(64) };

const PERKS = [
  { name: 'Merchant Favor', perkDomain: 'social', perkEffectJson: '{"vendorSellBonus":5}' },
  { name: 'Whisper Network', perkDomain: 'social', perkEffectJson: '{"npcAffinityGainBonus":2}' },
  { name: 'Iron Constitution', perkDomain: 'combat', perkEffectJson: '{"maxHp":25}' },
].map((p) => ({
  name: p.name,
  description: `A plain description of ${p.name}.`,
  kind: '',
  targetRule: 'self',
  resourceType: 'none',
  resourceCost: 0,
  castSeconds: 0,
  cooldownSeconds: 0,
  scaling: 'none',
  value1: 0,
  value2: null,
  damageType: null,
  effectType: null,
  effectMagnitude: null,
  effectDuration: null,
  perkEffectJson: p.perkEffectJson,
  perkDomain: p.perkDomain,
}));

/** ok_json fixture with the text block replaced by the given text. */
function okReply(text: string): MockReply {
  const f = fixture('ok_json');
  f.body.content[0].text = text;
  return f;
}

const threePerkReply = (): MockReply => okReply(JSON.stringify({ perks: PERKS }));

const character = () => ({
  id: 1n,
  ownerUserId: 7n,
  name: 'Aldric',
  race: 'Kobold',
  className: 'Ashweaver',
});

function seedTables(over: Record<string, any[]> = {}): Record<string, any[]> {
  return {
    player: [{ id: alice, userId: 7n, activeCharacterId: 1n }],
    character: [character()],
    renown: [{ id: 1n, characterId: 1n, points: 90n, currentRank: 1n }],
    llm_config: [{ id: 1n, apiKey: FAKE_KEY, updatedAt: { microsSinceUnixEpoch: T0 } }],
    ...over,
  };
}

function makeProc(responses: Array<MockReply | MockThrow>, extra: { withTxReinvoke?: number } = {}) {
  return createMockProcCtx({ seed: seedTables(), timestampMicros: T0, responses, ...extra });
}

type Proc = ReturnType<typeof createMockProcCtx>;
const rows = (proc: Proc, table: string): any[] => proc.db._tables[table] ?? [];

/** Trigger a renown rank-up (90 + 20 points = rank 2) and return the enqueued job id. */
function enqueueRenownJob(proc: Proc): bigint {
  proc.ctx.withTx((tx: any) => awardRenown(tx, character(), 20n, 'test'));
  const jobs = rows(proc, 'llm_job');
  expect(jobs).toHaveLength(1);
  return jobs[0].id;
}

function enqueueSmokeJob(proc: Proc): bigint {
  return proc.ctx.withTx(
    (tx: any) =>
      enqueueLlmJob(tx, {
        route: 'smoke_test',
        playerId: alice,
        sourceKey: SOURCE_KEYS.smokeTest(),
        request: {},
      }).job.id,
  );
}

type BuildInput = (job: any, ctx: { characterName: string }) => RouteInputMap[LlmRoute];

const renownInput: BuildInput = (job, { characterName }) => {
  const req = JSON.parse(job.requestJson);
  return {
    characterName,
    className: req.className,
    raceName: req.raceName,
    rank: req.rank,
    existingPerks: req.existingPerks,
  } as RouteInputMap['renown_perk_gen'];
};

const smokeInput: BuildInput = () => ({}) as RouteInputMap['smoke_test'];

/**
 * TEST-ONLY reference driver. tx1 read, fetch with no transaction open, tx2 persist, tx3 apply.
 * Phase 41 promotes this into the real executor procedure.
 */
function runJobOnce(proc: Proc, jobId: bigint, buildInput: BuildInput): ClaudeResult {
  const ctx = proc.ctx;

  // tx1: read the job and the key, mark in_flight. Returns plain values, never a Promise.
  const read = ctx.withTx((tx: any) => {
    const job = tx.db.llm_job.id.find(jobId);
    if (!job) throw new Error(`job ${jobId} not found`);
    const cfg = tx.db.llm_config.id.find(1n);
    if (!cfg) throw new Error('llm_config not set');
    const attempt = job.attempt + 1n;
    const startedAt = tx.timestamp;
    tx.db.llm_job.id.update({ ...job, status: 'in_flight', attempt, startedAt });
    const character = job.characterId !== 0n ? tx.db.character.id.find(job.characterId) : undefined;
    return {
      job: { ...job, attempt },
      apiKey: cfg.apiKey as string,
      characterName: (character?.name as string | undefined) ?? '',
    };
  });

  // No transaction is open from here until tx2.
  const route = read.job.route as LlmRoute;
  const layers = buildRouteLayers(route, buildInput(read.job, { characterName: read.characterName }) as any);
  const request = buildClaudeRequest(route, layers);
  const headers = buildClaudeHeaders(read.apiKey);

  const startedMicros = proc.clock.now();
  let result: ClaudeResult;
  let httpStatus = 0;
  try {
    const res = ctx.http.fetch(ANTHROPIC_MESSAGES_URL, {
      method: 'POST',
      headers,
      body: request.bodyText,
      timeout: TimeDuration.fromMillis(request.timeoutMs),
    });
    httpStatus = res.status;
    result = classifyClaudeResponse(route, res);
  } catch (err) {
    result = classifyClaudeError(err);
  }
  const latencyMs = Number((proc.clock.now() - startedMicros) / 1000n);

  // tx2: persist the outcome onto the job and append the call log row.
  const usage = result.usage;
  ctx.withTx((tx: any) => {
    const job = tx.db.llm_job.id.find(jobId);
    const counters = {
      inputTokens: BigInt(usage?.input ?? 0),
      outputTokens: BigInt(usage?.output ?? 0),
      cacheWriteTokens: BigInt(usage?.cacheWrite ?? 0),
      cacheReadTokens: BigInt(usage?.cacheRead ?? 0),
    };
    if (result.ok) {
      tx.db.llm_job.id.update({
        ...job,
        ...counters,
        status: 'received',
        resultText: result.text,
        stopReason: result.stopReason,
        requestId: result.requestId,
        errorCode: undefined,
      });
    } else {
      tx.db.llm_job.id.update({
        ...job,
        ...counters,
        status: result.retryable ? 'pending' : 'failed',
        stopReason: result.stopReason,
        requestId: result.requestId,
        errorCode: result.class,
        finishedAt: result.retryable ? undefined : tx.timestamp,
      });
    }
    logLlmCall(tx, {
      jobId,
      playerId: job.playerId,
      route,
      attempt: read.job.attempt,
      httpStatus,
      outcome: result.ok ? 'ok' : result.class,
      stopReason: result.stopReason,
      requestId: result.requestId,
      errorMessage: result.ok ? undefined : result.message,
      latencyMs,
      usage,
    });
  });

  // tx3: apply (ok only), then complete.
  if (result.ok) {
    const text = result.text;
    ctx.withTx((tx: any) => {
      const job = tx.db.llm_job.id.find(jobId);
      applyLlmResult(tx, toApplyJob(job), text);
      tx.db.llm_job.id.update({ ...job, status: 'completed', finishedAt: tx.timestamp });
    });
  }
  return result;
}

/** Every table's rows except the llm_config table that legitimately holds the key. */
function snapshotWithoutConfig(proc: Proc): string {
  const all = JSON.parse(snapshotDb(proc.db));
  delete all.llm_config;
  return JSON.stringify(all);
}

function expectNoSecretLeak(proc: Proc): void {
  // Sanity: the key really is stored in llm_config, so the needle scan is meaningful.
  expect(rows(proc, 'llm_config')[0].apiKey).toBe(FAKE_KEY);
  const leaks = findSecretLeaks(snapshotWithoutConfig(proc), { strictPrefix: true, needles: [FAKE_KEY] });
  expect(leaks.total).toBe(0);
}

const gameTablesSnapshot = (proc: Proc): string => {
  const all = JSON.parse(snapshotDb(proc.db));
  delete all.llm_config;
  delete all.llm_job;
  delete all.llm_call_log;
  return JSON.stringify(all);
};

// ----------------------------------------------------------------------------
// Scenarios
// ----------------------------------------------------------------------------

describe('reference driver: renown rank-up end to end (offline)', () => {
  it('runs a renown job to completion: three perks, a completed job, one call log row with usage', async () => {
    await import('../schema/tables');
    const proc = makeProc([threePerkReply()]);
    const jobId = enqueueRenownJob(proc);
    expect(rows(proc, 'llm_job')[0].status).toBe('pending');

    const result = runJobOnce(proc, jobId, renownInput);
    expect(result.ok).toBe(true);

    const job = rows(proc, 'llm_job')[0];
    expect(job.status).toBe('completed');
    expect(job.attempt).toBe(1n);
    expect(job.errorCode).toBeUndefined();
    expect(job.stopReason).toBe('end_turn');
    expect(job.requestId).toBe('req_011CTestOkFixture');
    expect(typeof job.resultText).toBe('string');
    expect(JSON.parse(job.resultText).perks).toHaveLength(3);
    expect(job.inputTokens).toBe(116n);
    expect(job.outputTokens).toBe(562n);
    expect(job.cacheWriteTokens).toBe(0n);
    expect(job.cacheReadTokens).toBe(3727n);
    expect(job.startedAt).toBeDefined();
    expect(job.finishedAt).toBeDefined();

    const perks = rows(proc, 'pending_renown_perk');
    expect(perks).toHaveLength(3);
    expect(perks.every((p) => p.characterId === 1n && p.rank === 2n)).toBe(true);
    expect(perks.map((p) => p.name).sort()).toEqual(PERKS.map((p) => p.name).sort());

    const logs = rows(proc, 'llm_call_log');
    expect(logs).toHaveLength(1);
    expect(logs[0].jobId).toBe(jobId);
    expect(logs[0].outcome).toBe('ok');
    expect(logs[0].httpStatus).toBe(200n);
    expect(logs[0].model).toBe(CLAUDE_MODEL);
    expect(logs[0].inputTokens).toBe(116n);
    expect(logs[0].outputTokens).toBe(562n);
    expect(logs[0].cacheReadTokens).toBe(3727n);

    expect(proc.http.calls).toHaveLength(1);
    expectNoSecretLeak(proc);
  });

  it('acts for the requester, not the module-identity caller (T-40-04)', async () => {
    await import('../schema/tables');
    const proc = makeProc([threePerkReply()]);
    // The procedure's own sender is the module identity, never alice.
    expect(proc.ctx.sender).not.toBe(alice);
    const jobId = enqueueRenownJob(proc);
    runJobOnce(proc, jobId, renownInput);

    expect(rows(proc, 'pending_renown_perk').every((p) => p.characterId === 1n)).toBe(true);
    const budgets = rows(proc, 'llm_budget');
    expect(budgets).toHaveLength(1);
    expect(budgets[0].playerId).toBe(alice);
    expect(rows(proc, 'llm_call_log')[0].playerId).toBe(alice);
  });

  it('records a POST to the Messages URL with the key header, the route timeout and the model', async () => {
    await import('../schema/tables');
    const proc = makeProc([threePerkReply()]);
    runJobOnce(proc, enqueueRenownJob(proc), renownInput);

    const call = proc.http.calls[0];
    expect(call.url).toBe(ANTHROPIC_MESSAGES_URL);
    expect(call.method).toBe('POST');
    expect(call.headers['x-api-key']).toBe(FAKE_KEY);
    expect(call.timeoutMs).toBe(LLM_ROUTES.renown_perk_gen.timeoutMs);
    expect(JSON.parse(call.body as string).model).toBe(CLAUDE_MODEL);
  });

  it('the key never appears in the request body', async () => {
    await import('../schema/tables');
    const proc = makeProc([threePerkReply()]);
    runJobOnce(proc, enqueueRenownJob(proc), renownInput);
    expect(proc.http.calls[0].body as string).not.toContain(FAKE_KEY);
  });

  it('withTxReinvoke: 1 gives the same end state (three perks, not six) and one fetch', async () => {
    await import('../schema/tables');
    const proc = makeProc([threePerkReply()], { withTxReinvoke: 1 });
    const jobId = enqueueRenownJob(proc);

    const result = runJobOnce(proc, jobId, renownInput);
    expect(result.ok).toBe(true);

    expect(proc.http.calls).toHaveLength(1);
    expect(rows(proc, 'pending_renown_perk')).toHaveLength(3);
    expect(rows(proc, 'llm_call_log')).toHaveLength(1);
    expect(rows(proc, 'llm_budget')).toHaveLength(1);
    expect(rows(proc, 'llm_budget')[0].callCount).toBe(1n);
    const jobs = rows(proc, 'llm_job');
    expect(jobs).toHaveLength(1);
    expect(jobs[0].status).toBe('completed');
    expect(jobs[0].attempt).toBe(1n);
    expectNoSecretLeak(proc);
  });

  it('the end state with a re-invoked transaction equals the end state without one', async () => {
    await import('../schema/tables');
    const a = makeProc([threePerkReply()]);
    runJobOnce(a, enqueueRenownJob(a), renownInput);
    const b = makeProc([threePerkReply()], { withTxReinvoke: 1 });
    runJobOnce(b, enqueueRenownJob(b), renownInput);
    // Auto-increment ids are not restored on a re-invoked transaction (gaps are normal), so
    // compare everything else.
    const normalize = (proc: Proc): string =>
      snapshotDb(proc.db).replace(/"(id|jobId)":"\d+n"/g, '"$1":"N"');
    expect(normalize(b)).toBe(normalize(a));
  });
});

describe('reference driver: failure classes (offline)', () => {
  it('a timeout leaves the job pending with errorCode timeout and applies nothing', async () => {
    await import('../schema/tables');
    const proc = makeProc([{ throw: 'timeout' }]);
    const jobId = enqueueRenownJob(proc);
    const result = runJobOnce(proc, jobId, renownInput);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.class).toBe('timeout');
      expect(result.retryable).toBe(true);
    }
    const job = rows(proc, 'llm_job')[0];
    expect(job.status).toBe('pending');
    expect(job.errorCode).toBe('timeout');
    expect(job.attempt).toBe(1n);
    expect(job.finishedAt).toBeUndefined();
    expect(rows(proc, 'pending_renown_perk')).toHaveLength(0);
    expect(rows(proc, 'llm_budget')).toHaveLength(0);
    const logs = rows(proc, 'llm_call_log');
    expect(logs).toHaveLength(1);
    expect(logs[0].outcome).toBe('timeout');
    expect(logs[0].inputTokens).toBe(0n);
    expectNoSecretLeak(proc);
  });

  it('a 429 with retry-after 7 leaves the job pending with rate_limit and retryAfterSeconds 7', async () => {
    await import('../schema/tables');
    const reply = fixture('err_429_retry_after');
    reply.headers['retry-after'] = '7';
    const proc = makeProc([reply]);
    const jobId = enqueueRenownJob(proc);
    const result = runJobOnce(proc, jobId, renownInput);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.class).toBe('rate_limit');
      expect(result.retryAfterSeconds).toBe(7);
    }
    const job = rows(proc, 'llm_job')[0];
    expect(job.status).toBe('pending');
    expect(job.errorCode).toBe('rate_limit');
    expect(rows(proc, 'pending_renown_perk')).toHaveLength(0);
    expect(rows(proc, 'llm_call_log')[0].httpStatus).toBe(429n);
    expect(rows(proc, 'llm_call_log')[0].outcome).toBe('rate_limit');
    expectNoSecretLeak(proc);
  });

  it('a refusal marks the job failed with class refusal and keeps the billed usage', async () => {
    await import('../schema/tables');
    const proc = makeProc([fixture('refusal')]);
    const result = runJobOnce(proc, enqueueRenownJob(proc), renownInput);

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.class).toBe('refusal');
    const job = rows(proc, 'llm_job')[0];
    expect(job.status).toBe('failed');
    expect(job.errorCode).toBe('refusal');
    expect(job.stopReason).toBe('refusal');
    expect(job.inputTokens).toBe(116n);
    expect(job.outputTokens).toBe(562n);
    expect(job.cacheReadTokens).toBe(3727n);
    expect(job.finishedAt).toBeDefined();
    expect(rows(proc, 'pending_renown_perk')).toHaveLength(0);
    const log = rows(proc, 'llm_call_log')[0];
    expect(log.outcome).toBe('refusal');
    expect(log.outputTokens).toBe(562n);
    expectNoSecretLeak(proc);
  });

  it('a max_tokens reply marks the job failed with class truncated and keeps the billed usage', async () => {
    await import('../schema/tables');
    const proc = makeProc([fixture('max_tokens')]);
    const result = runJobOnce(proc, enqueueRenownJob(proc), renownInput);

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.class).toBe('truncated');
    const job = rows(proc, 'llm_job')[0];
    expect(job.status).toBe('failed');
    expect(job.errorCode).toBe('truncated');
    expect(job.stopReason).toBe('max_tokens');
    expect(job.inputTokens).toBe(116n);
    expect(job.outputTokens).toBe(562n);
    expect(rows(proc, 'pending_renown_perk')).toHaveLength(0);
    expect(rows(proc, 'llm_call_log')[0].outcome).toBe('truncated');
    expectNoSecretLeak(proc);
  });

  it('an auth failure (401) marks the job failed and does not leak the key', async () => {
    await import('../schema/tables');
    const proc = makeProc([fixture('err_401')]);
    const result = runJobOnce(proc, enqueueRenownJob(proc), renownInput);
    expect(result.ok).toBe(false);
    const job = rows(proc, 'llm_job')[0];
    expect(job.status).toBe('failed');
    expect(job.errorCode).toBe('auth');
    expectNoSecretLeak(proc);
  });

  it('a transport failure carrying the key in its message is redacted before it is logged', async () => {
    await import('../schema/tables');
    const proc = makeProc([{ throw: new Error(`connection reset while sending ${FAKE_KEY}`) }]);
    const result = runJobOnce(proc, enqueueRenownJob(proc), renownInput);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.class).toBe('network');
    expect(rows(proc, 'llm_job')[0].status).toBe('pending');
    expect(rows(proc, 'llm_call_log')[0].errorMessage).toContain('[REDACTED]');
    expectNoSecretLeak(proc);
  });
});

describe('reference driver: smoke_test route', () => {
  it('completes with no game-table changes', async () => {
    await import('../schema/tables');
    const proc = makeProc([fixture('ok_text')]);
    const jobId = enqueueSmokeJob(proc);
    const before = gameTablesSnapshot(proc);

    const result = runJobOnce(proc, jobId, smokeInput);
    expect(result.ok).toBe(true);

    const job = rows(proc, 'llm_job')[0];
    expect(job.status).toBe('completed');
    expect(rows(proc, 'llm_call_log')).toHaveLength(1);
    expect(gameTablesSnapshot(proc)).toBe(before);
    expect(proc.http.calls[0].timeoutMs).toBe(LLM_ROUTES.smoke_test.timeoutMs);
    expectNoSecretLeak(proc);
  });
});

describe('secret scan control', () => {
  it('the leak scan does flag the key when it is present in a row outside llm_config', async () => {
    await import('../schema/tables');
    const proc = makeProc([threePerkReply()]);
    runJobOnce(proc, enqueueRenownJob(proc), renownInput);
    expect(
      findSecretLeaks(snapshotWithoutConfig(proc), { strictPrefix: true, needles: [FAKE_KEY] }).total,
    ).toBe(0);
    rows(proc, 'llm_job')[0].resultText = `oops ${FAKE_KEY}`;
    expect(
      findSecretLeaks(snapshotWithoutConfig(proc), { strictPrefix: true, needles: [FAKE_KEY] }).total,
    ).toBeGreaterThan(0);
  });
});
