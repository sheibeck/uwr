// Run from the repo root: pnpm exec vitest run --maxWorkers=1 scripts/llm/proof_rules.test.mjs
// Pure rules for the live-proof harness, plus static guards on the harness source. Nothing here
// touches the network, a key or a token.

import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

import {
  CREATION_ORDER,
  NPC_BURST_TURNS,
  PROOF_DOMAINS,
  PROOF_EXCERPT_MAX,
  PROOF_RUN_CAP_MICRO_USD,
  PROOF_SPEND_MARGIN_MICRO_USD,
  PROOF_STEPS,
  assertRunTarget,
  burstSampleVerdict,
  excerpt,
  expectedSmokeCount,
  plannedCallCounts,
  proofPricingInput,
  proofReservationMicroUsd,
  proofVerdict,
  worstCaseMicroUsd,
  resolveProofDb,
  resolveProveMode,
  smokeAllOk,
  heldAllTimeMicroUsd,
  heldTodayMicroUsd,
  isTerminalJobStatus,
  nextProofStep,
  proofCharacterName,
  proofEmail,
  shouldStopForRunCap,
  shouldStopForSpend,
  summarizeSmoke,
  todayUtcString,
} from './proof_rules.mjs';
import { REPO_ROOT } from './cli.mjs';
import { INDICATIVE_BELOW } from './call_log_report.mjs';
import { LLM_SMOKE_ROUTES } from '../../spacetimedb/src/data/llm_limits.ts';
import { LLM_ROUTE_NAMES, LLM_ROUTES } from '../../spacetimedb/src/data/llm_routes.ts';
import { buildRouteLayers } from '../../spacetimedb/src/data/llm_layers.ts';
import { buildClaudeRequest } from '../../spacetimedb/src/helpers/claude_request.ts';
import { CLAUDE_PRICE_MICRO_USD_PER_TOKEN, reserveCostMicroUsd } from '../../spacetimedb/src/helpers/measurement.ts';
import { smokeInputFor } from '../../spacetimedb/src/helpers/llm_inputs.ts';
import { SWEEP_FIXTURES } from './sweep_fixtures.mjs';

// A sample ceiling for the pure spend rule (the real one is the admin-set daily ceiling).
const CAP = 2_000_000n;

describe('PROOF_STEPS', () => {
  it('is the staged live-proof order (Phase 43 stage 1 and stage 2 are separate steps)', () => {
    expect([...PROOF_STEPS]).toEqual([
      'smoke',
      'creation_race',
      'creation_class_reveal',
      'creation_class',
      'world_gen_start',
      'world_gen',
      'world_gen_families',
      'explore_region',
      'npc_conversation',
      'npc_burst',
      'combat_narration',
      'renown_perk_gen',
      'skill_gen',
      'llm_stats',
    ]);
  });

  it('times the families call (Phase 51.3.1.2, D-01) as its own step, straight after the region fill', () => {
    expect(PROOF_STEPS.indexOf('world_gen_families')).toBe(PROOF_STEPS.indexOf('world_gen') + 1);
    expect(nextProofStep('world_gen')).toBe('world_gen_families');
    expect(nextProofStep('world_gen_families')).toBe('explore_region');
  });

  it('is frozen', () => {
    expect(Object.isFrozen(PROOF_STEPS)).toBe(true);
  });

  it('nextProofStep walks the order and ends with null', () => {
    expect(nextProofStep('smoke')).toBe('creation_race');
    expect(nextProofStep('creation_race')).toBe('creation_class_reveal');
    expect(nextProofStep('creation_class')).toBe('world_gen_start');
    expect(nextProofStep('npc_burst')).toBe('combat_narration');
    expect(nextProofStep('skill_gen')).toBe('llm_stats');
    expect(nextProofStep('llm_stats')).toBeNull();
    expect(nextProofStep('nonsense')).toBeNull();
  });
});

// A finished step result as the harness records it.
const good = (step, extra = {}) => ({ step, route: step, ok: true, jobStatus: 'completed', elapsedMs: 1500, ...extra });
const allGood = () =>
  PROOF_STEPS.map((step) =>
    step === 'explore_region' || step === 'llm_stats' ? good(step, { jobStatus: 'observed' }) : good(step),
  );

describe('PROOF_DOMAINS', () => {
  it('maps every domain to steps that exist; only llm_stats sits outside every domain', () => {
    const named = Object.values(PROOF_DOMAINS).flat();
    for (const step of named) expect(PROOF_STEPS).toContain(step);
    expect(new Set(named).size).toBe(named.length);
    expect(Object.keys(PROOF_DOMAINS)).toEqual(['smoke', 'creation', 'world_gen', 'npc_chat', 'combat_narration', 'renown', 'skills']);
    expect(PROOF_STEPS.filter((s) => !named.includes(s))).toEqual(['llm_stats']);
  });

  it('the world domain needs stage 1, the places fill, the families fill and the explored region (Phase 51.3.1.2)', () => {
    expect([...PROOF_DOMAINS.world_gen]).toEqual(['world_gen_start', 'world_gen', 'world_gen_families', 'explore_region']);
    const results = allGood().map((r) => (r.step === 'world_gen_families' ? { ...r, ok: false } : r));
    expect(proofVerdict(results).domains.world_gen).toBe('failed');
    expect(proofVerdict(allGood().filter((r) => r.step !== 'world_gen_families')).missingSteps.world_gen).toEqual(['world_gen_families']);
  });

  it('is frozen all the way down', () => {
    expect(Object.isFrozen(PROOF_DOMAINS)).toBe(true);
    for (const steps of Object.values(PROOF_DOMAINS)) expect(Object.isFrozen(steps)).toBe(true);
  });
});

