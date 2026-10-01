import { describe, it, expect } from 'vitest';
import * as L from './llm_limits';
import { LLM_ROUTES, isLlmRoute } from './llm_routes';
import { ANTHROPIC_MAX_TIMEOUT_MS } from './llm_models';

describe('llm_limits constants (Phase 41)', () => {
  it('holds the executor, retry and sweeper values from the phase decisions', () => {
    expect(L.LLM_MAX_IN_FLIGHT).toBe(4);
    expect(L.LLM_NARRATION_MAX_IN_FLIGHT).toBe(3);
    expect(L.LLM_DEFER_BASE_MS).toBe(500);
    expect(L.LLM_DEFER_JITTER_MS).toBe(250);
    expect(L.LLM_MAX_ATTEMPTS).toBe(3);
    expect([...L.LLM_RETRY_BASE_MS]).toEqual([2000, 8000]);
    expect(L.LLM_RETRY_MAX_MS).toBe(60_000);
    expect(L.LLM_RETRY_JITTER_FRACTION).toBe(0.2);
    expect(L.LLM_NARRATION_MAX_AGE_MICROS).toBe(20_000_000n);
    expect(L.LLM_SWEEP_INTERVAL_MICROS).toBe(30_000_000n);
    expect(L.LLM_SWEEP_IN_FLIGHT_GRACE_MICROS).toBe(30_000_000n);
    expect(L.LLM_SWEEP_RECEIVED_GRACE_MICROS).toBe(60_000_000n);
    expect(L.LLM_SWEEP_PENDING_MAX_AGE_MICROS).toBe(600_000_000n);
    expect(L.LLM_SWEEP_RENOWN_PENDING_MAX_AGE_MICROS).toBe(86_400_000_000n);
  });

  it('holds the budget, apply and singleton values', () => {
    expect(L.LLM_PLAYER_DAILY_COST_MICRO_USD).toBe(1_000_000n);
    expect(L.LLM_PLAYER_DAILY_CALLS).toBe(200n);
    expect(L.LLM_PLAYER_MAX_ACTIVE_JOBS).toBe(3);
    expect(L.LLM_PHASE_SPEND_CAP_MICRO_USD).toBe(2_000_000n);
    expect(L.LLM_BUDGET_RETENTION_DAYS).toBe(2);
    expect(L.LLM_APPLY_MAX_ATTEMPTS).toBe(2);
    expect(L.LLM_SMOKE_JSON_MAX_CHARS).toBe(4096);
    expect(L.LLM_ADMIN_STATE_ID).toBe(1n);
    expect(L.LLM_SPEND_ID).toBe(1n);
  });

  it('holds the global daily ceiling default and its admin bounds (Phase 43, COST-03)', () => {
    expect(L.LLM_DAILY_CEILING_DEFAULT_MICRO_USD).toBe(10_000_000n);
    expect(L.LLM_DAILY_CEILING_MIN_MICRO_USD).toBe(10_000n);
    expect(L.LLM_DAILY_CEILING_MAX_MICRO_USD).toBe(1_000_000_000n);
  });

  it('narration cap is the global cap minus one', () => {
    expect(L.LLM_NARRATION_MAX_IN_FLIGHT).toBe(L.LLM_MAX_IN_FLIGHT - 1);
  });

  it('the route lists are frozen arrays of valid route names', () => {
    for (const list of [L.LLM_NO_AUTO_RETRY_ROUTES, L.LLM_SMOKE_ROUTES, L.LLM_RETRY_BASE_MS]) {
      expect(Object.isFrozen(list)).toBe(true);
    }
    for (const r of L.LLM_NO_AUTO_RETRY_ROUTES) expect(isLlmRoute(r), r).toBe(true);
    for (const r of L.LLM_SMOKE_ROUTES) expect(isLlmRoute(r), r).toBe(true);
    // Phase 43 adds the stage-1 routes
    expect([...L.LLM_NO_AUTO_RETRY_ROUTES].sort()).toEqual(
      [
        'combat_narration',
        'creation_class',
        'creation_class_reveal',
        'creation_race',
        'smoke_test',
        'world_gen',
        'world_gen_start',
      ].sort(),
    );
    expect(L.LLM_SMOKE_ROUTES[0]).toBe('smoke_test');
    // Phase 43 adds the stage-1 routes: the smoke test warms both stage schemas of each split route
    expect([...L.LLM_SMOKE_ROUTES]).toEqual([
      'smoke_test',
      'creation_race',
      'creation_class_reveal',
      'creation_class',
      'world_gen_start',
      'world_gen',
      'skill_gen',
      'renown_perk_gen',
    ]);
    expect(L.LLM_SMOKE_ROUTES).toHaveLength(8);
  });

  it('retry lifetime bound: a retrying route always finishes before the pending expiry', () => {
    const expiryMs = Number(L.LLM_SWEEP_PENDING_MAX_AGE_MICROS / 1000n);
    const maxJitter = Math.ceil(L.LLM_RETRY_BASE_MS[1] * L.LLM_RETRY_JITTER_FRACTION);
    let checked = 0;
    for (const [name, cfg] of Object.entries(LLM_ROUTES)) {
      if ((L.LLM_NO_AUTO_RETRY_ROUTES as readonly string[]).includes(name)) continue;
      const worst =
        L.LLM_MAX_ATTEMPTS * cfg.timeoutMs +
        (L.LLM_MAX_ATTEMPTS - 1) * (L.LLM_RETRY_MAX_MS + maxJitter);
      expect(worst, name).toBeLessThan(expiryMs);
      checked++;
    }
    expect(checked).toBeGreaterThan(0);
  });

  it('every route timeout plus the in-flight grace stays inside the host clamp plus the grace', () => {
    const grace = Number(L.LLM_SWEEP_IN_FLIGHT_GRACE_MICROS / 1000n);
    for (const [name, cfg] of Object.entries(LLM_ROUTES)) {
      expect(cfg.timeoutMs + grace, name).toBeLessThan(ANTHROPIC_MAX_TIMEOUT_MS + 30_000);
    }
  });
});
