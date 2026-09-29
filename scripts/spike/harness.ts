// Phase 39 spike harness core. Throwaway: deleted in the phase cleanup plan.
//
// Drives the uwr-spike module through the generated SDK bindings (scripts/spike/bindings,
// gitignored). Nothing here prints or stores key material: every string that can carry
// server or provider text goes through redactSecrets before it is kept.

import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { classifyFailure, redactSecrets, reserveCostMicroUsd } from '../../spacetimedb/src/helpers/measurement.ts';
import type { CallSample, LatencyWindow, SampleClass } from '../../spacetimedb/src/helpers/measurement_results';
import { MAX_TOKENS, timeoutMsFor, type SpikeSpec } from '../../spacetimedb/src/spike/spike_bodies.ts';
import { DbConnection } from './bindings/index.ts';
import { readLogs } from './cli.mjs';
import { SPIKE_DB, SPIKE_WS_URI } from './config.ts';
import type { ResultsStore } from './results-store.ts';

// ---------------------------------------------------------------------------
// Types and session
// ---------------------------------------------------------------------------

export interface ResultRow {
  id?: bigint;
  runId: string;
  rung: string;
  seq: number;
  ok: boolean;
  dataJson: string;
}

interface ResultEntry {
  row: ResultRow;
  /** performance.now() at the moment the insert callback fired in the harness */
  arrivedMs: number;
}

interface TickEntry {
  phase: string;
  inFlight: number;
  lateUs: bigint;
  gapUs: bigint;
}

export interface Spike {
  conn: DbConnection;
  identityHex: string;
  results: Map<string, Map<number, ResultEntry>>;
  ticks: TickEntry[];
  live: boolean;
  wake: Set<() => void>;
  close(): void;
}

export interface LatencySample {
  ms: number;
  inFlight: number;
}

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/** Scrub free text that could contain a key (key-shaped strings are always redacted). */
function clean(text: unknown, max = 400): string {
  return redactSecrets(String(text ?? ''), []).slice(0, max);
}

/** Resolves on the next result insert, or after ms, whichever comes first. */
function waitForChange(s: Spike, ms: number): Promise<void> {
  return new Promise<void>((resolve) => {
    const done = () => {
      clearTimeout(timer);
      s.wake.delete(done);
      resolve();
    };
    const timer = setTimeout(done, ms);
    s.wake.add(done);
  });
}

function notify(s: Spike): void {
  for (const w of [...s.wake]) w();
}

// ---------------------------------------------------------------------------
// Connection
// ---------------------------------------------------------------------------

/** Connect anonymously to uwr-spike and subscribe to the two public spike tables. */
export function connectSpike(timeoutMs = 30_000): Promise<Spike> {
  return new Promise<Spike>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('connectSpike: timed out')), timeoutMs);
    const s = {
      results: new Map(),
      ticks: [],
      live: false,
      wake: new Set(),
    } as unknown as Spike;
    DbConnection.builder()
      .withUri(SPIKE_WS_URI)
      .withDatabaseName(SPIKE_DB)
      .onConnect((cc, identity) => {
        s.conn = cc;
        s.identityHex = identity.toHexString();
        s.close = () => {
          try {
            cc.disconnect();
          } catch {
            // already closed
          }
        };
        cc.db.spikeResult.onInsert((_ctx, row) => {
          if (!s.live) return;
          const arrivedMs = performance.now();
          let bySeq = s.results.get(row.runId);
          if (!bySeq) {
            bySeq = new Map();
            s.results.set(row.runId, bySeq);
          }
          bySeq.set(row.seq, { row: row as ResultRow, arrivedMs });
          notify(s);
        });
        cc.db.spikeTickSample.onInsert((_ctx, row) => {
          if (!s.live) return;
          s.ticks.push({ phase: row.phase, inFlight: row.inFlight, lateUs: row.lateUs, gapUs: row.gapUs });
        });
        cc.subscriptionBuilder()
          .onApplied(() => {
            s.live = true;
            clearTimeout(timer);
            resolve(s);
          })
          .subscribe(['SELECT * FROM spike_result', 'SELECT * FROM spike_tick_sample']);
      })
      .onConnectError((_c, e) => {
        clearTimeout(timer);
        reject(new Error('connectSpike: ' + clean((e as Error)?.message ?? e)));
      })
      .build();
  });
}

// ---------------------------------------------------------------------------
// Reducer / procedure helpers
// ---------------------------------------------------------------------------

/** Round-trip time of spike_ping in ms. */
export async function ping(s: Spike, nonce: number | bigint): Promise<number> {
  const t0 = performance.now();
  await s.conn.reducers.spikePing({ nonce: BigInt(nonce) });
  return performance.now() - t0;
}