describe('proofVerdict (a skipped, missing or unobserved step is a failure)', () => {
  it('passes every domain when every step was observed completed', () => {
    const v = proofVerdict(allGood());
    expect(v.pass).toBe(true);
    expect(v.notRun).toEqual([]);
    expect(v.failed).toEqual([]);
    for (const status of Object.values(v.domains)) expect(status).toBe('passed');
  });

  it('a domain with no result at all is not_run and fails the overall verdict', () => {
    const results = allGood().filter((r) => !PROOF_DOMAINS.renown.includes(r.step));
    const v = proofVerdict(results);
    expect(v.domains.renown).toBe('not_run');
    expect(v.notRun).toEqual(['renown']);
    expect(v.pass).toBe(false);
  });

  it('empty and missing result lists leave every domain not_run', () => {
    for (const input of [[], undefined, null]) {
      const v = proofVerdict(input);
      expect(v.pass).toBe(false);
      expect(v.notRun).toEqual(Object.keys(PROOF_DOMAINS));
    }
  });

  it('skipped, missing, none, timeout, error and failed job statuses all fail the domain', () => {
    for (const jobStatus of ['skipped', 'missing', 'none', 'timeout', 'error', 'failed', 'expired', 'pending', '', undefined]) {
      const results = allGood().map((r) => (r.step === 'combat_narration' ? { ...r, jobStatus } : r));
      const v = proofVerdict(results);
      expect(v.domains.combat_narration, String(jobStatus)).toBe('failed');
      expect(v.failed).toContain('combat_narration');
      expect(v.pass).toBe(false);
    }
  });

  it('a step the harness marked not ok fails even with a completed job', () => {
    const results = allGood().map((r) => (r.step === 'skill_gen' ? { ...r, ok: false } : r));
    expect(proofVerdict(results).domains.skills).toBe('failed');
  });

  it('zero, missing or non-numeric latency never passes', () => {
    for (const elapsedMs of [0, -5, undefined, null, Number.NaN, '12']) {
      const results = allGood().map((r) => (r.step === 'npc_conversation' ? { ...r, elapsedMs } : r));
      expect(proofVerdict(results).domains.npc_chat, String(elapsedMs)).toBe('failed');
    }
  });

  it('a multi-step domain with one step missing is failed, not passed and not not_run', () => {
    const results = allGood().filter((r) => r.step !== 'creation_class');
    const v = proofVerdict(results);
    expect(v.domains.creation).toBe('failed');
    expect(v.missingSteps.creation).toEqual(['creation_class']);
  });

  it('only a completed job passes a job step; only completed or observed passes a free step', () => {
    const observedOnJobStep = allGood().map((r) => (r.step === 'world_gen' ? { ...r, jobStatus: 'observed' } : r));
    expect(proofVerdict(observedOnJobStep).domains.world_gen).toBe('failed');
    const completedFree = allGood().map((r) => (r.step === 'explore_region' ? { ...r, jobStatus: 'completed' } : r));
    expect(proofVerdict(completedFree).domains.world_gen).toBe('passed');
  });

  it('the last result for a step wins, so a retry can fix an earlier failure but not hide a later one', () => {
    const base = allGood();
    const failedThenOk = [...base.map((r) => (r.step === 'skill_gen' ? { ...r, ok: false } : r)), good('skill_gen')];
    expect(proofVerdict(failedThenOk).domains.skills).toBe('passed');
    const okThenFailed = [...base, { ...good('skill_gen'), ok: false }];
    expect(proofVerdict(okThenFailed).domains.skills).toBe('failed');
  });

  it('ignores malformed entries without throwing', () => {
    const v = proofVerdict([null, 7, 'x', {}, { step: 'nonsense' }, ...allGood()]);
    expect(v.pass).toBe(true);
  });
});

describe('the smoke expectation', () => {
  it('equals LLM_SMOKE_ROUTES.length (9 since Phase 51.3.1.2 added world_gen_families) and is read from the server, never a literal', () => {
    expect(expectedSmokeCount()).toBe(LLM_SMOKE_ROUTES.length);
    expect(expectedSmokeCount()).toBe(9);
    expect(LLM_SMOKE_ROUTES).toContain('world_gen_families');
  });

  it('smokeAllOk needs exactly that many entries, every one ok', () => {
    const entries = (n, okAll = true) => Object.fromEntries(Array.from({ length: n }, (_, i) => ['r' + i, { ok: okAll || i > 0 }]));
    expect(smokeAllOk(JSON.stringify(entries(9)))).toBe(true);
    expect(smokeAllOk(JSON.stringify(entries(6)))).toBe(false); // the old six-route expectation is not enough
    expect(smokeAllOk(JSON.stringify(entries(8)))).toBe(false); // nor the eight routes before Phase 51.3.1.2
    expect(smokeAllOk(JSON.stringify(entries(9, false)))).toBe(false);
    expect(smokeAllOk(JSON.stringify(entries(10)))).toBe(false);
    expect(smokeAllOk('{}')).toBe(false);
    expect(smokeAllOk('not json')).toBe(false);
    expect(smokeAllOk(undefined)).toBe(false);
  });
});

