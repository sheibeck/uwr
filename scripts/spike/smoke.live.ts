// Phase 39 no-spend smoke: connect, ping, direct call, tick probe, CLI identity, environment.
// Throwaway: deleted in the phase cleanup plan. Spends nothing: only noop specs are used.
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';

import { summarize } from '../../spacetimedb/src/helpers/measurement.ts';
import { CLI_IDENTITY } from './config.ts';
import { connectSpike, directCall, ping, resetProbe, serverPid, type Spike } from './harness.ts';
import { ResultsStore } from './results-store.ts';

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

function firstMatch(text: string, re: RegExp): string {
  const m = text.match(re);
  return m ? m[1] : 'unknown';
}

describe('spike smoke (no spend)', () => {
  let s: Spike | undefined;
  afterAll(() => s?.close());

  it('connects, pings, calls, probes ticks, matches the CLI identity and records the environment', async () => {
    s = await connectSpike();
    expect(s.identityHex.length).toBeGreaterThan(0);

    // spike_state is created by spike_reset; ping and the probe need it.
    await resetProbe(s, false);

    // 50 pings all resolve.
    const pings: number[] = [];
    for (let i = 0; i < 50; i++) pings.push(await ping(s, i));
    expect(pings.length).toBe(50);
    const pingSummary = summarize(pings);
    console.log('ping summary (ms): ' + JSON.stringify(pingSummary));

    // Direct call of a noop spec: sender equals the harness identity.
    const dc = await directCall(s, { kind: 'noop', class: 'exploratory' });
    console.log('direct noop: ' + dc.ms.toFixed(1) + ' ms, ok=' + dc.sample.ok);
    expect(dc.data.senderHex).toBe(s.identityHex);
    expect(dc.data.ok).toBe(true);

    // Tick probe: on for 6 s gives at least 4 samples; off for 3 s gives none.
    await resetProbe(s, true);
    await sleep(6000);
    const withProbe = s.ticks.length;
    console.log('tick samples with probe on (6 s): ' + withProbe);
    expect(withProbe).toBeGreaterThanOrEqual(4);
    await resetProbe(s, false);
    await sleep(3000);
    expect(s.ticks.length).toBe(0);

    // CLI identity gate.
    const who = spawnSync(process.execPath, ['scripts/spike/cli.mjs', 'whoami'], { encoding: 'utf8', shell: false });
    const whoOut = (who.stdout ?? '') + '\n' + (who.stderr ?? '');
    const matches = whoOut.includes('spike_whoami sender=' + CLI_IDENTITY);

    // Environment section (written even when the identity check fails, then the test fails).
    const ver = spawnSync('spacetime', ['--version'], { encoding: 'utf8', shell: false });
    const sdkPkg = JSON.parse(fs.readFileSync(path.resolve('spacetimedb/node_modules/spacetimedb/package.json'), 'utf8'));
    const store = new ResultsStore();
    store.set('environment', {
      spacetime: firstMatch(ver.stdout ?? '', /spacetimedb tool version (\S+?);/),
      sdk: String(sdkPkg.version),
      node: process.version,
      os: os.type() + ' ' + os.release(),
      model: 'claude-sonnet-5-5',
      buildTags: ['a'],
      serverPid: serverPid(),
      cliSenderMatchesGate: matches,
      startedAt: new Date().toISOString(),
    });

    if (!matches) {
      const observed = firstMatch(whoOut, /spike_whoami sender=([0-9a-f]+)/i);
      throw new Error(
        'CLI identity mismatch: observed ' + observed + ', expected ' + CLI_IDENTITY +
          '. Stop the phase for a user decision (RESEARCH A3); do not edit CLI_IDENTITY without approval.',
      );
    }
    expect(matches).toBe(true);
  });
});
