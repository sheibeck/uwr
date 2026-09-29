// Guard tests for the Phase 39 harness. Need no server and spend nothing.
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';

import { findSecretLeaks } from '../../spacetimedb/src/helpers/measurement.ts';
import { assertAllowedArgs, publishArgs, scrub } from './cli.mjs';
import { BUDGET_MICRO_USD, assertSpikeTarget } from './config.ts';
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

describe('assertAllowedArgs', () => {
  it('refuses publishing to the production database', () => {
    expect(() => assertAllowedArgs(['publish', 'uwr', '-p', 'spacetimedb'])).toThrow(/uwr-spike/);
  });

  it('refuses any maincloud argument, case-insensitively', () => {
    expect(() => assertAllowedArgs([...publishArgs(), '--server', 'maincloud'])).toThrow(/maincloud/);
    expect(() => assertAllowedArgs(['logs', 'uwr-spike', 'MainCloud'])).toThrow(/maincloud/);
  });

  it('refuses --clear-database and --delete-data', () => {
    expect(() => assertAllowedArgs([...publishArgs(), '--clear-database'])).toThrow();
    expect(() => assertAllowedArgs([...publishArgs(), '--delete-data=always'])).toThrow();
    expect(() => assertAllowedArgs([...publishArgs(), '-c'])).toThrow();
  });

  it('refuses calls against the production database', () => {
    expect(() => assertAllowedArgs(['call', '--server', 'local', 'uwr', 'set_api_key', '"x"'])).toThrow(/uwr-spike/);
  });

  it('refuses generating into src/module_bindings', () => {
    expect(() =>
      assertAllowedArgs(['generate', '--lang', 'typescript', '--out-dir', 'src/module_bindings', '-p', 'spacetimedb']),
    ).toThrow(/out-dir/);
    expect(() => assertAllowedArgs(['generate', '--lang', 'typescript', '-p', 'spacetimedb'])).toThrow(/out-dir/);
  });

  it('refuses a server other than local and unknown subcommands', () => {
    expect(() => assertAllowedArgs(['call', '--server', 'other', 'uwr-spike', 'spike_ping'])).toThrow(/server/);
    expect(() => assertAllowedArgs(['login'])).toThrow(/subcommand/);
  });

  it('refuses -y on publish', () => {
    expect(() => assertAllowedArgs([...publishArgs(), '-y'])).toThrow();
  });

  it('accepts the exact publishSpike argument list', () => {
    expect(() => assertAllowedArgs(publishArgs())).not.toThrow();
  });

  it('accepts a call, logs and generate into scripts/spike/bindings against uwr-spike', () => {
    expect(() => assertAllowedArgs(['call', '--server', 'local', '--no-config', 'uwr-spike', 'spike_set_key', '"-c"'])).not.toThrow();
    expect(() => assertAllowedArgs(['logs', '--server', 'local', '--no-config', 'uwr-spike'])).not.toThrow();
    expect(() =>
      assertAllowedArgs(['generate', '--lang', 'typescript', '--out-dir', 'scripts/spike/bindings', '-p', 'spacetimedb', '--no-config']),
    ).not.toThrow();
  });
});

describe('assertSpikeTarget', () => {
  it('refuses the production database and maincloud', () => {
    expect(() => assertSpikeTarget('uwr', 'local')).toThrow();
    expect(() => assertSpikeTarget('uwr-spike', 'maincloud')).toThrow();
    expect(() => assertSpikeTarget('uwr-spike', 'local')).not.toThrow();
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
