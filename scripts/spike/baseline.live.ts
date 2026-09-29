// Phase 39 idle ping/tick baseline at the combat cadence, no calls in flight.
// Throwaway: deleted in the phase cleanup plan. Spends nothing.
//
// SPIKE_WINDOW_LABEL (default 'baseline') selects the results slot: 'baseline' sets load.baseline,
// any other label sets load.<label> (for example baseline2, baselineEarly).
import { afterAll, describe, expect, it } from 'vitest';

import { summarize } from '../../spacetimedb/src/helpers/measurement.ts';
import { connectSpike, measureIdleWindow, type Spike } from './harness.ts';
import { ResultsStore } from './results-store.ts';

const LABEL = process.env.SPIKE_WINDOW_LABEL && process.env.SPIKE_WINDOW_LABEL.length > 0 ? process.env.SPIKE_WINDOW_LABEL : 'baseline';

describe('spike idle baseline (no spend)', () => {
  let s: Spike | undefined;
  afterAll(() => s?.close());

  it('records >= 1000 idle pings and >= 55 tick samples with nothing in flight', async () => {
    s = await connectSpike();
    const { window, memory } = await measureIdleWindow(s, LABEL, { minPing: 1000, minTicks: 55, maxMs: 120_000 });

    const store = new ResultsStore();
    if (LABEL === 'baseline') {
      store.set('load.baseline', window);
      if (!Array.isArray(store.get('load.levels'))) store.set('load.levels', []);
      store.append('load.memory', [memory]);
    } else {
      store.set('load.' + LABEL, window);
    }

    console.log('window ' + LABEL + ' serverPid=' + window.serverPid);
    console.log('ping ms: ' + JSON.stringify(summarize(window.pingMs.map((p) => p.ms))));
    console.log('tick lateness ms: ' + JSON.stringify(summarize(window.tick.map((t) => t.lateMs))));
    console.log('memory: ' + JSON.stringify(memory));

    expect(window.pingMs.length).toBeGreaterThanOrEqual(1000);
    expect(window.tick.length).toBeGreaterThanOrEqual(55);
    expect(window.pingMs.every((p) => p.inFlight === 0)).toBe(true);
    expect(window.tick.every((t) => t.inFlight === 0)).toBe(true);
    expect(typeof window.serverPid).toBe('number');
  });
});
