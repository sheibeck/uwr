import { describe, it, expect } from 'vitest';
import { LLM_ROUTE_NAMES, type LlmRoute } from '../data/llm_routes';
import { LLM_NO_AUTO_RETRY_ROUTES } from '../data/llm_limits';
import type { ClaudeResult, ClaudeFailureClass } from './claude_request';
import { RETRYABLE_CLASSES } from './claude_request';
import {
  maxAttempts,
  shouldRetry,
  retryDelayMs,
  deferDelayMs,
  deterministicJitterMs,
  msToMicros,
} from './llm_retry';

const failure = (cls: ClaudeFailureClass): ClaudeResult => ({
  ok: false,
  class: cls,
  retryable: (RETRYABLE_CLASSES as readonly string[]).includes(cls),
  message: 'x',
});
const okResult: ClaudeResult = {
  ok: true,
  text: 't',
  stopReason: 'end_turn',
  usage: { input: 1, output: 1, cacheWrite: 0, cacheRead: 0 },
};

describe('maxAttempts', () => {
  it('is 1 for the no-auto-retry routes and 3 for every other route', () => {
    // Phase 43 adds the stage-1 routes
    for (const route of [
      'creation_race',
      'creation_class_reveal',
      'creation_class',
      'world_gen_start',
      'world_gen',
      'combat_narration',
      'smoke_test',
    ] as const) {
      expect(maxAttempts(route)).toBe(1);
    }
    for (const route of ['npc_conversation', 'skill_gen', 'renown_perk_gen'] as const) {
      expect(maxAttempts(route)).toBe(3);
    }
  });

  it('covers all eleven routes with exactly the LLM_NO_AUTO_RETRY_ROUTES set at 1', () => {
    // Phase 43 adds the stage-1 routes
    expect(LLM_ROUTE_NAMES).toHaveLength(11);
    const ones = LLM_ROUTE_NAMES.filter((r) => maxAttempts(r) === 1).sort();
    expect(ones).toEqual([...LLM_NO_AUTO_RETRY_ROUTES].sort());
  });
});

describe('shouldRetry', () => {
  it('retries a rate limit at attempts 1 and 2 but not at attempt 3', () => {
    expect(shouldRetry(failure('rate_limit'), 1n, 'npc_conversation')).toBe(true);
    expect(shouldRetry(failure('rate_limit'), 2n, 'npc_conversation')).toBe(true);
    expect(shouldRetry(failure('rate_limit'), 3n, 'npc_conversation')).toBe(false);
    expect(shouldRetry(failure('rate_limit'), 3, 'skill_gen')).toBe(false);
  });

  it('never retries creation, world gen, narration or smoke, whatever the class', () => {
    for (const route of LLM_NO_AUTO_RETRY_ROUTES) {
      for (const cls of RETRYABLE_CLASSES) {
        expect(shouldRetry(failure(cls), 1n, route)).toBe(false);
      }
    }
  });

  it('does not retry a non-transient class', () => {
    for (const cls of ['auth', 'billing', 'bad_request', 'refusal', 'truncated', 'invalid_json'] as const) {
      expect(shouldRetry(failure(cls), 1n, 'npc_conversation')).toBe(false);
    }
  });

  it('does not retry an ok result', () => {
    expect(shouldRetry(okResult, 1n, 'npc_conversation')).toBe(false);
  });

  it('retries every transient class on a three-attempt route at attempt 1', () => {
    for (const cls of RETRYABLE_CLASSES) {
      expect(shouldRetry(failure(cls), 1, 'renown_perk_gen')).toBe(true);
    }
  });
});

describe('deterministicJitterMs', () => {
  it('is 0 when the bound is not positive or not finite', () => {
    expect(deterministicJitterMs(5n, 1n, 0)).toBe(0);
    expect(deterministicJitterMs(5n, 1n, -3)).toBe(0);
    expect(deterministicJitterMs(5n, 1n, Number.NaN)).toBe(0);
    expect(deterministicJitterMs(5n, 1n, 0.5)).toBe(0);
  });

  it('is deterministic, in range, and uses absolute values of the seeds', () => {
    expect(deterministicJitterMs(12n, 3n, 400)).toBe(deterministicJitterMs(12n, 3n, 400));
    expect(deterministicJitterMs(-12n, -3n, 400)).toBe(deterministicJitterMs(12n, 3n, 400));
    for (let i = 0n; i < 200n; i++) {
      const j = deterministicJitterMs(i, i * 3n, 250);
      expect(Number.isInteger(j)).toBe(true);
      expect(j).toBeGreaterThanOrEqual(0);
      expect(j).toBeLessThan(250);
    }
  });
});