describe('resolveProveMode (PROVE_LIVE_RUN)', () => {
  it('treats unset and empty as dry', () => {
    expect(resolveProveMode(undefined)).toBe('dry');
    expect(resolveProveMode(null)).toBe('dry');
    expect(resolveProveMode('')).toBe('dry');
  });

  it('accepts exactly run', () => {
    expect(resolveProveMode('run')).toBe('run');
  });

  it('throws on anything else, including the retired dry flag value and near misses', () => {
    for (const bad of ['1', '0', 'dry', 'true', 'RUN', 'Run', ' run', 'run ', 'paid', 'yes']) {
      expect(() => resolveProveMode(bad), bad).toThrow(/PROVE_LIVE_RUN/);
    }
  });
});

describe('resolveProofDb (LLM_LIVE_DB)', () => {
  it('defaults to the scratch database', () => {
    expect(resolveProofDb(undefined)).toBe('uwr-verify');
    expect(resolveProofDb(null)).toBe('uwr-verify');
    expect(resolveProofDb('')).toBe('uwr-verify');
  });

  it('accepts exactly uwr and uwr-verify', () => {
    expect(resolveProofDb('uwr')).toBe('uwr');
    expect(resolveProofDb('uwr-verify')).toBe('uwr-verify');
  });

  it('throws on anything else without echoing the value', () => {
    for (const bad of ['prod', 'UWR', 'uwr-verify2', 'uwr/verify', 'uwr ', 'maincloud', 'x']) {
      expect(() => resolveProofDb(bad), bad).toThrow(/unknown database/);
    }
    let message = '';
    try {
      resolveProofDb('secret-db-name');
    } catch (e) {
      message = String(e.message);
    }
    expect(message).not.toBe('');
    expect(message).not.toContain('secret-db-name');
  });
});

describe('assertRunTarget (a paid run never touches the user database)', () => {
  it('lets a paid run target only uwr-verify', () => {
    expect(() => assertRunTarget('run', 'uwr-verify')).not.toThrow();
    expect(() => assertRunTarget('run', 'uwr')).toThrow(/scratch database/);
    expect(() => assertRunTarget('run', '')).toThrow(/scratch database/);
    expect(() => assertRunTarget('run', undefined)).toThrow(/scratch database/);
  });

  it('lets the free dry run connect to either allowlisted database', () => {
    expect(() => assertRunTarget('dry', 'uwr')).not.toThrow();
    expect(() => assertRunTarget('dry', 'uwr-verify')).not.toThrow();
  });
});

describe('CREATION_ORDER', () => {
  it('holds the Phase 43 staged class states in order, with CLASS_FILLING between GENERATING_CLASS and CLASS_REVEALED', () => {
    expect([...CREATION_ORDER]).toEqual([
      'AWAITING_RACE',
      'GENERATING_RACE',
      'AWAITING_ARCHETYPE',
      'GENERATING_CLASS',
      'CLASS_FILLING',
      'CLASS_FILL_ERROR',
      'CLASS_REVEALED',
      'AWAITING_NAME',
      'CONFIRMING',
      'COMPLETE',
    ]);
    expect(CREATION_ORDER.indexOf('CLASS_FILLING')).toBeGreaterThan(CREATION_ORDER.indexOf('GENERATING_CLASS'));
    expect(CREATION_ORDER.indexOf('CLASS_FILLING')).toBeLessThan(CREATION_ORDER.indexOf('CLASS_REVEALED'));
    expect(Object.isFrozen(CREATION_ORDER)).toBe(true);
  });

  it('every state named here still appears in the server creation state machine (drift guard)', () => {
    const machine = fs.readFileSync(path.join(REPO_ROOT, 'spacetimedb', 'src', 'helpers', 'creation_generation.ts'), 'utf8');
    const reducer = fs.readFileSync(path.join(REPO_ROOT, 'spacetimedb', 'src', 'reducers', 'creation.ts'), 'utf8');
    const server = machine + '\n' + reducer;
    for (const step of CREATION_ORDER) expect(server, step).toContain(step);
  });
});

describe('plannedCallCounts', () => {
  const counts = plannedCallCounts();
  const total = Object.values(counts).reduce((a, b) => a + b, 0);

  it('names only real routes, in the server route order', () => {
    const keys = Object.keys(counts);
    for (const k of keys) expect(LLM_ROUTE_NAMES).toContain(k);
    expect(keys).toEqual(LLM_ROUTE_NAMES.filter((r) => keys.includes(r)));
  });

  it('counts the smoke routes once each, derived from LLM_SMOKE_ROUTES, plus the domain steps and the NPC burst', () => {
    expect(counts).toEqual({
      creation_race: 2,
      creation_class_reveal: 2,
      creation_class: 2,
      world_gen_start: 3,
      world_gen: 3,
      world_gen_families: 3,
      skill_gen: 2,
      npc_conversation: 1 + NPC_BURST_TURNS,
      combat_narration: 1,
      renown_perk_gen: 2,
      smoke_test: 1,
    });
    for (const route of LLM_SMOKE_ROUTES) expect(counts[route], route).toBeGreaterThanOrEqual(1);
  });

  it('counts the families call (Phase 51.3.1.2, D-01) twice plus its smoke call, right after world_gen', () => {
    // The starter region and the explored one each make one 2b call; the smoke test warms its grammar once.
    expect(counts.world_gen_families).toBe(2 + (LLM_SMOKE_ROUTES.includes('world_gen_families') ? 1 : 0));
    const keys = Object.keys(counts);
    expect(keys.indexOf('world_gen_families')).toBe(keys.indexOf('world_gen') + 1);
  });

  it('pins the whole-run total (9 smoke + 33 domain calls)', () => {
    expect(total).toBe(42);
    expect(total).toBe(LLM_SMOKE_ROUTES.length + 33);
  });

  it('is frozen', () => {
    expect(Object.isFrozen(counts)).toBe(true);
  });
});