/** Enqueue scheduled jobs; returns performance.now() taken just before the reducer call. */
export async function enqueue(
  s: Spike,
  o: { runId: string; rung: string; spec: SpikeSpec; count?: number; seqStart?: number },
): Promise<number> {
  const t0 = performance.now();
  await s.conn.reducers.spikeEnqueue({
    runId: o.runId,
    rung: o.rung,
    specJson: JSON.stringify(o.spec),
    count: o.count ?? 1,
    seqStart: o.seqStart ?? 0,
  });
  return t0;
}

/** Wait until n result rows for runId exist (or the timeout passes) and return what arrived. */
export async function waitForResults(s: Spike, runId: string, n: number, timeoutMs: number): Promise<ResultEntry[]> {
  const deadline = performance.now() + timeoutMs;
  for (;;) {
    const got = s.results.get(runId);
    if (got && got.size >= n) return [...got.values()];
    const left = deadline - performance.now();
    if (left <= 0) return got ? [...got.values()] : [];
    await waitForChange(s, Math.min(left, 250));
  }
}

export async function resetProbe(s: Spike, probeOn: boolean): Promise<void> {
  await s.conn.reducers.spikeReset({ probeOn });
  s.ticks.length = 0;
}

export async function setPhase(s: Spike, phase: string): Promise<void> {
  await s.conn.reducers.spikeSetPhase({ phase });
}

/** Client-called procedure. Returns wall time and the parsed result. */
export async function directCall(
  s: Spike,
  spec: SpikeSpec,
  o: { attempt?: number; cold?: boolean } = {},
): Promise<{ ms: number; dataJson: string; data: Record<string, any>; sample: CallSample }> {
  const t0 = performance.now();
  const dataJson = (await s.conn.procedures.spikeDirectCall({ specJson: JSON.stringify(spec) })) as string;
  const ms = performance.now() - t0;
  let data: Record<string, any> = {};
  try {
    data = JSON.parse(dataJson);
  } catch {
    data = {};
  }
  const sample = toCallSample(
    { runId: 'direct', rung: 'direct', seq: 0, ok: data.ok === true, dataJson },
    { clientE2eMs: ms, attempt: o.attempt ?? 1, cold: o.cold ?? false },
  );
  return { ms, dataJson, data, sample };
}

// ---------------------------------------------------------------------------
// Result row -> CallSample
// ---------------------------------------------------------------------------

/**
 * Map a spike_result row into the CallSample contract. A row that never arrived
 * (undefined) becomes a platform failure. Error text is scrubbed.
 */
export function toCallSample(
  row: ResultRow | undefined,
  o: {
    clientE2eMs: number | null;
    attempt: number;
    cold: boolean;
    rung?: string;
    seq?: number;
    class?: SampleClass;
  },
): CallSample {
  if (!row) {
    return {
      rung: o.rung ?? 'unknown',
      seq: o.seq ?? 0,
      attempt: o.attempt,
      class: o.class ?? 'reliability',
      ok: false,
      failureClass: classifyFailure({ threw: false, status: null, rowMissing: true }),
      status: null,
      threw: false,
      errorMessage: 'result row never arrived',
      anthropicErrorType: null,
      stopReason: null,
      route: null,
      effort: null,
      cold: o.cold,
      dispatchLateUs: null,
      ctxLateUs: null,
      callUs: null,
      clientE2eMs: o.clientE2eMs,
      inFlightAtStart: null,
      usage: null,
      estCostMicroUsd: 0,
      headerNames: null,
      requestIdVisible: null,
      retryAfterVisible: null,
    };
  }
  let d: Record<string, any> = {};
  try {
    d = JSON.parse(row.dataJson);
  } catch {
    d = {};
  }
  const num = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null);
  const usage =
    d.usage && typeof d.usage === 'object'
      ? {
          input: Number(d.usage.input ?? 0),
          output: Number(d.usage.output ?? 0),
          cacheWrite: Number(d.usage.cacheWrite ?? 0),
          cacheRead: Number(d.usage.cacheRead ?? 0),
        }
      : null;
  const cls: SampleClass =
    d.class === 'drill' || d.class === 'exploratory' || d.class === 'reliability' ? d.class : (o.class ?? 'reliability');
  return {
    rung: row.rung,
    seq: row.seq,
    attempt: o.attempt,
    class: cls,
    ok: row.ok === true && d.ok !== false,
    failureClass: d.failureClass ?? null,
    status: num(d.status),
    threw: d.threw === true,
    errorMessage: d.errorMessage ? clean(d.errorMessage) : null,
    anthropicErrorType: d.anthropicErrorType ? clean(d.anthropicErrorType, 100) : null,
    stopReason: d.stopReason ?? null,
    route: d.route ?? null,
    effort: d.effort ?? null,
    cold: o.cold,
    dispatchLateUs: num(d.dispatchLateUs),
    ctxLateUs: num(d.ctxLateUs),
    callUs: num(d.callUs),
    clientE2eMs: o.clientE2eMs,
    inFlightAtStart: num(d.inFlightAtStart),
    usage,
    estCostMicroUsd: num(d.costMicroUsd) ?? 0,
    headerNames: Array.isArray(d.headerNames) ? d.headerNames.map((h: unknown) => clean(h, 80)) : null,
    requestIdVisible: typeof d.requestIdVisible === 'boolean' ? d.requestIdVisible : null,
    retryAfterVisible: typeof d.retryAfterVisible === 'boolean' ? d.retryAfterVisible : null,
  };
}

