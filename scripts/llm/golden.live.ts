// Golden set live harness (Phase 44, Plan 44-04). Run from the repo root.
//
// GOLDEN_LIVE_RUN selects the mode. Unset means the free DRY run; any value not listed here throws before
// anything else happens.
//
//   (unset)     dry:       builds and validates all 27 production requests, prints the golden table, the request
//                          count and the worst-case reservation total. Stubs fetch so it throws, never reads
//                          the key, writes nothing. Free.
//   check-key   check-key: reads the key in-process and prints only presence, length and format. No network,
//                          no write.
//   run         run:       PAID. All 27 items, sequential, straight to the API, in golden-set order. Stops before
//                          a call that would take the spend past $1.80 (the cap is $2.00). No automatic retry,
//                          so the worst-case bound shown by the dry run is the sum of the reservations. An item
//                          that did not run is recorded as failed, never skipped. Writes the run record and the
//                          review page.
//   rerun       rerun:     PAID. Needs GOLDEN_ONLY (comma separated golden ids) and an existing recorded run.
//                          Only those items are called; their entries replace the earlier ones and every other
//                          entry is kept. A chained stage-2 item whose source is not being rerun is fed from the
//                          stored reply.
//
// ALWAYS pass the "golden" filter to the live config, because the config includes every *.live.ts file:
//
//   pnpm exec vitest run --config scripts/llm/vitest.live.config.ts golden                      # dry, free
//   GOLDEN_LIVE_RUN=check-key pnpm exec vitest run --config scripts/llm/vitest.live.config.ts golden
//   GOLDEN_LIVE_RUN=run pnpm exec vitest run --config scripts/llm/vitest.live.config.ts golden  # PAID (Plan 44-07, after approval)
//   GOLDEN_LIVE_RUN=rerun GOLDEN_ONLY=npc-02,adv-3 pnpm exec vitest run --config scripts/llm/vitest.live.config.ts golden  # PAID
//
// The request is the production request: buildRouteLayers, buildClaudeRequest, and the tuned effort, max_tokens
// and timeout from LLM_ROUTES (no sweep overrides). The reply is classified by classifyClaudeResponse exactly as
// the executor does, then judged by evaluateGoldenItem.
//
// Safety: the key comes only from loadAnthropicKey() (never the process environment) and only in the check-key
// and paid modes; every printed line goes through one say() helper that scrubs; no prompt, request body, header,
// key or token is ever printed or recorded. The record and the review page hold model output and fixture inputs
// only. Nothing here sets a tone approval: that is the owner's own overall approve.

import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

import { REPO_ROOT, keyFormatOk, loadAnthropicKey, scrub } from './cli.mjs';
import { GOLDEN_SET, goldenInputFor, renderGoldenTable } from './golden_set.mjs';
import {
  GOLDEN_CAP_MICRO_USD,
  GOLDEN_STOP_AT_MICRO_USD,
  buildGoldenItem,
  buildGoldenRecord,
  goldenRunRefusal,
  goldenShouldStop,
  mergeRerun,
  parseGoldenOnly,
  recordHygieneProblems,
  resolveGoldenMode,
  sweepCallCostMicroUsd,
} from './golden_run.mjs';
import { evaluateGoldenItem } from './golden_rules.mjs';
import { renderGoldenReview } from './golden_review.mjs';
import { buildRouteLayers } from '../../spacetimedb/src/data/llm_layers';
import {
  assertValidClaudeBody,
  buildClaudeHeaders,
  buildClaudeRequest,
  classifyClaudeError,
  classifyClaudeResponse,
} from '../../spacetimedb/src/helpers/claude_request';
import { estimateCostMicroUsd, reserveCostMicroUsd } from '../../spacetimedb/src/helpers/measurement';
import { ANTHROPIC_MESSAGES_URL, CLAUDE_MODEL } from '../../spacetimedb/src/data/llm_models';
import { LLM_ROUTES } from '../../spacetimedb/src/data/llm_routes';
import type { LlmRoute } from '../../spacetimedb/src/data/llm_routes';

