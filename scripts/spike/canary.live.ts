// Phase 39 canary-key leak test and first egress check. Throwaway: deleted in the phase cleanup plan.
//
// A fake key-shaped canary is stored through spike_set_key and used by a scheduled and a direct
// Anthropic call (models, so nothing is billable). The leak scanner then must find zero hits for
// the canary in the spacetime logs, the data logs directory, results, out and git. The real
// key must not be introduced before this passes.
import { spawnSync } from 'node:child_process';
import crypto from 'node:crypto';
import { afterAll, describe, expect, it } from 'vitest';

import type { CallSample } from '../../spacetimedb/src/helpers/measurement_results';
import {
  captureFailureDiagnostics,
  captureLogs,
  connectSpike,
  directCall,
  resetProbe,
  runSequential,
  type Spike,
} from './harness.ts';
import { ResultsStore } from './results-store.ts';

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/** Built at runtime from fragments so no key-shaped literal exists in source. Never printed. */
function makeCanary(): string {
  return ['sk', 'ant', 'CANARY', crypto.randomBytes(16).toString('hex')].join('-');
}

function run(script: string, args: string[], canary: string) {
  const r = spawnSync(process.execPath, [script, ...args], {
    encoding: 'utf8',
    shell: false,
    env: { ...process.env, LEAK_NEEDLE: canary },
    maxBuffer: 256 * 1024 * 1024,
  });
  return { status: r.status, out: (r.stdout ?? '') + '\n' + (r.stderr ?? '') };
}

describe('canary key leak scan', () => {
  let s: Spike | undefined;
  afterAll(() => s?.close());

  it('stores a canary key, uses it on a scheduled and a direct call, and finds no leak', async () => {
    const canary = makeCanary();
    const store = new ResultsStore(undefined, [canary]);
    s = await connectSpike();
    await resetProbe(s, false);

    // 1) Store the canary through the CLI-identity gated reducer (env of the child only).
    const set = run('scripts/spike/set-key.mjs', ['--value-from-env', 'LEAK_NEEDLE'], canary);
    expect(set.out).not.toContain(canary);
    expect(set.status).toBe(0);
    expect(set.out).toContain('key stored: yes');

    // 2) Stored-key calls: one scheduled, one direct (class drill; models is not billable),
    //    plus one bad-key minimal messages call (not billable, no stored key used).
    const samples: CallSample[] = [];
    samples.push(
      ...(await runSequential(s, {
        runIdPrefix: 'canary-sched',
        rung: 'canary_models',
        spec: { kind: 'models', class: 'drill' },
        n: 1,
        gapMs: 0,
      })),
    );
    const dc = await directCall(s, { kind: 'models', class: 'drill' });
    samples.push(dc.sample);
    const storedKeySamples = [...samples];
    samples.push(
      ...(await runSequential(s, {
        runIdPrefix: 'canary-badkey',
        rung: 'canary_badkey',
        spec: { kind: 'messages', class: 'drill', route: 'minimal', effort: 'low', keyMode: 'bad' },
        n: 1,
        gapMs: 0,
      })),
    );
    for (const x of samples) {
      console.log(
        'canary sample rung=' + x.rung + ' status=' + x.status + ' threw=' + x.threw + ' failureClass=' + x.failureClass +
          ' e2eMs=' + (x.clientE2eMs === null ? 'null' : x.clientE2eMs.toFixed(0)),
      );
    }

    // 3) Egress check: any throw or missing status is a local-failure candidate. Capture the cause and stop.
    const broken = samples.filter((x) => x.threw || x.status === null);
    if (broken.length > 0) {
      const diag = captureFailureDiagnostics('canary');
      store.append('ladder.diagnostics', diag);
      throw new Error(
        'canary egress failed (' + broken.length + ' of ' + samples.length + ' calls threw or returned no status): ' +
          broken.map((b) => b.errorMessage ?? 'no row').join(' | ').slice(0, 600) +
          '. Diagnostics stored in ladder.diagnostics; per the Local failure rule this is a no-go candidate: stop and surface to the user.',
      );
    }
    for (const x of storedKeySamples) expect(x.status).toBe(401);

    // 4) Leak scan with the canary as the needle.
    await sleep(2000);
    const scan = run('scripts/spike/leak-scan.mjs', ['--require-server'], canary);
    console.log(scan.out.trim());
    expect(scan.out).not.toContain(canary);
    expect(scan.status).toBe(0);
    expect(scan.out).toContain('LEAK-SCAN: CLEAN');
    const lines = scan.out.split(/\r?\n/);
    expect(lines.some((l) => l.startsWith('server-logs: scanned'))).toBe(true);
    expect(lines.some((l) => l.startsWith('data-logs: scanned'))).toBe(true);
    const locationsScanned = lines.filter((l) => /^[a-z-]+: scanned/.test(l)).length;
    const hits = lines
      .filter((l) => /pattern=\d+ needle=\d+/.test(l))
      .reduce((acc, l) => {
        const m = l.match(/pattern=(\d+) needle=(\d+)/);
        return acc + (m ? Number(m[1]) + Number(m[2]) : 0);
      }, 0);
    expect(hits).toBe(0);

    // 5) Record. The store refuses the write if the canary or a key prefix would land in the file.
    store.set('canary', {
      hits,
      locationsScanned,
      fetchReachedAnthropic: storedKeySamples.some((x) => typeof x.status === 'number'),
      statusSeen: storedKeySamples.find((x) => typeof x.status === 'number')?.status ?? null,
    });
    store.append('serverLogs', [captureLogs('canary', 100)]);
  });
});
