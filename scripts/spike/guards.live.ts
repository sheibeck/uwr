// Guard tests for the Phase 39 harness. Need no server and spend nothing.
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';

import { findSecretLeaks } from '../../spacetimedb/src/helpers/measurement.ts';
import {
  assertAllowedArgs,
  callArgs,
  deleteArgs,
  deleteSpikeDb,
  describeArgs,
  logsArgs,
  probeUwrArgs,
  probeUwrClean,
  publishArgs,
  scrub,
  sqlArgs,
} from './cli.mjs';
import {
  BUDGET_MICRO_USD,
  LOCAL_RESULTS_PATH,
  MAINCLOUD_DB,
  MAINCLOUD_RESULTS_PATH,
  TARGETS,
  assertSpikeTarget,
  resolveTarget,
} from './config.ts';
import { ResultsStore } from './results-store.ts';

// Fake key assembled from fragments so this file never holds a key-shaped literal.
const FAKE_KEY = ['sk', '-ant-'].join('') + 'x'.repeat(30);
const NEEDLE = 'canary-needle-' + 'z'.repeat(12);

const tmpDirs: string[] = [];
function tmpFile(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'spike-guards-'));
  tmpDirs.push(dir);
  return path.join(dir, 'results.json');
}
afterAll(() => {
  for (const d of tmpDirs) fs.rmSync(d, { recursive: true, force: true });
});

const assertLocal = (a: string[]) => assertAllowedArgs(a, TARGETS.local);

describe('assertAllowedArgs', () => {
  it('refuses publishing to the production database', () => {
    expect(() => assertLocal(['publish', 'uwr', '-p', 'spacetimedb'])).toThrow(/uwr-spike/);
  });

  it('refuses any maincloud argument, case-insensitively', () => {
    expect(() => assertLocal([...publishArgs(TARGETS.local), '--server', 'maincloud'])).toThrow(/maincloud/);
    expect(() => assertLocal(['logs', 'uwr-spike', 'MainCloud'])).toThrow(/maincloud/);
  });

  it('refuses --clear-database and --delete-data', () => {
    expect(() => assertLocal([...publishArgs(TARGETS.local), '--clear-database'])).toThrow();
    expect(() => assertLocal([...publishArgs(TARGETS.local), '--delete-data=always'])).toThrow();
    expect(() => assertLocal([...publishArgs(TARGETS.local), '-c'])).toThrow();
  });

  it('refuses calls against the production database', () => {
    expect(() => assertLocal(['call', '--server', 'local', 'uwr', 'set_api_key', '"x"'])).toThrow(/uwr-spike/);
  });

  it('refuses generating into src/module_bindings', () => {
    expect(() =>
      assertLocal(['generate', '--lang', 'typescript', '--out-dir', 'src/module_bindings', '-p', 'spacetimedb']),
    ).toThrow(/out-dir/);
    expect(() => assertLocal(['generate', '--lang', 'typescript', '-p', 'spacetimedb'])).toThrow(/out-dir/);
  });

  it('refuses a server other than local and unknown subcommands', () => {
    expect(() => assertLocal(['call', '--server', 'other', 'uwr-spike', 'spike_ping'])).toThrow(/server/);
    expect(() => assertLocal(['login'])).toThrow(/subcommand/);
  });

  it('refuses -y on publish', () => {
    expect(() => assertLocal([...publishArgs(TARGETS.local), '-y'])).toThrow();
  });

  it('accepts the exact publishSpike argument list', () => {
    expect(() => assertLocal(publishArgs(TARGETS.local))).not.toThrow();
  });

  it('accepts a call, logs and generate into scripts/spike/bindings against uwr-spike', () => {
    expect(() => assertLocal(['call', '--server', 'local', '--no-config', 'uwr-spike', 'spike_set_key', '"-c"'])).not.toThrow();
    expect(() => assertLocal(['logs', '--server', 'local', '--no-config', 'uwr-spike'])).not.toThrow();
    expect(() =>
      assertLocal(['generate', '--lang', 'typescript', '--out-dir', 'scripts/spike/bindings', '-p', 'spacetimedb', '--no-config']),
    ).not.toThrow();
  });
});