// Throws on an unknown GOLDEN_LIVE_RUN value, before anything else runs.
const MODE = resolveGoldenMode(process.env.GOLDEN_LIVE_RUN);

const PHASE_DIR = path.join(REPO_ROOT, '.planning', 'phases', '44-live-verification-and-tone-eval');
const RECORD_PATH = path.join(PHASE_DIR, '44-golden-run.json');
const REVIEW_PATH = path.join(PHASE_DIR, '44-golden-review.html');
const RESEARCH_ESTIMATE = 'about $0.25 to $0.60';

type Row = Record<string, any>;

/** Key material to scrub from every printed line. Filled only in the check-key and paid modes. */
const keyNeedles: string[] = [];

/** The only output path: scrubbed, short status text. Never a prompt, reply, header or body. */
function say(line: string): void {
  console.log(scrub(line, keyNeedles));
}

const usd = (micro: bigint | number): string => '$' + (Number(micro) / 1_000_000).toFixed(4);

// ---------------------------------------------------------------------------
// Requests (shared by every mode)
// ---------------------------------------------------------------------------

/** The production request for a route and input, validated. Identical inputs give identical bodyText. */
function buildGoldenRequest(route: LlmRoute, input: unknown) {
  const request = buildClaudeRequest(route, buildRouteLayers(route, input as never));
  assertValidClaudeBody(request.body, route);
  const reservation = BigInt(reserveCostMicroUsd(LLM_ROUTES[route].maxTokens, request.bodyText.length));
  return { bodyText: request.bodyText, timeoutMs: request.timeoutMs, reservation };
}

// ---------------------------------------------------------------------------
// dry
// ---------------------------------------------------------------------------

function runDry(): void {
  // Any outbound call in dry mode is a bug: make it loud.
  const savedFetch = globalThis.fetch;
  globalThis.fetch = (() => {
    throw new Error('network is disabled in the dry run');
  }) as unknown as typeof globalThis.fetch;
  try {
    expect(() => Reflect.apply(globalThis.fetch, undefined, ['x'])).toThrow();

    let built = 0;
    let worstCase = 0n;
    for (const item of GOLDEN_SET as Row[]) {
      // A stage-2 item is built from its static fallback here, because no stage-1 reply exists in a dry run.
      const input = goldenInputFor(item as never, {});
      const a = buildGoldenRequest(item.route, input);
      const again = buildGoldenRequest(item.route, input);
      expect(again.bodyText).toBe(a.bodyText); // the cache guard: byte-stable
      expect(a.timeoutMs).toBe(LLM_ROUTES[item.route as LlmRoute].timeoutMs);
      built += 1;
      worstCase += a.reservation;
    }

    say(renderGoldenTable());
    say(`dry: ${built} requests built, validated and byte-stable, none sent`);
    say(
      `dry: worst-case reservation total ${worstCase} micro-USD (${usd(worstCase)}); there is no automatic retry, so this is the hard upper bound on spend`,
    );
    say(`dry: research estimate for the real spend ${RESEARCH_ESTIMATE}; cap ${usd(GOLDEN_CAP_MICRO_USD)}, stop line ${usd(GOLDEN_STOP_AT_MICRO_USD)}`);
    expect(built).toBe(GOLDEN_SET.length);
    expect(worstCase).toBeLessThanOrEqual(GOLDEN_STOP_AT_MICRO_USD);
  } finally {
    globalThis.fetch = savedFetch;
  }
}

// ---------------------------------------------------------------------------
// check-key
// ---------------------------------------------------------------------------

function runCheckKey(): void {
  const key = loadAnthropicKey();
  if (key !== null) keyNeedles.push(key);
  const present = key !== null;
  const length = key === null ? 0 : key.length;
  const formatOk = keyFormatOk(key);
  say(`keyPresent=${present} length=${length} formatOk=${formatOk}`);
}

// ---------------------------------------------------------------------------
// paid
// ---------------------------------------------------------------------------

