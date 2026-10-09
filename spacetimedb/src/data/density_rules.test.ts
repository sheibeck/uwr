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
  FAMILY_SEED_TAG,
  familySeed,
  placeFamiliesSeed,
  familyCountFor,
  askedFamilyCount,
  keptFamilyCount,
  feudCountFor,
  feudHappens,
  pickFeud,
  pickPlaceFamilies,
  assignRegionFamilies,
  countToLevel,
  homeCount,
  gapPct,
  encounterChanceBp,
  encounterHit,
  pickEncounterPool,
  groupSizeFor,
  composeGroupRoles,
  partyLevel,
  settleCount,
  yieldForLevel,
  nextHarvest,
  isHarvestCapped,
  hunterActive,
  pickHunterTargets,
  pickSurgeTarget,
  regionTrend,
  creatureHomeLevels,
  resourceHomeLevel,
  bandPct,
  hubCountFor,
  hubHasStation,
  chooseHubs,
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

describe('place rating constants (D-73)', () => {
  it('names every D-73 threshold, and the summed-score constants are gone', () => {
    const rules = DENSITY_RULES as unknown as Record<string, unknown>;
    expect(rules.RATING_GAP_QUIET_MAX).toBe(0);
    expect(rules.RATING_GAP_RISKY_MAX).toBe(2);
    expect(rules.RATING_CROWD_LEVEL).toBe(3);
    expect(rules.RATING_CROWD_FAMILIES).toBe(3);
    for (const gone of [
      'RATING_WEIGHT_X10',
      'RATING_WEIGHT_ABOVE_X10',
      'RATING_QUIET_MAX_X10',
      'RATING_RISKY_MAX_X10',
      'RATING_CROWD_STABLE_LEVEL',
      'RATING_CROWD_STABLE_FAMILIES',
    ]) {
      expect(rules[gone], gone).toBeUndefined();
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

// ============================================================================
// Task 3: pure rule functions
// ============================================================================

const R = DENSITY_RULES;
const seeds = (n: number, from = 1n): bigint[] =>
  Array.from({ length: n }, (_, i) => poolSeed(from + BigInt(i), 31n));

describe('gapPct', () => {
  it('reads the gap bands (D-10)', () => {
    expect(gapPct(-9)).toBe(0);
    expect(gapPct(-5)).toBe(0);
    expect(gapPct(-4)).toBe(40);
    expect(gapPct(-3)).toBe(40);
    expect(gapPct(-2)).toBe(70);
    expect(gapPct(-1)).toBe(70);
    expect(gapPct(0)).toBe(100);
    expect(gapPct(2)).toBe(130);
    expect(gapPct(3)).toBe(R.GAP_PCT_ABOVE);
    expect(gapPct(10)).toBe(R.GAP_PCT_ABOVE);
  });
});

describe('encounterChanceBp', () => {
  const pool = (level: number, temperament: string, lvHi: bigint) => ({ level, temperament, lvHi });

  it('is 0 at a safe place', () => {
    expect(encounterChanceBp({ isSafe: true, pools: [pool(3, 'aggressive', 9n)], partyLevel: 5n })).toBe(0);
  });

  it('is 0 for a wiped-out family and with no pools', () => {
    expect(encounterChanceBp({ isSafe: false, pools: [pool(0, 'aggressive', 9n)], partyLevel: 5n })).toBe(0);
    expect(encounterChanceBp({ isSafe: false, pools: [], partyLevel: 5n })).toBe(0);
  });

  it('orders Overrun aggressive above > Stable wary even > Scarce skittish', () => {
    const overrun = encounterChanceBp({ isSafe: false, pools: [pool(3, 'aggressive', 7n)], partyLevel: 5n });
    const stable = encounterChanceBp({ isSafe: false, pools: [pool(2, 'wary', 5n)], partyLevel: 5n });
    const scarce = encounterChanceBp({ isSafe: false, pools: [pool(1, 'skittish', 5n)], partyLevel: 5n });
    expect(overrun).toBeGreaterThan(stable);
    expect(stable).toBeGreaterThan(scarce);
    expect(scarce).toBeGreaterThan(0);
  });

  it('is higher for a denser family, and aggressive > wary > skittish', () => {
    const at = (level: number, t: string) =>
      encounterChanceBp({ isSafe: false, pools: [pool(level, t, 5n)], partyLevel: 5n });
    expect(at(2, 'wary')).toBeGreaterThan(at(1, 'wary'));
    expect(at(3, 'wary')).toBeGreaterThan(at(2, 'wary'));
    expect(at(2, 'aggressive')).toBeGreaterThan(at(2, 'wary'));
    expect(at(2, 'wary')).toBeGreaterThan(at(2, 'skittish'));
  });

  it('is higher when the family is above the party, and 0 five or more levels below', () => {
    const at = (lvHi: bigint) => encounterChanceBp({ isSafe: false, pools: [pool(2, 'wary', lvHi)], partyLevel: 10n });
    expect(at(12n)).toBeGreaterThan(at(10n));
    expect(at(10n)).toBeGreaterThan(at(8n));
    expect(at(5n)).toBe(0);
    expect(at(1n)).toBe(0);
  });

  it('reads an unknown temperament as wary', () => {
    const wary = encounterChanceBp({ isSafe: false, pools: [pool(2, 'wary', 5n)], partyLevel: 5n });
    const odd = encounterChanceBp({ isSafe: false, pools: [pool(2, 'grumpy', 5n)], partyLevel: 5n });
    expect(odd).toBe(wary);
  });

  it('combines pools as 1 - prod(1 - p) and caps at ENCOUNTER_MAX_PCT', () => {
    const one = encounterChanceBp({ isSafe: false, pools: [pool(2, 'wary', 5n)], partyLevel: 5n });
    const two = encounterChanceBp({ isSafe: false, pools: [pool(2, 'wary', 5n), pool(2, 'wary', 5n)], partyLevel: 5n });
    expect(one).toBe(1000);
    expect(two).toBe(1900);
    const many = Array.from({ length: 8 }, () => pool(3, 'aggressive', 20n));
    expect(encounterChanceBp({ isSafe: false, pools: many, partyLevel: 1n })).toBe(R.ENCOUNTER_MAX_PCT * 100);
  });

  it('applies factorPct after combining', () => {
    const base = encounterChanceBp({ isSafe: false, pools: [pool(2, 'wary', 5n)], partyLevel: 5n });
    const gather = encounterChanceBp({
      isSafe: false,
      pools: [pool(2, 'wary', 5n)],
      partyLevel: 5n,
      factorPct: R.GATHER_AMBUSH_FACTOR_PCT,
    });
    expect(gather).toBe(Math.floor((base * R.GATHER_AMBUSH_FACTOR_PCT) / 100));
  });

  it('gives the same result for the same inputs', () => {
    const input = { isSafe: false, pools: [pool(3, 'aggressive', 7n), pool(1, 'skittish', 3n)], partyLevel: 5n };
    expect(encounterChanceBp(input)).toBe(encounterChanceBp(input));
  });
});

describe('encounterHit', () => {
  it('never hits at 0 and always hits at 10000', () => {
    for (const s of seeds(200)) {
      expect(encounterHit(s, 0)).toBe(false);
      expect(encounterHit(s, 10000)).toBe(true);
    }
  });

  it('hits about bp / 10000 of seeds', () => {
    const hits = seeds(2000).filter((s) => encounterHit(s, 2500)).length;
    expect(hits / 2000).toBeGreaterThan(0.21);
    expect(hits / 2000).toBeLessThan(0.29);
  });
});

describe('pickEncounterPool', () => {
  const pools = [
    { id: 'wiped', level: 0, temperament: 'aggressive', lvHi: 5n },
    { id: 'low', level: 1, temperament: 'skittish', lvHi: 5n },
    { id: 'high', level: 3, temperament: 'aggressive', lvHi: 6n },
    { id: 'far-below', level: 3, temperament: 'aggressive', lvHi: 1n },
  ];

  it('picks only pools with a positive contribution, weighted toward the larger one', () => {
    const counts: Record<string, number> = {};
    for (const s of seeds(1000)) {
      const pick = pickEncounterPool(s, pools, 6n);
      expect(pick).not.toBeNull();
      counts[pick!.id] = (counts[pick!.id] ?? 0) + 1;
    }
    expect(counts['wiped']).toBeUndefined();
    expect(counts['far-below']).toBeUndefined();
    expect(counts['high']!).toBeGreaterThan(counts['low']!);
  });

  it('is deterministic per seed and null when nothing contributes', () => {
    const s = poolSeed(9n);
    expect(pickEncounterPool(s, pools, 6n)).toBe(pickEncounterPool(s, pools, 6n));
    expect(pickEncounterPool(s, [pools[0]!], 6n)).toBeNull();
    expect(pickEncounterPool(s, [], 6n)).toBeNull();
  });
});

describe('groupSizeFor', () => {
  it('follows GROUP_SIZE_BY_LEVEL with a trim when far above the party (D-11)', () => {
    const seen3 = new Set<number>();
    for (const s of seeds(300)) {
      expect(groupSizeFor(1, 0, s)).toBe(1);
      const two = groupSizeFor(2, 0, s);
      expect(two).toBeGreaterThanOrEqual(1);
      expect(two).toBeLessThanOrEqual(2);
      const three = groupSizeFor(3, 0, s);
      seen3.add(three);
      expect(three).toBeGreaterThanOrEqual(2);
      expect(three).toBeLessThanOrEqual(4);
      const trimmed = groupSizeFor(3, 4, s);
      expect(trimmed).toBeGreaterThanOrEqual(1);
      expect(trimmed).toBeLessThanOrEqual(3);
      expect(groupSizeFor(1, 6, s)).toBe(1);
      expect(groupSizeFor(0, 0, s)).toBe(0);
    }
    expect([...seen3].sort()).toEqual([2, 3, 4]);
  });
});

describe('composeGroupRoles', () => {
  const all = ['tank', 'damage', 'healer', 'caster'];

  it('puts a tank or damage member first whenever one is available, and caps support', () => {
    for (const s of seeds(200)) {
      for (const size of [1, 2, 3, 4]) {
        const roles = composeGroupRoles(size, all, s);
        expect(roles).toHaveLength(size);
        expect(['tank', 'damage']).toContain(roles[0]);
        const healers = roles.filter((r) => r === 'healer').length;
        expect(healers).toBeLessThanOrEqual(size <= 3 ? R.HEALER_CAP_UP_TO_THREE : R.HEALER_CAP_FOUR);
      }
      expect(composeGroupRoles(3, ['caster', 'healer'], s)[0]).toBe('caster');
    }
  });

  it('never makes a group of only support', () => {
    for (const s of seeds(50)) {
      expect(composeGroupRoles(4, ['healer'], s)).toEqual(['healer']);
      expect(composeGroupRoles(1, ['healer'], s)).toEqual(['healer']);
    }
  });

  it('copies the one role of a family of one', () => {
    for (const s of seeds(50)) {
      expect(composeGroupRoles(4, ['damage'], s)).toEqual(['damage', 'damage', 'damage', 'damage']);
    }
  });

  it('uses only available roles, and leans extras toward caster and support', () => {
    let support = 0;
    let tanks = 0;
    for (const s of seeds(400)) {
      const roles = composeGroupRoles(4, ['tank', 'healer', 'caster'], s);
      for (const r of roles) expect(['tank', 'healer', 'caster']).toContain(r);
      support += roles.slice(1).filter((r) => r === 'healer').length;
      tanks += roles.slice(1).filter((r) => r === 'tank').length;
    }
    expect(support).toBeGreaterThan(tanks);
  });

  it('returns nothing for size 0 or no roles, and ignores input order', () => {
    expect(composeGroupRoles(0, all, 1n)).toEqual([]);
    expect(composeGroupRoles(3, [], 1n)).toEqual([]);
    expect(composeGroupRoles(4, all, 77n)).toEqual(composeGroupRoles(4, all, 77n));
    expect(composeGroupRoles(4, all, 77n)).toEqual(composeGroupRoles(4, [...all].reverse(), 77n));
  });
});

describe('partyLevel', () => {
  it('is the lowest member (D-56), or 1 for an empty party', () => {
    expect(partyLevel([5n, 2n, 9n])).toBe(2n);
    expect(partyLevel([7n])).toBe(7n);
    expect(partyLevel([])).toBe(1n);
  });
});

describe('settleCount', () => {
  const regrow = R.CREATURE_REGROW_MICROS_PER_POINT;
  const settle = R.OVERRUN_SETTLE_MICROS_PER_POINT;
  const t0 = 1_000_000_000_000n;

  it('regrows a creature below home one point per regrow step, capped at home', () => {
    const p = { kind: 'creature' as const, count: 10n, homeLevel: 2, lastSettledMicros: t0, wipedAtMicros: 0n };
    const after = settleCount(p, t0 + regrow * 3n + 5n);
    expect(after.count).toBe(13n);
    expect(after.lastSettledMicros).toBe(t0 + regrow * 3n);
    const full = settleCount(p, t0 + regrow * 1000n);
    expect(full.count).toBe(50n);
    expect(full.lastSettledMicros).toBe(t0 + regrow * 1000n);
  });

  it('settles a creature above home down one point per settle step, floored at home', () => {
    const p = { kind: 'creature' as const, count: 75n, homeLevel: 2, lastSettledMicros: t0, wipedAtMicros: 0n };
    const after = settleCount(p, t0 + settle * 4n + 1n);
    expect(after.count).toBe(71n);
    expect(after.lastSettledMicros).toBe(t0 + settle * 4n);
    expect(settleCount(p, t0 + settle * 500n).count).toBe(50n);
  });

  it('settles Overrun back by about one level in 5 minutes (MD-13)', () => {
    const points = 300_000_000n / settle;
    expect(points).toBeGreaterThanOrEqual(30n);
    expect(points).toBeLessThanOrEqual(36n);
  });

  it('keeps time at home', () => {
    const p = { kind: 'creature' as const, count: 50n, homeLevel: 2, lastSettledMicros: t0, wipedAtMicros: 0n };
    expect(settleCount(p, t0 + 99n)).toEqual({ count: 50n, lastSettledMicros: t0 + 99n, wipedAtMicros: 0n });
  });

  it('holds a wiped-out family at 0 until the long reset, then returns it (D-37)', () => {
    const p = { kind: 'creature' as const, count: 0n, homeLevel: 2, lastSettledMicros: t0, wipedAtMicros: t0 };
    const before = settleCount(p, t0 + R.WIPED_RESET_MICROS - 1n);
    expect(before.count).toBe(0n);
    expect(before.wipedAtMicros).toBe(t0);
    expect(before.lastSettledMicros).toBe(t0 + R.WIPED_RESET_MICROS - 1n);
    const at = settleCount(p, t0 + R.WIPED_RESET_MICROS);
    expect(at.count).toBe(R.WIPED_RETURN_COUNT);
    expect(at.wipedAtMicros).toBe(0n);
    expect(at.lastSettledMicros).toBe(t0 + R.WIPED_RESET_MICROS);
    const later = settleCount(p, t0 + R.WIPED_RESET_MICROS + regrow * 2n);
    expect(later.count).toBe(R.WIPED_RETURN_COUNT + 2n);
  });

  it('regrows a resource from 0 with no long reset (D-28)', () => {
    const p = { kind: 'resource' as const, count: 0n, homeLevel: 3, lastSettledMicros: t0, wipedAtMicros: t0 };
    const after = settleCount(p, t0 + R.RESOURCE_REGROW_MICROS_PER_POINT * 5n);
    expect(after.count).toBe(5n);
    expect(after.wipedAtMicros).toBe(0n);
  });

  it('never moves backwards in time', () => {
    const p = { kind: 'creature' as const, count: 10n, homeLevel: 2, lastSettledMicros: t0, wipedAtMicros: 0n };
    expect(settleCount(p, t0 - 1000n)).toEqual({ count: 10n, lastSettledMicros: t0, wipedAtMicros: 0n });
  });

  it('settles lazily in one step to the same count as in many small steps', () => {
    const starts = [
      { kind: 'creature' as const, count: 3n, homeLevel: 2, lastSettledMicros: t0, wipedAtMicros: 0n },
      { kind: 'creature' as const, count: 90n, homeLevel: 1, lastSettledMicros: t0, wipedAtMicros: 0n },
      { kind: 'creature' as const, count: 0n, homeLevel: 2, lastSettledMicros: t0, wipedAtMicros: t0 - 1_000_000n },
      { kind: 'resource' as const, count: 0n, homeLevel: 2, lastSettledMicros: t0, wipedAtMicros: 0n },
      { kind: 'resource' as const, count: 40n, homeLevel: 1, lastSettledMicros: t0, wipedAtMicros: 0n },
    ];
    const spans = [7_000_000n, 61_000_000n, 900_000_000n, R.WIPED_RESET_MICROS + 123_456_789n, 20_000_000_000n];
    for (const start of starts) {
      for (const span of spans) {
        const lazy = settleCount(start, t0 + span);
        for (const steps of [2n, 3n, 7n, 50n]) {
          let state = { ...start };
          for (let i = 1n; i <= steps; i += 1n) {
            // uneven steps that still sum to the span
            const now = i === steps ? t0 + span : t0 + (span * i * i) / (steps * steps);
            state = { ...state, ...settleCount(state, now) };
          }
          expect(state.count, `${start.kind} ${start.count} over ${span} in ${steps}`).toBe(lazy.count);
          expect(state.wipedAtMicros).toBe(lazy.wipedAtMicros);
          expect(state.lastSettledMicros).toBe(lazy.lastSettledMicros);
        }
      }
    }
  });
});

describe('yieldForLevel', () => {
  it('yields by density (D-38)', () => {
    expect(yieldForLevel(3)).toBe(3n);
    expect(yieldForLevel(2)).toBe(2n);
    expect(yieldForLevel(1)).toBe(1n);
    expect(yieldForLevel(0)).toBe(0n);
  });

  it('drops a resource home a level in about two gathers', () => {
    for (const level of [1, 2, 3]) {
      const home = homeCount('resource', level);
      expect(countToLevel(home - R.GATHER_DEPLETION_POINTS * 2n)).toBe(level - 1);
    }
  });
});

describe('nextHarvest and isHarvestCapped', () => {
  const now = 5_000_000_000n;

  it('starts a window, caps on the 4th gather and resets after the window (D-27, D-28)', () => {
    let state = nextHarvest(null, now);
    expect(state).toEqual({ windowStartMicros: now, gathers: 1n, cappedUntilMicros: 0n });
    expect(isHarvestCapped(state, now)).toBe(false);
    state = nextHarvest(state, now + 1n);
    state = nextHarvest(state, now + 2n);
    expect(state.gathers).toBe(3n);
    expect(isHarvestCapped(state, now + 2n)).toBe(false);
    state = nextHarvest(state, now + 3n);
    expect(state.gathers).toBe(R.HARVEST_CAP_GATHERS);
    expect(state.cappedUntilMicros).toBe(now + R.HARVEST_WINDOW_MICROS);
    expect(isHarvestCapped(state, now + 4n)).toBe(true);
    expect(isHarvestCapped(state, now + R.HARVEST_WINDOW_MICROS - 1n)).toBe(true);
    expect(isHarvestCapped(state, now + R.HARVEST_WINDOW_MICROS)).toBe(false);
    const fresh = nextHarvest(state, now + R.HARVEST_WINDOW_MICROS);
    expect(fresh).toEqual({ windowStartMicros: now + R.HARVEST_WINDOW_MICROS, gathers: 1n, cappedUntilMicros: 0n });
  });

  it('is never capped without a state', () => {
    expect(isHarvestCapped(null, now)).toBe(false);
  });
});

describe('hunters', () => {
  it('are active about HUNTER_ACTIVITY_PCT of seeds, deterministically', () => {
    const list = seeds(1000);
    const active = list.filter((s) => hunterActive(s)).length;
    expect(Math.abs(active / 10 - R.HUNTER_ACTIVITY_PCT)).toBeLessThan(5);
    expect(list.map(hunterActive)).toEqual(list.map(hunterActive));
  });

  it('never hunt a wiped-out pool and hunt Overrun pools more often (D-21)', () => {
    const pools = [
      { id: 'wiped', level: 0 },
      { id: 'scarce', level: 1 },
      { id: 'overrun', level: 3 },
    ];
    const counts: Record<string, number> = {};
    for (const s of seeds(1000)) {
      const picks = pickHunterTargets(s, pools, 1);
      expect(picks).toHaveLength(1);
      counts[picks[0]!.id] = (counts[picks[0]!.id] ?? 0) + 1;
    }
    expect(counts['wiped']).toBeUndefined();
    expect(counts['overrun']!).toBeGreaterThan(counts['scarce']!);
  });

  it('picks without replacement and never more than there are live pools', () => {
    const pools = [{ id: 'a', level: 1 }, { id: 'b', level: 2 }, { id: 'c', level: 0 }];
    const picks = pickHunterTargets(3n, pools, 5);
    expect(picks).toHaveLength(2);
    expect(new Set(picks.map((p) => p.id)).size).toBe(2);
    expect(pickHunterTargets(3n, [], 1)).toEqual([]);
    expect(pickHunterTargets(3n, pools, 0)).toEqual([]);
  });
});

describe('pickSurgeTarget', () => {
  it('is null for no candidates and a deterministic member otherwise', () => {
    expect(pickSurgeTarget(1n, [])).toBeNull();
    const list = ['a', 'b', 'c'];
    const pick = pickSurgeTarget(5n, list);
    expect(list).toContain(pick);
    expect(pickSurgeTarget(5n, list)).toBe(pick);
    const seen = new Set(seeds(100).map((s) => pickSurgeTarget(s, list)));
    expect(seen.size).toBe(3);
  });
});

describe('regionTrend', () => {
  it('names a change of TREND_DELTA_LEVELS or more (D-23)', () => {
    expect(regionTrend(10, 13)).toBe('wilder');
    expect(regionTrend(13, 10)).toBe('quieter');
    expect(regionTrend(10, 12)).toBeNull();
    expect(regionTrend(12, 10)).toBeNull();
  });
});

describe('home levels', () => {
  it('gives one family a Stable home', () => {
    expect(creatureHomeLevels(1, 5n)).toEqual([2]);
    expect(creatureHomeLevels(0, 5n)).toEqual([]);
  });

  it('gives exactly two Stable homes in a seeded order (D-46)', () => {
    const orders = new Set<string>();
    for (const s of seeds(100)) {
      const levels = creatureHomeLevels(3, s);
      expect(levels.filter((l) => l === 2)).toHaveLength(2);
      expect(levels.filter((l) => l === 1)).toHaveLength(1);
      expect(creatureHomeLevels(3, s)).toEqual(levels);
      orders.add(levels.join(','));
      const five = creatureHomeLevels(5, s);
      expect(five.filter((l) => l === 2)).toHaveLength(R.STABLE_HOME_FAMILIES_PER_PLACE);
    }
    expect(orders.size).toBe(3);
  });

  it('maps resource rarity to a home level (D-38)', () => {
    expect(resourceHomeLevel('common')).toBe(3);
    expect(resourceHomeLevel('uncommon')).toBe(2);
    expect(resourceHomeLevel('rare')).toBe(1);
    expect(resourceHomeLevel('legendary')).toBe(3);
  });
});

describe('bandPct', () => {
  it('reads the first band whose maxDanger is at least the danger, else above', () => {
    expect(bandPct(R.HUB_CHANCE_BY_DANGER, R.HUB_CHANCE_ABOVE, 100n)).toBe(100);
    expect(bandPct(R.HUB_CHANCE_BY_DANGER, R.HUB_CHANCE_ABOVE, 200)).toBe(100);
    expect(bandPct(R.HUB_CHANCE_BY_DANGER, R.HUB_CHANCE_ABOVE, 201n)).toBe(90);
    expect(bandPct(R.HUB_CHANCE_BY_DANGER, R.HUB_CHANCE_ABOVE, 650n)).toBe(45);
    expect(bandPct(R.HUB_CHANCE_BY_DANGER, R.HUB_CHANCE_ABOVE, 800n)).toBe(R.HUB_CHANCE_ABOVE);
  });
});

describe('hubCountFor (D-61, D-62)', () => {
  const regionSeeds = Array.from({ length: 1000 }, (_, i) => hubSeed(BigInt(i + 1)));

  it('gives the starter region exactly one hub', () => {
    for (const s of regionSeeds.slice(0, 100)) {
      for (const danger of [100n, 300n, 800n]) expect(hubCountFor(danger, true, s)).toBe(1);
    }
  });

  it('always gives a region next to the starter a hub', () => {
    for (const s of regionSeeds) expect(hubCountFor(150n, false, s)).toBeGreaterThanOrEqual(1);
  });

  it('gives fewer hubs the deeper the region', () => {
    const share = (danger: bigint) => regionSeeds.filter((s) => hubCountFor(danger, false, s) >= 1).length / 10;
    expect(share(300n)).toBeGreaterThanOrEqual(85);
    expect(share(800n)).toBeLessThan(40);
  });

  it('rarely gives a second hub and never more than the max', () => {
    const twos = regionSeeds.filter((s) => hubCountFor(150n, false, s) === 2).length / 10;
    expect(Math.abs(twos - R.SECOND_HUB_PCT)).toBeLessThanOrEqual(4);
    for (const s of regionSeeds) {
      for (const danger of [100n, 400n, 800n]) {
        expect(hubCountFor(danger, false, s)).toBeLessThanOrEqual(R.HUB_MAX_PER_REGION);
      }
    }
  });

  it('gives the same count for the same region and danger', () => {
    for (const s of regionSeeds.slice(0, 50)) expect(hubCountFor(500n, false, s)).toBe(hubCountFor(500n, false, s));
  });
});

describe('hubHasStation (D-63)', () => {
  const hubSeeds = Array.from({ length: 1000 }, (_, i) => stationSeed(1n, BigInt(i + 1)));

  it('always gives the starter hub a station', () => {
    for (const s of hubSeeds.slice(0, 100)) expect(hubHasStation(800n, true, s)).toBe(true);
  });

  it('always gives a hub next to the starter a station', () => {
    for (const s of hubSeeds) expect(hubHasStation(150n, false, s)).toBe(true);
  });

  it('gives deeper hubs a station less often', () => {
    const share = (danger: bigint) => hubSeeds.filter((s) => hubHasStation(danger, false, s)).length;
    expect(share(800n)).toBeLessThan(share(300n));
  });
});

describe('chooseHubs (D-60, D-61, D-62)', () => {
  const A = { id: 1n, isSafe: true, terrainType: 'plains' };
  const B = { id: 2n, isSafe: true, terrainType: 'woods' };
  const C = { id: 3n, isSafe: false, terrainType: 'town' };
  const D = { id: 4n, isSafe: false, terrainType: 'swamp' };
  const U = { id: 5n, isSafe: true, terrainType: 'uncharted' };
  const base = { arrivalId: 1n, isStarter: false, existingHubIds: [] as bigint[], markedIds: [] as bigint[] };

  it('fills by rule: safe, then town or city, then the arrival point', () => {
    expect(chooseHubs({ ...base, places: [A, B, C, D], count: 1 })).toEqual([1n]);
    expect(chooseHubs({ ...base, places: [{ ...A, isSafe: false }, B, C, D], count: 1 })).toEqual([2n]);
    expect(chooseHubs({ ...base, places: [{ ...A, isSafe: false }, { ...B, isSafe: false }, C, D], count: 1 })).toEqual([3n]);
    const plainA = { ...A, isSafe: false };
    expect(chooseHubs({ ...base, places: [plainA, D], count: 1 })).toEqual([1n]);
    expect(chooseHubs({ ...base, places: [plainA, D], count: 2 })).toEqual([1n]);
  });

  it('takes the lowest id within a tier when the arrival point is not in it', () => {
    const places = [{ ...A, isSafe: false }, { ...D, isSafe: true }, { ...B, id: 9n }];
    expect(chooseHubs({ ...base, places, count: 1 })).toEqual([4n]);
    expect(chooseHubs({ ...base, places, count: 2 })).toEqual([4n, 9n]);
    expect(chooseHubs({ ...base, places: [...places, { ...C, terrainType: 'city' }], count: 3 })).toEqual([4n, 9n, 3n]);
  });

  it('keeps the first marks and trims the rest', () => {
    expect(chooseHubs({ ...base, places: [A, B, C, D], count: 1, markedIds: [4n, 3n] })).toEqual([4n]);
    expect(chooseHubs({ ...base, places: [A, B, C, D], count: 2, markedIds: [4n, 3n] })).toEqual([4n, 3n]);
    expect(chooseHubs({ ...base, places: [A, B, C, D], count: 0, markedIds: [4n, 3n] })).toEqual([]);
  });

  it('ignores marks naming an unknown or uncharted place', () => {
    expect(chooseHubs({ ...base, places: [A, B, C, D, U], count: 1, markedIds: [99n, 5n] })).toEqual([1n]);
    expect(chooseHubs({ ...base, places: [{ ...A, isSafe: false }, U], count: 1 })).toEqual([1n]);
  });

  it('gives the starter region its arrival point whatever the marks (D-61)', () => {
    expect(chooseHubs({ ...base, places: [A, B, C, D], count: 2, isStarter: true, markedIds: [4n, 3n] })).toEqual([1n]);
  });

  it('keeps an existing hub on a retried fill', () => {
    expect(chooseHubs({ ...base, places: [A, B, C, D], count: 1, existingHubIds: [2n], markedIds: [4n] })).toEqual([2n]);
    expect(chooseHubs({ ...base, places: [A, B, C, D], count: 2, existingHubIds: [2n], markedIds: [4n] })).toEqual([2n, 4n]);
  });

  it('never names a place twice', () => {
    const hubs = chooseHubs({ ...base, places: [A, B, C, D], count: 2, existingHubIds: [1n], markedIds: [1n, 1n] });
    expect(hubs).toEqual([1n, 2n]);
  });
});

// ============================================================================
// Plan 28: families per region and per place (D-66, D-67), feuds (D-70), histories (D-68)
// ============================================================================

describe('family and feud constants (D-66, D-67, D-68, D-70)', () => {
  it('names every new number', () => {
    expect(R.FAMILIES_PER_PLACE_X10).toBe(15);
    expect(R.FAMILY_COUNT_MIN).toBe(3);
    expect(R.FAMILY_COUNT_MAX).toBe(15);
    expect(R.FILL_PLANNED_PLACES).toBe(5);
    expect(R.PLACE_FAMILIES_MIN).toBe(3);
    expect(R.PLACE_FAMILIES_MAX).toBe(5);
    expect(R.FEUD_FAMILIES_MIN).toBe(2);
    expect(R.FEUD_FAMILIES_MAX).toBe(3);
    expect(R.NPC_FAMILY_HISTORIES_MAX).toBe(4);
    expect(R.FEUD_CHANCE_PCT).toBe(35);
    expect(Object.isFrozen(DENSITY_RULES)).toBe(true);
  });

  it('adds the family roll indexes without a duplicate', () => {
    expect(POOL_ROLL.PLACE_FAMILY_COUNT).toBe(83n);
    expect(POOL_ROLL.PLACE_FAMILY_ORDER).toBe(84n);
    expect(POOL_ROLL.FEUD_COUNT).toBe(85n);
    expect(POOL_ROLL.FEUD_PICK).toBe(86n);
    expect(POOL_ROLL.RULE_FAMILY_ORDER).toBe(87n);
    expect(POOL_ROLL.FEUD_CHANCE).toBe(88n);
    const values = Object.values(POOL_ROLL);
    expect(new Set(values).size).toBe(values.length);
  });
});

describe('familyCountFor, askedFamilyCount, keptFamilyCount (D-66)', () => {
  it('gives about 1.5 families per place, at least 3 and at most 15', () => {
    const cases: [number, number][] = [[0, 3], [2, 3], [3, 4], [4, 6], [5, 7], [8, 12], [10, 15], [12, 15]];
    for (const [places, families] of cases) expect(familyCountFor(places)).toBe(families);
  });

  it('floors a fractional count and clamps a negative one', () => {
    expect(familyCountFor(3.9)).toBe(4);
    expect(familyCountFor(-4)).toBe(3);
    expect(familyCountFor(Number.NaN)).toBe(3);
  });

  it('asks for the planned region size and never keeps more than it asked', () => {
    expect(askedFamilyCount()).toBe(7);
    expect(keptFamilyCount(3)).toBe(4);
    expect(keptFamilyCount(5)).toBe(7);
    expect(keptFamilyCount(9)).toBe(7);
  });
});

describe('familySeed and placeFamiliesSeed', () => {
  it('are stable and distinct from the hub and station seeds', () => {
    expect(familySeed(3n)).toBe(familySeed(3n));
    expect(familySeed(3n)).toBe(poolSeed(3n, FAMILY_SEED_TAG));
    expect(familySeed(3n)).not.toBe(familySeed(4n));
    expect(familySeed(3n)).not.toBe(hubSeed(3n));
    expect(placeFamiliesSeed(3n, 9n)).toBe(placeFamiliesSeed(3n, 9n));
    expect(placeFamiliesSeed(3n, 9n)).not.toBe(placeFamiliesSeed(3n, 10n));
    expect(placeFamiliesSeed(3n, 9n)).not.toBe(placeFamiliesSeed(4n, 9n));
    expect(placeFamiliesSeed(3n, 9n)).not.toBe(stationSeed(3n, 9n));
  });
});

describe('feudHappens and feudCountFor (D-70, D-71)', () => {
  const regionSeeds = Array.from({ length: 1000 }, (_, i) => familySeed(BigInt(i + 1)));
  const hits = regionSeeds.filter((s) => feudHappens(s));
  const misses = regionSeeds.filter((s) => !feudHappens(s));

  it('seeds a feud in about FEUD_CHANCE_PCT of regions, the same for the same seed (D-71)', () => {
    const share = (hits.length * 100) / regionSeeds.length;
    expect(share).toBeGreaterThan(R.FEUD_CHANCE_PCT - 5);
    expect(share).toBeLessThan(R.FEUD_CHANCE_PCT + 5);
    expect(regionSeeds.filter((s) => feudHappens(s))).toEqual(hits);
  });

  it('gives no feud when the chance misses', () => {
    expect(misses.length).toBeGreaterThan(0);
    for (const s of misses.slice(0, 50)) {
      expect(feudCountFor(7, s)).toBe(0);
      expect(feudCountFor(15, s)).toBe(0);
    }
  });

  it('gives no feud below two families, and two at most for two', () => {
    for (const s of [...hits.slice(0, 20), ...misses.slice(0, 20)]) {
      expect(feudCountFor(0, s)).toBe(0);
      expect(feudCountFor(1, s)).toBe(0);
    }
    for (const s of hits.slice(0, 20)) expect(feudCountFor(2, s)).toBe(2);
  });

  it('gives 2 or 3 feuding families when the chance hits, both over many regions, the same for the same seed', () => {
    const counts = hits.map((s) => feudCountFor(7, s));
    for (const n of counts) expect([2, 3]).toContain(n);
    expect(counts).toContain(2);
    expect(counts).toContain(3);
    expect(hits.map((s) => feudCountFor(7, s))).toEqual(counts);
    for (const s of hits.slice(0, 20)) expect([2, 3]).toContain(feudCountFor(3, s));
  });
});

describe('pickFeud (D-70)', () => {
  const keys = ['a', 'b', 'c', 'd', 'e', 'f'];
  const seed = familySeed(5n);

  it('keeps the marks first and fills by a seeded pick', () => {
    const feud = pickFeud({ keys, markedKeys: ['b', 'd'], count: 3, seed });
    expect(feud).toHaveLength(3);
    expect(feud.slice(0, 2)).toEqual(['b', 'd']);
    expect(keys).toContain(feud[2]);
    expect(['b', 'd']).not.toContain(feud[2]);
  });

  it('keeps only the first marks up to the count', () => {
    expect(pickFeud({ keys, markedKeys: ['b', 'c', 'd', 'e'], count: 2, seed })).toEqual(['b', 'c']);
  });

  it('ignores an unknown or repeated mark', () => {
    const feud = pickFeud({ keys, markedKeys: ['z', 'b', 'b'], count: 2, seed });
    expect(feud[0]).toBe('b');
    expect(feud).toHaveLength(2);
    expect(new Set(feud).size).toBe(2);
  });

  it('clamps the count to the keys and gives [] below two', () => {
    expect(pickFeud({ keys: ['a', 'b'], markedKeys: [], count: 5, seed }).sort()).toEqual(['a', 'b']);
    expect(pickFeud({ keys: ['a'], markedKeys: ['a'], count: 2, seed })).toEqual([]);
    expect(pickFeud({ keys, markedKeys: ['a'], count: 1, seed })).toEqual([]);
    expect(pickFeud({ keys, markedKeys: [], count: 0, seed })).toEqual([]);
  });

  it('gives the same output for the same input', () => {
    const one = pickFeud({ keys, markedKeys: [], count: 3, seed });
    expect(one).toHaveLength(3);
    expect(new Set(one).size).toBe(3);
    expect(pickFeud({ keys, markedKeys: [], count: 3, seed })).toEqual(one);
  });
});

describe('pickPlaceFamilies (D-67)', () => {
  const cand = (key: string, over: Partial<{ aiFit: boolean; terrainFit: boolean; placesSoFar: number }> = {}) => ({
    key, aiFit: false, terrainFit: false, placesSoFar: 0, ...over,
  });
  const many = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'].map((k) => cand(k));
  const placeSeeds = Array.from({ length: 60 }, (_, i) => placeFamiliesSeed(1n, BigInt(i + 1)));

  it('picks 3 to 5 families, every size over many places', () => {
    const sizes = placeSeeds.map((s) => pickPlaceFamilies(many, s).length);
    for (const n of sizes) {
      expect(n).toBeGreaterThanOrEqual(R.PLACE_FAMILIES_MIN);
      expect(n).toBeLessThanOrEqual(R.PLACE_FAMILIES_MAX);
    }
    expect(new Set(sizes)).toEqual(new Set([3, 4, 5]));
  });

  it('gives every candidate when fewer exist', () => {
    expect(pickPlaceFamilies([cand('x'), cand('y')], placeSeeds[0]!).sort()).toEqual(['x', 'y']);
    expect(pickPlaceFamilies([], placeSeeds[0]!)).toEqual([]);
  });

  it('puts AI fit first, then terrain fit, then the rest', () => {
    const list = [
      cand('a'), cand('b'), cand('c'), cand('d'),
      cand('t1', { terrainFit: true }), cand('t2', { terrainFit: true }),
      cand('ai', { aiFit: true, placesSoFar: 4 }),
    ];
    for (const s of placeSeeds) {
      const picked = pickPlaceFamilies(list, s);
      expect(picked[0]).toBe('ai');
      expect(picked.slice(1, 3).sort()).toEqual(['t1', 't2']);
    }
  });

  it('prefers families placed fewer times within a tier', () => {
    const list = ['a', 'b', 'c', 'd', 'e', 'f'].map((k, i) => cand(k, { placesSoFar: i < 3 ? 0 : 2 }));
    for (const s of placeSeeds) {
      const picked = pickPlaceFamilies(list, s);
      expect(picked.slice(0, 3).sort()).toEqual(['a', 'b', 'c']);
    }
  });

  it('does not depend on the input order, and is seeded', () => {
    const reversed = [...many].reverse();
    const results = placeSeeds.map((s) => pickPlaceFamilies(many, s));
    placeSeeds.forEach((s, i) => expect(pickPlaceFamilies(reversed, s)).toEqual(results[i]));
    expect(new Set(results.map((r) => r.join(','))).size).toBeGreaterThan(1);
  });
});

describe('assignRegionFamilies (D-67)', () => {
  const places = [
    { id: 12n, name: 'Ashen Ford', terrainType: 'plains' },
    { id: 10n, name: 'Hollow Pines', terrainType: 'woods' },
    { id: 11n, name: 'Sunk Mire', terrainType: 'swamp' },
  ];
  const fam = (key: string, aiFitNames: string[] = [], fitTerrains: string[] = []) => ({ key, aiFitNames, fitTerrains });
  const families = [
    fam('wolves', ['Ashen Ford'], ['plains']),
    fam('boars', [], ['woods']),
    fam('crawlers', ['Sunk Mire'], ['swamp']),
    fam('wights', [], ['Swamp']),
    fam('hounds', [], ['plains']),
    fam('wisps', [], ['mountains']),
    fam('golems', [], ['dungeon']),
  ];

  it('gives each host place 3 to 5 families and honours the AI fit', () => {
    for (let r = 1n; r <= 30n; r += 1n) {
      const map = assignRegionFamilies({ regionId: r, places, families });
      expect([...map.keys()].sort()).toEqual([10n, 11n, 12n]);
      for (const keys of map.values()) {
        expect(keys.length).toBeGreaterThanOrEqual(3);
        expect(keys.length).toBeLessThanOrEqual(5);
        expect(new Set(keys).size).toBe(keys.length);
      }
      expect(map.get(12n)).toContain('wolves');
      expect(map.get(11n)).toContain('crawlers');
    }
  });

  it('places every family when there is room, else every place is full', () => {
    for (let r = 1n; r <= 30n; r += 1n) {
      const map = assignRegionFamilies({ regionId: r, places, families });
      const placed = new Set([...map.values()].flat());
      const full = [...map.values()].every((keys) => keys.length === R.PLACE_FAMILIES_MAX);
      for (const f of families) expect(placed.has(f.key) || full).toBe(true);
    }
    const noFit = families.map((f) => fam(f.key));
    for (let r = 1n; r <= 30n; r += 1n) {
      const placed = new Set([...assignRegionFamilies({ regionId: r, places, families: noFit }).values()].flat());
      expect(placed.size).toBe(noFit.length);
    }
  });

  it('fills a lone place up to the most families a place holds', () => {
    for (let r = 1n; r <= 10n; r += 1n) {
      const map = assignRegionFamilies({ regionId: r, places: [places[0]!], families });
      expect(map.get(12n)).toHaveLength(R.PLACE_FAMILIES_MAX);
    }
  });

  it('gives the same map for the same input, and both families everywhere when there are two', () => {
    const one = assignRegionFamilies({ regionId: 4n, places, families });
    expect(assignRegionFamilies({ regionId: 4n, places: [...places].reverse(), families })).toEqual(one);
    const two = assignRegionFamilies({ regionId: 4n, places, families: families.slice(0, 2) });
    for (const keys of two.values()) expect([...keys].sort()).toEqual(['boars', 'wolves']);
    expect(assignRegionFamilies({ regionId: 4n, places: [], families })).toEqual(new Map());
  });
});