describe('worstCaseMicroUsd (the bound the harness prints before any spend)', () => {
  it('sums calls x the per-call reservation, one line per route in the counts order', () => {
    const each = { a: 100n, b: 7n };
    const bound = worstCaseMicroUsd({ a: 2, b: 3 }, (route) => each[route]);
    expect(bound.total).toBe(221n);
    expect(bound.lines).toEqual([
      { route: 'a', calls: 2, eachMicroUsd: 100n },
      { route: 'b', calls: 3, eachMicroUsd: 7n },
    ]);
  });

  it('accepts a plain-number reservation and returns bigints', () => {
    const bound = worstCaseMicroUsd({ a: 1 }, () => 5);
    expect(bound.total).toBe(5n);
    expect(typeof bound.lines[0].eachMicroUsd).toBe('bigint');
  });

  it('is zero for no calls and counts a zero-call route as nothing', () => {
    expect(worstCaseMicroUsd({}, () => 1n).total).toBe(0n);
    expect(worstCaseMicroUsd({ a: 0 }, () => 9n).total).toBe(0n);
  });

  it('throws on a count that is not a whole, non-negative number (never silently under-counts)', () => {
    for (const bad of [-1, 1.5, Number.NaN, '2', undefined, null]) {
      expect(() => worstCaseMicroUsd({ a: bad }, () => 1n), String(bad)).toThrow(/call count/);
    }
  });

  it('throws on a reservation that is not a whole, non-negative amount', () => {
    for (const bad of [-1n, 1.5, Number.NaN, undefined]) {
      expect(() => worstCaseMicroUsd({ a: 1 }, () => bad), String(bad)).toThrow(/reservation/);
    }
  });
});

describe('proofReservationMicroUsd (each call priced at its full reservation)', () => {
  const routes = Object.keys(plannedCallCounts());

  it('prices every planned route at its maxTokens plus its request, the server reservation rule', () => {
    for (const route of routes) {
      const input = proofPricingInput(route);
      const request = buildClaudeRequest(route, buildRouteLayers(route, input));
      const expected = BigInt(reserveCostMicroUsd(LLM_ROUTES[route].maxTokens, request.bodyText.length));
      expect(proofReservationMicroUsd(route), route).toBe(expected);
      expect(proofReservationMicroUsd(route) >= BigInt(LLM_ROUTES[route].maxTokens * CLAUDE_PRICE_MICRO_USD_PER_TOKEN.output), route).toBe(true);
    }
  });

  it('prices from the first sweep fixture, else the server smoke input; the smoke test has an empty input', () => {
    expect(proofPricingInput('world_gen')).toBe(SWEEP_FIXTURES.world_gen[0]);
    expect(proofPricingInput('smoke_test')).toEqual({});
    // Phase 51.3.1.2: no sweep fixture exists for the families route yet, so its smoke input prices it.
    if (!SWEEP_FIXTURES.world_gen_families) expect(proofPricingInput('world_gen_families')).toEqual(smokeInputFor('world_gen_families'));
  });

  it('throws on an unknown route', () => {
    expect(() => proofReservationMicroUsd('nonsense')).toThrow(/unknown route/);
  });
});

{
  const stop = PROOF_RUN_CAP_MICRO_USD - PROOF_SPEND_MARGIN_MICRO_USD;
  const bound = worstCaseMicroUsd(plannedCallCounts());
  const usd = (micro) => '$' + (Number(micro) / 1_000_000).toFixed(4);
  describe('the planned run fits the run cap (Phase 51.3.1.2: the families call priced in)', () => {
    it(`computes the worst-case bound: ${usd(bound.total)} (${bound.total} micro-USD), stop line ${usd(stop)}`, () => {
      expect(bound.total > 0n).toBe(true);
      expect(bound.total).toBe(bound.lines.reduce((sum, l) => sum + BigInt(l.calls) * l.eachMicroUsd, 0n));
    });

    // Deferred by the owner, 2026-10-09: the proof cost bound is checked when all systems are in place
    // (Phase 52.5 / milestone end); caps are generous on purpose (51.3.1.2 D-19).
    it.skip(`worst-case bound ${usd(bound.total)} (${bound.total} micro-USD) is under the ${usd(stop)} stop line`, () => {
      expect(bound.total < stop, `bound ${usd(bound.total)} vs stop ${usd(stop)}`).toBe(true);
    });

    it('includes the families route at three calls', () => {
      const line = bound.lines.find((l) => l.route === 'world_gen_families');
      expect(line?.calls).toBe(3);
      expect(line?.eachMicroUsd).toBe(proofReservationMicroUsd('world_gen_families'));
    });
  });
}

describe('the NPC burst', () => {
  it('is 20 sequential turns, matching the report indicative threshold', () => {
    expect(NPC_BURST_TURNS).toBe(20);
    expect(NPC_BURST_TURNS).toBe(INDICATIVE_BELOW);
  });

  it('burstSampleVerdict marks fewer than 20 ok samples as indicative', () => {
    expect(burstSampleVerdict(0)).toEqual({ okCount: 0, indicative: true });
    expect(burstSampleVerdict(19)).toEqual({ okCount: 19, indicative: true });
    expect(burstSampleVerdict(20)).toEqual({ okCount: 20, indicative: false });
    expect(burstSampleVerdict(25)).toEqual({ okCount: 25, indicative: false });
    expect(burstSampleVerdict(-1).indicative).toBe(true);
    expect(burstSampleVerdict(undefined).indicative).toBe(true);
    expect(burstSampleVerdict(Number.NaN).indicative).toBe(true);
  });
});