describe('assertSpikeTarget', () => {
  it('refuses the production database and maincloud on the local target', () => {
    expect(() => assertSpikeTarget('uwr', 'local', TARGETS.local)).toThrow();
    expect(() => assertSpikeTarget('uwr-spike', 'maincloud', TARGETS.local)).toThrow();
    expect(() => assertSpikeTarget('uwr-spike', 'local', TARGETS.local)).not.toThrow();
  });

  it('accepts only the exact maincloud pair on the maincloud target', () => {
    expect(() => assertSpikeTarget('uwr-spike-925iv', 'maincloud', TARGETS.maincloud)).not.toThrow();
    expect(() => assertSpikeTarget('uwr', 'maincloud', TARGETS.maincloud)).toThrow();
    expect(() => assertSpikeTarget('uwr-spike', 'maincloud', TARGETS.maincloud)).toThrow();
    expect(() => assertSpikeTarget('uwr-spike-925iv', 'local', TARGETS.maincloud)).toThrow();
  });
});

describe('resolveTarget', () => {
  it('maps unset, empty and local to the local target', () => {
    expect(resolveTarget(undefined)).toBe(TARGETS.local);
    expect(resolveTarget('')).toBe(TARGETS.local);
    expect(resolveTarget('local')).toBe(TARGETS.local);
  });

  it('maps maincloud to the maincloud target', () => {
    expect(resolveTarget('maincloud')).toBe(TARGETS.maincloud);
  });

  it('throws on any other value', () => {
    for (const v of ['MAINCLOUD', 'prod', 'uwr', 'Local', ' maincloud']) {
      expect(() => resolveTarget(v)).toThrow(/SPIKE_TARGET/);
    }
  });

  it('keeps the local target unchanged and pins the maincloud one', () => {
    expect(TARGETS.local).toMatchObject({ db: 'uwr-spike', server: 'local', wsUri: 'ws://127.0.0.1:3000', budget: 2_400_000 });
    expect(TARGETS.local.resultsPath).toBe(LOCAL_RESULTS_PATH);
    expect(LOCAL_RESULTS_PATH.endsWith('39-spike-results.json')).toBe(true);
    expect(TARGETS.maincloud).toMatchObject({
      db: 'uwr-spike-925iv',
      server: 'maincloud',
      wsUri: 'wss://maincloud.spacetimedb.com',
      budget: 1_800_000,
      pingUrl: null,
    });
    expect(MAINCLOUD_DB).toBe('uwr-spike-925iv');
    expect(TARGETS.maincloud.resultsPath).toBe(MAINCLOUD_RESULTS_PATH);
    expect(MAINCLOUD_RESULTS_PATH.endsWith('39-maincloud-results.json')).toBe(true);
  });
});

// Builds a delete argument list without going through deleteArgs (which refuses maincloud).
function deleteArgsRaw(db: string): string[] {
  return ['delete', '--server', 'maincloud', '--no-config', '-y', db];
}