// ---------------------------------------------------------------------------
// Runners
// ---------------------------------------------------------------------------

function failedEnqueueSample(o: { rung: string; seq: number; attempt: number; spec: SpikeSpec; message: string }): CallSample {
  const s = toCallSample(undefined, { clientE2eMs: null, attempt: o.attempt, cold: false, rung: o.rung, seq: o.seq, class: o.spec.class });
  s.failureClass = 'request';
  s.errorMessage = 'enqueue failed: ' + clean(o.message, 200);
  return s;
}

/** One job at a time, a unique runId per call. Returns one sample per job in order. */
export async function runSequential(
  s: Spike,
  o: {
    runIdPrefix: string;
    rung: string;
    spec: SpikeSpec;
    n: number;
    gapMs?: number;
    attempt?: number;
    coldFirst?: boolean;
  },
): Promise<CallSample[]> {
  const attempt = o.attempt ?? 1;
  const gapMs = o.gapMs ?? 100;
  const timeout = timeoutMsFor(o.spec) + 30_000;
  const out: CallSample[] = [];
  for (let i = 0; i < o.n; i++) {
    const runId = `${o.runIdPrefix}-a${attempt}-${i}`;
    const cold = o.coldFirst === true && i === 0;
    let t0: number;
    try {
      t0 = await enqueue(s, { runId, rung: o.rung, spec: o.spec, count: 1, seqStart: 0 });
    } catch (e) {
      out.push(failedEnqueueSample({ rung: o.rung, seq: i, attempt, spec: o.spec, message: (e as Error)?.message ?? String(e) }));
      continue;
    }
    const got = await waitForResults(s, runId, 1, timeout);
    const entry = got[0];
    out.push(
      toCallSample(entry?.row, {
        clientE2eMs: entry ? entry.arrivedMs - t0 : null,
        attempt,
        cold,
        rung: o.rung,
        seq: 0,
        class: o.spec.class,
      }),
    );
    if (gapMs > 0 && i < o.n - 1) await sleep(gapMs);
  }
  return out;
}

export interface ConcurrentHandle {
  /** live count of jobs launched and not yet resolved */
  outstanding(): number;
  done: Promise<CallSample[]>;
}

/**
 * Keep exactly `inFlight` jobs outstanding: launch `total` jobs (count 1 each, seqStart = launch
 * index), refilling as each result arrives, then up to `extraMax` more while needMore() is true.
 */
export interface ConcurrentOpts {
  runId: string;
  rung: string;
  spec: SpikeSpec;
  total: number;
  inFlight: number;
  extraMax?: number;
  needMore?: () => boolean;
  attempt?: number;
  /** called with the live handle right after the first jobs are launched (read outstanding()) */
  onStart?: (h: ConcurrentHandle) => void;
}

