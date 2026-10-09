// Run from the repo root: npx vitest run scripts/llm/proof_bound.test.mjs --maxWorkers=1
// Code review B, WR-04 (Phase 51.3.1.2): the owner deferred the "worst-case bound under the stop line" check
// (D-19, 2026-10-09), so the free dry run of the live proof prints the bound and a "deferred by the owner" note and
// never fails on it; the paid mode's own spend checks stay. Pure rules plus a static read of the harness source.
// Nothing here touches the network, a key or a token, and the harness itself is never run.
// (These cases live apart from proof_rules.test.mjs, which fails at collection on the archived Phase 44 results
// file, a pre-existing gap the coordinator tracks.)

import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

import {
  PROOF_BOUND_DEFERRED_NOTE,
  PROOF_RUN_CAP_MICRO_USD,
  PROOF_SPEND_MARGIN_MICRO_USD,
  plannedCallCounts,
  proofBoundReport,
  worstCaseMicroUsd,
} from './proof_rules.mjs';
import { REPO_ROOT } from './cli.mjs';

const STOP = PROOF_RUN_CAP_MICRO_USD - PROOF_SPEND_MARGIN_MICRO_USD;

describe('proofBoundReport (the dry run bound line)', () => {
  it('keeps the caps and the stop line as they are', () => {
    expect(PROOF_RUN_CAP_MICRO_USD).toBe(2_000_000n);
    expect(PROOF_SPEND_MARGIN_MICRO_USD).toBe(200_000n);
    expect(STOP).toBe(1_800_000n);
  });

  it('prints the bound over the stop line with the deferral note, and does not throw', () => {
    const line = proofBoundReport(2_666_937n);
    expect(line).toBe(
      `worst-case bound $2.6669 (2666937 micro-USD) is OVER the $1.8000 stop line; ${PROOF_BOUND_DEFERRED_NOTE}`,
    );
    expect(PROOF_BOUND_DEFERRED_NOTE).toContain('deferred by the owner');
  });

  it('says under when the bound sits under the stop line', () => {
    expect(proofBoundReport(1_327_737n)).toMatch(/^worst-case bound \$1\.3277 \(1327737 micro-USD\) is under the \$1\.8000 stop line; /);
    expect(proofBoundReport(STOP)).toContain(' is OVER the ');
  });

  it('reports today\'s planned bound without failing, whatever it is', () => {
    const bound = worstCaseMicroUsd(plannedCallCounts());
    expect(() => proofBoundReport(bound.total)).not.toThrow();
    expect(proofBoundReport(bound.total)).toContain(`(${bound.total} micro-USD)`);
  });
});

describe('the harness dry run (static read of prove-live.live.ts)', () => {
  const harness = fs.readFileSync(path.join(REPO_ROOT, 'scripts', 'llm', 'prove-live.live.ts'), 'utf8');
  const dryStart = harness.indexOf('    if (DRY) {');
  const dryEnd = harness.indexOf('      return;', dryStart);
  const dry = harness.slice(dryStart, dryEnd);

  it('finds the dry block', () => {
    expect(dryStart).toBeGreaterThan(0);
    expect(dryEnd).toBeGreaterThan(dryStart);
  });

  it('prints the bound with the deferral note and asserts nothing about it', () => {
    expect(dry).toContain('worstCaseBound()');
    expect(dry).toContain('out(proofBoundReport(bound.total));');
    expect(dry).not.toMatch(/expect\(\s*bound\.total/);
    expect(dry).not.toContain('toBeLessThan');
  });

  it('keeps the paid mode spend checks before every paid step', () => {
    const paid = harness.slice(harness.indexOf('const paidStep = (step: string): boolean => {'));
    expect(paid).toMatch(/shouldStopForSpend\(heldTodayMicroUsd\(/);
    expect(paid).toMatch(/shouldStopForRunCap\(runStartHeld, heldAllTimeMicroUsd\(s\), PROOF_RUN_CAP_MICRO_USD, PROOF_SPEND_MARGIN_MICRO_USD\)/);
  });
});