describe('maincloud guard', () => {
  const M = TARGETS.maincloud;
  const L = TARGETS.local;
  const ok = (args: string[]) => expect(() => assertAllowedArgs(args, M)).not.toThrow();
  const bad = (args: string[], re?: RegExp) => expect(() => assertAllowedArgs(args, M)).toThrow(re);

  it('accepts exactly the maincloud publish argument list', () => {
    expect(publishArgs(M)).toEqual(['publish', 'uwr-spike-925iv', '-p', 'spacetimedb', '--server', 'maincloud', '--no-config', '--yes=remote']);
    ok(publishArgs(M));
  });

  it('refuses the maincloud publish list with any token added, removed or changed', () => {
    const exact = publishArgs(M);
    for (let i = 0; i < exact.length; i++) bad(exact.filter((_, j) => j !== i));
    for (const extra of [
      ['-y'], ['--yes'], ['--yes=all'], ['--yes=remote,migrate'], ['--yes=delete-data'], ['--break-clients'],
      ['--delete-data=never'], ['-c'], ['--clear-database'], ['--anonymous'], ['--organization', 'x'], ['--parent', 'x'], ['-b', 'x'],
    ]) {
      bad([...exact, ...extra]);
    }
    bad(exact.map((t) => (t === '--yes=remote' ? '--yes' : t)));
    bad(exact.map((t) => (t === '--yes=remote' ? '--yes=all' : t)));
    bad(exact.map((t) => (t === '--no-config' ? '-y' : t)));
    bad(exact.map((t) => (t === 'spacetimedb' ? 'other' : t)));
  });

  it('refuses publish or call against uwr or uwr-spike', () => {
    bad(['publish', 'uwr', '-p', 'spacetimedb', '--server', 'maincloud', '--no-config', '--yes=remote']);
    bad(['publish', 'uwr-spike', '-p', 'spacetimedb', '--server', 'maincloud', '--no-config', '--yes=remote']);
    bad(['call', '--server', 'maincloud', '--no-config', 'uwr', 'set_api_key', '"x"']);
    bad(['call', '--server', 'maincloud', '--no-config', 'uwr-spike', 'spike_ping']);
    bad(['sql', '--server', 'maincloud', '--no-config', 'uwr', 'SELECT 1']);
  });

  it('refuses delete of any database', () => {
    bad(deleteArgsRaw('uwr-spike-925iv'), /user action/);
    bad(deleteArgsRaw('uwr'), /user action/);
    bad(deleteArgsRaw('uwr-spike'), /user action/);
  });

  it('refuses any server other than the maincloud nickname, and a missing server', () => {
    bad(['call', '--server', 'local', '--no-config', 'uwr-spike-925iv', 'spike_ping'], /server/);
    bad(['call', '-s', 'https://maincloud.spacetimedb.com', '--no-config', 'uwr-spike-925iv', 'spike_ping'], /server/);
    bad(['call', '--server=local', '--no-config', 'uwr-spike-925iv', 'spike_ping'], /server/);
    for (const sub of ['call', 'logs', 'sql', 'describe']) {
      bad([sub, '--no-config', 'uwr-spike-925iv', 'spike_ping'], /server/);
    }
    bad(['publish', 'uwr-spike-925iv', '-p', 'spacetimedb', '--no-config', '--yes=remote'], /publish/);
  });

  it('accepts call, logs, sql and describe against uwr-spike-925iv on maincloud', () => {
    ok(callArgs('spike_ping', [], M));
    ok(logsArgs(M));
    ok(sqlArgs('SELECT * FROM spike_state', M));
    ok(describeArgs(M));
    expect(describeArgs(M)).toEqual(['describe', '--json', '--server', 'maincloud', '--no-config', '-y', 'uwr-spike-925iv']);
  });

  it('refuses --anonymous, --break-clients and yes values on call', () => {
    bad([...callArgs('spike_ping', [], M), '--anonymous']);
    bad([...logsArgs(M), '--anonymous']);
    bad(['call', '--server', 'maincloud', '--no-config', '-y', 'uwr-spike-925iv', 'spike_ping']);
    bad(['call', '--server', 'maincloud', '--no-config', '--yes=remote', 'uwr-spike-925iv', 'spike_ping']);
  });

  it('keeps the generate out-dir rule and the local target refusal of maincloud', () => {
    bad(['generate', '--lang', 'typescript', '--out-dir', 'src/module_bindings', '-p', 'spacetimedb'], /out-dir/);
    expect(() => assertAllowedArgs(callArgs('spike_ping', [], M), L)).toThrow(/maincloud/);
    expect(() => assertAllowedArgs(describeArgs(M), L)).toThrow(/maincloud/);
  });

  it('local target: still refuses maincloud, and requires --server local on server commands', () => {
    expect(() => assertAllowedArgs(publishArgs(M), L)).toThrow(/maincloud/);
    expect(() => assertAllowedArgs(['logs', '--no-config', 'uwr-spike'], L)).toThrow(/server/);
    expect(() => assertAllowedArgs(describeArgs(L), L)).not.toThrow();
    expect(() => assertAllowedArgs(sqlArgs('SELECT 1', L), L)).not.toThrow();
    expect(() => assertAllowedArgs([...publishArgs(L), '--break-clients'], L)).toThrow();
    expect(() => assertAllowedArgs([...publishArgs(L), '--anonymous'], L)).toThrow();
    expect(() => assertAllowedArgs([...publishArgs(L), '--organization', 'x'], L)).toThrow();
    expect(() => assertAllowedArgs([...publishArgs(L), '--parent', 'x'], L)).toThrow();
  });
});

describe('production probe pinning and destructive helpers', () => {
  it('probeUwrArgs pins the local server and never names maincloud', () => {
    const a = probeUwrArgs();
    expect(a).toContain('--server');
    expect(a[a.indexOf('--server') + 1]).toBe('local');
    expect(a.join(' ').toLowerCase()).not.toContain('maincloud');
    expect(a).toContain('uwr');
  });

  it('probeUwrClean, deleteArgs and deleteSpikeDb throw under the maincloud target', () => {
    expect(() => probeUwrClean(TARGETS.maincloud)).toThrow(/local/);
    expect(() => deleteArgs(TARGETS.maincloud)).toThrow(/user action/);
    expect(() => deleteSpikeDb(TARGETS.maincloud)).toThrow(/user action/);
    expect(deleteArgs(TARGETS.local)).toEqual(['delete', '--server', 'local', '--no-config', '-y', 'uwr-spike']);
  });

  it('command-line entry refuses delete and probe-uwr under SPIKE_TARGET=maincloud, and a bogus target', () => {
    const run = (cmd: string, target: string) =>
      spawnSync(process.execPath, ['scripts/spike/cli.mjs', cmd], { encoding: 'utf8', shell: false, env: { ...process.env, SPIKE_TARGET: target } });
    for (const cmd of ['delete', 'probe-uwr']) {
      const r = run(cmd, 'maincloud');
      expect(r.status).not.toBe(0);
      expect((r.stdout ?? '') + (r.stderr ?? '')).toMatch(/guard|user action|local/);
    }
    expect(run('server-up', 'bogus').status).not.toBe(0);
  });
});

