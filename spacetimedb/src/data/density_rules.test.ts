import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { economyRoll } from './economy_rules';
import {
  DENSITY_RULES,
  POOL_ROLL,
  ENCOUNTER_PHASE_CODE,
  HUB_SEED_TAG,
  poolSeed,
  encounterSeed,
  hubSeed,
  stationSeed,
  countToLevel,
  homeCount,
} from './density_rules';

// ============================================================================
// Task 2: constants, roll indexes, seeds and levels
// ============================================================================

function isDeepFrozen(value: unknown): boolean {
  if (value === null || typeof value !== 'object') return true;
  if (!Object.isFrozen(value)) return false;
  return Object.values(value as Record<string, unknown>).every(isDeepFrozen);
}

describe('DENSITY_RULES', () => {
  it('is frozen, and so is every nested table', () => {
    expect(Object.isFrozen(DENSITY_RULES)).toBe(true);
    expect(isDeepFrozen(DENSITY_RULES)).toBe(true);
    expect(Object.isFrozen(DENSITY_RULES.GAP_PCT)).toBe(true);
    expect(Object.isFrozen(DENSITY_RULES.GAP_PCT[0])).toBe(true);
    expect(Object.isFrozen(DENSITY_RULES.GROUP_SIZE_BY_LEVEL[3])).toBe(true);
  });

  it('sets the party level to the lowest member (D-56)', () => {
    expect(DENSITY_RULES.PARTY_LEVEL_RULE).toBe('lowest');
  });

  it('keeps a creature home below Overrun and resource homes at band tops (D-18, D-38)', () => {
    expect(DENSITY_RULES.CREATURE_HOME_COUNT[1]).toBe(25n);
    expect(DENSITY_RULES.CREATURE_HOME_COUNT[2]).toBe(50n);
    expect(DENSITY_RULES.CREATURE_HOME_COUNT[3]).toBeUndefined();
    expect(DENSITY_RULES.RESOURCE_HOME_COUNT[1]).toBe(DENSITY_RULES.STABLE_FLOOR - 1n);
    expect(DENSITY_RULES.RESOURCE_HOME_COUNT[2]).toBe(DENSITY_RULES.OVERRUN_FLOOR - 1n);
    expect(DENSITY_RULES.RESOURCE_HOME_COUNT[3]).toBe(DENSITY_RULES.COUNT_MAX);
  });

  it('orders the hub and crafting-station bands by danger with non-increasing chances (D-62, D-63)', () => {
    const tables: [readonly { maxDanger: number; pct: number }[], number][] = [
      [DENSITY_RULES.HUB_CHANCE_BY_DANGER, DENSITY_RULES.HUB_CHANCE_ABOVE],
      [DENSITY_RULES.CRAFTING_STATION_CHANCE_BY_DANGER, DENSITY_RULES.CRAFTING_STATION_CHANCE_ABOVE],
    ];
    for (const [bands, above] of tables) {
      for (let i = 1; i < bands.length; i += 1) {
        expect(bands[i]!.maxDanger).toBeGreaterThan(bands[i - 1]!.maxDanger);
        expect(bands[i]!.pct).toBeLessThanOrEqual(bands[i - 1]!.pct);
      }
      expect(above).toBeLessThanOrEqual(bands[bands.length - 1]!.pct);
    }
  });

  it('makes a second hub rarer than any first-hub band (D-62)', () => {
    for (const band of DENSITY_RULES.HUB_CHANCE_BY_DANGER) {
      expect(DENSITY_RULES.SECOND_HUB_PCT).toBeLessThan(band.pct);
    }
    expect(DENSITY_RULES.SECOND_HUB_PCT).toBeLessThan(DENSITY_RULES.HUB_CHANCE_ABOVE);
    expect(DENSITY_RULES.HUB_MAX_PER_REGION).toBe(2);
    expect(DENSITY_RULES.STARTER_HUB_COUNT).toBe(1);
  });

  it('orders the gap bands ascending', () => {
    const bands = DENSITY_RULES.GAP_PCT;
    for (let i = 1; i < bands.length; i += 1) {
      expect(bands[i]!.maxGap).toBeGreaterThan(bands[i - 1]!.maxGap);
    }
  });
});

describe('countToLevel', () => {
  it('maps counts to Wiped out, Scarce, Stable and Overrun', () => {
    expect(countToLevel(0n)).toBe(0);
    expect(countToLevel(1n)).toBe(1);
    expect(countToLevel(33n)).toBe(1);
    expect(countToLevel(34n)).toBe(2);
    expect(countToLevel(66n)).toBe(2);
    expect(countToLevel(67n)).toBe(3);
    expect(countToLevel(100n)).toBe(3);
  });

  it('reads a negative count as Wiped out', () => {
    expect(countToLevel(-5n)).toBe(0);
  });
});