interface CallOutcome {
  ok: boolean;
  stopReason: string | null;
  latencyMs: number;
  usage: { input: number; output: number; cacheWrite: number; cacheRead: number };
  /** Worst-case or observed cost to add to the running spend. */
  costMicroUsd: bigint;
  /** Reply text and parsed JSON stay in memory until the record builder redacts them. */
  text: string;
  json: Row | undefined;
  failureClass: string | null;
}

/** One request to the API, with no retry. The only place that reaches the network. */
async function callClaude(key: string, route: LlmRoute, bodyText: string, reservation: bigint, timeoutMs: number): Promise<CallOutcome> {
  const started = Date.now();
  let httpStatus = 0;
  let result: ReturnType<typeof classifyClaudeError>;
  try {
    const res = await fetch(ANTHROPIC_MESSAGES_URL, {
      method: 'POST',
      headers: buildClaudeHeaders(key),
      body: bodyText,
      signal: AbortSignal.timeout(timeoutMs),
    });
    httpStatus = res.status;
    const text = await res.text();
    result = classifyClaudeResponse(
      route,
      { status: res.status, headers: { get: (name: string) => res.headers.get(name) }, text: () => text },
      { needles: [key] },
    );
  } catch (err) {
    result = classifyClaudeError(err, { needles: [key] });
  }
  const latencyMs = Date.now() - started;
  const usage = result.usage ?? { input: 0, output: 0, cacheWrite: 0, cacheRead: 0 };

  // Billing is unknown after a timeout, a transport failure or a 2xx without usable usage: charge the
  // reservation, never under-count.
  const cost = sweepCallCostMicroUsd(
    {
      usageCostMicroUsd: result.usage ? BigInt(estimateCostMicroUsd(result.usage)) : null,
      ok: result.ok,
      failureClass: result.ok ? null : result.class,
      httpStatus,
    },
    reservation,
  );

  return {
    ok: result.ok,
    stopReason: result.stopReason ?? null,
    latencyMs,
    usage,
    costMicroUsd: cost,
    text: result.ok ? result.text : '',
    json: result.ok && result.json !== undefined ? (result.json as Row) : undefined,
    failureClass: result.ok ? null : result.class,
  };
}

/** The record on disk, or undefined when it is missing or not JSON. */
function readRecord(): Row | undefined {
  try {
    return JSON.parse(fs.readFileSync(RECORD_PATH, 'utf8')) as Row;
  } catch {
    return undefined;
  }
}

/** The parsed replies of the stored record, by item id, to feed a rerun's chained stage-2 items. */
function storedReplies(record: Row | undefined): Record<string, Row> {
  const out: Record<string, Row> = {};
  for (const item of (record?.items ?? []) as Row[]) {
    if (!item.ran || !item.ok || typeof item.text !== 'string') continue;
    try {
      const parsed = JSON.parse(item.text);
      if (parsed !== null && typeof parsed === 'object' && !Array.isArray(parsed)) out[item.id] = parsed;
    } catch {
      /* a text reply has no JSON to chain from */
    }
  }
  return out;
}

/**
 * Write the record and then the review page, only when this run made a paid call. A record with any hygiene
 * problem is not written (the problem codes are printed, never the content).
 */
function writeOutputs(record: Row, rerunIds: string[] | undefined): void {
  const problems = recordHygieneProblems(record);
  if (problems.length > 0) {
    say(`record NOT written: hygiene problems [${problems.join(',')}]`);
    throw new Error('golden record failed the hygiene check');
  }
  fs.writeFileSync(RECORD_PATH, JSON.stringify(record, null, 2) + '\n');
  fs.writeFileSync(REVIEW_PATH, renderGoldenReview(record, { rerunIds }));
  say(`record written (status ${record.status}) and review page written`);
}

