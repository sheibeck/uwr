// Effort sweep and caching proof harness (Phase 43, Plan 43-10). Run from the repo root.
//
// SWEEP_LIVE_RUN selects the mode. Unset means the free DRY run; any value not listed here throws before
// anything else happens.
//
//   (unset)     dry:       builds every Run A and Run B request offline, checks them, prints the request
//                          count and the worst-case reservation total. Stubs fetch so it throws, never
//                          reads the key, writes nothing. Free.
//   check-key   check-key: reads the key in-process and prints only presence, length and format. No
//                          network, no write.
//   A           Run A:     PAID. 9 routes x 2 efforts x 5 fixtures = 90 sequential calls straight to the
//                          API, stops at the $4.50 line, then writes the record (status 'measured').
//   B           Run B:     PAID. Needs Run A's record. Two identical sequential calls per route at the
//                          derived effort and max_tokens (caching proof and class-reveal latency), then
//                          rewrites the record (status stays 'measured').
//
// ALWAYS pass the "sweep" filter to the live config; without it the config also runs prove-live.live.ts,
// which spends by default:
//
//   pnpm exec vitest run --config scripts/llm/vitest.live.config.ts sweep                   # dry, free
//   SWEEP_LIVE_RUN=check-key pnpm exec vitest run --config scripts/llm/vitest.live.config.ts sweep
//   SWEEP_LIVE_RUN=A pnpm exec vitest run --config scripts/llm/vitest.live.config.ts sweep  # PAID (Plan 43-12, after approval)
//   SWEEP_LIVE_RUN=B pnpm exec vitest run --config scripts/llm/vitest.live.config.ts sweep  # PAID (Plan 43-12, after approval)
//
// Safety: the key comes only from loadAnthropicKey() (never the process environment) and only in the
// check-key and paid modes; every printed line goes through one say() helper that scrubs; no prompt, reply,
// header or request body is ever printed or recorded. The record holds counts, sizes, timings, stop reasons,
// pass flags and lint rule ids only. The model id comes from CLAUDE_MODEL.

import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

import { REPO_ROOT, keyFormatOk, loadAnthropicKey, scrub } from './cli.mjs';
import {
  SWEEP_CAP_MICRO_USD,
  SWEEP_MAX_TOKENS,
  SWEEP_RUN_B_CALLS,
  SWEEP_SAMPLES_PER_CELL,
  SWEEP_STOP_AT_MICRO_USD,
  buildMeasurementRecord,
  resolveSweepMode,
  shouldStopSweep,
  structuralCheck,
  toneLint,
} from './sweep_rules.mjs';
import { SWEEP_FIXTURES, classFillInputFrom, worldFillInputFrom } from './sweep_fixtures.mjs';
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
import {
  LLM_ROUTE_BASELINES,
  LLM_SWEEP_EFFORTS,
  LLM_SWEEP_ROUTES,
  deriveRecordFields,
  deriveRouteTuning,
} from '../../spacetimedb/src/data/llm_tuning';
import type { LlmEffort, LlmRoute } from '../../spacetimedb/src/data/llm_routes';

// Throws on an unknown SWEEP_LIVE_RUN value, before anything else runs.
const MODE = resolveSweepMode(process.env.SWEEP_LIVE_RUN);

const MEASUREMENTS_PATH = path.join(REPO_ROOT, 'spacetimedb', 'src', 'data', 'llm_measurements.json');
const RETRY_DELAY_MS = 5_000;
const RESEARCH_ESTIMATE = 'about $0.9 (plausible $0.5 to $1.5)';

type Row = Record<string, any>;
const fixtures = SWEEP_FIXTURES as Record<string, Row[]>;

/** Key material to scrub from every printed line. Filled only in the check-key and paid modes. */
const keyNeedles: string[] = [];

/** The only output path: scrubbed, short status text. Never a prompt, reply, header or body. */
function say(line: string): void {
  console.log(scrub(line, keyNeedles));
}

const usd = (micro: bigint | number): string => '$' + (Number(micro) / 1_000_000).toFixed(4);
const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

// ---------------------------------------------------------------------------
// Requests (shared by every mode)
// ---------------------------------------------------------------------------

/**
 * buildClaudeRequest with only output_config.effort and max_tokens overridden, re-serialized and
 * validated. Identical inputs give identical bodyText.
 */
