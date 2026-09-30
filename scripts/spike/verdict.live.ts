// Phase 39 verdict: compute the strict and floor-adjusted gate verdicts from the raw results file,
// store them, and print every number the decision record needs. Throwaway: deleted in the cleanup plan.
// Spends nothing and makes no network call. The report is written to scripts/spike/out/verdict-report.txt
// (local) or verdict-report-maincloud.txt (SPIKE_TARGET=maincloud).
//
// Target mode (REVISED 2026-09-29: maincloud decides the gate):
// - local: the verdict is stored with role 'provisional' even when strict is incomplete, with diagnostics.
// - maincloud: the verdict is stored with role 'decisive' only when strict is not incomplete;
//   an incomplete strict verdict stores nothing and fails so the user decides.
import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

import { evaluateGate, summarize, type GateResult, type Summary } from '../../spacetimedb/src/helpers/measurement.ts';
import {
  collectCallSamples,
  floorAdjustedNoiseFloorMs,
  gateInputFromResults,
  levelLabels,
  measuredNoiseDriftMs,
  observedServerCap,
  validateResults,
  type CallSample,
  type LatencyWindow,
} from '../../spacetimedb/src/helpers/measurement_results';
import { LOCAL_RESULTS_PATH, OUT_DIR, TARGET } from './config.ts';
import { ResultsStore } from './results-store.ts';

const IS_MAINCLOUD = TARGET.name === 'maincloud';
const PROFILE = IS_MAINCLOUD ? 'gate' : 'full';
const REPORT_NAME = IS_MAINCLOUD ? 'verdict-report-maincloud.txt' : 'verdict-report.txt';

const lines: string[] = [];
const out = (s = '') => {
  lines.push(s);
  console.log(s);
};

const fmt = (n: number | null | undefined) => (n === null || n === undefined ? 'n/a' : String(Math.round(n * 100) / 100));
const sumStr = (label: string, s: Summary | null) =>
  s
    ? `${label}: n=${s.n} min=${fmt(s.min)} p50=${fmt(s.p50)} p95=${fmt(s.p95)} p99=${fmt(s.p99)} max=${fmt(s.max)} mean=${fmt(s.mean)}`
    : `${label}: no samples`;

function checkTable(title: string, r: GateResult) {
  out(`--- ${title}: verdict=${r.verdict} cap=${r.cap} flags=[${r.flags.join(', ')}] noiseFloorMs=${r.thresholds.noiseFloorMs}`);
  for (const c of r.checks) {
    out(`  ${c.pass ? 'PASS' : 'FAIL'} ${c.name} measured=${JSON.stringify(c.measured)} threshold=${JSON.stringify(c.threshold)}`);
  }
}

function windowLine(label: string, w: LatencyWindow | undefined, keepPing: (n: number) => boolean, keepTick: (n: number) => boolean) {
  if (!w) return out(`${label}: missing`);
  const ping = w.pingMs.filter((s) => keepPing(s.inFlight)).map((s) => s.ms);
  const tick = w.tick.filter((s) => keepTick(s.inFlight)).map((s) => s.lateMs);
  out(`${label} ping ms ${sumStr('', summarize(ping)).slice(2)}`);
  out(`${label} tick ms ${sumStr('', summarize(tick)).slice(2)}`);
}

function callStats(label: string, xs: CallSample[]) {
  const okN = xs.filter((s) => s.ok).length;
  const e2e = xs.map((s) => s.clientE2eMs).filter((v): v is number => typeof v === 'number');
  const call = xs.map((s) => s.callUs).filter((v): v is number => typeof v === 'number').map((us) => us / 1000);
  out(`${label}: calls=${xs.length} ok=${okN}`);
  out('    ' + sumStr('client e2e ms', summarize(e2e)));
  out('    ' + sumStr('in-module call ms', summarize(call)));
}