describe('homeCount', () => {
  it('gives creature homes', () => {
    expect(homeCount('creature', 1)).toBe(25n);
    expect(homeCount('creature', 2)).toBe(50n);
    expect(homeCount('creature', 0)).toBe(0n);
    expect(homeCount('creature', 2n)).toBe(50n);
  });

  it('gives resource homes at band tops', () => {
    expect(homeCount('resource', 1)).toBe(33n);
    expect(homeCount('resource', 2)).toBe(66n);
    expect(homeCount('resource', 3)).toBe(100n);
    expect(homeCount('resource', 0)).toBe(0n);
  });

  it('never gives a creature an Overrun home (D-18)', () => {
    expect(countToLevel(homeCount('creature', 3))).toBeLessThan(3);
  });
});

describe('POOL_ROLL', () => {
  it('uses a distinct index for every roll', () => {
    const values = Object.values(POOL_ROLL);
    expect(new Set(values).size).toBe(values.length);
    expect(Object.isFrozen(POOL_ROLL)).toBe(true);
  });

  it('keeps the slot ranges clear of the other indexes', () => {
    const singles = Object.entries(POOL_ROLL)
      .filter(([k]) => k !== 'ROLE_BASE' && k !== 'MEMBER_BASE')
      .map(([, v]) => v);
    for (let i = 0n; i < 4n; i += 1n) {
      expect(singles).not.toContain(POOL_ROLL.ROLE_BASE + i);
      expect(singles).not.toContain(POOL_ROLL.MEMBER_BASE + i);
    }
  });

  it('gives independent values for two indexes on one seed', () => {
    const seed = encounterSeed(1_700_000_000_000_000n, 42n, 7n, 'enter');
    const values = Object.values(POOL_ROLL).map((i) => economyRoll(seed, i));
    expect(new Set(values).size).toBe(values.length);
  });
});

describe('seeds', () => {
  const ts = 1_700_000_000_000_000n;

  it('poolSeed is a 64-bit value and depends on argument position', () => {
    const s = poolSeed(ts, 3n, 9n);
    expect(s).toBeGreaterThanOrEqual(0n);
    expect(s < 1n << 64n).toBe(true);
    expect(poolSeed(3n, 9n)).not.toBe(poolSeed(9n, 3n));
  });

  it('encounterSeed differs when any part differs', () => {
    const base = encounterSeed(ts, 5n, 11n, 'enter');
    expect(encounterSeed(ts, 5n, 11n, 'enter')).toBe(base);
    expect(encounterSeed(ts + 1n, 5n, 11n, 'enter')).not.toBe(base);
    expect(encounterSeed(ts, 6n, 11n, 'enter')).not.toBe(base);
    expect(encounterSeed(ts, 5n, 12n, 'enter')).not.toBe(base);
    expect(encounterSeed(ts, 5n, 11n, 'leave')).not.toBe(base);
    expect(encounterSeed(ts, 5n, 11n, ENCOUNTER_PHASE_CODE.enter)).toBe(base);
  });

  it('has a distinct code per encounter phase', () => {
    const codes = Object.values(ENCOUNTER_PHASE_CODE);
    expect(new Set(codes).size).toBe(codes.length);
  });

  it('hubSeed depends only on the region id', () => {
    expect(hubSeed(1n)).toBe(hubSeed(1n));
    expect(hubSeed(1n)).not.toBe(hubSeed(2n));
    expect(hubSeed(1n)).toBe(poolSeed(1n, HUB_SEED_TAG));
  });

  it('stationSeed differs by location', () => {
    expect(stationSeed(1n, 4n)).toBe(stationSeed(1n, 4n));
    expect(stationSeed(1n, 4n)).not.toBe(stationSeed(1n, 5n));
    expect(stationSeed(1n, 4n)).not.toBe(stationSeed(2n, 4n));
    expect(stationSeed(1n, 4n)).not.toBe(hubSeed(1n));
  });
});

describe('density_rules.ts source guard', () => {
  const source = readFileSync(fileURLToPath(new URL('./density_rules.ts', import.meta.url)), 'utf8');
  const code = source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');

  it('has no ctx, Math.random or Date outside comments', () => {
    expect(code).not.toMatch(/\bctx\b/);
    expect(code).not.toMatch(/Math\.random/);
    expect(code).not.toMatch(/\bDate\b/);
  });

  it('imports only ./economy_rules and ./mechanical_vocabulary', () => {
    const imports = [...code.matchAll(/from\s+['"]([^'"]+)['"]/g)].map((m) => m[1]);
    expect(imports.length).toBeGreaterThan(0);
    for (const spec of imports) {
      expect(['./economy_rules', './mechanical_vocabulary']).toContain(spec);
    }
    expect(code).not.toMatch(/\brequire\(/);
    expect(code).not.toMatch(/\bimport\(/);
  });

  it('never rolls with a bare % 100n', () => {
    expect(code).not.toMatch(/% 100n/);
  });
});