/** runConcurrent, but returns the live handle immediately instead of awaiting completion. */
export function startConcurrent(s: Spike, o: ConcurrentOpts): ConcurrentHandle {
  const attempt = o.attempt ?? 1;
  const extraMax = o.extraMax ?? 0;
  const needMore = o.needMore ?? (() => false);
  const timeout = timeoutMsFor(o.spec) + 30_000;
  const pending = new Map<number, number>(); // seq -> enqueue start (performance.now)
  const samples: CallSample[] = [];
  let launched = 0;

  const done = (async () => {
    for (;;) {
      while (
        pending.size < o.inFlight &&
        (launched < o.total || (launched < o.total + extraMax && needMore()))
      ) {
        const seq = launched++;
        const start = performance.now();
        pending.set(seq, start);
        enqueue(s, { runId: o.runId, rung: o.rung, spec: o.spec, count: 1, seqStart: seq }).catch((e) => {
          if (pending.delete(seq)) {
            samples.push(failedEnqueueSample({ rung: o.rung, seq, attempt, spec: o.spec, message: (e as Error)?.message ?? String(e) }));
            notify(s);
          }
        });
      }
      if (pending.size === 0) break;
      await waitForChange(s, 250);
      const bySeq = s.results.get(o.runId);
      const now = performance.now();
      for (const [seq, start] of [...pending]) {
        const entry = bySeq?.get(seq);
        if (entry) {
          pending.delete(seq);
          samples.push(
            toCallSample(entry.row, { clientE2eMs: entry.arrivedMs - start, attempt, cold: false, rung: o.rung, seq, class: o.spec.class }),
          );
        } else if (now - start > timeout) {
          pending.delete(seq);
          samples.push(toCallSample(undefined, { clientE2eMs: null, attempt, cold: false, rung: o.rung, seq, class: o.spec.class }));
        }
      }
    }
    return samples.sort((a, b) => a.seq - b.seq);
  })();

  return { outstanding: () => pending.size, done };
}

/** Awaitable form: resolves with every sample once all launched jobs resolved or timed out. */
export async function runConcurrent(s: Spike, o: ConcurrentOpts): Promise<CallSample[]> {
  const h = startConcurrent(s, o);
  o.onStart?.(h);
  return h.done;
}

/**
 * Ping paced at intervalMs until durationMs elapsed or `until` settles. Each sample records
 * outstanding() at the moment the ping was sent.
 */
export async function pingLoop(
  s: Spike,
  o: {
    durationMs?: number;
    until?: Promise<unknown>;
    intervalMs?: number;
    outstanding?: () => number;
  },
): Promise<LatencySample[]> {
  const intervalMs = o.intervalMs ?? 50;
  const out: LatencySample[] = [];
  let stop = false;
  if (o.until) void o.until.then(() => (stop = true), () => (stop = true));
  const start = performance.now();
  let next = start;
  let nonce = 1;
  while (!stop && (o.durationMs === undefined || performance.now() - start < o.durationMs)) {
    const inFlight = o.outstanding ? o.outstanding() : 0;
    const ms = await ping(s, nonce++);
    out.push({ ms, inFlight });
    next += intervalMs;
    const wait = next - performance.now();
    if (wait > 0) await sleep(wait);
    else next = performance.now();
  }
  return out;
}

/** Tick lateness samples recorded for a phase, in ms. */
export function collectTicks(s: Spike, phase: string): { lateMs: number; inFlight: number }[] {
  return s.ticks.filter((t) => t.phase === phase).map((t) => ({ lateMs: Number(t.lateUs) / 1000, inFlight: t.inFlight }));
}

// ---------------------------------------------------------------------------
// Process, logs and diagnostics
// ---------------------------------------------------------------------------

/** PID listening on 127.0.0.1:3000, or null. */
export function serverPid(): number | null {
  const r = spawnSync('netstat', ['-ano'], { encoding: 'utf8', shell: false });
  for (const line of (r.stdout ?? '').split(/\r?\n/)) {
    if (/:3000\s+\S+\s+LISTENING/i.test(line)) {
      const pid = Number.parseInt(line.trim().split(/\s+/).pop() ?? '', 10);
      if (Number.isFinite(pid)) return pid;
    }
  }
  return null;
}

export function memorySnapshot(label: string): { label: string; pid: number; workingSetMb: number; threads: number; at: string } {
  const pid = serverPid();
  const selector = pid !== null ? `Get-Process -Id ${pid}` : 'Get-Process spacetimedb-standalone | Select-Object -First 1';
  const r = spawnSync(
    'powershell',
    ['-NoProfile', '-Command', `${selector} | Select-Object Id,WorkingSet64,@{n="Threads";e={$_.Threads.Count}} | ConvertTo-Json`],
    { encoding: 'utf8', shell: false },
  );
  let j: any = {};
  try {
    j = JSON.parse(r.stdout ?? '{}');
  } catch {
    j = {};
  }
  return {
    label,
    pid: Number(j.Id ?? pid ?? -1),
    workingSetMb: Math.round((Number(j.WorkingSet64 ?? 0) / (1024 * 1024)) * 10) / 10,
    threads: Number(j.Threads ?? 0),
    at: new Date().toISOString(),
  };
}

/** Last n lines of the uwr-spike log (already scrubbed by the CLI gateway). */
export function captureLogs(label: string, n = 200): { label: string; lines: string[] } {
  const r = readLogs(n);
  return { label, lines: r.lines.map((l: string) => clean(l, 600)) };
}

