// Run from the repo root: pnpm exec vitest run --maxWorkers=1 scripts/llm/drill_rules.test.mjs
// Pure rules for the live failure drills (Plan 44-06, QUAL-03), plus static guards on the harness source.
// Nothing here touches the network, a key or a token.

import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

import { REPO_ROOT, keyFormatOk, loadAnthropicKey, scrub } from './cli.mjs';
import { CREATION_ORDER } from './proof_rules.mjs';
import {
  CEILING_DRILL_MICRO_USD,
  DRILLS,
  DRILL_DB,
  DRILL_PLAN,
  DRILL_STATUSES,
  DRILL_STEPS,
  TINY_TIMEOUT_MS,
  assertDrillDb,
  assertRestored,
  drillRecord,
  failedJobProblems,
  isDrillDb,
  isGeneratingStep,
  leakHits,
  localRefusalProblems,
  lockProblems,
  makeFakeKey,
  parseDrillsOnly,
  resolveDrillMode,
  timeoutLedgerProblems,
  zeroSpendProblems,
} from './drill_rules.mjs';
import { LLM_DAILY_CEILING_MIN_MICRO_USD } from '../../spacetimedb/src/data/llm_limits.ts';
import { LLM_ROUTES } from '../../spacetimedb/src/data/llm_routes.ts';

// ---------------------------------------------------------------------------
// Test 1: the drill database guard
// ---------------------------------------------------------------------------

describe('assertDrillDb', () => {
  it('accepts uwr-verify and nothing else', () => {
    expect(assertDrillDb('uwr-verify')).toBe('uwr-verify');
    expect(DRILL_DB).toBe('uwr-verify');
    expect(isDrillDb('uwr-verify')).toBe(true);
  });

  it.each(['uwr', '', 'UWR-VERIFY', 'Uwr-Verify', 'uwr-verify ', ' uwr-verify', 'uwr-verify2', 'prod', 'maincloud', undefined, null, 5, {}])(
    'refuses %j',
    (name) => {
      expect(() => assertDrillDb(name)).toThrow(/scratch database/);
      expect(isDrillDb(name)).toBe(false);
    },
  );

  it('does not echo the refused value', () => {
    expect(() => assertDrillDb('some-secret-name')).toThrow(/^((?!some-secret-name).)*$/s);
  });
});

describe('resolveDrillMode and parseDrillsOnly', () => {
  it('unset or empty is dry, run is live, anything else throws', () => {
    expect(resolveDrillMode(undefined)).toBe('dry');
    expect(resolveDrillMode('')).toBe('dry');
    expect(resolveDrillMode('run')).toBe('run');
    for (const bad of ['1', 'true', 'RUN', 'dry', 'yes']) expect(() => resolveDrillMode(bad)).toThrow(/DRILLS_LIVE_RUN/);
  });

  it('a dry run with no list names every step; a live run needs a list', () => {
    expect(parseDrillsOnly(undefined, 'dry')).toEqual([...DRILL_STEPS]);
    expect(parseDrillsOnly('', 'dry')).toEqual([...DRILL_STEPS]);
    expect(() => parseDrillsOnly(undefined, 'run')).toThrow(/DRILLS_ONLY is required/);
    expect(() => parseDrillsOnly('  ', 'run')).toThrow(/DRILLS_ONLY is required/);
  });

  it('keeps the canonical order whatever the list order, and refuses unknown names', () => {
    expect(parseDrillsOnly('kill_switch, bad_key_401', 'run')).toEqual(['bad_key_401', 'kill_switch']);
    expect(parseDrillsOnly('restore_check', 'run')).toEqual(['restore_check']);
    expect(() => parseDrillsOnly('bad_key_401,uwr', 'run')).toThrow(/unknown drill/);
    expect(() => parseDrillsOnly('ceiling,', 'run')).toThrow(/unknown drill/);
  });
});