describe('todayUtcString', () => {
  it('returns the UTC date as YYYY-MM-DD', () => {
    expect(todayUtcString(Date.UTC(2026, 8, 30, 12, 0, 0))).toBe('2026-09-30');
    expect(todayUtcString(Date.UTC(2026, 0, 5))).toBe('2026-01-05');
  });

  it('23:59:59.999 and 00:00:00.000 land on different days', () => {
    expect(todayUtcString(Date.UTC(2026, 8, 30, 23, 59, 59, 999))).toBe('2026-09-30');
    expect(todayUtcString(Date.UTC(2026, 9, 1, 0, 0, 0, 0))).toBe('2026-10-01');
  });
});

describe('heldTodayMicroUsd', () => {
  const row = { spendDayUtc: '2026-09-30', daySpentMicroUsd: 700n, phaseReservedMicroUsd: 50n };

  it('adds today spent and the reservations when the ledger day is today', () => {
    expect(heldTodayMicroUsd(row, '2026-09-30')).toBe(750n);
  });

  it('counts only the reservations when the ledger day is another day (the counter rolls lazily)', () => {
    expect(heldTodayMicroUsd(row, '2026-10-01')).toBe(50n);
    expect(heldTodayMicroUsd({ ...row, spendDayUtc: '' }, '2026-09-30')).toBe(50n);
  });

  it('accepts integer numbers as well as bigint and always returns a bigint', () => {
    const held = heldTodayMicroUsd({ spendDayUtc: '2026-09-30', daySpentMicroUsd: 700, phaseReservedMicroUsd: 50 }, '2026-09-30');
    expect(held).toBe(750n);
    expect(typeof held).toBe('bigint');
  });

  it('feeds the spend guard: held reaching ceiling minus margin stops the paid step', () => {
    const ceiling = 1_000_000n;
    const held = (spent) => heldTodayMicroUsd({ spendDayUtc: 'd', daySpentMicroUsd: spent, phaseReservedMicroUsd: 0n }, 'd');
    expect(shouldStopForSpend(held(799_999n), 0n, ceiling, 200_000n)).toBe(false);
    expect(shouldStopForSpend(held(800_000n), 0n, ceiling, 200_000n)).toBe(true);
  });
});

describe('the run cap (review WR-A02)', () => {
  it('is a fixed $2.00 per run, separate from the admin-set daily ceiling', () => {
    expect(PROOF_RUN_CAP_MICRO_USD).toBe(2_000_000n);
  });

  it('heldAllTimeMicroUsd adds all-time spent and the reservations, as a bigint', () => {
    expect(heldAllTimeMicroUsd({ phaseSpentMicroUsd: 900n, phaseReservedMicroUsd: 100n })).toBe(1_000n);
    expect(heldAllTimeMicroUsd({ phaseSpentMicroUsd: 900, phaseReservedMicroUsd: 100 })).toBe(1_000n);
    expect(heldAllTimeMicroUsd(undefined)).toBe(0n);
  });

  it('stops once this run has used the cap minus the margin, measured from the run start', () => {
    const start = 50_000_000n; // spend from earlier runs or earlier days never counts against this run
    expect(shouldStopForRunCap(start, start + 1_799_999n)).toBe(false);
    expect(shouldStopForRunCap(start, start + 1_800_000n)).toBe(true);
    expect(shouldStopForRunCap(start, start + 2_500_000n)).toBe(true);
  });

  it('a raised daily ceiling does not raise the run bound: the run cap still stops a run at $1.80', () => {
    const ceiling = 1_000_000_000n; // the highest ceiling an admin may set
    const start = { phaseSpentMicroUsd: 0n, phaseReservedMicroUsd: 0n, spendDayUtc: 'd', daySpentMicroUsd: 0n };
    const now = { phaseSpentMicroUsd: 1_800_000n, phaseReservedMicroUsd: 0n, spendDayUtc: 'd', daySpentMicroUsd: 1_800_000n };
    expect(shouldStopForSpend(heldTodayMicroUsd(now, 'd'), 0n, ceiling)).toBe(false);
    expect(shouldStopForRunCap(heldAllTimeMicroUsd(start), heldAllTimeMicroUsd(now))).toBe(true);
  });

  it('does not reset at UTC midnight (the day figure does)', () => {
    const start = { phaseSpentMicroUsd: 0n, phaseReservedMicroUsd: 0n, spendDayUtc: 'd1', daySpentMicroUsd: 0n };
    const afterMidnight = { phaseSpentMicroUsd: 1_900_000n, phaseReservedMicroUsd: 0n, spendDayUtc: 'd2', daySpentMicroUsd: 100_000n };
    expect(shouldStopForRunCap(heldAllTimeMicroUsd(start), heldAllTimeMicroUsd(afterMidnight))).toBe(true);
  });
});