const ERROR_LINE = /errno|dns|refus|timeout|tls/i;

/** RESEARCH Pitfall 4 capture list. Every line is scrubbed. */
export function captureFailureDiagnostics(label: string): string[] {
  const out: string[] = ['diagnostics: ' + label + ' at ' + new Date().toISOString()];
  const logs = readLogs(300);
  out.push(...logs.lines.map((l: string) => 'log: ' + clean(l, 400)));

  const local = process.env.LOCALAPPDATA;
  if (local) {
    const dir = path.join(local, 'SpacetimeDB', 'data', 'logs');
    try {
      const files = fs
        .readdirSync(dir)
        .map((f) => ({ f, m: fs.statSync(path.join(dir, f)).mtimeMs }))
        .filter((x) => fs.statSync(path.join(dir, x.f)).isFile())
        .sort((a, b) => b.m - a.m)
        .slice(0, 3);
      for (const { f } of files) {
        const lines = fs.readFileSync(path.join(dir, f), 'utf8').split(/\r?\n/).filter((l) => ERROR_LINE.test(l)).slice(-40);
        out.push(...lines.map((l) => 'datalog ' + f + ': ' + clean(l, 400)));
      }
    } catch {
      out.push('datalog: unreadable');
    }
  }

  const ns = spawnSync('nslookup', ['api.anthropic.com'], { encoding: 'utf8', shell: false, timeout: 20_000 });
  out.push(...(ns.stdout ?? '').split(/\r?\n/).filter(Boolean).map((l) => 'nslookup: ' + clean(l, 200)));
  const cu = spawnSync(
    'curl',
    ['-sS', '-o', os.devNull, '-w', '%{http_code} %{time_total}', 'https://api.anthropic.com/v1/models'],
    { encoding: 'utf8', shell: false, timeout: 30_000 },
  );
  out.push('curl: ' + clean(cu.stdout, 100) + (cu.stderr ? ' err=' + clean(cu.stderr, 200) : ''));
  return out;
}

// ---------------------------------------------------------------------------
// Idle latency window
// ---------------------------------------------------------------------------

/**
 * Idle ping and tick window with no calls in flight. Turns the tick probe on (it self-reschedules at
 * COMBAT_LOOP_INTERVAL_MICROS), labels the phase, waits 2 s, pings every 50 ms for at least 65 s and
 * then continues in 10 s steps until both minimums are met or maxMs elapses.
 */
export async function measureIdleWindow(
  s: Spike,
  label: string,
  o: { minPing?: number; minTicks?: number; maxMs?: number } = {},
): Promise<{ window: LatencyWindow; memory: ReturnType<typeof memorySnapshot> }> {
  const minPing = o.minPing ?? 1000;
  const minTicks = o.minTicks ?? 55;
  const maxMs = o.maxMs ?? 120_000;
  await resetProbe(s, true);
  await setPhase(s, label);
  await sleep(2000);
  const start = performance.now();
  const pingMs: LatencySample[] = await pingLoop(s, { durationMs: 65_000, intervalMs: 50, outstanding: () => 0 });
  while (performance.now() - start < maxMs) {
    if (pingMs.length >= minPing && collectTicks(s, label).length >= minTicks) break;
    pingMs.push(...(await pingLoop(s, { durationMs: 10_000, intervalMs: 50, outstanding: () => 0 })));
  }
  const tick = collectTicks(s, label);
  const memory = memorySnapshot(label);
  await resetProbe(s, false);
  return { window: { label, serverPid: serverPid(), pingMs, tick }, memory };
}

// ---------------------------------------------------------------------------
// Rerun and budget
// ---------------------------------------------------------------------------

/**
 * Run attempt 1; only when some sample failed, run exactly one more attempt (2) and return both
 * sets. The strict verdict still counts every attempt.
 */
export async function runRungWithRerun(
  run: (attempt: number) => Promise<CallSample[]>,
): Promise<{ first: CallSample[]; second: CallSample[] | null; all: CallSample[] }> {
  const first = await run(1);
  if (first.every((x) => x.ok)) return { first, second: null, all: first };
  const second = await run(2);
  return { first, second, all: [...first, ...second] };
}

/** Throws 'harness budget exceeded' when the next messages call could pass the harness ceiling. */
export function budgetCheck(store: ResultsStore, spec: SpikeSpec): void {
  if (spec.kind !== 'messages' || spec.keyMode === 'bad') return;
  store.assertBudget(reserveCostMicroUsd(MAX_TOKENS[spec.route ?? 'minimal'], 12_000));
}