describe('the drill constants', () => {
  it('names the four drills, frozen, then the restore check', () => {
    expect([...DRILLS]).toEqual(['bad_key_401', 'ceiling', 'kill_switch', 'tiny_timeout']);
    expect([...DRILL_STEPS]).toEqual([...DRILLS, 'restore_check']);
    expect(Object.isFrozen(DRILLS)).toBe(true);
    expect(Object.isFrozen(DRILL_STEPS)).toBe(true);
    for (const name of DRILL_STEPS) expect(DRILL_PLAN[name], name).toBeDefined();
  });

  it('the ceiling drill value is the module minimum, read from the server constant', () => {
    expect(CEILING_DRILL_MICRO_USD).toBe(LLM_DAILY_CEILING_MIN_MICRO_USD);
    expect(CEILING_DRILL_MICRO_USD).toBe(10_000n);
  });

  it('the tiny timeout is far under the real creation_race timeout', () => {
    expect(TINY_TIMEOUT_MS).toBe(50);
    expect(TINY_TIMEOUT_MS).toBeLessThan(LLM_ROUTES.creation_race.timeoutMs);
  });

  it('only the 401 and timeout drills are planned to reach the provider, and every plan is expected free', () => {
    expect(DRILLS.filter((d) => DRILL_PLAN[d].reachesProvider)).toEqual(['bad_key_401', 'tiny_timeout']);
    for (const name of DRILL_STEPS) expect(DRILL_PLAN[name].expectedCostMicroUsd).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// Test 2: the fake key
// ---------------------------------------------------------------------------

describe('makeFakeKey', () => {
  it('passes the key format check so the module accepts it', () => {
    expect(keyFormatOk(makeFakeKey())).toBe(true);
  });

  it('is deterministic enough to compare, and is never the real key', () => {
    const fake = makeFakeKey();
    expect(fake).toBe(makeFakeKey());
    const real = loadAnthropicKey();
    if (real !== null) expect(fake).not.toBe(real);
    expect(fake).not.toBe(['sk', '-ant-'].join(''));
  });

  it('is redacted by scrub when printed, and by the key shape alone', () => {
    const fake = makeFakeKey();
    expect(scrub('key ' + fake + ' set')).not.toContain(fake);
    expect(scrub('key ' + fake + ' set')).toContain('[REDACTED]');
    expect(scrub('key ' + fake + ' set', [fake])).not.toContain(fake);
  });
});

// ---------------------------------------------------------------------------
// Test 3: the restore assertion
// ---------------------------------------------------------------------------

describe('assertRestored', () => {
  const expected = { keyLength: 108n, ceilingMicroUsd: 10_000_000n };
  const good = { keySet: true, keyLength: 108n, dailyCeilingMicroUsd: 10_000_000n, llmEnabled: true };

  it('returns no problems only when everything is restored', () => {
    expect(assertRestored(good, expected)).toEqual([]);
  });

  it('accepts numbers and digit strings for the same values', () => {
    expect(assertRestored({ ...good, keyLength: 108, dailyCeilingMicroUsd: '10000000' }, { keyLength: 108, ceilingMicroUsd: 10_000_000 })).toEqual([]);
  });

  it('names each deviation', () => {
    expect(assertRestored({ ...good, keySet: false }, expected)).toEqual(['key_not_set']);
    expect(assertRestored({ ...good, keyLength: 107n }, expected)).toEqual(['key_length_mismatch']);
    expect(assertRestored({ ...good, keyLength: 109n }, expected)).toEqual(['key_length_mismatch']);
    expect(assertRestored({ ...good, dailyCeilingMicroUsd: 10_000n }, expected)).toEqual(['ceiling_not_restored']);
    expect(assertRestored({ ...good, dailyCeilingMicroUsd: 10_000_001n }, expected)).toEqual(['ceiling_not_restored']);
    expect(assertRestored({ ...good, llmEnabled: false }, expected)).toEqual(['kill_switch_off']);
  });

  it('a fake key still stored (length differs) is a mismatch, not a pass', () => {
    expect(assertRestored({ ...good, keyLength: BigInt(makeFakeKey().length) }, expected)).toContain('key_length_mismatch');
  });

  it('reports every deviation at once', () => {
    const all = assertRestored({ keySet: false, keyLength: 0n, dailyCeilingMicroUsd: 10_000n, llmEnabled: false }, expected);
    expect(all).toEqual(['key_not_set', 'key_length_mismatch', 'ceiling_not_restored', 'kill_switch_off']);
  });

  it('refuses to pass when the expectation itself is unknown or the row is missing', () => {
    expect(assertRestored(good, { keyLength: undefined, ceilingMicroUsd: 10_000_000n })).toContain('expected_key_length_unknown');
    expect(assertRestored(good, { keyLength: 0n, ceilingMicroUsd: 10_000_000n })).toContain('expected_key_length_unknown');
    expect(assertRestored(good, { keyLength: 108n, ceilingMicroUsd: undefined })).toContain('expected_ceiling_unknown');
    expect(assertRestored(undefined, expected)).toEqual(['status_missing']);
    expect(assertRestored(null, expected)).toEqual(['status_missing']);
  });

  it('a kill switch that is merely truthy does not count as on', () => {
    expect(assertRestored({ ...good, llmEnabled: 1 }, expected)).toEqual(['kill_switch_off']);
    expect(assertRestored({ ...good, llmEnabled: undefined }, expected)).toEqual(['kill_switch_off']);
  });
});

// ---------------------------------------------------------------------------
// Test 4: zero spend
// ---------------------------------------------------------------------------

describe('zeroSpendProblems', () => {
  const row = (over = {}) => ({
    route: 'creation_race',
    outcome: 'auth',
    input_tokens: 0n,
    output_tokens: 0n,
    cache_write_tokens: 0n,
    cache_read_tokens: 0n,
    cost_micro_usd: 0n,
    ...over,
  });

  it('no problem for a 401 row with zero tokens and zero cost', () => {
    expect(zeroSpendProblems([row()])).toEqual([]);
  });

  it('no problem for a timeout row with zero tokens, even though its cost is the reservation stand-in', () => {
    expect(zeroSpendProblems([row({ outcome: 'timeout', cost_micro_usd: 20_108n })])).toEqual([]);
  });

  it('no rows is no problem', () => {
    expect(zeroSpendProblems([])).toEqual([]);
    expect(zeroSpendProblems(undefined)).toEqual([]);
  });

  it.each(['input_tokens', 'output_tokens', 'cache_write_tokens', 'cache_read_tokens'])('a non-zero %s is a problem, even on a timeout row', (col) => {
    expect(zeroSpendProblems([row({ [col]: 1n })])).toHaveLength(1);
    expect(zeroSpendProblems([row({ outcome: 'timeout', [col]: 1n })])).toHaveLength(1);
    expect(zeroSpendProblems([row({ [col]: 1n })])[0]).toContain(col);
  });

  it('a non-zero cost is a problem on every outcome except the timeout stand-in', () => {
    expect(zeroSpendProblems([row({ cost_micro_usd: 1n })])).toHaveLength(1);
    expect(zeroSpendProblems([row({ outcome: 'ok', cost_micro_usd: 5n })])).toHaveLength(1);
    expect(zeroSpendProblems([row({ outcome: 'network', cost_micro_usd: 5n })])).toHaveLength(1);
  });

  it('accepts numbers and digit strings and flags a value that is not a number', () => {
    expect(zeroSpendProblems([row({ input_tokens: 0, cost_micro_usd: '0' })])).toEqual([]);
    expect(zeroSpendProblems([row({ input_tokens: 'abc' })])[0]).toContain('not a number');
    expect(zeroSpendProblems([row({ cost_micro_usd: -1 })])[0]).toContain('not a number');
  });

  it('counts every offending row and every offending column', () => {
    const problems = zeroSpendProblems([row({ input_tokens: 3n, output_tokens: 4n }), row(), row({ cost_micro_usd: 9n })]);
    expect(problems).toHaveLength(3);
    expect(problems.some((p) => p.startsWith('row 2'))).toBe(true);
    expect(problems.some((p) => p.startsWith('row 1'))).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Per-drill observation rules
// ---------------------------------------------------------------------------

describe('lockProblems and isGeneratingStep', () => {
  it('the lock released back to the waiting step is clean', () => {
    expect(lockProblems('AWAITING_RACE', 'AWAITING_RACE')).toEqual([]);
  });

  it('a generating step is stuck, any other step is not the waiting step', () => {
    expect(lockProblems('GENERATING_RACE', 'AWAITING_RACE')).toEqual(['stuck_generating']);
    expect(lockProblems('GENERATING_CLASS', 'AWAITING_ARCHETYPE')).toEqual(['stuck_generating']);
    expect(lockProblems('CLASS_FILLING', 'AWAITING_ARCHETYPE')).toEqual(['stuck_generating']);
    expect(lockProblems('AWAITING_ARCHETYPE', 'AWAITING_RACE')).toEqual(['not_at_waiting_step']);
    expect(lockProblems(undefined, 'AWAITING_RACE')).toEqual(['not_at_waiting_step']);
  });

  it('refuses an unknown waiting step', () => {
    expect(lockProblems('AWAITING_RACE', 'NOT_A_STEP')).toContain('waiting_step_unknown');
  });

  it('the generating steps are real creation steps', () => {
    for (const step of ['GENERATING_RACE', 'GENERATING_CLASS', 'CLASS_FILLING']) {
      expect(CREATION_ORDER).toContain(step);
      expect(isGeneratingStep(step)).toBe(true);
    }
    for (const step of ['AWAITING_RACE', 'AWAITING_ARCHETYPE', 'CLASS_FILL_ERROR', 'CONFIRMING', undefined, null]) {
      expect(isGeneratingStep(step), String(step)).toBe(false);
    }
  });
});

describe('failedJobProblems', () => {
  const want = { route: 'creation_race', bucket: 'unavailable' };
  it('a failed job on the route with the coarse bucket is clean', () => {
    expect(failedJobProblems({ route: 'creation_race', status: 'failed', errorCode: 'unavailable' }, want)).toEqual([]);
  });
  it('names a missing job, a wrong route, a wrong status and a wrong bucket', () => {
    expect(failedJobProblems(undefined, want)).toEqual(['job_missing']);
    expect(failedJobProblems({ route: 'world_gen', status: 'failed', errorCode: 'unavailable' }, want)).toEqual(['wrong_route']);
    expect(failedJobProblems({ route: 'creation_race', status: 'pending', errorCode: 'unavailable' }, want)).toEqual(['job_not_failed']);
    expect(failedJobProblems({ route: 'creation_race', status: 'failed', errorCode: 'transient' }, want)).toEqual(['wrong_bucket']);
    // The raw failure class must never be what the player view carries.
    expect(failedJobProblems({ route: 'creation_race', status: 'failed', errorCode: 'auth' }, want)).toEqual(['wrong_bucket']);
  });
});

describe('leakHits', () => {
  it('an in-voice line trips nothing, including the word narrate', () => {
    expect(leakHits('The Keeper loses the thread. Say anything and he will narrate it again.')).toEqual([]);
    expect(leakHits('The Keeper is unavailable at the moment. Try again shortly.')).toEqual([]);
    expect(leakHits('')).toEqual([]);
    expect(leakHits(undefined)).toEqual([]);
  });

  it.each([
    ['Error 401 from the server', 'http_status'],
    ['HTTP 529 overloaded', 'http_word'],
    ['Claude refused', 'provider_name'],
    ['Anthropic says no', 'provider_name'],
    ['your API key is bad', 'api_key'],
    ['rate limit hit', 'rate_limit'],
    ['billing problem', 'billing'],
    ['the daily ceiling is reached', 'spend_cap'],
    ['unauthorized', 'unauthorized'],
    ['the kill switch is off', 'kill_switch'],
  ])('flags %j as %s', (text, id) => {
    expect(leakHits(text)).toContain(id);
  });
});

describe('localRefusalProblems', () => {
  it('no job and no call-log row is clean', () => {
    expect(localRefusalProblems({ newJobCount: 0, newCallRowCount: 0 })).toEqual([]);
  });
  it('a job or a call-log row means the module did not refuse before the call', () => {
    expect(localRefusalProblems({ newJobCount: 1, newCallRowCount: 0 })).toEqual(['job_created']);
    expect(localRefusalProblems({ newJobCount: 0, newCallRowCount: 1 })).toEqual(['call_row_created']);
    expect(localRefusalProblems({ newJobCount: 2, newCallRowCount: 3 })).toEqual(['job_created', 'call_row_created']);
  });
});

describe('timeoutLedgerProblems', () => {
  const before = { phaseSpentMicroUsd: 0n, phaseReservedMicroUsd: 0n };
  const after = { phaseSpentMicroUsd: 20_108n, phaseReservedMicroUsd: 0n };
  const row = { outcome: 'timeout', cost_micro_usd: 20_108n };

  it('the reservation is the ledger stand-in and nothing is still held', () => {
    expect(timeoutLedgerProblems(before, after, row)).toEqual([]);
  });

  it('names each deviation', () => {
    expect(timeoutLedgerProblems(before, after, undefined)).toEqual(['timeout_row_missing']);
    expect(timeoutLedgerProblems(before, after, { ...row, outcome: 'auth' })).toEqual(['outcome_not_timeout']);
    expect(timeoutLedgerProblems(before, after, { ...row, cost_micro_usd: 0n })).toContain('stand_in_missing');
    expect(timeoutLedgerProblems(before, { ...after, phaseSpentMicroUsd: 20_107n }, row)).toEqual(['ledger_stand_in_mismatch']);
    expect(timeoutLedgerProblems(before, { ...after, phaseReservedMicroUsd: 5n }, row)).toEqual(['reservation_still_held']);
  });
});

// ---------------------------------------------------------------------------
// Test 5: the drill record
// ---------------------------------------------------------------------------

describe('drillRecord', () => {
  const allPassed = DRILL_STEPS.map((name) => ({ name, status: 'passed' }));

  it('is passed only when all four drills and the restore check passed', () => {
    const rec = drillRecord(allPassed);
    expect(rec.overall).toBe('passed');
    expect(rec.drills.map((d) => d.name)).toEqual([...DRILL_STEPS]);
    expect(rec.drills.every((d) => d.status === 'passed')).toBe(true);
  });

  it('a drill that did not run is not_run, never passed, and the overall is not passed', () => {
    const rec = drillRecord(allPassed.filter((e) => e.name !== 'tiny_timeout'));
    expect(rec.drills.find((d) => d.name === 'tiny_timeout').status).toBe('not_run');
    expect(rec.overall).not.toBe('passed');
    expect(rec.overall).toBe('not_run');
  });

  it('an empty or malformed input is all not_run', () => {
    for (const input of [[], undefined, null, 'x', [null, 5, {}]]) {
      const rec = drillRecord(input);
      expect(rec.drills.every((d) => d.status === 'not_run')).toBe(true);
      expect(rec.overall).toBe('not_run');
    }
  });

  it('missing the restore check alone keeps the overall from passing', () => {
    expect(drillRecord(allPassed.filter((e) => e.name !== 'restore_check')).overall).not.toBe('passed');
  });

  it('an unknown status is not_run, never passed', () => {
    const rec = drillRecord([...allPassed.slice(0, 3), { name: 'tiny_timeout', status: 'PASSED' }, { name: 'restore_check', status: 'ok' }]);
    expect(rec.drills.find((d) => d.name === 'tiny_timeout').status).toBe('not_run');
    expect(rec.drills.find((d) => d.name === 'restore_check').status).toBe('not_run');
    expect(rec.overall).not.toBe('passed');
  });

  it('a deliberate deferral or decline is recorded as such and the overall is not passed', () => {
    const deferred = drillRecord(DRILL_STEPS.map((name) => ({ name, status: 'deferred', reason: 'deferred at the cost checkpoint' })));
    expect(deferred.overall).toBe('deferred');
    expect(deferred.drills.every((d) => d.status === 'deferred' && d.reason === 'deferred at the cost checkpoint')).toBe(true);
    const declined = drillRecord(DRILL_STEPS.map((name) => ({ name, status: 'declined', reason: 'declined at the cost checkpoint' })));
    expect(declined.overall).toBe('declined');
  });

  it('a failed drill makes the overall failed even next to deferred ones', () => {
    const rec = drillRecord([{ name: 'ceiling', status: 'failed' }, { name: 'kill_switch', status: 'deferred' }]);
    expect(rec.overall).toBe('failed');
  });

  it('the last entry for a name wins', () => {
    const rec = drillRecord([{ name: 'ceiling', status: 'failed' }, { name: 'ceiling', status: 'passed' }]);
    expect(rec.drills.find((d) => d.name === 'ceiling').status).toBe('passed');
  });

  it('has a fixed key order and keeps only a short reason and scalar evidence', () => {
    const rec = drillRecord([
      {
        name: 'bad_key_401',
        status: 'failed',
        reason: 'r'.repeat(1000),
        evidence: { z: 1n, a: 'x'.repeat(1000), nested: { no: true }, ok: true, lines: ['one', 'two'] },
      },
    ]);
    expect(Object.keys(rec)).toEqual(['plan', 'database', 'overall', 'drills']);
    const first = rec.drills[0];
    expect(Object.keys(first)).toEqual(['name', 'status', 'reason', 'evidence']);
    expect(first.reason.length).toBeLessThanOrEqual(240);
    expect(Object.keys(first.evidence)).toEqual(['a', 'lines', 'ok', 'z']);
    expect(first.evidence.a.length).toBeLessThanOrEqual(200);
    expect(first.evidence.z).toBe('1');
    expect(first.evidence.nested).toBeUndefined();
    expect(JSON.stringify(rec)).toBeTypeOf('string'); // no BigInt survives
  });

  it('only five statuses exist and only one of them is a pass', () => {
    expect([...DRILL_STATUSES]).toEqual(['passed', 'failed', 'not_run', 'deferred', 'declined']);
  });
});

// ---------------------------------------------------------------------------
// Test 6: static guards on the harness source (T-44-06-01, T-44-06-02, T-44-06-03)
// ---------------------------------------------------------------------------

describe('the drill harness source', () => {
  const harness = fs.readFileSync(path.join(REPO_ROOT, 'scripts', 'llm', 'drills.live.ts'), 'utf8');

  it('asserts the database through assertDrillDb( and never names the hosted target', () => {
    expect(harness).toContain('assertDrillDb(');
    expect(harness.toLowerCase()).not.toContain('maincloud');
    expect(harness).toContain('TARGETS.local');
    expect(harness).toContain("TARGET.httpBase.startsWith('http://127.0.0.1')");
  });

  it('holds no quoted database name: the scratch name comes from the rules module', () => {
    expect(harness).not.toMatch(/['"`]uwr(-verify)?['"`]/);
    expect(harness).not.toMatch(/withDatabaseName\(\s*['"`]/);
    expect(harness).toContain('withDatabaseName(DB_NAME)');
  });

  it('reads the mode from DRILLS_LIVE_RUN, with unset meaning dry', () => {
    expect(harness).toContain('resolveDrillMode(process.env.DRILLS_LIVE_RUN)');
    expect(harness).toContain('DRILLS_ONLY');
    // The dry branch returns before any reducer is called.
    const dryEnd = harness.search(/conn\.disconnect\(\);\s*return;/);
    expect(dryEnd).toBeGreaterThan(0);
    expect(harness.slice(0, dryEnd)).not.toMatch(/\.reducers\./);
    expect(harness.slice(0, dryEnd)).not.toMatch(/callReducerHttp\(/);
  });

  it('puts a finally block around every drill state change', () => {
    for (const name of DRILLS) {
      const start = harness.indexOf('      ' + name + ': async () => {');
      expect(start, 'runner for ' + name).toBeGreaterThan(0);
      const next = DRILLS.map((n) => harness.indexOf('      ' + n + ': async () => {')).filter((i) => i > start).sort((a, b) => a - b)[0];
      const restoreStart = harness.indexOf('      restore_check: async () => {');
      const end = next ?? restoreStart;
      const body = harness.slice(start, end);
      expect(body, name).toMatch(/\btry\s*\{/);
      expect(body, name).toMatch(/\bfinally\s*\{/);
    }
  });

  it('restores through the key script and the reducers, never a direct table write', () => {
    expect(harness).toContain('set-key.mjs');
    expect(harness).toContain("'--db'");
    expect(harness).toContain('llm_set_enabled');
    expect(harness).toContain('llm_set_daily_ceiling');
    expect(harness).toMatch(/callReducerHttp\(/);
    expect(harness).not.toMatch(/\.db\.\w+\.(insert|update|delete)\(/);
    expect(harness).not.toMatch(/llm_config|llmConfig/);
  });

  it('reads the call log through fetchCallLogRows and the restore state from admin_llm_status', () => {
    expect(harness).toContain('fetchCallLogRows(');
    expect(harness).toContain('adminLlmStatus');
    expect(harness).toContain('assertRestored(');
    expect(harness).toContain('zeroSpendProblems(');
    expect(harness).toContain('drillRecord(');
  });

  it('never prints the token or the key directly', () => {
    const direct = harness.split(/\r?\n/).filter((l) => /\bconsole\.(log|info|warn|error)\s*\(/.test(l));
    expect(direct.length).toBeLessThanOrEqual(1);
    expect(harness).not.toMatch(/\.env\.local/);
    // The fake key comes from the rules module, never from a literal here.
    expect(harness).toContain('makeFakeKey()');
    expect(harness).not.toMatch(/sk-ant/);
  });

  it('never stages or commits anything and spawns only fixed argument arrays', () => {
    expect(harness).not.toMatch(/git\s+(add|commit|push)/);
    expect(harness).not.toMatch(/shell:\s*true/);
    expect(harness).not.toMatch(/exec\(|execSync\(/);
  });
});