describe('scrub', () => {
  it('removes a fragment-assembled fake key and a needle', () => {
    const out = scrub('a ' + FAKE_KEY + ' b ' + NEEDLE + ' c', [NEEDLE]);
    expect(out).not.toContain(FAKE_KEY);
    expect(out).not.toContain(NEEDLE);
    expect(out).toContain('[REDACTED]');
  });
});

describe('ResultsStore', () => {
  it('refuses a value containing a key-shaped string and leaves the file byte-identical', () => {
    const p = tmpFile();
    const store = new ResultsStore(p, []);
    store.set('hop.notes', 'clean');
    const before = fs.readFileSync(p);
    expect(() => store.set('hop.notes', 'contains ' + FAKE_KEY)).toThrow(/refusing/);
    expect(fs.readFileSync(p).equals(before)).toBe(true);
    expect(fs.readdirSync(path.dirname(p))).toEqual(['results.json']);
  });

  it('refuses a bare key prefix and a LEAK_NEEDLE value', () => {
    const p = tmpFile();
    const store = new ResultsStore(p, [NEEDLE]);
    store.set('a', 1);
    const before = fs.readFileSync(p);
    expect(() => store.set('b', ['sk', '-ant-'].join('') + 'short')).toThrow(/refusing/);
    expect(() => store.set('c', 'has ' + NEEDLE + ' inside')).toThrow(/refusing/);
    expect(fs.readFileSync(p).equals(before)).toBe(true);
  });

  it('never echoes the offending content in the error', () => {
    const store = new ResultsStore(tmpFile(), [NEEDLE]);
    try {
      store.set('x', NEEDLE);
      throw new Error('expected a throw');
    } catch (e) {
      expect(String((e as Error).message)).not.toContain(NEEDLE);
    }
  });

  it('accepts a clean value, appends and reads back', () => {
    const p = tmpFile();
    const store = new ResultsStore(p, []);
    expect(store.read()).toEqual({ schemaVersion: 1 });
    store.set('schemaVersion', 1);
    store.set('hop.samplesMs', [1, 2]);
    store.append('hop.samplesMs', [3]);
    expect(store.get('hop.samplesMs')).toEqual([1, 2, 3]);
    expect(findSecretLeaks(fs.readFileSync(p, 'utf8'), { strictPrefix: true }).total).toBe(0);
  });

  it('rejects prototype-polluting paths', () => {
    const store = new ResultsStore(tmpFile(), []);
    expect(() => store.set('__proto__.x', 1)).toThrow();
  });

  it('assertBudget throws above the harness budget', () => {
    const p = tmpFile();
    const store = new ResultsStore(p, []);
    expect(() => store.assertBudget(BUDGET_MICRO_USD)).not.toThrow();
    expect(() => store.assertBudget(BUDGET_MICRO_USD + 1)).toThrow(/budget/);
    store.set('ladder', {
      publicUrl: [],
      models: [],
      reliability: [{ estCostMicroUsd: BUDGET_MICRO_USD - 100 }],
    });
    expect(store.estimatedSpendMicroUsd()).toBe(BUDGET_MICRO_USD - 100);
    expect(() => store.assertBudget(100)).not.toThrow();
    expect(() => store.assertBudget(101)).toThrow(/budget/);
  });
});

describe('set-key.mjs --dry-run', () => {
  it('prints a presence line and never key material', () => {
    const r = spawnSync(process.execPath, ['scripts/spike/set-key.mjs', '--dry-run'], {
      encoding: 'utf8',
      shell: false,
    });
    const all = (r.stdout ?? '') + (r.stderr ?? '');
    expect(findSecretLeaks(all, { strictPrefix: true }).total).toBe(0);
    expect(r.stdout).toMatch(/ANTHROPIC_API_KEY: (missing|present)/);
  });
});