function buildSweepRequest(route: LlmRoute, input: unknown, effort: LlmEffort, maxTokens: number) {
  const { body } = buildClaudeRequest(route, buildRouteLayers(route, input as never));
  body.output_config.effort = effort;
  body.max_tokens = maxTokens;
  assertValidClaudeBody(body, route);
  const bodyText = JSON.stringify(body);
  return { bodyText, reservation: BigInt(reserveCostMicroUsd(maxTokens, bodyText.length)) };
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

    let runA = 0;
    let runB = 0;
    let worstCase = 0n;

    for (const route of LLM_SWEEP_ROUTES) {
      expect(fixtures[route]).toHaveLength(SWEEP_SAMPLES_PER_CELL);
      for (const effort of LLM_SWEEP_EFFORTS) {
        for (const input of fixtures[route]) {
          const a = buildSweepRequest(route, input, effort, SWEEP_MAX_TOKENS[route]);
          const again = buildSweepRequest(route, input, effort, SWEEP_MAX_TOKENS[route]);
          expect(again.bodyText).toBe(a.bodyText); // the cache guard: byte-stable
          runA += 1;
          worstCase += a.reservation;
        }
      }
      // Run B: SWEEP_RUN_B_CALLS identical calls with fixture 0 (dry uses the baseline effort and max_tokens).
      const base = LLM_ROUTE_BASELINES[route];
      for (let i = 0; i < SWEEP_RUN_B_CALLS; i += 1) {
        const b = buildSweepRequest(route, fixtures[route][0], base.effort, base.maxTokens);
        runB += 1;
        worstCase += b.reservation;
      }
    }

    say(`dry: ${runA} Run A requests and ${runB} Run B requests built and validated, none sent`);
    say(
      `dry: worst-case reservation total ${worstCase} micro-USD (${usd(worstCase)}); an upper bound that charges every call at max_tokens`,
    );
    say(`dry: research estimate for the real spend ${RESEARCH_ESTIMATE}; cap ${usd(SWEEP_CAP_MICRO_USD)}, stop line ${usd(SWEEP_STOP_AT_MICRO_USD)}`);
    expect(runA).toBe(LLM_SWEEP_ROUTES.length * LLM_SWEEP_EFFORTS.length * SWEEP_SAMPLES_PER_CELL);
    expect(runB).toBe(LLM_SWEEP_ROUTES.length * SWEEP_RUN_B_CALLS);
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
  inputTokens: number;
  outputTokens: number;
  cacheWriteTokens: number;
  cacheReadTokens: number;
  /** Worst-case or observed cost to add to the running spend. */
  costMicroUsd: bigint;
  /** Reply text and parsed JSON stay in memory only; they are never printed or recorded. */
  replyText: string;
  replyJson: Row | undefined;
  failureClass: string | null;
}

