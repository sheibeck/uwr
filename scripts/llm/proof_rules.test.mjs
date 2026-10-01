// Run from the repo root: pnpm exec vitest run --maxWorkers=1 scripts/llm/proof_rules.test.mjs
// Pure rules for the live-proof harness, plus static guards on the harness source. Nothing here
// touches the network, a key or a token.

import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

import {
  PROOF_EXCERPT_MAX,
  PROOF_SPEND_MARGIN_MICRO_USD,
  PROOF_STEPS,
  excerpt,
  heldTodayMicroUsd,
  isTerminalJobStatus,
  nextProofStep,
  proofCharacterName,
  proofEmail,
  shouldStopForSpend,
  summarizeSmoke,
  todayUtcString,
} from './proof_rules.mjs';
import { REPO_ROOT } from './cli.mjs';

// A sample ceiling for the pure spend rule (the real one is the admin-set daily ceiling).
const CAP = 2_000_000n;

describe('PROOF_STEPS', () => {
  it('is the live-proof order, one step per domain', () => {
    expect([...PROOF_STEPS]).toEqual([
      'smoke',
      'creation_race',
      'creation_class',
      'world_gen',
      'npc_conversation',
      'combat_narration',
      'renown_perk_gen',
      'skill_gen',
    ]);
  });

  it('is frozen', () => {
    expect(Object.isFrozen(PROOF_STEPS)).toBe(true);
  });

  it('nextProofStep walks the order and ends with null', () => {
    expect(nextProofStep('smoke')).toBe('creation_race');
    expect(nextProofStep('renown_perk_gen')).toBe('skill_gen');
    expect(nextProofStep('skill_gen')).toBeNull();
    expect(nextProofStep('nonsense')).toBeNull();
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

  it('counts a full six-route success', () => {
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
    expect(harness).toContain("withDatabaseName('uwr')");
    expect(harness).toContain('TARGETS.local');
  });

  it('checks the spend ledger before paid steps and has a dry mode', () => {
    expect(harness).toContain('shouldStopForSpend(');
    expect(harness).toContain('PROVE_LIVE_DRY');
    // Phase 43: the guard reads today's held spend and the daily ceiling, never the retired phase cap.
    expect(harness).toContain('heldTodayMicroUsd(');
    expect(harness).toContain('dailyCeilingMicroUsd');
    expect(harness).not.toContain('phaseCapMicroUsd');
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