describe(`spike verdict, target ${TARGET.name} (no spend, no network)`, () => {
  it('computes strict and floor-adjusted verdicts from raw samples and stores them', () => {
    const store = new ResultsStore();
    const doc = store.read();

    // A partial validation must already pass before a verdict is computed.
    expect(validateResults(doc, { final: false, profile: PROFILE })).toEqual([]);
    out(`target=${TARGET.name} db=${TARGET.db} results=${TARGET.resultsPath} profile=${PROFILE}`);

    const gi = gateInputFromResults(doc);
    const strict = evaluateGate(gi);
    const noiseFloorMs = floorAdjustedNoiseFloorMs(doc);
    const floorAdjusted = evaluateGate(gateInputFromResults(doc, { noiseFloorMs }));
    const drift = measuredNoiseDriftMs(doc);
    const cap = observedServerCap(doc);
    const labels = levelLabels(doc);

    out('=== GATE INPUT ===');
    out(JSON.stringify({ reliability: gi.reliability, dispatch: gi.dispatch, regionSchema: gi.regionSchema, baseline: gi.baseline, loads: gi.loads }));
    checkTable('STRICT (noise floor 0)', strict);
    checkTable('FLOOR-ADJUSTED', floorAdjusted);
    out(`measuredNoiseDriftMs=${fmt(drift)} floorAdjustedNoiseFloorMs=${noiseFloorMs} observedServerCap=${cap}`);
    out('level labels: ' + JSON.stringify(labels));
    out(`observed server concurrency cap: ${cap}`);

    // Diagnostic only, never stored: what the verdict would be if the thin-window sample minimum were set aside.
    const minPing = Math.min(...gi.loads.map((l) => l.pingSamples), gi.baseline.pingSamples);
    const whatIf = evaluateGate({ ...gi, thresholds: { minPingSamples: minPing } });
    const whatIfFloor = evaluateGate({ ...gi, thresholds: { minPingSamples: minPing, noiseFloorMs } });
    const whatIfLine = `DIAGNOSTIC (not a verdict): with minPingSamples lowered to ${minPing}: strict=${whatIf.verdict} cap=${whatIf.cap}; floor-adjusted=${whatIfFloor.verdict} cap=${whatIfFloor.cap}`;
    out(whatIfLine);
    const missing = strict.checks.filter((c) => c.name === 'samples' && !c.pass).map((c) => `missing minimum: ${String(c.measured)} (need ${String(c.threshold)})`);
    for (const m of missing) out(m);

    out('=== RELIABILITY BY RUNG (all attempts, drills separate) ===');
    const all = collectCallSamples(doc);
    const rungs = [...new Set(all.map((s) => s.rung))];
    for (const rung of rungs) {
      const xs = all.filter((s) => s.rung === rung);
      const cls = [...new Set(xs.map((s) => s.class))].join('/');
      const fails: Record<string, number> = {};
      for (const s of xs.filter((x) => !x.ok)) fails[String(s.failureClass)] = (fails[String(s.failureClass)] ?? 0) + 1;
      const reruns = xs.filter((s) => s.attempt > 1).length;
      out(`  ${rung} [${cls}] calls=${xs.length} ok=${xs.filter((s) => s.ok).length} failures=${JSON.stringify(fails)} reruns(attempt>1)=${reruns}`);
    }
    const nonDrill = all.filter((s) => s.class !== 'drill');
    out(`non-drill calls=${nonDrill.length} non-drill failures=${nonDrill.filter((s) => !s.ok).length}`);
    out(`ladder.reliability calls=${doc.ladder?.reliability.length} ok=${doc.ladder?.reliability.filter((s) => s.ok).length}`);
    out(`drill outcomes: timeout ${JSON.stringify(doc.drills?.timeout.map((s) => [s.failureClass, s.threw, s.errorMessage, Math.round((s.callUs ?? 0) / 1000)]))}`);
    out(`drill outcomes: badKey ${JSON.stringify(doc.drills?.badKey.map((s) => [s.failureClass, s.status, s.anthropicErrorType, s.requestIdVisible]))}`);
    out(`canary: ${JSON.stringify(doc.canary)}`);

    out('=== LADDER ===');
    callStats('rung 1 public url', doc.ladder?.publicUrl ?? []);
    callStats('rung 2 GET /v1/models', doc.ladder?.models ?? []);
    callStats('rung 3 minimal Sonnet call', doc.ladder?.reliability ?? []);
    out('ladder diagnostics: ' + JSON.stringify(doc.ladder?.diagnostics ?? []));

    out('=== DISPATCH / SENDER ===');
    const disp = doc.dispatch?.samples ?? [];
    out(sumStr('dispatch (gate metric, first withTx minus scheduledAt) ms', summarize(disp.map((s) => (s.dispatchLateUs ?? 0) / 1000))));
    out(sumStr('dispatch ctx cross-check (ctx.timestamp minus scheduledAt) ms', summarize(disp.map((s) => (s.ctxLateUs ?? 0) / 1000))));
    const burst = doc.dispatch?.burst ?? [];
    out(sumStr('burst dispatch ms', summarize(burst.map((s) => (s.dispatchLateUs ?? 0) / 1000))));
    out('sender: ' + JSON.stringify(doc.sender));

    out('=== PUSH LEGS / HOP / COMPOSED OVERHEAD (lower bound) ===');
    const echo = doc.pushLegs?.echoMs ?? [];
    const noop = doc.pushLegs?.noopProcedureE2eMs ?? [];
    // Maincloud has no Worker hop (it exists only in the local file), so borrow the local hop read-only.
    const hopDoc = IS_MAINCLOUD ? new ResultsStore(LOCAL_RESULTS_PATH).read() : doc;
    const hopLabel = IS_MAINCLOUD ? 'local wrangler dev hop' : 'worker hop';
    const hop = hopDoc.hop?.samplesMs ?? [];
    const idlePing = (doc.load?.baseline?.pingMs ?? []).map((s) => s.ms);
    const se = summarize(echo), sn = summarize(noop), sh = summarize(hop), sp = summarize(idlePing);
    out(sumStr('echo push ms', se));
    out(sumStr(hopLabel + ' ms (' + hopDoc.hop?.mode + ')', sh));
    out(sumStr('idle ping ms (baseline)', sp));
    out(sumStr('no-op procedure e2e ms', sn));
    if (se && sh && sp && sn) {
      out(`composed current path (echo + ${hopLabel} + ping + echo): p50=${fmt(se.p50 + sh.p50 + sp.p50 + se.p50)} p95=${fmt(se.p95 + sh.p95 + sp.p95 + se.p95)}`);
      out(`composed procedure path (no-op procedure e2e): p50=${fmt(sn.p50)} p95=${fmt(sn.p95)}`);
    }

    out('=== STRUCTURED OUTPUTS ===');
    const rc = doc.structured?.regionCompile;
    out(`region compile: compiles=${rc?.compiles} error=${JSON.stringify(rc?.errorMessage)} staged=${JSON.stringify(rc?.staged)} probes=${rc?.probes.length}`);
    const cells = doc.structured?.cells ?? [];
    for (const route of ['skill', 'region']) {
      for (const effort of ['low', 'medium']) {
        const xs = cells.filter((c) => c.route === route && c.effort === effort);
        const warm = xs.filter((c) => !c.cold);
        const okN = xs.filter((c) => c.ok).length;
        const tokens = xs.map((c) => c.usage?.output ?? 0);
        out(`cell ${route}-${effort}: runs=${xs.length} ok=${okN} stop=${[...new Set(xs.map((c) => c.stopReason))].join('/')} meanOutTokens=${fmt(tokens.reduce((a, b) => a + b, 0) / Math.max(1, tokens.length))}`);
        const e2eAll = xs.map((c) => c.clientE2eMs).filter((v): v is number => v !== null);
        const e2eWarm = warm.map((c) => c.clientE2eMs).filter((v): v is number => v !== null);
        const callAll = xs.map((c) => (c.callUs ?? 0) / 1000);
        const callWarm = warm.map((c) => (c.callUs ?? 0) / 1000);
        out('    ' + sumStr('client e2e (all)', summarize(e2eAll)));
        out('    ' + sumStr('client e2e (no cold)', summarize(e2eWarm)));
        out('    ' + sumStr('module call (all)', summarize(callAll)));
        out('    ' + sumStr('module call (no cold)', summarize(callWarm)));
      }
    }
    const think = doc.structured?.thinkingOff ?? [];
    out(`thinking-off: runs=${think.length} statuses=${think.map((s) => s.status).join(',')} composable=${doc.structured?.thinkingOffComposable} meanOutTokens=${fmt(think.reduce((a, s) => a + (s.usage?.output ?? 0), 0) / Math.max(1, think.length))}`);
    out('    ' + sumStr('client e2e', summarize(think.map((s) => s.clientE2eMs ?? 0))));
    out('headers: ' + JSON.stringify(doc.headers));
    out('cache: ' + JSON.stringify({ observed: doc.cache?.cacheReadObserved, pair: doc.cache?.pair.map((s) => s.usage) }));
    out('timeout drill shape: throws (see drill outcomes above)');

    out('=== EXTRAS ===');
    out('directCall4954: ' + JSON.stringify({ ...doc.extras?.directCall4954, samples: undefined, aPingMs: undefined, bPingMs: undefined }));
    out('publishSurvival: ' + JSON.stringify({ ...doc.extras?.publishSurvival, samples: undefined }).slice(0, 1600));

    out('=== LOAD (SPIKE-03) ===');
    const zero = (n: number) => n === 0;
    const anyN = () => true;
    windowLine('baseline (in-flight 0)', doc.load?.baseline, zero, zero);
    windowLine('baseline2 (in-flight 0)', doc.load?.baseline2, zero, zero);
    for (const l of doc.load?.levels ?? []) {
      const lab = labels.find((x) => x.level === l.inFlight)!;
      windowLine(`level ${l.inFlight} gate window (ping client>=${lab.pingMin}, tick server>=${lab.tickMin})`, l.window, (n) => n >= lab.pingMin, (n) => n >= lab.tickMin);
      windowLine(`level ${l.inFlight} ALL samples`, l.window, anyN, anyN);
      const hist = (a: { inFlight: number }[]) => {
        const m: Record<string, number> = {};
        for (const x of a) m[x.inFlight] = (m[x.inFlight] ?? 0) + 1;
        return JSON.stringify(m);
      };
      out(`level ${l.inFlight} label histograms: ping(client outstanding)=${hist(l.window.pingMs)} tick(server in-flight)=${hist(l.window.tick)}`);
      out(`level ${l.inFlight} calls=${l.calls.length} ok=${l.calls.filter((c) => c.ok).length} extended=${l.extended}`);
      out('    ' + sumStr('client e2e ms', summarize(l.calls.map((c) => c.clientE2eMs ?? 0))));
      out('    ' + sumStr('in-module call ms', summarize(l.calls.map((c) => (c.callUs ?? 0) / 1000))));
      out(`    inFlightAtStart max=${Math.max(...l.calls.map((c) => c.inFlightAtStart ?? 0))}`);
    }
    // Ping vs tick at the server cap, from level 8 (information, not the gate).
    const l8 = doc.load?.levels.find((l) => l.inFlight === 8);
    if (l8) {
      windowLine('level 8 ping at client outstanding >= 8 (info)', l8.window, (n) => n >= 8, anyN);
      windowLine('level 8 tick at server in-flight >= 4 (info)', l8.window, anyN, (n) => n >= 4);
    }
    out('memory: ' + JSON.stringify((doc.load?.memory ?? []).map((m) => [m.label, m.workingSetMb, m.threads])));

    out('=== SPEND ===');
    out(`harness-estimated spend micro-USD=${store.estimatedSpendMicroUsd()} calls with cost=${collectCallSamples(doc).filter((s) => s.estCostMicroUsd > 0).length}`);
    out('env: ' + JSON.stringify(doc.environment));

    fs.mkdirSync(OUT_DIR, { recursive: true });
    fs.writeFileSync(path.join(OUT_DIR, REPORT_NAME), lines.join('\n') + '\n', 'utf8');

    const stored = {
      strict,
      floorAdjusted,
      noiseFloorMs,
      computedAt: new Date().toISOString(),
      observedServerCap: cap,
      levelLabels: labels,
    };

    if (IS_MAINCLOUD) {
      // An incomplete maincloud strict verdict is not a decision: store nothing and stop for the user.
      if (strict.verdict === 'incomplete') {
        for (const m of missing) out(m);
        throw new Error('maincloud strict verdict is incomplete; stop for the user decision');
      }
      store.set('verdict', { ...stored, role: 'decisive', diagnostics: [] });
    } else {
      // Local results are provisional context: stored even when strict is incomplete, with diagnostics.
      // The what-if line is a diagnostic and is never a verdict.
      store.set('verdict', { ...stored, role: 'provisional', diagnostics: [whatIfLine, ...missing] });
    }

    expect(validateResults(store.read(), { final: true, profile: PROFILE })).toEqual([]);
  });
});