/** One request to the API. The only place that reaches the network. */
async function callClaude(key: string, route: LlmRoute, bodyText: string, reservation: bigint): Promise<CallOutcome> {
  const started = Date.now();
  let result: ReturnType<typeof classifyClaudeError>;
  try {
    const res = await fetch(ANTHROPIC_MESSAGES_URL, {
      method: 'POST',
      headers: buildClaudeHeaders(key),
      body: bodyText,
      signal: AbortSignal.timeout(LLM_ROUTE_BASELINES[route].timeoutMs),
    });
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

  // Billing is unknown after a timeout or a transport failure: charge the reservation, never under-count.
  let cost = 0n;
  if (result.usage) cost = BigInt(estimateCostMicroUsd(result.usage));
  else if (!result.ok && (result.class === 'timeout' || result.class === 'network')) cost = reservation;

  return {
    ok: result.ok,
    stopReason: result.stopReason ?? null,
    latencyMs,
    inputTokens: usage.input,
    outputTokens: usage.output,
    cacheWriteTokens: usage.cacheWrite,
    cacheReadTokens: usage.cacheRead,
    costMicroUsd: cost,
    replyText: result.ok ? result.text : '',
    replyJson: result.ok && result.json !== undefined ? (result.json as Row) : undefined,
    failureClass: result.ok ? null : result.class,
  };
}

/** callClaude, once more after 5 s only for a retryable failure class. Both attempts count toward the spend. */
async function callWithRetry(
  key: string,
  route: LlmRoute,
  bodyText: string,
  reservation: bigint,
): Promise<{ outcome: CallOutcome; extraCost: bigint }> {
  const first = await callClaude(key, route, bodyText, reservation);
  const retryable = ['rate_limit', 'overloaded', 'server', 'timeout', 'network'].includes(first.failureClass ?? '');
  if (first.ok || !retryable) return { outcome: first, extraCost: 0n };
  say(`  retrying after ${RETRY_DELAY_MS / 1000}s (class ${first.failureClass})`);
  await sleep(RETRY_DELAY_MS);
  const second = await callClaude(key, route, bodyText, reservation);
  return { outcome: second, extraCost: first.costMicroUsd };
}

/** The swept routes that reply with schema-constrained JSON; npc_conversation and combat_narration are text routes. */
const JSON_ROUTES = new Set<LlmRoute>(LLM_SWEEP_ROUTES.filter((r) => r !== 'npc_conversation' && r !== 'combat_narration'));

/** The recorded sample for one call: sizes, timings, stop reason, pass flags and lint rule ids. Never text. */
function sampleOf(route: LlmRoute, o: CallOutcome) {
  const structured = JSON_ROUTES.has(route) ? o.replyJson : o.replyText;
  return {
    ok: o.ok,
    stopReason: o.stopReason,
    latencyMs: o.latencyMs,
    inputTokens: o.inputTokens,
    outputTokens: o.outputTokens,
    cacheWriteTokens: o.cacheWriteTokens,
    cacheReadTokens: o.cacheReadTokens,
    schemaOk: o.ok && structuralCheck(route, structured).length === 0,
    // Evaluated on the raw reply; toneLint reads the JSON inside an npc_conversation reply itself.
    toneFailures: o.ok ? toneLint(route, o.replyText, o.replyJson) : [],
  };
}

function writeRecord(record: unknown): void {
  fs.writeFileSync(MEASUREMENTS_PATH, JSON.stringify(record, null, 2) + '\n');
}

type CellSamples = Record<string, { low: { samples: any[] }; medium: { samples: any[] } }>;

async function runA(key: string): Promise<void> {
  const routes: CellSamples = {};
  for (const route of LLM_SWEEP_ROUTES) routes[route] = { low: { samples: [] }, medium: { samples: [] } };
  // Stage-1 replies of this run, by effort and fixture index, feeding the stage-2 fixtures.
  const stage1: Record<string, Record<string, (Row | undefined)[]>> = {
    world_gen_start: { low: [], medium: [] },
    creation_class_reveal: { low: [], medium: [] },
  };

  let spent = 0n;
  let calls = 0;
  let stopped = false;

  const inputFor = (route: LlmRoute, effort: LlmEffort, i: number): unknown => {
    if (route === 'world_gen') {
      return worldFillInputFrom(stage1.world_gen_start[effort][i], fixtures.world_gen_start[i], fixtures.world_gen[i] as never);
    }
    if (route === 'creation_class') {
      return classFillInputFrom(stage1.creation_class_reveal[effort][i], fixtures.creation_class_reveal[i], fixtures.creation_class[i] as never);
    }
    return fixtures[route][i];
  };

  say(`Run A: ${LLM_SWEEP_ROUTES.length} routes x ${LLM_SWEEP_EFFORTS.length} efforts x ${SWEEP_SAMPLES_PER_CELL} fixtures, sequential, stop line ${usd(SWEEP_STOP_AT_MICRO_USD)}`);

  // The record is written in finally, so a crash mid-run keeps every sample (and the spend) already paid for.
  try {
    outer: for (const route of LLM_SWEEP_ROUTES) {
      for (const effort of LLM_SWEEP_EFFORTS) {
        for (let i = 0; i < SWEEP_SAMPLES_PER_CELL; i += 1) {
          const { bodyText, reservation } = buildSweepRequest(route, inputFor(route, effort, i), effort, SWEEP_MAX_TOKENS[route]);
          if (shouldStopSweep(spent, reservation)) {
            say(`Run A stopped before ${route} ${effort} #${i + 1}: spent ${usd(spent)} plus the next reservation would pass the stop line; the remaining cells are insufficient data`);
            stopped = true;
            break outer;
          }
          const { outcome, extraCost } = await callWithRetry(key, route, bodyText, reservation);
          spent += outcome.costMicroUsd + extraCost;
          calls += 1;
          const sample = sampleOf(route, outcome);
          routes[route][effort as 'low' | 'medium'].samples.push(sample);
          if (route === 'world_gen_start' || route === 'creation_class_reveal') {
            stage1[route][effort][i] = outcome.ok ? outcome.replyJson : undefined;
          }
          say(
            `A ${route} ${effort} #${i + 1}/${SWEEP_SAMPLES_PER_CELL} ok=${sample.ok} stop=${sample.stopReason} out=${sample.outputTokens} ${(sample.latencyMs / 1000).toFixed(1)}s schemaOk=${sample.schemaOk} tone=[${sample.toneFailures.join(',')}]${outcome.failureClass ? ' class=' + outcome.failureClass : ''} spent=${usd(spent)}`,
          );
        }
      }
    }
  } finally {
    writeRecord(
      buildMeasurementRecord({
        status: 'measured',
        model: CLAUDE_MODEL,
        recordedAt: new Date().toISOString(),
        environment: 'local',
        totals: { calls, costMicroUsd: spent },
        routes: Object.fromEntries(
          LLM_SWEEP_ROUTES.map((r) => [r, { efforts: { low: routes[r].low, medium: routes[r].medium }, runB: [] }]),
        ),
        caching: {},
        classReveal: { latenciesMs: [], parallelBuilt: false },
      }),
    );
  }
  say(`Run A done: ${calls} calls, spent ${usd(spent)}${stopped ? ' (stopped at the spend line)' : ''}; record written (status measured)`);
}

async function runB(key: string): Promise<void> {
  const rec = JSON.parse(fs.readFileSync(MEASUREMENTS_PATH, 'utf8')) as Row;
  if (rec.status !== 'measured' || !rec.totals || rec.totals.calls < 1) {
    throw new Error('Run B needs the record from Run A (status measured, at least one call)');
  }
  let spent = BigInt(rec.totals.costMicroUsd);
  let calls = Number(rec.totals.calls);
  const routes: Row = {};
  const caching: Row = {};
  let revealRunB: number[] = [];

  say(`Run B: ${LLM_SWEEP_ROUTES.length} routes x ${SWEEP_RUN_B_CALLS} identical sequential calls at the derived effort and max_tokens; spent so far ${usd(spent)}`);

  // The record is written in finally, so a crash mid-run keeps every call already paid for.
  try {
    outer: for (const route of LLM_SWEEP_ROUTES) {
      const tuned = deriveRouteTuning(route, rec.routes[route], LLM_ROUTE_BASELINES[route]);
      const { bodyText, reservation } = buildSweepRequest(route, fixtures[route][0], tuned.effort, tuned.maxTokens);
      const pair: ReturnType<typeof sampleOf>[] = [];
      routes[route] = { runB: pair }; // the same array, so a spend stop keeps a partial pair
      for (let c = 0; c < SWEEP_RUN_B_CALLS; c += 1) {
        if (shouldStopSweep(spent, reservation)) {
          say(`Run B stopped before ${route} call ${c + 1}: spent ${usd(spent)} plus the next reservation would pass the stop line`);
          break outer;
        }
        const { outcome, extraCost } = await callWithRetry(key, route, bodyText, reservation);
        spent += outcome.costMicroUsd + extraCost;
        calls += 1;
        const s = sampleOf(route, outcome);
        pair.push(s);
        say(
          `B ${route} ${tuned.effort} max=${tuned.maxTokens} call ${c + 1}/${SWEEP_RUN_B_CALLS} ok=${s.ok} stop=${s.stopReason} out=${s.outputTokens} cacheWrite=${s.cacheWriteTokens} cacheRead=${s.cacheReadTokens} ${(s.latencyMs / 1000).toFixed(1)}s${outcome.failureClass ? ' class=' + outcome.failureClass : ''} spent=${usd(spent)}`,
        );
      }
      if (pair.length === SWEEP_RUN_B_CALLS && pair.every((p) => p.ok)) caching[route] = { call1: pair[0], call2: pair[1] };
      if (route === 'creation_class_reveal') revealRunB = pair.filter((p) => p.ok).map((p) => p.latencyMs);
    }
  } finally {
    // LAT-06 input: the Run A chosen-cell latencies plus the Run B latencies of the class reveal.
    const reveal = rec.routes.creation_class_reveal;
    const chosen = deriveRecordFields(reveal).chosenEffort;
    const runALatencies: number[] =
      chosen === null ? [] : reveal.efforts[chosen].samples.filter((s: Row) => s.ok === true).map((s: Row) => s.latencyMs);
    writeRecord(
      buildMeasurementRecord({
        status: 'measured',
        model: CLAUDE_MODEL,
        recordedAt: new Date().toISOString(),
        environment: 'local',
        totals: { calls, costMicroUsd: spent },
        routes: Object.fromEntries(
          LLM_SWEEP_ROUTES.map((r) => [r, { efforts: rec.routes[r].efforts, runB: routes[r]?.runB ?? rec.routes[r].runB ?? [] }]),
        ),
        caching,
        classReveal: { latenciesMs: [...runALatencies, ...revealRunB], parallelBuilt: false },
      }),
    );
  }
  say(`Run B done: ${calls} calls in total, spent ${usd(spent)}; record rewritten (status measured)`);
}

async function runPaid(mode: 'A' | 'B'): Promise<void> {
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
  if (mode === 'A') await runA(key);
  else await runB(key);
}

// ---------------------------------------------------------------------------
// entry
// ---------------------------------------------------------------------------

describe('effort sweep', () => {
  it(`mode ${MODE}`, async () => {
    if (MODE === 'dry') runDry();
    else if (MODE === 'check-key') runCheckKey();
    else await runPaid(MODE);
  });
});