describe('retryDelayMs', () => {
  const ids = [0n, 1n, 2n, 7n, 99n, 12345n, 987654321n];

  it('is 2000 ms plus jitter in [0, 400) after attempt 1', () => {
    for (const id of ids) {
      const d = retryDelayMs(1, undefined, id);
      expect(d).toBeGreaterThanOrEqual(2000);
      expect(d).toBeLessThan(2400);
      expect(Number.isInteger(d)).toBe(true);
    }
  });

  it('is 8000 ms plus jitter in [0, 1600) after attempt 2', () => {
    for (const id of ids) {
      const d = retryDelayMs(2, undefined, id);
      expect(d).toBeGreaterThanOrEqual(8000);
      expect(d).toBeLessThan(9600);
      expect(Number.isInteger(d)).toBe(true);
    }
  });

  it('accepts a bigint attempt', () => {
    const d = retryDelayMs(2n, undefined, 5n);
    expect(d).toBeGreaterThanOrEqual(8000);
    expect(d).toBeLessThan(9600);
  });

  it('lets a longer retry-after replace the base', () => {
    for (const id of ids) {
      const d = retryDelayMs(1, 30, id);
      expect(d).toBeGreaterThanOrEqual(30000);
      expect(d).toBeLessThan(30400);
    }
  });

  it('caps the core at 60 s (exactly 60 s and 61 s both give 60000 plus jitter)', () => {
    for (const id of ids) {
      for (const secs of [60, 61, 3600]) {
        const d = retryDelayMs(1, secs, id);
        expect(d).toBeGreaterThanOrEqual(60000);
        expect(d).toBeLessThan(60400);
      }
    }
  });

  it('rounds fractional retry-after seconds up to whole milliseconds', () => {
    for (const id of ids) {
      const d = retryDelayMs(1, 12.3451, id);
      expect(d).toBeGreaterThanOrEqual(12346);
      expect(d).toBeLessThan(12746);
      expect(Number.isInteger(d)).toBe(true);
    }
  });

  it('ignores a retry-after shorter than the base', () => {
    for (const id of ids) {
      const d = retryDelayMs(2, 0.5, id);
      expect(d).toBeGreaterThanOrEqual(8000);
      expect(d).toBeLessThan(9600);
    }
    const shortAfterFirst = retryDelayMs(1, 1, 3n);
    expect(shortAfterFirst).toBeGreaterThanOrEqual(2000);
    expect(shortAfterFirst).toBeLessThan(2400);
  });

  it('ignores a negative, NaN or infinite retry-after', () => {
    for (const bad of [-5, Number.NaN, Number.POSITIVE_INFINITY]) {
      const d = retryDelayMs(1, bad, 4n);
      expect(d).toBeGreaterThanOrEqual(2000);
      expect(d).toBeLessThan(2400);
    }
  });

  it('is identical for identical inputs and clamps later attempts to the last base', () => {
    expect(retryDelayMs(1, undefined, 42n)).toBe(retryDelayMs(1, undefined, 42n));
    const late = retryDelayMs(5, undefined, 42n);
    expect(late).toBeGreaterThanOrEqual(8000);
    expect(late).toBeLessThan(9600);
  });
});

describe('deferDelayMs', () => {
  it('is an integer in [500, 750) for 50 (id, seed) pairs', () => {
    for (let i = 1n; i <= 50n; i++) {
      const d = deferDelayMs(i * 13n, i * 7n + 1n);
      expect(Number.isInteger(d)).toBe(true);
      expect(d).toBeGreaterThanOrEqual(500);
      expect(d).toBeLessThan(750);
    }
  });

  it('is deterministic', () => {
    expect(deferDelayMs(9n, 4n)).toBe(deferDelayMs(9n, 4n));
  });

  it('spreads ten consecutive job ids over at least three delays', () => {
    const delays = new Set<number>();
    for (let id = 1n; id <= 10n; id++) delays.add(deferDelayMs(id, 1n));
    expect(delays.size).toBeGreaterThanOrEqual(3);
  });

  it('varies repeated deferrals of one job by seed', () => {
    const delays = new Set<number>();
    for (let seed = 1n; seed <= 10n; seed++) delays.add(deferDelayMs(5n, seed));
    expect(delays.size).toBeGreaterThanOrEqual(3);
  });
});

describe('msToMicros', () => {
  it('converts whole milliseconds', () => {
    expect(msToMicros(2000)).toBe(2_000_000n);
    expect(msToMicros(0)).toBe(0n);
  });

  it('rounds a fractional millisecond up', () => {
    expect(msToMicros(0.4)).toBe(1000n);
    expect(msToMicros(12345.1)).toBe(12_346_000n);
  });

  it('floors negatives and non-finite values at 0', () => {
    expect(msToMicros(-50)).toBe(0n);
    expect(msToMicros(Number.NaN)).toBe(0n);
    expect(msToMicros(Number.POSITIVE_INFINITY)).toBe(0n);
  });
});

it('type check: route union stays in sync', () => {
  const r: LlmRoute = 'skill_gen';
  expect(maxAttempts(r)).toBe(3);
});