async function runPaid(mode: 'run' | 'rerun'): Promise<void> {
  // Refuse before the key is read or anything is sent when the run would replace a paid record.
  const existing = readRecord();
  const refusal = goldenRunRefusal(mode, existing);
  if (refusal) {
    say(`${mode} refused: ${refusal}; nothing was sent or written`);
    throw new Error('golden run refused');
  }
  if (mode === 'run' && process.env.GOLDEN_ONLY) {
    say('run refused: GOLDEN_ONLY belongs to rerun; nothing was sent or written');
    throw new Error('golden run refused');
  }
  const only = mode === 'rerun' ? parseGoldenOnly(process.env.GOLDEN_ONLY) : undefined;

  const key = loadAnthropicKey();
  if (key === null) {
    say('no Anthropic key is stored for the local module; nothing was sent');
    throw new Error('missing key');
  }
  keyNeedles.push(key);
  if (!keyFormatOk(key)) {
    say('the stored key does not look like an Anthropic key; nothing was sent');
    throw new Error('malformed key');
  }

  const startedAt = new Date().toISOString();
  const replies: Record<string, Row> = mode === 'rerun' ? storedReplies(existing) : {};
  const results: Record<string, Row> = {};
  const rerunItems: Row[] = [];
  const todo = (GOLDEN_SET as Row[]).filter((item) => !only || only.includes(item.id));
  let spent = 0n;
  let calls = 0;
  let stopped = false;

  say(`${mode}: ${todo.length} item(s), sequential, no retry, stop line ${usd(GOLDEN_STOP_AT_MICRO_USD)}`);

  // The record is written in finally, so a crash mid-run keeps every reply already paid for.
  try {
    for (const item of todo) {
      const { bodyText, timeoutMs, reservation } = buildGoldenRequest(item.route, goldenInputFor(item as never, replies));
      if (goldenShouldStop(spent, reservation)) {
        say(`${mode} stopped before ${item.id}: spent ${usd(spent)} plus the next reservation would pass the stop line; the remaining items are recorded as not run`);
        stopped = true;
        break;
      }
      const outcome = await callClaude(key, item.route, bodyText, reservation, timeoutMs);
      spent += outcome.costMicroUsd;
      calls += 1;
      if (outcome.ok && outcome.json !== undefined) replies[item.id] = outcome.json;
      else delete replies[item.id];

      const result = {
        ran: true,
        ok: outcome.ok,
        failureClass: outcome.failureClass,
        stopReason: outcome.stopReason,
        latencyMs: outcome.latencyMs,
        usage: outcome.usage,
        costMicroUsd: outcome.costMicroUsd,
        text: outcome.text,
        json: outcome.json,
      };
      // Judged on the raw reply; the printed line carries rule ids only, never text.
      const judged = evaluateGoldenItem(item, result);
      if (mode === 'run') results[item.id] = result;
      else rerunItems.push(buildGoldenItem(item.id, result));
      const mech = judged.failures as string[];
      say(
        `${item.id} ok=${outcome.ok} stop=${outcome.stopReason} out=${outcome.usage.output} ${(outcome.latencyMs / 1000).toFixed(1)}s mechanical=[${mech.join(',')}]${outcome.failureClass ? ' class=' + outcome.failureClass : ''} spent=${usd(spent)}`,
      );
    }
  } finally {
    if (calls > 0) {
      const endedAt = new Date().toISOString();
      const record =
        mode === 'run'
          ? buildGoldenRecord({ model: CLAUDE_MODEL, window: { startedAt, endedAt }, results })
          : mergeRerun(existing as Row, rerunItems, { window: { startedAt, endedAt } });
      writeOutputs(record, only);
    } else {
      say('no paid call was made; record and review page left untouched');
    }
  }
  say(`${mode} done: ${calls} call(s), spent ${usd(spent)}${stopped ? ' (stopped at the spend line)' : ''}`);
}

// ---------------------------------------------------------------------------
// entry
// ---------------------------------------------------------------------------

describe('golden live harness', () => {
  it(`mode ${MODE}`, async () => {
    if (MODE === 'dry') runDry();
    else if (MODE === 'check-key') runCheckKey();
    else await runPaid(MODE);
  });
});