describe('shouldStopForSpend', () => {
  it('uses a $0.20 margin', () => {
    expect(PROOF_SPEND_MARGIN_MICRO_USD).toBe(200_000n);
  });

  it('is false one micro-USD under the margin', () => {
    expect(shouldStopForSpend(1_000_000n, 799_999n, CAP, 200_000n)).toBe(false);
    expect(shouldStopForSpend(0n, 1_799_999n, CAP, 200_000n)).toBe(false);
  });

  it('is true at exactly the margin', () => {
    expect(shouldStopForSpend(1_000_000n, 800_000n, CAP, 200_000n)).toBe(true);
    expect(shouldStopForSpend(1_800_000n, 0n, CAP, 200_000n)).toBe(true);
  });

  it('is true one micro-USD over the margin and above the cap', () => {
    expect(shouldStopForSpend(1_800_001n, 0n, CAP, 200_000n)).toBe(true);
    expect(shouldStopForSpend(2_500_000n, 0n, CAP, 200_000n)).toBe(true);
  });

  it('defaults the margin and accepts plain numbers', () => {
    expect(shouldStopForSpend(1_799_999, 0, 2_000_000)).toBe(false);
    expect(shouldStopForSpend(1_800_000, 0, 2_000_000)).toBe(true);
  });

  it('counts reserved money the same as spent money', () => {
    expect(shouldStopForSpend(0n, 1_800_000n, CAP, 200_000n)).toBe(true);
  });
});

describe('proofCharacterName', () => {
  const samples = [0, 1, 26, 1_700_000_000_000, 1_700_000_000_001, Number.MAX_SAFE_INTEGER];

  it('is letters only, 3 to 20 characters', () => {
    for (const n of samples) {
      const name = proofCharacterName(n);
      expect(name).toMatch(/^[A-Za-z]+$/);
      expect(name.length).toBeGreaterThanOrEqual(3);
      expect(name.length).toBeLessThanOrEqual(20);
    }
  });

  it('is deterministic for the same n and different for n and n + 1', () => {
    expect(proofCharacterName(1_700_000_000_000)).toBe(proofCharacterName(1_700_000_000_000));
    expect(proofCharacterName(1_700_000_000_000)).not.toBe(proofCharacterName(1_700_000_000_001));
  });

  it('is unique over a run of consecutive values', () => {
    const seen = new Set();
    for (let i = 0; i < 2000; i += 1) seen.add(proofCharacterName(1_700_000_000_000 + i));
    expect(seen.size).toBe(2000);
  });
});

describe('proofEmail', () => {
  it('contains an @ and is unique per n', () => {
    expect(proofEmail(1)).toContain('@');
    expect(proofEmail(1)).not.toBe(proofEmail(2));
    expect(proofEmail(1_700_000_000_000)).toBe(proofEmail(1_700_000_000_000));
  });
});

describe('summarizeSmoke', () => {
  it('counts ok entries and lists the failed routes', () => {
    expect(summarizeSmoke('{"smoke_test":{"ok":true},"world_gen":{"ok":false,"class":"auth"}}')).toEqual({
      total: 2,
      ok: 1,
      failed: ['world_gen'],
    });
  });

  it('counts a full success over any number of routes', () => {
    const json = JSON.stringify(Object.fromEntries(['a', 'b', 'c', 'd', 'e', 'f'].map((k) => [k, { ok: true }])));
    expect(summarizeSmoke(json)).toEqual({ total: 6, ok: 6, failed: [] });
  });

  it('treats an entry that is not an object with ok true as failed', () => {
    expect(summarizeSmoke('{"a":true,"b":null,"c":{"ok":"yes"}}')).toEqual({ total: 3, ok: 0, failed: ['a', 'b', 'c'] });
  });

  it('returns zeros for malformed JSON, non-objects and non-strings without throwing', () => {
    const zero = { total: 0, ok: 0, failed: [] };
    expect(summarizeSmoke('{not json')).toEqual(zero);
    expect(summarizeSmoke('')).toEqual(zero);
    expect(summarizeSmoke('[]')).toEqual(zero);
    expect(summarizeSmoke('null')).toEqual(zero);
    expect(summarizeSmoke('42')).toEqual(zero);
    expect(summarizeSmoke(undefined)).toEqual(zero);
    expect(summarizeSmoke(null)).toEqual(zero);
  });

  it('the empty state the module writes before a run reads as zero entries', () => {
    expect(summarizeSmoke('{}')).toEqual({ total: 0, ok: 0, failed: [] });
  });
});

describe('isTerminalJobStatus', () => {
  it('is true for completed, failed and expired', () => {
    for (const s of ['completed', 'failed', 'expired']) expect(isTerminalJobStatus(s)).toBe(true);
  });

  it('is false for pending, in_flight, received and anything else', () => {
    for (const s of ['pending', 'in_flight', 'received', '', undefined, null]) expect(isTerminalJobStatus(s)).toBe(false);
  });
});

describe('excerpt', () => {
  it('collapses whitespace and caps at the excerpt limit', () => {
    expect(PROOF_EXCERPT_MAX).toBe(120);
    expect(excerpt('  a\n\n b\tc  ')).toBe('a b c');
    expect(excerpt('x'.repeat(500))).toHaveLength(120);
    expect(excerpt(undefined)).toBe('');
  });
});

// ---------------------------------------------------------------------------
// Static guards on the harness source (T-41-14, T-41-04b, T-41-22)
// ---------------------------------------------------------------------------

describe('the live harness source', () => {
  const harness = fs.readFileSync(path.join(REPO_ROOT, 'scripts', 'llm', 'prove-live.live.ts'), 'utf8');
  const config = fs.readFileSync(path.join(REPO_ROOT, 'scripts', 'llm', 'vitest.live.config.ts'), 'utf8');

  it('never names the hosted target and is pinned to the local server', () => {
    expect(harness.toLowerCase()).not.toContain('maincloud');
    expect(harness).toContain('TARGETS.local');
    expect(harness).toContain("TARGET.httpBase.startsWith('http://127.0.0.1')");
  });

  it('resolves the database through resolveProofDb and holds no database literal', () => {
    expect(harness).toContain('resolveProofDb(process.env.LLM_LIVE_DB)');
    expect(harness).toContain('LLM_LIVE_DB');
    expect(harness).toContain('withDatabaseName(DB_NAME)');
    expect(harness).not.toMatch(/withDatabaseName\(\s*['"`]/);
    // No quoted database name at all: the allowlist lives in cli.mjs.
    expect(harness).not.toMatch(/['"`]uwr(-verify)?['"`]/);
    // A paid run is refused for any database but the scratch one.
    expect(harness).toContain('assertRunTarget(MODE, DB_NAME)');
  });

  it('is dry unless PROVE_LIVE_RUN says run, and the retired dry flag is gone', () => {
    expect(harness).toContain('resolveProveMode(process.env.PROVE_LIVE_RUN)');
    expect(harness).toContain('PROVE_LIVE_RUN');
    expect(harness).not.toContain('PROVE_LIVE_DRY');
    // The dry branch returns before any reducer is called: no reducer call appears before the dry return.
    const dryEnd = harness.search(/session\.conn\.disconnect\(\);\s*return;/);
    expect(dryEnd).toBeGreaterThan(0);
    expect(harness.slice(0, dryEnd)).not.toMatch(/\.reducers\./);
  });

  it('reads the smoke expectation from the server and never hard-codes it', () => {
    expect(harness).toContain('expectedSmokeCount()');
    expect(harness).not.toMatch(/total\s*>=\s*\d/);
    expect(harness).not.toMatch(/total\s*===?\s*\d/);
  });

  it('starts every paid step with paidStep and has a runner for every proof step', () => {
    const starts = PROOF_STEPS.map((step) => {
      const i = harness.indexOf('      ' + step + ': async () => {');
      expect(i, 'runner for ' + step).toBeGreaterThan(0);
      return i;
    });
    PROOF_STEPS.forEach((step, n) => {
      const body = harness.slice(starts[n], n + 1 < starts.length ? starts[n + 1] : harness.length);
      expect(body, step).toContain("paidStep('" + step + "')");
    });
  });

  it('records job ids, the run window, stage timings and applies the observed pronoun check by rule id', () => {
    expect(harness).toContain('window: {');
    expect(harness).toContain('jobIds: jobIdsByRoute');
    expect(harness).toContain('timeToPlayableMs');
    expect(harness).toContain('observedRuleIds(');
    expect(harness).toContain('NPC_BURST_TURNS');
    expect(harness).toContain('proofVerdict(results)');
  });

  it('prints the bound from worstCaseMicroUsd, the same pure pricing this file checks against the stop line', () => {
    expect(harness).toContain('worstCaseMicroUsd(plannedCallCounts())');
    expect(harness).not.toContain('SWEEP_FIXTURES as Record');
  });

  it('follows the Phase 51.3.1.2 flow: families settled as their own step, placement after them, travel after COMPLETE', () => {
    const body = (step, next) => harness.slice(harness.indexOf('      ' + step + ': async () => {'), harness.indexOf('      ' + next + ': async () => {'));
    const start = body('world_gen_start', 'world_gen');
    const families = body('world_gen_families', 'explore_region');
    const explore = body('explore_region', 'npc_conversation');
    // D-17: stage 1 no longer needs the character placed; the families step does.
    expect(start).not.toContain('c.locationId !== 0n');
    expect(families).toContain("settleJob('world_gen_families'");
    expect(families).toContain('c.locationId !== 0n');
    expect(families).toContain('timeToPlayableMs =');
    expect(harness).toContain("'FAMILIES_ERROR'");
    expect(harness).toMatch(/excerpt\(head \+/);
    // D-15: the explored region's families settle before the character travels into it; a 7b refusal is only a note.
    const settled = explore.indexOf("settleJob('world_gen_families'");
    expect(settled).toBeGreaterThan(0);
    expect(explore.indexOf('entered = await travelPath(')).toBeGreaterThan(settled);
    expect(explore).toContain('REGION_HOLD_REFUSED_LINE');
    expect(harness).toContain("import { REGION_HOLD_REFUSED_LINE } from '../../spacetimedb/src/helpers/region_hold'");
  });

  it('never records a reply: observed checks keep rule ids, the id and the kind only', () => {
    expect(harness).toContain('observed.hits.push({ kind, source, id: String(id), rules })');
  });

  it('checks the spend ledger before paid steps', () => {
    expect(harness).toContain('shouldStopForSpend(');
    // Phase 43: the guard reads today's held spend and the daily ceiling, never the retired phase cap.
    expect(harness).toContain('heldTodayMicroUsd(');
    expect(harness).toContain('dailyCeilingMicroUsd');
    expect(harness).not.toContain(['phaseCap', 'MicroUsd'].join(''));
    // Review WR-A02: the harness's own fixed run cap applies alongside the ceiling, measured from the run start.
    expect(harness).toContain('shouldStopForRunCap(runStartHeld, heldAllTimeMicroUsd(s), PROOF_RUN_CAP_MICRO_USD');
    expect(harness).toMatch(/const runStartHeld = heldAllTimeMicroUsd\(/);
  });

  it('never prints the token or the key directly', () => {
    // Every console call goes through the output helper, which scrubs.
    const direct = harness.split(/\r?\n/).filter((l) => /\bconsole\.(log|info|warn|error)\s*\(/.test(l));
    expect(direct.length).toBeLessThanOrEqual(1);
    expect(harness).not.toMatch(/ANTHROPIC_API_KEY|\.env\.local/);
  });

  it('the live config runs only *.live.ts files', () => {
    expect(config).toContain("include: ['scripts/llm/**/*.live.ts']");
    expect(config).toContain('fileParallelism: false');
  });
});

// ---------------------------------------------------------------------------
// The committed live results (Plan 44-09). The record is either a recorded run, or the owner declined or
// deferred the paid run; in every case a domain that did not run is never reported as passed.
// ---------------------------------------------------------------------------

describe('pinned live results', () => {
  const file = path.join(REPO_ROOT, '.planning', 'phases', '44-live-verification-and-tone-eval', '44-live-results.json');
  const text = fs.readFileSync(file, 'utf8');
  const record = JSON.parse(text);

  const walk = (value, visit) => {
    if (typeof value === 'string') visit(value);
    else if (Array.isArray(value)) for (const v of value) walk(v, visit);
    else if (value && typeof value === 'object') for (const v of Object.values(value)) walk(v, visit);
  };

  it('has a recorded, declined or deferred status', () => {
    expect(['recorded', 'declined', 'deferred']).toContain(record.status);
  });

  it('lists every PROOF_STEP exactly once, in order, each with a result', () => {
    expect(record.steps.map((s) => s.step)).toEqual([...PROOF_STEPS]);
    for (const s of record.steps) {
      expect(typeof s.jobStatus, s.step).toBe('string');
      expect(typeof s.ok, s.step).toBe('boolean');
    }
  });

  it('stores domain verdicts that match the steps; a not-run or skipped domain fails the overall verdict', () => {
    const recomputed = proofVerdict(record.steps);
    if (record.status === 'recorded') {
      expect(record.verdict.domains).toEqual(recomputed.domains);
      expect(record.verdict.pass).toBe(recomputed.pass);
    } else {
      // Declined or deferred: nothing ran, so every domain is not_run, nothing passed, and the recomputed verdict fails too.
      expect(record.steps.every((s) => s.ok === false && s.jobStatus === 'not_run')).toBe(true);
      expect(record.verdict.pass).toBe(false);
      expect(record.verdict.notRun).toEqual(Object.keys(PROOF_DOMAINS));
      expect(record.verdict.failed).toEqual([]);
      for (const domain of Object.keys(PROOF_DOMAINS)) expect(record.verdict.domains[domain], domain).toBe('not_run');
      expect(recomputed.pass).toBe(false);
      expect(Object.values(recomputed.domains)).not.toContain('passed');
    }
    if (record.verdict.notRun.length > 0 || record.verdict.failed.length > 0) expect(record.verdict.pass).toBe(false);
  });

  it('a declined or deferred record carries no run window, no job, no report and states the requirement is human_needed', () => {
    if (record.status === 'recorded') return;
    expect(record.window).toBeNull();
    expect(record.jobs).toEqual([]);
    expect(record.jobIds).toEqual({});
    expect(record.report.status).toBe('not_run');
    expect(record.requirementStatus).toBe('human_needed');
    expect(record.mode).toBe('none');
    expect(typeof record.reason).toBe('string');
  });

  it('a recorded run lists the routes in LLM_ROUTE_NAMES order with ordered percentiles and a window start before its end', () => {
    if (record.status !== 'recorded') return;
    const routes = record.report.routes.map((r) => r.route);
    expect(routes.slice(0, LLM_ROUTE_NAMES.length)).toEqual([...LLM_ROUTE_NAMES]);
    for (const r of record.report.routes) {
      if (r.n > 0) {
        expect(r.p50, r.route).toBeLessThanOrEqual(r.p95);
        expect(r.p95, r.route).toBeLessThanOrEqual(r.p99);
      }
    }
    expect(record.window.startMs).toBeLessThanOrEqual(record.window.endMs);
    expect(burstSampleVerdict(record.burst.okCount).indicative).toBe(record.burst.indicative);
  });

  it('only ever names the scratch database on the local target', () => {
    expect(record.database).toBe('uwr-verify');
    expect(record.target).toBe('local');
    expect(text.toLowerCase()).not.toContain('maincloud');
  });

  it('holds no key-shaped string and no token, and every excerpt is at most 120 characters', () => {
    expect(text).not.toMatch(/sk-ant-[A-Za-z0-9_-]{8,}/);
    expect(text).not.toMatch(/eyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}/);
    for (const s of record.steps) if (typeof s.note === 'string') expect(s.note.length, s.step).toBeLessThanOrEqual(PROOF_EXCERPT_MAX);
    for (const b of record.burst.samples ?? []) {
      if (typeof b.excerpt === 'string') expect(b.excerpt.length).toBeLessThanOrEqual(PROOF_EXCERPT_MAX);
    }
    if (record.status === 'recorded') {
      walk(record.observedChecks, (s) => expect(s.length).toBeLessThanOrEqual(PROOF_EXCERPT_MAX));
    }
  });

  it('keeps any recorded spend within the $1.80 stop of the $2.00 run cap', () => {
    const stop = PROOF_RUN_CAP_MICRO_USD - PROOF_SPEND_MARGIN_MICRO_USD;
    const spent = record.report?.totals?.recomputedCostMicroUsd;
    if (record.status === 'recorded' && spent !== undefined) expect(BigInt(spent) <= stop).toBe(true);
    expect(BigInt(Math.round(Number(record.preparation?.costBound?.worstCaseUsd ?? 0) * 1e6)) <= stop).toBe(true);
  });
});
